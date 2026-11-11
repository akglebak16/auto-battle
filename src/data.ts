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

/** Special item effects ("особые" items). Strength grows with the item's rarity. */
export type ItemEffect = 'frost' | 'chain' | 'greed' | 'revive' | 'execute';

export interface ItemDef {
  id: string;
  name: string;
  icon: string;
  tier: 1 | 2 | 3 | 4; // 4 = crafted only (never sold in the shop)
  cost: number;
  mods: Mods;
  effect?: ItemEffect;
}

/** Effect numbers by rarity (0 grey .. 3 orange). */
export const EFFECTS = {
  frost: { slow: [0.25, 0.35, 0.45, 0.6], dur: 1.5 },
  chain: { every: [5, 4, 4, 3], targets: [3, 4, 5, 7], dmg: 1.2, radius: 170 },
  greed: { gold: [1, 2, 3, 5] },
  revive: { hp: [0.4, 0.55, 0.7, 1] },
  execute: { below: [0.1, 0.14, 0.18, 0.25] },
};

export function describeEffect(e: ItemEffect | undefined, r: number): string {
  const pc = (v: number) => Math.round(v * 100) + '%';
  switch (e) {
    case 'frost': return `Атаки замедляют врагов на ${pc(EFFECTS.frost.slow[r])}`;
    case 'chain': return `Каждая ${EFFECTS.chain.every[r]}-я атака — молния по ${EFFECTS.chain.targets[r]} врагам`;
    case 'greed': return `+${EFFECTS.greed.gold[r]} 🪙 за каждое убийство этим героем`;
    case 'revive': return `Раз за волну воскрешает героя с ${pc(EFFECTS.revive.hp[r])} HP`;
    case 'execute': return `Добивает врагов с HP ниже ${pc(EFFECTS.execute.below[r])} (кроме боссов)`;
    default: return '';
  }
}

