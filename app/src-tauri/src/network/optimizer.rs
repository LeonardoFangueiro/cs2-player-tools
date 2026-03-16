use serde::{Deserialize, Serialize};


// ── Data Structures ──

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SystemOptStatus {
    pub is_admin: bool,
    pub nagle: OptItemStatus,
    pub throttling: OptItemStatus,
    pub autotuning: OptItemStatus,
    pub ecn: OptItemStatus,
    pub firewall: OptItemStatus,
    pub mmcss: OptItemStatus,
    pub dscp: OptItemStatus,
    pub adapter_name: Option<String>,
    pub adapter_speed: Option<String>,
    pub cs2_path: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OptItemStatus {
    pub current_value: String,
    pub is_optimized: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OptimizationResult {
    pub action: String,
    pub success: bool,
    pub message: String,
    pub previous_value: Option<String>,
    pub requires_reboot: bool,
}

// ── Scan ──

pub fn scan_system() -> Result<SystemOptStatus, String> {
    #[cfg(target_os = "windows")]
    return scan_system_windows();

    #[cfg(not(target_os = "windows"))]
    return Ok(SystemOptStatus {
        is_admin: false,
        nagle: OptItemStatus { current_value: "(Linux — run on Windows)".into(), is_optimized: false },
        throttling: OptItemStatus { current_value: "(Linux — run on Windows)".into(), is_optimized: false },
        autotuning: OptItemStatus { current_value: "(Linux — run on Windows)".into(), is_optimized: false },
        ecn: OptItemStatus { current_value: "(Linux — run on Windows)".into(), is_optimized: false },
        firewall: OptItemStatus { current_value: "(Linux — run on Windows)".into(), is_optimized: false },
        mmcss: OptItemStatus { current_value: "(Linux — run on Windows)".into(), is_optimized: false },
        dscp: OptItemStatus { current_value: "(Linux — run on Windows)".into(), is_optimized: false },
        adapter_name: Some("(Linux dev environment)".into()),
        adapter_speed: None,
        cs2_path: None,
    });
}

#[cfg(target_os = "windows")]
fn scan_system_windows() -> Result<SystemOptStatus, String> {
    let is_admin = check_admin();

    // ── Nagle: Check TcpNoDelay on active adapters ──
    let nagle = {
        let out = run_ps(r#"
            $found = $false; $optimized = $true
            Get-NetAdapter | Where-Object { $_.Status -eq 'Up' } | ForEach-Object {
                $guid = $_.InterfaceGuid
                $path = "HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters\Interfaces\$guid"
                $noDelay = (Get-ItemProperty -Path $path -Name 'TCPNoDelay' -ErrorAction SilentlyContinue).TCPNoDelay
                $ackFreq = (Get-ItemProperty -Path $path -Name 'TcpAckFrequency' -ErrorAction SilentlyContinue).TcpAckFrequency
                $found = $true
                if ($noDelay -ne 1 -or $ackFreq -ne 1) { $optimized = $false }
            }
            if (-not $found) { Write-Output "No active adapters" }
            elseif ($optimized) { Write-Output "Disabled (TcpNoDelay=1, TcpAckFrequency=1)" }
            else { Write-Output "Enabled (default — not optimized)" }
        "#);
        let val = out.trim().to_string();
        let is_opt = val.contains("Disabled");
        OptItemStatus { current_value: val, is_optimized: is_opt }
    };

    // ── Network Throttling: Check NetworkThrottlingIndex ──
    let throttling = {
        let out = run_cmd("reg", &[
            "query",
            r"HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile",
            "/v", "NetworkThrottlingIndex",
        ]);
        let is_opt = out.contains("0xffffffff");
        let val = if is_opt {
            "Disabled (0xFFFFFFFF)".to_string()
        } else if out.contains("0x") {
            let hex = out.split("0x").nth(1).unwrap_or("?").split_whitespace().next().unwrap_or("?");
            format!("Throttled (0x{}) — not optimized", hex)
        } else {
            "Default (10 packets/ms throttle)".to_string()
        };
        OptItemStatus { current_value: val, is_optimized: is_opt }
    };

    // ── TCP Auto-tuning ──
    let autotuning = {
        let out = run_cmd("netsh", &["interface", "tcp", "show", "global"]);
        let level = out.lines()
            .find(|l| l.to_lowercase().contains("auto-tuning"))
            .and_then(|l| l.split(':').nth(1))
            .map(|s| s.trim().to_string())
            .unwrap_or_else(|| "Unknown".to_string());
        let is_opt = level.to_lowercase().contains("disabled");
        OptItemStatus { current_value: level, is_optimized: is_opt }
    };

    // ── ECN ──
    let ecn = {
        let out = run_cmd("netsh", &["interface", "tcp", "show", "global"]);
        let val = out.lines()
            .find(|l| l.to_lowercase().contains("ecn"))
            .and_then(|l| l.split(':').nth(1))
            .map(|s| s.trim().to_string())
            .unwrap_or_else(|| "Unknown".to_string());
        let is_opt = val.to_lowercase().contains("disabled");
        OptItemStatus { current_value: val, is_optimized: is_opt }
    };

    // ── CS2 Firewall Rules ──
    let (firewall, cs2_path) = {
        let path = detect_cs2_path();
        let out = run_ps(r#"
            $rules = Get-NetFirewallRule -ErrorAction SilentlyContinue | Where-Object {
                $_.DisplayName -like '*CS2*' -or $_.DisplayName -like '*Counter-Strike*' -or $_.DisplayName -like '*cs2.exe*'
            }
            if ($rules) { Write-Output ("Found " + $rules.Count + " rules") } else { Write-Output "No rules found" }
        "#);
        let is_opt = out.contains("Found") && !out.contains("0 rules");
        (
            OptItemStatus { current_value: out.trim().to_string(), is_optimized: is_opt },
            path,
        )
    };

    // ── MMCSS Gaming Priority ──
    let mmcss = {
        let out = run_cmd("reg", &[
            "query",
            r"HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile\Tasks\Games",
        ]);
        let has_priority = out.contains("Priority") && out.contains("0x6");
        let has_sched = out.contains("Scheduling Category") && out.contains("High");
        if has_priority && has_sched {
            OptItemStatus { current_value: "Configured (Priority=6, High)".into(), is_optimized: true }
        } else if out.contains("ERROR") || out.is_empty() {
            OptItemStatus { current_value: "Games task not found (default)".into(), is_optimized: false }
        } else {
            OptItemStatus { current_value: "Partially configured".into(), is_optimized: false }
        }
    };

    // ── DSCP QoS ──
    let dscp = {
        let out = run_ps(r#"
            $policy = Get-NetQosPolicy -ErrorAction SilentlyContinue | Where-Object { $_.Name -like '*CS2*' }
            if ($policy) { Write-Output ("Active: DSCP " + $policy.DSCPAction) } else { Write-Output "No CS2 QoS policy" }
        "#);
        let is_opt = out.contains("Active");
        OptItemStatus { current_value: out.trim().to_string(), is_optimized: is_opt }
    };

    // ── Adapter Info ──
    let adapter_name = run_ps(r#"(Get-NetAdapter | Where-Object { $_.Status -eq 'Up' } | Select-Object -First 1).Name"#);
    let adapter_speed = run_ps(r#"(Get-NetAdapter | Where-Object { $_.Status -eq 'Up' } | Select-Object -First 1).LinkSpeed"#);

    Ok(SystemOptStatus {
        is_admin,
        nagle,
        throttling,
        autotuning,
        ecn,
        firewall,
        mmcss,
        dscp,
        adapter_name: Some(adapter_name.trim().to_string()).filter(|s| !s.is_empty()),
        adapter_speed: Some(adapter_speed.trim().to_string()).filter(|s| !s.is_empty()),
        cs2_path,
    })
}

// ── Apply Optimizations ──

pub fn apply_optimization(action: &str) -> Result<OptimizationResult, String> {
    #[cfg(target_os = "windows")]
    return apply_optimization_windows(action);

    #[cfg(not(target_os = "windows"))]
    return Ok(OptimizationResult {
        action: action.to_string(),
        success: false,
        message: "Windows-only optimization. Build the .exe to use this feature.".to_string(),
        previous_value: None,
        requires_reboot: false,
    });
}

#[cfg(target_os = "windows")]
fn apply_optimization_windows(action: &str) -> Result<OptimizationResult, String> {
    if !check_admin() {
        return Ok(OptimizationResult {
            action: action.to_string(),
            success: false,
            message: "Administrator privileges required. Right-click the app and select 'Run as administrator'.".to_string(),
            previous_value: None,
            requires_reboot: false,
        });
    }

    match action {
        "disable_nagle" => {
            // Save current state, then apply
            let prev = run_ps(r#"
                Get-NetAdapter | Where-Object { $_.Status -eq 'Up' } | ForEach-Object {
                    $guid = $_.InterfaceGuid
                    $path = "HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters\Interfaces\$guid"
                    $nd = (Get-ItemProperty -Path $path -Name 'TCPNoDelay' -ErrorAction SilentlyContinue).TCPNoDelay
                    $af = (Get-ItemProperty -Path $path -Name 'TcpAckFrequency' -ErrorAction SilentlyContinue).TcpAckFrequency
                    Write-Output "$($_.Name): TCPNoDelay=$nd, TcpAckFrequency=$af"
                }
            "#);

            let result = run_ps(r#"
                $success = $true
                Get-NetAdapter | Where-Object { $_.Status -eq 'Up' } | ForEach-Object {
                    $guid = $_.InterfaceGuid
                    $path = "HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters\Interfaces\$guid"
                    try {
                        Set-ItemProperty -Path $path -Name 'TcpAckFrequency' -Value 1 -Type DWord -Force
                        Set-ItemProperty -Path $path -Name 'TCPNoDelay' -Value 1 -Type DWord -Force
                    } catch { $success = $false }
                }
                if ($success) { Write-Output "OK" } else { Write-Output "FAIL" }
            "#);

            Ok(OptimizationResult {
                action: action.to_string(),
                success: result.trim() == "OK",
                message: if result.trim() == "OK" {
                    "Nagle's algorithm disabled on all active adapters. Takes effect immediately for new connections.".to_string()
                } else {
                    "Failed to set registry values. Ensure you're running as administrator.".to_string()
                },
                previous_value: Some(prev.trim().to_string()),
                requires_reboot: false,
            })
        },

        "disable_throttling" => {
            // Read current value
            let prev_out = run_cmd("reg", &[
                "query",
                r"HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile",
                "/v", "NetworkThrottlingIndex",
            ]);
            let prev_val = prev_out.lines()
                .find(|l| l.contains("0x"))
                .map(|l| l.trim().to_string())
                .unwrap_or_else(|| "default (0xa)".to_string());

            // Apply: NetworkThrottlingIndex = 0xFFFFFFFF (disabled)
            let (r1, r1_text) = run_cmd_checked("reg", &[
                "add", r"HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile",
                "/v", "NetworkThrottlingIndex", "/t", "REG_DWORD", "/d", "4294967295", "/f",
            ]);
            // Apply: SystemResponsiveness = 0 (max resources to foreground)
            let (r2, r2_text) = run_cmd_checked("reg", &[
                "add", r"HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile",
                "/v", "SystemResponsiveness", "/t", "REG_DWORD", "/d", "0", "/f",
            ]);

            let success = r1 && r2;
            Ok(OptimizationResult {
                action: action.to_string(),
                success,
                message: if success {
                    "Network throttling disabled. SystemResponsiveness set to 0 (max foreground priority).".to_string()
                } else {
                    format!("Failed: {} | {}", r1_text.trim(), r2_text.trim())
                },
                previous_value: Some(prev_val),
                requires_reboot: true,
            })
        },

        "disable_tcp_autotuning" => {
            // Read current
            let prev = run_cmd("netsh", &["interface", "tcp", "show", "global"]);
            let prev_level = prev.lines()
                .find(|l| l.to_lowercase().contains("auto-tuning"))
                .and_then(|l| l.split(':').nth(1))
                .map(|s| s.trim().to_string())
                .unwrap_or_default();

            let result = run_cmd("netsh", &[
                "interface", "tcp", "set", "global", "autotuninglevel=disabled",
            ]);

            let success = result.to_lowercase().contains("ok") || result.trim().is_empty();
            Ok(OptimizationResult {
                action: action.to_string(),
                success,
                message: if success {
                    "TCP auto-tuning disabled. WARNING: This may reduce TCP download speeds (Steam, browser). CS2 uses UDP so game performance is unaffected. Revert with: netsh interface tcp set global autotuninglevel=normal".to_string()
                } else {
                    format!("Failed: {}", result.trim())
                },
                previous_value: Some(prev_level),
                requires_reboot: false,
            })
        },

        "disable_ecn" => {
            let prev = run_cmd("netsh", &["interface", "tcp", "show", "global"]);
            let prev_ecn = prev.lines()
                .find(|l| l.to_lowercase().contains("ecn"))
                .and_then(|l| l.split(':').nth(1))
                .map(|s| s.trim().to_string())
                .unwrap_or_default();

            let result = run_cmd("netsh", &[
                "interface", "tcp", "set", "global", "ecncapability=disabled",
            ]);

            let success = result.to_lowercase().contains("ok") || result.trim().is_empty();
            Ok(OptimizationResult {
                action: action.to_string(),
                success,
                message: if success {
                    "ECN disabled. Prevents packet drops with routers that don't support ECN properly.".to_string()
                } else {
                    format!("Failed: {}", result.trim())
                },
                previous_value: Some(prev_ecn),
                requires_reboot: false,
            })
        },

        "add_cs2_firewall" => {
            let cs2_path = detect_cs2_path()
                .unwrap_or_else(|| r"C:\Program Files (x86)\Steam\steamapps\common\Counter-Strike Global Offensive\game\bin\win64\cs2.exe".to_string());

            if !std::path::Path::new(&cs2_path).exists() {
                return Ok(OptimizationResult {
                    action: action.to_string(),
                    success: false,
                    message: format!("CS2 not found at: {}. Please verify your Steam installation path.", cs2_path),
                    previous_value: None,
                    requires_reboot: false,
                });
            }

            // Remove existing rules first to avoid duplicates
            let _ = run_cmd("netsh", &[
                "advfirewall", "firewall", "delete", "rule",
                "name=CS2 Player Tools - CS2 UDP",
            ]);
            let _ = run_cmd("netsh", &[
                "advfirewall", "firewall", "delete", "rule",
                "name=CS2 Player Tools - CS2 TCP",
            ]);

            // Add inbound + outbound UDP
            let (r1, r1_text) = run_cmd_checked("netsh", &[
                "advfirewall", "firewall", "add", "rule",
                "name=CS2 Player Tools - CS2 UDP", "dir=in", "action=allow",
                &format!("program={}", cs2_path), "protocol=UDP", "enable=yes",
            ]);
            let (r2, r2_text) = run_cmd_checked("netsh", &[
                "advfirewall", "firewall", "add", "rule",
                "name=CS2 Player Tools - CS2 TCP", "dir=in", "action=allow",
                &format!("program={}", cs2_path), "protocol=TCP", "enable=yes",
            ]);

            let success = r1 && r2;
            Ok(OptimizationResult {
                action: action.to_string(),
                success,
                message: if success {
                    format!("Firewall rules added for: {}", cs2_path)
                } else {
                    format!("Failed: {} | {}", r1_text.trim(), r2_text.trim())
                },
                previous_value: None,
                requires_reboot: false,
            })
        },

        "gaming_mmcss" => {
            let key_path = r"HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile\Tasks\Games";

            // First ensure the Games key exists
            let (key_ok, _) = run_cmd_checked("reg", &["add", key_path, "/f"]);

            // DWORD values
            let (r1, _) = run_cmd_checked("reg", &["add", key_path, "/v", "GPU Priority", "/t", "REG_DWORD", "/d", "8", "/f"]);
            let (r2, _) = run_cmd_checked("reg", &["add", key_path, "/v", "Priority", "/t", "REG_DWORD", "/d", "6", "/f"]);

            // REG_SZ values (strings — NOT DWORD!)
            let (r3, _) = run_cmd_checked("reg", &["add", key_path, "/v", "Scheduling Category", "/t", "REG_SZ", "/d", "High", "/f"]);
            let (r4, _) = run_cmd_checked("reg", &["add", key_path, "/v", "SFIO Priority", "/t", "REG_SZ", "/d", "High", "/f"]);

            let success = r1 && r2 && r3 && r4;

            Ok(OptimizationResult {
                action: action.to_string(),
                success,
                message: if success {
                    "MMCSS Gaming priority configured: GPU Priority=8, Priority=6, Scheduling=High, SFIO=High".to_string()
                } else if !key_ok {
                    "Failed to create Games registry key. Run as administrator.".to_string()
                } else {
                    "Some MMCSS values failed to set. Check Windows permissions.".to_string()
                },
                previous_value: None,
                requires_reboot: true,
            })
        },

        "dscp_qos" => {
            // Remove old policy first
            let _ = run_ps(r#"Remove-NetQosPolicy -Name "CS2 Gaming" -Confirm:$false -ErrorAction SilentlyContinue"#);

            let result = run_ps(r#"
                try {
                    New-NetQosPolicy -Name "CS2 Gaming" -AppPathNameMatchCondition "cs2.exe" -IPProtocolMatchCondition UDP -DSCPAction 46 -NetworkProfile All -Confirm:$false
                    Write-Output "OK"
                } catch {
                    Write-Output "FAIL: $_"
                }
            "#);

            let success = result.trim().starts_with("OK") || result.contains("CS2 Gaming");
            Ok(OptimizationResult {
                action: action.to_string(),
                success,
                message: if success {
                    "DSCP 46 (Expedited Forwarding) QoS policy created for cs2.exe UDP. Note: Only effective if your router respects DSCP markings. Persists across reboots.".to_string()
                } else {
                    format!("Failed to create QoS policy: {}", result.trim())
                },
                previous_value: None,
                requires_reboot: false,
            })
        },

        // ══════ REVERT ACTIONS ══════

        "revert_nagle" => {
            let result = run_ps(r#"
                Get-NetAdapter | Where-Object { $_.Status -eq 'Up' } | ForEach-Object {
                    $guid = $_.InterfaceGuid
                    $path = "HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters\Interfaces\$guid"
                    Remove-ItemProperty -Path $path -Name 'TcpAckFrequency' -ErrorAction SilentlyContinue
                    Remove-ItemProperty -Path $path -Name 'TCPNoDelay' -ErrorAction SilentlyContinue
                }
                Write-Output "OK"
            "#);
            Ok(OptimizationResult {
                action: action.to_string(),
                success: result.trim().contains("OK"),
                message: "Nagle's algorithm restored to default.".to_string(),
                previous_value: None,
                requires_reboot: false,
            })
        },

        "revert_throttling" => {
            let (r1, _) = run_cmd_checked("reg", &[
                "add", r"HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile",
                "/v", "NetworkThrottlingIndex", "/t", "REG_DWORD", "/d", "10", "/f",
            ]);
            let (r2, _) = run_cmd_checked("reg", &[
                "add", r"HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile",
                "/v", "SystemResponsiveness", "/t", "REG_DWORD", "/d", "20", "/f",
            ]);
            Ok(OptimizationResult {
                action: action.to_string(),
                success: r1 && r2,
                message: "Network throttling restored to defaults (index=10, responsiveness=20).".to_string(),
                previous_value: None,
                requires_reboot: true,
            })
        },

        "revert_autotuning" => {
            let (success, _) = run_cmd_checked("netsh", &["interface", "tcp", "set", "global", "autotuninglevel=normal"]);
            Ok(OptimizationResult {
                action: action.to_string(),
                success,
                message: "TCP auto-tuning restored to normal.".to_string(),
                previous_value: None,
                requires_reboot: false,
            })
        },

        "revert_ecn" => {
            let (success, _) = run_cmd_checked("netsh", &["interface", "tcp", "set", "global", "ecncapability=default"]);
            Ok(OptimizationResult {
                action: action.to_string(),
                success,
                message: "ECN restored to default.".to_string(),
                previous_value: None,
                requires_reboot: false,
            })
        },

        "revert_firewall" => {
            let (r1, _) = run_cmd_checked("netsh", &[
                "advfirewall", "firewall", "delete", "rule", "name=CS2 Player Tools - CS2 UDP",
            ]);
            let (r2, _) = run_cmd_checked("netsh", &[
                "advfirewall", "firewall", "delete", "rule", "name=CS2 Player Tools - CS2 TCP",
            ]);
            Ok(OptimizationResult {
                action: action.to_string(),
                success: r1 || r2,
                message: "CS2 firewall rules removed.".to_string(),
                previous_value: None,
                requires_reboot: false,
            })
        },

        "revert_mmcss" => {
            let key_path = r"HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile\Tasks\Games";
            // Reset to Windows defaults
            let (r1, _) = run_cmd_checked("reg", &["add", key_path, "/v", "GPU Priority", "/t", "REG_DWORD", "/d", "1", "/f"]);
            let (r2, _) = run_cmd_checked("reg", &["add", key_path, "/v", "Priority", "/t", "REG_DWORD", "/d", "2", "/f"]);
            let (r3, _) = run_cmd_checked("reg", &["add", key_path, "/v", "Scheduling Category", "/t", "REG_SZ", "/d", "Medium", "/f"]);
            let (r4, _) = run_cmd_checked("reg", &["add", key_path, "/v", "SFIO Priority", "/t", "REG_SZ", "/d", "Normal", "/f"]);
            Ok(OptimizationResult {
                action: action.to_string(),
                success: r1 && r2 && r3 && r4,
                message: "MMCSS gaming priority restored to defaults.".to_string(),
                previous_value: None,
                requires_reboot: true,
            })
        },

        "revert_dscp" => {
            let _ = run_ps(r#"Remove-NetQosPolicy -Name "CS2 Gaming" -Confirm:$false -ErrorAction SilentlyContinue"#);
            Ok(OptimizationResult {
                action: action.to_string(),
                success: true,
                message: "DSCP QoS policy removed.".to_string(),
                previous_value: None,
                requires_reboot: false,
            })
        },

        _ => Ok(OptimizationResult {
            action: action.to_string(),
            success: false,
            message: format!("Unknown action: {}", action),
            previous_value: None,
            requires_reboot: false,
        }),
    }
}

// ── Helper functions (Windows only) ──

#[cfg(target_os = "windows")]
fn check_admin() -> bool {
    super::cmd::hidden("net")
        .args(["session"])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

#[cfg(target_os = "windows")]
fn run_ps(script: &str) -> String {
    super::cmd::hidden("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", script])
        .output()
        .map(|o| {
            let stdout = String::from_utf8_lossy(&o.stdout).to_string();
            if stdout.trim().is_empty() {
                String::from_utf8_lossy(&o.stderr).to_string()
            } else {
                stdout
            }
        })
        .unwrap_or_else(|e| format!("PowerShell error: {}", e))
}

/// Run a command and return (success, output_text)
#[cfg(target_os = "windows")]
fn run_cmd_checked(program: &str, args: &[&str]) -> (bool, String) {
    super::cmd::hidden(program)
        .args(args)
        .output()
        .map(|o| {
            let stdout = String::from_utf8_lossy(&o.stdout).to_string();
            let stderr = String::from_utf8_lossy(&o.stderr).to_string();
            let text = if stdout.trim().is_empty() { stderr } else { stdout };
            (o.status.success(), text)
        })
        .unwrap_or_else(|e| (false, format!("Error: {}", e)))
}

/// Legacy wrapper for backwards compat — returns just the text
#[cfg(target_os = "windows")]
fn run_cmd(program: &str, args: &[&str]) -> String {
    run_cmd_checked(program, args).1
}

#[cfg(target_os = "windows")]
fn detect_cs2_path() -> Option<String> {
    // Try common Steam install locations
    let candidates = [
        r"C:\Program Files (x86)\Steam\steamapps\common\Counter-Strike Global Offensive\game\bin\win64\cs2.exe",
        r"C:\Program Files\Steam\steamapps\common\Counter-Strike Global Offensive\game\bin\win64\cs2.exe",
        r"D:\Steam\steamapps\common\Counter-Strike Global Offensive\game\bin\win64\cs2.exe",
        r"D:\SteamLibrary\steamapps\common\Counter-Strike Global Offensive\game\bin\win64\cs2.exe",
        r"E:\SteamLibrary\steamapps\common\Counter-Strike Global Offensive\game\bin\win64\cs2.exe",
    ];

    for path in &candidates {
        if std::path::Path::new(path).exists() {
            return Some(path.to_string());
        }
    }

    // Try reading Steam's libraryfolders.vdf to find custom install locations
    let steam_cfg = r"C:\Program Files (x86)\Steam\steamapps\libraryfolders.vdf";
    if let Ok(content) = std::fs::read_to_string(steam_cfg) {
        for line in content.lines() {
            let trimmed = line.trim().trim_matches('"');
            if trimmed.contains(":\\") || trimmed.contains(":/") {
                let candidate = format!(
                    "{}\\steamapps\\common\\Counter-Strike Global Offensive\\game\\bin\\win64\\cs2.exe",
                    trimmed.trim_matches('"').replace("\\\\", "\\")
                );
                if std::path::Path::new(&candidate).exists() {
                    return Some(candidate);
                }
            }
        }
    }

    None
}

#[cfg(not(target_os = "windows"))]
#[allow(dead_code)]
fn detect_cs2_path() -> Option<String> {
    None
}
