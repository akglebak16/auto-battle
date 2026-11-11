// Hero skills and level-up cards (the roguelike part).
// Skill ranks use the rarity colours: 1 grey, 2 blue, 3 purple, 4 orange (legendary).
// Every level a hero gains = one card pick: 3 random cards from that hero's own skill pool
// (new skill or next rank of a known one) plus generic stat boosts.

export interface SkillDef {
  id: string;
  hero: string; // hero id, or '*' for generic boosts
  name: string;
  icon: string;
  active: boolean; // active skills cast automatically on cooldown
  maxRank: number;
  /** Evolution: offered once both of these skills are at max rank. */
  evolves?: [string, string];
  /** Description of what the given rank does (1-based). */
  desc: (rank: number) => string;
  /** Cooldown in seconds at a rank (active skills only). */
  cd?: (rank: number) => number;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

// Numbers used both by the descriptions and by the game logic.
export const SK = {
  shieldBash: { dmg: [1.5, 2, 2.6, 3.6], stun: [1, 1.5, 2, 3], radius: 75, cd: [7, 6, 5, 4] },
  taunt: { radius: [170, 210, 250, 320], armor: [15, 22, 30, 45], dur: 4, cd: [12, 11, 10, 8] },
  thorns: { reflect: [0.25, 0.4, 0.6, 1.0] },
  bulwark: { hp: [0.15, 0.3, 0.45, 0.75], regen: [3, 6, 10, 18] },
  volley: { arrows: [4, 6, 9, 14], dmg: 0.8, cd: [6, 5, 4, 3] },
  pierce: { dmg: [2, 2.6, 3.3, 4.8], len: 520, cd: [8, 7, 6, 4] },
  crit: { chance: [0.15, 0.25, 0.35, 0.5] },
  multishot: { extra: [1, 2, 3, 5], dmg: 0.5 },
  meteor: { dmg: [3, 4, 5.2, 7.5], radius: [90, 110, 130, 160], delay: 0.7, cd: [10, 9, 8, 6] },
  ring: { dmg: [1.5, 2, 2.6, 3.8], radius: 125, push: 45, cd: [8, 7, 6, 4] },
  ignite: { dps: [0.2, 0.35, 0.5, 0.8], dur: 3 },
  inferno: { splash: [0.2, 0.35, 0.5, 0.8], dmg: [0.1, 0.2, 0.3, 0.5] },
  might: { dmg: 0.12 },
  vigor: { hp: 0.15 },
  haste: { atk: 0.1 },
  guard: { armor: 4 },
  leech: { lifesteal: 0.03 },
  focus: { cd: 0.07, max: 5 },
  // Evolutions
  quake: { radius: 1.6, dmg: 1.5, heal: 0.03, healCap: 0.3 },
  retaliation: { reflect: 3, heal: 0.5 },
  storm: { arrows: 2, cd: 0.5 },
  deadeye: { crit: 3, fan: 3 },
  rain: { count: 3 },
  wildfire: { blast: 0.45, radius: 70 },
};

export const SKILLS: SkillDef[] = [
  // Бран — Страж ворот
  {
    id: 'shieldBash', hero: 'warden', name: 'Удар щитом', icon: '🛡️', active: true, maxRank: 4,
    cd: (r) => SK.shieldBash.cd[r - 1],
    desc: (r) => `Бьёт всех вокруг на ${pct(SK.shieldBash.dmg[r - 1])} урона и оглушает на ${SK.shieldBash.stun[r - 1]} с. Перезарядка ${SK.shieldBash.cd[r - 1]} с.`,
  },
  {
    id: 'taunt', hero: 'warden', name: 'Провокация', icon: '📯', active: true, maxRank: 4,
    cd: (r) => SK.taunt.cd[r - 1],
    desc: (r) => `Враги в радиусе ${SK.taunt.radius[r - 1]} бросаются на Брана; он получает +${SK.taunt.armor[r - 1]} брони на ${SK.taunt.dur} с. Перезарядка ${SK.taunt.cd[r - 1]} с.`,
  },
  {
    id: 'thorns', hero: 'warden', name: 'Шипы', icon: '🌵', active: false, maxRank: 4,
    desc: (r) => `Возвращает атакующим в ближнем бою ${pct(SK.thorns.reflect[r - 1])} полученного урона.`,
  },
  {
    id: 'bulwark', hero: 'warden', name: 'Несокрушимость', icon: '🧱', active: false, maxRank: 4,
    desc: (r) => `+${pct(SK.bulwark.hp[r - 1])} здоровья и +${SK.bulwark.regen[r - 1]} HP/с.`,
  },
  // Ива — Лучница
  {
    id: 'volley', hero: 'ranger', name: 'Залп', icon: '🎯', active: true, maxRank: 4,
    cd: (r) => SK.volley.cd[r - 1],
    desc: (r) => `Выпускает ${SK.volley.arrows[r - 1]} стрел по разным врагам (${pct(SK.volley.dmg)} урона каждая). Перезарядка ${SK.volley.cd[r - 1]} с.`,
  },
  {
    id: 'pierce', hero: 'ranger', name: 'Пробивающая стрела', icon: '➶', active: true, maxRank: 4,
    cd: (r) => SK.pierce.cd[r - 1],
    desc: (r) => `Стрела пробивает всех врагов на линии: ${pct(SK.pierce.dmg[r - 1])} урона. Перезарядка ${SK.pierce.cd[r - 1]} с.`,
  },
  {
    id: 'crit', hero: 'ranger', name: 'Меткость', icon: '🎲', active: false, maxRank: 4,
    desc: (r) => `${pct(SK.crit.chance[r - 1])} шанс нанести двойной урон.`,
  },
  {
    id: 'multishot', hero: 'ranger', name: 'Мультивыстрел', icon: '🏹', active: false, maxRank: 4,
    desc: (r) => `Каждый выстрел задевает ещё ${SK.multishot.extra[r - 1]} ближайших врагов (${pct(SK.multishot.dmg)} урона).`,
  },
  // Оррин — Пиромант
  {
    id: 'meteor', hero: 'pyro', name: 'Метеор', icon: '☄️', active: true, maxRank: 4,
    cd: (r) => SK.meteor.cd[r - 1],
    desc: (r) => `Обрушивает метеор на самую плотную толпу: ${pct(SK.meteor.dmg[r - 1])} урона в радиусе ${SK.meteor.radius[r - 1]}. Перезарядка ${SK.meteor.cd[r - 1]} с.`,
  },
  {
    id: 'ring', hero: 'pyro', name: 'Огненное кольцо', icon: '⭕', active: true, maxRank: 4,
    cd: (r) => SK.ring.cd[r - 1],
    desc: (r) => `Взрыв вокруг себя: ${pct(SK.ring.dmg[r - 1])} урона и отбрасывание врагов. Перезарядка ${SK.ring.cd[r - 1]} с.`,
  },
  {
    id: 'ignite', hero: 'pyro', name: 'Поджог', icon: '🔥', active: false, maxRank: 4,
    desc: (r) => `Попадания поджигают: ${pct(SK.ignite.dps[r - 1])} урона в секунду ещё ${SK.ignite.dur} с.`,
  },
  {
    id: 'inferno', hero: 'pyro', name: 'Пекло', icon: '🌋', active: false, maxRank: 4,
    desc: (r) => `+${pct(SK.inferno.splash[r - 1])} к радиусу взрывов и +${pct(SK.inferno.dmg[r - 1])} урона.`,
  },
  // Evolutions: appear once both source skills are at max rank (orange)
  {
    id: 'quake', hero: 'warden', name: 'Сотрясение земли', icon: '🌋', active: false, maxRank: 1, evolves: ['shieldBash', 'bulwark'],
    desc: () => `Удар щитом: радиус ×${SK.quake.radius}, урон ×${SK.quake.dmg}. Каждый задетый враг лечит Брана на ${pct(SK.quake.heal)} HP.`,
  },
  {
    id: 'retaliation', hero: 'warden', name: 'Возмездие', icon: '⚖️', active: false, maxRank: 1, evolves: ['taunt', 'thorns'],
    desc: () => `Во время Провокации шипы отражают в ${SK.retaliation.reflect} раза больше, а Бран лечится на ${pct(SK.retaliation.heal)} отражённого.`,
  },
  {
    id: 'storm', hero: 'ranger', name: 'Шквал стрел', icon: '🌪️', active: false, maxRank: 1, evolves: ['volley', 'multishot'],
    desc: () => `Залп выпускает в ${SK.storm.arrows} раза больше стрел и перезаряжается вдвое быстрее.`,
  },
  {
    id: 'deadeye', hero: 'ranger', name: 'Смертельный глаз', icon: '👁️', active: false, maxRank: 1, evolves: ['crit', 'pierce'],
    desc: () => `Криты наносят ×${SK.deadeye.crit} урона. Пробивающая стрела всегда крит и летит веером из ${SK.deadeye.fan}.`,
  },
  {
    id: 'rain', hero: 'pyro', name: 'Огненный дождь', icon: '🌠', active: false, maxRank: 1, evolves: ['meteor', 'inferno'],
    desc: () => `Метеор падает ${SK.rain.count} раза подряд — по разным толпам.`,
  },
  {
    id: 'wildfire', hero: 'pyro', name: 'Лесной пожар', icon: '🔥', active: false, maxRank: 1, evolves: ['ring', 'ignite'],
    desc: () => `Горящие враги при смерти взрываются (${pct(SK.wildfire.blast)} урона Оррина) и поджигают соседей.`,
  },
  // Generic boosts — always in the pool
  { id: 'might', hero: '*', name: 'Сила', icon: '💪', active: false, maxRank: 99, desc: () => `+${pct(SK.might.dmg)} урона.` },
  { id: 'vigor', hero: '*', name: 'Живучесть', icon: '❤️', active: false, maxRank: 99, desc: () => `+${pct(SK.vigor.hp)} здоровья.` },
  { id: 'haste', hero: '*', name: 'Проворство', icon: '⚡', active: false, maxRank: 99, desc: () => `+${pct(SK.haste.atk)} скорости атаки.` },
  { id: 'guard', hero: '*', name: 'Закалка', icon: '🛡', active: false, maxRank: 99, desc: () => `+${SK.guard.armor} брони.` },
  { id: 'leech', hero: '*', name: 'Жажда крови', icon: '🩸', active: false, maxRank: 99, desc: () => `+${pct(SK.leech.lifesteal)} вампиризма.` },
  { id: 'focus', hero: '*', name: 'Сосредоточение', icon: '⏳', active: false, maxRank: SK.focus.max, desc: () => `−${pct(SK.focus.cd)} перезарядки умений.` },
];

export const skillById = (id: string): SkillDef => SKILLS.find((s) => s.id === id)!;

/** Evolutions the hero has unlocked (both sources maxed) but not taken yet. */
export function readyEvolutions(heroId: string, ranks: Record<string, number>): string[] {
  return SKILLS.filter((s) => s.hero === heroId && s.evolves && !ranks[s.id]
    && s.evolves.every((src) => (ranks[src] ?? 0) >= skillById(src).maxRank)).map((s) => s.id);
}

/** 3 card options: a ready evolution always shows up; then own skills, then generic boosts. */
export function rollCards(heroId: string, ranks: Record<string, number>, rnd: () => number, count = 3): string[] {
  const evo = readyEvolutions(heroId, ranks);
  const own = SKILLS.filter((s) => s.hero === heroId && !s.evolves && (ranks[s.id] ?? 0) < s.maxRank).map((s) => s.id);
  const generic = SKILLS.filter((s) => s.hero === '*' && (ranks[s.id] ?? 0) < s.maxRank).map((s) => s.id);
  shuffle(own, rnd);
  shuffle(generic, rnd);
  const picks = evo.slice(0, 1);
  for (const o of own) if (picks.length < 2) picks.push(o);
  for (const g of generic) if (picks.length < count) picks.push(g);
  for (const o of own) if (picks.length < count && !picks.includes(o)) picks.push(o);
  return picks;
}

function shuffle<T>(a: T[], rnd: () => number): void {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
}
