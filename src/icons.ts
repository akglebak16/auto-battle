// Icon helper. Pure string output (headless-safe): <i class="pi"> shows one cell of the atlas from
// iconData.ts via CSS custom properties; the atlas itself is attached in main.ts.
import { ICON_COLS, ICON_COUNT, ICON_INDEX } from './iconData';

export const ICON_ROWS = Math.ceil(ICON_COUNT / ICON_COLS);
export { ICON_COLS };
export type IconKind = 'item' | 'skill' | 'spell' | 'order' | 'enemy' | 'branch' | 'node' | 'relic' | 'event' | 'biome' | 'ui';

/** Atlas cell of an icon, e.g. iconCell('ui_gem'). */
export function iconCell(name: string): { x: number; y: number } {
  const i = ICON_INDEX[name];
  if (i === undefined) throw new Error(`missing icon ${name}`);
  return { x: i % ICON_COLS, y: Math.floor(i / ICON_COLS) };
}

/** ic('item', 'rusty_sword') -> markup for the icon (96x96 in the atlas) scaled to the surrounding font-size. */
export function ic(kind: IconKind, id: string): string {
  const { x, y } = iconCell(`${kind}_${id}`);
  return `<i class="pi" style="--x:${x};--y:${y}"></i>`;
}

const u = (id: string) => ic('ui', id);
/** Interface glyphs (replace the emoji that used to sit in UI strings). */
export const U = {
  gem: u('gem'), coin: u('coin'), lock: u('lock'), swords: u('swords'), castle: u('castle'), trophy: u('trophy'), skull: u('skull'),
  soundOn: u('sound_on'), soundOff: u('sound_off'), bolt: u('bolt'), check: u('check'), book: u('book'), pin: u('pin'), cart: u('cart'),
  blood: u('blood'), cards: u('cards'), sparkle: u('sparkle'), music: u('music'), search: u('search'), heart: u('heart'), shield: u('shield'),
  target: u('target'), recycle: u('recycle'), forge: u('forge'), up: u('up'), bow: u('bow'), globe: u('globe'), flag: u('flag'),
  blackflag: u('blackflag'), star: u('star'), burst: u('burst'), bag: u('bag'), bricks: u('bricks'), dice: u('dice'),
  mentor: ic('node', 'mentor'), vase: ic('node', 'relic_hunter'),
};
