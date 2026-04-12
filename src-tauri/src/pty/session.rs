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

/// Session configuration variants (local shell for now; SSH to follow in Phase 2).
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum SessionConfig {
    Local(LocalShellConfig),
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
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break, // EOF — shell exited
                    Ok(n) => {
                        let data = buf[..n].to_vec();
                        let event = format!("pty://output/{}", session_id_reader);
                        let _ = app_handle_reader.emit(&event, data);
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
            SessionConfig::Local(cfg) => {
                PathBuf::from(&cfg.shell)
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("shell")
                    .to_string()
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
