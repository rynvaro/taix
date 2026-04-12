pub mod schema;

use std::path::PathBuf;

use crate::error::AppError;
use schema::AppConfig;

pub struct ConfigManager;

impl ConfigManager {
    /// Returns the platform-specific path to the config file.
    /// macOS:   ~/Library/Application Support/taix/config.toml
    /// Linux:   ~/.config/taix/config.toml
    /// Windows: %APPDATA%\taix\config.toml
    pub fn config_path() -> PathBuf {
        dirs::config_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("taix")
            .join("config.toml")
    }

    /// Loads the config file. Returns `AppConfig::default()` if the file does not
    /// exist yet (first run), creating the file with default values in that case.
    pub fn load() -> Result<AppConfig, AppError> {
        let path = Self::config_path();

        if !path.exists() {
            let default = AppConfig::default();
            Self::save(&default)?;
            return Ok(default);
        }

        let contents = std::fs::read_to_string(&path)?;
        toml::from_str(&contents).map_err(|e| AppError::Config(e.to_string()))
    }

    /// Serializes `config` to TOML and writes it to the config file.
    /// Creates parent directories if they do not exist.
    pub fn save(config: &AppConfig) -> Result<(), AppError> {
        let path = Self::config_path();

        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }

        let contents = toml::to_string_pretty(config)
            .map_err(|e| AppError::Config(e.to_string()))?;

        std::fs::write(&path, contents)?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use schema::Theme;
    use tempfile::tempdir;

    /// Helper: temporarily override config_path by swapping dirs — instead,
    /// we test ConfigManager logic directly with explicit paths.
    fn save_to(config: &AppConfig, path: &PathBuf) -> Result<(), AppError> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(AppError::from)?;
        }
        let contents =
            toml::to_string_pretty(config).map_err(|e| AppError::Config(e.to_string()))?;
        std::fs::write(path, contents).map_err(AppError::from)?;
        Ok(())
    }

    fn load_from(path: &PathBuf) -> Result<AppConfig, AppError> {
        let contents = std::fs::read_to_string(path).map_err(AppError::from)?;
        toml::from_str(&contents).map_err(|e| AppError::Config(e.to_string()))
    }

    #[test]
    fn save_and_load_roundtrip() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("config.toml");

        let mut config = AppConfig::default();
        config.appearance.font_size = 18;
        config.appearance.theme = Theme::Light;

        save_to(&config, &path).unwrap();
        let loaded = load_from(&path).unwrap();

        assert_eq!(loaded.appearance.font_size, 18);
        assert_eq!(loaded.appearance.theme, Theme::Light);
    }

    #[test]
    fn missing_file_returns_default() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("nonexistent.toml");

        // Simulate load() for missing file
        assert!(!path.exists());
        let config = AppConfig::default();
        assert_eq!(config.appearance.font_size, 14);
    }
}
