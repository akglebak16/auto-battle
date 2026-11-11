// DOM interface: HUD, citadel menu (permanent upgrades), level-up cards,
// shop + bag + forge between waves, game over.
import {
  Game, Hero, MAX_ITEMS, REPAIR_COST, REPAIR_AMOUNT, TOWER_MAX_LEVEL, ORDERS, PRICE_MULT, type OwnedItem, type OrderId,
} from './game';
import {
  HEROES, RARITY, MAX_RARITY, RECIPES, ITEMS, ENEMIES, META_UPGRADES, metaCost, describeMods, describeEffect, scaleMods,
  waveSize, wavePreview, type ItemDef,
} from './data';
import { SKILLS, skillById } from './skills';
import type { Renderer } from './render';
import { heroIcon } from './sprites';
import { isMuted, setMuted, unlockAudio, play } from './sound';

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const rcol = (r: number) => RARITY[Math.min(r, MAX_RARITY)].color;
const itemById = (id: string) => ITEMS.find((i) => i.id === id)!;
/** Stat line plus the special effect (if any) of an item at a rarity. */
const itemText = (def: ItemDef, r: number): string =>
  [describeMods(scaleMods(def.mods, RARITY[r].mult)), describeEffect(def.effect, r)].filter(Boolean).join('. ');

export class UI {
  speed = 1;
  paused = false;
  selectedHero = 0;
  private hud = {
    wave: $('#hud-wave'), gold: $('#hud-gold'), enemies: $('#hud-enemies'),
    castleBar: $('#hud-castle-bar'), castleText: $('#hud-castle-text'),
  };
  private last = '';

  constructor(private game: Game, private renderer: Renderer) {
    document.body.addEventListener('click', (ev) => { unlockAudio(); this.onClick(ev); });
    window.addEventListener('keydown', (ev) => {
      unlockAudio();
      if (ev.code === 'Space' && this.game.phase === 'battle') { this.paused = !this.paused; this.refresh(); ev.preventDefault(); }
      if (ev.key === '1') this.setSpeed(1);
      if (ev.key === '2') this.setSpeed(2);
      if (ev.key === '3') this.setSpeed(4);
      if (ev.key === 'm' || ev.key === 'ь') this.toggleMute();
    });
  }

  selectHeroAt(ev: MouseEvent): void {
    const h = this.renderer.heroAt(this.game, ev);
    if (h) { this.selectedHero = this.game.heroes.indexOf(h); this.refresh(); }
  }

  private setSpeed(s: number): void { this.speed = s; this.refresh(); }
  private toggleMute(): void { setMuted(!isMuted()); this.refresh(); }

