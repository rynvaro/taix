use std::net::{TcpStream, ToSocketAddrs};
use std::time::Duration;

use crate::error::AppError;

/// Opens a URL in the system default browser.
#[tauri::command]
#[specta::specta]
pub fn open_url(url: String) -> Result<(), AppError> {
    // Basic URL validation: only allow http/https to prevent arbitrary program execution.
    if !url.starts_with("https://") && !url.starts_with("http://") {
        return Err(AppError::Io("Only http/https URLs are supported".into()));
    }
    open::that_detached(&url).map_err(|e| AppError::Io(e.to_string()))?;
    Ok(())
}

/// Tests whether an SSH host:port is reachable via TCP (5 s timeout).
/// Resolves hostnames (including /etc/hosts entries) via the OS resolver before connecting.
#[tauri::command]
#[specta::specta]
pub fn ssh_test_connection(host: String, port: u16) -> Result<String, AppError> {
    // Use ToSocketAddrs so hostnames (not just IP literals) are resolved via the OS.
    let addr = format!("{}:{}", host, port)
        .to_socket_addrs()
        .map_err(|e| AppError::Pty(format!("Cannot resolve '{}': {}", host, e)))?
        .next()
        .ok_or_else(|| AppError::Pty(format!("No addresses found for '{}'", host)))?;

    TcpStream::connect_timeout(&addr, Duration::from_secs(5))
        .map(|_| format!("{}:{} is reachable", host, port))
        .map_err(|e| AppError::Pty(format!("Cannot reach {}:{} — {}", host, port, e)))
}
