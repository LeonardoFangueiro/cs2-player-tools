use serde::{Deserialize, Serialize};
use std::time::{Duration, Instant};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BufferBloatResult {
    pub idle_ping_ms: f64,
    pub loaded_ping_ms: f64,
    pub bloat_ms: f64,
    pub grade: String, // A, B, C, D, F
    pub message: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MtuResult {
    pub optimal_mtu: u16,
    pub tested_host: String,
    pub message: String,
}

/// Test for buffer bloat by measuring ping during idle and then during a download
pub async fn test_buffer_bloat(target_host: String) -> Result<BufferBloatResult, String> {
    // Step 1: Measure idle ping (5 samples)
    let idle_pings = measure_tcp_ping(&target_host, 5).await?;
    let idle_avg = idle_pings.iter().sum::<f64>() / idle_pings.len() as f64;

    // Step 2: Start a background download and measure ping simultaneously
    // We use a simple approach: fetch a large file while pinging
    let download_task = tokio::spawn(async {
        // Download something to generate load — must actually consume the body
        for _ in 0..4 {
            if let Ok(resp) = reqwest::get("https://speed.cloudflare.com/__down?bytes=5000000").await {
                let _ = resp.bytes().await; // Actually consume the body
            }
        }
    });

    // Small delay to let download start
    tokio::time::sleep(Duration::from_millis(500)).await;

    // Step 3: Measure ping under load
    let loaded_pings = measure_tcp_ping(&target_host, 5).await?;
    let loaded_avg = loaded_pings.iter().sum::<f64>() / loaded_pings.len() as f64;

    // Wait for download to finish
    let _ = download_task.await;

    let bloat = loaded_avg - idle_avg;
    let grade = if bloat < 5.0 {
        "A"
    } else if bloat < 30.0 {
        "B"
    } else if bloat < 60.0 {
        "C"
    } else if bloat < 200.0 {
        "D"
    } else {
        "F"
    };

    let message = match grade {
        "A" => "Excellent! No significant buffer bloat detected.",
        "B" => "Good. Minor buffer bloat — acceptable for gaming.",
        "C" => "Fair. Noticeable buffer bloat — may cause occasional latency spikes in CS2.",
        "D" => "Poor. Significant buffer bloat — will cause latency issues. Enable SQM/fq_codel on your router.",
        _ => "Very Poor. Severe buffer bloat — gaming will be heavily impacted. You need SQM/fq_codel or a better router.",
    };

    Ok(BufferBloatResult {
        idle_ping_ms: (idle_avg * 10.0).round() / 10.0,
        loaded_ping_ms: (loaded_avg * 10.0).round() / 10.0,
        bloat_ms: (bloat * 10.0).round() / 10.0,
        grade: grade.to_string(),
        message: message.to_string(),
    })
}

async fn measure_tcp_ping(host: &str, count: usize) -> Result<Vec<f64>, String> {
    let target = if host.contains(':') {
        host.to_string()
    } else {
        format!("{}:80", host)
    };
    let mut results = Vec::new();

    for _ in 0..count {
        let t = target.clone();
        let start = Instant::now();
        match tokio::time::timeout(Duration::from_secs(3), tokio::net::TcpStream::connect(&t))
            .await
        {
            Ok(Ok(_)) => results.push(start.elapsed().as_secs_f64() * 1000.0),
            Ok(Err(e)) => {
                if e.kind() == std::io::ErrorKind::ConnectionRefused {
                    results.push(start.elapsed().as_secs_f64() * 1000.0);
                }
            }
            Err(_) => {} // timeout, skip
        }
        tokio::time::sleep(Duration::from_millis(200)).await;
    }

    if results.is_empty() {
        return Err(format!("Could not reach {}", host));
    }
    Ok(results)
}

/// Detect optimal MTU via binary search with ping -f
pub async fn detect_mtu(host: String) -> Result<MtuResult, String> {
    tokio::task::spawn_blocking(move || {
        let mut low: u16 = 1200;
        let mut high: u16 = 1500;
        let mut best: u16 = 1400;

        while low <= high {
            let mid = (low + high) / 2;
            let payload = mid - 28; // IP(20) + ICMP(8) headers

            #[cfg(target_os = "windows")]
            let success = {
                let out = super::cmd::hidden("ping")
                    .args([
                        "-f",
                        "-l",
                        &payload.to_string(),
                        "-n",
                        "1",
                        "-w",
                        "2000",
                        &host,
                    ])
                    .output()
                    .ok();
                out.map_or(false, |o| {
                    o.status.success()
                        && !String::from_utf8_lossy(&o.stdout).contains("fragmented")
                })
            };

            #[cfg(not(target_os = "windows"))]
            let success = {
                let out = super::cmd::hidden("ping")
                    .args([
                        "-M",
                        "do",
                        "-s",
                        &payload.to_string(),
                        "-c",
                        "1",
                        "-W",
                        "2",
                        &host,
                    ])
                    .output()
                    .ok();
                out.map_or(false, |o| o.status.success())
            };

            if success {
                best = mid;
                low = mid + 1;
            } else {
                high = mid - 1;
            }
        }

        Ok(MtuResult {
            optimal_mtu: best,
            tested_host: host.clone(),
            message: format!(
                "Optimal MTU: {} bytes. For WireGuard, use {} (subtract 80 for WG overhead).",
                best,
                best.saturating_sub(80)
            ),
        })
    })
    .await
    .map_err(|e| e.to_string())?
}
