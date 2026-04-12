use tauri::State;

use crate::config::schema::AppConfig;
use crate::error::AppError;
use crate::state::AppState;

/// Returns the current application configuration.
#[tauri::command]
#[specta::specta]
pub fn config_get(state: State<'_, AppState>) -> Result<AppConfig, AppError> {
    let config = state
        .config
        .read()
        .map_err(|_| AppError::Config("config lock poisoned".into()))?;
    Ok(config.clone())
}

/// Persists a new configuration (replaces the current one).
#[tauri::command]
#[specta::specta]
pub fn config_set(state: State<'_, AppState>, config: AppConfig) -> Result<(), AppError> {
    crate::config::ConfigManager::save(&config)?;
    let mut current = state
        .config
        .write()
        .map_err(|_| AppError::Config("config lock poisoned".into()))?;
    *current = config;
    Ok(())
}
