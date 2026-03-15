use serde::{Deserialize, Serialize};
use std::process::Command;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SystemOptStatus {
    pub nagle_disabled: Option<bool>,
    pub network_throttling_disabled: Option<bool>,
    pub tcp_autotuning: Option<String>,
    pub ecn_capability: Option<String>,
    pub firewall_cs2_rules: bool,
    pub adapter_name: Option<String>,
    pub adapter_speed: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OptimizationResult {
    pub action: String,
    pub success: bool,
    pub message: String,
}

pub fn scan_system() -> Result<SystemOptStatus, String> {
    #[cfg(target_os = "windows")]
    return scan_system_windows();

    #[cfg(not(target_os = "windows"))]
    return Ok(SystemOptStatus {
        nagle_disabled: None,
        network_throttling_disabled: None,
        tcp_autotuning: Some("(Linux — not applicable)".to_string()),
        ecn_capability: None,
        firewall_cs2_rules: false,
        adapter_name: Some("(Linux dev environment)".to_string()),
        adapter_speed: None,
    });
}

#[cfg(target_os = "windows")]
fn scan_system_windows() -> Result<SystemOptStatus, String> {
    // Check TCP auto-tuning
    let tcp_autotuning = Command::new("powershell")
        .args(["-Command", "(Get-NetTCPSetting | Select-Object -First 1).AutoTuningLevelLocal"])
        .output()
        .ok()
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string());

    // Check ECN
    let ecn = Command::new("powershell")
        .args(["-Command", "(Get-NetTCPSetting | Select-Object -First 1).EcnCapability"])
        .output()
        .ok()
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string());

    // Check NetworkThrottlingIndex
    let throttling = Command::new("reg")
        .args(["query", r"HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile", "/v", "NetworkThrottlingIndex"])
        .output()
        .ok()
        .map(|o| {
            let out = String::from_utf8_lossy(&o.stdout);
            out.contains("0xffffffff")
        });

    // Check CS2 firewall rules
    let fw_rules = Command::new("powershell")
        .args(["-Command", "(Get-NetFirewallRule | Where-Object { $_.DisplayName -like '*cs2*' -or $_.DisplayName -like '*Counter-Strike*' }).Count"])
        .output()
        .ok()
        .and_then(|o| String::from_utf8_lossy(&o.stdout).trim().parse::<u32>().ok())
        .unwrap_or(0);

    // Get adapter info
    let adapter = Command::new("powershell")
        .args(["-Command", "(Get-NetAdapter | Where-Object { $_.Status -eq 'Up' } | Select-Object -First 1).Name"])
        .output()
        .ok()
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .filter(|s| !s.is_empty());

    let speed = Command::new("powershell")
        .args(["-Command", "(Get-NetAdapter | Where-Object { $_.Status -eq 'Up' } | Select-Object -First 1).LinkSpeed"])
        .output()
        .ok()
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .filter(|s| !s.is_empty());

    Ok(SystemOptStatus {
        nagle_disabled: None, // Would need to check per-interface registry
        network_throttling_disabled: throttling,
        tcp_autotuning,
        ecn_capability: ecn,
        firewall_cs2_rules: fw_rules > 0,
        adapter_name: adapter,
        adapter_speed: speed,
    })
}

pub fn apply_optimization(action: &str) -> Result<OptimizationResult, String> {
    #[cfg(target_os = "windows")]
    return apply_optimization_windows(action);

    #[cfg(not(target_os = "windows"))]
    return Ok(OptimizationResult {
        action: action.to_string(),
        success: false,
        message: "Windows-only optimization. Build for Windows to use.".to_string(),
    });
}

