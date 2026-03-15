import { useEffect, useState } from "react";
import { invoke } from "../lib/tauri";
import {
  Shield,
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
  Server,
  ArrowRight,
  Zap,
  Info,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Terminal,
  Upload,
  Link,
  Lock,
  User,
  Hash,
} from "lucide-react";

// ── Types ──

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
  active: boolean;
  profile_name: string | null;
  endpoint: string | null;
  transfer_rx: string | null;
  transfer_tx: string | null;
  latest_handshake: string | null;
  error: string | null;
}

interface VpsConnectionTestResult {
  success: boolean;
  message: string;
}

interface VpsDeployResult {
  success: boolean;
  message: string;
  server_public_key: string;
  client_private_key: string;
  client_public_key: string;
  endpoint: string;
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

// ── VPN Server Recommendations ──

interface ServerRecommendation {
  valveDc: string;
  valveLocation: string;
  vpnProvider: string;
  vpnLocation: string;
  price: string;
  estPing: string;
  setupUrl: string;
}

const SERVER_RECOMMENDATIONS: ServerRecommendation[] = [
  { valveDc: "fra", valveLocation: "Frankfurt (EU West)", vpnProvider: "Hetzner", vpnLocation: "Falkenstein/Frankfurt, DE", price: "\u20AC3.79/m\u00EAs", estPing: "25-35ms", setupUrl: "https://www.hetzner.com/cloud" },
  { valveDc: "mad", valveLocation: "Madrid (EU Spain)", vpnProvider: "Vultr", vpnLocation: "Madrid, ES", price: "$6/m\u00EAs", estPing: "5-15ms", setupUrl: "https://www.vultr.com/" },
  { valveDc: "lhr", valveLocation: "London (EU West)", vpnProvider: "Vultr", vpnLocation: "London, UK", price: "$6/m\u00EAs", estPing: "35-45ms", setupUrl: "https://www.vultr.com/" },
  { valveDc: "ams", valveLocation: "Amsterdam (EU)", vpnProvider: "Hetzner", vpnLocation: "Helsinki, FI", price: "\u20AC3.79/m\u00EAs", estPing: "30-40ms", setupUrl: "https://www.hetzner.com/cloud" },
  { valveDc: "vie", valveLocation: "Vienna (EU East)", vpnProvider: "Vultr", vpnLocation: "Vienna, AT", price: "$6/m\u00EAs", estPing: "40-50ms", setupUrl: "https://www.vultr.com/" },
  { valveDc: "waw", valveLocation: "Warsaw (EU)", vpnProvider: "OVH", vpnLocation: "Warsaw, PL", price: "\u20AC3.50/m\u00EAs", estPing: "45-55ms", setupUrl: "https://www.ovhcloud.com/en/vps/" },
  { valveDc: "sto", valveLocation: "Stockholm (EU North)", vpnProvider: "Hetzner", vpnLocation: "Helsinki, FI", price: "\u20AC3.79/m\u00EAs", estPing: "50-70ms", setupUrl: "https://www.hetzner.com/cloud" },
];

// ── Wizard Step type ──

type WizardStep = 1 | 2 | 3;

// ── Component ──

export default function SmartVPN() {
  // Wizard state
  const [wizardStep, setWizardStep] = useState<WizardStep>(1);
  const [wizardCompleted, setWizardCompleted] = useState<Set<WizardStep>>(new Set());

  // Step 1: VPS Connection
  const [vpsIp, setVpsIp] = useState("");
  const [sshPort, setSshPort] = useState("22");
  const [sshUsername, setSshUsername] = useState("root");
  const [authMethod, setAuthMethod] = useState<"password" | "key">("password");
  const [sshPassword, setSshPassword] = useState("");
  const [sshKey, setSshKey] = useState("");
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<{ success: boolean; message: string } | null>(null);

  // Step 2: Deploy
  const [clientAddress, setClientAddress] = useState("10.66.66.2/32");
  const [deploying, setDeploying] = useState(false);
  const [deployLogs, setDeployLogs] = useState<string[]>([]);
  const [deployResult, setDeployResult] = useState<VpsDeployResult | null>(null);

  // Step 3: Connect
  const [form, setForm] = useState<VpnProfile>({ ...DEFAULT_PROFILE });
  const [loadingValveIps, setLoadingValveIps] = useState(false);
  const [saving, setSaving] = useState(false);

  // Shared state
  const [profiles, setProfiles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [vpnStatus, setVpnStatus] = useState<VpnStatus | null>(null);
  const [activeProfile, setActiveProfile] = useState<string | null>(null);
  const [connectingProfile, setConnectingProfile] = useState<string | null>(null);
  const [previewConfig, setPreviewConfig] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [showHowItWorks, setShowHowItWorks] = useState(false);
  const [showRecommendations, setShowRecommendations] = useState(false);

  useEffect(() => {
    loadProfiles();
  }, []);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // ── Step 1: Test VPS Connection ──

  async function testConnection() {
    if (!vpsIp.trim()) {
      setToast({ message: "Enter the VPS IP address", type: "error" });
      return;
    }
    try {
      setTestingConnection(true);
      setConnectionStatus(null);
      const result = await invoke<VpsConnectionTestResult>("vps_test_connection", {
        host: vpsIp.trim(),
        port: parseInt(sshPort) || 22,
        username: sshUsername.trim() || "root",
        authMethod,
        password: authMethod === "password" ? sshPassword : undefined,
        privateKey: authMethod === "key" ? sshKey : undefined,
      });
      setConnectionStatus(result);
      if (result.success) {
        setWizardCompleted((prev) => new Set(prev).add(1));
        // Auto-progress to step 2
        setTimeout(() => setWizardStep(2), 600);
      }
    } catch (e) {
      setConnectionStatus({ success: false, message: String(e) });
    } finally {
      setTestingConnection(false);
    }
  }

  // ── Step 2: Deploy WireGuard ──

  async function deployWireGuard() {
    try {
      setDeploying(true);
      setDeployLogs([]);
      setDeployResult(null);

      // Simulate log messages for progress feedback
      const logSteps = [
        "Connecting to VPS via SSH...",
        "Updating package lists...",
        "Installing WireGuard...",
        "Generating server keypair...",
        "Generating client keypair...",
        "Configuring WireGuard interface (wg0)...",
        "Enabling IP forwarding...",
        "Setting up NAT/masquerade rules...",
        "Starting WireGuard service...",
      ];

      // Show logs progressively
      for (const log of logSteps) {
        setDeployLogs((prev) => [...prev, log]);
        await new Promise((r) => setTimeout(r, 200));
      }

      const result = await invoke<VpsDeployResult>("vps_deploy_wireguard", {
        host: vpsIp.trim(),
        port: parseInt(sshPort) || 22,
        username: sshUsername.trim() || "root",
        authMethod,
        password: authMethod === "password" ? sshPassword : undefined,
        privateKey: authMethod === "key" ? sshKey : undefined,
        clientAddress: clientAddress.trim(),
      });

      if (result.success) {
        setDeployLogs((prev) => [...prev, "WireGuard deployed successfully!"]);
        setDeployResult(result);
        setWizardCompleted((prev) => new Set(prev).add(2));

        // Auto-fill the connect form
        setForm((prev) => ({
          ...prev,
          name: `VPN ${vpsIp}`,
          server_endpoint: `${vpsIp}:51820`,
          server_public_key: result.server_public_key,
          client_private_key: result.client_private_key,
          client_address: clientAddress,
        }));

        // Auto-progress to step 3
        setTimeout(() => setWizardStep(3), 800);
      } else {
        setDeployLogs((prev) => [...prev, `ERROR: ${result.message}`]);
        setToast({ message: result.message, type: "error" });
      }
    } catch (e) {
      setDeployLogs((prev) => [...prev, `ERROR: ${String(e)}`]);
      setToast({ message: String(e), type: "error" });
    } finally {
      setDeploying(false);
    }
  }

  // ── Step 3: Connect ──

  async function fetchValveIps() {
    try {
      setLoadingValveIps(true);
      const ips = await invoke<string>("vpn_get_valve_ips");
      setForm((prev) => ({ ...prev, allowed_ips: ips }));
      setToast({ message: "Valve IPs loaded for split tunneling", type: "success" });
    } catch (e) {
      setToast({ message: String(e), type: "error" });
    } finally {
      setLoadingValveIps(false);
    }
  }

  async function saveAndActivate() {
    if (!form.name.trim() || !form.server_endpoint.trim() || !form.server_public_key.trim() || !form.client_private_key.trim()) {
      setToast({ message: "Fill all required fields (name, endpoint, server key, client key)", type: "error" });
      return;
    }
    try {
      setSaving(true);
      const result = await invoke<{ success: boolean; message: string }>("vpn_activate", { profile: form });
      if (result.success) {
        setActiveProfile(form.name);
        setWizardCompleted((prev) => new Set(prev).add(3));
        setToast({ message: `VPN "${form.name}" connected!`, type: "success" });
        await loadProfiles();
        await refreshStatus(form.name);
      } else {
        setToast({ message: result.message, type: "error" });
      }
    } catch (e) {
      setToast({ message: String(e), type: "error" });
    } finally {
      setSaving(false);
    }
  }

  // ── Shared functions ──

  async function loadProfiles() {
    try {
      setLoading(true);
      const result = await invoke<string[]>("vpn_list_profiles");
      setProfiles(result);
    } catch {
      setProfiles([]);
    } finally {
      setLoading(false);
    }
  }

  async function connectProfile(name: string) {
    try {
      setConnectingProfile(name);
      const result = await invoke<{ success: boolean; message: string }>("vpn_activate", {
        profile: { ...DEFAULT_PROFILE, name },
      });
      if (result.success) {
        setActiveProfile(name);
        setToast({ message: `Connected to "${name}"`, type: "success" });
        await refreshStatus(name);
      } else {
        setToast({ message: result.message, type: "error" });
      }
    } catch (e) {
      setToast({ message: String(e), type: "error" });
    } finally {
      setConnectingProfile(null);
    }
  }

  async function disconnectProfile() {
    try {
      const name = activeProfile ?? "";
      await invoke<{ success: boolean; message: string }>("vpn_deactivate", { profileName: name });
      setActiveProfile(null);
      setVpnStatus(null);
      setToast({ message: "VPN disconnected", type: "success" });
    } catch (e) {
      setToast({ message: String(e), type: "error" });
    }
  }

  async function refreshStatus(name: string) {
    try {
      const status = await invoke<VpnStatus>("vpn_get_status", { profileName: name });
      setVpnStatus(status);
    } catch {
      // Status may not be available
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    setToast({ message: "Copied to clipboard", type: "success" });
  }

  // ── Step indicator helper ──

  function StepIndicator() {
    const steps: { num: WizardStep; label: string; icon: typeof Server }[] = [
      { num: 1, label: "VPS Connection", icon: Server },
      { num: 2, label: "Deploy", icon: Upload },
      { num: 3, label: "Connect", icon: Wifi },
    ];

    return (
      <div className="flex items-center justify-center gap-1 mb-6">
        {steps.map((step, idx) => {
          const isActive = wizardStep === step.num;
          const isCompleted = wizardCompleted.has(step.num);
          const StepIcon = step.icon;

          return (
            <div key={step.num} className="flex items-center">
              <button
                onClick={() => setWizardStep(step.num)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg transition text-sm font-medium ${
                  isActive
                    ? "bg-accent/15 border border-accent/40 text-accent"
                    : isCompleted
                    ? "bg-success/10 border border-success/30 text-success"
                    : "bg-bg-card border border-border text-text-muted hover:border-accent/20"
                }`}
              >
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  isActive
                    ? "bg-accent/20 text-accent"
                    : isCompleted
                    ? "bg-success/20 text-success"
                    : "bg-border/40 text-text-muted"
                }`}>
                  {isCompleted ? <CheckCircle size={14} /> : step.num}
                </div>
                <StepIcon size={14} />
                <span className="hidden sm:inline">{step.label}</span>
              </button>
              {idx < steps.length - 1 && (
                <ArrowRight size={16} className={`mx-1 shrink-0 ${isCompleted ? "text-success" : "text-border"}`} />
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-accent">Smart VPN</h1>
          <p className="text-text-muted text-sm mt-1">
            Automated WireGuard deployment — VPS to VPN in 3 steps
          </p>
        </div>
      </div>

      {/* VPN Active Status Banner */}
      {vpnStatus?.active && activeProfile && (
        <div className="bg-success/10 border border-success/30 rounded-lg p-4 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-success/20 flex items-center justify-center">
                <Shield size={20} className="text-success" />
              </div>
              <div>
                <div className="text-sm font-semibold text-success">VPN Connected — {activeProfile}</div>
                <div className="text-xs text-text-muted font-mono">
                  {vpnStatus.endpoint && `Endpoint: ${vpnStatus.endpoint}`}
                  {vpnStatus.transfer_rx && ` | RX: ${vpnStatus.transfer_rx}`}
                  {vpnStatus.transfer_tx && ` | TX: ${vpnStatus.transfer_tx}`}
                  {vpnStatus.latest_handshake && ` | Handshake: ${vpnStatus.latest_handshake}`}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => refreshStatus(activeProfile)} className="p-2 text-text-muted hover:text-text transition">
                <RefreshCw size={14} />
              </button>
              <button onClick={disconnectProfile} className="flex items-center gap-1.5 px-3 py-1.5 bg-danger/15 text-danger text-xs rounded-md border border-danger/30 hover:bg-danger/25 transition">
                <WifiOff size={12} /> Disconnect
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════ WIZARD STEP INDICATOR ══════════ */}
      <StepIndicator />

      {/* ══════════ STEP 1: VPS CONNECTION ══════════ */}
      {wizardStep === 1 && (
        <div className="bg-bg-card border border-accent/20 rounded-lg p-6 mb-6">
          <h2 className="text-base font-semibold mb-4 flex items-center gap-2">
            <Server size={18} className="text-accent" />
            Step 1 — VPS Connection
          </h2>
          <p className="text-xs text-text-muted mb-5">
            Enter your VPS SSH credentials. We'll test the connection before deploying WireGuard.
          </p>

          <div className="grid grid-cols-2 gap-4 mb-5">
            {/* VPS IP */}
            <div>
              <label className="text-xs text-text-muted uppercase tracking-wider block mb-1 flex items-center gap-1">
                <Globe size={11} /> VPS IP Address *
              </label>
              <input
                type="text"
                value={vpsIp}
                onChange={(e) => setVpsIp(e.target.value)}
                placeholder="ex: 5.161.100.50"
                className="w-full bg-bg border border-border rounded-md px-3 py-2 text-sm text-text font-mono focus:outline-none focus:border-accent"
              />
            </div>

            {/* SSH Port */}
            <div>
              <label className="text-xs text-text-muted uppercase tracking-wider block mb-1 flex items-center gap-1">
                <Hash size={11} /> SSH Port
              </label>
              <input
                type="number"
                value={sshPort}
                onChange={(e) => setSshPort(e.target.value)}
                placeholder="22"
                min={1}
                max={65535}
                className="w-full bg-bg border border-border rounded-md px-3 py-2 text-sm text-text font-mono focus:outline-none focus:border-accent"
              />
            </div>

            {/* Username */}
            <div>
              <label className="text-xs text-text-muted uppercase tracking-wider block mb-1 flex items-center gap-1">
                <User size={11} /> Username
              </label>
              <input
                type="text"
                value={sshUsername}
                onChange={(e) => setSshUsername(e.target.value)}
                placeholder="root"
                className="w-full bg-bg border border-border rounded-md px-3 py-2 text-sm text-text focus:outline-none focus:border-accent"
              />
            </div>

            {/* Auth Method */}
            <div>
              <label className="text-xs text-text-muted uppercase tracking-wider block mb-1 flex items-center gap-1">
                <Lock size={11} /> Auth Method
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => setAuthMethod("password")}
                  className={`flex-1 px-3 py-2 text-sm rounded-md border transition ${
                    authMethod === "password"
                      ? "bg-accent/15 border-accent/40 text-accent"
                      : "bg-bg border-border text-text-muted hover:border-accent/20"
                  }`}
                >
                  Password
                </button>
                <button
                  onClick={() => setAuthMethod("key")}
                  className={`flex-1 px-3 py-2 text-sm rounded-md border transition ${
                    authMethod === "key"
                      ? "bg-accent/15 border-accent/40 text-accent"
                      : "bg-bg border-border text-text-muted hover:border-accent/20"
                  }`}
                >
                  SSH Key
                </button>
              </div>
            </div>

            {/* Password or Key */}
            <div className="col-span-2">
              {authMethod === "password" ? (
                <div>
                  <label className="text-xs text-text-muted uppercase tracking-wider block mb-1 flex items-center gap-1">
                    <Key size={11} /> SSH Password *
                  </label>
                  <input
                    type="password"
                    value={sshPassword}
                    onChange={(e) => setSshPassword(e.target.value)}
                    placeholder="Enter SSH password"
                    className="w-full bg-bg border border-border rounded-md px-3 py-2 text-sm text-text focus:outline-none focus:border-accent"
                  />
                </div>
              ) : (
                <div>
                  <label className="text-xs text-text-muted uppercase tracking-wider block mb-1 flex items-center gap-1">
                    <Key size={11} /> SSH Private Key *
                  </label>
                  <textarea
                    value={sshKey}
                    onChange={(e) => setSshKey(e.target.value)}
                    rows={4}
                    placeholder="Paste your private key (-----BEGIN OPENSSH PRIVATE KEY-----...)"
                    className="w-full bg-bg border border-border rounded-md px-3 py-2 text-sm text-text font-mono focus:outline-none focus:border-accent resize-none"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Connection Status */}
          {connectionStatus && (
            <div className={`flex items-center gap-2 p-3 rounded-lg mb-4 text-sm ${
              connectionStatus.success
                ? "bg-success/10 border border-success/30 text-success"
                : "bg-danger/10 border border-danger/30 text-danger"
            }`}>
              {connectionStatus.success ? <CheckCircle size={16} /> : <XCircle size={16} />}
              {connectionStatus.message}
            </div>
          )}

          {/* Test Connection Button */}
          <div className="flex justify-end">
            <button
              onClick={testConnection}
              disabled={testingConnection || !vpsIp.trim()}
              className="flex items-center gap-2 px-5 py-2.5 bg-accent text-white text-sm rounded-lg hover:bg-accent/80 transition disabled:opacity-50"
            >
              {testingConnection ? (
                <Loader size={14} className="animate-spin" />
              ) : (
                <Link size={14} />
              )}
              {testingConnection ? "Testing..." : "Test Connection"}
            </button>
          </div>
        </div>
      )}

      {/* ══════════ STEP 2: DEPLOY ══════════ */}
      {wizardStep === 2 && (
        <div className="bg-bg-card border border-accent/20 rounded-lg p-6 mb-6">
          <h2 className="text-base font-semibold mb-4 flex items-center gap-2">
            <Upload size={18} className="text-accent" />
            Step 2 — Deploy WireGuard
          </h2>

          {!wizardCompleted.has(1) ? (
            <div className="bg-warning/10 border border-warning/30 rounded-lg p-4 text-sm text-warning flex items-center gap-2">
              <Info size={16} />
              Complete Step 1 first — test your VPS connection.
            </div>
          ) : (
            <>
              <p className="text-xs text-text-muted mb-4">
                This will automatically install and configure WireGuard on your VPS ({vpsIp}).
              </p>

              {/* What will be done */}
              <div className="bg-bg rounded-lg border border-border p-4 mb-5">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-3">Deployment Steps</h3>
                <div className="space-y-2 text-sm">
                  {[
                    "Install WireGuard package",
                    "Generate server & client keypairs",
                    "Configure wg0 interface (10.66.66.1/24)",
                    "Enable IP forwarding & NAT",
                    "Start & enable WireGuard service",
                  ].map((step, i) => (
                    <div key={i} className="flex items-center gap-2 text-text-muted">
                      <div className="w-5 h-5 rounded-full bg-accent/10 text-accent text-xs flex items-center justify-center font-bold">{i + 1}</div>
                      {step}
                    </div>
                  ))}
                </div>
              </div>

              {/* Client Address */}
              <div className="mb-5">
                <label className="text-xs text-text-muted uppercase tracking-wider block mb-1">Client Address</label>
                <input
                  type="text"
                  value={clientAddress}
                  onChange={(e) => setClientAddress(e.target.value)}
                  className="w-64 bg-bg border border-border rounded-md px-3 py-2 text-sm text-text font-mono focus:outline-none focus:border-accent"
                />
              </div>

              {/* Deploy Logs */}
              {deployLogs.length > 0 && (
                <div className="bg-[#0d1117] rounded-lg border border-border p-4 mb-5 max-h-64 overflow-y-auto">
                  <div className="flex items-center gap-2 mb-2">
                    <Terminal size={14} className="text-accent2" />
                    <span className="text-xs font-semibold text-accent2 uppercase tracking-wider">Deployment Log</span>
                  </div>
                  <div className="font-mono text-xs space-y-1">
                    {deployLogs.map((log, i) => (
                      <div key={i} className={`flex items-start gap-2 ${
                        log.startsWith("ERROR") ? "text-danger" : log.includes("successfully") ? "text-success" : "text-text-muted"
                      }`}>
                        <span className="text-text-muted/50 select-none">{`>`}</span>
                        {log}
                      </div>
                    ))}
                    {deploying && (
                      <div className="flex items-center gap-2 text-accent">
                        <Loader size={12} className="animate-spin" />
                        <span>Working...</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Deploy Result */}
              {deployResult?.success && (
                <div className="bg-success/5 border border-success/20 rounded-lg p-4 mb-5">
                  <h3 className="text-sm font-semibold text-success mb-3 flex items-center gap-2">
                    <CheckCircle size={16} /> Deployment Successful
                  </h3>
                  <div className="grid grid-cols-1 gap-2 text-xs font-mono">
                    <div className="flex items-center justify-between bg-bg rounded-md px-3 py-2 border border-border">
                      <span className="text-text-muted">Server Public Key:</span>
                      <div className="flex items-center gap-2">
                        <code className="text-accent2">{deployResult.server_public_key}</code>
                        <button onClick={() => copyToClipboard(deployResult.server_public_key)} className="text-text-muted hover:text-text transition"><Copy size={12} /></button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between bg-bg rounded-md px-3 py-2 border border-border">
                      <span className="text-text-muted">Client Public Key:</span>
                      <div className="flex items-center gap-2">
                        <code className="text-accent2">{deployResult.client_public_key}</code>
                        <button onClick={() => copyToClipboard(deployResult.client_public_key)} className="text-text-muted hover:text-text transition"><Copy size={12} /></button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between bg-bg rounded-md px-3 py-2 border border-border">
                      <span className="text-text-muted">Endpoint:</span>
                      <code className="text-accent2">{deployResult.endpoint || `${vpsIp}:51820`}</code>
                    </div>
                  </div>
                </div>
              )}

              {/* Deploy Button */}
              <div className="flex justify-end">
                <button
                  onClick={deployWireGuard}
                  disabled={deploying}
                  className="flex items-center gap-2 px-5 py-2.5 bg-accent text-white text-sm rounded-lg hover:bg-accent/80 transition disabled:opacity-50"
                >
                  {deploying ? (
                    <Loader size={14} className="animate-spin" />
                  ) : (
                    <Upload size={14} />
                  )}
                  {deploying ? "Deploying..." : "Deploy WireGuard"}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ══════════ STEP 3: CONNECT ══════════ */}
      {wizardStep === 3 && (
        <div className="bg-bg-card border border-accent/20 rounded-lg p-6 mb-6">
          <h2 className="text-base font-semibold mb-4 flex items-center gap-2">
            <Wifi size={18} className="text-accent" />
            Step 3 — Connect
          </h2>

          {!wizardCompleted.has(2) ? (
            <div className="bg-warning/10 border border-warning/30 rounded-lg p-4 text-sm text-warning flex items-center gap-2">
              <Info size={16} />
              Complete Step 2 first — deploy WireGuard on your VPS.
            </div>
          ) : (
            <>
              <p className="text-xs text-text-muted mb-5">
                Your VPN profile has been auto-filled from the deployment. Review the settings and connect.
              </p>

              <div className="grid grid-cols-2 gap-4 mb-5">
                <div>
                  <label className="text-xs text-text-muted uppercase tracking-wider block mb-1">Profile Name *</label>
                  <input type="text" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="ex: Gaming Frankfurt" className="w-full bg-bg border border-border rounded-md px-3 py-2 text-sm text-text focus:outline-none focus:border-accent" />
                </div>
                <div>
                  <label className="text-xs text-text-muted uppercase tracking-wider block mb-1">Server Endpoint *</label>
                  <input type="text" value={form.server_endpoint} onChange={(e) => setForm((p) => ({ ...p, server_endpoint: e.target.value }))} placeholder="ex: 5.161.100.50:51820" className="w-full bg-bg border border-border rounded-md px-3 py-2 text-sm text-text font-mono focus:outline-none focus:border-accent" />
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-text-muted uppercase tracking-wider block mb-1">Server Public Key *</label>
                  <input type="text" value={form.server_public_key} onChange={(e) => setForm((p) => ({ ...p, server_public_key: e.target.value }))} placeholder="Base64 public key" className="w-full bg-bg border border-border rounded-md px-3 py-2 text-sm text-text font-mono focus:outline-none focus:border-accent" />
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-text-muted uppercase tracking-wider block mb-1">Client Private Key *</label>
                  <input type="password" value={form.client_private_key} onChange={(e) => setForm((p) => ({ ...p, client_private_key: e.target.value }))} placeholder="Client private key" className="w-full bg-bg border border-border rounded-md px-3 py-2 text-sm text-text font-mono focus:outline-none focus:border-accent" />
                </div>

                <div>
                  <label className="text-xs text-text-muted uppercase tracking-wider block mb-1">Client Address</label>
                  <input type="text" value={form.client_address} onChange={(e) => setForm((p) => ({ ...p, client_address: e.target.value }))} className="w-full bg-bg border border-border rounded-md px-3 py-2 text-sm text-text font-mono focus:outline-none focus:border-accent" />
                </div>
                <div>
                  <label className="text-xs text-text-muted uppercase tracking-wider block mb-1">DNS</label>
                  <input type="text" value={form.dns} onChange={(e) => setForm((p) => ({ ...p, dns: e.target.value }))} className="w-full bg-bg border border-border rounded-md px-3 py-2 text-sm text-text font-mono focus:outline-none focus:border-accent" />
                </div>
                <div>
                  <label className="text-xs text-text-muted uppercase tracking-wider block mb-1">MTU</label>
                  <input type="number" value={form.mtu} onChange={(e) => setForm((p) => ({ ...p, mtu: Number(e.target.value) }))} min={1280} max={1500} className="w-full bg-bg border border-border rounded-md px-3 py-2 text-sm text-text font-mono focus:outline-none focus:border-accent" />
                </div>
                <div>
                  <label className="text-xs text-text-muted uppercase tracking-wider block mb-1">Keepalive (sec)</label>
                  <input type="number" value={form.persistent_keepalive} onChange={(e) => setForm((p) => ({ ...p, persistent_keepalive: Number(e.target.value) }))} min={0} max={300} className="w-full bg-bg border border-border rounded-md px-3 py-2 text-sm text-text font-mono focus:outline-none focus:border-accent" />
                </div>

                <div className="col-span-2">
                  <label className="text-xs text-text-muted uppercase tracking-wider block mb-1">Allowed IPs (Split Tunnel)</label>
                  <div className="flex gap-2">
                    <textarea value={form.allowed_ips} onChange={(e) => setForm((p) => ({ ...p, allowed_ips: e.target.value }))} rows={2} placeholder="CIDRs separated by commas (or use Auto-fill)" className="flex-1 bg-bg border border-border rounded-md px-3 py-2 text-sm text-text font-mono focus:outline-none focus:border-accent resize-none" />
                    <button onClick={fetchValveIps} disabled={loadingValveIps} className="self-start flex items-center gap-1.5 px-3 py-2 bg-accent2/15 text-accent2 text-sm rounded-md border border-accent2/30 hover:bg-accent2/25 transition disabled:opacity-50 whitespace-nowrap">
                      {loadingValveIps ? <Loader size={14} className="animate-spin" /> : <Globe size={14} />} Auto-fill Valve IPs
                    </button>
                  </div>
                </div>
              </div>

              {/* Connect Button */}
              <div className="flex justify-end">
                <button
                  onClick={saveAndActivate}
                  disabled={saving}
                  className="flex items-center gap-2 px-5 py-2.5 bg-success text-white text-sm rounded-lg hover:bg-success/80 transition disabled:opacity-50"
                >
                  {saving ? (
                    <Loader size={14} className="animate-spin" />
                  ) : (
                    <Wifi size={14} />
                  )}
                  {saving ? "Connecting..." : "Connect"}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ══════════ HOW IT WORKS ══════════ */}
      <div className="bg-bg-card border border-border rounded-lg mb-6">
        <button
          onClick={() => setShowHowItWorks(!showHowItWorks)}
          className="w-full flex items-center justify-between p-5 text-left"
        >
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Info size={16} className="text-accent2" />
            Como funciona o Smart VPN para CS2?
          </h2>
          {showHowItWorks ? <ChevronUp size={16} className="text-text-muted" /> : <ChevronDown size={16} className="text-text-muted" />}
        </button>

        {showHowItWorks && (
          <div className="px-5 pb-5">
            {/* Visual Diagram */}
            <div className="bg-bg rounded-lg border border-border p-5 mb-4">
              <div className="flex items-center justify-center gap-2 text-sm font-mono flex-wrap">
                <div className="bg-accent/15 border border-accent/30 rounded-lg px-4 py-2 text-accent text-center">
                  <div className="text-xs text-text-muted mb-1">O teu PC</div>
                  <div className="font-bold">Windows 11</div>
                  <div className="text-[10px] text-text-muted">WireGuard Client</div>
                </div>
                <ArrowRight size={20} className="text-accent2 shrink-0" />
                <div className="bg-accent2/15 border border-accent2/30 rounded-lg px-4 py-2 text-accent2 text-center">
                  <div className="text-xs text-text-muted mb-1">VPN Server</div>
                  <div className="font-bold">VPS ({"\u20AC"}3-6/m{"\u00EA"}s)</div>
                  <div className="text-[10px] text-text-muted">Frankfurt / Madrid</div>
                </div>
                <ArrowRight size={20} className="text-success shrink-0" />
                <div className="bg-success/15 border border-success/30 rounded-lg px-4 py-2 text-success text-center">
                  <div className="text-xs text-text-muted mb-1">Valve SDR Relay</div>
                  <div className="font-bold">PoP (1-3ms)</div>
                  <div className="text-[10px] text-text-muted">Mesmo datacenter</div>
                </div>
                <ArrowRight size={20} className="text-warning shrink-0" />
                <div className="bg-warning/15 border border-warning/30 rounded-lg px-4 py-2 text-warning text-center">
                  <div className="text-xs text-text-muted mb-1">Game Server</div>
                  <div className="font-bold">CS2 Match</div>
                  <div className="text-[10px] text-text-muted">Valve backbone</div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-accent2">O Problema</h3>
                <p className="text-xs text-text-muted leading-relaxed">
                  O teu ISP (MEO, NOS, Vodafone) encaminha o tr{"\u00E1"}fego para os servidores Valve pelo caminho mais <strong className="text-text">barato</strong>, n{"\u00E3"}o pelo mais r{"\u00E1"}pido.
                  Isto causa routing ineficiente — por exemplo, tr{"\u00E1"}fego de Lisboa para Madrid pode ir via Londres e Frankfurt, adicionando 30-50ms desnecess{"\u00E1"}rios.
                </p>
                <div className="bg-danger/8 border border-danger/20 rounded p-3">
                  <div className="text-xs font-mono text-danger">
                    Sem VPN: Lisboa {"\u2192"} Londres {"\u2192"} Frankfurt {"\u2192"} Madrid
                  </div>
                  <div className="text-[10px] text-text-muted mt-1">~60-80ms (routing do ISP)</div>
                </div>
              </div>
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-accent2">A Solu{"\u00E7\u00E3"}o</h3>
                <p className="text-xs text-text-muted leading-relaxed">
                  Colocas um server WireGuard num VPS <strong className="text-text">perto do datacenter Valve</strong>.
                  O tr{"\u00E1"}fego do CS2 vai encriptado at{"\u00E9"} ao VPS, e da{"\u00ED"} ao relay Valve {"\u00E9"} ~1-3ms local.
                  O VPS est{"\u00E1"} em redes premium (Hetzner, Vultr) com peering direto.
                </p>
                <div className="bg-success/8 border border-success/20 rounded p-3">
                  <div className="text-xs font-mono text-success">
                    Com VPN: Lisboa {"\u2192"} VPN Madrid (15ms) {"\u2192"} Valve (2ms)
                  </div>
                  <div className="text-[10px] text-text-muted mt-1">~17ms total (rota direta)</div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="bg-bg rounded-lg border border-border p-3">
                <Zap size={16} className="text-accent mb-2" />
                <h4 className="text-xs font-semibold mb-1">Split Tunneling</h4>
                <p className="text-[10px] text-text-muted">S{"\u00F3"} o tr{"\u00E1"}fego CS2/Valve passa pelo VPN. Discord, browser, Steam downloads usam a conex{"\u00E3"}o normal.</p>
              </div>
              <div className="bg-bg rounded-lg border border-border p-3">
                <Shield size={16} className="text-accent mb-2" />
                <h4 className="text-xs font-semibold mb-1">WireGuard</h4>
                <p className="text-[10px] text-text-muted">Protocolo VPN mais r{"\u00E1"}pido: +0.5-1.5ms overhead, encripta{"\u00E7\u00E3"}o ChaCha20, UDP-only. Ideal para gaming.</p>
              </div>
              <div className="bg-bg rounded-lg border border-border p-3">
                <Globe size={16} className="text-accent mb-2" />
                <h4 className="text-xs font-semibold mb-1">VAC Safe</h4>
                <p className="text-[10px] text-text-muted">VPN {"\u00E9"} 100% permitido pela Valve. VAC inspeciona mem{"\u00F3"}ria/processos, n{"\u00E3"}o routing. Muitos pros usam VPN.</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ══════════ SERVER RECOMMENDATIONS ══════════ */}
      <div className="bg-bg-card border border-border rounded-lg mb-6">
        <button
          onClick={() => setShowRecommendations(!showRecommendations)}
          className="w-full flex items-center justify-between p-5 text-left"
        >
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Server size={16} className="text-accent2" />
            VPN Servers Recomendados (Para Portugal)
          </h2>
          {showRecommendations ? <ChevronUp size={16} className="text-text-muted" /> : <ChevronDown size={16} className="text-text-muted" />}
        </button>

        {showRecommendations && (
          <div className="px-5 pb-5">
            <p className="text-xs text-text-muted mb-4">
              Servidores VPS recomendados pr{"\u00F3"}ximos de datacenters Valve. Escolhe baseado na regi{"\u00E3"}o onde costumas jogar.
              O pre{"\u00E7"}o {"\u00E9"} de um VPS m{"\u00ED"}nimo — suficiente para WireGuard (usa apenas ~1% CPU).
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-text-muted text-xs uppercase tracking-wider">
                    <th className="text-left py-2 px-3">Valve DC</th>
                    <th className="text-left py-2 px-3">VPN Server</th>
                    <th className="text-left py-2 px-3">Provider</th>
                    <th className="text-left py-2 px-3">Pre{"\u00E7"}o</th>
                    <th className="text-left py-2 px-3">Est. Ping (PT)</th>
                    <th className="text-left py-2 px-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {SERVER_RECOMMENDATIONS.map((rec) => (
                    <tr key={rec.valveDc} className="border-b border-border/50 hover:bg-bg-hover transition">
                      <td className="py-2.5 px-3">
                        <span className="font-mono font-bold text-accent2">{rec.valveDc}</span>
                        <span className="text-text-muted text-xs ml-2">{rec.valveLocation}</span>
                      </td>
                      <td className="py-2.5 px-3 text-xs">{rec.vpnLocation}</td>
                      <td className="py-2.5 px-3">
                        <span className="text-xs font-semibold text-accent">{rec.vpnProvider}</span>
                      </td>
                      <td className="py-2.5 px-3 text-xs font-mono text-success">{rec.price}</td>
                      <td className="py-2.5 px-3 text-xs font-mono text-warning">{rec.estPing}</td>
                      <td className="py-2.5 px-3">
                        <a href={rec.setupUrl} target="_blank" rel="noopener noreferrer" className="text-accent2 hover:text-accent2/80 transition">
                          <ExternalLink size={14} />
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 text-[10px] text-text-muted">
              Oracle Cloud Free Tier oferece um VPS gr{"\u00E1"}tis (4 OCPU ARM, 24GB RAM) em Frankfurt, London, Amsterdam — ideal para testar.
            </div>
          </div>
        )}
      </div>

      {/* ══════════ SAVED PROFILES ══════════ */}
      <div className="mb-6">
        <h2 className="text-base font-semibold mb-4 flex items-center gap-2">
          <Shield size={16} className="text-accent" />
          Saved Profiles ({profiles.length})
        </h2>

        {loading && (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="bg-bg-card border border-border rounded-lg p-5 animate-pulse">
                <div className="h-4 bg-border/40 rounded w-48 mb-2" />
                <div className="h-3 bg-border/40 rounded w-64" />
              </div>
            ))}
          </div>
        )}

        {!loading && profiles.length === 0 && (
          <div className="bg-bg-card border border-border rounded-lg p-8 text-center">
            <Shield size={32} className="mx-auto mb-3 text-text-muted" />
            <p className="text-text-muted text-sm mb-2">No VPN profiles yet.</p>
            <p className="text-text-muted text-xs">Complete the wizard above to deploy and connect your first VPN.</p>
          </div>
        )}

        {!loading && profiles.length > 0 && (
          <div className="grid grid-cols-1 gap-3">
            {profiles.map((name) => {
              const isActive = activeProfile === name;
              const isConnecting = connectingProfile === name;
              return (
                <div key={name} className={`bg-bg-card border rounded-lg p-4 transition flex items-center justify-between ${isActive ? "border-success/40 bg-success/5" : "border-border hover:border-accent/20"}`}>
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isActive ? "bg-success/15" : "bg-accent2/10"}`}>
                      {isActive ? <Wifi size={16} className="text-success" /> : <Shield size={16} className="text-accent2" />}
                    </div>
                    <div>
                      <span className="font-semibold">{name}</span>
                      {isActive && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-success/15 text-success font-semibold uppercase">Connected</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {isActive ? (
                      <button onClick={disconnectProfile} className="flex items-center gap-1.5 px-3 py-1.5 bg-danger/15 text-danger text-xs rounded-md border border-danger/30 hover:bg-danger/25 transition">
                        <WifiOff size={12} /> Disconnect
                      </button>
                    ) : (
                      <button onClick={() => connectProfile(name)} disabled={isConnecting} className="flex items-center gap-1.5 px-3 py-1.5 bg-success/15 text-success text-xs rounded-md border border-success/30 hover:bg-success/25 transition disabled:opacity-50">
                        {isConnecting ? <Loader size={12} className="animate-spin" /> : <Wifi size={12} />} Connect
                      </button>
                    )}
                    <button onClick={() => {}} className="p-1.5 text-text-muted hover:text-danger transition"><Trash2 size={14} /></button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Config Preview Modal */}
      {previewConfig !== null && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setPreviewConfig(null)}>
          <div className="bg-bg-card border border-border rounded-lg w-[600px] max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h3 className="font-semibold flex items-center gap-2"><FileCode size={16} className="text-accent2" /> WireGuard Config Preview</h3>
              <div className="flex items-center gap-2">
                <button onClick={() => copyToClipboard(previewConfig)} className="flex items-center gap-1.5 px-3 py-1.5 text-text-muted text-xs rounded-md border border-border hover:text-text transition"><Copy size={12} /> Copy</button>
                <button onClick={() => setPreviewConfig(null)} className="text-text-muted hover:text-text transition px-2">{"\u2715"}</button>
              </div>
            </div>
            <div className="p-5 overflow-y-auto flex-1">
              <pre className="bg-bg-code border border-border rounded-lg p-4 text-sm font-mono text-accent2 whitespace-pre-wrap">{previewConfig}</pre>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 px-5 py-3 rounded-lg shadow-lg border flex items-center gap-2 text-sm z-50 ${toast.type === "success" ? "bg-success/15 border-success/30 text-success" : "bg-danger/15 border-danger/30 text-danger"}`}>
          {toast.type === "success" ? <CheckCircle size={16} /> : <XCircle size={16} />}
          {toast.message}
        </div>
      )}
    </div>
  );
}
