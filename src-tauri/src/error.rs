use serde::Serialize;
use specta::Type;

/// Unified application error type.
/// All variants implement Serialize so they can be returned from Tauri commands.
#[derive(Debug, thiserror::Error, Serialize, Type)]
#[serde(tag = "kind", content = "message")]
pub enum AppError {
    #[error("PTY error: {0}")]
    Pty(String),

    #[error("Session not found: {0}")]
    SessionNotFound(String),

    #[error("IO error: {0}")]
    Io(String),

    #[error("Configuration error: {0}")]
    Config(String),

    #[error("Database error: {0}")]
    Database(String),

    #[error("AI provider error: {0}")]
    AiProvider(String),
}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        AppError::Io(e.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn error_display_messages() {
        assert_eq!(
            AppError::Pty("openpty failed".into()).to_string(),
            "PTY error: openpty failed"
        );
        assert_eq!(
            AppError::SessionNotFound("abc-123".into()).to_string(),
            "Session not found: abc-123"
        );
        assert_eq!(
            AppError::Config("missing key".into()).to_string(),
            "Configuration error: missing key"
        );
    }

    #[test]
    fn io_error_converts() {
        let io_err = std::io::Error::new(std::io::ErrorKind::NotFound, "file missing");
        let app_err: AppError = io_err.into();
        assert!(matches!(app_err, AppError::Io(_)));
        assert!(app_err.to_string().contains("file missing"));
    }

    #[test]
    fn error_serializes() {
        let err = AppError::SessionNotFound("sess-1".into());
        let json = serde_json::to_string(&err).unwrap();
        assert!(json.contains("SessionNotFound"));
        assert!(json.contains("sess-1"));
    }
}
