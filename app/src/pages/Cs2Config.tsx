import { useState, useEffect } from "react";
import { invoke } from "../lib/tauri";
import {
  FileCode,
  CheckCircle,
  XCircle,
  Loader,
  Play,
  Terminal,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";

// ── Types ──

interface ConfigSetting {
  key: string;
  current_value: string | null;
  recommended_value: string;
  description: string;
  is_optimized: boolean;
}

interface ScanResult {
  autoexec_path: string | null;
  autoexec_exists: boolean;
  current_settings: ConfigSetting[];
  launch_options: string | null;
}

interface ApplyResult {
  success: boolean;
  message: string;
}

// ── Component ──

export default function Cs2Config() {
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [launchOptions, setLaunchOptions] = useState<Array<[string, string]>>([]);
  const [applyingAll, setApplyingAll] = useState(false);
  const [applyingKey, setApplyingKey] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  async function scanConfig() {
    try {
      setScanning(true);
      const result = await invoke<ScanResult>("scan_cs2_config");
      setScanResult(result);

      const opts = await invoke<Array<[string, string]>>("get_launch_options");
      setLaunchOptions(opts);
    } catch (e) {
      setToast({ message: `Scan failed: ${String(e)}`, type: "error" });
    } finally {
      setScanning(false);
    }
  }

  async function applyAll() {
    if (!scanResult) return;
    setApplyingAll(true);
    try {
      const settingsArray = scanResult.current_settings
        .map(s => [s.key, s.recommended_value] as [string, string]);
      const result = await invoke<ApplyResult>("apply_cs2_config", { settings: settingsArray });
      if (result.success) {
        setToast({ message: "All recommended settings applied", type: "success" });
        await scanConfig();
      } else {
        setToast({ message: result.message, type: "error" });
      }
    } catch (e) {
      setToast({ message: `Apply failed: ${String(e)}`, type: "error" });
    } finally {
      setApplyingAll(false);
    }
  }

  async function applySingle(setting: ConfigSetting) {
    setApplyingKey(setting.key);
    try {
      const settingsArray: [string, string][] = [
        [setting.key, setting.recommended_value],
      ];
      const result = await invoke<ApplyResult>("apply_cs2_config", { settings: settingsArray });
      if (result.success) {
        setToast({ message: `${setting.key} applied`, type: "success" });
        await scanConfig();
      } else {
        setToast({ message: result.message, type: "error" });
      }
    } catch (e) {
      setToast({ message: `Apply failed: ${String(e)}`, type: "error" });
    } finally {
      setApplyingKey(null);
    }
  }

  const optimizedCount = scanResult
    ? scanResult.current_settings.filter((s) => s.is_optimized).length
    : 0;
  const totalCount = scanResult?.current_settings.length ?? 0;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-accent">CS2 Config</h1>
          <p className="text-text-muted text-sm mt-1">
            {scanResult ? `${optimizedCount}/${totalCount} optimized` : "Scan to detect settings"}
            {scanResult?.autoexec_path && (
              <span className="ml-2 font-mono text-[10px]">{scanResult.autoexec_path}</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {scanResult && scanResult.current_settings.length > 0 && (
            <button
              onClick={applyAll}
              disabled={applyingAll || scanning}
              className="flex items-center gap-1 px-3 py-1.5 bg-accent text-white text-xs rounded-lg hover:bg-accent/80 transition disabled:opacity-50"
            >
              {applyingAll ? <Loader size={12} className="animate-spin" /> : <Play size={12} />}
              {applyingAll ? "Applying..." : "Apply All"}
            </button>
          )}
          <button
            onClick={scanConfig}
            disabled={scanning}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-bg-card border border-border rounded-lg text-xs text-text-muted hover:text-text hover:border-accent/30 transition disabled:opacity-50"
          >
            {scanning ? <Loader size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            Scan
          </button>
        </div>
      </div>

      {/* No scan yet */}
      {!scanResult && !scanning && (
        <div className="bg-bg-card border border-border rounded-lg p-8 text-center">
          <FileCode size={32} className="mx-auto mb-3 text-text-muted" />
          <p className="text-text-muted text-xs">
            Click "Scan" to detect your current CS2 configuration settings.
          </p>
        </div>
      )}

      {/* Scanning skeleton */}
      {scanning && (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-12 bg-border/20 rounded-lg animate-pulse" />
          ))}
        </div>
      )}

      {/* Config Settings — compact rows */}
      {!scanning && scanResult && scanResult.current_settings.length > 0 && (
        <div className="space-y-2 mb-4">
          {scanResult.current_settings.map((setting) => (
            <div
              key={setting.key}
              className="bg-bg-card border border-border rounded-lg p-3 hover:border-accent/20 transition"
            >
              <div className="flex items-center gap-2.5">
                {/* Status icon */}
                <span className={`shrink-0 ${setting.is_optimized ? "text-success" : "text-accent"}`}>
                  {setting.is_optimized ? <CheckCircle size={14} /> : <AlertTriangle size={14} />}
                </span>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-text font-mono">{setting.key}</span>
                    {setting.is_optimized ? (
                      <span className="text-[9px] px-1 py-px rounded-full bg-success/15 text-success font-semibold uppercase">ok</span>
                    ) : (
                      <span className="text-[9px] px-1 py-px rounded-full bg-accent/15 text-accent font-semibold uppercase">rec</span>
                    )}
                  </div>
                  <p className="text-text-muted text-[10px] leading-tight mt-0.5 truncate">{setting.description}</p>
                </div>

                {/* Values */}
                <div className="shrink-0 text-right text-[10px]">
                  <span className="text-text-muted">
                    <span className={`font-mono font-semibold ${setting.is_optimized ? "text-success" : "text-warning"}`}>
                      {setting.current_value ?? "unset"}
                    </span>
                  </span>
                  {!setting.is_optimized && (
                    <span className="text-text-muted ml-2">
                      rec: <span className="font-mono font-semibold text-accent2">{setting.recommended_value}</span>
                    </span>
                  )}
                </div>

                {/* Apply button */}
                <button
                  onClick={() => applySingle(setting)}
                  disabled={applyingKey === setting.key || setting.is_optimized}
                  className={`shrink-0 px-2.5 py-1 text-[10px] rounded border transition disabled:opacity-40 flex items-center gap-1 ${
                    setting.is_optimized
                      ? "bg-success/10 border-success/30 text-success cursor-default"
                      : "bg-accent/10 text-accent border-accent/30 hover:bg-accent/20"
                  }`}
                >
                  {applyingKey === setting.key ? (
                    <><Loader size={10} className="animate-spin" /> ...</>
                  ) : setting.is_optimized ? (
                    <><CheckCircle size={10} /> Done</>
                  ) : (
                    "Apply"
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty settings after scan */}
      {!scanning && scanResult && scanResult.current_settings.length === 0 && (
        <div className="bg-bg-card border border-border rounded-lg p-6 text-center mb-4">
          <FileCode size={24} className="mx-auto mb-2 text-text-muted" />
          <p className="text-text-muted text-xs">
            No configurable settings detected.
          </p>
        </div>
      )}

      {/* Launch Options — inline list */}
      {launchOptions.length > 0 && (
        <div className="bg-bg-card border border-border rounded-lg p-3 mb-4">
          <div className="flex items-center gap-2 mb-2">
            <Terminal size={14} className="text-accent2" />
            <span className="text-xs font-semibold">Launch Options</span>
          </div>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {launchOptions.map(([option, desc]) => (
              <span
                key={option}
                className="inline-flex items-center gap-1.5 px-2 py-1 bg-bg rounded border border-border text-[10px]"
                title={desc}
              >
                <code className="font-mono text-accent2 font-semibold">{option}</code>
                <span className="text-text-muted hidden sm:inline">{desc}</span>
              </span>
            ))}
          </div>
          <div className="bg-bg rounded border border-border px-2.5 py-1.5">
            <div className="text-[9px] text-text-muted uppercase tracking-wider mb-0.5">Copy to Steam</div>
            <code className="text-xs font-mono text-accent2 select-all">
              {launchOptions.map(([opt]) => opt).join(" ")}
            </code>
          </div>
        </div>
      )}

      {/* Current launch options from scan */}
      {scanResult?.launch_options && (
        <div className="bg-bg-card border border-border rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1.5">
            <Terminal size={14} className="text-accent2" />
            <span className="text-xs font-semibold">Current Launch Options</span>
          </div>
          <code className="text-xs font-mono text-text-muted">
            {scanResult.launch_options}
          </code>
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
