// Synthesised sound effects (Web Audio, no audio files). Frequent sounds are rate-limited
// so hundreds of goblins don't turn into noise.
import type { Sfx } from './game';

type Voice = (ac: AudioContext, out: AudioNode, t: number) => void;

let ac: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let muted = false;
let volume = 0.5;
let musicVol = 0.35;
let musicGain: GainNode | null = null;
const lastPlayed: Partial<Record<Sfx, number>> = {};

// Minimum gap between two plays of the same sound (seconds).
const GAP: Partial<Record<Sfx, number>> = {
  squish: 0.06, summon: 0.2, drain: 0.2, arrow: 0.07, fireball: 0.1, tower: 0.15, hit: 0.08, kill: 0.05, boom: 0.12, castle: 0.25, coin: 0.05,
};

function ctx(): AudioContext | null {
  if (ac) return ac;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  ac = new AC();
  master = ac.createGain();
  master.gain.value = volume;
  const comp = ac.createDynamicsCompressor();
  master.connect(comp).connect(ac.destination);
  musicGain = ac.createGain();
  musicGain.gain.value = muted ? 0 : musicVol;
  musicGain.connect(comp);
  noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return ac;
}

/** Browsers start audio only after a user gesture — call this from any click/key handler. */
export function unlockAudio(): void {
  const a = ctx();
  if (a && a.state === 'suspended') void a.resume();
}

export function setMuted(m: boolean): void { muted = m; if (musicGain) musicGain.gain.value = m ? 0 : musicVol; }
export function setMusicVolume(v: number): void { musicVol = v; if (musicGain) musicGain.gain.value = muted ? 0 : v; }

// ---------- adaptive music: picks a procedural theme by game state ----------
let rockUntil = 0;

/** Feed the music the current game state: menu / camp / battle / boss / rock (combo 50+). */
export function setMusicState(phase: string, boss: boolean, combo: number): void {
  const battle = phase === 'battle';
  if (battle && combo >= 50) rockUntil = performance.now() + 5000; // hold the riff a while
  setMusic(!battle ? (phase === 'gameover' ? null : phase === 'menu' ? 'menu' : 'camp')
    : performance.now() < rockUntil ? 'rock' : boss ? 'boss' : 'battle');
}
export function getVolumes(): { sfx: number; music: number } { return { sfx: volume, music: musicVol }; }
export function isMuted(): boolean { return muted; }
export function setVolume(v: number): void { volume = v; if (master) master.gain.value = v; }

export function play(s: Sfx): void {
  if (muted) return;
  const a = ctx();
  if (!a || !master || a.state !== 'running') return;
  const now = a.currentTime;
  const gap = GAP[s] ?? 0;
  if (gap && (lastPlayed[s] ?? -1) + gap > now) return;
  lastPlayed[s] = now;
  VOICES[s]?.(a, master, now);
}

// ---------- building blocks ----------

function tone(a: AudioContext, out: AudioNode, t: number, type: OscillatorType, f0: number, f1: number, dur: number, vol: number, delay = 0): void {
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t + delay);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + delay + dur);
  g.gain.setValueAtTime(0.0001, t + delay);
  g.gain.exponentialRampToValueAtTime(vol, t + delay + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + delay + dur);
  o.connect(g).connect(out);
  o.start(t + delay);
  o.stop(t + delay + dur + 0.02);
}

function noise(a: AudioContext, out: AudioNode, t: number, dur: number, vol: number, filter: BiquadFilterType, f0: number, f1: number, delay = 0): void {
  const src = a.createBufferSource();
  src.buffer = noiseBuf;
  const bq = a.createBiquadFilter();
  bq.type = filter;
  bq.frequency.setValueAtTime(f0, t + delay);
  bq.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + delay + dur);
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t + delay);
  g.gain.exponentialRampToValueAtTime(vol, t + delay + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + delay + dur);
  src.connect(bq).connect(g).connect(out);
  src.start(t + delay, Math.random() * 0.5);
  src.stop(t + delay + dur + 0.02);
}

const notes = (a: AudioContext, out: AudioNode, t: number, freqs: number[], step: number, type: OscillatorType, vol: number, len = 0.25) =>
  freqs.forEach((f, i) => tone(a, out, t, type, f, f, len, vol, i * step));

// ---------- the sounds ----------

