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
  Info,
  ShieldAlert,
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
    title: "Disable Nagle's Algorithm",
    description: "Sets TcpNoDelay=1 and TcpAckFrequency=1 on all active network adapters. Reduces latency for small TCP packets (Steam overlay, signaling). CS2 game traffic uses UDP and is unaffected.",
    risk: "safe",
    icon: <Zap size={20} />,
    recommended: true,
    requiresReboot: false,
  },
  {
    key: "throttling",
    action: "disable_throttling",
    title: "Disable Network Throttling",
    description: "Sets NetworkThrottlingIndex=0xFFFFFFFF (disabled) and SystemResponsiveness=0. Removes the default 10 packets/ms limit Windows applies to non-multimedia traffic.",
    risk: "safe",
    icon: <Network size={20} />,
    recommended: true,
    requiresReboot: true,
  },
  {
    key: "autotuning",
    action: "disable_tcp_autotuning",
    title: "Disable TCP Auto-Tuning",
    description: "Disables the automatic TCP receive window scaling. CS2 uses UDP so this does NOT affect game traffic directly.",
    risk: "caution",
    riskNote: "WARNING: Can reduce TCP download speeds (Steam, browser, updates) by up to 50%. Only use if you have a specific ISP routing issue. Revert with: netsh interface tcp set global autotuninglevel=normal",
    icon: <Settings2 size={20} />,
    recommended: false,
    requiresReboot: false,
  },
  {
    key: "ecn",
    action: "disable_ecn",
    title: "Disable ECN",
    description: "Disables Explicit Congestion Notification. Some older routers and ISPs mishandle ECN, causing random packet drops. Safe to disable since most networks don't use it.",
    risk: "safe",
    icon: <AlertTriangle size={20} />,
    recommended: true,
    requiresReboot: false,
  },
  {
    key: "firewall",
    action: "add_cs2_firewall",
    title: "CS2 Firewall Rules",
    description: "Adds Windows Firewall allow rules for cs2.exe (UDP + TCP inbound). Only ADDS allow rules — does not block anything. Auto-detects CS2 install path.",
    risk: "safe",
    icon: <Shield size={20} />,
    recommended: true,
    requiresReboot: false,
  },
  {
    key: "mmcss",
    action: "gaming_mmcss",
    title: "MMCSS Gaming Priority",
    description: "Configures the Multimedia Class Scheduler to give Games higher CPU scheduling priority (Priority=6, GPU Priority=8, Scheduling Category=High, SFIO=High).",
    risk: "safe",
    icon: <Gamepad2 size={20} />,
    recommended: true,
    requiresReboot: true,
  },
  {
    key: "dscp",
    action: "dscp_qos",
    title: "DSCP / QoS Marking",
    description: "Creates a QoS policy marking cs2.exe UDP traffic as DSCP 46 (Expedited Forwarding). Only useful if your router respects DSCP. No effect on most consumer routers.",
    risk: "advanced",
    riskNote: "Only effective with enterprise/prosumer routers (pfSense, OpenWrt, Ubiquiti, MikroTik) that honor DSCP markings. Consumer routers typically ignore this.",
    icon: <Tag size={20} />,
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

type ApplyStatus = "idle" | "applying" | "success" | "error";

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
        setToast({ message: `${opt.title}: Applied successfully`, type: "success" });
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
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-accent">Windows Optimizer</h1>
          <p className="text-text-muted text-sm mt-1">Network and system optimization for CS2</p>
        </div>
        <div className="flex gap-3">
          <button onClick={scanSystem} disabled={scanning} className="flex items-center gap-2 px-4 py-2 bg-bg-card border border-border rounded-lg text-sm text-text-muted hover:text-text hover:border-accent/50 transition disabled:opacity-50">
            {scanning ? <Loader size={14} className="animate-spin" /> : <Cpu size={14} />}
            {scanning ? "Scanning..." : "Re-scan"}
          </button>
          <button onClick={applyAllRecommended} disabled={applyingAll || scanning} className="flex items-center gap-2 px-4 py-2 bg-accent text-white text-sm rounded-lg hover:bg-accent/80 transition disabled:opacity-50">
            {applyingAll ? <Loader size={14} className="animate-spin" /> : <Play size={14} />}
            {applyingAll ? "Applying..." : "Apply All Recommended"}
          </button>
        </div>
      </div>

      {/* Admin Warning */}
      {scanResult && !scanResult.is_admin && (
        <div className="bg-danger/10 border border-danger/30 rounded-lg p-4 mb-6 flex items-start gap-3">
          <ShieldAlert size={18} className="text-danger mt-0.5 shrink-0" />
          <div className="text-sm">
            <span className="text-danger font-semibold">Not running as Administrator.</span>
            <span className="text-text-muted"> All optimizations require admin privileges. Right-click the app and select "Run as administrator".</span>
          </div>
        </div>
      )}

      {/* Reboot Notice */}
      {needsReboot && (
        <div className="bg-warning/10 border border-warning/30 rounded-lg p-4 mb-6 flex items-center gap-3">
          <RotateCcw size={16} className="text-warning" />
          <span className="text-sm text-warning">Some changes require a <strong>system reboot</strong> to take full effect.</span>
        </div>
      )}

      {/* System Info Bar */}
      {scanResult && (
        <div className="grid grid-cols-4 gap-3 mb-6">
          <div className="bg-bg-card border border-border rounded-lg p-3 text-center">
            <div className="text-[10px] text-text-muted uppercase tracking-wider">Adapter</div>
            <div className="text-sm font-mono text-accent2 truncate">{scanResult.adapter_name ?? "N/A"}</div>
          </div>
          <div className="bg-bg-card border border-border rounded-lg p-3 text-center">
            <div className="text-[10px] text-text-muted uppercase tracking-wider">Speed</div>
            <div className="text-sm font-mono text-accent2">{scanResult.adapter_speed ?? "N/A"}</div>
          </div>
          <div className="bg-bg-card border border-border rounded-lg p-3 text-center">
            <div className="text-[10px] text-text-muted uppercase tracking-wider">CS2 Detected</div>
            <div className={`text-sm font-semibold ${scanResult.cs2_path ? "text-success" : "text-warning"}`}>
              {scanResult.cs2_path ? "Yes" : "Not found"}
            </div>
          </div>
          <div className="bg-bg-card border border-border rounded-lg p-3 text-center">
            <div className="text-[10px] text-text-muted uppercase tracking-wider">Optimized</div>
            <div className={`text-sm font-bold ${optimizedCount >= 5 ? "text-success" : optimizedCount >= 3 ? "text-warning" : "text-danger"}`}>
              {optimizedCount} / {OPTIMIZATIONS.length}
            </div>
          </div>
        </div>
      )}

      {/* Info banner */}
      <div className="bg-bg-card border border-border rounded-lg p-4 mb-6 flex items-start gap-3">
        <Info size={16} className="text-accent2 mt-0.5 shrink-0" />
        <div className="text-xs text-text-muted leading-relaxed">
          <strong className="text-text">Safe optimizations</strong> are well-documented Microsoft settings that improve gaming latency without side effects.{" "}
          <strong className="text-warning">Caution</strong> items may affect non-gaming performance (downloads, browsing).{" "}
          <strong className="text-accent">Advanced</strong> items are only useful with specific hardware/network setups.
          All changes can be reverted.
        </div>
      </div>

      {/* Scanning skeleton */}
      {scanning && (
        <div className="grid grid-cols-1 gap-4">
          {OPTIMIZATIONS.map((opt) => (
            <div key={opt.key} className="bg-bg-card border border-border rounded-lg p-5 animate-pulse">
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

      {/* Optimization cards */}
      {!scanning && scanResult && (
        <div className="grid grid-cols-1 gap-4">
          {OPTIMIZATIONS.map((opt) => {
            const itemStatus = scanResult[opt.key];
            const applyState = applyStates[opt.key];
            const riskStyle = RISK_COLORS[opt.risk];

            return (
              <div key={opt.key} className="bg-bg-card border border-border rounded-lg p-5 hover:border-accent/20 transition">
                <div className="flex items-start gap-4">
                  {/* Icon */}
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                    itemStatus.is_optimized ? "bg-success/10" : "bg-accent/10"
                  }`}>
                    <span className={itemStatus.is_optimized ? "text-success" : "text-accent"}>
                      {opt.icon}
                    </span>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h3 className="font-semibold text-text">{opt.title}</h3>
                      {opt.recommended && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-accent/15 text-accent font-semibold uppercase">
                          Recommended
                        </span>
                      )}
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${riskStyle.bg} ${riskStyle.text} font-semibold uppercase`}>
                        {riskStyle.label}
                      </span>
                      {opt.requiresReboot && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-warning/10 text-warning font-semibold uppercase">
                          Reboot
                        </span>
                      )}
                    </div>

                    <p className="text-text-muted text-sm mb-2">{opt.description}</p>

                    {/* Risk note */}
                    {opt.riskNote && (
                      <div className={`text-xs p-2 rounded mb-2 ${riskStyle.bg} ${riskStyle.border} border`}>
                        <span className={riskStyle.text}>{opt.riskNote}</span>
                      </div>
                    )}

                    {/* Current status */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] text-text-muted uppercase tracking-wider">Status:</span>
                      {itemStatus.is_optimized ? (
                        <span className="flex items-center gap-1 text-xs text-success font-mono">
                          <CheckCircle size={12} /> {itemStatus.current_value}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs text-warning font-mono">
                          <AlertTriangle size={12} /> {itemStatus.current_value}
                        </span>
                      )}

                      {/* Apply result */}
                      {applyState?.status === "success" && (
                        <span className="flex items-center gap-1 text-xs text-success ml-2">
                          <CheckCircle size={12} /> Applied
                          {applyState.requiresReboot && " (reboot needed)"}
                        </span>
                      )}
                      {applyState?.status === "error" && (
                        <span className="flex items-center gap-1 text-xs text-danger ml-2 max-w-md truncate">
                          <XCircle size={12} className="shrink-0" /> {applyState.message}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Apply button */}
                  <button
                    onClick={() => applyOptimization(opt)}
                    disabled={applyState?.status === "applying" || itemStatus.is_optimized}
                    className={`shrink-0 px-4 py-2 text-sm rounded-lg border transition disabled:opacity-40 flex items-center gap-2 ${
                      itemStatus.is_optimized
                        ? "bg-success/10 border-success/30 text-success cursor-default"
                        : "bg-accent/10 text-accent border-accent/30 hover:bg-accent/20"
                    }`}
                  >
                    {applyState?.status === "applying" ? (
                      <><Loader size={14} className="animate-spin" /> Applying...</>
                    ) : itemStatus.is_optimized ? (
                      <><CheckCircle size={14} /> Done</>
                    ) : (
                      "Apply"
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 px-5 py-3 rounded-lg shadow-lg border flex items-center gap-2 text-sm z-50 max-w-md ${
          toast.type === "success" ? "bg-success/15 border-success/30 text-success"
            : toast.type === "warning" ? "bg-warning/15 border-warning/30 text-warning"
            : "bg-danger/15 border-danger/30 text-danger"
        }`}>
          {toast.type === "success" ? <CheckCircle size={16} /> : toast.type === "warning" ? <AlertTriangle size={16} /> : <XCircle size={16} />}
          {toast.message}
        </div>
      )}
    </div>
  );
}
