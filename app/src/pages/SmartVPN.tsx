import { useEffect, useState } from "react";
import { invoke } from "../lib/tauri";
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
  Server,
  ArrowRight,
  Zap,
  Info,
  ChevronDown,
  ChevronUp,
  ExternalLink,
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
  { valveDc: "fra", valveLocation: "Frankfurt (EU West)", vpnProvider: "Hetzner", vpnLocation: "Falkenstein/Frankfurt, DE", price: "€3.79/mês", estPing: "25-35ms", setupUrl: "https://www.hetzner.com/cloud" },
  { valveDc: "mad", valveLocation: "Madrid (EU Spain)", vpnProvider: "Vultr", vpnLocation: "Madrid, ES", price: "$6/mês", estPing: "5-15ms", setupUrl: "https://www.vultr.com/" },
  { valveDc: "lhr", valveLocation: "London (EU West)", vpnProvider: "Vultr", vpnLocation: "London, UK", price: "$6/mês", estPing: "35-45ms", setupUrl: "https://www.vultr.com/" },
  { valveDc: "ams", valveLocation: "Amsterdam (EU)", vpnProvider: "Hetzner", vpnLocation: "Helsinki, FI", price: "€3.79/mês", estPing: "30-40ms", setupUrl: "https://www.hetzner.com/cloud" },
  { valveDc: "vie", valveLocation: "Vienna (EU East)", vpnProvider: "Vultr", vpnLocation: "Vienna, AT", price: "$6/mês", estPing: "40-50ms", setupUrl: "https://www.vultr.com/" },
  { valveDc: "waw", valveLocation: "Warsaw (EU)", vpnProvider: "OVH", vpnLocation: "Warsaw, PL", price: "€3.50/mês", estPing: "45-55ms", setupUrl: "https://www.ovhcloud.com/en/vps/" },
  { valveDc: "sto", valveLocation: "Stockholm (EU North)", vpnProvider: "Hetzner", vpnLocation: "Helsinki, FI", price: "€3.79/mês", estPing: "50-70ms", setupUrl: "https://www.hetzner.com/cloud" },
];

// ── Component ──

