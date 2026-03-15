use serde::{Deserialize, Serialize};
use std::net::{TcpStream, ToSocketAddrs};
use std::time::{Duration, Instant};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PingResult {
    pub seq: u32,
    pub host: String,
    pub latency_ms: f64,
    pub success: bool,
    pub error: Option<String>,
}

pub async fn ping_host(host: &str, count: u32) -> Result<Vec<PingResult>, String> {
    let mut results = Vec::new();

    for seq in 0..count {
        let result = tcp_ping(host, seq).await;
        results.push(result);
        if seq < count - 1 {
            tokio::time::sleep(Duration::from_millis(500)).await;
        }
    }

    Ok(results)
}

async fn tcp_ping(host: &str, seq: u32) -> PingResult {
    let target = if host.contains(':') {
        host.to_string()
    } else {
        format!("{}:27015", host)
    };

    let start = Instant::now();

    match tokio::time::timeout(Duration::from_secs(3), async {
        tokio::net::TcpStream::connect(&target).await
    }).await {
        Ok(Ok(_)) => PingResult {
            seq,
            host: host.to_string(),
            latency_ms: start.elapsed().as_secs_f64() * 1000.0,
            success: true,
            error: None,
        },
        Ok(Err(e)) => {
            // Connection refused still means the host is reachable
            let elapsed = start.elapsed().as_secs_f64() * 1000.0;
            if e.kind() == std::io::ErrorKind::ConnectionRefused {
                PingResult {
                    seq,
                    host: host.to_string(),
                    latency_ms: elapsed,
                    success: true,
                    error: None,
                }
            } else {
                PingResult {
                    seq,
                    host: host.to_string(),
                    latency_ms: elapsed,
                    success: false,
                    error: Some(e.to_string()),
                }
            }
        },
        Err(_) => PingResult {
            seq,
            host: host.to_string(),
            latency_ms: 3000.0,
            success: false,
            error: Some("Timeout".to_string()),
        },
    }
}

pub async fn ping_all_pops() -> Result<Vec<(String, f64)>, String> {
    let config = super::sdr::fetch_sdr_config().await?;
    let mut results = Vec::new();

    // Ping first relay of each PoP concurrently
    let mut handles = Vec::new();

    for pop in &config.pops {
        if let Some(relay) = pop.relays.first() {
            let code = pop.code.clone();
            let ip = relay.ipv4.clone();
            let port = relay.port_range.first().copied().unwrap_or(27015);

            handles.push(tokio::spawn(async move {
                let target = format!("{}:{}", ip, port);
                let start = Instant::now();

                match tokio::time::timeout(Duration::from_secs(2), async {
                    tokio::net::TcpStream::connect(&target).await
                }).await {
                    Ok(Ok(_)) => (code, start.elapsed().as_secs_f64() * 1000.0),
                    Ok(Err(e)) => {
                        if e.kind() == std::io::ErrorKind::ConnectionRefused {
                            (code, start.elapsed().as_secs_f64() * 1000.0)
                        } else {
                            (code, -1.0)
                        }
                    },
                    Err(_) => (code, -1.0),
                }
            }));
        }
    }

    for handle in handles {
        if let Ok(result) = handle.await {
            results.push(result);
        }
    }

    results.sort_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal));

    Ok(results)
}
