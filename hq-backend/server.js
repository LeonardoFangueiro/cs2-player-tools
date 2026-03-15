import express from 'express';
import cors from 'cors';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 3300;

// Data storage
const DATA_DIR = join(__dirname, 'data');
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

app.use(cors());
app.use(express.json({ limit: '5mb' }));

// ── Helpers ──

function loadJson(filename) {
  const path = join(DATA_DIR, filename);
  if (!existsSync(path)) return [];
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return []; }
}

function saveJson(filename, data) {
  writeFileSync(join(DATA_DIR, filename), JSON.stringify(data, null, 2));
}

function getTimestamp() {
  return new Date().toISOString();
}

// ── API Endpoints ──

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: '0.1.0', timestamp: getTimestamp() });
});

// App version & download info
app.get('/api/version', (req, res) => {
  const releases = loadJson('releases.json');
  const latest = releases[0] || null;
  res.json({
    latest_version: latest?.version || '0.1.0',
    download_url: latest?.download_url || null,
    release_date: latest?.date || null,
    changelog: latest?.changelog || 'Initial release',
    update_available: false,
  });
});

// Register a new release (called from CI or manually)
app.post('/api/releases', (req, res) => {
  const { version, download_url, changelog, api_key } = req.body;
  if (api_key !== process.env.HQ_API_KEY && api_key !== 'cs2pt-dev-key') {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  const releases = loadJson('releases.json');
  releases.unshift({ version, download_url, changelog, date: getTimestamp() });
  if (releases.length > 20) releases.length = 20;
  saveJson('releases.json', releases);
  res.json({ success: true, message: `Release ${version} registered` });
});

// Error reporting from the app
app.post('/api/errors', (req, res) => {
  const { app_version, os, error_type, error_message, stack_trace, context, timestamp } = req.body;
  const errors = loadJson('errors.json');
  errors.push({
    id: `err_${Date.now()}`,
    app_version: app_version || 'unknown',
    os: os || 'unknown',
    error_type: error_type || 'unknown',
    error_message: error_message || '',
    stack_trace: stack_trace || '',
    context: context || {},
    timestamp: timestamp || getTimestamp(),
    received_at: getTimestamp(),
    ip: req.ip,
  });
  // Keep last 500 errors
  if (errors.length > 500) errors.splice(0, errors.length - 500);
  saveJson('errors.json', errors);
  res.json({ success: true, id: errors[errors.length - 1].id });
});

// Get error reports (for HQ dashboard)
app.get('/api/errors', (req, res) => {
  const errors = loadJson('errors.json');
  const limit = parseInt(req.query.limit) || 50;
  res.json({
    total: errors.length,
    errors: errors.slice(-limit).reverse(),
  });
});

// Diagnostics report from app (dev mode)
app.post('/api/diagnostics', (req, res) => {
  const report = {
    id: `diag_${Date.now()}`,
    ...req.body,
    received_at: getTimestamp(),
    ip: req.ip,
  };
  const diags = loadJson('diagnostics.json');
  diags.push(report);
  if (diags.length > 100) diags.splice(0, diags.length - 100);
  saveJson('diagnostics.json', diags);
  res.json({ success: true, id: report.id });
});

// Get diagnostics (for HQ dashboard)
app.get('/api/diagnostics', (req, res) => {
  const diags = loadJson('diagnostics.json');
  const limit = parseInt(req.query.limit) || 20;
  res.json({
    total: diags.length,
    diagnostics: diags.slice(-limit).reverse(),
  });
});

// Telemetry (app startup, usage stats)
app.post('/api/telemetry', (req, res) => {
  const { app_version, os, event, data } = req.body;
  const telemetry = loadJson('telemetry.json');
  telemetry.push({
    app_version, os, event, data,
    timestamp: getTimestamp(),
    ip: req.ip,
  });
  if (telemetry.length > 1000) telemetry.splice(0, telemetry.length - 1000);
  saveJson('telemetry.json', telemetry);
  res.json({ success: true });
});

// Stats overview (for HQ dashboard)
app.get('/api/stats', (req, res) => {
  const errors = loadJson('errors.json');
  const diags = loadJson('diagnostics.json');
  const telemetry = loadJson('telemetry.json');
  const releases = loadJson('releases.json');

  // Count unique IPs in last 24h
  const dayAgo = new Date(Date.now() - 86400000).toISOString();
  const recentTelemetry = telemetry.filter(t => t.timestamp > dayAgo);
  const uniqueUsers24h = new Set(recentTelemetry.map(t => t.ip)).size;

  res.json({
    total_errors: errors.length,
    errors_24h: errors.filter(e => e.received_at > dayAgo).length,
    total_diagnostics: diags.length,
    total_telemetry: telemetry.length,
    unique_users_24h: uniqueUsers24h,
    latest_release: releases[0] || null,
    latest_errors: errors.slice(-5).reverse(),
  });
});

// ── Start ──

app.listen(PORT, '127.0.0.1', () => {
  console.log(`CS2 Player Tools HQ Backend running on port ${PORT}`);
});
