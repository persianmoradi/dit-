// Pure score data and timing maths for src/audio.ts. No AudioContext, no DOM: asserted by audioScore.check.ts.
// Times in a ScoreEvent are seconds from the start of its bar; the engine adds the bar's context time.

export type Rng = () => number;
export const mulberry32 = (seed: number): Rng => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const between = (rng: Rng, a: number, b: number) => a + (b - a) * rng();

export const dbToGain = (db: number) => 10 ** (db / 20);
export const gainToDb = (g: number) => 20 * Math.log10(g);

// ---- notes
const SEMI: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
export const midi = (n: string) => {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(n);
  if (!m) throw new Error(`bad note ${n}`);
  return 12 * (+m[3] + 1) + SEMI[m[1]] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0);
};
export const freq = (m: number | string) => 440 * 2 ** (((typeof m === "string" ? midi(m) : m) - 69) / 12);
export const G_MAJOR: readonly number[] = [7, 9, 11, 0, 2, 4, 6];
export const F_MAJOR: readonly number[] = [5, 7, 9, 10, 0, 2, 4];
export const inKey = (m: number, scale: readonly number[]) => scale.includes(m % 12);
export const stepUp = (m: number, scale: readonly number[]) => {
  let x = m + 1;
  while (!inKey(x, scale)) x++;
  return x;
};

export type Voice = "lead" | "bass" | "pluck" | "kick" | "shaker" | "pad" | "box";
export interface ScoreEvent {
  voice: Voice;
  t: number; // s from bar start
  dur: number; // s
  m?: number; // midi note
  notes?: number[]; // pad chord
  sub?: number; // pad sub-octave midi
  vel: number; // 0..1
  db?: number; // extra gain
  cents?: number;
  pan?: number;
  accent?: boolean; // shaker on-beat
}
type N = readonly [beat: number, dur: number, note: string];

// ---- day: "Pocket Marmalade", G major, 100 bpm, 4/4, 16 bars
export const DAY_BEAT = 0.6;
export const DAY_BARS = 16;
export const DAY_METER = 4;
const CH = {
  G: { comp: ["G3", "B3", "D4"], root: "G2", fifth: "D3" },
  Bm7: { comp: ["B3", "D4", "F#4"], root: "B2", fifth: "F#3" },
  Cmaj7: { comp: ["G3", "B3", "E4"], root: "C3", fifth: "G3" },
  D: { comp: ["A3", "D4", "F#4"], root: "D3", fifth: "A3" },
  Em7: { comp: ["B3", "D4", "E4"], root: "E3", fifth: "B3" },
  Am7: { comp: ["C4", "E4", "G4"], root: "A2", fifth: "E3" },
} as const;
export const DAY_FORM = [
  "G", "Bm7", "Cmaj7", "D", "G", "Em7", "Am7", "D", "Cmaj7", "Em7", "Am7", "D", "G", "Bm7", "Cmaj7", "D",
] as const satisfies readonly (keyof typeof CH)[];
export const DAY_LEAD: readonly (readonly N[])[] = [
  [[0, 0.5, "B4"], [0.5, 0.5, "D5"], [1, 1, "G5"], [2, 0.5, "F#5"], [2.5, 0.5, "D5"], [3, 1, "B4"]],
  [[0, 0.5, "D5"], [0.5, 0.5, "F#5"], [1, 1, "A5"], [2, 1, "F#5"], [3, 1, "D5"]],
  [[0, 1, "E5"], [1, 0.5, "G5"], [1.5, 0.5, "B5"], [2, 1.5, "G5"], [3.5, 0.5, "E5"]],
  [[0, 0.5, "F#5"], [0.5, 0.5, "A5"], [1, 1, "D6"], [2, 2, "A5"]],
  [[0, 0.5, "B4"], [0.5, 0.5, "D5"], [1, 1, "G5"], [2, 0.5, "A5"], [2.5, 0.5, "B5"], [3, 1, "D6"]],
  [[0, 1, "B5"], [1, 0.5, "G5"], [1.5, 0.5, "E5"], [2, 1, "G5"], [3, 1, "B4"]],
  [[0, 0.5, "C5"], [0.5, 0.5, "E5"], [1, 1, "A5"], [2, 1, "G5"], [3, 1, "E5"]],
  [[0, 1, "F#5"], [1, 1, "A4"], [2, 2, "D5"]],
  [[0, 1.5, "E5"], [1.5, 0.5, "D5"], [2, 1, "E5"], [3, 1, "G5"]],
  [[0, 1.5, "B5"], [1.5, 0.5, "A5"], [2, 1, "G5"], [3, 1, "E5"]],
  [[0, 1, "A5"], [1, 0.5, "G5"], [1.5, 0.5, "E5"], [2, 1, "C6"], [3, 1, "B5"]],
  [[0, 1, "A5"], [1, 1, "F#5"], [2, 1, "G5"], [3, 1, "F#5"]],
  [[0, 0.5, "B4"], [0.5, 0.5, "D5"], [1, 1, "G5"], [2, 0.5, "F#5"], [2.5, 0.5, "E5"], [3, 1, "D5"]],
  [[0, 0.5, "D5"], [0.5, 0.5, "F#5"], [1, 1, "A5"], [2, 2, "B5"]],
  [[0, 1, "E5"], [1, 0.5, "G5"], [1.5, 0.5, "E5"], [2, 1, "D5"], [3, 1, "B4"]],
  [[0, 0.5, "A4"], [0.5, 0.5, "D5"], [1, 0.5, "F#5"], [1.5, 0.5, "A5"], [2, 2, "F#5"]],
];
export const DAY_NOTES = (): string[] => [
  ...DAY_LEAD.flatMap((b) => b.map((n) => n[2])),
  ...Object.values(CH).flatMap((c) => [...c.comp, c.root, c.fifth]),
];

