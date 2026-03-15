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
  const results: PingResult[] = [];
  for (let seq = 0; seq < count; seq++) {
    const start = performance.now();
    try {
      // Use a no-cors fetch as a timing probe — we don't need the response
      await fetch(`https://${host}`, { mode: "no-cors", cache: "no-store" });
      const elapsed = performance.now() - start;
      results.push({ seq, host, latency_ms: elapsed, success: true, error: null });
    } catch {
      const elapsed = performance.now() - start;
      // Connection refused still gives us timing
      results.push({ seq, host, latency_ms: elapsed, success: true, error: null });
    }
    if (seq < count - 1) await new Promise((r) => setTimeout(r, 300));
  }
  return results;
}

// ── Ping All PoPs (browser — measure fetch timing to relay IPs) ──

async function pingAllPopsBrowser(): Promise<Array<[string, number]>> {
  const config = await fetchSDRConfigBrowser();
  const results: Array<[string, number]> = [];

  // Ping concurrently, limited batch
  const popsWithRelays = config.pops.filter((p) => p.relays.length > 0);
  const batchSize = 10;

  for (let i = 0; i < popsWithRelays.length; i += batchSize) {
    const batch = popsWithRelays.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(async (pop) => {
        const ip = pop.relays[0].ipv4;
        const start = performance.now();
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 2000);
          await fetch(`https://${ip}`, {
            mode: "no-cors",
            cache: "no-store",
            signal: controller.signal,
          });
          clearTimeout(timeout);
          return [pop.code, performance.now() - start] as [string, number];
        } catch {
          const elapsed = performance.now() - start;
          // If we got a quick refusal, the host is reachable
          if (elapsed < 1900) {
            return [pop.code, elapsed] as [string, number];
          }
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

interface SystemOptStatus {
  nagle_disabled: boolean | null;
  network_throttling_disabled: boolean | null;
  tcp_autotuning: string | null;
  ecn_capability: string | null;
  firewall_cs2_rules: boolean;
  adapter_name: string | null;
  adapter_speed: string | null;
}

interface OptimizationResult {
  action: string;
  success: boolean;
  message: string;
}

function scanSystemBrowser(): SystemOptStatus {
  return {
    nagle_disabled: null,
    network_throttling_disabled: null,
    tcp_autotuning: "(requires Windows desktop app)",
    ecn_capability: null,
    firewall_cs2_rules: false,
    adapter_name: "(browser preview)",
    adapter_speed: null,
  };
}

function applyOptimizationBrowser(action: string): OptimizationResult {
  return {
    action,
    success: false,
    message: "Optimizations require the Windows desktop app (.exe). This is a web preview.",
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

    case "vpn_activate":
    case "vpn_deactivate":
      return vpnStubResult() as unknown as Promise<T>;

    case "vpn_list_profiles":
      return [] as unknown as Promise<T>;

    case "vpn_get_valve_ips":
      return "155.133.224.0/19, 162.254.192.0/21, 208.64.200.0/21, 185.25.180.0/22, 192.69.96.0/22, 205.196.6.0/24, 103.10.124.0/23, 103.28.54.0/23, 146.66.152.0/21, 208.78.164.0/22" as unknown as Promise<T>;

    default:
      throw new Error(`Unknown command: ${cmd} (running in browser mode)`);
  }
}
