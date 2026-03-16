import { useEffect, useState, useMemo } from "react";
import { invoke } from "../lib/tauri";
import { getTopDCs } from "../lib/valve";
import {
  AlertTriangle,
  RefreshCw,
  Monitor,
  Server,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

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

interface NetworkInfo {
  hostname: string;
  dns_servers: string[];
  default_gateway: string | null;
}

function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse bg-border/40 rounded ${className}`}
    />
  );
}

function getBarColor(ms: number): string {
  if (ms < 50) return "#2ecc71";
  if (ms < 100) return "#f1c40f";
  return "#e74c3c";
}

export default function Dashboard() {
  const [sdrConfig, setSdrConfig] = useState<SDRConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [popPings, setPopPings] = useState<Array<[string, number]>>([]);
  const [pinging, setPinging] = useState(false);
  const [networkInfo, setNetworkInfo] = useState<NetworkInfo | null>(null);
  const [networkLoading, setNetworkLoading] = useState(true);

  useEffect(() => {
    loadSDRConfig();
    loadNetworkInfo();
  }, []);

  async function loadSDRConfig() {
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

  async function loadNetworkInfo() {
    try {
      setNetworkLoading(true);
      const info = await invoke<NetworkInfo>("get_network_info");
      setNetworkInfo(info);
    } catch (e) {
      console.error("Failed to load network info:", e);
    } finally {
      setNetworkLoading(false);
    }
  }

  async function handleRefresh() {
    setPopPings([]);
    await loadSDRConfig();
    await loadNetworkInfo();
  }

  async function pingAllPops() {
    try {
      setPinging(true);
      const results = await invoke<Array<[string, number]>>("ping_all_pops");
      const reachable = results.filter(([, ms]) => ms > 0);
      if (reachable.length === 0) {
        const knownDCs = await getTopDCs(10);
        const fallbackResults: Array<[string, number]> = [];
        for (const dc of knownDCs) {
          try {
            const pings = await invoke<Array<{ latency_ms: number; success: boolean }>>("ping_host", { host: dc.ip, count: 1 });
            const p = pings[0];
            fallbackResults.push([dc.code, p?.success ? p.latency_ms : -1]);
          } catch {
            fallbackResults.push([dc.code, -1]);
          }
        }
        fallbackResults.sort((a, b) => {
          if (a[1] < 0 && b[1] < 0) return 0;
          if (a[1] < 0) return 1;
          if (b[1] < 0) return -1;
          return a[1] - b[1];
        });
        setPopPings(fallbackResults);
      } else {
        setPopPings(results);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setPinging(false);
    }
  }

  const totalRelays =
    sdrConfig?.pops.reduce((sum, p) => sum + p.relays.length, 0) ?? 0;

  const europeCount =
    sdrConfig?.pops.filter((p) =>
      [
        "ams", "ams4", "fra", "fsn", "hel", "lhr", "mad", "par",
        "sto", "sto2", "vie", "waw",
      ].includes(p.code)
    ).length ?? 0;

  const reachablePings = useMemo(
    () => popPings.filter(([, ms]) => ms > 0),
    [popPings]
  );

  const top10 = useMemo(
    () => reachablePings.slice(0, 10),
    [reachablePings]
  );

  const chartData = useMemo(
    () =>
      top10.map(([code, ms]) => ({
        code,
        ms: Math.round(ms * 10) / 10,
      })),
    [top10]
  );

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-accent">Dashboard</h1>
          <p className="text-text-muted text-xs mt-0.5">
            {sdrConfig ? `${sdrConfig.pops.length} PoPs` : "..."} · {totalRelays} relays · {europeCount} EU · rev {sdrConfig?.revision ?? "..."}
          </p>
        </div>
        <button onClick={handleRefresh} disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-bg-card border border-border rounded-lg text-xs text-text-muted hover:text-text hover:border-accent/30 transition disabled:opacity-50">
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {error && (
        <div className="bg-danger/10 border border-danger/30 rounded-lg p-3 mb-4 flex items-center gap-2">
          <AlertTriangle size={14} className="text-danger" />
          <span className="text-xs text-danger">{error}</span>
        </div>
      )}

      {/* Network Info — compact inline row */}
      <div className="bg-bg-card border border-border rounded-lg p-3 mb-4">
        <div className="flex items-center gap-4">
          <Monitor size={14} className="text-accent2 shrink-0" />
          {networkLoading ? (
            <div className="flex items-center gap-4 flex-1">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-4 w-24" />)}
            </div>
          ) : networkInfo ? (
            <div className="flex items-center gap-4 flex-wrap flex-1 text-xs">
              <span className="text-text-muted">Host: <span className="font-mono text-accent2">{networkInfo.hostname}</span></span>
              <span className="text-border">|</span>
              <span className="text-text-muted">DNS: <span className="font-mono text-accent2">{networkInfo.dns_servers.length > 0 ? networkInfo.dns_servers.join(", ") : "N/A"}</span></span>
              <span className="text-border">|</span>
              <span className="text-text-muted">Gateway: <span className="font-mono text-accent2">{networkInfo.default_gateway ?? "N/A"}</span></span>
            </div>
          ) : (
            <span className="text-text-muted text-xs">Failed to load network info</span>
          )}
        </div>
      </div>

      {/* Valve Infrastructure Section */}
      <div className="bg-bg-card border border-border rounded-lg p-3 mb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <Server size={14} className="text-accent" />
              <span className="text-xs font-semibold">Valve Infrastructure</span>
            </div>
            {!loading && sdrConfig && (
              <div className="flex items-center gap-2 text-[10px] text-text-muted">
                <span><span className="font-bold text-accent">{sdrConfig.pops.length}</span> PoPs</span>
                <span>·</span>
                <span><span className="font-bold text-accent2">{totalRelays}</span> Relays</span>
                <span>·</span>
                <span><span className="font-bold text-success">{europeCount}</span> EU</span>
              </div>
            )}
          </div>
          <button
            onClick={pingAllPops}
            disabled={pinging || loading}
            className="px-2.5 py-1 bg-accent text-white text-[10px] rounded hover:bg-accent/80 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {pinging ? "Pinging..." : "Ping All PoPs"}
          </button>
        </div>

        {pinging && (
          <div className="space-y-1.5">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        )}

        {!pinging && popPings.length > 0 && (
          <>
            {/* Top 10 Closest */}
            <div className="mb-3">
              <div className="text-[10px] font-semibold text-text-muted mb-2 uppercase tracking-wider">
                Top 10 Closest
              </div>
              <div className="grid grid-cols-5 gap-1.5">
                {top10.map(([code, ms], idx) => (
                  <div
                    key={code}
                    className={`relative flex flex-col items-center justify-center px-2 py-2 rounded-lg border ${
                      idx === 0
                        ? "bg-success/10 border-success/40"
                        : "bg-bg border-border"
                    }`}
                  >
                    {idx === 0 && (
                      <span className="absolute -top-1.5 -right-1.5 text-[8px] px-1 py-px bg-success text-bg rounded-full font-bold">
                        BEST
                      </span>
                    )}
                    <span className="text-[10px] font-mono font-bold text-accent2">
                      {code}
                    </span>
                    <span
                      className={`text-xs font-bold font-mono ${
                        ms < 50 ? "text-success" : ms < 100 ? "text-warning" : "text-danger"
                      }`}
                    >
                      {ms.toFixed(1)}
                    </span>
                    <span className="text-[8px] text-text-muted">ms</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Latency Bar Chart */}
            {chartData.length > 0 && (
              <div className="mb-3">
                <div className="text-[10px] font-semibold text-text-muted mb-2 uppercase tracking-wider">
                  Latency Chart
                </div>
                <div className="h-36 bg-bg rounded-lg border border-border p-1.5">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <XAxis
                        dataKey="code"
                        tick={{ fill: "#8a8070", fontSize: 10 }}
                        axisLine={{ stroke: "#2a2620" }}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fill: "#8a8070", fontSize: 10 }}
                        axisLine={{ stroke: "#2a2620" }}
                        tickLine={false}
                        unit="ms"
                      />
                      <Tooltip
                        contentStyle={{
                          background: "#131210",
                          border: "1px solid #2a2620",
                          borderRadius: 8,
                          color: "#e8e4dc",
                          fontSize: 11,
                        }}
                        formatter={(value) => [
                          `${value}ms`,
                          "Latency",
                        ]}
                      />
                      <Bar dataKey="ms" radius={[4, 4, 0, 0]}>
                        {chartData.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={getBarColor(entry.ms)}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Full Grid */}
            <div className="text-[10px] font-semibold text-text-muted mb-2 uppercase tracking-wider">
              All Reachable ({reachablePings.length})
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {reachablePings.map(([code, ms]) => (
                <div
                  key={code}
                  className="flex items-center justify-between px-2 py-1.5 bg-bg rounded border border-border"
                >
                  <span className="text-[10px] font-mono font-semibold text-accent2">
                    {code}
                  </span>
                  <span
                    className={`text-[10px] font-mono ${
                      ms < 50 ? "text-success" : ms < 100 ? "text-warning" : "text-danger"
                    }`}
                  >
                    {ms.toFixed(1)}ms
                  </span>
                </div>
              ))}
            </div>
          </>
        )}

        {!pinging && popPings.length === 0 && (
          <p className="text-text-muted text-xs">
            Click "Ping All PoPs" to measure latency to Valve relay clusters.
          </p>
        )}

        {/* PoP Table — inside Valve Infrastructure section */}
        {!loading && sdrConfig && (
          <div className="mt-3 pt-3 border-t border-border">
          <div className="text-[10px] font-semibold text-text-muted mb-2 uppercase tracking-wider">
            All PoPs ({sdrConfig.pops.length})
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-text-muted text-[10px] uppercase tracking-wider">
                  <th className="text-left py-1.5 px-2">Code</th>
                  <th className="text-left py-1.5 px-2">Location</th>
                  <th className="text-left py-1.5 px-2">Relays</th>
                  <th className="text-left py-1.5 px-2">Coordinates</th>
                </tr>
              </thead>
              <tbody>
                {sdrConfig.pops.map((pop) => (
                  <tr
                    key={pop.code}
                    className="border-b border-border/50 hover:bg-bg-hover transition"
                  >
                    <td className="py-1 px-2 font-mono font-semibold text-accent2">
                      {pop.code}
                    </td>
                    <td className="py-1 px-2 text-text-muted">{pop.desc || "\u2014"}</td>
                    <td className="py-1 px-2 text-text-muted">
                      {pop.relays.length}
                    </td>
                    <td className="py-1 px-2 text-text-muted font-mono text-[10px]">
                      {pop.geo.length >= 2
                        ? `${pop.geo[0].toFixed(2)}, ${pop.geo[1].toFixed(2)}`
                        : "\u2014"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </div>
        )}
      </div>
    </div>
  );
}
