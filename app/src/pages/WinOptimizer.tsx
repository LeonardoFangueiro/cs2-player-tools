import { useEffect, useState } from "react";
import { invoke } from "../lib/tauri";
import {
  Settings2,
  Shield,
  Zap,
  Network,
  Gamepad2,
  Tag,
  CheckCircle,
  XCircle,
  Loader,
  AlertTriangle,
  Cpu,
  Play,
  RotateCcw,
  ShieldAlert,
  Undo2,
  RefreshCw,
} from "lucide-react";

// ── Types matching Rust backend exactly ──

interface OptItemStatus {
  current_value: string;
  is_optimized: boolean;
}

interface SystemOptStatus {
  is_admin: boolean;
  nagle: OptItemStatus;
  throttling: OptItemStatus;
  autotuning: OptItemStatus;
  ecn: OptItemStatus;
  firewall: OptItemStatus;
  mmcss: OptItemStatus;
  dscp: OptItemStatus;
  adapter_name: string | null;
  adapter_speed: string | null;
  cs2_path: string | null;
}

interface OptimizationResult {
  action: string;
  success: boolean;
  message: string;
  previous_value: string | null;
  requires_reboot: boolean;
}

// ── Optimization definitions ──

type RiskLevel = "safe" | "caution" | "advanced";

interface OptimizationItem {
  key: keyof Pick<SystemOptStatus, "nagle" | "throttling" | "autotuning" | "ecn" | "firewall" | "mmcss" | "dscp">;
  action: string;
  revertAction: string;
  title: string;
  description: string;
  risk: RiskLevel;
  riskNote?: string;
  icon: React.ReactNode;
  recommended: boolean;
  requiresReboot: boolean;
}

const OPTIMIZATIONS: OptimizationItem[] = [
  {
    key: "nagle",
    action: "disable_nagle",
    revertAction: "revert_nagle",
    title: "Disable Nagle's Algorithm",
    description: "Sets TcpNoDelay=1 and TcpAckFrequency=1. Reduces latency for small TCP packets.",
    risk: "safe",
    icon: <Zap size={16} />,
    recommended: true,
    requiresReboot: false,
  },
  {
    key: "throttling",
    action: "disable_throttling",
    revertAction: "revert_throttling",
    title: "Disable Network Throttling",
    description: "Removes the default 10 packets/ms limit Windows applies to non-multimedia traffic.",
    risk: "safe",
    icon: <Network size={16} />,
    recommended: true,
    requiresReboot: true,
  },
  {
    key: "autotuning",
    action: "disable_tcp_autotuning",
    revertAction: "revert_autotuning",
    title: "Disable TCP Auto-Tuning",
    description: "Disables automatic TCP receive window scaling. CS2 uses UDP so game traffic is unaffected.",
    risk: "caution",
    riskNote: "Can reduce TCP download speeds by up to 50%.",
    icon: <Settings2 size={16} />,
    recommended: false,
    requiresReboot: false,
  },
  {
    key: "ecn",
    action: "disable_ecn",
    revertAction: "revert_ecn",
    title: "Disable ECN",
    description: "Some older routers mishandle ECN, causing random packet drops. Safe to disable.",
    risk: "safe",
    icon: <AlertTriangle size={16} />,
    recommended: true,
    requiresReboot: false,
  },
  {
    key: "firewall",
    action: "add_cs2_firewall",
    revertAction: "revert_firewall",
    title: "CS2 Firewall Rules",
    description: "Adds Windows Firewall allow rules for cs2.exe (UDP + TCP inbound).",
    risk: "safe",
    icon: <Shield size={16} />,
    recommended: true,
    requiresReboot: false,
  },
  {
    key: "mmcss",
    action: "gaming_mmcss",
    revertAction: "revert_mmcss",
    title: "MMCSS Gaming Priority",
    description: "Gives Games higher CPU scheduling priority via Multimedia Class Scheduler.",
    risk: "safe",
    icon: <Gamepad2 size={16} />,
    recommended: true,
    requiresReboot: true,
  },
  {
    key: "dscp",
    action: "dscp_qos",
    revertAction: "revert_dscp",
    title: "DSCP / QoS Marking",
    description: "Marks cs2.exe UDP traffic as DSCP 46. Only useful with enterprise routers.",
    risk: "advanced",
    riskNote: "Only effective with pfSense, OpenWrt, Ubiquiti, MikroTik.",
    icon: <Tag size={16} />,
    recommended: false,
    requiresReboot: false,
  },
];

const RISK_COLORS: Record<RiskLevel, { bg: string; border: string; text: string; label: string }> = {
  safe: { bg: "bg-success/10", border: "border-success/30", text: "text-success", label: "Safe" },
  caution: { bg: "bg-warning/10", border: "border-warning/30", text: "text-warning", label: "Caution" },
  advanced: { bg: "bg-accent/10", border: "border-accent/30", text: "text-accent", label: "Advanced" },
};

// ── Component ──