#[cfg(target_os = "windows")]
fn apply_optimization_windows(action: &str) -> Result<OptimizationResult, String> {
    match action {
        "disable_nagle" => {
            // This requires finding the active adapter GUID and setting registry keys
            let result = Command::new("powershell")
                .args(["-Command", r#"
                    $adapters = Get-NetAdapter | Where-Object { $_.Status -eq 'Up' }
                    foreach ($adapter in $adapters) {
                        $guid = $adapter.InterfaceGuid
                        $path = "HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters\Interfaces\$guid"
                        Set-ItemProperty -Path $path -Name 'TcpAckFrequency' -Value 1 -Type DWord -Force
                        Set-ItemProperty -Path $path -Name 'TCPNoDelay' -Value 1 -Type DWord -Force
                    }
                    Write-Output "OK"
                "#])
                .output()
                .map_err(|e| e.to_string())?;
            Ok(OptimizationResult {
                action: action.to_string(),
                success: result.status.success(),
                message: String::from_utf8_lossy(&result.stdout).trim().to_string(),
            })
        },
        "disable_throttling" => {
            let result = Command::new("reg")
                .args(["add", r"HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile",
                       "/v", "NetworkThrottlingIndex", "/t", "REG_DWORD", "/d", "0xffffffff", "/f"])
                .output()
                .map_err(|e| e.to_string())?;
            let result2 = Command::new("reg")
                .args(["add", r"HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile",
                       "/v", "SystemResponsiveness", "/t", "REG_DWORD", "/d", "0", "/f"])
                .output()
                .map_err(|e| e.to_string())?;
            Ok(OptimizationResult {
                action: action.to_string(),
                success: result.status.success() && result2.status.success(),
                message: "NetworkThrottlingIndex and SystemResponsiveness set".to_string(),
            })
        },
        "disable_tcp_autotuning" => {
            let result = Command::new("netsh")
                .args(["interface", "tcp", "set", "global", "autotuninglevel=disabled"])
                .output()
                .map_err(|e| e.to_string())?;
            Ok(OptimizationResult {
                action: action.to_string(),
                success: result.status.success(),
                message: String::from_utf8_lossy(&result.stdout).trim().to_string(),
            })
        },
        "disable_ecn" => {
            let result = Command::new("netsh")
                .args(["interface", "tcp", "set", "global", "ecncapability=disabled"])
                .output()
                .map_err(|e| e.to_string())?;
            Ok(OptimizationResult {
                action: action.to_string(),
                success: result.status.success(),
                message: String::from_utf8_lossy(&result.stdout).trim().to_string(),
            })
        },
        "add_cs2_firewall" => {
            let cs2_path = r"C:\Program Files (x86)\Steam\steamapps\common\Counter-Strike Global Offensive\game\bin\win64\cs2.exe";
            let r1 = Command::new("netsh")
                .args(["advfirewall", "firewall", "add", "rule",
                       "name=CS2 Player Tools - CS2 UDP In", "dir=in", "action=allow",
                       &format!("program={}", cs2_path), "protocol=UDP"])
                .output()
                .map_err(|e| e.to_string())?;
            let r2 = Command::new("netsh")
                .args(["advfirewall", "firewall", "add", "rule",
                       "name=CS2 Player Tools - CS2 TCP In", "dir=in", "action=allow",
                       &format!("program={}", cs2_path), "protocol=TCP"])
                .output()
                .map_err(|e| e.to_string())?;
            Ok(OptimizationResult {
                action: action.to_string(),
                success: r1.status.success() && r2.status.success(),
                message: "Firewall rules added for cs2.exe".to_string(),
            })
        },
        "gaming_mmcss" => {
            let cmds = vec![
                ("GPU Priority", "8"),
                ("Priority", "6"),
                ("Scheduling Category", "High"),
            ];
            let mut all_ok = true;
            for (name, val) in &cmds {
                let r = Command::new("reg")
                    .args(["add", r"HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile\Tasks\Games",
                           "/v", name, "/t", "REG_DWORD", "/d", val, "/f"])
                    .output();
                if let Ok(o) = r { if !o.status.success() { all_ok = false; } } else { all_ok = false; }
            }
            // SFIO Priority is REG_SZ
            let r = Command::new("reg")
                .args(["add", r"HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile\Tasks\Games",
                       "/v", "SFIO Priority", "/t", "REG_SZ", "/d", "High", "/f"])
                .output();
            if let Ok(o) = r { if !o.status.success() { all_ok = false; } } else { all_ok = false; }

            Ok(OptimizationResult {
                action: action.to_string(),
                success: all_ok,
                message: "MMCSS Gaming priority set".to_string(),
            })
        },
        "dscp_qos" => {
            // Create QoS policy for CS2
            let result = Command::new("powershell")
                .args(["-Command", r#"
                    New-NetQosPolicy -Name "CS2 Gaming" -AppPathNameMatchCondition "cs2.exe" -IPProtocolMatchCondition UDP -DSCPAction 46 -NetworkProfile All -PolicyStore ActiveStore -ErrorAction SilentlyContinue
                    Write-Output "OK"
                "#])
                .output()
                .map_err(|e| e.to_string())?;
            Ok(OptimizationResult {
                action: action.to_string(),
                success: result.status.success(),
                message: "DSCP 46 (EF) QoS policy set for cs2.exe UDP".to_string(),
            })
        },
        _ => Ok(OptimizationResult {
            action: action.to_string(),
            success: false,
            message: format!("Unknown action: {}", action),
        }),
    }
}
