// Run-stats server for «Оплот: Осада» / Hold the Gate. Zero dependencies (Node ≥ 20), deploy on Railway.
// POST /run            — the game sends one JSON per finished run (public, rate-limited, ≤ 8 KB)
// GET  /stats?token=…  — summary by version and Citadel %, as HTML (or ?format=json)
// GET  /runs.csv?token=…, /runs.jsonl?token=… — raw export
// Env: PORT (Railway sets it), DATA_DIR (mount a Railway Volume here, e.g. /data), ADMIN_TOKEN (required for reading).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const PORT = Number(process.env.PORT || 8080);
const DATA_DIR = process.env.DATA_DIR || './data';
const TOKEN = process.env.ADMIN_TOKEN || '';
const FILE = path.join(DATA_DIR, 'runs.jsonl');
fs.mkdirSync(DATA_DIR, { recursive: true });

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
const send = (res, code, body, type = 'text/plain; charset=utf-8') => { res.writeHead(code, { ...CORS, 'Content-Type': type }); res.end(body); };

// Per-IP limit: 20 runs a minute is far above real play (IP is used only here, in memory, never stored).
const hits = new Map();
setInterval(() => hits.clear(), 60_000).unref();
const limited = (ip) => { const n = (hits.get(ip) ?? 0) + 1; hits.set(ip, n); return n > 20; };

const num = (x, lo, hi) => (typeof x === 'number' && Number.isFinite(x) ? Math.max(lo, Math.min(hi, Math.round(x))) : null);
const str = (x, n) => (typeof x === 'string' ? x.slice(0, n).replace(/[^\w.\-]/g, '') : '');
function clean(d) {
  if (!d || typeof d !== 'object') return null;
  const wave = num(d.wave, 0, 99);
  if (wave === null) return null;
  return {
    ts: new Date().toISOString(), v: str(d.v, 32), site: str(d.site, 40), lang: str(d.lang, 4), pid: str(d.pid, 24),
    run: num(d.run, 0, 1e6), wave, won: d.won === true, killer: str(d.killer, 24), citadel: num(d.citadel, 0, 100),
    wins: num(d.wins, 0, 1e6), best: num(d.best, 0, 99), sec: num(d.sec, 0, 1e6), gems: num(d.gems, 0, 1e7),
    heroes: Array.isArray(d.heroes) ? d.heroes.slice(0, 6).map((h) => ({ id: str(h?.id, 24), lvl: num(h?.lvl, 0, 999), items: Array.isArray(h?.items) ? h.items.slice(0, 8).map((r) => num(r, 0, 9)) : [] })) : [],
    relics: Array.isArray(d.relics) ? d.relics.slice(0, 20).map((r) => str(r, 24)) : [],
    castle: Array.isArray(d.castle) ? d.castle.slice(0, 40).map((c) => num(c, -1e5, 1e5)) : [],
  };
}

