use serde::{Deserialize, Serialize};
use std::process::Command;
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

/// Default Valve IP ranges for split tunneling
pub fn get_valve_allowed_ips() -> String {
    "155.133.224.0/19, 162.254.192.0/21, 208.64.200.0/21, 185.25.180.0/22, 192.69.96.0/22, 205.196.6.0/24, 103.10.124.0/23, 103.28.54.0/23, 146.66.152.0/21, 208.78.164.0/22".to_string()
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
        let privkey_out = Command::new(&wg_path)
            .arg("genkey")
            .output()
            .map_err(|e| format!("Failed to generate key: {}", e))?;
        let private_key = String::from_utf8_lossy(&privkey_out.stdout).trim().to_string();

        let pubkey_out = Command::new(&wg_path)
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
        let privkey_out = Command::new("wg")
            .arg("genkey")
            .output()
            .map_err(|e| format!("wg not installed: {}", e))?;
        let private_key = String::from_utf8_lossy(&privkey_out.stdout).trim().to_string();

        let mut pubkey_child = Command::new("wg")
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
        let sc_out = Command::new("sc")
            .args(["query", &service_name])
            .output();

        match sc_out {
            Ok(output) => {
                let out = String::from_utf8_lossy(&output.stdout);
                let active = out.contains("RUNNING");

                if active {
                    // Get transfer stats from wg show
                    let wg_path = find_wg_exe().unwrap_or_default();
                    let wg_out = Command::new(&wg_path)
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
        let wg_out = Command::new("wg")
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

    #[cfg(target_os = "windows")]
    {
        let wg_exe = find_wireguard_exe()?;
        let output = Command::new(&wg_exe)
            .args(["/installtunnelservice", config_path.to_str().unwrap()])
            .output()
            .map_err(|e| format!("Failed to start tunnel: {}", e))?;

        Ok(VpnActionResult {
            success: output.status.success(),
            message: if output.status.success() {
                format!("Tunnel '{}' activated", profile.name)
            } else {
                String::from_utf8_lossy(&output.stderr).to_string()
            },
        })
    }

    #[cfg(not(target_os = "windows"))]
    {
        let output = Command::new("sudo")
            .args(["wg-quick", "up", config_path.to_str().unwrap()])
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
        let output = Command::new(&wg_exe)
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
        let output = Command::new("sudo")
            .args(["wg-quick", "down", config_path.to_str().unwrap()])
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

#[cfg(target_os = "windows")]
fn find_wireguard_exe() -> Result<String, String> {
    let paths = [
        r"C:\Program Files\WireGuard\wireguard.exe",
        r"C:\Program Files (x86)\WireGuard\wireguard.exe",
    ];
    for p in &paths {
        if std::path::Path::new(p).exists() { return Ok(p.to_string()); }
    }
    Err("WireGuard not found. Install from wireguard.com".to_string())
}

#[cfg(target_os = "windows")]
fn find_wg_exe() -> Result<String, String> {
    let paths = [
        r"C:\Program Files\WireGuard\wg.exe",
        r"C:\Program Files (x86)\WireGuard\wg.exe",
    ];
    for p in &paths {
        if std::path::Path::new(p).exists() { return Ok(p.to_string()); }
    }
    Err("wg.exe not found".to_string())
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
