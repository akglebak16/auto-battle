// Procedural "models": heroes and goblins are drawn once with canvas paths into small
// offscreen canvases (2 walk frames x 2 facings + a white hit-flash copy), then the
// renderer only does drawImage — cheap enough for hundreds of goblins on screen.

type Ctx = CanvasRenderingContext2D;

export interface Sprite {
  /** frames[facing][frame]: facing 0 = right, 1 = left */
  frames: HTMLCanvasElement[][];
  flash: HTMLCanvasElement[][];
  w: number; // logical size in game pixels
  h: number;
  ax: number; // anchor (unit position) inside the sprite, logical px
  ay: number;
}

const RES = 2; // bake at 2x for crispness when the canvas is scaled up

function bake(w: number, h: number, ax: number, ay: number, draw: (g: Ctx, frame: number) => void): Sprite {
  const frames: HTMLCanvasElement[][] = [[], []];
  const flash: HTMLCanvasElement[][] = [[], []];
  for (let facing = 0; facing < 2; facing++) {
    for (let frame = 0; frame < 2; frame++) {
      const c = document.createElement('canvas');
      c.width = w * RES; c.height = h * RES;
      const g = c.getContext('2d')!;
      g.scale(RES, RES);
      if (facing === 1) { g.translate(w, 0); g.scale(-1, 1); g.translate(w - ax, ay); } else g.translate(ax, ay);
      g.lineJoin = 'round';
      g.lineCap = 'round';
      draw(g, frame);
      // Volume shading: light from the upper left, shadow at the feet (same for both facings).
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalCompositeOperation = 'source-atop';
      const sh = g.createLinearGradient(0, 0, c.width * 0.6, c.height);
      sh.addColorStop(0, 'rgba(255,250,225,0.22)');
      sh.addColorStop(0.45, 'rgba(255,255,255,0)');
      sh.addColorStop(1, 'rgba(10,8,30,0.32)');
      g.fillStyle = sh; g.fillRect(0, 0, c.width, c.height);
      g.globalCompositeOperation = 'source-over';
      frames[facing].push(c);
      const f = document.createElement('canvas');
      f.width = c.width; f.height = c.height;
      const fg = f.getContext('2d')!;
      fg.drawImage(c, 0, 0);
      fg.globalCompositeOperation = 'source-atop';
      fg.fillStyle = 'rgba(255,255,255,0.85)';
      fg.fillRect(0, 0, f.width, f.height);
      flash[facing].push(f);
    }
  }
  return { frames, flash, w, h, ax: facingAnchor(w, ax), ay };
}

// Mirrored sprites keep the same anchor because we drew them mirrored around it.
function facingAnchor(_w: number, ax: number): number { return ax; }

// ---------- drawing helpers ----------

function circle(g: Ctx, x: number, y: number, r: number, fill: string, stroke: string | null = OUTLINE): void {
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2);
  g.fillStyle = fill; g.fill();
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = 1; g.stroke(); }
}
function ellipse(g: Ctx, x: number, y: number, rx: number, ry: number, fill: string, stroke: string | null = OUTLINE): void {
  g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  g.fillStyle = fill; g.fill();
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = 1; g.stroke(); }
}
function poly(g: Ctx, pts: number[], fill: string, stroke: string | null = OUTLINE): void {
  g.beginPath(); g.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
  g.closePath();
  g.fillStyle = fill; g.fill();
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = 1; g.stroke(); }
}
function line(g: Ctx, x1: number, y1: number, x2: number, y2: number, color: string, width: number): void {
  g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2);
  g.strokeStyle = color; g.lineWidth = width; g.stroke();
}
function rect(g: Ctx, x: number, y: number, w: number, h: number, fill: string, stroke: string | null = OUTLINE): void {
  g.fillStyle = fill; g.fillRect(x, y, w, h);
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = 1; g.strokeRect(x, y, w, h); }
}
const OUTLINE = 'rgba(20,14,8,0.9)';

