mod network;

use network::{SDRConfig, PingResult, VpnProfile, TestConnectionResult, DeployResult};

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

// Optimizer commands
#[tauri::command]
fn scan_system() -> Result<network::SystemOptStatus, String> {
    network::scan_system()
}

#[tauri::command]
fn apply_optimization(action: String) -> Result<network::OptimizationResult, String> {
    network::apply_optimization(&action)
}

// VPN commands
#[tauri::command]
fn vpn_generate_keypair() -> Result<(String, String), String> {
    network::generate_keypair()
}

#[tauri::command]
fn vpn_generate_config(profile: VpnProfile) -> String {
    network::generate_config(&profile)
}

#[tauri::command]
fn vpn_get_status(profile_name: String) -> network::VpnStatus {
    network::get_vpn_status(&profile_name)
}

#[tauri::command]
fn vpn_activate(profile: VpnProfile) -> Result<network::VpnActionResult, String> {
    network::activate_vpn(&profile)
}

#[tauri::command]
fn vpn_deactivate(profile_name: String) -> Result<network::VpnActionResult, String> {
    network::deactivate_vpn(&profile_name)
}

#[tauri::command]
fn vpn_list_profiles() -> Result<Vec<String>, String> {
    network::list_profiles()
}

#[tauri::command]
fn vpn_get_valve_ips() -> String {
    network::get_valve_allowed_ips()
}

// CS2 Process Detection
#[tauri::command]
fn check_cs2() -> network::Cs2Status {
    network::check_cs2_running()
}

// Region Blocking commands
#[tauri::command]
fn block_server_region(pop_code: String, relay_ips: Vec<String>) -> network::RegionBlockResult {
    network::block_pop(pop_code, relay_ips)
}

#[tauri::command]
fn unblock_server_region(pop_code: String) -> network::RegionBlockResult {
    network::unblock_pop(pop_code)
}

#[tauri::command]
fn list_blocked_regions() -> Vec<String> {
    network::list_blocked_pops()
}

// Settings commands
#[tauri::command]
fn get_settings() -> network::AppSettings {
    network::load_settings()
}

#[tauri::command]
fn save_app_settings(settings: network::AppSettings) -> Result<(), String> {
    network::save_settings(&settings)
}

// Dynamic Valve IPs
#[tauri::command]
async fn get_dynamic_valve_ips() -> Result<String, String> {
    let url = "https://api.steampowered.com/ISteamApps/GetSDRConfig/v1/?appid=730";
    let resp = reqwest::get(url).await.map_err(|e| e.to_string())?;
    let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    Ok(network::get_valve_ips_from_config(&json))
}

// WireGuard availability check
#[tauri::command]
fn check_wireguard() -> network::WireGuardStatus {
    network::check_wireguard_available()
}

// VPS Deploy commands
#[tauri::command]
async fn vps_test_connection(
    host: String,
    port: u16,
    username: String,
    auth_method: String,
    password: Option<String>,
    private_key: Option<String>,
) -> Result<TestConnectionResult, String> {
    let creds = network::VpsCredentials {
        host, port, username, auth_method, password, private_key,
    };
    network::test_connection(creds).await
}

#[tauri::command]
async fn vps_deploy_wireguard(
    host: String,
    port: u16,
    username: String,
    auth_method: String,
    password: Option<String>,
    private_key: Option<String>,
    client_address: String,
) -> Result<DeployResult, String> {
    let creds = network::VpsCredentials {
        host, port, username, auth_method, password, private_key,
    };
    network::deploy_wireguard(creds, client_address).await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .invoke_handler(tauri::generate_handler![
            fetch_sdr_config,
            ping_host,
            ping_all_pops,
            traceroute,
            resolve_dns,
            get_network_info,
            scan_system,
            apply_optimization,
            vpn_generate_keypair,
            vpn_generate_config,
            vpn_get_status,
            vpn_activate,
            vpn_deactivate,
            vpn_list_profiles,
            vpn_get_valve_ips,
            vps_test_connection,
            vps_deploy_wireguard,
            check_cs2,
            block_server_region,
            unblock_server_region,
            list_blocked_regions,
            get_settings,
            save_app_settings,
            get_dynamic_valve_ips,
            check_wireguard,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
