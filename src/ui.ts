// DOM interface: battle HUD + hero panels, citadel menu, level-up cards,
// camp between waves (squad / market / stash), game over, tooltips, hotkeys.
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
const itemText = (def: ItemDef, r: number): string =>
  [describeMods(scaleMods(def.mods, RARITY[r].mult)), describeEffect(def.effect, r)].filter(Boolean).join('. ');
const tip = (html: string) => `data-tip="${esc(html)}"`;
const coin = (n: number) => `<span class="coin">${n}</span>`;

export class UI {
  speed = 1;
  paused = false;
  selectedHero = 0;
  private hud = {
    wave: $('#hud-wave'), gold: $('#hud-gold'), progress: $('#hud-progress'), enemies: $('#hud-enemies-text'),
    castleBar: $('#hud-castle-bar'), castleText: $('#hud-castle-text'),
  };
  private last = '';
  private frame = 0;
  private waveTotal = 1;
  private tipEl = $('#tooltip');

  constructor(private game: Game, private renderer: Renderer) {
    document.body.addEventListener('click', (ev) => { unlockAudio(); this.onClick(ev); });
    window.addEventListener('keydown', (ev) => this.onKey(ev));
    // Custom tooltips for anything with data-tip.
    document.addEventListener('mouseover', (ev) => {
      const el = (ev.target as HTMLElement).closest('[data-tip]') as HTMLElement | null;
      if (!el) { this.tipEl.hidden = true; return; }
      this.tipEl.innerHTML = el.dataset.tip!;
      this.tipEl.hidden = false;
    });
    document.addEventListener('mousemove', (ev) => {
      if (this.tipEl.hidden) return;
      const r = this.tipEl.getBoundingClientRect();
      const x = Math.min(ev.clientX + 16, window.innerWidth - r.width - 8);
      const y = ev.clientY + 18 + r.height > window.innerHeight ? ev.clientY - r.height - 12 : ev.clientY + 18;
      this.tipEl.style.left = `${Math.max(8, x)}px`;
      this.tipEl.style.top = `${Math.max(8, y)}px`;
    });
  }

  private onKey(ev: KeyboardEvent): void {
    unlockAudio();
    const g = this.game;
    const pick = g.phase === 'shop' ? g.pendingPick() : null;
    const n = ['1', '2', '3'].indexOf(ev.key);
    if (pick && n >= 0 && pick.cards?.[n]) { g.pickCard(pick, pick.cards[n]); this.refresh(); return; }
    if (g.phase === 'battle') {
      if (ev.code === 'Space') { this.paused = !this.paused; this.refresh(); ev.preventDefault(); }
      if (n >= 0) this.setSpeed([1, 2, 4][n]);
    }
    if (g.phase === 'shop' && !pick && (ev.code === 'Space' || ev.code === 'Enter')) {
      ev.preventDefault(); g.startWave(); this.paused = false; this.refresh();
    }
    if (g.phase === 'menu' && ev.code === 'Enter') { g.newRun(); this.renderer.cam.home(); this.refresh(); }
    if (ev.key === 'm' || ev.key === 'ь') this.toggleMute();
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
    (el as HTMLElement).blur();
    this.tipEl.hidden = true;
    this.refresh();
  }

  /** Cheap per-frame HUD update. */
  tick(): void {
    const g = this.game;
    if (g.phase === 'battle' && ++this.frame % 6 === 0) this.renderHeroHud();
    const key = `${g.wave}|${g.gold}|${Math.ceil(g.castleHp)}|${g.enemiesLeft()}|${g.phase}|${g.orders.size}`;
    if (key === this.last) return;
    this.last = key;
    const act = ORDERS.filter((o) => g.orders.has(o.id)).map((o) => o.icon).join(' ');
    this.hud.wave.innerHTML = `Волна <b>${g.wave}</b>${act ? ` <span class="orders-on">${act}</span>` : ''}`;
    this.hud.gold.textContent = String(g.gold);
    const left = g.enemiesLeft();
    this.waveTotal = Math.max(this.waveTotal, left, 1);
    this.hud.progress.style.width = `${(1 - left / this.waveTotal) * 100}%`;
    this.hud.enemies.textContent = `осталось ${left}`;
    const hp = Math.max(0, Math.ceil(g.castleHp));
    const max = g.castleMax();
    const pct = (hp / max) * 100;
    this.hud.castleBar.style.width = `${pct}%`;
    this.hud.castleBar.className = pct < 30 ? 'low' : pct < 60 ? 'mid' : '';
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
    $('#hud').hidden = g.phase !== 'battle';
    $('#hero-hud').hidden = g.phase !== 'battle';
    if (g.phase !== 'battle') this.waveTotal = 1;
    document.querySelectorAll<HTMLElement>('[data-act="speed"]').forEach((b) => b.classList.toggle('on', Number(b.dataset.arg) === this.speed));
    $('#btn-pause').textContent = this.paused ? '▶' : '⏸';
    $('#btn-pause').classList.toggle('on', this.paused);
    $('#stage').classList.toggle('paused', this.paused && g.phase === 'battle');
    $('#btn-mute').textContent = isMuted() ? '🔇' : '🔊';
    if (g.phase === 'menu') this.renderMenu();
    if (pick) this.renderCards(pick);
    else if (g.phase === 'shop') this.keepScroll(() => this.renderShop());
    if (g.phase === 'gameover') this.renderOver();
    if (g.phase === 'battle') this.renderHeroHud();
    this.tick();
  }

