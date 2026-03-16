/**
 * VPN Server Deployment — SSH into Ubuntu server, install & configure WireGuard
 */
import { Client } from 'ssh2';

/**
 * Deploy WireGuard on a remote Ubuntu server
 * @param {object} params - { ip, port, username, password }
 * @returns {Promise<object>} - { success, server_public_key, endpoint, log, error }
 */
export async function deployVpnServer({ ip, port = 22, username = 'root', password }) {
  const log = [];
  const push = (msg) => { log.push(`[${new Date().toISOString().slice(11,19)}] ${msg}`); console.log(`[VPN Deploy ${ip}] ${msg}`); };

  return new Promise((resolve) => {
    const conn = new Client();
    const timeout = setTimeout(() => {
      conn.end();
      resolve({ success: false, log, error: 'Connection timeout (60s)' });
    }, 60000);

    conn.on('error', (err) => {
      clearTimeout(timeout);
      push(`ERROR: ${err.message}`);
      resolve({ success: false, log, error: err.message });
    });

    conn.on('ready', async () => {
      push('SSH connected');

      try {
        // 1. Check OS
        const os = await exec(conn, 'cat /etc/os-release | grep PRETTY_NAME | cut -d= -f2 | tr -d \'"\'');
        push(`OS: ${os.trim()}`);

        // 2. Check if WireGuard already installed
        const wgCheck = await exec(conn, 'which wg 2>/dev/null || echo NOT_FOUND');
        const needsInstall = wgCheck.trim() === 'NOT_FOUND';

        if (needsInstall) {
          push('Installing WireGuard...');
          await exec(conn, 'DEBIAN_FRONTEND=noninteractive apt-get update -qq');
          await exec(conn, 'DEBIAN_FRONTEND=noninteractive apt-get install -y -qq wireguard');
          push('WireGuard installed');
        } else {
          push('WireGuard already installed');
        }

        // 3. Enable IP forwarding
        push('Enabling IP forwarding...');
        await exec(conn, 'sysctl -w net.ipv4.ip_forward=1');
        await exec(conn, 'grep -q "net.ipv4.ip_forward=1" /etc/sysctl.conf || echo "net.ipv4.ip_forward=1" >> /etc/sysctl.conf');

        // 4. Generate server keypair
        push('Generating server keypair...');
        const keypairOutput = await exec(conn, 'privkey=$(wg genkey) && echo $privkey && echo $privkey | wg pubkey');
        const lines = keypairOutput.trim().split('\n');
        if (lines.length < 2) throw new Error('Failed to generate keypair');
        const serverPrivkey = lines[0].trim();
        const serverPubkey = lines[1].trim();
        push(`Server public key: ${serverPubkey.slice(0, 12)}...`);

        // 5. Detect main interface
        const iface = (await exec(conn, "ip route show default | awk '{print $5}' | head -1")).trim() || 'eth0';
        push(`Network interface: ${iface}`);

        // 6. Create WireGuard config
        push('Writing WireGuard config...');
        const wgConf = `[Interface]
Address = 10.66.66.1/24
ListenPort = 51820
PrivateKey = ${serverPrivkey}
PostUp = iptables -t nat -A POSTROUTING -o ${iface} -j MASQUERADE
PostDown = iptables -t nat -D POSTROUTING -o ${iface} -j MASQUERADE
`;
        await exec(conn, `cat > /etc/wireguard/wg0.conf << 'WGEOF'\n${wgConf}\nWGEOF`);
        await exec(conn, 'chmod 600 /etc/wireguard/wg0.conf');

        // 7. Network optimizations
        push('Applying network optimizations...');
        const sysctls = [
          'net.core.rmem_max=16777216',
          'net.core.wmem_max=16777216',
          'net.ipv4.udp_rmem_min=8192',
          'net.ipv4.udp_wmem_min=8192',
          'net.core.netdev_max_backlog=5000',
        ];
        for (const s of sysctls) {
          await exec(conn, `sysctl -w ${s} 2>/dev/null`).catch(() => {});
        }

        // 8. Firewall
        push('Configuring firewall...');
        await exec(conn, 'which ufw >/dev/null 2>&1 && ufw allow 51820/udp || true');

        // 9. Start WireGuard
        push('Starting WireGuard...');
        await exec(conn, 'wg-quick down wg0 2>/dev/null || true');
        await exec(conn, 'wg-quick up wg0');
        await exec(conn, 'systemctl enable wg-quick@wg0 2>/dev/null || true');

        // 10. Verify
        const status = await exec(conn, 'wg show wg0 2>&1');
        if (status.includes('interface: wg0')) {
          push('WireGuard is RUNNING');
        } else {
          push(`WireGuard status: ${status.trim()}`);
        }

        // 11. Install monitoring script
        push('Installing monitoring script...');
        const monitorScript = `#!/bin/bash
# CS2 Player Tools — VPN Server Monitor
echo '{"status":"online","interface":"wg0"'
echo ',"peers":'$(wg show wg0 peers 2>/dev/null | wc -l)
echo ',"transfer_rx":'$(cat /sys/class/net/wg0/statistics/rx_bytes 2>/dev/null || echo 0)
echo ',"transfer_tx":'$(cat /sys/class/net/wg0/statistics/tx_bytes 2>/dev/null || echo 0)
echo ',"uptime":"'$(uptime -p 2>/dev/null || echo unknown)'"'
echo ',"load":"'$(cat /proc/loadavg 2>/dev/null | awk '{print $1}')'"'
echo '}'
`;
        await exec(conn, `cat > /opt/cs2pt-monitor.sh << 'MONEOF'\n${monitorScript}\nMONEOF`);
        await exec(conn, 'chmod +x /opt/cs2pt-monitor.sh');

        push('Deployment complete!');
        clearTimeout(timeout);
        conn.end();

        resolve({
          success: true,
          server_public_key: serverPubkey,
          endpoint: `${ip}:51820`,
          log,
        });
      } catch (err) {
        clearTimeout(timeout);
        push(`ERROR: ${err.message}`);
        conn.end();
        resolve({ success: false, log, error: err.message });
      }
    });

    push(`Connecting to ${username}@${ip}:${port}...`);
    conn.connect({ host: ip, port, username, password, readyTimeout: 30000 });
  });
}

