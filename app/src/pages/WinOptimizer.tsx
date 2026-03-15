import { Settings2, Monitor, Cpu, HardDrive } from "lucide-react";

export default function WinOptimizer() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-accent">Windows Optimizer</h1>
        <p className="text-text-muted text-sm mt-1">Network adapter and system optimization for CS2</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <ToolCard
          icon={<Monitor size={20} />}
          title="Network Adapter"
          desc="Optimize NIC settings: interrupt moderation, RSS, flow control, buffers"
          status="Coming Soon"
        />
        <ToolCard
          icon={<Cpu size={20} />}
          title="Registry Tweaks"
          desc="Nagle's algorithm, NetworkThrottlingIndex, MMCSS gaming priority"
          status="Coming Soon"
        />
        <ToolCard
          icon={<HardDrive size={20} />}
          title="TCP/IP Stack"
          desc="Auto-tuning, ECN, DCA, firewall rules for CS2"
          status="Coming Soon"
        />
        <ToolCard
          icon={<Settings2 size={20} />}
          title="DSCP / QoS"
          desc="Mark CS2 traffic with Expedited Forwarding priority"
          status="Coming Soon"
        />
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
