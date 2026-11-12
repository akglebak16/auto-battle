// Static game data: heroes, items, enemies, wave composition.
// Tweak numbers here to rebalance the game.
import { L } from './i18n';
import { ic } from './icons';

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
    id: 'warden', name: L('Бран', 'Bran'), title: L('Страж ворот', 'Gatewarden'), role: 'tank', color: '#4a7bd1', letter: 'С',
    hp: 560, dmg: 22, atkSpeed: 1.0, range: 30, move: 75, armor: 10, splash: 34, heal: 0, lifesteal: 0,
    desc: L('Щитоносец. Держит толпу на себе, оглушает и отражает урон.', 'Shield-bearer. Holds the crowd on himself, stuns and reflects damage.'),
  },
  {
    id: 'ranger', name: L('Ива', 'Iva'), title: L('Лучница', 'Archer'), role: 'ranged', color: '#3fae5a', letter: 'Л',
    hp: 230, dmg: 29, atkSpeed: 1.5, range: 280, move: 90, armor: 1, splash: 26, heal: 0, lifesteal: 0,
    desc: L('Стреляет издалека: залпы, пробивающие стрелы, криты.', 'Shoots from afar: volleys, piercing arrows, crits.'),
  },
  {
    id: 'pyro', name: L('Оррин', 'Orrin'), title: L('Пиромант', 'Pyromancer'), role: 'mage', color: '#e0682b', letter: 'П',
    hp: 180, dmg: 27, atkSpeed: 0.7, range: 240, move: 75, armor: 0, splash: 54, heal: 0, lifesteal: 0,
    desc: L('Огонь по площади: метеоры, огненное кольцо, поджог.', 'Area fire: meteors, a ring of flame, burning.'),
  },
  {
    id: 'summoner', name: L('Морра', 'Morra'), title: L('Призывательница', 'Summoner'), role: 'mage', color: '#8a63c9', letter: 'Н',
    hp: 220, dmg: 24, atkSpeed: 1.0, range: 230, move: 80, armor: 1, splash: 0, heal: 0, lifesteal: 0,
    desc: L('Поднимает скелетов и мертвецов, вытягивает души. Сильна армией, а не руками.', 'Raises skeletons and the dead, drains souls. Strong through her army, not her hands.'),
  },
];

/** Summoned skeleton warrior (not a real hero: lives for a while, has no items or skills). */
export const SKELETON: HeroDef = {
  id: 'skeleton', name: L('Скелет', 'Skeleton'), title: '', role: 'tank', color: '#d8d2c0', letter: 'S',
  hp: 1, dmg: 1, atkSpeed: 1.1, range: 24, move: 95, armor: 3, splash: 0, heal: 0, lifesteal: 0, desc: '',
};

/** Heroes that must be opened in the citadel before they can join a run. */
export const LOCKED_HEROES: Record<string, string> = { summoner: 'unlock_summoner' };

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
    case 'frost': return L(`Атаки замедляют врагов на ${pc(EFFECTS.frost.slow[r])}`, `Attacks slow enemies by ${pc(EFFECTS.frost.slow[r])}`);
    case 'chain': return L(`Каждая ${EFFECTS.chain.every[r]}-я атака — молния по ${EFFECTS.chain.targets[r]} врагам`, `Every ${EFFECTS.chain.every[r]}th attack — lightning through ${EFFECTS.chain.targets[r]} enemies`);
    case 'greed': return L(`+${EFFECTS.greed.gold[r]} 🪙 за каждое убийство этим героем`, `+${EFFECTS.greed.gold[r]} 🪙 for every kill by this hero`);
    case 'revive': return L(`Раз за волну воскрешает героя с ${pc(EFFECTS.revive.hp[r])} HP`, `Once per wave, revives the hero with ${pc(EFFECTS.revive.hp[r])} HP`);
    case 'execute': return L(`Добивает врагов с HP ниже ${pc(EFFECTS.execute.below[r])} (кроме боссов)`, `Finishes off enemies below ${pc(EFFECTS.execute.below[r])} HP (not bosses)`);
    default: return '';
  }
}

