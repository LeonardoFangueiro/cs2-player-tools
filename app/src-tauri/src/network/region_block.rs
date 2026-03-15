use serde::{Deserialize, Serialize};

#[cfg(target_os = "windows")]
use std::process::Command;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RegionBlockResult {
    pub success: bool,
    pub message: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BlockedRegion {
    pub pop_code: String,
    pub blocked: bool,
}

/// Block a Valve PoP by adding firewall rules to drop its relay IPs
pub fn block_pop(pop_code: String, relay_ips: Vec<String>) -> RegionBlockResult {
    // Validate pop_code: only allow alphanumeric 2-6 chars
    if !pop_code.chars().all(|c| c.is_alphanumeric()) || pop_code.len() > 6 || pop_code.is_empty() {
        return RegionBlockResult { success: false, message: "Invalid PoP code".into() };
    }
    // Validate IPs
    for ip in &relay_ips {
        if !ip.chars().all(|c| c.is_ascii_digit() || c == '.') {
            return RegionBlockResult { success: false, message: format!("Invalid IP: {}", ip) };
        }
    }

    #[cfg(target_os = "windows")]
    {
        let rule_name = format!("CS2PT Block - {}", pop_code.to_uppercase());

        // Remove existing rule first
        let _ = Command::new("netsh")
            .args(["advfirewall", "firewall", "delete", "rule", &format!("name={}", rule_name)])
            .output();

        // Create block rule for all relay IPs
        let ips_str = relay_ips.join(",");
        if ips_str.is_empty() {
            return RegionBlockResult { success: false, message: "No relay IPs to block".into() };
        }

        let result = Command::new("netsh")
            .args([
                "advfirewall", "firewall", "add", "rule",
                &format!("name={}", rule_name),
                "dir=out", "action=block",
                &format!("remoteip={}", ips_str),
                "protocol=UDP", "enable=yes",
            ])
            .output();

        match result {
            Ok(out) if out.status.success() => {
                RegionBlockResult { success: true, message: format!("Blocked {} ({} IPs)", pop_code, relay_ips.len()) }
            }
            Ok(out) => {
                RegionBlockResult { success: false, message: String::from_utf8_lossy(&out.stderr).trim().to_string() }
            }
            Err(e) => {
                RegionBlockResult { success: false, message: format!("Failed: {}", e) }
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = (pop_code, relay_ips);
        RegionBlockResult { success: false, message: "Region blocking requires Windows".into() }
    }
}

/// Unblock a previously blocked PoP
pub fn unblock_pop(pop_code: String) -> RegionBlockResult {
    #[cfg(target_os = "windows")]
    {
        let rule_name = format!("CS2PT Block - {}", pop_code.to_uppercase());
        let result = Command::new("netsh")
            .args(["advfirewall", "firewall", "delete", "rule", &format!("name={}", rule_name)])
            .output();

        match result {
            Ok(out) if out.status.success() => {
                RegionBlockResult { success: true, message: format!("Unblocked {}", pop_code) }
            }
            _ => {
                RegionBlockResult { success: false, message: format!("No block rule found for {}", pop_code) }
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = pop_code;
        RegionBlockResult { success: false, message: "Region blocking requires Windows".into() }
    }
}

/// List all blocked PoPs (CS2PT Block rules)
pub fn list_blocked_pops() -> Vec<String> {
    #[cfg(target_os = "windows")]
    {
        let output = Command::new("powershell")
            .args(["-NoProfile", "-Command",
                r#"Get-NetFirewallRule | Where-Object { $_.DisplayName -like 'CS2PT Block -*' } | ForEach-Object { $_.DisplayName -replace 'CS2PT Block - ', '' }"#
            ])
            .output()
            .ok();

        output.map(|o| {
            String::from_utf8_lossy(&o.stdout)
                .lines()
                .filter(|l| !l.trim().is_empty())
                .map(|l| l.trim().to_lowercase().to_string())
                .collect()
        }).unwrap_or_default()
    }

    #[cfg(not(target_os = "windows"))]
    { Vec::new() }
}
