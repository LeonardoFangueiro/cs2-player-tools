import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Activity,
  Globe,
  Wifi,
  Clock,
  AlertTriangle,
} from "lucide-react";

interface SDRConfig {
  revision: number;
  pops: Array<{
    code: string;
    desc: string;
    geo: number[];
    relays: Array<{ ipv4: string; port_range: number[] }>;
  }>;
}

export default function Dashboard() {
  const [sdrConfig, setSdrConfig] = useState<SDRConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [popPings, setPopPings] = useState<Array<[string, number]>>([]);
  const [pinging, setPinging] = useState(false);

  useEffect(() => {
    loadSDRConfig();
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

  async function pingAllPops() {
    try {
      setPinging(true);
      const results = await invoke<Array<[string, number]>>("ping_all_pops");
      setPopPings(results);
    } catch (e) {
      setError(String(e));
    } finally {
      setPinging(false);
    }
  }

  const totalRelays = sdrConfig?.pops.reduce((sum, p) => sum + p.relays.length, 0) ?? 0;
  const europeCount = sdrConfig?.pops.filter(p =>
    ["ams","ams4","fra","fsn","hel","lhr","mad","par","sto","sto2","vie","waw"].includes(p.code)
  ).length ?? 0;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">
          <span className="text-accent">Dashboard</span>
        </h1>
        <p className="text-text-muted text-sm mt-1">Network overview & Valve infrastructure status</p>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard
          icon={<Globe size={18} />}
          label="Valve PoPs"
          value={loading ? "..." : String(sdrConfig?.pops.length ?? 0)}
          color="text-accent"
        />
        <StatCard
          icon={<Wifi size={18} />}
          label="Total Relays"
          value={loading ? "..." : String(totalRelays)}
          color="text-accent2"
        />
        <StatCard
          icon={<Activity size={18} />}
          label="EU Datacenters"
          value={loading ? "..." : String(europeCount)}
          color="text-success"
        />
        <StatCard
          icon={<Clock size={18} />}
          label="SDR Revision"
          value={loading ? "..." : String(sdrConfig?.revision ?? 0)}
          color="text-warning"
        />
      </div>

      {error && (
        <div className="bg-danger/10 border border-danger/30 rounded-lg p-4 mb-6 flex items-center gap-3">
          <AlertTriangle size={16} className="text-danger" />
          <span className="text-sm text-danger">{error}</span>
        </div>
      )}

      {/* Ping All PoPs */}
      <div className="bg-bg-card border border-border rounded-lg p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold">Valve Relay Latency</h2>
          <button
            onClick={pingAllPops}
            disabled={pinging || loading}
            className="px-4 py-1.5 bg-accent text-white text-sm rounded-md hover:bg-accent/80 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {pinging ? "Pinging..." : "Ping All PoPs"}
          </button>
        </div>

        {popPings.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {popPings.filter(([, ms]) => ms > 0).map(([code, ms]) => (
              <div
                key={code}
                className="flex items-center justify-between px-3 py-2 bg-bg rounded-md border border-border"
              >
                <span className="text-sm font-mono font-semibold text-accent2">{code}</span>
                <span className={`text-sm font-mono ${
                  ms < 50 ? "text-success" : ms < 100 ? "text-warning" : "text-danger"
                }`}>
                  {ms.toFixed(1)}ms
                </span>
              </div>
            ))}
          </div>
        )}

        {popPings.length === 0 && !pinging && (
          <p className="text-text-muted text-sm">Click "Ping All PoPs" to measure latency to all Valve relay clusters.</p>
        )}
      </div>

      {/* PoP List */}
      {sdrConfig && (
        <div className="bg-bg-card border border-border rounded-lg p-5">
          <h2 className="text-base font-semibold mb-4">Valve Points of Presence</h2>
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
                  <tr key={pop.code} className="border-b border-border/50 hover:bg-bg-hover transition">
                    <td className="py-2 px-3 font-mono font-semibold text-accent2">{pop.code}</td>
                    <td className="py-2 px-3">{pop.desc || "—"}</td>
                    <td className="py-2 px-3 text-text-muted">{pop.relays.length}</td>
                    <td className="py-2 px-3 text-text-muted text-xs font-mono">
                      {pop.geo.length >= 2 ? `${pop.geo[0].toFixed(2)}, ${pop.geo[1].toFixed(2)}` : "—"}
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

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <div className="bg-bg-card border border-border rounded-lg p-4 flex flex-col gap-2">
      <div className="flex items-center gap-2 text-text-muted">
        <span className={color}>{icon}</span>
        <span className="text-xs uppercase tracking-wider">{label}</span>
      </div>
      <span className={`text-2xl font-bold ${color}`}>{value}</span>
    </div>
  );
}
