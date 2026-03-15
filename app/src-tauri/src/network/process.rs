use serde::{Deserialize, Serialize};


#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Cs2Status {
    pub running: bool,
    pub pid: Option<u32>,
}

pub fn check_cs2_running() -> Cs2Status {
    #[cfg(target_os = "windows")]
    {
        let output = super::cmd::hidden("tasklist")
            .args(["/FI", "IMAGENAME eq cs2.exe", "/FO", "CSV", "/NH"])
            .output()
            .ok();

        if let Some(out) = output {
            let stdout = String::from_utf8_lossy(&out.stdout);
            if stdout.contains("cs2.exe") {
                // Parse PID from CSV: "cs2.exe","1234","Console","1","500,000 K"
                let pid = stdout.split(',')
                    .nth(1)
                    .and_then(|s| s.trim_matches('"').parse::<u32>().ok());
                return Cs2Status { running: true, pid };
            }
        }
        Cs2Status { running: false, pid: None }
    }

    #[cfg(not(target_os = "windows"))]
    {
        let output = super::cmd::hidden("pgrep").args(["-x", "cs2"]).output().ok();
        if let Some(out) = output {
            if out.status.success() {
                let pid = String::from_utf8_lossy(&out.stdout)
                    .trim().lines().next()
                    .and_then(|s| s.parse::<u32>().ok());
                return Cs2Status { running: true, pid };
            }
        }
        Cs2Status { running: false, pid: None }
    }
}
