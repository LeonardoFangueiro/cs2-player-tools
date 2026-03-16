import { useEffect, useState } from "react";
import { invoke } from "../lib/tauri";
import { checkForUpdate } from "../lib/hq";
import {
  Wifi,
  WifiOff,
  ArrowUpCircle,
} from "lucide-react";

interface Cs2Status {
  running: boolean;
  pid: number | null;
}

const APP_VERSION = "0.1.0";

export default function StatusBar() {
  const [cs2Status, setCs2Status] = useState<Cs2Status>({ running: false, pid: null });
  const [vpnConnected, setVpnConnected] = useState(false);
  const [vpnDetails, setVpnDetails] = useState<{ server: string; countryCode: string; ip: string; rx: string; tx: string } | null>(null);
  const [update, setUpdate] = useState<{ version: string; url: string | null } | null>(null);

  useEffect(() => {
    const checkCs2 = () => {
      invoke<Cs2Status>("check_cs2")
        .then(setCs2Status)
        .catch(() => setCs2Status({ running: false, pid: null }));
    };
    checkCs2();
    setTimeout(checkCs2, 1000);
    setTimeout(checkCs2, 3000);
    const cs2Int = setInterval(checkCs2, 5000);

    let serverLabel = "";
    let serverCC = "";
    const initVpn = async () => {
      const connected = localStorage.getItem("cs2pt_vpn_connected") === "true";
      setVpnConnected(connected);
      if (connected) {
        const serverId = localStorage.getItem("cs2pt_vpn_server_id") || "";
        try {
          const resp = await fetch("https://cs2-player-tools.maltinha.club/api/vpn-servers");
          const data = await resp.json();
          const srv = (data.servers || []).find((s: { id: string }) => s.id === serverId);
          serverLabel = srv ? `${srv.name} — ${srv.location}` : serverId;
          serverCC = srv?.country_code || "";
        } catch {
          serverLabel = serverId;
        }
      }
    };
    initVpn();

    const pollTransfer = async () => {
      const connected = localStorage.getItem("cs2pt_vpn_connected") === "true";
      setVpnConnected(connected);
      if (!connected) { setVpnDetails(null); return; }
      const serverId = localStorage.getItem("cs2pt_vpn_server_id") || "";
      const ip = localStorage.getItem("cs2pt_vpn_ip") || "";
      const profileName = `smartvpn-${serverId}`;
      try {
        const status = await invoke<{ transfer_rx: string | null; transfer_tx: string | null }>("vpn_get_status", { profileName });
        setVpnDetails({
          server: serverLabel || serverId,
          countryCode: serverCC,
          ip,
          rx: status.transfer_rx || "0 B",
          tx: status.transfer_tx || "0 B",
        });
      } catch {
        setVpnDetails(prev => prev ? { ...prev, rx: "—", tx: "—" } : null);
      }
    };
    pollTransfer();
    const vpnInt = setInterval(pollTransfer, 2000);

    checkForUpdate().then((info) => {
      if (info?.update_available) {
        setUpdate({ version: info.latest_version, url: info.download_url });
      }
    }).catch(() => {});

    return () => { clearInterval(cs2Int); clearInterval(vpnInt); };
  }, []);

  return (
    <div className="shrink-0 border-t border-border bg-bg-card/50 px-4 py-2 flex flex-col items-center gap-0.5">
      {/* Main status line */}
      <div className="flex items-center justify-center gap-4 text-xs text-text-muted">
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${cs2Status.running ? "bg-success animate-pulse" : "bg-text-muted/40"}`} />
          <span>{cs2Status.running ? "CS2 Running" : "CS2 Not Running"}</span>
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
        <div className="flex items-center justify-center gap-1.5 text-[10px] text-text-muted/70 font-mono">
          {vpnDetails.countryCode && (
            <img src={`https://flagcdn.com/w20/${vpnDetails.countryCode.toLowerCase()}.png`} alt="" className="w-4 h-3 rounded-sm object-cover" />
          )}
          <span>{vpnDetails.server}</span>
          <span className="text-border">·</span>
          <span>{vpnDetails.ip}</span>
          <span className="text-border">·</span>
          <span className="text-success">↓{vpnDetails.rx}</span>
          <span className="text-orange">↑{vpnDetails.tx}</span>
        </div>
      )}
    </div>
  );
}
