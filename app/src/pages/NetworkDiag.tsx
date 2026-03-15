import { useState, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Activity,
  Search,
  Route,
  Zap,
  CheckCircle,
  XCircle,
  Loader,
  Globe,
  Wifi,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

interface PingResult {
  seq: number;
  host: string;
  latency_ms: number;
  success: boolean;
  error: string | null;
}

interface TraceHop {
  hop: number;
  ip: string;
  hostname: string | null;
  latency_ms: number;
  loss_percent: number;
}

interface NetworkInfo {
  hostname: string;
  dns_servers: string[];
  default_gateway: string | null;
}

interface DiagResult {
  label: string;
  status: "idle" | "running" | "pass" | "fail";
  detail: string;
}

function MiniStat({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="bg-bg rounded-md border border-border px-3 py-2 text-center">
      <div className="text-[10px] text-text-muted uppercase tracking-wider">
        {label}
      </div>
      <div className={`text-lg font-bold font-mono ${color}`}>{value}</div>
    </div>
  );
}

function getLatencyColor(ms: number): string {
  if (ms < 0) return "text-text-muted";
  if (ms < 30) return "text-success";
  if (ms < 80) return "text-warning";
  return "text-danger";
}

export default function NetworkDiag() {
  // Ping state
  const [host, setHost] = useState("162.254.197.1");
  const [count, setCount] = useState(10);
  const [results, setResults] = useState<PingResult[]>([]);
  const [running, setRunning] = useState(false);

  // Traceroute state
  const [traceHost, setTraceHost] = useState("162.254.197.1");
  const [traceHops, setTraceHops] = useState<TraceHop[]>([]);
  const [tracing, setTracing] = useState(false);

  // Quick diagnostics state
  const [diagnostics, setDiagnostics] = useState<DiagResult[]>([
    { label: "DNS Resolution", status: "idle", detail: "steamcommunity.com" },
    { label: "Gateway Reachability", status: "idle", detail: "Default gateway" },
    { label: "Nearest PoP Ping", status: "idle", detail: "Closest Valve relay" },
  ]);

  // DNS state
  const [dnsHost, setDnsHost] = useState("steamcommunity.com");
  const [dnsResults, setDnsResults] = useState<string[]>([]);

  // Run quick diagnostics on mount
  useEffect(() => {
    runQuickDiagnostics();
  }, []);

  async function runQuickDiagnostics() {
    const newDiag: DiagResult[] = [...diagnostics];

    // DNS check
    newDiag[0] = { ...newDiag[0], status: "running" };
    setDiagnostics([...newDiag]);
    try {
      const ips = await invoke<string[]>("resolve_dns", {
        hostname: "steamcommunity.com",
      });
      newDiag[0] = {
        ...newDiag[0],
        status: "pass",
        detail: `Resolved to ${ips[0]}${ips.length > 1 ? ` (+${ips.length - 1} more)` : ""}`,
      };
    } catch (e) {
      newDiag[0] = {
        ...newDiag[0],
        status: "fail",
        detail: String(e),
      };
    }
    setDiagnostics([...newDiag]);

    // Gateway check
    newDiag[1] = { ...newDiag[1], status: "running" };
    setDiagnostics([...newDiag]);
    try {
      const info = await invoke<NetworkInfo>("get_network_info");
      if (info.default_gateway) {
        newDiag[1] = {
          ...newDiag[1],
          status: "pass",
          detail: `Gateway: ${info.default_gateway}`,
        };
      } else {
        newDiag[1] = {
          ...newDiag[1],
          status: "fail",
          detail: "No default gateway found",
        };
      }
    } catch (e) {
      newDiag[1] = {
        ...newDiag[1],
        status: "fail",
        detail: String(e),
      };
    }
    setDiagnostics([...newDiag]);

    // Quick ping to nearest PoP
    newDiag[2] = { ...newDiag[2], status: "running" };
    setDiagnostics([...newDiag]);
    try {
      const pings = await invoke<Array<[string, number]>>("ping_all_pops");
      const reachable = pings.filter(([, ms]) => ms > 0);
      if (reachable.length > 0) {
        const [bestCode, bestMs] = reachable[0];
        newDiag[2] = {
          ...newDiag[2],
          status: "pass",
          detail: `${bestCode}: ${bestMs.toFixed(1)}ms`,
        };
      } else {
        newDiag[2] = {
          ...newDiag[2],
          status: "fail",
          detail: "No reachable PoPs",
        };
      }
    } catch (e) {
      newDiag[2] = {
        ...newDiag[2],
        status: "fail",
        detail: String(e),
      };
    }
    setDiagnostics([...newDiag]);
  }

  async function runPing() {
    try {
      setRunning(true);
      setResults([]);
      const res = await invoke<PingResult[]>("ping_host", { host, count });
      setResults(res);
    } catch (e) {
      console.error(e);
    } finally {
      setRunning(false);
    }
  }

  async function runTraceroute() {
    try {
      setTracing(true);
      setTraceHops([]);
      const hops = await invoke<TraceHop[]>("traceroute", { host: traceHost });
      setTraceHops(hops);
    } catch (e) {
      console.error(e);
    } finally {
      setTracing(false);
    }
  }

  async function runDns() {
    try {
      const res = await invoke<string[]>("resolve_dns", { hostname: dnsHost });
      setDnsResults(res);
    } catch (e) {
      console.error(e);
    }
  }

  // Ping stats
  const successResults = useMemo(
    () => results.filter((r) => r.success),
    [results]
  );
  const successCount = successResults.length;
  const avgLatency =
    successResults.reduce((sum, r) => sum + r.latency_ms, 0) /
    (successCount || 1);
  const minLatency =
    successCount > 0
      ? Math.min(...successResults.map((r) => r.latency_ms))
      : 0;
  const maxLatency =
    successCount > 0
      ? Math.max(...successResults.map((r) => r.latency_ms))
      : 0;
  const lossPercent =
    results.length > 0
      ? ((results.length - successCount) / results.length) * 100
      : 0;

  // Jitter (standard deviation of latencies)
  const jitter = useMemo(() => {
    if (successResults.length < 2) return 0;
    const mean = avgLatency;
    const variance =
      successResults.reduce(
        (sum, r) => sum + Math.pow(r.latency_ms - mean, 2),
        0
      ) / successResults.length;
    return Math.sqrt(variance);
  }, [successResults, avgLatency]);

  // Chart data for ping line chart
  const chartData = useMemo(
    () =>
      results.map((r) => ({
        seq: r.seq + 1,
        latency: r.success ? Math.round(r.latency_ms * 100) / 100 : null,
      })),
    [results]
  );

  const diagIcons = [
    <Globe size={16} />,
    <Wifi size={16} />,
    <Zap size={16} />,
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-accent">Network Diagnostics</h1>
        <p className="text-text-muted text-sm mt-1">
          Ping, traceroute, DNS resolution, and connection testing
        </p>
      </div>

      {/* Quick Diagnostics */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {diagnostics.map((diag, idx) => (
          <div
            key={diag.label}
            className="bg-bg-card border border-border rounded-lg p-4"
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="text-accent2">{diagIcons[idx]}</span>
              <span className="text-xs uppercase tracking-wider text-text-muted">
                {diag.label}
              </span>
              <span className="ml-auto">
                {diag.status === "idle" && (
                  <span className="w-2 h-2 rounded-full bg-text-muted inline-block" />
                )}
                {diag.status === "running" && (
                  <Loader size={14} className="text-accent animate-spin" />
                )}
                {diag.status === "pass" && (
                  <CheckCircle size={14} className="text-success" />
                )}
                {diag.status === "fail" && (
                  <XCircle size={14} className="text-danger" />
                )}
              </span>
            </div>
            <div
              className={`text-sm font-mono ${
                diag.status === "pass"
                  ? "text-success"
                  : diag.status === "fail"
                  ? "text-danger"
                  : "text-text-muted"
              }`}
            >
              {diag.detail}
            </div>
          </div>
        ))}
      </div>

      {/* Ping Tool */}
      <div className="bg-bg-card border border-border rounded-lg p-5 mb-6">
        <h2 className="text-base font-semibold mb-4 flex items-center gap-2">
          <Activity size={16} className="text-accent2" /> Ping Test
        </h2>
        <div className="flex gap-3 mb-4">
          <input
            type="text"
            value={host}
            onChange={(e) => setHost(e.target.value)}
            placeholder="Host or IP"
            className="flex-1 bg-bg border border-border rounded-md px-3 py-2 text-sm text-text focus:outline-none focus:border-accent"
          />
          <input
            type="number"
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            min={1}
            max={100}
            className="w-20 bg-bg border border-border rounded-md px-3 py-2 text-sm text-text focus:outline-none focus:border-accent"
          />
          <button
            onClick={runPing}
            disabled={running}
            className="px-5 py-2 bg-accent text-white text-sm rounded-md hover:bg-accent/80 transition disabled:opacity-50"
          >
            {running ? "Running..." : "Ping"}
          </button>
        </div>

        {results.length > 0 && (
          <>
            {/* Stats */}
            <div className="grid grid-cols-5 gap-3 mb-4">
              <MiniStat
                label="Min"
                value={`${minLatency.toFixed(1)}ms`}
                color="text-success"
              />
              <MiniStat
                label="Avg"
                value={`${avgLatency.toFixed(1)}ms`}
                color="text-accent2"
              />
              <MiniStat
                label="Max"
                value={`${maxLatency.toFixed(1)}ms`}
                color="text-warning"
              />
              <MiniStat
                label="Jitter"
                value={`${jitter.toFixed(1)}ms`}
                color="text-orange"
              />
              <MiniStat
                label="Loss"
                value={`${lossPercent.toFixed(1)}%`}
                color={lossPercent > 0 ? "text-danger" : "text-success"}
              />
            </div>

            {/* Line Chart */}
            <div className="h-48 bg-bg rounded-lg border border-border p-2 mb-4">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#2a2a3a"
                  />
                  <XAxis
                    dataKey="seq"
                    tick={{ fill: "#8888a0", fontSize: 11 }}
                    axisLine={{ stroke: "#2a2a3a" }}
                    tickLine={false}
                    label={{
                      value: "Sequence",
                      position: "insideBottom",
                      offset: -5,
                      fill: "#8888a0",
                      fontSize: 10,
                    }}
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
                    formatter={(value) =>
                      value !== null && value !== undefined
                        ? [`${value}ms`, "Latency"]
                        : ["Timeout", "Latency"]
                    }
                  />
                  <Line
                    type="monotone"
                    dataKey="latency"
                    stroke="#6c5ce7"
                    strokeWidth={2}
                    dot={{ fill: "#6c5ce7", r: 3 }}
                    activeDot={{ fill: "#00cec9", r: 5 }}
                    connectNulls={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Individual results */}
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {results.map((r) => (
                <div
                  key={r.seq}
                  className={`flex items-center gap-3 px-3 py-1.5 rounded text-xs font-mono ${
                    r.success ? "text-text" : "text-danger bg-danger/5"
                  }`}
                >
                  <span className="text-text-muted w-8">#{r.seq + 1}</span>
                  <span className="flex-1">{r.host}</span>
                  {r.success ? (
                    <span
                      className={
                        r.latency_ms < 50
                          ? "text-success"
                          : r.latency_ms < 100
                          ? "text-warning"
                          : "text-danger"
                      }
                    >
                      {r.latency_ms.toFixed(2)}ms
                    </span>
                  ) : (
                    <span className="text-danger">{r.error || "Failed"}</span>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Traceroute */}
      <div className="bg-bg-card border border-border rounded-lg p-5 mb-6">
        <h2 className="text-base font-semibold mb-4 flex items-center gap-2">
          <Route size={16} className="text-accent2" /> Traceroute
        </h2>
        <div className="flex gap-3 mb-4">
          <input
            type="text"
            value={traceHost}
            onChange={(e) => setTraceHost(e.target.value)}
            placeholder="Host or IP"
            className="flex-1 bg-bg border border-border rounded-md px-3 py-2 text-sm text-text focus:outline-none focus:border-accent"
          />
          <button
            onClick={runTraceroute}
            disabled={tracing}
            className="px-5 py-2 bg-accent text-white text-sm rounded-md hover:bg-accent/80 transition disabled:opacity-50"
          >
            {tracing ? "Tracing..." : "Traceroute"}
          </button>
        </div>

        {tracing && (
          <div className="flex items-center gap-2 text-text-muted text-sm">
            <Loader size={14} className="animate-spin" />
            Running traceroute... this may take up to 30 seconds.
          </div>
        )}

        {traceHops.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-text-muted text-xs uppercase tracking-wider">
                  <th className="text-left py-2 px-3 w-12">Hop</th>
                  <th className="text-left py-2 px-3">IP Address</th>
                  <th className="text-left py-2 px-3 w-28">Latency</th>
                  <th className="text-left py-2 px-3 w-40">Loss</th>
                </tr>
              </thead>
              <tbody>
                {traceHops.map((hop) => (
                  <tr
                    key={hop.hop}
                    className="border-b border-border/50 hover:bg-bg-hover transition"
                  >
                    <td className="py-2 px-3 font-mono text-text-muted">
                      {hop.hop}
                    </td>
                    <td className="py-2 px-3 font-mono">
                      {hop.ip === "*" ? (
                        <span className="text-text-muted">*</span>
                      ) : (
                        <span className="text-accent2">{hop.ip}</span>
                      )}
                      {hop.hostname && (
                        <span className="text-text-muted text-xs ml-2">
                          ({hop.hostname})
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-3">
                      {hop.latency_ms >= 0 ? (
                        <span
                          className={`font-mono font-semibold ${getLatencyColor(hop.latency_ms)}`}
                        >
                          {hop.latency_ms.toFixed(1)}ms
                        </span>
                      ) : (
                        <span className="text-text-muted font-mono">*</span>
                      )}
                    </td>
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-bg rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              hop.loss_percent === 0
                                ? "bg-success"
                                : hop.loss_percent < 50
                                ? "bg-warning"
                                : "bg-danger"
                            }`}
                            style={{
                              width: `${100 - hop.loss_percent}%`,
                            }}
                          />
                        </div>
                        <span
                          className={`text-xs font-mono w-10 text-right ${
                            hop.loss_percent === 0
                              ? "text-success"
                              : hop.loss_percent < 50
                              ? "text-warning"
                              : "text-danger"
                          }`}
                        >
                          {hop.loss_percent.toFixed(0)}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* DNS Tool */}
      <div className="bg-bg-card border border-border rounded-lg p-5">
        <h2 className="text-base font-semibold mb-4 flex items-center gap-2">
          <Search size={16} className="text-accent2" /> DNS Resolution
        </h2>
        <div className="flex gap-3 mb-4">
          <input
            type="text"
            value={dnsHost}
            onChange={(e) => setDnsHost(e.target.value)}
            placeholder="Hostname"
            className="flex-1 bg-bg border border-border rounded-md px-3 py-2 text-sm text-text focus:outline-none focus:border-accent"
          />
          <button
            onClick={runDns}
            className="px-5 py-2 bg-accent text-white text-sm rounded-md hover:bg-accent/80 transition"
          >
            Resolve
          </button>
        </div>
        {dnsResults.length > 0 && (
          <div className="space-y-1">
            {dnsResults.map((ip, i) => (
              <div
                key={i}
                className="px-3 py-1.5 bg-bg rounded text-sm font-mono text-accent2"
              >
                {ip}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
