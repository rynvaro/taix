use std::collections::HashMap;
use std::io::Write;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use chrono::{DateTime, Utc};
use portable_pty::{native_pty_system, CommandBuilder, PtyPair, PtySize};
use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::{AppHandle, Emitter};
use uuid::Uuid;
use uuid::Uuid;

use crate::error::AppError;

/// Unique identifier for a PTY session.
pub type SessionId = String;

/// Configuration for a local shell session.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct LocalShellConfig {
    /// Path to the shell executable.
    pub shell: String,
    /// Arguments passed to the shell (e.g. `["--login"]`).
    pub args: Vec<String>,
    /// Extra environment variables.
    pub env: HashMap<String, String>,
    /// Initial working directory. `None` uses the user's home directory.
    pub cwd: Option<String>,
}

/// SSH authentication method.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum SshAuth {
    /// Password — stored optionally; auto-supplied via SSH_ASKPASS when set.
    Password { password: Option<String> },
    /// Private key file at the given path.
    PrivateKey { path: String },
    /// Delegate to the system SSH agent via SSH_AUTH_SOCK.
    SshAgent,
}

/// Configuration for an SSH session.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SshConfig {
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth: SshAuth,
    pub cwd: Option<String>,
}

/// Session configuration variants (local shell for now; SSH to follow in Phase 2).
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum SessionConfig {
    Local(LocalShellConfig),
    Ssh(SshConfig),
}

/// Metadata about an active PTY session returned to the frontend.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SessionInfo {
    pub id: SessionId,
    pub title: String,
    pub started_at: String, // ISO 8601
}

/// A live PTY session wrapping a shell process.
pub struct PtySession {
    pub id: SessionId,
    pub config: SessionConfig,
    pub started_at: DateTime<Utc>,
    /// Shared PTY pair — the master is kept alive here.
    _pty_pair: PtyPair,
    /// Write end of the PTY master (sends data to the shell).
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
    /// Handle to the reader thread so it is cleaned up when the session drops.
    _reader_thread: std::thread::JoinHandle<()>,
    /// Handle to the exit-watcher thread.
    _exit_thread: std::thread::JoinHandle<()>,
    /// Temp askpass script path to clean up when session ends (password auth).
    _askpass_cleanup: Option<PathBuf>,
}

impl PtySession {
    /// Spawns a new PTY session according to `config` and starts background
    /// tasks to pipe output to the frontend via Tauri events.
    pub fn spawn(
        config: SessionConfig,
        initial_size: PtySize,
        app_handle: AppHandle,
    ) -> Result<Self, AppError> {
        let id: SessionId = Uuid::new_v4().to_string();

        // Will be populated when SSH password auth sets up an askpass script.
        let mut askpass_cleanup: Option<PathBuf> = None;

        let pty_system = native_pty_system();
        let pty_pair = pty_system
            .openpty(initial_size)
            .map_err(|e| AppError::Pty(e.to_string()))?;

        let cmd = match &config {
            SessionConfig::Local(cfg) => {
                let mut builder = CommandBuilder::new(&cfg.shell);
                for arg in &cfg.args {
                    builder.arg(arg);
                }
                for (k, v) in &cfg.env {
                    builder.env(k, v);
                }
                if let Some(cwd) = &cfg.cwd {
                    builder.cwd(PathBuf::from(cwd));
                }
                builder
            }
            SessionConfig::Ssh(cfg) => {
                let mut builder = CommandBuilder::new("ssh");
                // Force TTY allocation on the remote side so the interactive
                // shell works correctly (especially when passing a cwd command).
                builder.arg("-t");
                builder.arg("-t"); // double -tt overrides "no tty" heuristic
                builder.arg("-p");
                builder.arg(cfg.port.to_string());
                // Accept new host keys without prompting (prevents first-connect hang).
                builder.arg("-o");
                builder.arg("StrictHostKeyChecking=accept-new");
                match &cfg.auth {
                    SshAuth::PrivateKey { path } => {
                        builder.arg("-i");
                        builder.arg(path);
                        // Disable password/keyboard fallback so the user isn't
                        // prompted for a password when the key is rejected.
                        builder.arg("-o");
                        builder.arg("PreferredAuthentications=publickey");
                        builder.arg("-o");
                        builder.arg("PasswordAuthentication=no");
                    }
                    SshAuth::SshAgent => {
                        // SSH_AUTH_SOCK is inherited from the parent process environment
                    }
                    SshAuth::Password { password } => {
                        if let Some(pw) = password.as_deref().filter(|p| !p.is_empty()) {
                            // Write a small temp script that echoes the password to stdout.
                            // SSH will invoke it via SSH_ASKPASS instead of prompting the user.
                            if let Ok(script_path) = create_askpass_script(pw) {
                                builder.env("SSH_ASKPASS", script_path.to_str().unwrap_or(""));
                                builder.env("SSH_ASKPASS_REQUIRE", "force");
                                // No DISPLAY needed: SSH_ASKPASS_REQUIRE=force bypasses that check.
                                // Store path for cleanup after session exits.
                                askpass_cleanup = Some(script_path);
                            }
                        }
                        // If no password stored (or script creation failed), user types interactively.
                    }
                }
                builder.arg(format!("{}@{}", cfg.username, cfg.host));
                if let Some(cwd) = &cfg.cwd {
                    // Start the remote shell in the specified directory.
                    builder.arg(format!("cd {:?} && exec $SHELL -l", cwd));
                }
                builder
            }
        };

        // Spawn the shell process on the PTY slave.
        let mut child = pty_pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| AppError::Pty(e.to_string()))?;

