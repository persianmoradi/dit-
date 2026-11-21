import { useEffect, useSyncExternalStore } from "react";
import {
  angleOf, dayBar, dbToGain, DAY_BARS, DAY_BEAT, DAY_METER, freq, LULL_BARS, LULL_BEAT, LULL_METER, lullabyBar, nextCycle, rampCurve, snoreCycle,
  xfadeCurves, XFADE_SECONDS, type Rng, type ScoreEvent, type SnorePart,
} from "./audioScore.ts";
import { SLEEP_BREATH_PERIOD } from "./scene/trickTimeline.ts";
import { breath, moods, tricks } from "./tricks.ts";

// Procedural background music, lullaby and snores. Spec: Web Audio only, no files. Nothing is created before the first user gesture.
const TICK_MS = 25;
const LOOK = 0.12; // schedule this far ahead on AudioContext time; the timer only wakes the scheduler
const KEY = "dito-music";
type Scene = "day" | "sleep";
type Out = { dry: AudioNode; send: AudioNode };
type Seq = { scene: Scene; next: number; n: number; prevThin: boolean; pending: { at: number; e: ScoreEvent }[] };
type Snore = { earliest: number; last: number; prevSkip: boolean; lastPhase: number; still: number };

interface Graph {
  c: AudioContext;
  dayBus: GainNode; sleepBus: GainNode; duck: GainNode; user: GainNode; master: GainNode; snoreOut: GainNode;
  day: Out; sleep: Out; snoreBus: AudioNode; noise: AudioBuffer;
}

let g: Graph | null = null;
let on = true;
let started = false; // first gesture seen
let hidden = typeof document !== "undefined" && document.hidden;
let audible = false;
let scene: Scene = "day";
let token = 0;
let live = 0; // live voice nodes (debug / QA)
let timer = 0;
let seqs: { day: Seq | null; sleep: Seq | null } = { day: null, sleep: null };
let snore: Snore | null = null;
let duckOn = false;
let duckTimer = 0;
let armedHooks = false;
const dbg = { snoreCycles: 0, snoreParts: 0, skipped: 0 };
const rng: Rng = Math.random;

// ---- store (React sees only on/playing/asleep/armed; never per-frame)
export interface MusicState { on: boolean; playing: boolean; asleep: boolean; armed: boolean }
let snap: MusicState = { on, playing: false, asleep: false, armed: false };
const subs = new Set<() => void>();
const refresh = () => {
  const next: MusicState = { on, playing: audible && g?.c.state === "running", asleep: scene === "sleep", armed: on && !started };
  if (next.on !== snap.on || next.playing !== snap.playing || next.asleep !== snap.asleep || next.armed !== snap.armed) (snap = next), subs.forEach((f) => f());
};
const subscribe = (f: () => void) => (subs.add(f), () => void subs.delete(f));

const readPref = () => { try { return localStorage.getItem(KEY) !== "off"; } catch { return true; } };
const savePref = () => { try { localStorage.setItem(KEY, on ? "on" : "off"); } catch { /* private mode */ } };

// ---- graph
function impulse(c: AudioContext, T: number, k: number) {
  const n = Math.floor(c.sampleRate * T);
  const b = c.createBuffer(2, n, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) ** k;
  }
  return b;
}

