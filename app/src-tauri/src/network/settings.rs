use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppSettings {
    pub auto_connect_vpn: bool,
    pub vpn_profile_name: Option<String>,
    pub max_ping: u32,
    pub auto_start_with_windows: bool,
    pub minimize_to_tray: bool,
    pub check_cs2_interval_secs: u32,
    pub dynamic_valve_ips: bool,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            auto_connect_vpn: false,
            vpn_profile_name: None,
            max_ping: 70,
            auto_start_with_windows: false,
            minimize_to_tray: true,
            check_cs2_interval_secs: 5,
            dynamic_valve_ips: true,
        }
    }
}

fn settings_path() -> PathBuf {
    #[cfg(target_os = "windows")]
    { PathBuf::from(r"C:\CS2PlayerTools\settings.json") }
    #[cfg(not(target_os = "windows"))]
    {
        let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
        PathBuf::from(format!("{}/cs2-player-tools/settings.json", home))
    }
}

pub fn load_settings() -> AppSettings {
    let path = settings_path();
    std::fs::read_to_string(&path)
        .ok()
        .and_then(|content| serde_json::from_str(&content).ok())
        .unwrap_or_default()
}

pub fn save_settings(settings: &AppSettings) -> Result<(), String> {
    let path = settings_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create settings dir: {}", e))?;
    }
    let json = serde_json::to_string_pretty(settings)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;
    std::fs::write(&path, json)
        .map_err(|e| format!("Failed to write settings: {}", e))
}