export const ITEMS: ItemDef[] = [
  // Tier 1
  { id: 'rusty_sword', name: 'Ржавый меч', icon: '🗡️', tier: 1, cost: 45, mods: { dmg: 6 } },
  { id: 'leather', name: 'Кожаная куртка', icon: '🦺', tier: 1, cost: 40, mods: { hp: 80, armor: 2 } },
  { id: 'gloves', name: 'Перчатки ловкача', icon: '🧤', tier: 1, cost: 50, mods: { atkSpeedPct: 0.18 } },
  { id: 'whetstone', name: 'Точильный камень', icon: '🪨', tier: 1, cost: 50, mods: { dmgPct: 0.2 } },
  { id: 'spyglass', name: 'Подзорная труба', icon: '🔭', tier: 1, cost: 45, mods: { range: 45, dmg: 3 } },
  { id: 'amulet', name: 'Амулет жизни', icon: '📿', tier: 1, cost: 40, mods: { regen: 5, hp: 60 } },
  { id: 'purse', name: 'Кошель вора', icon: '👛', tier: 1, cost: 55, mods: { dmg: 3 }, effect: 'greed' },
  // Tier 2
  { id: 'axe', name: 'Боевой топор', icon: '🪓', tier: 2, cost: 120, mods: { dmg: 14, splash: 12 } },
  { id: 'chainmail', name: 'Кольчуга', icon: '🛡️', tier: 2, cost: 115, mods: { hp: 200, armor: 6 } },
  { id: 'quiver', name: 'Колчан ветра', icon: '🏹', tier: 2, cost: 130, mods: { atkSpeedPct: 0.35 } },
  { id: 'fang', name: 'Клык упыря', icon: '🦷', tier: 2, cost: 125, mods: { lifesteal: 0.12, dmg: 8 } },
  { id: 'ember', name: 'Сфера углей', icon: '🔥', tier: 2, cost: 140, mods: { splash: 25, dmgPct: 0.15 } },
  { id: 'banner', name: 'Боевое знамя', icon: '🚩', tier: 2, cost: 120, mods: { hp: 150, regen: 6, armor: 2 } },
  { id: 'frost_shard', name: 'Ледяной осколок', icon: '❄️', tier: 2, cost: 140, mods: { dmg: 5 }, effect: 'frost' },
  { id: 'headsman', name: 'Топор палача', icon: '⚰️', tier: 2, cost: 150, mods: { dmg: 8 }, effect: 'execute' },
  // Tier 3
  { id: 'dawn_blade', name: 'Клинок зари', icon: '⚔️', tier: 3, cost: 280, mods: { dmg: 32, atkSpeedPct: 0.25 } },
  { id: 'citadel', name: 'Щит цитадели', icon: '🏰', tier: 3, cost: 260, mods: { hp: 500, armor: 14 } },
  { id: 'storm_eye', name: 'Око бури', icon: '🌩️', tier: 3, cost: 300, mods: { range: 80, dmgPct: 0.45 } },
  { id: 'phoenix', name: 'Сердце феникса', icon: '❤️‍🔥', tier: 3, cost: 290, mods: { hp: 300, regen: 12, lifesteal: 0.1 } },
  { id: 'thunder', name: 'Молот грома', icon: '⚡', tier: 3, cost: 320, mods: { dmg: 14 }, effect: 'chain' },
  { id: 'feather', name: 'Перо феникса', icon: '🪶', tier: 3, cost: 270, mods: { hp: 180, armor: 4 }, effect: 'revive' },
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

/** Chance of a rarer offer in the shop, by wave (the next wave's number). */
export function offerRarityOdds(wave: number): number[] {
  const rare = Math.min(0.4, Math.max(0, 0.035 * (wave - 2)));
  const epic = Math.min(0.22, Math.max(0, 0.02 * (wave - 7)));
  const legendary = Math.min(0.08, Math.max(0, 0.01 * (wave - 13)));
  return [1 - rare - epic - legendary, rare, epic, legendary];
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

// ---------- permanent progression between runs (bought with glory gems) ----------
// The citadel is a tree of four branches; a node opens once its parent has at least one level.
export type Branch = 'castle' | 'economy' | 'magic' | 'heroes';
export const BRANCHES: { id: Branch; name: string; icon: string }[] = [
  { id: 'heroes', name: 'Отряд', icon: '⚔️' },
  { id: 'castle', name: 'Твердыня', icon: '🏰' },
  { id: 'magic', name: 'Магия', icon: '✨' },
  { id: 'economy', name: 'Казна', icon: '💰' },
];

export interface MetaUpgrade {
  id: string;
  branch: Branch;
  req?: string; // parent node that needs at least one level
  name: string;
  icon: string;
  max: number;
  baseCost: number;
  growth: number; // cost multiplier per level
  desc: (lvl: number) => string;
}

export const META_UPGRADES: MetaUpgrade[] = [
  // Отряд
  { id: 'slot2', branch: 'heroes', name: 'Второй герой', icon: '🤝', max: 1, baseCost: 60, growth: 1, desc: () => 'В забеге к вам присоединится второй герой (уровень отряда 3)' },
  { id: 'drill', branch: 'heroes', req: 'slot2', name: 'Боевой опыт', icon: '📜', max: 5, baseCost: 90, growth: 1.55, desc: (l) => `+${l * 10}% опыта героям` },
  { id: 'hardy', branch: 'heroes', req: 'slot2', name: 'Закалка', icon: '💪', max: 5, baseCost: 120, growth: 1.6, desc: (l) => `+${l * 6}% урона и здоровья всем героям` },
  { id: 'slot3', branch: 'heroes', req: 'drill', name: 'Третий герой', icon: '🛡️', max: 1, baseCost: 450, growth: 1, desc: () => 'Третий герой присоединится на уровне отряда 8' },
  { id: 'rally', branch: 'heroes', req: 'slot3', name: 'Зов знамён', icon: '🚩', max: 2, baseCost: 500, growth: 2, desc: (l) => `Новые герои приходят на ${l * 2} ур. отряда раньше` },
  { id: 'mentor', branch: 'heroes', req: 'hardy', name: 'Наставник', icon: '🎓', max: 3, baseCost: 350, growth: 1.8, desc: (l) => `Все герои начинают на ${l} ур. выше` },
  // Твердыня
  { id: 'walls', branch: 'castle', name: 'Крепкие стены', icon: '🧱', max: 5, baseCost: 50, growth: 1.6, desc: (l) => `+${l * 12}% здоровья замка` },
  { id: 'towers', branch: 'castle', req: 'walls', name: 'Башенные мастера', icon: '🏹', max: 3, baseCost: 160, growth: 2, desc: (l) => `Башни начинают с уровня ${1 + l}` },
  { id: 'mason', branch: 'castle', req: 'walls', name: 'Каменщики', icon: '🔨', max: 3, baseCost: 140, growth: 1.8, desc: (l) => `Ремонт дешевле на ${l * 15}%, после волны стены чинятся на ${30 + l * 40}` },
  { id: 'spikes', branch: 'castle', req: 'towers', name: 'Частокол', icon: '🪵', max: 3, baseCost: 400, growth: 1.8, desc: (l) => `Враги у стены получают ${l * 15} урона в секунду` },
  // Магия
  { id: 'sp_fire', branch: 'magic', name: 'Огненный дождь', icon: '☄️', max: 3, baseCost: 100, growth: 2.4, desc: (l) => l <= 1 ? 'Заклинание: огонь по области' : `Огненный дождь: +${(l - 1) * 40}% урона` },
  { id: 'sp_frost', branch: 'magic', req: 'sp_fire', name: 'Ледяные оковы', icon: '❄️', max: 3, baseCost: 260, growth: 2.2, desc: (l) => l <= 1 ? 'Заклинание: замедляет врагов в области' : `Оковы: +${l - 1} с замедления, сильнее` },
  { id: 'arcane', branch: 'magic', req: 'sp_fire', name: 'Мудрость магов', icon: '📖', max: 3, baseCost: 220, growth: 1.9, desc: (l) => `Перезарядка заклинаний −${l * 12}%` },
  { id: 'sp_bless', branch: 'magic', req: 'sp_frost', name: 'Благословение', icon: '🌟', max: 3, baseCost: 600, growth: 2, desc: (l) => l <= 1 ? 'Заклинание: лечит героев и ускоряет атаки' : l === 2 ? 'Благословение лечит сильнее' : 'Благословение воскрешает павших' },
  // Казна
  { id: 'treasury', branch: 'economy', name: 'Казна', icon: '💰', max: 5, baseCost: 40, growth: 1.55, desc: (l) => `+${l * 40} стартового золота` },
  { id: 'taxes', branch: 'economy', req: 'treasury', name: 'Налоги', icon: '🪙', max: 5, baseCost: 110, growth: 1.6, desc: (l) => `+${l * 10}% золота за убийства` },
  { id: 'forge', branch: 'economy', req: 'treasury', name: 'Королевская кузница', icon: '⚒️', max: 3, baseCost: 150, growth: 1.8, desc: (l) => `−${l * 15}% цены улучшения предметов` },
  { id: 'merchant', branch: 'economy', req: 'taxes', name: 'Торговые связи', icon: '🐪', max: 2, baseCost: 350, growth: 2.2, desc: (l) => `+${l} товар в лавке` },
  { id: 'gemcutter', branch: 'economy', req: 'taxes', name: 'Огранщик', icon: '💎', max: 4, baseCost: 300, growth: 1.7, desc: (l) => `+${l * 15}% алмазов с врагов` },
];

// Deeper nodes (with a parent) cost 1.5x: the first steps are quick, the rest is a long climb.
export const metaCost = (u: MetaUpgrade, lvl: number): number => Math.round(u.baseCost * (u.req ? 1.5 : 1) * Math.pow(u.growth, lvl) / 5) * 5;

// ---------- player spells (opened in the citadel's Magic branch) ----------
export interface SpellDef { id: string; node: string; key: string; name: string; icon: string; cd: number; radius: number; desc: string }
export const SPELLS: SpellDef[] = [
  { id: 'fire', node: 'sp_fire', key: 'Q', name: 'Огненный дождь', icon: '☄️', cd: 20, radius: 95, desc: 'Метеоры по области: большой урон всем врагам' },
  { id: 'frost', node: 'sp_frost', key: 'W', name: 'Ледяные оковы', icon: '❄️', cd: 26, radius: 150, desc: 'Сильно замедляет и ранит врагов в области' },
  { id: 'bless', node: 'sp_bless', key: 'E', name: 'Благословение', icon: '🌟', cd: 40, radius: 0, desc: 'Лечит всех героев и ускоряет их атаки на 6 с' },
];

export type Shape = 'circle' | 'square' | 'triangle' | 'diamond';

export interface EnemyDef {
  id: string;
  name: string;
  icon: string;
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
  ignoresHeroes: boolean; // true = runs straight for the castle, fighting heroes only if blocked
  explodes?: number; // castle damage when it reaches the wall (and dies)
  gems: number; // glory gems dropped on death
}

// Later waves get harder through more enemies, new goblin types (see `unlockWave`),
// and HP / damage growth (waveHpScale, waveDmgScale).
// ignoresHeroes = raiders that run for the walls; heroes and towers must intercept them.
export const ENEMIES: Record<string, EnemyDef> = {
  grunt: { id: 'grunt', name: 'Гоблин-рубака', icon: '👺', color: '#7cbf3a', shape: 'circle', radius: 7, hp: 48, dmg: 6, atkSpeed: 1, range: 6, speed: 55, armor: 0, gold: 2, xp: 2, ignoresHeroes: false, gems: 1 },
  runner: { id: 'runner', name: 'Налётчик на волке', icon: '🐺', color: '#8d8d8d', shape: 'triangle', radius: 8, hp: 40, dmg: 7, atkSpeed: 1.2, range: 6, speed: 100, armor: 0, gold: 2, xp: 2, ignoresHeroes: false, gems: 1 },
  spitter: { id: 'spitter', name: 'Гоблин-шаман', icon: '🔮', color: '#a35bd6', shape: 'diamond', radius: 7, hp: 42, dmg: 10, atkSpeed: 0.8, range: 130, speed: 48, armor: 0, gold: 3, xp: 3, ignoresHeroes: false, gems: 1 },
  sapper: { id: 'sapper', name: 'Гоблин-подрывник', icon: '💣', color: '#c9a34a', shape: 'circle', radius: 7, hp: 70, dmg: 0, atkSpeed: 1, range: 4, speed: 64, armor: 2, gold: 4, xp: 3, ignoresHeroes: true, explodes: 45, gems: 2 },
  brute: { id: 'brute', name: 'Хобгоблин', icon: '👹', color: '#4f7d2a', shape: 'square', radius: 12, hp: 260, dmg: 20, atkSpeed: 0.7, range: 8, speed: 34, armor: 4, gold: 7, xp: 8, ignoresHeroes: false, gems: 3 },
  knight: { id: 'knight', name: 'Гоблин-латник', icon: '🪖', color: '#8a96a8', shape: 'square', radius: 9, hp: 220, dmg: 16, atkSpeed: 0.9, range: 6, speed: 42, armor: 14, gold: 6, xp: 6, ignoresHeroes: false, gems: 3 },
  champion: { id: 'champion', name: 'Гоблин-вожак', icon: '🗡️', color: '#b8452f', shape: 'square', radius: 14, hp: 900, dmg: 38, atkSpeed: 0.8, range: 10, speed: 40, armor: 8, gold: 15, xp: 20, ignoresHeroes: false, gems: 8 },
  boss: { id: 'boss', name: 'Король гоблинов', icon: '👑', color: '#d2a92c', shape: 'square', radius: 22, hp: 1800, dmg: 55, atkSpeed: 0.6, range: 12, speed: 26, armor: 10, gold: 60, xp: 90, ignoresHeroes: false, gems: 30 },
};

/** Wave a type first appears in, and its spawn weight (grows a little each wave after that). */
export const UNLOCKS: { type: string; unlockWave: number; weight: number; growth: number }[] = [
  { type: 'grunt', unlockWave: 1, weight: 10, growth: 0 },
  { type: 'runner', unlockWave: 2, weight: 2, growth: 0.25 },
  { type: 'spitter', unlockWave: 3, weight: 2, growth: 0.25 },
  { type: 'sapper', unlockWave: 8, weight: 0.8, growth: 0.12 },
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
  const base = 12 + 5 * wave + 1.2 * wave * wave;
  const eased = wave <= 6 ? 0.75 + 0.04 * wave : 1; // gentler start: a lone hero must survive the first waves
  return Math.min(900, Math.round(base * eased));
}

/** Enemy damage multiplier for a wave. */
/** Gems per enemy shrink in later (much bigger) waves so a deep run doesn't buy the whole citadel. */
export function gemScale(wave: number): number { return 0.75 / (1 + 0.25 * Math.max(0, wave - 1)); }

/** Kill gold flattens out in big late waves (otherwise the economy snowballs). */
export function goldScale(wave: number): number { return Math.max(0.5, 1 / (1 + 0.05 * Math.max(0, wave - 3))); }

export function waveDmgScale(wave: number): number {
  return 1 + 0.08 * Math.max(0, wave - 8);
}

/** Expected enemy counts of a wave (for the preview in the shop). */
export function wavePreview(wave: number): { type: string; count: number }[] {
  const total = waveSize(wave);
  const weights = UNLOCKS.filter((u) => wave >= u.unlockWave).map((u) => [u.type, u.weight + (wave - u.unlockWave) * u.growth] as const);
  const sum = weights.reduce((s, w) => s + w[1], 0);
  const out = weights.map(([type, w]) => ({ type, count: Math.round((total * w) / sum) })).filter((x) => x.count > 0);
  const bosses = Math.floor(wave / 5);
  if (bosses) out.push({ type: 'boss', count: bosses });
  return out;
}

/** Enemy HP multiplier for a wave. */
export function waveHpScale(wave: number): number {
  const n = wave - 1;
  // Hero power snowballs (item rarities, skill ranks), so late waves also grow exponentially.
  const late = Math.pow(1.16, Math.max(0, wave - 10));
  return (1 + 0.15 * n + 0.035 * n * n + 0.0016 * Math.pow(Math.max(0, n - 6), 3)) * late;
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
