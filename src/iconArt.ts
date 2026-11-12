// Canvas side of the icon atlas: the same icons the DOM shows through <i class="pi">, drawn on the
// battlefield (elite marks, stun, loot popups). DOM-only, like art.ts — the simulation never calls it.
import { ICON_ATLAS } from './iconData';
import { iconCell } from './icons';

const CELL = 96; // atlas cell, see scripts/gen-icons.py
const img = new Image();
export let iconsReady = false;
img.onload = () => { iconsReady = true; };
img.src = ICON_ATLAS;

// Debug handle for the browser console and the test harness.
(window as unknown as { iconArt?: unknown }).iconArt = { drawIcon, drawIconText, ready: () => iconsReady };

/** Draws an icon centred on (cx, cy), `size` pixels wide. */
export function drawIcon(ctx: CanvasRenderingContext2D, name: string, cx: number, cy: number, size: number): void {
  if (!iconsReady) return;
  const { x, y } = iconCell(name);
  ctx.drawImage(img, x * CELL, y * CELL, CELL, CELL, Math.round(cx - size / 2), Math.round(cy - size / 2), size, size);
}

/**
 * Centred label where `{icon_name}` tokens become icons, e.g. `+12{ui_coin} +3{ui_gem}`.
 * Falls back to plain text (tokens stripped) until the atlas has loaded.
 */
export function drawIconText(ctx: CanvasRenderingContext2D, text: string, cx: number, y: number, size: number, stroke = true): void {
  const parts = text.split(/\{([a-z0-9_]+)\}/i); // even = text, odd = icon name
  let w = 0;
  for (let i = 0; i < parts.length; i++) w += i % 2 ? (iconsReady ? size : 0) : ctx.measureText(parts[i]).width;
  const prev = ctx.textAlign;
  ctx.textAlign = 'left';
  let x = cx - w / 2;
  for (let i = 0; i < parts.length; i++) {
    if (i % 2) { if (iconsReady) { drawIcon(ctx, parts[i], x + size / 2, y - size * 0.35, size); x += size; } }
    else { if (stroke) ctx.strokeText(parts[i], x, y); ctx.fillText(parts[i], x, y); x += ctx.measureText(parts[i]).width; }
  }
  ctx.textAlign = prev;
}
