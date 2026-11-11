// Game simulation. No DOM or canvas here, so it also runs headless (scripts/sim.ts).
import {
  HEROES, ITEMS, ENEMIES, RECIPES, RARITY, MAX_RARITY, MERGE_COUNT, META_UPGRADES, metaCost,
  buildWave, waveHpScale, itemTierUnlocked, scaleMods,
  type HeroDef, type ItemDef, type EnemyDef, type SpawnEntry,
} from './data';
import { SK, rollCards, skillById } from './skills';

// ---------- world layout: the castle is at the bottom, the horde comes from the top ----------
export const WORLD_W = 1600;
export const WORLD_H = 1500;
export const WALL_Y = 1330; // front edge of the castle wall
export const GATE_X0 = 640; // enemies converge on the gate between these x
export const GATE_X1 = 960;
export const TOWERS = [{ x: 560, y: 1372 }, { x: 1040, y: 1372 }];
export const TOWER_RANGE = 380;
export const TOWER_MAX_LEVEL = 10;
const HERO_POSTS = [{ x: 800, y: 1165 }, { x: 610, y: 1225 }, { x: 990, y: 1225 }];

export const CASTLE_MAX_HP = 1500;
export const MAX_ITEMS = 4;
export const START_GOLD = 150;
export const REROLL_COST = 10;
export const REPAIR_COST = 50;
export const REPAIR_AMOUNT = 250;
/** Squad level (sum of hero levels) at which hero #2 and #3 join the run. */
export const RECRUIT_AT = [3, 8];
const CELL = 48;
const HERO_RADIUS = 13;
const RUSH_AFTER = 60;

export type Phase = 'menu' | 'battle' | 'shop' | 'gameover';

export interface Stats {
  maxHp: number; dmg: number; atkSpeed: number; range: number; armor: number;
  lifesteal: number; splash: number; regen: number; move: number;
}

// ---------- persistent progress (survives between runs) ----------
export interface Meta {
  shards: number; // glory shards: currency for permanent upgrades
  upgrades: Record<string, number>; // META_UPGRADES id -> level
  bestWave: number;
  runs: number;
}
/** An item owned during a run: base item + rarity (0 grey .. 3 orange). */
export interface OwnedItem { uid: number; def: ItemDef; rarity: number }
export interface Offer { def: ItemDef; rarity: number; price: number }
/** Shop price multiplier by rarity. */
export const PRICE_MULT = [1, 2.8, 7, 15];
export interface Storage { load(): Meta | null; save(m: Meta): void }
const emptyMeta = (): Meta => ({ shards: 0, upgrades: {}, bestWave: 0, runs: 0 });
const itemById = (id: string): ItemDef | undefined => ITEMS.find((i) => i.id === id);

export class Hero {
  level = 1;
  xp = 0;
  skills: Record<string, number> = {}; // skill id -> rank
  cds: Record<string, number> = {}; // active skill cooldowns
  pending = 0; // level-up cards still to pick
  cards: string[] | null = null; // current card offer
  x = 0; y = 0; homeX = 0; homeY = 0;
  hp = 0;
  alive = true;
  cd = 0;
  target: Enemy | null = null;
  targetGen = 0;
  retarget = 0;
  stats!: Stats;
  flash = 0;
  face = 1;
  anim = 0;
  animMax = 0.22; // length of the current attack/cast animation
  animCast = false; // true while the skill-cast animation plays
  aimX = 0; aimY = 0; // where the current attack is aimed (for the swing direction)
  moving = false;
  chase = false;
  tauntT = 0; // armor bonus timer from Провокация
  kills = 0;
  metaPct = 0; // permanent "Закалка" bonus from the citadel
  constructor(public def: HeroDef, public items: OwnedItem[]) {
    this.recalc();
    this.hp = this.stats.maxHp;
  }

  rank(id: string): number { return this.skills[id] ?? 0; }

  recalc(): void {
    const d = this.def;
    const lv = (1 + 0.15 * (this.level - 1)) * (1 + this.metaPct);
    let dmg = d.dmg * lv, dmgPct = 0, atkPct = 0, hp = d.hp * lv, armor = d.armor + (this.level - 1);
    let range = d.range, lifesteal = d.lifesteal, splash = d.splash, regen = 0, hpPct = 0;
    for (const it of this.items) {
      const m = scaleMods(it.def.mods, RARITY[it.rarity].mult);
      dmg += m.dmg ?? 0; dmgPct += m.dmgPct ?? 0; atkPct += m.atkSpeedPct ?? 0; hp += m.hp ?? 0;
      armor += m.armor ?? 0; range += m.range ?? 0; lifesteal += m.lifesteal ?? 0;
      splash += m.splash ?? 0; regen += m.regen ?? 0;
    }
    const r = (id: string) => this.rank(id);
    dmgPct += r('might') * SK.might.dmg;
    hpPct += r('vigor') * SK.vigor.hp;
    atkPct += r('haste') * SK.haste.atk;
    if (r('bulwark')) { hpPct += SK.bulwark.hp[r('bulwark') - 1]; regen += SK.bulwark.regen[r('bulwark') - 1]; }
    if (r('inferno')) { splash *= 1 + SK.inferno.splash[r('inferno') - 1]; dmgPct += SK.inferno.dmg[r('inferno') - 1]; }
    const oldMax = this.stats?.maxHp ?? hp;
    this.stats = {
      maxHp: Math.round(hp * (1 + hpPct)), dmg: dmg * (1 + dmgPct), atkSpeed: d.atkSpeed * (1 + atkPct), range, armor,
      lifesteal, splash, regen, move: d.move,
    };
    if (this.hp > 0) this.hp = Math.min(this.stats.maxHp, this.hp + Math.max(0, this.stats.maxHp - oldMax));
  }

  xpToNext(): number { return Math.round(18 * Math.pow(this.level, 1.55)); }
  trainCost(): number { return 30 + 25 * this.level; }
}

export class Enemy {
  def!: EnemyDef;
  x = 0; y = 0; hp = 0; maxHp = 0; cd = 0; dmg = 0;
  active = false;
  gen = 0; // bumped on every reuse so stale references can be detected
  flash = 0;
  face = 1;
  anim = 0;
  stun = 0;
  burnDps = 0; burnT = 0; burnBy: Hero | null = null;
  tauntBy: Hero | null = null; tauntT = 0;
}

