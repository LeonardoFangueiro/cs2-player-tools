import { useEffect, useState, useMemo } from "react";
import { invoke } from "../lib/tauri";
import {
  BarChart3,
  Trash2,
  Download,
  Loader,
  CheckCircle,
  XCircle,
  Clock,
  Activity,
  TrendingUp,
  TrendingDown,
  Shield,
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

// ── Types ──

interface ConnectionSession {
  timestamp: string;
  duration_secs: number;
  avg_ping_ms: number;
  min_ping_ms: number;
  max_ping_ms: number;
  jitter_ms: number;
  loss_percent: number;
  server_region: string;
  vpn_active: boolean;
}

interface ConnectionHistory {
  sessions: ConnectionSession[];
}

// ── Helpers ──

function formatDuration(secs: number): string {
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remaining = secs % 60;
  if (mins < 60) return `${mins}m ${remaining}s`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m`;
}

function formatDate(timestamp: string): string {
  try {
    const d = new Date(timestamp);
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return timestamp;
  }
}

function getPingColor(ms: number): string {
  if (ms < 30) return "text-success";
  if (ms < 80) return "text-warning";
  return "text-danger";
}

// ── Component ──

export default function History() {
  const [history, setHistory] = useState<ConnectionHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  useEffect(() => {
    loadHistory();
  }, []);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  async function loadHistory() {
    try {
      setLoading(true);
      const data = await invoke<ConnectionHistory>("load_connection_history");
      setHistory(data);
    } catch (e) {
      setToast({ message: `Failed to load history: ${String(e)}`, type: "error" });
    } finally {
      setLoading(false);
    }
  }

  async function clearHistory() {
    try {
      setClearing(true);
      await invoke("clear_connection_history");
      setHistory({ sessions: [] });
      setToast({ message: "History cleared", type: "success" });
    } catch (e) {
      setToast({ message: `Failed to clear: ${String(e)}`, type: "error" });
    } finally {
      setClearing(false);
    }
  }

  async function exportData() {
    try {
      setExporting(true);
      const jsonStr = await invoke<string>("export_all_data");

      const blob = new Blob([jsonStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `cs2-player-tools-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setToast({ message: "Data exported", type: "success" });
    } catch (e) {
      setToast({ message: `Export failed: ${String(e)}`, type: "error" });
    } finally {
      setExporting(false);
    }
  }

  const sessions = history?.sessions ?? [];

  // Stats
  const stats = useMemo(() => {
    if (sessions.length === 0) {
      return { total: 0, avgPing: 0, bestIdx: -1, worstIdx: -1 };
    }
    const total = sessions.length;
    const avgPing = sessions.reduce((sum, s) => sum + s.avg_ping_ms, 0) / total;
    let bestIdx = 0;
    let worstIdx = 0;
    for (let i = 1; i < sessions.length; i++) {
      if (sessions[i].avg_ping_ms < sessions[bestIdx].avg_ping_ms) bestIdx = i;
      if (sessions[i].avg_ping_ms > sessions[worstIdx].avg_ping_ms) worstIdx = i;
    }
    return { total, avgPing, bestIdx, worstIdx };
  }, [sessions]);

  // Chart data
  const chartData = useMemo(
    () =>
      sessions.map((s, i) => ({
        idx: i + 1,
        label: formatDate(s.timestamp),
        avg_ping_ms: Math.round(s.avg_ping_ms * 10) / 10,
      })),
    [sessions]
  );

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-accent">Connection History</h1>
          <p className="text-text-muted text-xs mt-0.5">
            {stats.total} sessions
            {stats.total > 0 && (
              <>
                {" · "}avg <span className={getPingColor(stats.avgPing)}>{stats.avgPing.toFixed(1)}ms</span>
                {" · "}best <span className="text-success">{stats.bestIdx >= 0 ? `${sessions[stats.bestIdx].avg_ping_ms.toFixed(1)}ms` : "--"}</span>
                {" · "}worst <span className="text-danger">{stats.worstIdx >= 0 ? `${sessions[stats.worstIdx].avg_ping_ms.toFixed(1)}ms` : "--"}</span>
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={exportData}
            disabled={exporting || sessions.length === 0}
            className="flex items-center gap-1 px-2.5 py-1 bg-bg-card border border-border rounded text-[10px] text-text-muted hover:text-text hover:border-accent/30 transition disabled:opacity-50"
          >
            {exporting ? <Loader size={10} className="animate-spin" /> : <Download size={10} />}
            Export
          </button>
          <button
            onClick={clearHistory}
            disabled={clearing || sessions.length === 0}
            className="flex items-center gap-1 px-2.5 py-1 bg-danger/10 border border-danger/25 rounded text-[10px] text-danger hover:bg-danger/20 transition disabled:opacity-50"
          >
            {clearing ? <Loader size={10} className="animate-spin" /> : <Trash2 size={10} />}
            Clear
          </button>
        </div>
      </div>

      {/* Stats — inline badges */}
      {stats.total > 0 && (
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-bg-card border border-border rounded-lg">
            <BarChart3 size={10} className="text-accent" />
            <span className="text-[10px] text-text-muted">Sessions</span>
            <span className="text-xs font-bold text-accent">{stats.total}</span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-bg-card border border-border rounded-lg">
            <Activity size={10} className="text-accent2" />
            <span className="text-[10px] text-text-muted">Avg</span>
            <span className={`text-xs font-bold ${getPingColor(stats.avgPing)}`}>{stats.avgPing.toFixed(1)}ms</span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-bg-card border border-border rounded-lg">
            <TrendingDown size={10} className="text-success" />
            <span className="text-[10px] text-text-muted">Best</span>
            <span className="text-xs font-bold text-success">
              {stats.bestIdx >= 0 ? `${sessions[stats.bestIdx].avg_ping_ms.toFixed(1)}ms` : "--"}
            </span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-bg-card border border-border rounded-lg">
            <TrendingUp size={10} className="text-danger" />
            <span className="text-[10px] text-text-muted">Worst</span>
            <span className="text-xs font-bold text-danger">
              {stats.worstIdx >= 0 ? `${sessions[stats.worstIdx].avg_ping_ms.toFixed(1)}ms` : "--"}
            </span>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="bg-bg-card border border-border rounded-lg p-8 text-center">
          <Loader size={24} className="mx-auto mb-2 text-accent animate-spin" />
          <p className="text-text-muted text-xs">Loading history...</p>
        </div>
      )}

      {/* No sessions */}
      {!loading && sessions.length === 0 && (
        <div className="bg-bg-card border border-border rounded-lg p-8 text-center">
          <BarChart3 size={32} className="mx-auto mb-3 text-text-muted" />
          <p className="text-text-muted text-xs">
            No connection history yet. Sessions will appear as you use the app.
          </p>
        </div>
      )}

      {/* Chart — shorter */}
      {!loading && sessions.length > 0 && (
        <div className="bg-bg-card border border-border rounded-lg p-3 mb-4">
          <div className="flex items-center gap-2 mb-2">
            <Activity size={12} className="text-accent2" />
            <span className="text-xs font-semibold">Ping Over Time</span>
          </div>
          <div className="h-36 bg-bg rounded-lg border border-border p-1.5">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2620" />
                <XAxis
                  dataKey="idx"
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
                  formatter={(value) => [`${value}ms`, "Avg Ping"]}
                  labelFormatter={(_, payload) => {
                    if (payload && payload.length > 0) {
                      const item = payload[0]?.payload as { label?: string } | undefined;
                      return item?.label ?? "";
                    }
                    return "";
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="avg_ping_ms"
                  stroke="#e67e22"
                  strokeWidth={2}
                  dot={{ fill: "#e67e22", r: 2 }}
                  activeDot={{ fill: "#f39c12", r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Sessions Table — compact */}
      {!loading && sessions.length > 0 && (
        <div className="bg-bg-card border border-border rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <Clock size={12} className="text-accent2" />
            <span className="text-xs font-semibold">All Sessions ({sessions.length})</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-text-muted text-[10px] uppercase tracking-wider">
                  <th className="text-left py-1.5 px-2">Date</th>
                  <th className="text-left py-1.5 px-2">Duration</th>
                  <th className="text-left py-1.5 px-2">Avg</th>
                  <th className="text-left py-1.5 px-2">Min</th>
                  <th className="text-left py-1.5 px-2">Max</th>
                  <th className="text-left py-1.5 px-2">Jitter</th>
                  <th className="text-left py-1.5 px-2">Loss</th>
                  <th className="text-left py-1.5 px-2">Region</th>
                  <th className="text-left py-1.5 px-2">VPN</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((session, idx) => (
                  <tr
                    key={idx}
                    className="border-b border-border/50 hover:bg-bg-hover transition"
                  >
                    <td className="py-1 px-2 text-text-muted text-[10px]">
                      {formatDate(session.timestamp)}
                    </td>
                    <td className="py-1 px-2 font-mono text-text-muted text-[10px]">
                      {formatDuration(session.duration_secs)}
                    </td>
                    <td className={`py-1 px-2 font-mono font-semibold text-[10px] ${getPingColor(session.avg_ping_ms)}`}>
                      {session.avg_ping_ms.toFixed(1)}ms
                    </td>
                    <td className="py-1 px-2 font-mono text-success text-[10px]">
                      {session.min_ping_ms.toFixed(1)}ms
                    </td>
                    <td className="py-1 px-2 font-mono text-danger text-[10px]">
                      {session.max_ping_ms.toFixed(1)}ms
                    </td>
                    <td className="py-1 px-2 font-mono text-orange text-[10px]">
                      {session.jitter_ms.toFixed(1)}ms
                    </td>
                    <td className={`py-1 px-2 font-mono text-[10px] ${session.loss_percent > 0 ? "text-danger" : "text-success"}`}>
                      {session.loss_percent.toFixed(1)}%
                    </td>
                    <td className="py-1 px-2 font-mono text-accent2 uppercase text-[10px]">
                      {session.server_region || "--"}
                    </td>
                    <td className="py-1 px-2">
                      {session.vpn_active ? (
                        <span className="flex items-center gap-0.5 text-success text-[10px]">
                          <Shield size={9} /> On
                        </span>
                      ) : (
                        <span className="text-text-muted text-[10px]">Off</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 px-4 py-2.5 rounded-lg shadow-lg border flex items-center gap-2 text-xs z-50 max-w-md ${
            toast.type === "success"
              ? "bg-success/15 border-success/30 text-success"
              : "bg-danger/15 border-danger/30 text-danger"
          }`}
        >
          {toast.type === "success" ? (
            <CheckCircle size={12} />
          ) : (
            <XCircle size={12} />
          )}
          {toast.message}
        </div>
      )}
    </div>
  );
}