export const ITEMS: ItemDef[] = [
  // Tier 1
  { id: 'rusty_sword', name: L('Ржавый меч', 'Rusty Sword'), icon: ic('item', 'rusty_sword'), tier: 1, cost: 45, mods: { dmg: 6 } },
  { id: 'leather', name: L('Кожаная куртка', 'Leather Jacket'), icon: ic('item', 'leather'), tier: 1, cost: 40, mods: { hp: 80, armor: 2 } },
  { id: 'gloves', name: L('Перчатки ловкача', 'Nimble Gloves'), icon: ic('item', 'gloves'), tier: 1, cost: 50, mods: { atkSpeedPct: 0.18 } },
  { id: 'whetstone', name: L('Точильный камень', 'Whetstone'), icon: ic('item', 'whetstone'), tier: 1, cost: 50, mods: { dmgPct: 0.2 } },
  { id: 'spyglass', name: L('Подзорная труба', 'Spyglass'), icon: ic('item', 'spyglass'), tier: 1, cost: 45, mods: { range: 45, dmg: 3 } },
  { id: 'amulet', name: L('Амулет жизни', 'Amulet of Life'), icon: ic('item', 'amulet'), tier: 1, cost: 40, mods: { regen: 5, hp: 60 } },
  { id: 'purse', name: L('Кошель вора', 'Thief\'s Purse'), icon: ic('item', 'purse'), tier: 1, cost: 55, mods: { dmg: 3 }, effect: 'greed' },
  { id: 'buckler', name: L('Деревянный щит', 'Wooden Shield'), icon: ic('item', 'buckler'), tier: 1, cost: 35, mods: { armor: 4, hp: 40 } },
  { id: 'dagger', name: L('Кинжал', 'Dagger'), icon: ic('item', 'dagger'), tier: 1, cost: 45, mods: { dmg: 4, atkSpeedPct: 0.1 } },
  { id: 'bandage', name: L('Бинты', 'Bandages'), icon: ic('item', 'bandage'), tier: 1, cost: 30, mods: { regen: 3, hp: 40 } },
  // Tier 2
  { id: 'warhammer', name: L('Боевой молот', 'Warhammer'), icon: ic('item', 'warhammer'), tier: 2, cost: 135, mods: { dmg: 20, armor: 2 } },
  { id: 'longbow', name: L('Длинный лук', 'Longbow'), icon: ic('item', 'longbow'), tier: 2, cost: 125, mods: { range: 70, dmg: 8 } },
  { id: 'troll_hide', name: L('Шкура тролля', 'Troll Hide'), icon: ic('item', 'troll_hide'), tier: 2, cost: 130, mods: { hp: 160, regen: 10 } },
  { id: 'skull', name: L('Проклятый череп', 'Cursed Skull'), icon: ic('item', 'skull'), tier: 2, cost: 150, mods: { dmgPct: 0.3, lifesteal: 0.06 } },
  { id: 'axe', name: L('Боевой топор', 'Battle Axe'), icon: ic('item', 'axe'), tier: 2, cost: 120, mods: { dmg: 14, splash: 12 } },
  { id: 'chainmail', name: L('Кольчуга', 'Chainmail'), icon: ic('item', 'chainmail'), tier: 2, cost: 115, mods: { hp: 200, armor: 6 } },
  { id: 'quiver', name: L('Колчан ветра', 'Wind Quiver'), icon: ic('item', 'quiver'), tier: 2, cost: 130, mods: { atkSpeedPct: 0.35 } },
  { id: 'fang', name: L('Клык упыря', 'Ghoul Fang'), icon: ic('item', 'fang'), tier: 2, cost: 125, mods: { lifesteal: 0.12, dmg: 8 } },
  { id: 'ember', name: L('Сфера углей', 'Ember Orb'), icon: ic('item', 'ember'), tier: 2, cost: 140, mods: { splash: 25, dmgPct: 0.15 } },
  { id: 'banner', name: L('Боевое знамя', 'War Banner'), icon: ic('item', 'banner'), tier: 2, cost: 120, mods: { hp: 150, regen: 6, armor: 2 } },
  { id: 'frost_shard', name: L('Ледяной осколок', 'Frost Shard'), icon: ic('item', 'frost_shard'), tier: 2, cost: 140, mods: { dmg: 5 }, effect: 'frost' },
  { id: 'headsman', name: L('Топор палача', 'Headsman\'s Axe'), icon: ic('item', 'headsman'), tier: 2, cost: 150, mods: { dmg: 8 }, effect: 'execute' },
  // Tier 3
  { id: 'dawn_blade', name: L('Клинок зари', 'Dawn Blade'), icon: ic('item', 'dawn_blade'), tier: 3, cost: 280, mods: { dmg: 32, atkSpeedPct: 0.25 } },
  { id: 'citadel', name: L('Щит цитадели', 'Citadel Shield'), icon: ic('item', 'citadel'), tier: 3, cost: 260, mods: { hp: 500, armor: 14 } },
  { id: 'storm_eye', name: L('Око бури', 'Eye of the Storm'), icon: ic('item', 'storm_eye'), tier: 3, cost: 300, mods: { range: 80, dmgPct: 0.45 } },
  { id: 'phoenix', name: L('Сердце феникса', 'Phoenix Heart'), icon: ic('item', 'phoenix'), tier: 3, cost: 290, mods: { hp: 300, regen: 12, lifesteal: 0.1 } },
  { id: 'thunder', name: L('Молот грома', 'Thunder Hammer'), icon: ic('item', 'thunder'), tier: 3, cost: 320, mods: { dmg: 14 }, effect: 'chain' },
  { id: 'feather', name: L('Перо феникса', 'Phoenix Feather'), icon: ic('item', 'feather'), tier: 3, cost: 270, mods: { hp: 180, armor: 4 }, effect: 'revive' },
  { id: 'dragon_scale', name: L('Чешуя дракона', 'Dragon Scale'), icon: ic('item', 'dragon_scale'), tier: 3, cost: 300, mods: { hp: 400, armor: 10, regen: 6 } },
  { id: 'sun_bow', name: L('Лук солнца', 'Sun Bow'), icon: ic('item', 'sun_bow'), tier: 3, cost: 320, mods: { range: 60, atkSpeedPct: 0.4, dmg: 10 } },
  { id: 'reaper', name: L('Коса жнеца', 'Reaper\'s Scythe'), icon: ic('item', 'reaper'), tier: 3, cost: 330, mods: { dmg: 22 }, effect: 'execute' },
  { id: 'frost_crown', name: L('Ледяная корона', 'Frost Crown'), icon: ic('item', 'frost_crown'), tier: 3, cost: 310, mods: { hp: 150, dmgPct: 0.2 }, effect: 'frost' },
  // Crafted (tier 4) — only from recipes in the forge
  { id: 'master_blade', name: L('Клинок мастера', 'Master\'s Blade'), icon: ic('item', 'master_blade'), tier: 4, cost: 220, mods: { dmg: 16, dmgPct: 0.35 } },
  { id: 'guard_armor', name: L('Доспех стража', 'Warden\'s Armor'), icon: ic('item', 'guard_armor'), tier: 4, cost: 200, mods: { hp: 280, armor: 7, regen: 7 } },
  { id: 'storm_gloves', name: L('Буревые перчатки', 'Storm Gloves'), icon: ic('item', 'storm_gloves'), tier: 4, cost: 260, mods: { atkSpeedPct: 0.75 } },
  { id: 'flame_eye', name: L('Око пламени', 'Eye of Flame'), icon: ic('item', 'flame_eye'), tier: 4, cost: 280, mods: { range: 70, splash: 30, dmgPct: 0.25 } },
  { id: 'blood_axe', name: L('Кровавая секира', 'Blood Axe'), icon: ic('item', 'blood_axe'), tier: 4, cost: 300, mods: { dmg: 26, lifesteal: 0.2, splash: 14 } },
  { id: 'twin_fangs', name: L('Парные клыки', 'Twin Fangs'), icon: ic('item', 'twin_fangs'), tier: 4, cost: 240, mods: { dmg: 12, atkSpeedPct: 0.45 } },
  { id: 'tower_shield', name: L('Башенный щит', 'Tower Shield'), icon: ic('item', 'tower_shield'), tier: 4, cost: 260, mods: { hp: 350, armor: 16 } },
  { id: 'hawkeye', name: L('Соколиный глаз', 'Hawkeye'), icon: ic('item', 'hawkeye'), tier: 4, cost: 270, mods: { range: 120, dmgPct: 0.3 } },
  { id: 'troll_heart', name: L('Сердце тролля', 'Troll Heart'), icon: ic('item', 'troll_heart'), tier: 4, cost: 260, mods: { hp: 300, regen: 22 } },
  { id: 'bastion', name: L('Бастион', 'Bastion'), icon: ic('item', 'bastion'), tier: 4, cost: 320, mods: { hp: 480, armor: 12, regen: 8 } },
];

