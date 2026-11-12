// Smart balance bot: aims spells at clusters, buys orders, picks cards by priority; `chain` plays a whole career (Citadel bought between runs).
// Usage: bun scripts/bot.ts   (prints one line per run; needs ~10 min, two parallel chains give a fair picture)
import { Game, WALL_X, CASTLE_MAX_HP, MAX_ITEMS, ORDERS, type Meta } from '../src/game';
import { META_UPGRADES, metaCost } from '../src/data';
import { skillById } from '../src/skills';
export interface Out { w: number; won: boolean; gems: number; loss: number[]; killer: string }
function pickCards(g: Game) {
  for (let p = g.pendingPick(); p; p = g.pendingPick()) {
    const score = (id: string) => { const s = skillById(id); return s.evolves ? 3 : s.hero === '*' ? 0 : s.active ? 2 : 1; };
    g.pickCard(p, [...p.cards!].sort((a, b) => score(b) - score(a))[0]);
  }
}
function shop(g: Game) {
  while (g.event) g.resolveEvent(Math.max(0, g.eventOptions().findIndex((o) => o.ok)));
  pickCards(g);
  if (g.castleHp < CASTLE_MAX_HP * 0.7) while (g.gold >= g.repairCost() && g.castleHp < CASTLE_MAX_HP * 0.9) g.repair();
  if (g.towerLevel < Math.ceil(g.wave / 3) && g.gold > g.towerCost() + 40) g.upgradeTowers();
  for (const h of g.heroes) while (h.items.length < MAX_ITEMS && g.bag.length) g.equip(g.bag[0].uid, h);
  for (let c = g.craftable(); c.length; c = g.craftable()) g.craft(c[0]);
  for (let k = 0; k < 20; k++) {
    const hero = [...g.heroes].filter((h) => h.items.length < MAX_ITEMS).sort((a, b) => a.items.length - b.items.length)[0]; let b = -1;
    g.offers.forEach((o, i) => { if (o && o.price <= g.gold && (b < 0 || o.price > g.offers[b]!.price)) b = i; });
    if (b < 0 || !hero) break; g.buy(b, hero);
  }
  for (const o of ORDERS) if (g.wave >= 2 && g.gold > g.orderCost(o.id) + 60) g.buyOrder(o.id);
  for (let k = 0; k < 10; k++) { const it = g.heroes.flatMap((h) => h.items).filter((x) => x.rarity < 3).sort((x, y) => g.upgradeCost(x) - g.upgradeCost(y))[0]; if (!it || g.gold < g.upgradeCost(it) + 100) break; g.upgradeItem(it.uid); }
  for (let k = 0; k < 30; k++) { const h = [...g.heroes].sort((a, b) => a.level - b.level)[0]; if (g.gold > h.trainCost() + 60) g.train(h); else break; }
  pickCards(g);
}
function spells(g: Game, t: number) {
  if (t % 20 !== 0) return;
  const front = g.enemies.filter((e) => e.active && e.x < WALL_X + 560);
  if (front.length) {
    let best: typeof front[0] | null = null, bn = 0;
    for (const e of front) { let n = 0; for (const o of front) if ((o.x - e.x) ** 2 + (o.y - e.y) ** 2 < 130 * 130) n++; if (e.def.boss) n += 6; if (n > bn) { bn = n; best = e; } }
    if (best && bn >= 5) { g.castSpell('fire', best.x, best.y); }
    if (best && bn >= 4) { g.castSpell('frost', best.x, best.y); }
    const tg = front.sort((a, b) => a.x - b.x)[0];
    if (tg && g.turrets.length < 2) g.castSpell('turret', tg.x - 40, tg.y);
  }
  if (g.heroes.some((h) => !h.alive || h.hp < h.stats.maxHp * 0.45)) g.castSpell('bless', 0, 0);
}
export function runOnce(ups: Record<string, number>, o: { hero?: string; maxWave?: number } = {}): Out {
  const g = new Game({}, Math.random, { load: () => ({ shards: 0, upgrades: ups, bestWave: 0, runs: 0, v: 2 } as Meta), save: () => {} });
  g.newRun(o.hero);
  const loss: number[] = []; let w = 1, killer = '';
  for (; w <= (o.maxWave ?? 30); w++) {
    shop(g);
    const hp0 = g.castleHp; g.startWave(); let t = 0;
    while (g.phase === 'battle' && t < 36000) { spells(g, t); g.update(1 / 60); t++; }
    if (g.phase === 'gameover') { const by: Record<string, number> = {}; for (const e of g.enemies) if (e.active) by[e.def.id] = (by[e.def.id] ?? 0) + 1; killer = Object.keys(by).sort((a, b) => by[b] - by[a])[0] ?? ''; }
    loss.push(Math.round(hp0 - g.castleHp));
    if (g.phase === 'gameover') break;
  }
  return { w: g.won ? 31 : w, won: g.won, gems: g.won ? g.lastShards : g.shardsFor(w - 1), loss, killer };
}
export function chain(maxRuns: number, stopFrac: number, log = true): string[] {
  const total = META_UPGRADES.reduce((s, u) => { for (let l = 0; l < u.max; l++) s += metaCost(u, l); return s; }, 0);
  const ups: Record<string, number> = {}; let bank = 0, spent = 0; const out: string[] = [];
  for (let n = 1; n <= maxRuns && spent < total * stopFrac; n++) {
    const r = runOnce(ups); bank += r.gems;
    for (;;) {
      const c = META_UPGRADES.filter((u) => (ups[u.id] ?? 0) < u.max && (!u.req || (ups[u.req] ?? 0) > 0)).map((u) => ({ u, p: metaCost(u, ups[u.id] ?? 0) })).filter((x) => x.p <= bank).sort((a, b) => a.p - b.p)[0];
      if (!c) break; bank -= c.p; spent += c.p; ups[c.u.id] = (ups[c.u.id] ?? 0) + 1;
    }
    const line = `run ${n}: wave ${r.w}${r.won ? ' WIN' : ''} gems ${r.gems} citadel ${Math.round(100 * spent / total)}% killer ${r.killer} lastLoss ${r.loss.slice(-2).join('/')}`;
    out.push(line); if (log) console.log(line);
  }
  return out;
}
if (import.meta.main) chain(40, 0.9);
