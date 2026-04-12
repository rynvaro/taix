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
