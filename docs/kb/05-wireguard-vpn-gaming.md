# WireGuard VPN para Otimização de Gaming CS2

## Porquê WireGuard para Gaming

### Comparação de Protocolos VPN

| Aspeto | WireGuard | OpenVPN UDP | OpenVPN TCP | IPSec (IKEv2) |
|--------|-----------|-------------|-------------|---------------|
| Overhead por pacote | **32 bytes** (+28 headers = 60 total IPv4) | 70-100 bytes | 70-100+ bytes | 70-90 bytes |
| Latência adicionada | **~0.5-1.5ms** | ~2-5ms | ~5-15ms+ com jitter | ~1-2ms |
| Codebase | ~4,000 linhas | ~100,000+ linhas | idem | variável |
| Execução | Kernel (Linux) / wintun (Windows) | Userspace (context switches) | idem | Kernel |
| Transporte | **UDP only** | UDP | TCP (TCP-over-TCP meltdown!) | UDP |
| Handshake | **1-RTT** | Multi-RTT TLS | idem | Multi-RTT |
| Jitter | **Muito baixo** (processing time consistente) | Variável | Alto | Baixo |
| Rekeying | A cada 2 min, **zero interruption** | Configurável, com overhead | idem | Variável |

### Criptografia
- **Noise Protocol Framework** (Noise_IKpsk2): Handshake pattern
- **Curve25519**: ECDH key exchange
- **ChaCha20-Poly1305**: Authenticated encryption (AEAD) — extremamente rápido
- **BLAKE2s**: Hashing
- **HKDF**: Key derivation

### Comportamento Idle
- Sem keepalive (a menos que configurado `PersistentKeepalive`)
- Completamente silencioso quando inativo — zero pacotes enviados
- Primeiro pacote após idle = handshake (1-RTT ≈ 1x ping ao server)

---

## O Problema que o VPN Resolve

### Bad ISP Peering
O routing na internet usa BGP que otimiza para **custo e política**, NÃO latência.

**Exemplo**: Jogador em Lisboa → Server Valve em Madrid. O ISP pode rotear:
```
Lisboa → Londres → Frankfurt → Madrid  (adicionando 30-50ms desnecessários)
```

Com VPN estratégico:
```
Lisboa → VPN (Madrid, 5-15ms) → Valve Server Madrid (1-2ms) = ~7-17ms total
```

### Quando VPN Ajuda
- ISP com poor peering com a rede Valve
- Congestionamento num internet exchange específico
- ISP throttle/deprioritize UDP gaming traffic
- Routing geograficamente ineficiente

### Quando VPN NÃO Ajuda
- ISP já tem excelente direct peering
- O VPN server adiciona um hop extra mais longo que o problema que resolve
- O VPN server está numa rede congestionada

---

## Interação VPN com SDR da Valve

### Como VPN Afeta SDR
- Com VPN, a localização aparente muda para a do VPN server
- A seleção de relay SDR é baseada em **latência medida**, não geolocalização
- SDR vai automaticamente selecionar o relay mais próximo do **VPN server**, não da localização física

### Cenários

**Cenário 1: VPN Server Perto do Game Server (Benéfico)**
```
Tu (PT) → VPN (Frankfurt) → SDR Relay (Frankfurt, ~1ms) → Game Server (Luxembourg, ~3ms)
Total: teu_ping_ao_VPN + 4ms
```

**Cenário 2: VPN Server Longe (Prejudicial)**
```
Tu (PT) → VPN (US East) → SDR Relay (US East) → Game Server (Luxembourg)
Total: 80-100ms adicionais desnecessários
```

**Regra**: VPN ajuda SDR se:
1. VPN server está **perto de um Valve SDR PoP** (idealmente mesma cidade/datacenter)
2. O path ISP ao VPN server é **melhor** que ao SDR PoP mais próximo
3. O VPN server tem **boa conectividade** à rede Valve

### VAC e VPN
- **VPN NÃO é banido pelo VAC**. Valve nunca proibiu uso de VPN
- VAC inspeciona memória e processos do jogo, não routing de rede
- Muitos jogadores profissionais e streamers usam VPNs rotineiramente
- Steam Guard pode pedir verificação ao login de IP novo — inconveniente, não risco de ban

---

## Split Tunneling (Routing Apenas Game Traffic)

### AllowedIPs do WireGuard

