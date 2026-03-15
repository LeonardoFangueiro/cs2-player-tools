# Network Diagnostics & Troubleshooting para CS2

## Comandos de Diagnóstico In-Game

### Network Overlay & Stats

| Comando | Descrição |
|---------|-----------|
| `cq_netgraph 1` | Substituto CS2 do `net_graph`. Stats real-time: ping, loss, choke, FPS, tick rate |
| `cq_netgraph_problem_show_auto 1` | Mostra o netgraph automaticamente SÓ quando problemas são detetados |
| `cl_hud_telemetry_net_misdelivery 1` | Stats de packet misdelivery no HUD |
| `cl_hud_telemetry_net_reordering 1` | Stats de packet reordering |
| `cl_hud_telemetry_ping 1` | Ping no HUD telemetry |
| `cl_hud_telemetry_frametime_show 1` | Gráfico de frame time |
| `cl_hud_telemetry_serverrecvmargin_graph_show 1` | **Gráfico de server receive margin** — métrica mais importante do CS2 |

### Ping & Conexão

| Comando | Descrição |
|---------|-----------|
| `ping` | Ping atual ao servidor conectado |
| `status` | Info completa: server IP/relay, SteamID, ping, tick rate, jogadores |
| `net_connections_stats` | Estatísticas detalhadas incluindo info do relay SDR |
| `net_connections_status` | Status da conexão ativa e routing do relay |

### Debug SDR

| Comando | Descrição |
|---------|-----------|
| `net_client_steamdatagram_enable_override 1` | Forçar SDR on |
| `net_client_steamdatagram_enable_override -1` | Forçar SDR off (direct connect) |
| `steamnetworkingsockets_debug_level 4` | Logging verbose de SDR na consola |
| `net_showdrop 1` | Log de dropped packets na consola |

### Interpretar o cq_netgraph

- **Ping (ms)**: RTT ao game server via SDR. <50ms excelente, 50-80 bom, 80-120 jogável, 120+ problemático
- **Loss (%)**: Pacotes perdidos em trânsito. 1-2% já causa problemas de hitreg. >5% severamente degradado
- **Server Recv Margin**: Quão cedo/tarde os teus pacotes chegam relativamente à janela esperada pelo server. **Valores negativos (vermelho) = dados chegam tarde demais** — o server já processou o tick. Métrica mais crítica do CS2
- **Choke**: Percentagem de updates que o client não conseguiu processar a tempo — indica bottleneck CPU client-side
- **FPS**: Framerate do client (afeta precisão sub-tick do input)

---

## Diagnóstico Externo

### Encontrar IPs dos Servers/Relays Valve

1. **Comando `status`**: Conectar a um match → consola → `status`. Mostra IP do relay SDR
2. **`net_connections_status`**: Mostra o relay a que estás conectado com o IP
3. **SDR config API**: `GET https://api.steampowered.com/ISteamApps/GetSDRConfig/v1/?appid=730`

### Traceroute / PingPlotter / WinMTR

**PingPlotter** (recomendado):
1. Instalar PingPlotter (versão free funciona)
2. Target: IP do relay PoP obtido de `net_connections_status`
3. Correr durante a duração de um match ou mais
4. Procurar:
   - **Latency spikes em hops específicos**: Identifica qual router/segmento ISP causa problemas
   - **Packet loss em hops intermédios**: ICMP deprioritization vs loss real. Só a **loss no último hop** importa definitivamente
   - **Latência alta consistente num hop**: Indica congestionamento ou peering fraco nesse ponto

**WinMTR** (alternativa free e mais simples):
1. Download WinMTR
2. Inserir IP do relay Valve
3. Correr 200+ pacotes
4. Loss que aparece num hop mas NÃO nos subsequentes = ICMP rate-limiting (ignorar). Loss que persiste desde um hop até ao destino = REAL

### Distinguir Problemas de Routing vs Server-Side

**Indicadores de problema de routing**:
- PingPlotter mostra loss/latency começando num hop específico (geralmente peering point do ISP) e continuando até ao destino
- Outros jogadores no mesmo server não experienciam o mesmo
- Problema ocorre consistentemente para regiões Valve específicas mas não outras
- VPN para um ISP exit point diferente resolve o problema