// ---------- goblins (designed facing right, ~16px tall at scale 1) ----------

interface GoblinLook {
  skin: string; cloth: string; scale: number;
  weapon: 'club' | 'axe' | 'staff' | 'sword' | 'spear' | 'bomb' | 'none';
  hood?: string; helmet?: string; crown?: boolean; cape?: string; armor?: string; tusks?: boolean;
}

function goblin(g: Ctx, look: GoblinLook, frame: number): void {
  g.save();
  g.scale(look.scale, look.scale);
  const step = frame === 0 ? 1.2 : -1.2;
  if (look.cape) poly(g, [-3, -2, -7, 8, 3, 8], look.cape);
  // legs
  rect(g, -3.5 + step, 4, 2.5, 5, '#3b2a1a', null);
  rect(g, 1 - step, 4, 2.5, 5, '#3b2a1a', null);
  // body / tunic
  poly(g, [-4.5, -1, 4.5, -1, 5.5, 6, -5.5, 6], look.cloth);
  if (look.armor) { poly(g, [-4, -1, 4, -1, 4.5, 4, -4.5, 4], look.armor); line(g, -4, 1.5, 4, 1.5, 'rgba(0,0,0,0.3)', 0.7); }
  // back arm
  circle(g, -4.8, 2, 1.6, look.skin);
  // head + ears
  poly(g, [-3, -7, -10, -10, -3.5, -4], look.skin);
  poly(g, [3, -7, 9, -11, 3.5, -4], look.skin);
  circle(g, 0, -5.5, 4.6, look.skin);
  if (look.hood) {
    g.beginPath(); g.arc(0, -6, 5.4, Math.PI * 0.95, Math.PI * 2.05); g.lineTo(5, -3); g.lineTo(-5, -3); g.closePath();
    g.fillStyle = look.hood; g.fill(); g.strokeStyle = OUTLINE; g.lineWidth = 1; g.stroke();
  }
  if (look.helmet) {
    g.beginPath(); g.arc(0, -6.5, 5, Math.PI, Math.PI * 2); g.closePath();
    g.fillStyle = look.helmet; g.fill(); g.strokeStyle = OUTLINE; g.lineWidth = 1; g.stroke();
    line(g, -5, -6.5, 5, -6.5, 'rgba(0,0,0,0.4)', 1);
  }
  // face (looking right)
  circle(g, 1.2, -6, 1.3, '#ffe25a', null);
  circle(g, 3.6, -6, 1.1, '#ffe25a', null);
  circle(g, 1.6, -6, 0.55, '#111', null);
  circle(g, 3.9, -6, 0.5, '#111', null);
  line(g, 4.6, -4.5, 6.2, -4.2, OUTLINE, 0.8); // nose
  line(g, 1, -3, 4, -3.2, '#3a1d12', 0.9); // grin
  if (look.tusks) { poly(g, [1.5, -3.2, 2.2, -4.8, 2.9, -3.2], '#f4efe1', null); poly(g, [3.3, -3.2, 4, -4.8, 4.7, -3.2], '#f4efe1', null); }
  if (look.crown) poly(g, [-4, -9.5, -4, -13, -2, -11, 0, -14, 2, -11, 4, -13, 4, -9.5], '#ffd23f');
  // weapon in front hand
  switch (look.weapon) {
    case 'club':
      line(g, 4.5, 3, 8.5, -5, '#6b4423', 1.8);
      circle(g, 8.8, -5.5, 2.2, '#7d5230');
      break;
    case 'axe':
      line(g, 4.5, 4, 8, -7, '#5a3b20', 1.6);
      poly(g, [7, -8, 12, -10, 12, -3, 7.5, -4.5], '#b9c0c8');
      break;
    case 'sword':
      line(g, 4.5, 3, 11, -7, '#d8dde3', 1.8);
      line(g, 4, 1.5, 7, 4, '#ffd23f', 1.5);
      break;
    case 'spear':
      line(g, 3, 6, 11, -9, '#6b4423', 1.3);
      poly(g, [10, -8, 13, -12, 11.5, -7.5], '#d8dde3');
      break;
    case 'bomb':
      circle(g, 8, -1, 4, '#2b2b30');
      line(g, 8, -5, 10, -8, '#c9a34a', 1.2);
      circle(g, 10.4, -8.6, 1.5, '#ff7a1f', null);
      circle(g, 10.4, -8.6, 0.7, '#ffee88', null);
      break;
    case 'staff':
      line(g, 5.5, 8, 6.5, -12, '#6b4423', 1.4);
      circle(g, 6.6, -13, 2.4, '#c78bff', '#5b2a85');
      circle(g, 6.6, -13, 1, '#ffffff', null);
      break;
  }
  circle(g, 4.6, 2, 1.6, look.skin); // front hand
  g.restore();
}

