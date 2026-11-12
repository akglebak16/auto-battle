// Pixel-art icon helper. Pure string output (headless-safe): <i class="pi"> shows one cell of the
// atlas from iconData.ts via CSS custom properties; the atlas itself is attached in main.ts.
import { ICON_COLS, ICON_NAMES } from './iconData';

const idx = new Map<string, number>(ICON_NAMES.map((n, i) => [n, i]));
export const ICON_ROWS = Math.ceil(ICON_NAMES.length / ICON_COLS);
export { ICON_COLS };

/** ic('item', 'rusty_sword') -> markup for the 32x32 icon scaled to the surrounding font-size. */
export function ic(kind: 'item' | 'skill' | 'spell' | 'order', id: string): string {
  const i = idx.get(`${kind}_${id}`);
  if (i === undefined) throw new Error(`missing icon ${kind}_${id}`);
  return `<i class="pi" style="--x:${i % ICON_COLS};--y:${Math.floor(i / ICON_COLS)}"></i>`;
}