type ApplyStatus = "idle" | "applying" | "reverting" | "success" | "error";

interface ApplyState {
  status: ApplyStatus;
  message: string;
  requiresReboot: boolean;
}

export default function WinOptimizer() {
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<SystemOptStatus | null>(null);
  const [applyStates, setApplyStates] = useState<Record<string, ApplyState>>({});
  const [applyingAll, setApplyingAll] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "warning" } | null>(null);
  const [needsReboot, setNeedsReboot] = useState(false);

  useEffect(() => {
    scanSystem();
  }, []);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  async function scanSystem() {
    try {
      setScanning(true);
      const result = await invoke<SystemOptStatus>("scan_system");
      setScanResult(result);
    } catch (e) {
      setToast({ message: `Scan failed: ${String(e)}`, type: "error" });
    } finally {
      setScanning(false);
    }
  }

  async function applyOptimization(opt: OptimizationItem) {
    setApplyStates((prev) => ({
      ...prev,
      [opt.key]: { status: "applying", message: "", requiresReboot: false },
    }));

    try {
      const result = await invoke<OptimizationResult>("apply_optimization", { action: opt.action });

      if (result.success) {
        setApplyStates((prev) => ({
          ...prev,
          [opt.key]: { status: "success", message: result.message, requiresReboot: result.requires_reboot },
        }));
        if (result.requires_reboot) setNeedsReboot(true);
        setToast({ message: `${opt.title}: Applied`, type: "success" });
        await scanSystem();
      } else {
        setApplyStates((prev) => ({
          ...prev,
          [opt.key]: { status: "error", message: result.message, requiresReboot: false },
        }));
        setToast({ message: `${opt.title}: ${result.message}`, type: "error" });
      }
    } catch (e) {
      setApplyStates((prev) => ({
        ...prev,
        [opt.key]: { status: "error", message: String(e), requiresReboot: false },
      }));
      setToast({ message: `${opt.title}: ${String(e)}`, type: "error" });
    }
  }

  async function revertOptimization(opt: OptimizationItem) {
    setApplyStates((prev) => ({
      ...prev,
      [opt.key]: { status: "reverting", message: "", requiresReboot: false },
    }));

    try {
      const result = await invoke<OptimizationResult>("apply_optimization", { action: opt.revertAction });

      if (result.success) {
        setApplyStates((prev) => ({
          ...prev,
          [opt.key]: { status: "idle", message: "", requiresReboot: false },
        }));
        setToast({ message: `${opt.title}: Reverted`, type: "success" });
        await scanSystem();
      } else {
        setApplyStates((prev) => ({
          ...prev,
          [opt.key]: { status: "error", message: result.message, requiresReboot: false },
        }));
        setToast({ message: `${opt.title}: ${result.message}`, type: "error" });
      }
    } catch (e) {
      setApplyStates((prev) => ({
        ...prev,
        [opt.key]: { status: "error", message: String(e), requiresReboot: false },
      }));
      setToast({ message: `${opt.title}: ${String(e)}`, type: "error" });
    }
  }

  async function applyAllRecommended() {
    setApplyingAll(true);
    const recommended = OPTIMIZATIONS.filter((o) => o.recommended);
    for (const opt of recommended) {
      await applyOptimization(opt);
    }
    setApplyingAll(false);
    await scanSystem();
  }

  const optimizedCount = scanResult
    ? OPTIMIZATIONS.filter((o) => scanResult[o.key]?.is_optimized).length
    : 0;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-accent">Windows Optimizer</h1>
          <p className="text-text-muted text-sm mt-1">
            {optimizedCount}/{OPTIMIZATIONS.length} optimized
            {scanResult && !scanResult.is_admin && (
              <span className="ml-2 text-danger">
                <ShieldAlert size={11} className="inline -mt-0.5 mr-0.5" />
                Not admin
              </span>
            )}
            {scanResult?.adapter_name && (
              <span className="ml-2">{scanResult.adapter_name}</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={applyAllRecommended} disabled={applyingAll || scanning}
            className="flex items-center gap-1 px-3 py-1.5 bg-accent text-white text-xs rounded-lg hover:bg-accent/80 transition disabled:opacity-50">
            {applyingAll ? <Loader size={12} className="animate-spin" /> : <Play size={12} />}
            {applyingAll ? "Applying..." : "Apply All"}
          </button>
          <button onClick={scanSystem} disabled={scanning}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-bg-card border border-border rounded-lg text-xs text-text-muted hover:text-text hover:border-accent/30 transition disabled:opacity-50">
            <RefreshCw size={12} className={scanning ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* Reboot Notice */}
      {needsReboot && (
        <div className="bg-warning/10 border border-warning/30 rounded-lg p-2.5 mb-4 flex items-center gap-2">
          <RotateCcw size={12} className="text-warning" />
          <span className="text-xs text-warning">Some changes require a <strong>reboot</strong> to take effect.</span>
        </div>
      )}

      {/* Scanning skeleton */}
      {scanning && (
        <div className="space-y-2">
          {OPTIMIZATIONS.map((opt) => (
            <div key={opt.key} className="h-14 bg-border/20 rounded-lg animate-pulse" />
          ))}
        </div>
      )}

      {/* Optimization rows */}
      {!scanning && scanResult && (
        <div className="space-y-2">
          {OPTIMIZATIONS.map((opt) => {
            const itemStatus = scanResult[opt.key];
            const applyState = applyStates[opt.key];
            const riskStyle = RISK_COLORS[opt.risk];

            return (
              <div key={opt.key} className="bg-bg-card border border-border rounded-lg p-3 hover:border-accent/20 transition">
                <div className="flex items-center gap-2.5">
                  {/* Icon inline */}
                  <span className={`shrink-0 ${itemStatus.is_optimized ? "text-success" : "text-accent"}`}>
                    {opt.icon}
                  </span>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-semibold text-text">{opt.title}</span>
                      {opt.recommended && (
                        <span className="text-[9px] px-1 py-px rounded-full bg-accent/15 text-accent font-semibold uppercase">rec</span>
                      )}
                      <span className={`text-[9px] px-1 py-px rounded-full ${riskStyle.bg} ${riskStyle.text} font-semibold uppercase`}>
                        {riskStyle.label}
                      </span>
                      {opt.requiresReboot && (
                        <span className="text-[9px] px-1 py-px rounded-full bg-warning/10 text-warning font-semibold uppercase">reboot</span>
                      )}
                    </div>
                    <p className="text-text-muted text-[10px] leading-tight mt-0.5 truncate">{opt.description}</p>
                    {opt.riskNote && (
                      <p className={`text-[9px] mt-0.5 ${riskStyle.text}`}>{opt.riskNote}</p>
                    )}
                  </div>

                  {/* Status */}
                  <div className="shrink-0 text-right">
                    {itemStatus.is_optimized ? (
                      <span className="flex items-center gap-1 text-[10px] text-success font-mono">
                        <CheckCircle size={10} /> {itemStatus.current_value}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[10px] text-warning font-mono">
                        <AlertTriangle size={10} /> {itemStatus.current_value}
                      </span>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="shrink-0 flex items-center gap-1">
                    {itemStatus.is_optimized ? (
                      <>
                        <span className="px-2 py-0.5 text-[10px] bg-success/10 border border-success/30 text-success rounded cursor-default flex items-center gap-1">
                          <CheckCircle size={10} /> Applied
                        </span>
                        <button
                          onClick={() => revertOptimization(opt)}
                          disabled={applyState?.status === "reverting"}
                          className="px-2 py-0.5 text-[10px] text-text-muted hover:text-danger border border-transparent hover:border-danger/30 rounded transition disabled:opacity-50 flex items-center gap-0.5"
                        >
                          {applyState?.status === "reverting" ? (
                            <Loader size={10} className="animate-spin" />
                          ) : (
                            <Undo2 size={10} />
                          )}
                          Revert
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => applyOptimization(opt)}
                        disabled={applyState?.status === "applying"}
                        className="px-2.5 py-1 text-[10px] bg-accent/10 text-accent border border-accent/30 hover:bg-accent/20 rounded transition disabled:opacity-50 flex items-center gap-1"
                      >
                        {applyState?.status === "applying" ? (
                          <><Loader size={10} className="animate-spin" /> ...</>
                        ) : (
                          "Apply"
                        )}
                      </button>
                    )}
                  </div>
                </div>

                {/* Error message */}
                {applyState?.status === "error" && (
                  <div className="mt-1.5 flex items-center gap-1 text-[10px] text-danger ml-6">
                    <XCircle size={10} className="shrink-0" /> {applyState.message}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* System info bar */}
      {scanResult && (
        <div className="flex items-center gap-3 mt-4 text-[10px] text-text-muted">
          <Cpu size={10} />
          <span>Adapter: <span className="font-mono text-accent2">{scanResult.adapter_name ?? "N/A"}</span></span>
          <span className="text-border">|</span>
          <span>Speed: <span className="font-mono text-accent2">{scanResult.adapter_speed ?? "N/A"}</span></span>
          <span className="text-border">|</span>
          <span>CS2: <span className={`font-semibold ${scanResult.cs2_path ? "text-success" : "text-warning"}`}>{scanResult.cs2_path ? "Detected" : "Not found"}</span></span>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 px-4 py-2.5 rounded-lg shadow-lg border flex items-center gap-2 text-xs z-50 max-w-md ${
          toast.type === "success" ? "bg-success/15 border-success/30 text-success"
            : toast.type === "warning" ? "bg-warning/15 border-warning/30 text-warning"
            : "bg-danger/15 border-danger/30 text-danger"
        }`}>
          {toast.type === "success" ? <CheckCircle size={12} /> : toast.type === "warning" ? <AlertTriangle size={12} /> : <XCircle size={12} />}
          {toast.message}
        </div>
      )}
    </div>
  );
}
