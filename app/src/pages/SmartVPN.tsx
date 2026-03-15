import { Shield, Zap, Globe, Key } from "lucide-react";

export default function SmartVPN() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-accent">Smart VPN</h1>
        <p className="text-text-muted text-sm mt-1">WireGuard gaming VPN with intelligent routing</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <ToolCard icon={<Key size={20} />} title="VPN Profiles" desc="Create and manage WireGuard tunnel configurations" status="Coming Soon" />
        <ToolCard icon={<Zap size={20} />} title="Auto-Connect" desc="Automatically activate VPN when CS2 launches" status="Coming Soon" />
        <ToolCard icon={<Globe size={20} />} title="Split Tunnel" desc="Route only Valve traffic through VPN (dynamic SDR IP fetch)" status="Coming Soon" />
        <ToolCard icon={<Shield size={20} />} title="Server Deploy" desc="One-click VPS provisioning with WireGuard setup" status="Coming Soon" />
      </div>
    </div>
  );
}

function ToolCard({ icon, title, desc, status }: { icon: React.ReactNode; title: string; desc: string; status: string }) {
  return (
    <div className="bg-bg-card border border-border rounded-lg p-5 hover:border-accent/30 transition">
      <div className="flex items-center gap-3 mb-3">
        <span className="text-accent2">{icon}</span>
        <h3 className="font-semibold">{title}</h3>
      </div>
      <p className="text-text-muted text-sm mb-3">{desc}</p>
      <span className="text-xs px-2 py-1 rounded-full bg-warning/15 text-warning">{status}</span>
    </div>
  );
}