  /** Re-rendering via innerHTML resets scroll; restore it for every scrollable panel. */
  private keepScroll(fn: () => void): void {
    const pos = [...document.querySelectorAll<HTMLElement>('.scroll')].map((e) => e.scrollTop);
    fn();
    document.querySelectorAll<HTMLElement>('.scroll').forEach((e, i) => { e.scrollTop = pos[i] ?? 0; });
  }

  // ---------- battle: hero panels ----------

  private renderHeroHud(): void {
    const g = this.game;
    $('#hero-hud').innerHTML = g.heroes.map((h, i) => {
      const hpPct = h.alive ? (h.hp / h.stats.maxHp) * 100 : 0;
      const skills = Object.keys(h.skills).map(skillById).filter((s) => s.active).map((s) => {
        const left = Math.max(0, h.cds[s.id] ?? 0);
        const full = s.cd ? s.cd(h.rank(s.id)) * h.stats.cdMult : 1;
        const pct = Math.min(1, left / full);
        return `<span class="cd ${left <= 0 ? 'ready' : ''}" style="--p:${pct * 360}deg" ${tip(`<b>${s.name}</b><br>${s.desc(Math.min(h.rank(s.id), s.maxRank))}`)}>${s.icon}</span>`;
      }).join('');
      return `<div class="hh ${h.alive ? '' : 'dead'} ${i === this.selectedHero ? 'on' : ''}" data-act="select-hero" data-arg="${i}">
        <img src="${heroIcon(h.def.id)}" alt="">
        <div class="hh-body">
          <div class="hh-name">${h.def.name}<span>ур. ${h.level}</span></div>
          <div class="hh-hp"><i style="width:${hpPct}%"></i><em>${h.alive ? `${Math.ceil(h.hp)}/${h.stats.maxHp}` : 'пал — вернётся в лагере'}</em></div>
          <div class="hh-xp"><i style="width:${Math.min(100, (h.xp / h.xpToNext()) * 100)}%"></i></div>
          ${skills ? `<div class="hh-cds">${skills}</div>` : ''}
        </div>
      </div>`;
    }).join('');
  }

  // ---------- citadel (menu) ----------

