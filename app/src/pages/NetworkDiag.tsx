import { useState, useEffect, useMemo } from "react";
import { invoke } from "../lib/tauri";
import { getTopDCs, getDefaultPingTarget } from "../lib/valve";
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
  Gauge,
  Ruler,
  RefreshCw,
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

/* ── Types ── */

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
  icon: React.ReactNode;
  status: "idle" | "running" | "pass" | "fail";
  detail: string;
}

interface BufferBloatResult {
  idle_ping_ms: number;
  loaded_ping_ms: number;
  bloat_ms: number;
  grade: string;
  message: string;
}

interface MtuResult {
  optimal_mtu: number;
  tested_host: string;
  message: string;
}

type Tab = "ping" | "traceroute" | "dns" | "tests";

/* ── Helpers ── */

function latencyColor(ms: number): string {
  if (ms < 0) return "text-text-muted";
  if (ms < 30) return "text-success";
  if (ms < 80) return "text-warning";
  return "text-danger";
}

function bloatGradeColor(g: string): string {
  const u = g.toUpperCase();
  if (u === "A" || u === "B") return "text-success";
  if (u === "C") return "text-warning";
  return "text-danger";
}

function bloatGradeBg(g: string): string {
  const u = g.toUpperCase();
  if (u === "A") return "bg-success/15 border-success/30";
  if (u === "B") return "bg-success/10 border-success/20";
  if (u === "C") return "bg-warning/15 border-warning/30";
  if (u === "D" || u === "F") return "bg-danger/15 border-danger/30";
  return "bg-bg border-border";
}

function StatusIcon({ status }: { status: DiagResult["status"] }) {
  if (status === "idle") return <span className="w-2 h-2 rounded-full bg-text-muted inline-block" />;
  if (status === "running") return <Loader size={12} className="text-accent animate-spin" />;
  if (status === "pass") return <CheckCircle size={12} className="text-success" />;
  return <XCircle size={12} className="text-danger" />;
}