        // Get reader from master — must be done before taking writer.
        let mut reader = pty_pair
            .master
            .try_clone_reader()
            .map_err(|e| AppError::Pty(e.to_string()))?;

        let writer = Arc::new(Mutex::new(
            pty_pair
                .master
                .take_writer()
                .map_err(|e| AppError::Pty(e.to_string()))?,
        ));

        // Background thread: continuously read PTY output and emit to frontend.
        let session_id_reader = id.clone();
        let app_handle_reader = app_handle.clone();
        let reader_thread = std::thread::spawn(move || {
            let mut buf = [0u8; 4096];
            let mut osc_parser = OscTitleParser::new();
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break, // EOF — shell exited
                    Ok(n) => {
                        let data = buf[..n].to_vec();

                        // G1: scan for OSC title sequences (ESC ] 0/2 ; title BEL)
                        if let Some(title) = osc_parser.feed(&data) {
                            let title_event = format!("pty://title/{}", session_id_reader);
                            let _ = app_handle_reader.emit(&title_event, title);
                        }

                        let output_event = format!("pty://output/{}", session_id_reader);
                        let _ = app_handle_reader.emit(&output_event, data);
                    }
                    Err(_) => break,
                }
            }
        });

        // Background thread: wait for the child process to exit, then notify frontend.
        let session_id_exit = id.clone();
        let app_handle_exit = app_handle.clone();
        let exit_thread = std::thread::spawn(move || {
            let _ = child.wait();
            let event = format!("pty://exit/{}", session_id_exit);
            let _ = app_handle_exit.emit(&event, ());
        });

        Ok(Self {
            id,
            config,
            started_at: Utc::now(),
            _pty_pair: pty_pair,
            writer,
            _reader_thread: reader_thread,
            _exit_thread: exit_thread,
            _askpass_cleanup: askpass_cleanup,
        })
    }

    /// Writes raw bytes to the PTY (forwards user input to the shell).
    pub fn write(&self, data: &[u8]) -> Result<(), AppError> {
        let mut w = self
            .writer
            .lock()
            .map_err(|_| AppError::Pty("writer lock poisoned".into()))?;
        w.write_all(data).map_err(AppError::from)
    }

    /// Resizes the PTY window. Sends SIGWINCH to the shell process group.
    pub fn resize(&self, rows: u16, cols: u16) -> Result<(), AppError> {
        self._pty_pair
            .master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| AppError::Pty(e.to_string()))
    }

    /// Returns lightweight metadata for the frontend.
    pub fn info(&self) -> SessionInfo {
        let title = match &self.config {
            SessionConfig::Local(cfg) => PathBuf::from(&cfg.shell)
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("shell")
                .to_string(),
            SessionConfig::Ssh(cfg) => {
                format!("{}@{}", cfg.username, cfg.host)
            }
        };

        SessionInfo {
            id: self.id.clone(),
            title,
            started_at: self.started_at.to_rfc3339(),
        }
    }
}

// PtySession fields are not Send by default; we move them exclusively into
// the manager's DashMap under a Mutex so wrapping in Arc<Mutex> is safe.
// The raw `PtyPair` contains platform-specific handles that are Send.
unsafe impl Send for PtySession {}
unsafe impl Sync for PtySession {}

use std::io::Read;

// ── Password askpass helper ───────────────────────────────────────────────────
//
// Creates a small temporary script that echoes the SSH password to stdout.
// OpenSSH invokes SSH_ASKPASS to obtain the password non-interactively when
// SSH_ASKPASS_REQUIRE=force is set.