/** Forge recipes: two items (any rarity) -> one crafted item of the higher rarity of the two. */
export const RECIPES: { a: string; b: string; result: string }[] = [
  { a: 'rusty_sword', b: 'whetstone', result: 'master_blade' },
  { a: 'leather', b: 'amulet', result: 'guard_armor' },
  { a: 'gloves', b: 'quiver', result: 'storm_gloves' },
  { a: 'spyglass', b: 'ember', result: 'flame_eye' },
  { a: 'fang', b: 'axe', result: 'blood_axe' },
  { a: 'chainmail', b: 'banner', result: 'bastion' },
  { a: 'dagger', b: 'gloves', result: 'twin_fangs' },
  { a: 'buckler', b: 'chainmail', result: 'tower_shield' },
  { a: 'longbow', b: 'spyglass', result: 'hawkeye' },
  { a: 'bandage', b: 'troll_hide', result: 'troll_heart' },
];

/** Item and skill rarities: grey → blue → purple → orange. */
export const RARITY = [
  { name: L('Обычный', 'Common'), color: '#c9c3b6', mult: 1 },
  { name: L('Редкий', 'Rare'), color: '#4f9dff', mult: 1.8 },
  { name: L('Эпический', 'Epic'), color: '#b56bff', mult: 2.9 },
  { name: L('Легендарный', 'Legendary'), color: '#ff9a2e', mult: 4.4 },
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
  if (m.dmg) p.push(`+${m.dmg} ${L('урон', 'damage')}`);
  if (m.dmgPct) p.push(`+${Math.round(m.dmgPct * 100)}% ${L('урон', 'damage')}`);
  if (m.atkSpeedPct) p.push(`+${Math.round(m.atkSpeedPct * 100)}% ${L('скор. атаки', 'attack speed')}`);
  if (m.hp) p.push(`+${m.hp} HP`);
  if (m.armor) p.push(`+${m.armor} ${L('броня', 'armor')}`);
  if (m.range) p.push(`+${m.range} ${L('дальность', 'range')}`);
  if (m.lifesteal) p.push(`+${Math.round(m.lifesteal * 100)}% ${L('вампиризм', 'lifesteal')}`);
  if (m.splash) p.push(`+${m.splash} ${L('радиус взрыва', 'splash radius')}`);
  if (m.heal) p.push(`+${m.heal} ${L('лечение', 'healing')}`);
  if (m.regen) p.push(`+${m.regen} ${L('HP/с', 'HP/s')}`);
  return p.join(', ');
}

