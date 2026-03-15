import express from 'express';
import cors from 'cors';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'fs';
import { join, dirname, extname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

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
  const { app_version, os, cs2_running, vpn_active, profile_name } = req.body;
  const clients = loadJson('clients.json');
  const existing = clients.findIndex(c => c.ip === req.ip);
  const client = {
    ip: req.ip,
    app_version, os, cs2_running, vpn_active, profile_name,
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
