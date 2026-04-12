use tauri::{AppHandle, State};

use crate::error::AppError;
use crate::pty::platform::detect_default_shell;
use crate::pty::session::{SessionConfig, SessionId, SessionInfo};
use crate::state::AppState;

/// Returns the platform-default shell path (e.g. `/bin/zsh` on macOS).
#[tauri::command]
#[specta::specta]
pub fn pty_default_shell() -> String {
    detect_default_shell().to_string_lossy().into_owned()
}

/// Creates a new PTY session and returns its unique ID.
#[tauri::command]
#[specta::specta]
pub fn pty_create(
    state: State<'_, AppState>,
    app: AppHandle,
    config: SessionConfig,
) -> Result<SessionId, AppError> {
    state.pty_manager.create_session(config, app)
}

/// Sends raw bytes (user keystrokes) to the PTY.
#[tauri::command]
#[specta::specta]
pub fn pty_write(
    state: State<'_, AppState>,
    session_id: SessionId,
    data: Vec<u8>,
) -> Result<(), AppError> {
    state.pty_manager.write_to_session(&session_id, &data)
}

/// Notifies the PTY of a terminal window resize.
#[tauri::command]
#[specta::specta]
pub fn pty_resize(
    state: State<'_, AppState>,
    session_id: SessionId,
    rows: u16,
    cols: u16,
) -> Result<(), AppError> {
    state.pty_manager.resize_session(&session_id, rows, cols)
}

/// Closes the PTY session and kills the shell process.
#[tauri::command]
#[specta::specta]
pub fn pty_close(
    state: State<'_, AppState>,
    session_id: SessionId,
) -> Result<(), AppError> {
    state.pty_manager.close_session(&session_id)
}

/// Returns metadata for all currently active sessions.
#[tauri::command]
#[specta::specta]
pub fn pty_list_active(state: State<'_, AppState>) -> Result<Vec<SessionInfo>, AppError> {
    Ok(state.pty_manager.list_active())
}
