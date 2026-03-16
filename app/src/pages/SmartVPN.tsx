import { useEffect, useState, useRef, useCallback } from "react";
import { invoke } from "../lib/tauri";
import {
  Shield,
  Globe,
  Wifi,
  WifiOff,
  Loader,
  CheckCircle,
  XCircle,
  Server,
  Zap,
  Lock,
  ArrowDownUp,
  Timer,
  Monitor,
  Users,
  Key,
  RefreshCw,
  Star,
  X,
  AlertTriangle,
  Info,
} from "lucide-react";

// ── Constants ──

const HQ_BASE = "https://cs2-player-tools.maltinha.club/api";

// ── Types ──

interface VpnServer {
  id: string;
  name: string;
  location: string;
  country: string;
  flag: string;
  endpoint: string;
  public_key: string;
  lat: number;
  lng: number;
  max_clients: number;
  current_clients: number;
  country_code: string;
}

interface VpnConnectResponse {
  server_endpoint: string;
  server_public_key: string;
  client_address: string;
  dns: string;
  mtu: number;
  allowed_ips: string;
  persistent_keepalive: number;
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

interface PingResult {
  seq: number;
  host: string;
  latency_ms: number;
  success: boolean;
  error: string | null;
}

interface Toast {
  id: number;
  message: string;
  type: "success" | "error" | "warning" | "info";
  timestamp: number;
}

interface PreConnectCheck {
  serverId: string;
  serverName: string;
  avgLatency: number | null;
  status: "pinging" | "done" | "error";
}

type ConnectionState = "disconnected" | "connecting" | "connected" | "disconnecting";

// ── Helpers ──

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

// VPN servers have SSH open (port 22), use that for TCP ping since WireGuard is UDP-only
function extractPingTarget(endpoint: string): string {
  const ip = endpoint.split(":")[0];
  return `${ip}:22`;
}

function latencyQuality(ms: number): { label: string; color: string } {
  if (ms < 50) return { label: "Good", color: "text-success" };
  if (ms < 100) return { label: "Fair", color: "text-warning" };
  return { label: "Poor", color: "text-danger" };
}

function getPingColor(ms: number): string {
  if (ms < 50) return "text-success";
  if (ms < 100) return "text-warning";
  return "text-danger";
}

function getContinent(country: string): string {
  const EU = ['Germany','France','Netherlands','Spain','Sweden','Poland','Austria','Finland','UK','England','Romania','Turkey','Italy','Portugal','Belgium','Czech','Norway','Denmark','Ireland','Switzerland'];
  const NA = ['United States','Canada','Mexico'];
  const SA = ['Brazil','Chile','Argentina','Peru','Colombia'];
  const AS = ['Singapore','Hong Kong','Japan','South Korea','India','China','UAE','Taiwan','Thailand','Indonesia','Malaysia','Philippines'];
  const OC = ['Australia','New Zealand'];
  const AF = ['South Africa','Nigeria','Egypt','Kenya'];

  if (EU.some(c => country.includes(c))) return 'Europe';
  if (NA.some(c => country.includes(c))) return 'North America';
  if (SA.some(c => country.includes(c))) return 'South America';
  if (AS.some(c => country.includes(c))) return 'Asia';
  if (OC.some(c => country.includes(c))) return 'Oceania';
  if (AF.some(c => country.includes(c))) return 'Africa';
  return 'Global';
}


// ── Toast Notification System ──

let toastIdCounter = 0;

function ToastContainer({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}) {
  if (toasts.length === 0) return null;

  function getIcon(type: Toast["type"]) {
    switch (type) {
      case "success":
        return <CheckCircle size={14} className="text-success shrink-0" />;
      case "error":
        return <XCircle size={14} className="text-danger shrink-0" />;
      case "warning":
        return <AlertTriangle size={14} className="text-warning shrink-0" />;
      case "info":
        return <Info size={14} className="text-accent shrink-0" />;
    }
  }

  function getBorderColor(type: Toast["type"]) {
    switch (type) {
      case "success":
        return "border-success/40";
      case "error":
        return "border-danger/40";
      case "warning":
        return "border-warning/40";
      case "info":
        return "border-accent/40";
    }
  }

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`bg-bg-card border ${getBorderColor(toast.type)} rounded-lg p-3 flex items-start gap-2 shadow-lg animate-[slideIn_0.3s_ease-out]`}
        >
          {getIcon(toast.type)}
          <span className="text-xs text-text flex-1">{toast.message}</span>
          <button
            onClick={() => onDismiss(toast.id)}
            className="text-text-muted hover:text-text transition shrink-0"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

// ── Pre-Connect Quality Check Modal ──
// Auto-connects if ping is good (<100ms). Only shows buttons if ping is bad or failed.

function PreConnectModal({
  check,
  onProceed,
  onCancel,
}: {
  check: PreConnectCheck;
  onProceed: () => void;
  onCancel: () => void;
}) {
  const quality =
    check.avgLatency !== null ? latencyQuality(check.avgLatency) : null;
  const isGoodPing = check.avgLatency !== null && check.avgLatency <= 100;
  const isHighLatency = check.avgLatency !== null && check.avgLatency > 150;

  // Auto-connect if ping is good
  useEffect(() => {
    if (check.status === "done" && isGoodPing) {
      const timer = setTimeout(onProceed, 500); // Small delay so user sees the result
      return () => clearTimeout(timer);
    }
  }, [check.status, isGoodPing]);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60">
      <div className="bg-bg-card border border-border rounded-lg p-4 max-w-xs w-full mx-4 shadow-2xl">
        <h3 className="font-semibold text-sm mb-3 flex items-center gap-1.5">
          <Zap size={14} className="text-accent" />
          {check.serverName}
        </h3>

        {check.status === "pinging" && (
          <div className="flex items-center gap-2 py-2">
            <Loader size={14} className="text-accent animate-spin" />
            <span className="text-xs text-text-muted">Testing connection quality...</span>
          </div>
        )}

        {check.status === "done" && check.avgLatency !== null && quality && (
          <div className="space-y-2">
            <div className="bg-bg/50 rounded-lg p-2 flex items-center justify-between">
              <span className="text-xs text-text-muted">Latency</span>
              <span className={`text-xs font-mono font-semibold ${quality.color}`}>
                {Math.round(check.avgLatency)}ms — {quality.label}
              </span>
            </div>

            {isGoodPing && (
              <div className="flex items-center gap-1.5 text-success text-xs">
                <Loader size={12} className="animate-spin" />
                Connecting...
              </div>
            )}

            {isHighLatency && (
              <div className="bg-danger/10 border border-danger/30 rounded-lg p-2 flex items-start gap-1.5">
                <AlertTriangle size={14} className="text-danger shrink-0 mt-0.5" />
                <span className="text-[10px] text-danger">
                  High latency — gaming experience may be affected
                </span>
              </div>
            )}
          </div>
        )}

        {check.status === "error" && (
          <div className="bg-warning/10 border border-warning/30 rounded-lg p-2 flex items-start gap-1.5">
            <AlertTriangle size={14} className="text-warning shrink-0 mt-0.5" />
            <span className="text-[10px] text-warning">
              Could not measure latency. You can still connect.
            </span>
          </div>
        )}

        {/* Only show buttons if ping is bad (>100ms) or failed */}
        {check.status !== "pinging" && !isGoodPing && (
          <div className="flex gap-2 mt-3">
            <button
              onClick={onCancel}
              className="flex-1 px-2.5 py-1 bg-bg border border-border rounded-lg text-[10px] text-text-muted hover:text-text transition"
            >
              Cancel
            </button>
            <button
              onClick={onProceed}
              className="flex-1 px-3 py-1.5 bg-accent/15 border border-accent/30 text-accent rounded-lg text-xs font-medium hover:bg-accent/25 transition"
            >
              Connect Anyway
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Network Diagram Component ──

function NetworkDiagram({ servers, connectedServerId, connectionState }: {
  servers: VpnServer[];
  connectedServerId: string | null;
  connectionState: ConnectionState;
}) {
  const connectedServer = servers.find(s => s.id === connectedServerId);
  const isConnected = connectionState === "connected";
  const isConnecting = connectionState === "connecting";

  return (
    <div className="bg-bg-card border border-border rounded-lg p-3 mb-4">
      <div className="flex items-center justify-center gap-2">
        {/* Your Device */}
        <div className={`flex flex-col items-center gap-1 px-3 py-2 rounded-lg border ${
          isConnected ? 'border-success/50 bg-success/5' : 'border-border bg-bg'
        }`}>
          <Monitor size={14} className={isConnected ? 'text-success' : 'text-text-muted'} />
          <span className="text-[10px] font-semibold">Your PC</span>
        </div>

        {/* Connection Line 1 */}
        <div className="flex items-center gap-0.5">
          {isConnected || isConnecting ? (
            <>
              <div className="w-5 h-px bg-success rounded" />
              <div className={`w-5 h-px bg-success rounded ${isConnecting ? 'animate-pulse' : ''}`} />
              <div className="w-5 h-px bg-success rounded" />
            </>
          ) : (
            <>
              <div className="w-5 h-px bg-border rounded" />
              <div className="w-5 h-px bg-border rounded" />
              <div className="w-5 h-px bg-border rounded" />
            </>
          )}
        </div>

        {/* VPN Server */}
        <div className={`flex flex-col items-center gap-1 px-3 py-2 rounded-lg border ${
          isConnected ? 'border-accent/50 bg-accent/5' : 'border-border bg-bg'
        }`}>
          <Shield size={14} className={isConnected ? 'text-accent' : 'text-text-muted'} />
          <span className="text-[10px] font-semibold">
            {connectedServer ? connectedServer.name : 'VPN Server'}
          </span>
          {isConnected && (
            <span className="text-[8px] text-success font-mono">Encrypted</span>
          )}
        </div>

        {/* Connection Line 2 */}
        <div className="flex items-center gap-0.5">
          {isConnected ? (
            <>
              <div className="w-5 h-px bg-accent rounded" />
              <div className="w-5 h-px bg-accent rounded" />
              <div className="w-5 h-px bg-accent rounded" />
            </>
          ) : (
            <>
              <div className="w-5 h-px bg-border rounded" />
              <div className="w-5 h-px bg-border rounded" />
              <div className="w-5 h-px bg-border rounded" />
            </>
          )}
        </div>

        {/* Valve Servers */}
        <div className={`flex flex-col items-center gap-1 px-3 py-2 rounded-lg border ${
          isConnected ? 'border-warning/50 bg-warning/5' : 'border-border bg-bg'
        }`}>
          <Globe size={14} className={isConnected ? 'text-warning' : 'text-text-muted'} />
          <span className="text-[10px] font-semibold">Valve CS2</span>
          {isConnected && (
            <span className="text-[8px] text-warning font-mono">Low Latency</span>
          )}
        </div>
      </div>

      {/* Status text */}
      <div className="text-center mt-2">
        <span className={`text-[10px] ${isConnected ? 'text-success' : isConnecting ? 'text-accent animate-pulse' : 'text-text-muted'}`}>
          {isConnected ? 'Connected — Traffic encrypted through VPN' :
           isConnecting ? 'Connecting...' :
           'Not connected — Select a server below'}
        </span>
      </div>
    </div>
  );
}

// ── Server Card Component ──

function ServerCard({
  server,
  ping,
  isConnected,
  isSelected,
  isFavorite,
  connectionState,
  onConnect,
  onDisconnect,
  onToggleFavorite,
}: {
  server: VpnServer;
  ping: number | null;
  isConnected: boolean;
  isSelected: boolean;
  isFavorite: boolean;
  connectionState: ConnectionState;
  onConnect: () => void;
  onDisconnect: () => void;
  onToggleFavorite: () => void;
}) {
  const isBusy = connectionState === "connecting" || connectionState === "disconnecting";

  return (
    <div
      className={`bg-bg-card border rounded-lg p-3 transition-all ${
        isConnected
          ? "border-success/50 shadow-[0_0_15px_rgba(85,239,196,0.1)]"
          : isFavorite
            ? "border-amber-500/50 shadow-[0_0_10px_rgba(245,158,11,0.1)]"
            : isSelected
              ? "border-accent/50"
              : "border-border hover:border-border/80"
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {/* Flag */}
          <img
            src={`https://flagcdn.com/w80/${(server.country_code || 'xx').toLowerCase()}.png`}
            alt={server.flag || server.country}
            className="w-7 h-5 rounded object-cover border border-border"
            onError={(e) => { (e.target as HTMLImageElement).src = ''; (e.target as HTMLImageElement).alt = server.flag || ''; }}
          />
          <div>
            <div className="font-semibold text-xs">{server.name}</div>
            <div className="text-[10px] text-text-muted">
              {server.location || server.country}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite();
            }}
            className={`p-0.5 rounded transition ${
              isFavorite
                ? "text-amber-400 hover:text-amber-300"
                : "text-text-muted/30 hover:text-text-muted"
            }`}
            title={isFavorite ? "Remove from favorites" : "Set as favorite"}
          >
            <Star size={14} fill={isFavorite ? "currentColor" : "none"} />
          </button>
          <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
        </div>
      </div>

      {/* Stats as inline badges */}
      <div className="flex items-center gap-1.5 mb-2 flex-wrap">
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-bg rounded border border-border text-[10px]">
          <Zap size={10} className={ping !== null ? getPingColor(ping) : ""} />
          {ping !== null ? (
            <span className={getPingColor(ping)}>{Math.round(ping)}ms</span>
          ) : (
            <span className="animate-pulse">...</span>
          )}
        </span>
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-bg rounded border border-border text-[10px] text-text-muted">
          <Users size={10} />
          {server.current_clients || 0}/{server.max_clients}
        </span>
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-bg rounded border border-border text-[10px] text-text-muted">
          <Globe size={10} />
          {getContinent(server.country)}
        </span>
      </div>

      {/* Action button */}
      {isConnected ? (
        <button
          onClick={onDisconnect}
          disabled={isBusy}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 bg-danger/15 border border-danger/30 text-danger rounded-lg text-xs font-medium hover:bg-danger/25 transition disabled:opacity-50"
        >
          {connectionState === "disconnecting" ? (
            <>
              <Loader size={12} className="animate-spin" />
              Disconnecting...
            </>
          ) : (
            <>
              <WifiOff size={12} />
              Disconnect
            </>
          )}
        </button>
      ) : (
        <button
          onClick={onConnect}
          disabled={isBusy || (connectionState === "connected" && !isConnected)}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 bg-accent/15 border border-accent/30 text-accent rounded-lg text-xs font-medium hover:bg-accent/25 transition disabled:opacity-50"
        >
          {connectionState === "connecting" && isSelected ? (
            <>
              <Loader size={12} className="animate-spin" />
              Connecting...
            </>
          ) : (
            <>
              <Shield size={12} />
              Connect
            </>
          )}
        </button>
      )}
    </div>
  );
}

// ── Connected Status Banner ──

function ConnectedBanner({
  server,
  vpnIp,
  status,
  duration,
  onDisconnect,
  connectionState,
}: {
  server: VpnServer;
  vpnIp: string;
  status: VpnStatus | null;
  duration: number;
  onDisconnect: () => void;
  connectionState: ConnectionState;
}) {
  return (
    <div className="bg-success/5 border border-success/20 rounded-lg p-3 mb-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-success/20 flex items-center justify-center">
            <Shield size={14} className="text-success" />
          </div>
          <div>
            <div className="font-semibold text-xs flex items-center gap-1.5">
              <span className="text-success">Connected</span>
              <img src={`https://flagcdn.com/w40/${(server.country_code || 'xx').toLowerCase()}.png`} alt="" className="w-5 h-3.5 rounded object-cover" />
              <span>{server.name}</span>
            </div>
            <div className="text-[10px] text-text-muted">{server.location} &mdash; {server.country}</div>
          </div>
        </div>
        <button
          onClick={onDisconnect}
          disabled={connectionState === "disconnecting"}
          className="flex items-center gap-1.5 px-2.5 py-1 bg-danger/15 border border-danger/30 text-danger rounded-lg text-[10px] font-medium hover:bg-danger/25 transition disabled:opacity-50"
        >
          {connectionState === "disconnecting" ? (
            <Loader size={10} className="animate-spin" />
          ) : (
            <WifiOff size={10} />
          )}
          Disconnect
        </button>
      </div>

      {/* Connection details as inline badges */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="inline-flex items-center gap-1 px-2 py-1 bg-bg-card/50 rounded-lg text-[10px]">
          <Globe size={10} className="text-text-muted" /> <span className="text-text-muted">IP:</span> <span className="font-mono text-accent2">{vpnIp}</span>
        </span>
        <span className="inline-flex items-center gap-1 px-2 py-1 bg-bg-card/50 rounded-lg text-[10px]">
          <Timer size={10} className="text-text-muted" /> <span className="font-mono text-success">{formatDuration(duration)}</span>
        </span>
        <span className="inline-flex items-center gap-1 px-2 py-1 bg-bg-card/50 rounded-lg text-[10px]">
          <ArrowDownUp size={10} className="text-text-muted" /> <span className="text-text-muted">↓</span> <span className="font-mono text-success">{status?.transfer_rx ?? "0 B"}</span>
        </span>
        <span className="inline-flex items-center gap-1 px-2 py-1 bg-bg-card/50 rounded-lg text-[10px]">
          <ArrowDownUp size={10} className="text-text-muted" /> <span className="text-text-muted">↑</span> <span className="font-mono text-orange">{status?.transfer_tx ?? "0 B"}</span>
        </span>
      </div>
    </div>
  );
}

// ── Main Page Component ──

export default function SmartVPN() {
  const [token, setToken] = useState(localStorage.getItem("cs2pt_token") || "");
  const [tokenInput, setTokenInput] = useState("");
  const [servers, setServers] = useState<VpnServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pings, setPings] = useState<Record<string, number>>({});
  const [connectionState, setConnectionState] = useState<ConnectionState>(() => {
    return localStorage.getItem("cs2pt_vpn_connected") ? "connected" : "disconnected";
  });
  const [connectedServerId, setConnectedServerId] = useState<string | null>(
    localStorage.getItem("cs2pt_vpn_server_id")
  );
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);
  const [vpnIp, setVpnIp] = useState<string>(
    localStorage.getItem("cs2pt_vpn_ip") || ""
  );
  const [vpnStatus, setVpnStatus] = useState<VpnStatus | null>(null);
  const [connectDuration, setConnectDuration] = useState(0);
  const [favoriteServerId, setFavoriteServerId] = useState<string | null>(
    localStorage.getItem("cs2pt_favorite_server")
  );
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [preConnectCheck, setPreConnectCheck] = useState<PreConnectCheck | null>(null);

  const connectTimeRef = useRef<number>(0);
  const statusIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const durationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastTransferRef = useRef<string | null>(null);
  const transferStaleCountRef = useRef<number>(0);
  const pendingConnectServerIdRef = useRef<string | null>(null);

  const connectedServer = servers.find((s) => s.id === connectedServerId) ?? null;

  // ── Restore connection state on mount ──
  useEffect(() => {
    const savedTime = localStorage.getItem("cs2pt_vpn_connect_time");
    if (savedTime && connectionState === "connected") {
      connectTimeRef.current = parseInt(savedTime) || Date.now();
      setConnectDuration(Math.floor((Date.now() - connectTimeRef.current) / 1000));
    }
  }, []);

  // ── Toast helpers ──

  const addToast = useCallback((message: string, type: Toast["type"]) => {
    const id = ++toastIdCounter;
    setToasts((prev) => [...prev, { id, message, type, timestamp: Date.now() }]);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Auto-dismiss toasts after 5 seconds
  useEffect(() => {
    if (toasts.length === 0) return;
    const timer = setInterval(() => {
      const now = Date.now();
      setToasts((prev) => prev.filter((t) => now - t.timestamp < 5000));
    }, 500);
    return () => clearInterval(timer);
  }, [toasts.length]);

  // ── Favorite server ──

  function toggleFavorite(serverId: string) {
    if (favoriteServerId === serverId) {
      setFavoriteServerId(null);
      localStorage.removeItem("cs2pt_favorite_server");
    } else {
      setFavoriteServerId(serverId);
      localStorage.setItem("cs2pt_favorite_server", serverId);
    }
  }

  // ── Fetch server list ──
  const fetchServers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const resp = await fetch(`${HQ_BASE}/vpn-servers`);
      if (!resp.ok) throw new Error(`Server returned ${resp.status}`);
      const data = await resp.json();
      setServers(data.servers ?? []);
    } catch (e) {
      setError(`Failed to load servers: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }, []);

  const [wgAvailable, setWgAvailable] = useState(true);

  useEffect(() => {
    fetchServers();
    // Check if WireGuard is installed
    invoke<{ available: boolean; source: string }>("check_wireguard")
      .then((r) => setWgAvailable(r.available))
      .catch(() => setWgAvailable(false));
  }, [fetchServers]);

  // ── Ping servers ──
  useEffect(() => {
    if (servers.length === 0) return;

    async function pingAll() {
      for (const server of servers) {
        const host = extractPingTarget(server.endpoint);
        try {
          const results = await invoke<PingResult[]>("ping_host", { host, count: 1 });
          const successful = results.filter((r) => r.success);
          if (successful.length > 0) {
            const avg = successful.reduce((s, r) => s + r.latency_ms, 0) / successful.length;
            setPings((prev) => ({ ...prev, [server.id]: avg }));
          }
        } catch {
          // ping failed, leave as null
        }
      }
    }

    pingAll();
  }, [servers]);

  // ── Poll VPN status when connected ──
  useEffect(() => {
    if (connectionState === "connected") {
      const poll = async () => {
        try {
          const status = await invoke<VpnStatus>("vpn_get_status");
          setVpnStatus(status);

          // Detect stale transfer (connection lost)
          const currentTransfer = `${status.transfer_rx ?? ""}|${status.transfer_tx ?? ""}`;
          if (status.active && lastTransferRef.current === currentTransfer) {
            transferStaleCountRef.current++;
            // If transfer stats haven't changed for ~10 seconds (5 polls at 2s)
            if (transferStaleCountRef.current >= 5) {
              addToast("VPN Connection Lost", "error");
              transferStaleCountRef.current = 0;
            }
          } else {
            transferStaleCountRef.current = 0;
          }
          lastTransferRef.current = currentTransfer;

          // If tunnel went down unexpectedly
          if (!status.active && connectionState === "connected") {
            addToast("VPN Disconnected", "warning");
            handleDisconnected();
          }
        } catch {
          // ignore
        }
      };
      poll();
      statusIntervalRef.current = setInterval(poll, 2000);
      return () => {
        if (statusIntervalRef.current) clearInterval(statusIntervalRef.current);
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionState]);

  // ── Duration timer ──
  useEffect(() => {
    if (connectionState === "connected") {
      durationIntervalRef.current = setInterval(() => {
        setConnectDuration(Math.floor((Date.now() - connectTimeRef.current) / 1000));
      }, 1000);
      return () => {
        if (durationIntervalRef.current) clearInterval(durationIntervalRef.current);
      };
    }
  }, [connectionState]);

  function handleDisconnected() {
    // Decrement local client count
    if (connectedServerId) {
      setServers(prev => prev.map(s =>
        s.id === connectedServerId ? { ...s, current_clients: Math.max(0, (s.current_clients || 1) - 1) } : s
      ));
    }
    setConnectionState("disconnected");
    setConnectedServerId(null);
    setVpnIp("");
    setVpnStatus(null);
    setConnectDuration(0);
    lastTransferRef.current = null;
    transferStaleCountRef.current = 0;
    if (statusIntervalRef.current) clearInterval(statusIntervalRef.current);
    if (durationIntervalRef.current) clearInterval(durationIntervalRef.current);

    // Clear persisted connection state
    localStorage.removeItem("cs2pt_vpn_connected");
    localStorage.removeItem("cs2pt_vpn_server_id");
    localStorage.removeItem("cs2pt_vpn_ip");
    localStorage.removeItem("cs2pt_vpn_connect_time");
  }

  // ── Pre-connect quality check ──
  async function runPreConnectCheck(serverId: string) {
    const server = servers.find((s) => s.id === serverId);
    if (!server) return;

    pendingConnectServerIdRef.current = serverId;
    setPreConnectCheck({
      serverId,
      serverName: server.name,
      avgLatency: null,
      status: "pinging",
    });

    const host = extractPingTarget(server.endpoint);
    try {
      const results = await invoke<PingResult[]>("ping_host", { host, count: 3 });
      const successful = results.filter((r) => r.success);
      if (successful.length > 0) {
        const avg = successful.reduce((s, r) => s + r.latency_ms, 0) / successful.length;
        setPreConnectCheck({
          serverId,
          serverName: server.name,
          avgLatency: avg,
          status: "done",
        });
        // Also update the ping display
        setPings((prev) => ({ ...prev, [serverId]: avg }));
      } else {
        setPreConnectCheck({
          serverId,
          serverName: server.name,
          avgLatency: null,
          status: "error",
        });
      }
    } catch {
      setPreConnectCheck({
        serverId,
        serverName: server.name,
        avgLatency: null,
        status: "error",
      });
    }
  }

  function handlePreConnectProceed() {
    const serverId = pendingConnectServerIdRef.current;
    setPreConnectCheck(null);
    pendingConnectServerIdRef.current = null;
    if (serverId) {
      doConnect(serverId);
    }
  }

  function handlePreConnectCancel() {
    setPreConnectCheck(null);
    pendingConnectServerIdRef.current = null;
  }

  // ── Connect flow ──
  async function doConnect(serverId: string) {
    if (!token) return;

    // Disconnect existing VPN if connected
    if (connectionState === "connected" && connectedServerId) {
      try {
        const profileName = `smartvpn-${connectedServerId}`;
        await invoke("vpn_deactivate", { profileName });
      } catch {}
      handleDisconnected();
    }

    const server = servers.find((s) => s.id === serverId);
    setSelectedServerId(serverId);
    setConnectionState("connecting");
    setError(null);

    try {
      // Step 1: Generate client keypair FIRST
      const keypair = await invoke<[string, string]>("vpn_generate_keypair");
      const clientPrivateKey = keypair[0];
      const clientPublicKey = keypair[1];

      // Step 2: Request connection from HQ (sends token + public key)
      const configResp = await fetch(
        `${HQ_BASE}/vpn-servers/${serverId}/connect`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token: token,
            client_public_key: clientPublicKey,
          }),
        }
      );

      const configData = await configResp.json();
      if (!configData.success) {
        throw new Error(configData.error || "Connection refused by server");
      }
      const config: VpnConnectResponse = configData.config;

      // Step 3: Save VPN profile locally
      const profileName = `smartvpn-${serverId}`;
      await invoke("vpn_save_profile", {
        profile: {
          name: profileName,
          server_endpoint: config.server_endpoint,
          server_public_key: config.server_public_key,
          client_private_key: clientPrivateKey,
          client_address: config.client_address,
          dns: config.dns,
          mtu: config.mtu || 1420,
          allowed_ips: config.allowed_ips,
          persistent_keepalive: config.persistent_keepalive || 25,
        },
      });

      // Step 5: Activate the tunnel (reconnect loads the saved profile)
      const activateResult = await invoke<{ success: boolean; message: string }>("vpn_reconnect", {
        profileName,
      });

      if (!activateResult.success) {
        throw new Error(activateResult.message);
      }

      // Success
      setConnectionState("connected");
      setConnectedServerId(serverId);
      const clientIp = config.client_address.split("/")[0];
      setVpnIp(clientIp);
      connectTimeRef.current = Date.now();
      setConnectDuration(0);
      lastTransferRef.current = null;
      transferStaleCountRef.current = 0;

      // Persist connection state so it survives page navigation
      localStorage.setItem("cs2pt_vpn_connected", "true");
      localStorage.setItem("cs2pt_vpn_server_id", serverId);
      localStorage.setItem("cs2pt_vpn_ip", clientIp);
      localStorage.setItem("cs2pt_vpn_connect_time", String(Date.now()));

      // Update local client count
      setServers(prev => prev.map(s =>
        s.id === serverId ? { ...s, current_clients: (s.current_clients || 0) + 1 } : s
      ));

      addToast(`Connected to VPN: ${server?.name ?? serverId}`, "success");
    } catch (e) {
      setError(`Connection failed: ${e instanceof Error ? e.message : String(e)}`);
      setConnectionState("disconnected");
    }
  }

  function handleConnect(serverId: string) {
    if (!token) return;
    runPreConnectCheck(serverId);
  }

  // ── Disconnect flow ──
  async function handleDisconnect() {
    const serverName = connectedServer?.name ?? "server";
    setConnectionState("disconnecting");
    try {
      await invoke("vpn_deactivate", {});
    } catch {
      // Ignore deactivation errors
    }
    handleDisconnected();
    addToast("VPN Disconnected", "warning");
    // Suppress unused variable — serverName used in toast above
    void serverName;
  }

  // ── Token management ──
  function handleSaveToken() {
    const trimmed = tokenInput.trim();
    if (trimmed) {
      localStorage.setItem("cs2pt_token", trimmed);
      setToken(trimmed);
      setTokenInput("");
    }
  }

  function handleClearToken() {
    localStorage.removeItem("cs2pt_token");
    setToken("");
  }

  // ── Sort servers: favorite first ──
  const sortedServers = [...servers].sort((a, b) => {
    if (a.id === favoriteServerId) return -1;
    if (b.id === favoriteServerId) return 1;
    return 0;
  });

  // ── Render ──

  // Token gate
  if (!token) {
    return (
      <div>
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-accent">Smart VPN</h1>
            <p className="text-text-muted text-xs mt-0.5">
              One-click VPN for optimized CS2 routing
            </p>
          </div>
        </div>

        <div className="bg-bg-card border border-border rounded-lg p-6 max-w-sm mx-auto mt-8">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center">
              <Lock size={14} className="text-accent" />
            </div>
            <h2 className="text-sm font-semibold">Access Token Required</h2>
            <p className="text-xs text-text-muted">
              Enter your access token to connect to VPN servers.
            </p>
            <div className="w-full flex gap-2 mt-1">
              <input
                type="password"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSaveToken()}
                placeholder="Paste your token..."
                className="flex-1 bg-bg border border-border rounded-lg px-2.5 py-1.5 text-xs text-text placeholder:text-text-muted/50 focus:outline-none focus:border-accent/50"
              />
              <button
                onClick={handleSaveToken}
                disabled={!tokenInput.trim()}
                className="px-3 py-1.5 bg-accent text-white rounded-lg text-xs font-medium hover:bg-accent/90 transition disabled:opacity-50"
              >
                <Key size={12} />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Toast notifications */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* Pre-connect quality check modal */}
      {preConnectCheck && (
        <PreConnectModal
          check={preConnectCheck}
          onProceed={handlePreConnectProceed}
          onCancel={handlePreConnectCancel}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-accent">Smart VPN</h1>
          <p className="text-text-muted text-xs mt-0.5">
            One-click VPN for optimized CS2 routing
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleClearToken}
            className="flex items-center gap-1 px-2.5 py-1 bg-bg-card border border-border rounded-lg text-[10px] text-text-muted hover:text-danger hover:border-danger/30 transition"
            title="Clear token"
          >
            <Key size={10} />
            Clear Token
          </button>
          <button onClick={fetchServers} disabled={loading}
            className="flex items-center gap-1 px-2.5 py-1 bg-bg-card border border-border rounded-lg text-[10px] text-text-muted hover:text-text hover:border-accent/30 transition disabled:opacity-50">
            <RefreshCw size={10} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* Connection status banner */}
      {connectionState === "connected" && connectedServer && (
        <ConnectedBanner
          server={connectedServer}
          vpnIp={vpnIp}
          status={vpnStatus}
          duration={connectDuration}
          onDisconnect={handleDisconnect}
          connectionState={connectionState}
        />
      )}

      {/* Connecting overlay */}
      {connectionState === "connecting" && (
        <div className="bg-accent/5 border border-accent/20 rounded-lg p-3 mb-4 flex items-center gap-3">
          <Loader size={14} className="text-accent animate-spin" />
          <div>
            <div className="font-semibold text-xs">Connecting to VPN...</div>
            <div className="text-[10px] text-text-muted mt-0.5">
              Generating keys and establishing secure tunnel
            </div>
          </div>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="bg-danger/10 border border-danger/30 rounded-lg p-3 mb-4 flex items-center gap-2">
          <XCircle size={14} className="text-danger shrink-0" />
          <span className="text-xs text-danger">{error}</span>
        </div>
      )}

      {/* WireGuard not installed warning */}
      {!wgAvailable && (
        <div className="bg-warning/10 border border-warning/30 rounded-lg p-3 mb-4 flex items-start gap-2">
          <AlertTriangle size={14} className="text-warning mt-0.5 shrink-0" />
          <div className="text-xs">
            <span className="text-warning font-semibold">WireGuard not installed.</span>
            <span className="text-text-muted"> Download from </span>
            <a href="https://www.wireguard.com/install/" target="_blank" rel="noopener noreferrer" className="text-accent underline">wireguard.com</a>
          </div>
        </div>
      )}

      {/* Network Diagram */}
      <NetworkDiagram
        servers={servers}
        connectedServerId={connectedServerId}
        connectionState={connectionState}
      />

      {/* Server List */}
      <div className="mb-3 flex items-center gap-1.5">
        <Server size={14} className="text-accent2" />
        <h2 className="text-xs font-semibold">Available Servers</h2>
        <span className="text-[10px] text-text-muted ml-auto">
          {servers.length} server{servers.length !== 1 ? "s" : ""}
        </span>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-bg-card border border-border rounded-lg p-3">
              <div className="animate-pulse space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-5 rounded bg-border/40" />
                  <div className="flex-1 space-y-1">
                    <div className="h-3 w-20 bg-border/40 rounded" />
                    <div className="h-2.5 w-28 bg-border/40 rounded" />
                  </div>
                </div>
                <div className="h-2.5 w-full bg-border/40 rounded" />
                <div className="h-7 w-full bg-border/40 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : servers.length === 0 ? (
        <div className="bg-bg-card border border-border rounded-lg p-6 text-center">
          <div className="flex flex-col items-center gap-2">
            <Wifi size={20} className="text-text-muted/30" />
            <p className="text-text-muted text-xs">
              No VPN servers available at the moment.
            </p>
            <button
              onClick={fetchServers}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-accent/15 border border-accent/30 text-accent rounded-lg text-xs hover:bg-accent/25 transition"
            >
              <RefreshCw size={12} />
              Retry
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
          {sortedServers.map((server) => (
            <ServerCard
              key={server.id}
              server={server}
              ping={pings[server.id] ?? null}
              isConnected={connectedServerId === server.id}
              isSelected={selectedServerId === server.id}
              isFavorite={favoriteServerId === server.id}
              connectionState={
                connectedServerId === server.id || selectedServerId === server.id
                  ? connectionState
                  : "disconnected"
              }
              onConnect={() => handleConnect(server.id)}
              onDisconnect={handleDisconnect}
              onToggleFavorite={() => toggleFavorite(server.id)}
            />
          ))}
        </div>
      )}

      {/* Footer info */}
      <div className="mt-4 flex items-center gap-1.5 text-[10px] text-text-muted/50">
        <CheckCircle size={10} />
        <span>Encrypted with WireGuard. Keys generated locally.</span>
      </div>
    </div>
  );
}