/**
 * Check VPN server status via SSH
 */
export async function checkServerStatus({ ip, port = 22, username = 'root', password }) {
  return new Promise((resolve) => {
    const conn = new Client();
    const timeout = setTimeout(() => {
      conn.end();
      resolve({ online: false, error: 'timeout' });
    }, 10000);

    conn.on('error', () => {
      clearTimeout(timeout);
      resolve({ online: false, error: 'connection_failed' });
    });

    conn.on('ready', async () => {
      try {
        const result = await exec(conn, 'bash /opt/cs2pt-monitor.sh 2>/dev/null || echo \'{"status":"unknown"}\'');
        clearTimeout(timeout);
        conn.end();
        try {
          // The script outputs JSON in multiple echo lines, join them
          const json = JSON.parse(result.replace(/\n/g, ''));
          resolve({ online: true, ...json });
        } catch {
          resolve({ online: true, status: 'unknown', raw: result.trim() });
        }
      } catch {
        clearTimeout(timeout);
        conn.end();
        resolve({ online: false, error: 'exec_failed' });
      }
    });

    conn.connect({ host: ip, port, username, password, readyTimeout: 8000 });
  });
}

/**
 * Add a WireGuard peer (client) to the server
 */
export async function addPeer({ ip, port = 22, username = 'root', password, clientPublicKey, clientIp }) {
  return new Promise((resolve) => {
    const conn = new Client();
    const timeout = setTimeout(() => { conn.end(); resolve({ success: false, error: 'timeout' }); }, 15000);

    conn.on('error', (err) => { clearTimeout(timeout); resolve({ success: false, error: err.message }); });
    conn.on('ready', async () => {
      try {
        // Add peer to wg0
        await exec(conn, `wg set wg0 peer ${clientPublicKey} allowed-ips ${clientIp}/32`);
        // Also add to config file for persistence
        const peerConf = `\n[Peer]\nPublicKey = ${clientPublicKey}\nAllowedIPs = ${clientIp}/32\n`;
        await exec(conn, `echo '${peerConf}' >> /etc/wireguard/wg0.conf`);
        clearTimeout(timeout);
        conn.end();
        resolve({ success: true });
      } catch (err) {
        clearTimeout(timeout);
        conn.end();
        resolve({ success: false, error: err.message });
      }
    });

    conn.connect({ host: ip, port, username, password, readyTimeout: 8000 });
  });
}

/**
 * Detect server location from IP using free GeoIP API
 */
export async function detectLocation(ip) {
  try {
    const resp = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,countryCode,city,lat,lon`);
    const data = await resp.json();
    if (data.status === 'success') {
      // Country code to flag emoji
      const flag = countryCodeToFlag(data.countryCode);
      return {
        country: data.country,
        countryCode: data.countryCode,
        city: data.city,
        location: `${data.city}, ${data.country}`,
        lat: data.lat,
        lng: data.lon,
        flag,
      };
    }
    return null;
  } catch {
    return null;
  }
}

function countryCodeToFlag(code) {
  if (!code || code.length !== 2) return '🌐';
  const offset = 127397;
  return String.fromCodePoint(...[...code.toUpperCase()].map(c => c.charCodeAt(0) + offset));
}

// SSH exec helper
function exec(conn, cmd) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let stdout = '', stderr = '';
      stream.on('data', (d) => { stdout += d; });
      stream.stderr.on('data', (d) => { stderr += d; });
      stream.on('close', (code) => {
        if (code !== 0 && !stdout.trim()) {
          reject(new Error(stderr.trim() || `Exit code ${code}`));
        } else {
          resolve(stdout);
        }
      });
    });
  });
}
