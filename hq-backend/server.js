import express from 'express';
import cors from 'cors';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'fs';
import { join, dirname, extname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { deployVpnServer, checkServerStatus, addPeer, removePeer, listPeers, detectLocation, allocateClientIp, getValveAllowedIps, uninstallVpnServer } from './vpn-deploy.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 3300;
const PROJECT_ROOT = join(__dirname, '..');
const RELEASES_DIR = join(PROJECT_ROOT, 'releases');

// Data storage
const DATA_DIR = join(__dirname, 'data');
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
if (!existsSync(RELEASES_DIR)) mkdirSync(RELEASES_DIR, { recursive: true });

app.use(cors());
app.use(express.json({ limit: '5mb' }));

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    if (!req.path.includes('/health')) {
      console.log(`${req.method} ${req.path} ${res.statusCode} ${ms}ms [${req.ip}]`);
    }
  });
  next();
});

// ── Helpers ──

function loadJson(filename) {
  const path = join(DATA_DIR, filename);
  if (!existsSync(path)) return [];
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return []; }
}

function saveJson(filename, data) {
  writeFileSync(join(DATA_DIR, filename), JSON.stringify(data, null, 2));
}

function ts() { return new Date().toISOString(); }

function randomHex(bytes) {
  return [...Array(bytes)].map(() => Math.floor(Math.random() * 256).toString(16).padStart(2, '0')).join('');
}

function getAppVersion() {
  try {
    const conf = JSON.parse(readFileSync(join(PROJECT_ROOT, 'app/src-tauri/tauri.conf.json'), 'utf8'));
    return conf.version || '0.1.0';
  } catch { return '0.1.0'; }
}

function getGitInfo() {
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: PROJECT_ROOT }).toString().trim();
    const sha = execSync('git rev-parse --short HEAD', { cwd: PROJECT_ROOT }).toString().trim();
    const msg = execSync('git log -1 --format=%s', { cwd: PROJECT_ROOT }).toString().trim();
    const count = execSync('git rev-list --count HEAD', { cwd: PROJECT_ROOT }).toString().trim();
    return { branch, sha, message: msg, commits: parseInt(count) };
  } catch { return null; }
}

function getProjectStats() {
  try {
    const tsFiles = execSync('find app/src -name "*.tsx" -o -name "*.ts" | wc -l', { cwd: PROJECT_ROOT }).toString().trim();
    const rsFiles = execSync('find app/src-tauri/src -name "*.rs" | wc -l', { cwd: PROJECT_ROOT }).toString().trim();
    const commands = execSync('grep -c "tauri::command" app/src-tauri/src/lib.rs', { cwd: PROJECT_ROOT }).toString().trim();
    return { ts_files: parseInt(tsFiles), rs_files: parseInt(rsFiles), tauri_commands: parseInt(commands) };
  } catch { return null; }
}

// ══════════════════════════════════════════
// ── HEALTH & INFO
// ══════════════════════════════════════════

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: getAppVersion(), uptime_s: Math.round(process.uptime()), timestamp: ts() });
});

app.get('/api/info', (req, res) => {
  res.json({
    app_version: getAppVersion(),
    git: getGitInfo(),
    project: getProjectStats(),
    server: {
      node: process.version,
      platform: process.platform,
      uptime_s: Math.round(process.uptime()),
      memory_mb: Math.round(process.memoryUsage().rss / 1024 / 1024),
    },
    hq_url: 'https://cs2-player-tools.maltinha.club/hq/',
    app_url: 'https://cs2-player-tools.maltinha.club/',
    api_url: 'https://cs2-player-tools.maltinha.club/api/',
  });
});

// ══════════════════════════════════════════
// ── VERSION & RELEASES
// ══════════════════════════════════════════

app.get('/api/version', (req, res) => {
  const releases = loadJson('releases.json');
  const latest = releases[0] || null;
  const clientVersion = req.query.current;
  const updateAvailable = clientVersion && latest ? clientVersion !== latest.version : false;
  res.json({
    latest_version: latest?.version || getAppVersion(),
    download_url: latest?.download_url || null,
    download_url_msi: latest?.download_url_msi || null,
    release_date: latest?.date || null,
    changelog: latest?.changelog || 'Initial release',
    update_available: updateAvailable,
  });
});

