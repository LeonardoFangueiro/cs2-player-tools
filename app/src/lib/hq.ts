/**
 * HQ (Headquarters) client — communicates with the CS2 Player Tools backend
 * at cs2-player-tools.maltinha.club/api/
 */

// Full URL required here because the Tauri app runs locally (localhost),
// so relative paths would not reach the remote HQ backend.
const HQ_BASE = "https://cs2-player-tools.maltinha.club/api";
import { getTopDCs } from "./valve";

const APP_VERSION = "0.1.0";

/** Get stored auth token */
export function getToken(): string {
  return localStorage.getItem("cs2pt_token") || "";
}

function getOS(): string {
  const ua = navigator.userAgent;
  if (ua.includes("Windows")) return "Windows";
  if (ua.includes("Mac")) return "macOS";
  if (ua.includes("Linux")) return "Linux";
  return "Unknown";
}

/** Report an error to HQ */
export async function reportError(
  errorType: string,
  errorMessage: string,
  context?: Record<string, unknown>
): Promise<void> {
  try {
    await fetch(`${HQ_BASE}/errors`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        app_version: APP_VERSION,
        os: getOS(),
        error_type: errorType,
        error_message: errorMessage,
        context: context ?? {},
        timestamp: new Date().toISOString(),
      }),
    });
  } catch {
    // Silently fail — don't let HQ reporting break the app
  }
}

/** Send telemetry event */
export async function sendTelemetry(
  event: string,
  data?: Record<string, unknown>
): Promise<void> {
  try {
    await fetch(`${HQ_BASE}/telemetry`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        app_version: APP_VERSION,
        os: getOS(),
        event,
        data: data ?? {},
      }),
    });
  } catch {
    // Silent
  }
}

