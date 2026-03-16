use serde::{Deserialize, Serialize};

use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct VpnProfile {
    pub name: String,
    pub server_endpoint: String,
    pub server_public_key: String,
    pub client_private_key: String,
    pub client_address: String,
    pub dns: String,
    pub mtu: u16,
    pub allowed_ips: String,
    pub persistent_keepalive: u16,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct VpnStatus {
    pub active: bool,
    pub profile_name: Option<String>,
    pub endpoint: Option<String>,
    pub transfer_rx: Option<String>,
    pub transfer_tx: Option<String>,
    pub latest_handshake: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct VpnActionResult {
    pub success: bool,
    pub message: String,
}

/// Get Valve IPs — dynamic from SDR config if available, fallback to hardcoded
pub fn get_valve_allowed_ips() -> String {
    // Hardcoded fallback (Valve AS32590)
    "155.133.224.0/19, 162.254.192.0/21, 208.64.200.0/21, 185.25.180.0/22, 192.69.96.0/22, 205.196.6.0/24, 103.10.124.0/23, 103.28.54.0/23, 146.66.152.0/21, 208.78.164.0/22".to_string()
}

/// Get dynamic Valve IPs from a pre-fetched SDR config
pub fn get_valve_ips_from_config(config: &serde_json::Value) -> String {
    let mut ips = std::collections::HashSet::new();

    if let Some(pops) = config.get("pops").and_then(|v| v.as_object()) {
        for (_code, pop_data) in pops {
            if let Some(relays) = pop_data.get("relays").and_then(|v| v.as_array()) {
                for relay in relays {
                    if let Some(ipv4) = relay.get("ipv4").and_then(|v| v.as_str()) {
                        ips.insert(ipv4.to_string());
                    }
                }
            }
        }
    }

    if ips.is_empty() {
        return get_valve_allowed_ips();
    }

    // Convert individual IPs to /32 entries
    let mut sorted: Vec<String> = ips.into_iter().map(|ip| format!("{}/32", ip)).collect();
    sorted.sort();
    sorted.join(", ")
}

/// Generate WireGuard config file content
pub fn generate_config(profile: &VpnProfile) -> String {
    format!(
        "[Interface]\nPrivateKey = {}\nAddress = {}\nDNS = {}\nMTU = {}\n\n[Peer]\nPublicKey = {}\nEndpoint = {}\nAllowedIPs = {}\nPersistentKeepalive = {}\n",
        profile.client_private_key,
        profile.client_address,
        profile.dns,
        profile.mtu,
        profile.server_public_key,
        profile.server_endpoint,
        profile.allowed_ips,
        profile.persistent_keepalive,
    )
}

/// Generate a new WireGuard keypair
pub fn generate_keypair() -> Result<(String, String), String> {
    #[cfg(target_os = "windows")]
    {
        let wg_path = find_wg_exe()?;
        let privkey_out = super::cmd::hidden(&wg_path)
            .arg("genkey")
            .output()
            .map_err(|e| format!("Failed to generate key: {}", e))?;
        let private_key = String::from_utf8_lossy(&privkey_out.stdout).trim().to_string();

        let pubkey_out = super::cmd::hidden(&wg_path)
            .arg("pubkey")
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .spawn()
            .and_then(|mut child| {
                use std::io::Write;
                if let Some(ref mut stdin) = child.stdin {
                    stdin.write_all(private_key.as_bytes()).ok();
                }
                child.wait_with_output()
            })
            .map_err(|e| format!("Failed to derive public key: {}", e))?;
        let public_key = String::from_utf8_lossy(&pubkey_out.stdout).trim().to_string();

        Ok((private_key, public_key))
    }

    #[cfg(not(target_os = "windows"))]
    {
        let privkey_out = super::cmd::hidden("wg")
            .arg("genkey")
            .output()
            .map_err(|e| format!("wg not installed: {}", e))?;
        let private_key = String::from_utf8_lossy(&privkey_out.stdout).trim().to_string();

        let mut pubkey_child = super::cmd::hidden("wg")
            .arg("pubkey")
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to run wg pubkey: {}", e))?;

        if let Some(ref mut stdin) = pubkey_child.stdin {
            use std::io::Write;
            stdin.write_all(private_key.as_bytes()).ok();
        }
        let pubkey_out = pubkey_child.wait_with_output()
            .map_err(|e| format!("Failed to get public key: {}", e))?;
        let public_key = String::from_utf8_lossy(&pubkey_out.stdout).trim().to_string();

        Ok((private_key, public_key))
    }
}

/// Get VPN tunnel status
pub fn get_vpn_status(profile_name: &str) -> VpnStatus {
    #[cfg(target_os = "windows")]
    {
        // Check if tunnel service is running
        let service_name = format!("WireGuardTunnel${}", profile_name);
        let sc_out = super::cmd::hidden("sc")
            .args(["query", &service_name])
            .output();

        match sc_out {
            Ok(output) => {
                let out = String::from_utf8_lossy(&output.stdout);
                let active = out.contains("RUNNING");

                if active {
                    // Get transfer stats from wg show
                    let wg_path = find_wg_exe().unwrap_or_default();
                    let wg_out = super::cmd::hidden(&wg_path)
                        .args(["show", profile_name, "dump"])
                        .output()
                        .ok();

                    let (transfer_rx, transfer_tx, latest_handshake, endpoint) =
                        wg_out.map(|o| parse_wg_dump(&String::from_utf8_lossy(&o.stdout)))
                              .unwrap_or((None, None, None, None));

                    VpnStatus { active, profile_name: Some(profile_name.to_string()), endpoint, transfer_rx, transfer_tx, latest_handshake, error: None }
                } else {
                    VpnStatus { active: false, profile_name: Some(profile_name.to_string()), endpoint: None, transfer_rx: None, transfer_tx: None, latest_handshake: None, error: None }
                }
            }
            Err(e) => VpnStatus { active: false, profile_name: None, endpoint: None, transfer_rx: None, transfer_tx: None, latest_handshake: None, error: Some(e.to_string()) }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        let wg_out = super::cmd::hidden("wg")
            .args(["show", profile_name, "dump"])
            .output()
            .ok();

        match wg_out {
            Some(output) if output.status.success() => {
                let out = String::from_utf8_lossy(&output.stdout);
                let (transfer_rx, transfer_tx, latest_handshake, endpoint) = parse_wg_dump(&out);
                VpnStatus { active: true, profile_name: Some(profile_name.to_string()), endpoint, transfer_rx, transfer_tx, latest_handshake, error: None }
            }
            _ => VpnStatus { active: false, profile_name: Some(profile_name.to_string()), endpoint: None, transfer_rx: None, transfer_tx: None, latest_handshake: None, error: None }
        }
    }
}

fn parse_wg_dump(output: &str) -> (Option<String>, Option<String>, Option<String>, Option<String>) {
    // wg show dump format: peer lines have tab-separated fields
    // public_key preshared_key endpoint allowed_ips latest_handshake transfer_rx transfer_tx persistent_keepalive
    for line in output.lines().skip(1) {
        let fields: Vec<&str> = line.split('\t').collect();
        if fields.len() >= 7 {
            let endpoint = Some(fields[2].to_string()).filter(|s| s != "(none)");
            let handshake = fields[4].parse::<u64>().ok().map(|ts| {
                let now = chrono::Utc::now().timestamp() as u64;
                if ts == 0 { "Never".to_string() } else if now >= ts { format!("{}s ago", now - ts) } else { "Just now".to_string() }
            });
            let rx = fields[5].parse::<u64>().ok().map(format_bytes);
            let tx = fields[6].parse::<u64>().ok().map(format_bytes);
            return (rx, tx, handshake, endpoint);
        }
    }
    (None, None, None, None)
}

fn format_bytes(bytes: u64) -> String {
    if bytes < 1024 { return format!("{} B", bytes); }
    if bytes < 1024 * 1024 { return format!("{:.1} KB", bytes as f64 / 1024.0); }
    if bytes < 1024 * 1024 * 1024 { return format!("{:.1} MB", bytes as f64 / (1024.0 * 1024.0)); }
    format!("{:.2} GB", bytes as f64 / (1024.0 * 1024.0 * 1024.0))
}

/// Save config and install/activate tunnel
pub fn activate_vpn(profile: &VpnProfile) -> Result<VpnActionResult, String> {
    let config_content = generate_config(profile);
    let config_dir = get_config_dir()?;
    let config_path = config_dir.join(format!("{}.conf", profile.name));

    std::fs::create_dir_all(&config_dir)
        .map_err(|e| format!("Failed to create config dir: {}", e))?;
    std::fs::write(&config_path, &config_content)
        .map_err(|e| format!("Failed to write config: {}", e))?;

    // Set restrictive permissions on config file (contains private key)
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&config_path, std::fs::Permissions::from_mode(0o600)).ok();
    }

    #[cfg(target_os = "windows")]
    {
        let wg_exe = find_wireguard_exe()?;

        // ALWAYS clean up previous tunnel with the same name first
        // This prevents "Command Line Options" error on reconnect
        let _ = super::cmd::hidden(&wg_exe)
            .args(["/uninstalltunnelservice", &profile.name])
            .output();
        // Small delay to let the service fully stop
        std::thread::sleep(std::time::Duration::from_millis(500));

        // WireGuard Windows expects configs in its own data directory
        let wg_config_dir = std::path::PathBuf::from(r"C:\Program Files\WireGuard\Data\Configurations");
        std::fs::create_dir_all(&wg_config_dir).ok();
        // Remove old config files
        let _ = std::fs::remove_file(wg_config_dir.join(format!("{}.conf.dpapi", profile.name)));
        let _ = std::fs::remove_file(wg_config_dir.join(format!("{}.conf", profile.name)));
        // Copy fresh config
        let wg_plain_path = wg_config_dir.join(format!("{}.conf", profile.name));
        std::fs::copy(&config_path, &wg_plain_path).ok();

        // Method 1: Try /installtunnelservice with the original path
        let config_path_str = config_path.to_str().ok_or("Invalid config path")?;
        let r1 = super::cmd::hidden(&wg_exe)
            .args(["/installtunnelservice", config_path_str])
            .output();

        if let Ok(ref o) = r1 {
            if o.status.success() {
                return Ok(VpnActionResult {
                    success: true,
                    message: format!("Tunnel '{}' activated", profile.name),
                });
            }
        }

        // Method 2: Try with the WireGuard data directory path
        let wg_plain_str = wg_plain_path.to_str().ok_or("Invalid path")?;
        let r2 = super::cmd::hidden(&wg_exe)
            .args(["/installtunnelservice", wg_plain_str])
            .output();

        if let Ok(ref o) = r2 {
            if o.status.success() {
                return Ok(VpnActionResult {
                    success: true,
                    message: format!("Tunnel '{}' activated", profile.name),
                });
            }
        }

        // Method 3: Launch WireGuard GUI and import the config
        // wireguard.exe /import <path> imports the tunnel into the GUI manager
        let r3 = super::cmd::hidden(&wg_exe)
            .args(["/import", config_path_str])
            .spawn();

        if r3.is_ok() {
            // Give it a moment to import
            std::thread::sleep(std::time::Duration::from_secs(2));
            return Ok(VpnActionResult {
                success: true,
                message: format!("Tunnel '{}' imported into WireGuard — activate it from the system tray icon", profile.name),
            });
        }

        // All methods failed
        let err1 = r1.map(|o| String::from_utf8_lossy(&o.stderr).to_string()).unwrap_or_default();
        let err2 = r2.map(|o| String::from_utf8_lossy(&o.stderr).to_string()).unwrap_or_default();
        Ok(VpnActionResult {
            success: false,
            message: format!("Failed to activate tunnel. Error: {} | {}", err1.trim(), err2.trim()),
        })
    }

    #[cfg(not(target_os = "windows"))]
    {
        let config_path_str = config_path.to_str().ok_or("Invalid config path")?;
        let output = super::cmd::hidden("sudo")
            .args(["wg-quick", "up", config_path_str])
            .output()
            .map_err(|e| format!("Failed to start tunnel: {}", e))?;
        Ok(VpnActionResult {
            success: output.status.success(),
            message: String::from_utf8_lossy(&output.stdout).to_string(),
        })
    }
}

/// Stop and remove tunnel
pub fn deactivate_vpn(profile_name: &str) -> Result<VpnActionResult, String> {
    #[cfg(target_os = "windows")]
    {
        let wg_exe = find_wireguard_exe()?;
        let output = super::cmd::hidden(&wg_exe)
            .args(["/uninstalltunnelservice", profile_name])
            .output()
            .map_err(|e| format!("Failed to stop tunnel: {}", e))?;
        Ok(VpnActionResult {
            success: output.status.success(),
            message: if output.status.success() { format!("Tunnel '{}' deactivated", profile_name) } else { String::from_utf8_lossy(&output.stderr).to_string() },
        })
    }

    #[cfg(not(target_os = "windows"))]
    {
        let config_dir = get_config_dir()?;
        let config_path = config_dir.join(format!("{}.conf", profile_name));
        let config_path_str = config_path.to_str().ok_or("Invalid config path")?;
        let output = super::cmd::hidden("sudo")
            .args(["wg-quick", "down", config_path_str])
            .output()
            .map_err(|e| format!("Failed to stop tunnel: {}", e))?;
        Ok(VpnActionResult {
            success: output.status.success(),
            message: String::from_utf8_lossy(&output.stdout).to_string(),
        })
    }
}

fn get_config_dir() -> Result<PathBuf, String> {
    #[cfg(target_os = "windows")]
    { Ok(PathBuf::from(r"C:\CS2PlayerTools\vpn")) }
    #[cfg(not(target_os = "windows"))]
    {
        let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
        Ok(PathBuf::from(format!("{}/cs2-player-tools/vpn", home)))
    }
}

/// Find wireguard.exe — checks bundled resources first, then system install
#[cfg(target_os = "windows")]
fn find_wireguard_exe() -> Result<String, String> {
    // 1. Check bundled with app (resources/wireguard/)
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(app_dir) = exe_path.parent() {
            let bundled = app_dir.join("wireguard").join("wireguard.exe");
            if bundled.exists() { return Ok(bundled.to_string_lossy().to_string()); }
            // Also check resources subdirectory (Tauri bundle layout)
            let bundled_res = app_dir.join("resources").join("wireguard").join("wireguard.exe");
            if bundled_res.exists() { return Ok(bundled_res.to_string_lossy().to_string()); }
        }
    }
    // 2. Check C:\CS2PlayerTools\wireguard\ (our custom install dir)
    let custom = r"C:\CS2PlayerTools\wireguard\wireguard.exe";
    if std::path::Path::new(custom).exists() { return Ok(custom.to_string()); }
    // 3. Check system-installed WireGuard
    let system_paths = [
        r"C:\Program Files\WireGuard\wireguard.exe",
        r"C:\Program Files (x86)\WireGuard\wireguard.exe",
    ];
    for p in &system_paths {
        if std::path::Path::new(p).exists() { return Ok(p.to_string()); }
    }
    Err("WireGuard not found. It should be bundled with the app — please reinstall, or install WireGuard from wireguard.com".to_string())
}

