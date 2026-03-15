use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use chrono::Utc;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SessionRecord {
    pub timestamp: String,
    pub duration_secs: u64,
    pub avg_ping_ms: f64,
    pub min_ping_ms: f64,
    pub max_ping_ms: f64,
    pub jitter_ms: f64,
    pub loss_percent: f64,
    pub server_region: String,
    pub vpn_active: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ConnectionHistory {
    pub sessions: Vec<SessionRecord>,
}

fn history_path() -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        PathBuf::from(r"C:\CS2PlayerTools\history.json")
    }
    #[cfg(not(target_os = "windows"))]
    {
        let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".into());
        PathBuf::from(format!("{}/cs2-player-tools/history.json", home))
    }
}

pub fn load_history() -> ConnectionHistory {
    let path = history_path();
    std::fs::read_to_string(&path)
        .ok()
        .and_then(|c| serde_json::from_str(&c).ok())
        .unwrap_or(ConnectionHistory {
            sessions: Vec::new(),
        })
}

pub fn save_session(record: SessionRecord) -> Result<(), String> {
    let mut history = load_history();
    history.sessions.push(record);
    // Keep last 100 sessions
    if history.sessions.len() > 100 {
        history.sessions = history.sessions.split_off(history.sessions.len() - 100);
    }
    let path = history_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).ok();
    }
    let json = serde_json::to_string_pretty(&history).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())
}

pub fn clear_history() -> Result<(), String> {
    let path = history_path();
    if path.exists() {
        std::fs::remove_file(&path).map_err(|e| e.to_string())
    } else {
        Ok(())
    }
}

/// Export all settings and profiles as a JSON bundle
pub fn export_all() -> Result<String, String> {
    let settings = super::load_settings();
    let history = load_history();
    let profiles = super::list_profiles().unwrap_or_default();

    let export = serde_json::json!({
        "version": "1.0",
        "exported_at": Utc::now().to_rfc3339(),
        "settings": settings,
        "history": history,
        "vpn_profiles": profiles,
    });

    serde_json::to_string_pretty(&export).map_err(|e| e.to_string())
}
