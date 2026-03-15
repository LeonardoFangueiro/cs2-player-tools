# CS2 Player Tools — Knowledge Base

Base de conhecimento compilada para o desenvolvimento da aplicação CS2 Player Tools.

## Documentos

| # | Ficheiro | Conteúdo |
|---|---------|----------|
| 01 | [valve-infrastructure.md](01-valve-infrastructure.md) | Infraestrutura Valve, SDR (Steam Datagram Relay), datacenters, fluxo de conexão, IPs, portas, ferramentas open source |
| 02 | [cs2-network-protocol.md](02-cs2-network-protocol.md) | Protocolo de rede CS2, sistema sub-tick, ConVars, bandwidth, packet loss/jitter handling, lag compensation |
| 03 | [network-diagnostics.md](03-network-diagnostics.md) | Comandos de diagnóstico in-game, ferramentas externas (PingPlotter, WinMTR), problemas comuns, QoS, buffer bloat |
| 04 | [windows-network-optimizations.md](04-windows-network-optimizations.md) | Otimizações Windows: adapter settings, registry tweaks, TCP/IP tuning, firewall, DSCP, features desnecessárias |
| 05 | [wireguard-vpn-gaming.md](05-wireguard-vpn-gaming.md) | WireGuard para gaming: protocolo, split tunneling, interação com SDR, implementação Windows, VPS providers |
| 06 | [app-feature-roadmap.md](06-app-feature-roadmap.md) | Roadmap de features da app, tools planeadas, stack tecnológica sugerida |

## Fontes de Dados Live

- **SDR Config API**: `GET https://api.steampowered.com/ISteamApps/GetSDRConfig/v1/?appid=730`
- **Server Query (A2S)**: UDP protocol a qualquer server IP na porta 27015
- **Steam Status**: `steamstat.us`

## Última Atualização
2026-03-15 — SDR config revision 1772831238