export interface DayVariant { tailUp: boolean; thin: boolean; fill: boolean }
/** Fixed roll order (tail, thin, fill) so a seeded rng reproduces the same loop. */
export const pickDayVariant = (rng: Rng, bar: number, prevThin: boolean): DayVariant => {
  const tailUp = rng() < 0.2;
  const thin = rng() < 0.1 && !prevThin;
  const fill = rng() < 0.15 && bar % 4 === 3;
  return { tailUp, thin, fill };
};

/** One bar of the day loop. pass = loop count (0 = first: bars 1-2 are a lead-only intro). */
export function dayBar(bar: number, pass: number, rng: Rng, prevThin = false): { events: ScoreEvent[]; thin: boolean } {
  const B = DAY_BEAT;
  const v = pickDayVariant(rng, bar, prevThin);
  const human = () => (rng() * 2 - 1) * 0.006;
  const vel = (down: boolean) => (down ? 1 : between(rng, 0.8, 1));
  const cents = () => (rng() * 2 - 1) * 3;
  const ch = CH[DAY_FORM[bar]];
  const ev: ScoreEvent[] = [];

  let lead = DAY_LEAD[bar].map((n) => ({ beat: n[0], dur: n[1], m: midi(n[2]) }));
  if (v.thin && lead.length > 2) lead = [lead[0], lead[lead.length - 1]];
  if (v.tailUp) lead[lead.length - 1] = { ...lead[lead.length - 1], m: stepUp(lead[lead.length - 1].m, G_MAJOR) };
  const double = pass % 2 === 1 && bar >= 12;
  for (const n of lead) {
    const t = Math.max(0, n.beat * B + human());
    const e = { voice: "lead" as const, t, dur: n.dur * B, vel: vel(n.beat === 0), cents: cents() };
    ev.push({ ...e, m: n.m });
    if (double) ev.push({ ...e, m: n.m + 12, db: -12 });
  }
  if (pass === 0 && bar < 2) return { events: ev, thin: v.thin }; // lead-only intro

  const root = midi(ch.root);
  const bass = [[0, 0.9, root], [1.5, 0.5, midi(ch.fifth)], [2, 0.9, root], [3, 0.5, midi(ch.fifth)], ...(bar % 4 === 3 ? [[3.5, 0.5, root + 12]] : [])];
  for (const [beat, dur, m] of bass) ev.push({ voice: "bass", t: Math.max(0, beat * B + human()), dur: dur * B, m, vel: vel(beat === 0), cents: cents() });

  const strums = bar % 4 === 0 ? [0, 1.5, 3.5] : [1.5, 3.5];
  for (const beat of strums) {
    ch.comp.forEach((n, i) => ev.push({ voice: "pluck", t: beat * B + i * 0.012 + Math.max(0, human()), dur: 0.4 * B, m: midi(n), vel: vel(beat === 0), cents: cents() }));
  }
  for (const beat of [0, 2]) ev.push({ voice: "kick", t: beat * B, dur: 0.15, vel: 1 });
  let side = 1;
  const shake = (beat: number) => ev.push({ voice: "shaker", t: Math.max(0, beat * B + human()), dur: 0.06, vel: Number.isInteger(beat) ? 0.55 : 1, accent: Number.isInteger(beat), pan: 0.2 * (side = -side) });
  for (let b = 0; b < 4; b += 0.5) shake(b);
  if (v.fill) {
    shake(3.25); shake(3.75);
    [...ch.comp.map(midi), midi(ch.comp[0]) + 12].forEach((m, i) => ev.push({ voice: "lead", t: (3 + i * 0.25) * B, dur: 0.25 * B, m: m + 12, vel: vel(false), cents: cents() }));
  }
  return { events: ev, thin: v.thin };
}

