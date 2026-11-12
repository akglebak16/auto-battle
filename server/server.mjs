// Run-stats server for «Оплот: Осада» / Hold the Gate. Zero dependencies (Node ≥ 20), deploy on Railway.
// POST /run            — the game sends one JSON per finished run (public, rate-limited, ≤ 20 KB)
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
const nums = (x, n, lo = -1e6, hi = 1e6) => (Array.isArray(x) ? x.slice(0, n).map((v) => num(v, lo, hi)) : []);
const strs = (x, n, len) => (Array.isArray(x) ? x.slice(0, n).map((v) => str(v, len)) : []);
const dict = (x, n, hi = 1e6) => {
  const out = {};
  if (x && typeof x === 'object' && !Array.isArray(x)) for (const k of Object.keys(x).slice(0, n)) { const v = num(x[k], 0, hi); if (v !== null) out[str(k, 32)] = v; }
  return out;
};
function clean(d) {
  if (!d || typeof d !== 'object') return null;
  const wave = num(d.wave, 0, 99);
  if (wave === null) return null;
  const kind = d.kind === 'leave' ? 'leave' : 'run';
  return {
    ts: new Date().toISOString(), kind, v: str(d.v, 32), site: str(d.site, 40), lang: str(d.lang, 4), pid: str(d.pid, 24),
    run: num(d.run, 0, 1e6), wave, won: d.won === true, killer: str(d.killer, 24), citadel: num(d.citadel, 0, 100),
    wins: num(d.wins, 0, 1e6), best: num(d.best, 0, 99), sec: num(d.sec, 0, 1e6), gems: num(d.gems, 0, 1e7),
    start: str(d.start, 24), screen: nums(d.screen, 2, 0, 20000), why: str(d.why, 12), phase: str(d.phase, 12),
    heroes: Array.isArray(d.heroes) ? d.heroes.slice(0, 6).map((h) => ({ id: str(h?.id, 24), lvl: num(h?.lvl, 0, 999), skills: dict(h?.skills, 16, 9), items: Array.isArray(h?.items) ? h.items.slice(0, 8).map((it) => (Array.isArray(it) ? [str(it[0], 24), num(it[1], 0, 9)] : num(it, 0, 9))) : [] })) : [],
    relics: strs(d.relics, 20, 24),
    waves: Array.isArray(d.waves) ? d.waves.slice(0, 40).map((r) => nums(r, 6, -1e6, 1e7)) : [],
    castle: nums(d.castle, 40, -1e5, 1e5),
    ups: dict(d.ups, 60, 9), spells: dict(d.spells, 8, 1e5), orders: num(d.orders, 0, 1e4), events: strs(d.events, 20, 32),
    cards: strs(d.cards, 120, 48), combo: num(d.combo, 0, 1e6), towers: num(d.towers, 0, 99), gold: num(d.gold, -1e6, 1e9), castleHp: num(d.castleHp, -1e6, 1e6),
  };
}