function build(): Graph {
  const c = new AudioContext({ latencyHint: "playback" });
  const gn = (v: number) => { const x = c.createGain(); x.gain.value = v; return x; };
  const filt = (type: BiquadFilterType, f: number, q = 0.7) => { const x = c.createBiquadFilter(); x.type = type; x.frequency.value = f; x.Q.value = q; return x; };
  const dayBus = gn(1), sleepBus = gn(0), sleepTrim = gn(0.7), duck = gn(1), user = gn(0), master = gn(0.1), snoreOut = gn(0);
  const comp = c.createDynamicsCompressor();
  for (const [k, v] of Object.entries({ threshold: -18, knee: 12, ratio: 4, attack: 0.008, release: 0.2 })) (comp as unknown as Record<string, AudioParam>)[k].value = v;
  const limiter = c.createDynamicsCompressor();
  for (const [k, v] of Object.entries({ threshold: -3, knee: 0, ratio: 20, attack: 0.001, release: 0.1 })) (limiter as unknown as Record<string, AudioParam>)[k].value = v;
  sleepTrim.connect(sleepBus);
  dayBus.connect(duck); sleepBus.connect(duck);
  duck.connect(user); user.connect(comp); comp.connect(master); master.connect(limiter); limiter.connect(c.destination);

  const dayIn = gn(1), dayConv = c.createConvolver(), dayRet = gn(dbToGain(-16));
  dayConv.buffer = impulse(c, 1.4, 2.5);
  dayIn.connect(dayConv); dayConv.connect(dayRet); dayRet.connect(dayBus);

  const sleepIn = gn(1), pre = c.createDelay(0.1), sleepConv = c.createConvolver(), sleepLp = filt("lowpass", 3500), sleepRet = gn(dbToGain(-6));
  pre.delayTime.value = 0.03;
  sleepConv.buffer = impulse(c, 4.5, 2);
  sleepIn.connect(pre); pre.connect(sleepConv); sleepConv.connect(sleepLp); sleepLp.connect(sleepRet); sleepRet.connect(sleepBus);

  // snores bypass the music bus (duck, mute) and the master: they sit just under the sleep music; a tiny send feeds the sleep room
  const snoreBus = filt("highpass", 60), snoreLp = filt("lowpass", 3000), snoreSend = gn(dbToGain(-24));
  snoreBus.connect(snoreLp); snoreLp.connect(snoreOut); snoreOut.connect(limiter); snoreOut.connect(snoreSend); snoreSend.connect(sleepIn);

  const noise = c.createBuffer(1, c.sampleRate, c.sampleRate);
  const nd = noise.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

  c.addEventListener("statechange", refresh);
  return { c, dayBus, sleepBus, duck, user, master, snoreOut, day: { dry: dayBus, send: dayIn }, sleep: { dry: sleepTrim, send: sleepIn }, snoreBus, noise };
}

// ---- voices: every voice is a cluster that disconnects itself when its sources end
function cluster(G: Graph) {
  const list: AudioNode[] = [], srcs: AudioScheduledSourceNode[] = [];
  const add = <T extends AudioNode>(x: T): T => {
    list.push(x);
    if (x instanceof OscillatorNode || x instanceof AudioBufferSourceNode) srcs.push(x);
    return x;
  };
  const gain = (v: number) => { const x = add(G.c.createGain()); x.gain.value = v; return x; };
  const filter = (type: BiquadFilterType, f: number, q = 0.7) => { const x = add(G.c.createBiquadFilter()); x.type = type; x.frequency.value = f; x.Q.value = q; return x; };
  const osc = (type: OscillatorType, f: number, cents = 0) => { const x = add(G.c.createOscillator()); x.type = type; x.frequency.value = f; x.detune.value = cents; return x; };
  const noise = () => { const x = add(G.c.createBufferSource()); x.buffer = G.noise; x.loop = true; return x; };
  const go = (t0: number, t1: number) => {
    live += list.length;
    for (const s of srcs) (s instanceof AudioBufferSourceNode ? s.start(t0, Math.random() * 0.5) : s.start(t0), s.stop(t1));
    let done = false;
    srcs[0].onended = () => {
      if (done) return;
      done = true;
      for (const x of list) x.disconnect();
      live -= list.length;
    };
  };
  return { add, gain, filter, osc, noise, go };
}

/** exp attack to peak at t+a, hold until t+hold, exp release over r. Returns the end time. */
const env = (p: AudioParam, t: number, a: number, peak: number, hold: number, r: number) => {
  p.setValueAtTime(0.0001, t);
  p.exponentialRampToValueAtTime(peak, t + a);
  p.setValueAtTime(peak, t + Math.max(a, hold));
  p.exponentialRampToValueAtTime(0.0001, t + Math.max(a, hold) + r);
  return t + Math.max(a, hold) + r + 0.05;
};

