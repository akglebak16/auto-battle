// Player settings (saved in the browser): volumes, interface size and comfort toggles.
export interface Settings { sfx: number; music: number; ui: number; shake: boolean; gore: boolean; numbers: boolean; fx: boolean }

const KEY = 'oplot-settings-v1';
export const settings: Settings = { sfx: 0.5, music: 0.35, ui: 1, shake: true, gore: true, numbers: true, fx: true };

try { Object.assign(settings, JSON.parse(localStorage.getItem(KEY) ?? '{}')); } catch { /* defaults */ }

export function saveSettings(): void {
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* ignore */ }
}
