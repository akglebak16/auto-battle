// Anonymous run stats for balancing: one small JSON per finished run goes to our Railway server (server/).
// No names, no IP stored; the player can switch it off in Settings («Анонимная статистика забегов»).
import type { Game } from './game';
import { META_UPGRADES, metaCost } from './data';
import { settings } from './settings';
import { lang } from './i18n';

/** Server address (Railway). Empty = telemetry off. */
export const TELEMETRY_URL: string = 'https://auto-battle-production.up.railway.app';
/** Bump on every balance change so runs of different versions are not mixed up. */
export const GAME_VERSION = '0.14.2-harder';

const ID_KEY = 'oplot-player-id';
function playerId(): string {
  try {
    let id = localStorage.getItem(ID_KEY);
    if (!id) { id = Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); localStorage.setItem(ID_KEY, id); }
    return id;
  } catch { return 'nostorage'; }
}

function site(): string {
  const h = location.hostname;
  if (location.protocol === 'file:' || navigator.userAgent.includes('Electron')) return 'exe';
  if (h.includes('itch')) return 'itch';
  if (h.endsWith('github.io')) return 'pages';
  return h || 'unknown';
}

/** Share of the whole Citadel tree bought, 0–100 (old saves from easier versions show up here). */
function citadelPct(g: Game): number {
  let total = 0, spent = 0;
  for (const u of META_UPGRADES) for (let l = 0; l < u.max; l++) { const c = metaCost(u, l); total += c; if (l < (g.meta.upgrades[u.id] ?? 0)) spent += c; }
  return total ? Math.round((100 * spent) / total) : 0;
}

export function sendRun(g: Game): void {
  if (!TELEMETRY_URL || !settings.stats) return;
  const body = {
    v: GAME_VERSION, site: site(), lang, pid: playerId(), run: g.meta.runs,
    wave: g.wave, won: g.won, killer: g.killer, citadel: citadelPct(g), wins: g.meta.wins ?? 0, best: g.meta.bestWave,
    heroes: g.heroes.map((h) => ({ id: h.def.id, lvl: h.level, items: h.items.map((it) => it.rarity) })),
    relics: g.relics, castle: g.castleLog, sec: Math.round(g.runTime), gems: g.lastShards,
  };
  try {
    // text/plain = a "simple" request, no CORS preflight; keepalive lets it finish if the tab closes.
    fetch(TELEMETRY_URL.replace(/\/$/, '') + '/run', { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'text/plain' }, keepalive: true }).catch(() => {});
  } catch { /* offline: drop it */ }
}
