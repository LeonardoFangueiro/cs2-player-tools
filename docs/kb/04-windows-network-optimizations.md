# Windows Network Optimizations para CS2

## Network Adapter Settings (Device Manager)

Acesso: Device Manager → Network Adapters → Adapter → Properties → Advanced

### Configurações Universais (Todos os NICs)

| Setting | Recomendação | Razão |
|---------|-------------|-------|
| Interrupt Moderation | **Disable** ou Low/Minimal | Reduz latência. Default "Adaptive" adiciona latência variável |
| Receive Side Scaling (RSS) | **Enable** | Distribui processamento de rede por cores CPU |
| RSS Queues | Match cores CPU (4-8) | Processamento paralelo de pacotes |
| Flow Control | **Disable** | Previne NIC de pausar tráfego |
| Energy Efficient Ethernet | **Disable** | Previne latência de power-saving |
| Green Ethernet / Power Saving | **Disable** | Idem |
| Large Send Offload (LSO/LSOv2) | **Disable** | Pode causar latency spikes |
| TCP/UDP Checksum Offload | Keep Enabled | Offload de trabalho do CPU |
| Jumbo Frames | **Disable** (standard 1514) | Causa problemas com maioria dos paths internet |
| Speed & Duplex | Definir link speed real + Full Duplex | Auto-negotiate pode linkar a velocidade errada |
| Wake-on-LAN | **Disable** | Desnecessário para gaming |

### Intel NICs (I219-V, I225-V, I226-V)
- Interrupt Moderation Rate: **Off** (ou Low)
- Receive Buffers: **2048** (default 256)
- Transmit Buffers: **2048** (default 256)
- Adaptive Inter-Frame Spacing: **Disabled**
- Enable PME: **Disabled**

**Nota I225-V / I226-V**: Estes NICs tinham bugs notórios de firmware/driver causando packet loss e desconexões. Garantir driver mais recente da Intel (NÃO o bundled do fabricante da motherboard). I225-V firmware 1.3+ e driver 1.0.2.x+ resolveram a maioria dos problemas.

### Realtek NICs (RTL8111/8125)
- Interrupt Moderation: **Disabled**
- Flow Control: **Disabled**
- Green Ethernet: **Disabled**
- Power Saving Mode: **Disabled**
- Receive/Transmit Buffers: **Maximizar**
- Large Send Offload v2 (IPv4 + IPv6): **Disabled**

---

## Registry Tweaks

### Disable Nagle's Algorithm (por interface)

```
HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters\Interfaces\{adapter-GUID}
```
- Adicionar DWORD `TcpAckFrequency` = `1`
- Adicionar DWORD `TCPNoDelay` = `1`

Encontrar o adapter GUID: procurar pela sub-key que contém o `IPAddress` ou `DhcpIPAddress` correto.

**Nota**: CS2 usa UDP primariamente, mas Steam signaling e connection setup usam TCP. Desativar Nagle's melhora marginalmente responsividade do Steam overlay e setup de conexão.

### Network Throttling Index

Remove o throttle built-in do Windows de 10 pacotes/ms para tráfego non-multimedia:

```
HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile
```
- DWORD `NetworkThrottlingIndex` = `ffffffff` (hex) — desativa throttling
- DWORD `SystemResponsiveness` = `0` (hex) — aloca máximo de recursos a foreground tasks (games)

### Gaming Priority (MMCSS)

```
HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile\Tasks\Games
```
- `GPU Priority` = `8`
- `Priority` = `6`
- `Scheduling Category` = `High`
- `SFIO Priority` = `High`

### Disable Bandwidth Throttling

```
HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\Services\LanmanWorkstation\Parameters
```
- DWORD `DisableBandwidthThrottling` = `1`

---

## TCP/IP Stack Tuning

```cmd
# Ver settings atuais
netsh interface tcp show global

# Desativar TCP auto-tuning (pode ajudar com routers que gerem mal window scaling)
netsh interface tcp set global autotuninglevel=disabled

# Enable Direct Cache Access (se NIC suportar)
netsh interface tcp set global dca=enabled

# Desativar ECN (alguns routers gerem mal)
netsh interface tcp set global ecncapability=disabled
```

**Trade-off**: Desativar TCP auto-tuning pode corrigir problemas com routers maus mas reduz TCP throughput para downloads grandes. Considerar desativar apenas se experienciar problemas específicos.

---

## Windows Firewall

### Verificar Regras CS2
CS2 deve ter regras automáticas criadas no primeiro launch. Verificar:
- Windows Defender Firewall → Advanced Settings → Inbound Rules
- Procurar regras "cs2.exe" permitindo UDP e TCP para Private e Public networks

### Adicionar Manualmente (se necessário)
```cmd
netsh advfirewall firewall add rule name="CS2 UDP In" dir=in action=allow program="C:\Program Files (x86)\Steam\steamapps\common\Counter-Strike Global Offensive\game\bin\win64\cs2.exe" protocol=UDP
netsh advfirewall firewall add rule name="CS2 TCP In" dir=in action=allow program="C:\Program Files (x86)\Steam\steamapps\common\Counter-Strike Global Offensive\game\bin\win64\cs2.exe" protocol=TCP
```

### WFP (Windows Filtering Platform)
Alguns antivirus instalam WFP callout drivers que inspecionam cada pacote, adicionando latência:
- **Offenders comuns**: Kaspersky, Bitdefender, ESET com módulo firewall
- Adicionar CS2 como exclusão ou desativar temporariamente para testar

### Windows Defender Exclusions
Adicionar pasta do CS2 como exclusão em Windows Security → Virus & Threat Protection → Exclusions.
Ajuda principalmente com disk I/O mas pode melhorar marginalmente performance de rede.

---

## Desativar Features de Rede Desnecessárias

### IPv6 (se não necessário pelo ISP)
```powershell
Disable-NetAdapterBinding -Name "Ethernet" -ComponentID ms_tcpip6
```
**Razão**: CS2 usa IPv4. Desativar IPv6 previne dual-stack overhead e delays de DNS resolution onde queries AAAA IPv6 timeout antes de fallback para IPv4.
**Cuidado**: Alguns ISPs (cada vez mais em 2025-2026) usam IPv6 como protocolo primário — desativar aí quebrará a conectividade. Só desativar se o ISP for puramente IPv4.

### NetBIOS over TCP/IP
- Adapter Properties → IPv4 → Advanced → WINS tab → Disable NetBIOS over TCP/IP
- Reduz broadcast traffic na rede

### Link-Layer Topology Discovery
- Adapter Properties → Desmarcar "Link-Layer Topology Discovery Mapper I/O Driver"
- Adapter Properties → Desmarcar "Link-Layer Topology Discovery Responder"

### QoS Packet Scheduler
- Manter **ENABLED** — necessário para DSCP marking
- O mito de que "reserva 20% de bandwidth" é falso

---

## Wi-Fi (não recomendado para CS2 competitivo)

Se obrigado a usar Wi-Fi:
- Usar banda **5GHz ou 6GHz** (menos congestionamento que 2.4GHz)
- Channel width: **80MHz** em 5GHz
- Desativar Wi-Fi power management:
```cmd
powercfg /setdcvalueindex SCHEME_CURRENT 19cbb8fa-5279-450e-9fac-8a3d5fedd0c1 12bbebe6-58d6-4636-95bb-3217ef867c1a 0
```
- **Usar Ethernet sempre que possível**