interface Projectile {
  active: boolean;
  x: number; y: number;
  target: Enemy | null; gen: number; tx: number; ty: number;
  owner: Hero | null; dmg: number; splash: number; speed: number;
  color: string; enemyShot: boolean; heroTarget: Hero | null; crit: boolean;
}

export interface Effect {
  active: boolean;
  kind: 'ring' | 'puff' | 'heal' | 'text' | 'line' | 'meteor';
  x: number; y: number; x2: number; y2: number; r: number; life: number; max: number; color: string; text: string;
}

interface Delayed { x: number; y: number; t: number; r: number; dmg: number; owner: Hero }

export type Sfx = 'arrow' | 'fireball' | 'tower' | 'hit' | 'kill' | 'boom' | 'bash' | 'taunt' | 'volley' | 'pierce'
  | 'meteor' | 'levelup' | 'herodeath' | 'castle' | 'horn' | 'victory' | 'defeat' | 'recruit' | 'coin' | 'pick';
export interface GameEvents { onChange?: () => void; onSound?: (s: Sfx) => void }

export class Game {
  phase: Phase = 'menu';
  wave = 0;
  gold = START_GOLD;
  castleHp = CASTLE_MAX_HP;
  heroes: Hero[] = [];
  offers: (Offer | null)[] = [];
  bag: OwnedItem[] = []; // items owned this run that no hero wears
  lastShards = 0;
  private uidSeq = 0;
  time = 0;
  waveTime = 0;
  spawnQueue: SpawnEntry[] = [];
  spawnIdx = 0;
  kills = 0;
  waveKills = 0;
  waveGold = 0;
  lastWaveBonus = 0;
  towerLevel = 1;
  news: string[] = []; // messages for the shop screen (new hero joined etc.)
  meta: Meta;
  rnd: () => number;

  enemies: Enemy[] = [];
  private pool: Enemy[] = [];
  projectiles: Projectile[] = [];
  effects: Effect[] = [];
  private delayed: Delayed[] = [];
  private towerCd = [0, 0];
  private cols = Math.ceil(WORLD_W / CELL) + 3;
  private rows = Math.ceil(WORLD_H / CELL) + 3;
  private grid: Enemy[][] = [];

  constructor(public events: GameEvents = {}, rnd: () => number = Math.random, private storage?: Storage) {
    this.rnd = rnd;
    for (let i = 0; i < this.cols * this.rows; i++) this.grid.push([]);
    // Merge with defaults so saves from older versions still load.
    this.meta = { ...emptyMeta(), ...(storage?.load() ?? {}) };
    this.meta.upgrades ??= {};
  }

  // ---------- runs ----------

  /** Starts a new run with one random hero. Permanent upgrades from the citadel apply. */
  newRun(firstHero?: string): void {
    this.clearField();
    const def = firstHero ? HEROES.find((h) => h.id === firstHero)! : HEROES[Math.floor(this.rnd() * HEROES.length)];
    this.heroes = [];
    this.bag = [];
    this.addHero(def, 1);
    this.wave = 0;
    this.gold = START_GOLD + 40 * this.up('treasury');
    this.castleHp = this.castleMax();
    this.kills = 0;
    this.lastShards = 0;
    this.towerLevel = 1 + this.up('towers');
    this.news = [`Забег начался. Ваш первый герой — ${def.name} (${def.title}).`];
    this.rollOffers();
    this.phase = 'shop';
    this.changed();
  }

  toMenu(): void {
    this.clearField();
    this.heroes = [];
    this.bag = [];
    this.phase = 'menu';
    this.changed();
  }

  resetProgress(): void {
    this.meta = emptyMeta();
    this.save();
    this.changed();
  }

  /** Level of a permanent upgrade. */
  up(id: string): number { return this.meta.upgrades[id] ?? 0; }

  castleMax(): number { return Math.round(CASTLE_MAX_HP * (1 + 0.15 * this.up('walls'))); }

  buyUpgrade(id: string): boolean {
    const u = META_UPGRADES.find((x) => x.id === id);
    if (!u || this.phase !== 'menu') return false;
    const lvl = this.up(id);
    const cost = metaCost(u, lvl);
    if (lvl >= u.max || this.meta.shards < cost) return false;
    this.meta.shards -= cost;
    this.meta.upgrades[id] = lvl + 1;
    this.sfx('levelup');
    this.save();
    this.changed();
    return true;
  }

  /** Glory shards for a finished run: more for deeper waves. */
  shardsFor(wavesCleared: number, kills: number): number {
    let s = 0;
    for (let i = 1; i <= wavesCleared; i++) s += 1 + Math.floor(i / 2);
    return s + Math.floor(kills / 100);
  }

  squadLevel(): number { return this.heroes.reduce((s, h) => s + h.level, 0); }

  /** Squad level needed for the next hero, or null when everyone has joined. */
  nextRecruitAt(): number | null {
    const idx = this.heroes.length - 1;
    return idx < RECRUIT_AT.length && this.heroes.length < HEROES.length ? RECRUIT_AT[idx] : null;
  }

  private addHero(def: HeroDef, level: number): Hero {
    const h = new Hero(def, []);
    h.metaPct = 0.08 * this.up('hardy_' + def.id);
    h.level = level + this.up('mentor_' + def.id);
    h.pending = h.level - 1; // a late joiner gets the card picks for its levels
    h.recalc();
    h.hp = h.stats.maxHp;
    this.heroes.push(h);
    this.layoutHeroes();
    return h;
  }

  private checkRecruit(): void {
    for (;;) {
      const need = this.nextRecruitAt();
      if (need === null || this.squadLevel() < need) return;
      const left = HEROES.filter((d) => !this.heroes.some((h) => h.def.id === d.id));
      const def = left[Math.floor(this.rnd() * left.length)];
      const avg = this.squadLevel() / this.heroes.length;
      const h = this.addHero(def, Math.max(1, Math.round(avg * 0.7)));
      this.sfx('recruit');
      this.news.push(`К отряду присоединился ${def.name} (${def.title}), уровень ${h.level}!`);
    }
  }

