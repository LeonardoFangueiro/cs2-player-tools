# CS2 Player Tools — Feature Roadmap (Network/Connectivity)

## Categoria: Connectivity / Network Tools

### Tool 1: Network Diagnostics Dashboard
**Prioridade**: Alta

**Features**:
- Real-time ping monitoring a todos os Valve SDR PoPs (fetch de SDR config API)
- Traceroute visual a cada PoP com identificação de hops problemáticos
- Detecção automática de packet loss, jitter, e routing issues
- Comparação side-by-side: rota direta vs rota via VPN
- Histórico de latência por sessão de jogo (gráficos)
- Alerta automático quando condições de rede degradam
- Detecção de buffer bloat (teste integrado)

**Dados**:
- SDR config: `GET https://api.steampowered.com/ISteamApps/GetSDRConfig/v1/?appid=730`
- Pings ICMP/UDP a relay IPs de cada PoP
- Traceroute a relay endpoints

---

### Tool 2: Windows Network Optimizer
**Prioridade**: Alta

**Features**:
- Scan do estado atual de todas as network settings
- One-click optimization (com backup/restore):
  - Network adapter settings (Interrupt Moderation, RSS, Flow Control, etc.)
  - Registry tweaks (Nagle's, NetworkThrottlingIndex, MMCSS)
  - TCP/IP stack tuning (auto-tuning, ECN, DCA)
  - Firewall rules para CS2
  - DSCP/QoS marking
- Perfis: "Gaming" / "Normal" / "Custom"
- Detecção automática de NIC (Intel/Realtek) e aplicar settings otimizados
- Detecção e alerta de software que interfere (antivirus WFP drivers)
- MTU detection e optimization automática
- DNS configuration tool

**Implementação**:
- Registry: via `Microsoft.Win32.Registry` (.NET) ou `winreg` (Python)
- Adapter settings: via WMI ou `netsh` / PowerShell
- Firewall: via `netsh advfirewall` ou Windows Firewall API

---

### Tool 3: Smart VPN (WireGuard Gaming VPN)
**Prioridade**: Alta

**Features**:
- **Profile Management**: Criar/editar/gerir múltiplos perfis VPN (diferentes servers/regiões)
- **Auto-Connect**: Ativar túnel automaticamente quando CS2 inicia, desativar quando fecha
- **Split Tunnel Inteligente**:
  - Fetch automático de Valve SDR config
  - AllowedIPs atualizados dinamicamente com IPs Valve correntes
  - Opção de incluir/excluir tráfego específico
- **Latency Testing**: Ping test a todos os VPN servers configurados antes de conectar
- **Server Recommendation**: Baseado na região de matchmaking selecionada, sugerir melhor VPN server
- **Real-time Stats**: Transfer, handshakes, latência do túnel, uptime
- **One-Click Server Deploy**:
  - Integração com APIs de cloud providers (Vultr, Hetzner, etc.)
  - Provisionar VPS + instalar WireGuard + gerar configs automaticamente
  - Destruir server quando não necessário (billing por hora)
- **WireGuard Config Generator**: Gerar client/server configs com settings otimizados para gaming

**Implementação**:
- WireGuard control: `wireguard.exe /installtunnelservice` + `wg.exe` CLI
- Alternativa avançada: `wireguard-nt` kernel driver para embedding nativo
- Process monitoring: Detectar cs2.exe via Win32 API
- Cloud APIs: Vultr API, Hetzner API para server provisioning

---

### Tool 4: Server Picker / Region Lock
**Prioridade**: Média

**Features**:
- Visualizar todos os Valve DCs com ping atual
- Mapa mundial interativo com PoPs e latências
- Bloquear/desbloquear regiões específicas (via Windows Firewall rules nos IPs dos PoPs)
- Sugestão automática das melhores regiões baseado no ping
- Integração com `mm_dedicated_search_maxping`

**Implementação**:
- Firewall rules: `netsh advfirewall firewall` para bloquear IPs de PoPs indesejados
- Mapa: Integrar coordenadas geográficas do SDR config

---

### Tool 5: Connection Monitor (Live Game Overlay)
**Prioridade**: Média-Baixa

**Features**:
- Overlay durante o jogo mostrando:
  - Ping real (não o do scoreboard, mas medição independente)
  - Packet loss / jitter em tempo real
  - Relay path atual (qual PoP, qual datacenter)
  - VPN tunnel status se ativo
- Log de toda a sessão para análise posterior
- Game State Integration (GSI) para correlacionar eventos de jogo com network quality

**Implementação**:
- CS2 GSI: HTTP POST callbacks para game events
- Overlay: Transparent window com `WS_EX_TOPMOST` + `WS_EX_TRANSPARENT`

---

## Stack Tecnológica Sugerida para a App

### Opção A: C# / .NET + WPF/WinUI (Recomendado)
- **Vantagens**: Nativo Windows, acesso direto a Win32 API, Registry, WMI, Services
- **UI**: WPF (maduro) ou WinUI 3 (moderno)
- **WireGuard**: Via CLI (`wireguard.exe`, `wg.exe`) ou P/Invoke para `wireguard-nt`
- **Network**: System.Net para pings, traceroute
- **Packaging**: MSIX ou installer clássico

### Opção B: Electron + Node.js
- **Vantagens**: UI rica com web tech, cross-platform potencial
- **Desvantagens**: Overhead de memória, acesso a APIs Windows requer native modules
- **WireGuard**: Via child_process para CLI

### Opção C: Tauri + Rust + React/Svelte
- **Vantagens**: Lightweight (~10MB vs ~200MB Electron), performance nativa, segurança
- **UI**: React ou Svelte no webview
- **Backend**: Rust com acesso direto a Windows APIs
- **WireGuard**: Via Rust bindings ou CLI
- **Packaging**: MSI installer

### Opção D: Python + PyQt/PySide
- **Vantagens**: Rápido de desenvolver, muitas libraries disponíveis
- **Desvantagens**: Requer bundling Python runtime, maior tamanho
- **WireGuard**: Via subprocess para CLI