// ---------- permanent progression between runs (bought with glory gems) ----------
// The citadel is a tree of four branches; a node opens once its parent has at least one level.
export type Branch = 'castle' | 'economy' | 'magic' | 'heroes';
export const BRANCHES: { id: Branch; name: string; icon: string }[] = [
  { id: 'heroes', name: L('Отряд', 'Squad'), icon: '⚔️' },
  { id: 'castle', name: L('Твердыня', 'Stronghold'), icon: '🏰' },
  { id: 'magic', name: L('Магия', 'Magic'), icon: '✨' },
  { id: 'economy', name: L('Казна', 'Treasury'), icon: '💰' },
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
  { id: 'rogalik', branch: 'heroes', name: L('Свентомартинский рогалик', 'St. Martin\'s Croissant'), icon: '🥐', max: 3, baseCost: 90, growth: 2, desc: (l) => L(`Герои сыты: +${l * 8}% здоровья и +${l * 2} HP/с восстановления`, `Well-fed heroes: +${l * 8}% health and +${l * 2} HP/s regeneration`) },
  { id: 'slot2', branch: 'heroes', name: L('Второй герой', 'Second Hero'), icon: '🤝', max: 1, baseCost: 150, growth: 1, desc: () => L('В забеге к вам присоединится второй герой (уровень отряда 3)', 'A second hero joins your run (at squad level 3)') },
  { id: 'pick_start', branch: 'heroes', req: 'slot2', name: L('Право выбора', 'Right of Choice'), icon: '👆', max: 1, baseCost: 100, growth: 1, desc: () => L('В меню можно выбрать, кто начнёт забег', 'Choose in the menu who starts the run') },
  { id: 'unlock_summoner', branch: 'heroes', req: 'pick_start', name: L('Призывательница Морра', 'Morra the Summoner'), icon: '💀', max: 1, baseCost: 250, growth: 1, desc: () => L('Новый герой: армия скелетов. Может прийти в отряд', 'New hero: an army of skeletons. Can join your squad') },
  { id: 'drill', branch: 'heroes', req: 'slot2', name: L('Боевой опыт', 'Battle Drill'), icon: '📜', max: 5, baseCost: 90, growth: 1.55, desc: (l) => L(`+${l * 10}% опыта героям`, `+${l * 10}% hero XP`) },
  { id: 'hardy', branch: 'heroes', req: 'slot2', name: L('Закалка', 'Toughening'), icon: '💪', max: 5, baseCost: 120, growth: 1.6, desc: (l) => L(`+${l * 6}% урона и здоровья всем героям`, `+${l * 6}% damage and health for all heroes`) },
  { id: 'slot3', branch: 'heroes', req: 'drill', name: L('Третий герой', 'Third Hero'), icon: '🛡️', max: 1, baseCost: 800, growth: 1, desc: () => L('Третий герой присоединится на уровне отряда 8', 'A third hero joins at squad level 8') },
  { id: 'rally', branch: 'heroes', req: 'slot3', name: L('Зов знамён', 'Call of Banners'), icon: '🚩', max: 2, baseCost: 500, growth: 2, desc: (l) => L(`Новые герои приходят на ${l * 2} ур. отряда раньше`, `New heroes join ${l * 2} squad levels earlier`) },
  { id: 'mentor', branch: 'heroes', req: 'hardy', name: L('Наставник', 'Mentor'), icon: '🎓', max: 3, baseCost: 350, growth: 1.8, desc: (l) => L(`Все герои начинают на ${l} ур. выше`, `All heroes start ${l} level${l > 1 ? 's' : ''} higher`) },
  // Твердыня
  { id: 'walls', branch: 'castle', name: L('Крепкие стены', 'Sturdy Walls'), icon: '🧱', max: 5, baseCost: 50, growth: 1.6, desc: (l) => L(`+${l * 12}% здоровья замка`, `+${l * 12}% castle health`) },
  { id: 'towers', branch: 'castle', req: 'walls', name: L('Башенные мастера', 'Tower Masters'), icon: '🏹', max: 3, baseCost: 160, growth: 2, desc: (l) => L(`Башни начинают с уровня ${1 + l}`, `Towers start at level ${1 + l}`) },
  { id: 'mason', branch: 'castle', req: 'walls', name: L('Каменщики', 'Masons'), icon: '🔨', max: 3, baseCost: 140, growth: 1.8, desc: (l) => L(`Ремонт дешевле на ${l * 15}%, после волны стены чинятся на ${30 + l * 40}`, `Repairs ${l * 15}% cheaper; walls mend ${30 + l * 40} HP after each wave`) },
  { id: 'spikes', branch: 'castle', req: 'towers', name: L('Частокол', 'Palisade'), icon: '🪵', max: 3, baseCost: 400, growth: 1.8, desc: (l) => L(`Враги у стены получают ${l * 15} урона в секунду`, `Enemies at the wall take ${l * 15} damage per second`) },
  // Магия
  { id: 'sp_fire', branch: 'magic', name: L('Огненный дождь', 'Fire Rain'), icon: '☄️', max: 3, baseCost: 100, growth: 2.4, desc: (l) => l <= 1 ? L('Заклинание: огонь по области', 'Spell: fire over an area') : L(`Огненный дождь: +${(l - 1) * 40}% урона`, `Fire Rain: +${(l - 1) * 40}% damage`) },
  { id: 'sp_frost', branch: 'magic', req: 'sp_fire', name: L('Ледяные оковы', 'Frost Shackles'), icon: '❄️', max: 3, baseCost: 260, growth: 2.2, desc: (l) => l <= 1 ? L('Заклинание: замедляет врагов в области', 'Spell: slows enemies in an area') : L(`Оковы: +${l - 1} с замедления, сильнее`, `Shackles: +${l - 1} s of slow, stronger`) },
  { id: 'sp_turret', branch: 'magic', req: 'sp_fire', name: L('Стрелковая вышка', 'Archer Tower'), icon: '🗼', max: 3, baseCost: 180, growth: 2.1, desc: (l) => l <= 1 ? L('Заклинание (R): ставит вышку с лучником', 'Spell (R): builds a tower with an archer') : L(`Вышка: стреляет дольше и на ${(l - 1) * 25}% сильнее`, `Tower: shoots longer and ${(l - 1) * 25}% harder`) },
  { id: 'arcane', branch: 'magic', req: 'sp_fire', name: L('Мудрость магов', 'Mages\' Wisdom'), icon: '📖', max: 3, baseCost: 220, growth: 1.9, desc: (l) => L(`Перезарядка заклинаний −${l * 12}%`, `Spell cooldowns −${l * 12}%`) },
  { id: 'sp_bless', branch: 'magic', req: 'sp_frost', name: L('Благословение', 'Blessing'), icon: '🌟', max: 3, baseCost: 600, growth: 2, desc: (l) => l <= 1 ? L('Заклинание: лечит героев и ускоряет атаки', 'Spell: heals heroes and speeds up their attacks') : l === 2 ? L('Благословение лечит сильнее', 'Blessing heals more') : L('Благословение воскрешает павших', 'Blessing revives the fallen') },
  // Казна
  { id: 'treasury', branch: 'economy', name: L('Казна', 'Treasury'), icon: '💰', max: 5, baseCost: 40, growth: 1.55, desc: (l) => L(`+${l * 40} стартового золота`, `+${l * 40} starting gold`) },
  { id: 'taxes', branch: 'economy', req: 'treasury', name: L('Налоги', 'Taxes'), icon: '🪙', max: 5, baseCost: 110, growth: 1.6, desc: (l) => L(`+${l * 10}% золота за убийства`, `+${l * 10}% gold from kills`) },
  { id: 'forge', branch: 'economy', req: 'treasury', name: L('Королевская кузница', 'Royal Forge'), icon: '⚒️', max: 3, baseCost: 150, growth: 1.8, desc: (l) => L(`−${l * 15}% цены улучшения предметов`, `−${l * 15}% item upgrade cost`) },
  { id: 'merchant', branch: 'economy', req: 'taxes', name: L('Торговые связи', 'Trade Ties'), icon: '🐪', max: 2, baseCost: 350, growth: 2.2, desc: (l) => L(`+${l} товар в лавке`, `+${l} shop slot${l > 1 ? 's' : ''}`) },
  { id: 'interest', branch: 'economy', req: 'treasury', name: L('Проценты', 'Interest'), icon: '🏦', max: 3, baseCost: 180, growth: 1.8, desc: (l) => L(`После волны +${l * 5}% к золоту (до ${40 + l * 40})`, `After each wave, +${l * 5}% interest on gold (up to ${40 + l * 40})`) },
  { id: 'bargain', branch: 'economy', req: 'merchant', name: L('Скидки', 'Discounts'), icon: '🏷️', max: 3, baseCost: 300, growth: 1.8, desc: (l) => L(`Товары в лавке дешевле на ${l * 7}%`, `Shop items ${l * 7}% cheaper`) },
  { id: 'relic_hunter', branch: 'economy', req: 'gemcutter', name: L('Искатель реликвий', 'Relic Hunter'), icon: '🏺', max: 1, baseCost: 900, growth: 1, desc: () => L('Забег начинается со случайной реликвией', 'Runs start with a random relic') },
  { id: 'warcry', branch: 'heroes', req: 'hardy', name: L('Боевой клич', 'War Cry'), icon: '📣', max: 3, baseCost: 200, growth: 1.8, desc: (l) => L(`+${l * 8}% скорости атаки героям`, `+${l * 8}% hero attack speed`) },
  { id: 'medic', branch: 'heroes', req: 'drill', name: L('Полевой лекарь', 'Field Medic'), icon: '⛑️', max: 3, baseCost: 220, growth: 1.8, desc: (l) => L(`Павшие герои встают посреди волны через ${30 - l * 6} с`, `Fallen heroes get back up mid-wave after ${30 - l * 6} s`) },
  { id: 'veteran', branch: 'heroes', req: 'mentor', name: L('Ветераны', 'Veterans'), icon: '🎖️', max: 1, baseCost: 900, growth: 1, desc: () => L('На новом уровне — 4 карточки на выбор вместо 3', 'Level-ups offer 4 cards instead of 3') },
  { id: 'iron_gate', branch: 'castle', req: 'mason', name: L('Железные ворота', 'Iron Gate'), icon: '🚪', max: 3, baseCost: 200, growth: 1.8, desc: (l) => L(`Замок получает на ${l * 8}% меньше урона`, `Castle takes ${l * 8}% less damage`) },
  { id: 'archers', branch: 'castle', req: 'towers', name: L('Стрелки на башнях', 'Tower Archers'), icon: '🎯', max: 3, baseCost: 220, growth: 1.8, desc: (l) => L(`Башни бьют на ${l * 20}% сильнее`, `Towers hit ${l * 20}% harder`) },
  { id: 'sp_power', branch: 'magic', req: 'arcane', name: L('Сила чар', 'Spell Power'), icon: '🔮', max: 3, baseCost: 300, growth: 1.9, desc: (l) => L(`Заклинания на ${l * 20}% сильнее`, `Spells ${l * 20}% stronger`) },
  { id: 'echo', branch: 'magic', req: 'sp_frost', name: L('Эхо магии', 'Magic Echo'), icon: '🌀', max: 2, baseCost: 450, growth: 2, desc: (l) => L(`${l * 25}% шанс, что заклинание перезарядится вдвое быстрее`, `${l * 25}% chance a spell recharges twice as fast`) },
  { id: 'gemcutter', branch: 'economy', req: 'taxes', name: L('Огранщик', 'Gem Cutter'), icon: '💎', max: 4, baseCost: 300, growth: 1.7, desc: (l) => L(`+${l * 15}% алмазов с врагов`, `+${l * 15}% gems from enemies`) },
];

