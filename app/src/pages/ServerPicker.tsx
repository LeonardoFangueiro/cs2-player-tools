import { useEffect, useState, useMemo } from "react";
import { invoke } from "../lib/tauri";
import { getTopDCs } from "../lib/valve";
import {
  Globe,
  Loader,
  AlertTriangle,
  RefreshCw,
  Lock,
  Unlock,
} from "lucide-react";

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

// Region classification based on known Valve PoP codes
const REGION_MAP: Record<string, string[]> = {
  Europe: [
    "ams", "ams4", "fra", "fra2", "fsn", "hel", "lhr", "mad", "par",
    "sto", "sto2", "vie", "waw", "buc", "sofi", "lux", "lux1", "lux2",
  ],
  "North America": [
    "atl", "ord", "dfw", "den", "lax", "sea", "iad", "eat", "okc",
    "mia", "chi", "slc", "sfo",
  ],
  "South America": [
    "gru", "scl", "lim", "bog", "eze",
  ],
  Asia: [
    "sgp", "hkg", "tyo", "tyo1", "sel", "bom", "maa", "dxb", "ccu",
    "pwg", "gnz", "can", "tsn", "sha", "szx", "ctu",
  ],
  Oceania: [
    "syd", "syd2",
  ],
  Africa: [
    "jnb",
  ],
};

// PoP code → ISO country code (for flag images)
const POP_COUNTRY: Record<string, string> = {
  ams: "nl", ams4: "nl", fra: "de", fra2: "de", fsn: "de", hel: "fi",
  lhr: "gb", mad: "es", par: "fr", sto: "se", sto2: "se", vie: "at",
  waw: "pl", buc: "ro", sofi: "bg", lux: "lu", ist: "tr",
  atl: "us", ord: "us", dfw: "us", den: "us", lax: "us", sea: "us",
  iad: "us", eat: "us", okc: "us", mia: "us", chi: "us", slc: "us", sfo: "us",
  gru: "br", scl: "cl", lim: "pe", bog: "co", eze: "ar",
  sgp: "sg", hkg: "hk", tyo: "jp", tyo1: "jp", sel: "kr", seo: "kr",
  bom: "in", bom2: "in", maa: "in", maa2: "in", dxb: "ae", ccu: "in",
  syd: "au", syd2: "au", jnb: "za",
  pwg: "cn", pwj: "cn", pwu: "cn", pww: "cn", pwz: "cn",
  gnz: "cn", can: "cn", tsn: "cn", sha: "cn", szx: "cn", ctu: "cn",
};

function getPopFlag(code: string): string {
  return POP_COUNTRY[code.toLowerCase()] || "";
}

function classifyRegion(code: string): string {
  const lc = code.toLowerCase();
  for (const [region, codes] of Object.entries(REGION_MAP)) {
    if (codes.includes(lc)) return region;
  }
  return "Other";
}

function getPingColor(ms: number): string {
  if (ms < 0) return "text-text-muted";
  if (ms < 50) return "text-success";
  if (ms < 100) return "text-warning";
  return "text-danger";
}

function getPingBorderColor(ms: number): string {
  if (ms < 0) return "border-border";
  if (ms < 50) return "border-success/40";
  if (ms < 100) return "border-warning/40";
  return "border-danger/40";
}

function getPingBgColor(ms: number): string {
  if (ms < 0) return "bg-bg-card";
  if (ms < 50) return "bg-success/5";
  if (ms < 100) return "bg-warning/5";
  return "bg-danger/5";
}

const ALL_REGIONS = [
  "Europe",
  "North America",
  "South America",
  "Asia",
  "Oceania",
  "Africa",
  "Other",
];

