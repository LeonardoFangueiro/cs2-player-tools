import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { invoke } from "../lib/tauri";
import {
  Network,
  Gamepad2,
  Users,
  Settings,
  Globe,
  Settings2,
  FileCode,
  Package,
  Zap,
  User,
  BarChart3,
  ShieldCheck,
  ArrowLeft,
  ChevronDown,
  Power,
  Loader,
  Star,
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

type ConnectionState = "disconnected" | "connecting" | "connected" | "disconnecting";

const HQ_BASE = "https://cs2-player-tools.maltinha.club/api";

// ── Menu Definitions ──

const mainMenu = [
  { id: "network", icon: Network, label: "NETWORK", desc: "Servers, Optimizations" },
  { id: "gameplay", icon: Gamepad2, label: "GAMEPLAY", desc: "CS2 Config, Inventory" },
  { id: "sessions", icon: Users, label: "SESSIONS", desc: "Profile, History" },
  { id: "settings", route: "/settings", icon: Settings, label: "SETTINGS", desc: "App configuration" },
];

const subMenus: Record<string, Array<{ route: string; icon: typeof Globe; label: string; desc: string }>> = {
  network: [
    { route: "/servers", icon: Globe, label: "SERVER PICKER", desc: "Block & allow regions" },
    { route: "/optimizer", icon: Settings2, label: "OPTIMIZATIONS", desc: "Windows network tweaks" },
  ],
  gameplay: [
    { route: "/cs2config", icon: FileCode, label: "CS2 CONFIGS", desc: "Autoexec & pro settings" },
    { route: "/inventory", icon: Package, label: "INVENTORY", desc: "Coming soon" },
    { route: "/gameplay-opt", icon: Zap, label: "OPTIMIZATIONS", desc: "Coming soon" },
  ],
  sessions: [
    { route: "/profile", icon: User, label: "PROFILE", desc: "Coming soon" },
    { route: "/history", icon: BarChart3, label: "HISTORY", desc: "Connection quality log" },
    { route: "/check-account", icon: ShieldCheck, label: "CHECK ACCOUNT", desc: "Coming soon" },
  ],
};

// ── Component ──

export default function Home() {
  const navigate = useNavigate();
  const [view, setView] = useState<string>("home");

  // VPN dropdown state
  const [servers, setServers] = useState<VpnServer[]>([]);
  const [selectedServerId, setSelectedServerId] = useState<string>("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [favoriteId, setFavoriteId] = useState<string>("");
  const [connectionState, setConnectionState] = useState<ConnectionState>("disconnected");
  const [connectError, setConnectError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Load servers + favorite + connection state
  useEffect(() => {
    fetchServers();
    const fav = localStorage.getItem("cs2pt_vpn_favorite") || "";
    setFavoriteId(fav);

    const connected = localStorage.getItem("cs2pt_vpn_connected") === "true";
    if (connected) {
      const sid = localStorage.getItem("cs2pt_vpn_server_id") || "";
      const profileName = `smartvpn-${sid}`;
      (async () => {
        try {
          const status = await invoke<{ active: boolean }>("vpn_get_status", { profileName });
          if (!status.active) {
            // Tunnel is dead, clear state
            localStorage.removeItem("cs2pt_vpn_connected");
            localStorage.removeItem("cs2pt_vpn_server_id");
            localStorage.removeItem("cs2pt_vpn_ip");
            setConnectionState("disconnected");
          } else {
            setConnectionState("connected");
            setSelectedServerId(sid);
          }
        } catch {
          setConnectionState("connected"); // Assume connected if can't check
          setSelectedServerId(sid);
        }
      })();
    }
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  async function fetchServers() {
    try {
      setLoading(true);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const resp = await fetch(`${HQ_BASE}/vpn-servers`, { signal: controller.signal });
      clearTimeout(timeout);
      const data = await resp.json();
      const srvs: VpnServer[] = data.servers || [];
      setServers(srvs);

      // Auto-select favorite or first
      const fav = localStorage.getItem("cs2pt_vpn_favorite") || "";
      const connected = localStorage.getItem("cs2pt_vpn_connected") === "true";
      const connectedId = localStorage.getItem("cs2pt_vpn_server_id") || "";
      if (connected && connectedId) {
        setSelectedServerId(connectedId);
      } else if (fav && srvs.find(s => s.id === fav)) {
        setSelectedServerId(fav);
      } else if (srvs.length > 0) {
        setSelectedServerId(srvs[0].id);
      }
    } catch {
      // Silent
    } finally {
      setLoading(false);
    }
  }

  // Sort servers: favorite first
  function getSortedServers(): VpnServer[] {
    return [...servers].sort((a, b) => {
      if (a.id === favoriteId) return -1;
      if (b.id === favoriteId) return 1;
      return 0;
    });
  }

  const selectedServer = servers.find(s => s.id === selectedServerId);

  async function handleConnect() {
    if (connectionState === "connected" || connectionState === "disconnecting") {
      // Disconnect
      setConnectionState("disconnecting");
      const serverId = localStorage.getItem("cs2pt_vpn_server_id") || selectedServerId;
      const profileName = `smartvpn-${serverId}`;

      // Deactivate local tunnel
      try {
        await invoke("vpn_deactivate", { profileName });
      } catch {
        // ignore
      }

      // Remove peer from server (best-effort)
      try {
        const token = localStorage.getItem("cs2pt_token") || "";
        const clientPubKey = localStorage.getItem("cs2pt_vpn_client_pubkey") || "";
        if (clientPubKey) {
          await fetch(`${HQ_BASE}/vpn-servers/${serverId}/disconnect`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token, client_public_key: clientPubKey }),
          }).catch(() => {});
        }
      } catch {
        // ignore
      }

      localStorage.removeItem("cs2pt_vpn_connected");
      localStorage.removeItem("cs2pt_vpn_server_id");
      localStorage.removeItem("cs2pt_vpn_ip");
      localStorage.removeItem("cs2pt_vpn_connect_time");
      localStorage.removeItem("cs2pt_vpn_client_pubkey");
      setConnectionState("disconnected");
      return;
    }

    if (!selectedServerId) return;
    setConnectionState("connecting");
    setConnectError(null);

    // Clean up any previous tunnel
    const prevServerId = localStorage.getItem("cs2pt_vpn_server_id");
    if (prevServerId) {
      try {
        await invoke("vpn_deactivate", { profileName: `smartvpn-${prevServerId}` });
      } catch {}
    }

    try {
      const token = localStorage.getItem("cs2pt_token") || "";

      // Step 1: Generate client keypair
      const keypair = await invoke<[string, string]>("vpn_generate_keypair");
      const clientPrivateKey = keypair[0];
      const clientPublicKey = keypair[1];

      // Step 2: Request connection from HQ (with 15s timeout)
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const configResp = await fetch(
        `${HQ_BASE}/vpn-servers/${selectedServerId}/connect`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token,
            client_public_key: clientPublicKey,
          }),
          signal: controller.signal,
        }
      );
      clearTimeout(timeout);

      const configData = await configResp.json();
      if (!configData.success) {
        throw new Error(configData.error || "Connection refused by server");
      }
      const config: VpnConnectResponse = configData.config;

      // Step 3: Save VPN profile locally
      const profileName = `smartvpn-${selectedServerId}`;
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

      // Step 4: Activate the tunnel
      const activateResult = await invoke<{ success: boolean; message: string }>("vpn_reconnect", {
        profileName,
      });

      if (!activateResult.success) {
        throw new Error(activateResult.message);
      }

      // Success
      const clientIp = config.client_address.split("/")[0];
      localStorage.setItem("cs2pt_vpn_connected", "true");
      localStorage.setItem("cs2pt_vpn_server_id", selectedServerId);
      localStorage.setItem("cs2pt_vpn_ip", clientIp);
      localStorage.setItem("cs2pt_vpn_connect_time", Date.now().toString());
      localStorage.setItem("cs2pt_vpn_client_pubkey", clientPublicKey);
      setConnectionState("connected");
    } catch (e) {
      setConnectError(e instanceof Error ? e.message : String(e));
      setConnectionState("disconnected");
    }
  }

  function toggleFavorite(serverId: string) {
    if (favoriteId === serverId) {
      setFavoriteId("");
      localStorage.removeItem("cs2pt_vpn_favorite");
    } else {
      setFavoriteId(serverId);
      localStorage.setItem("cs2pt_vpn_favorite", serverId);
    }
  }

  // ── Render helpers ──

  function renderMenuButton(item: { id?: string; route?: string; icon: typeof Network; label: string; desc: string }, smaller = false) {
    const Icon = item.icon;
    const handleClick = () => {
      if (item.route) {
        navigate(item.route);
      } else if (item.id) {
        setView(item.id);
      }
    };

    return (
      <button
        key={item.id || item.route || item.label}
        onClick={handleClick}
        className="group relative overflow-hidden transition-all duration-200 hover:scale-[1.04] active:scale-[0.97]"
      >
        <div className={`
          relative flex flex-col items-center justify-center gap-1.5 ${smaller ? "py-4 px-3" : "py-5 px-3"}
          bg-gradient-to-b from-bg-card to-bg
          border border-border
          clip-gaming
          group-hover:border-accent/60
          group-hover:shadow-[0_0_20px_rgba(230,126,34,0.15)]
          transition-all duration-200
        `}>
          {/* Top accent line */}
          <div className="absolute top-0 left-[10%] right-[10%] h-[2px] bg-accent opacity-40 group-hover:opacity-100 transition" />

          {/* Glow bg on hover */}
          <div className="absolute inset-0 bg-accent/0 group-hover:bg-accent/8 transition duration-300" />

          {/* Icon */}
          <div className="relative z-10 p-2 rounded-lg bg-accent/10 group-hover:bg-accent/20 transition">
            <Icon size={smaller ? 20 : 24} className="text-accent drop-shadow-[0_0_6px_currentColor]" />
          </div>

          {/* Label */}
          <span className={`relative z-10 ${smaller ? "text-[10px]" : "text-xs"} font-bold tracking-wider text-text group-hover:text-white transition`}>
            {item.label}
          </span>

          {/* Description */}
          <span className="relative z-10 text-[9px] text-text-muted/60 leading-tight text-center">
            {item.desc}
          </span>

          {/* Bottom scan line */}
          <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-accent/30 to-transparent" />
        </div>
      </button>
    );
  }

  function renderVpnDropdown() {
    const sorted = getSortedServers();
    const isConnected = connectionState === "connected";
    const isLoading = connectionState === "connecting" || connectionState === "disconnecting";

    return (
      <div className="flex items-center gap-3 w-full max-w-xl mx-auto mb-6">
        {/* Custom dropdown */}
        <div className="flex-1 relative" ref={dropdownRef}>
          <button
            onClick={() => !isConnected && setDropdownOpen(!dropdownOpen)}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg border transition text-left ${
              isConnected
                ? "bg-success/10 border-success/40 cursor-default"
                : "bg-bg-card border-border hover:border-accent/40 cursor-pointer"
            }`}
            disabled={isConnected}
          >
            {selectedServer ? (
              <>
                {selectedServer.country_code && (
                  <img
                    src={`https://flagcdn.com/w40/${selectedServer.country_code.toLowerCase()}.png`}
                    alt="" className="w-6 h-4 rounded-sm object-cover shrink-0"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-text truncate">{selectedServer.name} - {selectedServer.location}</div>
                  <div className="text-[10px] text-text-muted">
                    {selectedServer.current_clients}/{selectedServer.max_clients} clients
                  </div>
                </div>
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                  selectedServer.current_clients < selectedServer.max_clients ? "bg-success" : "bg-danger"
                }`} />
                {selectedServer.id === favoriteId && (
                  <Star size={12} className="text-warning fill-warning shrink-0" />
                )}
              </>
            ) : (
              <span className="text-text-muted text-xs">Select a server...</span>
            )}
            {!isConnected && <ChevronDown size={14} className="text-text-muted shrink-0" />}
          </button>

          {/* Dropdown list */}
          {dropdownOpen && (
            <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-bg-card border border-border rounded-lg shadow-2xl max-h-64 overflow-y-auto">
              {sorted.length === 0 && (
                <div className="px-3 py-4 text-center text-text-muted text-xs">{loading ? "Loading servers..." : "No servers available"}</div>
              )}
              {sorted.map(srv => (
                <div
                  key={srv.id}
                  onClick={() => {
                    setSelectedServerId(srv.id);
                    setDropdownOpen(false);
                  }}
                  className={`flex items-center gap-2.5 px-3 py-2 cursor-pointer transition hover:bg-bg-hover ${
                    srv.id === selectedServerId ? "bg-accent/10" : ""
                  }`}
                >
                  {srv.country_code && (
                    <img
                      src={`https://flagcdn.com/w40/${srv.country_code.toLowerCase()}.png`}
                      alt="" className="w-5 h-3.5 rounded-sm object-cover shrink-0"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-text truncate">{srv.name} - {srv.location}</div>
                  </div>
                  <span className="text-[10px] text-text-muted font-mono">
                    {srv.current_clients}/{srv.max_clients}
                  </span>
                  <span className={`w-2 h-2 rounded-full shrink-0 ${
                    srv.current_clients < srv.max_clients ? "bg-success" : "bg-danger"
                  }`} />
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleFavorite(srv.id); }}
                    className="p-0.5 hover:bg-bg-hover rounded transition"
                  >
                    <Star size={11} className={srv.id === favoriteId ? "text-warning fill-warning" : "text-text-muted/30"} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Connect / Disconnect button — icon-only */}
        <button
          onClick={handleConnect}
          disabled={isLoading || (!selectedServerId && connectionState === "disconnected")}
          className={`shrink-0 flex items-center justify-center w-12 h-12 rounded-xl border transition-all duration-200 disabled:opacity-50 ${
            isLoading
              ? "bg-warning/20 border-warning/50"
              : isConnected
                ? "bg-success/20 border-success/50"
                : "bg-danger/20 border-danger/50"
          }`}
        >
          {isLoading ? (
            <Loader size={20} className="animate-spin text-warning" />
          ) : (
            <Power size={20} className={isConnected ? "text-success" : "text-danger"} />
          )}
        </button>
      </div>
    );
  }

  // ── Main Render ──

  if (view !== "home" && subMenus[view]) {
    // Sub-menu view
    const items = subMenus[view];
    const viewLabel = view.charAt(0).toUpperCase() + view.slice(1);
    return (
      <div className="h-full flex flex-col items-center justify-center px-8 py-6">
        {/* Smaller logo */}
        <div className="mb-6">
          <img src="/logo.png" alt="CS2 Player Tools" className="h-32 w-auto mx-auto" />
        </div>

        {/* Sub-menu header — centered below logo */}
        <div className="relative mb-5">
          <div className="flex items-center justify-center">
            <div className="px-8 py-2 bg-gradient-to-r from-transparent via-accent/15 to-transparent border-y border-accent/20">
              <span className="text-sm font-bold text-accent tracking-[3px] uppercase">{viewLabel}</span>
            </div>
          </div>
        </div>

        {/* Sub-menu grid */}
        <div className={`grid ${items.length <= 3 ? "grid-cols-3" : "grid-cols-4"} gap-3 w-full max-w-2xl mb-6`}>
          {items.map(item => renderMenuButton(item, true))}
        </div>

        {/* Back button — below sub-menu buttons */}
        <button
          onClick={() => setView("home")}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs text-text-muted hover:text-accent hover:bg-bg-hover transition mx-auto"
        >
          <ArrowLeft size={14} /> Back to Menu
        </button>
      </div>
    );
  }

  // Home view
  return (
    <div className="h-full flex flex-col items-center justify-center px-8 py-6">
      {/* Logo */}
      <div className="mb-6">
        <img src="/logo.png" alt="CS2 Player Tools" className="h-48 w-auto mx-auto" />
      </div>

      {/* VPN Server selector + Connect */}
      {renderVpnDropdown()}

      {/* Connection error */}
      {connectError && (
        <div className="text-[10px] text-danger text-center mb-2">{connectError}</div>
      )}

      {/* Menu Grid — Gaming Style */}
      <div className="grid grid-cols-4 gap-3 w-full max-w-3xl mb-6">
        {mainMenu.map(btn => renderMenuButton(btn))}
      </div>
    </div>
  );
}
