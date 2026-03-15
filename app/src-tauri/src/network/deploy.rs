use serde::{Deserialize, Serialize};
use ssh2::Session;
use std::io::Read;
use std::net::TcpStream;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct VpsCredentials {
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth_method: String, // "password" or "key"
    pub password: Option<String>,
    pub private_key: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TestConnectionResult {
    pub success: bool,
    pub message: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DeployResult {
    pub success: bool,
    pub server_public_key: String,
    pub endpoint: String,
    pub client_private_key: String,
    pub client_public_key: String,
    pub client_address: String,
    pub message: String,
    pub log: Vec<String>,
}

fn ssh_connect(creds: &VpsCredentials) -> Result<Session, String> {
    let addr = format!("{}:{}", creds.host, creds.port);
    let tcp = TcpStream::connect(&addr)
        .map_err(|e| format!("Failed to connect to {}: {}", addr, e))?;
    tcp.set_read_timeout(Some(std::time::Duration::from_secs(30))).ok();

    let mut session = Session::new()
        .map_err(|e| format!("Failed to create SSH session: {}", e))?;
    session.set_tcp_stream(tcp);
    session.handshake()
        .map_err(|e| format!("SSH handshake failed: {}", e))?;

    match creds.auth_method.as_str() {
        "password" => {
            let password = creds.password.as_deref().unwrap_or("");
            session.userauth_password(&creds.username, password)
                .map_err(|e| format!("Password auth failed: {}", e))?;
        }
        "key" => {
            if let Some(key_content) = &creds.private_key {
                let key_path = std::env::temp_dir().join(format!("cs2pt_ssh_{}", std::process::id()));
                std::fs::write(&key_path, key_content)
                    .map_err(|e| format!("Failed to write SSH key: {}", e))?;
                #[cfg(unix)]
                {
                    use std::os::unix::fs::PermissionsExt;
                    std::fs::set_permissions(&key_path, std::fs::Permissions::from_mode(0o600)).ok();
                }
                let result = session.userauth_pubkey_file(
                    &creds.username,
                    None,
                    &key_path,
                    None,
                );
                let _ = std::fs::remove_file(&key_path); // Clean up
                result.map_err(|e| format!("Key auth failed: {}", e))?;
            } else {
                return Err("Private key content is required for key auth".to_string());
            }
        }
        _ => return Err(format!("Unknown auth method: {}", creds.auth_method)),
    }

    if !session.authenticated() {
        return Err("Authentication failed".to_string());
    }

    Ok(session)
}

fn ssh_exec(session: &Session, cmd: &str) -> Result<String, String> {
    let mut channel = session.channel_session()
        .map_err(|e| format!("Failed to open channel: {}", e))?;
    channel.exec(cmd)
        .map_err(|e| format!("Failed to exec '{}': {}", cmd, e))?;

    let mut output = String::new();
    channel.read_to_string(&mut output)
        .map_err(|e| format!("Failed to read output: {}", e))?;

    let mut stderr = String::new();
    channel.stderr().read_to_string(&mut stderr).ok();

    channel.wait_close().ok();
    let exit = channel.exit_status().unwrap_or(-1);

    if exit != 0 && !stderr.is_empty() {
        // Some commands write to stderr but still succeed (apt, etc.)
        // Only fail if exit code is non-zero AND output is empty
        if output.trim().is_empty() {
            return Err(format!("Command '{}' failed (exit {}): {}", cmd, exit, stderr.trim()));
        }
    }

    Ok(output)
}

pub async fn test_connection(creds: VpsCredentials) -> Result<TestConnectionResult, String> {
    tokio::task::spawn_blocking(move || {
        let session = ssh_connect(&creds)?;
        let output = ssh_exec(&session, "uname -a")?;
        Ok(TestConnectionResult {
            success: true,
            message: format!("Connected: {}", output.trim()),
        })
    })
    .await
    .map_err(|e| format!("Task error: {}", e))?
}

pub async fn deploy_wireguard(creds: VpsCredentials, client_address: String) -> Result<DeployResult, String> {
    tokio::task::spawn_blocking(move || {
        let mut log = Vec::new();

        // Connect
        log.push("Connecting to VPS...".to_string());
        let session = ssh_connect(&creds)?;
        log.push(format!("Connected to {}@{}", creds.username, creds.host));

        // Check if WireGuard is already installed
        log.push("Checking WireGuard installation...".to_string());
        let wg_check = ssh_exec(&session, "which wg 2>/dev/null || echo 'not_found'");
        let needs_install = wg_check.map_or(true, |o| o.trim() == "not_found" || o.trim().is_empty());

        if needs_install {
            log.push("Installing WireGuard...".to_string());
            ssh_exec(&session, "DEBIAN_FRONTEND=noninteractive apt-get update -qq")?;
            ssh_exec(&session, "DEBIAN_FRONTEND=noninteractive apt-get install -y -qq wireguard")?;
            log.push("WireGuard installed.".to_string());
        } else {
            log.push("WireGuard already installed.".to_string());
        }

        // Enable IP forwarding
        log.push("Enabling IP forwarding...".to_string());
        ssh_exec(&session, "sysctl -w net.ipv4.ip_forward=1")?;
        ssh_exec(&session, "grep -q 'net.ipv4.ip_forward=1' /etc/sysctl.conf || echo 'net.ipv4.ip_forward=1' >> /etc/sysctl.conf")?;

        // Generate server keypair
        log.push("Generating server keypair...".to_string());
        let keypair_out = ssh_exec(&session, "privkey=$(wg genkey) && echo $privkey && echo $privkey | wg pubkey")?;
        let lines: Vec<&str> = keypair_out.trim().lines().collect();
        if lines.len() < 2 {
            return Err("Failed to generate server keypair".to_string());
        }
        let server_privkey = lines[0].trim().to_string();
        let server_pubkey = lines[1].trim().to_string();
        let short_server_key = if server_pubkey.len() >= 8 { &server_pubkey[..8] } else { &server_pubkey };
        let short_server_key_end = if server_pubkey.len() >= 4 { &server_pubkey[server_pubkey.len()-4..] } else { &server_pubkey };
        log.push(format!("Server public key: {}...{}", short_server_key, short_server_key_end));

        // Generate client keypair (via the VPS since it has wg tools)
        log.push("Generating client keypair...".to_string());
        let client_keypair_out = ssh_exec(&session, "privkey=$(wg genkey) && echo $privkey && echo $privkey | wg pubkey")?;
        let client_lines: Vec<&str> = client_keypair_out.trim().lines().collect();
        if client_lines.len() < 2 {
            return Err("Failed to generate client keypair".to_string());
        }
        let client_privkey = client_lines[0].trim().to_string();
        let client_pubkey = client_lines[1].trim().to_string();
        let short_client_key = if client_pubkey.len() >= 8 { &client_pubkey[..8] } else { &client_pubkey };
        let short_client_key_end = if client_pubkey.len() >= 4 { &client_pubkey[client_pubkey.len()-4..] } else { &client_pubkey };
        log.push(format!("Client public key: {}...{}", short_client_key, short_client_key_end));

        // Detect main network interface
        let iface = ssh_exec(&session, "ip route show default | awk '{print $5}' | head -1")?.trim().to_string();
        let iface = if iface.is_empty() { "eth0".to_string() } else { iface };
        log.push(format!("Network interface: {}", iface));

        // Parse client address to get the network
        let client_ip = client_address.split('/').next().unwrap_or("10.66.66.2");
        // Server is .1 in the same subnet
        let server_ip = {
            let parts: Vec<&str> = client_ip.rsplitn(2, '.').collect();
            if parts.len() == 2 {
                format!("{}.1", parts[1])
            } else {
                "10.66.66.1".to_string()
            }
        };

        // Create server config
        log.push("Writing server configuration...".to_string());
        let server_config = format!(
            "[Interface]\nAddress = {}/24\nListenPort = 51820\nPrivateKey = {}\nPostUp = iptables -t nat -A POSTROUTING -o {} -j MASQUERADE\nPostDown = iptables -t nat -D POSTROUTING -o {} -j MASQUERADE\n\n[Peer]\nPublicKey = {}\nAllowedIPs = {}/32\n",
            server_ip, server_privkey, iface, iface, client_pubkey, client_ip
        );

        // Write config via heredoc
        let write_cmd = format!(
            "cat > /etc/wireguard/wg0.conf << 'WGEOF'\n{}\nWGEOF",
            server_config
        );
        ssh_exec(&session, &write_cmd)?;
        ssh_exec(&session, "chmod 600 /etc/wireguard/wg0.conf")?;

        // Optimize server network for low latency
        log.push("Applying network optimizations...".to_string());
        let sysctl_cmds = [
            "sysctl -w net.core.rmem_max=16777216",
            "sysctl -w net.core.wmem_max=16777216",
            "sysctl -w net.ipv4.udp_rmem_min=8192",
            "sysctl -w net.ipv4.udp_wmem_min=8192",
            "sysctl -w net.core.netdev_max_backlog=5000",
        ];
        for cmd in &sysctl_cmds {
            ssh_exec(&session, cmd).ok();
        }

        // Open firewall port
        log.push("Configuring firewall...".to_string());
        ssh_exec(&session, "which ufw >/dev/null 2>&1 && ufw allow 51820/udp || true")?;

        // Stop existing WireGuard if running, then start
        log.push("Starting WireGuard...".to_string());
        ssh_exec(&session, "wg-quick down wg0 2>/dev/null || true")?;
        ssh_exec(&session, "wg-quick up wg0")?;
        ssh_exec(&session, "systemctl enable wg-quick@wg0 2>/dev/null || true")?;

        // Verify it's running
        let wg_status = ssh_exec(&session, "wg show wg0 2>&1")?;
        if wg_status.contains("interface: wg0") {
            log.push("WireGuard is running!".to_string());
        } else {
            log.push(format!("WireGuard status: {}", wg_status.trim()));
        }

        let endpoint = format!("{}:51820", creds.host);
        log.push(format!("Server endpoint: {}", endpoint));
        log.push("Deployment complete!".to_string());

        Ok(DeployResult {
            success: true,
            server_public_key: server_pubkey,
            endpoint,
            client_private_key: client_privkey,
            client_public_key: client_pubkey,
            client_address,
            message: "WireGuard deployed and running".to_string(),
            log,
        })
    })
    .await
    .map_err(|e| format!("Task error: {}", e))?
}