const readRuns = () => { try { return fs.readFileSync(FILE, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
const authed = (url) => TOKEN && url.searchParams.get('token') === TOKEN;

function summary(runs) {
  const groups = {};
  for (const r of runs) {
    const band = r.citadel === null ? '?' : r.citadel < 5 ? '0–4%' : r.citadel < 20 ? '5–19%' : r.citadel < 50 ? '20–49%' : r.citadel < 80 ? '50–79%' : '80–100%';
    const k = `${r.v || '?'} | ${band}`;
    const g = (groups[k] ??= { version: r.v || '?', citadel: band, runs: 0, players: new Set(), waveSum: 0, wins: 0, waves: [] });
    g.runs++; g.players.add(r.pid); g.waveSum += r.wave; g.wins += r.won ? 1 : 0; g.waves.push(r.wave);
  }
  return Object.values(groups).map((g) => {
    const w = g.waves.sort((a, b) => a - b);
    return { version: g.version, citadel: g.citadel, runs: g.runs, players: g.players.size, avgWave: +(g.waveSum / g.runs).toFixed(1), medianWave: w[Math.floor(w.length / 2)], wins: g.wins };
  }).sort((a, b) => (a.version + a.citadel).localeCompare(b.version + b.citadel));
}

function csv(runs) {
  const cols = ['ts', 'v', 'site', 'lang', 'pid', 'run', 'wave', 'won', 'killer', 'citadel', 'wins', 'best', 'sec', 'gems'];
  const esc = (x) => { const s = typeof x === 'object' ? JSON.stringify(x) : String(x ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [cols.concat('heroes', 'relics', 'castle').join(','), ...runs.map((r) => cols.map((c) => esc(r[c])).concat(esc(r.heroes), esc(r.relics), esc(r.castle)).join(','))].join('\n');
}

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'OPTIONS') return send(res, 204, '');
  if (req.method === 'POST' && url.pathname === '/run') {
    const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString().split(',')[0].trim();
    if (limited(ip)) return send(res, 429, 'slow down');
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 8192) req.destroy(); });
    req.on('end', () => {
      let rec = null;
      try { rec = clean(JSON.parse(body)); } catch { /* bad json */ }
      if (!rec) return send(res, 400, 'bad run');
      fs.appendFile(FILE, JSON.stringify(rec) + '\n', (err) => send(res, err ? 500 : 204, ''));
    });
    return;
  }
  if (req.method === 'GET' && url.pathname === '/') return send(res, 200, 'Hold the Gate stats: ok');
  if (req.method === 'GET' && ['/stats', '/runs.csv', '/runs.jsonl'].includes(url.pathname)) {
    if (!authed(url)) return send(res, 401, 'token?');
    const runs = readRuns();
    if (url.pathname === '/runs.jsonl') return send(res, 200, runs.map((r) => JSON.stringify(r)).join('\n'), 'application/x-ndjson');
    if (url.pathname === '/runs.csv') return send(res, 200, csv(runs), 'text/csv; charset=utf-8');
    const s = summary(runs);
    if (url.searchParams.get('format') === 'json') return send(res, 200, JSON.stringify({ total: runs.length, players: new Set(runs.map((r) => r.pid)).size, groups: s }, null, 2), 'application/json');
    const rows = s.map((g) => `<tr><td>${g.version}</td><td>${g.citadel}</td><td>${g.runs}</td><td>${g.players}</td><td>${g.avgWave}</td><td>${g.medianWave}</td><td>${g.wins}</td></tr>`).join('');
    const last = runs.slice(-30).reverse().map((r) => `<tr><td>${r.ts.slice(0, 16).replace('T', ' ')}</td><td>${r.v}</td><td>${r.site}</td><td>${r.pid}</td><td>${r.run}</td><td>${r.wave}${r.won ? ' 🏆' : ''}</td><td>${r.citadel}%</td><td>${r.killer}</td><td>${r.heroes.map((h) => h.id).join(', ')}</td></tr>`).join('');
    return send(res, 200, `<!doctype html><meta charset="utf-8"><title>Hold the Gate stats</title><style>body{font:14px system-ui;margin:20px}table{border-collapse:collapse;margin-bottom:24px}td,th{border:1px solid #ccc;padding:4px 8px;text-align:right}</style>
<h2>Забеги: ${runs.length}, игроков: ${new Set(runs.map((r) => r.pid)).size}</h2>
<table><tr><th>версия</th><th>Цитадель</th><th>забегов</th><th>игроков</th><th>ср. волна</th><th>медиана</th><th>побед</th></tr>${rows}</table>
<h3>Последние 30</h3><table><tr><th>время UTC</th><th>версия</th><th>сайт</th><th>игрок</th><th>забег №</th><th>волна</th><th>Цитадель</th><th>убийца</th><th>герои</th></tr>${last}</table>`, 'text/html; charset=utf-8');
  }
  send(res, 404, 'not found');
}).listen(PORT, () => console.log(`stats server on :${PORT}, data in ${FILE}`));
