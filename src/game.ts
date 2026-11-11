// Game simulation. No DOM or canvas here, so it also runs headless (scripts/sim.ts).
import {
  HEROES, ITEMS, ENEMIES, RECIPES, RARITY, MAX_RARITY, MERGE_COUNT, META_UPGRADES, metaCost, EFFECTS,
  SPELLS, RELICS, SYNERGIES, BIOMES, SKELETON, LOCKED_HEROES, gemScale, goldScale, buildWave, waveHpScale, waveDmgScale, itemTierUnlocked, scaleMods, offerRarityOdds,
  type HeroDef, type ItemDef, type EnemyDef, type SpawnEntry, type ItemEffect,
} from './data';
import { SK, rollCards, skillById } from './skills';

// ---------- world layout: the castle is at the bottom, the horde comes from the top ----------
export const WORLD_W = 1600;
export const WORLD_H = 1420;
export const WALL_Y = 1330; // front edge of the castle wall
export const GATE_X0 = 640; // enemies converge on the gate between these x
export const GATE_X1 = 960;
export const TOWERS = [{ x: 560, y: 1372 }, { x: 1040, y: 1372 }];
export const TOWER_RANGE = 470;
export const TOWER_MAX_LEVEL = 10;
const HERO_POSTS = [{ x: 800, y: 1150 }, { x: 640, y: 1262 }, { x: 960, y: 1262 }];
/** Top of the playable field: enemies enter just above it, the camera never shows more. */
export const FIELD_TOP = WORLD_H - 900;

export const CASTLE_MAX_HP = 1500;
export const MAX_ITEMS = 4;
export const START_GOLD = 150;
export const REROLL_COST = 10; // base; grows with each reroll in the same shop and with the wave
export const REPAIR_COST = 50;
export const REPAIR_AMOUNT = 250;
/** Squad level (sum of hero levels) at which hero #2 and #3 join the run. */
export const RECRUIT_AT = [3, 8];
const CELL = 48;
const HERO_RADIUS = 13;
const RUSH_AFTER = 60;

/** One-wave orders bought in the shop (gold sinks that scale with the wave). */
export const ORDERS = [
  { id: 'horn', icon: '📯', name: 'Боевой рог', desc: '+30% скорости атаки героям', base: 50, perWave: 9 },
  { id: 'tar', icon: '🛢️', name: 'Кипящая смола', desc: 'враги у стены горят', base: 40, perWave: 8 },
  { id: 'militia', icon: '🏹', name: 'Лучники на стенах', desc: 'башни стреляют вдвое чаще', base: 45, perWave: 8 },
  { id: 'bounty', icon: '💰', name: 'Награда за головы', desc: '+50% золота за убийства', base: 35, perWave: 6 },
] as const;
export type OrderId = typeof ORDERS[number]['id'];

export type Phase = 'menu' | 'battle' | 'shop' | 'gameover';

export interface Stats {
  maxHp: number; dmg: number; atkSpeed: number; range: number; armor: number;
  lifesteal: number; splash: number; regen: number; move: number;
  cdMult: number; // skill cooldown multiplier (Сосредоточение)
}

// ---------- persistent progress (survives between runs) ----------
export interface Meta {
  shards: number; // glory shards: currency for permanent upgrades
  upgrades: Record<string, number>; // META_UPGRADES id -> level
  bestWave: number;
  runs: number;
  startHero?: string; // chosen first hero (citadel 'Право выбора')
  v?: number; // save format version (2 = citadel tree + gems)
}
/** An item owned during a run: base item + rarity (0 grey .. 3 orange). */
export interface OwnedItem { uid: number; def: ItemDef; rarity: number }
export interface Offer { def: ItemDef; rarity: number; price: number; sale: boolean; locked: boolean }
/** Shop price multiplier by rarity. */
export const PRICE_MULT = [1, 2.5, 6, 12];
export interface Storage { load(): Meta | null; save(m: Meta): void; loadRun?(): string | null; saveRun?(s: string | null): void }
const emptyMeta = (): Meta => ({ shards: 0, upgrades: {}, bestWave: 0, runs: 0, v: 2 });
const itemById = (id: string): ItemDef | undefined => ITEMS.find((i) => i.id === id);
export const BLOOD = ['#a31b1b', '#7d1111', '#c92d2d', '#5e0d0d'];
/** A blood stain, or (with `type`) a corpse to bake into the ground once `at` (wave time) is reached. */
export interface Splat { x: number; y: number; r: number; c: string; type?: string; face?: number; at?: number }

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
  minion = false; life = 0; owner: Hero | null = null; // summoned skeletons
  stunT = 0; // stunned by a boss slam
  deadT = 0; // Полевой лекарь: seconds until the fallen hero stands up
  kiteT = 0; kiteCd = 0; kx = 0; ky = 0; // ranged heroes step back from melee threats
  kills = 0;
  metaPct = 0; // permanent "Закалка" bonus from the citadel
  attacks = 0; // basic attacks this wave (for "every N-th attack" effects)
  revived = false; // Перо феникса already used this wave
  fx: Partial<Record<ItemEffect, number>> = {}; // special item effects: best rarity owned
  constructor(public def: HeroDef, public items: OwnedItem[]) {
    this.recalc();
    this.hp = this.stats.maxHp;
  }

  rank(id: string): number { return this.skills[id] ?? 0; }

  recalc(): void {
    const d = this.def;
    const lv = (1 + 0.15 * (this.level - 1)) * (1 + this.metaPct);
    let dmg = d.dmg * lv, dmgPct = 0, atkPct = 0, hp = d.hp * lv, armor = d.armor + (this.level - 1);
    let range = d.range >= 60 ? d.range * BIOME_RANGE : d.range, lifesteal = d.lifesteal, splash = d.splash, regen = 0, hpPct = 0;
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
    armor += r('guard') * SK.guard.armor;
    lifesteal += r('leech') * SK.leech.lifesteal;
    this.fx = {};
    for (const it of this.items) {
      const e = it.def.effect;
      if (e) this.fx[e] = Math.max(this.fx[e] ?? -1, it.rarity);
    }
    const oldMax = this.stats?.maxHp ?? hp;
    this.stats = {
      maxHp: Math.round(hp * (1 + hpPct)), dmg: dmg * (1 + dmgPct), atkSpeed: d.atkSpeed * (1 + atkPct), range, armor,
      lifesteal, splash, regen, move: d.move * BIOME_MOVE, cdMult: 1 - r('focus') * SK.focus.cd,
    };
    if (this.hp > 0) this.hp = Math.min(this.stats.maxHp, this.hp + Math.max(0, this.stats.maxHp - oldMax));
  }

  xpToNext(): number { return Math.round(18 * Math.pow(this.level, 1.55)); }
  trainCost(): number { return Math.round((30 + 20 * this.level + 1.2 * this.level * this.level) * TRAIN_MUL); }
}

/** Elite goblins: tougher variants with a glow and double loot. */
export const ELITES: Record<string, { name: string; color: string; hp: number; speed: number; armor: number; regen: number }> = {
  shield: { name: 'Бронированный', color: '#8fd8ff', hp: 3, speed: 1, armor: 10, regen: 0 },
  swift: { name: 'Стремительный', color: '#ffe36e', hp: 2, speed: 1.6, armor: 0, regen: 0 },
  troll: { name: 'Живучий', color: '#7dff8a', hp: 2.5, speed: 1, armor: 0, regen: 0.03 },
};

// Battlefield modifiers (set when a run starts or continues; read by Hero.recalc).
let BIOME_MOVE = 1, BIOME_RANGE = 1, TRAIN_MUL = 1;

export class Enemy {
  def!: EnemyDef;
  special = 0; // boss ability timer
  elite = ''; // '' or a key of ELITES
  spdMul = 1; armorAdd = 0; regen = 0;
  x = 0; y = 0; hp = 0; maxHp = 0; cd = 0; dmg = 0;
  active = false;
  gen = 0; // bumped on every reuse so stale references can be detected
  flash = 0;
  face = 1;
  anim = 0;
  stun = 0;
  burnDps = 0; burnT = 0; burnBy: Hero | null = null;
  tauntBy: Hero | null = null; tauntT = 0;
  slow = 0; slowT = 0; // Ледяной осколок
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
  kind: 'boom' | 'ring' | 'puff' | 'heal' | 'text' | 'line' | 'meteor' | 'bit' | 'num' | 'bolt' | 'corpse' | 'gem' | 'frost' | 'bless';
  x: number; y: number; x2: number; y2: number; r: number; life: number; max: number; color: string; text: string;
}

