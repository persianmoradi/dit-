import type { TrickId } from "../tricks.ts";
import { pulse } from "./motion.ts";

// Pure trick timelines: trickPose(id, age) -> additive offsets over the idle pose. Hero3D only applies them.
// Every field is a delta, so all-zeros is "idle" and a finished trick leaves no pop.

export const POSE_KEYS = [
  "yaw", "roll", "lean", "lift", "sqX", "sqY", "headPitch", "headRoll", "squint", "mouth", "legs", "ears", "armL", "armR", "armFwd", "cheek", "sleepy",
  "think", "listen", "curl", "legL", "legR", "pawR",
] as const;
/**
 * yaw/roll/lean: root rotation y/z/x (rad). lift: world-ish units * scale. sqX/sqY: body scale deltas.
 * headPitch: + nods down. squint: 0 open .. 1 shut. mouth: 0..1. legs: 0 seated .. 1 dangling (negative = tucked in).
 * think/listen: 0..1 mood weights (filled by Hero3D from the talk UI, never by a trick). curl: 0..1 sleeping curl.
 * legL/legR: extra leg kick (rot x delta). pawR: right arm extra forward swing (rot x delta, - forward).
 * ears: + lifts outward. armL/armR: + raises outward/up from rest. armFwd: - swings forward. cheek: scale delta. sleepy: 0..1.
 */
export type Pose = Record<(typeof POSE_KEYS)[number], number>;

export const makePose = (): Pose => ({
  yaw: 0, roll: 0, lean: 0, lift: 0, sqX: 0, sqY: 0, headPitch: 0, headRoll: 0, squint: 0, mouth: 0, legs: 0, ears: 0, armL: 0, armR: 0, armFwd: 0, cheek: 0, sleepy: 0,
  think: 0, listen: 0, curl: 0, legL: 0, legR: 0, pawR: 0,
});
export const clearPose = (p: Pose) => {
  for (const k of POSE_KEYS) p[k] = 0;
  return p;
};
export const copyPose = (to: Pose, from: Pose) => {
  for (const k of POSE_KEYS) to[k] = from[k];
  return to;
};
export const addPose = (out: Pose, p: Pose, k = 1) => {
  for (const key of POSE_KEYS) out[key] += p[key] * k;
  return out;
};

export type TrickEvent =
  | { at: number; kind: "puff"; u: number; s: number } // u: 0.5 = under Ditó; s < 0 (puff strength)
  | { at: number; kind: "fluff"; n: number }
  | { at: number; kind: "heart" };

/** Seconds. Sleep is persistent: 1.4 s enter, then holds until woken or auto-wake at 14 s. */
export const TRICK_DURATION: Record<TrickId, number> = { wave: 2, spin: 1.8, jump: 1.6, dance: 3, hug: 2.4, sleep: 14 };
export const SLEEP_ENTER = 1.4;
/** Breathing period in seconds, awake and asleep (Hero3D slides between them; the snore scheduler reads the same numbers). */
export const DAY_BREATH_PERIOD = 3.6;
export const SLEEP_BREATH_PERIOD = 5.5;
/** A representative moment for reduced-motion pose holds. */
export const HOLD_AGE: Record<TrickId, number> = { wave: 0.8, spin: 0.1, jump: 0.1, dance: 0.4, hug: 1.2, sleep: 3 };

const r = (at: number, u: number, s: number): TrickEvent => ({ at, kind: "puff", u, s: -s });
export const TRICK_EVENTS: Record<TrickId, readonly TrickEvent[]> = {
  wave: [r(0.2, 0.57, 0.2), r(1, 0.57, 0.2)],
  spin: [r(0.2, 0.44, 0.5), r(0.7, 0.56, 0.5), r(1.2, 0.44, 0.5)],
  jump: [
    { at: 0.25, kind: "fluff", n: 8 }, r(0.25, 0.5, 0.5),
    { at: 1.25, kind: "fluff", n: 20 }, r(1.25, 0.5, 1), r(1.4, 0.47, 0.7), r(1.55, 0.53, 0.5),
  ],
  dance: [r(0, 0.45, 0.3), r(0.75, 0.55, 0.3), r(1.5, 0.45, 0.3), r(2.25, 0.55, 0.3)],
  hug: [{ at: 1, kind: "heart" }, r(1.9, 0.5, 0.25)],
  sleep: [],
};

