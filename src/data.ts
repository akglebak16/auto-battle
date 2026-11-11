// Static game data: heroes, items, enemies, wave composition.
// Tweak numbers here to rebalance the game.

export type Role = 'tank' | 'ranged' | 'mage' | 'healer' | 'melee';

export interface HeroDef {
  id: string;
  name: string;
  title: string;
  role: Role;
  color: string;
  letter: string;
  hp: number;
  dmg: number;
  atkSpeed: number; // attacks per second
  range: number; // px
  move: number; // px per second
  armor: number;
  splash: number; // radius of area damage, 0 = single target
  heal: number; // heal per cast (healer only)
  lifesteal: number; // 0..1
  desc: string;
}

// Three heroes for now, each with its own skill pool (see skills.ts).
export const HEROES: HeroDef[] = [
  {
    id: 'warden', name: 'Бран', title: 'Страж ворот', role: 'tank', color: '#4a7bd1', letter: 'С',
    hp: 560, dmg: 22, atkSpeed: 1.0, range: 30, move: 75, armor: 10, splash: 34, heal: 0, lifesteal: 0,
    desc: 'Щитоносец. Держит толпу на себе, оглушает и отражает урон.',
  },
  {
    id: 'ranger', name: 'Ива', title: 'Лучница', role: 'ranged', color: '#3fae5a', letter: 'Л',
    hp: 210, dmg: 26, atkSpeed: 1.5, range: 280, move: 90, armor: 1, splash: 0, heal: 0, lifesteal: 0,
    desc: 'Стреляет издалека: залпы, пробивающие стрелы, криты.',
  },
  {
    id: 'pyro', name: 'Оррин', title: 'Пиромант', role: 'mage', color: '#e0682b', letter: 'П',
    hp: 180, dmg: 34, atkSpeed: 0.7, range: 240, move: 75, armor: 0, splash: 62, heal: 0, lifesteal: 0,
    desc: 'Огонь по площади: метеоры, огненное кольцо, поджог.',
  },
];

export interface Mods {
  dmg?: number;
  dmgPct?: number;
  atkSpeedPct?: number;
  hp?: number;
  armor?: number;
  range?: number;
  lifesteal?: number;
  splash?: number;
  heal?: number;
  regen?: number; // hp per second
}

export interface ItemDef {
  id: string;
  name: string;
  icon: string;
  tier: 1 | 2 | 3 | 4; // 4 = crafted only (never sold in the shop)
  cost: number;
  mods: Mods;
}

