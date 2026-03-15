use serde::{Deserialize, Serialize};
use std::net::ToSocketAddrs;
use std::process::Command;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TraceHop {
    pub hop: u32,
    pub ip: String,
    pub hostname: Option<String>,
    pub latency_ms: f64,
    pub loss_percent: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct NetworkInfo {
    pub hostname: String,
    pub dns_servers: Vec<String>,
    pub default_gateway: Option<String>,
}

pub fn resolve_dns(hostname: &str) -> Result<Vec<String>, String> {
    let addrs = format!("{}:0", hostname)
        .to_socket_addrs()
        .map_err(|e| format!("DNS resolution failed: {}", e))?;
    Ok(addrs.map(|a| a.ip().to_string()).collect())
}

pub fn get_network_info() -> Result<NetworkInfo, String> {
    let hostname = hostname::get()
        .map(|h| h.to_string_lossy().to_string())
        .unwrap_or_else(|_| "unknown".to_string());

    // Get DNS servers and gateway - platform specific
    let (dns_servers, default_gateway) = get_system_network_info();

    Ok(NetworkInfo {
        hostname,
        dns_servers,
        default_gateway,
    })
}

#[cfg(target_os = "windows")]
fn get_system_network_info() -> (Vec<String>, Option<String>) {
    let dns = Command::new("powershell")
        .args(["-Command", "Get-DnsClientServerAddress -AddressFamily IPv4 | Select-Object -ExpandProperty ServerAddresses | Select-Object -Unique"])
        .output()
        .ok()
        .map(|o| {
            String::from_utf8_lossy(&o.stdout)
                .lines()
                .filter(|l| !l.trim().is_empty())
                .map(|l| l.trim().to_string())
                .collect()
        })
        .unwrap_or_default();

    let gw = Command::new("powershell")
        .args(["-Command", "(Get-NetRoute -DestinationPrefix '0.0.0.0/0' | Select-Object -First 1).NextHop"])
        .output()
        .ok()
        .and_then(|o| {
            let s = String::from_utf8_lossy(&o.stdout).trim().to_string();
            if s.is_empty() { None } else { Some(s) }
        });

    (dns, gw)
}

#[cfg(not(target_os = "windows"))]
fn get_system_network_info() -> (Vec<String>, Option<String>) {
    let dns = std::fs::read_to_string("/etc/resolv.conf")
        .ok()
        .map(|content| {
            content.lines()
                .filter(|l| l.starts_with("nameserver"))
                .filter_map(|l| l.split_whitespace().nth(1).map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default();

    let gw = Command::new("ip")
        .args(["route", "show", "default"])
        .output()
        .ok()
        .and_then(|o| {
            String::from_utf8_lossy(&o.stdout)
                .split_whitespace()
                .nth(2)
                .map(|s| s.to_string())
        });

    (dns, gw)
}

pub async fn traceroute(host: &str) -> Result<Vec<TraceHop>, String> {
    let output = tokio::task::spawn_blocking({
        let host = host.to_string();
        move || {
            #[cfg(target_os = "windows")]
            let cmd = Command::new("tracert")
                .args(["-d", "-w", "2000", "-h", "30", &host])
                .output();

            #[cfg(not(target_os = "windows"))]
            let cmd = Command::new("traceroute")
                .args(["-n", "-w", "2", "-m", "30", &host])
                .output();

            cmd.map_err(|e| format!("Failed to run traceroute: {}", e))
        }
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))??;

    let stdout = String::from_utf8_lossy(&output.stdout);
    parse_traceroute_output(&stdout)
}

fn parse_traceroute_output(output: &str) -> Result<Vec<TraceHop>, String> {
    let mut hops = Vec::new();

    for line in output.lines() {
        let line = line.trim();
        if line.is_empty() { continue; }

        // Try to parse hop number at start of line
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.is_empty() { continue; }

        let hop_num = match parts[0].parse::<u32>() {
            Ok(n) => n,
            Err(_) => continue,
        };

        // Find IP address and latency in the line
        let mut ip = String::from("*");
        let mut latencies: Vec<f64> = Vec::new();

        for part in &parts[1..] {
            // Check if it's an IP
            if part.contains('.') && part.chars().all(|c| c.is_ascii_digit() || c == '.') {
                ip = part.to_string();
            }
            // Check if it looks like a latency (number, possibly followed by "ms")
            let cleaned = part.trim_end_matches("ms").trim_end_matches(',');
            if let Ok(ms) = cleaned.parse::<f64>() {
                if ms > 0.0 && ms < 10000.0 {
                    latencies.push(ms);
                }
            }
        }

        let avg_latency = if latencies.is_empty() {
            -1.0
        } else {
            latencies.iter().sum::<f64>() / latencies.len() as f64
        };

        // Count timeouts (* entries)
        let total_probes = 3.0;
        let timeout_count = parts[1..].iter().filter(|p| **p == "*").count() as f64;
        let loss = (timeout_count / total_probes) * 100.0;

        hops.push(TraceHop {
            hop: hop_num,
            ip,
            hostname: None,
            latency_ms: avg_latency,
            loss_percent: loss,
        });
    }

    Ok(hops)
}