`AllowedIPs` serve DOIS propósitos:
1. **Routing**: Pacotes para estes IPs vão pelo túnel
2. **ACL Crypto-routing**: Pacotes recebidos do túnel só são aceites se o source IP corresponder

### Configuração para CS2 (Valve AS32590)

```ini
[Peer]
AllowedIPs = 155.133.224.0/19, 162.254.192.0/21, 208.64.200.0/21, 185.25.180.0/22, 192.69.96.0/22, 205.196.6.0/24, 103.10.124.0/23, 103.28.54.0/23, 146.66.152.0/21, 208.78.164.0/22
```

**Dinâmico**: Os IPs de relay SDR mudam. A app deve fazer fetch da SDR config API e atualizar AllowedIPs:
```cmd
wg set gaming peer <pubkey> allowed-ips 155.133.224.0/19,162.254.192.0/21,...
```

### Vantagens Split Tunnel
- Só game traffic vai pelo VPN (menor bandwidth usage)
- Discord, browser, Twitch → conexão direta
- Steam downloads NÃO vão pelo VPN
- Menos carga no VPN server

---

## MTU para WireGuard + Gaming

### Overhead WireGuard
- Header WireGuard: 32 bytes
- Outer UDP header: 8 bytes
- Outer IP header: 20 bytes (IPv4) / 40 bytes (IPv6)
- **Total: 60 bytes (IPv4) ou 80 bytes (IPv6)**

### Configuração Recomendada
```ini
[Interface]
MTU = 1420   # 1500 - 80 (safe universal para IPv4/IPv6)
```

Para gaming: pacotes CS2 são tipicamente **pequenos** (100-500 bytes), bem abaixo de qualquer MTU limit. A preocupação é com voice chat e pacotes maiores ocasionais.

**PPPoE + WireGuard**: MTU deve ser **1412** (1492 - 80)

---

## Implementação WireGuard no Windows

### Componentes
- `wireguard.exe` — GUI + tunnel service manager
- `wg.exe` — CLI tool
- `wintun.dll` — High-performance Layer 3 TUN driver (near-kernel performance)
- Tunnel service: `WireGuardTunnel$<tunnel-name>` (Windows Service)

### Instalação
```cmd
winget install WireGuard.WireGuard
```

### Paths
- Binários: `C:\Program Files\WireGuard\wireguard.exe`, `wg.exe`
- Configs: `C:\Program Files\WireGuard\Data\Configurations\` (encriptados DPAPI)

### Controlo Programático

**Via CLI**:
```cmd
:: Instalar tunnel como Windows service
wireguard.exe /installtunnelservice "C:\path\to\tunnel.conf"

:: Remover tunnel
wireguard.exe /uninstalltunnelservice MyTunnel

:: Gerir via services
sc start WireGuardTunnel$MyTunnel
sc stop WireGuardTunnel$MyTunnel
sc query WireGuardTunnel$MyTunnel
```

**Via `wg.exe`**:
```cmd
wg show MyTunnel                 # Status, peers, transfer
wg show MyTunnel dump            # Machine-readable
wg set MyTunnel peer <key> allowed-ips 10.0.0.0/24  # Modificar live
wg showconf MyTunnel             # Dump running config
wg genkey | wg pubkey            # Gerar key pair
```

**Via Named Pipe (UAPI)**:
```
\\.\pipe\ProtectedPrefix\Administrators\WireGuard\<tunnel-name>
```
Protocolo text-based com comandos `get=1`, `set=1`.

**Via PowerShell**:
```powershell
& "C:\Program Files\WireGuard\wireguard.exe" /installtunnelservice "C:\WireGuard\gaming.conf"
Start-Service -Name "WireGuardTunnel`$gaming"
Get-Service -Name "WireGuardTunnel`$gaming"
Stop-Service -Name "WireGuardTunnel`$gaming"
```

**Via wireguard-nt (Kernel Driver API)**:
- `wireguard-nt` — kernel driver Windows para embedding em aplicações
- C API: `WireGuardCreateAdapter`, `WireGuardSetConfiguration`, etc.
- GitHub: `WireGuard/wireguard-nt`
- Máxima integração para uma gaming VPN tool custom

### Configuração Exemplo Completa

**Server (Linux VPS)**:
```ini
[Interface]
Address = 10.66.66.1/24
ListenPort = 51820
PrivateKey = <server-private-key>
PostUp = iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
PostDown = iptables -t nat -D POSTROUTING -o eth0 -j MASQUERADE

