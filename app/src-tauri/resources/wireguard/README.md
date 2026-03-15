# WireGuard Binaries for Bundling

This directory should contain the WireGuard Windows binaries before building:

- `wg.exe` — WireGuard CLI tool (key generation, tunnel management)
- `wireguard.exe` — WireGuard tunnel service manager
- `wintun.dll` — Wintun TUN adapter driver (MIT licensed)

## How to obtain

Run the download script:
```
python3 download-wireguard.py
```

Or manually:
1. Download WireGuard MSI from https://download.wireguard.com/windows-client/
2. Extract with: `msiexec /a wireguard-amd64-X.X.X.msi /qn TARGETDIR=C:\wg-extract`
3. Copy `wg.exe`, `wireguard.exe`, and `wintun.dll` to this directory

## Licensing
- `wg.exe` and `wireguard.exe`: GPL-2.0 (distributed as separate executables, not linked)
- `wintun.dll`: MIT license
