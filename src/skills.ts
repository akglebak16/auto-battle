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

import { L } from './i18n';
import { ic } from './icons';

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
  raise: { count: [1, 2, 2, 3], hp: [0.5, 0.6, 0.7, 0.9], dmg: [0.5, 0.6, 0.7, 0.9], life: 14, cd: [9, 8, 7, 6] },
  necromancy: { chance: [0.08, 0.14, 0.2, 0.3], life: 8, cap: 10 },
  bonearmor: { hp: [0.25, 0.5, 0.8, 1.2], armor: [3, 6, 9, 14] },
  drain: { dmg: [1.4, 1.9, 2.5, 3.5], targets: [2, 3, 4, 5], heal: 0.5, cd: [8, 7, 6, 5] },
  lich: { hp: 2, dmg: 1.5, extra: 1 },
  plague: { blast: 1.2 },
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
    id: 'shieldBash', hero: 'warden', name: L('Удар щитом', 'Shield Bash'), icon: ic('skill', 'shieldBash'), active: true, maxRank: 4,
    cd: (r) => SK.shieldBash.cd[r - 1],
    desc: (r) => L(`Бьёт всех вокруг на ${pct(SK.shieldBash.dmg[r - 1])} урона и оглушает на ${SK.shieldBash.stun[r - 1]} с. Перезарядка ${SK.shieldBash.cd[r - 1]} с.`, `Hits everyone around for ${pct(SK.shieldBash.dmg[r - 1])} damage and stuns for ${SK.shieldBash.stun[r - 1]} s. Cooldown ${SK.shieldBash.cd[r - 1]} s.`),
  },
  {
    id: 'taunt', hero: 'warden', name: L('Провокация', 'Taunt'), icon: ic('skill', 'taunt'), active: true, maxRank: 4,
    cd: (r) => SK.taunt.cd[r - 1],
    desc: (r) => L(`Враги в радиусе ${SK.taunt.radius[r - 1]} бросаются на Брана; он получает +${SK.taunt.armor[r - 1]} брони на ${SK.taunt.dur} с. Перезарядка ${SK.taunt.cd[r - 1]} с.`, `Enemies within ${SK.taunt.radius[r - 1]} rush at Bran; he gains +${SK.taunt.armor[r - 1]} armor for ${SK.taunt.dur} s. Cooldown ${SK.taunt.cd[r - 1]} s.`),
  },
  {
    id: 'thorns', hero: 'warden', name: L('Шипы', 'Thorns'), icon: ic('skill', 'thorns'), active: false, maxRank: 4,
    desc: (r) => L(`Возвращает атакующим в ближнем бою ${pct(SK.thorns.reflect[r - 1])} полученного урона.`, `Reflects ${pct(SK.thorns.reflect[r - 1])} of damage taken back at melee attackers.`),
  },
  {
    id: 'bulwark', hero: 'warden', name: L('Несокрушимость', 'Bulwark'), icon: ic('skill', 'bulwark'), active: false, maxRank: 4,
    desc: (r) => L(`+${pct(SK.bulwark.hp[r - 1])} здоровья и +${SK.bulwark.regen[r - 1]} HP/с.`, `+${pct(SK.bulwark.hp[r - 1])} health and +${SK.bulwark.regen[r - 1]} HP/s.`),
  },
  // Ива — Лучница
  {
    id: 'volley', hero: 'ranger', name: L('Залп', 'Volley'), icon: ic('skill', 'volley'), active: true, maxRank: 4,
    cd: (r) => SK.volley.cd[r - 1],
    desc: (r) => L(`Выпускает ${SK.volley.arrows[r - 1]} стрел по разным врагам (${pct(SK.volley.dmg)} урона каждая). Перезарядка ${SK.volley.cd[r - 1]} с.`, `Looses ${SK.volley.arrows[r - 1]} arrows at different enemies (${pct(SK.volley.dmg)} damage each). Cooldown ${SK.volley.cd[r - 1]} s.`),
  },
  {
    id: 'pierce', hero: 'ranger', name: L('Пробивающая стрела', 'Piercing Arrow'), icon: ic('skill', 'pierce'), active: true, maxRank: 4,
    cd: (r) => SK.pierce.cd[r - 1],
    desc: (r) => L(`Стрела пробивает всех врагов на линии: ${pct(SK.pierce.dmg[r - 1])} урона. Перезарядка ${SK.pierce.cd[r - 1]} с.`, `An arrow that pierces every enemy in a line: ${pct(SK.pierce.dmg[r - 1])} damage. Cooldown ${SK.pierce.cd[r - 1]} s.`),
  },
  {
    id: 'crit', hero: 'ranger', name: L('Меткость', 'Precision'), icon: ic('skill', 'crit'), active: false, maxRank: 4,
    desc: (r) => L(`${pct(SK.crit.chance[r - 1])} шанс нанести двойной урон.`, `${pct(SK.crit.chance[r - 1])} chance to deal double damage.`),
  },
  {
    id: 'multishot', hero: 'ranger', name: L('Мультивыстрел', 'Multishot'), icon: ic('skill', 'multishot'), active: false, maxRank: 4,
    desc: (r) => L(`Каждый выстрел задевает ещё ${SK.multishot.extra[r - 1]} ближайших врагов (${pct(SK.multishot.dmg)} урона).`, `Every shot also hits ${SK.multishot.extra[r - 1]} more nearby enem${SK.multishot.extra[r - 1] > 1 ? 'ies' : 'y'} (${pct(SK.multishot.dmg)} damage).`),
  },
  // Оррин — Пиромант
  {
    id: 'meteor', hero: 'pyro', name: L('Метеор', 'Meteor'), icon: ic('skill', 'meteor'), active: true, maxRank: 4,
    cd: (r) => SK.meteor.cd[r - 1],
    desc: (r) => L(`Обрушивает метеор на самую плотную толпу: ${pct(SK.meteor.dmg[r - 1])} урона в радиусе ${SK.meteor.radius[r - 1]}. Перезарядка ${SK.meteor.cd[r - 1]} с.`, `Drops a meteor on the thickest crowd: ${pct(SK.meteor.dmg[r - 1])} damage in a ${SK.meteor.radius[r - 1]} radius. Cooldown ${SK.meteor.cd[r - 1]} s.`),
  },
  {
    id: 'ring', hero: 'pyro', name: L('Огненное кольцо', 'Ring of Fire'), icon: ic('skill', 'ring'), active: true, maxRank: 4,
    cd: (r) => SK.ring.cd[r - 1],
    desc: (r) => L(`Взрыв вокруг себя: ${pct(SK.ring.dmg[r - 1])} урона и отбрасывание врагов. Перезарядка ${SK.ring.cd[r - 1]} с.`, `An explosion all around: ${pct(SK.ring.dmg[r - 1])} damage and knockback. Cooldown ${SK.ring.cd[r - 1]} s.`),
  },
  {
    id: 'ignite', hero: 'pyro', name: L('Поджог', 'Ignite'), icon: ic('skill', 'ignite'), active: false, maxRank: 4,
    desc: (r) => L(`Попадания поджигают: ${pct(SK.ignite.dps[r - 1])} урона в секунду ещё ${SK.ignite.dur} с.`, `Hits set enemies on fire: ${pct(SK.ignite.dps[r - 1])} damage per second for ${SK.ignite.dur} s.`),
  },
  {
    id: 'inferno', hero: 'pyro', name: L('Пекло', 'Inferno'), icon: ic('skill', 'inferno'), active: false, maxRank: 4,
    desc: (r) => L(`+${pct(SK.inferno.splash[r - 1])} к радиусу взрывов и +${pct(SK.inferno.dmg[r - 1])} урона.`, `+${pct(SK.inferno.splash[r - 1])} explosion radius and +${pct(SK.inferno.dmg[r - 1])} damage.`),
  },
  // Морра — Призывательница
  {
    id: 'raise', hero: 'summoner', name: L('Поднять скелетов', 'Raise Skeletons'), icon: ic('skill', 'raise'), active: true, maxRank: 4,
    cd: (r) => SK.raise.cd[r - 1],
    desc: (r) => L(`Призывает ${SK.raise.count[r - 1]} скелет(а) на ${SK.raise.life} с: ${pct(SK.raise.hp[r - 1])} здоровья и ${pct(SK.raise.dmg[r - 1])} урона Морры. Перезарядка ${SK.raise.cd[r - 1]} с.`, `Summons ${SK.raise.count[r - 1]} skeleton${SK.raise.count[r - 1] > 1 ? 's' : ''} for ${SK.raise.life} s with ${pct(SK.raise.hp[r - 1])} of Morra's health and ${pct(SK.raise.dmg[r - 1])} of her damage. Cooldown ${SK.raise.cd[r - 1]} s.`),
  },
  {
    id: 'drain', hero: 'summoner', name: L('Похищение душ', 'Soul Drain'), icon: ic('skill', 'drain'), active: true, maxRank: 4,
    cd: (r) => SK.drain.cd[r - 1],
    desc: (r) => L(`Тянет души из ${SK.drain.targets[r - 1]} врагов: ${pct(SK.drain.dmg[r - 1])} урона, половина лечит Морру и её армию. Перезарядка ${SK.drain.cd[r - 1]} с.`, `Pulls the souls out of ${SK.drain.targets[r - 1]} enemies: ${pct(SK.drain.dmg[r - 1])} damage, half of it heals Morra and her army. Cooldown ${SK.drain.cd[r - 1]} s.`),
  },
  {
    id: 'necromancy', hero: 'summoner', name: L('Некромантия', 'Necromancy'), icon: ic('skill', 'necromancy'), active: false, maxRank: 4,
    desc: (r) => L(`Убитый враг с шансом ${pct(SK.necromancy.chance[r - 1])} встаёт скелетом на ${SK.necromancy.life} с.`, `A slain enemy has a ${pct(SK.necromancy.chance[r - 1])} chance to rise as a skeleton for ${SK.necromancy.life} s.`),
  },
  {
    id: 'bonearmor', hero: 'summoner', name: L('Костяная броня', 'Bone Armor'), icon: ic('skill', 'bonearmor'), active: false, maxRank: 4,
    desc: (r) => L(`Скелеты получают +${pct(SK.bonearmor.hp[r - 1])} здоровья и +${SK.bonearmor.armor[r - 1]} брони.`, `Skeletons get +${pct(SK.bonearmor.hp[r - 1])} health and +${SK.bonearmor.armor[r - 1]} armor.`),
  },
  // Evolutions: appear once both source skills are at max rank (orange)
  {
    id: 'lich', hero: 'summoner', name: L('Костяные рыцари', 'Bone Knights'), icon: ic('skill', 'lich'), active: false, maxRank: 1, evolves: ['raise', 'bonearmor'],
    desc: () => L(`Скелеты становятся рыцарями: ×${SK.lich.hp} здоровья, ×${SK.lich.dmg} урона, и их на ${SK.lich.extra} больше.`, `Skeletons become knights: ×${SK.lich.hp} health, ×${SK.lich.dmg} damage, and ${SK.lich.extra} more of them.`),
  },
  {
    id: 'plague', hero: 'summoner', name: L('Чумная армия', 'Plague Army'), icon: ic('skill', 'plague'), active: false, maxRank: 1, evolves: ['necromancy', 'drain'],
    desc: () => L(`Скелеты взрываются, когда рассыпаются: ${pct(SK.plague.blast)} урона Морры вокруг.`, `Skeletons explode when they crumble: ${pct(SK.plague.blast)} of Morra's damage around them.`),
  },
  {
    id: 'quake', hero: 'warden', name: L('Сотрясение земли', 'Earthshaker'), icon: ic('skill', 'quake'), active: false, maxRank: 1, evolves: ['shieldBash', 'bulwark'],
    desc: () => L(`Удар щитом: радиус ×${SK.quake.radius}, урон ×${SK.quake.dmg}. Каждый задетый враг лечит Брана на ${pct(SK.quake.heal)} HP.`, `Shield Bash: radius ×${SK.quake.radius}, damage ×${SK.quake.dmg}. Every enemy hit heals Bran for ${pct(SK.quake.heal)} HP.`),
  },
  {
    id: 'retaliation', hero: 'warden', name: L('Возмездие', 'Retribution'), icon: ic('skill', 'retaliation'), active: false, maxRank: 1, evolves: ['taunt', 'thorns'],
    desc: () => L(`Во время Провокации шипы отражают в ${SK.retaliation.reflect} раза больше, а Бран лечится на ${pct(SK.retaliation.heal)} отражённого.`, `During Taunt, thorns reflect ${SK.retaliation.reflect}× more and Bran heals for ${pct(SK.retaliation.heal)} of what they reflect.`),
  },
  {
    id: 'storm', hero: 'ranger', name: L('Шквал стрел', 'Arrow Storm'), icon: ic('skill', 'storm'), active: false, maxRank: 1, evolves: ['volley', 'multishot'],
    desc: () => L(`Залп выпускает в ${SK.storm.arrows} раза больше стрел и перезаряжается вдвое быстрее.`, `Volley looses ${SK.storm.arrows}× more arrows and recharges twice as fast.`),
  },
  {
    id: 'deadeye', hero: 'ranger', name: L('Смертельный глаз', 'Deadeye'), icon: ic('skill', 'deadeye'), active: false, maxRank: 1, evolves: ['crit', 'pierce'],
    desc: () => L(`Криты наносят ×${SK.deadeye.crit} урона. Пробивающая стрела всегда крит и летит веером из ${SK.deadeye.fan}.`, `Crits deal ×${SK.deadeye.crit} damage. Piercing Arrow always crits and flies as a fan of ${SK.deadeye.fan}.`),
  },
  {
    id: 'rain', hero: 'pyro', name: L('Огненный дождь', 'Fire Rain'), icon: ic('skill', 'rain'), active: false, maxRank: 1, evolves: ['meteor', 'inferno'],
    desc: () => L(`Метеор падает ${SK.rain.count} раза подряд — по разным толпам.`, `Meteor falls ${SK.rain.count} times in a row — on different crowds.`),
  },
  {
    id: 'wildfire', hero: 'pyro', name: L('Лесной пожар', 'Wildfire'), icon: ic('skill', 'wildfire'), active: false, maxRank: 1, evolves: ['ring', 'ignite'],
    desc: () => L(`Горящие враги при смерти взрываются (${pct(SK.wildfire.blast)} урона Оррина) и поджигают соседей.`, `Burning enemies explode on death (${pct(SK.wildfire.blast)} of Orrin's damage) and set their neighbors alight.`),
  },
  // Generic boosts — always in the pool
  { id: 'might', hero: '*', name: L('Сила', 'Might'), icon: ic('skill', 'might'), active: false, maxRank: 99, desc: () => L(`+${pct(SK.might.dmg)} урона.`, `+${pct(SK.might.dmg)} damage.`) },
  { id: 'vigor', hero: '*', name: L('Живучесть', 'Vigor'), icon: ic('skill', 'vigor'), active: false, maxRank: 99, desc: () => L(`+${pct(SK.vigor.hp)} здоровья.`, `+${pct(SK.vigor.hp)} health.`) },
  { id: 'haste', hero: '*', name: L('Проворство', 'Haste'), icon: ic('skill', 'haste'), active: false, maxRank: 99, desc: () => L(`+${pct(SK.haste.atk)} скорости атаки.`, `+${pct(SK.haste.atk)} attack speed.`) },
  { id: 'guard', hero: '*', name: L('Закалка', 'Toughness'), icon: ic('skill', 'guard'), active: false, maxRank: 99, desc: () => L(`+${SK.guard.armor} брони.`, `+${SK.guard.armor} armor.`) },
  { id: 'leech', hero: '*', name: L('Жажда крови', 'Bloodthirst'), icon: ic('skill', 'leech'), active: false, maxRank: 99, desc: () => L(`+${pct(SK.leech.lifesteal)} вампиризма.`, `+${pct(SK.leech.lifesteal)} lifesteal.`) },
  { id: 'focus', hero: '*', name: L('Сосредоточение', 'Focus'), icon: ic('skill', 'focus'), active: false, maxRank: SK.focus.max, desc: () => L(`−${pct(SK.focus.cd)} перезарядки умений.`, `−${pct(SK.focus.cd)} skill cooldowns.`) },
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
