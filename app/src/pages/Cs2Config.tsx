import { useState } from "react";
import { invoke } from "../lib/tauri";
import {
  FileCode,
  Scan,
  CheckCircle,
  XCircle,
  Loader,
  Play,
  Terminal,
  Info,
  AlertTriangle,
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

  function showToast(message: string, type: "success" | "error") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }

  async function scanConfig() {
    try {
      setScanning(true);
      const result = await invoke<ScanResult>("scan_cs2_config");
      setScanResult(result);

      const opts = await invoke<Array<[string, string]>>("get_launch_options");
      setLaunchOptions(opts);
    } catch (e) {
      showToast(`Scan failed: ${String(e)}`, "error");
    } finally {
      setScanning(false);
    }
  }

  async function applyAll() {
    if (!scanResult) return;
    setApplyingAll(true);
    try {
      const settings: Record<string, string> = {};
      for (const s of scanResult.current_settings) {
        settings[s.key] = s.recommended_value;
      }
      const result = await invoke<ApplyResult>("apply_cs2_config", { settings });
      if (result.success) {
        showToast("All recommended settings applied", "success");
        await scanConfig();
      } else {
        showToast(result.message, "error");
      }
    } catch (e) {
      showToast(`Apply failed: ${String(e)}`, "error");
    } finally {
      setApplyingAll(false);
    }
  }

  async function applySingle(setting: ConfigSetting) {
    setApplyingKey(setting.key);
    try {
      const settings: Record<string, string> = {
        [setting.key]: setting.recommended_value,
      };
      const result = await invoke<ApplyResult>("apply_cs2_config", { settings });
      if (result.success) {
        showToast(`${setting.key} applied`, "success");
        await scanConfig();
      } else {
        showToast(result.message, "error");
      }
    } catch (e) {
      showToast(`Apply failed: ${String(e)}`, "error");
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
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-accent">CS2 Config Helper</h1>
          <p className="text-text-muted text-sm mt-1">
            Optimize autoexec.cfg and launch options for CS2
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={scanConfig}
            disabled={scanning}
            className="flex items-center gap-2 px-4 py-2 bg-bg-card border border-border rounded-lg text-sm text-text-muted hover:text-text hover:border-accent/50 transition disabled:opacity-50"
          >
            {scanning ? (
              <Loader size={14} className="animate-spin" />
            ) : (
              <Scan size={14} />
            )}
            {scanning ? "Scanning..." : "Scan Config"}
          </button>
          {scanResult && scanResult.current_settings.length > 0 && (
            <button
              onClick={applyAll}
              disabled={applyingAll || scanning}
              className="flex items-center gap-2 px-4 py-2 bg-accent text-white text-sm rounded-lg hover:bg-accent/80 transition disabled:opacity-50"
            >
              {applyingAll ? (
                <Loader size={14} className="animate-spin" />
              ) : (
                <Play size={14} />
              )}
              {applyingAll ? "Applying..." : "Apply Recommended"}
            </button>
          )}
        </div>
      </div>

      {/* Info banner */}
      <div className="bg-bg-card border border-border rounded-lg p-4 mb-6 flex items-start gap-3">
        <Info size={16} className="text-accent2 mt-0.5 shrink-0" />
        <div className="text-xs text-text-muted leading-relaxed">
          <strong className="text-text">CS2 Config Helper</strong> scans your
          autoexec.cfg for common performance settings and recommends optimal
          values. Click "Scan Config" to get started.
        </div>
      </div>

      {/* CS2 Path Status */}
      {scanResult && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-bg-card border border-border rounded-lg p-4 text-center">
            <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">
              Autoexec Path
            </div>
            <div className="text-sm font-mono text-accent2 truncate">
              {scanResult.autoexec_path ?? "Not detected"}
            </div>
          </div>
          <div className="bg-bg-card border border-border rounded-lg p-4 text-center">
            <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">
              File Exists
            </div>
            <div className={`text-sm font-semibold ${scanResult.autoexec_exists ? "text-success" : "text-warning"}`}>
              {scanResult.autoexec_exists ? "Yes" : "No"}
            </div>
          </div>
          <div className="bg-bg-card border border-border rounded-lg p-4 text-center">
            <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">
              Optimized
            </div>
            <div className={`text-sm font-bold ${optimizedCount >= totalCount && totalCount > 0 ? "text-success" : optimizedCount > 0 ? "text-warning" : "text-danger"}`}>
              {totalCount > 0 ? `${optimizedCount} / ${totalCount}` : "--"}
            </div>
          </div>
        </div>
      )}

      {/* No scan yet */}
      {!scanResult && !scanning && (
        <div className="bg-bg-card border border-border rounded-lg p-12 text-center">
          <FileCode size={48} className="mx-auto mb-4 text-text-muted" />
          <p className="text-text-muted text-sm">
            Click "Scan Config" to detect your current CS2 configuration settings.
          </p>
        </div>
      )}

      {/* Scanning skeleton */}
      {scanning && (
        <div className="grid grid-cols-1 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-bg-card border border-border rounded-lg p-5 animate-pulse">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg bg-border/40" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-border/40 rounded w-48" />
                  <div className="h-3 bg-border/40 rounded w-full" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Config Settings Cards */}
      {!scanning && scanResult && scanResult.current_settings.length > 0 && (
        <div className="grid grid-cols-1 gap-4 mb-6">
          {scanResult.current_settings.map((setting) => (
            <div
              key={setting.key}
              className="bg-bg-card border border-border rounded-lg p-5 hover:border-accent/20 transition"
            >
              <div className="flex items-start gap-4">
                {/* Icon */}
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                  setting.is_optimized ? "bg-success/10" : "bg-accent/10"
                }`}>
                  <span className={setting.is_optimized ? "text-success" : "text-accent"}>
                    {setting.is_optimized ? <CheckCircle size={20} /> : <AlertTriangle size={20} />}
                  </span>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-text font-mono">{setting.key}</h3>
                    {setting.is_optimized && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-success/15 text-success font-semibold uppercase">
                        Optimized
                      </span>
                    )}
                  </div>
                  <p className="text-text-muted text-sm mb-2">{setting.description}</p>
                  <div className="flex items-center gap-4 text-xs">
                    <span className="text-text-muted">
                      Current:{" "}
                      <span className={`font-mono font-semibold ${setting.is_optimized ? "text-success" : "text-warning"}`}>
                        {setting.current_value ?? "not set"}
                      </span>
                    </span>
                    <span className="text-text-muted">
                      Recommended:{" "}
                      <span className="font-mono font-semibold text-accent2">
                        {setting.recommended_value}
                      </span>
                    </span>
                  </div>
                </div>

                {/* Apply button */}
                <button
                  onClick={() => applySingle(setting)}
                  disabled={applyingKey === setting.key || setting.is_optimized}
                  className={`shrink-0 px-4 py-2 text-sm rounded-lg border transition disabled:opacity-40 flex items-center gap-2 ${
                    setting.is_optimized
                      ? "bg-success/10 border-success/30 text-success cursor-default"
                      : "bg-accent/10 text-accent border-accent/30 hover:bg-accent/20"
                  }`}
                >
                  {applyingKey === setting.key ? (
                    <>
                      <Loader size={14} className="animate-spin" /> Applying...
                    </>
                  ) : setting.is_optimized ? (
                    <>
                      <CheckCircle size={14} /> Done
                    </>
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
        <div className="bg-bg-card border border-border rounded-lg p-8 text-center mb-6">
          <FileCode size={32} className="mx-auto mb-3 text-text-muted" />
          <p className="text-text-muted text-sm">
            No configurable settings detected. Make sure CS2 is installed and the autoexec.cfg path is accessible.
          </p>
        </div>
      )}

      {/* Launch Options */}
      {launchOptions.length > 0 && (
        <div className="bg-bg-card border border-border rounded-lg p-5">
          <h2 className="text-base font-semibold mb-4 flex items-center gap-2">
            <Terminal size={16} className="text-accent2" />
            Recommended Launch Options
          </h2>
          <div className="space-y-2 mb-4">
            {launchOptions.map(([option, desc]) => (
              <div
                key={option}
                className="flex items-center gap-3 px-3 py-2 bg-bg rounded-md border border-border"
              >
                <code className="text-sm font-mono text-accent2 font-semibold">
                  {option}
                </code>
                <span className="text-xs text-text-muted">{desc}</span>
              </div>
            ))}
          </div>
          <div className="bg-bg rounded-lg border border-border p-3">
            <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">
              Copy to Steam Launch Options
            </div>
            <code className="text-sm font-mono text-accent2 select-all">
              {launchOptions.map(([opt]) => opt).join(" ")}
            </code>
          </div>
        </div>
      )}

      {/* Current launch options from scan */}
      {scanResult?.launch_options && (
        <div className="bg-bg-card border border-border rounded-lg p-5 mt-4">
          <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
            <Terminal size={16} className="text-accent2" />
            Current Launch Options
          </h2>
          <code className="text-sm font-mono text-text-muted">
            {scanResult.launch_options}
          </code>
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