interface Part { type: OscillatorType; mult: number; g: number; decay?: number }
interface ToneSpec { parts: Part[]; db: number; send?: number; a: number; tail: (dur: number) => number; lp: number; q?: number }
const TONES: Record<"lead" | "bass" | "pluck" | "box", ToneSpec> = {
  lead: { parts: [{ type: "sine", mult: 1, g: 1 }, { type: "sine", mult: 4, g: 0.18, decay: 0.09 }, { type: "triangle", mult: 1, g: 0.3 }], db: -10, send: -16, a: 0.002, tail: (d) => Math.max(0.35, d) + 0.6, lp: 5000 },
  bass: { parts: [{ type: "sine", mult: 1, g: 1 }, { type: "sine", mult: 4, g: 0.3, decay: 0.06 }], db: -12, a: 0.003, tail: () => 0.22, lp: 700 },
  pluck: { parts: [{ type: "triangle", mult: 1, g: 1 }], db: -18, send: -20, a: 0.004, tail: () => 0.26, lp: 1800, q: 0.5 },
  box: { parts: [{ type: "sine", mult: 1, g: 1 }, { type: "sine", mult: 4, g: 0.12 }], db: -18, send: -4, a: 0.003, tail: () => 0.9, lp: 3500 },
};

function tone(G: Graph, out: Out, kind: keyof typeof TONES, e: ScoreEvent, t: number) {
  const s = TONES[kind], cl = cluster(G);
  const f = freq(e.m ?? 69);
  const lp = cl.filter("lowpass", s.lp, s.q);
  const amp = cl.gain(1);
  const end = env(amp.gain, t, s.a, dbToGain(s.db + (e.db ?? 0)) * e.vel, 0, s.tail(e.dur));
  for (const p of s.parts) {
    const o = cl.osc(p.type, f * p.mult, e.cents ?? 0);
    if (p.decay) {
      const pg = cl.gain(p.g);
      pg.gain.setValueAtTime(p.g, t);
      pg.gain.exponentialRampToValueAtTime(0.0001, t + p.decay);
      o.connect(pg); pg.connect(lp);
    } else {
      const pg = cl.gain(p.g);
      o.connect(pg); pg.connect(lp);
    }
  }
  lp.connect(amp); amp.connect(out.dry);
  if (s.send !== undefined) { const sg = cl.gain(dbToGain(s.send)); amp.connect(sg); sg.connect(out.send); }
  cl.go(t, end);
}

function kick(G: Graph, out: Out, t: number) {
  const cl = cluster(G);
  const o = cl.osc("sine", 110), amp = cl.gain(1);
  o.frequency.setValueAtTime(110, t);
  o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
  const end = env(amp.gain, t, 0.002, dbToGain(-14), 0, 0.14);
  o.connect(amp); amp.connect(out.dry);
  cl.go(t, end);
}

function shaker(G: Graph, out: Out, e: ScoreEvent, t: number) {
  const cl = cluster(G);
  const n = cl.noise(), hp = cl.filter("highpass", 6000), bp = cl.filter("bandpass", 8000, 0.8), amp = cl.gain(1);
  const pan = cl.add(G.c.createStereoPanner());
  pan.pan.value = e.pan ?? 0;
  const end = env(amp.gain, t, 0.002, dbToGain(-24) * e.vel, 0, e.accent ? 0.04 : 0.06);
  n.connect(hp); hp.connect(bp); bp.connect(amp); amp.connect(pan); pan.connect(out.dry);
  cl.go(t, end);
}

function pad(G: Graph, out: Out, e: ScoreEvent, t: number) {
  const cl = cluster(G), notes = e.notes ?? [];
  const lp = cl.filter("lowpass", 900, 0.3), amp = cl.gain(1);
  const lfo = cl.osc("sine", 0.1), depth = cl.gain(250);
  lfo.connect(depth); depth.connect(lp.frequency);
  const end = env(amp.gain, t, 1.2, dbToGain(-22) / (1.5 * notes.length), e.dur, 1.8);
  for (const m of notes) {
    for (const [type, c] of [["triangle", -7], ["triangle", 7], ["sine", 0]] as const) cl.osc(type, freq(m), c).connect(lp);
  }
  if (e.sub !== undefined) { const sg = cl.gain(dbToGain(-6)); cl.osc("sine", freq(e.sub)).connect(sg); sg.connect(lp); }
  lp.connect(amp); amp.connect(out.dry);
  const sg = cl.gain(dbToGain(-8)); amp.connect(sg); sg.connect(out.send);
  cl.go(t, end);
}