export const ITEMS: ItemDef[] = [
  // Tier 1
  { id: 'rusty_sword', name: 'Ржавый меч', icon: '🗡️', tier: 1, cost: 45, mods: { dmg: 6 } },
  { id: 'leather', name: 'Кожаная куртка', icon: '🦺', tier: 1, cost: 40, mods: { hp: 80, armor: 2 } },
  { id: 'gloves', name: 'Перчатки ловкача', icon: '🧤', tier: 1, cost: 50, mods: { atkSpeedPct: 0.18 } },
  { id: 'whetstone', name: 'Точильный камень', icon: '🪨', tier: 1, cost: 50, mods: { dmgPct: 0.2 } },
  { id: 'spyglass', name: 'Подзорная труба', icon: '🔭', tier: 1, cost: 45, mods: { range: 40 } },
  { id: 'amulet', name: 'Амулет жизни', icon: '📿', tier: 1, cost: 40, mods: { regen: 4, hp: 30 } },
  // Tier 2
  { id: 'axe', name: 'Боевой топор', icon: '🪓', tier: 2, cost: 120, mods: { dmg: 14, splash: 12 } },
  { id: 'chainmail', name: 'Кольчуга', icon: '🛡️', tier: 2, cost: 115, mods: { hp: 200, armor: 6 } },
  { id: 'quiver', name: 'Колчан ветра', icon: '🏹', tier: 2, cost: 130, mods: { atkSpeedPct: 0.35 } },
  { id: 'fang', name: 'Клык упыря', icon: '🦷', tier: 2, cost: 125, mods: { lifesteal: 0.12, dmg: 5 } },
  { id: 'ember', name: 'Сфера углей', icon: '🔥', tier: 2, cost: 140, mods: { splash: 25, dmgPct: 0.15 } },
  { id: 'banner', name: 'Боевое знамя', icon: '🚩', tier: 2, cost: 120, mods: { hp: 150, regen: 6, armor: 2 } },
  // Tier 3
  { id: 'dawn_blade', name: 'Клинок зари', icon: '⚔️', tier: 3, cost: 280, mods: { dmg: 32, atkSpeedPct: 0.25 } },
  { id: 'citadel', name: 'Щит цитадели', icon: '🏰', tier: 3, cost: 260, mods: { hp: 500, armor: 14 } },
  { id: 'storm_eye', name: 'Око бури', icon: '🌩️', tier: 3, cost: 300, mods: { range: 80, dmgPct: 0.45 } },
  { id: 'phoenix', name: 'Сердце феникса', icon: '❤️‍🔥', tier: 3, cost: 290, mods: { hp: 300, regen: 12, lifesteal: 0.1 } },
  // Crafted (tier 4) — only from recipes in the forge
  { id: 'master_blade', name: 'Клинок мастера', icon: '🔪', tier: 4, cost: 220, mods: { dmg: 16, dmgPct: 0.35 } },
  { id: 'guard_armor', name: 'Доспех стража', icon: '🥋', tier: 4, cost: 200, mods: { hp: 280, armor: 7, regen: 7 } },
  { id: 'storm_gloves', name: 'Буревые перчатки', icon: '🌀', tier: 4, cost: 260, mods: { atkSpeedPct: 0.75 } },
  { id: 'flame_eye', name: 'Око пламени', icon: '👁️', tier: 4, cost: 280, mods: { range: 70, splash: 30, dmgPct: 0.25 } },
  { id: 'blood_axe', name: 'Кровавая секира', icon: '🩸', tier: 4, cost: 300, mods: { dmg: 26, lifesteal: 0.2, splash: 14 } },
  { id: 'bastion', name: 'Бастион', icon: '🗿', tier: 4, cost: 320, mods: { hp: 480, armor: 12, regen: 8 } },
];

/** Forge recipes: two items (any rarity) -> one crafted item of the higher rarity of the two. */
export const RECIPES: { a: string; b: string; result: string }[] = [
  { a: 'rusty_sword', b: 'whetstone', result: 'master_blade' },
  { a: 'leather', b: 'amulet', result: 'guard_armor' },
  { a: 'gloves', b: 'quiver', result: 'storm_gloves' },
  { a: 'spyglass', b: 'ember', result: 'flame_eye' },
  { a: 'fang', b: 'axe', result: 'blood_axe' },
  { a: 'chainmail', b: 'banner', result: 'bastion' },
];

/** Item and skill rarities: grey → blue → purple → orange. */
export const RARITY = [
  { name: 'Обычный', color: '#c9c3b6', mult: 1 },
  { name: 'Редкий', color: '#4f9dff', mult: 1.8 },
  { name: 'Эпический', color: '#b56bff', mult: 2.9 },
  { name: 'Легендарный', color: '#ff9a2e', mult: 4.4 },
];
export const MAX_RARITY = RARITY.length - 1;
/** Identical items (same id and rarity) that merge into one of the next rarity. */
export const MERGE_COUNT = 3;

export function scaleMods(m: Mods, mult: number): Mods {
  const out: Mods = {};
  for (const [k, v] of Object.entries(m) as [keyof Mods, number][]) {
    const x = v * mult;
    out[k] = k === 'dmgPct' || k === 'atkSpeedPct' || k === 'lifesteal' ? Math.round(x * 100) / 100 : Math.round(x);
  }
  return out;
}

export function itemTierUnlocked(tier: number, wave: number): boolean {
  if (tier === 1) return true;
  if (tier === 2) return wave >= 3;
  if (tier === 3) return wave >= 6;
  return false;
}

