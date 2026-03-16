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
  MapPin,
  Users,
  Key,
  RefreshCw,
} from "lucide-react";

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
}

interface VpnConnectResponse {
  endpoint: string;
  server_public_key: string;
  client_address: string;
  dns: string;
  allowed_ips: string;
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

type ConnectionState = "disconnected" | "connecting" | "connected" | "disconnecting";

// ── Helpers ──

function latLngToXY(lat: number, lng: number): { x: number; y: number } {
  const x = (lng + 180) * (1000 / 360);
  const y = (90 - lat) * (500 / 180);
  return { x, y };
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function extractHost(endpoint: string): string {
  return endpoint.split(":")[0];
}

// ── SVG World Map Path ──
// Simplified world outline (continents)
const WORLD_PATH = `
M 150,85 L 155,80 165,82 170,78 180,80 185,78 195,82 205,80 215,85 220,82
225,88 230,85 235,82 230,78 220,75 215,72 210,68 205,65 195,62 185,60
175,58 165,60 155,62 150,65 148,70 145,75 148,80 Z

M 260,75 L 270,72 280,70 290,68 300,70 310,72 320,70 330,72 340,75
350,78 360,80 370,78 380,82 390,85 400,82 410,85 420,88 430,90
440,88 450,85 460,82 470,85 475,90 480,95 485,100 490,105 495,110
500,115 505,120 510,125 515,130 518,135 515,140 510,145 505,148
500,150 495,152 490,150 485,148 480,150 475,155 470,158 465,160
460,162 455,165 450,168 445,172 440,178 435,180 430,185 425,190
420,192 415,188 410,185 405,180 400,175 395,170 390,165 385,160
380,155 378,150 375,145 372,140 370,135 368,130 365,125 360,120
355,118 350,115 345,112 340,110 335,108 330,105 325,102 320,100
315,98 310,96 305,95 300,92 295,90 290,88 285,85 280,82 275,80 270,78 Z

M 520,78 L 530,75 540,72 550,70 560,68 570,65 580,62 590,60 600,58
610,60 620,62 630,65 640,68 650,72 660,75 670,78 680,82 690,85
700,82 710,85 720,88 730,92 735,98 738,105 740,110 738,115 735,118
730,120 725,122 720,120 715,115 710,112 705,108 700,105 695,102
690,100 685,105 680,110 678,115 680,120 685,125 690,128 695,130
700,132 705,135 710,138 715,140 720,142 725,145 728,148 730,152
728,155 725,158 720,160 715,158 710,155 705,150 700,148 695,145
690,140 685,138 680,135 675,130 670,128 665,125 660,122 655,118
650,115 645,110 640,108 635,105 630,102 625,100 620,98 615,95
610,92 605,90 600,88 595,85 590,82 585,80 580,78 575,80 570,82
565,85 560,82 555,80 550,78 545,80 540,82 535,80 Z

M 640,170 L 645,165 655,162 665,160 675,158 685,155 695,152 705,155
715,158 725,160 735,162 740,165 745,168 748,172 750,175 752,180
755,185 758,190 760,195 758,200 755,205 750,210 745,215 740,220
735,225 730,228 725,232 720,235 715,238 710,240 705,242 700,245
695,248 690,250 685,252 680,255 675,258 670,260 665,262 660,265
655,268 650,270 645,268 640,265 635,260 630,255 625,250 620,245
622,240 625,235 628,230 632,225 635,220 638,215 640,210 638,205
635,200 632,195 630,190 628,185 630,180 635,175 Z

M 780,150 L 790,148 800,145 810,148 820,150 830,155 840,160 850,165
860,168 870,172 880,178 890,185 895,192 898,200 895,208 890,215
885,220 878,225 870,228 862,230 855,235 848,240 840,245 835,250
830,255 828,260 830,265 835,270 840,275 845,280 848,285 845,290
840,295 835,298 828,300 820,298 815,295 810,290 805,285 800,280
795,275 790,268 785,262 780,255 778,248 775,240 772,232 770,225
768,218 770,210 775,202 780,195 782,188 780,180 778,172 775,165
778,158 Z

M 255,230 L 265,225 275,220 285,218 295,220 305,225 315,228 325,232
335,235 340,240 342,248 340,255 338,262 335,270 330,278 325,285
320,292 315,298 310,305 305,310 298,315 290,320 282,325 275,328
268,330 260,332 252,330 245,325 240,318 235,310 232,302 230,295
228,288 230,280 232,272 235,265 238,258 242,250 248,242 Z

M 385,220 L 395,218 405,220 415,225 425,230 435,235 445,240 450,248
452,255 450,260 445,265 440,268 435,270 430,268 425,265 420,260
415,255 410,250 405,245 400,240 395,235 390,230 388,225 Z
`;

// ── World Map Component ──

function WorldMap({
  servers,
  selectedServer,
  connectionState,
  userLocation,
}: {
  servers: VpnServer[];
  selectedServer: VpnServer | null;
  connectionState: ConnectionState;
  userLocation: { lat: number; lng: number } | null;
}) {
  const isConnected = connectionState === "connected";
  const isConnecting = connectionState === "connecting";

  const userXY = userLocation ? latLngToXY(userLocation.lat, userLocation.lng) : null;
  const selectedXY = selectedServer ? latLngToXY(selectedServer.lat, selectedServer.lng) : null;

  return (
    <div className="bg-bg-card border border-border rounded-lg p-4 mb-6 overflow-hidden">
      <svg viewBox="0 0 1000 500" className="w-full h-auto" style={{ maxHeight: 320 }}>
        <defs>
          {/* Glow filter for server dots */}
          <filter id="glow-purple" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feFlood floodColor="#e67e22" floodOpacity="0.6" result="color" />
            <feComposite in="color" in2="blur" operator="in" result="shadow" />
            <feMerge>
              <feMergeNode in="shadow" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="glow-teal" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feFlood floodColor="#f39c12" floodOpacity="0.6" result="color" />
            <feComposite in="color" in2="blur" operator="in" result="shadow" />
            <feMerge>
              <feMergeNode in="shadow" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="glow-green" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feFlood floodColor="#2ecc71" floodOpacity="0.8" result="color" />
            <feComposite in="color" in2="blur" operator="in" result="shadow" />
            <feMerge>
              <feMergeNode in="shadow" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          {/* Animated dash for connection line */}
          <linearGradient id="line-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#f39c12" stopOpacity="0.3" />
            <stop offset="50%" stopColor="#2ecc71" stopOpacity="1" />
            <stop offset="100%" stopColor="#e67e22" stopOpacity="0.3" />
          </linearGradient>
        </defs>

        {/* Background grid */}
        <rect width="1000" height="500" fill="#0a0a0f" rx="8" />
        {Array.from({ length: 10 }, (_, i) => (
          <line key={`vg-${i}`} x1={i * 100} y1="0" x2={i * 100} y2="500" stroke="#1a1a25" strokeWidth="0.5" />
        ))}
        {Array.from({ length: 5 }, (_, i) => (
          <line key={`hg-${i}`} x1="0" y1={i * 100} x2="1000" y2={i * 100} stroke="#1a1a25" strokeWidth="0.5" />
        ))}

        {/* World outline */}
        <path d={WORLD_PATH} fill="#1a1a25" stroke="#2a2620" strokeWidth="1" opacity="0.8" />

        {/* Connection line */}
        {(isConnected || isConnecting) && userXY && selectedXY && (
          <line
            x1={userXY.x}
            y1={userXY.y}
            x2={selectedXY.x}
            y2={selectedXY.y}
            stroke="url(#line-gradient)"
            strokeWidth="2"
            strokeDasharray={isConnecting ? "8 4" : "none"}
            opacity={isConnecting ? 0.6 : 1}
          >
            {isConnecting && (
              <animate attributeName="stroke-dashoffset" from="24" to="0" dur="1s" repeatCount="indefinite" />
            )}
          </line>
        )}

        {/* Server dots */}
        {servers.map((s) => {
          const { x, y } = latLngToXY(s.lat, s.lng);
          const isSelected = selectedServer?.id === s.id;
          const isActive = isSelected && isConnected;
          return (
            <g key={s.id}>
              {/* Pulse ring for active server */}
              {isActive && (
                <circle cx={x} cy={y} r="8" fill="none" stroke="#2ecc71" strokeWidth="1.5" opacity="0.4">
                  <animate attributeName="r" from="8" to="20" dur="2s" repeatCount="indefinite" />
                  <animate attributeName="opacity" from="0.6" to="0" dur="2s" repeatCount="indefinite" />
                </circle>
              )}
              <circle
                cx={x}
                cy={y}
                r={isSelected ? 6 : 4}
                fill={isActive ? "#2ecc71" : isSelected ? "#e67e22" : "#e67e22"}
                filter={isActive ? "url(#glow-green)" : "url(#glow-purple)"}
                opacity={isSelected ? 1 : 0.8}
              />
              {/* Label for selected server */}
              {isSelected && (
                <text x={x} y={y - 12} textAnchor="middle" fill="#e8e4dc" fontSize="11" fontWeight="600">
                  {s.flag} {s.name}
                </text>
              )}
            </g>
          );
        })}

        {/* User location dot */}
        {userXY && (
          <g>
            <circle cx={userXY.x} cy={userXY.y} r="5" fill="#f39c12" filter="url(#glow-teal)" />
            <circle cx={userXY.x} cy={userXY.y} r="8" fill="none" stroke="#f39c12" strokeWidth="1" opacity="0.5">
              <animate attributeName="r" from="8" to="16" dur="3s" repeatCount="indefinite" />
              <animate attributeName="opacity" from="0.5" to="0" dur="3s" repeatCount="indefinite" />
            </circle>
            <text x={userXY.x} y={userXY.y - 12} textAnchor="middle" fill="#f39c12" fontSize="10" fontWeight="500">
              You
            </text>
          </g>
        )}

        {/* Legend */}
        <g transform="translate(20, 460)">
          <circle cx="0" cy="0" r="4" fill="#f39c12" />
          <text x="10" y="4" fill="#8a8070" fontSize="10">Your location</text>
          <circle cx="120" cy="0" r="4" fill="#e67e22" />
          <text x="130" y="4" fill="#8a8070" fontSize="10">VPN Server</text>
          <circle cx="230" cy="0" r="4" fill="#2ecc71" />
          <text x="240" y="4" fill="#8a8070" fontSize="10">Connected</text>
        </g>
      </svg>
    </div>
  );
}

// ── Server Card Component ──

function ServerCard({
  server,
  ping,
  isConnected,
  isSelected,
  connectionState,
  onConnect,
  onDisconnect,
}: {
  server: VpnServer;
  ping: number | null;
  isConnected: boolean;
  isSelected: boolean;
  connectionState: ConnectionState;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  const isBusy = connectionState === "connecting" || connectionState === "disconnecting";

  function getPingColor(ms: number): string {
    if (ms < 40) return "text-success";
    if (ms < 80) return "text-warning";
    return "text-danger";
  }

  return (
    <div
      className={`bg-bg-card border rounded-lg p-4 transition-all ${
        isConnected
          ? "border-success/50 shadow-[0_0_20px_rgba(85,239,196,0.1)]"
          : isSelected
            ? "border-accent/50"
            : "border-border hover:border-border/80"
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">{server.flag}</span>
          <div>
            <div className="font-semibold text-sm">{server.name}</div>
            <div className="text-xs text-text-muted flex items-center gap-1">
              <MapPin size={10} />
              {server.location}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
          <span className="text-[10px] text-text-muted uppercase">Online</span>
        </div>
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-4 mb-3 text-xs text-text-muted">
        <div className="flex items-center gap-1">
          <Zap size={12} className={ping !== null ? getPingColor(ping) : ""} />
          {ping !== null ? (
            <span className={getPingColor(ping)}>{Math.round(ping)}ms</span>
          ) : (
            <span className="animate-pulse">...</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Users size={12} />
          <span>{server.max_clients} slots</span>
        </div>
        <div className="flex items-center gap-1">
          <Globe size={12} />
          <span>{server.country}</span>
        </div>
      </div>

      {/* Action button */}
      {isConnected ? (
        <button
          onClick={onDisconnect}
          disabled={isBusy}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-danger/15 border border-danger/30 text-danger rounded-lg text-sm font-medium hover:bg-danger/25 transition disabled:opacity-50"
        >
          {connectionState === "disconnecting" ? (
            <>
              <Loader size={14} className="animate-spin" />
              Disconnecting...
            </>
          ) : (
            <>
              <WifiOff size={14} />
              Disconnect
            </>
          )}
        </button>
      ) : (
        <button
          onClick={onConnect}
          disabled={isBusy}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-accent/15 border border-accent/30 text-accent rounded-lg text-sm font-medium hover:bg-accent/25 transition disabled:opacity-50"
        >
          {connectionState === "connecting" && isSelected ? (
            <>
              <Loader size={14} className="animate-spin" />
              Connecting...
            </>
          ) : (
            <>
              <Shield size={14} />
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
    <div className="bg-success/5 border border-success/20 rounded-lg p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-success/20 flex items-center justify-center">
            <Shield size={20} className="text-success" />
          </div>
          <div>
            <div className="font-semibold flex items-center gap-2">
              <span className="text-success">Connected</span>
              <span className="text-xl">{server.flag}</span>
              <span>{server.name}</span>
            </div>
            <div className="text-xs text-text-muted">{server.location} &mdash; {server.country}</div>
          </div>
        </div>
        <button
          onClick={onDisconnect}
          disabled={connectionState === "disconnecting"}
          className="flex items-center gap-2 px-4 py-2 bg-danger/15 border border-danger/30 text-danger rounded-lg text-sm font-medium hover:bg-danger/25 transition disabled:opacity-50"
        >
          {connectionState === "disconnecting" ? (
            <Loader size={14} className="animate-spin" />
          ) : (
            <WifiOff size={14} />
          )}
          Disconnect
        </button>
      </div>

      {/* Connection details grid */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-bg-card/50 rounded-lg p-3">
          <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1 flex items-center gap-1">
            <Globe size={10} /> VPN IP
          </div>
          <div className="text-sm font-mono text-accent2">{vpnIp}</div>
        </div>
        <div className="bg-bg-card/50 rounded-lg p-3">
          <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1 flex items-center gap-1">
            <Timer size={10} /> Duration
          </div>
          <div className="text-sm font-mono text-success">{formatDuration(duration)}</div>
        </div>
        <div className="bg-bg-card/50 rounded-lg p-3">
          <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1 flex items-center gap-1">
            <ArrowDownUp size={10} /> Transfer RX
          </div>
          <div className="text-sm font-mono text-accent">{status?.transfer_rx ?? "0 B"}</div>
        </div>
        <div className="bg-bg-card/50 rounded-lg p-3">
          <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1 flex items-center gap-1">
            <ArrowDownUp size={10} /> Transfer TX
          </div>
          <div className="text-sm font-mono text-accent">{status?.transfer_tx ?? "0 B"}</div>
        </div>
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
  const [connectionState, setConnectionState] = useState<ConnectionState>("disconnected");
  const [connectedServerId, setConnectedServerId] = useState<string | null>(null);
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);
  const [vpnIp, setVpnIp] = useState<string>("");
  const [vpnStatus, setVpnStatus] = useState<VpnStatus | null>(null);
  const [connectDuration, setConnectDuration] = useState(0);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);

  const connectTimeRef = useRef<number>(0);
  const statusIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const durationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const connectedServer = servers.find((s) => s.id === connectedServerId) ?? null;
  const selectedServer = servers.find((s) => s.id === selectedServerId) ?? connectedServer;

  // ── Fetch user approximate location ──
  useEffect(() => {
    fetch("https://ipapi.co/json/")
      .then((r) => r.json())
      .then((data) => {
        if (data.latitude && data.longitude) {
          setUserLocation({ lat: data.latitude, lng: data.longitude });
        }
      })
      .catch(() => {
        // Default to Western Europe if geolocation fails
        setUserLocation({ lat: 40.0, lng: -8.0 });
      });
  }, []);

  // ── Fetch server list ──
  const fetchServers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const resp = await fetch("https://cs2-player-tools.maltinha.club/api/vpn-servers");
      if (!resp.ok) throw new Error(`Server returned ${resp.status}`);
      const data = await resp.json();
      setServers(data.servers ?? []);
    } catch (e) {
      setError(`Failed to load servers: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchServers();
  }, [fetchServers]);

  // ── Ping servers ──
  useEffect(() => {
    if (servers.length === 0) return;

    async function pingAll() {
      for (const server of servers) {
        const host = extractHost(server.endpoint);
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
          // If tunnel went down unexpectedly
          if (!status.active && connectionState === "connected") {
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
    setConnectionState("disconnected");
    setConnectedServerId(null);
    setVpnIp("");
    setVpnStatus(null);
    setConnectDuration(0);
    if (statusIntervalRef.current) clearInterval(statusIntervalRef.current);
    if (durationIntervalRef.current) clearInterval(durationIntervalRef.current);
  }

  // ── Connect flow ──
  async function handleConnect(serverId: string) {
    if (!token) return;

    setSelectedServerId(serverId);
    setConnectionState("connecting");
    setError(null);

    try {
      // Step 1: Request connection config from HQ
      const configResp = await fetch(
        `https://cs2-player-tools.maltinha.club/api/vpn-servers/${serverId}/connect`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!configResp.ok) {
        const errBody = await configResp.text();
        throw new Error(errBody || `Server returned ${configResp.status}`);
      }

      const config: VpnConnectResponse = await configResp.json();

      // Step 2: Generate client keypair locally
      const keypair = await invoke<[string, string]>("vpn_generate_keypair");
      const clientPrivateKey = keypair[0];
      const clientPublicKey = keypair[1];

      // Step 3: Register public key with HQ so the server knows us
      await fetch(
        `https://cs2-player-tools.maltinha.club/api/vpn-servers/${serverId}/register-key`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ public_key: clientPublicKey }),
        }
      );

      // Step 4: Save VPN profile locally
      const profileName = `smartvpn-${serverId}`;
      await invoke("vpn_save_profile", {
        profile: {
          name: profileName,
          server_endpoint: config.endpoint,
          server_public_key: config.server_public_key,
          client_private_key: clientPrivateKey,
          client_address: config.client_address,
          dns: config.dns,
          mtu: 1420,
          allowed_ips: config.allowed_ips,
          persistent_keepalive: 25,
        },
      });

      // Step 5: Activate the tunnel
      const activateResult = await invoke<{ success: boolean; message: string }>("vpn_activate", {
        profileName,
      });

      if (!activateResult.success) {
        throw new Error(activateResult.message);
      }

      // Success
      setConnectionState("connected");
      setConnectedServerId(serverId);
      setVpnIp(config.client_address.split("/")[0]);
      connectTimeRef.current = Date.now();
      setConnectDuration(0);
    } catch (e) {
      setError(`Connection failed: ${e instanceof Error ? e.message : String(e)}`);
      setConnectionState("disconnected");
    }
  }

  // ── Disconnect flow ──
  async function handleDisconnect() {
    setConnectionState("disconnecting");
    try {
      await invoke("vpn_deactivate", {});
    } catch {
      // Ignore deactivation errors
    }
    handleDisconnected();
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

  // ── Render ──

  // Token gate
  if (!token) {
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">
              <span className="text-accent">Smart</span> VPN
            </h1>
            <p className="text-text-muted text-sm mt-1">
              One-click VPN for optimized CS2 routing
            </p>
          </div>
        </div>

        <div className="bg-bg-card border border-border rounded-lg p-8 max-w-md mx-auto mt-12">
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center">
              <Lock size={28} className="text-accent" />
            </div>
            <h2 className="text-lg font-semibold">Access Token Required</h2>
            <p className="text-sm text-text-muted">
              Enter your access token to connect to VPN servers. Tokens are managed by the HQ admin.
            </p>
            <div className="w-full flex gap-2 mt-2">
              <input
                type="password"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSaveToken()}
                placeholder="Paste your token..."
                className="flex-1 bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text placeholder:text-text-muted/50 focus:outline-none focus:border-accent/50"
              />
              <button
                onClick={handleSaveToken}
                disabled={!tokenInput.trim()}
                className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/90 transition disabled:opacity-50"
              >
                <Key size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">
            <span className="text-accent">Smart</span> VPN
          </h1>
          <p className="text-text-muted text-sm mt-1">
            One-click VPN for optimized CS2 routing
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleClearToken}
            className="flex items-center gap-2 px-3 py-2 bg-bg-card border border-border rounded-lg text-xs text-text-muted hover:text-danger hover:border-danger/30 transition"
            title="Clear token"
          >
            <Key size={12} />
            Clear Token
          </button>
          <button
            onClick={fetchServers}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-bg-card border border-border rounded-lg text-sm text-text-muted hover:text-text hover:border-accent/50 transition disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Refresh
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
        <div className="bg-accent/5 border border-accent/20 rounded-lg p-5 mb-6 flex items-center gap-4">
          <Loader size={24} className="text-accent animate-spin" />
          <div>
            <div className="font-semibold text-sm">Connecting to VPN...</div>
            <div className="text-xs text-text-muted mt-1">
              Generating keys and establishing secure tunnel
            </div>
          </div>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="bg-danger/10 border border-danger/30 rounded-lg p-4 mb-6 flex items-center gap-3">
          <XCircle size={16} className="text-danger shrink-0" />
          <span className="text-sm text-danger">{error}</span>
        </div>
      )}

      {/* World Map */}
      <WorldMap
        servers={servers}
        selectedServer={selectedServer}
        connectionState={connectionState}
        userLocation={userLocation}
      />

      {/* Server List */}
      <div className="mb-4 flex items-center gap-2">
        <Server size={16} className="text-accent2" />
        <h2 className="text-base font-semibold">Available Servers</h2>
        <span className="text-xs text-text-muted ml-auto">
          {servers.length} server{servers.length !== 1 ? "s" : ""}
        </span>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-bg-card border border-border rounded-lg p-4">
              <div className="animate-pulse space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded bg-border/40" />
                  <div className="flex-1 space-y-1">
                    <div className="h-4 w-24 bg-border/40 rounded" />
                    <div className="h-3 w-32 bg-border/40 rounded" />
                  </div>
                </div>
                <div className="h-3 w-full bg-border/40 rounded" />
                <div className="h-9 w-full bg-border/40 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : servers.length === 0 ? (
        <div className="bg-bg-card border border-border rounded-lg p-8 text-center">
          <div className="flex flex-col items-center gap-3">
            <Wifi size={32} className="text-text-muted/30" />
            <p className="text-text-muted text-sm">
              No VPN servers available at the moment.
            </p>
            <button
              onClick={fetchServers}
              className="flex items-center gap-2 px-4 py-2 bg-accent/15 border border-accent/30 text-accent rounded-lg text-sm hover:bg-accent/25 transition"
            >
              <RefreshCw size={14} />
              Retry
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {servers.map((server) => (
            <ServerCard
              key={server.id}
              server={server}
              ping={pings[server.id] ?? null}
              isConnected={connectedServerId === server.id}
              isSelected={selectedServerId === server.id}
              connectionState={
                connectedServerId === server.id || selectedServerId === server.id
                  ? connectionState
                  : "disconnected"
              }
              onConnect={() => handleConnect(server.id)}
              onDisconnect={handleDisconnect}
            />
          ))}
        </div>
      )}

      {/* Footer info */}
      <div className="mt-6 flex items-center gap-2 text-xs text-text-muted/50">
        <CheckCircle size={12} />
        <span>All connections are encrypted with WireGuard. Keys are generated locally and never leave your device.</span>
      </div>
    </div>
  );
}
