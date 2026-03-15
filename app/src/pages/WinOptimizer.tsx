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
} from "lucide-react";

interface ScanResult {
  [key: string]: string;
}

interface OptimizationItem {
  key: string;
  action: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  recommended: boolean;
}

type ApplyStatus = "idle" | "applying" | "success" | "error";

interface OptState {
  scanStatus: string;
  applyStatus: ApplyStatus;
  applyMessage: string;
}

const OPTIMIZATIONS: OptimizationItem[] = [
  {
    key: "nagle",
    action: "disable_nagle",
    title: "Disable Nagle's Algorithm",
    description:
      "Disables TCP packet batching (Nagle) to reduce latency for small game packets. Sets TcpNoDelay=1 and TcpAckFrequency=1 in the registry.",
    icon: <Zap size={20} />,
    recommended: true,
  },
  {
    key: "throttling",
    action: "disable_throttling",
    title: "Disable Network Throttling",
    description:
      "Removes the Windows NetworkThrottlingIndex limit that reduces throughput for multimedia streams. Sets NetworkThrottlingIndex to 0xFFFFFFFF.",
    icon: <Network size={20} />,
    recommended: true,
  },
  {
    key: "autotuning",
    action: "disable_tcp_autotuning",
    title: "Disable TCP Auto-Tuning",
    description:
      "Disables Windows' automatic receive window adjustment. Prevents the OS from throttling receive window size during gameplay.",
    icon: <Settings2 size={20} />,
    recommended: true,
  },
  {
    key: "ecn",
    action: "disable_ecn",
    title: "Disable ECN (Explicit Congestion Notification)",
    description:
      "Disables ECN capability which can cause packet drops with some routers and ISPs that don't properly support it.",
    icon: <AlertTriangle size={20} />,
    recommended: true,
  },
  {
    key: "firewall",
    action: "add_cs2_firewall",
    title: "CS2 Firewall Rules",
    description:
      "Adds Windows Firewall rules to allow CS2 (cs2.exe) inbound/outbound traffic on UDP ports used by Valve for game traffic.",
    icon: <Shield size={20} />,
    recommended: true,
  },
  {
    key: "mmcss",
    action: "gaming_mmcss",
    title: "MMCSS Gaming Priority",
    description:
      "Configures the Multimedia Class Scheduler Service (MMCSS) to give gaming threads higher CPU priority and reduce scheduling latency.",
    icon: <Gamepad2 size={20} />,
    recommended: true,
  },
  {
    key: "dscp",
    action: "dscp_qos",
    title: "DSCP / QoS Marking",
    description:
      "Marks CS2 network traffic with DSCP Expedited Forwarding (EF) class so compatible routers prioritize game packets over other traffic.",
    icon: <Tag size={20} />,
    recommended: false,
  },
];

function getStatusIndicator(status: string): {
  color: string;
  label: string;
} {
  const lower = status.toLowerCase();
  if (
    lower.includes("disabled") ||
    lower.includes("applied") ||
    lower.includes("enabled") ||
    lower.includes("active") ||
    lower.includes("optimized") ||
    lower === "ok"
  ) {
    return { color: "text-success", label: status };
  }
  if (
    lower.includes("not") ||
    lower.includes("missing") ||
    lower.includes("default") ||
    lower.includes("unknown")
  ) {
    return { color: "text-warning", label: status };
  }
  if (lower.includes("error") || lower.includes("fail")) {
    return { color: "text-danger", label: status };
  }
  return { color: "text-text-muted", label: status };
}