  // ---------- shop, bag, forge (all within one run) ----------

  rollOffers(): void {
    const pool = ITEMS.filter((it) => itemTierUnlocked(it.tier, this.wave + 1));
    this.offers = [];
    for (let i = 0; i < 5; i++) {
      const def = pool[Math.floor(this.rnd() * pool.length)];
      // Later waves sometimes offer blue / purple items straight away.
      const r = this.rnd();
      const rarity = this.wave + 1 >= 9 && r < 0.05 ? 2 : this.wave + 1 >= 4 && r < 0.15 ? 1 : 0;
      this.offers.push({ def, rarity, price: Math.round(def.cost * PRICE_MULT[rarity]) });
    }
  }

  reroll(): boolean {
    if (this.gold < REROLL_COST || this.phase !== 'shop') return false;
    this.gold -= REROLL_COST;
    this.rollOffers();
    this.changed();
    return true;
  }

  /** Every item the squad owns, with where it is. */
  allItems(): { item: OwnedItem; hero: Hero | null }[] {
    const out: { item: OwnedItem; hero: Hero | null }[] = this.bag.map((item) => ({ item, hero: null }));
    for (const h of this.heroes) for (const item of h.items) out.push({ item, hero: h });
    return out;
  }

  private findItem(uid: number): { item: OwnedItem; hero: Hero | null } | undefined {
    return this.allItems().find((x) => x.item.uid === uid);
  }

  private removeItem(uid: number): void {
    this.bag = this.bag.filter((i) => i.uid !== uid);
    for (const h of this.heroes) {
      if (h.items.some((i) => i.uid === uid)) { h.items = h.items.filter((i) => i.uid !== uid); h.recalc(); }
    }
  }

  /** Puts an item on `hero` if it has a free slot, otherwise into the bag. */
  private place(item: OwnedItem, hero: Hero | null): void {
    if (hero && hero.items.length < MAX_ITEMS) { hero.items.push(item); hero.recalc(); }
    else this.bag.push(item);
  }

  private newItem(def: ItemDef, rarity: number): OwnedItem { return { uid: ++this.uidSeq, def, rarity }; }

  /** Buys an offer; it goes onto `hero` if there is a free slot, else into the bag. */
  buy(offerIdx: number, hero?: Hero): boolean {
    const o = this.offers[offerIdx];
    if (!o || this.phase !== 'shop' || this.gold < o.price) return false;
    this.gold -= o.price;
    this.offers[offerIdx] = null;
    this.place(this.newItem(o.def, o.rarity), hero ?? null);
    this.sfx('coin');
    this.mergeAll();
    this.changed();
    return true;
  }

  equip(uid: number, hero: Hero): boolean {
    const f = this.findItem(uid);
    if (!f || f.hero || hero.items.length >= MAX_ITEMS || this.phase !== 'shop') return false;
    this.removeItem(uid);
    this.place(f.item, hero);
    this.changed();
    return true;
  }

  unequip(uid: number): void {
    const f = this.findItem(uid);
    if (!f || !f.hero || this.phase !== 'shop') return;
    this.removeItem(uid);
    this.bag.push(f.item);
    this.changed();
  }

  sellValue(it: OwnedItem): number { return Math.floor((it.def.cost * PRICE_MULT[it.rarity]) / 2); }

  sell(uid: number): void {
    const f = this.findItem(uid);
    if (!f || this.phase !== 'shop') return;
    this.removeItem(uid);
    this.gold += this.sellValue(f.item);
    this.sfx('coin');
    this.changed();
  }

  /** Gold price to raise an item's rarity by one step at the forge. */
  upgradeCost(it: OwnedItem): number {
    return Math.round(it.def.cost * (it.rarity + 1) * 1.6 * (1 - 0.15 * this.up('forge')));
  }

  upgradeItem(uid: number): boolean {
    const f = this.findItem(uid);
    if (!f || this.phase !== 'shop' || f.item.rarity >= MAX_RARITY) return false;
    const cost = this.upgradeCost(f.item);
    if (this.gold < cost) return false;
    this.gold -= cost;
    f.item.rarity++;
    f.hero?.recalc();
    this.sfx('pick');
    this.mergeAll();
    this.changed();
    return true;
  }

  /** Recipes the squad can craft right now (both ingredients owned). */
  craftable(): number[] {
    const ids = this.allItems().map((x) => x.item.def.id);
    return RECIPES.map((r, i) => (ids.includes(r.a) && ids.includes(r.b) ? i : -1)).filter((i) => i >= 0);
  }

  craft(recipeIdx: number): boolean {
    const r = RECIPES[recipeIdx];
    if (!r || this.phase !== 'shop') return false;
    const all = this.allItems();
    // Use the highest-rarity copies; the result keeps the better rarity of the two.
    const pickBest = (id: string) => all.filter((x) => x.item.def.id === id).sort((a, b) => b.item.rarity - a.item.rarity)[0];
    const a = pickBest(r.a), b = pickBest(r.b);
    if (!a || !b) return false;
    this.removeItem(a.item.uid);
    this.removeItem(b.item.uid);
    const def = itemById(r.result)!;
    const item = this.newItem(def, Math.max(a.item.rarity, b.item.rarity));
    this.place(item, a.hero ?? b.hero);
    this.news.push(`Кузница: ${a.item.def.name} + ${b.item.def.name} → ${def.name} (${RARITY[item.rarity].name.toLowerCase()})!`);
    this.sfx('recruit');
    this.mergeAll();
    this.changed();
    return true;
  }

