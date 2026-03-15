mod network;

use network::{SDRConfig, PingResult, VpnProfile, TestConnectionResult, DeployResult, BufferBloatResult, MtuResult, Cs2Config, Cs2ConfigResult, SessionRecord, ConnectionHistory};

use tauri::{
    menu::{Menu, MenuItem},
    tray::{TrayIconBuilder, TrayIconEvent, MouseButton, MouseButtonState},
    Manager,
};

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

#[tauri::command]
fn vpn_load_profile(profile_name: String) -> Result<network::VpnProfile, String> {
    network::load_profile(&profile_name)
}

#[tauri::command]
fn vpn_reconnect(profile_name: String) -> Result<network::VpnActionResult, String> {
    let profile = network::load_profile(&profile_name)?;
    network::activate_vpn(&profile)
}

#[tauri::command]
fn vpn_delete_profile(profile_name: String) -> Result<(), String> {
    network::delete_profile(&profile_name)
}

#[tauri::command]
fn vpn_save_profile(profile: network::VpnProfile) -> Result<(), String> {
    // Save both the .conf and .json meta
    let config_content = network::generate_config(&profile);
    let config_dir = std::path::PathBuf::from(
        {
            #[cfg(target_os = "windows")]
            { r"C:\CS2PlayerTools\vpn" }
            #[cfg(not(target_os = "windows"))]
            {
                &format!("{}/cs2-player-tools/vpn", std::env::var("HOME").unwrap_or("/tmp".into()))
            }
        }
    );
    std::fs::create_dir_all(&config_dir).map_err(|e| e.to_string())?;
    std::fs::write(config_dir.join(format!("{}.conf", profile.name)), &config_content).map_err(|e| e.to_string())?;
    network::save_profile_meta(&profile)
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

// Advanced Diagnostics
#[tauri::command]
async fn test_buffer_bloat(target_host: String) -> Result<network::BufferBloatResult, String> {
    network::test_buffer_bloat(target_host).await
}

#[tauri::command]
async fn detect_mtu(host: String) -> Result<network::MtuResult, String> {
    network::detect_mtu(host).await
}

// CS2 Config
#[tauri::command]
fn scan_cs2_config() -> network::Cs2Config {
    network::scan_cs2_config()
}

#[tauri::command]
fn apply_cs2_config(settings: Vec<(String, String)>) -> network::Cs2ConfigResult {
    network::apply_cs2_config(settings)
}

#[tauri::command]
fn get_launch_options() -> Vec<(String, String)> {
    network::get_launch_options()
}

// Connection History
#[tauri::command]
fn load_connection_history() -> network::ConnectionHistory {
    network::load_history()
}

#[tauri::command]
fn save_connection_session(record: network::SessionRecord) -> Result<(), String> {
    network::save_session(record)
}

#[tauri::command]
fn clear_connection_history() -> Result<(), String> {
    network::clear_history()
}

#[tauri::command]
fn export_all_data() -> Result<String, String> {
    network::export_all()
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
        .setup(|app| {
            // System tray
            let show = MenuItem::with_id(app, "show", "Open CS2 Player Tools", true, None::<&str>)?;
            let vpn_connect = MenuItem::with_id(app, "vpn_connect", "Connect VPN", true, None::<&str>)?;
            let vpn_disconnect = MenuItem::with_id(app, "vpn_disconnect", "Disconnect VPN", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

            let menu = Menu::with_items(app, &[&show, &vpn_connect, &vpn_disconnect, &quit])?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .tooltip("CS2 Player Tools")
                .on_menu_event(move |app, event| {
                    match event.id.as_ref() {
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
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
            vpn_load_profile,
            vpn_reconnect,
            vpn_delete_profile,
            vpn_save_profile,
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
            test_buffer_bloat,
            detect_mtu,
            scan_cs2_config,
            apply_cs2_config,
            get_launch_options,
            load_connection_history,
            save_connection_session,
            clear_connection_history,
            export_all_data,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
