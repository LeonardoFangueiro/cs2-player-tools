use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PopRelay {
    pub ipv4: String,
    pub port_range: Vec<u16>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ValvePoP {
    pub code: String,
    pub desc: String,
    pub geo: Vec<f64>,
    pub relays: Vec<PopRelay>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SDRConfig {
    pub revision: u64,
    pub pops: Vec<ValvePoP>,
}

pub async fn fetch_sdr_config() -> Result<SDRConfig, String> {
    let url = "https://api.steampowered.com/ISteamApps/GetSDRConfig/v1/?appid=730";

    let resp = reqwest::get(url)
        .await
        .map_err(|e| format!("Failed to fetch SDR config: {}", e))?;

    let json: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse SDR config: {}", e))?;

    let revision = json.get("revision")
        .and_then(|v| v.as_u64())
        .unwrap_or(0);

    let mut pops = Vec::new();

    if let Some(pops_obj) = json.get("pops").and_then(|v| v.as_object()) {
        for (code, pop_data) in pops_obj {
            let desc = pop_data.get("desc")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();

            let geo = pop_data.get("geo")
                .and_then(|v| v.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_f64())
                        .collect::<Vec<f64>>()
                })
                .unwrap_or_default();

            let relays = pop_data.get("relays")
                .and_then(|v| v.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|r| {
                            let ipv4 = r.get("ipv4")?.as_str()?.to_string();
                            let port_range = r.get("port_range")
                                .and_then(|v| v.as_array())
                                .map(|ports| {
                                    ports.iter()
                                        .filter_map(|p| p.as_u64().map(|v| v as u16))
                                        .collect()
                                })
                                .unwrap_or_default();
                            Some(PopRelay { ipv4, port_range })
                        })
                        .collect()
                })
                .unwrap_or_default();

            pops.push(ValvePoP {
                code: code.clone(),
                desc,
                geo,
                relays,
            });
        }
    }

    // Sort by code
    pops.sort_by(|a, b| a.code.cmp(&b.code));

    Ok(SDRConfig { revision, pops })
}
