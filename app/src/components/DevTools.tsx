import { useState } from "react";
import { invoke } from "../lib/tauri";
import { isDevMode, runAndReportDiagnostics, getHQStats, sendFeedback } from "../lib/hq";
import {
  Bug,
  X,
  Loader,
  CheckCircle,
  XCircle,
  Activity,
  Download,
  BarChart3,
} from "lucide-react";

interface DiagTest {
  status: string;
  [key: string]: unknown;
}

export default function DevTools() {
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<Record<string, unknown> | null>(null);
  const [reportId, setReportId] = useState<string | null>(null);
  const [stats, setStats] = useState<Record<string, unknown> | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [onlineCount, setOnlineCount] = useState(0);
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackType, setFeedbackType] = useState("bug");
  const [sendingFeedback, setSendingFeedback] = useState(false);

  if (!isDevMode()) return null;

  async function handleRunDiagnostics() {
    setRunning(true);
    setResults(null);
    setReportId(null);
    try {
      const { results: r, reportId: id } = await runAndReportDiagnostics(invoke);
      setResults(r);
      setReportId(id ?? null);
    } catch (e) {
      setResults({ error: String(e) });
    } finally {
      setRunning(false);
    }
  }

  async function handleLoadStats() {
    setLoadingStats(true);
    const s = await getHQStats();
    setStats(s);
    // Get online count
    try {
      const resp = await fetch("https://cs2-player-tools.maltinha.club/api/clients");
      const data = await resp.json();
      setOnlineCount(data.online ?? 0);
    } catch {}
    setLoadingStats(false);
  }

  const tests = (results?.tests ?? {}) as Record<string, DiagTest>;
  const summary = (results?.summary ?? {}) as { total?: number; passed?: number; failed?: number };

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={() => { setOpen(!open); if (!open && !stats) handleLoadStats(); }}
        className="fixed bottom-6 left-6 z-50 w-12 h-12 rounded-full bg-accent text-white shadow-lg hover:bg-accent/80 transition flex items-center justify-center"
        title="Dev Tools"
      >
        <Bug size={20} />
      </button>

      {/* Panel */}
      {open && (
        <div className="fixed bottom-20 left-6 z-50 w-[480px] max-h-[70vh] bg-bg-card border border-accent/40 rounded-xl shadow-2xl flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-accent/5">
            <div className="flex items-center gap-2">
              <Bug size={16} className="text-accent" />
              <span className="text-sm font-bold text-accent">Dev Tools</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-warning/15 text-warning font-semibold">DEV ONLY</span>
              {onlineCount > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-success/15 text-success font-semibold">Online: {onlineCount}</span>
              )}
            </div>
            <button onClick={() => setOpen(false)} className="text-text-muted hover:text-text transition">
              <X size={16} />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* HQ Stats */}
            {stats && (
              <div className="bg-bg rounded-lg border border-border p-3">
                <h3 className="text-xs font-bold text-accent2 uppercase tracking-wider mb-2 flex items-center gap-1">
                  <BarChart3 size={12} /> HQ Stats
                </h3>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="text-center">
                    <div className="text-text-muted">Errors</div>
                    <div className="text-lg font-bold text-danger">{(stats as any).total_errors ?? 0}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-text-muted">Diagnostics</div>
                    <div className="text-lg font-bold text-accent">{(stats as any).total_diagnostics ?? 0}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-text-muted">Users 24h</div>
                    <div className="text-lg font-bold text-success">{(stats as any).unique_users_24h ?? 0}</div>
                  </div>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2">
              <button
                onClick={handleRunDiagnostics}
                disabled={running}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-accent text-white text-sm rounded-lg hover:bg-accent/80 transition disabled:opacity-50"
              >
                {running ? <Loader size={14} className="animate-spin" /> : <Activity size={14} />}
                {running ? "Running..." : "Run Diagnostics"}
              </button>
              <button
                onClick={handleLoadStats}
                disabled={loadingStats}
                className="flex items-center gap-2 px-3 py-2 bg-bg-card border border-border text-sm rounded-lg text-text-muted hover:text-text transition disabled:opacity-50"
              >
                {loadingStats ? <Loader size={14} className="animate-spin" /> : <BarChart3 size={14} />}
                Refresh
              </button>
              <a
                href="https://cs2-player-tools.maltinha.club/downloads/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-2 bg-success/15 border border-success/30 text-sm rounded-lg text-success hover:bg-success/25 transition"
              >
                <Download size={14} /> .exe
              </a>
            </div>

            {/* Diagnostics Results */}
            {results && (
              <div className="space-y-2">
                {/* Summary */}
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-text-muted">Results:</span>
                  <span className="text-success flex items-center gap-1">
                    <CheckCircle size={12} /> {summary.passed ?? 0} passed
                  </span>
                  <span className="text-danger flex items-center gap-1">
                    <XCircle size={12} /> {summary.failed ?? 0} failed
                  </span>
                  {reportId && (
                    <span className="text-text-muted text-xs ml-auto">ID: {reportId}</span>
                  )}
                </div>

                {/* Individual Tests */}
                {Object.entries(tests).map(([name, test]) => (
                  <div key={name} className={`flex items-start gap-2 px-3 py-2 rounded-lg text-xs ${
                    test.status === "pass" ? "bg-success/5 border border-success/20" : "bg-danger/5 border border-danger/20"
                  }`}>
                    {test.status === "pass" ? (
                      <CheckCircle size={12} className="text-success mt-0.5 shrink-0" />
                    ) : (
                      <XCircle size={12} className="text-danger mt-0.5 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold font-mono">{name}</div>
                      <div className="text-text-muted truncate">
                        {test.status === "pass"
                          ? Object.entries(test)
                              .filter(([k]) => k !== "status")
                              .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
                              .join(", ")
                          : (test as any).error ?? "Failed"
                        }
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Feedback */}
            <div className="bg-bg rounded-lg border border-border p-3">
              <h3 className="text-xs font-bold text-accent2 uppercase tracking-wider mb-2">Send Feedback</h3>
              <div className="flex gap-2 mb-2">
                {["bug", "feature", "other"].map(t => (
                  <button key={t} onClick={() => setFeedbackType(t)}
                    className={`px-2 py-1 text-[10px] rounded ${feedbackType === t ? "bg-accent/20 text-accent" : "bg-bg-card text-text-muted"}`}>
                    {t}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <input value={feedbackText} onChange={e => setFeedbackText(e.target.value)}
                  placeholder="Describe..." className="flex-1 bg-bg-card border border-border rounded px-2 py-1 text-xs text-text" />
                <button onClick={async () => {
                  if (!feedbackText.trim()) return;
                  setSendingFeedback(true);
                  await sendFeedback(feedbackType, feedbackText);
                  setFeedbackText("");
                  setSendingFeedback(false);
                }} disabled={sendingFeedback} className="px-2 py-1 bg-accent text-white text-xs rounded disabled:opacity-50">
                  {sendingFeedback ? "..." : "Send"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
