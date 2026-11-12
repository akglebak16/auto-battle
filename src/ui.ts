// DOM interface: battle HUD + hero panels, citadel menu, level-up cards,
// camp between waves (squad / market / stash), game over, tooltips, hotkeys.
import {
  Game, Hero, MAX_ITEMS, REPAIR_AMOUNT, EVENT_INFO, ELITES, TOWER_MAX_LEVEL, ORDERS, PRICE_MULT, type OwnedItem, type OrderId,
} from './game';
import {
  HEROES, RARITY, MAX_RARITY, RECIPES, ITEMS, ENEMIES, META_UPGRADES, BRANCHES, SPELLS, RELICS, SYNERGIES, BIOMES, LOCKED_HEROES, metaCost, describeMods, describeEffect, scaleMods,
  waveSize, wavePreview, gemScale, MERGE_COUNT, FINAL_WAVE, type ItemDef,
} from './data';
import { SKILLS, skillById } from './skills';
import type { Renderer } from './render';
import { heroIcon } from './sprites';
import { isMuted, setMuted, unlockAudio, play, setVolume, setMusicVolume, setMusicState } from './sound';
import { settings, saveSettings } from './settings';
import { L, lang, LANG_KEY, GAME_TITLE, type Lang } from './i18n';

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
    UI.applyStaticLang();
    this.applySettings();
    window.addEventListener('resize', () => this.applySettings());
    document.body.addEventListener('click', (ev) => { unlockAudio(); this.onClick(ev); });
    // The hero bar is rebuilt ~10 times a second, so a normal click (press and release) can land on
    // two different elements and get lost. Hero cards react on press instead.
    $('#hero-hud').addEventListener('pointerdown', (ev) => {
      if (ev.button !== 0) return;
      unlockAudio();
      const el = (ev.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
      if (!el) return;
      ev.preventDefault();
      if (el.dataset.act === 'select-hero') this.pickHero(Number(el.dataset.arg), ev.timeStamp);
      else if (el.dataset.act === 'reset-posts') { this.game.resetPosts(); this.commanding = false; this.refresh(); }
    });
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

  /** index.html is written in Russian; English texts sit next to them in data-en / data-tip-en. */
  private static applyStaticLang(): void {
    document.documentElement.lang = lang;
    document.title = GAME_TITLE;
    if (lang !== 'en') return;
    document.querySelectorAll<HTMLElement>('[data-en]').forEach((el) => { el.innerHTML = el.dataset.en!; });
    document.querySelectorAll<HTMLElement>('[data-tip-en]').forEach((el) => { el.dataset.tip = el.dataset.tipEn!; });
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
    if (ev.code === 'Escape' && this.settingsOpen) { this.settingsOpen = false; this.refresh(); return; }
    if (g.phase === 'shop' && !pick && !g.event && (ev.code === 'KeyR' || (ev.code === 'Escape' && this.recipesOpen))) {
      this.recipesOpen = ev.code === 'KeyR' ? !this.recipesOpen : false; this.tipEl.hidden = true; this.refresh(); return;
    }
    if (g.phase === 'battle') {
      const RU: Record<string, string> = { Q: 'Й', W: 'Ц', E: 'У', R: 'К' };
      const k = ev.key.toUpperCase();
      const sp = SPELLS.find((x) => x.key === k || RU[x.key] === k);
      if (k === 'F' || k === 'А') { this.rallyAll = !this.rallyAll; this.commanding = false; this.armed = null; this.renderer.aim = null; this.refresh(); return; }
      if (sp) { this.commanding = false; this.arm(sp.id); return; }
      if (ev.code === 'Escape') { this.armed = null; this.renderer.aim = null; this.commanding = false; this.rallyAll = false; this.refresh(); }
      if (ev.code === 'Space') { this.paused = !this.paused; this.refresh(); ev.preventDefault(); }
      if (n >= 0) this.setSpeed([1, 2, 4][n]);
    }
    if (g.phase === 'shop' && !pick && !g.event && !this.recipesOpen && !this.settingsOpen && (ev.code === 'Space' || ev.code === 'Enter')) {
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

  /**
   * Click on the canvas: cast the armed spell there, or command heroes.
   * Click a hero (or its card) to select it; then click the ground — it holds that spot (a flag),
   * or click an enemy — it attacks that one. The order ends the selection, so stray clicks never move anyone.
   */
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
    if (h) { this.pickHero(g.heroes.indexOf(h), ev.timeStamp); return; }
    if (g.phase !== 'battle') return;
    const p = this.renderer.canvasPoint(ev);
    const w = this.renderer.cam.toWorld(p.x, p.y);
    if (this.rallyAll) {
      g.rally(null, w.x, w.y);
      this.rallyAll = false;
    } else if (this.commanding) {
      const hero = g.heroes[this.selectedHero];
      const e = this.renderer.enemyAt(g, ev);
      if (hero && hero.alive) { if (e) g.focusEnemy(hero, e); else g.rally(hero, w.x, w.y); }
      this.commanding = false;
    } else return;
    this.refresh();
  }

  /** Hero chosen by its card or on the field: in battle it waits for an order. Double click: camera to it. */
  pickHero(i: number, t: number): void {
    const g = this.game, h = g.heroes[i];
    if (!h) return;
    const again = i === this.selectedHero && this.commanding;
    if (again && t - this.lastPick < 400) {
      this.renderer.cam.centerOn(h.alive ? h.x : h.homeX, h.alive ? h.y : h.homeY);
    } else {
      this.selectedHero = i;
      this.commanding = g.phase === 'battle' && !again && h.alive;
      if (this.commanding) { this.armed = null; this.renderer.aim = null; this.rallyAll = false; }
      play('pick');
    }
    this.lastPick = t;
    this.refresh();
  }

  /** A hero is selected in battle and the next click on the field is its order. */
  commanding = false;
  private lastPick = -1e9;

  /** Right click / Esc: drop the current selection or targeting. */
  cancelCommand(): void {
    if (!this.commanding && !this.armed && !this.rallyAll) return;
    this.commanding = false; this.armed = null; this.renderer.aim = null; this.rallyAll = false;
    this.refresh();
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
      ['move', g.phase === 'battle' && g.wave === 1, L('⚔ Герои дерутся сами. <b>Клик по герою</b> (или его карточке внизу), затем <b>по земле</b> — встанет там, <b>по врагу</b> — атакует его. <b>F</b> — весь отряд.', '⚔ Heroes fight on their own. <b>Click a hero</b> (or their card below), then <b>the ground</b> — they hold that spot, or <b>an enemy</b> — they attack it. <b>F</b> — the whole squad.')],
      ['speed', g.phase === 'battle' && g.waveTime > 14, L('⏩ <b>Пробел</b> — пауза, <b>1 / 2 / 3</b> — скорость боя.', '⏩ <b>Space</b> — pause, <b>1 / 2 / 3</b> — battle speed.')],
      ['gems', g.phase === 'battle' && g.runGems >= 3, L('💎 С врагов падают <b>алмазы</b>. Они остаются после поражения — на них растёт Цитадель.', '💎 Enemies drop <b>gems</b>. You keep them even after defeat — they grow your Citadel.')],
      ['cards', g.phase === 'shop' && !!g.pendingPick(), L('🃏 Новый уровень! Выберите <b>1 карточку из 3</b>. Две прокачанные до конца дают эволюцию.', '🃏 Level up! Pick <b>1 card of 3</b>. Two skills at max rank unlock an evolution.')],
      ['camp', g.phase === 'shop' && !g.pendingPick(), L('🛒 Лагерь: купите предметы и наденьте их на героев, отдайте приказы, почините стены. Потом — <b>«В бой»</b>.', '🛒 Camp: buy items and equip your heroes, give orders, repair the walls. Then — <b>“To battle”</b>.')],
      ['boss', boss, L('☠ Босс! Когда он <b>кастует</b>, под ним загорается красный круг — уводите героев оттуда.', '☠ Boss! When it <b>casts</b>, a red circle lights up beneath it — get your heroes out of there.')],
      ['spells', g.phase === 'battle' && g.wave >= 3, L('✨ Внизу справа — магия <b>Q W E R</b>. Новые заклинания открываются в Цитадели.', '✨ Bottom right — magic <b>Q W E R</b>. New spells unlock in the Citadel.')],
      ['citadel', g.phase === 'menu' && g.meta.runs > 0, L('🏰 Загляните в <b>Цитадель</b>: потратьте алмазы на новых героев, магию и стены.', '🏰 Visit the <b>Citadel</b>: spend gems on new heroes, magic and walls.')],
    ];
    const el = $('#tut');
    if (this.tutCur && !steps.some(([id, on]) => id === this.tutCur && on)) this.tutDone();
    if (this.tutCur) return;
    const next = steps.find(([id, on]) => on && !this.tutSeen.has(id));
    if (!next) { el.hidden = true; return; }
    this.tutCur = next[0];
    el.innerHTML = `<span>${next[2]}</span><button class="btn small" data-act="tut-ok">${L('Понятно', 'Got it')}</button>`;
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
    // The width counts too: on 5:4 / 4:3 a height-only scale would leave the camp ~900 css px of room, too little for its three columns.
    const hud = Math.min(1.5, Math.max(1, Math.min($('#stage').clientHeight / 720, $('#stage').clientWidth / 1000))) * settings.ui;
    $('#stage').style.setProperty('--hud', String(hud));
    saveSettings();
  }

  private renderSettings(): void {
    const row = (k: 'sfx' | 'music' | 'ui', label: string, min: number, max: number, step: number) =>
      `<label class="set-row"><span>${label}</span><input type="range" min="${min}" max="${max}" step="${step}" value="${settings[k]}" data-set="${k}"><output>${Math.round(settings[k] * 100)}%</output></label>`;
    const tog = (k: 'shake' | 'gore' | 'numbers' | 'fx', label: string) =>
      `<div class="set-sw ${settings[k] ? 'on' : ''}" data-act="set-toggle" data-arg="${k}" role="switch" aria-checked="${settings[k]}"><span>${label}</span><i></i></div>`;
    $('#settings-content').innerHTML = `
      <div class="ev-title">⚙ ${L('Настройки', 'Settings')}</div>
      ${this.langRow()}
      ${row('sfx', L('🔊 Звуки', '🔊 Sounds'), 0, 1, 0.05)}${row('music', L('🎵 Музыка', '🎵 Music'), 0, 1, 0.05)}${row('ui', L('🔍 Размер интерфейса', '🔍 Interface size'), 0.8, 1.25, 0.05)}
      ${tog('fx', L('Свет, погода, свечение', 'Lighting, weather, glow'))}${tog('shake', L('Тряска экрана', 'Screen shake'))}${tog('gore', L('Кровь', 'Blood'))}${tog('numbers', L('Числа урона и добычи', 'Damage and loot numbers'))}
      <div class="set-done"><button class="btn" data-act="settings">${L('Готово', 'Done')}</button></div>`;
  }

  /** Language switch: the choice is saved and the page reloads (texts are picked once at startup). */
  private langRow(): string {
    const b = (l: Lang, label: string) => `<button class="btn small ${lang === l ? 'primary' : ''}" data-act="${lang === l ? 'noop' : 'lang'}" data-arg="${l}">${label}</button>`;
    const warn = this.game.phase === 'battle' ? `<small>${L('Текущая волна начнётся заново из лагеря', 'The current wave restarts from camp')}</small>` : '';
    return `<div class="set-row set-lang"><span>🌐 ${L('Язык', 'Language')}</span><span class="lang-btns">${b('ru', 'Русский')}${b('en', 'English')}</span>${warn}</div>`;
  }

  selectHeroAt(ev: MouseEvent): void {
    const h = this.renderer.heroAt(this.game, ev);
    if (h) { this.selectedHero = this.game.heroes.indexOf(h); this.refresh(); }
  }

  private setSpeed(s: number): void { this.speed = s; this.refresh(); }
  private toggleMute(): void { setMuted(!isMuted()); this.refresh(); }

  private onClick(ev: MouseEvent): void {
    if ((ev.target as HTMLElement).closest('#hero-hud')) return; // handled on pointerdown
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
        if (confirm(L('Удалить все алмазы, улучшения Цитадели и рекорды? Это нельзя отменить.', 'Delete all gems, Citadel upgrades and records? This cannot be undone.'))) { g.resetProgress(); this.tutSeen.clear(); try { localStorage.removeItem('oplot.tut'); } catch { /* ignore */ } }
        break;
      case 'meta': g.buyUpgrade(arg); break;
      case 'lang': try { localStorage.setItem(LANG_KEY, arg); } catch { /* ignore */ } location.reload(); return;
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
      case 'noop': return;
      case 'to-citadel': this.citadelOpen = true; break;
      case 'back-menu': this.citadelOpen = false; break;
      case 'menu-citadel': g.toMenu(); this.citadelOpen = true; break;
      case 'settings': this.settingsOpen = !this.settingsOpen; if (this.settingsOpen && g.phase === 'battle') this.paused = true; break;
      case 'set-toggle': { const k = arg as 'shake' | 'gore' | 'numbers' | 'fx'; settings[k] = !settings[k]; this.applySettings(); break; }
      case 'start-hero': if (g.up('pick_start')) g.setStartHero(arg); break;
      case 'continue': g.continueRun(); this.selectedHero = 0; this.paused = false; this.renderer.cam.home(); break;
      case 'spell': this.arm(arg); return;
      case 'rally-all': this.rallyAll = !this.rallyAll; this.commanding = false; break;
    }
    ev.stopPropagation();
    (el as HTMLElement).blur();
    this.tipEl.hidden = true;
    this.refresh();
  }

  /** Cheap per-frame HUD update. */
  tick(): void {
    const g = this.game;
    if (++this.tutFrame % 15 === 0) {
      this.tutorial();
      setMusicState(g.phase, g.phase === 'battle' && g.enemies.some((e) => e.active && e.def.boss), g.combo);
    }
    if (g.phase === 'battle') this.renderCombo();
    if (g.phase === 'battle' && ++this.frame % 6 === 0) { this.renderHeroHud(); this.renderSpells(); this.renderBoss(); }
    const key = `${g.castleFlash > 0}|${g.wave}|${g.gold}|${Math.ceil(g.castleHp)}|${g.enemiesLeft()}|${g.phase}|${g.orders.size}`;
    if (key === this.last) return;
    this.last = key;
    const act = ORDERS.filter((o) => g.orders.has(o.id)).map((o) => o.icon).join(' ');
    this.hud.wave.innerHTML = `${L('Волна', 'Wave')} <b>${g.wave}</b><small>/${FINAL_WAVE}</small>${act ? ` <span class="orders-on">${act}</span>` : ''}`;
    this.hud.gold.textContent = String(g.gold);
    $('#hud-gems').textContent = String(Math.floor(g.runGems));
    const left = g.enemiesLeft();
    this.waveTotal = Math.max(this.waveTotal, left, 1);
    this.hud.progress.style.width = `${(1 - left / this.waveTotal) * 100}%`;
    this.hud.enemies.textContent = L(`осталось ${left}`, `${left} left`);
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
    if (g.phase !== 'battle') this.commanding = false;
    this.renderer.selected = this.commanding ? g.heroes[this.selectedHero] ?? null : null;
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
    setMusicState(g.phase, g.phase === 'battle' && g.enemies.some((e) => e.active && e.def.boss), g.combo);
    if (g.phase === 'shop' && !pick && g.event) this.renderEvent();
    if (g.phase !== 'battle') { this.armed = null; this.renderer.aim = null; $('#boss-bar').hidden = true; }
    $('#stage').classList.toggle('aiming', !!this.armed || this.rallyAll);
    $('#stage').classList.toggle('in-camp', g.phase === 'shop' && !pick);
    $('#stage').classList.toggle('in-cards', !!pick);
    if (g.phase !== 'shop') this.recipesOpen = false;
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
        return `<span class="cd ${left <= 0 ? 'ready' : ''}" style="--p:${pct * 360}deg" ${tip(`<b>${s.name}</b> · ${L('ранг', 'rank')} ${h.rank(s.id)}<br>${s.desc(Math.min(h.rank(s.id), s.maxRank))}`)}>${s.icon}${left > 0 ? `<em>${Math.ceil(left)}</em>` : ''}</span>`;
      }).join('');
      return `<div class="hh ${h.alive ? '' : 'dead'} ${i === this.selectedHero ? 'on' : ''} ${i === this.selectedHero && this.commanding ? 'cmd' : ''}" data-act="select-hero" data-arg="${i}">
        <img src="${heroIcon(h.def.id)}" alt="">
        <div class="hh-body">
          <div class="hh-name">${h.def.name}<span>${L('ур.', 'lv')} ${h.level}</span></div>
          <div class="hh-hp"><i style="width:${hpPct}%"></i><em>${h.alive ? `${Math.ceil(h.hp)}/${h.stats.maxHp}` : h.deadT > 0 ? L(`встанет через ${Math.ceil(h.deadT)} с`, `back in ${Math.ceil(h.deadT)} s`) : L('пал', 'fallen')}</em></div>
          <div class="hh-xp"><i style="width:${Math.min(100, (h.xp / h.xpToNext()) * 100)}%"></i></div>
          ${skills ? `<div class="hh-cds">${skills}</div>` : ''}
        </div>
      </div>`;
    }).join('')
      + (g.heroes.some((h) => h.rallied) ? `<button class="hh-reset" data-act="reset-posts" title="${L('Все герои — обратно на свои посты', 'All heroes back to their posts')}">↺<span>${L('на посты', 'to posts')}</span></button>` : '')
      + (this.commanding && g.heroes[this.selectedHero]
        ? `<div class="hh-hint"><b>${g.heroes[this.selectedHero].def.name}</b>: ${L('клик по земле — встать там, по врагу — атаковать его. <kbd>Esc</kbd> / ПКМ — отмена', 'click the ground — hold there, an enemy — attack it. <kbd>Esc</kbd> / right-click — cancel')}</div>`
        : this.rallyAll ? `<div class="hh-hint">${L('<b>Весь отряд</b>: клик по земле — все встанут там. <kbd>Esc</kbd> — отмена', '<b>Whole squad</b>: click the ground — everyone holds there. <kbd>Esc</kbd> — cancel')}</div>` : '');
  }

  private comboKey = '';
  /** Banner only while kills are pouring in fast (8+ in 2.5 s); the tier follows the current pace. */
  private renderCombo(): void {
    const g = this.game, el = $('#combo');
    const pace = g.killTimes.length;
    const tier = (p: number) => p >= 34 ? [L('КИШКИ НА ЗАБОРЕ', 'GUTS ON THE FENCE'), 'gut'] : p >= 25 ? [L('Кровища хлещет йо майо', 'Blood Gushing, Yo Mayo'), 'max'] : p >= 18 ? [L('Кровавый бор', 'Blood Forest'), 't3'] : p >= 12 ? [L('Мясная буча', 'Meat Brawl'), 't2'] : [L('Дикая Резня', 'Savage Slaughter'), ''];
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
    const syn = SYNERGIES.filter((x) => g.hasSyn(x.id)).map((x) => `<span class="relic syn" ${tip(`<b>⚡ ${L('Синергия', 'Synergy')}: ${x.name}</b><br>${x.desc}`)}>⚡</span>`).join('');
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
    const rally = `<button class="spell rally ${this.rallyAll ? 'armed' : ''}" data-act="rally-all" ${tip(L('<b>Точка сбора</b><br>F, затем клик по полю — туда встанет весь отряд.<br>Одного героя: клик по нему (или по карточке), затем по полю.<br>Точки держатся, пока не нажать «на посты».', '<b>Rally point</b><br>F, then click the field — the whole squad holds there.<br>One hero: click them (or their card), then the field.<br>Points hold until you press “to posts”.'))}><span class="si">🚩</span><kbd>F</kbd></button>`;
    const locked = SPELLS.filter((sp) => !g.spellLevel(sp.id)).map((sp) => `<button class="spell locked" disabled ${tip(`<b>${sp.name}</b> 🔒<br>${sp.desc}<br><i>${L('Откройте в Цитадели, ветка «Магия»', 'Unlock in the Citadel, Magic branch')}</i>`)}><span class="si">${sp.icon}</span><kbd>${sp.key}</kbd><em>🔒</em></button>`).join('');
    $('#spell-bar').innerHTML = rally + (open.length ? open.map((sp) => {
      const left = g.spellCd[sp.id] ?? 0;
      const pct = Math.min(1, left / g.spellMaxCd(sp.id));
      return `<button class="spell ${left <= 0 ? 'ready' : ''} ${this.armed === sp.id ? 'armed' : ''}" data-act="spell" data-arg="${sp.id}" style="--p:${pct * 360}deg"
        ${tip(`<b>${sp.name}</b> · ${L('ур.', 'lv')} ${g.spellLevel(sp.id)}<br>${sp.desc}<br><i>${sp.radius ? L(`Клавиша ${sp.key}, затем клик по полю`, `Key ${sp.key}, then click the field`) : L(`Клавиша ${sp.key}`, `Key ${sp.key}`)}</i>`)}>
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
      ${g.relics.length ? `<div class="ev-relics">${L('Ваши реликвии', 'Your relics')}: ${this.relicChips()}</div>` : ''}`;
  }

  // ---------- citadel (menu) ----------

  private renderMenu(): void {
    const g = this.game;
    const m = g.meta;
    $('#menu-stats').innerHTML = `
      <div class="chip gem" ${tip(L('Алмазы падают с каждого врага. Тратятся на улучшения Цитадели.', 'Every enemy drops gems. Spend them on Citadel upgrades.'))}>💎 <b>${m.shards}</b><span>${L('алмазов', 'gems')}</span></div>
      <div class="chip">🏆 <b>${m.bestWave}</b><span>${L('рекорд волн', 'best wave')}</span></div>
      <div class="chip">⚔ <b>${m.runs}</b><span>${L('забегов', m.runs === 1 ? 'run' : 'runs')}</span></div>`;
    const cont = g.savedRunWave();
    $('#menu-continue').innerHTML = cont ? `<button class="btn xl continue" data-act="continue">▶ ${L('Продолжить забег', 'Continue run')} <small>${L('волна', 'wave')} ${cont}</small></button>` : '';
    const canPick = g.up('pick_start') > 0;
    const startId = canPick ? g.meta.startHero : undefined;
    $('#menu-heroes').innerHTML = HEROES.map((d) => {
      const locked = LOCKED_HEROES[d.id] && !g.up(LOCKED_HEROES[d.id]);
      return `
      <div class="hero-pick ${locked ? 'locked' : ''} ${startId === d.id ? 'chosen' : ''} ${canPick && !locked ? 'pickable' : ''}" style="--hc:${d.color ?? '#c9a45a'}" ${canPick && !locked ? `data-act="start-hero" data-arg="${d.id}"` : ''}
        ${tip(`<b>${d.name}</b> — ${d.title}<br>${d.desc}<br><i>${locked ? L('Откройте в Цитадели: ветка «Отряд»', 'Unlock in the Citadel: Squad branch') : canPick ? L('Нажмите, чтобы начинать забег этим героем', 'Click to start runs with this hero') : L('Первый герой забега случайный. «Право выбора» в Цитадели позволит выбирать', 'The first hero of a run is random. “Right of Choice” in the Citadel lets you pick')}</i>`)}>
        ${startId === d.id ? `<span class="start-badge">${L('Начинает', 'Starts')}</span>` : ''}${locked ? '<span class="start-badge lock">🔒</span>' : ''}
        <img src="${heroIcon(d.id)}" alt="">
        <div class="name">${d.name}</div><div class="title">${d.title}</div>
        <div class="skills-mini">${SKILLS.filter((s) => s.hero === d.id && !s.evolves).map((s) => `<span ${tip(`<b>${s.name}</b>${s.active ? L(' · умение', ' · skill') : L(' · пассивка', ' · passive')}<br>${s.desc(1)}`)}>${s.icon}</span>`).join('')}</div>
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
    const btn = sMax ? `<span class="tp-done">✓ ${L('Изучено полностью', 'Fully learned')}</span>`
      : !sOpen ? `<span class="tp-lock">🔒 ${L('Сначала', 'First')} «${sPar!.name}»</span>`
      : `<button class="btn primary" data-act="meta" data-arg="${su.id}" ${m.shards >= sCost ? '' : 'disabled'}>${L('Изучить', 'Learn')} · 💎 ${sCost}</button>`;
    $('#menu-citadel').innerHTML = `
      <div class="cit-head"><h2>🏰 ${L('Цитадель', 'Citadel')}</h2><div class="cit-bal" ${tip(L('Алмазы падают с каждого врага и остаются после поражения', 'Every enemy drops gems, and you keep them after defeat'))}>💎 <b>${m.shards}</b></div>
        <span class="cit-legend"><i class="lg afford"></i>${L('доступно', 'affordable')} <i class="lg poor"></i>${L('не хватает', 'not enough')} <i class="lg maxed"></i>${L('изучено', 'learned')} <i class="lg closed"></i>${L('закрыто', 'locked')}</span>
        <button class="btn" data-act="back-menu">← ${L('В меню', 'Menu')}</button></div>
      <div class="tgraph">
        ${bands.map(({ b, x0, x1 }) => `<div class="tband" style="left:calc(${(x0 + 0.5) / W * 100}% - 14px);width:calc(${(x1 - x0) / W * 100}% + 28px)"><span>${b.icon} ${b.name}</span></div>`).join('')}
        <svg viewBox="0 0 100 100" preserveAspectRatio="none">${lines}</svg>
        ${META_UPGRADES.map(node).join('')}
      </div>
      <div class="tpanel"><span class="tp-ico">${sOpen ? su.icon : '🔒'}</span>
        <div class="tp-body"><div class="tp-name">${su.name} <small>${sl}/${su.max}</small></div>
          <div class="tp-desc">${sl ? `${L('Сейчас', 'Now')}: ${su.desc(sl)}` : ''}${sMax ? '' : `${sl ? ' · ' : ''}${sl ? L('Дальше', 'Next') : L('Даст', 'Gives')}: <b>${su.desc(sl + 1)}</b>`}</div></div>
        ${btn}</div>`;
  }

  // ---------- level-up cards ----------

  private renderCards(h: Hero): void {
    const cards = h.cards ?? [];
    $('#cards-title').innerHTML = `<img src="${heroIcon(h.def.id)}" alt="">
      <div><div class="ct-top">${L('Новый уровень!', 'Level up!')}</div><div class="ct-name">${h.def.name} · ${L('уровень', 'level')} ${h.level - h.pending + 1}</div></div>`;
    $('#cards-list').innerHTML = cards.map((id, k) => {
      const sk = skillById(id);
      const next = h.rank(id) + 1;
      const generic = sk.hero === '*';
      const evo = !!sk.evolves;
      const tag = evo ? L('Эволюция', 'Evolution') : generic ? L('Общее', 'General') : sk.active ? L('Умение', 'Skill') : L('Пассивка', 'Passive');
      const rar = evo ? 3 : generic ? 0 : next - 1;
      const pips = generic || evo ? '' : `<div class="pips">${Array.from({ length: sk.maxRank }, (_, i) => `<i class="${i < next - 1 ? 'on' : i === next - 1 ? 'next' : ''}"></i>`).join('')}</div>`;
      const sub = evo ? sk.evolves!.map((e) => skillById(e).name).join(' + ') : generic ? (next > 1 ? L(`взято ×${next - 1}`, `taken ×${next - 1}`) : '') : L(`ранг ${next} из ${sk.maxRank}`, `rank ${next} of ${sk.maxRank}`);
      return `<button class="skill-card ${evo ? 'evo' : ''}" style="--rc:${rcol(rar)}; --d:${k * 70}ms" data-act="card" data-arg="${id}">
        <span class="key">${k + 1}</span>
        <div class="tag">${tag}</div>
        <div class="icon">${sk.icon}</div>
        <div class="name">${sk.name}</div>
        ${pips}<div class="rank">${sub}</div>
        <div class="desc">${sk.desc(Math.min(next, sk.maxRank))}</div>
        ${next === 1 && !generic && !evo ? `<div class="new">${L('НОВОЕ', 'NEW')}</div>` : ''}
      </button>`;
    }).join('');
    const left = this.game.heroes.reduce((s, x) => s + x.pending, 0);
    $('#cards-left').textContent = `${L('Клавиши', 'Keys')} 1 · 2 · 3${left > 1 ? ` · ${L('ещё выборов', 'picks left')}: ${left - 1}` : ''}`;
  }

  /** Stat gain an offer would give the selected hero (items stack, so it is a plain gain). */
  private gainFor(h: Hero | undefined, def: ItemDef, rarity: number): string {
    if (!h) return '';
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
    return parts.join(' ');
  }

  // ---------- camp: squad / market / stash ----------

  private itemSlot(it: OwnedItem, act: string, hint: string): string {
    return `<span class="slot full" style="--rc:${rcol(it.rarity)}" data-act="${act}" data-arg="${it.uid}"
      ${tip(`<b style="color:${rcol(it.rarity)}">${RARITY[it.rarity].name} ${it.def.name}</b><br>${itemText(it.def, it.rarity)}<br><i>${hint}</i>`)}>${it.def.icon}</span>`;
  }

  /** Where the squad keeps its best copy of an item: "носит Бран" / "в сумке". */
  private owned(id: string): { item: OwnedItem; where: string } | null {
    const x = this.game.allItems().filter((y) => y.item.def.id === id).sort((p, q) => q.item.rarity - p.item.rarity)[0];
    return x ? { item: x.item, where: x.hero ? L(`носит ${x.hero.def.name}`, `worn by ${x.hero.def.name}`) : L('в сумке', 'in the bag') } : null;
  }

  /** Every recipe with what the squad has for it, sorted: ready, one missing, the rest. */
  private recipeStates() {
    const g = this.game;
    return RECIPES.map((r, i) => {
      const res = itemById(r.result);
      const ings = [r.a, r.b].map((id) => {
        const def = itemById(id);
        const have = this.owned(id);
        const shop = g.offers.findIndex((o) => o?.def.id === id);
        return { def, have, shop };
      });
      const missing = ings.filter((x) => !x.have).length;
      const rarity = missing ? 0 : Math.max(...ings.map((x) => x.have!.item.rarity));
      const all = g.allItems();
      const best = (id: string) => all.filter((y) => y.item.def.id === id).sort((p, q) => q.item.rarity - p.item.rarity)[0];
      const ba = best(r.a), bb = best(r.b);
      const who = !missing ? (ba?.hero ?? bb?.hero ?? null) : null;
      return { i, r, res, ings, missing, rarity, who };
    }).sort((a, b) => a.missing - b.missing || Number(b.ings.some((x) => !x.have && x.shop >= 0)) - Number(a.ings.some((x) => !x.have && x.shop >= 0)));
  }

  private renderRecipeBook(): string {
    const g = this.game;
    const states = this.recipeStates();
    const card = (s: ReturnType<UI['recipeStates']>[number]) => {
      const ing = (x: (typeof s.ings)[number]) => {
        const o = x.shop >= 0 ? g.offers[x.shop]! : null;
        const status = x.have
          ? `<em class="ok">✓ ${x.have.where}${x.have.item.rarity ? ` · <span style="color:${rcol(x.have.item.rarity)}">${RARITY[x.have.item.rarity].name.toLowerCase()}</span>` : ''}</em>`
          : o ? `<button class="mini buy" data-act="buy" data-arg="${x.shop}" ${g.gold >= o.price ? '' : 'disabled'} ${tip(`${L('Купить в лавке. Пойдёт', 'Buy from the shop. Goes')} ${this.game.heroes[this.selectedHero]?.items.length < MAX_ITEMS ? L('герою ', 'to ') + this.game.heroes[this.selectedHero].def.name : L('в сумку', 'into the bag')}`)}>${L('в лавке', 'in shop')} · ${coin(o.price)}</button>`
          : `<em class="no">${L('нет', 'none')}</em>`;
        return `<div class="rb-ing ${x.have ? 'have' : o ? 'shop' : 'miss'}" ${tip(`<b>${x.def.name}</b><br>${itemText(x.def, 0)}`)}><span class="rb-i">${x.def.icon}</span><span class="rb-n">${x.def.name}${status}</span></div>`;
      };
      const state = !s.missing ? 'ready' : s.missing === 1 ? 'near' : 'far';
      const foot = !s.missing
        ? `<button class="btn primary rb-go" data-act="craft" data-arg="${s.i}">⚒ ${L('Собрать', 'Craft')}${s.rarity ? ` · <span style="color:${rcol(s.rarity)}">${RARITY[s.rarity].name.toLowerCase()}</span>` : ''}</button><span class="rb-who">${s.who ? `${L('достанется', 'goes to')}: <b>${s.who.def.name}</b>` : L('ляжет в сумку', 'goes into the bag')}</span>`
        : `<span class="rb-need">${L('Не хватает', 'Missing')}: ${s.ings.filter((x) => !x.have).map((x) => x.def.name).join(L(' и ', ' and '))}</span>`;
      return `<div class="rb-card ${state}">
        <div class="rb-res" ${tip(`<b>${s.res.name}</b><br>${itemText(s.res, s.rarity)}`)}><span class="rb-big" style="--rc:${rcol(s.rarity)}">${s.res.icon}</span>
          <div><div class="rb-name">${s.res.name}</div><div class="rb-stats">${itemText(s.res, s.rarity)}</div></div></div>
        <div class="rb-ings">${ing(s.ings[0])}<i>+</i>${ing(s.ings[1])}</div>
        <div class="rb-foot">${foot}</div>
      </div>`;
    };
    const group = (title: string, list: typeof states) => list.length ? `<h4>${title} <span>${list.length}</span></h4><div class="rb-grid">${list.map(card).join('')}</div>` : '';
    return `<div class="recipes-modal" data-act="recipes"><div class="rb-shell" data-act="noop">
      <div class="rb-head"><div class="ev-title">📖 ${L('Книга рецептов', 'Recipe Book')}</div>
        <button class="icon-btn rb-x" data-act="recipes" ${tip(L('Закрыть (Esc)', 'Close (Esc)'))}>✕</button></div>
      <p class="rb-help">${L(`Два предмета → один предмет кузницы. Ингредиенты можно держать в сумке или на любых героях.
        Редкость результата — лучшая из двух. Результат остаётся у героя, который носил ингредиент.`, `Two items → one forged item. Ingredients can sit in the bag or on any hero.
        The result gets the better rarity of the two and stays with the hero who wore an ingredient.`)}</p>
      <div class="rb-body scroll">
        ${group(L('✅ Можно собрать', '✅ Ready to craft'), states.filter((s) => !s.missing))}
        ${group(L('Не хватает одного', 'One missing'), states.filter((s) => s.missing === 1))}
        ${group(L('Остальные', 'The rest'), states.filter((s) => s.missing === 2))}
      </div>
      <div class="rb-legend"><span class="lg-have">✓ ${L('есть', 'owned')}</span><span class="lg-shop">${L('продаётся в лавке', 'sold in the shop')}</span><span class="lg-miss">${L('нет', 'none')}</span><span>${L('Клавиша', 'Key')} <kbd>R</kbd> — ${L('открыть / закрыть', 'open / close')}</span></div>
    </div></div>`;
  }

  private renderShop(): void {
    const g = this.game;
    if (this.selectedHero >= g.heroes.length) this.selectedHero = 0;
    const sel = g.heroes[this.selectedHero];
    const selFull = !!sel && sel.items.length >= MAX_ITEMS;
    const dis = (cond: boolean) => (cond ? '' : 'disabled');

    // --- top bar ---
    const hp = Math.ceil(g.castleHp), max = g.castleMax();
    const biome = BIOMES[g.biome];
    const top = `<div class="camp-top">
      <div class="camp-title"><span>${L('Лагерь', 'Camp')}</span><b>${L('перед волной', 'before wave')} ${g.wave + 1}</b>${g.curse ? `<em class="curse">🏴 ${L('Проклятая волна: ×2 добыча', 'Cursed wave: ×2 loot')}</em>` : ''}${g.relics.length ? `<span class="relics">${this.relicChips()}</span>` : ''}</div>
      <div class="camp-res">
        <div class="res biome" ${tip(`<b>${biome.name}</b><br>${biome.desc}`)}><span class="b-ico">${biome.icon}</span><small>${biome.name}</small></div>
        <div class="res" ${tip(L('Здоровье замка', 'Castle health'))}>🏰 <div class="mini-bar ${hp / max < 0.3 ? 'low' : hp / max < 0.6 ? 'mid' : ''}"><i style="width:${(hp / max) * 100}%"></i></div><b>${hp}</b><small>/${max}</small></div>
        <div class="res" ${tip(L('Уровень отряда: сумма уровней героев. От него зависит, когда придёт новый герой.', 'Squad level: the sum of hero levels. It decides when a new hero joins.'))}>⭐ <b>${g.squadLevel()}</b><small>${L('ур. отряда', 'squad lv')}</small></div>
        <div class="res gem" ${tip(L('Алмазы за этот забег. Сохранятся, даже если замок падёт.', 'Gems from this run. You keep them even if the castle falls.'))}>💎 <b>${Math.floor(g.runGems)}</b></div>
        <div class="res gold" ${tip(L('Золото', 'Gold'))}>🪙 <b>${g.gold}</b></div>
        <button class="icon-btn" data-act="mute" ${tip(L('Звук (M)', 'Sound (M)'))}>${isMuted() ? '🔇' : '🔊'}</button>
        <button class="icon-btn" data-act="settings" ${tip(L('Настройки', 'Settings'))}>⚙</button>
      </div>
    </div>`;

    // --- report from the last wave (after «Продолжить забег» the wave stats are unknown, so only news) ---
    const fresh = g.wave > 0 && g.lastWaveBonus > 0;
    const report = fresh || g.news.length ? `<div class="report">
      ${fresh ? `<span class="ok">✔ ${L(`Волна ${g.wave} отбита`, `Wave ${g.wave} repelled`)}</span>
      <span ${tip(L('Убито врагов', 'Enemies killed'))}>☠ ${g.waveKills}</span>${g.comboBest >= 12 ? `<span class="news">🩸 ${L('лучшая резня', 'best slaughter')} ×${g.comboBest}</span>` : ''}<span ${tip(L(`Добыча ${g.waveGold} + награда за волну ${g.lastWaveBonus}`, `Loot ${g.waveGold} + wave reward ${g.lastWaveBonus}`))}>🪙 +${g.waveGold + g.lastWaveBonus}</span>
      ${g.waveCastleDmg > 0 ? `<span class="bad">🏰 −${Math.round(g.waveCastleDmg)}</span>` : `<span class="ok">🏰 ${L('цел', 'intact')}</span>`}
      ${g.waveHeroDeaths ? `<span class="bad">💀 ${L('пало', 'fallen')} ${g.waveHeroDeaths}</span>` : ''}` : ''}
      ${g.news.map((n) => `<span class="news">${esc(n)}</span>`).join('')}
    </div>` : '';

    // --- squad column ---
    const heroCards = g.heroes.map((h, i) => {
      const s = h.stats;
      const on = i === this.selectedHero;
      const slots = Array.from({ length: MAX_ITEMS }, (_, k) => {
        const it = h.items[k];
        return it ? this.itemSlot(it, 'unequip', L('Клик — снять в сумку', 'Click — move to the bag')) : `<span class="slot" ${tip(L('Пустая ячейка. Купите предмет, пока выбран этот герой, или наденьте из сумки.', 'Empty slot. Buy an item while this hero is selected, or equip one from the bag.'))}></span>`;
      }).join('');
      const skills = Object.entries(h.skills).map(([id, r]) => {
        const sk = skillById(id);
        const rar = sk.evolves ? 3 : sk.hero === '*' ? 0 : r - 1;
        return `<span class="skill" style="--rc:${rcol(rar)}" ${tip(`<b>${sk.name}</b> · ${L('ранг', 'rank')} ${r}<br>${sk.desc(Math.min(r, sk.maxRank))}`)}>${sk.icon}<sub>${r}</sub></span>`;
      }).join('');
      const stat = (ico: string, v: string, t: string) => `<span ${tip(t)}>${ico}<b>${v}</b></span>`;
      return `<div class="hero-card ${on ? 'on' : ''}" data-act="select-hero" data-arg="${i}">
        ${on ? `<span class="buyer-tag">🛒 ${L('покупки сюда', 'buying for')}</span>` : ''}
        <div class="hc-head"><img src="${heroIcon(h.def.id)}" alt="">
          <div class="hc-id"><div class="name">${h.def.name}<small>${h.def.title}</small></div>
            <div class="xp" ${tip(`${L('Опыт до ур.', 'XP to lv')} ${h.level + 1}: ${Math.floor(h.xp)} / ${h.xpToNext()}`)}><i style="width:${Math.min(100, (h.xp / h.xpToNext()) * 100)}%"></i></div></div>
          <div class="lvl" ${tip(`${L('Уровень', 'Level')} ${h.level}`)}>${h.level}</div></div>
        <div class="stats">${stat('❤', String(s.maxHp), L('Здоровье', 'Health'))}${stat('⚔', String(Math.round(s.dmg)), L('Урон', 'Damage'))}${stat('⚡', s.atkSpeed.toFixed(2), L('Атак в секунду', 'Attacks per second'))}${stat('🛡', String(s.armor), L('Броня', 'Armor'))}${stat('🎯', String(Math.round(s.range)), L('Дальность', 'Range'))}${s.splash ? stat('💥', String(Math.round(s.splash)), L('Радиус взрыва', 'Splash radius')) : ''}${s.lifesteal ? stat('🩸', Math.round(s.lifesteal * 100) + '%', L('Вампиризм', 'Lifesteal')) : ''}${s.regen ? stat('♻', String(s.regen), L('Регенерация в секунду', 'Regeneration per second')) : ''}</div>
        ${skills ? `<div class="skills">${skills}</div>` : ''}
        <div class="hc-foot">
          <div class="hc-slots"><small>${L('Предметы', 'Items')} ${h.items.length}/${MAX_ITEMS}</small><div class="slots">${slots}</div></div>
          <button class="btn small train" data-act="train" data-arg="${i}" ${dis(g.gold >= h.trainCost())} ${tip(L('Тренировка: +1 уровень и выбор навыка', 'Training: +1 level and a skill pick'))}>⬆ ${L('Уровень', 'Level')}<span>${coin(h.trainCost())}</span></button></div>
      </div>`;
    }).join('');
    const nextAt = g.nextRecruitAt();
    const recruit = nextAt === null ? '' : `<div class="hero-card locked">
      <div class="lock-ico">🔒</div><div><div class="name">${L('Новый герой', 'New hero')}</div>
      <div class="hint">${L('Придёт на уровне отряда', 'Joins at squad level')} <b>${nextAt}</b> (${L('сейчас', 'now')} ${g.squadLevel()})</div>
      <div class="mini-bar"><i style="width:${Math.min(100, (g.squadLevel() / nextAt) * 100)}%"></i></div></div></div>`;

    // --- market column ---
    const all = g.allItems();
    const offers = g.offers.map((o, i) => {
      if (!o) return `<div class="offer sold"><span>${L('Продано', 'Sold')}</span></div>`;
      const full = Math.round(o.def.cost * PRICE_MULT[o.rarity]);
      const fx = o.def.effect ? `<span class="fx">✦ ${describeEffect(o.def.effect, o.rarity)}</span>` : '';
      const afford = g.gold >= o.price;
      const gain = this.gainFor(sel, o.def, o.rarity);
      // Hints: merge progress (3 identical = next rarity) and recipe partners the squad already owns.
      const same = all.filter((x) => x.item.def.id === o.def.id && x.item.rarity === o.rarity).length;
      const merge = same && o.rarity < MAX_RARITY
        ? `<span class="tag merge ${same >= MERGE_COUNT - 1 ? 'hot' : ''}" ${tip(L(`У вас уже ${same} × «${RARITY[o.rarity].name} ${o.def.name}». ${MERGE_COUNT} одинаковых сливаются в один предмет редкости «${RARITY[o.rarity + 1].name}».`, `You already have ${same} × “${RARITY[o.rarity].name} ${o.def.name}”. ${MERGE_COUNT} identical ones merge into one ${RARITY[o.rarity + 1].name} item.`))}>⧉ ${L('есть', 'have')} ×${same}${same >= MERGE_COUNT - 1 ? ` → <b style="color:${rcol(o.rarity + 1)}">${RARITY[o.rarity + 1].name.toLowerCase()}</b>` : ''}</span>` : '';
      const recs = RECIPES.filter((r) => r.a === o.def.id || r.b === o.def.id).map((r) => {
        const partner = itemById(r.a === o.def.id ? r.b : r.a), res = itemById(r.result);
        const have = all.some((x) => x.item.def.id === partner.id);
        return { partner, res, have };
      });
      const rec = recs.length ? (() => {
        const best = recs.find((x) => x.have) ?? recs[0];
        return `<span class="tag rec ${best.have ? 'hot' : ''}" data-act="recipes" ${tip(recs.map((x) => `${x.have ? '✅' : '◻'} + ${x.partner.icon} ${x.partner.name} = ${x.res.icon} <b>${x.res.name}</b>`).join('<br>') + `<br><i>${L('Клик — открыть книгу рецептов', 'Click — open the recipe book')}</i>`)}>📖 ${best.have ? `+ ${best.partner.icon} ${L('у вас', 'owned')} = ${best.res.icon}` : `${L('рецепт', 'recipe')}: ${best.res.icon}`}</span>`;
      })() : '';
      return `<div class="offer ${o.sale ? 'sale' : ''} ${o.locked ? 'locked' : ''} ${afford ? '' : 'poor'}" style="--rc:${rcol(o.rarity)}">
        <button class="offer-main" data-act="buy" data-arg="${i}" ${dis(afford)}>
          <span class="of-top"><span class="icon">${o.def.icon}</span><span class="of-id"><span class="name">${o.def.name}</span><span class="rar">${RARITY[o.rarity].name}</span></span></span>
          <span class="desc">${describeMods(scaleMods(o.def.mods, RARITY[o.rarity].mult))}</span>${fx}
          ${gain ? `<span class="cmp" ${tip(L(`Изменение характеристик героя ${sel?.def.name}`, `Change to ${sel?.def.name}'s stats`))}>▲ ${gain}</span>` : ''}
          ${merge || rec ? `<span class="tags">${merge}${rec}</span>` : ''}
          <span class="price">${o.sale ? `<span class="badge">−40%</span><s>${full}</s>` : ''}${coin(o.price)}${afford ? '' : `<small>${L('не хватает', 'not enough')}</small>`}</span>
        </button>
        <button class="lock-btn ${o.locked ? 'on' : ''}" data-act="lock" data-arg="${i}" ${tip(o.locked ? L('<b>Закреплено</b><br>Клик — открепить', '<b>Pinned</b><br>Click — unpin') : L('<b>Закрепить</b><br>Товар останется после обновления лавки и до следующей волны', '<b>Pin</b><br>The item stays through rerolls and until the next wave'))}>${o.locked ? '🔒' : '📌'}</button>
      </div>`;
    }).join('');
    const buyer = sel ? `<span class="buyer" ${tip(L('Купленный предмет сразу надевается на этого героя. Выберите другого героя слева.', 'A bought item goes straight onto this hero. Pick another hero on the left.'))}>
      <img src="${heroIcon(sel.def.id)}" alt="">${sel.def.name}<small>${sel.items.length}/${MAX_ITEMS}</small></span>` : '';
    const fullNote = selFull ? `<div class="mk-note">🎒 ${L(`У героя ${sel!.def.name} заняты все ячейки: покупки пойдут <b>в сумку</b>. Выберите другого героя слева или снимите предмет кликом по ячейке.`, `${sel!.def.name} has no free slots: purchases go <b>into the bag</b>. Pick another hero on the left, or click a slot to take an item off.`)}</div>` : '';

    // --- right column: castle, orders, bag, recipes, forge ---
    const orders = ORDERS.map((o) => {
      const have = g.orders.has(o.id);
      return `<button class="order ${have ? 'on' : ''}" data-act="order" data-arg="${o.id}" ${dis(!have && g.gold >= g.orderCost(o.id))} ${tip(`<b>${o.name}</b><br>${o.desc}<br><i>${L('Действует одну волну', 'Lasts one wave')}</i>`)}>
        <span class="o-ico">${o.icon}</span><span class="o-name">${o.name}</span><span class="o-cost">${have ? L('✓ взят', '✓ taken') : coin(g.orderCost(o.id))}</span></button>`;
    }).join('');
    const repairOk = g.castleHp < g.castleMax();
    const castle = `<div class="castle-acts">
      <button class="act" data-act="repair" ${dis(g.gold >= g.repairCost() && repairOk)} ${tip(repairOk ? L(`Ремонт стен: +${REPAIR_AMOUNT} HP замку`, `Repair walls: +${REPAIR_AMOUNT} castle HP`) : L('Стены целы', 'The walls are intact'))}><span class="a-ico">🧱</span><span class="a-txt">${L('Ремонт', 'Repair')}<small>${repairOk ? `+${REPAIR_AMOUNT} HP` : L('стены целы', 'walls intact')}</small></span>${repairOk ? coin(g.repairCost()) : ''}</button>
      ${g.towerLevel < TOWER_MAX_LEVEL
        ? `<button class="act" data-act="towers" ${dis(g.gold >= g.towerCost())} ${tip(`${L('Башни ур.', 'Towers lv')} ${g.towerLevel} → ${g.towerLevel + 1}<br>${L('Урон', 'Damage')} ${g.towerDmg()} → ${g.towerDmg(g.towerLevel + 1)}`)}><span class="a-ico">🏹</span><span class="a-txt">${L('Башни', 'Towers')} ${g.towerLevel + 1}<small>${L('урон', 'dmg')} ${g.towerDmg()}→${g.towerDmg(g.towerLevel + 1)}</small></span>${coin(g.towerCost())}</button>`
        : `<div class="act done"><span class="a-ico">🏹</span><span class="a-txt">${L('Башни', 'Towers')}<small>${L('максимум', 'max')}</small></span></div>`}
    </div>`;
    const bag = g.bag.length
      ? g.bag.map((it) => {
        const canWear = !!sel && sel.items.length < MAX_ITEMS;
        const up = it.rarity < MAX_RARITY;
        return `<div class="bag-row">
          ${this.itemSlot(it, 'equip', canWear ? L(`Клик — надеть на ${sel!.def.name}`, `Click — equip on ${sel!.def.name}`) : L('У выбранного героя нет свободных ячеек', 'The selected hero has no free slots'))}
          <div class="bi-body"><div class="bi-name">${it.def.name} <small style="color:${rcol(it.rarity)}">${RARITY[it.rarity].name.toLowerCase()}</small></div>
          <div class="bag-acts">
            <button class="mini" data-act="equip" data-arg="${it.uid}" ${dis(canWear)} ${tip(canWear ? L(`Надеть на героя ${sel!.def.name}`, `Equip on ${sel!.def.name}`) : L(`У героя ${sel?.def.name ?? ''} нет свободных ячеек`, `${sel?.def.name ?? ''} has no free slots`))}>${L('Надеть', 'Equip')}</button>
            ${up ? `<button class="mini" data-act="upgrade" data-arg="${it.uid}" ${dis(g.gold >= g.upgradeCost(it))} ${tip(`${L('Улучшить', 'Upgrade')}: <span style="color:${rcol(it.rarity)}">${RARITY[it.rarity].name}</span> → <span style="color:${rcol(it.rarity + 1)}">${RARITY[it.rarity + 1].name}</span>`)}>⬆ ${coin(g.upgradeCost(it))}</button>` : ''}
            <button class="mini sell" data-act="sell" data-arg="${it.uid}" ${tip(L('Продать за половину цены', 'Sell for half price'))}>${L('Продать', 'Sell')} ${coin(g.sellValue(it))}</button>
          </div></div></div>`;
      }).join('')
      : `<div class="empty">${L('Пусто. Сюда попадают снятые предметы и покупки, которым не хватило ячеек.', 'Empty. Removed items and purchases with no free slot end up here.')}</div>`;
    const states = this.recipeStates();
    const ready = states.filter((s) => !s.missing);
    const near = states.filter((s) => s.missing === 1 && s.ings.some((x) => !x.have && x.shop >= 0)).length;
    const readyRows = ready.map((s) => `<button class="ready-row" data-act="craft" data-arg="${s.i}" ${tip(`<b>${s.res.name}</b><br>${itemText(s.res, s.rarity)}<br><i>${s.ings.map((x) => x.def.name + ' ' + x.have!.where).join(' + ')}</i>`)}>
        <span class="rr-f">${s.ings[0].def.icon}<i>+</i>${s.ings[1].def.icon}<i>→</i><b style="--rc:${rcol(s.rarity)}">${s.res.icon}</b></span><span class="rr-n">${s.res.name}</span><span class="rr-go">⚒ ${L('Собрать', 'Craft')}</span></button>`).join('');
    const worn = g.heroes.flatMap((h) => h.items.filter((it) => it.rarity < MAX_RARITY).map((it) => ({ h, it })));
    const forge = worn.map(({ h, it }) => `<button class="forge-row" data-act="upgrade" data-arg="${it.uid}" ${dis(g.gold >= g.upgradeCost(it))}
        ${tip(`<b>${it.def.name}</b> (${h.def.name})<br><span style="color:${rcol(it.rarity)}">${RARITY[it.rarity].name}</span> → <span style="color:${rcol(it.rarity + 1)}">${RARITY[it.rarity + 1].name}</span><br>${itemText(it.def, it.rarity + 1)}`)}>
        <span style="--rc:${rcol(it.rarity)}" class="fi">${it.def.icon}</span><span class="fr-n">${it.def.name}<small>${h.def.name} · <i style="color:${rcol(it.rarity)}">●</i>→<i style="color:${rcol(it.rarity + 1)}">●</i> ${RARITY[it.rarity + 1].name.toLowerCase()}</small></span>${coin(g.upgradeCost(it))}</button>`).join('');

    // --- footer: wave preview + start ---
    const nextWave = g.wave + 1;
    const prevTypes = new Set(wavePreview(nextWave - 1).map((x) => x.type));
    const preview = wavePreview(nextWave).map((x) => {
      const d = ENEMIES[x.type];
      const isNew = nextWave > 1 && !prevTypes.has(x.type);
      return `<span class="pv ${isNew ? 'new' : ''}" ${tip(`<b>${d.name}</b><br>${L('Дроп', 'Drop')}: ${d.gold} 🪙 · ~${(d.gems * gemScale(nextWave)).toFixed(1)} 💎 ${L('с каждого', 'each')}${d.explodes ? `<br>${L('Бежит к стене и взрывается', 'Runs for the wall and explodes')}` : ''}${nextWave >= 4 ? `<br><i>${L('Иногда элита', 'Sometimes elite')}: ${Object.values(ELITES).map((x) => x.name.toLowerCase()).join(', ')} — ${L('двойной дроп', 'double drop')}</i>` : ''}${isNew ? `<br><i>${L('Впервые в этой волне', 'First appears this wave')}</i>` : ''}`)}>${d.icon}<b>${x.count}</b></span>`;
    }).join('');

    $('#shop-content').innerHTML = `${top}${report}
      <div class="camp-cols">
        <section class="col squad">
          <h3>${L('Отряд', 'Squad')} <span>${L('клик по герою — кому идут покупки', 'click a hero to buy for them')}</span></h3>
          <div class="scroll">${heroCards}${recruit}</div>
        </section>
        <section class="col market">
          <h3>${L('Лавка', 'Shop')} ${buyer}<span></span>
            <button class="btn small" data-act="reroll" ${dis(g.gold >= g.rerollCost())} ${tip(L('Новые товары. Закреплённые 📌 останутся.', 'New stock. Pinned 📌 items stay.'))}>🎲 ${L('Обновить', 'Reroll')} ${coin(g.rerollCost())}</button></h3>
          ${fullNote}
          <div class="scroll"><div class="offers">${offers}</div></div>
          <div class="mk-legend"><span>📌 ${L('закрепить товар', 'pin an item')}</span><span ${tip(L(`${MERGE_COUNT} одинаковых предмета одной редкости сами сливаются в один — редкостью выше`, `${MERGE_COUNT} identical items of one rarity merge into one of the next rarity`))}>⧉ ${MERGE_COUNT} ${L('одинаковых → редкость выше', 'identical → higher rarity')}</span><span data-act="recipes" ${tip(L('Клик — открыть книгу рецептов', 'Click — open the recipe book'))}>📖 ${L('ингредиент рецепта', 'recipe ingredient')}</span></div>
        </section>
        <section class="col stash"><div class="scroll">
          <div class="st-sec"><h3>${L('Замок', 'Castle')} <span>${L('и приказы на одну волну', 'and orders for one wave')}</span></h3>
            ${castle}
            <div class="orders">${orders}</div></div>
          <div class="st-sec"><h3>${L('Сумка', 'Bag')} <span>${g.bag.length ? L(`${g.bag.length} предм.`, `${g.bag.length} item${g.bag.length > 1 ? 's' : ''}`) : ''}</span></h3>
            <div class="bag">${bag}</div></div>
          <div class="st-sec"><h3>${L('Рецепты', 'Recipes')} <span>${ready.length ? `${L('готово', 'ready')}: ${ready.length}` : near ? `${L('ингредиент в лавке', 'ingredient in shop')}: ${near}` : ''}</span></h3>
            ${readyRows ? `<div class="ready-list">${readyRows}</div>` : ''}
            <button class="btn recipes-btn ${ready.length ? 'ready' : ''}" data-act="recipes">📖 ${L('Книга рецептов', 'Recipe Book')} <kbd>R</kbd></button></div>
          ${forge ? `<div class="st-sec"><h3>${L('Кузница', 'Forge')} <span>${L('улучшить надетое', 'upgrade equipped')}</span></h3><div class="forge">${forge}</div></div>` : ''}
        </div></section>
      </div>
      ${this.recipesOpen ? this.renderRecipeBook() : ''}
      <div class="camp-foot">
        <div class="preview"><span class="pv-label">${L('Идут', 'Incoming')}:</span>${preview}</div>
        <button class="btn primary xl" data-act="start-wave" ${g.event ? 'disabled' : ''}><span class="bw-main">⚔ ${L(`В бой: волна ${nextWave}`, `To battle: wave ${nextWave}`)}</span><small>${L(`${waveSize(nextWave)} врагов · клавиша Пробел`, `${waveSize(nextWave)} enemies · Space key`)}</small></button>
      </div>`;
  }

  private renderOver(): void {
    const g = this.game;
    const record = g.wave >= g.meta.bestWave;
    const title = document.querySelector('.over-title');
    if (title) { title.textContent = g.won ? L('Победа!', 'Victory!') : L('Замок пал', 'The castle has fallen'); title.classList.toggle('win', g.won); }
    const sub = g.won
      ? `<div class="over-sub">${L('🏆 Орда разбита! Оплот выстоял.', '🏆 The horde is broken! The gate held.')}${g.firstWin ? ` <b>${L('Первая победа: +600 💎', 'First victory: +600 💎')}</b>` : ` <b>${L('Победа: +300 💎', 'Victory: +300 💎')}</b>`}</div>`
      : `<div class="over-sub">${record ? L('🏆 Новый рекорд!', '🏆 New record!') : L(`Рекорд: ${g.meta.bestWave} волн`, `Record: wave ${g.meta.bestWave}`)}</div>`;
    $('#over-text').innerHTML = `
      ${sub}
      <div class="tiles">
        <div class="tile"><b>${g.wave}</b><span>${L('волна', 'wave')}</span></div>
        <div class="tile"><b>${g.kills}</b><span>${L('убито врагов', 'enemies slain')}</span></div>
        <div class="tile gem"><b>+${g.lastShards}</b><span>${L(`💎 алмазов (всего ${g.meta.shards})`, `💎 gems (total ${g.meta.shards})`)}</span></div>
      </div>
      <div class="over-heroes">${g.heroes.map((h: Hero) => `<div class="oh"><img src="${heroIcon(h.def.id)}" alt=""><b>${h.def.name}</b><span>${L('ур.', 'lv')} ${h.level} · ☠ ${h.kills}</span></div>`).join('')}</div>
      <p class="hint">${L('Потратьте алмазы в Цитадели — улучшения действуют во всех следующих забегах.', 'Spend gems in the Citadel — upgrades apply to every future run.')}</p>`;
  }
}
