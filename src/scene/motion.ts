// Pure animation curves for Ditó. Everything here is continuous and settles without overshoot jitter.

export interface Spring {
  x: number;
  v: number;
}

/** Damped spring toward 0. zeta < 1 gives one soft overshoot; substeps keep it stable at low frame rates. */
export function stepSpring(s: Spring, dt: number, omega = 9, zeta = 0.62) {
  const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
  const h = dt / steps;
  for (let i = 0; i < steps; i++) {
    s.v += (-omega * omega * s.x - 2 * zeta * omega * s.v) * h;
    s.x += s.v * h;
  }
  return s;
}

/** Eyelid openness for a blink that started `age` seconds ago: 1 open, ~0.08 shut. */
export function blink(age: number, dur = 0.18) {
  if (age < 0 || age > dur) return 1;
  return 1 - 0.92 * Math.sin((age / dur) * Math.PI);
}

/** 0..1 bell over `dur` seconds: used for ear twitches and the happy squint after a boop. */
export function pulse(age: number, dur: number) {
  if (age < 0 || age > dur) return 0;
  const s = Math.sin((age / dur) * Math.PI);
  return s * s;
}

/** Exponential smoothing factor for a frame of length dt (frame-rate independent). */
export const damp = (rate: number, dt: number) => 1 - Math.exp(-rate * dt);

/** Velocity kick a single boop adds to the squash spring. */
export const BOOP_IMPULSE = 7;
