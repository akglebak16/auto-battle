// Pixel-art sprites from "Tiny Swords" by Pixel Frog (CC0, old free version).
// Sheets are grids of frames; each row is one animation (idle, run, attack…).
// Variants (orcs, bosses, mages) are recoloured once with canvas filters and cached.

import { ART_DATA } from './artData';

type Img = HTMLImageElement | HTMLCanvasElement;
/** Sheet key → file in assets/ts (packed into artData.ts by scripts/gen-art.py). */
export const ART_FILES: Record<string, string> = {
  torchRed: 'Torch_Red.png',
  torchPurple: 'Torch_Purple.png',
  torchYellow: 'Torch_Yellow.png',
  torchBlue: 'Torch_Blue.png',
  tntRed: 'TNT_Red.png',
  tntPurple: 'TNT_Purple.png',
  barrelRed: 'Barrel_Red.png',
  dynamite: 'Dynamite.png',
  warriorBlue: 'Warrior_Blue.png',
  warriorRed: 'Warrior_Red.png',
  warriorPurple: 'Warrior_Purple.png',
  archerBlue: 'Archer_Blue.png',
  pawnBlue: 'Pawn_Blue.png',
  pawnYellow: 'Pawn_Yellow.png',
  pawnPurple: 'Pawn_Purple.png',
  arrow: 'Arrow.png',
  dead: 'Dead.png',
  castle: 'Castle_Blue.png',
  tower: 'Tower_Blue.png',
  tilesFlat: 'Tilemap_Flat.png',
  tilesElev: 'Tilemap_Elevation.png',
  tree: 'Tree.png',
  explosions: 'Explosions.png',
  fire: 'Fire.png',
  d01: 'Deco_01.png',
  d02: 'Deco_02.png',
  d03: 'Deco_03.png',
  d04: 'Deco_04.png',
  d05: 'Deco_05.png',
  d06: 'Deco_06.png',
  d07: 'Deco_07.png',
  d08: 'Deco_08.png',
  d09: 'Deco_09.png',
  d10: 'Deco_10.png',
  d11: 'Deco_11.png',
  d12: 'Deco_12.png',
  d13: 'Deco_13.png',
  d14: 'Deco_14.png',
  d15: 'Deco_15.png',
  d16: 'Deco_16.png',
  d17: 'Deco_17.png',
  d18: 'Deco_18.png',
  bridge: 'Bridge_All.png',
  water: 'Water.png',
  uiWood: 'UI_Carved_9Slides.png',
  uiWood3: 'UI_Carved_3Slides.png',
  uiPaper: 'UI_Banner_Vertical.png',
  uiPaperH: 'UI_Banner_Horizontal.png',
  uiBtnBlue: 'UI_Button_Blue_9Slides.png',
  uiBtnBlueP: 'UI_Button_Blue_9Slides_Pressed.png',
  uiBtnRed: 'UI_Button_Red_9Slides.png',
  uiBtnRedP: 'UI_Button_Red_9Slides_Pressed.png',
  uiBtnHover: 'UI_Button_Hover_9Slides.png',
  uiBtnOff: 'UI_Button_Disable_9Slides.png',
  uiRibbonRed: 'UI_Ribbon_Red.png',
  uiRibbonYellow: 'UI_Ribbon_Yellow.png',
  uiRibbonBlue: 'UI_Ribbon_Blue.png',
  uiPointer: 'UI_Pointer.png',
};
const SRC: Record<string, string> = ART_DATA;

/** Interface skin: the Tiny Swords panels, ribbons and buttons become CSS variables (--ui-wood etc.). */
export function applyUiSkin(): void {
  const root = document.documentElement.style;
  const map: Record<string, string> = {
    '--ui-wood': 'uiWood', '--ui-wood3': 'uiWood3', '--ui-paper': 'uiPaper', '--ui-paper-h': 'uiPaperH',
    '--ui-btn': 'uiBtnBlue', '--ui-btn-p': 'uiBtnBlueP', '--ui-btn-red': 'uiBtnRed', '--ui-btn-red-p': 'uiBtnRedP',
    '--ui-btn-hover': 'uiBtnHover', '--ui-btn-off': 'uiBtnOff', '--ui-ribbon-red': 'uiRibbonRed', '--ui-ribbon-yellow': 'uiRibbonYellow',
    '--ui-ribbon-blue': 'uiRibbonBlue', '--ui-pointer': 'uiPointer',
  };
  for (const [v, k] of Object.entries(map)) if (SRC[k]) root.setProperty(v, `url("${SRC[k]}")`);
  document.documentElement.classList.add('skin');
}
export const IMG: Record<string, Img> = {};
export let artReady = false;