const VOICES: Partial<Record<Sfx, Voice>> = {
  squish: (a, o, t) => { noise(a, o, t, 0.12, 0.14, 'lowpass', 900 + Math.random() * 500, 150); tone(a, o, t, 'sine', 160 + Math.random() * 60, 60, 0.1, 0.06); },
  roar: (a, o, t) => { tone(a, o, t, 'sawtooth', 110, 55, 0.9, 0.18); tone(a, o, t, 'sawtooth', 82, 41, 1.0, 0.12, 0.05); noise(a, o, t, 0.9, 0.2, 'lowpass', 700, 120); },
  summon: (a, o, t) => { tone(a, o, t, 'triangle', 220, 440, 0.3, 0.08); tone(a, o, t, 'sine', 330, 660, 0.35, 0.05, 0.05); noise(a, o, t, 0.3, 0.06, 'highpass', 3000, 1200); },
  drain: (a, o, t) => { tone(a, o, t, 'sine', 600, 200, 0.4, 0.07); tone(a, o, t, 'triangle', 300, 120, 0.45, 0.05, 0.05); },
  arrow: (a, o, t) => noise(a, o, t, 0.09, 0.12, 'bandpass', 3000, 1200),
  tower: (a, o, t) => noise(a, o, t, 0.08, 0.06, 'bandpass', 2200, 900),
  fireball: (a, o, t) => { noise(a, o, t, 0.25, 0.12, 'lowpass', 1800, 300); tone(a, o, t, 'sawtooth', 220, 90, 0.2, 0.03); },
  hit: (a, o, t) => { noise(a, o, t, 0.07, 0.18, 'lowpass', 2500, 400); tone(a, o, t, 'square', 140, 70, 0.06, 0.04); },
  kill: (a, o, t) => tone(a, o, t, 'triangle', 300 + Math.random() * 120, 120, 0.08, 0.05),
  boom: (a, o, t) => { noise(a, o, t, 0.35, 0.25, 'lowpass', 900, 80); tone(a, o, t, 'sine', 110, 40, 0.3, 0.2); },
  bash: (a, o, t) => { tone(a, o, t, 'square', 180, 60, 0.15, 0.15); noise(a, o, t, 0.15, 0.2, 'lowpass', 1500, 200); },
  taunt: (a, o, t) => { tone(a, o, t, 'sawtooth', 130, 110, 0.5, 0.12); tone(a, o, t, 'sawtooth', 196, 165, 0.5, 0.08); },
  volley: (a, o, t) => { for (let i = 0; i < 4; i++) noise(a, o, t, 0.08, 0.1, 'bandpass', 3200, 1300, i * 0.04); },
  pierce: (a, o, t) => { noise(a, o, t, 0.2, 0.18, 'highpass', 5000, 1500); tone(a, o, t, 'sine', 900, 300, 0.2, 0.06); },
  meteor: (a, o, t) => { noise(a, o, t, 0.6, 0.35, 'lowpass', 1200, 50); tone(a, o, t, 'sine', 90, 30, 0.6, 0.3); },
  levelup: (a, o, t) => notes(a, o, t, [523, 659, 784, 1047], 0.07, 'triangle', 0.12),
  herodeath: (a, o, t) => notes(a, o, t, [392, 330, 262, 196], 0.12, 'sawtooth', 0.06, 0.3),
  castle: (a, o, t) => { noise(a, o, t, 0.2, 0.15, 'lowpass', 400, 80); tone(a, o, t, 'sine', 70, 40, 0.2, 0.15); },
  horn: (a, o, t) => { tone(a, o, t, 'sawtooth', 147, 147, 0.9, 0.09); tone(a, o, t, 'sawtooth', 220, 220, 0.9, 0.06, 0.05); tone(a, o, t, 'sawtooth', 294, 294, 0.6, 0.05, 0.35); },
  victory: (a, o, t) => notes(a, o, t, [392, 523, 659, 784], 0.1, 'square', 0.06, 0.3),
  defeat: (a, o, t) => notes(a, o, t, [330, 311, 294, 262, 196], 0.18, 'triangle', 0.12, 0.45),
  recruit: (a, o, t) => notes(a, o, t, [440, 554, 659, 880], 0.09, 'triangle', 0.12, 0.35),
  coin: (a, o, t) => { tone(a, o, t, 'square', 988, 988, 0.06, 0.05); tone(a, o, t, 'square', 1319, 1319, 0.15, 0.05, 0.06); },
  pick: (a, o, t) => notes(a, o, t, [659, 988], 0.06, 'triangle', 0.1, 0.2),
};

// ---------- background music (procedural, no files) ----------
// menu: slow pad + bell melody; camp: soft chord arpeggio; battle: war drums + minor riff;
// boss: heavy drums and drones; rock: distorted guitar riff for big combos.
export type Music = 'menu' | 'camp' | 'battle' | 'boss' | 'rock' | null;
let music: Music = null;
let nextBeat = 0;
let beat = 0;
let timer: number | null = null;
let distortion: WaveShaperNode | null = null;

const A_MINOR = [110, 130.81, 146.83, 164.81, 196, 220];
const CHORDS = [[220, 261.6, 329.6], [174.6, 220, 261.6], [261.6, 329.6, 392], [196, 246.9, 293.7]];
const MENU_CHORDS = [[146.8, 220, 261.6], [130.8, 196, 246.9], [116.5, 174.6, 233.1], [110, 164.8, 220]];
const MENU_BELLS = [880, 0, 784, 0, 659, 0, 0, 0, 587, 0, 659, 0, 523, 0, 0, 0];
const BPM: Record<Exclude<Music, null>, number> = { menu: 60, camp: 72, battle: 132, boss: 96, rock: 168 };

