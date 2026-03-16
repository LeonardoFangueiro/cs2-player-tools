import { useEffect, useState, useMemo } from "react";
import { invoke } from "../lib/tauri";
import {
  Globe,
  MapPin,
  Loader,
  AlertTriangle,
  RefreshCw,
  Info,
  Wifi,
  Filter,
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
      const map = new Map<string, number>();
      for (const [code, ms] of results) {
        map.set(code, ms);
      }
      setPingResults(map);
    } catch (e) {
      setError(String(e));
    } finally {
      setPinging(false);
    }
  }

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

  function selectAllRegions() {
    setSelectedRegions(new Set(ALL_REGIONS));
  }

  function clearAllRegions() {
    setSelectedRegions(new Set());
  }

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

  // Stats
  const totalPops = sdrConfig?.pops.length ?? 0;
  const reachable = Array.from(pingResults.values()).filter((ms) => ms > 0).length;
  const blockedCount = blockedRegions.size;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-accent">Server Picker</h1>
          <p className="text-text-muted text-sm mt-1">
            Browse and ping all Valve datacenter regions
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={loadSdrConfig}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-bg-card border border-border rounded-lg text-sm text-text-muted hover:text-text hover:border-accent/50 transition disabled:opacity-50"
          >
            <RefreshCw
              size={14}
              className={loading ? "animate-spin" : ""}
            />
            Refresh
          </button>
          <button
            onClick={pingAllPops}
            disabled={pinging || loading}
            className="flex items-center gap-2 px-4 py-2 bg-accent text-white text-sm rounded-lg hover:bg-accent/80 transition disabled:opacity-50"
          >
            {pinging ? (
              <Loader size={14} className="animate-spin" />
            ) : (
              <Wifi size={14} />
            )}
            {pinging ? "Pinging..." : "Ping All"}
          </button>
          <button
            onClick={blockAllVisible}
            disabled={bulkBlocking}
            className="flex items-center gap-2 px-4 py-2 bg-danger/15 border border-danger/30 text-danger text-sm rounded-lg hover:bg-danger/25 transition disabled:opacity-50"
          >
            <Lock size={14} /> {bulkBlocking ? "Blocking..." : "Block All Filtered"}
          </button>
          <button
            onClick={allowAll}
            disabled={bulkAllowing}
            className="flex items-center gap-2 px-4 py-2 bg-success/15 border border-success/30 text-success text-sm rounded-lg hover:bg-success/25 transition disabled:opacity-50"
          >
            <Unlock size={14} /> {bulkAllowing ? "Allowing..." : "Allow All"}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-danger/10 border border-danger/30 rounded-lg p-4 mb-6 flex items-center gap-3">
          <AlertTriangle size={16} className="text-danger" />
          <span className="text-sm text-danger">{error}</span>
        </div>
      )}

      {/* Info banner about Windows firewall blocking */}
      <div className="bg-accent/8 border border-accent/30 rounded-lg p-4 mb-6 flex items-start gap-3">
        <Info size={16} className="text-accent mt-0.5 shrink-0" />
        <div className="text-sm text-text-muted">
          <span className="text-text font-semibold">
            Server blocking is Windows-only.
          </span>{" "}
          Region locking works by adding Windows Firewall rules to block
          unwanted datacenter IPs. This feature requires administrator
          privileges and is only available on Windows.
        </div>
      </div>

      {/* Stats bar */}
      {sdrConfig && (
        <div className="grid grid-cols-5 gap-4 mb-6">
          <div className="bg-bg-card border border-border rounded-lg p-3 text-center">
            <div className="text-[10px] text-text-muted uppercase tracking-wider">
              Total PoPs
            </div>
            <div className="text-xl font-bold text-accent">{totalPops}</div>
          </div>
          <div className="bg-bg-card border border-border rounded-lg p-3 text-center">
            <div className="text-[10px] text-text-muted uppercase tracking-wider">
              Regions
            </div>
            <div className="text-xl font-bold text-accent2">
              {Object.keys(groupedPops).length}
            </div>
          </div>
          <div className="bg-bg-card border border-border rounded-lg p-3 text-center">
            <div className="text-[10px] text-text-muted uppercase tracking-wider">
              Reachable
            </div>
            <div className="text-xl font-bold text-success">
              {pingResults.size > 0 ? reachable : "\u2014"}
            </div>
          </div>
          <div className="bg-bg-card border border-border rounded-lg p-3 text-center">
            <div className="text-[10px] text-text-muted uppercase tracking-wider">
              Unreachable
            </div>
            <div className="text-xl font-bold text-danger">
              {pingResults.size > 0
                ? pingResults.size - reachable
                : "\u2014"}
            </div>
          </div>
          <div className="bg-bg-card border border-border rounded-lg p-3 text-center">
            <div className="text-[10px] text-text-muted uppercase tracking-wider">
              Blocked
            </div>
            <div className="text-xl font-bold text-danger">
              {blockedCount > 0 ? blockedCount : "\u2014"}
            </div>
          </div>
        </div>
      )}

      {/* Region Filter */}
      <div className="bg-bg-card border border-border rounded-lg p-4 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Filter size={14} className="text-accent2" />
            Region Filter
          </h3>
          <div className="flex gap-2">
            <button
              onClick={selectAllRegions}
              className="text-[10px] text-accent2 hover:text-accent2/80 transition uppercase tracking-wider"
            >
              Select All
            </button>
            <span className="text-text-muted">|</span>
            <button
              onClick={clearAllRegions}
              className="text-[10px] text-text-muted hover:text-text transition uppercase tracking-wider"
            >
              Clear
            </button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {ALL_REGIONS.map((region) => {
            const isSelected = selectedRegions.has(region);
            const count = groupedPops[region]?.length ?? 0;
            return (
              <button
                key={region}
                onClick={() => toggleRegion(region)}
                className={`px-3 py-1.5 text-xs rounded-md border transition ${
                  isSelected
                    ? "bg-accent/15 border-accent/40 text-accent"
                    : "bg-bg border-border text-text-muted hover:border-accent/20"
                }`}
              >
                {region} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* Ping color legend */}
      <div className="flex items-center gap-4 mb-4 text-xs text-text-muted">
        <span>Ping Legend:</span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-sm bg-success/40" />
          &lt;50ms
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-sm bg-warning/40" />
          50-100ms
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-sm bg-danger/40" />
          &gt;100ms
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-sm bg-border" />
          Unreachable/No data
        </span>
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-6">
          {[1, 2, 3].map((i) => (
            <div key={i}>
              <div className="h-5 w-32 bg-border/40 rounded mb-3 animate-pulse" />
              <div className="grid grid-cols-4 gap-3">
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
            <div className="grid grid-cols-4 gap-3">
              {groupedPops[region].map((pop) => {
                const hasPing = pingResults.size > 0;
                const ping = pop.ping;
                const isBlocked = blockedRegions.has(pop.code);
                const isToggling = blockingPop === pop.code;

                return (
                  <div
                    key={pop.code}
                    className={`rounded-lg border p-4 transition hover:scale-[1.02] ${
                      isBlocked
                        ? "bg-danger/5 border-danger/30 opacity-60"
                        : hasPing
                        ? `${getPingBgColor(ping)} ${getPingBorderColor(ping)}`
                        : "bg-bg-card border-border"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-mono font-bold text-accent2 uppercase">
                        {pop.code}
                      </span>
                      <div className="flex items-center gap-2">
                        {hasPing && (
                          <span
                            className={`text-sm font-mono font-bold ${getPingColor(ping)}`}
                          >
                            {ping > 0 ? `${ping.toFixed(0)}ms` : "\u2014"}
                          </span>
                        )}
                        <div className="flex gap-1">
                          {isBlocked ? (
                            <button onClick={() => toggleBlock(pop)} disabled={isToggling}
                              title="Unblock this PoP"
                              className="px-1.5 py-0.5 text-[10px] rounded bg-success/15 text-success border border-success/30 hover:bg-success/25 transition disabled:opacity-50 flex items-center gap-1">
                              {isToggling ? <Loader size={10} className="animate-spin" /> : <Unlock size={10} />} Allow
                            </button>
                          ) : (
                            <button onClick={() => toggleBlock(pop)} disabled={isToggling}
                              title="Block this PoP"
                              className="px-1.5 py-0.5 text-[10px] rounded bg-danger/15 text-danger border border-danger/30 hover:bg-danger/25 transition disabled:opacity-50 flex items-center gap-1">
                              {isToggling ? <Loader size={10} className="animate-spin" /> : <Lock size={10} />} Block
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="text-xs text-text-muted mb-2 truncate">
                      {pop.desc || "No description"}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-text-muted flex items-center gap-1">
                        <MapPin size={10} />
                        {pop.relays.length} relay
                        {pop.relays.length !== 1 ? "s" : ""}
                      </span>
                      {pop.geo.length >= 2 && (
                        <span className="text-[10px] text-text-muted font-mono">
                          {pop.geo[0].toFixed(1)}, {pop.geo[1].toFixed(1)}
                        </span>
                      )}
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
          <Filter size={32} className="mx-auto mb-3 text-text-muted" />
          <p className="text-text-muted text-sm">
            No regions selected. Use the filter above to show PoPs.
          </p>
        </div>
      )}
    </div>
  );
}