/// Find wg.exe — checks bundled resources first, then system install
#[cfg(target_os = "windows")]
fn find_wg_exe() -> Result<String, String> {
    // 1. Check bundled with app
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(app_dir) = exe_path.parent() {
            let bundled = app_dir.join("wireguard").join("wg.exe");
            if bundled.exists() { return Ok(bundled.to_string_lossy().to_string()); }
            let bundled_res = app_dir.join("resources").join("wireguard").join("wg.exe");
            if bundled_res.exists() { return Ok(bundled_res.to_string_lossy().to_string()); }
        }
    }
    // 2. Check custom dir
    let custom = r"C:\CS2PlayerTools\wireguard\wg.exe";
    if std::path::Path::new(custom).exists() { return Ok(custom.to_string()); }
    // 3. System-installed
    let system_paths = [
        r"C:\Program Files\WireGuard\wg.exe",
        r"C:\Program Files (x86)\WireGuard\wg.exe",
    ];
    for p in &system_paths {
        if std::path::Path::new(p).exists() { return Ok(p.to_string()); }
    }
    Err("wg.exe not found. It should be bundled with the app — please reinstall, or install WireGuard from wireguard.com".to_string())
}

/// Check if WireGuard binaries are available (bundled or system)
pub fn check_wireguard_available() -> WireGuardStatus {
    #[cfg(target_os = "windows")]
    {
        let wg = find_wg_exe();
        let wireguard = find_wireguard_exe();
        let available = wg.is_ok() && wireguard.is_ok();
        let source = if wg.as_ref().map_or(false, |p| p.contains("CS2PlayerTools") || p.contains("resources"))
            { "bundled".to_string() } else if wg.is_ok() { "system".to_string() } else { "not_found".to_string() };
        WireGuardStatus {
            available,
            wg_path: wg.as_ref().ok().cloned(),
            wireguard_path: wireguard.as_ref().ok().cloned(),
            source,
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        let wg = super::cmd::hidden("which").arg("wg").output().ok().map(|o| o.status.success()).unwrap_or(false);
        WireGuardStatus {
            available: wg,
            wg_path: if wg { Some("wg".to_string()) } else { None },
            wireguard_path: None,
            source: if wg { "system".to_string() } else { "not_found".to_string() },
        }
    }
}

#[derive(Debug, serde::Serialize, serde::Deserialize, Clone)]
pub struct WireGuardStatus {
    pub available: bool,
    pub wg_path: Option<String>,
    pub wireguard_path: Option<String>,
    pub source: String,
}

/// Load a saved VPN profile from config file
pub fn load_profile(profile_name: &str) -> Result<VpnProfile, String> {
    let config_dir = get_config_dir()?;
    let config_path = config_dir.join(format!("{}.conf", profile_name));

    if !config_path.exists() {
        return Err(format!("Profile '{}' not found", profile_name));
    }

    let content = std::fs::read_to_string(&config_path)
        .map_err(|e| format!("Failed to read profile: {}", e))?;

    // Parse WireGuard config format
    let mut profile = VpnProfile {
        name: profile_name.to_string(),
        server_endpoint: String::new(),
        server_public_key: String::new(),
        client_private_key: String::new(),
        client_address: String::new(),
        dns: "1.1.1.1".to_string(),
        mtu: 1420,
        allowed_ips: String::new(),
        persistent_keepalive: 25,
    };

    let mut in_peer = false;
    for line in content.lines() {
        let line = line.trim();
        if line == "[Peer]" { in_peer = true; continue; }
        if line == "[Interface]" { in_peer = false; continue; }

        if let Some((key, value)) = line.split_once('=') {
            let key = key.trim();
            let value = value.trim();

            if !in_peer {
                match key {
                    "PrivateKey" => profile.client_private_key = value.to_string(),
                    "Address" => profile.client_address = value.to_string(),
                    "DNS" => profile.dns = value.to_string(),
                    "MTU" => profile.mtu = value.parse().unwrap_or(1420),
                    _ => {}
                }
            } else {
                match key {
                    "PublicKey" => profile.server_public_key = value.to_string(),
                    "Endpoint" => profile.server_endpoint = value.to_string(),
                    "AllowedIPs" => profile.allowed_ips = value.to_string(),
                    "PersistentKeepalive" => profile.persistent_keepalive = value.parse().unwrap_or(25),
                    _ => {}
                }
            }
        }
    }

    Ok(profile)
}

/// Save a VPN profile metadata as JSON alongside the .conf
pub fn save_profile_meta(profile: &VpnProfile) -> Result<(), String> {
    let config_dir = get_config_dir()?;
    std::fs::create_dir_all(&config_dir).map_err(|e| e.to_string())?;

    let meta_path = config_dir.join(format!("{}.json", profile.name));
    let json = serde_json::to_string_pretty(profile).map_err(|e| e.to_string())?;
    std::fs::write(&meta_path, json).map_err(|e| e.to_string())
}

/// Delete a VPN profile (config + meta)
pub fn delete_profile(profile_name: &str) -> Result<(), String> {
    let config_dir = get_config_dir()?;
    let conf = config_dir.join(format!("{}.conf", profile_name));
    let meta = config_dir.join(format!("{}.json", profile_name));
    if conf.exists() { std::fs::remove_file(&conf).ok(); }
    if meta.exists() { std::fs::remove_file(&meta).ok(); }
    Ok(())
}

/// List saved VPN profiles
pub fn list_profiles() -> Result<Vec<String>, String> {
    let config_dir = get_config_dir()?;
    if !config_dir.exists() { return Ok(Vec::new()); }

    let entries = std::fs::read_dir(&config_dir)
        .map_err(|e| format!("Failed to read config dir: {}", e))?;

    let mut profiles = Vec::new();
    for entry in entries.flatten() {
        if let Some(name) = entry.path().file_stem() {
            if entry.path().extension().map_or(false, |ext| ext == "conf") {
                profiles.push(name.to_string_lossy().to_string());
            }
        }
    }
    Ok(profiles)
}