export default function ServerPicker() {
  const [sdrConfig, setSdrConfig] = useState<SDRConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pingResults, setPingResults] = useState<Map<string, number>>(
    new Map()
  );
  const [pinging, setPinging] = useState(false);
  // Keep pingAllPops available for programmatic use
  void pinging;
  const [selectedRegions, setSelectedRegions] = useState<Set<string>>(
    new Set(ALL_REGIONS)
  );
  const [blockedRegions, setBlockedRegions] = useState<Set<string>>(new Set());
  const [blockingPop, setBlockingPop] = useState<string | null>(null);
  const [bulkBlocking, setBulkBlocking] = useState(false);
  const [bulkAllowing, setBulkAllowing] = useState(false);

  useEffect(() => {
    loadSdrConfig();
    loadBlockedRegions();
  }, []);

  async function loadSdrConfig() {
    try {
      setLoading(true);
      const config = await invoke<SDRConfig>("fetch_sdr_config");
      setSdrConfig(config);
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function loadBlockedRegions() {
    try {
      const blocked = await invoke<string[]>("list_blocked_regions");
      setBlockedRegions(new Set(blocked));
    } catch {
      // Ignore
    }
  }

  async function pingAllPops() {
    try {
      setPinging(true);
      const results = await invoke<Array<[string, number]>>("ping_all_pops");
      const reachableResults = results.filter(([, ms]) => ms > 0);

      if (reachableResults.length === 0) {
        // Fallback: ping known Valve DCs directly (fetched dynamically)
        const knownDCs = await getTopDCs(10);
        const map = new Map<string, number>();
        for (const dc of knownDCs) {
          try {
            const pings = await invoke<Array<{ latency_ms: number; success: boolean }>>("ping_host", { host: dc.ip, count: 1 });
            if (pings[0]?.success) map.set(dc.code, pings[0].latency_ms);
            else map.set(dc.code, -1);
          } catch {
            map.set(dc.code, -1);
          }
        }
        setPingResults(map);
      } else {
        const map = new Map<string, number>();
        for (const [code, ms] of results) map.set(code, ms);
        setPingResults(map);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setPinging(false);
    }
  }
  void pingAllPops;

  async function toggleBlock(pop: ValvePoP) {
    const isBlocked = blockedRegions.has(pop.code);
    setBlockingPop(pop.code);
    try {
      if (isBlocked) {
        await invoke<{ success: boolean; message: string }>(
          "unblock_server_region",
          { popCode: pop.code }
        );
        setBlockedRegions((prev) => {
          const next = new Set(prev);
          next.delete(pop.code);
          return next;
        });
      } else {
        await invoke<{ success: boolean; message: string }>(
          "block_server_region",
          {
            popCode: pop.code,
            relayIps: pop.relays.map((r) => r.ipv4),
          }
        );
        setBlockedRegions((prev) => {
          const next = new Set(prev);
          next.add(pop.code);
          return next;
        });
      }
    } catch {
      // Ignore
    } finally {
      setBlockingPop(null);
    }
  }

  async function blockAllVisible() {
    setBulkBlocking(true);
    const visiblePops = Object.values(groupedPops).flat().filter(p => selectedRegions.has(classifyRegion(p.code)) && !blockedRegions.has(p.code));
    for (const pop of visiblePops) {
      await invoke("block_server_region", { popCode: pop.code, relayIps: pop.relays.map(r => r.ipv4) });
      setBlockedRegions(prev => { const n = new Set(prev); n.add(pop.code); return n; });
    }
    setBulkBlocking(false);
  }

  async function allowAll() {
    setBulkAllowing(true);
    for (const code of Array.from(blockedRegions)) {
      await invoke("unblock_server_region", { popCode: code });
    }
    setBlockedRegions(new Set());
    setBulkAllowing(false);
  }

  function toggleRegion(region: string) {
    setSelectedRegions((prev) => {
      const next = new Set(prev);
      if (next.has(region)) {
        next.delete(region);
      } else {
        next.add(region);
      }
      return next;
    });
  }

  // selectAllRegions and clearAllRegions removed — region pills handle it directly

  // Group PoPs by region
  const groupedPops = useMemo(() => {
    if (!sdrConfig) return {};
    const groups: Record<string, (ValvePoP & { ping: number })[]> = {};

    for (const pop of sdrConfig.pops) {
      const region = classifyRegion(pop.code);
      if (!groups[region]) groups[region] = [];
      const ping = pingResults.get(pop.code) ?? -1;
      groups[region].push({ ...pop, ping });
    }

    // Sort each group by ping (reachable first, then by ms)
    for (const region of Object.keys(groups)) {
      groups[region].sort((a, b) => {
        if (a.ping < 0 && b.ping < 0) return a.code.localeCompare(b.code);
        if (a.ping < 0) return 1;
        if (b.ping < 0) return -1;
        return a.ping - b.ping;
      });
    }

    return groups;
  }, [sdrConfig, pingResults]);

  // Status filter
  const [statusFilter, setStatusFilter] = useState<"all" | "allowed" | "blocked">("all");

  // Stats
  const totalPops = sdrConfig?.pops.length ?? 0;
  const blockedCount = blockedRegions.size;
  const allowedCount = totalPops - blockedCount;

  return (
    <div>
      {/* Header — compact */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-accent">Server Picker</h1>
          <p className="text-text-muted text-sm mt-1">
            {totalPops} PoPs · {allowedCount} allowed · {blockedCount} blocked
          </p>
        </div>
        <button onClick={loadSdrConfig} disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-bg-card border border-border rounded-lg text-xs text-text-muted hover:text-text hover:border-accent/30 transition disabled:opacity-50">
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="bg-danger/10 border border-danger/30 rounded-lg p-3 mb-4 flex items-center gap-2">
          <AlertTriangle size={14} className="text-danger" />
          <span className="text-xs text-danger">{error}</span>
        </div>
      )}

      {/* Toolbar — regions, status filter, and actions all in one compact bar */}
      <div className="bg-bg-card border border-border rounded-lg p-3 mb-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          {/* Region pills */}
          <div className="flex items-center gap-1.5 flex-wrap flex-1">
            {ALL_REGIONS.map((region) => {
              const isSelected = selectedRegions.has(region);
              const count = groupedPops[region]?.length ?? 0;
              if (count === 0) return null;
              return (
                <button key={region} onClick={() => toggleRegion(region)}
                  className={`px-2 py-1 text-[10px] rounded border transition ${
                    isSelected ? "bg-accent/15 border-accent/40 text-accent" : "border-border text-text-muted/50 hover:text-text-muted"
                  }`}>
                  {region} <span className="opacity-60">{count}</span>
                </button>
              );
            })}
            <span className="text-border mx-1">|</span>
            {/* Status filter inline */}
            {(["all", "allowed", "blocked"] as const).map((f) => (
              <button key={f} onClick={() => setStatusFilter(f)}
                className={`px-2 py-1 text-[10px] rounded border transition ${
                  statusFilter === f
                    ? f === "blocked" ? "bg-danger/15 border-danger/40 text-danger" : f === "allowed" ? "bg-success/15 border-success/40 text-success" : "bg-accent/10 border-accent/30 text-accent"
                    : "border-border text-text-muted/50 hover:text-text-muted"
                }`}>
                {f === "all" ? "All" : f === "allowed" ? `✓ ${allowedCount}` : `✗ ${blockedCount}`}
              </button>
            ))}
          </div>

          {/* Action buttons — compact */}
          <div className="flex items-center gap-1.5">
            <button onClick={blockAllVisible} disabled={bulkBlocking}
              className="flex items-center gap-1 px-2.5 py-1 bg-danger/10 border border-danger/25 text-danger text-[10px] rounded hover:bg-danger/20 transition disabled:opacity-50">
              <Lock size={10} /> {bulkBlocking ? "..." : "Block All"}
            </button>
            <button onClick={allowAll} disabled={bulkAllowing}
              className="flex items-center gap-1 px-2.5 py-1 bg-success/10 border border-success/25 text-success text-[10px] rounded hover:bg-success/20 transition disabled:opacity-50">
              <Unlock size={10} /> {bulkAllowing ? "..." : "Allow All"}
            </button>
          </div>
        </div>
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-6">
          {[1, 2, 3].map((i) => (
            <div key={i}>
              <div className="h-5 w-32 bg-border/40 rounded mb-3 animate-pulse" />
              <div className="grid grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
                {[1, 2, 3, 4].map((j) => (
                  <div
                    key={j}
                    className="h-24 bg-border/20 rounded-lg animate-pulse"
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* PoPs by Region */}
      {!loading &&
        sdrConfig &&
        ALL_REGIONS.filter((r) => selectedRegions.has(r) && groupedPops[r])
          .map((region) => (
          <div key={region} className="mb-8">
            <div className="flex items-center gap-2 mb-3">
              <Globe size={16} className="text-accent" />
              <h2 className="text-base font-semibold">{region}</h2>
              <span className="text-xs text-text-muted">
                ({groupedPops[region].length} PoPs)
              </span>
            </div>
            <div className="grid grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
              {groupedPops[region]
                .filter((pop) => {
                  if (statusFilter === "blocked") return blockedRegions.has(pop.code);
                  if (statusFilter === "allowed") return !blockedRegions.has(pop.code);
                  return true;
                })
                .map((pop) => {
                const hasPing = pingResults.size > 0;
                const ping = pop.ping;
                const isBlocked = blockedRegions.has(pop.code);
                const isToggling = blockingPop === pop.code;

                return (
                  <div key={pop.code}
                    onClick={() => !isToggling && toggleBlock(pop)}
                    className={`rounded-lg border p-3 transition cursor-pointer select-none ${
                      isBlocked ? "bg-danger/5 border-danger/30 opacity-50 hover:opacity-70"
                        : hasPing && ping > 0 ? `${getPingBgColor(ping)} ${getPingBorderColor(ping)} hover:brightness-110`
                        : "bg-bg-card border-border hover:border-accent/30"
                    }`}
                  >
                    {/* Row: flag + info + ping + status */}
                    <div className="flex items-center gap-2.5">
                      {/* Flag */}
                      {getPopFlag(pop.code) ? (
                        <img src={`https://flagcdn.com/w40/${getPopFlag(pop.code)}.png`}
                          alt="" className="w-7 h-5 rounded object-cover shrink-0 border border-border/50"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      ) : (
                        <Globe size={16} className="text-text-muted shrink-0" />
                      )}

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold truncate">
                          {pop.desc || pop.code.toUpperCase()}
                        </div>
                        <div className="text-[10px] text-text-muted flex items-center gap-1">
                          <span className="font-mono uppercase">{pop.code}</span>
                          <span>·</span>
                          <span>{pop.relays.length}r</span>
                        </div>
                      </div>

                      {/* Ping */}
                      {hasPing && (
                        <span className={`text-xs font-mono font-bold shrink-0 ${getPingColor(ping)}`}>
                          {ping > 0 ? `${ping.toFixed(0)}ms` : "—"}
                        </span>
                      )}

                      {/* Status icon */}
                      <span className={`shrink-0 ${isBlocked ? "text-danger" : "text-text-muted/20"}`}>
                        {isToggling ? <Loader size={12} className="animate-spin" />
                          : isBlocked ? <Lock size={12} /> : <Unlock size={12} />}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

      {/* No results message */}
      {!loading && sdrConfig && selectedRegions.size === 0 && (
        <div className="bg-bg-card border border-border rounded-lg p-8 text-center">
          <Globe size={32} className="mx-auto mb-3 text-text-muted" />
          <p className="text-text-muted text-sm">
            No regions selected. Use the filter above to show PoPs.
          </p>
        </div>
      )}
    </div>
  );
}