  private onClick(ev: MouseEvent): void {
    const el = (ev.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
    if (!el || el.hasAttribute('disabled')) return;
    const g = this.game;
    const act = el.dataset.act!;
    const arg = el.dataset.arg ?? '';
    const hero = g.heroes[this.selectedHero];
    switch (act) {
      case 'new-run': g.newRun(); this.selectedHero = 0; this.paused = false; this.renderer.cam.home(); break;
      case 'menu': g.toMenu(); break;
      case 'reset':
        if (confirm('Удалить все осколки, улучшения Цитадели и рекорды? Это нельзя отменить.')) g.resetProgress();
        break;
      case 'meta': g.buyUpgrade(arg); break;
      case 'card': { const p = g.pendingPick(); if (p) g.pickCard(p, arg); break; }
      case 'select-hero': this.selectedHero = Number(arg); play('pick'); break;
      case 'buy': g.buy(Number(arg), hero); break;
      case 'equip': if (hero) g.equip(Number(arg), hero); break;
      case 'unequip': g.unequip(Number(arg)); break;
      case 'sell': g.sell(Number(arg)); break;
      case 'upgrade': g.upgradeItem(Number(arg)); break;
      case 'craft': g.craft(Number(arg)); break;
      case 'train': g.train(g.heroes[Number(arg)]); break;
      case 'reroll': g.reroll(); break;
      case 'lock': g.toggleLock(Number(arg)); break;
      case 'order': g.buyOrder(arg as OrderId); break;
      case 'repair': g.repair(); break;
      case 'towers': g.upgradeTowers(); break;
      case 'start-wave': g.startWave(); this.paused = false; break;
      case 'speed': this.setSpeed(Number(arg)); break;
      case 'pause': this.paused = !this.paused; break;
      case 'mute': this.toggleMute(); break;
      case 'home': this.renderer.cam.home(); break;
    }
    ev.stopPropagation();
    this.refresh();
  }

  /** Cheap per-frame HUD update. */
  tick(): void {
    const g = this.game;
    const key = `${g.wave}|${g.gold}|${Math.ceil(g.castleHp)}|${g.enemiesLeft()}|${g.phase}|${g.orders.size}`;
    if (key === this.last) return;
    this.last = key;
    const act = ORDERS.filter((o) => g.orders.has(o.id)).map((o) => o.icon).join('');
    this.hud.wave.textContent = (g.phase === 'shop' ? `Волна ${g.wave + 1} готовится` : `Волна ${g.wave}`) + (act ? ' ' + act : '');
    this.hud.gold.textContent = String(g.gold);
    this.hud.enemies.textContent = g.phase === 'battle' ? String(g.enemiesLeft()) : '—';
    const hp = Math.max(0, Math.ceil(g.castleHp));
    const max = g.castleMax();
    this.hud.castleBar.style.width = `${(hp / max) * 100}%`;
    this.hud.castleText.textContent = `${hp} / ${max}`;
  }

  refresh(): void {
    this.last = '';
    const g = this.game;
    this.renderer.selected = g.heroes[this.selectedHero] ?? null;
    const pick = g.phase === 'shop' ? g.pendingPick() : null;
    $('#overlay-menu').hidden = g.phase !== 'menu';
    $('#overlay-shop').hidden = g.phase !== 'shop' || !!pick;
    $('#overlay-cards').hidden = !pick;
    $('#overlay-over').hidden = g.phase !== 'gameover';
    $('#hud').hidden = g.phase === 'menu';
    document.querySelectorAll<HTMLElement>('[data-act="speed"]').forEach((b) => b.classList.toggle('on', Number(b.dataset.arg) === this.speed));
    $('#btn-pause').textContent = this.paused ? '▶ Продолжить' : '⏸ Пауза';
    $('#btn-pause').classList.toggle('on', this.paused);
    $('#btn-mute').textContent = isMuted() ? '🔇' : '🔊';
    if (g.phase === 'menu') this.renderMenu();
    if (pick) this.renderCards(pick);
    else if (g.phase === 'shop') this.renderShop();
    if (g.phase === 'gameover') this.renderOver();
    this.tick();
  }

  // ---------- citadel (menu) ----------

  private renderMenu(): void {
    const g = this.game;
    const m = g.meta;
    $('#menu-stats').innerHTML = `💎 Осколки славы: <b>${m.shards}</b> · Рекорд: <b>${m.bestWave}</b> волн · Забегов: <b>${m.runs}</b>`;
    $('#menu-heroes').innerHTML = HEROES.map((d) => `
      <div class="card hero-pick">
        <img class="avatar" src="${heroIcon(d.id)}" alt="">
        <div class="name">${d.name}</div><div class="title">${d.title}</div>
        <div class="desc">${d.desc}</div>
        <div class="skills-mini">${SKILLS.filter((s) => s.hero === d.id).map((s) => `<span title="${esc(s.name + ': ' + s.desc(1))}">${s.icon}</span>`).join('')}</div>
      </div>`).join('');
    const upCard = (id: string) => {
      const u = META_UPGRADES.find((x) => x.id === id)!;
      const lvl = g.up(id);
      const maxed = lvl >= u.max;
      const cost = metaCost(u, lvl);
      const pips = Array.from({ length: u.max }, (_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('');
      return `<button class="card up" data-act="meta" data-arg="${id}" ${maxed || m.shards < cost ? 'disabled' : ''}>
        <div class="row"><span class="icon">${u.icon}</span><span class="name">${u.name}</span></div>
        <div class="pips">${pips}</div>
        <div class="desc">${lvl ? u.desc(lvl) : 'Не изучено'}${maxed ? '' : ` → <b>${u.desc(lvl + 1)}</b>`}</div>
        <div class="cost">${maxed ? 'Максимум' : `💎 ${cost}`}</div>
      </button>`;
    };
    const castle = META_UPGRADES.filter((u) => !u.hero).map((u) => upCard(u.id)).join('');
    const heroes = HEROES.map((d) => `<div class="up-col"><div class="up-title"><img class="dot" src="${heroIcon(d.id)}" alt="">${d.name}</div>
      ${META_UPGRADES.filter((u) => u.hero === d.id).map((u) => upCard(u.id)).join('')}</div>`).join('');
    $('#menu-citadel').innerHTML = `
      <div class="section-title">🏰 Цитадель — постоянные улучшения замка</div>
      <div class="ups">${castle}</div>
      <div class="section-title">⚔ Постоянные улучшения героев</div>
      <div class="up-cols">${heroes}</div>`;
  }

  // ---------- level-up cards ----------

  private renderCards(h: Hero): void {
    const cards = h.cards ?? [];
    $('#cards-title').innerHTML = `<img class="avatar sm" src="${heroIcon(h.def.id)}" alt=""> ${h.def.name} — уровень ${h.level - h.pending + 1}. Выберите улучшение`;
    $('#cards-list').innerHTML = cards.map((id) => {
      const sk = skillById(id);
      const next = h.rank(id) + 1;
      const generic = sk.hero === '*';
      const evo = !!sk.evolves;
      const tag = evo ? '&nbsp;' : generic ? 'Общее' : sk.active ? 'Умение' : 'Пассивка';
      const rar = evo ? 3 : generic ? 0 : next - 1;
      const rank = evo
        ? sk.evolves!.map((e) => skillById(e).name).join(' + ')
        : generic ? (next > 1 ? `×${next}` : '') : `${RARITY[rar].name} · ранг ${next}/${sk.maxRank}`;
      return `<button class="card skill-card ${evo ? 'evo' : ''}" style="--rc:${rcol(rar)}" data-act="card" data-arg="${id}">
        <div class="tag">${tag}</div>
        <div class="icon">${sk.icon}</div>
        <div class="name">${sk.name}</div>
        <div class="rank">${rank}</div>
        <div class="desc">${sk.desc(Math.min(next, sk.maxRank))}</div>
        ${evo ? '<div class="new evo-badge">ЭВОЛЮЦИЯ</div>' : next === 1 && !generic ? '<div class="new">НОВОЕ</div>' : ''}
      </button>`;
    }).join('');
    const left = this.game.heroes.reduce((s, x) => s + x.pending, 0);
    $('#cards-left').textContent = left > 1 ? `Ещё выборов: ${left - 1}` : '';
  }

  // ---------- shop / bag / forge ----------

  private itemChip(it: OwnedItem, act: string, hint: string): string {
    const mods = itemText(it.def, it.rarity);
    return `<span class="slot full" style="--rc:${rcol(it.rarity)}" title="${esc(`${RARITY[it.rarity].name} ${it.def.name}: ${mods}${hint}`)}" data-act="${act}" data-arg="${it.uid}">${it.def.icon}</span>`;
  }

  private renderShop(): void {
    const g = this.game;
    if (this.selectedHero >= g.heroes.length) this.selectedHero = 0;
    const sel = g.heroes[this.selectedHero];
    const dis = (cond: boolean) => (cond ? '' : 'disabled');

    const heroCards = g.heroes.map((h, i) => {
      const s = h.stats;
      const items = Array.from({ length: MAX_ITEMS }, (_, k) => {
        const it = h.items[k];
        return it ? this.itemChip(it, 'unequip', ' — нажмите, чтобы снять в сумку') : '<span class="slot"></span>';
      }).join('');
      const skills = Object.entries(h.skills).map(([id, r]) => {
        const sk = skillById(id);
        const rar = sk.evolves ? 3 : sk.hero === '*' ? 0 : r - 1;
        return `<span class="skill" style="--rc:${rcol(rar)}" title="${esc(sk.name + ': ' + sk.desc(Math.min(r, sk.maxRank)))}">${sk.icon}<sub>${r}</sub></span>`;
      }).join('') || '<span class="hint">навыков пока нет</span>';
      return `<div class="card hero ${i === this.selectedHero ? 'on' : ''}" data-act="select-hero" data-arg="${i}">
        <div class="row"><img class="avatar sm" src="${heroIcon(h.def.id)}" alt="">
          <div><div class="name">${h.def.name} <span class="lvl">ур. ${h.level}</span></div><div class="title">${h.def.title}</div></div></div>
        <div class="xp"><div style="width:${Math.min(100, (h.xp / h.xpToNext()) * 100)}%"></div></div>
        <div class="stats">❤ ${s.maxHp} · ⚔ ${Math.round(s.dmg)} · ⚡ ${s.atkSpeed.toFixed(2)}/с · 🛡 ${s.armor} · 🎯 ${Math.round(s.range)}${s.splash ? ` · 💥 ${Math.round(s.splash)}` : ''}${s.lifesteal ? ` · 🩸 ${Math.round(s.lifesteal * 100)}%` : ''}${s.regen ? ` · ♻ ${s.regen}/с` : ''}</div>
        <div class="skills">${skills}</div>
        <div class="slots">${items}</div>
        <button class="small" data-act="train" data-arg="${i}" ${dis(g.gold >= h.trainCost())}>Тренировать → ур. ${h.level + 1} за ${h.trainCost()} 🪙</button>
      </div>`;
    }).join('');

    const nextAt = g.nextRecruitAt();
    const locked = nextAt === null ? '' : `<div class="card hero locked">
        <div class="lock">🔒</div>
        <div class="name">Новый герой</div>
        <div class="desc">Присоединится, когда уровень отряда достигнет <b>${nextAt}</b> (сейчас ${g.squadLevel()}). Кто именно — случайно.</div>
      </div>`;

    const offers = g.offers.map((o, i) => {
      if (!o) return '<div class="card offer sold">Продано</div>';
      const full = Math.round(o.def.cost * PRICE_MULT[o.rarity]);
      const fx = o.def.effect ? `<div class="fx">${describeEffect(o.def.effect, o.rarity)}</div>` : '';
      return `<div class="offer-wrap">
        <button class="card offer ${o.sale ? 'sale' : ''} ${o.locked ? 'locked' : ''}" style="--rc:${rcol(o.rarity)}" data-act="buy" data-arg="${i}" ${dis(g.gold >= o.price)}>
          ${o.sale ? '<div class="badge">−40%</div>' : ''}
          <div class="icon">${o.def.icon}</div><div class="name">${o.def.name}</div>
          ${o.rarity ? `<div class="rar">${RARITY[o.rarity].name}</div>` : ''}
          <div class="desc">${describeMods(scaleMods(o.def.mods, RARITY[o.rarity].mult))}</div>${fx}
          <div class="cost">${o.sale ? `<s>${full}</s> ` : ''}${o.price} 🪙</div>
        </button>
        <button class="tiny lock ${o.locked ? 'on' : ''}" data-act="lock" data-arg="${i}" title="${o.locked ? 'Снять закрепление' : 'Закрепить: предмет останется после обновления и в следующей волне'}">${o.locked ? '🔒' : '🔓'}</button>
      </div>`;
    }).join('');

    // Bag: click = put on the selected hero; ⬆ = forge upgrade; 💰 = sell.
    const bag = g.bag.length
      ? g.bag.map((it) => `<div class="bag-item">
          ${this.itemChip(it, 'equip', sel && sel.items.length < MAX_ITEMS ? ` — нажмите, чтобы надеть на ${sel.def.name}` : '')}
          <button class="tiny" data-act="upgrade" data-arg="${it.uid}" ${dis(it.rarity < MAX_RARITY && g.gold >= g.upgradeCost(it))} title="Улучшить в кузнице до «${RARITY[Math.min(it.rarity + 1, MAX_RARITY)].name}»">⬆${it.rarity < MAX_RARITY ? g.upgradeCost(it) : ''}</button>
          <button class="tiny" data-act="sell" data-arg="${it.uid}" title="Продать">💰${g.sellValue(it)}</button>
        </div>`).join('')
      : '<span class="hint">Пусто. Сюда попадают предметы, которые не поместились, и снятые с героев.</span>';

    // Forge: upgrade worn items too, and recipes.
    const worn = g.heroes.flatMap((h) => h.items.filter((it) => it.rarity < MAX_RARITY).map((it) => ({ h, it })));
    const forgeUps = worn.map(({ h, it }) => `<button class="tiny" data-act="upgrade" data-arg="${it.uid}" ${dis(g.gold >= g.upgradeCost(it))}
        title="${esc(`${h.def.name}: ${it.def.name} → ${RARITY[it.rarity + 1].name}`)}"><span style="color:${rcol(it.rarity)}">${it.def.icon}</span>→<span style="color:${rcol(it.rarity + 1)}">⬆</span> ${g.upgradeCost(it)}</button>`).join('');
    const can = new Set(g.craftable());
    const recipes = RECIPES.map((r, i) => {
      const res = itemById(r.result);
      return `<button class="recipe ${can.has(i) ? 'ready' : ''}" data-act="craft" data-arg="${i}" ${dis(can.has(i))}
        title="${esc(`${res.name}: ${describeMods(res.mods)}`)}">${itemById(r.a).icon}+${itemById(r.b).icon}=${res.icon}</button>`;
    }).join('');

    const news = g.news.map((n) => `<div class="news">${esc(n)}</div>`).join('');
    const lastWave = g.wave > 0
      ? `<div class="summary">Волна ${g.wave} отбита! Убито ${g.waveKills}, золото за убийства +${g.waveGold}, награда +${g.lastWaveBonus}.` +
        `${g.waveCastleDmg > 0 ? ` <span class="bad">Замок получил −${Math.round(g.waveCastleDmg)}.</span>` : ' Замок не пострадал.'}` +
        `${g.waveHeroDeaths ? ` <span class="bad">Пало героев: ${g.waveHeroDeaths}.</span>` : ''}</div>`
      : '';
    const nextWave = g.wave + 1;
    const prevTypes = new Set(wavePreview(nextWave - 1).map((x) => x.type));
    const preview = wavePreview(nextWave).map((x) => {
      const d = ENEMIES[x.type];
      const fresh = nextWave > 1 && !prevTypes.has(x.type);
      return `<span class="pv ${fresh ? 'new' : ''}" title="${esc(d.name)}${d.explodes ? ' — бежит к стене и взрывается' : ''}">${d.icon}×${x.count}${fresh ? ' <b>новые!</b>' : ''}</span>`;
    }).join('');
    const orders = ORDERS.map((o) => {
      const have = g.orders.has(o.id);
      return `<button class="small order ${have ? 'on' : ''}" data-act="order" data-arg="${o.id}" ${dis(!have && g.gold >= g.orderCost(o.id))}
        title="${esc(o.desc + ' (одна волна)')}">${o.icon} ${o.name} <span class="hint">${o.desc}</span> ${have ? '✓' : `— ${g.orderCost(o.id)} 🪙`}</button>`;
    }).join('');

    $('#shop-content').innerHTML = `
      ${lastWave}${news}
      <div class="section-title">Отряд <span class="hint">уровень отряда ${g.squadLevel()} · нажмите на героя, чтобы выбрать, кому покупать и надевать · предмет на герое — снять в сумку</span></div>
      <div class="heroes">${heroCards}${locked}</div>
      <div class="cols">
        <div>
          <div class="section-title">Лавка → для <b>${sel ? sel.def.name : '—'}</b>
            <button class="small" data-act="reroll" ${dis(g.gold >= g.rerollCost())}>🎲 Обновить (${g.rerollCost()} 🪙)</button>
            <span class="hint">3 одинаковых = 1 редкостью выше · 🔓 закрепить предмет</span></div>
          <div class="offers">${offers}</div>
        </div>
        <div>
          <div class="section-title">🎒 Сумка</div>
          <div class="bag">${bag}</div>
          <div class="section-title">⚒ Кузница <span class="hint">улучшить надетое · рецепты</span></div>
          <div class="forge">${forgeUps || '<span class="hint">Нечего улучшать.</span>'}</div>
          <div class="recipes">${recipes}</div>
        </div>
      </div>
      <div class="section-title">Замок</div>
      <div class="castle-actions">
        <button class="small" data-act="repair" ${dis(g.gold >= REPAIR_COST && g.castleHp < g.castleMax())}>🧱 Починить стены +${REPAIR_AMOUNT} HP — ${REPAIR_COST} 🪙</button>
        ${g.towerLevel < TOWER_MAX_LEVEL
          ? `<button class="small" data-act="towers" ${dis(g.gold >= g.towerCost())}>🏹 Башни ур. ${g.towerLevel + 1} (урон ${g.towerDmg()}→${g.towerDmg(g.towerLevel + 1)}) — ${g.towerCost()} 🪙</button>`
          : '<span class="hint">Башни максимального уровня</span>'}
      </div>
      <div class="section-title">📜 Приказы <span class="hint">действуют только следующую волну; цена растёт с волнами</span></div>
      <div class="castle-actions">${orders}</div>
      <div class="footer"><div class="preview">Ждите: ${preview}</div>
        <button class="big" data-act="start-wave">⚔ Начать волну ${g.wave + 1} (${waveSize(g.wave + 1)} врагов)</button></div>`;
  }

  private renderOver(): void {
    const g = this.game;
    $('#over-text').innerHTML = `Замок пал на <b>${g.wave}</b> волне. Рекорд: <b>${g.meta.bestWave}</b>.<br>` +
      `Убито врагов за забег: <b>${g.kills}</b>.<br>` +
      g.heroes.map((h: Hero) => `${h.def.name} — ур. ${h.level}, убийств ${h.kills}`).join('<br>') +
      `<br><br>💎 Получено осколков славы: <b>+${g.lastShards}</b> (всего ${g.meta.shards}).<br>` +
      'Потратьте их в Цитадели на постоянные улучшения замка и героев — они действуют во всех следующих забегах.';
  }
}