// ---- sleep: "Cloud Count", F major, 60 bpm, 3/4, 12 bars
export const LULL_BEAT = 1;
export const LULL_BARS = 12;
export const LULL_METER = 3;
const F = ["F3", "A3", "C4", "E4"], DM = ["D3", "F3", "A3", "C4"], BB = ["Bb2", "F3", "A3", "D4"], GM = ["G2", "D3", "F3", "Bb3"];
export const LULL_CHORDS: readonly (readonly string[])[] = [F, DM, BB, ["C3", "G3", "D4"], F, ["A2", "E3", "G3", "C4"], BB, GM, DM, BB, GM, ["F2", "C3", "A3", "G4"]];
export const LULL_MEL: readonly (readonly N[])[] = [
  [[1, 1, "A5"], [2, 1, "C6"]], [[0, 2, "D6"], [2, 1, "C6"]], [[0, 1, "A5"], [1, 1, "F5"], [2, 1, "D5"]], [[0, 2, "E5"], [2, 1, "G5"]],
  [[1, 1, "A5"], [2, 1, "C6"]], [[0, 1.5, "E6"], [1.5, 0.5, "D6"], [2, 1, "C6"]], [[0, 2, "D6"], [2, 1, "A5"]], [[0, 1, "G5"], [1, 1, "Bb5"], [2, 1, "D6"]],
  [[0, 2, "F6"], [2, 1, "E6"]], [[0, 1, "D6"], [1, 2, "C6"]], [[0, 1, "Bb5"], [1, 1, "G5"], [2, 1, "E5"]], [[0, 3, "F5"]],
];
export const LULL_NOTES = (): string[] => [...LULL_CHORDS.flat(), ...LULL_MEL.flatMap((b) => b.map((n) => n[2]))];

export interface LullVariant { dropFirst: boolean; echo: boolean }
export const pickLullVariant = (rng: Rng): LullVariant => ({ dropFirst: rng() < 0.3, echo: rng() < 0.15 });