function wolfRider(g: Ctx, frame: number): void {
  const step = frame === 0 ? 1.5 : -1.5;
  // wolf
  line(g, -7, 2, -11, -2, '#5d5d5d', 2.2); // tail
  line(g, -5 + step, 4, -5 - step, 9, '#4a4a4a', 2);
  line(g, -2 - step, 4, -2 + step, 9, '#4a4a4a', 2);
  line(g, 4 + step, 4, 4 - step, 9, '#4a4a4a', 2);
  line(g, 7 - step, 4, 7 + step, 9, '#4a4a4a', 2);
  ellipse(g, 0, 2.5, 9, 4.5, '#7a7a7a');
  circle(g, 9, -1, 3.6, '#7a7a7a');
  poly(g, [10, -1, 15, 0.5, 10.5, 2], '#6a6a6a');
  poly(g, [7, -3.5, 7.5, -7.5, 9.5, -4], '#6a6a6a');
  circle(g, 10.3, -1.8, 0.7, '#ffde4a', null);
  // rider (small goblin)
  g.save(); g.translate(-1, -6);
  goblin(g, { skin: '#7cbf3a', cloth: '#6b4a2a', scale: 0.7, weapon: 'spear' }, 0);
  g.restore();
}

// ---------- heroes (designed facing right, ~32px tall) ----------

type HeroKind = 'warden' | 'ranger' | 'pyro' | 'cleric' | 'berserk' | 'summoner' | 'skeleton';

function skeleton(g: Ctx, frame: number): void {
  const step = frame === 0 ? 1.5 : -1.5;
  const bone = '#e8e2cf';
  line(g, -2 + step, 4, -2 + step, 13, bone, 2); line(g, 2 - step, 4, 2 - step, 13, bone, 2);
  rect(g, -4, -4, 8, 8, '#2a2620', null);
  for (let y = -3; y < 4; y += 2.5) line(g, -4, y, 4, y, bone, 1.3);
  line(g, 0, -5, 0, 5, bone, 1.4);
  circle(g, 0, -10, 5, bone);
  circle(g, -1.5, -10.5, 1.3, '#1a1a1a', null); circle(g, 2.2, -10.5, 1.3, '#1a1a1a', null);
  circle(g, -1.5, -10.5, 0.5, '#9fff8a', null); circle(g, 2.2, -10.5, 0.5, '#9fff8a', null);
  line(g, -2, -6.5, 3, -6.5, '#555', 0.8);
  line(g, 5, 2, 10, -10, '#9aa4ae', 2); line(g, 4, -1, 8, 1, '#5a3b20', 1.6); // rusty sword
  poly(g, [-9, -6, -3, -6, -3, 4, -6, 7, -9, 4], '#5a4a3a'); // old shield
}

