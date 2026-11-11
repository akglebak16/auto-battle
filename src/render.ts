// Canvas rendering with a camera over a world bigger than the screen. Reads game state only.
import { settings } from './settings';
import { enemySprite, heroSprite, tombSprite, drawSprite } from './sprites';
import { artReady, drawUnit, drawFx, unitHeight, IMG } from './art';
import {
  Game, Hero, Enemy, ELITES, BLOOD, roadX, type River, WORLD_W, WORLD_H, WALL_Y, GATE_X0, GATE_X1, TOWERS, TOWER_RANGE, FIELD_TOP,
} from './game';

export const VIEW_W = 1280;
export const VIEW_H = 720;

export class Camera {
  x = 0; y = 0; zoom = 0.8;
  // The whole battlefield (full width, from FIELD_TOP down to the castle) fits the screen at min zoom.
  minZoom = Math.max(VIEW_W / WORLD_W, VIEW_H / (WORLD_H - FIELD_TOP));
  maxZoom = 1.8;

  /** Look at the castle (bottom of the map). */
  home(): void {
    this.zoom = this.minZoom;
    this.x = WORLD_W / 2 - VIEW_W / this.zoom / 2;
    this.y = WORLD_H - VIEW_H / this.zoom;
    this.clamp();
  }
  clamp(): void {
    this.zoom = Math.min(this.maxZoom, Math.max(this.minZoom, this.zoom));
    const vw = VIEW_W / this.zoom, vh = VIEW_H / this.zoom;
    this.x = Math.min(WORLD_W - vw, Math.max(0, this.x));
    this.y = Math.min(WORLD_H - vh, Math.max(FIELD_TOP, this.y));
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
  aim: { x: number; y: number; r: number; color: string } | null = null; // spell targeting circle
  cam = new Camera();

  constructor(private canvas: HTMLCanvasElement) {
    canvas.width = VIEW_W;
    canvas.height = VIEW_H;
    this.ctx = canvas.getContext('2d')!;
    this.bg = this.buildBackground('forest');
    this.blood = document.createElement('canvas');
    this.blood.width = WORLD_W; this.blood.height = WORLD_H;
    this.bloodCtx = this.blood.getContext('2d')!;
    this.cam.home();
  }

  private bgBiome = 'forest';

  /** Force the ground to be rebuilt (e.g. once the sprite sheets have loaded). */
  refreshArt(): void { this.bgBiome = ''; }

  /** Same river the game uses for pathing (rebuilt from the biome so the ground can be cached). */
  private riverOf(biome: string): River | null {
    const g = new Game({});
    (g as unknown as { setBiome(b: string): void }).setBiome(biome);
    return g.river;
  }

  /** Ground built from Tiny Swords tiles: grass, a sandy road, trees and bushes, a stone wall, castle and towers. */
  private buildTileBackground(biome: string): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = WORLD_W; c.height = WORLD_H;
    const g = c.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const tile = (sx: number, sy: number) => { const t = document.createElement('canvas'); t.width = t.height = 64; t.getContext('2d')!.drawImage(IMG.tilesFlat, sx, sy, 64, 64, 0, 0, 64, 64); return t; };
    const ground = biome === 'snow' ? 'saturate(0.1) brightness(2.2) hue-rotate(150deg)' : biome === 'swamp' ? 'hue-rotate(-25deg) saturate(0.75) brightness(0.62)' : 'none';
    // Grass
    g.filter = ground;
    g.fillStyle = g.createPattern(tile(64, 64), 'repeat')!;
    g.fillRect(0, 0, WORLD_W, WORLD_H);
    // Road: sand texture stroked along the old curve
    g.strokeStyle = g.createPattern(tile(384, 64), 'repeat')!;
    g.lineCap = 'round';
    g.lineWidth = 104;
    g.beginPath(); g.moveTo(760, -50); g.bezierCurveTo(600, 400, 1000, 750, 800, WALL_Y); g.stroke();
    g.filter = 'none';
    // Soft edge for the road
    g.strokeStyle = 'rgba(60,40,10,0.18)'; g.lineWidth = 112;
    g.globalCompositeOperation = 'destination-over'; g.stroke(); g.globalCompositeOperation = 'source-over';
    // River with bridges (or a frozen one on the snowy pass)
    const riv = this.riverOf(biome);
    if (riv) {
      const h = riv.y1 - riv.y0;
      if (riv.frozen) {
        g.fillStyle = '#cfe6f2'; g.fillRect(0, riv.y0, WORLD_W, h);
        g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 2;
        for (let i = 0; i < 40; i++) { const x = rnd() * WORLD_W, y = riv.y0 + rnd() * h; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 10 + rnd() * 20, y + (rnd() - 0.5) * 12); g.stroke(); }
      } else {
        const wt = document.createElement('canvas'); wt.width = wt.height = 64;
        const wg = wt.getContext('2d')!; wg.filter = biome === 'swamp' ? 'hue-rotate(40deg) saturate(0.6) brightness(0.7)' : 'none'; wg.drawImage(IMG.water, 0, 0);
        g.fillStyle = g.createPattern(wt, 'repeat')!; g.fillRect(0, riv.y0, WORLD_W, h);
        // light ripples
        g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 2;
        for (let i = 0; i < 50; i++) { const x = rnd() * WORLD_W, y = riv.y0 + 8 + rnd() * (h - 16); g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 8, y - 3, x + 16, y); g.stroke(); }
      }
      // banks
      g.fillStyle = 'rgba(40,30,15,0.45)'; g.fillRect(0, riv.y0 - 4, WORLD_W, 6); g.fillRect(0, riv.y1 - 2, WORLD_W, 6);
      g.fillStyle = 'rgba(255,255,255,0.5)';
      for (let x = 0; x < WORLD_W; x += 14) { g.fillRect(x + rnd() * 6, riv.y0 + 2, 6, 2); g.fillRect(x + rnd() * 6, riv.y1 - 4, 6, 2); }
      for (const bx of riv.bridges) {
        g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(bx - 36, riv.y0 - 20, 76, h + 44);
        g.drawImage(IMG.bridge, 0, 64, 64, 192, bx - 38, riv.y0 - 28, 76, h + 56);
      }
    }
    // Trampled zone in front of the walls
    const grad = g.createLinearGradient(0, WALL_Y, 0, WALL_Y - 300);
    grad.addColorStop(0, 'rgba(90,70,40,0.35)'); grad.addColorStop(1, 'rgba(90,70,40,0)');
    g.fillStyle = grad; g.fillRect(0, WALL_Y - 300, WORLD_W, 300);
    // Decorations and trees (away from the road), sorted so lower ones overlap upper ones
    const decoKeys = ['d01', 'd02', 'd03', 'd04', 'd05', 'd06', 'd07', 'd08', 'd09', 'd10', 'd11', 'd12', 'd13', 'd14', 'd15'];
    const items: { y: number; draw: () => void }[] = [];
    for (let i = 0; i < 70; i++) {
      const x = rnd() * WORLD_W, y = FIELD_TOP - 60 + rnd() * (WALL_Y - 160 - FIELD_TOP);
      if (Math.abs(x - roadX(y)) < 110) continue;
      if (riv && y > riv.y0 - 50 && y < riv.y1 + 30) continue;
      if (rnd() < 0.25 && (x < 260 || x > WORLD_W - 260 || y < FIELD_TOP + 160)) items.push({ y: y + 40, draw: () => g.drawImage(IMG.tree, 0, 0, 192, 192, x - 58, y - 90, 116, 116) });
      else { const k = decoKeys[Math.floor(rnd() * decoKeys.length)]; const im = IMG[k]; items.push({ y, draw: () => g.drawImage(im, x - im.width / 2, y - im.height / 2) }); }
    }
    items.sort((a, b) => a.y - b.y).forEach((it) => it.draw());
    if (biome === 'swamp') for (let i = 0; i < 14; i++) {
      const x = rnd() * WORLD_W, y = FIELD_TOP + rnd() * (WALL_Y - 300 - FIELD_TOP);
      if (Math.abs(x - 800) < 200) continue;
      g.fillStyle = 'rgba(40,70,60,0.75)'; g.beginPath(); g.ellipse(x, y, 30 + rnd() * 40, 12 + rnd() * 14, 0, 0, Math.PI * 2); g.fill();
    }
    if (biome === 'snow') { g.fillStyle = 'rgba(240,248,255,0.28)'; g.fillRect(0, 0, WORLD_W, WALL_Y); }
    // Courtyard and stone wall from the cliff tiles (made grey)
    const stone = document.createElement('canvas'); stone.width = stone.height = 64;
    const sg = stone.getContext('2d')!; sg.filter = 'saturate(0.15) brightness(0.95)'; sg.drawImage(IMG.tilesElev, 64, 64, 64, 64, 0, 0, 64, 64);
    const face = document.createElement('canvas'); face.width = 64; face.height = 64;
    const fg = face.getContext('2d')!; fg.filter = 'saturate(0.15) brightness(0.85)'; fg.drawImage(IMG.tilesElev, 64, 128, 64, 64, 0, 0, 64, 64);
    g.fillStyle = g.createPattern(stone, 'repeat')!;
    g.fillRect(0, WALL_Y + 22, WORLD_W, WORLD_H - WALL_Y);
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, WALL_Y + 22, WORLD_W, WORLD_H - WALL_Y);
    g.fillStyle = g.createPattern(face, 'repeat-x')!;
    g.save(); g.translate(0, WALL_Y - 20); g.fillRect(0, 0, WORLD_W, 48); g.restore();
    g.fillStyle = '#9a958c';
    for (let x = 0; x < WORLD_W; x += 28) { g.fillRect(x, WALL_Y - 30, 16, 12); g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x, WALL_Y - 20, 16, 2); g.fillStyle = '#9a958c'; }
    // Castle over the gate, towers on both sides
    g.drawImage(IMG.castle, 800 - 140, WORLD_H - 205, 280, 224);
    for (const t of TOWERS) g.drawImage(IMG.tower, t.x - 46, t.y - 150, 92, 184);
    return c;
  }

  private buildBackground(biome: string): HTMLCanvasElement {
    if (artReady) return this.buildTileBackground(biome);
    const P = {
      forest: { ground: '#3d5a2a', spots: ['rgba(90,130,60,0.5)', 'rgba(40,70,30,0.5)'], road: ['rgba(130,100,62,0.7)', 'rgba(150,118,74,0.5)'], leaves: ['#2f5a26', '#28502a'], zone: '120,95,60' },
      snow: { ground: '#cfd8e2', spots: ['rgba(255,255,255,0.7)', 'rgba(160,178,198,0.45)'], road: ['rgba(140,128,118,0.6)', 'rgba(170,160,150,0.5)'], leaves: ['#2e4d3a', '#3a5a46'], zone: '120,110,105' },
      swamp: { ground: '#2c3a24', spots: ['rgba(70,95,50,0.5)', 'rgba(30,45,35,0.6)'], road: ['rgba(80,70,45,0.7)', 'rgba(95,82,52,0.5)'], leaves: ['#3a4a22', '#2a3a1e'], zone: '70,60,40' },
    }[biome] ?? null;
    const pal = P!;
    const c = document.createElement('canvas');
    c.width = WORLD_W; c.height = WORLD_H;
    const g = c.getContext('2d')!;
    g.fillStyle = pal.ground;
    g.fillRect(0, 0, WORLD_W, WORLD_H);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 5000; i++) {
      g.fillStyle = rnd() > 0.5 ? pal.spots[0] : pal.spots[1];
      g.fillRect(rnd() * WORLD_W, rnd() * WORLD_H, 2 + rnd() * 3, 2 + rnd() * 3);
    }
    // Dirt road from the north down to the gate
    g.strokeStyle = pal.road[0];
    g.lineWidth = 120;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(760, -50);
    g.bezierCurveTo(600, 400, 1000, 750, 800, WALL_Y);
    g.stroke();
    g.strokeStyle = pal.road[1];
    g.lineWidth = 70;
    g.stroke();
    // Trampled defence zone in front of the walls
    const grad = g.createLinearGradient(0, WALL_Y, 0, WALL_Y - 380);
    grad.addColorStop(0, `rgba(${pal.zone},0.55)`);
    grad.addColorStop(1, `rgba(${pal.zone},0)`);
    g.fillStyle = grad;
    g.fillRect(0, WALL_Y - 380, WORLD_W, 380);
    // Trees and rocks in the wild part of the map
    for (let i = 0; i < 70; i++) {
      const x = rnd() * WORLD_W, y = FIELD_TOP - 40 + rnd() * (WALL_Y - 420 - FIELD_TOP);
      if (Math.abs(x - 800) < 220) continue; // keep the road clear
      if (rnd() < 0.7) {
        g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.ellipse(x, y + 16, 16, 6, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#5b3d22'; g.fillRect(x - 3, y, 6, 16);
        g.fillStyle = rnd() < 0.5 ? pal.leaves[0] : pal.leaves[1];
        if (biome === 'snow') {
          // Fir tree with snow on top
          g.beginPath(); g.moveTo(x, y - 34); g.lineTo(x + 16, y + 2); g.lineTo(x - 16, y + 2); g.closePath(); g.fill();
          g.fillStyle = '#f4f8fc'; g.beginPath(); g.moveTo(x, y - 34); g.lineTo(x + 7, y - 18); g.lineTo(x - 7, y - 18); g.closePath(); g.fill();
        } else {
          g.beginPath(); g.arc(x, y - 6, 15 + rnd() * 6, 0, Math.PI * 2); g.fill();
        }
        g.fillStyle = 'rgba(255,255,255,0.08)'; g.beginPath(); g.arc(x - 5, y - 11, 7, 0, Math.PI * 2); g.fill();
      } else {
        g.fillStyle = '#7d7a72'; g.beginPath(); g.ellipse(x, y, 11 + rnd() * 6, 7, 0, 0, Math.PI * 2); g.fill();
      }
    }
    if (biome === 'swamp') {
      // Murky pools
      for (let i = 0; i < 18; i++) {
        const x = rnd() * WORLD_W, y = FIELD_TOP + rnd() * (WALL_Y - 300 - FIELD_TOP);
        if (Math.abs(x - 800) < 200) continue;
        g.fillStyle = 'rgba(40,70,60,0.75)'; g.beginPath(); g.ellipse(x, y, 30 + rnd() * 40, 12 + rnd() * 14, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = 'rgba(160,200,150,0.15)'; g.beginPath(); g.ellipse(x - 8, y - 3, 14, 4, 0, 0, Math.PI * 2); g.fill();
      }
    }
    this.drawCastle(g);
    // Colour grade baked into the ground (cheap): cool snow, sickly swamp, warm forest.
    g.globalCompositeOperation = 'soft-light';
    g.fillStyle = biome === 'snow' ? 'rgba(150,190,255,0.35)' : biome === 'swamp' ? 'rgba(110,150,80,0.35)' : 'rgba(255,200,130,0.3)';
    g.fillRect(0, 0, WORLD_W, WORLD_H);
    g.globalCompositeOperation = 'source-over';
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
    // Keep: drawn at 60% scale just behind the wall so it doesn't eat the screen.
    g.save(); g.translate(800, WALL_Y + 58); g.scale(0.6, 0.6);
    const kx = 0, ky = 0;
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
    g.restore();
  }

  draw(game: Game): void {
    const ctx = this.ctx;
    const cam = this.cam;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#15130f';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    // Screen shake (meteors, bosses, explosions): a few pixels of random offset.
    if (game.biome !== this.bgBiome) { this.bgBiome = game.biome; this.bg = this.buildBackground(game.biome); }
    const sh = game.phase === 'battle' && settings.shake ? Math.min(12, game.shake) : 0;
    const ox = sh ? (Math.random() - 0.5) * sh * 2 : 0, oy = sh ? (Math.random() - 0.5) * sh * 2 : 0;
    ctx.setTransform(cam.zoom, 0, 0, cam.zoom, -cam.x * cam.zoom + ox, -cam.y * cam.zoom + oy);
    ctx.drawImage(this.bg, 0, 0);
    if (settings.gore) this.paintBlood(game); else game.splats.length = 0;
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

    if (this.aim) {
      const a = this.aim;
      ctx.fillStyle = a.color + '22'; ctx.strokeStyle = a.color; ctx.lineWidth = 2; ctx.setLineDash([8, 6]);
      ctx.beginPath(); ctx.arc(a.x, a.y, a.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.setLineDash([]);
    }
    // Rally flags
    if (game.phase === 'battle') for (const h of game.heroes) {
      if (!h.rallied || !h.alive) continue;
      ctx.strokeStyle = '#5a3b20'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(h.homeX, h.homeY + 12); ctx.lineTo(h.homeX, h.homeY - 22); ctx.stroke();
      ctx.fillStyle = h.def.color; ctx.beginPath(); ctx.moveTo(h.homeX, h.homeY - 22); ctx.lineTo(h.homeX + 16, h.homeY - 16 + Math.sin(game.time * 6) * 2); ctx.lineTo(h.homeX, h.homeY - 10); ctx.fill();
    }
    // Player watchtowers (spell): a small tower with an archer on top
    for (const tr of game.turrets) {
      if (artReady) {
        ctx.drawImage(IMG.tower, tr.x - 26, tr.y - 92, 52, 104);
        drawUnit(ctx, 'ranger', tr.anim > 0 ? 'atk' : 'idle', tr.anim > 0 ? 1 - tr.anim / 0.4 : game.time, tr.anim > 0, tr.x, tr.y - 70, tr.face, 0.75);
      } else { ctx.fillStyle = '#8a7a5a'; ctx.fillRect(tr.x - 12, tr.y - 50, 24, 50); }
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(tr.x - 18, tr.y + 6, 36, 3);
      ctx.fillStyle = '#e8c27a'; ctx.fillRect(tr.x - 18, tr.y + 6, 36 * Math.min(1, tr.t / (12 + 4 * tr.lvl)), 3);
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
    for (const m of game.minions) if (m.alive) units.push(m);
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
        if (!h.alive) { if (artReady) ctx.drawImage(IMG.dead, 6 * 128, 128, 128, 128, h.homeX - 26, h.homeY - 30, 52, 52); else drawSprite(ctx, tombSprite(), h.homeX, h.homeY, 1, 0, false); continue; }
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
        if (h.minion) {
          ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(h.x - 10, h.y - 28, 20, 3);
          ctx.fillStyle = '#9fff8a'; ctx.fillRect(h.x - 10, h.y - 28, 20 * Math.max(0, h.hp / h.stats.maxHp), 3);
          continue;
        }
        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        ctx.fillRect(h.x - 16, h.y - 44, 32, 5);
        ctx.fillStyle = '#4fd36a';
        ctx.fillRect(h.x - 16, h.y - 44, 32 * Math.max(0, h.hp / h.stats.maxHp), 5);
        ctx.fillStyle = '#ffe36e';
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(String(h.level), h.x + 21, h.y - 38);
      } else {
        const e = u;
        const s = enemySprite(e.def.id);
        const ph = t * 9 + e.gen * 1.7;
        const frame = e.stun > 0 ? 0 : Math.floor(ph / Math.PI) & 1;
        // Attack: lean back (wind-up), then snap forward. Hit: recoil and squash. Walk: bob and sway.
        const a = e.anim > 0 ? 1 - e.anim / 0.2 : -1;
        const lunge = a < 0 ? 0 : a < 0.45 ? -a * 6 * e.face : Math.sin(((a - 0.45) / 0.55) * Math.PI) * 6 * e.face;
        const tilt = a < 0 ? (e.stun > 0 ? 0 : Math.sin(ph) * 0.07) : (a < 0.45 ? -0.22 : 0.18) * e.face;
        const hit = e.flash > 0 ? 1 : 0;
        const bob = e.stun > 0 ? 0 : -Math.abs(Math.sin(ph)) * (1 + e.def.radius * 0.06);
        const big = e.elite ? 1.25 : 1;
        if (e.elite) {
          ctx.fillStyle = ELITES[e.elite].color + '55';
          ctx.beginPath(); ctx.ellipse(e.x, e.y + e.def.radius * 0.9, e.def.radius * 1.7, e.def.radius * 0.6, 0, 0, Math.PI * 2); ctx.fill();
        }
        const feet = e.y + e.def.radius * 1.1;
        if (artReady) {
          // Pixel-art goblin: attack anim while striking, run otherwise (frozen when stunned).
          const atk = e.anim > 0;
          drawUnit(ctx, e.def.id, e.stun > 0 ? 'idle' : atk ? 'atk' : 'run', atk ? 1 - e.anim / 0.2 : t + e.gen * 0.13, atk,
            e.x - hit * 2 * e.face, feet, e.face, big, e.flash > 0, 10 * e.spdMul);
        } else {
          ctx.save();
          ctx.translate(e.x + lunge - hit * 2 * e.face, e.y + bob);
          ctx.rotate(tilt);
          ctx.scale(big * (1 + hit * 0.12), big * (1 - hit * 0.15));
          drawSprite(ctx, s, 0, 0, e.face, frame, e.flash > 0);
          ctx.restore();
        }
        if (e.elite) { ctx.fillStyle = ELITES[e.elite].color; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('★', e.x, (artReady ? feet - unitHeight(e.def.id, big) : e.y - s.ay * big) - 2); }
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
      const top = artReady ? e.y + e.def.radius * 1.1 - unitHeight(e.def.id, e.elite ? 1.25 : 1) - 4 : e.y - s.ay * 0.75;
      if (e.burnT > 0) {
        if (artReady) drawFx(ctx, 'fire', (t * 12 + e.gen) % 7, e.x, e.y + 2, 22 + e.def.radius);
        else { ctx.fillStyle = 'rgba(255,120,30,0.85)'; ctx.beginPath(); ctx.arc(e.x, e.y - 2, 2.5 + Math.random() * 1.5, 0, Math.PI * 2); ctx.fill(); }
      }
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
      if (artReady && p.enemyShot) {
        // Thrown dynamite, spinning
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(t * 14 + p.x * 0.01);
        ctx.drawImage(IMG.dynamite, (Math.floor(t * 12) % 6) * 64, 0, 64, 64, -11, -11, 22, 22);
        ctx.restore();
        continue;
      }
      if (artReady && !p.splash && !p.enemyShot) {
        // Arrow sprite pointing along its flight
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(Math.atan2(uy, ux));
        ctx.drawImage(IMG.arrow, 0, 0, 64, 64, -16, -16, 32, 32);
        ctx.restore();
        continue;
      }
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
      } else if (f.kind === 'boom') {
        ctx.globalAlpha = 1;
        if (artReady) drawFx(ctx, 'explosions', (1 - k) * 9, f.x, f.y, f.r * 2.6);
        else { ctx.fillStyle = 'rgba(255,150,40,0.8)'; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (1.2 - k), 0, Math.PI * 2); ctx.fill(); }
      } else if (f.kind === 'corpse') {
        // The fallen goblin tips over and fades away.
        const tip = Math.min(1, (1 - k) * 4);
        ctx.globalAlpha = 0.4 + 0.6 * k;
        ctx.save();
        ctx.translate(f.x - f.r * 8 * tip, f.y - Math.sin(tip * Math.PI) * 6);
        ctx.rotate(-f.r * (Math.PI / 2) * tip);
        if (!drawUnit(ctx, f.text, 'idle', 0, false, 0, 6, f.r)) drawSprite(ctx, enemySprite(f.text), 0, 0, f.r, 0, false);
        ctx.restore();
      } else if (f.kind === 'bit') {
        if (!settings.gore && BLOOD.includes(f.color)) continue;
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
      } else if (f.kind === 'gem') {
        if (!settings.numbers) continue;
        // Loot popup: gold and gems this enemy dropped.
        const [gold, gems] = f.text.split('|');
        const y = f.y - (1 - k) * 26;
        ctx.globalAlpha = Math.min(1, k * 2);
        ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
        ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineWidth = 3;
        const label = gold + '🪙' + (gems ? ' ' + gems + '💎' : '');
        ctx.strokeText(label, f.x, y);
        ctx.fillStyle = gems ? '#bfe9ff' : '#ffe07a'; ctx.fillText(label, f.x, y);
      } else if (f.kind === 'frost') {
        ctx.fillStyle = `rgba(150,215,255,${0.35 * k})`; ctx.strokeStyle = '#dff4ff'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(f.x, f.y, f.r * (1.15 - k * 0.15), f.r * 0.7 * (1.15 - k * 0.15), 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      } else if (f.kind === 'bless') {
        ctx.strokeStyle = f.color; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(f.x, f.y - (1 - k) * 30, f.r * (0.6 + (1 - k)), 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = `rgba(255,240,150,${0.25 * k})`; ctx.fillRect(f.x - 6, f.y - 70, 12, 70);
      } else if (f.kind === 'num') {
        if (!settings.numbers) continue;
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
    if (settings.fx) this.atmosphere(game, ox, oy);
    this.drawRockers(game);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  // ---------- atmosphere: light, glow, weather, colour grading ----------

  private light = (() => { const c = document.createElement('canvas'); c.width = VIEW_W / 2; c.height = VIEW_H / 2; return c; })();
  private glowCache = new Map<string, HTMLCanvasElement>();
  /** Pre-rendered soft round light (white = cut-out mask, or a colour = additive glow). */
  private glowSprite(color: string): HTMLCanvasElement {
    let c = this.glowCache.get(color);
    if (c) return c;
    c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d')!;
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, `rgba(${color},1)`); gr.addColorStop(0.5, `rgba(${color},0.45)`); gr.addColorStop(1, `rgba(${color},0)`);
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    this.glowCache.set(color, c);
    return c;
  }
  private parts: { x: number; y: number; vx: number; vy: number; r: number; a: number; s: number }[] = [];
  private partBiome = '';
  private lastT = 0;

  /** Darkness of the scene: biome mood, deeper at boss waves (night) — torches and magic cut through it. */
  private darkness(game: Game): number {
    const base = game.biome === 'swamp' ? 0.32 : game.biome === 'snow' ? 0.1 : 0.16;
    const night = game.wave > 0 && (game.phase === 'battle' ? game.wave : game.wave + 1) % 5 === 0 ? 0.38 : 0;
    return Math.min(0.75, base + night);
  }

  private atmosphere(game: Game, ox: number, oy: number): void {
    const ctx = this.ctx, cam = this.cam, t = game.time;
    const camT = (c: CanvasRenderingContext2D) => c.setTransform(cam.zoom, 0, 0, cam.zoom, -cam.x * cam.zoom + ox, -cam.y * cam.zoom + oy);
    const dark = this.darkness(game);
    const amb = game.biome === 'swamp' ? '8,18,12' : game.biome === 'snow' ? '14,22,44' : '12,10,30';

    // Collect lights: [x, y, radius, strength 0..1, glow colour or '']
    const lights: [number, number, number, number, string][] = [];
    const flick = (k: number) => 0.85 + 0.15 * Math.sin(t * 13 + k * 7.3) * Math.sin(t * 7 + k);
    for (let x = 100, k = 0; x < WORLD_W; x += 200, k++) lights.push([x, WALL_Y - 14, 110 * flick(k), 0.9, '255,150,60']);
    for (const tw of TOWERS) lights.push([tw.x, tw.y - 50, 90, 0.8, '255,170,80']);
    lights.push([800, WALL_Y + 20, 140, 0.7, '255,190,110']);
    for (const h of game.heroes) if (h.alive) lights.push([h.x, h.y - 8, 85, 0.55, h.def.id === 'pyro' ? '255,140,40' : h.def.id === 'summoner' ? '140,255,120' : '']);
    let burn = 0;
    for (const e of game.enemies) {
      if (!e.active) continue;
      if (e.burnT > 0 && burn++ < 40) lights.push([e.x, e.y, 45, 0.6, '255,120,30']);
      else if (e.def.boss) lights.push([e.x, e.y, 60, 0.4, e.def.id === 'necro' ? '140,255,120' : '']);
    }
    for (const p of game.projectiles) {
      if (!p.active) continue;
      if (p.splash > 0) lights.push([p.x, p.y, 60, 0.8, '255,140,40']);
      else if (p.enemyShot) lights.push([p.x, p.y, 40, 0.6, '190,120,255']);
    }
    for (const f of game.effects) {
      if (!f.active) continue;
      const k = f.life / f.max;
      if (f.kind === 'meteor') lights.push([f.x, f.y, f.r * 1.6, 0.5 + (1 - k) * 0.5, '255,120,30']);
      else if (f.kind === 'frost') lights.push([f.x, f.y, f.r * 1.3, k, '150,210,255']);
      else if (f.kind === 'bless') lights.push([f.x, f.y, 90, k, '255,240,150']);
      else if (f.kind === 'ring' && f.r > 40) lights.push([f.x, f.y, f.r * 1.2, k * 0.7, '']);
      else if (f.kind === 'puff' && f.r >= 20) lights.push([f.x, f.y, f.r * 3, k * 0.8, '255,150,60']);
    }

    // Darkness map with holes cut by the lights
    if (dark > 0.02) {
      // Half-resolution light map, scaled up (it is blurry by nature anyway).
      const l = this.light.getContext('2d')!;
      l.setTransform(1, 0, 0, 1, 0, 0);
      l.globalCompositeOperation = 'source-over';
      l.globalAlpha = 1;
      l.clearRect(0, 0, VIEW_W / 2, VIEW_H / 2);
      l.fillStyle = `rgba(${amb},${dark})`;
      l.fillRect(0, 0, VIEW_W / 2, VIEW_H / 2);
      l.setTransform(cam.zoom / 2, 0, 0, cam.zoom / 2, (-cam.x * cam.zoom + ox) / 2, (-cam.y * cam.zoom + oy) / 2);
      l.globalCompositeOperation = 'destination-out';
      const mask = this.glowSprite('0,0,0');
      for (const [x, y, r, a] of lights) { l.globalAlpha = a; l.drawImage(mask, x - r, y - r, r * 2, r * 2); }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(this.light, 0, 0, VIEW_W, VIEW_H);
    }

    // Warm/magic glow on top (additive) — stronger at night
    camT(ctx);
    ctx.globalCompositeOperation = 'lighter';
    const gk = 0.12 + dark * 0.35;
    for (const [x, y, r, a, c] of lights) {
      if (!c) continue;
      const rr = r * 0.6;
      ctx.globalAlpha = gk * a;
      ctx.drawImage(this.glowSprite(c), x - rr, y - rr, rr * 2, rr * 2);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    // Torch flames on the wall
    for (let x = 100, k = 0; x < WORLD_W; x += 200, k++) {
      const fl = flick(k);
      ctx.fillStyle = '#5a3b20'; ctx.fillRect(x - 1.5, WALL_Y - 12, 3, 10);
      if (artReady) { drawFx(ctx, 'fire', (t * 10 + k * 3) % 7, x, WALL_Y - 10, 26); continue; }
      ctx.fillStyle = '#ff9a2e'; ctx.beginPath(); ctx.ellipse(x, WALL_Y - 16, 3.5 * fl, 6 * fl, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffe9a0'; ctx.beginPath(); ctx.ellipse(x, WALL_Y - 15, 1.6, 3 * fl, 0, 0, Math.PI * 2); ctx.fill();
    }

    // Weather particles (screen space)
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const dt = Math.min(0.05, Math.max(0, t - this.lastT)) || 0.016;
    this.lastT = t;
    if (this.partBiome !== game.biome) {
      this.partBiome = game.biome;
      const n = game.biome === 'snow' ? 140 : game.biome === 'swamp' ? 46 : 22;
      this.parts = Array.from({ length: n }, (_, i) => ({ x: Math.random() * VIEW_W, y: Math.random() * VIEW_H, vx: 0, vy: 0, r: Math.random(), a: Math.random() * 6.28, s: i }));
    }
    for (const q of this.parts) {
      if (game.biome === 'snow') {
        q.x += (Math.sin(t * 0.8 + q.s) * 18 - 10) * dt; q.y += (30 + q.r * 40) * dt;
        ctx.fillStyle = `rgba(255,255,255,${0.5 + q.r * 0.4})`;
        ctx.beginPath(); ctx.arc(q.x, q.y, 1 + q.r * 1.8, 0, Math.PI * 2); ctx.fill();
      } else if (game.biome === 'swamp') {
        if (q.s % 3 === 0) { // drifting fog bank
          q.x += (8 + q.r * 6) * dt;
          const rr = 160 + q.r * 120;
          ctx.globalAlpha = 0.13;
          ctx.drawImage(this.glowSprite('170,200,170'), q.x - rr, q.y - rr * 0.6, rr * 2, rr * 1.2);
          ctx.globalAlpha = 1;
        } else { // firefly
          q.a += dt * (1 + q.r); q.x += Math.cos(q.a) * 12 * dt; q.y += Math.sin(q.a * 1.3) * 10 * dt;
          const b = 0.5 + 0.5 * Math.sin(t * 3 + q.s);
          ctx.fillStyle = `rgba(200,255,120,${b * 0.85})`;
          ctx.beginPath(); ctx.arc(q.x, q.y, 1.6, 0, Math.PI * 2); ctx.fill();
        }
      } else {
        q.a += dt * (1 + q.r); q.x += (Math.sin(q.a) * 25 + 8) * dt; q.y += (22 + q.r * 18) * dt;
        ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.a); ctx.fillStyle = q.r > 0.5 ? 'rgba(190,140,50,0.8)' : 'rgba(120,150,50,0.8)';
        ctx.beginPath(); ctx.ellipse(0, 0, 3.5, 1.6, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      }
      if (q.y > VIEW_H + 20) { q.y = -20; q.x = Math.random() * VIEW_W; }
      if (q.x > VIEW_W + 300) q.x = -300;
      if (q.x < -300) q.x = VIEW_W + 20;
    }

    // Colour grade + vignette
    if (!this.vignette) {
      const v = document.createElement('canvas'); v.width = VIEW_W; v.height = VIEW_H;
      const vg = v.getContext('2d')!;
      const g = vg.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.45, VIEW_W / 2, VIEW_H / 2, VIEW_W * 0.72);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.55)');
      vg.fillStyle = g; vg.fillRect(0, 0, VIEW_W, VIEW_H);
      this.vignette = v;
    }
    ctx.drawImage(this.vignette, 0, 0);
  }

  private vignette: HTMLCanvasElement | null = null;
  private rock = 0; // 0..1 how far the rock skeletons have slid in

  private rockFrames: HTMLCanvasElement[] = [];

  /** A pixel-art rock skeleton (two head-bang frames), drawn small and scaled up crisp. */
  private rocker(frame: number): HTMLCanvasElement {
    if (this.rockFrames[frame]) return this.rockFrames[frame];
    const W = 64, H = 80;
    const art = document.createElement('canvas'); art.width = W; art.height = H;
    const g = art.getContext('2d')!;
    const px = (x: number, y: number, w: number, h: number, c: string) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
    const bone = '#efe8d2', boneS = '#b9b09a', dark = '#1b1512', leather = '#2a2626', leatherL = '#4a4444';
    const bang = frame === 1 ? 3 : 0;
    // boots and legs (ripped jeans)
    px(18, 72, 9, 5, dark); px(36, 72, 9, 5, dark);
    px(20, 52, 6, 20, '#2f4a7a'); px(37, 52, 6, 20, '#2f4a7a');
    px(21, 60, 3, 3, bone); px(39, 64, 3, 2, bone); // knees through the rips
    px(19, 50, 26, 5, '#5a3b20'); px(30, 50, 4, 5, '#c9a23a'); // belt + buckle
    // torso: open leather jacket over a ribcage
    px(17, 30, 30, 21, leather); px(19, 31, 4, 18, leatherL); px(41, 31, 4, 18, leatherL);
    px(26, 31, 12, 19, '#140f0d');
    px(31, 31, 2, 19, bone);
    for (let y = 33; y < 48; y += 3) { px(26, y, 12, 2, bone); px(26, y + 2, 12, 1, boneS); }
    // studs on the jacket
    for (let y = 33; y < 49; y += 4) { px(20, y, 1, 1, '#d8d8d8'); px(43, y, 1, 1, '#d8d8d8'); }
    // arms: one on the neck, one strumming
    px(12, 32, 6, 4, leather); px(46, 32, 6, 4, leather);
    px(9, 34, 3, 12, bone); px(52, 34, 3, 8, bone); px(46, 42, 9, 3, bone);
    // skull (head-bang moves it down)
    const sy = 8 + bang;
    px(23, sy, 18, 16, bone); px(21, sy + 3, 22, 10, bone); px(23, sy + 13, 18, 3, boneS);
    px(25, sy + 6, 5, 5, dark); px(34, sy + 6, 5, 5, dark); // sockets
    px(27, sy + 8, 2, 2, '#ff2a1a'); px(36, sy + 8, 2, 2, '#ff2a1a'); // glowing eyes
    px(31, sy + 11, 2, 2, dark); // nose
    px(25, sy + 16, 14, 5, bone); for (let x = 26; x < 39; x += 2) px(x, sy + 16, 1, 3 + (frame ? 2 : 0), dark); // teeth / open jaw
    // red mohawk
    for (let k = 0; k < 6; k++) px(28 + k, sy - 6 + Math.abs(k - 2.5) | 0, 2, 7 - (Math.abs(k - 2.5) | 0), k % 2 ? '#ff4a2a' : '#c81e14');
    // flying-V guitar across the body
    g.save(); g.translate(34, 46); g.rotate(-0.55);
    g.fillStyle = '#c0141c'; g.beginPath(); g.moveTo(2, 0); g.lineTo(-16, -9); g.lineTo(-12, 0); g.lineTo(-16, 9); g.closePath(); g.fill();
    g.fillStyle = '#ffffff'; g.fillRect(-9, -2, 6, 4);
    g.fillStyle = '#5a3b20'; g.fillRect(0, -1.5, 30, 3);
    g.fillStyle = '#d8d8d8'; for (let x = 4; x < 30; x += 5) g.fillRect(x, -1.5, 1, 3);
    g.fillStyle = '#1b1512'; g.fillRect(29, -3, 6, 6);
    g.restore();
    // dark outline around everything
    const out = document.createElement('canvas'); out.width = W + 2; out.height = H + 2;
    const o = out.getContext('2d')!;
    for (const [dx, dy] of [[0, 1], [2, 1], [1, 0], [1, 2]]) o.drawImage(art, dx, dy);
    o.globalCompositeOperation = 'source-in'; o.fillStyle = '#120c0a'; o.fillRect(0, 0, out.width, out.height);
    o.globalCompositeOperation = 'source-over'; o.drawImage(art, 1, 1);
    this.rockFrames[frame] = out;
    return out;
  }

  /** Combo 50+: rock skeletons with burning guitars slide in from the sides — "ОУУУ ЕЕЕЕ". */
  private drawRockers(game: Game): void {
    const on = game.phase === 'battle' && game.burst && game.combo >= 50;
    this.rock = Math.max(0, Math.min(1, this.rock + (on ? 0.06 : -0.04)));
    if (this.rock <= 0 || !artReady) return;
    const ctx = this.ctx, t = game.time, e = 1 - Math.pow(1 - this.rock, 3);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    for (const side of [-1, 1]) {
      const x = side < 0 ? -110 + e * 250 : VIEW_W + 110 - e * 250;
      const y = 560;
      for (let k = -1; k <= 1; k++) drawFx(ctx, 'fire', (t * 12 + k * 2 + side) % 7, x + k * 60, y + 12, 130);
      const fr = this.rocker(Math.floor(t * 7) % 2);
      ctx.save();
      ctx.translate(x, y);
      if (side > 0) ctx.scale(-1, 1);
      ctx.drawImage(fr, -fr.width * 1.6, -fr.height * 3.2, fr.width * 3.2, fr.height * 3.2);
      ctx.restore();
      drawFx(ctx, 'fire', (t * 16 + side) % 7, x + side * 60, y - 230, 80);
      ctx.save();
      ctx.translate(x - side * 10, y - 290);
      ctx.rotate(-0.12 * side);
      const pulse = 1 + Math.sin(t * 12) * 0.06;
      ctx.scale(pulse, pulse);
      ctx.font = 'italic 900 36px Georgia, serif'; ctx.textAlign = 'center';
      ctx.lineWidth = 7; ctx.strokeStyle = '#000'; ctx.strokeText(side < 0 ? 'ОУУУ' : 'ЕЕЕЕ!', 0, 0);
      ctx.fillStyle = '#ff3a1a'; ctx.fillText(side < 0 ? 'ОУУУ' : 'ЕЕЕЕ!', 0, 0);
      ctx.restore();
    }
    ctx.imageSmoothingEnabled = true;
  }


  /**
   * Hero body plus its attack animation. p goes 0 → 1 over the attack:
   * Бран — замах и рубящий удар мечом с дугой, Ива — отдача лука и вспышка тетивы,
   * Оррин — выпад посохом и вспышка огня в навершии. Умения — подскок и кольцо цвета героя.
   */
  /** Heroes are drawn 30% larger than their logical size so they stand out from the horde. */
  private drawHero(h: Hero, frame: number): void {
    const ctx = this.ctx, S = h.minion ? 1.12 : 1.3, fy = h.y + 12;
    ctx.save();
    ctx.translate(h.x, fy); ctx.scale(S, S); ctx.translate(-h.x, -fy);
    if (artReady) this.drawHeroArt(h, fy); else this.drawHeroInner(h, frame);
    ctx.restore();
  }

  /** Pixel-art hero: idle / run / attack rows; the archer aims up or down at the target. */
  private drawHeroArt(h: Hero, fy: number): void {
    const now = performance.now() / 1000;
    if (h.anim > 0) {
      const p = 1 - h.anim / Math.max(0.01, h.animMax);
      let anim: 'atk' | 'atk2' = h.animCast || h.attacks % 2 ? 'atk2' : 'atk';
      if (h.def.id === 'ranger') anim = 'atk';
      drawUnit(this.ctx, h.def.id, anim, p, true, h.x, fy, h.face, 1, h.flash > 0);
      if (h.animCast) {
        const ctx = this.ctx;
        ctx.save(); ctx.globalAlpha = (1 - p) * 0.9; ctx.strokeStyle = h.def.color; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(h.x, fy, 10 + p * 26, 4 + p * 9, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
      }
    } else {
      drawUnit(this.ctx, h.def.id, h.moving ? 'run' : 'idle', now + h.homeX * 0.01, false, h.x, fy, h.face, 1, h.flash > 0);
    }
  }

  private drawHeroInner(h: Hero, frame: number): void {
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
    const keep = [];
    for (const s of game.splats) {
      if (s.type) {
        // Corpses stay on the ground, half-transparent, until the next wave.
        if ((s.at ?? 0) > game.waveTime && game.phase === 'battle') { keep.push(s); continue; }
        g.save(); g.globalAlpha = 0.4; g.translate(s.x - s.r * 8, s.y); g.rotate(-s.r * Math.PI / 2);
        if (!drawUnit(g, s.type, 'idle', 0, false, 0, 6, s.r)) drawSprite(g, enemySprite(s.type), 0, 0, s.r, 0, false);
        g.restore();
        continue;
      }
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
    game.splats.push(...keep);
  }

  private drawTowers(game: Game): void {
    const ctx = this.ctx;
    for (const t of TOWERS) {
      if (game.phase === 'shop') {
        ctx.strokeStyle = 'rgba(232,226,200,0.18)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(t.x, t.y, TOWER_RANGE, Math.PI, Math.PI * 2); ctx.stroke();
      }
      if (!artReady) {
        ctx.fillStyle = '#9a9184';
        ctx.fillRect(t.x - 26, t.y - 58, 52, 70);
        ctx.fillStyle = '#7a7266';
        for (let i = 0; i < 4; i++) ctx.fillRect(t.x - 26 + i * 14, t.y - 68, 10, 12);
        ctx.fillStyle = '#2b2622';
        ctx.fillRect(t.x - 4, t.y - 44, 8, 14);
      }
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
