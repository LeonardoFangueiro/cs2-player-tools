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
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${
        enabled ? "bg-accent" : "bg-border"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          enabled ? "translate-x-6" : "translate-x-1"
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
    <div className="flex items-center gap-4 py-4 border-b border-border/50 last:border-b-0">
      <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center shrink-0 text-accent">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-text">{label}</div>
        <div className="text-xs text-text-muted mt-0.5">{description}</div>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profiles, setProfiles] = useState<string[]>([]);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    loadSettings();
    loadProfiles();
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

  async function loadProfiles() {
    try {
      const p = await invoke<string[]>("vpn_list_profiles");
      setProfiles(p);
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
      setToast({ message: "Settings saved successfully", type: "success" });
    } catch (e) {
      setToast({ message: `Failed to save: ${String(e)}`, type: "error" });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div>
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-accent">Settings</h1>
          <p className="text-text-muted text-sm mt-1">
            Application configuration
          </p>
        </div>
        <div className="space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="bg-bg-card border border-border rounded-lg p-6 animate-pulse"
            >
              <div className="h-4 w-32 bg-border/40 rounded mb-4" />
              <div className="space-y-4">
                <div className="h-12 bg-border/20 rounded" />
                <div className="h-12 bg-border/20 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="pb-20">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-accent">Settings</h1>
        <p className="text-text-muted text-sm mt-1">
          Configure application behavior and preferences
        </p>
      </div>

      {/* VPN Settings */}
      <div className="bg-bg-card border border-border rounded-lg p-5 mb-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-text-muted mb-1 flex items-center gap-2">
          <Shield size={14} className="text-accent" />
          VPN
        </h2>
        <SettingRow
          icon={<Power size={18} />}
          label="Auto-connect VPN"
          description="Automatically connect VPN when CS2 is detected running"
        >
          <Toggle
            enabled={settings.auto_connect_vpn}
            onChange={(v) => updateSetting("auto_connect_vpn", v)}
          />
        </SettingRow>
        <SettingRow
          icon={<Shield size={18} />}
          label="VPN Profile"
          description="Select the VPN profile to use for auto-connect"
        >
          <select
            value={settings.vpn_profile_name ?? ""}
            onChange={(e) =>
              updateSetting(
                "vpn_profile_name",
                e.target.value || null
              )
            }
            className="bg-bg border border-border rounded-md px-3 py-1.5 text-sm text-text focus:outline-none focus:border-accent min-w-[160px]"
          >
            <option value="">None</option>
            {profiles.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </SettingRow>
      </div>

      {/* System Settings */}
      <div className="bg-bg-card border border-border rounded-lg p-5 mb-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-text-muted mb-1 flex items-center gap-2">
          <Monitor size={14} className="text-accent" />
          System
        </h2>
        <SettingRow
          icon={<Power size={18} />}
          label="Auto-start with Windows"
          description="Launch CS2 Player Tools when Windows starts"
        >
          <Toggle
            enabled={settings.auto_start_with_windows}
            onChange={(v) => updateSetting("auto_start_with_windows", v)}
          />
        </SettingRow>
        <SettingRow
          icon={<Minimize2 size={18} />}
          label="Minimize to tray on close"
          description="Keep the app running in the system tray instead of closing"
        >
          <Toggle
            enabled={settings.minimize_to_tray}
            onChange={(v) => updateSetting("minimize_to_tray", v)}
          />
        </SettingRow>
      </div>

      {/* CS2 Monitoring Settings */}
      <div className="bg-bg-card border border-border rounded-lg p-5 mb-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-text-muted mb-1 flex items-center gap-2">
          <Clock size={14} className="text-accent" />
          CS2 Monitoring
        </h2>
        <SettingRow
          icon={<Clock size={18} />}
          label="CS2 check interval"
          description="How often to check if CS2 is running (1-30 seconds)"
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
            className="w-20 bg-bg border border-border rounded-md px-3 py-1.5 text-sm text-text text-center focus:outline-none focus:border-accent"
          />
        </SettingRow>
        <SettingRow
          icon={<Wifi size={18} />}
          label="Max matchmaking ping"
          description="Maximum acceptable ping for matchmaking servers (30-350 ms)"
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
            className="w-20 bg-bg border border-border rounded-md px-3 py-1.5 text-sm text-text text-center focus:outline-none focus:border-accent"
          />
        </SettingRow>
      </div>

      {/* Network Settings */}
      <div className="bg-bg-card border border-border rounded-lg p-5 mb-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-text-muted mb-1 flex items-center gap-2">
          <Globe size={14} className="text-accent" />
          Network
        </h2>
        <SettingRow
          icon={<Globe size={18} />}
          label="Dynamic Valve IPs"
          description="Fetch live Valve relay IPs from Steam API for split tunneling (recommended)"
        >
          <Toggle
            enabled={settings.dynamic_valve_ips}
            onChange={(v) => updateSetting("dynamic_valve_ips", v)}
          />
        </SettingRow>
      </div>

      {/* Account / Token */}
      <div className="bg-bg-card border border-border rounded-lg p-5 mb-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-text-muted mb-1 flex items-center gap-2">
          <Shield size={14} className="text-accent" />
          Account
        </h2>
        <div className="flex items-center gap-4 py-4">
          <div className="w-9 h-9 rounded-lg bg-danger/10 flex items-center justify-center shrink-0 text-danger">
            <LogOut size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-text">Logout / Change Token</div>
            <div className="text-xs text-text-muted mt-0.5">
              Remove your stored access token and return to the login screen
            </div>
          </div>
          <button
            onClick={() => {
              localStorage.removeItem("cs2pt_token");
              window.location.reload();
            }}
            className="px-4 py-2 bg-danger/15 border border-danger/30 text-danger text-sm font-semibold rounded-lg hover:bg-danger/25 transition"
          >
            Logout
          </button>
        </div>
      </div>

      {/* Sticky save bar */}
      {hasChanges && (
        <div className="fixed bottom-0 left-[220px] right-0 bg-bg-card/95 backdrop-blur border-t border-accent/30 px-6 py-4 flex items-center justify-between z-40">
          <span className="text-sm text-text-muted">
            You have unsaved changes
          </span>
          <button
            onClick={saveSettings}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 bg-accent text-white text-sm font-semibold rounded-lg hover:bg-accent/80 transition disabled:opacity-50"
          >
            {saving ? (
              <Loader size={14} className="animate-spin" />
            ) : (
              <Save size={14} />
            )}
            {saving ? "Saving..." : "Save Settings"}
          </button>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 px-5 py-3 rounded-lg shadow-lg border flex items-center gap-2 text-sm z-50 max-w-md ${
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