function play(G: Graph, e: ScoreEvent, t: number, sc: Scene) {
  const out = sc === "day" ? G.day : G.sleep;
  switch (e.voice) {
    case "lead": case "bass": case "pluck": case "box": return tone(G, out, e.voice, e, t);
    case "kick": return kick(G, out, t);
    case "shaker": return shaker(G, out, e, t);
    case "pad": return pad(G, out, e, t);
  }
}

// ---- snores: noise "sn" inhale, triangle "ork" flutter, "pfff" exhale, rare whistle / mumble
function snorePart(G: Graph, p: SnorePart, t: number) {
  const cl = cluster(G), amp = cl.gain(1), peak = dbToGain(p.db);
  let end = t;
  if (p.kind === "inhale" || p.kind === "exhale") {
    const n = cl.noise(), f = cl.filter(p.kind === "inhale" ? "bandpass" : "lowpass", p.kind === "inhale" ? 450 : 1300, 1.8);
    if (p.kind === "inhale") {
      f.frequency.setValueAtTime(450, t); f.frequency.exponentialRampToValueAtTime(900, t + p.dur);
      f.Q.setValueAtTime(1.8, t); f.Q.linearRampToValueAtTime(2.6, t + p.dur);
    } else {
      f.frequency.setValueAtTime(1300, t); f.frequency.exponentialRampToValueAtTime(500, t + p.dur);
    }
    end = env(amp.gain, t, p.kind === "inhale" ? 0.2 : 0.15, peak, p.dur, p.kind === "inhale" ? 0.22 : 0.5);
    n.connect(f); f.connect(amp);
  } else if (p.kind === "ork") {
    const o = cl.osc("triangle", p.f ?? 72), am = cl.gain(0.65), bp = cl.filter("bandpass", 420, 1.2);
    const vib = cl.osc("sine", 5), vibG = cl.gain(5), mod = cl.osc("sine", 26), modG = cl.gain(0.35);
    o.frequency.setValueAtTime(p.f ?? 72, t); o.frequency.linearRampToValueAtTime((p.f ?? 72) + 18, t + 0.25);
    vib.connect(vibG); vibG.connect(o.frequency); mod.connect(modG); modG.connect(am.gain);
    o.connect(am); am.connect(bp); bp.connect(amp);
    end = env(amp.gain, t, 0.03, peak, p.dur, 0.12);
  } else if (p.kind === "whistle") {
    const o = cl.osc("sine", p.f ?? 1250), vib = cl.osc("sine", 5.5), vibG = cl.gain(12);
    o.frequency.setValueAtTime(p.f ?? 1250, t); o.frequency.linearRampToValueAtTime((p.f ?? 1250) - 90, t + p.dur);
    vib.connect(vibG); vibG.connect(o.frequency); o.connect(amp);
    end = env(amp.gain, t, 0.12, peak, p.dur, 0.25);
  } else {
    const o = cl.osc("sawtooth", 130), b1 = cl.filter("bandpass", 500, 4), b2 = cl.filter("bandpass", 1500, 4);
    o.frequency.setValueAtTime(130, t); o.frequency.linearRampToValueAtTime(105, t + p.dur);
    o.connect(b1); o.connect(b2); b1.connect(amp); b2.connect(amp);
    end = env(amp.gain, t, 0.06, peak, p.dur, 0.15);
  }
  amp.connect(G.snoreBus);
  cl.go(t, end);
}

function snoreTick(G: Graph, now: number) {
  const s = snore;
  if (!s) return;
  const P = SLEEP_BREATH_PERIOD, ph = breath.phase;
  s.still = ph === s.lastPhase ? s.still + 1 : 0; // frozen phase (paused frames, reduced motion): fall back to our own clock
  s.lastPhase = ph;
  const t = s.still >= 4 ? Math.max(s.earliest, s.last + P) : nextCycle(now, ph, P, s.earliest);
  if (t > now + LOOK) return;
  const cyc = snoreCycle(rng, s.prevSkip, P);
  s.prevSkip = cyc.skip;
  s.last = t;
  s.earliest = t + 0.75 * P;
  dbg.snoreCycles++;
  if (cyc.skip) dbg.skipped++;
  for (const p of cyc.parts) (snorePart(G, p, Math.max(now, t + p.at)), dbg.snoreParts++);
}

