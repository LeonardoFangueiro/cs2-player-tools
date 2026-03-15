import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Shield,
  Plus,
  Key,
  Globe,
  Wifi,
  WifiOff,
  Trash2,
  Loader,
  CheckCircle,
  XCircle,
  Copy,
  RefreshCw,
  FileCode,
} from "lucide-react";

interface VpnProfile {
  name: string;
  server_endpoint: string;
  server_public_key: string;
  client_private_key: string;
  client_address: string;
  dns: string;
  mtu: number;
  allowed_ips: string;
  persistent_keepalive: number;
}

interface VpnStatus {
  connected: boolean;
  profile_name: string;
  interface_name: string;
  transfer_rx: number;
  transfer_tx: number;
  latest_handshake: string;
  endpoint: string;
}

interface KeyPair {
  private_key: string;
  public_key: string;
}

const DEFAULT_PROFILE: VpnProfile = {
  name: "",
  server_endpoint: "",
  server_public_key: "",
  client_private_key: "",
  client_address: "10.66.66.2/32",
  dns: "1.1.1.1",
  mtu: 1420,
  allowed_ips: "",
  persistent_keepalive: 25,
};

export default function SmartVPN() {
  const [profiles, setProfiles] = useState<VpnProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<VpnProfile>({ ...DEFAULT_PROFILE });
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generatingKey, setGeneratingKey] = useState(false);
  const [generatedPublicKey, setGeneratedPublicKey] = useState("");
  const [loadingValveIps, setLoadingValveIps] = useState(false);
  const [vpnStatus, setVpnStatus] = useState<VpnStatus | null>(null);
  const [activeProfile, setActiveProfile] = useState<string | null>(null);
  const [connectingProfile, setConnectingProfile] = useState<string | null>(null);
  const [previewConfig, setPreviewConfig] = useState<string | null>(null);
  const [previewProfileName, setPreviewProfileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  useEffect(() => {
    loadProfiles();
    loadVpnStatus();
  }, []);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  async function loadProfiles() {
    try {
      setLoading(true);
      const result = await invoke<VpnProfile[]>("vpn_list_profiles");
      setProfiles(result);
    } catch (e) {
      setError(String(e));
      setProfiles([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadVpnStatus() {
    try {
      const status = await invoke<VpnStatus>("vpn_get_status");
      setVpnStatus(status);
      if (status.connected) {
        setActiveProfile(status.profile_name);
      }
    } catch {
      // VPN status command may not be available
      setVpnStatus(null);
    }
  }

  async function generateKeypair() {
    try {
      setGeneratingKey(true);
      const kp = await invoke<KeyPair>("vpn_generate_keypair");
      setForm((prev) => ({ ...prev, client_private_key: kp.private_key }));
      setGeneratedPublicKey(kp.public_key);
      setToast({ message: "Keypair generated", type: "success" });
    } catch (e) {
      setToast({ message: `Key generation failed: ${String(e)}`, type: "error" });
    } finally {
      setGeneratingKey(false);
    }
  }

  async function fetchValveIps() {
    try {
      setLoadingValveIps(true);
      const ips = await invoke<string>("vpn_get_valve_ips");
      setForm((prev) => ({ ...prev, allowed_ips: ips }));
      setToast({ message: "Valve IPs loaded", type: "success" });
    } catch (e) {
      setToast({
        message: `Failed to fetch Valve IPs: ${String(e)}`,
        type: "error",
      });
    } finally {
      setLoadingValveIps(false);
    }
  }

  async function saveProfile() {
    if (!form.name.trim()) {
      setToast({ message: "Profile name is required", type: "error" });
      return;
    }
    if (!form.server_endpoint.trim()) {
      setToast({ message: "Server endpoint is required", type: "error" });
      return;
    }
    try {
      setSaving(true);
      await invoke("vpn_save_profile", { profile: form });
      setToast({ message: `Profile "${form.name}" saved`, type: "success" });
      setForm({ ...DEFAULT_PROFILE });
      setGeneratedPublicKey("");
      setShowForm(false);
      await loadProfiles();
    } catch (e) {
      setToast({ message: `Save failed: ${String(e)}`, type: "error" });
    } finally {
      setSaving(false);
    }
  }

  async function deleteProfile(name: string) {
    try {
      await invoke("vpn_delete_profile", { name });
      setToast({ message: `Profile "${name}" deleted`, type: "success" });
      await loadProfiles();
    } catch (e) {
      setToast({ message: `Delete failed: ${String(e)}`, type: "error" });
    }
  }

  async function connectProfile(name: string) {
    try {
      setConnectingProfile(name);
      await invoke("vpn_activate", { name });
      setActiveProfile(name);
      setToast({ message: `Connected to "${name}"`, type: "success" });
      await loadVpnStatus();
    } catch (e) {
      setToast({ message: `Connect failed: ${String(e)}`, type: "error" });
    } finally {
      setConnectingProfile(null);
    }
  }

  async function disconnectProfile() {
    try {
      await invoke("vpn_deactivate");
      setActiveProfile(null);
      setVpnStatus(null);
      setToast({ message: "VPN disconnected", type: "success" });
    } catch (e) {
      setToast({ message: `Disconnect failed: ${String(e)}`, type: "error" });
    }
  }

  async function showPreviewConfig(name: string) {
    try {
      const config = await invoke<string>("vpn_generate_config", { name });
      setPreviewConfig(config);
      setPreviewProfileName(name);
    } catch (e) {
      setToast({
        message: `Config preview failed: ${String(e)}`,
        type: "error",
      });
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    setToast({ message: "Copied to clipboard", type: "success" });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-accent">Smart VPN</h1>
          <p className="text-text-muted text-sm mt-1">
            WireGuard gaming VPN with intelligent routing
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 bg-accent text-white text-sm rounded-lg hover:bg-accent/80 transition"
        >
          <Plus size={14} />
          New Profile
        </button>
      </div>

      {/* VPN Status Banner */}
      {vpnStatus?.connected && (
        <div className="bg-success/10 border border-success/30 rounded-lg p-4 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Shield size={20} className="text-success" />
              <div>
                <div className="text-sm font-semibold text-success">
                  VPN Connected
                </div>
                <div className="text-xs text-text-muted">
                  Profile: {vpnStatus.profile_name} | Interface:{" "}
                  {vpnStatus.interface_name} | Endpoint: {vpnStatus.endpoint}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-xs text-text-muted">
                RX: {formatBytes(vpnStatus.transfer_rx)} | TX:{" "}
                {formatBytes(vpnStatus.transfer_tx)}
              </div>
              <button
                onClick={disconnectProfile}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-danger/15 text-danger text-xs rounded-md border border-danger/30 hover:bg-danger/25 transition"
              >
                <WifiOff size={12} />
                Disconnect
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="bg-warning/10 border border-warning/30 rounded-lg p-4 mb-6 flex items-start gap-3">
          <XCircle size={16} className="text-warning mt-0.5 shrink-0" />
          <div className="text-sm text-text-muted">
            <span className="text-warning font-semibold">
              VPN backend not available.
            </span>{" "}
            The VPN commands are not yet registered in the Tauri backend.
            Profiles will be shown when the backend is ready. Error: {error}
          </div>
        </div>
      )}

      {/* New Profile Form */}
      {showForm && (
        <div className="bg-bg-card border border-border rounded-lg p-5 mb-6">
          <h2 className="text-base font-semibold mb-4 flex items-center gap-2">
            <Key size={16} className="text-accent2" />
            New WireGuard Profile
          </h2>

          <div className="grid grid-cols-2 gap-4 mb-4">
            {/* Name */}
            <div>
              <label className="text-xs text-text-muted uppercase tracking-wider block mb-1">
                Profile Name *
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, name: e.target.value }))
                }
                placeholder="e.g., My Gaming VPN"
                className="w-full bg-bg border border-border rounded-md px-3 py-2 text-sm text-text focus:outline-none focus:border-accent"
              />
            </div>

            {/* Server Endpoint */}
            <div>
              <label className="text-xs text-text-muted uppercase tracking-wider block mb-1">
                Server Endpoint *
              </label>
              <input
                type="text"
                value={form.server_endpoint}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    server_endpoint: e.target.value,
                  }))
                }
                placeholder="e.g., vpn.example.com:51820"
                className="w-full bg-bg border border-border rounded-md px-3 py-2 text-sm text-text focus:outline-none focus:border-accent"
              />
            </div>

            {/* Server Public Key */}
            <div className="col-span-2">
              <label className="text-xs text-text-muted uppercase tracking-wider block mb-1">
                Server Public Key
              </label>
              <input
                type="text"
                value={form.server_public_key}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    server_public_key: e.target.value,
                  }))
                }
                placeholder="Server's WireGuard public key (base64)"
                className="w-full bg-bg border border-border rounded-md px-3 py-2 text-sm text-text font-mono focus:outline-none focus:border-accent"
              />
            </div>

            {/* Client Private Key */}
            <div className="col-span-2">
              <label className="text-xs text-text-muted uppercase tracking-wider block mb-1">
                Client Private Key
              </label>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={form.client_private_key}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      client_private_key: e.target.value,
                    }))
                  }
                  placeholder="Your WireGuard private key"
                  className="flex-1 bg-bg border border-border rounded-md px-3 py-2 text-sm text-text font-mono focus:outline-none focus:border-accent"
                />
                <button
                  onClick={generateKeypair}
                  disabled={generatingKey}
                  className="flex items-center gap-1.5 px-3 py-2 bg-accent2/15 text-accent2 text-sm rounded-md border border-accent2/30 hover:bg-accent2/25 transition disabled:opacity-50"
                >
                  {generatingKey ? (
                    <Loader size={14} className="animate-spin" />
                  ) : (
                    <RefreshCw size={14} />
                  )}
                  Generate
                </button>
              </div>
              {generatedPublicKey && (
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-xs text-text-muted">
                    Your Public Key:
                  </span>
                  <code className="text-xs font-mono text-accent2 bg-bg px-2 py-0.5 rounded">
                    {generatedPublicKey}
                  </code>
                  <button
                    onClick={() => copyToClipboard(generatedPublicKey)}
                    className="text-text-muted hover:text-text transition"
                  >
                    <Copy size={12} />
                  </button>
                </div>
              )}
            </div>

            {/* Client Address */}
            <div>
              <label className="text-xs text-text-muted uppercase tracking-wider block mb-1">
                Client Address
              </label>
              <input
                type="text"
                value={form.client_address}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    client_address: e.target.value,
                  }))
                }
                placeholder="10.66.66.2/32"
                className="w-full bg-bg border border-border rounded-md px-3 py-2 text-sm text-text font-mono focus:outline-none focus:border-accent"
              />
            </div>

            {/* DNS */}
            <div>
              <label className="text-xs text-text-muted uppercase tracking-wider block mb-1">
                DNS
              </label>
              <input
                type="text"
                value={form.dns}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, dns: e.target.value }))
                }
                placeholder="1.1.1.1"
                className="w-full bg-bg border border-border rounded-md px-3 py-2 text-sm text-text font-mono focus:outline-none focus:border-accent"
              />
            </div>

            {/* MTU */}
            <div>
              <label className="text-xs text-text-muted uppercase tracking-wider block mb-1">
                MTU
              </label>
              <input
                type="number"
                value={form.mtu}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    mtu: Number(e.target.value),
                  }))
                }
                min={1280}
                max={1500}
                className="w-full bg-bg border border-border rounded-md px-3 py-2 text-sm text-text font-mono focus:outline-none focus:border-accent"
              />
            </div>

            {/* Persistent Keepalive */}
            <div>
              <label className="text-xs text-text-muted uppercase tracking-wider block mb-1">
                Persistent Keepalive (sec)
              </label>
              <input
                type="number"
                value={form.persistent_keepalive}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    persistent_keepalive: Number(e.target.value),
                  }))
                }
                min={0}
                max={300}
                className="w-full bg-bg border border-border rounded-md px-3 py-2 text-sm text-text font-mono focus:outline-none focus:border-accent"
              />
            </div>

            {/* Allowed IPs */}
            <div className="col-span-2">
              <label className="text-xs text-text-muted uppercase tracking-wider block mb-1">
                Allowed IPs
              </label>
              <div className="flex gap-2">
                <textarea
                  value={form.allowed_ips}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      allowed_ips: e.target.value,
                    }))
                  }
                  placeholder="Comma-separated CIDR ranges (e.g., 162.254.192.0/21, 155.133.224.0/20)"
                  rows={3}
                  className="flex-1 bg-bg border border-border rounded-md px-3 py-2 text-sm text-text font-mono focus:outline-none focus:border-accent resize-none"
                />
                <button
                  onClick={fetchValveIps}
                  disabled={loadingValveIps}
                  className="self-start flex items-center gap-1.5 px-3 py-2 bg-accent2/15 text-accent2 text-sm rounded-md border border-accent2/30 hover:bg-accent2/25 transition disabled:opacity-50 whitespace-nowrap"
                >
                  {loadingValveIps ? (
                    <Loader size={14} className="animate-spin" />
                  ) : (
                    <Globe size={14} />
                  )}
                  Auto-fill Valve IPs
                </button>
              </div>
            </div>
          </div>

          <div className="flex gap-3 justify-end">
            <button
              onClick={() => {
                setShowForm(false);
                setForm({ ...DEFAULT_PROFILE });
                setGeneratedPublicKey("");
              }}
              className="px-4 py-2 text-sm text-text-muted hover:text-text transition"
            >
              Cancel
            </button>
            <button
              onClick={saveProfile}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-accent text-white text-sm rounded-lg hover:bg-accent/80 transition disabled:opacity-50"
            >
              {saving ? (
                <Loader size={14} className="animate-spin" />
              ) : (
                <CheckCircle size={14} />
              )}
              {saving ? "Saving..." : "Save Profile"}
            </button>
          </div>
        </div>
      )}

      {/* Profiles List */}
      <div className="mb-6">
        <h2 className="text-base font-semibold mb-4">Saved Profiles</h2>

        {loading && (
          <div className="grid grid-cols-1 gap-3">
            {[1, 2].map((i) => (
              <div
                key={i}
                className="bg-bg-card border border-border rounded-lg p-5 animate-pulse"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-border/40" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-border/40 rounded w-48" />
                    <div className="h-3 bg-border/40 rounded w-64" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && profiles.length === 0 && (
          <div className="bg-bg-card border border-border rounded-lg p-8 text-center">
            <Shield size={32} className="mx-auto mb-3 text-text-muted" />
            <p className="text-text-muted text-sm">
              No VPN profiles yet. Click "New Profile" to create one.
            </p>
          </div>
        )}

        {!loading && profiles.length > 0 && (
          <div className="grid grid-cols-1 gap-3">
            {profiles.map((profile) => {
              const isActive = activeProfile === profile.name;
              const isConnecting = connectingProfile === profile.name;

              return (
                <div
                  key={profile.name}
                  className={`bg-bg-card border rounded-lg p-5 transition ${
                    isActive
                      ? "border-success/40 bg-success/5"
                      : "border-border hover:border-accent/20"
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div
                      className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                        isActive
                          ? "bg-success/15"
                          : "bg-accent2/10"
                      }`}
                    >
                      {isActive ? (
                        <Wifi size={20} className="text-success" />
                      ) : (
                        <Shield size={20} className="text-accent2" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold">{profile.name}</h3>
                        {isActive && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-success/15 text-success font-semibold uppercase">
                            Connected
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-text-muted font-mono space-y-0.5">
                        <div>Endpoint: {profile.server_endpoint}</div>
                        <div>Address: {profile.client_address}</div>
                        <div>DNS: {profile.dns} | MTU: {profile.mtu}</div>
                        {profile.allowed_ips && (
                          <div className="truncate">
                            Allowed IPs: {profile.allowed_ips}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => showPreviewConfig(profile.name)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-text-muted text-xs rounded-md border border-border hover:border-accent/30 hover:text-text transition"
                        title="Preview Config"
                      >
                        <FileCode size={12} />
                        Preview
                      </button>

                      {isActive ? (
                        <button
                          onClick={disconnectProfile}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-danger/15 text-danger text-xs rounded-md border border-danger/30 hover:bg-danger/25 transition"
                        >
                          <WifiOff size={12} />
                          Disconnect
                        </button>
                      ) : (
                        <button
                          onClick={() => connectProfile(profile.name)}
                          disabled={isConnecting}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-success/15 text-success text-xs rounded-md border border-success/30 hover:bg-success/25 transition disabled:opacity-50"
                        >
                          {isConnecting ? (
                            <Loader size={12} className="animate-spin" />
                          ) : (
                            <Wifi size={12} />
                          )}
                          Connect
                        </button>
                      )}

                      <button
                        onClick={() => deleteProfile(profile.name)}
                        className="flex items-center gap-1.5 px-2 py-1.5 text-text-muted text-xs rounded-md border border-border hover:border-danger/30 hover:text-danger transition"
                        title="Delete"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Config Preview Modal */}
      {previewConfig !== null && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-bg-card border border-border rounded-lg w-[600px] max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h3 className="font-semibold flex items-center gap-2">
                <FileCode size={16} className="text-accent2" />
                WireGuard Config: {previewProfileName}
              </h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => copyToClipboard(previewConfig)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-text-muted text-xs rounded-md border border-border hover:text-text transition"
                >
                  <Copy size={12} />
                  Copy
                </button>
                <button
                  onClick={() => {
                    setPreviewConfig(null);
                    setPreviewProfileName(null);
                  }}
                  className="text-text-muted hover:text-text transition px-2 py-1"
                >
                  Close
                </button>
              </div>
            </div>
            <div className="p-5 overflow-y-auto flex-1">
              <pre className="bg-bg-code border border-border rounded-lg p-4 text-sm font-mono text-accent2 whitespace-pre-wrap overflow-x-auto">
                {previewConfig}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 px-5 py-3 rounded-lg shadow-lg border flex items-center gap-2 text-sm z-50 ${
            toast.type === "success"
              ? "bg-success/15 border-success/30 text-success"
              : "bg-danger/15 border-danger/30 text-danger"
          }`}
        >
          {toast.type === "success" ? (
            <CheckCircle size={16} />
          ) : (
            <XCircle size={16} />
          )}
          {toast.message}
        </div>
      )}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}