export function setMusic(m: Music): void {
  if (m === music) return;
  music = m;
  const a = ctx();
  if (!a) return;
  nextBeat = a.currentTime + 0.1;
  beat = 0;
  if (timer === null) timer = window.setInterval(schedule, 100);
}

/** Overdrive chain for the rock guitar (built once). */
function drive(a: AudioContext, out: AudioNode): WaveShaperNode {
  if (!distortion) {
    distortion = a.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < curve.length; i++) { const x = i / 512 - 1; curve[i] = Math.tanh(x * 6); }
    distortion.curve = curve;
    const lp = a.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 2400;
    const g = a.createGain();
    g.gain.value = 0.35;
    distortion.connect(lp).connect(g).connect(out);
  }
  return distortion;
}

function schedule(): void {
  const a = ac;
  if (!a || !musicGain || a.state !== 'running' || !music) return;
  const out = musicGain;
  const step = 60 / BPM[music] / 2; // eighth notes
  while (nextBeat < a.currentTime + 0.25) {
    const t = nextBeat, b = beat % 16, bar = Math.floor(beat / 16);
    switch (music) {
      case 'menu': {
        const ch = MENU_CHORDS[bar % 4];
        if (b === 0) for (const f of ch) tone(a, out, t, 'sine', f, f, step * 16, 0.03);
        const bell = MENU_BELLS[b];
        if (bell && bar % 2 === 1) tone(a, out, t, 'triangle', bell, bell, step * 3, 0.03);
        break;
      }
      case 'camp': {
        const ch = CHORDS[bar % 4];
        if (b === 0) for (const f of ch) tone(a, out, t, 'sine', f / 2, f / 2, step * 15, 0.035);
        if (b % 2 === 0) { const f = ch[(b / 2) % 3] * (b % 8 < 4 ? 1 : 2); tone(a, out, t, 'triangle', f, f, step * 1.6, 0.045); }
        break;
      }
      case 'battle': {
        if (b % 4 === 0) tone(a, out, t, 'sine', 120, 40, 0.25, 0.5); // kick
        if (b === 4 || b === 12) noise(a, out, t, 0.12, 0.18, 'bandpass', 1800, 900); // snare
        if (b === 14 || b === 15) tone(a, out, t, 'sine', 180, 90, 0.15, 0.25); // toms
        noise(a, out, t, 0.03, 0.03, 'highpass', 8000, 6000); // hat
        const riff = bar % 4 === 3 ? [0, 0, 5, 0, 4, 3, 4, 5] : [0, 0, 3, 0, 4, 3, 2, 1];
        if (b % 2 === 0) { const f = A_MINOR[riff[(b / 2) % 8]] / 2; tone(a, out, t, 'sawtooth', f, f, step * 1.8, 0.05); }
        break;
      }
      case 'boss': {
        if (b === 0 || b === 3 || b === 8 || b === 11) tone(a, out, t, 'sine', 90, 30, 0.45, 0.6); // heavy drum
        if (b === 8) noise(a, out, t, 0.35, 0.22, 'lowpass', 900, 200);
        if (b === 0) { tone(a, out, t, 'sawtooth', 55, 55, step * 16, 0.06); tone(a, out, t, 'sine', 41.2, 41.2, step * 16, 0.12); } // drone
        if (b === 6 || b === 14) {
          const f = bar % 2 ? 77.8 : 82.4;
          tone(a, out, t, 'square', f * 2, f * 2, step * 1.5, 0.05); tone(a, out, t, 'square', f * 2 * 1.414, f * 2 * 1.414, step * 1.5, 0.035); // tritone stab
        }
        noise(a, out, t, 0.02, b % 2 ? 0.012 : 0.02, 'highpass', 9000, 7000);
        break;
      }
      case 'rock': {
        const gtr = drive(a, out);
        if (b % 4 === 0 || b === 6) tone(a, out, t, 'sine', 140, 45, 0.18, 0.55);
        if (b % 8 === 4) noise(a, out, t, 0.14, 0.25, 'bandpass', 2000, 1200);
        noise(a, out, t, 0.025, 0.035, 'highpass', 9000, 7000);
        const f = [82.4, 82.4, 98, 110, 82.4, 82.4, 73.4, 98][(bar % 2) * 4 + Math.floor(b / 4)];
        if (b % 2 === 0 || b % 4 === 3) {
          tone(a, gtr, t, 'sawtooth', f, f, step * 0.9, 0.5); tone(a, gtr, t, 'sawtooth', f * 1.5, f * 1.5, step * 0.9, 0.4); tone(a, gtr, t, 'square', f * 2, f * 2, step * 0.9, 0.25);
        }
        break;
      }
    }
    nextBeat += step;
    beat++;
  }
}
