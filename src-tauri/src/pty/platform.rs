use std::path::PathBuf;

/// Detects the default shell for the current platform.
///
/// - Unix (macOS / Linux): reads `$SHELL`, falls back to `/bin/sh`
/// - Windows: reads `%COMSPEC%`, falls back to `C:\Windows\System32\cmd.exe`
pub fn detect_default_shell() -> PathBuf {
    #[cfg(unix)]
    {
        std::env::var("SHELL")
            .map(PathBuf::from)
            .unwrap_or_else(|_| PathBuf::from("/bin/sh"))
    }

    #[cfg(target_os = "windows")]
    {
        std::env::var("COMSPEC")
            .map(PathBuf::from)
            .unwrap_or_else(|_| PathBuf::from(r"C:\Windows\System32\cmd.exe"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_shell_exists() {
        let shell = detect_default_shell();
        assert!(
            shell.exists(),
            "Default shell not found at: {}",
            shell.display()
        );
    }

    #[test]
    fn default_shell_is_absolute() {
        let shell = detect_default_shell();
        assert!(shell.is_absolute(), "Shell path should be absolute");
    }
}
