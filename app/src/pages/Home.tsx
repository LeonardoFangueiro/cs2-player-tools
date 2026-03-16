import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { invoke } from "../lib/tauri";
import { checkForUpdate } from "../lib/hq";
import {
  LayoutDashboard,
  Network,
  Shield,
  Globe,
  Settings2,
  FileCode,
  BarChart3,
  Settings,
  Wifi,
  WifiOff,
  ArrowUpCircle,
} from "lucide-react";

interface Cs2Status {
  running: boolean;
  pid: number | null;
}

const APP_VERSION = "0.1.0";

interface MenuButton {
  to: string;
  icon: typeof LayoutDashboard;
  label: string;
  desc: string;
  color: string;
  category: string;
}

const menuButtons: MenuButton[] = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard", desc: "Overview & Valve infra", color: "from-accent/20 to-accent/5 border-accent/30 hover:border-accent/60", category: "Networking" },
  { to: "/network", icon: Network, label: "Diagnostics", desc: "Ping, traceroute, DNS", color: "from-accent2/20 to-accent2/5 border-accent2/30 hover:border-accent2/60", category: "Networking" },
  { to: "/vpn", icon: Shield, label: "Smart VPN", desc: "One-click gaming VPN", color: "from-success/20 to-success/5 border-success/30 hover:border-success/60", category: "Networking" },
  { to: "/servers", icon: Globe, label: "Server Picker", desc: "Block & allow regions", color: "from-warning/20 to-warning/5 border-warning/30 hover:border-warning/60", category: "Networking" },
  { to: "/cs2config", icon: FileCode, label: "CS2 Config", desc: "Autoexec & pro settings", color: "from-danger/20 to-danger/5 border-danger/30 hover:border-danger/60", category: "Gameplay" },
  { to: "/optimizer", icon: Settings2, label: "Windows", desc: "Network optimizations", color: "from-orange/20 to-orange/5 border-orange/30 hover:border-orange/60", category: "Booster" },
  { to: "/history", icon: BarChart3, label: "History", desc: "Connection quality log", color: "from-accent/15 to-accent/5 border-accent/20 hover:border-accent/50", category: "Gameplay" },
  { to: "/settings", icon: Settings, label: "Settings", desc: "App configuration", color: "from-text-muted/10 to-text-muted/5 border-border hover:border-text-muted/40", category: "Personal" },
];

export default function Home() {
  const navigate = useNavigate();
  const [cs2Status, setCs2Status] = useState<Cs2Status>({ running: false, pid: null });
  const [vpnConnected, setVpnConnected] = useState(false);
  const [update, setUpdate] = useState<{ version: string; url: string | null } | null>(null);

  useEffect(() => {
    // CS2 status
    invoke<Cs2Status>("check_cs2").then(setCs2Status).catch(() => {});
    const cs2Int = setInterval(() => {
      invoke<Cs2Status>("check_cs2").then(setCs2Status).catch(() => {});
    }, 5000);

    // VPN status from localStorage
    const checkVpn = () => {
      const connected = localStorage.getItem("cs2pt_vpn_connected") === "true";
      setVpnConnected(connected);
    };
    checkVpn();
    const vpnInt = setInterval(checkVpn, 2000);

    // Update check
    checkForUpdate().then((info) => {
      if (info?.update_available) {
        setUpdate({ version: info.latest_version, url: info.download_url });
      }
    }).catch(() => {});

    return () => { clearInterval(cs2Int); clearInterval(vpnInt); };
  }, []);

  return (
    <div className="h-full flex flex-col items-center justify-center px-8 py-6">
      {/* Logo */}
      <div className="mb-6">
        <img src="/logo.png" alt="CS2 Player Tools" className="h-24 w-auto mx-auto" />
      </div>

      {/* Menu Grid */}
      <div className="grid grid-cols-4 gap-3 w-full max-w-3xl mb-6">
        {menuButtons.map((btn) => (
          <button
            key={btn.to}
            onClick={() => navigate(btn.to)}
            className={`group relative flex flex-col items-center justify-center gap-2 p-5 rounded-xl border bg-gradient-to-b transition-all duration-200 hover:scale-[1.03] hover:shadow-lg active:scale-[0.98] ${btn.color}`}
          >
            <btn.icon size={28} className="text-text group-hover:text-accent transition" />
            <span className="text-sm font-semibold text-text">{btn.label}</span>
            <span className="text-[10px] text-text-muted leading-tight text-center">{btn.desc}</span>
          </button>
        ))}
      </div>

      {/* Status Bar */}
      <div className="flex items-center justify-center gap-4 text-xs text-text-muted">
        {/* CS2 Status */}
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${cs2Status.running ? "bg-success animate-pulse" : "bg-text-muted/40"}`} />
          <span>{cs2Status.running ? "CS2 Running" : "CS2 Not Detected"}</span>
        </div>

        <span className="text-border">|</span>

        {/* VPN Status */}
        <div className="flex items-center gap-1.5">
          {vpnConnected ? (
            <>
              <Wifi size={12} className="text-success" />
              <span className="text-success">VPN Connected</span>
            </>
          ) : (
            <>
              <WifiOff size={12} className="text-text-muted/40" />
              <span>VPN Off</span>
            </>
          )}
        </div>

        <span className="text-border">|</span>

        {/* Version */}
        <span>v{APP_VERSION}</span>

        {/* Update */}
        {update && (
          <>
            <span className="text-border">|</span>
            <button
              onClick={() => update.url ? window.open(update.url, '_blank') : window.location.reload()}
              className="flex items-center gap-1 text-success hover:text-success/80 transition"
            >
              <ArrowUpCircle size={12} className="animate-bounce" />
              v{update.version}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