/* DC pill buttons */
function DCPills({
  dcs,
  current,
  onSelect,
}: {
  dcs: Array<{ code: string; name: string; ip: string }>;
  current: string;
  onSelect: (ip: string) => void;
}) {
  if (dcs.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1.5">
      <span className="text-[9px] text-text-muted uppercase self-center mr-0.5">DC:</span>
      {dcs.map((dc) => (
        <button
          key={dc.code}
          onClick={() => onSelect(dc.ip)}
          className={`px-1.5 py-0.5 text-[9px] rounded border transition ${
            current === dc.ip
              ? "bg-accent/20 border-accent/40 text-accent"
              : "border-border text-text-muted hover:border-accent/20"
          }`}
        >
          {dc.code.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

/* Badge */
function Badge({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border border-border bg-bg text-xs font-mono ${color}`}>
      <span className="text-[9px] text-text-muted uppercase">{label}</span> {value}
    </span>
  );
}

/* ── Component ── */

export default function NetworkDiag() {
  const [tab, setTab] = useState<Tab>("ping");
  const [valveDCs, setValveDCs] = useState<Array<{ code: string; name: string; ip: string }>>([]);

  // Ping
  const [host, setHost] = useState("");
  const [count, setCount] = useState(10);
  const [results, setResults] = useState<PingResult[]>([]);
  const [running, setRunning] = useState(false);

  // Traceroute
  const [traceHost, setTraceHost] = useState("");
  const [traceHops, setTraceHops] = useState<TraceHop[]>([]);
  const [tracing, setTracing] = useState(false);

  // DNS
  const [dnsHost, setDnsHost] = useState("steamcommunity.com");
  const [dnsResults, setDnsResults] = useState<string[]>([]);
  const [dnsLoading, setDnsLoading] = useState(false);

  // Buffer Bloat
  const [bloatHost, setBloatHost] = useState("1.1.1.1");
  const [bloatResult, setBloatResult] = useState<BufferBloatResult | null>(null);
  const [bloatRunning, setBloatRunning] = useState(false);

  // MTU
  const [mtuHost, setMtuHost] = useState("1.1.1.1");
  const [mtuResult, setMtuResult] = useState<MtuResult | null>(null);
  const [mtuRunning, setMtuRunning] = useState(false);

  // Quick diagnostics
  const [diagnostics, setDiagnostics] = useState<DiagResult[]>([
    { label: "DNS", icon: <Globe size={12} />, status: "idle", detail: "steamcommunity.com" },
    { label: "Gateway", icon: <Wifi size={12} />, status: "idle", detail: "Default gateway" },
    { label: "Valve DC", icon: <Zap size={12} />, status: "idle", detail: "Closest relay" },
  ]);

  // Init
  useEffect(() => {
    getTopDCs(10).then(setValveDCs);
    getDefaultPingTarget().then((ip) => {
      setHost(ip);
      setTraceHost(ip);
    });
    runQuickDiagnostics();
  }, []);

  /* ── Actions ── */

  async function runQuickDiagnostics() {
    setDiagnostics((p) => p.map((d) => ({ ...d, status: "running" as const })));

    // DNS
    try {
      const ips = await invoke<string[]>("resolve_dns", { hostname: "steamcommunity.com" });
      setDiagnostics((p) =>
        p.map((d, i) =>
          i === 0
            ? { ...d, status: "pass" as const, detail: `Resolved ${ips[0]}${ips.length > 1 ? ` +${ips.length - 1}` : ""}` }
            : d,
        ),
      );
    } catch (e) {
      setDiagnostics((p) => p.map((d, i) => (i === 0 ? { ...d, status: "fail" as const, detail: String(e) } : d)));
    }

    // Gateway
    try {
      const info = await invoke<NetworkInfo>("get_network_info");
      setDiagnostics((p) =>
        p.map((d, i) =>
          i === 1
            ? {
                ...d,
                status: info.default_gateway ? ("pass" as const) : ("fail" as const),
                detail: info.default_gateway ? `GW ${info.default_gateway}` : "No gateway",
              }
            : d,
        ),
      );
    } catch (e) {
      setDiagnostics((p) => p.map((d, i) => (i === 1 ? { ...d, status: "fail" as const, detail: String(e) } : d)));
    }

    // Valve DC ping
    try {
      const defaultTarget = await getDefaultPingTarget();
      const pingRes = await invoke<PingResult[]>("ping_host", { host: defaultTarget, count: 3 });
      const ok = pingRes.filter((r) => r.success);
      if (ok.length > 0) {
        const avg = ok.reduce((s, r) => s + r.latency_ms, 0) / ok.length;
        setDiagnostics((p) =>
          p.map((d, i) => (i === 2 ? { ...d, status: "pass" as const, detail: `${avg.toFixed(0)}ms` } : d)),
        );
      } else {
        setDiagnostics((p) => p.map((d, i) => (i === 2 ? { ...d, status: "fail" as const, detail: "Unreachable" } : d)));
      }
    } catch (e) {
      setDiagnostics((p) => p.map((d, i) => (i === 2 ? { ...d, status: "fail" as const, detail: String(e) } : d)));
    }
  }

  async function runPing() {
    setRunning(true);
    setResults([]);
    try {
      setResults(await invoke<PingResult[]>("ping_host", { host, count }));
    } catch (e) {
      console.error(e);
    } finally {
      setRunning(false);
    }
  }

  async function runTraceroute() {
    setTracing(true);
    setTraceHops([]);
    try {
      setTraceHops(await invoke<TraceHop[]>("traceroute", { host: traceHost }));
    } catch (e) {
      console.error(e);
    } finally {
      setTracing(false);
    }
  }

  async function runDns() {
    setDnsLoading(true);
    try {
      setDnsResults(await invoke<string[]>("resolve_dns", { hostname: dnsHost }));
    } catch (e) {
      console.error(e);
    } finally {
      setDnsLoading(false);
    }
  }

  async function runBufferBloat() {
    setBloatRunning(true);
    setBloatResult(null);
    try {
      setBloatResult(await invoke<BufferBloatResult>("test_buffer_bloat", { targetHost: bloatHost }));
    } catch (e) {
      console.error(e);
    } finally {
      setBloatRunning(false);
    }
  }

  async function runMtuDetect() {
    setMtuRunning(true);
    setMtuResult(null);
    try {
      setMtuResult(await invoke<MtuResult>("detect_mtu", { host: mtuHost }));
    } catch (e) {
      console.error(e);
    } finally {
      setMtuRunning(false);
    }
  }

  /* ── Computed ── */

  const ok = useMemo(() => results.filter((r) => r.success), [results]);
  const avgMs = ok.reduce((s, r) => s + r.latency_ms, 0) / (ok.length || 1);
  const minMs = ok.length ? Math.min(...ok.map((r) => r.latency_ms)) : 0;
  const maxMs = ok.length ? Math.max(...ok.map((r) => r.latency_ms)) : 0;
  const lossPct = results.length ? ((results.length - ok.length) / results.length) * 100 : 0;
  const jitter = useMemo(() => {
    if (ok.length < 2) return 0;
    const v = ok.reduce((s, r) => s + Math.pow(r.latency_ms - avgMs, 2), 0) / ok.length;
    return Math.sqrt(v);
  }, [ok, avgMs]);
  const chartData = useMemo(
    () => results.map((r) => ({ seq: r.seq + 1, latency: r.success ? Math.round(r.latency_ms * 100) / 100 : null })),
    [results],
  );

  /* ── Tabs config ── */

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: "ping", label: "Ping", icon: <Activity size={13} /> },
    { key: "traceroute", label: "Traceroute", icon: <Route size={13} /> },
    { key: "dns", label: "DNS", icon: <Search size={13} /> },
    { key: "tests", label: "Tests", icon: <Gauge size={13} /> },
  ];

  const inputCls = "bg-bg border border-border rounded px-2 py-1.5 text-xs text-text focus:outline-none focus:border-accent";
  const btnCls = "px-3 py-1.5 bg-accent text-white text-xs rounded hover:bg-accent/80 transition disabled:opacity-50 whitespace-nowrap";

  /* ── Render ── */

  return (
    <div className="space-y-3">
      {/* Header + Quick Diagnostics */}
      <div className="bg-bg-card border border-border rounded-lg px-4 py-2.5">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-lg font-bold text-accent">Diagnostics</h1>
          <button
            onClick={runQuickDiagnostics}
            className="p-1.5 rounded hover:bg-bg-hover transition text-text-muted hover:text-accent"
            title="Refresh diagnostics"
          >
            <RefreshCw size={14} />
          </button>
        </div>
        <div className="flex items-center gap-4 text-xs">
          {diagnostics.map((d) => (
            <div key={d.label} className="flex items-center gap-1.5">
              <span className="text-accent2">{d.icon}</span>
              <StatusIcon status={d.status} />
              <span className="text-text-muted">{d.label}:</span>
              <span
                className={`font-mono ${
                  d.status === "pass" ? "text-success" : d.status === "fail" ? "text-danger" : "text-text-muted"
                }`}
              >
                {d.detail}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-bg-card border border-border rounded-lg p-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded transition ${
              tab === t.key ? "bg-accent/15 text-accent font-semibold" : "text-text-muted hover:text-text hover:bg-bg-hover"
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="bg-bg-card border border-border rounded-lg p-4">
        {/* ── PING TAB ── */}
        {tab === "ping" && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="Host or IP"
                className={`flex-1 ${inputCls}`}
              />
              <input
                type="number"
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
                min={1}
                max={100}
                className={`w-16 ${inputCls}`}
              />
              <button onClick={runPing} disabled={running} className={btnCls}>
                {running ? "Running..." : "Ping"}
              </button>
            </div>
            <DCPills dcs={valveDCs} current={host} onSelect={setHost} />

            {results.length > 0 && (
              <>
                {/* Stats badges */}
                <div className="flex flex-wrap gap-1.5 pt-2">
                  <Badge label="Min" value={`${minMs.toFixed(1)}ms`} color="text-success" />
                  <Badge label="Avg" value={`${avgMs.toFixed(1)}ms`} color="text-accent2" />
                  <Badge label="Max" value={`${maxMs.toFixed(1)}ms`} color="text-warning" />
                  <Badge label="Jitter" value={`${jitter.toFixed(1)}ms`} color="text-orange" />
                  <Badge label="Loss" value={`${lossPct.toFixed(1)}%`} color={lossPct > 0 ? "text-danger" : "text-success"} />
                </div>

                {/* Chart */}
                <div className="h-36 bg-bg rounded border border-border p-1">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#2a2620" />
                      <XAxis
                        dataKey="seq"
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
                          borderRadius: 6,
                          color: "#e8e4dc",
                          fontSize: 11,
                        }}
                        formatter={(value) =>
                          value !== null && value !== undefined ? [`${value}ms`, "Latency"] : ["Timeout", "Latency"]
                        }
                      />
                      <Line
                        type="monotone"
                        dataKey="latency"
                        stroke="#e67e22"
                        strokeWidth={1.5}
                        dot={{ fill: "#e67e22", r: 2 }}
                        activeDot={{ fill: "#f39c12", r: 4 }}
                        connectNulls={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {/* Results list */}
                <div className="space-y-0.5 max-h-48 overflow-y-auto">
                  {results.map((r) => (
                    <div
                      key={r.seq}
                      className={`flex items-center gap-2 px-2 py-1 rounded text-[11px] font-mono ${
                        r.success ? "text-text" : "text-danger bg-danger/5"
                      }`}
                    >
                      <span className="text-text-muted w-6">#{r.seq + 1}</span>
                      <span className="flex-1 truncate">{r.host}</span>
                      {r.success ? (
                        <span className={latencyColor(r.latency_ms)}>{r.latency_ms.toFixed(2)}ms</span>
                      ) : (
                        <span className="text-danger">{r.error || "Failed"}</span>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── TRACEROUTE TAB ── */}
        {tab === "traceroute" && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={traceHost}
                onChange={(e) => setTraceHost(e.target.value)}
                placeholder="Host or IP"
                className={`flex-1 ${inputCls}`}
              />
              <button onClick={runTraceroute} disabled={tracing} className={btnCls}>
                {tracing ? "Tracing..." : "Traceroute"}
              </button>
            </div>
            <DCPills dcs={valveDCs} current={traceHost} onSelect={setTraceHost} />

            {tracing && (
              <div className="flex items-center gap-2 text-text-muted text-xs pt-1">
                <Loader size={12} className="animate-spin" /> Running traceroute...
              </div>
            )}

            {traceHops.length > 0 && (
              <div className="overflow-x-auto pt-1">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="border-b border-border text-text-muted uppercase tracking-wider">
                      <th className="text-left py-1 px-2 w-10">Hop</th>
                      <th className="text-left py-1 px-2">IP</th>
                      <th className="text-left py-1 px-2 w-20">ms</th>
                      <th className="text-left py-1 px-2 w-28">Loss</th>
                    </tr>
                  </thead>
                  <tbody>
                    {traceHops.map((hop) => (
                      <tr key={hop.hop} className="border-b border-border/50 hover:bg-bg-hover transition">
                        <td className="py-1 px-2 font-mono text-text-muted">{hop.hop}</td>
                        <td className="py-1 px-2 font-mono">
                          {hop.ip === "*" ? (
                            <span className="text-text-muted">*</span>
                          ) : (
                            <span className="text-accent2">{hop.ip}</span>
                          )}
                          {hop.hostname && <span className="text-text-muted text-[10px] ml-1">({hop.hostname})</span>}
                        </td>
                        <td className="py-1 px-2">
                          {hop.latency_ms >= 0 ? (
                            <span className={`font-mono font-semibold ${latencyColor(hop.latency_ms)}`}>
                              {hop.latency_ms.toFixed(1)}
                            </span>
                          ) : (
                            <span className="text-text-muted font-mono">*</span>
                          )}
                        </td>
                        <td className="py-1 px-2">
                          <div className="flex items-center gap-1.5">
                            <div className="flex-1 h-1.5 bg-bg rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${
                                  hop.loss_percent === 0
                                    ? "bg-success"
                                    : hop.loss_percent < 50
                                      ? "bg-warning"
                                      : "bg-danger"
                                }`}
                                style={{ width: `${100 - hop.loss_percent}%` }}
                              />
                            </div>
                            <span
                              className={`text-[10px] font-mono w-8 text-right ${
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
        )}

        {/* ── DNS TAB ── */}
        {tab === "dns" && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={dnsHost}
                onChange={(e) => setDnsHost(e.target.value)}
                placeholder="Hostname"
                className={`flex-1 ${inputCls}`}
              />
              <button onClick={runDns} disabled={dnsLoading} className={btnCls}>
                {dnsLoading ? "Resolving..." : "Resolve"}
              </button>
            </div>
            {dnsResults.length > 0 && (
              <div className="space-y-0.5 pt-1">
                {dnsResults.map((ip, i) => (
                  <div key={i} className="px-2 py-1 bg-bg rounded text-xs font-mono text-accent2">
                    {ip}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── TESTS TAB (Buffer Bloat + MTU) ── */}
        {tab === "tests" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Buffer Bloat */}
            <div className="space-y-2">
              <h3 className="text-xs font-semibold flex items-center gap-1.5">
                <Gauge size={13} className="text-accent2" /> Buffer Bloat
              </h3>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={bloatHost}
                  onChange={(e) => setBloatHost(e.target.value)}
                  placeholder="Target host"
                  className={`flex-1 ${inputCls}`}
                />
                <button onClick={runBufferBloat} disabled={bloatRunning} className={btnCls}>
                  {bloatRunning ? "Testing..." : "Test"}
                </button>
              </div>
              {bloatRunning && (
                <div className="flex items-center gap-1.5 text-text-muted text-xs">
                  <Loader size={12} className="animate-spin" /> Testing...
                </div>
              )}
              {bloatResult && (
                <div className="space-y-2">
                  <div
                    className={`inline-flex items-center gap-2 px-3 py-1.5 rounded border text-xs ${bloatGradeBg(bloatResult.grade)}`}
                  >
                    <span className={`text-xl font-bold font-mono ${bloatGradeColor(bloatResult.grade)}`}>
                      {bloatResult.grade}
                    </span>
                    <span className="text-text-muted">{bloatResult.message}</span>
                  </div>
                  <div className="flex gap-2">
                    <Badge label="Idle" value={`${bloatResult.idle_ping_ms.toFixed(1)}ms`} color="text-success" />
                    <Badge label="Loaded" value={`${bloatResult.loaded_ping_ms.toFixed(1)}ms`} color="text-warning" />
                    <Badge
                      label="Bloat"
                      value={`+${bloatResult.bloat_ms.toFixed(1)}ms`}
                      color={
                        bloatResult.bloat_ms > 50 ? "text-danger" : bloatResult.bloat_ms > 20 ? "text-warning" : "text-success"
                      }
                    />
                  </div>
                </div>
              )}
            </div>

            {/* MTU */}
            <div className="space-y-2">
              <h3 className="text-xs font-semibold flex items-center gap-1.5">
                <Ruler size={13} className="text-accent2" /> MTU Detection
              </h3>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={mtuHost}
                  onChange={(e) => setMtuHost(e.target.value)}
                  placeholder="Target host"
                  className={`flex-1 ${inputCls}`}
                />
                <button onClick={runMtuDetect} disabled={mtuRunning} className={btnCls}>
                  {mtuRunning ? "Detecting..." : "Detect"}
                </button>
              </div>
              {mtuRunning && (
                <div className="flex items-center gap-1.5 text-text-muted text-xs">
                  <Loader size={12} className="animate-spin" /> Detecting...
                </div>
              )}
              {mtuResult && (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Badge label="MTU" value={`${mtuResult.optimal_mtu}`} color="text-accent2" />
                    <Badge label="WireGuard" value={`${mtuResult.optimal_mtu - 80}`} color="text-accent" />
                    <Badge label="Host" value={mtuResult.tested_host || "--"} color="text-text-muted" />
                  </div>
                  {mtuResult.message && (
                    <div className="text-[10px] text-text-muted bg-bg rounded border border-border px-2 py-1">
                      {mtuResult.message}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
