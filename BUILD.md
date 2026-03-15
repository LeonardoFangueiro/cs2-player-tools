# Building CS2 Player Tools

## Prerequisites

### Windows (primary target)
- [Rust](https://rustup.rs/) (stable toolchain)
- [Node.js](https://nodejs.org/) v22+
- [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with the **C++ desktop workload**

### Linux / macOS (frontend development only)
- [Rust](https://rustup.rs/) (stable toolchain)
- [Node.js](https://nodejs.org/) v22+
- Platform-specific system dependencies for Tauri v2 — see [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)

## Quick Start (Dev Mode)

```bash
cd app
npm install
npm run tauri dev
```

This starts the Vite dev server on `http://localhost:1420` with HMR and launches the Tauri window.

To run only the frontend (no Rust backend):

```bash
cd app
npm run dev
```

## Production Build

```bash
cd app
npm install
npm run tauri build
```

### Build Output

| Artifact | Path |
|----------|------|
| MSI installer | `app/src-tauri/target/release/bundle/msi/CS2 Player Tools_0.1.0_x64_en-US.msi` |
| NSIS installer | `app/src-tauri/target/release/bundle/nsis/CS2 Player Tools_0.1.0_x64-setup.exe` |

### Frontend-Only Build

To build only the Vite frontend (no Tauri wrapper):

```bash
cd app
npx vite build
```

Output goes to `app/dist/`. The build uses manual chunks to keep bundle sizes manageable:
- **vendor** — React, React DOM, React Router
- **charts** — Recharts
- **icons** — Lucide React

## WireGuard Binary Setup

The Smart VPN feature requires the WireGuard tunnel binary bundled with the app.

1. Download the [WireGuard Windows installer](https://www.wireguard.com/install/) or extract the standalone tools.
2. Place `wireguard.exe` and `wg.exe` into:
   ```
   app/src-tauri/resources/wireguard/
   ```
3. These files are bundled automatically during `tauri build` (configured in `tauri.conf.json` under `bundle.resources`).

> **Note:** The `resources/wireguard/` directory is not committed to the repo. You must provide the binaries locally.

## GitHub Actions

Push a tag matching `v*` to trigger the automated Windows build, or use **Run workflow** in the Actions tab.

## Features

### Dashboard
- Real-time system and network status overview
- Quick-access cards for all tools

### Network Diagnostics
- Ping and latency tests to Valve SDR relays
- Advanced diagnostics (traceroute, jitter, packet loss)
- Real-time latency charts (Recharts)
- Valve SDR relay configuration parsing (`ISteamApps/GetSDRConfig/v1`)

### Windows Network Optimizer
- One-click TCP/IP and network adapter tuning
- Nagle's algorithm toggle
- Network throttling index adjustments
- Registry-based optimizations with backup/restore

### Smart VPN (WireGuard)
- WireGuard tunnel management from the GUI
- Auto-connect and on-boot VPN start (autostart plugin)
- Per-game routing — only CS2 traffic through the tunnel
- Deploy and manage VPN configurations

### Server Picker
- Browse Valve datacenter regions and relay endpoints
- Region-block unwanted server regions
- Latency comparison across regions

### Settings
- Persistent settings via Tauri Store plugin
- Autostart configuration
- Theme and preference management

## Architecture

```
cs2-player-tools/
├── app/                          # Tauri v2 application
│   ├── src/                      # React frontend (TypeScript)
│   │   ├── pages/                # Page components (Dashboard, NetworkDiag, etc.)
│   │   ├── components/           # Shared UI components (Layout, etc.)
│   │   └── lib/                  # Utility modules
│   ├── src-tauri/                # Rust backend
│   │   ├── src/
│   │   │   ├── main.rs           # Entry point
│   │   │   ├── lib.rs            # Tauri command registration
│   │   │   └── network/          # Network modules
│   │   │       ├── mod.rs
│   │   │       ├── ping.rs       # ICMP ping
│   │   │       ├── sdr.rs        # Valve SDR relay config
│   │   │       ├── diagnostics.rs
│   │   │       ├── advanced_diag.rs
│   │   │       ├── optimizer.rs  # Windows network tuning
│   │   │       ├── vpn.rs        # WireGuard management
│   │   │       ├── deploy.rs     # VPN deployment
│   │   │       ├── region_block.rs
│   │   │       ├── cs2_config.rs
│   │   │       ├── settings.rs
│   │   │       └── process.rs
│   │   └── resources/wireguard/  # WireGuard binaries (not committed)
│   ├── public/                   # Static assets (favicon, icons)
│   ├── vite.config.ts            # Vite config with code-splitting
│   └── index.html                # SPA entry point
├── docs/
│   └── kb/                       # Knowledge base
│       ├── knowledge-base.html   # Rendered HTML version
│       ├── 01-valve-infrastructure.md
│       ├── 02-cs2-network-protocol.md
│       ├── 03-network-diagnostics.md
│       ├── 04-windows-network-optimizations.md
│       ├── 05-wireguard-vpn-gaming.md
│       └── 06-app-feature-roadmap.md
└── BUILD.md                      # This file
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop shell | Tauri v2 |
| Backend | Rust |
| Frontend | React 19 + TypeScript |
| Styling | Tailwind CSS v4 |
| Charts | Recharts |
| Icons | Lucide React |
| Routing | React Router v7 |
| Build tool | Vite |
| VPN | WireGuard (sideloaded binary) |