const readRuns = () => { try { return fs.readFileSync(FILE, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
const authed = (url) => TOKEN && url.searchParams.get('token') === TOKEN;

const isRun = (r) => r.kind !== 'leave';
const avg = (a) => (a.length ? +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(1) : 0);
const median = (a) => { const w = [...a].sort((x, y) => x - y); return w.length ? w[Math.floor(w.length / 2)] : 0; };
const bump = (m, k, f) => { const e = (m[k] ??= { n: 0, waves: [] }); e.n++; if (f !== undefined) e.waves.push(f); };

function summary(runs) {
  const groups = {};
  for (const r of runs.filter(isRun)) {
    const band = r.citadel === null ? '?' : r.citadel < 5 ? '0–4%' : r.citadel < 20 ? '5–19%' : r.citadel < 50 ? '20–49%' : r.citadel < 80 ? '50–79%' : '80–100%';
    const k = `${r.v || '?'} | ${band}`;
    const g = (groups[k] ??= { version: r.v || '?', citadel: band, runs: 0, players: new Set(), waveSum: 0, wins: 0, waves: [] });
    g.runs++; g.players.add(r.pid); g.waveSum += r.wave; g.wins += r.won ? 1 : 0; g.waves.push(r.wave);
  }
  return Object.values(groups).map((g) => ({ version: g.version, citadel: g.citadel, runs: g.runs, players: g.players.size, avgWave: +(g.waveSum / g.runs).toFixed(1), medianWave: median(g.waves), wins: g.wins }))
    .sort((a, b) => (a.version + a.citadel).localeCompare(b.version + b.citadel));
}

/** Deeper breakdown for one game version (default: the newest real one). */
function details(all, version) {
  const real = all.filter((r) => !String(r.v).startsWith('test'));
  const v = version || (real.length ? real[real.length - 1].v : '');
  const rs = real.filter((r) => r.v === v);
  const runs = rs.filter(isRun), leaves = rs.filter((r) => !isRun(r));
  const out = { version: v, runs: runs.length, leaves: leaves.length };
  const hist = {}; runs.forEach((r) => { hist[r.won ? 'win' : r.wave] = (hist[r.won ? 'win' : r.wave] ?? 0) + 1; });
  out.deathWaves = hist;
  const killers = {}; runs.filter((r) => !r.won).forEach((r) => bump(killers, r.killer || '?', r.wave));
  out.killers = Object.entries(killers).map(([k, e]) => ({ killer: k, deaths: e.n, avgWave: avg(e.waves) })).sort((a, b) => b.deaths - a.deaths);
  const start = {}; runs.forEach((r) => bump(start, r.start || '?', r.wave));
  out.startHero = Object.entries(start).map(([k, e]) => ({ hero: k, runs: e.n, avgWave: avg(e.waves) })).sort((a, b) => b.runs - a.runs);
  const inSquad = {}; runs.forEach((r) => new Set(r.heroes.map((h) => h.id)).forEach((id) => bump(inSquad, id, r.wave)));
  out.inSquad = Object.entries(inSquad).map(([k, e]) => ({ hero: k, runs: e.n, avgWave: avg(e.waves) })).sort((a, b) => b.runs - a.runs);
  const spells = {}; runs.forEach((r) => Object.entries(r.spells ?? {}).forEach(([k, n]) => { const e = (spells[k] ??= { used: 0, total: 0 }); e.used++; e.total += n; }));
  out.spells = Object.entries(spells).map(([k, e]) => ({ spell: k, runsUsing: e.used, castsPerRun: +(e.total / Math.max(1, runs.length)).toFixed(1) }));
  const pw = [];
  for (let i = 0; i < 40; i++) { const rows = runs.map((r) => r.waves?.[i]).filter(Boolean); if (rows.length) pw.push({ wave: i + 1, runs: rows.length, sec: avg(rows.map((x) => x[0])), castleDmg: avg(rows.map((x) => x[1])), heroDeaths: avg(rows.map((x) => x[2])), kills: avg(rows.map((x) => x[3])), gold: avg(rows.map((x) => x[4])) }); }
  out.perWave = pw;
  const leave = {}; leaves.forEach((r) => bump(leave, `${r.wave} (${r.why || '?'})`)); out.quitPoints = Object.entries(leave).map(([k, e]) => ({ at: k, n: e.n })).sort((a, b) => b.n - a.n).slice(0, 15);
  const count = (list) => { const m = {}; list.forEach((k) => { if (k) m[k] = (m[k] ?? 0) + 1; }); return Object.entries(m).map(([k, n]) => ({ k, n })).sort((a, b) => b.n - a.n).slice(0, 15); };
  out.topCards = count(runs.flatMap((r) => r.cards ?? []));
  out.topRelics = count(runs.flatMap((r) => r.relics ?? []));
  out.topEvents = count(runs.flatMap((r) => r.events ?? []));
  out.topItems = count(runs.flatMap((r) => r.heroes.flatMap((h) => h.items.map((it) => (Array.isArray(it) ? it[0] : null)))));
  out.sites = count(rs.map((r) => r.site)); out.langs = count(rs.map((r) => r.lang));
  out.screens = count(rs.map((r) => (r.screen?.[0] && r.screen?.[1] ? (r.screen[0] / r.screen[1]).toFixed(2) : null)));
  return out;
}

function csv(runs) {
  const cols = ['ts', 'kind', 'v', 'site', 'lang', 'pid', 'run', 'wave', 'won', 'killer', 'citadel', 'wins', 'best', 'sec', 'gems', 'start', 'why', 'phase', 'orders', 'combo', 'towers', 'gold'];
  const js = ['heroes', 'relics', 'waves', 'ups', 'spells', 'events', 'cards', 'screen'];
  const esc = (x) => { const s = typeof x === 'object' && x !== null ? JSON.stringify(x) : String(x ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [cols.concat(js).join(','), ...runs.map((r) => cols.map((c) => esc(r[c])).concat(js.map((c) => esc(r[c]))).join(','))].join('\n');
}

const esc = (x) => String(x ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
const table = (title, head, rows) => rows.length ? `<h3>${title}</h3><table><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr>${rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</table>` : '';

function page(runs, version) {
  const s = summary(runs), d = details(runs, version);
  const versions = [...new Set(runs.filter((r) => !String(r.v).startsWith('test')).map((r) => r.v))];
  const bar = (n, max) => '█'.repeat(Math.max(1, Math.round((20 * n) / Math.max(1, max))));
  const hmax = Math.max(1, ...Object.values(d.deathWaves));
  const hrows = Object.entries(d.deathWaves).sort((a, b) => (a[0] === 'win') - (b[0] === 'win') || Number(a[0]) - Number(b[0])).map(([w, n]) => [w === 'win' ? '🏆 победа' : `волна ${w}`, n, bar(n, hmax)]);
  const last = runs.slice(-30).reverse().map((r) => [r.ts.slice(0, 16).replace('T', ' '), r.kind === 'leave' ? `выход (${r.why})` : 'забег', r.v, r.site, r.pid, r.run, r.wave + (r.won ? ' 🏆' : ''), `${r.citadel}%`, r.killer, r.heroes.map((h) => h.id).join(', ')]);
  return `<!doctype html><meta charset="utf-8"><title>Hold the Gate stats</title><style>body{font:14px system-ui;margin:20px}table{border-collapse:collapse;margin-bottom:24px}td,th{border:1px solid #ccc;padding:4px 8px;text-align:right}td:first-child,th:first-child{text-align:left}</style>
<h2>Записей: ${runs.length}, игроков: ${new Set(runs.map((r) => r.pid)).size}</h2>
${table('Сводка: версия × Цитадель', ['версия', 'Цитадель', 'забегов', 'игроков', 'ср. волна', 'медиана', 'побед'], s.map((g) => [g.version, g.citadel, g.runs, g.players, g.avgWave, g.medianWave, g.wins]))}
<p>Подробно для версии <b>${esc(d.version)}</b> (забегов ${d.runs}, выходов не доиграв ${d.leaves}). Другая версия: добавьте <code>&amp;v=…</code>. Версии: ${versions.map(esc).join(', ')}</p>
${table('Где умирают', ['волна', 'забегов', ''], hrows)}
${table('Кто убивает замок', ['враг', 'смертей', 'ср. волна'], d.killers.map((k) => [k.killer, k.deaths, k.avgWave]))}
${table('Стартовый герой', ['герой', 'забегов', 'ср. волна'], d.startHero.map((k) => [k.hero, k.runs, k.avgWave]))}
${table('Герой в отряде в конце забега', ['герой', 'забегов', 'ср. волна'], d.inSquad.map((k) => [k.hero, k.runs, k.avgWave]))}
${table('Заклинания', ['заклинание', 'забегов с ним', 'применений за забег'], d.spells.map((k) => [k.spell, k.runsUsing, k.castsPerRun]))}
${table('Кривая по волнам (в среднем)', ['волна', 'забегов дошло', 'секунд', 'урон замку', 'смертей героев', 'убийств', 'золота'], d.perWave.map((w) => [w.wave, w.runs, w.sec, w.castleDmg, w.heroDeaths, w.kills, w.gold]))}
${table('Где бросают (выход из забега)', ['волна (как)', 'раз'], d.quitPoints.map((q) => [q.at, q.n]))}
${table('Выбор карточек', ['герой:навык', 'раз'], d.topCards.map((x) => [x.k, x.n]))}
${table('Реликвии', ['реликвия', 'раз'], d.topRelics.map((x) => [x.k, x.n]))}
${table('Предметы в конце забега', ['предмет', 'раз'], d.topItems.map((x) => [x.k, x.n]))}
${table('События (событие:вариант)', ['выбор', 'раз'], d.topEvents.map((x) => [x.k, x.n]))}
${table('Сайты', ['сайт', 'записей'], d.sites.map((x) => [x.k, x.n]))}${table('Языки', ['язык', 'записей'], d.langs.map((x) => [x.k, x.n]))}${table('Экраны (ширина/высота)', ['пропорции', 'записей'], d.screens.map((x) => [x.k, x.n]))}
${table('Последние 30 записей', ['время UTC', 'тип', 'версия', 'сайт', 'игрок', 'забег №', 'волна', 'Цитадель', 'убийца', 'герои'], last)}`;
}

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'OPTIONS') return send(res, 204, '');
  if (req.method === 'POST' && url.pathname === '/run') {
    const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString().split(',')[0].trim();
    if (limited(ip)) return send(res, 429, 'slow down');
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 20000) req.destroy(); });
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
    const ver = url.searchParams.get('v') || '';
    if (url.searchParams.get('format') === 'json') return send(res, 200, JSON.stringify({ total: runs.length, players: new Set(runs.map((r) => r.pid)).size, groups: summary(runs), details: details(runs, ver) }, null, 2), 'application/json');
    return send(res, 200, page(runs, ver), 'text/html; charset=utf-8');
  }
  send(res, 404, 'not found');
}).listen(PORT, () => console.log(`stats server on :${PORT}, data in ${FILE}`));