// ---- sequencers (one per scene; events queue with absolute context times, the timer only drains what is due)
const barLen = (sc: Scene) => (sc === "day" ? DAY_METER * DAY_BEAT : LULL_METER * LULL_BEAT);
function runSeq(G: Graph, s: Seq, now: number) {
  if (!s.pending.length && s.next < now - 0.3) s.next = now + 0.05; // timer was starved (hidden tab): don't burst
  while (s.next < now + LOOK) {
    const bars = s.scene === "day" ? DAY_BARS : LULL_BARS;
    const bar = s.n % bars, pass = Math.floor(s.n / bars);
    let events: ScoreEvent[];
    if (s.scene === "day") {
      const r = dayBar(bar, pass, rng, s.prevThin);
      (events = r.events), (s.prevThin = r.thin);
    } else events = lullabyBar(bar, pass, rng);
    for (const e of events) s.pending.push({ at: s.next + e.t, e });
    s.next += barLen(s.scene);
    s.n++;
  }
  s.pending = s.pending.filter((p) => {
    if (p.at >= now + LOOK) return true;
    play(G, p.e, Math.max(now, p.at), s.scene);
    return false;
  });
}
const tick = () => {
  if (!g || g.c.state !== "running") return;
  const now = g.c.currentTime;
  if (seqs.day) runSeq(g, seqs.day, now);
  if (seqs.sleep) runSeq(g, seqs.sleep, now);
  snoreTick(g, now);
};

// ---- AudioParam helpers
const hold = (p: AudioParam, now: number) => {
  if (typeof p.cancelAndHoldAtTime === "function") p.cancelAndHoldAtTime(now);
  else { const v = p.value; p.cancelScheduledValues(now); p.setValueAtTime(v, now); }
};
const curve = (p: AudioParam, values: Float32Array<ArrayBuffer>, dur: number) => {
  const now = g!.c.currentTime;
  hold(p, now);
  p.setValueCurveAtTime(values, now, dur);
};
const target = (p: AudioParam, v: number, tc: number) => {
  const now = g!.c.currentTime;
  hold(p, now);
  p.setTargetAtTime(v, now, tc);
};

const startScene = (sc: Scene, lead = 0.1) => {
  if (!g) return;
  const now = g.c.currentTime;
  seqs[sc] = { scene: sc, next: now + lead, n: 0, prevThin: false, pending: [] };
  if (sc === "sleep") {
    snore = { earliest: now + 2, last: now + 2 - SLEEP_BREATH_PERIOD, prevSkip: false, lastPhase: NaN, still: 0 };
    g.snoreOut.gain.cancelScheduledValues(now);
    g.snoreOut.gain.setTargetAtTime(dbToGain(-4), now, 0.3);
  }
};
const stopScene = (sc: Scene) => {
  seqs[sc] = null; // pending notes never play; queued ones ring out through their own release
  if (sc === "sleep" && snore && g) {
    snore = null;
    const now = g.c.currentTime;
    g.snoreOut.gain.cancelScheduledValues(now);
    g.snoreOut.gain.setTargetAtTime(0, now, 0.1); // ~300 ms to silence
  }
};

function crossfade(to: Scene) {
  if (!g) return;
  const th0 = angleOf(g.dayBus.gain.value, g.sleepBus.gain.value);
  const c = xfadeCurves(th0, to === "sleep" ? Math.PI / 2 : 0);
  curve(g.dayBus.gain, c.day as Float32Array<ArrayBuffer>, XFADE_SECONDS);
  curve(g.sleepBus.gain, c.sleep as Float32Array<ArrayBuffer>, XFADE_SECONDS);
  stopScene(to === "sleep" ? "day" : "sleep");
  startScene(to, to === "day" ? DAY_BEAT : 0.1); // waking: one beat of rest before the day loop's pickup
}