/** Run diagnostics and send to HQ (dev mode) */
export async function runAndReportDiagnostics(
  invoke: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>
): Promise<{ success: boolean; results: Record<string, unknown>; reportId?: string }> {
  const results: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    app_version: APP_VERSION,
    os: getOS(),
    user_agent: navigator.userAgent,
    tests: {} as Record<string, unknown>,
  };

  const tests: Record<string, unknown> = {};

  // Test 1: SDR Config fetch
  try {
    const t0 = performance.now();
    const config = await invoke<{ revision: number; pops: unknown[] }>("fetch_sdr_config");
    tests["sdr_config"] = {
      status: "pass",
      time_ms: Math.round(performance.now() - t0),
      revision: config.revision,
      pop_count: config.pops.length,
    };
  } catch (e) {
    tests["sdr_config"] = { status: "fail", error: String(e) };
  }

  // Test 2: DNS Resolution
  try {
    const t0 = performance.now();
    const ips = await invoke<string[]>("resolve_dns", { hostname: "steamcommunity.com" });
    tests["dns"] = { status: "pass", time_ms: Math.round(performance.now() - t0), ips };
  } catch (e) {
    tests["dns"] = { status: "fail", error: String(e) };
  }

  // Test 3: Network Info
  try {
    const info = await invoke<Record<string, unknown>>("get_network_info");
    tests["network_info"] = { status: "pass", ...info };
  } catch (e) {
    tests["network_info"] = { status: "fail", error: String(e) };
  }

  // Test 4: CS2 Detection
  try {
    const cs2 = await invoke<{ running: boolean; pid: number | null }>("check_cs2");
    tests["cs2_detection"] = { status: "pass", ...cs2 };
  } catch (e) {
    tests["cs2_detection"] = { status: "fail", error: String(e) };
  }

  // Test 5: WireGuard availability
  try {
    const wg = await invoke<Record<string, unknown>>("check_wireguard");
    tests["wireguard"] = { status: "pass", ...wg };
  } catch (e) {
    tests["wireguard"] = { status: "fail", error: String(e) };
  }

  // Test 6: System scan (optimizer)
  try {
    const scan = await invoke<Record<string, unknown>>("scan_system");
    tests["system_scan"] = { status: "pass", is_admin: (scan as any).is_admin };
  } catch (e) {
    tests["system_scan"] = { status: "fail", error: String(e) };
  }

  // Test 7: Settings load
  try {
    const settings = await invoke<Record<string, unknown>>("get_settings");
    tests["settings"] = { status: "pass", ...settings };
  } catch (e) {
    tests["settings"] = { status: "fail", error: String(e) };
  }

  // Test 8: Ping nearest PoP (quick — just first 3)
  try {
    const t0 = performance.now();
    const pings = await invoke<Array<[string, number]>>("ping_all_pops");
    const reachable = pings.filter(([, ms]) => ms > 0);
    tests["ping_pops"] = {
      status: "pass",
      time_ms: Math.round(performance.now() - t0),
      total: pings.length,
      reachable: reachable.length,
      best: reachable[0] || null,
    };
  } catch (e) {
    tests["ping_pops"] = { status: "fail", error: String(e) };
  }

  // Test 9: Buffer Bloat
  try {
    const t0 = performance.now();
    const bloat = await invoke<{ grade: string; idle_ping_ms: number; loaded_ping_ms: number; bloat_ms: number }>("test_buffer_bloat", { targetHost: "1.1.1.1" });
    tests["buffer_bloat"] = { status: "pass", time_ms: Math.round(performance.now() - t0), ...bloat };
  } catch (e) {
    tests["buffer_bloat"] = { status: "fail", error: String(e) };
  }

  // Test 10: MTU Detection
  try {
    const mtu = await invoke<{ optimal_mtu: number; message: string }>("detect_mtu", { host: "1.1.1.1" });
    tests["mtu"] = { status: "pass", ...mtu };
  } catch (e) {
    tests["mtu"] = { status: "fail", error: String(e) };
  }

  // Test 11: CS2 Config
  try {
    const cfg = await invoke<{ autoexec_exists: boolean; autoexec_path: string | null; current_settings: unknown[] }>("scan_cs2_config");
    tests["cs2_config"] = { status: "pass", exists: cfg.autoexec_exists, path: cfg.autoexec_path, settings_count: cfg.current_settings.length };
  } catch (e) {
    tests["cs2_config"] = { status: "fail", error: String(e) };
  }

  // Test 12: VPN Connectivity to HQ
  try {
    const t0 = performance.now();
    const resp = await fetch("https://cs2-player-tools.maltinha.club/api/health");
    const data = await resp.json();
    tests["hq_connectivity"] = { status: "pass", time_ms: Math.round(performance.now() - t0), hq_status: data.status };
  } catch (e) {
    tests["hq_connectivity"] = { status: "fail", error: String(e) };
  }

  // Test 13: Token Validation
  try {
    const token = getToken();
    if (token) {
      const resp = await fetch(`${HQ_BASE}/tokens/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await resp.json();
      tests["token_validation"] = { status: data.valid ? "pass" : "fail", valid: data.valid, label: data.label || null, error: data.error || null };
    } else {
      tests["token_validation"] = { status: "fail", error: "No token stored" };
    }
  } catch (e) {
    tests["token_validation"] = { status: "fail", error: String(e) };
  }

  // Test 14: VPN Servers Available
  try {
    const resp = await fetch(`${HQ_BASE}/vpn-servers`);
    const data = await resp.json();
    tests["vpn_servers"] = { status: "pass", count: data.servers?.length ?? 0, servers: (data.servers || []).map((s: any) => s.name) };
  } catch (e) {
    tests["vpn_servers"] = { status: "fail", error: String(e) };
  }

  // Test 15: Remote Config
  try {
    const resp = await fetch(`${HQ_BASE}/config`);
    const data = await resp.json();
    const enabledFeatures = Object.entries(data.features || {}).filter(([, v]) => v).length;
    const totalFeatures = Object.keys(data.features || {}).length;
    tests["remote_config"] = { status: "pass", features_enabled: enabledFeatures, total_features: totalFeatures, maintenance: data.maintenance };
  } catch (e) {
    tests["remote_config"] = { status: "fail", error: String(e) };
  }

  // Test 16: App Version Check
  try {
    const resp = await fetch(`${HQ_BASE}/version?current=${APP_VERSION}`);
    const data = await resp.json();
    tests["version_check"] = { status: "pass", current: APP_VERSION, latest: data.latest_version, update_available: data.update_available };
  } catch (e) {
    tests["version_check"] = { status: "fail", error: String(e) };
  }

  // Test 17: Ping to nearest Valve DC (try multiple until one responds)
  try {
    const allDCs = await getTopDCs(10);
    let successful: Array<{ latency_ms: number; success: boolean }> = [];
    let usedTarget = "";
    for (const dc of allDCs) {
      const pings = await invoke<Array<{ latency_ms: number; success: boolean }>>("ping_host", { host: dc.ip, count: 3 });
      const ok = pings.filter(p => p.success);
      if (ok.length > 0) {
        successful = ok;
        usedTarget = `${dc.code} (${dc.name})`;
        break;
      }
    }
    if (successful.length > 0) {
      const avg = successful.reduce((s, p) => s + p.latency_ms, 0) / successful.length;
      const min = Math.min(...successful.map(p => p.latency_ms));
      const max = Math.max(...successful.map(p => p.latency_ms));
      tests["valve_dc_ping"] = { status: "pass", target: usedTarget, avg_ms: Math.round(avg * 10) / 10, min_ms: Math.round(min * 10) / 10, max_ms: Math.round(max * 10) / 10, samples: successful.length };
    } else {
      tests["valve_dc_ping"] = { status: "fail", error: "No successful pings to Valve DC" };
    }
  } catch (e) {
    tests["valve_dc_ping"] = { status: "fail", error: String(e) };
  }

  // Test 18: Downloads Available
  try {
    const resp = await fetch(`${HQ_BASE}/downloads`);
    const data = await resp.json();
    tests["downloads"] = { status: "pass", files: data.total, latest: data.files?.[0]?.name || "none" };
  } catch (e) {
    tests["downloads"] = { status: "fail", error: String(e) };
  }

  // Test 19: Connection History
  try {
    const history = await invoke<{ sessions: unknown[] }>("load_connection_history");
    tests["history"] = { status: "pass", sessions: history.sessions?.length ?? 0 };
  } catch (e) {
    tests["history"] = { status: "fail", error: String(e) };
  }

  // Test 20: Blocked Regions
  try {
    const blocked = await invoke<string[]>("list_blocked_regions");
    tests["blocked_regions"] = { status: "pass", count: blocked.length, regions: blocked };
  } catch (e) {
    tests["blocked_regions"] = { status: "fail", error: String(e) };
  }

  results.tests = tests;

  // Count pass/fail
  const testEntries = Object.values(tests) as Array<{ status: string }>;
  const passed = testEntries.filter((t) => t.status === "pass").length;
  const failed = testEntries.filter((t) => t.status === "fail").length;
  results.summary = { total: testEntries.length, passed, failed };

  // Send to HQ
  let reportId: string | undefined;
  try {
    const resp = await fetch(`${HQ_BASE}/diagnostics`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(results),
    });
    const data = await resp.json();
    reportId = data.id;
  } catch {
    // Silent
  }

  return { success: failed === 0, results, reportId };
}

/** Check for app updates — sends current version so HQ can compare */
export async function checkForUpdate(): Promise<{
  update_available: boolean;
  latest_version: string;
  download_url: string | null;
  download_url_msi: string | null;
  changelog: string;
} | null> {
  try {
    const resp = await fetch(`${HQ_BASE}/version?current=${APP_VERSION}`);
    return await resp.json();
  } catch {
    return null;
  }
}

/** Get HQ stats (for dashboard) */
export async function getHQStats(): Promise<Record<string, unknown> | null> {
  try {
    const resp = await fetch(`${HQ_BASE}/stats`);
    return await resp.json();
  } catch {
    return null;
  }
}

/** Send heartbeat to HQ (called periodically) */
export async function sendHeartbeat(
  invoke: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>
): Promise<number> {
  try {
    // Get current app state
    let cs2Running = false;
    const vpnActive = localStorage.getItem("cs2pt_vpn_connected") === "true";
    let profileName = null;

    try {
      const cs2 = await invoke<{ running: boolean }>("check_cs2");
      cs2Running = cs2.running;
    } catch {}

    const resp = await fetch(`${HQ_BASE}/heartbeat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        app_version: APP_VERSION,
        os: getOS(),
        cs2_running: cs2Running,
        vpn_active: vpnActive,
        profile_name: profileName,
        token: getToken(),
      }),
    });
    const data = await resp.json();
    return data.online_count ?? 0;
  } catch {
    return 0;
  }
}