export function describeMods(m: Mods): string {
  const p: string[] = [];
  if (m.dmg) p.push(`+${m.dmg} урон`);
  if (m.dmgPct) p.push(`+${Math.round(m.dmgPct * 100)}% урон`);
  if (m.atkSpeedPct) p.push(`+${Math.round(m.atkSpeedPct * 100)}% скор. атаки`);
  if (m.hp) p.push(`+${m.hp} HP`);
  if (m.armor) p.push(`+${m.armor} броня`);
  if (m.range) p.push(`+${m.range} дальность`);
  if (m.lifesteal) p.push(`+${Math.round(m.lifesteal * 100)}% вампиризм`);
  if (m.splash) p.push(`+${m.splash} радиус взрыва`);
  if (m.heal) p.push(`+${m.heal} лечение`);
  if (m.regen) p.push(`+${m.regen} HP/с`);
  return p.join(', ');
}

// ---------- permanent progression between runs (bought with glory shards) ----------
export interface MetaUpgrade {
  id: string;
  hero?: string; // only for that hero
  name: string;
  icon: string;
  max: number;
  baseCost: number;
  desc: (lvl: number) => string;
}

export const META_UPGRADES: MetaUpgrade[] = [
  { id: 'walls', name: 'Крепкие стены', icon: '🧱', max: 5, baseCost: 20, desc: (l) => `+${l * 15}% здоровья замка` },
  { id: 'towers', name: 'Башенные мастера', icon: '🏹', max: 4, baseCost: 30, desc: (l) => `Башни начинают с уровня ${1 + l}` },
  { id: 'treasury', name: 'Казна', icon: '💰', max: 5, baseCost: 15, desc: (l) => `+${l * 40} стартового золота` },
  { id: 'taxes', name: 'Налоги', icon: '🪙', max: 5, baseCost: 25, desc: (l) => `+${l * 10}% золота за убийства` },
  { id: 'drill', name: 'Боевой опыт', icon: '📜', max: 5, baseCost: 20, desc: (l) => `+${l * 10}% опыта героям` },
  { id: 'forge', name: 'Королевская кузница', icon: '⚒️', max: 3, baseCost: 35, desc: (l) => `−${l * 15}% цены улучшения предметов` },
  { id: 'hardy_warden', hero: 'warden', name: 'Закалка Брана', icon: '🛡️', max: 5, baseCost: 20, desc: (l) => `Бран: +${l * 8}% урона и здоровья` },
  { id: 'hardy_ranger', hero: 'ranger', name: 'Закалка Ивы', icon: '🏹', max: 5, baseCost: 20, desc: (l) => `Ива: +${l * 8}% урона и здоровья` },
  { id: 'hardy_pyro', hero: 'pyro', name: 'Закалка Оррина', icon: '🔥', max: 5, baseCost: 20, desc: (l) => `Оррин: +${l * 8}% урона и здоровья` },
  { id: 'mentor_warden', hero: 'warden', name: 'Наставник Брана', icon: '🎓', max: 3, baseCost: 40, desc: (l) => `Бран приходит на ${l} ур. выше` },
  { id: 'mentor_ranger', hero: 'ranger', name: 'Наставник Ивы', icon: '🎓', max: 3, baseCost: 40, desc: (l) => `Ива приходит на ${l} ур. выше` },
  { id: 'mentor_pyro', hero: 'pyro', name: 'Наставник Оррина', icon: '🎓', max: 3, baseCost: 40, desc: (l) => `Оррин приходит на ${l} ур. выше` },
];

export const metaCost = (u: MetaUpgrade, lvl: number): number => u.baseCost * (lvl + 1);

export type Shape = 'circle' | 'square' | 'triangle' | 'diamond';

export interface EnemyDef {
  id: string;
  name: string;
  color: string;
  shape: Shape;
  radius: number;
  hp: number;
  dmg: number;
  atkSpeed: number;
  range: number;
  speed: number;
  armor: number;
  gold: number;
  xp: number;
  ignoresHeroes: boolean; // true = runs straight for the castle (no enemy uses it now)
}

