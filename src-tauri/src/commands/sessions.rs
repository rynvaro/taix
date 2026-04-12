use tauri::State;

use crate::error::AppError;
use crate::state::AppState;
use crate::storage::group_repo::{self, SessionGroup};
use crate::storage::session_repo::{self, SavedSession};

// ── Session commands ──────────────────────────────────────────────────────────

#[tauri::command]
#[specta::specta]
pub fn sessions_list(state: State<AppState>) -> Result<Vec<SavedSession>, AppError> {
    session_repo::list_sessions(&state.db)
}

#[tauri::command]
#[specta::specta]
pub fn sessions_get(
    state: State<AppState>,
    id: String,
) -> Result<Option<SavedSession>, AppError> {
    session_repo::get_session(&state.db, &id)
}

#[tauri::command]
#[specta::specta]
pub fn sessions_save(
    state: State<AppState>,
    session: SavedSession,
) -> Result<(), AppError> {
    session_repo::save_session(&state.db, &session)
}

#[tauri::command]
#[specta::specta]
pub fn sessions_delete(state: State<AppState>, id: String) -> Result<(), AppError> {
    session_repo::delete_session(&state.db, &id)
}

#[tauri::command]
#[specta::specta]
pub fn sessions_reorder(state: State<AppState>, ids: Vec<String>) -> Result<(), AppError> {
    session_repo::reorder_sessions(&state.db, &ids)
}

// ── Group commands ────────────────────────────────────────────────────────────

#[tauri::command]
#[specta::specta]
pub fn groups_list(state: State<AppState>) -> Result<Vec<SessionGroup>, AppError> {
    group_repo::list_groups(&state.db)
}

#[tauri::command]
#[specta::specta]
pub fn groups_create(
    state: State<AppState>,
    id: String,
    name: String,
    color: Option<String>,
) -> Result<(), AppError> {
    group_repo::create_group(&state.db, &id, &name, color.as_deref())
}

#[tauri::command]
#[specta::specta]
pub fn groups_delete(state: State<AppState>, id: String) -> Result<(), AppError> {
    group_repo::delete_group(&state.db, &id)
}
