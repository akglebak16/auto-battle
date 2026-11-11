import './style.css';
import { Game, type Meta } from './game';
import { Renderer } from './render';
import { UI } from './ui';
import { play } from './sound';

const SAVE_KEY = 'oplot-save-v2';
const storage = {
  load(): Meta | null {
    try { const raw = localStorage.getItem(SAVE_KEY); return raw ? (JSON.parse(raw) as Meta) : null; } catch { return null; }
  },
  save(m: Meta): void {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(m)); } catch { /* storage unavailable: progress lives in memory */ }
  },
};

const canvas = document.getElementById('game') as HTMLCanvasElement;
const game = new Game({}, Math.random, storage);
const renderer = new Renderer(canvas);
const ui = new UI(game, renderer);
game.events.onChange = () => ui.refresh();
game.events.onSound = play;
ui.refresh();

// Exposed for debugging from the dev tools console: window.game, window.ui
Object.assign(window, { game, ui });

// ---------- camera controls: drag to pan, wheel to zoom, WASD / arrows, H = castle ----------
const cam = renderer.cam;
let drag: { x: number; y: number; moved: boolean } | null = null;
canvas.addEventListener('mousedown', (ev) => { drag = { x: ev.clientX, y: ev.clientY, moved: false }; });
window.addEventListener('mousemove', (ev) => {
  if (!drag) return;
  const rect = canvas.getBoundingClientRect();
  const k = canvas.width / rect.width;
  const dx = (ev.clientX - drag.x) * k, dy = (ev.clientY - drag.y) * k;
  if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
  if (drag.moved) { cam.pan(-dx, -dy); drag.x = ev.clientX; drag.y = ev.clientY; }
});
window.addEventListener('mouseup', (ev) => {
  if (drag && !drag.moved && ev.target === canvas) ui.selectHeroAt(ev);
  drag = null;
});
canvas.addEventListener('wheel', (ev) => {
  ev.preventDefault();
  const p = renderer.canvasPoint(ev);
  cam.zoomAt(ev.deltaY < 0 ? 1.12 : 1 / 1.12, p.x, p.y);
}, { passive: false });
const keys = new Set<string>();
window.addEventListener('keydown', (ev) => {
  keys.add(ev.code);
  if (ev.code === 'KeyH') cam.home();
});
window.addEventListener('keyup', (ev) => keys.delete(ev.code));
window.addEventListener('blur', () => keys.clear());

const STEP = 1 / 60;
let acc = 0;
let lastT = performance.now();

function frame(now: number): void {
  const elapsed = Math.min(0.1, (now - lastT) / 1000);
  lastT = now;
  const pan = 700 * elapsed;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) cam.pan(-pan, 0);
  if (keys.has('KeyD') || keys.has('ArrowRight')) cam.pan(pan, 0);
  if (keys.has('KeyW') || keys.has('ArrowUp')) cam.pan(0, -pan);
  if (keys.has('KeyS') || keys.has('ArrowDown')) cam.pan(0, pan);
  if (!ui.paused) {
    acc += elapsed * ui.speed;
    let steps = 0;
    // Fixed timestep keeps the simulation identical at any speed / frame rate.
    while (acc >= STEP && steps < 16) {
      game.update(STEP);
      acc -= STEP;
      steps++;
    }
    if (steps === 16) acc = 0;
  }
  renderer.draw(game);
  ui.tick();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