/** Animation rows of a sheet: [row, frame count]. */
interface Layout { fw: number; foot: number; idle: [number, number]; run: [number, number]; atk: [number, number]; atk2?: [number, number]; die?: [number, number] }
const L = {
  torch: { fw: 192, foot: 132, idle: [0, 7], run: [1, 6], atk: [2, 6], atk2: [3, 6] },
  tnt: { fw: 192, foot: 134, idle: [0, 6], run: [1, 6], atk: [2, 7] },
  barrel: { fw: 128, foot: 98, idle: [0, 1], run: [3, 6], atk: [5, 3], die: [5, 3] },
  warrior: { fw: 192, foot: 135, idle: [0, 6], run: [1, 6], atk: [2, 6], atk2: [3, 6] },
  archer: { fw: 192, foot: 133, idle: [0, 6], run: [1, 6], atk: [4, 8] },
  pawn: { fw: 192, foot: 127, idle: [0, 6], run: [1, 6], atk: [2, 6], atk2: [3, 6] },
} satisfies Record<string, Layout>;

export interface UnitArt { img: string; layout: Layout; scale: number; filter?: string; hat?: [string, string] }
/** Look of every unit: sheet, layout, size in the world, recolour filter. */
export const UNIT_ART: Record<string, UnitArt> = {
  // goblin horde
  grunt: { img: 'torchRed', layout: L.torch, scale: 0.47 },
  runner: { img: 'torchYellow', layout: L.torch, scale: 0.44 },
  spitter: { img: 'tntPurple', layout: L.tnt, scale: 0.47 },
  sapper: { img: 'barrelRed', layout: L.barrel, scale: 0.55 },
  brute: { img: 'torchRed', layout: L.torch, scale: 0.72, filter: 'brightness(0.75) saturate(1.4) contrast(1.1)' },
  knight: { img: 'torchBlue', layout: L.torch, scale: 0.57, filter: 'saturate(0.5) brightness(1.15)' },
  champion: { img: 'torchPurple', layout: L.torch, scale: 0.78, filter: 'hue-rotate(-50deg) saturate(1.5)' },
  orc: { img: 'warriorRed', layout: L.warrior, scale: 0.55, filter: 'hue-rotate(95deg) saturate(0.85) brightness(0.8)' },
  orc_brute: { img: 'warriorPurple', layout: L.warrior, scale: 0.65, filter: 'hue-rotate(150deg) saturate(1.2) brightness(0.6)' },
  // bosses
  boss: { img: 'torchYellow', layout: L.torch, scale: 1.7, filter: 'saturate(1.5) brightness(1.1)' },
  ogre: { img: 'tntRed', layout: L.tnt, scale: 1.95, filter: 'hue-rotate(70deg) brightness(0.8) saturate(1.3)' },
  necro: { img: 'torchPurple', layout: L.torch, scale: 1.65, filter: 'hue-rotate(30deg) brightness(0.65) saturate(1.6)' },
  warlord: { img: 'warriorRed', layout: L.warrior, scale: 1.6, filter: 'hue-rotate(15deg) saturate(1.6) brightness(0.85)' },
  // heroes
  warden: { img: 'warriorBlue', layout: L.warrior, scale: 0.55 },
  ranger: { img: 'archerBlue', layout: L.archer, scale: 0.55 },
  pyro: { img: 'pawnYellow', layout: L.pawn, scale: 0.55, filter: 'hue-rotate(-25deg) saturate(1.8) brightness(1.05)', hat: ['#a8321e', '#ffcc4a'] },
  summoner: { img: 'pawnPurple', layout: L.pawn, scale: 0.55, filter: 'brightness(0.75) saturate(1.3)', hat: ['#2a1e3d', '#9fff8a'] },
  skeleton: { img: 'pawnBlue', layout: L.pawn, scale: 0.47, filter: 'grayscale(1) brightness(1.55) contrast(1.2)' },
};

const tinted = new Map<string, Img>();
function sheet(a: UnitArt): Img {
  if (!a.filter && !a.hat) return IMG[a.img];
  const key = a.img + '|' + a.filter + '|' + (a.hat ?? '');
  let c = tinted.get(key);
  if (!c) {
    const src = IMG[a.img];
    const cv = document.createElement('canvas');
    cv.width = src.width; cv.height = src.height;
    const g = cv.getContext('2d')!;
    g.filter = a.filter ?? 'none';
    g.drawImage(src, 0, 0);
    g.filter = 'none';
    if (a.hat) drawHats(g, cv, a.layout.fw, a.hat);
    tinted.set(key, (c = cv));
  }
  return c;
}