// Deeper nodes (with a parent) cost 1.5x: the first steps are quick, the rest is a long climb.
export const metaCost = (u: MetaUpgrade, lvl: number): number => Math.round(u.baseCost * (u.req ? 1.5 : 1) * Math.pow(u.growth, lvl) / 5) * 5;

// ---------- relics: passive bonuses for one run (from events between waves) ----------
export interface RelicDef { id: string; name: string; icon: string; desc: string }
export const RELICS: RelicDef[] = [
  { id: 'powder', name: L('Пороховая бочка', 'Powder Keg'), icon: '🧨', desc: L('Каждый 10-й убитый враг взрывается', 'Every 10th enemy killed explodes') },
  { id: 'fire_towers', name: L('Огненные стрелы', 'Fire Arrows'), icon: '🔥', desc: L('Башни поджигают врагов', 'Towers set enemies on fire') },
  { id: 'war_drum', name: L('Военный барабан', 'War Drum'), icon: '🥁', desc: L('+15% скорости атаки героям', '+15% hero attack speed') },
  { id: 'golden_tooth', name: L('Золотой зуб', 'Golden Tooth'), icon: '🦷', desc: L('+25% золота за убийства', '+25% gold from kills') },
  { id: 'gem_lens', name: L('Линза ювелира', 'Jeweler\'s Lens'), icon: '🔍', desc: L('+30% алмазов с врагов', '+30% gems from enemies') },
  { id: 'iron_hinges', name: L('Кованые петли', 'Forged Hinges'), icon: '⛓️', desc: L('Замок получает на 15% меньше урона', 'Castle takes 15% less damage') },
  { id: 'vamp_banner', name: L('Знамя упыря', 'Ghoul Banner'), icon: '🦇', desc: L('+6% вампиризма всем героям', '+6% lifesteal for all heroes') },
  { id: 'sharp_bolts', name: L('Гранёные болты', 'Faceted Bolts'), icon: '🏹', desc: L('Башни бьют на 50% сильнее', 'Towers hit 50% harder') },
  { id: 'blood_rite', name: L('Кровавый обряд', 'Blood Rite'), icon: '🩸', desc: L('Каждое убийство лечит героев на 1% здоровья', 'Every kill heals heroes for 1% of their health') },
  { id: 'old_tome', name: L('Старый фолиант', 'Old Tome'), icon: '📕', desc: L('+25% опыта героям', '+25% hero XP') },
  { id: 'lucky_coin', name: L('Счастливая монета', 'Lucky Coin'), icon: '🪙', desc: L('Первое обновление лавки за волну бесплатно', 'First shop reroll each wave is free') },
  { id: 'spiked_wall', name: L('Шипованная стена', 'Spiked Wall'), icon: '🌵', desc: L('Враги у стены получают 25 урона в секунду', 'Enemies at the wall take 25 damage per second') },
];

