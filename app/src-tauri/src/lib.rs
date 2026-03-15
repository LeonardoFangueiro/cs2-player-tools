mod network;

use network::{SDRConfig, PingResult};

#[tauri::command]
async fn fetch_sdr_config() -> Result<SDRConfig, String> {
    network::fetch_sdr_config().await
}

#[tauri::command]
async fn ping_host(host: String, count: u32) -> Result<Vec<PingResult>, String> {
    network::ping_host(&host, count).await
}

#[tauri::command]
async fn ping_all_pops() -> Result<Vec<(String, f64)>, String> {
    network::ping_all_pops().await
}

#[tauri::command]
async fn traceroute(host: String) -> Result<Vec<network::TraceHop>, String> {
    network::traceroute(&host).await
}

#[tauri::command]
fn resolve_dns(hostname: String) -> Result<Vec<String>, String> {
    network::resolve_dns(&hostname)
}

#[tauri::command]
fn get_network_info() -> Result<network::NetworkInfo, String> {
    network::get_network_info()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            fetch_sdr_config,
            ping_host,
            ping_all_pops,
            traceroute,
            resolve_dns,
            get_network_info,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