export interface RunEvent { id: string; relics?: string[]; item?: { id: string; rarity: number; price: number } }
export const EVENT_INFO: Record<string, { title: string; icon: string; text: string }> = {
  relic_chest: { title: 'Забытый сундук', icon: '🧰', text: 'В обозе павшего рыцаря нашёлся сундук. Внутри три странные вещицы — унести можно одну.' },
  blood_altar: { title: 'Алтарь крови', icon: '🩸', text: 'Древний алтарь шепчет: отдай камень своих стен — получишь силу.' },
  merchant: { title: 'Бродячий торговец', icon: '🐫', text: 'Пыльный караван остановился у ворот. У купца есть кое-что редкое.' },
  mercenary: { title: 'Раненый наёмник', icon: '🤕', text: 'Наёмник просит приюта. Он может поделиться опытом — или золотом.' },
  cursed: { title: 'Проклятое знамя', icon: '🏴', text: 'Гоблины подняли проклятое знамя. Следующая волна будет злее, но и добыча богаче.' },
  gem_vein: { title: 'Алмазная жила', icon: '💎', text: 'Сапёры наткнулись на жилу под стенами.' },
  smith: { title: 'Кузнец-странник', icon: '⚒️', text: 'Странствующий кузнец предлагает свои услуги.' },
};

interface Delayed { x: number; y: number; t: number; r: number; dmg: number; owner: Hero | null }

