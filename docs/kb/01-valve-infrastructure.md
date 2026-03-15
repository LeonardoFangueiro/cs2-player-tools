# Valve Server Infrastructure & Steam Datagram Relay (SDR)

## Overview

CS2 usa o **Steam Datagram Relay (SDR)** — uma rede de relays proprietária da Valve que encaminha todo o tráfego de jogo entre jogadores e servidores. Os jogadores **nunca se conectam diretamente** aos game servers em matchmaking.

### Objectivos do SDR
- **Proteção DDoS**: IPs dos game servers nunca são expostos aos jogadores
- **Routing otimizado**: Tráfego usa o backbone privado da Valve em vez de depender do peering dos ISPs
- **NAT traversal**: Elimina problemas de port-forwarding
- **Privacidade**: IPs reais dos jogadores ficam ocultos

---

## Arquitetura SDR

### Componentes
1. **Relay PoPs (Points of Presence)**: Nós edge distribuídos globalmente. Lightweight — encaminham pacotes UDP encriptados sem inspecionar conteúdo do jogo
2. **Valve Backbone**: Links de rede privados entre datacenters da Valve
3. **Game Server Datacenter Relays**: Endpoints de relay no mesmo datacenter que os game servers — "exit nodes" que entregam pacotes ao processo do game server

### Fluxo de Dados
```
Player <--UDP--> Relay PoP (mais próximo) <--Valve backbone--> DC Relay <--local--> Game Server
```

### Segurança
- **Encriptação end-to-end**: AES-256-GCM entre client e game server. Relays NÃO conseguem ler dados do jogo
- **Autenticação de relays**: Via certificados no network config, assinados pela CA root da Valve
- **Connection tickets**: Assinados pela chave privada da Valve — não é possível conectar sem ticket válido
- **Key exchange**: Curve25519 ECDH

---

## Valve Datacenter Locations (Live — Março 2026)

Dados obtidos da API oficial: `GET https://api.steampowered.com/ISteamApps/GetSDRConfig/v1/?appid=730`
**Revisão**: 1772831238

### Europa
| Código | Localização | Relays | Portas |
|--------|------------|--------|--------|
| `ams` | Amsterdam, Netherlands | 4 | 27015-27060 |
| `ams4` | Multiplay Amsterdam | 2 | 27015-27076 |
| `fra` | Frankfurt, Germany | 14 | 27015-27060 |
| `fsn` | Falkenstein, Germany | — | — |
| `hel` | Helsinki, Finland | — | — |
| `lhr` | London, England | 4 | 27015-27060 |
| `mad` | Madrid, Spain | 4 | 27015-27060 |
| `par` | Paris, France | 4 | 27015-27060 |
| `sto` | Stockholm - Kista, Sweden | 11 | mixed |
| `sto2` | Stockholm - Bromma, Sweden | 10 | 27015-27060 |
| `vie` | Vienna, Austria | 6 | 27015-27060 |
| `waw` | Warsaw, Poland | 6 | 27015-27060 |

### América do Norte
| Código | Localização | Relays | Portas |
|--------|------------|--------|--------|
| `atl` | Atlanta, Georgia | 4 | 27015-27204 |
| `dfw` | Dallas, Texas | 4 | 27015-27204 |
| `eat` | Wenatchee, Washington | — | — |
| `iad` | Sterling, Virginia | 4 | 27015-27204 |
| `lax` | Los Angeles, California | 4 | 27015-27204 |
| `ord` | Chicago, Illinois | 4 | 27015-27204 |
| `sea` | Seattle, Washington | 2 | 27015-27204 |

### América do Sul
| Código | Localização | Relays | Portas |
|--------|------------|--------|--------|
| `eze` | Buenos Aires, Argentina | 4 | 27015-27060 |
| `gru` | São Paulo, Brazil | 6 | 27015-27060 |
| `lim` | Lima, Peru | 4 | 27015-27060 |
| `scl` | Santiago, Chile | 2 | 27015-27060 |

### Ásia-Pacífico
| Código | Localização | Relays | Portas |
|--------|------------|--------|--------|
| `hkg` | Hong Kong | 10 | 27015-27060 |
| `hkg4` | Multiplay Hong Kong | 6 | 27015-27028 |
| `seo` | Seoul, South Korea | 4 | 27015-27060 |
| `sgp` | Singapore | 6 | 27015-27060 |
| `syd` | Sydney, Australia | 4 | 27015-27204 |
| `tyo` | Tokyo, Japan | 6 | 27015-27060 |

### Médio Oriente, Índia & África
| Código | Localização | Relays | Portas |
|--------|------------|--------|--------|
| `bom2` | Mumbai, India | 2 | 27015-27060 |
| `maa2` | Chennai - Ambattur, India | 2 | 27015-27078 |
| `dxb` | Dubai, UAE | 2 | 27015-27060 |
| `jnb` | Johannesburg, South Africa | 2 | 27015-27060 |

