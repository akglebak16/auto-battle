// Synthesised sound effects (Web Audio, no audio files). Frequent sounds are rate-limited
// so hundreds of goblins don't turn into noise.
import type { Sfx } from './game';

type Voice = (ac: AudioContext, out: AudioNode, t: number) => void;

let ac: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let muted = false;
let volume = 0.5;
const lastPlayed: Partial<Record<Sfx, number>> = {};

// Minimum gap between two plays of the same sound (seconds).
const GAP: Partial<Record<Sfx, number>> = {
  arrow: 0.07, fireball: 0.1, tower: 0.15, hit: 0.08, kill: 0.05, boom: 0.12, castle: 0.25, coin: 0.05,
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

export function setMuted(m: boolean): void { muted = m; }
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