/** loop = how many times the 12 bars have played (bar 6 drops an octave every 3rd loop). */
export function lullabyBar(bar: number, loop: number, rng: Rng): ScoreEvent[] {
  const B = LULL_BEAT;
  const chord = LULL_CHORDS[bar].map(midi);
  const ev: ScoreEvent[] = [{ voice: "pad", t: 0, dur: LULL_METER * B + 0.15, notes: chord, sub: chord[0] - 12, vel: 1 }];
  const v = pickLullVariant(rng);
  let mel = LULL_MEL[bar].map((n) => ({ beat: n[0], dur: n[1], m: midi(n[2]) }));
  if (v.dropFirst && mel.length > 1) mel = mel.slice(1);
  if (bar === 5 && loop % 3 === 2) mel = mel.map((n) => ({ ...n, m: n.m - 12 }));
  for (const n of mel) ev.push({ voice: "box", t: Math.max(0, n.beat * B + (rng() * 2 - 1) * 0.004), dur: n.dur * B, m: n.m, vel: 1 });
  const last = mel[mel.length - 1];
  if (v.echo) ev.push({ voice: "box", t: (last.beat + 1) * B, dur: last.dur * B, m: last.m, vel: 1, db: -9 });
  return ev;
}

// ---- crossfade: day = cos(th), sleep = sin(th): g1^2 + g2^2 = 1 at every point
export const XFADE_SECONDS = 1.5;
export const angleOf = (day: number, sleep: number) => Math.atan2(sleep, day);
export function xfadeCurves(th0: number, th1: number, n = 64) {
  const day = new Float32Array(n), sleep = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const th = th0 + (th1 - th0) * (i / (n - 1));
    day[i] = Math.cos(th);
    sleep[i] = Math.sin(th);
  }
  return { day, sleep };
}
/** Smooth 0..1 ramp curve between two gains (fade in/out of the master mute). */
export function rampCurve(from: number, to: number, n = 64) {
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) c[i] = from + (to - from) * (1 - Math.cos((Math.PI * i) / (n - 1))) / 2;
  return c;
}

// ---- snores
/** Seconds until the breath trough (sin(phase) at its minimum, phase = -PI/2) = the start of the next inhale. */
export const untilTrough = (phase: number, period: number) => {
  const TAU = Math.PI * 2;
  return ((((-Math.PI / 2 - phase) % TAU) + TAU) % TAU) / TAU * period;
};
/** First inhale start >= earliest (and >= now), on the live breath grid. */
export function nextCycle(now: number, phase: number, period: number, earliest: number) {
  const t = now + untilTrough(phase, period);
  return t >= earliest ? t : t + Math.ceil((earliest - t) / period) * period;
}

export interface SnorePart { kind: "inhale" | "ork" | "exhale" | "whistle" | "mumble"; at: number; dur: number; db: number; f?: number }
/** One breath of snoring: part times are seconds from the inhale start (the breath trough). */
export function snoreCycle(rng: Rng, prevSkipped: boolean, period: number): { skip: boolean; parts: SnorePart[] } {
  const skip = !prevSkipped && rng() < 0.12;
  if (skip) return { skip, parts: [] };
  if (rng() < 0.08) return { skip, parts: [{ kind: "mumble", at: 1, dur: 0.35, db: -42 }] };
  const tiny = rng() < 0.2;
  const inAt = 0.35 + between(rng, -0.08, 0.08);
  const inDur = between(rng, 0.55, 0.8);
  const exAt = period / 2 + between(rng, -0.1, 0.1);
  const parts: SnorePart[] = [
    { kind: "inhale", at: inAt, dur: inDur, db: between(rng, -39, -34) + (tiny ? gainToDb(0.8) : 0) },
    { kind: "ork", at: inAt + inDur - 0.1, dur: between(rng, 0.22, 0.34), db: -40, f: between(rng, 66, 88) },
    { kind: "exhale", at: exAt, dur: between(rng, 0.9, 1.4), db: -42 },
  ];
  if (rng() < 0.25) parts.push({ kind: "whistle", at: exAt + 0.1, dur: 0.5, db: -54, f: between(rng, 1100, 1400) });
  return { skip, parts };
}
