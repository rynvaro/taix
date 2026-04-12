use serde::{Deserialize, Serialize};
use specta::Type;
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    #[serde(default)]
    pub appearance: AppearanceConfig,

    #[serde(default)]
    pub shell: ShellConfig,

    #[serde(default)]
    pub ai: AiConfig,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            appearance: AppearanceConfig::default(),
            shell: ShellConfig::default(),
            ai: AiConfig::default(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AppearanceConfig {
    pub theme: Theme,
    pub font_family: String,
    pub font_size: u8,
    pub opacity: f32,
}

impl Default for AppearanceConfig {
    fn default() -> Self {
        Self {
            theme: Theme::Dark,
            font_family: "JetBrains Mono, Menlo, monospace".into(),
            font_size: 14,
            opacity: 1.0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Type, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum Theme {
    Dark,
    Light,
    System,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ShellConfig {
    /// Path to the default shell executable.
    /// None means auto-detect on each platform.
    pub default_shell: Option<String>,

    /// Extra arguments to pass to the shell.
    pub args: Vec<String>,

    /// Extra environment variables to inject into new sessions.
    pub env: HashMap<String, String>,
}

impl Default for ShellConfig {
    fn default() -> Self {
        Self {
            default_shell: None,
            args: vec![],
            env: HashMap::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AiConfig {
    pub provider: AiProvider,
    pub model: String,
    /// API key. Empty string means read from environment variable.
    pub api_key: String,
    pub ollama_base_url: String,
    pub default_mode: AiMode,
}

impl Default for AiConfig {
    fn default() -> Self {
        Self {
            provider: AiProvider::Openai,
            model: "gpt-4o".into(),
            api_key: String::new(),
            ollama_base_url: "http://localhost:11434".into(),
            default_mode: AiMode::Suggest,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Type, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum AiProvider {
    Openai,
    Anthropic,
    Ollama,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum AiMode {
    /// AI only suggests; user executes manually.
    Suggest,
    /// AI can run read-only commands automatically.
    Assist,
    /// AI can run write commands with per-command confirmation.
    Agent,
    /// AI runs everything; all actions are audit-logged.
    FullAuto,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_config_roundtrip_toml() {
        let config = AppConfig::default();
        let toml_str = toml::to_string(&config).expect("serialize to TOML");
        let restored: AppConfig = toml::from_str(&toml_str).expect("deserialize from TOML");

        assert_eq!(restored.appearance.font_size, config.appearance.font_size);
        assert_eq!(restored.appearance.theme, config.appearance.theme);
        assert_eq!(restored.ai.default_mode, config.ai.default_mode);
        assert_eq!(restored.ai.provider, config.ai.provider);
    }

    #[test]
    fn default_config_roundtrip_json() {
        let config = AppConfig::default();
        let json = serde_json::to_string(&config).expect("serialize to JSON");
        let restored: AppConfig = serde_json::from_str(&json).expect("deserialize from JSON");

        assert_eq!(restored.appearance.font_size, config.appearance.font_size);
        assert_eq!(restored.shell.args.len(), 0);
    }
}
