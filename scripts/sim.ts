// Headless balance & performance check: a simple bot plays several runs in a row
// (the arsenal carries over between runs, like in the real game).
// Usage: npm run sim [-- maxWave] [firstHeroId|random] [runs]
import { Game, WALL_X, CASTLE_MAX_HP, MAX_ITEMS, REPAIR_COST, ORDERS, type Meta } from '../src/game';
import { waveSize, META_UPGRADES, metaCost } from '../src/data';
import { skillById } from '../src/skills';

const maxWave = Number(process.argv[2] ?? 25);
const first = process.argv[3] && process.argv[3] !== 'random' ? process.argv[3] : undefined;
const runs = Number(process.argv[4] ?? 1);

let saved = null as Meta | null;
const g = new Game({}, Math.random, { load: () => saved, save: (m) => { saved = JSON.parse(JSON.stringify(m)); } });
const DT = 1 / 60;

function pickCards(): void {
  for (let p = g.pendingPick(); p; p = g.pendingPick()) {
    // Prefer the hero's own active skills, then passives, then generic boosts.
    const score = (id: string) => { const s = skillById(id); return s.evolves ? 3 : s.hero === '*' ? 0 : s.active ? 2 : 1; };
    const best = [...p.cards!].sort((a, b) => score(b) - score(a))[0];
    g.pickCard(p, best);
  }
}

function shopBot(): void {
  while (g.event) g.resolveEvent(Math.max(0, g.eventOptions().findIndex((o) => o.ok)));
  pickCards();
  if (g.castleHp < CASTLE_MAX_HP * 0.6) while (g.gold >= REPAIR_COST && g.castleHp < CASTLE_MAX_HP * 0.8) g.repair();
  if (g.towerLevel < Math.ceil(g.wave / 3) && g.gold > g.towerCost() + 40) g.upgradeTowers();
  // Put bag items on heroes, craft whatever is possible, then buy the priciest affordable offers.
  for (const h of g.heroes) while (h.items.length < MAX_ITEMS && g.bag.length) g.equip(g.bag[0].uid, h);
  for (let c = g.craftable(); c.length; c = g.craftable()) g.craft(c[0]);
  for (let guard = 0; guard < 20; guard++) {
    const hero = [...g.heroes].filter((h) => h.items.length < MAX_ITEMS).sort((a, b) => a.items.length - b.items.length)[0];
    let best = -1;
    g.offers.forEach((o, i) => { if (o && o.price <= g.gold && (best < 0 || o.price > g.offers[best]!.price)) best = i; });
    if (best < 0 || !hero) break;
    g.buy(best, hero);
  }
  // One-wave orders are worth it only when gold is plentiful.
  for (const o of ORDERS) if (g.wave >= 6 && g.gold > g.orderCost(o.id) + 250) g.buyOrder(o.id);
  // Spare gold goes to the forge: upgrade the cheapest-to-upgrade worn item.
  for (let guard = 0; guard < 10; guard++) {
    const worn = g.heroes.flatMap((h) => h.items).filter((it) => it.rarity < 3).sort((x, y) => g.upgradeCost(x) - g.upgradeCost(y))[0];
    if (!worn || g.gold < g.upgradeCost(worn) + 100) break;
    g.upgradeItem(worn.uid);
  }
  for (let guard = 0; guard < 30; guard++) {
    const h = [...g.heroes].sort((a, b) => a.level - b.level)[0];
    if (g.gold > h.trainCost() + 60) g.train(h); else break;
  }
  pickCards();
}

for (let run = 1; run <= runs; run++) {
  // Between runs: spend glory shards on the cheapest permanent upgrades.
  g.toMenu();
  for (let bought = true; bought;) {
    bought = false;
    const next = META_UPGRADES.filter((u) => g.up(u.id) < u.max && g.nodeOpen(u.id)).sort((a, b) => metaCost(a, g.up(a.id)) - metaCost(b, g.up(b.id)))[0];
    if (next && g.buyUpgrade(next.id)) bought = true;
  }
  g.newRun(first);
  console.log(`--- run ${run}: gems ${saved?.shards ?? 0}, starts with ${g.heroes[0].def.id}, shards left ${g.meta.shards}, citadel ${JSON.stringify(g.meta.upgrades)}`);
  for (let w = 1; w <= maxWave; w++) {
    shopBot();
    if (!g.startWave()) throw new Error('could not start wave');
    let ticks = 0, peak = 0, worst = 0;
    const t0 = performance.now();
    while (g.phase === 'battle' && ticks < 60 * 600) {
      const s = performance.now();
      if (ticks % 120 === 0 && g.enemies.length) { const tg = g.enemies.find((x) => x.active && x.x < WALL_X + 520); if (tg) g.castSpell('turret', tg.x - 60, tg.y); const e = g.enemies.find((x) => x.active && x.x < WALL_X + 420); if (e) { g.castSpell('fire', e.x, e.y); g.castSpell('frost', e.x, e.y); } if (g.heroes.some((h) => !h.alive || h.hp < h.stats.maxHp * 0.4)) g.castSpell('bless', 0, 0); }
      g.update(DT);
      worst = Math.max(worst, performance.now() - s);
      peak = Math.max(peak, g.enemies.length);
      ticks++;
    }
    const ms = performance.now() - t0;
    const team = g.heroes.map((h) => `${h.def.id}:L${h.level}/${h.items.length}i/${Object.entries(h.skills).map(([k, r]) => k + r).join(',')}`).join(' ');
    console.log(
      `wave ${String(w).padStart(2)} | size ${String(waveSize(w)).padStart(3)} | peak ${String(peak).padStart(3)} | ` +
      `${(ticks / 60).toFixed(0)}s | castle ${Math.max(0, Math.round(g.castleHp))} | gold ${g.gold} | ` +
      `hurt ${Math.round(g.waveCastleDmg)} | dead ${g.waveHeroDeaths} | ${(ms / ticks).toFixed(3)}ms/tick | ${team}`,
    );
    if (g.phase === 'gameover') { console.log(`GAME OVER on wave ${w}, +${g.lastShards} gems`); break; }
  }
}
