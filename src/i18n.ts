// Language: Russian (source) or English. Every player-facing string is written as L('рус', 'eng')
// right where it is used, so a translation never drifts away from its original.
// The language is fixed once at startup (saved choice, else the browser language); switching reloads the page.
// No DOM here: the headless simulator imports this too (there it is always Russian).

export type Lang = 'ru' | 'en';
export const LANG_KEY = 'oplot-lang';

function detect(): Lang {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === 'ru' || saved === 'en') return saved;
  } catch { return 'ru'; } // no storage (simulator) — Russian
  try {
    const nav = (globalThis as { navigator?: { languages?: readonly string[]; language?: string } }).navigator;
    const code = (nav?.languages?.[0] ?? nav?.language ?? 'ru').toLowerCase();
    // Russian for the CIS languages whose players read it; English for everyone else.
    return /^(ru|uk|be|kk|ky|uz|tg|hy|az|ka)\b/.test(code) ? 'ru' : 'en';
  } catch { return 'ru'; }
}

export const lang: Lang = detect();
export const isEn = lang === 'en';

/** Pick the string for the current language. */
export const L = (ru: string, en: string): string => (isEn ? en : ru);

/** Game title shown in the menu, the window and the store page. */
export const GAME_TITLE = L('Оплот: Осада', 'Bulwark: Siege');

/** English plural: "1 enemy" / "5 enemies". */
export const pl = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;
