import { useEffect, useState } from "react";
import { invoke } from "../lib/tauri";
import {
  Save,
  Loader,
  CheckCircle,
  XCircle,
  Shield,
  Wifi,
  Monitor,
  Clock,
  Power,
  Minimize2,
  Globe,
  LogOut,
} from "lucide-react";

interface AppSettings {
  auto_connect_vpn: boolean;
  vpn_profile_name: string | null;
  max_ping: number;
  auto_start_with_windows: boolean;
  minimize_to_tray: boolean;
  check_cs2_interval_secs: number;
  dynamic_valve_ips: boolean;
}

const DEFAULT_SETTINGS: AppSettings = {
  auto_connect_vpn: false,
  vpn_profile_name: null,
  max_ping: 70,
  auto_start_with_windows: false,
  minimize_to_tray: true,
  check_cs2_interval_secs: 5,
  dynamic_valve_ips: true,
};

function Toggle({
  enabled,
  onChange,
}: {
  enabled: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!enabled)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0 ${
        enabled ? "bg-accent" : "bg-border"
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
          enabled ? "translate-x-[18px]" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

function SettingRow({
  icon,
  label,
  description,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-border/50 last:border-b-0">
      <span className="text-accent shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-semibold text-text">{label}</div>
        <div className="text-[10px] text-text-muted leading-tight">{description}</div>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [vpnServers, setVpnServers] = useState<Array<{ id: string; name: string; flag: string; location: string }>>([]);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    loadSettings();
    loadVpnServers();
  }, []);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  async function loadSettings() {
    try {
      setLoading(true);
      const s = await invoke<AppSettings>("get_settings");
      setSettings(s);
    } catch {
      // Use defaults
    } finally {
      setLoading(false);
    }
  }

  async function loadVpnServers() {
    try {
      const resp = await fetch("https://cs2-player-tools.maltinha.club/api/vpn-servers");
      const data = await resp.json();
      setVpnServers(data.servers || []);
    } catch {
      // Ignore
    }
  }

  function updateSetting<K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K]
  ) {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setHasChanges(true);
  }

  async function saveSettings() {
    try {
      setSaving(true);
      await invoke("save_app_settings", { settings });
      setHasChanges(false);
      setToast({ message: "Settings saved", type: "success" });
    } catch (e) {
      setToast({ message: `Failed to save: ${String(e)}`, type: "error" });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div>
        <div className="mb-4">
          <h1 className="text-2xl font-bold text-accent">Settings</h1>
          <p className="text-text-muted text-sm mt-1">Application configuration</p>
        </div>
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-bg-card border border-border rounded-lg p-3 animate-pulse">
              <div className="h-3 w-24 bg-border/40 rounded mb-2" />
              <div className="space-y-2">
                <div className="h-8 bg-border/20 rounded" />
                <div className="h-8 bg-border/20 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="pb-16">
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-accent">Settings</h1>
        <p className="text-text-muted text-sm mt-1">Configure behavior and preferences</p>
      </div>

      {/* VPN Settings */}
      <div className="bg-bg-card border border-border rounded-lg p-3 mb-2">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-1 flex items-center gap-1.5">
          <Shield size={10} className="text-accent" />
          VPN
        </div>
        <SettingRow
          icon={<Power size={14} />}
          label="Auto-connect VPN"
          description="Connect VPN when CS2 is detected"
        >
          <Toggle
            enabled={settings.auto_connect_vpn}
            onChange={(v) => updateSetting("auto_connect_vpn", v)}
          />
        </SettingRow>
        <SettingRow
          icon={<Globe size={14} />}
          label="Favorite VPN Location"
          description="Preferred VPN server"
        >
          <select
            value={settings.vpn_profile_name ?? ""}
            onChange={(e) =>
              updateSetting(
                "vpn_profile_name",
                e.target.value || null
              )
            }
            className="bg-bg border border-border rounded px-2 py-1 text-xs text-text focus:outline-none focus:border-accent min-w-[140px]"
          >
            <option value="">None</option>
            {vpnServers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.flag} {s.name} — {s.location}
              </option>
            ))}
          </select>
        </SettingRow>
      </div>

      {/* System Settings */}
      <div className="bg-bg-card border border-border rounded-lg p-3 mb-2">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-1 flex items-center gap-1.5">
          <Monitor size={10} className="text-accent" />
          System
        </div>
        <SettingRow
          icon={<Power size={14} />}
          label="Auto-start with Windows"
          description="Launch when Windows starts"
        >
          <Toggle
            enabled={settings.auto_start_with_windows}
            onChange={(v) => updateSetting("auto_start_with_windows", v)}
          />
        </SettingRow>
        <SettingRow
          icon={<Minimize2 size={14} />}
          label="Minimize to tray"
          description="Keep running in system tray on close"
        >
          <Toggle
            enabled={settings.minimize_to_tray}
            onChange={(v) => updateSetting("minimize_to_tray", v)}
          />
        </SettingRow>
      </div>

      {/* CS2 Monitoring Settings */}
      <div className="bg-bg-card border border-border rounded-lg p-3 mb-2">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-1 flex items-center gap-1.5">
          <Clock size={10} className="text-accent" />
          CS2 Monitoring
        </div>
        <SettingRow
          icon={<Clock size={14} />}
          label="Check interval"
          description="CS2 detection polling (1-30s)"
        >
          <input
            type="number"
            min={1}
            max={30}
            value={settings.check_cs2_interval_secs}
            onChange={(e) => {
              const val = Math.min(30, Math.max(1, Number(e.target.value)));
              updateSetting("check_cs2_interval_secs", val);
            }}
            className="w-16 bg-bg border border-border rounded px-2 py-1 text-xs text-text text-center focus:outline-none focus:border-accent"
          />
        </SettingRow>
        <SettingRow
          icon={<Wifi size={14} />}
          label="Max matchmaking ping"
          description="Maximum acceptable ping (30-350ms)"
        >
          <input
            type="number"
            min={30}
            max={350}
            value={settings.max_ping}
            onChange={(e) => {
              const val = Math.min(350, Math.max(30, Number(e.target.value)));
              updateSetting("max_ping", val);
            }}
            className="w-16 bg-bg border border-border rounded px-2 py-1 text-xs text-text text-center focus:outline-none focus:border-accent"
          />
        </SettingRow>
      </div>

      {/* Network Settings */}
      <div className="bg-bg-card border border-border rounded-lg p-3 mb-2">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-1 flex items-center gap-1.5">
          <Globe size={10} className="text-accent" />
          Network
        </div>
        <SettingRow
          icon={<Globe size={14} />}
          label="Dynamic Valve IPs"
          description="Fetch live relay IPs from Steam API"
        >
          <Toggle
            enabled={settings.dynamic_valve_ips}
            onChange={(v) => updateSetting("dynamic_valve_ips", v)}
          />
        </SettingRow>
      </div>

      {/* Account */}
      <div className="bg-bg-card border border-border rounded-lg p-3 mb-2">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-1 flex items-center gap-1.5">
          <Shield size={10} className="text-accent" />
          Account
        </div>
        <div className="flex items-center gap-3 py-2.5">
          <span className="text-danger shrink-0"><LogOut size={14} /></span>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-text">Logout / Change Token</div>
            <div className="text-[10px] text-text-muted leading-tight">Remove stored token and return to login</div>
          </div>
          <button
            onClick={() => {
              localStorage.removeItem("cs2pt_token");
              window.location.reload();
            }}
            className="px-2.5 py-1 bg-danger/15 border border-danger/30 text-danger text-[10px] font-semibold rounded hover:bg-danger/25 transition"
          >
            Logout
          </button>
        </div>
      </div>

      {/* Sticky save bar */}
      {hasChanges && (
        <div className="fixed bottom-0 left-[220px] right-0 bg-bg-card/95 backdrop-blur border-t border-accent/30 px-4 py-3 flex items-center justify-between z-40">
          <span className="text-xs text-text-muted">Unsaved changes</span>
          <button
            onClick={saveSettings}
            disabled={saving}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-accent text-white text-xs font-semibold rounded-lg hover:bg-accent/80 transition disabled:opacity-50"
          >
            {saving ? <Loader size={12} className="animate-spin" /> : <Save size={12} />}
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 px-4 py-2.5 rounded-lg shadow-lg border flex items-center gap-2 text-xs z-50 max-w-md ${
            toast.type === "success"
              ? "bg-success/15 border-success/30 text-success"
              : "bg-danger/15 border-danger/30 text-danger"
          }`}
        >
          {toast.type === "success" ? (
            <CheckCircle size={12} />
          ) : (
            <XCircle size={12} />
          )}
          {toast.message}
        </div>
      )}
    </div>
  );
}
