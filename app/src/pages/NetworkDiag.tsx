import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Search, Activity } from "lucide-react";

interface PingResult {
  seq: number;
  host: string;
  latency_ms: number;
  success: boolean;
  error: string | null;
}

export default function NetworkDiag() {
  const [host, setHost] = useState("162.254.197.1");
  const [count, setCount] = useState(10);
  const [results, setResults] = useState<PingResult[]>([]);
  const [running, setRunning] = useState(false);
  const [dnsHost, setDnsHost] = useState("steamcommunity.com");
  const [dnsResults, setDnsResults] = useState<string[]>([]);

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

  async function runDns() {
    try {
      const res = await invoke<string[]>("resolve_dns", { hostname: dnsHost });
      setDnsResults(res);
    } catch (e) {
      console.error(e);
    }
  }

  const successCount = results.filter((r) => r.success).length;
  const avgLatency = results.filter((r) => r.success).reduce((sum, r) => sum + r.latency_ms, 0) / (successCount || 1);
  const minLatency = Math.min(...results.filter((r) => r.success).map((r) => r.latency_ms), Infinity);
  const maxLatency = Math.max(...results.filter((r) => r.success).map((r) => r.latency_ms), 0);
  const lossPercent = results.length > 0 ? ((results.length - successCount) / results.length * 100) : 0;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-accent">Network Diagnostics</h1>
        <p className="text-text-muted text-sm mt-1">Ping, DNS resolution, and connection testing</p>
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
            <div className="grid grid-cols-4 gap-3 mb-4">
              <MiniStat label="Avg" value={`${avgLatency.toFixed(1)}ms`} color="text-accent2" />
              <MiniStat label="Min" value={`${minLatency === Infinity ? 0 : minLatency.toFixed(1)}ms`} color="text-success" />
              <MiniStat label="Max" value={`${maxLatency.toFixed(1)}ms`} color="text-warning" />
              <MiniStat label="Loss" value={`${lossPercent.toFixed(1)}%`} color={lossPercent > 0 ? "text-danger" : "text-success"} />
            </div>
            <div className="space-y-1">
              {results.map((r) => (
                <div key={r.seq} className={`flex items-center gap-3 px-3 py-1.5 rounded text-xs font-mono ${
                  r.success ? "text-text" : "text-danger bg-danger/5"
                }`}>
                  <span className="text-text-muted w-8">#{r.seq}</span>
                  <span className="flex-1">{r.host}</span>
                  {r.success ? (
                    <span className={r.latency_ms < 50 ? "text-success" : r.latency_ms < 100 ? "text-warning" : "text-danger"}>
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
              <div key={i} className="px-3 py-1.5 bg-bg rounded text-sm font-mono text-accent2">
                {ip}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-bg rounded-md border border-border px-3 py-2 text-center">
      <div className="text-[10px] text-text-muted uppercase tracking-wider">{label}</div>
      <div className={`text-lg font-bold font-mono ${color}`}>{value}</div>
    </div>
  );
}