const TAU = Math.PI * 2;
const seg = (a: number, from: number, to: number) => Math.min(1, Math.max(0, (a - from) / (to - from)));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const eIO = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2); // in-out cubic
const eIOSine = (k: number) => -(Math.cos(Math.PI * k) - 1) / 2;
const eOutQuad = (k: number) => 1 - (1 - k) * (1 - k);
const eInQuad = (k: number) => k * k;
// eased-in first (zero start velocity = a tiny anticipation), then out-back overshoot
const eOutBack = (k: number, c1 = 1.4) => (k = k * k * (3 - 2 * k), 1) + (c1 + 1) * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2);
/** Decaying ring: starts at 0, a soft overshoot or two. peak about 0.44. */
const ring = (t: number, w = 14, k = 8) => (t <= 0 ? 0 : Math.exp(-k * t) * Math.sin(w * t));

export function trickPose(id: TrickId, a: number, out: Pose = makePose()): Pose {
  clearPose(out);
  if (a < 0) return out;
  if (id !== "sleep" && a >= TRICK_DURATION[id]) return out; // exactly idle again
  switch (id) {
    case "wave": {
      const up = eOutBack(seg(a, 0, 0.35)) * (1 - eIO(seg(a, 1.6, 2)));
      const hold = eIO(seg(a, 0, 0.35)) * (1 - eIO(seg(a, 1.6, 2)));
      const p = seg(a, 0.35, 1.6); // 4 oscillations
      const env = Math.min(1, p * 6, (1 - p) * 6);
      out.armR = 1.75 * up + (p > 0 && p < 1 ? Math.sin(p * 8 * Math.PI) * 0.35 * env : 0);
      out.headRoll = 0.1 * hold;
      out.squint = 0.3 * hold;
      break;
    }
    case "spin": {
      const turn = eIO(seg(a, 0.2, 1.5));
      out.yaw = (a < 0.2 ? -0.25 * eIO(a / 0.2) : lerp(-0.25, TAU, turn)) + pulse(a - 1.5, 0.3) * 0.12;
      out.lean = 0.08 * pulse(a, 0.5);
      const bell = pulse(a - 0.2, 1.5);
      out.armL = out.armR = 0.5 * bell;
      out.ears = 0.25 * bell;
      break;
    }
    case "jump": {
      const c = eIOSine(seg(a, 0, 0.25));
      out.lift = a < 0.25 ? -0.1 * c : a < 0.8 ? lerp(-0.1, 1, eOutQuad(seg(a, 0.25, 0.8))) : a < 0.9 ? 1 : a < 1.25 ? 1 - eInQuad(seg(a, 0.9, 1.25)) : 0;
      const crouch = a < 0.25 ? c : 1 - eIO(seg(a, 0.25, 0.4));
      const stretch = a < 0.25 ? -0.1 * c : lerp(-0.1, 0.08, eIO(seg(a, 0.25, 0.4))) * (a > 1.1 ? 1 - seg(a, 1.1, 1.25) : 1);
      const win = 1 - eIO(seg(a, 1.45, 1.6));
      out.sqY = (a < 1.25 ? stretch : 0) - 0.34 * ring(a - 1.25) * win;
      out.sqX = -out.sqY * 0.5;
      const air = eIO(seg(a, 0.25, 0.5)) * (1 - eIO(seg(a, 1.1, 1.45)));
      out.armL = out.armR = 1.45 * air;
      out.armFwd = 0.5 * crouch;
      out.legs = air - 0.35 * crouch; // tuck in on the crouch, dangle in the air
      out.headPitch = -0.1 * air;
      out.squint = 0.6 * pulse(a - 1.2, 0.4);
      break;
    }
    case "dance": {
      const env = Math.min(1, a / 0.2) * (1 - eIO(seg(a, 2.75, 3)));
      const beat = 0.75;
      out.roll = 0.12 * Math.sin((TAU * a) / (2 * beat)) * env;
      out.lean = 0.06 * Math.sin((TAU * a) / beat) * env + 0.15 * pulse(a - 2.8, 0.2);
      out.headPitch = 0.05 * pulse(a % beat, beat) * env + 0.25 * pulse(a - 2.8, 0.2);
      const ph = a % (2 * beat);
      const up = (k: number) => Math.min(1, 1.3 * pulse(k, beat)) * 1.45 * env;
      out.armL = ph < beat ? up(ph) : 0;
      out.armR = ph >= beat ? up(ph - beat) : 0;
      const kick = (k: number) => 0.3 * pulse(k, beat) * env; // heel kicks, alternating
      out.legL = ph < beat ? kick(ph) : 0;
      out.legR = ph >= beat ? kick(ph - beat) : 0;
      out.ears = 0.15 * Math.sin((TAU * (a - 0.12)) / beat) * env;
      out.squint = 0.4 * env;
      break;
    }
    case "hug": {
      const arms = eOutBack(seg(a, 0, 0.3)) * (1 - eIO(seg(a, 1.9, 2.4)));
      const h = eIO(seg(a, 0.15, 0.45)) * (1 - eIO(seg(a, 1.9, 2.3)));
      out.armL = out.armR = -1.5 * arms;
      out.armFwd = -1.1 * arms;
      out.sqX = -0.04 * h;
      out.sqY = 0.03 * h;
      out.squint = 0.85 * h;
      out.headRoll = 0.12 * h;
      out.headPitch = 0.05 * h;
      out.cheek = 0.3 * h;
      break;
    }
    case "sleep": {
      const k = eIO(seg(a, 0, SLEEP_ENTER));
      out.headPitch = 0.5 * k;
      out.headRoll = 0.3 * k;
      out.lean = 0.14 * k;
      out.squint = 0.92 * eIO(seg(a, 0, 0.6));
      out.armFwd = -0.9 * k; // arms hug under the cheek
      out.armL = out.armR = -0.3 * k;
      out.lift = -0.12 * k;
      out.ears = -0.2 * k;
      out.curl = k;
      out.sleepy = k;
      break;
    }
  }
  return out;
}

