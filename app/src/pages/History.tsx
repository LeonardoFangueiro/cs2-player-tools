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

      // Download as JSON file
      const blob = new Blob([jsonStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `cs2-player-tools-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setToast({ message: "Data exported successfully", type: "success" });
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
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-accent">Connection History</h1>
          <p className="text-text-muted text-sm mt-1">
            Track connection quality over time
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={exportData}
            disabled={exporting || sessions.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-bg-card border border-border rounded-lg text-sm text-text-muted hover:text-text hover:border-accent/50 transition disabled:opacity-50"
          >
            {exporting ? (
              <Loader size={14} className="animate-spin" />
            ) : (
              <Download size={14} />
            )}
            Export All Data
          </button>
          <button
            onClick={clearHistory}
            disabled={clearing || sessions.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-danger/10 border border-danger/30 rounded-lg text-sm text-danger hover:bg-danger/20 transition disabled:opacity-50"
          >
            {clearing ? (
              <Loader size={14} className="animate-spin" />
            ) : (
              <Trash2 size={14} />
            )}
            Clear History
          </button>
        </div>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-bg-card border border-border rounded-lg p-4 flex flex-col gap-2">
          <div className="flex items-center gap-2 text-text-muted">
            <span className="text-accent"><BarChart3 size={18} /></span>
            <span className="text-xs uppercase tracking-wider">Total Sessions</span>
          </div>
          <span className="text-2xl font-bold text-accent">{stats.total}</span>
        </div>
        <div className="bg-bg-card border border-border rounded-lg p-4 flex flex-col gap-2">
          <div className="flex items-center gap-2 text-text-muted">
            <span className="text-accent2"><Activity size={18} /></span>
            <span className="text-xs uppercase tracking-wider">Average Ping</span>
          </div>
          <span className={`text-2xl font-bold ${stats.total > 0 ? getPingColor(stats.avgPing) : "text-text-muted"}`}>
            {stats.total > 0 ? `${stats.avgPing.toFixed(1)}ms` : "--"}
          </span>
        </div>
        <div className="bg-bg-card border border-border rounded-lg p-4 flex flex-col gap-2">
          <div className="flex items-center gap-2 text-text-muted">
            <span className="text-success"><TrendingDown size={18} /></span>
            <span className="text-xs uppercase tracking-wider">Best Session</span>
          </div>
          <span className="text-2xl font-bold text-success">
            {stats.bestIdx >= 0
              ? `${sessions[stats.bestIdx].avg_ping_ms.toFixed(1)}ms`
              : "--"}
          </span>
        </div>
        <div className="bg-bg-card border border-border rounded-lg p-4 flex flex-col gap-2">
          <div className="flex items-center gap-2 text-text-muted">
            <span className="text-danger"><TrendingUp size={18} /></span>
            <span className="text-xs uppercase tracking-wider">Worst Session</span>
          </div>
          <span className="text-2xl font-bold text-danger">
            {stats.worstIdx >= 0
              ? `${sessions[stats.worstIdx].avg_ping_ms.toFixed(1)}ms`
              : "--"}
          </span>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="bg-bg-card border border-border rounded-lg p-12 text-center">
          <Loader size={32} className="mx-auto mb-3 text-accent animate-spin" />
          <p className="text-text-muted text-sm">Loading history...</p>
        </div>
      )}

      {/* No sessions */}
      {!loading && sessions.length === 0 && (
        <div className="bg-bg-card border border-border rounded-lg p-12 text-center">
          <BarChart3 size={48} className="mx-auto mb-4 text-text-muted" />
          <p className="text-text-muted text-sm">
            No connection history yet. Sessions will appear here as you use the app.
          </p>
        </div>
      )}

      {/* Chart */}
      {!loading && sessions.length > 0 && (
        <div className="bg-bg-card border border-border rounded-lg p-5 mb-6">
          <h2 className="text-base font-semibold mb-4 flex items-center gap-2">
            <Activity size={16} className="text-accent2" />
            Ping Over Time
          </h2>
          <div className="h-56 bg-bg rounded-lg border border-border p-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3a" />
                <XAxis
                  dataKey="idx"
                  tick={{ fill: "#8888a0", fontSize: 11 }}
                  axisLine={{ stroke: "#2a2a3a" }}
                  tickLine={false}
                  label={{
                    value: "Session",
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
                  stroke="#6c5ce7"
                  strokeWidth={2}
                  dot={{ fill: "#6c5ce7", r: 3 }}
                  activeDot={{ fill: "#00cec9", r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Sessions Table */}
      {!loading && sessions.length > 0 && (
        <div className="bg-bg-card border border-border rounded-lg p-5">
          <h2 className="text-base font-semibold mb-4 flex items-center gap-2">
            <Clock size={16} className="text-accent2" />
            All Sessions ({sessions.length})
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-text-muted text-xs uppercase tracking-wider">
                  <th className="text-left py-2 px-3">Date</th>
                  <th className="text-left py-2 px-3">Duration</th>
                  <th className="text-left py-2 px-3">Avg Ping</th>
                  <th className="text-left py-2 px-3">Min</th>
                  <th className="text-left py-2 px-3">Max</th>
                  <th className="text-left py-2 px-3">Jitter</th>
                  <th className="text-left py-2 px-3">Loss</th>
                  <th className="text-left py-2 px-3">Region</th>
                  <th className="text-left py-2 px-3">VPN</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((session, idx) => (
                  <tr
                    key={idx}
                    className="border-b border-border/50 hover:bg-bg-hover transition"
                  >
                    <td className="py-2 px-3 text-text-muted text-xs">
                      {formatDate(session.timestamp)}
                    </td>
                    <td className="py-2 px-3 font-mono text-text-muted">
                      {formatDuration(session.duration_secs)}
                    </td>
                    <td className={`py-2 px-3 font-mono font-semibold ${getPingColor(session.avg_ping_ms)}`}>
                      {session.avg_ping_ms.toFixed(1)}ms
                    </td>
                    <td className="py-2 px-3 font-mono text-success">
                      {session.min_ping_ms.toFixed(1)}ms
                    </td>
                    <td className="py-2 px-3 font-mono text-danger">
                      {session.max_ping_ms.toFixed(1)}ms
                    </td>
                    <td className="py-2 px-3 font-mono text-orange">
                      {session.jitter_ms.toFixed(1)}ms
                    </td>
                    <td className={`py-2 px-3 font-mono ${session.loss_percent > 0 ? "text-danger" : "text-success"}`}>
                      {session.loss_percent.toFixed(1)}%
                    </td>
                    <td className="py-2 px-3 font-mono text-accent2 uppercase">
                      {session.server_region || "--"}
                    </td>
                    <td className="py-2 px-3">
                      {session.vpn_active ? (
                        <span className="flex items-center gap-1 text-success text-xs">
                          <Shield size={12} /> On
                        </span>
                      ) : (
                        <span className="text-text-muted text-xs">Off</span>
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
          className={`fixed bottom-6 right-6 px-5 py-3 rounded-lg shadow-lg border flex items-center gap-2 text-sm z-50 max-w-md ${
            toast.type === "success"
              ? "bg-success/15 border-success/30 text-success"
              : "bg-danger/15 border-danger/30 text-danger"
          }`}
        >
          {toast.type === "success" ? (
            <CheckCircle size={16} />
          ) : (
            <XCircle size={16} />
          )}
          {toast.message}
        </div>
      )}
    </div>
  );
}