/** Load remote config / feature flags from HQ */
export async function loadRemoteConfig(): Promise<{
  features: Record<string, boolean>;
  messages: Array<{ text: string; type: string }>;
  maintenance: boolean;
} | null> {
  try {
    const resp = await fetch(`${HQ_BASE}/config`);
    return await resp.json();
  } catch {
    return null;
  }
}

/** Send user feedback */
export async function sendFeedback(
  type: string,
  message: string,
  rating?: number
): Promise<boolean> {
  try {
    const resp = await fetch(`${HQ_BASE}/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        app_version: APP_VERSION,
        os: getOS(),
        type,
        message,
        rating,
        timestamp: new Date().toISOString(),
      }),
    });
    const data = await resp.json();
    return data.success ?? false;
  } catch {
    return false;
  }
}

/** Send crash report */
export async function reportCrash(
  error: string,
  context?: Record<string, unknown>
): Promise<void> {
  try {
    await fetch(`${HQ_BASE}/crash`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        app_version: APP_VERSION,
        os: getOS(),
        error,
        context: context ?? {},
        timestamp: new Date().toISOString(),
      }),
    });
  } catch {}
}

/** Check if we're in dev mode — always true during v0.x development */
export function isDevMode(): boolean {
  // During development (v0.x), always show dev tools
  // In production (v1.0+), this will check remote config
  return true;
}
