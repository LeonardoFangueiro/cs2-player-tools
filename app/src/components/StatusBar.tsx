import { useEffect, useState, useRef, useCallback } from "react";
import { invoke } from "../lib/tauri";
import { checkForUpdate } from "../lib/hq";
import {
  Wifi,
  WifiOff,
  ArrowUpCircle,
  LogOut,
} from "lucide-react";

interface Cs2Status {
  running: boolean;
  pid: number | null;
}

interface VpnServerInfo {
  id: string;
  name: string;
  location: string;
  country: string;
  country_code: string;
  endpoint: string;
}

const APP_VERSION = "0.1.0";
const HQ_BASE = "https://cs2-player-tools.maltinha.club/api";

export default function StatusBar() {
  const [cs2Status, setCs2Status] = useState<Cs2Status>({ running: false, pid: null });
  const [vpnConnected, setVpnConnected] = useState(false);
  const [vpnDetails, setVpnDetails] = useState<{
    server: string;
    countryCode: string;
    ip: string;
    rx: string;
    tx: string;
    latencyMs: number | null;
  } | null>(null);
  const [update, setUpdate] = useState<{ version: string; url: string | null } | null>(null);
  const [reconnecting, setReconnecting] = useState(false);

  // Cache server info so we don't re-fetch every 2s
  const serverInfoRef = useRef<VpnServerInfo | null>(null);
  const lastServerIdRef = useRef<string>("");
  const reconnectAttemptsRef = useRef(0);

  const fetchServerInfo = useCallback(async (serverId: string): Promise<VpnServerInfo | null> => {
    if (serverId === lastServerIdRef.current && serverInfoRef.current) {
      return serverInfoRef.current;
    }
    try {
      const resp = await fetch(`${HQ_BASE}/vpn-servers`);
      const data = await resp.json();
      const srv = (data.servers || []).find((s: VpnServerInfo) => s.id === serverId);
      if (srv) {
        serverInfoRef.current = srv;
        lastServerIdRef.current = serverId;
        return srv;
      }
    } catch {
      // Silent
    }
    return null;
  }, []);

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

    const pollTransfer = async () => {
      const connected = localStorage.getItem("cs2pt_vpn_connected") === "true";
      setVpnConnected(connected);
      if (!connected) {
        setVpnDetails(null);
        serverInfoRef.current = null;
        lastServerIdRef.current = "";
        return;
      }
      const serverId = localStorage.getItem("cs2pt_vpn_server_id") || "";
      const ip = localStorage.getItem("cs2pt_vpn_ip") || "";
      const profileName = `smartvpn-${serverId}`;

      // Fetch server info (cached after first call)
      const srvInfo = await fetchServerInfo(serverId);
      const serverLabel = srvInfo ? `${srvInfo.name} — ${srvInfo.location}, ${srvInfo.country}` : serverId;
      const countryCode = srvInfo?.country_code || "";

      // Get transfer stats + detect tunnel drops
      let rx = "0 B";
      let tx = "0 B";
      try {
        const status = await invoke<{ active: boolean; transfer_rx: string | null; transfer_tx: string | null }>("vpn_get_status", { profileName });
        rx = status.transfer_rx || "0 B";
        tx = status.transfer_tx || "0 B";

        // H7: Auto-reconnect when VPN tunnel drops
        if (connected && !status.active) {
          reconnectAttemptsRef.current++;
          if (reconnectAttemptsRef.current <= 3) {
            setReconnecting(true);
            try {
              await invoke("vpn_reconnect", { profileName });
              // Reconnect succeeded — reset counter
              reconnectAttemptsRef.current = 0;
              setReconnecting(false);
            } catch {
              setReconnecting(false);
              if (reconnectAttemptsRef.current >= 3) {
                // Give up after 3 failed attempts
                localStorage.removeItem("cs2pt_vpn_connected");
                localStorage.removeItem("cs2pt_vpn_server_id");
                localStorage.removeItem("cs2pt_vpn_ip");
                setVpnConnected(false);
                setVpnDetails(null);
                return;
              }
            }
          }
        } else if (status.active) {
          // Tunnel is healthy — reset counter
          reconnectAttemptsRef.current = 0;
          setReconnecting(false);
        }
      } catch {
        // Keep previous values or defaults
      }

      // Ping the VPN server endpoint for latency
      let latencyMs: number | null = null;
      if (srvInfo?.endpoint) {
        const serverIp = srvInfo.endpoint.split(":")[0];
        try {
          const pings = await invoke<Array<{ latency_ms: number; success: boolean }>>("ping_host", { host: serverIp, count: 1 });
          if (pings[0]?.success) {
            latencyMs = Math.round(pings[0].latency_ms);
          }
        } catch {
          // Silent
        }
      }

      setVpnDetails({
        server: serverLabel,
        countryCode,
        ip,
        rx,
        tx,
        latencyMs,
      });
    };
    pollTransfer();
    const vpnInt = setInterval(pollTransfer, 2000);

    checkForUpdate().then((info) => {
      if (info?.update_available) {
        setUpdate({ version: info.latest_version, url: info.download_url });
      }
    }).catch(() => {});

    return () => { clearInterval(cs2Int); clearInterval(vpnInt); };
  }, [fetchServerInfo]);

  function handleLogout() {
    localStorage.removeItem("cs2pt_token");
    window.location.reload();
  }

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
          {reconnecting ? (
            <><Wifi size={12} className="text-warning animate-pulse" /><span className="text-warning text-[10px] animate-pulse">Reconnecting...</span></>
          ) : vpnConnected ? (
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
        <span className="text-border">|</span>
        <button
          onClick={handleLogout}
          className="flex items-center gap-1 text-text-muted/50 hover:text-danger transition"
        >
          <LogOut size={10} />
          <span className="text-[10px]">Logout</span>
        </button>
      </div>
      {/* VPN details line (only when connected) */}
      {vpnConnected && vpnDetails && (
        <div className="flex items-center justify-center gap-1.5 text-[10px] text-text-muted/70 font-mono">
          {vpnDetails.countryCode && (
            <img src={`https://flagcdn.com/w20/${vpnDetails.countryCode.toLowerCase()}.png`} alt="" className="w-4 h-3 rounded-sm object-cover" />
          )}
          <span>{vpnDetails.server}</span>
          {vpnDetails.latencyMs !== null && (
            <>
              <span className="text-border">·</span>
              <span className={vpnDetails.latencyMs < 50 ? "text-success" : vpnDetails.latencyMs < 100 ? "text-warning" : "text-danger"}>
                {vpnDetails.latencyMs}ms
              </span>
            </>
          )}
          <span className="text-border">·</span>
          <span>{vpnDetails.ip}</span>
          <span className="text-border">·</span>
          <span className="text-success">&darr;{vpnDetails.rx}</span>
          <span className="text-orange">&uarr;{vpnDetails.tx}</span>
        </div>
      )}
    </div>
  );
}