export const YAWN_DURATION = 2.6;
/** Idle yawn/stretch: head back, mouth open, eyes squeezed, arms lift and settle. */
export function yawnPose(a: number, out: Pose = makePose()): Pose {
  clearPose(out);
  if (a < 0 || a >= YAWN_DURATION) return out;
  const open = eIO(seg(a, 0.2, 0.8)) * (1 - eIO(seg(a, 1.8, 2.6)));
  out.headPitch = -0.2 * eIO(seg(a, 0, 0.8)) * (1 - eIO(seg(a, 1.8, 2.6)));
  out.mouth = 0.9 * open;
  out.squint = 0.9 * open;
  out.armL = out.armR = 0.35 * Math.min(1, 1.5 * pulse(a, YAWN_DURATION));
  out.lift = 0.04 * pulse(a, YAWN_DURATION);
  return out;
}

export interface HeartPose {
  scale: number;
  y: number;
  x: number;
}
export const HEART_AT = 1;
export const HEART_LIFE = 1.3;
/** Heart born at HEART_AT during the hug: pops in, floats up ~1.1 u, shrinks away. scale 0 when not alive. */
export function heartPose(a: number, out: HeartPose = { scale: 0, y: 0, x: 0 }): HeartPose {
  const s = a - HEART_AT;
  if (s < 0 || s >= HEART_LIFE) return Object.assign(out, { scale: 0, y: 0, x: 0 });
  out.scale = eOutBack(seg(s, 0, 0.35)) * (1 - seg(s, 1, 1.3));
  out.y = 1.1 * eOutQuad(seg(s, 0, 1.2));
  out.x = 0.1 * Math.sin(s * 5);
  return out;
}
