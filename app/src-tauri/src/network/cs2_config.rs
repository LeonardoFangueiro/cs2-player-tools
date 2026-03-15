use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Cs2Config {
    pub autoexec_path: Option<String>,
    pub autoexec_exists: bool,
    pub current_settings: Vec<ConfigSetting>,
    pub launch_options: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ConfigSetting {
    pub key: String,
    pub current_value: Option<String>,
    pub recommended_value: String,
    pub description: String,
    pub is_optimized: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Cs2ConfigResult {
    pub success: bool,
    pub message: String,
}

fn find_cs2_cfg_dir() -> Option<PathBuf> {
    let candidates = [
        r"C:\Program Files (x86)\Steam\steamapps\common\Counter-Strike Global Offensive\game\csgo\cfg",
        r"D:\Steam\steamapps\common\Counter-Strike Global Offensive\game\csgo\cfg",
        r"D:\SteamLibrary\steamapps\common\Counter-Strike Global Offensive\game\csgo\cfg",
    ];

    for path in &candidates {
        let p = PathBuf::from(path);
        if p.exists() {
            return Some(p);
        }
    }

    // Try Steam libraryfolders.vdf
    #[cfg(target_os = "windows")]
    {
        let steam_cfg = r"C:\Program Files (x86)\Steam\steamapps\libraryfolders.vdf";
        if let Ok(content) = std::fs::read_to_string(steam_cfg) {
            for line in content.lines() {
                let trimmed = line.trim().trim_matches('"');
                if trimmed.contains(":\\") {
                    let candidate = PathBuf::from(format!(
                        "{}\\steamapps\\common\\Counter-Strike Global Offensive\\game\\csgo\\cfg",
                        trimmed.replace("\\\\", "\\")
                    ));
                    if candidate.exists() {
                        return Some(candidate);
                    }
                }
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        let home = std::env::var("HOME").unwrap_or_default();
        let p = PathBuf::from(format!(
            "{}/.steam/steam/steamapps/common/Counter-Strike Global Offensive/game/csgo/cfg",
            home
        ));
        if p.exists() {
            return Some(p);
        }
    }

    None
}

// Only commands verified as working in CS2 (Source 2) as of March 2026
// cl_forcepreload REMOVED — deprecated in Source 2, causes micro-lags
// snd_mix_async REMOVED — Source 1 only, not confirmed in CS2
const RECOMMENDED_SETTINGS: &[(&str, &str, &str)] = &[
    (
        "rate",
        "786432",
        "Max network rate (bytes/sec). 786432 = ~6.1 Mbps, maximum allowed by Valve.",
    ),
    (
        "cl_interp_ratio",
        "1",
        "Interpolation ratio. 1 = minimum delay (stable connections). Use 2 if you have packet loss.",
    ),
    (
        "cl_interp",
        "0.015625",
        "Interpolation period. 0.015625 = 1 tick (15.6ms). Set 0 for auto-calc from cl_interp_ratio.",
    ),
    (
        "fps_max",
        "0",
        "Uncapped FPS for best sub-tick input precision. Set to monitor Hz if you have screen tearing.",
    ),
    (
        "r_drawtracers_firstperson",
        "1",
        "Show first-person bullet tracers. Helps with spray tracking and aim feedback.",
    ),
    (
        "mm_dedicated_search_maxping",
        "70",
        "Max acceptable ping for matchmaking servers. Lower = stricter. Min: 50.",
    ),
    (
        "cl_showfps",
        "0",
        "FPS counter. 0=off, 1=simple, 2=detailed with frame time. Use for monitoring.",
    ),
    (
        "cq_netgraph",
        "1",
        "CS2 network graph overlay. Shows ping, loss, choke, tick rate, server recv margin.",
    ),
    (
        "cl_hud_telemetry_ping",
        "1",
        "Show ping in the HUD telemetry. Real-time latency display.",
    ),
    (
        "cl_hud_telemetry_serverrecvmargin_graph_show",
        "1",
        "Server receive margin graph. Most important CS2 network metric — shows if your data arrives on time.",
    ),
];

pub fn scan_cs2_config() -> Cs2Config {
    let cfg_dir = find_cs2_cfg_dir();
    let autoexec_path = cfg_dir.as_ref().map(|d| d.join("autoexec.cfg"));
    let autoexec_exists = autoexec_path.as_ref().map_or(false, |p| p.exists());

    let current_content = autoexec_path
        .as_ref()
        .and_then(|p| std::fs::read_to_string(p).ok())
        .unwrap_or_default();

    let mut settings = Vec::new();

    for (key, recommended, desc) in RECOMMENDED_SETTINGS {
        let current = current_content
            .lines()
            .find(|l| {
                let trimmed = l.trim();
                !trimmed.starts_with("//") && trimmed.split_whitespace().next() == Some(key)
            })
            .and_then(|l| l.split_whitespace().nth(1))
            .map(|v| v.trim_matches('"').to_string());

        let is_optimized = current.as_deref() == Some(*recommended);

        settings.push(ConfigSetting {
            key: key.to_string(),
            current_value: current,
            recommended_value: recommended.to_string(),
            description: desc.to_string(),
            is_optimized,
        });
    }

    Cs2Config {
        autoexec_path: autoexec_path.map(|p| p.to_string_lossy().to_string()),
        autoexec_exists,
        current_settings: settings,
        launch_options: None,
    }
}

pub fn apply_cs2_config(settings: Vec<(String, String)>) -> Cs2ConfigResult {
    let cfg_dir = match find_cs2_cfg_dir() {
        Some(d) => d,
        None => {
            return Cs2ConfigResult {
                success: false,
                message: "CS2 config directory not found".into(),
            }
        }
    };

    let autoexec = cfg_dir.join("autoexec.cfg");

    // Read existing content or start fresh
    let mut content = std::fs::read_to_string(&autoexec).unwrap_or_default();

    // Add header if new file
    if content.is_empty() {
        content = "// CS2 Player Tools — Optimized autoexec.cfg\n// Generated automatically — safe to edit\n\n".to_string();
    }

    for (key, value) in &settings {
        // Check if setting already exists
        let line_to_add = format!("{} {}", key, value);
        let exists = content.lines().any(|l| {
            let t = l.trim();
            !t.starts_with("//") && t.split_whitespace().next() == Some(key.as_str())
        });

        if exists {
            // Replace existing line
            let mut new_content = String::new();
            for line in content.lines() {
                let t = line.trim();
                if !t.starts_with("//") && t.split_whitespace().next() == Some(key.as_str()) {
                    new_content.push_str(&line_to_add);
                } else {
                    new_content.push_str(line);
                }
                new_content.push('\n');
            }
            content = new_content;
        } else {
            content.push_str(&format!("{}\n", line_to_add));
        }
    }

    // Ensure host_writeconfig at the end
    if !content.contains("host_writeconfig") {
        content.push_str("\nhost_writeconfig\n");
    }

    match std::fs::write(&autoexec, &content) {
        Ok(_) => Cs2ConfigResult {
            success: true,
            message: format!("Updated {} settings in autoexec.cfg", settings.len()),
        },
        Err(e) => Cs2ConfigResult {
            success: false,
            message: format!("Failed to write: {}", e),
        },
    }
}

/// Get recommended CS2 launch options
// Launch options verified for CS2 (Source 2) — March 2026
// -high REMOVED — Valve says it can cause instability in CS2
// -tickrate 128 REMOVED — CS2 uses sub-tick, this has no effect
pub fn get_launch_options() -> Vec<(String, String)> {
    vec![
        ("-novid".into(), "Skip intro video for faster launch.".into()),
        ("-freq 144".into(), "Set refresh rate. Change 144 to your monitor's Hz (e.g. 240, 360).".into()),
        ("+fps_max 0".into(), "Uncap FPS from launch for best sub-tick precision.".into()),
        ("-allow_third_party_software".into(), "Allow overlays and third-party software (needed for some tools).".into()),
        ("-nojoy".into(), "Disable joystick support. Saves a small amount of RAM.".into()),
    ]
}
