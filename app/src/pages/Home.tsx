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
  { to: "/dashboard", icon: LayoutDashboard, label: "DASHBOARD", desc: "Overview & Valve infra", color: "accent", category: "Networking" },
  { to: "/network", icon: Network, label: "DIAGNOSTICS", desc: "Ping, traceroute, DNS", color: "accent2", category: "Networking" },
  { to: "/vpn", icon: Shield, label: "SMART VPN", desc: "One-click gaming VPN", color: "success", category: "Networking" },
  { to: "/servers", icon: Globe, label: "SERVER PICKER", desc: "Block & allow regions", color: "warning", category: "Networking" },
  { to: "/cs2config", icon: FileCode, label: "CS2 CONFIG", desc: "Autoexec & pro settings", color: "danger", category: "Gameplay" },
  { to: "/optimizer", icon: Settings2, label: "WINDOWS", desc: "Network optimizations", color: "orange", category: "Booster" },
  { to: "/history", icon: BarChart3, label: "HISTORY", desc: "Connection quality log", color: "accent", category: "Gameplay" },
  { to: "/settings", icon: Settings, label: "SETTINGS", desc: "App configuration", color: "accent2", category: "Personal" },
];

export default function Home() {
  const navigate = useNavigate();
  const [cs2Status, setCs2Status] = useState<Cs2Status>({ running: false, pid: null });
  const [vpnConnected, setVpnConnected] = useState(false);
  const [vpnDetails, setVpnDetails] = useState<{ server: string; ip: string; rx: string; tx: string } | null>(null);
  const [update, setUpdate] = useState<{ version: string; url: string | null } | null>(null);

  useEffect(() => {
    // CS2 status
    invoke<Cs2Status>("check_cs2").then(setCs2Status).catch(() => {});
    const cs2Int = setInterval(() => {
      invoke<Cs2Status>("check_cs2").then(setCs2Status).catch(() => {});
    }, 5000);

    // VPN status from localStorage
    const checkVpn = async () => {
      const connected = localStorage.getItem("cs2pt_vpn_connected") === "true";
      setVpnConnected(connected);
      if (connected) {
        const serverId = localStorage.getItem("cs2pt_vpn_server_id") || "";
        const ip = localStorage.getItem("cs2pt_vpn_ip") || "";
        try {
          const resp = await fetch("https://cs2-player-tools.maltinha.club/api/vpn-servers");
          const data = await resp.json();
          const srv = (data.servers || []).find((s: { id: string }) => s.id === serverId);
          const profileName = `smartvpn-${serverId}`;
          const status = await invoke<{ transfer_rx: string | null; transfer_tx: string | null }>("vpn_get_status", { profileName }).catch(() => ({ transfer_rx: null, transfer_tx: null }));
          setVpnDetails({
            server: srv ? `${srv.flag || ""} ${srv.name} — ${srv.location}` : serverId,
            ip,
            rx: status.transfer_rx || "0 B",
            tx: status.transfer_tx || "0 B",
          });
        } catch {
          setVpnDetails({ server: serverId, ip, rx: "—", tx: "—" });
        }
      } else {
        setVpnDetails(null);
      }
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
        <img src="/logo.png" alt="CS2 Player Tools" className="h-64 w-auto mx-auto" />
      </div>

      {/* Menu Grid — Gaming Style */}
      <div className="grid grid-cols-4 gap-3 w-full max-w-3xl mb-6">
        {menuButtons.map((btn) => {
          const c = btn.color;
          return (
            <button
              key={btn.to}
              onClick={() => navigate(btn.to)}
              className="group relative overflow-hidden transition-all duration-200 hover:scale-[1.04] active:scale-[0.97]"
            >
              {/* Clipped corner shape */}
              <div className={`
                relative flex flex-col items-center justify-center gap-1.5 py-5 px-3
                bg-gradient-to-b from-bg-card to-bg
                border border-border
                clip-gaming
                group-hover:border-${c}/60
                group-hover:shadow-[0_0_20px_rgba(230,126,34,0.15)]
                transition-all duration-200
              `}>
                {/* Top accent line */}
                <div className={`absolute top-0 left-[10%] right-[10%] h-[2px] bg-${c} opacity-40 group-hover:opacity-100 transition`} />

                {/* Glow bg on hover */}
                <div className={`absolute inset-0 bg-${c}/0 group-hover:bg-${c}/8 transition duration-300`} />

                {/* Icon */}
                <div className={`relative z-10 p-2 rounded-lg bg-${c}/10 group-hover:bg-${c}/20 transition`}>
                  <btn.icon size={24} className={`text-${c} drop-shadow-[0_0_6px_currentColor]`} />
                </div>

                {/* Label */}
                <span className="relative z-10 text-xs font-bold tracking-wider text-text group-hover:text-white transition">
                  {btn.label}
                </span>

                {/* Description */}
                <span className="relative z-10 text-[9px] text-text-muted/60 leading-tight text-center">
                  {btn.desc}
                </span>

                {/* Bottom scan line */}
                <div className={`absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-${c}/30 to-transparent`} />
              </div>
            </button>
          );
        })}
      </div>

      {/* Status Bar */}
      <div className="flex flex-col items-center gap-1">
        {/* Main status line */}
        <div className="flex items-center justify-center gap-4 text-xs text-text-muted">
          <div className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${cs2Status.running ? "bg-success animate-pulse" : "bg-text-muted/40"}`} />
            <span>{cs2Status.running ? "CS2 Running" : "CS2 Not Detected"}</span>
          </div>
          <span className="text-border">|</span>
          <div className="flex items-center gap-1.5">
            {vpnConnected ? (
              <><Wifi size={12} className="text-success" /><span className="text-success">VPN Connected</span></>
            ) : (
              <><WifiOff size={12} className="text-text-muted/40" /><span>VPN Off</span></>
            )}
          </div>
          <span className="text-border">|</span>
          <span>v{APP_VERSION}</span>
          {update && (
            <>
              <span className="text-border">|</span>
              <button onClick={() => update.url ? window.open(update.url, '_blank') : window.location.reload()}
                className="flex items-center gap-1 text-success hover:text-success/80 transition">
                <ArrowUpCircle size={12} className="animate-bounce" /> v{update.version}
              </button>
            </>
          )}
        </div>
        {/* VPN details line (only when connected) */}
        {vpnConnected && vpnDetails && (
          <div className="text-[10px] text-text-muted/70 font-mono text-center">
            {vpnDetails.server} · {vpnDetails.ip} · ↓{vpnDetails.rx} ↑{vpnDetails.tx}
          </div>
        )}
      </div>
    </div>
  );
}