function hero(g: Ctx, kind: HeroKind, frame: number): void {
  if (kind === 'skeleton') { skeleton(g, frame); return; }
  const step = frame === 0 ? 1.5 : -1.5;
  const skin = '#f1c27d';
  const look = {
    warden: { cloth: '#3f6fc4', legs: '#2c3e5f', trim: '#ffd23f' },
    ranger: { cloth: '#3e8a4a', legs: '#4a3a24', trim: '#a87b3c' },
    pyro: { cloth: '#c4561f', legs: '#5a2a14', trim: '#ffcc4a' },
    cleric: { cloth: '#f2ead2', legs: '#bfb59a', trim: '#e2b93b' },
    berserk: { cloth: '#8a2b2b', legs: '#4a2f1d', trim: '#c9c9c9' },
    summoner: { cloth: '#3a2a52', legs: '#221a30', trim: '#9fff8a' },
  }[kind as Exclude<HeroKind, 'skeleton'>];

  if (kind === 'cleric') { // halo behind the head
    g.beginPath(); g.arc(-0.5, -12, 7.5, 0, Math.PI * 2); g.strokeStyle = 'rgba(255,226,110,0.85)'; g.lineWidth = 1.6; g.stroke();
  }
  if (kind === 'warden') line(g, -7, 2, -10, -14, '#cfd5dc', 2.4); // sword raised behind

  // legs
  rect(g, -4 + step, 5, 3.4, 9, look.legs);
  rect(g, 0.6 - step, 5, 3.4, 9, look.legs);
  rect(g, -4.5 + step, 12.5, 4.4, 2.2, '#2b1d12');
  rect(g, 0.1 - step, 12.5, 4.4, 2.2, '#2b1d12');

  // body
  if (kind === 'pyro' || kind === 'cleric' || kind === 'summoner') {
    poly(g, [-5.5, -5, 5.5, -5, 8, 13, -8, 13], look.cloth); // robe
    line(g, 0, -4, 0, 13, look.trim, 1.2);
  } else {
    poly(g, [-6, -5, 6, -5, 6.5, 6, -6.5, 6], look.cloth);
    rect(g, -6.5, 4, 13, 2, look.trim);
  }
  if (kind === 'berserk') { // bare arms and a fur collar
    ellipse(g, 0, -5, 7, 2.6, '#a8865a');
  }

  // head
  circle(g, 0, -11, 5.6, skin);
  circle(g, 2.6, -11.5, 0.8, '#1d1d1d', null);
  // headgear
  switch (kind) {
    case 'warden':
      g.beginPath(); g.arc(0, -11.5, 6.2, Math.PI * 0.95, Math.PI * 2.05); g.closePath();
      g.fillStyle = '#aeb6c0'; g.fill(); g.strokeStyle = OUTLINE; g.lineWidth = 1; g.stroke();
      rect(g, 0.5, -12.2, 5.5, 1.4, '#59616b', null);
      poly(g, [-2, -17, 3, -20, 1, -16], '#3f6fc4');
      break;
    case 'ranger':
      g.beginPath(); g.arc(0, -11.5, 6.6, Math.PI * 0.8, Math.PI * 1.95); g.lineTo(-6, -4); g.closePath();
      g.fillStyle = '#2f6e3a'; g.fill(); g.strokeStyle = OUTLINE; g.lineWidth = 1; g.stroke();
      break;
    case 'pyro':
      poly(g, [-8, -14, 8, -14, 2, -16, -1, -27, -4, -16], '#8a2f12');
      rect(g, -6, -15, 12, 1.6, '#ffcc4a', null);
      line(g, 1, -7.5, 4, -6, '#d9d2c5', 1.4); // beard tip
      poly(g, [-1, -7.5, 4.5, -7.5, 2, -2.5], '#e6e0d4');
      break;
    case 'cleric':
      g.beginPath(); g.arc(0, -11.5, 6.4, Math.PI * 0.8, Math.PI * 2.05); g.lineTo(5, -6); g.lineTo(-6.5, -4); g.closePath();
      g.fillStyle = '#ffffff'; g.fill(); g.strokeStyle = OUTLINE; g.lineWidth = 1; g.stroke();
      break;
    case 'summoner':
      g.beginPath(); g.arc(0, -11.5, 6.8, Math.PI * 0.75, Math.PI * 2.1); g.lineTo(6, -3); g.lineTo(-7, -3); g.closePath();
      g.fillStyle = '#2a1e3d'; g.fill(); g.strokeStyle = OUTLINE; g.lineWidth = 1; g.stroke();
      circle(g, 2.6, -11, 0.9, '#9fff8a', null);
      break;
    case 'berserk':
      poly(g, [-6, -11, -5, -18, -2, -15, 0, -19, 2, -15, 5, -17, 5, -12], '#d4572a'); // wild hair
      poly(g, [-1, -8.5, 5.5, -8.5, 3, -2], '#d4572a'); // beard
      poly(g, [-6.5, -14, -10, -19, -5, -16], '#e8e0cc'); // horned band
      break;
  }

  // weapons / front arm
  switch (kind) {
    case 'warden':
      g.beginPath();
      g.moveTo(3, -5); g.lineTo(11, -5); g.lineTo(11, 4); g.quadraticCurveTo(7, 10, 3, 4); g.closePath();
      g.fillStyle = '#3f6fc4'; g.fill(); g.strokeStyle = OUTLINE; g.lineWidth = 1.2; g.stroke();
      line(g, 7, -4, 7, 6, '#ffd23f', 1.6);
      line(g, 4, -0.5, 10, -0.5, '#ffd23f', 1.6);
      break;
    case 'ranger':
      g.beginPath(); g.arc(4, -2, 11, -Math.PI * 0.42, Math.PI * 0.42);
      g.strokeStyle = '#7a4f24'; g.lineWidth = 1.8; g.stroke();
      line(g, 7.5, -12.5, 7.5, 8.5, '#e8e2d0', 0.6);
      circle(g, 6, -2, 1.8, skin);
      line(g, -5, -6, -2, -15, '#7a4f24', 2.4); // quiver
      break;
    case 'pyro':
      line(g, 7, 13, 8, -15, '#6b4423', 1.6);
      circle(g, 8.2, -17, 3, '#ff8a1f', '#a83c0a');
      circle(g, 8.2, -18, 1.6, '#ffe35a', null);
      circle(g, 7, -2, 1.8, skin);
      break;
    case 'cleric':
      line(g, 7, 13, 7, -14, '#e2b93b', 1.6);
      line(g, 4, -12, 10, -12, '#e2b93b', 1.6);
      line(g, 7, -17, 7, -9, '#e2b93b', 1.6);
      circle(g, 6.8, -2, 1.8, skin);
      break;
    case 'summoner':
      line(g, 7, 13, 8, -13, '#4a3a2a', 1.6);
      circle(g, 8, -15.5, 3.2, '#e8e2cf');
      circle(g, 7, -16, 0.8, '#1a1a1a', null); circle(g, 9.2, -16, 0.8, '#1a1a1a', null);
      circle(g, 8, -15.5, 5, 'rgba(159,255,138,0.25)', null);
      circle(g, 7, -2, 1.8, skin);
      break;
    case 'berserk':
      circle(g, -6.5, -1, 2.2, skin);
      circle(g, 6.5, -1, 2.2, skin);
      line(g, 6.5, 1, 10, -10, '#5a3b20', 1.6);
      poly(g, [9, -11, 14.5, -12.5, 14, -6, 9.5, -7], '#c9ced4');
      line(g, -6.5, 1, -10, -8, '#5a3b20', 1.6);
      poly(g, [-9, -9, -14.5, -10.5, -14, -4, -9.5, -5], '#c9ced4');
      break;
  }
}