  /** 3 identical items (same id and rarity) merge into one of the next rarity. */
  private mergeAll(): void {
    for (let guard = 0; guard < 20; guard++) {
      const groups = new Map<string, { item: OwnedItem; hero: Hero | null }[]>();
      for (const x of this.allItems()) {
        if (x.item.rarity >= MAX_RARITY) continue;
        const k = x.item.def.id + ':' + x.item.rarity;
        (groups.get(k) ?? groups.set(k, []).get(k)!).push(x);
      }
      const full = [...groups.values()].find((g) => g.length >= MERGE_COUNT);
      if (!full) return;
      // Prefer consuming bag copies; the result goes to the first hero that wore one.
      const used = full.sort((a, b) => (a.hero ? 1 : 0) - (b.hero ? 1 : 0)).slice(0, MERGE_COUNT);
      const wearer = used.find((x) => x.hero)?.hero ?? null;
      for (const x of used) this.removeItem(x.item.uid);
      const merged = this.newItem(used[0].item.def, used[0].item.rarity + 1);
      this.place(merged, wearer);
      this.news.push(`Слияние: 3× ${merged.def.name} → ${RARITY[merged.rarity].name.toLowerCase()} ${merged.def.name}!`);
      this.sfx('levelup');
    }
  }

  train(hero: Hero): boolean {
    const cost = hero.trainCost();
    if (this.gold < cost || this.phase !== 'shop') return false;
    this.gold -= cost;
    this.levelUp(hero);
    this.checkRecruit();
    this.changed();
    return true;
  }

  repair(): boolean {
    if (this.gold < REPAIR_COST || this.castleHp >= this.castleMax() || this.phase !== 'shop') return false;
    this.gold -= REPAIR_COST;
    this.castleHp = Math.min(this.castleMax(), this.castleHp + REPAIR_AMOUNT);
    this.changed();
    return true;
  }

  towerDmg(level = this.towerLevel): number { return 9 + 7 * (level - 1); }
  towerRate(level = this.towerLevel): number { return 0.9 + 0.12 * (level - 1); }
  towerCost(): number { return 60 + 55 * this.towerLevel; }

  upgradeTowers(): boolean {
    if (this.phase !== 'shop' || this.towerLevel >= TOWER_MAX_LEVEL || this.gold < this.towerCost()) return false;
    this.gold -= this.towerCost();
    this.towerLevel++;
    this.changed();
    return true;
  }

  // ---------- level-up cards ----------

  /** The hero whose card pick is waiting (cards are rolled on demand). */
  pendingPick(): Hero | null {
    const h = this.heroes.find((x) => x.pending > 0) ?? null;
    if (h && !h.cards) h.cards = rollCards(h.def.id, h.skills, this.rnd);
    return h;
  }

  pickCard(hero: Hero, skillId: string): boolean {
    if (!hero.cards || !hero.cards.includes(skillId) || hero.pending <= 0) return false;
    const sk = skillById(skillId);
    hero.skills[skillId] = Math.min(sk.maxRank, hero.rank(skillId) + 1);
    if (sk.active && hero.cds[skillId] === undefined) hero.cds[skillId] = 1;
    hero.pending--;
    hero.cards = null;
    hero.recalc();
    this.sfx('pick');
    this.changed();
    return true;
  }

  startWave(): boolean {
    if (this.phase !== 'shop' || this.heroes.some((h) => h.pending > 0)) return false;
    this.wave++;
    this.news = [];
    this.spawnQueue = buildWave(this.wave, this.rnd);
    this.spawnIdx = 0;
    this.waveTime = 0;
    this.waveKills = 0;
    this.waveGold = 0;
    for (const h of this.heroes) {
      h.alive = true;
      h.hp = h.stats.maxHp;
      h.x = h.homeX; h.y = h.homeY;
      h.target = null; h.cd = 0; h.tauntT = 0;
      for (const k of Object.keys(h.cds)) h.cds[k] = 1 + this.rnd() * 2;
    }
    this.projectiles.forEach((p) => (p.active = false));
    this.delayed = [];
    this.phase = 'battle';
    this.sfx('horn');
    this.changed();
    return true;
  }

  enemiesLeft(): number {
    return this.enemies.length + (this.spawnQueue.length - this.spawnIdx);
  }

  private layoutHeroes(): void {
    // The tank takes the centre-front post, the others the flanks.
    const order = [...this.heroes].sort((a, b) => a.def.range - b.def.range);
    order.forEach((h, i) => {
      const p = HERO_POSTS[i] ?? HERO_POSTS[0];
      h.homeX = p.x; h.homeY = p.y; h.x = p.x; h.y = p.y;
    });
  }

  private levelUp(h: Hero): void {
    h.level++;
    h.xp = 0;
    h.pending++;
    h.recalc();
    h.hp = Math.min(h.stats.maxHp, h.hp + h.stats.maxHp * 0.3);
    this.effect('text', h.x, h.y - 40, 0, 1.2, '#ffe36e', 'УРОВЕНЬ ' + h.level);
    this.sfx('levelup');
  }

  private sfx(s: Sfx): void { this.events.onSound?.(s); }
  private save(): void { this.storage?.save(this.meta); }
  private changed(): void { this.events.onChange?.(); }

  private clearField(): void {
    this.enemies.forEach((e) => (e.active = false));
    this.pool.push(...this.enemies);
    this.enemies = [];
    this.projectiles.forEach((p) => (p.active = false));
    this.effects.forEach((f) => (f.active = false));
    this.delayed = [];
  }

  // ---------- simulation ----------

  update(dt: number): void {
    if (this.phase !== 'battle') {
      this.updateEffects(dt);
      return;
    }
    this.time += dt;
    this.waveTime += dt;

    while (this.spawnIdx < this.spawnQueue.length && this.spawnQueue[this.spawnIdx].at <= this.waveTime) {
      this.spawn(this.spawnQueue[this.spawnIdx].type);
      this.spawnIdx++;
    }

    this.rebuildGrid();
    this.updateTowers(dt);
    this.updateHeroes(dt);
    this.updateDelayed(dt);
    this.updateEnemies(dt);
    this.updateProjectiles(dt);
    this.updateEffects(dt);
    this.compactEnemies();

    if (this.castleHp <= 0) {
      this.castleHp = 0;
      this.phase = 'gameover';
      this.meta.bestWave = Math.max(this.meta.bestWave, this.wave - 1);
      this.meta.runs++;
      this.lastShards = this.shardsFor(this.wave - 1, this.kills);
      this.meta.shards += this.lastShards;
      this.save();
      this.sfx('defeat');
      this.changed();
      return;
    }
    if (this.spawnIdx >= this.spawnQueue.length && this.enemies.length === 0) this.endWave();
  }

