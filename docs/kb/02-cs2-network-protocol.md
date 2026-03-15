# CS2 Network Protocol & Sub-tick System

## Protocolo de Transporte

- **Protocolo**: UDP exclusivamente para game traffic. TCP não é usado para gameplay real-time
- **Encapsulação**: Game packets encapsulados dentro do protocolo SteamNetworkingSockets, que providencia a sua própria camada de reliability, encriptação (AES-256-GCM) e sequencing sobre raw UDP
- **Encriptação**: Todo o tráfego SDR é end-to-end encriptado entre client e game server

---

## Sistema Sub-tick

### Background
- **CS:GO**: Matchmaking corria a 64 tick (64 updates/segundo, ~15.625ms/tick). Servidores community/FACEIT usavam 128 tick
- **CS2**: Introduziu o sistema "sub-tick" — o servidor continua a 64 ticks/segundo mas os inputs têm precisão sub-tick

### Como Funciona

1. **Client amostra inputs a alta frequência** (ligado ao framerate, geralmente 200-500+ Hz)
2. Cada input (mouse, disparo, movimento) é **timestamped com precisão sub-tick**
3. O client envia um **user command (usercmd)** ao servidor que inclui:
   - Número do tick
   - **Fração sub-tick** (0.0 a 1.0) indicando quando dentro do tick a ação aconteceu
4. O servidor processa estes comandos, usando o timestamp sub-tick para **interpolar posições** para hit detection
5. Para disparos: o servidor **rewind** o game state ao momento exato sub-tick em que o disparo foi feito, avalia o hit, e produz o resultado

### Impacto na Rede
- A rate de envio base continua ligada ao intervalo de 64-tick
- Clients enviam usercmds a 64Hz e recebem snapshots a 64Hz
- Os dados sub-tick são **metadata dentro desses pacotes**
- Jogadores com framerates mais altos obtêm timestamps de input mais precisos
- A precisão de input efetiva está agora ligada ao framerate do client em vez do tickrate do server

---

## Parâmetros de Rede (ConVars)

### Configuráveis pelo Jogador

| ConVar | Default | Descrição |
|--------|---------|-----------|
| `rate` | `786432` | Máximo bytes/segundo que o servidor envia ao client (~6.1 Mbps). Manter no máximo |
| `cl_interp_ratio` | `1` | Ratio de interpolação. 1 = menos delay (conexões estáveis), 2 = mais seguro (conexões com loss) |
| `cl_interp` | `0` (auto) | Período de interpolação em segundos. 0 = auto-calculado: `cl_interp_ratio / tickrate` |
| `mm_dedicated_search_maxping` | `70` | Ping máximo aceitável para matchmaking (até 350) |
| `net_client_steamdatagram_enable_override` | `1` | Forçar SDR: 1=on, -1=off, 0=default |

### Bloqueados em CS2 (não ajustáveis)

| ConVar | Valor Fixo | Notas |
|--------|-----------|-------|
| `cl_updaterate` | `64` | Snapshots/segundo recebidos do server (locked ao tickrate) |
| `cl_cmdrate` | `64` | User commands/segundo enviados ao server (locked ao tickrate) |
| `net_maxroutable` | `1200` | Tamanho máximo de pacote em bytes |

---

## Bandwidth Típico

- **Downstream** (server → client): ~80-120 KB/s (640-960 kbps) durante gameplay activo
- **Upstream** (client → server): ~20-40 KB/s (160-320 kbps) — principalmente usercmd data
- **Snapshots**: Delta-compressed — apenas mudanças desde o último estado acknowledged. Full snapshots só na conexão ou após mudanças significativas

---

## Handling de Packet Loss

### Reliability Selectiva
- SteamNetworkingSockets implementa a sua própria camada de **reliability selectiva**
- Dados críticos (criação de entidades, state changes importantes) → enviados **reliably** com retransmissão
- Dados transientes (position updates) → enviados **unreliably** — se perdidos, o próximo update substitui

### Interpolação
- O client usa **interpolação** para suavizar snapshots em falta
- Com `cl_interp_ratio 2`, o client faz buffer de um tick extra de dados
- Providencia resiliência contra single-packet drops

### Sequence Numbers
- O server marca pacotes com sequence numbers
- O client reporta sequences recebidas de volta ao server
- Permite ao server detetar e compensar packet loss

---

## Handling de Jitter

- O client mantém um **jitter buffer** (buffer de interpolação)
- Pacotes que chegam ligeiramente atrasados ainda podem ser usados se chegarem dentro da janela de interpolação
- SDR relays ajudam a reduzir jitter fornecendo routing mais consistente que paths da internet pública
- `cl_interp_ratio 2` efetivamente duplica o jitter buffer

---

## Lag Compensation (Compensação de Latência)

CS2 usa **server-side lag compensation** (backward reconciliation / rewinding):

### Processo
1. Quando um jogador dispara, o client regista o **tempo exato** (com precisão sub-tick) e a **view do mundo** client-side
2. O server recebe o shot command e **rewind** o game state ao momento exato do disparo, contabilizando a latência de rede do jogador
3. O server avalia o disparo contra as **posições rewound** de todos os jogadores
4. Se acertou no estado rewound → hit registado

### Implicações
- O que o jogador que dispara vê no ecrã é (maioritariamente) o que conta
- Trade-off: um jogador alvo pode ser atingido mesmo que no ecrã dele já se tenha movido para trás de cobertura
- **"Peeker's advantage"** / "dying behind walls" — fenómeno clássico deste sistema
- **Janela máxima**: ~200ms. Para além disto, disparos não são rewound

### Impacto Sub-tick no Lag Compensation
- O rewind é mais preciso — em vez de rewinding ao tick boundary mais próximo, o server rewind ao **momento sub-tick exato**
- Reduz o erro de quantização de até 15.6ms para efetivamente zero

---

## Diferenças CS:GO vs CS2 (Rede)

| Aspeto | CS:GO | CS2 |
|--------|-------|-----|
| Tickrate | 64 (MM) / 128 (3rd party) | 64 com sub-tick |
| Precisão input | Snap ao tick boundary | Fração sub-tick dentro do tick |
| Network library | Steam networking antigo | SteamNetworkingSockets |
| SDR | Introduzido mid-lifecycle | Mandatório para todos os servers oficiais |
| Encriptação | Opcional/parcial | Full end-to-end |
| `cl_updaterate` | Ajustável | Locked |
| `cl_cmdrate` | Ajustável | Locked |
| Protocolo | Source engine netcode | Source 2 engine netcode |
