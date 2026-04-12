use std::sync::{Arc, RwLock};

use crate::config::schema::AppConfig;
use crate::pty::manager::PtyManager;

/// Global application state injected into all Tauri command handlers.
/// Fields are wrapped in Arc for cheap cloning across async tasks.
pub struct AppState {
    pub config: Arc<RwLock<AppConfig>>,
    pub pty_manager: Arc<PtyManager>,
}

impl AppState {
    pub fn new(config: AppConfig) -> Self {
        Self {
            config: Arc::new(RwLock::new(config)),
            pty_manager: Arc::new(PtyManager::new()),
        }
    }
}