  private endWave(): void {
    this.lastWaveBonus = 30 + this.wave * 10;
    this.gold += this.lastWaveBonus;
    this.castleHp = Math.min(this.castleMax(), this.castleHp + 30);
    this.projectiles.forEach((p) => (p.active = false));
    this.meta.bestWave = Math.max(this.meta.bestWave, this.wave);
    this.save();
    this.sfx('victory');
    this.checkRecruit();
    this.rollOffers();
    this.phase = 'shop';
    this.changed();
  }

  private spawn(type: string): void {
    const def = ENEMIES[type];
    const e = this.pool.pop() ?? new Enemy();
    e.def = def;
    e.active = true;
    e.gen++;
    e.maxHp = e.hp = Math.round(def.hp * waveHpScale(this.wave));
    e.dmg = def.dmg; // fixed per type
    // Mostly from the top edge, some from the upper sides.
    const side = this.rnd();
    if (side < 0.8) { e.x = 40 + this.rnd() * (WORLD_W - 80); e.y = -20 - this.rnd() * 60; }
    else { e.x = side < 0.9 ? -20 : WORLD_W + 20; e.y = this.rnd() * 600; }
    e.cd = this.rnd();
    e.flash = 0; e.anim = 0; e.stun = 0; e.burnT = 0; e.burnDps = 0; e.burnBy = null; e.tauntBy = null; e.tauntT = 0;
    this.enemies.push(e);
  }

  private compactEnemies(): void {
    let j = 0;
    const arr = this.enemies;
    for (let i = 0; i < arr.length; i++) {
      const e = arr[i];
      if (e.active) arr[j++] = e;
      else this.pool.push(e);
    }
    arr.length = j;
  }

  private rebuildGrid(): void {
    for (const c of this.grid) c.length = 0;
    for (const e of this.enemies) if (e.active) this.grid[this.cellIndex(e.x, e.y)].push(e);
  }

  // Cells are offset by 1 so units slightly outside the world (spawning) still map correctly.
  private cellIndex(x: number, y: number): number {
    const cx = Math.min(this.cols - 1, Math.max(0, Math.floor(x / CELL) + 1));
    const cy = Math.min(this.rows - 1, Math.max(0, Math.floor(y / CELL) + 1));
    return cy * this.cols + cx;
  }