function tomb(g: Ctx): void {
  g.beginPath(); g.moveTo(-6, 8); g.lineTo(-6, -3); g.arc(0, -3, 6, Math.PI, 0); g.lineTo(6, 8); g.closePath();
  g.fillStyle = '#8f8a80'; g.fill(); g.strokeStyle = OUTLINE; g.lineWidth = 1; g.stroke();
  line(g, 0, -5, 0, 3, '#5c5850', 1.4);
  line(g, -2.5, -2.5, 2.5, -2.5, '#5c5850', 1.4);
}

// ---------- registry ----------

const GOBLIN_LOOKS: Record<string, GoblinLook | 'rider'> = {
  grunt: { skin: '#7cbf3a', cloth: '#7a5230', scale: 1, weapon: 'club' },
  runner: 'rider',
  spitter: { skin: '#8fbf4a', cloth: '#5b2f85', scale: 1, weapon: 'staff', hood: '#6d3a9e' },
  brute: { skin: '#4f7d2a', cloth: '#5a3d26', scale: 1.7, weapon: 'axe', tusks: true, armor: '#6e5a48' },
  knight: { skin: '#6aa836', cloth: '#4a4f58', scale: 1.25, weapon: 'spear', helmet: '#9aa4b2', armor: '#8a96a8' },
  champion: { skin: '#5e9a30', cloth: '#6b2a1e', scale: 2.0, weapon: 'sword', tusks: true, helmet: '#7d3b2a', cape: '#a8382a' },
  sapper: { skin: '#c9b24a', cloth: '#6b5a2a', scale: 1, weapon: 'bomb', helmet: '#7a6a3a' },
  ogre: { skin: '#8a9a5a', cloth: '#5a4030', scale: 3.4, weapon: 'club', tusks: true, armor: '#6e5a48' },
  necro: { skin: '#9fb08a', cloth: '#2a2a3a', scale: 2.5, weapon: 'staff', hood: '#1e1b2e', cape: '#3a2a5a' },
  warlord: { skin: '#5e9a30', cloth: '#3a3a3a', scale: 2.9, weapon: 'axe', helmet: '#c9a23a', cape: '#d4a01a', armor: '#7a7a7a', tusks: true },
  boss: { skin: '#6aa836', cloth: '#5a1f6b', scale: 3.0, weapon: 'sword', crown: true, cape: '#b52d2d', tusks: true },
};