export type Sfx = 'squish' | 'roar' | 'summon' | 'drain' | 'arrow' | 'fireball' | 'tower' | 'hit' | 'kill' | 'boom' | 'bash' | 'taunt' | 'volley' | 'pierce'
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
  runGems = 0; // glory gems picked up this run (banked when the run ends)
  relics: string[] = []; // passive bonuses for this run
  event: RunEvent | null = null; // pending event in the camp (must be resolved before the wave)
  curse = false; // Проклятое знамя: next wave stronger, double loot
  combo = 0; // kills in the current burst ("Дикая Резня")
  burst = false; // a kill burst is going on
  killTimes: number[] = []; // wave times of recent kills (last 2.5 s)
  minions: Hero[] = []; // Морра's skeletons
  biome = 'forest';
  private corpses: { x: number; y: number }[] = []; // for the necromancer boss
  comboBest = 0; // biggest combo this wave (for the camp report)
  lastCombo: { n: number; gold: number; t: number } | null = null; // finished combo for the UI popup
  slowmo = 0; // seconds of slow motion left (read by the main loop)
  timers: { t: number; fn: () => void }[] = []; // short timed callbacks (boss shields)
  private powderCount = 0;
  spellCd: Record<string, number> = {}; // player spell cooldowns
  blessT = 0; // Благословение: faster hero attacks while > 0
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
  rerolls = 0; // rerolls in the current shop visit
  orders = new Set<OrderId>(); // bought for the next wave
  shake = 0; // screen shake strength (cosmetic, read by the renderer)
  fieldId = 0; // bumped when the battlefield is wiped (the renderer clears blood then)
  splats: Splat[] = []; // blood stains waiting to be painted by the renderer
  castleFlash = 0; // red flash on the wall after a hit
  waveCastleDmg = 0;
  waveHeroDeaths = 0;
  private blasts: { x: number; y: number; dmg: number; owner: Hero | null }[] = []; // Лесной пожар
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
    if (this.meta.v !== 2) {
      // Old flat citadel: refund everything as gems at the new scale.
      const spent = Object.values(this.meta.upgrades).reduce((a, l) => a + l * 60, 0);
      this.meta = { ...this.meta, shards: Math.round(this.meta.shards * 5 + spent), upgrades: {}, v: 2 };
      this.save();
    }
  }

  // ---------- runs ----------

  /** Starts a new run with one random hero. Permanent upgrades from the citadel apply. */
  newRun(firstHero?: string): void {
    this.clearField();
    const avail = this.availableHeroes();
    const chosen = this.up('pick_start') && this.meta.startHero ? avail.find((h) => h.id === this.meta.startHero) : undefined;
    const def = firstHero ? HEROES.find((h) => h.id === firstHero)! : chosen ?? avail[Math.floor(this.rnd() * avail.length)];
    const biomes = Object.keys(BIOMES);
    this.setBiome(this.meta.runs === 0 ? 'forest' : biomes[Math.floor(this.rnd() * biomes.length)]);
    this.minions = [];
    this.heroes = [];
    this.bag = [];
    this.addHero(def, 1);
    this.wave = 0;
    this.gold = START_GOLD + 40 * this.up('treasury');
    this.castleHp = this.castleMax();
    this.kills = 0;
    this.lastShards = 0;
    this.runGems = 0;
    this.relics = [];
    this.event = null;
    this.curse = false;
    if (this.up('relic_hunter')) this.relics.push(RELICS[Math.floor(this.rnd() * RELICS.length)].id);
    this.updateRunMods();
    this.storage?.saveRun?.(null);
    this.spellCd = {};
    this.blessT = 0;
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

  castleMax(): number { return Math.round(CASTLE_MAX_HP * (1 + 0.12 * this.up('walls'))); }

  /** Can this citadel node be bought at all (its parent opened)? */
  nodeOpen(id: string): boolean {
    const u = META_UPGRADES.find((x) => x.id === id);
    return !!u && (!u.req || this.up(u.req) > 0);
  }

  /** A kill streak ended: big ones pay a little bonus gold. */
  private endCombo(): void {
    if (this.burst) {
      const gold = Math.floor(this.combo / 3);
      this.gold += gold; this.waveGold += gold;
      this.lastCombo = { n: this.combo, gold, t: this.time };
    }
    this.combo = 0; this.burst = false;
  }

  availableHeroes(): HeroDef[] { return HEROES.filter((d) => !LOCKED_HEROES[d.id] || this.up(LOCKED_HEROES[d.id]) > 0); }

  setStartHero(id: string): void { if (this.phase === 'menu') { this.meta.startHero = id; this.save(); this.changed(); } }

  private setBiome(b: string): void {
    this.biome = b;
    BIOME_MOVE = b === 'snow' ? 0.85 : 1;
    BIOME_RANGE = b === 'swamp' ? 0.8 : 1;
  }

  /** Two relics that together give an extra bonus. */
  hasSyn(id: string): boolean {
    const sy = SYNERGIES.find((x) => x.id === id)!;
    return this.relics.includes(sy.a) && this.relics.includes(sy.b);
  }

  private updateRunMods(): void {
    TRAIN_MUL = this.hasSyn('scholar') ? 0.75 : 1;
    for (const h of this.heroes) h.recalc();
  }

  hasRelic(id: string): boolean { return this.relics.includes(id); }

  // ---------- events between waves ----------

  private rollEvent(): RunEvent {
    if (!this.relics.length && this.wave <= 3) return { id: 'relic_chest', relics: this.relicChoices(3) };
    const ids = Object.keys(EVENT_INFO);
    const id = ids[Math.floor(this.rnd() * ids.length)];
    if (id === 'relic_chest') return { id, relics: this.relicChoices(3) };
    if (id === 'merchant') {
      const pool = ITEMS.filter((it) => it.tier === 3);
      const def = pool[Math.floor(this.rnd() * pool.length)];
      return { id, item: { id: def.id, rarity: 2, price: Math.round(def.cost * PRICE_MULT[2] * 0.55) } };
    }
    return { id };
  }

  private relicChoices(n: number): string[] {
    const left = RELICS.filter((r) => !this.relics.includes(r.id)).map((r) => r.id);
    for (let i = left.length - 1; i > 0; i--) { const j = Math.floor(this.rnd() * (i + 1)); [left[i], left[j]] = [left[j], left[i]]; }
    return left.slice(0, n);
  }

  /** Choices of the pending event: label, description, whether it can be taken now. */
  eventOptions(): { label: string; desc: string; ok: boolean }[] {
    const ev = this.event;
    if (!ev) return [];
    const w = this.wave;
    const leave = { label: 'Уйти', desc: 'Ничего не делать', ok: true };
    const rel = (id: string) => RELICS.find((r) => r.id === id)!;
    switch (ev.id) {
      case 'relic_chest': return ev.relics!.map((id) => {
        const syn = SYNERGIES.filter((x) => (x.a === id && this.relics.includes(x.b)) || (x.b === id && this.relics.includes(x.a)));
        return { label: `${rel(id).icon} ${rel(id).name}`, desc: rel(id).desc + syn.map((x) => ` ⚡ синергия: ${x.name}`).join(''), ok: true };
      });
      case 'blood_altar': return [{ label: '🩸 Отдать 25% здоровья замка', desc: 'Получить случайную реликвию', ok: this.castleHp > this.castleMax() * 0.3 }, leave];
      case 'merchant': {
        const it = ev.item!, def = ITEMS.find((x) => x.id === it.id)!;
        return [{ label: `${def.icon} ${RARITY[it.rarity].name} ${def.name} — ${it.price} 🪙`, desc: 'Попадёт в сумку', ok: this.gold >= it.price }, leave];
      }
      case 'mercenary': return [{ label: '🎓 Обучить героя', desc: '+1 уровень случайному герою', ok: true }, { label: `🪙 +${80 + 10 * w} золота`, desc: 'Наёмник платит за приют', ok: true }];
      case 'cursed': return [{ label: '🏴 Принять вызов', desc: 'Следующая волна: враги +50% здоровья, золото и алмазы ×2', ok: true }, { label: 'Сжечь знамя', desc: 'Обычная волна', ok: true }];
      case 'gem_vein': return [{ label: `💎 +${15 + 3 * w} алмазов`, desc: 'Для Цитадели', ok: true }, { label: `🪙 +${60 + 15 * w} золота`, desc: 'На этот забег', ok: true }];
      case 'smith': {
        const can = this.heroes.some((h) => h.items.some((x) => x.rarity < MAX_RARITY));
        return [{ label: '⚒️ Перековать', desc: 'Случайный надетый предмет станет на редкость выше', ok: can }, { label: `🏺 Реликвия за ${150 + 20 * w} 🪙`, desc: 'Случайная реликвия', ok: this.gold >= 150 + 20 * w }];
      }
    }
    return [leave];
  }

  resolveEvent(i: number): boolean {
    const ev = this.event;
    const opt = this.eventOptions()[i];
    if (!ev || !opt || !opt.ok) return false;
    const w = this.wave;
    const gain = (id?: string) => { const r = id ?? this.relicChoices(1)[0]; if (r) { this.relics.push(r); this.updateRunMods(); this.news.push(`Реликвия: ${RELICS.find((x) => x.id === r)!.name}`); } };
    switch (ev.id) {
      case 'relic_chest': gain(ev.relics![i]); break;
      case 'blood_altar': if (i === 0) { this.castleHp -= this.castleMax() * 0.25; gain(); } break;
      case 'merchant': if (i === 0) { this.gold -= ev.item!.price; this.bag.push({ uid: ++this.uidSeq, def: ITEMS.find((x) => x.id === ev.item!.id)!, rarity: ev.item!.rarity }); } break;
      case 'mercenary':
        if (i === 0) { const h = this.heroes[Math.floor(this.rnd() * this.heroes.length)]; this.levelUp(h); this.news.push(`${h.def.name} получил уровень`); }
        else this.gold += 80 + 10 * w;
        break;
      case 'cursed': this.curse = i === 0; break;
      case 'gem_vein': if (i === 0) this.runGems += 15 + 3 * w; else this.gold += 60 + 15 * w; break;
      case 'smith':
        if (i === 0) {
          const all = this.heroes.flatMap((h) => h.items.filter((x) => x.rarity < MAX_RARITY).map((x) => ({ h, x })));
          const pick = all[Math.floor(this.rnd() * all.length)];
          pick.x.rarity++; pick.h.recalc();
          this.news.push(`Кузнец перековал: ${pick.x.def.name}`);
        } else { this.gold -= 150 + 20 * w; gain(); }
        break;
    }
    this.event = null;
    this.sfx('pick');
    this.changed();
    return true;
  }

  // ---------- save / continue a run (saved in the camp between waves) ----------

  private serializeRun(): string {
    return JSON.stringify({
      wave: this.wave, gold: this.gold, castleHp: this.castleHp, kills: this.kills, towerLevel: this.towerLevel,
      runGems: this.runGems, relics: this.relics, biome: this.biome, event: this.event, curse: this.curse, uid: this.uidSeq, news: this.news,
      heroes: this.heroes.map((h) => ({ id: h.def.id, level: h.level, xp: h.xp, skills: h.skills, pending: h.pending, cards: h.cards, kills: h.kills,
        items: h.items.map((it) => [it.uid, it.def.id, it.rarity]) })),
      bag: this.bag.map((it) => [it.uid, it.def.id, it.rarity]),
      offers: this.offers.map((o) => o && [o.def.id, o.rarity, o.price, o.sale, o.locked]),
    });
  }

  savedRunWave(): number | null {
    try { const raw = this.storage?.loadRun?.(); return raw ? JSON.parse(raw).wave + 1 : null; } catch { return null; }
  }

  continueRun(): boolean {
    let d: any;
    try { d = JSON.parse(this.storage?.loadRun?.() ?? 'null'); } catch { d = null; }
    if (!d) return false;
    const item = (a: [number, string, number]): OwnedItem => ({ uid: a[0], def: ITEMS.find((x) => x.id === a[1])!, rarity: a[2] });
    this.clearField();
    this.setBiome(d.biome ?? 'forest');
    this.heroes = [];
    for (const sh of d.heroes) {
      const h = this.addHero(HEROES.find((x) => x.id === sh.id)!, 1);
      h.level = sh.level; h.xp = sh.xp; h.skills = sh.skills; h.pending = sh.pending; h.cards = sh.cards; h.kills = sh.kills;
      h.items = sh.items.map(item);
      for (const id of Object.keys(h.skills)) if (skillById(id).active) h.cds[id] = 1;
      h.recalc(); h.hp = h.stats.maxHp;
    }
    this.bag = d.bag.map(item);
    this.offers = d.offers.map((o: any) => o && { def: ITEMS.find((x) => x.id === o[0])!, rarity: o[1], price: o[2], sale: o[3], locked: o[4] });
    Object.assign(this, { wave: d.wave, gold: d.gold, castleHp: d.castleHp, kills: d.kills, towerLevel: d.towerLevel, runGems: d.runGems,
      relics: d.relics, event: d.event, curse: d.curse, uidSeq: d.uid, news: ['Забег продолжен.'] });
    this.lastShards = 0; this.spellCd = {}; this.blessT = 0; this.orders.clear(); this.rerolls = 0;
    this.updateRunMods();
    this.phase = 'shop';
    this.changed();
    return true;
  }

  repairCost(): number { return Math.round(REPAIR_COST * (1 - 0.15 * this.up('mason'))); }

  // ---------- player spells ----------

  spellLevel(id: string): number { const sp = SPELLS.find((x) => x.id === id); return sp ? this.up(sp.node) : 0; }
  spellMaxCd(id: string): number { return SPELLS.find((x) => x.id === id)!.cd * (1 - 0.12 * this.up('arcane')); }

  /** Casts a spell at a world point; false when locked, cooling down, or not in battle. */
  castSpell(id: string, x: number, y: number): boolean {
    const lvl = this.spellLevel(id);
    if (this.phase !== 'battle' || !lvl || (this.spellCd[id] ?? 0) > 0) return false;
    const sp = SPELLS.find((s) => s.id === id)!;
    this.spellCd[id] = this.spellMaxCd(id) * (this.rnd() < 0.25 * this.up('echo') ? 0.5 : 1);
    const power = Math.pow(waveHpScale(this.wave), 0.9) * (1 + 0.2 * this.up('sp_power'));
    y = Math.max(FIELD_TOP, Math.min(WALL_Y - 10, y));
    if (id === 'fire') {
      const dmg = 110 * power * (1 + 0.4 * (lvl - 1));
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2, d = k ? sp.radius * 0.55 : 0;
        const mx = x + Math.cos(a) * d, my = y + Math.sin(a) * d * 0.7, r = sp.radius * 0.55, t = 0.55 + k * 0.12;
        this.delayed.push({ x: mx, y: my, t, r, dmg: dmg / 2.2, owner: null });
        this.effect('meteor', mx, my, r, t, '', '');
      }
    } else if (id === 'frost') {
      const slow = 0.55 + 0.1 * lvl, dur = 3 + lvl;
      this.forEachNear(x, y, sp.radius, (e) => {
        if (dist2(e.x, e.y, x, y) > sp.radius * sp.radius) return;
        e.slow = Math.max(e.slow, slow); e.slowT = Math.max(e.slowT, dur);
        this.damageEnemy(e, 35 * power, null, false, true);
      });
      this.effect('frost', x, y, sp.radius, 0.9, '#9fdcff', '');
      for (let k = 0; k < 14; k++) this.bit(x + (this.rnd() - 0.5) * sp.radius, y + (this.rnd() - 0.5) * sp.radius * 0.6, k % 2 ? '#dff4ff' : '#7fc4ff', 120);
      this.sfx('pierce');
    } else if (id === 'bless') {
      this.blessT = 6;
      for (const h of this.heroes) {
        if (!h.alive && lvl >= 3) { h.alive = true; h.hp = h.stats.maxHp * 0.5; h.x = h.homeX; h.y = h.homeY; }
        if (!h.alive) continue;
        h.hp = Math.min(h.stats.maxHp, h.hp + h.stats.maxHp * (lvl >= 2 ? 0.6 : 0.4));
        this.effect('bless', h.x, h.y, 40, 1, '#ffe98a', '');
      }
      this.sfx('levelup');
    }
    return true;
  }

  buyUpgrade(id: string): boolean {
    const u = META_UPGRADES.find((x) => x.id === id);
    if (!u || this.phase !== 'menu' || !this.nodeOpen(id)) return false;
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

  /** Glory gems for a finished run: everything picked up plus a bonus per cleared wave. */
  shardsFor(wavesCleared: number): number {
    return Math.round(this.runGems) + wavesCleared * 5;
  }

  squadLevel(): number { return this.heroes.reduce((s, h) => s + h.level, 0); }

  /** Squad level needed for the next hero, or null when everyone has joined. */
  nextRecruitAt(): number | null {
    const idx = this.heroes.length - 1;
    const slots = 1 + this.up('slot2') + this.up('slot3');
    if (this.heroes.length >= Math.min(slots, this.availableHeroes().length) || idx >= RECRUIT_AT.length) return null;
    return Math.max(2, RECRUIT_AT[idx] - 2 * this.up('rally'));
  }

  private addHero(def: HeroDef, level: number): Hero {
    const h = new Hero(def, []);
    h.metaPct = 0.06 * this.up('hardy');
    if (def.id === 'summoner') h.skills.raise = 1; // her army is the whole point: she starts with it
    h.level = level + this.up('mentor');
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
      const left = this.availableHeroes().filter((d) => !this.heroes.some((h) => h.def.id === d.id));
      const def = left[Math.floor(this.rnd() * left.length)];
      const avg = this.squadLevel() / this.heroes.length;
      const h = this.addHero(def, Math.max(1, Math.round(avg * 0.7)));
      this.sfx('recruit');
      this.news.push(`К отряду присоединился ${def.name} (${def.title}), уровень ${h.level}!`);
    }
  }

  // ---------- shop, bag, forge (all within one run) ----------

  /** New shop offers; locked ones stay. One unlocked offer may be on sale (−40%). */
  rollOffers(): void {
    const w = this.wave + 1;
    const pool = ITEMS.filter((it) => itemTierUnlocked(it.tier, w));
    const odds = offerRarityOdds(w);
    const old = this.offers;
    this.offers = [];
    for (let i = 0; i < 5 + this.up('merchant'); i++) {
      const keep = old[i];
      if (keep && keep.locked) { this.offers.push(keep); continue; }
      const def = pool[Math.floor(this.rnd() * pool.length)];
      let r = this.rnd(), rarity = 0;
      while (rarity < odds.length - 1 && r > odds[rarity]) { r -= odds[rarity]; rarity++; }
      this.offers.push({ def, rarity, price: Math.round(def.cost * PRICE_MULT[rarity] * (1 - 0.07 * this.up('bargain'))), sale: false, locked: false });
    }
    const free = this.offers.filter((o) => o && !o.locked);
    if (free.length && this.rnd() < 0.5) {
      const o = free[Math.floor(this.rnd() * free.length)]!;
      o.sale = true; o.price = Math.round(o.price * 0.6);
    }
  }

  rerollCost(): number { if (this.hasRelic('lucky_coin') && this.rerolls === 0) return 0; return REROLL_COST + 5 * Math.floor(this.wave / 4) + 5 * this.rerolls; }

  reroll(): boolean {
    const cost = this.rerollCost();
    if (this.gold < cost || this.phase !== 'shop') return false;
    this.gold -= cost;
    this.rerolls++;
    this.rollOffers();
    this.changed();
    return true;
  }

  /** Locked offers survive rerolls and the next wave. */
  toggleLock(offerIdx: number): void {
    const o = this.offers[offerIdx];
    if (!o || this.phase !== 'shop') return;
    o.locked = !o.locked;
    this.changed();
  }

  orderCost(id: OrderId): number {
    const o = ORDERS.find((x) => x.id === id)!;
    return o.base + o.perWave * this.wave;
  }

  buyOrder(id: OrderId): boolean {
    if (this.phase !== 'shop' || this.orders.has(id) || this.gold < this.orderCost(id)) return false;
    this.gold -= this.orderCost(id);
    this.orders.add(id);
    this.sfx('coin');
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
    return Math.round(it.def.cost * [1, 2.6, 5.5][Math.min(2, it.rarity)] * 1.6 * (1 - 0.15 * this.up('forge')));
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
    if (this.gold < this.repairCost() || this.castleHp >= this.castleMax() || this.phase !== 'shop') return false;
    this.gold -= this.repairCost();
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
    if (h && !h.cards) h.cards = rollCards(h.def.id, h.skills, this.rnd, this.up('veteran') ? 4 : 3);
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
    if (this.phase !== 'shop' || this.event || this.heroes.some((h) => h.pending > 0)) return false;
    this.wave++;
    this.news = [];
    this.spawnQueue = buildWave(this.wave, this.rnd);
    this.spawnIdx = 0;
    this.waveTime = 0;
    this.waveKills = 0;
    this.waveGold = 0;
    this.waveCastleDmg = 0;
    this.waveHeroDeaths = 0;
    this.combo = 0; this.burst = false; this.killTimes = []; this.comboBest = 0; this.lastCombo = null; this.powderCount = 0;
    this.corpses = []; this.minions = [];
    this.blasts = [];
    for (const h of this.heroes) {
      h.alive = true;
      h.hp = h.stats.maxHp;
      h.x = h.homeX; h.y = h.homeY;
      h.target = null; h.cd = 0; h.tauntT = 0; h.attacks = 0; h.revived = false; h.kiteT = 0; h.deadT = 0; h.stunT = 0;
      for (const k of Object.keys(h.cds)) h.cds[k] = 1 + this.rnd() * 2;
    }
    this.projectiles.forEach((p) => (p.active = false));
    this.delayed = [];
    this.timers = [];
    this.spellCd = {};
    this.blessT = 0;
    this.fieldId++; // fresh battlefield: old blood is washed away
    this.splats.length = 0;
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
    this.effect('ring', h.x, h.y + 8, 34, 0.6, 'rgba(255,227,110,0.95)', '');
    for (let k = 0; k < 10; k++) this.bit(h.x, h.y, k % 2 ? '#ffe36e' : '#fff7c2', 140);
    this.sfx('levelup');
  }

  private sfx(s: Sfx): void { this.events.onSound?.(s); }
  private save(): void { this.storage?.save(this.meta); }
  private changed(): void {
    if (this.phase === 'shop' && this.heroes.length) this.storage?.saveRun?.(this.serializeRun());
    this.events.onChange?.();
  }

  /** Blood: a few flying drops plus ground stains (cosmetic only). */
  private gore(x: number, y: number, size: number, amount: number): void {
    if (this.splats.length < 1500) {
      const n = amount > 3 ? 2 : 1;
      for (let i = 0; i < n; i++) {
        this.splats.push({
          x: x + (Math.random() - 0.5) * size * 1.2, y: y + size * 0.6 + (Math.random() - 0.5) * size * 0.6,
          r: size * (0.5 + Math.random() * 0.6), c: BLOOD[Math.floor(Math.random() * BLOOD.length)],
        });
      }
    }
    for (let i = 0; i < amount; i++) this.bit(x, y, BLOOD[Math.floor(Math.random() * BLOOD.length)], 90 + size * 8);
  }

  private clearField(): void {
    this.fieldId++;
    this.minions = [];
    this.splats.length = 0;
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
    this.shake = Math.max(0, this.shake - dt * 20);
    this.castleFlash = Math.max(0, this.castleFlash - dt);
    this.blessT = Math.max(0, this.blessT - dt);
    if (this.timers.length) { for (const tm of this.timers) if ((tm.t -= dt) <= 0) tm.fn(); this.timers = this.timers.filter((tm) => tm.t > 0); }
    while (this.killTimes.length && this.waveTime - this.killTimes[0] > 2.5) this.killTimes.shift();
    if (this.burst && this.killTimes.length < 5) this.endCombo();
    if (this.hasSyn('fortress')) this.castleHp = Math.min(this.castleMax(), this.castleHp + 2 * dt);
    for (const k in this.spellCd) this.spellCd[k] = Math.max(0, this.spellCd[k] - dt);

    while (this.spawnIdx < this.spawnQueue.length && this.spawnQueue[this.spawnIdx].at <= this.waveTime) {
      this.spawn(this.spawnQueue[this.spawnIdx].type);
      this.spawnIdx++;
    }

    this.rebuildGrid();
    this.updateTowers(dt);
    this.updateHeroes(dt);
    this.updateDelayed(dt);
    this.updateEnemies(dt);
    this.updateBlasts();
    this.updateProjectiles(dt);
    this.updateEffects(dt);
    this.compactEnemies();

    if (this.castleHp <= 0) {
      this.castleHp = 0;
      this.phase = 'gameover';
      this.meta.bestWave = Math.max(this.meta.bestWave, this.wave - 1);
      this.meta.runs++;
      this.lastShards = this.shardsFor(this.wave - 1);
      this.storage?.saveRun?.(null);
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
    this.orders.clear();
    this.rerolls = 0;
    this.gold += this.lastWaveBonus;
    this.endCombo();
    const it = this.up('interest');
    if (it) this.gold += Math.min(40 + 40 * it, Math.floor(this.gold * 0.05 * it));
    this.curse = false;
    if (this.wave === 2 || (this.wave >= 4 && (this.wave - 1) % 3 === 0)) this.event = this.rollEvent();
    this.castleHp = Math.min(this.castleMax(), Math.max(1, this.castleHp) + 30 + 40 * this.up('mason'));
    this.projectiles.forEach((p) => (p.active = false));
    this.meta.bestWave = Math.max(this.meta.bestWave, this.wave);
    this.save();
    this.sfx('victory');
    this.checkRecruit();
    this.rollOffers();
    this.phase = 'shop';
    this.changed();
  }

  private spawn(type: string): Enemy {
    const def = ENEMIES[type];
    const e = this.pool.pop() ?? new Enemy();
    e.def = def;
    e.active = true;
    e.gen++;
    // The first King (wave 5) arrives weakened: a lone early squad can still beat him.
    const bossScale = def.boss ? Math.min(1, 0.5 + 0.1 * Math.max(0, this.wave - 5)) : 1;
    e.elite = ''; e.spdMul = 1; e.armorAdd = 0; e.regen = 0;
    let hpMul = bossScale * (this.curse ? 1.5 : 1);
    if (!def.boss && this.wave >= 4 && this.rnd() < Math.min(0.1, 0.012 * (this.wave - 3))) {
      const keys = Object.keys(ELITES);
      const el = ELITES[e.elite = keys[Math.floor(this.rnd() * keys.length)]];
      hpMul *= el.hp; e.spdMul = el.speed; e.armorAdd = el.armor; e.regen = el.regen;
    }
    e.maxHp = e.hp = Math.round(def.hp * waveHpScale(this.wave) * hpMul);
    e.dmg = def.dmg * waveDmgScale(this.wave);
    if (def.boss) { this.shake = Math.max(this.shake, 8); this.effect('text', 800, FIELD_TOP + 140, 0, 2.5, '#ffd23f', `${def.icon} ${def.name}!`); this.sfx('roar'); }
    // Mostly from the top edge, some from the upper sides.
    const side = this.rnd();
    if (side < 0.8) { e.x = 40 + this.rnd() * (WORLD_W - 80); e.y = FIELD_TOP - 30 - this.rnd() * 60; }
    else { e.x = side < 0.9 ? -20 : WORLD_W + 20; e.y = FIELD_TOP + this.rnd() * 300; }
    e.cd = this.rnd();
    e.flash = 0; e.anim = 0; e.stun = 0; e.burnT = 0; e.burnDps = 0; e.burnBy = null; e.tauntBy = null; e.tauntT = 0;
    e.slow = 0; e.slowT = 0; e.special = 2;
    this.enemies.push(e);
    return e;
  }

  /** Boss abilities, each on its own timer. */
  private bossAbility(e: Enemy, dt: number): void {
    e.special -= dt;
    if (e.special > 0) return;
    const allies = this.heroes.concat(this.minions).filter((h) => h.alive);
    const near = (r: number) => allies.filter((h) => dist2(h.x, h.y, e.x, e.y) < r * r);
    const scale = waveDmgScale(this.wave);
    switch (e.def.id) {
      case 'boss': { // Королевский рёв: calls guards and hides behind a shield
        e.special = 8;
        for (let k = 0; k < 4; k++) { const z = this.spawn('grunt'); z.x = e.x + Math.cos(k * 1.57) * 40; z.y = e.y + Math.sin(k * 1.57) * 30; }
        e.armorAdd = 25;
        this.timers.push({ t: 3, fn: () => { if (e.active) e.armorAdd = 0; } });
        this.effect('ring', e.x, e.y, 120, 0.6, 'rgba(255,210,60,0.9)', '');
        this.effect('text', e.x, e.y - 60, 0, 1.2, '#ffd23f', 'Ко мне, стража!');
        this.sfx('roar');
        break;
      }
      case 'ogre': { // Землетрясение: stuns and hurts everyone close
        e.special = 7;
        for (const h of near(150)) { this.damageHero(h, 45 * scale, null); h.stunT = 1.3; }
        this.effect('ring', e.x, e.y, 150, 0.6, 'rgba(200,160,90,0.95)', '');
        this.effect('boom', e.x, e.y + 10, 70, 0.55, '', '');
        this.shake = Math.max(this.shake, 10);
        this.sfx('boom');
        break;
      }
      case 'necro': { // raises corpses, then curses the strongest hero
        e.special = 5;
        let raised = 0;
        for (let k = 0; k < 4 && this.corpses.length; k++) {
          const c = this.corpses.splice(Math.floor(this.rnd() * this.corpses.length), 1)[0];
          const z = this.spawn('grunt');
          z.x = c.x; z.y = c.y;
          this.effect('puff', c.x, c.y, 18, 0.6, '#9fff8a', '');
          raised++;
        }
        const victim = this.heroes.filter((h) => h.alive).sort((a, b) => b.stats.dmg - a.stats.dmg)[0];
        if (victim) {
          this.damageHero(victim, victim.stats.maxHp * 0.12, null);
          this.effectLine(e.x, e.y - 30, victim.x, victim.y - 10, '#9fff8a');
          this.effect('text', victim.x, victim.y - 40, 0, 1, '#9fff8a', 'Проклятие!');
        }
        if (raised || victim) this.sfx('summon');
        break;
      }
      case 'warlord': { // Боевой клич: heals the horde around him
        e.special = 6;
        for (const o of this.enemies) if (o.active && dist2(o.x, o.y, e.x, e.y) < 200 * 200) o.hp = Math.min(o.maxHp, o.hp + o.maxHp * 0.2);
        this.effect('ring', e.x, e.y, 200, 0.6, 'rgba(255,200,60,0.7)', '');
        this.effect('text', e.x, e.y - 60, 0, 1.2, '#ffcf4a', 'В атаку!');
        this.sfx('roar');
        break;
      }
      default: e.special = 999;
    }
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
      const e = this.nearestEnemy(t.x, t.y, TOWER_RANGE * (BIOME_RANGE < 1 ? 0.9 : 1));
      if (!e) return;
      this.towerCd[i] = 1 / (this.towerRate() * (this.orders.has('militia') ? 2 : 1));
      const tdmg = this.towerDmg() * (1 + 0.2 * this.up('archers')) * (this.hasRelic('sharp_bolts') ? 1.5 : 1);
      this.shoot(t.x, t.y - 30, e, tdmg, 0, 650, this.hasRelic('fire_towers') ? '#ff9a2e' : '#e8e2c8', null, false);
      if (this.hasRelic('fire_towers')) { e.burnDps = Math.max(e.burnDps, tdmg * (this.hasSyn('blazebolts') ? 1 : 0.5)); e.burnT = 3; }
      this.sfx('tower');
    });
  }

  private updateHeroes(dt: number): void {
    if (this.minions.some((m) => !m.alive)) this.minions = this.minions.filter((m) => m.alive);
    for (const h of this.heroes.concat(this.minions)) {
      if (h.minion) { h.life -= dt; if (h.life <= 0 && h.alive) this.dismiss(h); }
      if (!h.alive) {
        if (h.deadT > 0) {
          h.deadT -= dt;
          if (h.deadT <= 0) { h.alive = true; h.hp = h.stats.maxHp * 0.5; h.x = h.homeX; h.y = h.homeY; this.effect('bless', h.x, h.y, 40, 1, '#9fffb0', ''); this.effect('text', h.x, h.y - 40, 0, 1.2, '#9fffb0', h.def.name + ' снова в строю'); }
        }
        continue;
      }
      const s = h.stats;
      h.flash = Math.max(0, h.flash - dt);
      h.tauntT = Math.max(0, h.tauntT - dt);
      if (s.regen > 0) h.hp = Math.min(s.maxHp, h.hp + s.regen * dt);
      h.cd -= dt;
      for (const k in h.cds) h.cds[k] -= dt;
      if (h.stunT > 0) { h.stunT -= dt; h.moving = false; continue; }
      if (!h.minion) this.castSkills(h);

      // Targeting: prefer enemies near the guard post so heroes hold their part of the line.
      const leash = s.range < 60 ? 230 : 140;
      h.retarget -= dt;
      if (!h.target || !h.target.active || h.target.gen !== h.targetGen || h.retarget <= 0) {
        h.retarget = 0.25;
        h.target = h.minion ? null : this.nearestEnemy(h.homeX, h.homeY, s.range + leash);
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
      // Ranged heroes: when a goblin gets close, step back towards the wall (behind the tank) and keep shooting.
      h.kiteCd -= dt;
      if (s.range >= 60) {
        if (h.kiteT <= 0 && h.kiteCd <= 0) {
          const near = this.nearestEnemy(h.x, h.y, 70);
          if (near && near.def.range < 40) {
            const dx = h.x - near.x, dy = h.y - near.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
            h.kx = dx / d * 0.6 + (h.homeX - h.x) / 200; h.ky = Math.max(0.35, dy / d * 0.6 + 0.5);
            const n = Math.hypot(h.kx, h.ky) || 1; h.kx /= n; h.ky /= n;
            h.kiteT = 0.55; h.kiteCd = 1.6 + this.rnd();
          }
        }
        if (h.kiteT > 0) {
          h.kiteT -= dt;
          h.x = Math.max(30, Math.min(WORLD_W - 30, h.x + h.kx * s.move * 1.15 * dt));
          h.y = Math.min(WALL_Y - 14, h.y + h.ky * s.move * 1.15 * dt);
          h.moving = true;
        }
      }
      const t = h.target;
      if (t) {
        const dx = t.x - h.x, dy = t.y - h.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        const reach = s.range + t.def.radius + HERO_RADIUS * 0.5;
        h.face = dx >= 0 ? 1 : -1;
        if (d > reach && h.kiteT <= 0) {
          const nx = h.x + (dx / d) * s.move * dt;
          const ny = Math.min(WALL_Y - 20, h.y + (dy / d) * s.move * dt);
          if (h.chase || dist2(nx, ny, h.homeX, h.homeY) <= (s.range + leash + 20) ** 2) { h.x = nx; h.y = ny; h.moving = true; }
        } else if (h.cd <= 0 && d <= reach) {
          h.cd = 1 / (s.atkSpeed * (this.orders.has('horn') ? 1.3 : 1) * (this.blessT > 0 ? 1.4 : 1) * (1 + 0.08 * this.up('warcry') + (this.hasRelic('war_drum') ? 0.15 : 0) + (this.hasSyn('bloodmarch') ? 0.1 : 0)));
          // Attack animation: never longer than the attack interval, so fast heroes don't freeze mid-swing.
          h.animMax = Math.min(0.26, h.cd * 0.85);
          h.anim = h.animMax; h.animCast = false;
          h.aimX = t.x; h.aimY = t.y;
          if (s.range >= 60) this.heroRangedAttack(h, t);
          else this.meleeHit(h, t);
          if (!h.minion) this.chainLightning(h, t);
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

  /** Морра's skeleton: a temporary ally that hunts the nearest goblin. */
  private summon(owner: Hero, x: number, y: number, life: number): void {
    if (this.minions.length >= 14) return;
    const r = Math.max(1, owner.rank('raise'));
    const ba = owner.rank('bonearmor');
    const lich = owner.rank('lich') ? SK.lich : null;
    const m = new Hero(SKELETON, []);
    m.minion = true; m.owner = owner; m.life = life;
    const hp = owner.stats.maxHp * SK.raise.hp[r - 1] * (1 + (ba ? SK.bonearmor.hp[ba - 1] : 0)) * (lich ? lich.hp : 1);
    m.stats = { ...m.stats, maxHp: Math.round(hp), dmg: owner.stats.dmg * SK.raise.dmg[r - 1] * (lich ? lich.dmg : 1) * 1.6,
      armor: 3 + (ba ? SK.bonearmor.armor[ba - 1] : 0), atkSpeed: 1.1, range: 24, splash: 0, lifesteal: 0, regen: 0, move: 95 * BIOME_MOVE };
    m.hp = m.stats.maxHp;
    m.x = m.homeX = Math.max(30, Math.min(WORLD_W - 30, x)); m.y = m.homeY = Math.min(WALL_Y - 20, y);
    m.level = 1;
    this.minions.push(m);
    this.effect('puff', m.x, m.y, 16, 0.5, '#9fff8a', '');
    this.sfx('summon');
  }

  /** A skeleton crumbles (time out or killed); with Чумная армия it explodes. */
  private dismiss(m: Hero): void {
    m.alive = false; m.hp = 0;
    this.effect('puff', m.x, m.y, 14, 0.5, '#e8e2cf', '');
    for (let k = 0; k < 4; k++) this.bit(m.x, m.y - 6, '#e8e2cf', 120);
    if (m.owner?.rank('plague')) this.blasts.push({ x: m.x, y: m.y, dmg: m.owner.stats.dmg * SK.plague.blast, owner: m.owner });
  }

  // ---------- hero skills ----------

  private ready(h: Hero, id: string): number {
    const r = h.rank(id);
    return r > 0 && (h.cds[id] ?? 0) <= 0 ? r : 0;
  }

  private castSkills(h: Hero): void {
    const s = h.stats;
    let r: number;
    const quake = h.rank('quake') > 0;
    if ((r = this.ready(h, 'shieldBash')) && this.countNear(h.x, h.y, SK.shieldBash.radius) >= 2) {
      const R = SK.shieldBash.radius * (quake ? SK.quake.radius : 1);
      const stun = SK.shieldBash.stun[r - 1];
      let hit = 0;
      this.forEachNear(h.x, h.y, R, (e) => {
        if (dist2(e.x, e.y, h.x, h.y) > R * R) return;
        e.stun = Math.max(e.stun, stun);
        hit++;
        this.damageEnemy(e, s.dmg * SK.shieldBash.dmg[r - 1] * (quake ? SK.quake.dmg : 1), h, false, true);
      });
      if (quake && hit) {
        h.hp = Math.min(s.maxHp, h.hp + s.maxHp * Math.min(SK.quake.healCap, hit * SK.quake.heal));
        this.effect('heal', h.x, h.y, 22, 0.5, 'rgba(120,255,140,0.9)', '');
        this.shake = Math.max(this.shake, 4);
      }
      this.cast(h, 'shieldBash', r);
      this.sfx('bash');
      this.effect('ring', h.x, h.y, R, 0.35, quake ? 'rgba(210,160,90,0.95)' : 'rgba(140,190,255,0.9)', '');
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
    if ((r = this.ready(h, 'raise')) && this.countNear(h.x, h.y, 420) >= 1) {
      const n = SK.raise.count[r - 1] + (h.rank('lich') ? SK.lich.extra : 0);
      for (let i = 0; i < n; i++) this.summon(h, h.x + (i - (n - 1) / 2) * 26, h.y - 40, SK.raise.life);
      this.cast(h, 'raise', r);
      this.effect('ring', h.x, h.y - 30, 50, 0.5, 'rgba(159,255,138,0.8)', '');
    }
    if ((r = this.ready(h, 'drain'))) {
      const picked = new Set<Enemy>();
      let healed = 0;
      for (let i = 0; i < SK.drain.targets[r - 1]; i++) {
        const e = this.nearestEnemy(h.x, h.y, s.range + 40, picked);
        if (!e) break;
        picked.add(e);
        const dmg = s.dmg * SK.drain.dmg[r - 1];
        this.damageEnemy(e, dmg, h, false, true);
        healed += dmg * SK.drain.heal;
        this.effectLine(e.x, e.y - 6, h.x, h.y - 12, '#9fff8a');
      }
      if (picked.size) {
        const allies = [h, ...this.minions.filter((m) => m.alive && m.owner === h)];
        for (const a of allies) a.hp = Math.min(a.stats.maxHp, a.hp + healed / allies.length);
        this.cast(h, 'drain', r);
        this.sfx('drain');
      }
    }
    if ((r = this.ready(h, 'volley'))) {
      const n = SK.volley.arrows[r - 1] * (h.rank('storm') ? SK.storm.arrows : 1);
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
        const deadeye = h.rank('deadeye') > 0;
        const base = Math.atan2(t.y - h.y, t.x - h.x);
        const len = SK.pierce.len;
        const dmg = s.dmg * SK.pierce.dmg[r - 1] * (deadeye ? SK.deadeye.crit : 1);
        const angles = deadeye ? [-0.2, 0, 0.2] : [0];
        for (const a of angles) {
          const ex = h.x + Math.cos(base + a) * len, ey = h.y + Math.sin(base + a) * len;
          for (const e of this.enemies) {
            if (e.active && segDist2(e.x, e.y, h.x, h.y, ex, ey) <= (e.def.radius + 6) ** 2) this.damageEnemy(e, dmg, h, false, true);
          }
          this.effectLine(h.x, h.y - 10, ex, ey, deadeye ? '#fff36b' : '#f4ffb0');
        }
        this.cast(h, 'pierce', r);
        this.sfx('pierce');
      }
    }
    if ((r = this.ready(h, 'meteor'))) {
      const inf = h.rank('inferno');
      const R = SK.meteor.radius[r - 1] * (1 + (inf ? SK.inferno.splash[inf - 1] : 0));
      const count = h.rank('rain') ? SK.rain.count : 1;
      const used: { x: number; y: number }[] = [];
      for (let m = 0; m < count; m++) {
        // Aim at the densest cluster among a sample of nearby enemies, away from earlier impacts.
        let best: Enemy | null = null, bestN = 0, tries = 0;
        this.forEachNear(h.x, h.y, s.range + 200, (e) => {
          if (tries++ > 40 || used.some((u) => dist2(u.x, u.y, e.x, e.y) < R * R)) return;
          const n = this.countNear(e.x, e.y, 80);
          if (n > bestN) { bestN = n; best = e; }
        });
        const b = best as Enemy | null;
        if (!b || bestN < (m ? 2 : 3)) break;
        used.push({ x: b.x, y: b.y });
        const delay = SK.meteor.delay + m * 0.35;
        this.delayed.push({ x: b.x, y: b.y, t: delay, r: R, dmg: s.dmg * SK.meteor.dmg[r - 1], owner: h });
        this.effect('meteor', b.x, b.y, R, delay, '#ff7a1f', '');
      }
      if (used.length) this.cast(h, 'meteor', r);
    }
    if ((r = this.ready(h, 'ring')) && this.countNear(h.x, h.y, SK.ring.radius) >= 3) {
      const R = SK.ring.radius;
      this.forEachNear(h.x, h.y, R, (e) => {
        const dd = dist2(e.x, e.y, h.x, h.y);
        if (dd > R * R) return;
        const d = Math.sqrt(dd) || 1;
        e.x += ((e.x - h.x) / d) * SK.ring.push;
        e.y += ((e.y - h.y) / d) * SK.ring.push;
        this.damageEnemy(e, s.dmg * SK.ring.dmg[r - 1], h, false, true);
      });
      this.effect('ring', h.x, h.y, R, 0.45, 'rgba(255,120,30,0.95)', '');
      this.cast(h, 'ring', r);
      this.sfx('boom');
    }
  }

  private cast(h: Hero, id: string, rank: number): void {
    const sk = skillById(id);
    h.cds[id] = sk.cd!(rank) * h.stats.cdMult * (id === 'volley' && h.rank('storm') ? SK.storm.cd : 1);
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
        if (dist2(e.x, e.y, m.x, m.y) <= m.r * m.r) this.damageEnemy(e, m.dmg, m.owner, false, true);
      });
      this.shake = Math.max(this.shake, 6);
      for (let k = 0; k < 6; k++) this.bit(m.x, m.y, k % 2 ? '#ff9a2e' : '#5a3a2a', 160);
      this.effect('boom', m.x, m.y, m.r * 1.3, 0.55, '', '');
      this.effect('puff', m.x, m.y, m.r * 0.6, 0.5, 'rgba(255,110,20,0.6)', '');
      this.sfx('meteor');
    }
  }

  private heroRangedAttack(h: Hero, t: Enemy): void {
    const s = h.stats;
    const critR = h.rank('crit');
    const crit = critR > 0 && this.rnd() < SK.crit.chance[critR - 1];
    const critMult = h.rank('deadeye') ? SK.deadeye.crit : 2;
    const speed = h.def.role === 'mage' ? 430 : 680;
    this.shoot(h.x, h.y - 10, t, s.dmg * (crit ? critMult : 1), s.splash, speed, crit ? '#fff36b' : h.def.color, h, crit);
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

  /** Special item effects on a hero's basic hit (Ледяной осколок, Топор палача). */
  private onHit(h: Hero, e: Enemy): void {
    if (!e.active) return;
    const fr = h.fx.frost;
    if (fr !== undefined) { e.slow = Math.max(e.slow, EFFECTS.frost.slow[fr]); e.slowT = EFFECTS.frost.dur; }
    const ex = h.fx.execute;
    if (ex !== undefined && e.def.id !== 'boss' && e.def.id !== 'champion' && e.hp < e.maxHp * EFFECTS.execute.below[ex]) {
      this.effect('num', e.x, e.y - 12, 0, 0.7, '#ff5a5a', '✝');
      this.damageEnemy(e, e.hp * 10 + 1e6, h, true);
    }
  }

  /** Молот грома: every N-th basic attack also arcs lightning through nearby enemies. */
  private chainLightning(h: Hero, t: Enemy): void {
    h.attacks++;
    const c = h.fx.chain;
    if (c === undefined || h.attacks % EFFECTS.chain.every[c] !== 0) return;
    const hit = new Set<Enemy>();
    let px = h.x, py = h.y - 12, from: Enemy | null = t;
    for (let i = 0; i < EFFECTS.chain.targets[c] && from; i++) {
      hit.add(from);
      const fx = this.effect('bolt', px, py, 0, 0.25, '#9fd8ff', '');
      if (fx) { fx.x2 = from.x; fx.y2 = from.y; }
      px = from.x; py = from.y;
      this.damageEnemy(from, h.stats.dmg * EFFECTS.chain.dmg, h, false, true);
      from = this.nearestEnemy(px, py, EFFECTS.chain.radius, hit);
    }
  }

  private meleeHit(h: Hero, t: Enemy): void {
    const s = h.stats;
    this.damageEnemy(t, s.dmg, h);
    this.onHit(h, t);
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
        else this.hitCastle(p.dmg, p.x);
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
        this.damageEnemy(p.target!, p.dmg, p.owner, false, p.crit);
      }
      if (alive && p.owner) this.onHit(p.owner, p.target!);
    }
  }

  private damageEnemy(e: Enemy, amount: number, by: Hero | null, quiet = false, show = false): void {
    if (!e.active) return;
    const armor = e.def.armor + e.armorAdd;
    const dealt = amount * (1 - armor / (armor + 20));
    e.hp -= dealt;
    if (!quiet) e.flash = 0.08;
    if (!quiet && dealt >= 1 && Math.random() < 0.4) this.gore(e.x, e.y, e.def.radius * 0.5, 1);
    // Damage numbers only for crits, skills and big goblins, so hundreds of hits don't flood the screen.
    if (!quiet && (show || e.def.radius >= 12) && dealt >= 1 && this.rnd() < (show ? 0.6 : 0.35)) {
      this.effect('num', e.x + (this.rnd() - 0.5) * 10, e.y - e.def.radius - 6, 0, 0.7, show ? '#fff36b' : '#ffffff', String(Math.round(dealt)));
    }
    if (by && by.alive) {
      const ls = by.stats.lifesteal + (this.hasRelic('vamp_banner') ? 0.06 : 0) + (this.hasSyn('bloodmarch') ? 0.04 : 0);
      if (ls > 0) by.hp = Math.min(by.stats.maxHp, by.hp + dealt * ls);
      const ig = by.rank('ignite');
      if (ig && !quiet) { e.burnDps = Math.max(e.burnDps, amount * SK.ignite.dps[ig - 1]); e.burnT = SK.ignite.dur; e.burnBy = by; }
    }
    if (e.hp <= 0) {
      e.active = false;
      this.kills++;
      this.waveKills++;
      const loot = (e.elite ? (this.hasSyn('jeweler') ? 3 : 2) : 1) * (this.curse ? 2 : 1);
      let gold = Math.round(loot * e.def.gold * goldScale(this.wave) * (1 + 0.1 * this.up('taxes') + (this.hasRelic('golden_tooth') ? 0.25 : 0) + (this.biome === 'snow' ? 0.1 : 0)) * (this.orders.has('bounty') ? 1.5 : 1));
      if (by && by.fx.greed !== undefined) gold += EFFECTS.greed.gold[by.fx.greed];
      this.gold += gold;
      this.waveGold += gold;
      if (by) by.kills++;
      this.sfx('kill');
      this.effect('puff', e.x, e.y, e.def.radius * 1.6, 0.35, e.def.color, '');
      // Death burst: a fountain of blood; an overkill hit tears the goblin apart.
      const over = -e.hp > e.maxHp * 0.5 || dealt > e.maxHp * 0.9;
      this.gore(e.x, e.y, e.def.radius * (over ? 2.8 : 2.1), (e.def.radius >= 12 ? 16 : 9) + (over ? 10 : 0));
      if (over) for (let k = 0; k < 5; k++) this.bit(e.x, e.y - 4, k % 2 ? e.def.color : '#5e0d0d', 230);
      // Kill bursts: 8+ kills within 2.5 s start "Дикая Резня"; it ends when the pace drops.
      this.killTimes.push(this.waveTime);
      if (this.burst) this.combo++;
      else if (this.killTimes.length >= 8) { this.burst = true; this.combo = this.killTimes.length; }
      this.comboBest = Math.max(this.comboBest, this.combo);
      if (this.corpses.length < 300) this.corpses.push({ x: e.x, y: e.y });
      this.sfx('squish');
      if (e.burnT > 0 && this.hasSyn('hellpowder')) this.blasts.push({ x: e.x, y: e.y, dmg: 30 * Math.pow(waveHpScale(this.wave), 0.8), owner: null });
      // Некромантия: the dead may rise for Морра.
      for (const h of this.heroes) {
        const nr = h.rank('necromancy');
        if (nr && h.alive && this.rnd() < SK.necromancy.chance[nr - 1]) this.summon(h, e.x, e.y, SK.necromancy.life);
      }
      if (this.hasRelic('blood_rite')) for (const h of this.heroes) if (h.alive) h.hp = Math.min(h.stats.maxHp, h.hp + h.stats.maxHp * 0.01);
      if (this.hasRelic('powder') && ++this.powderCount % 10 === 0) this.blasts.push({ x: e.x, y: e.y, dmg: 40 * Math.pow(waveHpScale(this.wave), 0.8), owner: null });
      if (e.def.boss) this.slowmo = 1.2;
      this.effect('corpse', e.x, e.y, e.face, 0.6, e.def.color, e.def.id);
      this.splats.push({ x: e.x, y: e.y, r: e.face, c: '', type: e.def.id, at: this.waveTime + 0.6 });
      const exp = loot * e.def.gems * gemScale(this.wave) * (1 + 0.15 * this.up('gemcutter') + (this.hasRelic('gem_lens') ? 0.3 : 0) + (this.biome === 'swamp' ? 0.25 : 0));
      const gems = Math.floor(exp) + (this.rnd() < exp % 1 ? 1 : 0);
      this.runGems += gems;
      this.effect('gem', e.x, e.y - 10, gems, 0.9, '#8fd8ff', `+${gold}|${gems ? '+' + gems : ''}`);
      if (e.def.id === 'boss') this.shake = Math.max(this.shake, 10);
      // Лесной пожар: burning enemies explode on death.
      const burner = e.burnT > 0 ? e.burnBy : null;
      if (burner && burner.alive && burner.rank('wildfire')) {
        this.blasts.push({ x: e.x, y: e.y, dmg: burner.stats.dmg * SK.wildfire.blast, owner: burner });
      }
      // XP is shared so every hero levels up.
      for (const h of this.heroes) {
        if (!h.alive) continue;
        h.xp += e.def.xp * (e.elite ? 2 : 1) * (1 + 0.1 * this.up('drill') + (this.hasRelic('old_tome') ? 0.25 : 0));
        if (h.xp >= h.xpToNext()) this.levelUp(h);
      }
    }
  }

  private damageHero(h: Hero, amount: number, attacker: Enemy | null): void {
    const armor = h.stats.armor + (h.tauntT > 0 ? SK.taunt.armor[Math.max(0, h.rank('taunt') - 1)] : 0);
    const dealt = amount * (1 - armor / (armor + 25));
    h.hp -= dealt;
    h.flash = 0.1;
    if (dealt >= 1) this.gore(h.x, h.y - 4, 8, 2);
    const th = h.rank('thorns');
    if (th && attacker) {
      const ret = h.tauntT > 0 && h.rank('retaliation');
      const back = dealt * SK.thorns.reflect[th - 1] * (ret ? SK.retaliation.reflect : 1);
      this.damageEnemy(attacker, back, h, true);
      if (ret) h.hp = Math.min(h.stats.maxHp, h.hp + back * SK.retaliation.heal);
    }
    if (h.minion) { if (h.hp <= 0 && h.alive) this.dismiss(h); return; }
    const rv = h.fx.revive;
    if (h.hp <= 0 && rv !== undefined && !h.revived) {
      h.revived = true;
      h.hp = h.stats.maxHp * EFFECTS.revive.hp[rv];
      this.effect('heal', h.x, h.y, 30, 0.9, 'rgba(255,170,60,0.95)', '');
      this.effect('text', h.x, h.y - 40, 0, 1.3, '#ffb347', '🪶 Возрождение!');
      this.sfx('levelup');
    }
    if (h.hp <= 0) {
      this.waveHeroDeaths++;
      this.shake = Math.max(this.shake, 5);
      this.gore(h.x, h.y, 22, 14);
      h.alive = false;
      h.hp = 0;
      if (this.up('medic')) h.deadT = 30 - 6 * this.up('medic');
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
    const allies = this.minions.length ? this.heroes.concat(this.minions) : this.heroes;
    // Гоблин-полководец: goblins near him march and strike faster.
    const lords = this.enemies.filter((x) => x.active && x.def.id === 'warlord');
    for (const e of this.enemies) {
      if (!e.active) continue;
      if (e.def.boss) this.bossAbility(e, dt);
      if (lords.length && e.def.id !== 'warlord' && lords.some((l) => dist2(l.x, l.y, e.x, e.y) < 200 * 200)) e.cd -= dt * 0.4;
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
      if (e.slowT > 0) { e.slowT -= dt; if (e.slowT <= 0) e.slow = 0; }
      if (e.regen) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * e.regen * dt);
      const lordBoost = lords.length && d.id !== 'warlord' && lords.some((l) => dist2(l.x, l.y, e.x, e.y) < 200 * 200) ? 1.35 : 1;
      const speed = d.speed * e.spdMul * BIOME_MOVE * lordBoost * (1 - e.slow);
      // Кипящая смола: goblins at the wall burn.
      if (this.orders.has('tar') && e.y > WALL_Y - d.radius - 40) {
        this.damageEnemy(e, (12 + 3 * this.wave) * dt, null, true);
        if (!e.active) continue;
      }

      // Most goblins hunt the nearest living hero anywhere on the field.
      // Raiders (ignoresHeroes) run for the walls and fight a hero only if one stands in their way.
      let target: Hero | null = null;
      if (e.tauntT > 0 && e.tauntBy?.alive) target = e.tauntBy;
      else if (!rush) {
        let best = d.ignoresHeroes ? (d.radius + HERO_RADIUS + 10) ** 2 : Infinity;
        for (const h of allies) {
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
          e.x += (dx / dd) * speed * dt;
          e.y += (dy / dd) * speed * dt;
        } else if (d.explodes) {
          this.explode(e, target);
          continue;
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
          e.x += (dx / dd) * speed * dt;
          e.y += (dy / dd) * speed * dt;
          if (Math.abs(dx) > 2) e.face = dx >= 0 ? 1 : -1;
        } else if (d.explodes) {
          this.explode(e, null);
          continue;
        } else {
          const spikes = this.up('spikes');
          const spk = (15 * spikes + (this.hasRelic('spiked_wall') ? 25 : 0)) * (this.hasSyn('bloodwall') ? 2 : 1);
          if (spk && d.range <= 40) { this.damageEnemy(e, spk * dt, null, true); if (!e.active) continue; }
          if (e.cd <= 0) {
            e.cd = 1 / d.atkSpeed;
            e.anim = 0.2;
            if (d.range > 40) this.enemyShot(e, null);
            else this.hitCastle(e.dmg, e.x);
            if (d.id === 'ogre') { this.shake = Math.max(this.shake, 9); for (let k = 0; k < 8; k++) this.bit(e.x, WALL_Y, k % 2 ? '#8d8579' : '#a69e90', 200); }
          }
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

  private hitCastle(dmg: number, x: number): void {
    dmg *= (1 - 0.08 * this.up('iron_gate')) * (this.hasRelic('iron_hinges') ? 0.85 : 1);
    if (this.rnd() < 0.35 && this.splats.length < 1500) this.splats.push({ x: x + (this.rnd() - 0.5) * 16, y: WALL_Y + 4 + this.rnd() * 16, r: 4 + this.rnd() * 5, c: BLOOD[Math.floor(this.rnd() * BLOOD.length)] });
    this.castleHp -= dmg;
    this.waveCastleDmg += dmg;
    this.castleFlash = 0.25;
    this.sfx('castle');
    if (dmg >= 10 || this.rnd() < 0.3) this.effect('num', x, WALL_Y - 8, 0, 0.8, '#ff6b5a', '−' + Math.round(dmg));
  }

  /** Подрывник: blows up on the wall (or on a hero blocking the way); no gold for that. */
  private explode(e: Enemy, h: Hero | null): void {
    const dmg = (e.def.explodes ?? 0) * waveDmgScale(this.wave);
    if (h) this.damageHero(h, dmg * 0.6, null);
    else this.hitCastle(dmg, e.x);
    e.active = false;
    this.effect('boom', e.x, e.y, 60, 0.55, '', '');
    this.effect('puff', e.x, e.y, 26, 0.5, 'rgba(90,70,60,0.8)', '');
    for (let k = 0; k < 6; k++) this.bit(e.x, e.y, k % 2 ? '#ffb030' : '#3a3530', 180);
    this.gore(e.x, e.y, 14, 8);
    this.shake = Math.max(this.shake, 4);
    this.sfx('boom');
  }

  private updateBlasts(): void {
    const list = this.blasts;
    this.blasts = [];
    const R = SK.wildfire.radius;
    for (const b of list) {
      this.effect('boom', b.x, b.y, 50, 0.5, '', '');
      this.forEachNear(b.x, b.y, R, (e) => {
        if (dist2(e.x, e.y, b.x, b.y) > R * R) return;
        this.damageEnemy(e, b.dmg, b.owner, false, true);
        if (e.active) { e.burnDps = Math.max(e.burnDps, b.dmg * 0.3); e.burnT = SK.ignite.dur; e.burnBy = b.owner; }
      });
      this.effect('ring', b.x, b.y, R, 0.3, 'rgba(255,110,20,0.9)', '');
    }
  }

  /** A flying particle (cosmetic). x2/y2 hold its velocity. */
  private bit(x: number, y: number, color: string, power: number): void {
    const fx = this.effect('bit', x, y - 4, 2 + this.rnd() * 2, 0.4 + this.rnd() * 0.3, color, '');
    if (!fx) return;
    const a = this.rnd() * Math.PI * 2;
    const v = power * (0.4 + this.rnd() * 0.6);
    fx.x2 = Math.cos(a) * v; fx.y2 = Math.sin(a) * v * 0.6 - power * 0.5;
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
      else if (f.kind === 'num') f.y -= 40 * dt;
      else if (f.kind === 'bit') { f.x += f.x2 * dt; f.y += f.y2 * dt; f.y2 += 520 * dt; }
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