/** Two relics together unlock an extra bonus. */
export const SYNERGIES: { id: string; a: string; b: string; name: string; desc: string }[] = [
  { id: 'hellpowder', a: 'fire_towers', b: 'powder', name: L('Адский порох', 'Hellpowder'), desc: L('Горящие враги взрываются при смерти', 'Burning enemies explode on death') },
  { id: 'blazebolts', a: 'fire_towers', b: 'sharp_bolts', name: L('Пылающие болты', 'Blazing Bolts'), desc: L('Поджог от башен вдвое сильнее', 'Tower burning is twice as strong') },
  { id: 'bloodmarch', a: 'war_drum', b: 'vamp_banner', name: L('Кровавый марш', 'Blood March'), desc: L('Ещё +10% скорости атаки и +4% вампиризма', 'Another +10% attack speed and +4% lifesteal') },
  { id: 'jeweler', a: 'golden_tooth', b: 'gem_lens', name: L('Скупщик', 'Fence'), desc: L('Элитные враги дают тройную добычу', 'Elite enemies drop triple loot') },
  { id: 'bloodwall', a: 'blood_rite', b: 'spiked_wall', name: L('Кровавый частокол', 'Bloody Palisade'), desc: L('Шипы стены бьют вдвое сильнее', 'Wall spikes hit twice as hard') },
  { id: 'scholar', a: 'old_tome', b: 'lucky_coin', name: L('Учёный торгаш', 'Learned Trader'), desc: L('Тренировка героев дешевле на 25%', 'Hero training is 25% cheaper') },
  { id: 'fortress', a: 'iron_hinges', b: 'spiked_wall', name: L('Неприступная стена', 'Impregnable Wall'), desc: L('Замок чинится на 2 HP в секунду во время волны', 'Castle repairs 2 HP per second during a wave') },
];

/** Battlefield types: picked at random for each run. */
export const BIOMES: Record<string, { name: string; icon: string; desc: string }> = {
  forest: { name: L('Лесная дорога', 'Forest Road'), icon: '🌲', desc: L('Обычная карта', 'The standard map') },
  snow: { name: L('Зимний перевал', 'Winter Pass'), icon: '❄️', desc: L('Мороз: все двигаются на 15% медленнее, золото +10%', 'Frost: everyone moves 15% slower, gold +10%') },
  swamp: { name: L('Гнилое болото', 'Rotten Swamp'), icon: '🌫️', desc: L('Туман: дальность стрелков −20%, башен −10%, алмазы +25%', 'Fog: ranged heroes −20% range, towers −10%, gems +25%') },
  desert: { name: L('Песчаная пустошь', 'Sand Wastes'), icon: '🏜️', desc: L('Зной: враги на 10% быстрее, золото +15%, алмазы +10%', 'Heat: enemies 10% faster, gold +15%, gems +10%') },
  ash: { name: L('Пепельные земли', 'Ashen Lands'), icon: '🌋', desc: L('Огонь и пепел: враги на 10% крепче, золото и алмазы +20% (последние 5 волн)', 'Fire and ash: enemies 10% tougher, gold and gems +20% (the last 5 waves)') },
};

// ---------- player spells (opened in the citadel's Magic branch) ----------
export interface SpellDef { id: string; node: string; key: string; name: string; icon: string; cd: number; radius: number; desc: string }
export const SPELLS: SpellDef[] = [
  { id: 'fire', node: 'sp_fire', key: 'Q', name: L('Огненный дождь', 'Fire Rain'), icon: ic('spell', 'fire'), cd: 20, radius: 95, desc: L('Метеоры по области: большой урон всем врагам', 'Meteors over an area: heavy damage to every enemy') },
  { id: 'frost', node: 'sp_frost', key: 'W', name: L('Ледяные оковы', 'Frost Shackles'), icon: ic('spell', 'frost'), cd: 26, radius: 150, desc: L('Сильно замедляет и ранит врагов в области', 'Greatly slows and hurts enemies in an area') },
  { id: 'turret', node: 'sp_turret', key: 'R', name: L('Стрелковая вышка', 'Archer Tower'), icon: ic('spell', 'turret'), cd: 30, radius: 230, desc: L('Ставит вышку с лучником: стреляет 16–24 с, не больше двух сразу', 'Builds a tower with an archer: shoots for 16–24 s, at most two at once') },
  { id: 'bless', node: 'sp_bless', key: 'E', name: L('Благословение', 'Blessing'), icon: ic('spell', 'bless'), cd: 40, radius: 0, desc: L('Лечит всех героев и ускоряет их атаки на 6 с', 'Heals all heroes and speeds up their attacks for 6 s') },
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
  boss?: boolean; // big health bar on top of the screen
  gems: number; // glory gems dropped on death
  regen?: number; // share of max HP restored per second
}