// Enemy damage is fixed per type: later waves get harder through more enemies
// and new, stronger goblin types (see `unlockWave`), not through damage scaling.
export const ENEMIES: Record<string, EnemyDef> = {
  grunt: { id: 'grunt', name: 'Гоблин-рубака', color: '#7cbf3a', shape: 'circle', radius: 7, hp: 48, dmg: 6, atkSpeed: 1, range: 6, speed: 55, armor: 0, gold: 2, xp: 2, ignoresHeroes: false },
  runner: { id: 'runner', name: 'Гоблин на волке', color: '#8d8d8d', shape: 'triangle', radius: 8, hp: 36, dmg: 6, atkSpeed: 1.2, range: 6, speed: 105, armor: 0, gold: 2, xp: 2, ignoresHeroes: false },
  spitter: { id: 'spitter', name: 'Гоблин-шаман', color: '#a35bd6', shape: 'diamond', radius: 7, hp: 42, dmg: 10, atkSpeed: 0.8, range: 130, speed: 48, armor: 0, gold: 3, xp: 3, ignoresHeroes: false },
  brute: { id: 'brute', name: 'Хобгоблин', color: '#4f7d2a', shape: 'square', radius: 12, hp: 260, dmg: 20, atkSpeed: 0.7, range: 8, speed: 34, armor: 4, gold: 7, xp: 8, ignoresHeroes: false },
  knight: { id: 'knight', name: 'Гоблин-латник', color: '#8a96a8', shape: 'square', radius: 9, hp: 220, dmg: 16, atkSpeed: 0.9, range: 6, speed: 42, armor: 14, gold: 6, xp: 6, ignoresHeroes: false },
  champion: { id: 'champion', name: 'Гоблин-вожак', color: '#b8452f', shape: 'square', radius: 14, hp: 900, dmg: 38, atkSpeed: 0.8, range: 10, speed: 40, armor: 8, gold: 15, xp: 20, ignoresHeroes: false },
  boss: { id: 'boss', name: 'Король гоблинов', color: '#d2a92c', shape: 'square', radius: 22, hp: 1800, dmg: 55, atkSpeed: 0.6, range: 12, speed: 26, armor: 10, gold: 60, xp: 90, ignoresHeroes: false },
};

/** Wave a type first appears in, and its spawn weight (grows a little each wave after that). */
export const UNLOCKS: { type: string; unlockWave: number; weight: number; growth: number }[] = [
  { type: 'grunt', unlockWave: 1, weight: 10, growth: 0 },
  { type: 'runner', unlockWave: 2, weight: 3, growth: 0.3 },
  { type: 'spitter', unlockWave: 3, weight: 2, growth: 0.25 },
  { type: 'brute', unlockWave: 4, weight: 1, growth: 0.15 },
  { type: 'knight', unlockWave: 7, weight: 1.5, growth: 0.3 },
  { type: 'champion', unlockWave: 11, weight: 0.4, growth: 0.08 },
];

export interface SpawnEntry {
  type: string;
  at: number; // seconds after wave start
}

/** Total enemies in a wave: dozens early, hundreds later. */
export function waveSize(wave: number): number {
  return Math.min(900, Math.round(12 + 5 * wave + 1.2 * wave * wave));
}

/** Enemy HP multiplier for a wave (mild; damage never scales). */
export function waveHpScale(wave: number): number {
  return 1 + 0.15 * (wave - 1) + 0.035 * (wave - 1) * (wave - 1);
}

export function buildWave(wave: number, rnd: () => number = Math.random): SpawnEntry[] {
  const total = waveSize(wave);
  const duration = Math.min(32, 12 + wave * 1.2);
  const weights: [string, number][] = UNLOCKS
    .filter((u) => wave >= u.unlockWave)
    .map((u) => [u.type, u.weight + (wave - u.unlockWave) * u.growth]);
  const sum = weights.reduce((s, w) => s + w[1], 0);

  const list: SpawnEntry[] = [];
  for (let i = 0; i < total; i++) {
    let r = rnd() * sum;
    let type = 'grunt';
    for (const [t, w] of weights) {
      r -= w;
      if (r <= 0) { type = t; break; }
    }
    // Spawn in bursts ("packs") so the field fills up in waves of enemies.
    const pack = Math.floor((i / total) * 8);
    const at = (pack / 8) * duration + rnd() * (duration / 8);
    list.push({ type, at });
  }
  const bosses = Math.floor(wave / 5);
  for (let b = 0; b < bosses; b++) list.push({ type: 'boss', at: duration * (0.5 + 0.4 * (b / Math.max(1, bosses))) });
  list.sort((a, b) => a.at - b.at);
  return list;
}
