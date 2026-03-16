import { useEffect, useState, useMemo } from "react";
import { invoke } from "../lib/tauri";
import {
  Activity,
  Globe,
  Wifi,
  Clock,
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

function StatCard({
  icon,
  label,
  value,
  loading,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  loading: boolean;
  color: string;
}) {
  return (
    <div className="bg-bg-card border border-border rounded-lg p-4 flex flex-col gap-2">
      <div className="flex items-center gap-2 text-text-muted">
        <span className={color}>{icon}</span>
        <span className="text-xs uppercase tracking-wider">{label}</span>
      </div>
      {loading ? (
        <Skeleton className="h-8 w-16" />
      ) : (
        <span className={`text-2xl font-bold ${color}`}>{value}</span>
      )}
    </div>
  );
}

function getBarColor(ms: number): string {
  if (ms < 50) return "#55efc4";
  if (ms < 100) return "#fdcb6e";
  return "#fd79a8";
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
        // Fallback: ping known Valve IPs directly
        const knownDCs = [
          { code: "fra", ip: "155.133.240.55" },
          { code: "ams", ip: "155.133.226.71" },
          { code: "lhr", ip: "162.254.197.36" },
          { code: "mad", ip: "155.133.248.41" },
          { code: "sto", ip: "162.254.199.36" },
          { code: "waw", ip: "155.133.234.41" },
          { code: "vie", ip: "155.133.236.71" },
          { code: "iad", ip: "208.78.164.10" },
          { code: "gru", ip: "205.196.6.75" },
          { code: "sgp", ip: "103.10.124.36" },
        ];
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
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">
            <span className="text-accent">Dashboard</span>
          </h1>
          <p className="text-text-muted text-sm mt-1">
            Network overview & Valve infrastructure status
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-bg-card border border-border rounded-lg text-sm text-text-muted hover:text-text hover:border-accent/50 transition disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard
          icon={<Globe size={18} />}
          label="Valve PoPs"
          value={String(sdrConfig?.pops.length ?? 0)}
          loading={loading}
          color="text-accent"
        />
        <StatCard
          icon={<Wifi size={18} />}
          label="Total Relays"
          value={String(totalRelays)}
          loading={loading}
          color="text-accent2"
        />
        <StatCard
          icon={<Activity size={18} />}
          label="EU Datacenters"
          value={String(europeCount)}
          loading={loading}
          color="text-success"
        />
        <StatCard
          icon={<Clock size={18} />}
          label="SDR Revision"
          value={String(sdrConfig?.revision ?? 0)}
          loading={loading}
          color="text-warning"
        />
      </div>

      {error && (
        <div className="bg-danger/10 border border-danger/30 rounded-lg p-4 mb-6 flex items-center gap-3">
          <AlertTriangle size={16} className="text-danger" />
          <span className="text-sm text-danger">{error}</span>
        </div>
      )}

      {/* Network Info */}
      <div className="bg-bg-card border border-border rounded-lg p-5 mb-6">
        <h2 className="text-base font-semibold mb-4 flex items-center gap-2">
          <Monitor size={16} className="text-accent2" />
          Network Information
        </h2>
        {networkLoading ? (
          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-5 w-32" />
              </div>
            ))}
          </div>
        ) : networkInfo ? (
          <div className="grid grid-cols-3 gap-4">
            <div>
              <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">
                Hostname
              </div>
              <div className="text-sm font-mono text-accent2">
                {networkInfo.hostname}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">
                DNS Servers
              </div>
              <div className="text-sm font-mono text-accent2">
                {networkInfo.dns_servers.length > 0
                  ? networkInfo.dns_servers.join(", ")
                  : "N/A"}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">
                Default Gateway
              </div>
              <div className="text-sm font-mono text-accent2">
                {networkInfo.default_gateway ?? "N/A"}
              </div>
            </div>
          </div>
        ) : (
          <p className="text-text-muted text-sm">
            Failed to load network information.
          </p>
        )}
      </div>

      {/* Ping All PoPs */}
      <div className="bg-bg-card border border-border rounded-lg p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Server size={16} className="text-accent" />
            Valve Relay Latency
          </h2>
          <button
            onClick={pingAllPops}
            disabled={pinging || loading}
            className="px-4 py-1.5 bg-accent text-white text-sm rounded-md hover:bg-accent/80 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {pinging ? "Pinging..." : "Ping All PoPs"}
          </button>
        </div>

        {pinging && (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        )}

        {!pinging && popPings.length > 0 && (
          <>
            {/* Top 10 Closest */}
            <div className="mb-5">
              <h3 className="text-sm font-semibold text-text-muted mb-3 uppercase tracking-wider">
                Top 10 Closest PoPs
              </h3>
              <div className="grid grid-cols-5 gap-2 mb-4">
                {top10.map(([code, ms], idx) => (
                  <div
                    key={code}
                    className={`relative flex flex-col items-center justify-center px-3 py-3 rounded-lg border ${
                      idx === 0
                        ? "bg-success/10 border-success/40"
                        : "bg-bg border-border"
                    }`}
                  >
                    {idx === 0 && (
                      <span className="absolute -top-2 -right-2 text-[10px] px-1.5 py-0.5 bg-success text-bg rounded-full font-bold">
                        BEST
                      </span>
                    )}
                    <span className="text-sm font-mono font-bold text-accent2">
                      {code}
                    </span>
                    <span
                      className={`text-lg font-bold font-mono ${
                        ms < 50
                          ? "text-success"
                          : ms < 100
                          ? "text-warning"
                          : "text-danger"
                      }`}
                    >
                      {ms.toFixed(1)}
                    </span>
                    <span className="text-[10px] text-text-muted">ms</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Latency Bar Chart */}
            {chartData.length > 0 && (
              <div className="mb-5">
                <h3 className="text-sm font-semibold text-text-muted mb-3 uppercase tracking-wider">
                  Latency Chart (Top 10)
                </h3>
                <div className="h-48 bg-bg rounded-lg border border-border p-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <XAxis
                        dataKey="code"
                        tick={{ fill: "#8888a0", fontSize: 11 }}
                        axisLine={{ stroke: "#2a2a3a" }}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fill: "#8888a0", fontSize: 11 }}
                        axisLine={{ stroke: "#2a2a3a" }}
                        tickLine={false}
                        unit="ms"
                      />
                      <Tooltip
                        contentStyle={{
                          background: "#12121a",
                          border: "1px solid #2a2a3a",
                          borderRadius: 8,
                          color: "#e0e0e8",
                          fontSize: 12,
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
            <h3 className="text-sm font-semibold text-text-muted mb-3 uppercase tracking-wider">
              All Reachable PoPs ({reachablePings.length})
            </h3>
            <div className="grid grid-cols-3 gap-2">
              {reachablePings.map(([code, ms]) => (
                <div
                  key={code}
                  className="flex items-center justify-between px-3 py-2 bg-bg rounded-md border border-border"
                >
                  <span className="text-sm font-mono font-semibold text-accent2">
                    {code}
                  </span>
                  <span
                    className={`text-sm font-mono ${
                      ms < 50
                        ? "text-success"
                        : ms < 100
                        ? "text-warning"
                        : "text-danger"
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
          <p className="text-text-muted text-sm">
            Click "Ping All PoPs" to measure latency to all Valve relay
            clusters.
          </p>
        )}
      </div>

      {/* PoP List */}
      {loading && (
        <div className="bg-bg-card border border-border rounded-lg p-5">
          <Skeleton className="h-5 w-48 mb-4" />
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        </div>
      )}
      {!loading && sdrConfig && (
        <div className="bg-bg-card border border-border rounded-lg p-5">
          <h2 className="text-base font-semibold mb-4">
            Valve Points of Presence ({sdrConfig.pops.length})
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-text-muted text-xs uppercase tracking-wider">
                  <th className="text-left py-2 px-3">Code</th>
                  <th className="text-left py-2 px-3">Location</th>
                  <th className="text-left py-2 px-3">Relays</th>
                  <th className="text-left py-2 px-3">Coordinates</th>
                </tr>
              </thead>
              <tbody>
                {sdrConfig.pops.map((pop) => (
                  <tr
                    key={pop.code}
                    className="border-b border-border/50 hover:bg-bg-hover transition"
                  >
                    <td className="py-2 px-3 font-mono font-semibold text-accent2">
                      {pop.code}
                    </td>
                    <td className="py-2 px-3">{pop.desc || "\u2014"}</td>
                    <td className="py-2 px-3 text-text-muted">
                      {pop.relays.length}
                    </td>
                    <td className="py-2 px-3 text-text-muted text-xs font-mono">
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
  );
}