**Indicadores de problema server-side**:
- Múltiplos jogadores reportam os mesmos problemas simultaneamente
- `cq_netgraph` mostra server var spikes (problemas de frame time server-side)
- Problema intermitente sem correlação com o ISP
- Steam status page mostra problemas de infraestrutura

---

## Problemas Comuns de Rede CS2

### Padrões de Jitter / Packet Loss

| Padrão | Causa Provável |
|--------|---------------|
| Loss consistente 1-5% | Congestionamento ISP, má rota, ou cabo/modem defeituoso |
| Spikes periódicos a cada poucos segundos | **Buffer bloat** no router ou equipamento ISP |
| Spikes aleatórios massivos (200ms+) | Interferência Wi-Fi, mudança de routing ISP, downloads em background |
| Loss só em horas de pico (noite) | Congestionamento/over-subscription do ISP |
| Aumento gradual de latência durante sessão | Memory leak no driver de rede, thermal throttling no router |
| Micro-stutters com ping estável | **Packet reordering** (verificar `cl_hud_telemetry_net_reordering`) |

### ISPs Portugueses e Valve

- **MEO (Altice/Portugal Telecom)**: Historicamente com peering issues para certos Tier 1 carriers que afetam rotas para servers Valve EU
- **NOS / Vodafone**: Tráfego para servers EU West (Luxembourg) e EU North (Stockholm) por vezes routing ineficiente
- VPN para datacenter em Madrid ou Frankfurt pode contornar peering issues

### MTU Optimization

CS2 usa UDP. Default MTU = 1500 bytes (Ethernet). MTU subotimal causa fragmentação que aumenta probabilidade de loss.

**Testar MTU ótimo (Windows)**:
```cmd
ping <valve_relay_ip> -f -l 1472
```
Se falhar, reduzir de 10 em 10 até funcionar. MTU ótimo = valor funcional + 28.

**PPPoE (comum em PT)**: MTU deve ser **1492** (1500 - 8 byte PPPoE header). Fonte muito comum de problemas CS2.

**Definir MTU (Windows)**:
```cmd
netsh interface ipv4 set subinterface "Ethernet" mtu=1500 store=persistent
```

### Buffer Bloat

**O maior causador de latency spikes sub-diagnosticado em CS2.**

Testar em:
- `waveform.com/tools/bufferbloat`
- `speed.cloudflare.com` (observar latência sob carga)

Se a latência sobe significativamente durante upload/download → buffer bloat.

**Fix**: Ativar SQM/fq_codel no router. Se o router não suportar, considerar OpenWrt ou dispositivo dedicado. Definir bandwidth limits no SQM a ~85-90% das velocidades reais medidas.

### DNS

CS2 usa DNS para resolver endereços de infraestrutura Steam/matchmaking.

**DNS rápido recomendado**:
- Cloudflare: `1.1.1.1`, `1.0.0.1`
- Google: `8.8.8.8`, `8.8.4.4`

```cmd
ipconfig /flushdns
```

---

## QoS (Quality of Service)

### Router QoS
1. Priorizar tráfego UDP nas portas 27000-27050 como highest priority
2. Configurar SQM (Smart Queue Management) / fq_codel se o router suportar (OpenWrt, pfSense, Ubiquiti)
3. Definir bandwidth limits a 85-90% das velocidades reais

### DSCP Marking (Windows Group Policy)
1. `gpedit.msc` → Computer Configuration → Windows Settings → Policy-based QoS
2. Criar nova policy:
   - Nome: "CS2 Priority"
   - DSCP Value: **46** (Expedited Forwarding — highest priority para real-time traffic)
   - Application: `cs2.exe`
   - Protocol: UDP

**Nota**: DSCP markings só são úteis se o router os respeitar. Routers consumer geralmente strip DSCP. Enterprise/prosumer (pfSense, OpenWrt, Ubiquiti, MikroTik) podem usá-los.
