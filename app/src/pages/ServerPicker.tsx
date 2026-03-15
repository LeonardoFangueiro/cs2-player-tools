import { MapPin, Lock, Unlock } from "lucide-react";

export default function ServerPicker() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-accent">Server Picker</h1>
        <p className="text-text-muted text-sm mt-1">Select and lock preferred Valve datacenter regions</p>
      </div>

      <div className="bg-bg-card border border-border rounded-lg p-5 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <MapPin size={16} className="text-accent2" />
          <h2 className="text-base font-semibold">Region Map</h2>
        </div>
        <div className="h-64 bg-bg rounded-lg border border-border flex items-center justify-center text-text-muted">
          Interactive world map with Valve PoPs — Coming Soon
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <ToolCard icon={<Lock size={20} />} title="Region Lock" desc="Block unwanted datacenter IPs via Windows Firewall rules" status="Coming Soon" />
        <ToolCard icon={<Unlock size={20} />} title="Auto-Select" desc="Automatically pick best regions based on real-time ping" status="Coming Soon" />
      </div>
    </div>
  );
}

function ToolCard({ icon, title, desc, status }: { icon: React.ReactNode; title: string; desc: string; status: string }) {
  return (
    <div className="bg-bg-card border border-border rounded-lg p-5 hover:border-accent/30 transition">
      <div className="flex items-center gap-3 mb-3">
        <span className="text-accent">{icon}</span>
        <h3 className="font-semibold">{title}</h3>
      </div>
      <p className="text-text-muted text-sm mb-3">{desc}</p>
      <span className="text-xs px-2 py-1 rounded-full bg-warning/15 text-warning">{status}</span>
    </div>
  );
}