export default function SmartVPN() {
  const [profiles, setProfiles] = useState<string[]>([]);
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
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [showHowItWorks, setShowHowItWorks] = useState(true);
  const [showSetupGuide, setShowSetupGuide] = useState(false);
  const [showRecommendations, setShowRecommendations] = useState(true);

  useEffect(() => {
    loadProfiles();
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
      const result = await invoke<string[]>("vpn_list_profiles");
      setProfiles(result);
    } catch {
      setProfiles([]);
    } finally {
      setLoading(false);
    }
  }

  async function generateKeypair() {
    try {
      setGeneratingKey(true);
      const result = await invoke<[string, string]>("vpn_generate_keypair");
      if (Array.isArray(result)) {
        setForm((prev) => ({ ...prev, client_private_key: result[0] }));
        setGeneratedPublicKey(result[1]);
        setToast({ message: "Keypair generated", type: "success" });
      }
    } catch (e) {
      setToast({ message: `Key generation: ${String(e)}`, type: "error" });
    } finally {
      setGeneratingKey(false);
    }
  }

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
        setToast({ message: `VPN "${form.name}" activated!`, type: "success" });
        setShowForm(false);
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

  async function connectProfile(name: string) {
    try {
      setConnectingProfile(name);
      // We need the full profile to activate — for now just use the name
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

  async function previewProfileConfig() {
    const config = await invoke<string>("vpn_generate_config", { profile: form });
    setPreviewConfig(config);
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    setToast({ message: "Copied to clipboard", type: "success" });
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-accent">Smart VPN</h1>
          <p className="text-text-muted text-sm mt-1">
            WireGuard gaming VPN — optimize your route to Valve servers
          </p>
        </div>
        <button
          onClick={() => { setShowForm(!showForm); setShowHowItWorks(false); }}
          className="flex items-center gap-2 px-4 py-2 bg-accent text-white text-sm rounded-lg hover:bg-accent/80 transition"
        >
          <Plus size={14} />
          New Profile
        </button>
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
                  <div className="font-bold">VPS (€3-6/mês)</div>
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
                  O teu ISP (MEO, NOS, Vodafone) encaminha o tráfego para os servidores Valve pelo caminho mais <strong className="text-text">barato</strong>, não pelo mais rápido.
                  Isto causa routing ineficiente — por exemplo, tráfego de Lisboa para Madrid pode ir via Londres e Frankfurt, adicionando 30-50ms desnecessários.
                </p>
                <div className="bg-danger/8 border border-danger/20 rounded p-3">
                  <div className="text-xs font-mono text-danger">
                    Sem VPN: Lisboa → Londres → Frankfurt → Madrid
                  </div>
                  <div className="text-[10px] text-text-muted mt-1">~60-80ms (routing do ISP)</div>
                </div>
              </div>
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-accent2">A Solução</h3>
                <p className="text-xs text-text-muted leading-relaxed">
                  Colocas um server WireGuard num VPS <strong className="text-text">perto do datacenter Valve</strong>.
                  O tráfego do CS2 vai encriptado até ao VPS, e daí ao relay Valve é ~1-3ms local.
                  O VPS está em redes premium (Hetzner, Vultr) com peering direto.
                </p>
                <div className="bg-success/8 border border-success/20 rounded p-3">
                  <div className="text-xs font-mono text-success">
                    Com VPN: Lisboa → VPN Madrid (15ms) → Valve (2ms)
                  </div>
                  <div className="text-[10px] text-text-muted mt-1">~17ms total (rota direta)</div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="bg-bg rounded-lg border border-border p-3">
                <Zap size={16} className="text-accent mb-2" />
                <h4 className="text-xs font-semibold mb-1">Split Tunneling</h4>
                <p className="text-[10px] text-text-muted">Só o tráfego CS2/Valve passa pelo VPN. Discord, browser, Steam downloads usam a conexão normal.</p>
              </div>
              <div className="bg-bg rounded-lg border border-border p-3">
                <Shield size={16} className="text-accent mb-2" />
                <h4 className="text-xs font-semibold mb-1">WireGuard</h4>
                <p className="text-[10px] text-text-muted">Protocolo VPN mais rápido: +0.5-1.5ms overhead, encriptação ChaCha20, UDP-only. Ideal para gaming.</p>
              </div>
              <div className="bg-bg rounded-lg border border-border p-3">
                <Globe size={16} className="text-accent mb-2" />
                <h4 className="text-xs font-semibold mb-1">VAC Safe</h4>
                <p className="text-[10px] text-text-muted">VPN é 100% permitido pela Valve. VAC inspeciona memória/processos, não routing. Muitos pros usam VPN.</p>
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
              Servidores VPS recomendados próximos de datacenters Valve. Escolhe baseado na região onde costumas jogar.
              O preço é de um VPS mínimo — suficiente para WireGuard (usa apenas ~1% CPU).
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-text-muted text-xs uppercase tracking-wider">
                    <th className="text-left py-2 px-3">Valve DC</th>
                    <th className="text-left py-2 px-3">VPN Server</th>
                    <th className="text-left py-2 px-3">Provider</th>
                    <th className="text-left py-2 px-3">Preço</th>
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
              Oracle Cloud Free Tier oferece um VPS grátis (4 OCPU ARM, 24GB RAM) em Frankfurt, London, Amsterdam — ideal para testar.
            </div>
          </div>
        )}
      </div>

      {/* ══════════ SETUP GUIDE ══════════ */}
      <div className="bg-bg-card border border-border rounded-lg mb-6">
        <button
          onClick={() => setShowSetupGuide(!showSetupGuide)}
          className="w-full flex items-center justify-between p-5 text-left"
        >
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Key size={16} className="text-accent2" />
            Guia de Setup Rápido (VPS + WireGuard)
          </h2>
          {showSetupGuide ? <ChevronUp size={16} className="text-text-muted" /> : <ChevronDown size={16} className="text-text-muted" />}
        </button>

        {showSetupGuide && (
          <div className="px-5 pb-5">
            <div className="space-y-4">
              {/* Step 1 */}
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-accent/15 text-accent text-sm font-bold flex items-center justify-center shrink-0">1</div>
                <div>
                  <h4 className="text-sm font-semibold">Criar VPS</h4>
                  <p className="text-xs text-text-muted">Cria um VPS na localização desejada (ex: Hetzner Frankfurt, €3.79/mês). Ubuntu 22.04, o plano mais barato serve.</p>
                </div>
              </div>

              {/* Step 2 */}
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-accent/15 text-accent text-sm font-bold flex items-center justify-center shrink-0">2</div>
                <div>
                  <h4 className="text-sm font-semibold">Instalar WireGuard no VPS</h4>
                  <p className="text-xs text-text-muted mb-2">Conecta via SSH e executa:</p>
                  <pre className="bg-bg-code border border-border rounded-lg p-3 text-xs font-mono text-accent2 overflow-x-auto">
{`# Instalar WireGuard
sudo apt update && sudo apt install -y wireguard

# Gerar chaves do server
wg genkey | sudo tee /etc/wireguard/server_private.key | wg pubkey | sudo tee /etc/wireguard/server_public.key

# Ativar IP forwarding
echo "net.ipv4.ip_forward = 1" | sudo tee -a /etc/sysctl.conf && sudo sysctl -p

# Criar config do server
sudo cat > /etc/wireguard/wg0.conf << 'EOF'
[Interface]
Address = 10.66.66.1/24
ListenPort = 51820
PrivateKey = <CONTEUDO_DE_server_private.key>
PostUp = iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
PostDown = iptables -t nat -D POSTROUTING -o eth0 -j MASQUERADE

[Peer]
PublicKey = <TUA_PUBLIC_KEY_DO_CLIENT>
AllowedIPs = 10.66.66.2/32
EOF

# Iniciar e ativar
sudo systemctl enable --now wg-quick@wg0`}
                  </pre>
                </div>
              </div>

              {/* Step 3 */}
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-accent/15 text-accent text-sm font-bold flex items-center justify-center shrink-0">3</div>
                <div>
                  <h4 className="text-sm font-semibold">Configurar o Client (esta app)</h4>
                  <p className="text-xs text-text-muted">Clica "New Profile" acima e preenche com os dados do teu VPS. Usa "Generate" para criar as tuas chaves e "Auto-fill Valve IPs" para split tunneling automático.</p>
                </div>
              </div>

              {/* Step 4 */}
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-success/15 text-success text-sm font-bold flex items-center justify-center shrink-0">4</div>
                <div>
                  <h4 className="text-sm font-semibold">Conectar e Jogar</h4>
                  <p className="text-xs text-text-muted">Ativa o perfil VPN, abre o CS2 e joga. O tráfego Valve será automaticamente encaminhado pelo VPN. Tudo o resto (Discord, browser) usa a conexão normal.</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ══════════ NEW PROFILE FORM ══════════ */}
      {showForm && (
        <div className="bg-bg-card border border-accent/30 rounded-lg p-5 mb-6">
          <h2 className="text-base font-semibold mb-4 flex items-center gap-2">
            <Key size={16} className="text-accent2" />
            Novo Perfil WireGuard
          </h2>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-xs text-text-muted uppercase tracking-wider block mb-1">Profile Name *</label>
              <input type="text" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="ex: Gaming Frankfurt" className="w-full bg-bg border border-border rounded-md px-3 py-2 text-sm text-text focus:outline-none focus:border-accent" />
            </div>
            <div>
              <label className="text-xs text-text-muted uppercase tracking-wider block mb-1">Server Endpoint *</label>
              <input type="text" value={form.server_endpoint} onChange={(e) => setForm((p) => ({ ...p, server_endpoint: e.target.value }))} placeholder="ex: 5.161.100.50:51820" className="w-full bg-bg border border-border rounded-md px-3 py-2 text-sm text-text focus:outline-none focus:border-accent" />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-text-muted uppercase tracking-wider block mb-1">Server Public Key * <span className="normal-case text-text-muted">(do VPS: cat /etc/wireguard/server_public.key)</span></label>
              <input type="text" value={form.server_public_key} onChange={(e) => setForm((p) => ({ ...p, server_public_key: e.target.value }))} placeholder="Base64 public key do server" className="w-full bg-bg border border-border rounded-md px-3 py-2 text-sm text-text font-mono focus:outline-none focus:border-accent" />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-text-muted uppercase tracking-wider block mb-1">Client Private Key *</label>
              <div className="flex gap-2">
                <input type="password" value={form.client_private_key} onChange={(e) => setForm((p) => ({ ...p, client_private_key: e.target.value }))} placeholder="A tua private key" className="flex-1 bg-bg border border-border rounded-md px-3 py-2 text-sm text-text font-mono focus:outline-none focus:border-accent" />
                <button onClick={generateKeypair} disabled={generatingKey} className="flex items-center gap-1.5 px-3 py-2 bg-accent2/15 text-accent2 text-sm rounded-md border border-accent2/30 hover:bg-accent2/25 transition disabled:opacity-50">
                  {generatingKey ? <Loader size={14} className="animate-spin" /> : <RefreshCw size={14} />} Generate
                </button>
              </div>
              {generatedPublicKey && (
                <div className="mt-2 flex items-center gap-2 bg-bg rounded-md px-3 py-2 border border-border">
                  <span className="text-xs text-text-muted">Your Public Key (copiar para o [Peer] do server):</span>
                  <code className="text-xs font-mono text-accent2">{generatedPublicKey}</code>
                  <button onClick={() => copyToClipboard(generatedPublicKey)} className="text-text-muted hover:text-text transition"><Copy size={12} /></button>
                </div>
              )}
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
              <label className="text-xs text-text-muted uppercase tracking-wider block mb-1">Allowed IPs <span className="normal-case">(Split tunnel — só tráfego para estes IPs vai pelo VPN)</span></label>
              <div className="flex gap-2">
                <textarea value={form.allowed_ips} onChange={(e) => setForm((p) => ({ ...p, allowed_ips: e.target.value }))} rows={2} placeholder="CIDRs separados por vírgula" className="flex-1 bg-bg border border-border rounded-md px-3 py-2 text-sm text-text font-mono focus:outline-none focus:border-accent resize-none" />
                <button onClick={fetchValveIps} disabled={loadingValveIps} className="self-start flex items-center gap-1.5 px-3 py-2 bg-accent2/15 text-accent2 text-sm rounded-md border border-accent2/30 hover:bg-accent2/25 transition disabled:opacity-50 whitespace-nowrap">
                  {loadingValveIps ? <Loader size={14} className="animate-spin" /> : <Globe size={14} />} Auto-fill Valve IPs
                </button>
              </div>
            </div>
          </div>

          <div className="flex gap-3 justify-end">
            <button onClick={previewProfileConfig} className="flex items-center gap-2 px-4 py-2 text-sm text-text-muted border border-border rounded-lg hover:border-accent/30 transition">
              <FileCode size={14} /> Preview Config
            </button>
            <button onClick={() => { setShowForm(false); setForm({ ...DEFAULT_PROFILE }); setGeneratedPublicKey(""); }} className="px-4 py-2 text-sm text-text-muted hover:text-text transition">Cancel</button>
            <button onClick={saveAndActivate} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-accent text-white text-sm rounded-lg hover:bg-accent/80 transition disabled:opacity-50">
              {saving ? <Loader size={14} className="animate-spin" /> : <Wifi size={14} />}
              {saving ? "Saving..." : "Save & Connect"}
            </button>
          </div>
        </div>
      )}

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
            <p className="text-text-muted text-xs">Click "New Profile" above to create your first WireGuard configuration.</p>
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
                <button onClick={() => setPreviewConfig(null)} className="text-text-muted hover:text-text transition px-2">✕</button>
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