// Later waves get harder through more enemies, new goblin types (see `unlockWave`),
// and HP / damage growth (waveHpScale, waveDmgScale).
// ignoresHeroes = raiders that run for the walls; heroes and towers must intercept them.
export const ENEMIES: Record<string, EnemyDef> = {
  grunt: { id: 'grunt', name: L('Гоблин-рубака', 'Goblin Hacker'), icon: '👺', color: '#7cbf3a', shape: 'circle', radius: 7, hp: 48, dmg: 6, atkSpeed: 1, range: 6, speed: 55, armor: 0, gold: 2, xp: 2, ignoresHeroes: false, gems: 1 },
  runner: { id: 'runner', name: L('Налётчик на волке', 'Wolf Raider'), icon: '🐺', color: '#8d8d8d', shape: 'triangle', radius: 8, hp: 40, dmg: 7, atkSpeed: 1.2, range: 6, speed: 100, armor: 0, gold: 2, xp: 2, ignoresHeroes: false, gems: 1 },
  spitter: { id: 'spitter', name: L('Гоблин-шаман', 'Goblin Shaman'), icon: '🔮', color: '#a35bd6', shape: 'diamond', radius: 7, hp: 42, dmg: 10, atkSpeed: 0.8, range: 130, speed: 48, armor: 0, gold: 3, xp: 3, ignoresHeroes: false, gems: 1 },
  sapper: { id: 'sapper', name: L('Гоблин-подрывник', 'Goblin Sapper'), icon: '💣', color: '#c9a34a', shape: 'circle', radius: 7, hp: 70, dmg: 0, atkSpeed: 1, range: 4, speed: 64, armor: 2, gold: 4, xp: 3, ignoresHeroes: true, explodes: 45, gems: 2 },
  brute: { id: 'brute', name: L('Хобгоблин', 'Hobgoblin'), icon: '👹', color: '#4f7d2a', shape: 'square', radius: 12, hp: 260, dmg: 20, atkSpeed: 0.7, range: 8, speed: 34, armor: 4, gold: 7, xp: 8, ignoresHeroes: false, gems: 3 },
  orc: { id: 'orc', name: L('Орк-воин', 'Orc Warrior'), icon: '👹', color: '#5d7a3a', shape: 'square', radius: 10, hp: 170, dmg: 15, atkSpeed: 0.9, range: 8, speed: 40, armor: 6, gold: 5, xp: 6, ignoresHeroes: false, gems: 2},
  orc_brute: { id: 'orc_brute', name: L('Орк-рубака', 'Orc Slasher'), icon: '🪓', color: '#4a3a5a', shape: 'square', radius: 12, hp: 380, dmg: 30, atkSpeed: 0.75, range: 8, speed: 32, armor: 10, gold: 11, xp: 11, ignoresHeroes: false, gems: 3},
  knight: { id: 'knight', name: L('Гоблин-латник', 'Armored Goblin'), icon: '🪖', color: '#8a96a8', shape: 'square', radius: 9, hp: 220, dmg: 16, atkSpeed: 0.9, range: 6, speed: 42, armor: 14, gold: 6, xp: 6, ignoresHeroes: false, gems: 3 },
  champion: { id: 'champion', name: L('Гоблин-вожак', 'Goblin Chieftain'), icon: '🗡️', color: '#b8452f', shape: 'square', radius: 14, hp: 900, dmg: 38, atkSpeed: 0.8, range: 10, speed: 40, armor: 8, gold: 15, xp: 20, ignoresHeroes: false, gems: 8 },
  boss: { id: 'boss', name: L('Король гоблинов', 'Goblin King'), icon: '👑', color: '#d2a92c', shape: 'square', radius: 22, hp: 1350, dmg: 80, atkSpeed: 0.6, range: 12, speed: 26, armor: 10, gold: 60, xp: 90, ignoresHeroes: false, gems: 30, boss: true },
  ogre: { id: 'ogre', name: L('Огр-таран', 'Battering Ogre'), icon: '🐗', color: '#8a9a5a', shape: 'square', radius: 26, hp: 1150, dmg: 110, atkSpeed: 0.3, range: 14, speed: 28, armor: 8, gold: 70, xp: 100, ignoresHeroes: false, gems: 35, boss: true },
  necro: { id: 'necro', name: L('Шаман-некромант', 'Necromancer Shaman'), icon: '💀', color: '#6b4a9e', shape: 'square', radius: 20, hp: 1100, dmg: 45, atkSpeed: 0.8, range: 220, speed: 32, armor: 4, gold: 70, xp: 100, ignoresHeroes: false, gems: 35, boss: true },
  warlord: { id: 'warlord', name: L('Гоблин-полководец', 'Goblin Warlord'), icon: '🚩', color: '#c9a23a', shape: 'square', radius: 24, hp: 1650, dmg: 85, atkSpeed: 0.7, range: 14, speed: 28, armor: 12, gold: 70, xp: 100, ignoresHeroes: false, gems: 35, boss: true },
  // Late game (waves 16+): enemies with their own tricks.
  troll: { id: 'troll', name: L('Тролль', 'Troll'), icon: '🧌', color: '#6f9a58', shape: 'square', radius: 14, hp: 900, dmg: 40, atkSpeed: 0.7, range: 10, speed: 36, armor: 6, gold: 14, xp: 16, ignoresHeroes: false, gems: 6, regen: 0.03 },
  besieger: { id: 'besieger', name: L('Гоблин-осадник', 'Goblin Besieger'), icon: '🎯', color: '#b0793a', shape: 'circle', radius: 9, hp: 520, dmg: 22, atkSpeed: 0.3, range: 230, speed: 40, armor: 5, gold: 12, xp: 14, ignoresHeroes: true, gems: 5 },
  orc_shaman: { id: 'orc_shaman', name: L('Орк-шаман', 'Orc Shaman'), icon: '🪬', color: '#3f8f8a', shape: 'diamond', radius: 10, hp: 480, dmg: 22, atkSpeed: 0.7, range: 120, speed: 38, armor: 2, gold: 12, xp: 14, ignoresHeroes: false, gems: 5 },
  firebug: { id: 'firebug', name: L('Гоблин-поджигатель', 'Goblin Firebug'), icon: '🔥', color: '#e2742a', shape: 'triangle', radius: 8, hp: 330, dmg: 14, atkSpeed: 1, range: 6, speed: 72, armor: 0, gold: 8, xp: 10, ignoresHeroes: false, gems: 4 },
  forgemaster: { id: 'forgemaster', name: L('Мастер осадной кузни', 'Siege Forgemaster'), icon: '🔨', color: '#d2662c', shape: 'square', radius: 26, hp: 1900, dmg: 95, atkSpeed: 0.5, range: 14, speed: 26, armor: 14, gold: 120, xp: 160, ignoresHeroes: false, gems: 45, boss: true },
  overlord: { id: 'overlord', name: L('Владыка орды', 'Horde Overlord'), icon: '☠️', color: '#8a1f3a', shape: 'square', radius: 30, hp: 2600, dmg: 120, atkSpeed: 0.6, range: 16, speed: 24, armor: 16, gold: 300, xp: 400, ignoresHeroes: false, gems: 80, boss: true },
};

