#!/usr/bin/env python3
"""Download WireGuard Windows binaries for bundling with CS2 Player Tools."""

import os
import sys
import urllib.request
import zipfile
import tempfile
import shutil

WINTUN_URL = "https://www.wintun.net/builds/wintun-0.14.1.zip"
# WireGuard embeddable DLL is not officially distributed standalone.
# We download wintun (MIT) and note that wg.exe/wireguard.exe need to be
# extracted from the official MSI installer.

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))


def download_wintun():
    """Download and extract wintun.dll (MIT licensed)."""
    print(f"Downloading wintun from {WINTUN_URL}...")
    tmp = os.path.join(tempfile.gettempdir(), "wintun.zip")
    urllib.request.urlretrieve(WINTUN_URL, tmp)

    with zipfile.ZipFile(tmp, 'r') as zf:
        # Extract amd64 version
        for name in zf.namelist():
            if name.endswith("amd64/wintun.dll"):
                data = zf.read(name)
                dest = os.path.join(SCRIPT_DIR, "wintun.dll")
                with open(dest, 'wb') as f:
                    f.write(data)
                print(f"  Extracted wintun.dll ({len(data)} bytes)")
                break

    os.remove(tmp)


def check_wireguard_tools():
    """Check if wg.exe and wireguard.exe are present."""
    wg = os.path.join(SCRIPT_DIR, "wg.exe")
    wg_gui = os.path.join(SCRIPT_DIR, "wireguard.exe")

    if os.path.exists(wg) and os.path.exists(wg_gui):
        print(f"  wg.exe: {os.path.getsize(wg)} bytes")
        print(f"  wireguard.exe: {os.path.getsize(wg_gui)} bytes")
        return True

    print()
    print("NOTE: wg.exe and wireguard.exe must be obtained from the official")
    print("WireGuard Windows installer (GPL-2.0 licensed):")
    print()
    print("  1. Download: https://download.wireguard.com/windows-client/")
    print("  2. Extract the MSI:")
    print("     msiexec /a wireguard-amd64-X.X.X.msi /qn TARGETDIR=C:\\wg-extract")
    print("  3. Copy wg.exe and wireguard.exe from the extracted folder to:")
    print(f"     {SCRIPT_DIR}")
    print()
    print("Or if you have WireGuard installed, copy from:")
    print("  C:\\Program Files\\WireGuard\\wg.exe")
    print("  C:\\Program Files\\WireGuard\\wireguard.exe")
    return False


def main():
    print("=== CS2 Player Tools — WireGuard Binary Setup ===")
    print()

    # Download wintun
    wintun_path = os.path.join(SCRIPT_DIR, "wintun.dll")
    if not os.path.exists(wintun_path):
        download_wintun()
    else:
        print(f"  wintun.dll already exists ({os.path.getsize(wintun_path)} bytes)")

    print()

    # Check WireGuard tools
    print("Checking WireGuard tools...")
    has_tools = check_wireguard_tools()

    print()
    if has_tools:
        print("All binaries ready for bundling!")
    else:
        print("wintun.dll is ready. Please add wg.exe and wireguard.exe manually.")
        print("The app will fall back to system-installed WireGuard if bundled binaries are missing.")

    return 0 if has_tools else 1


if __name__ == "__main__":
    sys.exit(main())