[Peer]
PublicKey = <client-public-key>
AllowedIPs = 10.66.66.2/32
```

**Server Tuning (Low Latency)**:
```bash
echo "net.core.rmem_max = 16777216" >> /etc/sysctl.conf
echo "net.core.wmem_max = 16777216" >> /etc/sysctl.conf
echo "net.ipv4.udp_rmem_min = 8192" >> /etc/sysctl.conf
echo "net.ipv4.udp_wmem_min = 8192" >> /etc/sysctl.conf
echo "net.core.netdev_max_backlog = 5000" >> /etc/sysctl.conf
echo "net.ipv4.ip_forward = 1" >> /etc/sysctl.conf
sysctl -p
```

**Client (Windows) — Split Tunnel para CS2**:
```ini
[Interface]
PrivateKey = <client-private-key>
Address = 10.66.66.2/32
DNS = 1.1.1.1
MTU = 1420

[Peer]
PublicKey = <server-public-key>
Endpoint = <vps-ip>:51820
PersistentKeepalive = 25
AllowedIPs = 155.133.224.0/19, 162.254.192.0/21, 208.64.200.0/21, 185.25.180.0/22, 192.69.96.0/22, 205.196.6.0/24, 103.10.124.0/23, 103.28.54.0/23, 146.66.152.0/21, 208.78.164.0/22
```

---

## VPS Providers para VPN Gaming (Perto de Valve DCs)

### Para Jogadores em Portugal (EU Focus)

| Valve Server | Melhor VPN Location | Provider | Preço | Est. Ping de PT |
|-------------|-------------------|----------|-------|-----------------|
| EU West (Frankfurt/Lux) | Frankfurt, DE | **Hetzner** | €3.79/mês | 25-35ms |
| EU Spain (Madrid) | Madrid, ES | **Vultr** | $6/mês | 5-15ms |
| EU North (Stockholm) | Helsinki/Stockholm | Hetzner/Vultr | €3.79-$6/mês | 50-70ms |
| EU East (Vienna) | Vienna, AT | Vultr | $6/mês | 40-50ms |
| EU Poland (Warsaw) | Warsaw, PL | OVH/Vultr | €3.50-$6/mês | 45-55ms |

### Providers Comparados

| Provider | Localizações Chave | Preço Mínimo | Notas |
|----------|-------------------|-------------|-------|
| **Hetzner** | Frankfurt, Helsinki, Ashburn | **€3.79/mês** | Melhor custo-benefício EU. Excelente rede |
| **Vultr** | 28+ global (Madrid, Frankfurt, Warsaw, Stockholm...) | $6/mês | Muitas locations. Billing por hora. API fácil |
| **OVH** | Gravelines, Strasbourg, Warsaw, London | ~€3.50/mês | Boa rede EU, anti-DDoS incluído |
| **Oracle Cloud** | Frankfurt, London, Amsterdam, Stockholm | **GRÁTIS** (free tier) | 4 OCPU ARM, 24GB RAM — overkill para WireGuard |
| **Scaleway** | Paris, Amsterdam, Warsaw | €1.99/mês | Muito barato, EU focused |
| **DigitalOcean** | NYC, AMS, SGP, LON, FRA | $4/mês | Fiável, bom peering |

### Estratégia Custo-Eficiente
- **Grátis**: Oracle Cloud Free Tier (Frankfurt/Amsterdam)
- **Melhor valor EU**: Hetzner CX22 (€3.79/mês, Frankfurt)
- **Billing por hora**: Vultr/DO — spin up só quando a jogar, custo ~$1/mês
- **Múltiplas locations**: Vultr API para provisionar servidores automaticamente perto do game server detectado

---

## Conceito de Automação para a App CS2

Uma gaming VPN tool integrada pode:
1. **Fetch dinâmico** do Valve SDR network config para obter IPs de relay atuais
2. **Atualizar AllowedIPs** do WireGuard automaticamente com todos os IPs Valve correntes
3. **Testes de latência** a múltiplas opções de VPN server
4. **Ativar/desativar túnel** automaticamente quando CS2 inicia/para
5. **Estatísticas real-time** do túnel (transfer, handshakes, latência)
6. **Profile switching**: Diferentes VPN servers para diferentes regiões de matchmaking
7. **One-click deploy**: Provisionar VPS + configurar WireGuard automaticamente