/** Wave a type first appears in, and its spawn weight (grows a little each wave after that). */
export const UNLOCKS: { type: string; unlockWave: number; weight: number; growth: number }[] = [
  { type: 'grunt', unlockWave: 1, weight: 10, growth: 0 },
  { type: 'runner', unlockWave: 2, weight: 2, growth: 0.25 },
  { type: 'spitter', unlockWave: 3, weight: 2, growth: 0.25 },
  { type: 'sapper', unlockWave: 8, weight: 0.8, growth: 0.12 },
  { type: 'brute', unlockWave: 4, weight: 1, growth: 0.15 },
  { type: 'knight', unlockWave: 7, weight: 1.5, growth: 0.3 },
  { type: 'orc', unlockWave: 6, weight: 0.7, growth: 0.12 },
  { type: 'orc_brute', unlockWave: 10, weight: 0.4, growth: 0.08 },
  { type: 'champion', unlockWave: 11, weight: 0.4, growth: 0.08 },
  { type: 'troll', unlockWave: 16, weight: 0.4, growth: 0.08 },
  { type: 'besieger', unlockWave: 19, weight: 0.35, growth: 0.07 },
  { type: 'orc_shaman', unlockWave: 21, weight: 0.35, growth: 0.07 },
  { type: 'firebug', unlockWave: 23, weight: 0.5, growth: 0.1 },
];

/** The run is won by clearing this wave (its boss is the Horde Overlord). */
export const FINAL_WAVE = 30;

export interface SpawnEntry {
  type: string;
  at: number; // seconds after wave start
}

/** Total enemies in a wave: dozens early, hundreds later. */
export function waveSize(wave: number): number {
  const base = 12 + 5 * wave + 1.2 * wave * wave;
  const eased = wave <= 5 ? 0.82 + 0.036 * wave : 1; // gentler start: a lone hero must survive the first waves
  return Math.min(700, Math.round(base * eased * earlyBoost(wave, 0.25, 6) * spike(wave, 1.08)));
}

/** Enemy damage multiplier for a wave. */
/** Gems per enemy shrink in later (much bigger) waves so a deep run doesn't buy the whole citadel. */
export function gemScale(wave: number): number { return 0.95 / (1 + 0.25 * Math.max(0, wave - 1)); }

/** Kill gold flattens out in big late waves (otherwise the economy snowballs). */
export function goldScale(wave: number): number { return Math.max(0.5, 1 / (1 + 0.05 * Math.max(0, wave - 3))); }

export function waveDmgScale(wave: number): number {
  return (1 + 0.1 * Math.max(0, wave - 5)) * HARDER_DMG;
}

/**
 * Global difficulty knob (2026-11-12 «сложнее везде»): living players went far beyond the bot
 * (wave 29 with an untouched gate), so every wave is tougher and the late game the most.
 * HP ×1.3 on wave 1 rising to ×1.8 by wave 26; enemy damage ×1.3 everywhere.
 */
const HARDER_DMG = 1.3;
function harderHp(wave: number): number { return 1.3 + 0.5 * Math.min(1, (wave - 1) / 25); }

/** Expected enemy counts of a wave (for the preview in the shop). */
export function wavePreview(wave: number): { type: string; count: number }[] {
  const total = waveSize(wave);
  const weights = UNLOCKS.filter((u) => wave >= u.unlockWave).map((u) => [u.type, u.weight + (wave - u.unlockWave) * u.growth] as const);
  const sum = weights.reduce((s, w) => s + w[1], 0);
  const out = weights.map(([type, w]) => ({ type, count: Math.round((total * w) / sum) })).filter((x) => x.count > 0);
  const bl = bossList(wave);
  if (bl.length) { out.push({ type: bl[0], count: 1 }); if (bl.length > 1) out.push({ type: 'boss', count: bl.length - 1 }); }
  return out;
}

/** Enemy HP multiplier for a wave. */
function hpScaleBase(wave: number): number {
  const n = wave - 1;
  // Hero power snowballs (item rarities, skill ranks), so mid waves also grow exponentially.
  const late = Math.pow(1.19, Math.max(0, wave - 8));
  return (1 + 0.2 * n + 0.06 * n * n + 0.003 * Math.pow(Math.max(0, n - 5), 3)) * late;
}
const HP_STEADY_FROM = 15;
/** Early waves are harsh and difficulty ripples as it climbs: the first runs end quickly, the Citadel is what carries the player further. */
function earlyBoost(wave: number, amp: number, tau: number): number { return 1 + amp * Math.exp(-(wave - 1) / tau); }
/** Gentle ripple (period ≈ 3.3 waves, never an exact pattern): some waves hit harder than their neighbours by up to `k`. */
function spike(wave: number, k: number): number { return wave >= FINAL_WAVE ? 1 : 1 + (k - 1) * (0.5 + 0.5 * Math.sin(wave * 1.9 - 3.1)); }
export function waveHpScale(wave: number): number {
  return rawHpScale(wave) * harderHp(wave) * earlyBoost(wave, 0.5, 30) * earlyBoost(wave, 0.25, 8) * spike(wave, 1.25);
}
function rawHpScale(wave: number): number {
  if (wave <= HP_STEADY_FROM) return hpScaleBase(wave);
  // After wave 15 growth settles to a steady rate: hero power stops snowballing once items and skills are maxed.
  const g1 = 1.13, g2 = 1.14; // per wave: 16–20, then 21–30
  return hpScaleBase(HP_STEADY_FROM) * Math.pow(g1, Math.min(wave, 20) - HP_STEADY_FROM) * Math.pow(g2, Math.max(0, wave - 20));
}

/** Every 5th wave brings a boss; they take turns: Король → Огр → Некромант → Полководец. Wave 25 is the Forgemaster, wave 30 the Overlord. */
export function bossType(wave: number): string {
  if (wave === 25) return 'forgemaster';
  if (wave === FINAL_WAVE) return 'overlord';
  return ['boss', 'ogre', 'necro', 'warlord'][(Math.floor(wave / 5) - 1) % 4];
}

/** Bosses of a wave: the main one plus Goblin Kings (the final wave has the Overlord alone). */
export function bossList(wave: number): string[] {
  const n = Math.floor(wave / 5);
  if (!n) return [];
  if (wave === FINAL_WAVE) return ['overlord'];
  return [bossType(wave), ...Array<string>(Math.min(n - 1, 3)).fill('boss')];
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
  const bl = bossList(wave);
  bl.forEach((type, b) => list.push({ type, at: duration * (0.5 + 0.4 * (b / Math.max(1, bl.length))) }));
  list.sort((a, b) => a.at - b.at);
  return list;
}
