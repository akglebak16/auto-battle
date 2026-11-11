// DOM interface: battle HUD + hero panels, citadel menu, level-up cards,
// camp between waves (squad / market / stash), game over, tooltips, hotkeys.
import {
  Game, Hero, MAX_ITEMS, REPAIR_AMOUNT, EVENT_INFO, ELITES, TOWER_MAX_LEVEL, ORDERS, PRICE_MULT, type OwnedItem, type OrderId,
} from './game';
import {
  HEROES, RARITY, MAX_RARITY, RECIPES, ITEMS, ENEMIES, META_UPGRADES, BRANCHES, SPELLS, RELICS, SYNERGIES, BIOMES, LOCKED_HEROES, metaCost, describeMods, describeEffect, scaleMods,
  waveSize, wavePreview, gemScale, type ItemDef,
} from './data';
import { SKILLS, skillById } from './skills';
import type { Renderer } from './render';
import { heroIcon } from './sprites';
import { isMuted, setMuted, unlockAudio, play, setMusic, setVolume, setMusicVolume } from './sound';
import { settings, saveSettings } from './settings';

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
  /** Spell waiting for a target click on the battlefield. */
  armed: string | null = null;

  constructor(private game: Game, private renderer: Renderer) {
    this.applySettings();
    window.addEventListener('resize', () => this.applySettings());
    document.body.addEventListener('click', (ev) => { unlockAudio(); this.onClick(ev); });
    document.body.addEventListener('input', (ev) => {
      const el = ev.target as HTMLInputElement;
      if (!el.dataset.set) return;
      const k = el.dataset.set as 'sfx' | 'music' | 'ui';
      settings[k] = Number(el.value);
      const out = el.nextElementSibling; if (out) out.textContent = Math.round(settings[k] * 100) + '%';
      this.applySettings();
    });
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
    const n4 = ['1', '2', '3', '4'].indexOf(ev.key);
    if (pick && n4 >= 0 && pick.cards?.[n4]) { g.pickCard(pick, pick.cards[n4]); this.refresh(); return; }
    if (g.phase === 'shop' && !pick && g.event && n >= 0) { g.resolveEvent(n); this.refresh(); return; }
    if (ev.code === 'Escape' && this.citadelOpen) { this.citadelOpen = false; this.refresh(); return; }
    if (g.phase === 'battle') {
      const RU: Record<string, string> = { Q: 'Й', W: 'Ц', E: 'У', R: 'К' };
      const k = ev.key.toUpperCase();
      const sp = SPELLS.find((x) => x.key === k || RU[x.key] === k);
      if (k === 'F' || k === 'А') { this.rallyAll = !this.rallyAll; this.armed = null; this.renderer.aim = null; this.refresh(); return; }
      if (sp) { this.arm(sp.id); return; }
      if (ev.code === 'Escape') { this.armed = null; this.renderer.aim = null; this.refresh(); }
      if (ev.code === 'Space') { this.paused = !this.paused; this.refresh(); ev.preventDefault(); }
      if (n >= 0) this.setSpeed([1, 2, 4][n]);
    }
    if (g.phase === 'shop' && !pick && !g.event && (ev.code === 'Space' || ev.code === 'Enter')) {
      ev.preventDefault(); g.startWave(); this.paused = false; this.refresh();
    }
    if (g.phase === 'menu' && ev.code === 'Enter') { g.newRun(); this.renderer.cam.home(); this.refresh(); }
    if (ev.key === 'm' || ev.key === 'ь') this.toggleMute();
  }

  /** Spell button / hotkey: instant spells fire at once, area spells wait for a click on the field. */
  arm(id: string): void {
    const g = this.game;
    if (!g.spellLevel(id) || (g.spellCd[id] ?? 0) > 0) return;
    const sp = SPELLS.find((x) => x.id === id)!;
    if (!sp.radius) { g.castSpell(id, 0, 0); this.armed = null; }
    else this.armed = this.armed === id ? null : id;
    if (!this.armed) this.renderer.aim = null;
    this.refresh();
  }

  /** Mouse over the canvas while a spell is armed: move the targeting circle. */
  aimAt(ev: MouseEvent): void {
    if (!this.armed) return;
    const sp = SPELLS.find((x) => x.id === this.armed)!;
    const p = this.renderer.canvasPoint(ev);
    const w = this.renderer.cam.toWorld(p.x, p.y);
    this.renderer.aim = { x: w.x, y: w.y, r: sp.radius, color: sp.id === 'fire' ? '#ff9a2e' : sp.id === 'turret' ? '#e8c27a' : '#9fdcff' };
  }

  /** Click on the canvas: cast the armed spell there, or select a hero. */
  clickField(ev: MouseEvent): void {
    if (this.armed) {
      this.aimAt(ev);
      const a = this.renderer.aim!;
      if (this.game.castSpell(this.armed, a.x, a.y)) { this.armed = null; this.renderer.aim = null; }
      this.refresh();
      return;
    }
    const g = this.game;
    const h = this.renderer.heroAt(g, ev);
    if (h) { this.selectedHero = g.heroes.indexOf(h); this.refresh(); return; }
    // Empty ground in battle: send the selected hero (or, after F, the whole squad) there.
    if (g.phase === 'battle') {
      const p = this.renderer.canvasPoint(ev);
      const w = this.renderer.cam.toWorld(p.x, p.y);
      g.rally(this.rallyAll ? null : g.heroes[this.selectedHero] ?? null, w.x, w.y);
      this.rallyAll = false;
      this.refresh();
    }
  }

  /** F: the next click on the field moves the whole squad. */
  rallyAll = false;

  private settingsOpen = false;
  /** In the menu: the Citadel (upgrade tree) is its own screen. */
  private citadelOpen = false;
  private citSel = '';
  private tutFrame = 0;
  private tutSeen: Set<string> = (() => { try { return new Set(JSON.parse(localStorage.getItem('oplot.tut') ?? '[]')); } catch { return new Set<string>(); } })();
  private tutCur = '';

  /** Simple contextual tutorial: one short hint at a time, each shown once. */
  private tutorial(): void {
    const g = this.game;
    const boss = g.phase === 'battle' && g.enemies.some((e) => e.active && e.def.boss);
    const steps: [string, boolean, string][] = [
      ['move', g.phase === 'battle' && g.wave === 1, '⚔ Герои дерутся сами. <b>Клик по полю</b> — выбранный герой бежит туда, <b>F</b> — весь отряд.'],
      ['speed', g.phase === 'battle' && g.waveTime > 14, '⏩ <b>Пробел</b> — пауза, <b>1 / 2 / 3</b> — скорость боя.'],
      ['gems', g.phase === 'battle' && g.runGems >= 3, '💎 С врагов падают <b>алмазы</b>. Они остаются после поражения — на них растёт Цитадель.'],
      ['cards', g.phase === 'shop' && !!g.pendingPick(), '🃏 Новый уровень! Выберите <b>1 карточку из 3</b>. Две прокачанные до конца дают эволюцию.'],
      ['camp', g.phase === 'shop' && !g.pendingPick(), '🛒 Лагерь: купите предметы и наденьте их на героев, отдайте приказы, почините стены. Потом — <b>«В бой»</b>.'],
      ['boss', boss, '☠ Босс! Когда он <b>кастует</b>, под ним загорается красный круг — уводите героев оттуда.'],
      ['spells', g.phase === 'battle' && g.wave >= 3, '✨ Внизу справа — магия <b>Q W E R</b>. Новые заклинания открываются в Цитадели.'],
      ['citadel', g.phase === 'menu' && g.meta.runs > 0, '🏰 Загляните в <b>Цитадель</b>: потратьте алмазы на новых героев, магию и стены.'],
    ];
    const el = $('#tut');
    if (this.tutCur && !steps.some(([id, on]) => id === this.tutCur && on)) this.tutDone();
    if (this.tutCur) return;
    const next = steps.find(([id, on]) => on && !this.tutSeen.has(id));
    if (!next) { el.hidden = true; return; }
    this.tutCur = next[0];
    el.innerHTML = `<span>${next[2]}</span><button class="btn small" data-act="tut-ok">Понятно</button>`;
    el.hidden = false;
  }

  private tutDone(): void {
    if (!this.tutCur) return;
    this.tutSeen.add(this.tutCur);
    this.tutCur = '';
    $('#tut').hidden = true;
    try { localStorage.setItem('oplot.tut', JSON.stringify([...this.tutSeen])); } catch { /* ignore */ }
  }
  private recipesOpen = false;
  private howtoOpen = false;

  private applySettings(): void {
    setVolume(settings.sfx);
    setMusicVolume(settings.music);
    $('#stage').style.setProperty('--ui', String(settings.ui));
    // Battle HUD grows on big screens (1080p and up), on top of the player's own size setting.
    const hud = Math.min(1.5, Math.max(1, $('#stage').clientHeight / 720)) * settings.ui;
    $('#stage').style.setProperty('--hud', String(hud));
    saveSettings();
  }

  private renderSettings(): void {
    const row = (k: 'sfx' | 'music' | 'ui', label: string, min: number, max: number, step: number) =>
      `<label class="set-row"><span>${label}</span><input type="range" min="${min}" max="${max}" step="${step}" value="${settings[k]}" data-set="${k}"><output>${Math.round(settings[k] * 100)}%</output></label>`;
    const tog = (k: 'shake' | 'gore' | 'numbers' | 'fx', label: string) =>
      `<div class="set-sw ${settings[k] ? 'on' : ''}" data-act="set-toggle" data-arg="${k}" role="switch" aria-checked="${settings[k]}"><span>${label}</span><i></i></div>`;
    $('#settings-content').innerHTML = `
      <div class="ev-title">⚙ Настройки</div>
      ${row('sfx', '🔊 Звуки', 0, 1, 0.05)}${row('music', '🎵 Музыка', 0, 1, 0.05)}${row('ui', '🔍 Размер интерфейса', 0.8, 1.25, 0.05)}
      ${tog('fx', 'Свет, погода, свечение')}${tog('shake', 'Тряска экрана')}${tog('gore', 'Кровь')}${tog('numbers', 'Числа урона и добычи')}
      <div class="set-done"><button class="btn" data-act="settings">Готово</button></div>`;
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
        if (confirm('Удалить все осколки, улучшения Цитадели и рекорды? Это нельзя отменить.')) { g.resetProgress(); this.tutSeen.clear(); try { localStorage.removeItem('oplot.tut'); } catch { /* ignore */ } }
        break;
      case 'meta': g.buyUpgrade(arg); break;
      case 'tut-ok': this.tutDone(); return;
      case 'cit-sel': if (this.citSel === arg) g.buyUpgrade(arg); this.citSel = arg; break;
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
      case 'event': g.resolveEvent(Number(arg)); break;
      case 'howto': this.howtoOpen = !this.howtoOpen; $('#howto').hidden = !this.howtoOpen; return;
      case 'recipes': this.recipesOpen = !this.recipesOpen; break;
      case 'to-citadel': this.citadelOpen = true; break;
      case 'back-menu': this.citadelOpen = false; break;
      case 'menu-citadel': g.toMenu(); this.citadelOpen = true; break;
      case 'settings': this.settingsOpen = !this.settingsOpen; if (this.settingsOpen && g.phase === 'battle') this.paused = true; break;
      case 'set-toggle': { const k = arg as 'shake' | 'gore' | 'numbers' | 'fx'; settings[k] = !settings[k]; this.applySettings(); break; }
      case 'start-hero': if (g.up('pick_start')) g.setStartHero(arg); break;
      case 'continue': g.continueRun(); this.selectedHero = 0; this.paused = false; this.renderer.cam.home(); break;
      case 'spell': this.arm(arg); return;
      case 'rally-all': this.rallyAll = !this.rallyAll; break;
    }
    ev.stopPropagation();
    (el as HTMLElement).blur();
    this.tipEl.hidden = true;
    this.refresh();
  }

  /** Cheap per-frame HUD update. */
  tick(): void {
    const g = this.game;
    if (++this.tutFrame % 15 === 0) this.tutorial();
    if (g.phase === 'battle') this.renderCombo();
    if (g.phase === 'battle' && ++this.frame % 6 === 0) { this.renderHeroHud(); this.renderSpells(); this.renderBoss(); }
    const key = `${g.castleFlash > 0}|${g.wave}|${g.gold}|${Math.ceil(g.castleHp)}|${g.enemiesLeft()}|${g.phase}|${g.orders.size}`;
    if (key === this.last) return;
    this.last = key;
    const act = ORDERS.filter((o) => g.orders.has(o.id)).map((o) => o.icon).join(' ');
    this.hud.wave.innerHTML = `Волна <b>${g.wave}</b>${act ? ` <span class="orders-on">${act}</span>` : ''}`;
    this.hud.gold.textContent = String(g.gold);
    $('#hud-gems').textContent = String(Math.floor(g.runGems));
    const left = g.enemiesLeft();
    this.waveTotal = Math.max(this.waveTotal, left, 1);
    this.hud.progress.style.width = `${(1 - left / this.waveTotal) * 100}%`;
    this.hud.enemies.textContent = `осталось ${left}`;
    const hp = Math.max(0, Math.ceil(g.castleHp));
    const max = g.castleMax();
    const pct = (hp / max) * 100;
    this.hud.castleBar.style.width = `${pct}%`;
    this.hud.castleBar.className = pct < 30 ? 'low' : pct < 60 ? 'mid' : '';
    $('.hud-castle').classList.toggle('hit', g.castleFlash > 0);
    this.hud.castleText.textContent = `${hp} / ${max}`;
  }

  refresh(): void {
    this.last = '';
    const g = this.game;
    this.renderer.selected = g.heroes[this.selectedHero] ?? null;
    const pick = g.phase === 'shop' ? g.pendingPick() : null;
    if (g.phase !== 'menu') this.citadelOpen = false;
    $('#overlay-menu').hidden = g.phase !== 'menu' || this.citadelOpen;
    $('#overlay-citadel').hidden = g.phase !== 'menu' || !this.citadelOpen;
    $('#overlay-shop').hidden = g.phase !== 'shop' || !!pick;
    $('#overlay-cards').hidden = !pick;
    $('#overlay-over').hidden = g.phase !== 'gameover';
    $('#hud').hidden = g.phase !== 'battle';
    $('#hero-hud').hidden = g.phase !== 'battle';
    $('#spell-bar').hidden = g.phase !== 'battle';
    $('#combo').hidden = g.phase !== 'battle' || !$('#combo').innerHTML;
    $('#hud-relics').hidden = g.phase !== 'battle' || !g.relics.length;
    $('#hud-relics').innerHTML = this.relicChips();
    $('#overlay-event').hidden = g.phase !== 'shop' || !!pick || !g.event;
    $('#overlay-settings').hidden = !this.settingsOpen;
    if (this.settingsOpen) this.renderSettings();
    setMusic(g.phase === 'battle' ? 'battle' : g.phase === 'gameover' ? null : 'camp');
    if (g.phase === 'shop' && !pick && g.event) this.renderEvent();
    if (g.phase !== 'battle') { this.armed = null; this.renderer.aim = null; $('#boss-bar').hidden = true; }
    $('#stage').classList.toggle('aiming', !!this.armed || this.rallyAll);
    if (g.phase !== 'battle') this.waveTotal = 1;
    document.querySelectorAll<HTMLElement>('[data-act="speed"]').forEach((b) => b.classList.toggle('on', Number(b.dataset.arg) === this.speed));
    $('#btn-pause').textContent = this.paused ? '▶' : '❚❚';
    $('#btn-pause').classList.toggle('on', this.paused);
    $('#stage').classList.toggle('paused', this.paused && g.phase === 'battle');
    $('#btn-mute').textContent = isMuted() ? '🔇' : '🔊';
    if (g.phase === 'menu') this.renderMenu();
    if (pick) this.renderCards(pick);
    else if (g.phase === 'shop') this.keepScroll(() => this.renderShop());
    if (g.phase === 'gameover') this.renderOver();
    if (g.phase === 'battle') { this.renderHeroHud(); this.renderSpells(); this.renderBoss(); }
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
        return `<span class="cd ${left <= 0 ? 'ready' : ''}" style="--p:${pct * 360}deg" ${tip(`<b>${s.name}</b> · ранг ${h.rank(s.id)}<br>${s.desc(Math.min(h.rank(s.id), s.maxRank))}`)}>${s.icon}${left > 0 ? `<em>${Math.ceil(left)}</em>` : ''}</span>`;
      }).join('');
      return `<div class="hh ${h.alive ? '' : 'dead'} ${i === this.selectedHero ? 'on' : ''}" data-act="select-hero" data-arg="${i}">
        <img src="${heroIcon(h.def.id)}" alt="">
        <div class="hh-body">
          <div class="hh-name">${h.def.name}<span>ур. ${h.level}</span></div>
          <div class="hh-hp"><i style="width:${hpPct}%"></i><em>${h.alive ? `${Math.ceil(h.hp)}/${h.stats.maxHp}` : h.deadT > 0 ? `встанет через ${Math.ceil(h.deadT)} с` : 'пал'}</em></div>
          <div class="hh-xp"><i style="width:${Math.min(100, (h.xp / h.xpToNext()) * 100)}%"></i></div>
          ${skills ? `<div class="hh-cds">${skills}</div>` : ''}
        </div>
      </div>`;
    }).join('');
  }

  private comboKey = '';
  /** Banner only while kills are pouring in fast (8+ in 2.5 s); the tier follows the current pace. */
  private renderCombo(): void {
    const g = this.game, el = $('#combo');
    const pace = g.killTimes.length;
    const tier = (p: number) => p >= 34 ? ['КИШКИ НА ЗАБОРЕ', 'gut'] : p >= 25 ? ['Кровища хлещет йо майо', 'max'] : p >= 18 ? ['Кровавый бор', 't3'] : p >= 12 ? ['Мясная буча', 't2'] : ['Дикая Резня', ''];
    let html = '';
    if (g.burst) {
      const [name, cls] = tier(pace);
      html = `<div class="cb ${cls}"><b>${name}</b><span>×${g.combo}</span></div>`;
    } else if (g.lastCombo && g.time - g.lastCombo.t < 1.5) {
      html = `<div class="cb end"><b>×${g.lastCombo.n}</b><span>+${g.lastCombo.gold} 🪙</span></div>`;
    }
    const key = html.replace(/×\d+/, 'x');
    if (html !== el.innerHTML) {
      el.innerHTML = html;
      if (key !== this.comboKey) { el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); this.comboKey = key; }
    }
    el.hidden = !html;
  }

  private relicChips(): string {
    const g = this.game;
    const syn = SYNERGIES.filter((x) => g.hasSyn(x.id)).map((x) => `<span class="relic syn" ${tip(`<b>⚡ Синергия: ${x.name}</b><br>${x.desc}`)}>⚡</span>`).join('');
    return g.relics.map((id) => {
      const r = RELICS.find((x) => x.id === id)!;
      const pairs = SYNERGIES.filter((x) => x.a === id || x.b === id).map((x) => {
        const other = RELICS.find((y) => y.id === (x.a === id ? x.b : x.a))!;
        return `${g.hasSyn(x.id) ? '✅' : '◻'} + ${other.icon} ${other.name} → ${x.name}`;
      }).join('<br>');
      return `<span class="relic" ${tip(`<b>${r.name}</b><br>${r.desc}${pairs ? `<br><i>${pairs}</i>` : ''}`)}>${r.icon}</span>`;
    }).join('') + syn;
  }

  private renderSpells(): void {
    const g = this.game;
    const open = SPELLS.filter((sp) => g.spellLevel(sp.id));
    const rally = `<button class="spell rally ${this.rallyAll ? 'armed' : ''}" data-act="rally-all" ${tip('<b>Точка сбора</b><br>Клик по полю — туда идёт выбранный герой.<br>F, затем клик — весь отряд. Сбрасывается после волны.')}><span class="si">🚩</span><kbd>F</kbd></button>`;
    const locked = SPELLS.filter((sp) => !g.spellLevel(sp.id)).map((sp) => `<button class="spell locked" disabled ${tip(`<b>${sp.name}</b> 🔒<br>${sp.desc}<br><i>Откройте в Цитадели, ветка «Магия»</i>`)}><span class="si">${sp.icon}</span><kbd>${sp.key}</kbd><em>🔒</em></button>`).join('');
    $('#spell-bar').innerHTML = rally + (open.length ? open.map((sp) => {
      const left = g.spellCd[sp.id] ?? 0;
      const pct = Math.min(1, left / g.spellMaxCd(sp.id));
      return `<button class="spell ${left <= 0 ? 'ready' : ''} ${this.armed === sp.id ? 'armed' : ''}" data-act="spell" data-arg="${sp.id}" style="--p:${pct * 360}deg"
        ${tip(`<b>${sp.name}</b> · ур. ${g.spellLevel(sp.id)}<br>${sp.desc}<br><i>${sp.radius ? 'Клавиша ' + sp.key + ', затем клик по полю' : 'Клавиша ' + sp.key}</i>`)}>
        <span class="si">${sp.icon}</span><kbd>${sp.key}</kbd>${left > 0 ? `<em>${Math.ceil(left)}</em>` : ''}</button>`;
    }).join('') : '') + locked;
  }

  private renderBoss(): void {
    const boss = this.game.enemies.find((e) => e.active && e.def.boss);
    const el = $('#boss-bar');
    el.hidden = !boss;
    if (boss) el.innerHTML = `<span>${boss.def.icon} ${boss.def.name}${boss.castName ? ` <b class="bb-cast">⚠ ${boss.castName}</b>` : ''}</span><div class="bb"><i style="width:${(boss.hp / boss.maxHp) * 100}%"></i></div>`;
  }

  private renderEvent(): void {
    const g = this.game, ev = g.event!, info = EVENT_INFO[ev.id];
    $('#event-content').innerHTML = `
      <div class="ev-icon">${info.icon}</div>
      <div class="ev-title">${info.title}</div>
      <p class="ev-text">${info.text}</p>
      <div class="ev-opts">${g.eventOptions().map((o, i) => `<button class="ev-opt" data-act="event" data-arg="${i}" ${o.ok ? '' : 'disabled'}>
        <kbd>${i + 1}</kbd><span class="eo-label">${o.label}</span><span class="eo-desc">${o.desc}</span></button>`).join('')}</div>
      ${g.relics.length ? `<div class="ev-relics">Ваши реликвии: ${this.relicChips()}</div>` : ''}`;
  }

  // ---------- citadel (menu) ----------

  private renderMenu(): void {
    const g = this.game;
    const m = g.meta;
    $('#menu-stats').innerHTML = `
      <div class="chip gem" ${tip('Алмазы падают с каждого врага. Тратятся на улучшения Цитадели.')}>💎 <b>${m.shards}</b><span>алмазов</span></div>
      <div class="chip">🏆 <b>${m.bestWave}</b><span>рекорд волн</span></div>
      <div class="chip">⚔ <b>${m.runs}</b><span>забегов</span></div>`;
    const cont = g.savedRunWave();
    $('#menu-continue').innerHTML = cont ? `<button class="btn xl continue" data-act="continue">▶ Продолжить забег <small>волна ${cont}</small></button>` : '';
    const canPick = g.up('pick_start') > 0;
    const startId = canPick ? g.meta.startHero : undefined;
    $('#menu-heroes').innerHTML = HEROES.map((d) => {
      const locked = LOCKED_HEROES[d.id] && !g.up(LOCKED_HEROES[d.id]);
      return `
      <div class="hero-pick ${locked ? 'locked' : ''} ${startId === d.id ? 'chosen' : ''} ${canPick && !locked ? 'pickable' : ''}" style="--hc:${d.color ?? '#c9a45a'}" ${canPick && !locked ? `data-act="start-hero" data-arg="${d.id}"` : ''}
        ${tip(`<b>${d.name}</b> — ${d.title}<br>${d.desc}<br><i>${locked ? 'Откройте в Цитадели: ветка «Отряд»' : canPick ? 'Нажмите, чтобы начинать забег этим героем' : 'Первый герой забега случайный. «Право выбора» в Цитадели позволит выбирать'}</i>`)}>
        ${startId === d.id ? '<span class="start-badge">Начинает</span>' : ''}${locked ? '<span class="start-badge lock">🔒</span>' : ''}
        <img src="${heroIcon(d.id)}" alt="">
        <div class="name">${d.name}</div><div class="title">${d.title}</div>
        <div class="skills-mini">${SKILLS.filter((s) => s.hero === d.id && !s.evolves).map((s) => `<span ${tip(`<b>${s.name}</b>${s.active ? ' · умение' : ' · пассивка'}<br>${s.desc(1)}`)}>${s.icon}</span>`).join('')}</div>
      </div>`;
    }).join('');
    const canBuy = META_UPGRADES.filter((u) => g.nodeOpen(u.id) && g.up(u.id) < u.max && m.shards >= metaCost(u, g.up(u.id))).length;
    $('#cit-badge').textContent = canBuy ? `· ${canBuy}` : '';
    $('.citadel-btn').classList.toggle('has-new', canBuy > 0);
    // Skill-tree graph: each branch is a tidy tree (roots on top), nodes are
    // round icons joined by lines, details for the selected node live below.
    const kids = (req: string | undefined, br: string) => META_UPGRADES.filter((u) => u.branch === br && u.req === req);
    const pos: Record<string, { x: number; y: number }> = {};
    let col = 0;
    let maxDepth = 0;
    const lay = (id: string, br: string, d: number): number => {
      maxDepth = Math.max(maxDepth, d);
      const ch = kids(id, br);
      const x = ch.length ? ch.map((c) => lay(c.id, br, d + 1)).reduce((s, v, _, arr) => s + v / arr.length, 0) : col++;
      pos[id] = { x, y: d };
      return x;
    };
    const bands = BRANCHES.map((b, i) => {
      if (i) col += 0.7;
      const x0 = col;
      kids(undefined, b.id).forEach((r) => lay(r.id, b.id, 0));
      return { b, x0: x0 - 0.5, x1: col - 0.5 };
    });
    const W = col, H = maxDepth + 1;
    const px = (x: number) => ((x + 0.5) / W) * 100;
    const py = (y: number) => ((y + 0.5) / H) * 100;
    if (!this.citSel || !META_UPGRADES.some((u) => u.id === this.citSel)) this.citSel = META_UPGRADES[0].id;
    const lines = META_UPGRADES.filter((u) => u.req).map((u) => {
      const a = pos[u.req!], c = pos[u.id];
      const on = g.up(u.req!) > 0;
      const ym = (py(a.y) + py(c.y)) / 2;
      return `<path class="${on ? 'on' : ''} ${g.up(u.id) ? 'done' : ''}" d="M${px(a.x)} ${py(a.y)} L${px(a.x)} ${ym} L${px(c.x)} ${ym} L${px(c.x)} ${py(c.y)}"/>`;
    }).join('');
    const node = (u: (typeof META_UPGRADES)[number]) => {
      const lvl = g.up(u.id);
      const maxed = lvl >= u.max;
      const cost = metaCost(u, lvl);
      const open = g.nodeOpen(u.id);
      const state = maxed ? 'maxed' : !open ? 'closed' : m.shards >= cost ? 'afford' : 'poor';
      const p = pos[u.id];
      return `<button class="tn ${state} ${this.citSel === u.id ? 'sel' : ''}" style="left:${px(p.x)}%;top:${py(p.y)}%;--p:${lvl / u.max}" data-act="cit-sel" data-arg="${u.id}"
        ${tip(`<b>${u.name}</b> · ${lvl}/${u.max}<br>${maxed ? u.desc(lvl) : u.desc(lvl + 1)}${maxed ? '' : `<br>💎 ${cost}`}`)}>
        <span class="tn-ico">${open ? u.icon : '🔒'}</span><span class="tn-lvl">${lvl}/${u.max}</span></button>`;
    };
    const su = META_UPGRADES.find((u) => u.id === this.citSel)!;
    const sl = g.up(su.id), sMax = sl >= su.max, sCost = metaCost(su, sl), sOpen = g.nodeOpen(su.id);
    const sPar = su.req ? META_UPGRADES.find((x) => x.id === su.req)! : null;
    const btn = sMax ? `<span class="tp-done">✓ Изучено полностью</span>`
      : !sOpen ? `<span class="tp-lock">🔒 Сначала «${sPar!.name}»</span>`
      : `<button class="btn primary" data-act="meta" data-arg="${su.id}" ${m.shards >= sCost ? '' : 'disabled'}>Изучить · 💎 ${sCost}</button>`;
    $('#menu-citadel').innerHTML = `
      <div class="cit-head"><h2>🏰 Цитадель</h2><div class="cit-bal" ${tip('Алмазы падают с каждого врага и остаются после поражения')}>💎 <b>${m.shards}</b></div>
        <span class="cit-legend"><i class="lg afford"></i>доступно <i class="lg poor"></i>не хватает <i class="lg maxed"></i>изучено <i class="lg closed"></i>закрыто</span>
        <button class="btn" data-act="back-menu">← В меню</button></div>
      <div class="tgraph">
        ${bands.map(({ b, x0, x1 }) => `<div class="tband" style="left:${(x0 + 0.5) / W * 100}%;width:${(x1 - x0) / W * 100}%"><span>${b.icon} ${b.name}</span></div>`).join('')}
        <svg viewBox="0 0 100 100" preserveAspectRatio="none">${lines}</svg>
        ${META_UPGRADES.map(node).join('')}
      </div>
      <div class="tpanel"><span class="tp-ico">${sOpen ? su.icon : '🔒'}</span>
        <div class="tp-body"><div class="tp-name">${su.name} <small>${sl}/${su.max}</small></div>
          <div class="tp-desc">${sl ? `Сейчас: ${su.desc(sl)}` : ''}${sMax ? '' : `${sl ? ' · ' : ''}${sl ? 'Дальше' : 'Даст'}: <b>${su.desc(sl + 1)}</b>`}</div></div>
        ${btn}</div>`;
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

  /** What an offer would change for the selected hero (items stack, so it is a plain gain). */
  private compareFor(h: Hero | undefined, def: ItemDef, rarity: number): string {
    if (!h) return '';
    if (h.items.length >= MAX_ITEMS) return `<span class="cmp full">${h.def.name}: нет места — пойдёт в сумку</span>`;
    const t = new Hero(h.def, [...h.items, { uid: -1, def, rarity }]);
    t.level = h.level; t.skills = h.skills; t.metaPct = h.metaPct; t.bonusHp = h.bonusHp; t.bonusRegen = h.bonusRegen;
    t.recalc();
    const a = h.stats, b = t.stats;
    const parts: string[] = [];
    const pct = (x: number, y: number) => Math.round((y / Math.max(0.001, x) - 1) * 100);
    if (b.dmg > a.dmg + 0.01) parts.push(`⚔ +${pct(a.dmg, b.dmg)}%`);
    if (b.atkSpeed > a.atkSpeed + 0.001) parts.push(`⚡ +${pct(a.atkSpeed, b.atkSpeed)}%`);
    if (b.maxHp > a.maxHp) parts.push(`❤ +${pct(a.maxHp, b.maxHp)}%`);
    if (b.armor > a.armor) parts.push(`🛡 +${b.armor - a.armor}`);
    if (b.range > a.range && a.range >= 60) parts.push(`🎯 +${Math.round(b.range - a.range)}`);
    if (b.regen > a.regen) parts.push(`♻ +${Math.round(b.regen - a.regen)}`);
    if (b.lifesteal > a.lifesteal) parts.push(`🩸 +${Math.round((b.lifesteal - a.lifesteal) * 100)}%`);
    return parts.length ? `<span class="cmp">▲ ${h.def.name}: ${parts.join(' ')}</span>` : '';
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
      <div class="camp-title"><span>Лагерь</span><b>перед волной ${g.wave + 1}</b>${g.curse ? '<em class="curse">🏴 Проклятая волна: ×2 добыча</em>' : ''}${g.relics.length ? `<span class="relics">${this.relicChips()}</span>` : ''}</div>
      <div class="camp-res">
        <div class="res" ${tip('Здоровье замка')}>🏰 <div class="mini-bar"><i style="width:${(hp / max) * 100}%"></i></div><b>${hp}</b>/${max}</div>
        <div class="res" ${tip('Уровень отряда: сумма уровней героев. От него зависит, когда придёт новый герой.')}>⭐ <b>${g.squadLevel()}</b><small>ур. отряда</small></div>
        <div class="res gem" ${tip('Алмазы за этот забег. Сохранятся, даже если замок падёт.')}>💎 <b>${Math.floor(g.runGems)}</b></div>
        <div class="res gold">🪙 <b>${g.gold}</b></div>
        <div class="res" ${tip(`<b>${BIOMES[g.biome].name}</b><br>${BIOMES[g.biome].desc}`)}>${BIOMES[g.biome].icon}</div>
        <button class="icon-btn" id="btn-mute2" data-act="mute">${isMuted() ? '🔇' : '🔊'}</button>
        <button class="icon-btn" data-act="settings" ${tip('Настройки')}>⚙</button>
      </div>
    </div>`;

    // --- report from the last wave ---
    const report = g.wave > 0 ? `<div class="report">
      <span class="ok">✔ Волна ${g.wave} отбита</span>
      <span>☠ ${g.waveKills}</span>${g.comboBest >= 12 ? `<span class="news">🩸 лучшая резня ×${g.comboBest}</span>` : ''}<span>🪙 +${g.waveGold + g.lastWaveBonus}</span>
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
      const cmp = this.compareFor(sel, o.def, o.rarity);
      return `<div class="offer ${o.sale ? 'sale' : ''} ${o.locked ? 'locked' : ''} ${afford ? '' : 'poor'}" style="--rc:${rcol(o.rarity)}">
        <button class="offer-main" data-act="buy" data-arg="${i}" ${dis(afford)}>
          ${o.sale ? '<span class="badge">−40%</span>' : ''}
          <span class="icon">${o.def.icon}</span>
          <span class="name">${o.def.name}</span>
          <span class="rar">${RARITY[o.rarity].name}</span>
          <span class="desc">${describeMods(scaleMods(o.def.mods, RARITY[o.rarity].mult))}</span>${fx}${cmp}
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
      return `<span class="pv ${fresh ? 'new' : ''}" ${tip(`<b>${d.name}</b><br>Дроп: ${d.gold} 🪙 · ~${(d.gems * gemScale(nextWave)).toFixed(1)} 💎 с каждого${d.explodes ? '<br>Бежит к стене и взрывается' : ''}${nextWave >= 4 ? `<br><i>Иногда элита: ${Object.values(ELITES).map((x) => x.name.toLowerCase()).join(', ')} — двойной дроп</i>` : ''}${fresh ? '<br><i>Впервые в этой волне</i>' : ''}`)}>${d.icon}<b>${x.count}</b></span>`;
    }).join('');

    $('#shop-content').innerHTML = `${top}${report}
      <div class="camp-cols">
        <section class="col squad">
          <h3>Отряд <span>выберите героя — покупки и предметы идут ему</span></h3>
          <div class="scroll">${heroCards}${recruit}</div>
        </section>
        <section class="col market scroll">
          <h3>Лавка <span>для <b>${sel ? sel.def.name : '—'}</b> · 3 одинаковых = редкость выше</span>
            <button class="btn small" data-act="reroll" ${dis(g.gold >= g.rerollCost())} ${tip('Новые товары. Закреплённые 🔒 останутся.')}>🎲 Обновить ${coin(g.rerollCost())}</button></h3>
          <div class="offers">${offers}</div>
        </section>
        <section class="col stash scroll">
          <h3>Замок</h3>
          <div class="castle-acts">
            <button class="act" data-act="repair" ${dis(g.gold >= g.repairCost() && g.castleHp < g.castleMax())}><span>🧱</span><span>Ремонт стен<small>+${REPAIR_AMOUNT} HP</small></span>${coin(g.repairCost())}</button>
            ${g.towerLevel < TOWER_MAX_LEVEL
              ? `<button class="act" data-act="towers" ${dis(g.gold >= g.towerCost())}><span>🏹</span><span>Башни ур. ${g.towerLevel + 1}<small>урон ${g.towerDmg()} → ${g.towerDmg(g.towerLevel + 1)}</small></span>${coin(g.towerCost())}</button>`
              : '<div class="act done"><span>🏹</span><span>Башни<small>максимальный уровень</small></span></div>'}
          </div>
          <h3>Приказы <span>на одну волну</span></h3>
          <div class="orders">${orders}</div>
          <h3>Сумка <span>${g.bag.length} предм.</span></h3>
          <div class="bag">${bag}</div>
          ${forge ? `<h3>Кузница <span>улучшить надетое</span></h3><div class="forge">${forge}</div>` : ''}
          <button class="btn recipes-btn ${can.size ? 'ready' : ''}" data-act="recipes">📖 Книга рецептов${can.size ? ` · готово: ${can.size}` : ''}</button>
        </section>
      </div>
      ${this.recipesOpen ? `<div class="recipes-modal"><div class="event-shell"><div class="ev-title">📖 Книга рецептов</div>
        <p class="ev-text">Два предмета в сумке или на героях → новый, сильнее. Зелёные можно собрать прямо сейчас.</p>
        <div class="recipe-list">${RECIPES.map((r, i) => { const res = itemById(r.result); return `<button class="recipe-row ${can.has(i) ? 'ready' : ''}" data-act="craft" data-arg="${i}" ${dis(can.has(i))}>
          <span>${itemById(r.a).icon} ${itemById(r.a).name}</span><i>+</i><span>${itemById(r.b).icon} ${itemById(r.b).name}</span><i>=</i><b>${res.icon} ${res.name}</b><small>${itemText(res, 0)}</small></button>`; }).join('')}</div>
        <div class="set-done"><button class="btn" data-act="recipes">Закрыть</button></div></div></div>` : ''}
      <div class="camp-foot">
        <div class="preview"><span class="pv-label">Идут:</span>${preview}</div>
        <button class="btn primary xl" data-act="start-wave" ${g.event ? 'disabled' : ''}><span class="bw-main">⚔ В бой: волна ${nextWave}</span><small>${waveSize(nextWave)} врагов · клавиша Пробел</small></button>
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
