/**
 * Tauri invoke wrapper with browser fallbacks.
 * When running inside Tauri webview, calls the real Rust backend.
 * When running in a regular browser (web preview), uses HTTP/mock fallbacks.
 */

const isTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

let tauriInvoke: ((cmd: string, args?: Record<string, unknown>) => Promise<unknown>) | null = null;

async function getTauriInvoke() {
  if (tauriInvoke) return tauriInvoke;
  if (isTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    tauriInvoke = invoke;
    return tauriInvoke;
  }
  return null;
}

// ── SDR Config (works in browser via direct API call) ──

interface PopRelay {
  ipv4: string;
  port_range: number[];
}

interface ValvePoP {
  code: string;
  desc: string;
  geo: number[];
  relays: PopRelay[];
}

interface SDRConfig {
  revision: number;
  pops: ValvePoP[];
}

async function fetchSDRConfigBrowser(): Promise<SDRConfig> {
  const resp = await fetch(
    "https://api.steampowered.com/ISteamApps/GetSDRConfig/v1/?appid=730"
  );
  const json = await resp.json();

  const revision = json.revision ?? 0;
  const pops: ValvePoP[] = [];

  if (json.pops) {
    for (const [code, popData] of Object.entries(json.pops) as [string, any][]) {
      const desc = popData.desc ?? "";
      const geo = popData.geo ?? [];
      const relays: PopRelay[] = (popData.relays ?? []).map((r: any) => ({
        ipv4: r.ipv4 ?? "",
        port_range: r.port_range ?? [],
      }));
      pops.push({ code, desc, geo, relays });
    }
  }

  pops.sort((a, b) => a.code.localeCompare(b.code));
  return { revision, pops };
}

// ── DNS Resolution (browser fallback via DNS-over-HTTPS) ──

async function resolveDNSBrowser(hostname: string): Promise<string[]> {
  try {
    const resp = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(hostname)}&type=A`,
      { headers: { Accept: "application/dns-json" } }
    );
    const json = await resp.json();
    return (json.Answer ?? [])
      .filter((a: any) => a.type === 1)
      .map((a: any) => a.data);
  } catch {
    return [`(DNS-over-HTTPS failed for ${hostname})`];
  }
}

// ── Network Info (browser stub) ──

interface NetworkInfo {
  hostname: string;
  dns_servers: string[];
  default_gateway: string | null;
}

function getNetworkInfoBrowser(): NetworkInfo {
  return {
    hostname: window.location.hostname || "browser",
    dns_servers: ["(not available in browser)"],
    default_gateway: "(not available in browser)",
  };
}

// ── Ping (browser fallback — timing fetch requests) ──

interface PingResult {
  seq: number;
  host: string;
  latency_ms: number;
  success: boolean;
  error: string | null;
}

async function pingHostBrowser(host: string, count: number): Promise<PingResult[]> {
  // Browser cannot do real ICMP/TCP pings to arbitrary IPs.
  // We use an Image load timing trick which works cross-origin.
  const results: PingResult[] = [];
  for (let seq = 0; seq < count; seq++) {
    const start = performance.now();
    try {
      await new Promise<void>((resolve, reject) => {
        const img = new Image();
        const timeout = setTimeout(() => { img.src = ""; reject(new Error("Timeout")); }, 3000);
        img.onload = img.onerror = () => { clearTimeout(timeout); resolve(); };
        img.src = `http://${host}:27015/?_=${Date.now()}_${seq}`;
      });
      const elapsed = performance.now() - start;
      // onerror fires quickly if host is reachable (connection refused = reachable)
      results.push({ seq, host, latency_ms: elapsed, success: true, error: null });
    } catch {
      results.push({ seq, host, latency_ms: 3000, success: false, error: "Timeout" });
    }
    if (seq < count - 1) await new Promise((r) => setTimeout(r, 300));
  }
  return results;
}

// ── Ping All PoPs (browser — measure fetch timing to relay IPs) ──

async function pingAllPopsBrowser(): Promise<Array<[string, number]>> {
  const config = await fetchSDRConfigBrowser();
  const results: Array<[string, number]> = [];

  // Browser ping via Image load timing — works cross-origin
  const popsWithRelays = config.pops.filter((p) => p.relays.length > 0);
  const batchSize = 15;

  for (let i = 0; i < popsWithRelays.length; i += batchSize) {
    const batch = popsWithRelays.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(async (pop) => {
        const ip = pop.relays[0].ipv4;
        const port = pop.relays[0].port_range?.[0] ?? 27015;
        const start = performance.now();
        try {
          await new Promise<void>((resolve, reject) => {
            const img = new Image();
            const timeout = setTimeout(() => { img.src = ""; reject(new Error("Timeout")); }, 2000);
            img.onload = img.onerror = () => { clearTimeout(timeout); resolve(); };
            img.src = `http://${ip}:${port}/?_=${Date.now()}`;
          });
          return [pop.code, performance.now() - start] as [string, number];
        } catch {
          return [pop.code, -1] as [string, number];
        }
      })
    );
    results.push(...batchResults);
  }

  results.sort((a, b) => {
    if (a[1] < 0 && b[1] < 0) return 0;
    if (a[1] < 0) return 1;
    if (b[1] < 0) return -1;
    return a[1] - b[1];
  });

  return results;
}

// ── Traceroute (browser stub) ──

interface TraceHop {
  hop: number;
  ip: string;
  hostname: string | null;
  latency_ms: number;
  loss_percent: number;
}

