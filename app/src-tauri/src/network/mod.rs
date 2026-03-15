mod sdr;
mod ping;
mod diagnostics;
mod optimizer;
mod vpn;
mod deploy;

pub use sdr::{SDRConfig, fetch_sdr_config};
pub use ping::{PingResult, ping_host, ping_all_pops};
pub use diagnostics::{TraceHop, NetworkInfo, traceroute, resolve_dns, get_network_info};
pub use optimizer::{SystemOptStatus, OptimizationResult, scan_system, apply_optimization};
pub use vpn::{VpnProfile, VpnStatus, VpnActionResult, get_valve_allowed_ips, generate_keypair, generate_config, get_vpn_status, activate_vpn, deactivate_vpn, list_profiles};
pub use deploy::{VpsCredentials, TestConnectionResult, DeployResult, test_connection, deploy_wireguard};
