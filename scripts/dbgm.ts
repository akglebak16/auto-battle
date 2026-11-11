import { Game, CASTLE_MAX_HP, MAX_ITEMS, REPAIR_COST, ORDERS, type Meta } from '../src/game';
const ups = JSON.parse(process.argv[2] ?? '{}'); const spells = process.argv[3] === '1'; const runs = Number(process.argv[4] ?? 6);
const res: number[] = [];
for (let r = 0; r < runs; r++) {
  const g = new Game({}, Math.random, { load: () => ({ shards: 0, upgrades: ups, bestWave: 0, runs: 0, v: 2 } as Meta), save: () => {} });
  g.newRun();
  const pick = () => { for (let p = g.pendingPick(); p; p = g.pendingPick()) g.pickCard(p, p.cards![0]); };
  let w = 1;
  for (; w <= 30; w++) {
    pick();
    if (g.castleHp < CASTLE_MAX_HP * 0.6) while (g.gold >= g.repairCost() && g.castleHp < CASTLE_MAX_HP * 0.8) g.repair();
    if (g.towerLevel < Math.ceil(g.wave / 3) && g.gold > g.towerCost() + 40) g.upgradeTowers();
    for (const h of g.heroes) while (h.items.length < MAX_ITEMS && g.bag.length) g.equip(g.bag[0].uid, h);
    for (let c = g.craftable(); c.length; c = g.craftable()) g.craft(c[0]);
    for (let k = 0; k < 20; k++) { const hero = g.heroes.filter((h) => h.items.length < MAX_ITEMS).sort((a, b) => a.items.length - b.items.length)[0]; let b = -1; g.offers.forEach((o, i) => { if (o && o.price <= g.gold && (b < 0 || o.price > g.offers[b]!.price)) b = i; }); if (b < 0 || !hero) break; g.buy(b, hero); }
    for (let k = 0; k < 10; k++) { const it = g.heroes.flatMap((h) => h.items).filter((x) => x.rarity < 3).sort((x, y) => g.upgradeCost(x) - g.upgradeCost(y))[0]; if (!it || g.gold < g.upgradeCost(it) + 100) break; g.upgradeItem(it.uid); }
    for (let k = 0; k < 30; k++) { const h = [...g.heroes].sort((a, b) => a.level - b.level)[0]; if (g.gold > h.trainCost() + 60) g.train(h); else break; }
    pick();
    g.startWave();
    let t = 0;
    while (g.phase === 'battle' && t < 36000) { if (spells && t % 120 === 0) { const e = g.enemies.find((x) => x.active && x.y > 900); if (e) { g.castSpell('fire', e.x, e.y); g.castSpell('frost', e.x, e.y); } g.castSpell('bless', 0, 0); } g.update(1 / 60); t++; }
    if (r === 0 && w % 3 === 0) console.log(w, "castle", Math.round(g.castleHp), "hurt", Math.round(g.waveCastleDmg), "dead", g.waveHeroDeaths, "t", Math.round(t / 60), g.heroes.map((h) => h.def.id + h.level + "/" + h.items.map((i) => i.rarity).join("")).join(" "));
    if (g.phase === "gameover") break;
  }
  res.push(w);
  if (r === 0) console.log('gems', Math.round(g.runGems), 'heroes', g.heroes.length);
}
console.log(JSON.stringify(ups), spells ? 'spells' : '', 'died at', res.sort((a, b) => a - b).join(' '));