function tracerouteBrowser(): TraceHop[] {
  return [
    {
      hop: 1,
      ip: "(browser)",
      hostname: "Traceroute requires the Tauri desktop app (raw socket access)",
      latency_ms: -1,
      loss_percent: 0,
    },
  ];
}

// ── Optimizer (browser stubs) ──

function scanSystemBrowser() {
  const stub = { current_value: "(Web preview — run .exe on Windows)", is_optimized: false };
  return {
    is_admin: false,
    nagle: stub,
    throttling: stub,
    autotuning: stub,
    ecn: stub,
    firewall: stub,
    mmcss: stub,
    dscp: stub,
    adapter_name: "(browser preview)",
    adapter_speed: null,
    cs2_path: null,
  };
}

function applyOptimizationBrowser(action: string) {
  return {
    action,
    success: false,
    message: "Optimizations require the Windows desktop app (.exe). This is a web preview.",
    previous_value: null,
    requires_reboot: false,
  };
}

// ── VPN (browser stubs) ──

interface VpnActionResult {
  success: boolean;
  message: string;
}

function vpnStubResult(): VpnActionResult {
  return {
    success: false,
    message: "VPN management requires the Windows desktop app (.exe). This is a web preview.",
  };
}

// ── Main invoke wrapper ──

export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  // Try real Tauri first
  const tauriInv = await getTauriInvoke();
  if (tauriInv) {
    return tauriInv(cmd, args) as Promise<T>;
  }

  // Browser fallbacks
  switch (cmd) {
    case "fetch_sdr_config":
      return fetchSDRConfigBrowser() as Promise<T>;

    case "ping_host":
      return pingHostBrowser(
        (args?.host as string) ?? "1.1.1.1",
        (args?.count as number) ?? 5
      ) as Promise<T>;

    case "ping_all_pops":
      return pingAllPopsBrowser() as Promise<T>;

    case "traceroute":
      return tracerouteBrowser() as unknown as Promise<T>;

    case "resolve_dns":
      return resolveDNSBrowser((args?.hostname as string) ?? "") as Promise<T>;

    case "get_network_info":
      return getNetworkInfoBrowser() as unknown as Promise<T>;

    case "scan_system":
      return scanSystemBrowser() as unknown as Promise<T>;

    case "apply_optimization":
      return applyOptimizationBrowser(
        (args?.action as string) ?? ""
      ) as unknown as Promise<T>;

    case "vpn_generate_keypair":
      return ["(requires desktop app)", "(requires desktop app)"] as unknown as Promise<T>;

    case "vpn_generate_config":
      return "[Interface]\n# Requires the Windows desktop app\n" as unknown as Promise<T>;

    case "vpn_get_status":
      return {
        active: false,
        profile_name: null,
        endpoint: null,
        transfer_rx: null,
        transfer_tx: null,
        latest_handshake: null,
        error: "VPN requires desktop app",
      } as unknown as Promise<T>;

    case "vps_test_connection":
      return {
        success: false,
        message: "VPS SSH connection requires the desktop app (.exe). This is a web preview.",
      } as unknown as Promise<T>;

    case "vps_deploy_wireguard":
      return {
        success: false,
        message: "WireGuard deployment requires the desktop app (.exe). This is a web preview.",
        server_public_key: "",
        client_private_key: "",
        client_public_key: "",
        endpoint: "",
        client_address: "",
        log: [],
      } as unknown as Promise<T>;

    case "vpn_activate":
    case "vpn_deactivate":
      return vpnStubResult() as unknown as Promise<T>;

    case "vpn_list_profiles":
      return [] as unknown as Promise<T>;

    case "vpn_get_valve_ips":
      return "155.133.224.0/19, 162.254.192.0/21, 208.64.200.0/21, 185.25.180.0/22, 192.69.96.0/22, 205.196.6.0/24, 103.10.124.0/23, 103.28.54.0/23, 146.66.152.0/21, 208.78.164.0/22" as unknown as Promise<T>;

    case "check_cs2":
      return { running: false, pid: null } as unknown as Promise<T>;

    case "block_server_region":
      return { success: false, message: "Region blocking requires the Windows desktop app." } as unknown as Promise<T>;

    case "unblock_server_region":
      return { success: false, message: "Region blocking requires the Windows desktop app." } as unknown as Promise<T>;

    case "list_blocked_regions":
      return [] as unknown as Promise<T>;

    case "get_settings":
      return {
        auto_connect_vpn: false,
        vpn_profile_name: null,
        max_ping: 70,
        auto_start_with_windows: false,
        minimize_to_tray: true,
        check_cs2_interval_secs: 5,
        dynamic_valve_ips: true,
      } as unknown as Promise<T>;

    case "save_app_settings":
      return undefined as unknown as Promise<T>;

    case "check_wireguard":
      return {
        available: false,
        wg_path: null,
        wireguard_path: null,
        source: "browser_preview",
      } as unknown as Promise<T>;

    case "get_dynamic_valve_ips":
      try {
        const resp = await fetch("https://api.steampowered.com/ISteamApps/GetSDRConfig/v1/?appid=730");
        const json = await resp.json();
        const ips = new Set<string>();
        if (json.pops) {
          for (const pop of Object.values(json.pops) as any[]) {
            for (const relay of (pop.relays ?? [])) {
              if (relay.ipv4) ips.add(relay.ipv4 + "/32");
            }
          }
        }
        return Array.from(ips).sort().join(", ") as unknown as Promise<T>;
      } catch {
        return "155.133.224.0/19, 162.254.192.0/21, 208.64.200.0/21, 185.25.180.0/22" as unknown as Promise<T>;
      }

    default:
      throw new Error(`Unknown command: ${cmd} (running in browser mode)`);
  }
}
