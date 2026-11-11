// Canvas rendering with a camera over a world bigger than the screen. Reads game state only.
import { enemySprite, heroSprite, tombSprite, drawSprite } from './sprites';
import {
  Game, Hero, Enemy, WORLD_W, WORLD_H, WALL_Y, GATE_X0, GATE_X1, TOWERS, TOWER_RANGE,
} from './game';

export const VIEW_W = 1280;
export const VIEW_H = 720;

export class Camera {
  x = 0; y = 0; zoom = 0.8;
  minZoom = Math.max(VIEW_W / WORLD_W, VIEW_H / WORLD_H);
  maxZoom = 1.8;

  /** Look at the castle (bottom of the map). */
  home(): void {
    this.zoom = 0.9;
    this.x = WORLD_W / 2 - VIEW_W / this.zoom / 2;
    this.y = WORLD_H - VIEW_H / this.zoom + 40;
    this.clamp();
  }
  clamp(): void {
    this.zoom = Math.min(this.maxZoom, Math.max(this.minZoom, this.zoom));
    const vw = VIEW_W / this.zoom, vh = VIEW_H / this.zoom;
    this.x = Math.min(WORLD_W - vw, Math.max(0, this.x));
    this.y = Math.min(WORLD_H - vh, Math.max(0, this.y));
  }
  pan(dx: number, dy: number): void { this.x += dx / this.zoom; this.y += dy / this.zoom; this.clamp(); }
  /** Zoom keeping the world point under screen point (sx, sy) in place. */
  zoomAt(factor: number, sx: number, sy: number): void {
    const wx = this.x + sx / this.zoom, wy = this.y + sy / this.zoom;
    this.zoom *= factor;
    this.clamp();
    this.x = wx - sx / this.zoom; this.y = wy - sy / this.zoom;
    this.clamp();
  }
  toWorld(sx: number, sy: number): { x: number; y: number } { return { x: this.x + sx / this.zoom, y: this.y + sy / this.zoom }; }
}

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private bg: HTMLCanvasElement;
  private blood: HTMLCanvasElement; // permanent (per wave) layer of blood stains
  private bloodCtx: CanvasRenderingContext2D;
  private fieldSeen = -1;
  private sorted: (Hero | Enemy)[] = [];
  selected: Hero | null = null;
  cam = new Camera();

  constructor(private canvas: HTMLCanvasElement) {
    canvas.width = VIEW_W;
    canvas.height = VIEW_H;
    this.ctx = canvas.getContext('2d')!;
    this.bg = this.buildBackground();
    this.blood = document.createElement('canvas');
    this.blood.width = WORLD_W; this.blood.height = WORLD_H;
    this.bloodCtx = this.blood.getContext('2d')!;
    this.cam.home();
  }

  private buildBackground(): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = WORLD_W; c.height = WORLD_H;
    const g = c.getContext('2d')!;
    g.fillStyle = '#3d5a2a';
    g.fillRect(0, 0, WORLD_W, WORLD_H);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 5000; i++) {
      g.fillStyle = rnd() > 0.5 ? 'rgba(90,130,60,0.5)' : 'rgba(40,70,30,0.5)';
      g.fillRect(rnd() * WORLD_W, rnd() * WORLD_H, 2 + rnd() * 3, 2 + rnd() * 3);
    }
    // Dirt road from the north down to the gate
    g.strokeStyle = 'rgba(130,100,62,0.7)';
    g.lineWidth = 120;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(760, -50);
    g.bezierCurveTo(600, 400, 1000, 750, 800, WALL_Y);
    g.stroke();
    g.strokeStyle = 'rgba(150,118,74,0.5)';
    g.lineWidth = 70;
    g.stroke();
    // Trampled defence zone in front of the walls
    const grad = g.createLinearGradient(0, WALL_Y, 0, WALL_Y - 380);
    grad.addColorStop(0, 'rgba(120,95,60,0.55)');
    grad.addColorStop(1, 'rgba(120,95,60,0)');
    g.fillStyle = grad;
    g.fillRect(0, WALL_Y - 380, WORLD_W, 380);
    // Trees and rocks in the wild part of the map
    for (let i = 0; i < 70; i++) {
      const x = rnd() * WORLD_W, y = rnd() * (WALL_Y - 450);
      if (Math.abs(x - 800) < 220) continue; // keep the road clear
      if (rnd() < 0.7) {
        g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.ellipse(x, y + 16, 16, 6, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#5b3d22'; g.fillRect(x - 3, y, 6, 16);
        g.fillStyle = rnd() < 0.5 ? '#2f5a26' : '#28502a';
        g.beginPath(); g.arc(x, y - 6, 15 + rnd() * 6, 0, Math.PI * 2); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.08)'; g.beginPath(); g.arc(x - 5, y - 11, 7, 0, Math.PI * 2); g.fill();
      } else {
        g.fillStyle = '#7d7a72'; g.beginPath(); g.ellipse(x, y, 11 + rnd() * 6, 7, 0, 0, Math.PI * 2); g.fill();
      }
    }
    this.drawCastle(g);
    return c;
  }

  private drawCastle(g: CanvasRenderingContext2D): void {
    // Courtyard
    g.fillStyle = '#5b5248';
    g.fillRect(0, WALL_Y + 22, WORLD_W, WORLD_H - WALL_Y);
    g.fillStyle = '#6e655a';
    for (let y = WALL_Y + 22; y < WORLD_H; y += 24) for (let x = ((y / 24) | 0) % 2 ? 0 : 12; x < WORLD_W; x += 24) g.fillRect(x + 1, y + 1, 22, 22);
    // Wall across the whole map
    g.fillStyle = '#8d8579';
    g.fillRect(0, WALL_Y, WORLD_W, 26);
    g.fillStyle = '#a69e90';
    for (let x = 0; x < WORLD_W; x += 28) g.fillRect(x, WALL_Y - 10, 16, 12);
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 2;
    g.strokeRect(-2, WALL_Y, WORLD_W + 4, 26);
    // Gate
    g.fillStyle = '#4a3220';
    g.fillRect(GATE_X0 + 110, WALL_Y - 4, GATE_X1 - GATE_X0 - 220, 30);
    g.strokeStyle = '#2b1d12'; g.lineWidth = 2;
    for (let x = GATE_X0 + 116; x < GATE_X1 - 110; x += 12) { g.beginPath(); g.moveTo(x, WALL_Y - 4); g.lineTo(x, WALL_Y + 26); g.stroke(); }
    // Keep
    const kx = 800, ky = WALL_Y + 95;
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(kx - 115, ky - 40, 240, 120);
    g.fillStyle = '#9a9184'; g.fillRect(kx - 120, ky - 50, 240, 110);
    g.fillStyle = '#b2a999'; for (let x = kx - 120; x < kx + 120; x += 24) g.fillRect(x, ky - 62, 14, 14);
    for (const tx of [kx - 120, kx + 120]) {
      g.fillStyle = '#8a8174'; g.beginPath(); g.arc(tx, ky - 20, 34, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#a03a2a';
      g.beginPath(); g.moveTo(tx - 36, ky - 30); g.lineTo(tx, ky - 95); g.lineTo(tx + 36, ky - 30); g.closePath(); g.fill();
    }
    g.fillStyle = '#a03a2a';
    g.beginPath(); g.moveTo(kx - 70, ky - 60); g.lineTo(kx, ky - 130); g.lineTo(kx + 70, ky - 60); g.closePath(); g.fill();
    g.fillStyle = '#2b2622'; g.fillRect(kx - 14, ky + 10, 28, 50);
    g.fillStyle = '#ffd23f'; g.fillRect(kx - 2, ky - 175, 3, 50);
    g.fillStyle = '#3f6fc4'; g.beginPath(); g.moveTo(kx + 1, ky - 175); g.lineTo(kx + 36, ky - 165); g.lineTo(kx + 1, ky - 155); g.fill();
  }

  draw(game: Game): void {
    const ctx = this.ctx;
    const cam = this.cam;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#15130f';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    // Screen shake (meteors, bosses, explosions): a few pixels of random offset.
    const sh = game.phase === 'battle' ? Math.min(12, game.shake) : 0;
    const ox = sh ? (Math.random() - 0.5) * sh * 2 : 0, oy = sh ? (Math.random() - 0.5) * sh * 2 : 0;
    ctx.setTransform(cam.zoom, 0, 0, cam.zoom, -cam.x * cam.zoom + ox, -cam.y * cam.zoom + oy);
    ctx.drawImage(this.bg, 0, 0);
    this.paintBlood(game);
    ctx.drawImage(this.blood, 0, 0);

    // Wall damage tint, plus a brief flash when the wall is hit
    const dmg = 1 - game.castleHp / game.castleMax();
    if (dmg > 0.01 || game.castleFlash > 0) {
      ctx.fillStyle = `rgba(160,30,20,${dmg * 0.35 + game.castleFlash * 1.2})`;
      ctx.fillRect(0, WALL_Y, WORLD_W, 26);
    }
    this.drawTowers(game);

    const sel = this.selected;
    if (sel && game.heroes.includes(sel) && sel.alive) {
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.setLineDash([6, 6]); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(sel.x, sel.y, sel.stats.range + 10, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    }

    // Meteor warnings under the units
    for (const f of game.effects) {
      if (!f.active || f.kind !== 'meteor') continue;
      const t = 1 - f.life / f.max;
      ctx.fillStyle = `rgba(255,90,20,${0.15 + t * 0.25})`;
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,200,80,0.9)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r * t, 0, Math.PI * 2); ctx.stroke();
      // the falling rock
      const fy = f.y - 260 * (1 - t);
      ctx.fillStyle = '#5a3a2a'; ctx.beginPath(); ctx.arc(f.x + 80 * (1 - t), fy, 14, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffb030'; ctx.beginPath(); ctx.arc(f.x + 80 * (1 - t) + 4, fy - 6, 7, 0, Math.PI * 2); ctx.fill();
    }

    // Units sorted by y so the ones in front overlap the ones behind.
    const units = this.sorted;
    units.length = 0;
    // Only units on screen (plus a margin) are drawn.
    const vx0 = cam.x - 60, vy0 = cam.y - 60, vx1 = cam.x + VIEW_W / cam.zoom + 60, vy1 = cam.y + VIEW_H / cam.zoom + 60;
    for (const e of game.enemies) if (e.active && e.x > vx0 && e.x < vx1 && e.y > vy0 && e.y < vy1) units.push(e);
    for (const h of game.heroes) units.push(h);
    units.sort((a, b) => a.y - b.y);

    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    for (const u of units) {
      if (u instanceof Hero) { if (!u.alive) continue; ctx.moveTo(u.x + 12, u.y + 13); ctx.ellipse(u.x, u.y + 13, 12, 4, 0, 0, Math.PI * 2); }
      else { const r = u.def.radius; ctx.moveTo(u.x + r, u.y + r * 1.1); ctx.ellipse(u.x, u.y + r * 1.1, r, r * 0.35, 0, 0, Math.PI * 2); }
    }
    ctx.fill();

    const t = game.time;
    for (const u of units) {
      if (u instanceof Hero) {
        const h = u;
        if (!h.alive) { drawSprite(ctx, tombSprite(), h.homeX, h.homeY, 1, 0, false); continue; }
        if (h === sel) {
          ctx.strokeStyle = '#ffe36e'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.ellipse(h.x, h.y + 13, 15, 5.5, 0, 0, Math.PI * 2); ctx.stroke();
        }
        if (h.tauntT > 0) {
          ctx.strokeStyle = 'rgba(255,90,60,0.8)'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(h.x, h.y - 4, 20, 0, Math.PI * 2); ctx.stroke();
        }
        const frame = h.moving ? Math.floor(t * 8 + h.homeY) & 1 : 0;
        this.drawHero(h, frame);
        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        ctx.fillRect(h.x - 16, h.y - 36, 32, 5);
        ctx.fillStyle = '#4fd36a';
        ctx.fillRect(h.x - 16, h.y - 36, 32 * Math.max(0, h.hp / h.stats.maxHp), 5);
        ctx.fillStyle = '#ffe36e';
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(String(h.level), h.x + 21, h.y - 30);
      } else {
        const e = u;
        const s = enemySprite(e.def.id);
        const frame = e.stun > 0 ? 0 : Math.floor(t * 7 + e.gen * 0.37 + e.x * 0.02) & 1;
        const lunge = e.anim > 0 ? Math.sin((e.anim / 0.2) * Math.PI) * 3 * e.face : 0;
        const bob = e.stun > 0 ? 0 : -Math.abs(Math.sin(t * 9 + e.gen * 1.7)) * (1 + e.def.radius * 0.06);
        drawSprite(ctx, s, e.x + lunge, e.y + bob, e.face, frame, e.flash > 0);
        if (e.slow > 0) {
          ctx.strokeStyle = 'rgba(140,210,255,0.85)'; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.ellipse(e.x, e.y + e.def.radius * 1.1, e.def.radius, e.def.radius * 0.35, 0, 0, Math.PI * 2); ctx.stroke();
        }
      }
    }

    // Status marks and HP bars only for affected enemies (cheap with hundreds of units)
    for (const e of units) {
      if (e instanceof Hero) continue;
      const s = enemySprite(e.def.id);
      const top = e.y - s.ay * 0.75;
      if (e.burnT > 0) { ctx.fillStyle = 'rgba(255,120,30,0.85)'; ctx.beginPath(); ctx.arc(e.x, e.y - 2, 2.5 + Math.random() * 1.5, 0, Math.PI * 2); ctx.fill(); }
      if (e.stun > 0) { ctx.fillStyle = '#ffe36e'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('✦', e.x, top - 4); }
      if (e.hp >= e.maxHp) continue;
      const w = Math.max(14, e.def.radius * 2 + 2);
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(e.x - w / 2, top, w, 3);
      ctx.fillStyle = '#e04a3a';
      ctx.fillRect(e.x - w / 2, top, w * Math.max(0, e.hp / e.maxHp), 3);
    }

    // Projectiles: arrows with a streak, fireballs with a glow, shaman orbs
    for (const p of game.projectiles) {
      if (!p.active) continue;
      const dx = p.tx - p.x, dy = p.ty - p.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const ux = dx / d, uy = dy / d;
      if (p.enemyShot) {
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 7);
        g.addColorStop(0, '#f1dcff'); g.addColorStop(0.5, 'rgba(199,139,255,0.9)'); g.addColorStop(1, 'rgba(120,60,200,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, 7, 0, Math.PI * 2); ctx.fill();
      } else if (p.splash > 0) {
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 11);
        g.addColorStop(0, '#fff3a0'); g.addColorStop(0.4, 'rgba(255,150,40,0.95)'); g.addColorStop(1, 'rgba(255,70,10,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, 11, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(255,140,40,0.5)'; ctx.lineWidth = 4; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(p.x - ux * 16, p.y - uy * 16); ctx.lineTo(p.x, p.y); ctx.stroke();
      } else {
        const len = p.crit ? 20 : 14;
        ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 3; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(p.x - ux * len * 1.8, p.y - uy * len * 1.8); ctx.lineTo(p.x - ux * len, p.y - uy * len); ctx.stroke();
        ctx.strokeStyle = p.color; ctx.lineWidth = p.crit ? 3 : 2;
        ctx.beginPath(); ctx.moveTo(p.x - ux * len, p.y - uy * len); ctx.lineTo(p.x, p.y); ctx.stroke();
        ctx.fillStyle = '#f4f0e0';
        ctx.beginPath(); ctx.arc(p.x, p.y, 1.8, 0, Math.PI * 2); ctx.fill();
      }
    }

    // Effects
    ctx.textAlign = 'center';
    for (const f of game.effects) {
      if (!f.active || f.kind === 'meteor') continue;
      const k = f.life / f.max;
      ctx.globalAlpha = Math.max(0, k);
      if (f.kind === 'ring') {
        ctx.strokeStyle = f.color; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (1.1 - k * 0.3), 0, Math.PI * 2); ctx.stroke();
      } else if (f.kind === 'puff') {
        ctx.fillStyle = f.color;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (1.5 - k * 0.5), 0, Math.PI * 2); ctx.fill();
      } else if (f.kind === 'heal') {
        ctx.strokeStyle = f.color; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (1.4 - k * 0.4), 0, Math.PI * 2); ctx.stroke();
      } else if (f.kind === 'corpse') {
        // The fallen goblin tips over and fades away.
        const tip = Math.min(1, (1 - k) * 4);
        ctx.save();
        ctx.translate(f.x, f.y);
        ctx.rotate(f.r * (Math.PI / 2) * tip);
        drawSprite(ctx, enemySprite(f.text), 0, 0, f.r, 0, false);
        ctx.restore();
      } else if (f.kind === 'bit') {
        ctx.fillStyle = f.color;
        ctx.fillRect(f.x - f.r / 2, f.y - f.r / 2, f.r, f.r);
      } else if (f.kind === 'bolt') {
        ctx.strokeStyle = '#cfeaff'; ctx.lineWidth = 2.5; ctx.shadowColor = '#7fc4ff'; ctx.shadowBlur = 8;
        ctx.beginPath(); ctx.moveTo(f.x, f.y);
        const n = 4;
        for (let i = 1; i < n; i++) {
          const t = i / n;
          ctx.lineTo(f.x + (f.x2 - f.x) * t + (Math.random() - 0.5) * 16, f.y + (f.y2 - f.y) * t + (Math.random() - 0.5) * 16);
        }
        ctx.lineTo(f.x2, f.y2); ctx.stroke(); ctx.shadowBlur = 0;
      } else if (f.kind === 'num') {
        ctx.fillStyle = f.color; ctx.font = 'bold 12px sans-serif';
        ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.lineWidth = 3;
        ctx.strokeText(f.text, f.x, f.y);
        ctx.fillText(f.text, f.x, f.y);
      } else if (f.kind === 'line') {
        ctx.strokeStyle = f.color; ctx.lineWidth = 4 * k + 1;
        ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.x2, f.y2); ctx.stroke();
      } else {
        ctx.fillStyle = f.color; ctx.font = 'bold 14px sans-serif';
        ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 3;
        ctx.strokeText(f.text, f.x, f.y);
        ctx.fillText(f.text, f.x, f.y);
      }
    }
    ctx.globalAlpha = 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  /**
   * Hero body plus its attack animation. p goes 0 → 1 over the attack:
   * Бран — замах и рубящий удар мечом с дугой, Ива — отдача лука и вспышка тетивы,
   * Оррин — выпад посохом и вспышка огня в навершии. Умения — подскок и кольцо цвета героя.
   */
  private drawHero(h: Hero, frame: number): void {
    const ctx = this.ctx;
    const sprite = heroSprite(h.def.id);
    const flash = h.flash > 0;
    if (h.anim <= 0) {
      // Idle breathing, or a bouncy step while walking.
      const now = performance.now() / 1000;
      if (h.moving) {
        const bounce = -Math.abs(Math.sin(now * 11 + h.homeX)) * 2.6;
        drawSprite(ctx, sprite, h.x, h.y + bounce, h.face, frame, flash);
      } else {
        const br = Math.sin(now * 2.6 + h.homeX * 0.1);
        ctx.save();
        ctx.translate(h.x, h.y + 12);
        ctx.scale(1 - br * 0.012, 1 + br * 0.02);
        drawSprite(ctx, sprite, 0, -12, h.face, frame, flash);
        ctx.restore();
      }
      return;
    }

    const p = 1 - h.anim / h.animMax;
    const f = h.face;
    const aim = Math.atan2(h.aimY - (h.y - 6), h.aimX - h.x);
    let dx = 0, dy = 0, tilt = 0, sx = 1, sy = 1;

    if (h.animCast) {
      // Skill cast: crouch, hop up, land; a ring in the hero's colour spreads from the feet.
      const hop = Math.sin(Math.min(1, p / 0.7) * Math.PI);
      dy = -hop * 7;
      sy = p < 0.15 ? 1 - p * 0.8 : 1 + hop * 0.06;
      sx = 2 - sy;
      ctx.save();
      ctx.globalAlpha = (1 - p) * 0.9;
      ctx.strokeStyle = h.def.color; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(h.x, h.y + 13, 10 + p * 26, 4 + p * 9, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    } else if (h.def.id === 'warden') {
      // Wind-up (lean back) → chop forward → recover.
      if (p < 0.35) { const k = p / 0.35; dx = -2.5 * f * k; tilt = -0.18 * f * k; }
      else if (p < 0.6) { const k = (p - 0.35) / 0.25; dx = f * (-2.5 + 10 * k); tilt = f * (-0.18 + 0.4 * k); sx = 1 + 0.08 * k; sy = 1 - 0.06 * k; }
      else { const k = (p - 0.6) / 0.4; dx = f * 7.5 * (1 - k); tilt = f * 0.22 * (1 - k); sx = 1 + 0.08 * (1 - k); sy = 1 - 0.06 * (1 - k); }
    } else if (h.def.id === 'ranger') {
      // Bow recoil: short kick back, then settle.
      const k = Math.sin(Math.min(1, p / 0.6) * Math.PI);
      dx = -3.5 * f * k; tilt = -0.1 * f * k; sx = 1 - 0.05 * k;
    } else if (h.def.id === 'pyro') {
      // Staff thrust forward with a small rise.
      const k = Math.sin(p * Math.PI);
      dx = 4 * f * k; dy = -2.5 * k; tilt = 0.12 * f * k; sy = 1 + 0.06 * k;
    } else {
      dx = Math.sin(p * Math.PI) * 5 * f;
    }

    // Draw the body around the feet so tilt and squash look grounded.
    ctx.save();
    ctx.translate(h.x + dx, h.y + 12 + dy);
    ctx.rotate(tilt);
    ctx.scale(sx, sy);
    drawSprite(ctx, sprite, 0, -12, h.face, frame, flash);
    ctx.restore();

    if (h.animCast) return;
    const bx = h.x + dx, by = h.y + dy;

    if (h.def.id === 'warden' && p > 0.3 && p < 0.85) {
      // Sword slash: a bright crescent sweeping across the aim direction.
      const k = (p - 0.3) / 0.55;
      const sweep = 2.2;
      const start = aim - (sweep / 2) * f;
      const end = start + sweep * f * Math.min(1, k * 1.6);
      ctx.save();
      ctx.globalAlpha = 1 - k;
      ctx.lineCap = 'round';
      for (const [r, w, c] of [[22, 6, 'rgba(255,255,255,0.35)'], [21, 3, '#ffffff'], [17, 1.5, '#ffd23f']] as const) {
        ctx.strokeStyle = c; ctx.lineWidth = w;
        ctx.beginPath(); ctx.arc(bx, by - 4, r, Math.min(start, end), Math.max(start, end)); ctx.stroke();
      }
      ctx.restore();
    } else if (h.def.id === 'ranger' && p < 0.45) {
      // Bowstring snap + muzzle flash toward the target.
      const k = p / 0.45;
      const ox = bx + 7.5 * f, oy = by - 2;
      ctx.save();
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = '#fffbe0'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(ox, oy - 10); ctx.lineTo(ox - 3 * f * (1 - k), oy); ctx.lineTo(ox, oy + 10); ctx.stroke();
      ctx.strokeStyle = 'rgba(200,255,190,0.9)'; ctx.lineWidth = 1.2;
      for (const a of [-0.35, 0, 0.35]) {
        const ang = aim + a, r0 = 6 + k * 6, r1 = 12 + k * 10;
        ctx.beginPath();
        ctx.moveTo(ox + Math.cos(ang) * r0, oy + Math.sin(ang) * r0);
        ctx.lineTo(ox + Math.cos(ang) * r1, oy + Math.sin(ang) * r1);
        ctx.stroke();
      }
      ctx.restore();
    } else if (h.def.id === 'pyro' && p < 0.8) {
      // Fire bursts out of the staff head.
      const k = p / 0.8;
      const ox = bx + 8.2 * f + 4 * f * Math.sin(p * Math.PI), oy = by - 18;
      ctx.save();
      ctx.globalAlpha = 1 - k;
      const g = ctx.createRadialGradient(ox, oy, 0, ox, oy, 6 + k * 10);
      g.addColorStop(0, 'rgba(255,240,140,1)');
      g.addColorStop(0.4, 'rgba(255,140,30,0.85)');
      g.addColorStop(1, 'rgba(255,80,10,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(ox, oy, 6 + k * 10, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffcf4a';
      for (let i = 0; i < 4; i++) {
        const ang = aim + (i - 1.5) * 0.5, r = 5 + k * 14;
        ctx.fillRect(ox + Math.cos(ang) * r - 1, oy + Math.sin(ang) * r - 1, 2, 2);
      }
      ctx.restore();
    }
  }

  /** Moves new stains from the game onto the blood layer; wipes it when the field was reset. */
  private paintBlood(game: Game): void {
    const g = this.bloodCtx;
    if (this.fieldSeen !== game.fieldId) { g.clearRect(0, 0, WORLD_W, WORLD_H); this.fieldSeen = game.fieldId; }
    for (const s of game.splats) {
      g.globalAlpha = 0.5;
      g.fillStyle = s.c;
      for (let i = 0; i < 4; i++) {
        const a = Math.random() * Math.PI * 2, d = Math.random() * s.r * 0.7;
        const r = s.r * (0.25 + Math.random() * 0.45);
        g.beginPath(); g.ellipse(s.x + Math.cos(a) * d, s.y + Math.sin(a) * d * 0.6, r, r * 0.62, 0, 0, Math.PI * 2); g.fill();
      }
    }
    g.globalAlpha = 1;
    game.splats.length = 0;
  }

  private drawTowers(game: Game): void {
    const ctx = this.ctx;
    for (const t of TOWERS) {
      if (game.phase === 'shop') {
        ctx.strokeStyle = 'rgba(232,226,200,0.18)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(t.x, t.y, TOWER_RANGE, Math.PI, Math.PI * 2); ctx.stroke();
      }
      ctx.fillStyle = '#9a9184';
      ctx.fillRect(t.x - 26, t.y - 58, 52, 70);
      ctx.fillStyle = '#7a7266';
      for (let i = 0; i < 4; i++) ctx.fillRect(t.x - 26 + i * 14, t.y - 68, 10, 12);
      ctx.fillStyle = '#2b2622';
      ctx.fillRect(t.x - 4, t.y - 44, 8, 14);
      ctx.fillStyle = '#ffe36e';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('★' + game.towerLevel, t.x, t.y + 2);
    }
  }

  /** Screen (mouse) position -> canvas pixels. */
  canvasPoint(ev: MouseEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return { x: ((ev.clientX - rect.left) / rect.width) * VIEW_W, y: ((ev.clientY - rect.top) / rect.height) * VIEW_H };
  }

  heroAt(game: Game, ev: MouseEvent): Hero | null {
    const p = this.canvasPoint(ev);
    const w = this.cam.toWorld(p.x, p.y);
    for (const h of game.heroes) {
      const hx = h.alive ? h.x : h.homeX, hy = h.alive ? h.y : h.homeY;
      if ((hx - w.x) ** 2 + (hy - 6 - w.y) ** 2 < 24 * 24) return h;
    }
    return null;
  }
}