  private renderMenu(): void {
    const g = this.game;
    const m = g.meta;
    $('#menu-stats').innerHTML = `
      <div class="chip gem" ${tip('Осколки славы даются за каждый забег. Тратятся на улучшения ниже.')}>💎 <b>${m.shards}</b><span>осколков</span></div>
      <div class="chip">🏆 <b>${m.bestWave}</b><span>рекорд волн</span></div>
      <div class="chip">⚔ <b>${m.runs}</b><span>забегов</span></div>`;
    $('#menu-heroes').innerHTML = HEROES.map((d) => `
      <div class="hero-pick" style="--hc:${d.color ?? '#c9a45a'}">
        <img src="${heroIcon(d.id)}" alt="">
        <div class="name">${d.name}</div><div class="title">${d.title}</div>
        <div class="desc">${d.desc}</div>
        <div class="skills-mini">${SKILLS.filter((s) => s.hero === d.id && !s.evolves).map((s) => `<span ${tip(`<b>${s.name}</b>${s.active ? ' · умение' : ' · пассивка'}<br>${s.desc(1)}`)}>${s.icon}</span>`).join('')}</div>
      </div>`).join('');
    const upCard = (id: string) => {
      const u = META_UPGRADES.find((x) => x.id === id)!;
      const lvl = g.up(id);
      const maxed = lvl >= u.max;
      const cost = metaCost(u, lvl);
      const afford = m.shards >= cost;
      const pips = Array.from({ length: u.max }, (_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('');
      return `<button class="up ${maxed ? 'maxed' : afford ? 'afford' : ''}" data-act="meta" data-arg="${id}" ${maxed || !afford ? 'disabled' : ''}>
        <span class="up-icon">${u.icon}</span>
        <span class="up-body"><span class="up-name">${u.name}</span><span class="pips">${pips}</span>
          <span class="up-desc">${lvl ? u.desc(lvl) : 'Не изучено'}${maxed ? '' : ` → <b>${u.desc(lvl + 1)}</b>`}</span></span>
        <span class="up-cost">${maxed ? '✓' : `💎${cost}`}</span>
      </button>`;
    };
    const castle = META_UPGRADES.filter((u) => !u.hero).map((u) => upCard(u.id)).join('');
    const heroes = HEROES.map((d) => `<div class="up-col"><div class="up-title"><img src="${heroIcon(d.id)}" alt="">${d.name}</div>
      ${META_UPGRADES.filter((u) => u.hero === d.id).map((u) => upCard(u.id)).join('')}</div>`).join('');
    $('#menu-citadel').innerHTML = `
      <h2>🏰 Цитадель <span>вечные улучшения, действуют во всех забегах</span></h2>
      <div class="ups">${castle}</div>
      <div class="up-cols">${heroes}</div>`;
  }

  // ---------- level-up cards ----------

  private renderCards(h: Hero): void {
    const cards = h.cards ?? [];
    $('#cards-title').innerHTML = `<img src="${heroIcon(h.def.id)}" alt="">
      <div><div class="ct-top">Новый уровень!</div><div class="ct-name">${h.def.name} · уровень ${h.level - h.pending + 1}</div></div>`;
    $('#cards-list').innerHTML = cards.map((id, k) => {
      const sk = skillById(id);
      const next = h.rank(id) + 1;
      const generic = sk.hero === '*';
      const evo = !!sk.evolves;
      const tag = evo ? 'Эволюция' : generic ? 'Общее' : sk.active ? 'Умение' : 'Пассивка';
      const rar = evo ? 3 : generic ? 0 : next - 1;
      const pips = generic || evo ? '' : `<div class="pips">${Array.from({ length: sk.maxRank }, (_, i) => `<i class="${i < next - 1 ? 'on' : i === next - 1 ? 'next' : ''}"></i>`).join('')}</div>`;
      const sub = evo ? sk.evolves!.map((e) => skillById(e).name).join(' + ') : generic ? (next > 1 ? `взято ×${next - 1}` : '') : `ранг ${next} из ${sk.maxRank}`;
      return `<button class="skill-card ${evo ? 'evo' : ''}" style="--rc:${rcol(rar)}; --d:${k * 70}ms" data-act="card" data-arg="${id}">
        <span class="key">${k + 1}</span>
        <div class="tag">${tag}</div>
        <div class="icon">${sk.icon}</div>
        <div class="name">${sk.name}</div>
        ${pips}<div class="rank">${sub}</div>
        <div class="desc">${sk.desc(Math.min(next, sk.maxRank))}</div>
        ${next === 1 && !generic && !evo ? '<div class="new">НОВОЕ</div>' : ''}
      </button>`;
    }).join('');
    const left = this.game.heroes.reduce((s, x) => s + x.pending, 0);
    $('#cards-left').textContent = `Клавиши 1 · 2 · 3${left > 1 ? ` · ещё выборов: ${left - 1}` : ''}`;
  }

  // ---------- camp: squad / market / stash ----------

  private itemSlot(it: OwnedItem, act: string, hint: string): string {
    return `<span class="slot full" style="--rc:${rcol(it.rarity)}" data-act="${act}" data-arg="${it.uid}"
      ${tip(`<b style="color:${rcol(it.rarity)}">${RARITY[it.rarity].name} ${it.def.name}</b><br>${itemText(it.def, it.rarity)}<br><i>${hint}</i>`)}>${it.def.icon}</span>`;
  }

  private renderShop(): void {
    const g = this.game;
    if (this.selectedHero >= g.heroes.length) this.selectedHero = 0;
    const sel = g.heroes[this.selectedHero];
    const dis = (cond: boolean) => (cond ? '' : 'disabled');

    // --- top bar ---
    const hp = Math.ceil(g.castleHp), max = g.castleMax();
    const top = `<div class="camp-top">
      <div class="camp-title"><span>Лагерь</span><b>перед волной ${g.wave + 1}</b></div>
      <div class="camp-res">
        <div class="res" ${tip('Здоровье замка')}>🏰 <div class="mini-bar"><i style="width:${(hp / max) * 100}%"></i></div><b>${hp}</b>/${max}</div>
        <div class="res" ${tip('Уровень отряда: сумма уровней героев. От него зависит, когда придёт новый герой.')}>⭐ <b>${g.squadLevel()}</b></div>
        <div class="res gold">🪙 <b>${g.gold}</b></div>
        <button class="icon-btn" id="btn-mute2" data-act="mute">${isMuted() ? '🔇' : '🔊'}</button>
      </div>
    </div>`;

    // --- report from the last wave ---
    const report = g.wave > 0 ? `<div class="report">
      <span class="ok">✔ Волна ${g.wave} отбита</span>
      <span>☠ ${g.waveKills}</span><span>🪙 +${g.waveGold + g.lastWaveBonus}</span>
      ${g.waveCastleDmg > 0 ? `<span class="bad">🏰 −${Math.round(g.waveCastleDmg)}</span>` : '<span class="ok">🏰 цел</span>'}
      ${g.waveHeroDeaths ? `<span class="bad">💀 пало ${g.waveHeroDeaths}</span>` : ''}
      ${g.news.map((n) => `<span class="news">${esc(n)}</span>`).join('')}
    </div>` : '';

    // --- squad column ---
    const heroCards = g.heroes.map((h, i) => {
      const s = h.stats;
      const slots = Array.from({ length: MAX_ITEMS }, (_, k) => {
        const it = h.items[k];
        return it ? this.itemSlot(it, 'unequip', 'Нажмите — снять в сумку') : '<span class="slot"></span>';
      }).join('');
      const skills = Object.entries(h.skills).map(([id, r]) => {
        const sk = skillById(id);
        const rar = sk.evolves ? 3 : sk.hero === '*' ? 0 : r - 1;
        return `<span class="skill" style="--rc:${rcol(rar)}" ${tip(`<b>${sk.name}</b> · ранг ${r}<br>${sk.desc(Math.min(r, sk.maxRank))}`)}>${sk.icon}<sub>${r}</sub></span>`;
      }).join('') || '<span class="hint">навыков пока нет</span>';
      const stat = (ico: string, v: string, t: string) => `<span ${tip(t)}>${ico}<b>${v}</b></span>`;
      return `<div class="hero-card ${i === this.selectedHero ? 'on' : ''}" data-act="select-hero" data-arg="${i}">
        <div class="hc-head"><img src="${heroIcon(h.def.id)}" alt="">
          <div class="hc-id"><div class="name">${h.def.name}</div><div class="title">${h.def.title}</div>
            <div class="xp" ${tip(`Опыт: ${Math.floor(h.xp)} / ${h.xpToNext()}`)}><i style="width:${Math.min(100, (h.xp / h.xpToNext()) * 100)}%"></i></div></div>
          <div class="lvl">${h.level}</div></div>
        <div class="stats">${stat('❤', String(s.maxHp), 'Здоровье')}${stat('⚔', String(Math.round(s.dmg)), 'Урон')}${stat('⚡', s.atkSpeed.toFixed(2), 'Атак в секунду')}${stat('🛡', String(s.armor), 'Броня')}${stat('🎯', String(Math.round(s.range)), 'Дальность')}${s.splash ? stat('💥', String(Math.round(s.splash)), 'Радиус взрыва') : ''}${s.lifesteal ? stat('🩸', Math.round(s.lifesteal * 100) + '%', 'Вампиризм') : ''}${s.regen ? stat('♻', String(s.regen), 'Регенерация в секунду') : ''}</div>
        <div class="skills">${skills}</div>
        <div class="hc-foot"><div class="slots">${slots}</div>
          <button class="btn small" data-act="train" data-arg="${i}" ${dis(g.gold >= h.trainCost())} ${tip('Тренировка: +1 уровень и карточка навыка')}>⬆ ${coin(h.trainCost())}</button></div>
      </div>`;
    }).join('');
    const nextAt = g.nextRecruitAt();
    const recruit = nextAt === null ? '' : `<div class="hero-card locked">
      <div class="lock-ico">🔒</div><div><div class="name">Новый герой</div>
      <div class="hint">Придёт на уровне отряда <b>${nextAt}</b> (сейчас ${g.squadLevel()})</div>
      <div class="mini-bar"><i style="width:${Math.min(100, (g.squadLevel() / nextAt) * 100)}%"></i></div></div></div>`;

    // --- market column ---
    const offers = g.offers.map((o, i) => {
      if (!o) return '<div class="offer sold"><span>Продано</span></div>';
      const full = Math.round(o.def.cost * PRICE_MULT[o.rarity]);
      const fx = o.def.effect ? `<div class="fx">✦ ${describeEffect(o.def.effect, o.rarity)}</div>` : '';
      const afford = g.gold >= o.price;
      return `<div class="offer ${o.sale ? 'sale' : ''} ${o.locked ? 'locked' : ''} ${afford ? '' : 'poor'}" style="--rc:${rcol(o.rarity)}">
        <button class="offer-main" data-act="buy" data-arg="${i}" ${dis(afford)}>
          ${o.sale ? '<span class="badge">−40%</span>' : ''}
          <span class="icon">${o.def.icon}</span>
          <span class="name">${o.def.name}</span>
          <span class="rar">${RARITY[o.rarity].name}</span>
          <span class="desc">${describeMods(scaleMods(o.def.mods, RARITY[o.rarity].mult))}</span>${fx}
          <span class="price">${o.sale ? `<s>${full}</s>` : ''}${coin(o.price)}</span>
        </button>
        <button class="lock-btn ${o.locked ? 'on' : ''}" data-act="lock" data-arg="${i}" ${tip(o.locked ? 'Снять закрепление' : 'Закрепить: останется после обновления и до следующей волны')}>${o.locked ? '🔒' : '🔓'}</button>
      </div>`;
    }).join('');
    const orders = ORDERS.map((o) => {
      const have = g.orders.has(o.id);
      return `<button class="order ${have ? 'on' : ''}" data-act="order" data-arg="${o.id}" ${dis(!have && g.gold >= g.orderCost(o.id))} ${tip(`<b>${o.name}</b><br>${o.desc}<br><i>Действует одну волну</i>`)}>
        <span class="o-ico">${o.icon}</span><span class="o-name">${o.name}</span><span class="o-cost">${have ? '✓ взят' : coin(g.orderCost(o.id))}</span></button>`;
    }).join('');

    // --- stash column ---
    const bag = g.bag.length
      ? g.bag.map((it) => `<div class="bag-item">
          ${this.itemSlot(it, 'equip', sel && sel.items.length < MAX_ITEMS ? `Нажмите — надеть на ${sel.def.name}` : 'У героя нет свободных ячеек')}
          <div class="bag-acts">
            <button class="mini" data-act="upgrade" data-arg="${it.uid}" ${dis(it.rarity < MAX_RARITY && g.gold >= g.upgradeCost(it))} ${tip(`Улучшить до «${RARITY[Math.min(it.rarity + 1, MAX_RARITY)].name}»`)}>⬆${it.rarity < MAX_RARITY ? g.upgradeCost(it) : ''}</button>
            <button class="mini" data-act="sell" data-arg="${it.uid}" ${tip('Продать')}>💰${g.sellValue(it)}</button>
          </div></div>`).join('')
      : '<div class="empty">Пусто. Сюда попадают снятые предметы и те, что не влезли.</div>';
    const worn = g.heroes.flatMap((h) => h.items.filter((it) => it.rarity < MAX_RARITY).map((it) => ({ h, it })));
    const forge = worn.map(({ h, it }) => `<button class="forge-up" data-act="upgrade" data-arg="${it.uid}" ${dis(g.gold >= g.upgradeCost(it))}
        ${tip(`${h.def.name}: ${it.def.name}<br><span style="color:${rcol(it.rarity)}">${RARITY[it.rarity].name}</span> → <span style="color:${rcol(it.rarity + 1)}">${RARITY[it.rarity + 1].name}</span>`)}>
        <span style="--rc:${rcol(it.rarity)}" class="fi">${it.def.icon}</span><span class="arrow" style="color:${rcol(it.rarity + 1)}">▲</span>${coin(g.upgradeCost(it))}</button>`).join('');
    const can = new Set(g.craftable());
    const recipes = RECIPES.map((r, i) => {
      const res = itemById(r.result);
      return `<button class="recipe ${can.has(i) ? 'ready' : ''}" data-act="craft" data-arg="${i}" ${dis(can.has(i))}
        ${tip(`<b>${res.name}</b><br>${itemText(res, 0)}<br><i>${itemById(r.a).name} + ${itemById(r.b).name}</i>`)}>${itemById(r.a).icon}<i>+</i>${itemById(r.b).icon}<i>=</i>${res.icon}</button>`;
    }).join('');

    // --- footer: wave preview + start ---
    const nextWave = g.wave + 1;
    const prevTypes = new Set(wavePreview(nextWave - 1).map((x) => x.type));
    const preview = wavePreview(nextWave).map((x) => {
      const d = ENEMIES[x.type];
      const fresh = nextWave > 1 && !prevTypes.has(x.type);
      return `<span class="pv ${fresh ? 'new' : ''}" ${tip(`<b>${d.name}</b>${d.explodes ? '<br>Бежит к стене и взрывается' : ''}${fresh ? '<br><i>Впервые в этой волне</i>' : ''}`)}>${d.icon}<b>${x.count}</b></span>`;
    }).join('');

    $('#shop-content').innerHTML = `${top}${report}
      <div class="camp-cols">
        <section class="col squad">
          <h3>Отряд <span>выберите героя — покупки и предметы идут ему</span></h3>
          <div class="scroll">${heroCards}${recruit}</div>
        </section>
        <section class="col market scroll">
          <h3>Лавка <span>для <b>${sel ? sel.def.name : '—'}</b> · 3 одинаковых = редкость выше</span>
            <button class="btn small" data-act="reroll" ${dis(g.gold >= g.rerollCost())}>🎲 ${coin(g.rerollCost())}</button></h3>
          <div class="offers">${offers}</div>
          <h3>Приказы <span>на одну волну</span></h3>
          <div class="orders">${orders}</div>
          <h3>Замок</h3>
          <div class="castle-acts">
            <button class="act" data-act="repair" ${dis(g.gold >= REPAIR_COST && g.castleHp < g.castleMax())}><span>🧱</span><span>Ремонт стен<small>+${REPAIR_AMOUNT} HP</small></span>${coin(REPAIR_COST)}</button>
            ${g.towerLevel < TOWER_MAX_LEVEL
              ? `<button class="act" data-act="towers" ${dis(g.gold >= g.towerCost())}><span>🏹</span><span>Башни ур. ${g.towerLevel + 1}<small>урон ${g.towerDmg()} → ${g.towerDmg(g.towerLevel + 1)}</small></span>${coin(g.towerCost())}</button>`
              : '<div class="act done"><span>🏹</span><span>Башни<small>максимальный уровень</small></span></div>'}
          </div>
        </section>
        <section class="col stash">
          <h3>Сумка <span>${g.bag.length} предм.</span></h3>
          <div class="scroll bag">${bag}</div>
          <h3>Кузница <span>улучшить надетое</span></h3>
          <div class="scroll forge">${forge || '<div class="empty">Нечего улучшать.</div>'}</div>
          <h3>Рецепты</h3>
          <div class="recipes">${recipes}</div>
        </section>
      </div>
      <div class="camp-foot">
        <div class="preview"><span class="pv-label">Идут:</span>${preview}</div>
        <button class="btn primary xl" data-act="start-wave">⚔ Волна ${nextWave} <small>${waveSize(nextWave)} врагов · Пробел</small></button>
      </div>`;
  }

  private renderOver(): void {
    const g = this.game;
    const record = g.wave >= g.meta.bestWave;
    $('#over-text').innerHTML = `
      <div class="over-sub">${record ? '🏆 Новый рекорд!' : `Рекорд: ${g.meta.bestWave} волн`}</div>
      <div class="tiles">
        <div class="tile"><b>${g.wave}</b><span>волна</span></div>
        <div class="tile"><b>${g.kills}</b><span>убито врагов</span></div>
        <div class="tile gem"><b>+${g.lastShards}</b><span>💎 осколков (всего ${g.meta.shards})</span></div>
      </div>
      <div class="over-heroes">${g.heroes.map((h: Hero) => `<div class="oh"><img src="${heroIcon(h.def.id)}" alt=""><b>${h.def.name}</b><span>ур. ${h.level} · ☠ ${h.kills}</span></div>`).join('')}</div>
      <p class="hint">Потратьте осколки в Цитадели — улучшения действуют во всех следующих забегах.</p>`;
  }
}