app.get('/api/releases', (req, res) => {
  res.json(loadJson('releases.json'));
});

app.post('/api/releases', (req, res) => {
  const { version, download_url, download_url_msi, changelog, api_key } = req.body;
  if (api_key !== process.env.HQ_API_KEY && api_key !== 'cs2pt-dev-key') {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  if (!version) return res.status(400).json({ error: 'Version required' });
  const releases = loadJson('releases.json');
  releases.unshift({ version, download_url, download_url_msi, changelog, date: ts() });
  if (releases.length > 50) releases.length = 50;
  saveJson('releases.json', releases);
  res.json({ success: true, message: `Release ${version} registered` });
});

// ══════════════════════════════════════════
// ── DOWNLOADS
// ══════════════════════════════════════════

app.get('/api/downloads', (req, res) => {
  try {
    const files = readdirSync(RELEASES_DIR)
      .filter(f => ['.exe', '.msi'].includes(extname(f).toLowerCase()))
      .map(f => {
        const stat = statSync(join(RELEASES_DIR, f));
        return {
          name: f,
          size_bytes: stat.size,
          size_mb: (stat.size / 1024 / 1024).toFixed(1),
          modified: stat.mtime.toISOString(),
          url: `https://cs2-player-tools.maltinha.club/downloads/${encodeURIComponent(f)}`,
        };
      })
      .sort((a, b) => new Date(b.modified) - new Date(a.modified));
    res.json({ files, total: files.length });
  } catch {
    res.json({ files: [], total: 0 });
  }
});

// ══════════════════════════════════════════
// ── ERROR REPORTING
// ══════════════════════════════════════════

app.post('/api/errors', (req, res) => {
  const { app_version, os, error_type, error_message, stack_trace, context, timestamp: clientTs } = req.body;
  const errors = loadJson('errors.json');
  const error = {
    id: `err_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    app_version: app_version || 'unknown',
    os: os || 'unknown',
    error_type: error_type || 'unknown',
    error_message: (error_message || '').slice(0, 2000),
    stack_trace: (stack_trace || '').slice(0, 5000),
    context: context || {},
    timestamp: clientTs || ts(),
    received_at: ts(),
    ip: req.ip,
    resolved: false,
  };
  errors.push(error);
  if (errors.length > 1000) errors.splice(0, errors.length - 1000);
  saveJson('errors.json', errors);
  res.json({ success: true, id: error.id });
});

app.get('/api/errors', (req, res) => {
  const errors = loadJson('errors.json');
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const type = req.query.type;
  const unresolved = req.query.unresolved === 'true';

  let filtered = errors;
  if (type) filtered = filtered.filter(e => e.error_type === type);
  if (unresolved) filtered = filtered.filter(e => !e.resolved);

  // Group by error_type for summary
  const byType = {};
  errors.forEach(e => { byType[e.error_type] = (byType[e.error_type] || 0) + 1; });

  res.json({
    total: errors.length,
    filtered: filtered.length,
    by_type: byType,
    errors: filtered.slice(-limit).reverse(),
  });
});

app.patch('/api/errors/:id', (req, res) => {
  const errors = loadJson('errors.json');
  const idx = errors.findIndex(e => e.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  errors[idx] = { ...errors[idx], ...req.body, updated_at: ts() };
  saveJson('errors.json', errors);
  res.json({ success: true });
});

app.delete('/api/errors', (req, res) => {
  saveJson('errors.json', []);
  res.json({ success: true, message: 'All errors cleared' });
});

app.delete('/api/errors/:id', (req, res) => {
  const errors = loadJson('errors.json');
  const filtered = errors.filter(e => e.id !== req.params.id);
  saveJson('errors.json', filtered);
  res.json({ success: true });
});

// ══════════════════════════════════════════
// ── DIAGNOSTICS
// ══════════════════════════════════════════

app.post('/api/diagnostics', (req, res) => {
  const report = {
    id: `diag_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    ...req.body,
    received_at: ts(),
    ip: req.ip,
  };
  const diags = loadJson('diagnostics.json');
  diags.push(report);
  if (diags.length > 200) diags.splice(0, diags.length - 200);
  saveJson('diagnostics.json', diags);
  res.json({ success: true, id: report.id });
});

app.get('/api/diagnostics', (req, res) => {
  const diags = loadJson('diagnostics.json');
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  res.json({ total: diags.length, diagnostics: diags.slice(-limit).reverse() });
});

app.get('/api/diagnostics/:id', (req, res) => {
  const diags = loadJson('diagnostics.json');
  const d = diags.find(d => d.id === req.params.id);
  if (!d) return res.status(404).json({ error: 'Not found' });
  res.json(d);
});

app.delete('/api/diagnostics', (req, res) => {
  saveJson('diagnostics.json', []);
  res.json({ success: true });
});

// ══════════════════════════════════════════
// ── TELEMETRY
// ══════════════════════════════════════════

app.post('/api/telemetry', (req, res) => {
  const { app_version, os, event, data } = req.body;
  const telemetry = loadJson('telemetry.json');
  telemetry.push({
    id: `tel_${Date.now()}`,
    app_version, os, event,
    data: data || {},
    timestamp: ts(),
    ip: req.ip,
  });
  if (telemetry.length > 5000) telemetry.splice(0, telemetry.length - 5000);
  saveJson('telemetry.json', telemetry);
  res.json({ success: true });
});

app.get('/api/telemetry', (req, res) => {
  const telemetry = loadJson('telemetry.json');
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const event = req.query.event;
  let filtered = telemetry;
  if (event) filtered = filtered.filter(t => t.event === event);

  // Event summary
  const byEvent = {};
  telemetry.forEach(t => { byEvent[t.event] = (byEvent[t.event] || 0) + 1; });

  res.json({ total: telemetry.length, filtered: filtered.length, by_event: byEvent, events: filtered.slice(-limit).reverse() });
});

app.delete('/api/telemetry', (req, res) => {
  saveJson('telemetry.json', []);
  res.json({ success: true });
});

// ══════════════════════════════════════════
// ── STATS & ANALYTICS
// ══════════════════════════════════════════

app.get('/api/stats', (req, res) => {
  const errors = loadJson('errors.json');
  const diags = loadJson('diagnostics.json');
  const telemetry = loadJson('telemetry.json');
  const releases = loadJson('releases.json');

  const dayAgo = new Date(Date.now() - 86400000).toISOString();
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const recentTelemetry = telemetry.filter(t => t.timestamp > dayAgo);
  const weekTelemetry = telemetry.filter(t => t.timestamp > weekAgo);

  // Unique users
  const uniqueUsers24h = new Set(recentTelemetry.map(t => t.ip)).size;
  const uniqueUsers7d = new Set(weekTelemetry.map(t => t.ip)).size;

  // Error trends
  const errorsByDay = {};
  errors.forEach(e => {
    const day = (e.received_at || '').slice(0, 10);
    if (day) errorsByDay[day] = (errorsByDay[day] || 0) + 1;
  });

  // Top error types
  const errorTypes = {};
  errors.forEach(e => { errorTypes[e.error_type] = (errorTypes[e.error_type] || 0) + 1; });
  const topErrors = Object.entries(errorTypes).sort((a, b) => b[1] - a[1]).slice(0, 10);

  // OS distribution
  const osDistrib = {};
  telemetry.forEach(t => { if (t.os) osDistrib[t.os] = (osDistrib[t.os] || 0) + 1; });

  // Version distribution
  const versionDistrib = {};
  telemetry.forEach(t => { if (t.app_version) versionDistrib[t.app_version] = (versionDistrib[t.app_version] || 0) + 1; });

  // Event breakdown
  const eventBreakdown = {};
  telemetry.forEach(t => { if (t.event) eventBreakdown[t.event] = (eventBreakdown[t.event] || 0) + 1; });

  // Diagnostics pass/fail rate
  let diagPassed = 0, diagFailed = 0;
  diags.forEach(d => {
    if (d.summary) { diagPassed += d.summary.passed || 0; diagFailed += d.summary.failed || 0; }
  });

  res.json({
    // Counts
    total_errors: errors.length,
    errors_24h: errors.filter(e => e.received_at > dayAgo).length,
    errors_7d: errors.filter(e => e.received_at > weekAgo).length,
    unresolved_errors: errors.filter(e => !e.resolved).length,
    total_diagnostics: diags.length,
    total_telemetry: telemetry.length,
    unique_users_24h: uniqueUsers24h,
    unique_users_7d: uniqueUsers7d,

    // Trends & distributions
    errors_by_day: errorsByDay,
    top_error_types: topErrors,
    os_distribution: osDistrib,
    version_distribution: versionDistrib,
    event_breakdown: eventBreakdown,

    // Diagnostics health
    diagnostics_pass_rate: diagPassed + diagFailed > 0 ? Math.round(diagPassed / (diagPassed + diagFailed) * 100) : 0,

    // Latest
    latest_release: releases[0] || null,
    latest_errors: errors.slice(-5).reverse(),

    // Git
    git: getGitInfo(),
    project: getProjectStats(),
  });
});

// ══════════════════════════════════════════
// ── BUILDS (GitHub Actions proxy)
// ══════════════════════════════════════════

const GH_TOKEN = process.env.GH_TOKEN || '';
const GH_REPO = 'LeonardoFangueiro/cs2-player-tools';

app.get('/api/builds', async (req, res) => {
  try {
    const headers = { 'Accept': 'application/vnd.github+json' };
    if (GH_TOKEN) headers['Authorization'] = `Bearer ${GH_TOKEN}`;
    const r = await fetch(`https://api.github.com/repos/${GH_REPO}/actions/runs?per_page=10`, { headers });
    const d = await r.json();
    res.json({
      builds: (d.workflow_runs || []).map(r => ({
        id: r.id,
        number: r.run_number,
        status: r.status,
        conclusion: r.conclusion,
        branch: r.head_branch,
        sha: r.head_sha?.slice(0, 8),
        created_at: r.created_at,
        url: r.html_url,
      })),
    });
  } catch (e) {
    res.json({ builds: [], error: e.message });
  }
});

app.post('/api/builds/trigger', async (req, res) => {
  if (!GH_TOKEN) return res.status(400).json({ error: 'GH_TOKEN not configured' });
  try {
    const r = await fetch(`https://api.github.com/repos/${GH_REPO}/actions/workflows/build-windows.yml/dispatches`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${GH_TOKEN}`, 'Accept': 'application/vnd.github+json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref: 'main' }),
    });
    res.json({ success: r.status === 204, status: r.status });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// ══════════════════════════════════════════
// ── CRASH LOGS (for Tauri app crash reports)
// ══════════════════════════════════════════

app.post('/api/crash', (req, res) => {
  const crash = {
    id: `crash_${Date.now()}`,
    ...req.body,
    received_at: ts(),
    ip: req.ip,
  };
  const crashes = loadJson('crashes.json');
  crashes.push(crash);
  if (crashes.length > 200) crashes.splice(0, crashes.length - 200);
  saveJson('crashes.json', crashes);
  res.json({ success: true, id: crash.id });
});

app.get('/api/crashes', (req, res) => {
  const crashes = loadJson('crashes.json');
  res.json({ total: crashes.length, crashes: crashes.slice(-20).reverse() });
});

// ══════════════════════════════════════════
// ── FEATURE FLAGS (remote config for the app)
// ══════════════════════════════════════════

app.get('/api/config', (req, res) => {
  const config = loadJson('remote_config.json');
  // If empty, return defaults
  if (!config || !config.features) {
    return res.json({
      features: {
        vpn_enabled: true,
        optimizer_enabled: true,
        region_lock_enabled: true,
        cs2_config_enabled: true,
        auto_update_check: true,
        telemetry_enabled: true,
        dev_tools_visible: true,
      },
      messages: [],
      maintenance: false,
    });
  }
  res.json(config);
});

app.post('/api/config', (req, res) => {
  const { api_key } = req.body;
  if (api_key !== process.env.HQ_API_KEY && api_key !== 'cs2pt-dev-key') {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  const { features, messages, maintenance } = req.body;
  saveJson('remote_config.json', { features, messages, maintenance, updated_at: ts() });
  res.json({ success: true });
});

// ══════════════════════════════════════════
// ── FEEDBACK (user feedback from app)
// ══════════════════════════════════════════

app.post('/api/feedback', (req, res) => {
  const feedback = {
    id: `fb_${Date.now()}`,
    ...req.body,
    received_at: ts(),
    ip: req.ip,
  };
  const feedbacks = loadJson('feedback.json');
  feedbacks.push(feedback);
  if (feedbacks.length > 500) feedbacks.splice(0, feedbacks.length - 500);
  saveJson('feedback.json', feedbacks);
  res.json({ success: true, id: feedback.id });
});

app.get('/api/feedback', (req, res) => {
  const feedbacks = loadJson('feedback.json');
  const limit = Math.min(parseInt(req.query.limit) || 30, 100);
  res.json({ total: feedbacks.length, feedback: feedbacks.slice(-limit).reverse() });
});

// ══════════════════════════════════════════
// ── CONNECTED CLIENTS (WebSocket-like status tracking)
// ══════════════════════════════════════════

app.post('/api/heartbeat', (req, res) => {
  const { app_version, os, cs2_running, vpn_active, profile_name, token, vpn_server_id, vpn_ip } = req.body;
  const clients = loadJson('clients.json');

  // Resolve token to label
  let tokenLabel = null;
  if (token) {
    const tokens = loadJson('tokens.json');
    const t = tokens.find(t => t.token === token);
    tokenLabel = t?.label || token.slice(0, 15) + '...';
  }

  const existing = clients.findIndex(c => c.ip === req.ip);
  const client = {
    ip: req.ip,
    token: token || null,
    token_label: tokenLabel,
    app_version, os, cs2_running, vpn_active,
    profile_name, vpn_server_id, vpn_ip,
    last_seen: ts(),
  };
  if (existing >= 0) clients[existing] = client;
  else clients.push(client);
  // Remove stale (>5 min)
  const cutoff = new Date(Date.now() - 300000).toISOString();
  const active = clients.filter(c => c.last_seen > cutoff);
  saveJson('clients.json', active);
  res.json({ success: true, online_count: active.length });
});

app.get('/api/clients', (req, res) => {
  const clients = loadJson('clients.json');
  const cutoff = new Date(Date.now() - 300000).toISOString();
  const active = clients.filter(c => c.last_seen > cutoff);
  res.json({
    online: active.length,
    clients: active,
    cs2_playing: active.filter(c => c.cs2_running).length,
    vpn_connected: active.filter(c => c.vpn_active).length,
  });
});

// ══════════════════════════════════════════
// ── TOKEN MANAGEMENT (auth for the app)
// ══════════════════════════════════════════

// Create a token (admin only)
app.post('/api/tokens', (req, res) => {
  const { api_key, label, max_uses } = req.body;
  if (api_key !== process.env.HQ_API_KEY && api_key !== 'cs2pt-dev-key') {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  const token = `CS2PT-${randomHex(4)}-${randomHex(4)}-${randomHex(4)}-${randomHex(4)}`.toUpperCase();
  const tokens = loadJson('tokens.json');
  tokens.push({
    token,
    label: label || '',
    created_at: ts(),
    active: true,
    uses: 0,
    max_uses: max_uses || 0, // 0 = unlimited
    last_used: null,
    last_ip: null,
  });
  saveJson('tokens.json', tokens);
  res.json({ success: true, token });
});

// List all tokens (admin)
app.get('/api/tokens', (req, res) => {
  const tokens = loadJson('tokens.json');
  res.json({ total: tokens.length, tokens });
});

// Validate a token (from the app)
app.post('/api/tokens/validate', (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ valid: false, error: 'Token required' });
  const tokens = loadJson('tokens.json');
  const idx = tokens.findIndex(t => t.token === token.toUpperCase().trim());
  if (idx === -1) return res.json({ valid: false, error: 'Invalid token' });
  const t = tokens[idx];
  if (!t.active) return res.json({ valid: false, error: 'Token deactivated' });
  if (t.max_uses > 0 && t.uses >= t.max_uses) return res.json({ valid: false, error: 'Token usage limit reached' });
  // Update usage
  tokens[idx].uses++;
  tokens[idx].last_used = ts();
  tokens[idx].last_ip = req.ip;
  saveJson('tokens.json', tokens);
  res.json({ valid: true, label: t.label });
});

// Toggle token active/inactive
app.patch('/api/tokens/:token', (req, res) => {
  const { api_key } = req.body;
  if (api_key !== process.env.HQ_API_KEY && api_key !== 'cs2pt-dev-key') {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  const tokens = loadJson('tokens.json');
  const idx = tokens.findIndex(t => t.token === req.params.token);
  if (idx === -1) return res.status(404).json({ error: 'Token not found' });
  if (req.body.active !== undefined) tokens[idx].active = req.body.active;
  if (req.body.label !== undefined) tokens[idx].label = req.body.label;
  tokens[idx].updated_at = ts();
  saveJson('tokens.json', tokens);
  res.json({ success: true, token: tokens[idx] });
});

// Delete a token
app.delete('/api/tokens/:token', (req, res) => {
  const tokens = loadJson('tokens.json');
  const filtered = tokens.filter(t => t.token !== req.params.token);
  saveJson('tokens.json', filtered);
  res.json({ success: true });
});

// ══════════════════════════════════════════
// ── VPN SERVERS (managed by admin, served to app)
// ══════════════════════════════════════════

// Deploy a new VPN server (admin — auto-installs WireGuard via SSH)
app.post('/api/vpn-servers', async (req, res) => {
  const { api_key, ip, ssh_user, ssh_pass, ssh_port, name } = req.body;
  if (api_key !== process.env.HQ_API_KEY && api_key !== 'cs2pt-dev-key') {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  if (!ip || !ssh_pass) return res.status(400).json({ error: 'IP and SSH password required' });

  // 1. Auto-detect location from IP
  const geo = await detectLocation(ip);

  // 2. Deploy WireGuard
  const result = await deployVpnServer({
    ip,
    port: ssh_port || 22,
    username: ssh_user || 'root',
    password: ssh_pass,
  });

  if (!result.success) {
    return res.json({ success: false, log: result.log, error: result.error });
  }

  // 3. Save server
  const servers = loadJson('vpn_servers.json');
  const server = {
    id: `vpn_${Date.now()}`,
    name: name || (geo ? `VPN ${geo.city}` : `VPN ${ip}`),
    location: geo?.location || '',
    country: geo?.country || '',
    country_code: geo?.countryCode || '',
    flag: geo?.flag || '🌐',
    ip,
    ssh_user: ssh_user || 'root',
    ssh_port: ssh_port || 22,
    port: 51820,
    public_key: result.server_public_key,
    endpoint: result.endpoint,
    lat: geo?.lat || 0,
    lng: geo?.lng || 0,
    max_clients: 50,
    active: true,
    status: 'online',
    created_at: ts(),
    deploy_log: result.log,
    // SSH pass stored encrypted in practice; here stored for monitoring
    _ssh_pass: ssh_pass,
  };
  servers.push(server);
  saveJson('vpn_servers.json', servers);

  res.json({ success: true, server: { ...server, _ssh_pass: undefined }, log: result.log });
});

// Add server manually (without SSH deploy — for pre-configured servers)
app.post('/api/vpn-servers/manual', (req, res) => {
  const { api_key, name, location, country, flag, ip, port, public_key, lat, lng, max_clients } = req.body;
  if (api_key !== process.env.HQ_API_KEY && api_key !== 'cs2pt-dev-key') {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  const servers = loadJson('vpn_servers.json');
  const server = {
    id: `vpn_${Date.now()}`,
    name: name || 'VPN Server',
    location: location || '', country: country || '', flag: flag || '🌐',
    ip: ip || '', port: port || 51820, public_key: public_key || '',
    endpoint: `${ip}:${port || 51820}`,
    lat: lat || 0, lng: lng || 0, max_clients: max_clients || 50,
    active: true, status: 'unknown', created_at: ts(),
  };
  servers.push(server);
  saveJson('vpn_servers.json', servers);
  res.json({ success: true, server });
});

// Check server status (admin)
app.get('/api/vpn-servers/:id/status', async (req, res) => {
  const servers = loadJson('vpn_servers.json');
  const server = servers.find(s => s.id === req.params.id);
  if (!server) return res.status(404).json({ error: 'Not found' });
  if (!server._ssh_pass) return res.json({ online: false, error: 'No SSH credentials stored' });

  const status = await checkServerStatus({
    ip: server.ip,
    port: server.ssh_port || 22,
    username: server.ssh_user || 'root',
    password: server._ssh_pass,
  });

  // Update stored status
  const idx = servers.findIndex(s => s.id === req.params.id);
  if (idx >= 0) {
    servers[idx].status = status.online ? 'online' : 'offline';
    servers[idx].last_check = ts();
    servers[idx].peers = status.peers || 0;
    servers[idx].transfer_rx = status.transfer_rx || 0;
    servers[idx].transfer_tx = status.transfer_tx || 0;
    servers[idx].load = status.load || '0';
    servers[idx].uptime = status.uptime || '';
    saveJson('vpn_servers.json', servers);
  }

  res.json(status);
});

// Add peer to server (used when app client connects)
app.post('/api/vpn-servers/:id/add-peer', async (req, res) => {
  const { client_public_key, client_ip } = req.body;
  const servers = loadJson('vpn_servers.json');
  const server = servers.find(s => s.id === req.params.id);
  if (!server) return res.status(404).json({ error: 'Not found' });
  if (!server._ssh_pass) return res.json({ success: false, error: 'No SSH credentials' });

  const result = await addPeer({
    ip: server.ip,
    port: server.ssh_port || 22,
    username: server.ssh_user || 'root',
    password: server._ssh_pass,
    clientPublicKey: client_public_key,
    clientIp: client_ip,
  });

  res.json(result);
});

// List VPN servers (public — app fetches this)
app.get('/api/vpn-servers', (req, res) => {
  const servers = loadJson('vpn_servers.json');
  // Only return active servers to the app, strip private info
  const publicServers = servers.filter(s => s.active).map(s => ({
    id: s.id,
    name: s.name,
    location: s.location,
    country: s.country,
    flag: s.flag,
    endpoint: s.endpoint,
    public_key: s.public_key,
    lat: s.lat,
    lng: s.lng,
    max_clients: s.max_clients,
    current_clients: s.peers || 0,
    country_code: s.country_code || '',
  }));
  res.json({ servers: publicServers });
});

// Get full server details (admin)
app.get('/api/vpn-servers/admin', (req, res) => {
  const servers = loadJson('vpn_servers.json');
  res.json({ total: servers.length, servers });
});

// Delete VPN server
app.delete('/api/vpn-servers/:id', async (req, res) => {
  const servers = loadJson('vpn_servers.json');
  const server = servers.find(s => s.id === req.params.id);

  let cleanupLog = [];
  // Try to SSH and uninstall WireGuard if we have credentials
  if (server && server._ssh_pass) {
    const result = await uninstallVpnServer({
      ip: server.ip,
      port: server.ssh_port || 22,
      username: server.ssh_user || 'root',
      password: server._ssh_pass,
    });
    cleanupLog = result.log || [];
  }

  const filtered = servers.filter(s => s.id !== req.params.id);
  saveJson('vpn_servers.json', filtered);
  res.json({ success: true, cleanup_log: cleanupLog });
});

// Toggle server active/inactive
app.patch('/api/vpn-servers/:id', (req, res) => {
  const servers = loadJson('vpn_servers.json');
  const idx = servers.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  Object.assign(servers[idx], req.body, { updated_at: ts() });
  saveJson('vpn_servers.json', servers);
  res.json({ success: true, server: servers[idx] });
});

// Request VPN connection (app sends token + client public key, gets config + peer added to server)
app.post('/api/vpn-servers/:id/connect', async (req, res) => {
  const { token, client_public_key } = req.body;
  if (!client_public_key) return res.status(400).json({ error: 'client_public_key required' });

  // Validate token
  const tokens = loadJson('tokens.json');
  const tokenIdx = tokens.findIndex(t => t.token === (token || '').toUpperCase().trim());
  if (tokenIdx === -1 || !tokens[tokenIdx].active) {
    return res.status(401).json({ error: 'Invalid or inactive token' });
  }
  if (tokens[tokenIdx].max_uses > 0 && tokens[tokenIdx].uses >= tokens[tokenIdx].max_uses) {
    return res.status(403).json({ error: 'Token usage limit reached' });
  }

  // Find server
  const servers = loadJson('vpn_servers.json');
  const server = servers.find(s => s.id === req.params.id && s.active);
  if (!server) return res.status(404).json({ error: 'Server not found or inactive' });
  if (!server._ssh_pass) return res.status(500).json({ error: 'Server SSH credentials not available' });

  // Get existing peers to allocate unique IP
  const existingPeers = await listPeers({
    ip: server.ip, port: server.ssh_port || 22,
    username: server.ssh_user || 'root', password: server._ssh_pass,
  });

  const clientIp = allocateClientIp(existingPeers);
  if (!clientIp) return res.status(503).json({ error: 'No available IP addresses (server full)' });

  // Add peer to server WITHOUT interrupting VPN (Point 1)
  const addResult = await addPeer({
    ip: server.ip, port: server.ssh_port || 22,
    username: server.ssh_user || 'root', password: server._ssh_pass,
    clientPublicKey: client_public_key, clientIp,
  });

  if (!addResult.success) {
    return res.json({ success: false, error: `Failed to add peer: ${addResult.error}` });
  }

  // Track token usage
  tokens[tokenIdx].uses++;
  tokens[tokenIdx].last_used = ts();
  tokens[tokenIdx].last_ip = req.ip;
  saveJson('tokens.json', tokens);

  // Return client config (Point 5: CS2-only split tunnel)
  res.json({
    success: true,
    config: {
      server_endpoint: server.endpoint,
      server_public_key: server.public_key,
      client_address: `${clientIp}/32`,
      dns: '1.1.1.1, 8.8.8.8',
      mtu: 1420,
      allowed_ips: getValveAllowedIps(), // CS2 only! (Point 5)
      persistent_keepalive: 25,
    },
  });
});

// List peers on a server (admin)
app.get('/api/vpn-servers/:id/peers', async (req, res) => {
  const servers = loadJson('vpn_servers.json');
  const server = servers.find(s => s.id === req.params.id);
  if (!server) return res.status(404).json({ error: 'Not found' });
  if (!server._ssh_pass) return res.json({ peers: [], error: 'No SSH credentials' });

  const peers = await listPeers({
    ip: server.ip, port: server.ssh_port || 22,
    username: server.ssh_user || 'root', password: server._ssh_pass,
  });
  res.json({ peers, total: peers.length });
});

// Remove peer from server (admin - Point 12)
app.delete('/api/vpn-servers/:id/peers/:pubkey', async (req, res) => {
  const servers = loadJson('vpn_servers.json');
  const server = servers.find(s => s.id === req.params.id);
  if (!server || !server._ssh_pass) return res.status(404).json({ error: 'Not found' });

  const result = await removePeer({
    ip: server.ip, port: server.ssh_port || 22,
    username: server.ssh_user || 'root', password: server._ssh_pass,
    clientPublicKey: decodeURIComponent(req.params.pubkey),
  });
  res.json(result);
});

// ══════════════════════════════════════════
// ── CATCH-ALL 404
// ══════════════════════════════════════════

app.use('/api/*', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found', path: req.path });
});

// ── Start ──

app.listen(PORT, '127.0.0.1', () => {
  console.log(`CS2 Player Tools HQ Backend v${getAppVersion()} on port ${PORT}`);
  console.log(`Data: ${DATA_DIR}`);
  console.log(`Git: ${JSON.stringify(getGitInfo())}`);
});