/** Wizard hats on every frame of a worker sheet (turns the pawns into mages). */
function drawHats(g: CanvasRenderingContext2D, cv: HTMLCanvasElement, fw: number, [hat, band]: [string, string]): void {
  const data = g.getImageData(0, 0, cv.width, cv.height).data;
  for (let fy = 0; fy < cv.height; fy += fw) for (let fx = 0; fx < cv.width; fx += fw) {
    // Top of the head: the highest opaque pixel in the middle third of the frame.
    let top = -1, cx = 0;
    for (let y = fy; y < fy + fw && top < 0; y++) {
      for (let x = fx + fw * 0.3; x < fx + fw * 0.7; x++) if (data[(y * cv.width + Math.floor(x)) * 4 + 3] > 200) { top = y; cx = x; break; }
    }
    if (top < 0) continue;
    const by = top + 12;
    g.fillStyle = hat; g.strokeStyle = 'rgba(20,14,8,0.9)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(cx - 20, by); g.quadraticCurveTo(cx - 2, by - 14, cx + 4, by - 40); g.lineTo(cx + 9, by - 36); g.quadraticCurveTo(cx + 8, by - 12, cx + 22, by); g.closePath(); g.fill(); g.stroke();
    g.beginPath(); g.ellipse(cx + 1, by, 25, 6, 0, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = band; g.fillRect(cx - 14, by - 7, 29, 4);
    g.beginPath(); g.arc(cx + 1, by - 5, 3, 0, Math.PI * 2); g.fill();
  }
}

export function loadArt(): Promise<void> {
  const jobs = Object.entries(SRC).map(([k, src]) => new Promise<void>((res) => {
    const im = new Image();
    im.onload = () => { IMG[k] = im; res(); };
    im.onerror = () => res();
    im.src = src;
  }));
  return Promise.all(jobs).then(() => {
    artReady = Object.keys(IMG).length === Object.keys(SRC).length;
    if (artReady) for (const a of Object.values(UNIT_ART)) sheet(a); // bake recolours up front
  });
}

export type AnimName = 'idle' | 'run' | 'atk' | 'atk2' | 'die';

/**
 * Draws one unit frame with its feet at (x, y). `t` = seconds (looping anims) or 0..1 progress
 * when `progress` is true (attacks). Flash = brief white-hot hit highlight.
 */
export function drawUnit(ctx: CanvasRenderingContext2D, id: string, anim: AnimName, t: number, progress: boolean,
  x: number, y: number, face: number, size = 1, flash = false, fps = 10): boolean {
  const a = UNIT_ART[id];
  if (!artReady || !a) return false;
  const lay = a.layout;
  const [row, n] = lay[anim] ?? lay.atk;
  const f = progress ? Math.min(n - 1, Math.floor(t * n)) : Math.floor(t * fps) % n;
  const s = a.scale * size, fw = lay.fw;
  const img = sheet(a);
  ctx.save();
  ctx.translate(x, y);
  if (face < 0) ctx.scale(-1, 1);
  ctx.drawImage(img, f * fw, row * fw, fw, fw, -fw / 2 * s, -lay.foot * s, fw * s, fw * s);
  if (flash) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha *= 0.55;
    ctx.drawImage(img, f * fw, row * fw, fw, fw, -fw / 2 * s, -lay.foot * s, fw * s, fw * s);
  }
  ctx.restore();
  return true;
}

/** Visible height of a unit sprite in world pixels (for health bars and labels). */
export function unitHeight(id: string, size = 1): number {
  const a = UNIT_ART[id];
  return a ? a.scale * size * (a.layout.foot - 50) : 20;
}

const icons = new Map<string, string>();
/** Square portrait (data URL) of a unit's first idle frame, for the HTML interface. */
export function unitIcon(id: string): string | null {
  const a = UNIT_ART[id];
  if (!artReady || !a) return null;
  let u = icons.get(id);
  if (u) return u;
  const c = document.createElement('canvas');
  c.width = c.height = 96;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  const fw = a.layout.fw, crop = fw * 0.5;
  g.drawImage(sheet(a), fw / 2 - crop / 2, a.layout.foot - crop * 0.95, crop, crop, 0, 0, 96, 96);
  u = c.toDataURL();
  icons.set(id, u);
  return u;
}

/** Plays a one-row effect sheet (explosion, fire) centred at (x, y). */
export function drawFx(ctx: CanvasRenderingContext2D, key: 'explosions' | 'fire', frame: number, x: number, y: number, size: number): void {
  const im = IMG[key];
  if (!im) return;
  const fw = key === 'explosions' ? 192 : 128, n = key === 'explosions' ? 9 : 7;
  const f = Math.max(0, Math.min(n - 1, Math.floor(frame)));
  ctx.drawImage(im, f * fw, 0, fw, fw, x - size / 2, y - size * (key === 'fire' ? 0.8 : 0.55), size, size);
}
