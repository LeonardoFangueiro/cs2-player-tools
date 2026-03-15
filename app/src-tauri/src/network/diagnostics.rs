use serde::{Deserialize, Serialize};
use std::net::ToSocketAddrs;

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
    pub interfaces: Vec<InterfaceInfo>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct InterfaceInfo {
    pub name: String,
    pub ip: String,
    pub is_up: bool,
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

    Ok(NetworkInfo {
        hostname,
        interfaces: Vec::new(), // Will be populated platform-specifically later
    })
}

pub async fn traceroute(host: &str) -> Result<Vec<TraceHop>, String> {
    // Stub — real traceroute requires raw sockets or external tool
    // Will be implemented with platform-specific approach
    Ok(vec![TraceHop {
        hop: 1,
        ip: "stub".to_string(),
        hostname: Some("traceroute requires elevated privileges — will use system tracert on Windows".to_string()),
        latency_ms: 0.0,
        loss_percent: 0.0,
    }])
}