const cache = new Map<string, Sprite>();

export function enemySprite(id: string): Sprite {
  let s = cache.get('e:' + id);
  if (s) return s;
  const look = GOBLIN_LOOKS[id] ?? GOBLIN_LOOKS.grunt;
  if (look === 'rider') {
    s = bake(34, 30, 16, 20, (g, f) => wolfRider(g, f));
  } else {
    const k = look.scale;
    const w = Math.ceil(30 * k), h = Math.ceil(30 * k);
    s = bake(w, h, w / 2, h * 0.62, (g, f) => goblin(g, look, f));
  }
  cache.set('e:' + id, s);
  return s;
}

export function heroSprite(id: string): Sprite {
  let s = cache.get('h:' + id);
  if (s) return s;
  s = bake(40, 48, 20, 32, (g, f) => hero(g, id as HeroKind, f));
  cache.set('h:' + id, s);
  return s;
}

export function tombSprite(): Sprite {
  let s = cache.get('tomb');
  if (!s) { s = bake(16, 20, 8, 12, (g) => tomb(g)); cache.set('tomb', s); }
  return s;
}

/** PNG data URL of a hero (for the HTML cards). */
export function heroIcon(id: string): string {
  return heroSprite(id).frames[0][0].toDataURL();
}

/** Draws a sprite centred on (x, y) with its anchor; facing 1 = right, -1 = left. */
export function drawSprite(ctx: Ctx, s: Sprite, x: number, y: number, facing: number, frame: number, flash: boolean): void {
  const set = flash ? s.flash : s.frames;
  const img = set[facing >= 0 ? 0 : 1][frame & 1];
  ctx.drawImage(img, x - s.ax, y - s.ay, s.w, s.h);
}