export default function WinOptimizer() {
  const [scanning, setScanning] = useState(false);
  const [optStates, setOptStates] = useState<Record<string, OptState>>({});
  const [applyingAll, setApplyingAll] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  useEffect(() => {
    scanSystem();
  }, []);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  async function scanSystem() {
    try {
      setScanning(true);
      const result = await invoke<ScanResult>("scan_system");

      // Initialize opt states from scan results
      const states: Record<string, OptState> = {};
      for (const opt of OPTIMIZATIONS) {
        states[opt.key] = {
          scanStatus: result[opt.key] || "Unknown",
          applyStatus: "idle",
          applyMessage: "",
        };
      }
      setOptStates(states);
    } catch (e) {
      setToast({
        message: `Scan failed: ${String(e)}`,
        type: "error",
      });
      // Initialize with unknown states
      const states: Record<string, OptState> = {};
      for (const opt of OPTIMIZATIONS) {
        states[opt.key] = {
          scanStatus: "Not scanned (backend command not available)",
          applyStatus: "idle",
          applyMessage: "",
        };
      }
      setOptStates(states);
    } finally {
      setScanning(false);
    }
  }

  async function applyOptimization(opt: OptimizationItem) {
    setOptStates((prev) => ({
      ...prev,
      [opt.key]: { ...prev[opt.key], applyStatus: "applying", applyMessage: "" },
    }));

    try {
      const result = await invoke<string>("apply_optimization", {
        action: opt.action,
      });
      setOptStates((prev) => ({
        ...prev,
        [opt.key]: {
          ...prev[opt.key],
          applyStatus: "success",
          applyMessage: result || "Applied successfully",
          scanStatus: "Applied",
        },
      }));
      setToast({ message: `${opt.title}: Applied`, type: "success" });
    } catch (e) {
      const errMsg = String(e);
      setOptStates((prev) => ({
        ...prev,
        [opt.key]: {
          ...prev[opt.key],
          applyStatus: "error",
          applyMessage: errMsg,
        },
      }));
      setToast({ message: `${opt.title}: ${errMsg}`, type: "error" });
    }
  }

  async function applyAllRecommended() {
    setApplyingAll(true);
    const recommended = OPTIMIZATIONS.filter((o) => o.recommended);
    for (const opt of recommended) {
      await applyOptimization(opt);
    }
    setApplyingAll(false);
    setToast({
      message: `Applied ${recommended.length} recommended optimizations`,
      type: "success",
    });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-accent">
            Windows Optimizer
          </h1>
          <p className="text-text-muted text-sm mt-1">
            Network adapter and system optimization for CS2
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={scanSystem}
            disabled={scanning}
            className="flex items-center gap-2 px-4 py-2 bg-bg-card border border-border rounded-lg text-sm text-text-muted hover:text-text hover:border-accent/50 transition disabled:opacity-50"
          >
            {scanning ? (
              <Loader size={14} className="animate-spin" />
            ) : (
              <Cpu size={14} />
            )}
            {scanning ? "Scanning..." : "Re-scan"}
          </button>
          <button
            onClick={applyAllRecommended}
            disabled={applyingAll || scanning}
            className="flex items-center gap-2 px-4 py-2 bg-accent text-white text-sm rounded-lg hover:bg-accent/80 transition disabled:opacity-50"
          >
            {applyingAll ? (
              <Loader size={14} className="animate-spin" />
            ) : (
              <Play size={14} />
            )}
            {applyingAll ? "Applying..." : "Apply All Recommended"}
          </button>
        </div>
      </div>

      {/* Info banner */}
      <div className="bg-accent/8 border border-accent/30 rounded-lg p-4 mb-6 flex items-start gap-3">
        <AlertTriangle size={16} className="text-accent mt-0.5 shrink-0" />
        <div className="text-sm text-text-muted">
          <span className="text-text font-semibold">Windows only.</span> These
          optimizations modify Windows registry settings and firewall rules.
          They require administrator privileges. Some changes require a reboot
          to take effect.
        </div>
      </div>

      {/* Scanning skeleton */}
      {scanning && (
        <div className="grid grid-cols-1 gap-4">
          {OPTIMIZATIONS.map((opt) => (
            <div
              key={opt.key}
              className="bg-bg-card border border-border rounded-lg p-5 animate-pulse"
            >
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg bg-border/40" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-border/40 rounded w-48" />
                  <div className="h-3 bg-border/40 rounded w-full" />
                  <div className="h-3 bg-border/40 rounded w-3/4" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Optimization cards */}
      {!scanning && (
        <div className="grid grid-cols-1 gap-4">
          {OPTIMIZATIONS.map((opt) => {
            const state = optStates[opt.key];
            const statusInfo = state
              ? getStatusIndicator(state.scanStatus)
              : { color: "text-text-muted", label: "Unknown" };

            return (
              <div
                key={opt.key}
                className="bg-bg-card border border-border rounded-lg p-5 hover:border-accent/20 transition"
              >
                <div className="flex items-start gap-4">
                  {/* Icon */}
                  <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
                    <span className="text-accent">{opt.icon}</span>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-text">{opt.title}</h3>
                      {opt.recommended && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-accent/15 text-accent font-semibold uppercase">
                          Recommended
                        </span>
                      )}
                    </div>
                    <p className="text-text-muted text-sm mb-3">
                      {opt.description}
                    </p>

                    {/* Status */}
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-text-muted uppercase tracking-wider">
                          Status:
                        </span>
                        <span
                          className={`text-xs font-mono font-semibold ${statusInfo.color}`}
                        >
                          {statusInfo.label}
                        </span>
                      </div>

                      {state?.applyStatus === "success" && (
                        <div className="flex items-center gap-1 text-success text-xs">
                          <CheckCircle size={12} />
                          <span>{state.applyMessage}</span>
                        </div>
                      )}
                      {state?.applyStatus === "error" && (
                        <div className="flex items-center gap-1 text-danger text-xs max-w-md truncate">
                          <XCircle size={12} className="shrink-0" />
                          <span className="truncate">
                            {state.applyMessage}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Apply button */}
                  <button
                    onClick={() => applyOptimization(opt)}
                    disabled={state?.applyStatus === "applying"}
                    className="shrink-0 px-4 py-2 bg-accent/10 text-accent text-sm rounded-lg border border-accent/30 hover:bg-accent/20 transition disabled:opacity-50 flex items-center gap-2"
                  >
                    {state?.applyStatus === "applying" ? (
                      <>
                        <Loader size={14} className="animate-spin" />
                        Applying...
                      </>
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
        <div
          className={`fixed bottom-6 right-6 px-5 py-3 rounded-lg shadow-lg border flex items-center gap-2 text-sm z-50 animate-in fade-in slide-in-from-bottom-2 ${
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
