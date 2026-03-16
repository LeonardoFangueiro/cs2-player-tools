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

// ── SVG World Map Paths -- Real continent outlines (equirectangular, viewBox 0 0 1000 500) ──
const CONTINENTS = [
  // North America
  "M 40,80 55,72 70,70 90,72 115,68 140,62 170,58 190,55 205,58 215,62 225,72 230,80 228,88 218,95 210,100 205,105 195,115 188,125 180,130 172,128 168,120 160,118 148,120 135,125 125,130 118,128 110,120 100,115 90,108 82,100 75,95 65,92 55,88 45,85 Z",
  // South America
  "M 195,195 205,190 218,188 228,192 235,200 238,212 240,225 242,240 240,255 238,268 235,280 232,295 228,310 222,325 215,338 208,348 200,355 192,358 185,352 180,340 178,325 175,310 172,295 170,280 168,265 170,250 172,238 175,225 180,212 185,200 Z",
  // Europe
  "M 448,55 455,50 468,48 480,50 492,52 500,55 508,58 512,62 510,68 505,72 498,78 492,82 488,88 485,92 480,95 475,92 470,88 465,82 460,78 455,72 450,68 448,62 Z",
  // Africa
  "M 455,135 465,130 478,128 490,130 502,135 510,142 515,152 518,165 520,178 518,192 515,208 510,222 505,235 498,248 490,258 482,265 472,270 462,268 455,262 448,252 442,240 438,228 435,215 432,200 430,188 432,175 435,162 440,150 448,140 Z",
  // Asia
  "M 520,40 540,35 560,32 580,30 600,28 625,30 650,32 675,35 700,38 720,42 740,48 755,55 768,62 775,72 780,82 782,92 780,102 775,112 768,120 758,128 745,132 732,130 720,125 710,118 700,112 692,105 685,100 680,108 675,118 670,125 662,130 652,132 642,128 635,120 628,112 622,105 615,100 608,95 600,92 590,88 580,85 570,82 560,78 550,72 540,65 530,58 525,50 Z",
  // India/SE Asia
  "M 668,135 675,132 685,130 695,135 700,142 702,152 700,162 695,170 688,175 680,178 672,175 665,168 660,158 658,148 660,140 Z",
  // Australia
  "M 780,255 795,248 812,245 830,248 845,255 855,265 858,278 855,290 848,302 838,310 825,315 810,312 798,305 788,295 782,282 780,268 Z",
  // UK/Ireland
  "M 462,60 467,56 472,58 474,62 472,67 467,68 463,65 Z",
  // Japan
  "M 788,82 792,78 796,80 798,85 796,92 792,95 788,92 786,88 Z",
  // Indonesia
  "M 730,175 740,172 752,174 762,178 770,182 775,178 782,180 788,185 782,190 772,188 762,186 750,184 740,182 735,180 Z",
];
const WORLD_PATH = CONTINENTS.join(" ");

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
        return <CheckCircle size={16} className="text-success shrink-0" />;
      case "error":
        return <XCircle size={16} className="text-danger shrink-0" />;
      case "warning":
        return <AlertTriangle size={16} className="text-warning shrink-0" />;
      case "info":
        return <Info size={16} className="text-accent shrink-0" />;
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
          <span className="text-sm text-text flex-1">{toast.message}</span>
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
  const isHighLatency = check.avgLatency !== null && check.avgLatency > 150;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60">
      <div className="bg-bg-card border border-border rounded-lg p-6 max-w-sm w-full mx-4 shadow-2xl">
        <h3 className="font-semibold text-base mb-4 flex items-center gap-2">
          <Zap size={18} className="text-accent" />
          Quality Check: {check.serverName}
        </h3>

        {check.status === "pinging" && (
          <div className="flex items-center gap-3 py-4">
            <Loader size={20} className="text-accent animate-spin" />
            <span className="text-sm text-text-muted">
              Running ping test (3 pings)...
            </span>
          </div>
        )}

        {check.status === "done" && check.avgLatency !== null && quality && (
          <div className="space-y-3">
            <div className="bg-bg/50 rounded-lg p-3 flex items-center justify-between">
              <span className="text-sm text-text-muted">Latency</span>
              <span className={`text-sm font-mono font-semibold ${quality.color}`}>
                {Math.round(check.avgLatency)}ms &mdash; {quality.label} for CS2
              </span>
            </div>

            {isHighLatency && (
              <div className="bg-danger/10 border border-danger/30 rounded-lg p-3 flex items-start gap-2">
                <AlertTriangle size={16} className="text-danger shrink-0 mt-0.5" />
                <span className="text-xs text-danger">
                  High latency &mdash; gaming experience may be affected
                </span>
              </div>
            )}
          </div>
        )}

        {check.status === "error" && (
          <div className="bg-danger/10 border border-danger/30 rounded-lg p-3 flex items-start gap-2">
            <XCircle size={16} className="text-danger shrink-0 mt-0.5" />
            <span className="text-xs text-danger">
              Ping test failed. You can still connect.
            </span>
          </div>
        )}

        {check.status !== "pinging" && (
          <div className="flex gap-2 mt-5">
            <button
              onClick={onCancel}
              className="flex-1 px-4 py-2 bg-bg border border-border rounded-lg text-sm text-text-muted hover:text-text hover:border-border/80 transition"
            >
              Cancel
            </button>
            <button
              onClick={onProceed}
              className="flex-1 px-4 py-2 bg-accent/15 border border-accent/30 text-accent rounded-lg text-sm font-medium hover:bg-accent/25 transition"
            >
              Connect Anyway
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

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
                fill={isActive ? "#2ecc71" : "#e67e22"}
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
      className={`bg-bg-card border rounded-lg p-4 transition-all ${
        isConnected
          ? "border-success/50 shadow-[0_0_20px_rgba(85,239,196,0.1)]"
          : isFavorite
            ? "border-amber-500/50 shadow-[0_0_15px_rgba(245,158,11,0.1)]"
            : isSelected
              ? "border-accent/50"
              : "border-border hover:border-border/80"
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className="text-2xl leading-none">{server.flag}</span>
          <div>
            <div className="font-semibold text-sm">{server.name}</div>
            <div className="text-xs text-text-muted flex items-center gap-1">
              <MapPin size={10} />
              {server.location}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite();
            }}
            className={`p-1 rounded transition ${
              isFavorite
                ? "text-amber-400 hover:text-amber-300"
                : "text-text-muted/30 hover:text-text-muted"
            }`}
            title={isFavorite ? "Remove from favorites" : "Set as favorite"}
          >
            <Star size={16} fill={isFavorite ? "currentColor" : "none"} />
          </button>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
            <span className="text-[10px] text-text-muted uppercase">Online</span>
          </div>
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
  const selectedServer = servers.find((s) => s.id === selectedServerId) ?? connectedServer;

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
    setConnectionState("disconnected");
    setConnectedServerId(null);
    setVpnIp("");
    setVpnStatus(null);
    setConnectDuration(0);
    lastTransferRef.current = null;
    transferStaleCountRef.current = 0;
    if (statusIntervalRef.current) clearInterval(statusIntervalRef.current);
    if (durationIntervalRef.current) clearInterval(durationIntervalRef.current);
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

    const host = extractHost(server.endpoint);
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

    const server = servers.find((s) => s.id === serverId);
    setSelectedServerId(serverId);
    setConnectionState("connecting");
    setError(null);

    try {
      // Step 1: Request connection config from HQ
      const configResp = await fetch(
        `${HQ_BASE}/vpn-servers/${serverId}/connect`,
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
        `${HQ_BASE}/vpn-servers/${serverId}/register-key`,
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
      lastTransferRef.current = null;
      transferStaleCountRef.current = 0;

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
      <div className="mt-6 flex items-center gap-2 text-xs text-text-muted/50">
        <CheckCircle size={12} />
        <span>All connections are encrypted with WireGuard. Keys are generated locally and never leave your device.</span>
      </div>
    </div>
  );
}