### China
Múltiplos providers (Alibaba Cloud, Perfect World, Tencent) com variantes regionais para diferentes operadoras (China Mobile, Telecom, Unicom).

---

## Fluxo de Conexão: Jogador → Matchmaking → Jogo

### Passo a Passo

1. **Startup do Client**: CS2 carrega o SDR network config via Steam API (`GetSDRConfig`). Contém todos os relay PoPs, IPs, portas e chaves públicas criptográficas.

2. **Medição de Latência**: O client envia probes UDP lightweight a TODOS os relay PoPs e mede RTT. Estes valores são reportados ao sistema de matchmaking. Visível na consola como `SDR ping to [cluster]`.

3. **Queue para Match**: Quando o jogador clica "Find Match", o Game Coordinator (GC) recebe o pedido + ping data a todos os relay clusters.

4. **Match Encontrado**: O GC seleciona um game server num datacenter que minimiza o ping agregado para os 10 jogadores. Cria uma reserva nesse server.

5. **Connection Ticket**: O GC emite a cada jogador um **connection ticket** (blob assinado criptograficamente) que autoriza a conexão ao server específico via SDR. Ligado ao Steam ID + identidade do server.

6. **Estabelecimento do Túnel SDR**:
   - Client seleciona o relay PoP com menor latência medida
   - Envia connection request ao relay com ticket encriptado
   - Relay valida ticket e estabelece túnel ao datacenter do game server via backbone da Valve
   - Relay encaminha tráfego do jogador ao game server

7. **Sessão de Jogo**: Todo o tráfego flui: `Player <--UDP--> Relay PoP <--Valve backbone--> DC Relay <--local--> Game Server`

8. **Relay Failover**: Se um relay PoP ficar unhealthy, o client pode transparentemente mudar para o próximo melhor relay sem desconectar do game server.

### Seleção de Relay

O client escolhe o relay que minimiza:
```
total_latency = client_to_relay_ping + relay_to_server_ping
```

**Multi-path**: SDR pode simultaneamente usar múltiplos caminhos de relay e selecionar o melhor, ou trocar entre eles se um degradar.

### SDR Network Config (Estrutura JSON)

```json
{
  "revision": 1772831238,
  "certs": [...],
  "pops": {
    "<cluster_code>": {
      "desc": "<nome legível>",
      "geo": [<latitude>, <longitude>],
      "relays": [
        {
          "ipv4": "<ip>",
          "port_range": [<start>, <end>]
        }
      ],
      "service_address_range": "<CIDR>"
    }
  }
}
```

### API Endpoint
```
GET https://api.steampowered.com/ISteamApps/GetSDRConfig/v1/?appid=730
```
Este endpoint é público, não requer API key, e retorna toda a topologia da rede de relays com IPs e portas exatas.

---

## Valve IP Ranges Conhecidos (AS32590)

```
155.133.224.0/19
162.254.192.0/21
208.64.200.0/21
185.25.180.0/22
192.69.96.0/22
205.196.6.0/24
103.10.124.0/23
103.28.54.0/23
146.66.152.0/21
208.78.164.0/22
```

**Nota**: Estes ranges mudam. A fonte autoritativa é sempre o SDR config live da API.

---

## Portas de Rede CS2

| Porta | Protocolo | Propósito |
|-------|-----------|-----------|
| 27015 | UDP | Game server default (game traffic) |
| 27015 | TCP | RCON (remote console) |
| 27005 | UDP | Client port (outgoing game traffic) |
| 27015-27060 | UDP | SDR relay range (EU/Ásia) |
| 27015-27204 | UDP | SDR relay range (NA/Oceania) |
| 27020 | UDP | GOTV / SourceTV |
| 3478, 4379, 4380 | UDP | Steam P2P / NAT traversal |
| 443 | TCP | Steam API, auth, HTTPS |

---

## Ferramentas e Bibliotecas Open Source

### Valve Oficial
- **GameNetworkingSockets**: `github.com/ValveSoftware/GameNetworkingSockets` — Biblioteca open-source (BSD) que implementa o protocolo de rede da Valve (reliable/unreliable messaging sobre UDP, encriptação, SDR)

### Comunidade
- **SteamDatabase** (`steamdb.info`): Tracking de apps, servers, updates. Secção "Network" com status dos PoPs
- **steamstat.us**: Monitor de status Steam/CS2 community-built
- **cs2-server-picker**: Tools que bloqueiam IPs de DCs indesejados via firewall rules
- **python-a2s**: Implementação Python do protocolo A2S (server query) da Valve
- **SteamKit2** (`github.com/SteamRE/SteamKit`): Biblioteca .NET para interagir com o protocolo Steam