fn create_askpass_script(password: &str) -> Result<PathBuf, AppError> {
    let filename = format!("taix-askpass-{}", Uuid::new_v4());
    let path = std::env::temp_dir().join(filename);

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut file = std::fs::File::create(&path)
            .map_err(|e| AppError::Pty(format!("askpass: {e}")))?;
        // Use printf to avoid newline issues with echo on some shells.
        writeln!(file, "#!/bin/sh").ok();
        // Escape single quotes in the password: replace ' with '\''
        let escaped = password.replace('\'', "'\\''");
        writeln!(file, "printf '%s' '{}'", escaped).ok();
        drop(file);
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o700))
            .map_err(|e| AppError::Pty(format!("askpass chmod: {e}")))?;
    }

    #[cfg(windows)]
    {
        let mut file = std::fs::File::create(&path)
            .map_err(|e| AppError::Pty(format!("askpass: {e}")))?;
        // Windows batch script — rename to .bat
        // OpenSSH on Windows can invoke .bat via cmd.exe.
        let bat_path = path.with_extension("bat");
        // Escape special chars for batch: % → %%
        let escaped = password.replace('%', "%%");
        writeln!(file, "@echo off\r\necho {}", escaped).ok();
        drop(file);
        std::fs::rename(&path, &bat_path)
            .map_err(|e| AppError::Pty(format!("askpass rename: {e}")))?;
        return Ok(bat_path);
    }

    #[allow(unreachable_code)]
    Ok(path)
}

// ── G1: OSC title sequence parser ────────────────────────────────────────────
//
// Detects ESC ] 0 ; {title} BEL  or  ESC ] 2 ; {title} BEL
// Works correctly across multiple read() calls.

#[derive(Default)]
enum OscState {
    #[default]
    Ground,
    /// Received ESC (0x1B)
    Esc,
    /// Received ESC ]
    OscStart,
    /// Collecting the numeric parameter (should be 0 or 2)
    OscParam { param: u8 },
    /// Received ";" and the param was 0 or 2 — collecting the title bytes
    CollectingTitle { title: Vec<u8> },
}

struct OscTitleParser {
    state: OscState,
}

impl OscTitleParser {
    fn new() -> Self {
        Self {
            state: OscState::Ground,
        }
    }

    /// Feed a chunk of bytes; returns the title string if an OSC 0/2 sequence
    /// was completed within this chunk. Only the *last* completed title
    /// in the chunk is returned (multiple titles per chunk are rare).
    fn feed(&mut self, data: &[u8]) -> Option<String> {
        let mut result: Option<String> = None;
        for &b in data {
            match &mut self.state {
                OscState::Ground => {
                    if b == 0x1B {
                        self.state = OscState::Esc;
                    }
                }
                OscState::Esc => {
                    if b == b']' {
                        self.state = OscState::OscStart;
                    } else {
                        self.state = OscState::Ground;
                    }
                }
                OscState::OscStart => {
                    if b.is_ascii_digit() {
                        self.state = OscState::OscParam { param: b - b'0' };
                    } else {
                        self.state = OscState::Ground;
                    }
                }
                OscState::OscParam { param } => {
                    if b == b';' {
                        if *param == 0 || *param == 2 {
                            self.state = OscState::CollectingTitle { title: Vec::new() };
                        } else {
                            self.state = OscState::Ground;
                        }
                    } else if b.is_ascii_digit() {
                        // Multi-digit param (e.g. "12;") — reset, not 0 or 2
                        *param = b - b'0'; // keep last digit (simplification)
                    } else {
                        self.state = OscState::Ground;
                    }
                }
                OscState::CollectingTitle { title } => {
                    if b == 0x07 {
                        // BEL — sequence complete
                        if let Ok(s) = std::str::from_utf8(title) {
                            result = Some(s.to_string());
                        }
                        self.state = OscState::Ground;
                    } else if b == 0x1B {
                        // Start of new escape — abort this sequence
                        self.state = OscState::Esc;
                    } else {
                        title.push(b);
                        // Guard against unbounded growth
                        if title.len() > 512 {
                            self.state = OscState::Ground;
                        }
                    }
                }
            }
        }
        result
    }
}

// ── C5: PTY resize integration test ──────────────────────────────────────────
#[cfg(all(test, unix))]
mod tests {
    use portable_pty::{native_pty_system, CommandBuilder, PtySize};
    use std::io::Read;

    /// Spawns a shell with `stty size` and verifies that the PTY dimensions we
    /// set before spawning are reported back correctly.
    #[test]
    fn pty_resize_reflects_stty_size() {
        let pty_system = native_pty_system();
        let pair = pty_system
            .openpty(PtySize {
                rows: 30,
                cols: 100,
                pixel_width: 0,
                pixel_height: 0,
            })
            .expect("openpty");

        let shell = crate::pty::platform::detect_default_shell();
        let mut cmd = CommandBuilder::new(&shell);
        cmd.args(["-c", "stty size"]);

        let mut child = pair.slave.spawn_command(cmd).expect("spawn shell");
        // Drop the slave so the master gets EOF when the child exits.
        drop(pair.slave);

        let mut reader = pair.master.try_clone_reader().expect("clone reader");
        let mut buf = Vec::new();
        // read_to_end returns EIO on macOS when slave closes; ignore the error.
        let _ = reader.read_to_end(&mut buf);

        let output = String::from_utf8_lossy(&buf);
        assert!(
            output.contains("30 100"),
            "Expected '30 100' in stty output, got: {output:?}"
        );
        let _ = child.wait();
    }
}
