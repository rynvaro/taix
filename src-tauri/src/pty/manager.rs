use std::sync::{Arc, Mutex};

use dashmap::DashMap;
use portable_pty::PtySize;
use tauri::AppHandle;

use crate::error::AppError;

use super::session::{PtySession, SessionConfig, SessionId, SessionInfo};

/// Manages all active PTY sessions.
///
/// Uses `DashMap` (fine-grained concurrent HashMap) so that multiple async
/// tasks can look up different sessions simultaneously without a global lock.
pub struct PtyManager {
    sessions: DashMap<SessionId, Arc<Mutex<PtySession>>>,
}

impl PtyManager {
    pub fn new() -> Self {
        Self {
            sessions: DashMap::new(),
        }
    }

    /// Creates a new PTY session and stores it.
    /// Returns the new session's ID.
    pub fn create_session(
        &self,
        config: SessionConfig,
        app_handle: AppHandle,
    ) -> Result<SessionId, AppError> {
        let initial_size = PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        };

        let session = PtySession::spawn(config, initial_size, app_handle)?;
        let id = session.id.clone();
        self.sessions.insert(id.clone(), Arc::new(Mutex::new(session)));
        Ok(id)
    }

    /// Writes data to the session's PTY master (forwards to the shell).
    pub fn write_to_session(&self, id: &SessionId, data: &[u8]) -> Result<(), AppError> {
        let session = self
            .sessions
            .get(id)
            .ok_or_else(|| AppError::SessionNotFound(id.clone()))?;

        let locked = session
            .lock()
            .map_err(|_| AppError::Pty("session lock poisoned".into()))?;
        locked.write(data)
    }

    /// Resizes the PTY for `id` to the given dimensions.
    pub fn resize_session(&self, id: &SessionId, rows: u16, cols: u16) -> Result<(), AppError> {
        let session = self
            .sessions
            .get(id)
            .ok_or_else(|| AppError::SessionNotFound(id.clone()))?;

        let locked = session
            .lock()
            .map_err(|_| AppError::Pty("session lock poisoned".into()))?;
        locked.resize(rows, cols)
    }

    /// Removes a session from the manager.
    /// The `PtySession` is dropped here, which closes the PTY master and
    /// sends EOF/SIGHUP to the shell process.
    pub fn close_session(&self, id: &SessionId) -> Result<(), AppError> {
        self.sessions
            .remove(id)
            .ok_or_else(|| AppError::SessionNotFound(id.clone()))?;
        Ok(())
    }

    /// Returns lightweight metadata for all active sessions.
    pub fn list_active(&self) -> Vec<SessionInfo> {
        self.sessions
            .iter()
            .filter_map(|entry| {
                entry
                    .value()
                    .lock()
                    .ok()
                    .map(|s| s.info())
            })
            .collect()
    }
}

impl Default for PtyManager {
    fn default() -> Self {
        Self::new()
    }
}
