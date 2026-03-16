import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Network,
  Settings2,
  Shield,
  Globe,
  FileCode,
  BarChart3,
  Settings,
  ArrowUpCircle,
  ArrowDown,
  ArrowUp,
  Wifi,
} from "lucide-react";
import { invoke } from "../lib/tauri";
import { checkForUpdate } from "../lib/hq";

interface Cs2Status {
  running: boolean;
  pid: number | null;
}

interface VpnStatus {
  active: boolean;
  profile_name: string | null;
  endpoint: string | null;
  transfer_rx: string | null;
  transfer_tx: string | null;
  latest_handshake: string | null;
  error: string | null;
}

interface UpdateInfo {
  available: boolean;
  version: string;
  url: string | null;
  changelog: string;
}

const APP_VERSION = "0.1.0";

interface NavSection {
  label: string;
  items: { to: string; icon: typeof LayoutDashboard; label: string }[];
}

const navSections: NavSection[] = [
  {
    label: "Networking",
    items: [
      { to: "/", icon: LayoutDashboard, label: "Dashboard" },
      { to: "/network", icon: Network, label: "Diagnostics" },
      { to: "/vpn", icon: Shield, label: "Smart VPN" },
      { to: "/servers", icon: Globe, label: "Server Picker" },
    ],
  },
  {
    label: "Gameplay",
    items: [
      { to: "/cs2config", icon: FileCode, label: "CS2 Config" },
      { to: "/history", icon: BarChart3, label: "History" },
    ],
  },
  {
    label: "Booster",
    items: [
      { to: "/optimizer", icon: Settings2, label: "Win Optimizer" },
    ],
  },
  {
    label: "Personal",
    items: [
      { to: "/settings", icon: Settings, label: "Settings" },
    ],
  },
];

export default function Sidebar() {
  const [cs2Status, setCs2Status] = useState<Cs2Status>({ running: false, pid: null });
  const [vpnStatus, setVpnStatus] = useState<VpnStatus | null>(null);
  const [vpnIp, setVpnIp] = useState<string | null>(null);
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    checkCs2();
    checkVpn();
    doUpdateCheck();

    const cs2Interval = setInterval(checkCs2, 5000);
    const vpnInterval = setInterval(checkVpn, 2000); // 2s for near-realtime transfer stats
    const updateInterval = setInterval(doUpdateCheck, 300000);

    return () => {
      clearInterval(cs2Interval);
      clearInterval(vpnInterval);
      clearInterval(updateInterval);
    };
  }, []);

  async function checkCs2() {
    try {
      const status = await invoke<Cs2Status>("check_cs2");
      setCs2Status(status);
    } catch {
      setCs2Status({ running: false, pid: null });
    }
  }

  async function checkVpn() {
    try {
      // Try to get status of any active VPN profile
      const profiles = await invoke<string[]>("vpn_list_profiles");
      for (const name of profiles) {
        const status = await invoke<VpnStatus>("vpn_get_status", { profileName: name });
        if (status.active) {
          setVpnStatus(status);
          // Try to get the VPN IP (client address from profile)
          try {
            const profile = await invoke<{ client_address: string }>("vpn_load_profile", { profileName: name });
            setVpnIp(profile.client_address?.split('/')[0] || null);
          } catch {
            setVpnIp(null);
          }
          return;
        }
      }
      setVpnStatus(null);
      setVpnIp(null);
    } catch {
      setVpnStatus(null);
      setVpnIp(null);
    }
  }

  async function doUpdateCheck() {
    try {
      const info = await checkForUpdate();
      if (info && info.update_available && info.latest_version !== APP_VERSION) {
        setUpdate({
          available: true,
          version: info.latest_version,
          url: info.download_url,
          changelog: info.changelog,
        });
      }
    } catch {}
  }

  async function handleUpdate() {
    if (!update?.url) {
      window.location.reload();
      return;
    }
    setUpdating(true);
    const isFrontendOnly = update.version.startsWith(APP_VERSION.split('.').slice(0, 2).join('.'));
    if (isFrontendOnly) {
      window.location.reload();
    } else {
      window.open(update.url, '_blank');
    }
    setUpdating(false);
  }

  return (
    <aside className="w-[220px] h-screen flex flex-col border-r border-border bg-bg-card shrink-0">
      {/* Logo */}
      <div className="p-3 border-b border-border">
        <img src="/logo.png" alt="CS2 Player Tools" className="w-full h-auto" />
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-2 flex flex-col gap-0 overflow-y-auto">
        {navSections.map((section) => (
          <div key={section.label}>
            <div className="px-5 pt-3 pb-1 text-[9px] font-bold uppercase tracking-[1.5px] text-text-muted/50">
              {section.label}
            </div>
            {section.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-5 py-2 text-[12px] transition-all border-l-3 ${
                    isActive
                      ? "text-accent border-accent bg-accent/8"
                      : "text-text-muted border-transparent hover:text-text hover:bg-bg-hover hover:border-accent2"
                  }`
                }
              >
                <item.icon size={14} />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      {/* Update Banner */}
      {update?.available && (
        <div className="mx-3 mb-2 overflow-hidden">
          <button
            onClick={handleUpdate}
            disabled={updating}
            className="w-full flex items-center gap-2 px-2.5 py-2 bg-success/10 border border-success/30 rounded-lg text-[11px] text-success hover:bg-success/20 transition overflow-hidden"
          >
            <ArrowUpCircle size={14} className={`shrink-0 ${updating ? "animate-spin" : "animate-bounce"}`} />
            <div className="flex-1 min-w-0 text-left overflow-hidden">
              <div className="font-semibold truncate">v{update.version}</div>
              <div className="text-[9px] text-success/70 truncate">{update.changelog}</div>
            </div>
          </button>
        </div>
      )}

      {/* VPN Status */}
      {vpnStatus?.active && (
        <div className="mx-3 mb-2 bg-accent2/8 border border-accent2/25 rounded-lg p-2.5 overflow-hidden">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Wifi size={12} className="text-accent2 shrink-0" />
            <span className="text-[10px] font-semibold text-accent2 truncate">
              VPN {vpnStatus.profile_name || "Connected"}
            </span>
          </div>
          {/* VPN IP */}
          {vpnIp && (
            <div className="text-[9px] text-accent2/70 font-mono mb-1.5 truncate">
              IP: {vpnIp}
            </div>
          )}
          {/* Transfer Stats */}
          <div className="flex items-center gap-3 text-[9px] font-mono">
            <div className="flex items-center gap-1 text-success">
              <ArrowDown size={9} className="shrink-0" />
              <span>{vpnStatus.transfer_rx || "0 B"}</span>
            </div>
            <div className="flex items-center gap-1 text-orange">
              <ArrowUp size={9} className="shrink-0" />
              <span>{vpnStatus.transfer_tx || "0 B"}</span>
            </div>
          </div>
        </div>
      )}

      {/* CS2 Status */}
      <div className="px-5 py-3 border-t border-border">
        <div className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${
              cs2Status.running ? "bg-success animate-pulse" : "bg-text-muted"
            }`}
          />
          <span className="text-[11px] text-text-muted">
            {cs2Status.running ? "CS2 Running" : "CS2 Not Detected"}
          </span>
        </div>
      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-border">
        <p className="text-[10px] text-text-muted">v{APP_VERSION}</p>
      </div>
    </aside>
  );
}