/** Make reality match (on && started && visible): create/resume + fade in, or fade out + suspend. */
async function sync(fadeIn = XFADE_SECONDS) {
  const want = on && started && !hidden;
  if (want === audible) return refresh();
  audible = want;
  const tk = ++token;
  if (want) {
    g ??= build();
    clearInterval(timer);
    timer = window.setInterval(tick, TICK_MS);
    try { await g.c.resume(); } catch { /* blocked: the next gesture retries */ }
    if (tk !== token) return;
    const G = g, now = G.c.currentTime;
    hold(G.dayBus.gain, now); hold(G.sleepBus.gain, now);
    G.dayBus.gain.setValueAtTime(scene === "day" ? 1 : 0, now);
    G.sleepBus.gain.setValueAtTime(scene === "sleep" ? 1 : 0, now);
    stopScene("day"); stopScene("sleep");
    startScene(scene);
    curve(G.user.gain, rampCurve(G.user.gain.value, 1) as Float32Array<ArrayBuffer>, fadeIn);
  } else if (g) {
    const G = g, quick = hidden;
    target(G.user.gain, 0, quick ? 0.08 : 0.12);
    stopScene("day"); stopScene("sleep");
    window.setTimeout(() => {
      if (tk !== token) return;
      clearInterval(timer);
      void G.c.suspend();
    }, quick ? 350 : 500);
  }
  refresh();
}

// ---- wiring
const onGesture = (e: Event) => {
  if ((e.target as Element | null)?.closest?.(".music-btn")) return; // the toggle handles itself
  started = true;
  void sync();
  if (g && audible && g.c.state === "suspended") void g.c.resume(); // touch: activation may only land on pointerup/click
  else if (g?.c.state === "running" || !on) unhook();
  refresh();
};
const GESTURES = ["pointerdown", "keydown", "touchstart", "pointerup", "click"] as const;
const unhook = () => GESTURES.forEach((t) => window.removeEventListener(t, onGesture, true));

function arm() {
  if (armedHooks) return;
  armedHooks = true;
  on = readPref();
  refresh();
  GESTURES.forEach((t) => window.addEventListener(t, onGesture, { capture: true, passive: true }));
  document.addEventListener("visibilitychange", () => ((hidden = document.hidden), void sync(0.6)));
  let deb = 0;
  tricks.subscribe(() => {
    clearTimeout(deb);
    deb = window.setTimeout(() => {
      const next: Scene = tricks.get() === "sleep" ? "sleep" : "day";
      if (next === scene) return;
      scene = next;
      if (audible && g && g.c.state === "running") crossfade(next);
      refresh();
    }, 50);
  });
  moods.subscribe(() => {
    const m = moods.get(), d = m.speaking || m.listening;
    if (d === duckOn) return;
    duckOn = d;
    clearTimeout(duckTimer);
    if (!g) return;
    if (d) target(g.duck.gain, dbToGain(-8), 0.06);
    else duckTimer = window.setTimeout(() => g && !duckOn && target(g.duck.gain, 1, 0.4), 400);
  });
}

export const music = {
  toggle() {
    if (started || !on) on = !on; // armed and untouched: the first tap just starts what already looks "on"
    started = true;
    unhook();
    savePref();
    void sync();
    refresh();
  },
};

export function useMusic() {
  useEffect(arm, []);
  const s = useSyncExternalStore(subscribe, () => snap);
  return { ...s, toggle: music.toggle };
}

if (import.meta.env.DEV && typeof window !== "undefined") {
  const p = (x?: GainNode) => x?.gain.value ?? null;
  Object.defineProperty(window, "__ditoAudio", {
    value: {
      get state() { return g?.c.state ?? "none"; },
      get nodes() { return live; },
      get scene() { return scene; },
      get gains() { return { day: p(g?.dayBus), sleep: p(g?.sleepBus), duck: p(g?.duck), user: p(g?.user), snore: p(g?.snoreOut), master: p(g?.master) }; },
      snores: dbg,
      stores: { tricks, moods },
    },
  });
}