  /** Calls fn for each active enemy whose cell overlaps the circle. */
  private forEachNear(x: number, y: number, r: number, fn: (e: Enemy) => void): void {
    const x0 = Math.max(0, Math.floor((x - r) / CELL) + 1);
    const x1 = Math.min(this.cols - 1, Math.floor((x + r) / CELL) + 1);
    const y0 = Math.max(0, Math.floor((y - r) / CELL) + 1);
    const y1 = Math.min(this.rows - 1, Math.floor((y + r) / CELL) + 1);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const cell = this.grid[cy * this.cols + cx];
        for (let i = 0; i < cell.length; i++) if (cell[i].active) fn(cell[i]);
      }
    }
  }

  private nearestEnemy(x: number, y: number, r: number, except?: Set<Enemy>): Enemy | null {
    let best: Enemy | null = null;
    let bestD = r * r;
    this.forEachNear(x, y, r, (e) => {
      if (except?.has(e)) return;
      const dx = e.x - x, dy = e.y - y;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = e; }
    });
    return best;
  }

  private countNear(x: number, y: number, r: number): number {
    let n = 0;
    this.forEachNear(x, y, r, (e) => { if (dist2(e.x, e.y, x, y) <= r * r) n++; });
    return n;
  }

  private updateTowers(dt: number): void {
    TOWERS.forEach((t, i) => {
      this.towerCd[i] -= dt;
      if (this.towerCd[i] > 0) return;
      const e = this.nearestEnemy(t.x, t.y, TOWER_RANGE);
      if (!e) return;
      this.towerCd[i] = 1 / this.towerRate();
      this.shoot(t.x, t.y - 30, e, this.towerDmg(), 0, 650, '#e8e2c8', null, false);
      this.sfx('tower');
    });
  }

  private updateHeroes(dt: number): void {
    for (const h of this.heroes) {
      if (!h.alive) continue;
      const s = h.stats;
      h.flash = Math.max(0, h.flash - dt);
      h.tauntT = Math.max(0, h.tauntT - dt);
      if (s.regen > 0) h.hp = Math.min(s.maxHp, h.hp + s.regen * dt);
      h.cd -= dt;
      for (const k in h.cds) h.cds[k] -= dt;
      this.castSkills(h);

      // Targeting: prefer enemies near the guard post so heroes hold their part of the line.
      const leash = s.range < 60 ? 230 : 140;
      h.retarget -= dt;
      if (!h.target || !h.target.active || h.target.gen !== h.targetGen || h.retarget <= 0) {
        h.retarget = 0.25;
        h.target = this.nearestEnemy(h.homeX, h.homeY, s.range + leash);
        h.chase = false;
        if (!h.target) {
          // Nothing near the post: go hunt the closest enemy anywhere (e.g. shamans shooting from afar).
          h.target = this.nearestEnemy(h.x, h.y, WORLD_W);
          h.chase = !!h.target;
        }
        if (h.target) h.targetGen = h.target.gen;
      }

      h.anim = Math.max(0, h.anim - dt);
      h.moving = false;
      const t = h.target;
      if (t) {
        const dx = t.x - h.x, dy = t.y - h.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        const reach = s.range + t.def.radius + HERO_RADIUS * 0.5;
        h.face = dx >= 0 ? 1 : -1;
        if (d > reach) {
          const nx = h.x + (dx / d) * s.move * dt;
          const ny = Math.min(WALL_Y - 20, h.y + (dy / d) * s.move * dt);
          if (h.chase || dist2(nx, ny, h.homeX, h.homeY) <= (s.range + leash + 20) ** 2) { h.x = nx; h.y = ny; h.moving = true; }
        } else if (h.cd <= 0) {
          h.cd = 1 / s.atkSpeed;
          // Attack animation: never longer than the attack interval, so fast heroes don't freeze mid-swing.
          h.animMax = Math.min(0.26, h.cd * 0.85);
          h.anim = h.animMax; h.animCast = false;
          h.aimX = t.x; h.aimY = t.y;
          if (s.range >= 60) this.heroRangedAttack(h, t);
          else this.meleeHit(h, t);
        }
      } else {
        const dx = h.homeX - h.x, dy = h.homeY - h.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > 2) {
          h.x += (dx / d) * s.move * dt; h.y += (dy / d) * s.move * dt;
          h.moving = true; h.face = dx >= 0 ? 1 : -1;
        }
      }
    }
  }

  // ---------- hero skills ----------

  private ready(h: Hero, id: string): number {
    const r = h.rank(id);
    return r > 0 && (h.cds[id] ?? 0) <= 0 ? r : 0;
  }

  private castSkills(h: Hero): void {
    const s = h.stats;
    let r: number;
    if ((r = this.ready(h, 'shieldBash')) && this.countNear(h.x, h.y, SK.shieldBash.radius) >= 2) {
      const R = SK.shieldBash.radius;
      const stun = SK.shieldBash.stun[r - 1];
      this.forEachNear(h.x, h.y, R, (e) => {
        if (dist2(e.x, e.y, h.x, h.y) > R * R) return;
        e.stun = Math.max(e.stun, stun);
        this.damageEnemy(e, s.dmg * SK.shieldBash.dmg[r - 1], h);
      });
      this.cast(h, 'shieldBash', r);
      this.sfx('bash');
      this.effect('ring', h.x, h.y, R, 0.35, 'rgba(140,190,255,0.9)', '');
    }
    if ((r = this.ready(h, 'taunt')) && this.countNear(h.x, h.y, SK.taunt.radius[r - 1]) >= 4) {
      const R = SK.taunt.radius[r - 1];
      this.forEachNear(h.x, h.y, R, (e) => {
        if (dist2(e.x, e.y, h.x, h.y) <= R * R) { e.tauntBy = h; e.tauntT = SK.taunt.dur; }
      });
      h.tauntT = SK.taunt.dur;
      this.cast(h, 'taunt', r);
      this.sfx('taunt');
      this.effect('ring', h.x, h.y, R, 0.5, 'rgba(255,90,60,0.7)', '');
    }
    if ((r = this.ready(h, 'volley'))) {
      const n = SK.volley.arrows[r - 1];
      const picked = new Set<Enemy>();
      for (let i = 0; i < n; i++) {
        const e = this.nearestEnemy(h.x, h.y, s.range + 40, picked);
        if (!e) break;
        picked.add(e);
        this.shoot(h.x, h.y - 10, e, s.dmg * SK.volley.dmg, s.splash, 700, '#d9f7a0', h, false);
      }
      if (picked.size) { this.cast(h, 'volley', r); this.sfx('volley'); }
    }
    if ((r = this.ready(h, 'pierce'))) {
      const t = this.nearestEnemy(h.x, h.y, s.range + 40);
      if (t) {
        const dx = t.x - h.x, dy = t.y - h.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const len = SK.pierce.len;
        const ex = h.x + (dx / d) * len, ey = h.y + (dy / d) * len;
        const dmg = s.dmg * SK.pierce.dmg[r - 1];
        for (const e of this.enemies) {
          if (e.active && segDist2(e.x, e.y, h.x, h.y, ex, ey) <= (e.def.radius + 6) ** 2) this.damageEnemy(e, dmg, h);
        }
        this.effectLine(h.x, h.y - 10, ex, ey, '#f4ffb0');
        this.cast(h, 'pierce', r);
        this.sfx('pierce');
      }
    }
    if ((r = this.ready(h, 'meteor'))) {
      // Aim at the densest cluster among a sample of nearby enemies.
      let best: Enemy | null = null, bestN = 0, tries = 0;
      this.forEachNear(h.x, h.y, s.range + 200, (e) => {
        if (tries++ > 40) return;
        const n = this.countNear(e.x, e.y, 80);
        if (n > bestN) { bestN = n; best = e; }
      });
      const b = best as Enemy | null;
      if (b && bestN >= 3) {
        const inf = h.rank('inferno');
        const R = SK.meteor.radius[r - 1] * (1 + (inf ? SK.inferno.splash[inf - 1] : 0));
        this.delayed.push({ x: b.x, y: b.y, t: SK.meteor.delay, r: R, dmg: s.dmg * SK.meteor.dmg[r - 1], owner: h });
        this.effect('meteor', b.x, b.y, R, SK.meteor.delay, '#ff7a1f', '');
        this.cast(h, 'meteor', r);
      }
    }
    if ((r = this.ready(h, 'ring')) && this.countNear(h.x, h.y, SK.ring.radius) >= 3) {
      const R = SK.ring.radius;
      this.forEachNear(h.x, h.y, R, (e) => {
        const dd = dist2(e.x, e.y, h.x, h.y);
        if (dd > R * R) return;
        const d = Math.sqrt(dd) || 1;
        e.x += ((e.x - h.x) / d) * SK.ring.push;
        e.y += ((e.y - h.y) / d) * SK.ring.push;
        this.damageEnemy(e, s.dmg * SK.ring.dmg[r - 1], h);
      });
      this.effect('ring', h.x, h.y, R, 0.45, 'rgba(255,120,30,0.95)', '');
      this.cast(h, 'ring', r);
      this.sfx('boom');
    }
  }

  private cast(h: Hero, id: string, rank: number): void {
    const sk = skillById(id);
    h.cds[id] = sk.cd!(rank);
    h.anim = h.animMax = 0.35; h.animCast = true;
    this.effect('text', h.x, h.y - 46, 0, 1, '#bfe3ff', sk.name + '!');
  }

  private updateDelayed(dt: number): void {
    for (let i = this.delayed.length - 1; i >= 0; i--) {
      const m = this.delayed[i];
      m.t -= dt;
      if (m.t > 0) continue;
      this.delayed.splice(i, 1);
      this.forEachNear(m.x, m.y, m.r, (e) => {
        if (dist2(e.x, e.y, m.x, m.y) <= m.r * m.r) this.damageEnemy(e, m.dmg, m.owner);
      });
      this.effect('ring', m.x, m.y, m.r, 0.5, 'rgba(255,170,40,0.95)', '');
      this.effect('puff', m.x, m.y, m.r * 0.6, 0.5, 'rgba(255,110,20,0.6)', '');
      this.sfx('meteor');
    }
  }

  private heroRangedAttack(h: Hero, t: Enemy): void {
    const s = h.stats;
    const critR = h.rank('crit');
    const crit = critR > 0 && this.rnd() < SK.crit.chance[critR - 1];
    const speed = h.def.role === 'mage' ? 430 : 680;
    this.shoot(h.x, h.y - 10, t, s.dmg * (crit ? 2 : 1), s.splash, speed, crit ? '#fff36b' : h.def.color, h, crit);
    this.sfx(h.def.role === 'mage' ? 'fireball' : 'arrow');
    const ms = h.rank('multishot');
    if (ms) {
      const used = new Set<Enemy>([t]);
      for (let i = 0; i < SK.multishot.extra[ms - 1]; i++) {
        const e = this.nearestEnemy(t.x, t.y, 160, used);
        if (!e) break;
        used.add(e);
        this.shoot(h.x, h.y - 10, e, s.dmg * SK.multishot.dmg, s.splash, speed, h.def.color, h, false);
      }
    }
  }

  private meleeHit(h: Hero, t: Enemy): void {
    const s = h.stats;
    this.damageEnemy(t, s.dmg, h);
    this.sfx('hit');
    if (s.splash > 0) {
      const r = s.splash;
      this.forEachNear(t.x, t.y, r, (e) => {
        if (e !== t && dist2(e.x, e.y, t.x, t.y) <= r * r) this.damageEnemy(e, s.dmg * 0.5, h);
      });
      this.effect('ring', t.x, t.y, r, 0.2, 'rgba(255,255,255,0.6)', '');
    }
  }

  private shoot(x: number, y: number, t: Enemy, dmg: number, splash: number, speed: number, color: string, owner: Hero | null, crit: boolean): void {
    const p = this.allocProjectile();
    p.x = x; p.y = y;
    p.target = t; p.gen = t.gen; p.tx = t.x; p.ty = t.y;
    p.owner = owner; p.dmg = dmg; p.splash = splash; p.speed = speed;
    p.color = color; p.enemyShot = false; p.heroTarget = null; p.crit = crit;
  }

  private allocProjectile(): Projectile {
    for (const p of this.projectiles) if (!p.active) { p.active = true; return p; }
    const p: Projectile = {
      active: true, x: 0, y: 0, target: null, gen: 0, tx: 0, ty: 0, owner: null, dmg: 0, splash: 0,
      speed: 0, color: '#fff', enemyShot: false, heroTarget: null, crit: false,
    };
    this.projectiles.push(p);
    return p;
  }

  private updateProjectiles(dt: number): void {
    for (const p of this.projectiles) {
      if (!p.active) continue;
      if (!p.enemyShot && p.target && p.target.active && p.target.gen === p.gen) { p.tx = p.target.x; p.ty = p.target.y; }
      if (p.enemyShot && p.heroTarget && p.heroTarget.alive) { p.tx = p.heroTarget.x; p.ty = p.heroTarget.y; }
      const dx = p.tx - p.x, dy = p.ty - p.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      const step = p.speed * dt;
      if (d > step) { p.x += (dx / d) * step; p.y += (dy / d) * step; continue; }
      p.active = false;
      if (p.enemyShot) {
        if (p.heroTarget) { if (p.heroTarget.alive) this.damageHero(p.heroTarget, p.dmg, null); }
        else { this.castleHp -= p.dmg; this.sfx('castle'); }
        continue;
      }
      const alive = p.target && p.target.active && p.target.gen === p.gen;
      if (p.splash > 0) {
        const r = p.splash;
        this.forEachNear(p.tx, p.ty, r, (e) => {
          if (dist2(e.x, e.y, p.tx, p.ty) <= r * r) this.damageEnemy(e, e === p.target ? p.dmg : p.dmg * 0.7, p.owner);
        });
        this.effect('ring', p.tx, p.ty, r, 0.3, 'rgba(255,140,40,0.8)', '');
        if (p.owner?.def.role === 'mage') this.sfx('boom');
      } else if (alive) {
        this.damageEnemy(p.target!, p.dmg, p.owner);
      }
    }
  }

  private damageEnemy(e: Enemy, amount: number, by: Hero | null, quiet = false): void {
    if (!e.active) return;
    const dealt = amount * (1 - e.def.armor / (e.def.armor + 20));
    e.hp -= dealt;
    if (!quiet) e.flash = 0.08;
    if (by && by.alive) {
      if (by.stats.lifesteal > 0) by.hp = Math.min(by.stats.maxHp, by.hp + dealt * by.stats.lifesteal);
      const ig = by.rank('ignite');
      if (ig && !quiet) { e.burnDps = Math.max(e.burnDps, amount * SK.ignite.dps[ig - 1]); e.burnT = SK.ignite.dur; e.burnBy = by; }
    }
    if (e.hp <= 0) {
      e.active = false;
      this.kills++;
      this.waveKills++;
      const gold = Math.round(e.def.gold * (1 + 0.1 * this.up('taxes')));
      this.gold += gold;
      this.waveGold += gold;
      if (by) by.kills++;
      this.sfx('kill');
      this.effect('puff', e.x, e.y, e.def.radius * 1.6, 0.35, e.def.color, '');
      if (e.def.gold >= 5) this.effect('text', e.x, e.y - 14, 0, 0.9, '#ffd84a', '+' + e.def.gold);
      // XP is shared so every hero levels up.
      for (const h of this.heroes) {
        if (!h.alive) continue;
        h.xp += e.def.xp * (1 + 0.1 * this.up('drill'));
        if (h.xp >= h.xpToNext()) this.levelUp(h);
      }
    }
  }

  private damageHero(h: Hero, amount: number, attacker: Enemy | null): void {
    const armor = h.stats.armor + (h.tauntT > 0 ? SK.taunt.armor[Math.max(0, h.rank('taunt') - 1)] : 0);
    const dealt = amount * (1 - armor / (armor + 25));
    h.hp -= dealt;
    h.flash = 0.1;
    const th = h.rank('thorns');
    if (th && attacker) this.damageEnemy(attacker, dealt * SK.thorns.reflect[th - 1], h, true);
    if (h.hp <= 0) {
      h.alive = false;
      h.hp = 0;
      this.effect('puff', h.x, h.y, 26, 0.6, h.def.color, '');
      this.effect('text', h.x, h.y - 30, 0, 1.4, '#ff6b6b', h.def.name + ' пал');
      this.sfx('herodeath');
    }
  }

  private updateEnemies(dt: number): void {
    // Failsafe against stalemates: once everything has spawned and the wave drags on,
    // the remaining enemies stop duelling heroes and storm the walls (towers finish them).
    const lastAt = this.spawnQueue.length ? this.spawnQueue[this.spawnQueue.length - 1].at : 0;
    const rush = this.spawnIdx >= this.spawnQueue.length && this.waveTime > lastAt + RUSH_AFTER;
    for (const e of this.enemies) {
      if (!e.active) continue;
      const d = e.def;
      e.cd -= dt;
      e.flash = Math.max(0, e.flash - dt);
      e.anim = Math.max(0, e.anim - dt);
      if (e.burnT > 0) {
        e.burnT -= dt;
        this.damageEnemy(e, e.burnDps * dt, e.burnBy, true);
        if (!e.active) continue;
      }
      if (e.stun > 0) { e.stun -= dt; continue; }
      if (e.tauntT > 0) e.tauntT -= dt;

      // Heroes come first: hunt the nearest living hero anywhere on the field.
      // The castle is attacked only when every hero has fallen (or in the rush failsafe).
      let target: Hero | null = null;
      if (e.tauntT > 0 && e.tauntBy?.alive) target = e.tauntBy;
      else if (!d.ignoresHeroes && !rush) {
        let best = Infinity;
        for (const h of this.heroes) {
          if (!h.alive) continue;
          const dd = dist2(e.x, e.y, h.x, h.y);
          if (dd < best) { best = dd; target = h; }
        }
      }

      if (target) {
        const dx = target.x - e.x, dy = target.y - e.y;
        const dd = Math.sqrt(dx * dx + dy * dy);
        const reach = d.range + d.radius + HERO_RADIUS;
        e.face = dx >= 0 ? 1 : -1;
        if (dd > reach) {
          e.x += (dx / dd) * d.speed * dt;
          e.y += (dy / dd) * d.speed * dt;
        } else if (e.cd <= 0) {
          e.cd = 1 / d.atkSpeed;
          e.anim = 0.2;
          if (d.range > 40) this.enemyShot(e, target);
          else this.damageHero(target, e.dmg, e);
        }
      } else {
        // March on the castle gate.
        const tx = Math.min(GATE_X1, Math.max(GATE_X0, e.x));
        const stopY = WALL_Y - d.radius - d.range;
        if (e.y < stopY) {
          const dx = tx - e.x, dy = stopY - e.y;
          const dd = Math.sqrt(dx * dx + dy * dy) || 1;
          e.x += (dx / dd) * d.speed * dt;
          e.y += (dy / dd) * d.speed * dt;
          if (Math.abs(dx) > 2) e.face = dx >= 0 ? 1 : -1;
        } else if (e.cd <= 0) {
          e.cd = 1 / d.atkSpeed;
          e.anim = 0.2;
          if (d.range > 40) this.enemyShot(e, null);
          else { this.castleHp -= e.dmg; this.sfx('castle'); }
        }
      }

      // Separation so crowds spread out instead of stacking into one dot.
      const r = d.radius;
      this.forEachNear(e.x, e.y, r + 12, (o) => {
        if (o === e) return;
        const dx = e.x - o.x, dy = e.y - o.y;
        const min = r + o.def.radius;
        const dd = dx * dx + dy * dy;
        if (dd > 0.01 && dd < min * min) {
          const dist = Math.sqrt(dd);
          const push = ((min - dist) / dist) * 0.25;
          e.x += dx * push; e.y += dy * push;
        }
      });
      if (e.y > WALL_Y - r) e.y = WALL_Y - r;
    }
  }

  private enemyShot(e: Enemy, h: Hero | null): void {
    const p = this.allocProjectile();
    p.x = e.x; p.y = e.y;
    p.target = null; p.gen = 0;
    p.heroTarget = h;
    p.tx = h ? h.x : e.x; p.ty = h ? h.y : WALL_Y;
    p.owner = null; p.dmg = e.dmg; p.splash = 0; p.speed = 300;
    p.color = '#c78bff'; p.enemyShot = true; p.crit = false;
  }

  effect(kind: Effect['kind'], x: number, y: number, r: number, life: number, color: string, text: string): Effect | undefined {
    let fx: Effect | undefined;
    for (const f of this.effects) if (!f.active) { fx = f; break; }
    if (!fx) {
      if (this.effects.length > 700) return undefined; // hard cap, effects are cosmetic
      fx = { active: true, kind, x, y, x2: 0, y2: 0, r, life, max: life, color, text };
      this.effects.push(fx);
    }
    fx.active = true; fx.kind = kind; fx.x = x; fx.y = y; fx.r = r; fx.life = life; fx.max = life; fx.color = color; fx.text = text;
    return fx;
  }

  private effectLine(x: number, y: number, x2: number, y2: number, color: string): void {
    const fx = this.effect('line', x, y, 0, 0.3, color, '');
    if (fx) { fx.x2 = x2; fx.y2 = y2; }
  }

  private updateEffects(dt: number): void {
    for (const f of this.effects) {
      if (!f.active) continue;
      f.life -= dt;
      if (f.kind === 'text') f.y -= 30 * dt;
      if (f.life <= 0) f.active = false;
    }
  }
}

function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy;
}

/** Squared distance from point (px,py) to segment (ax,ay)-(bx,by). */
function segDist2(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const vx = bx - ax, vy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy)));
  return dist2(px, py, ax + vx * t, ay + vy * t);
}
