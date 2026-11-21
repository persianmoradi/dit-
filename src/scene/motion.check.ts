import assert from "node:assert/strict";
import { blink, BOOP_IMPULSE, damp, pulse, stepSpring, type Spring } from "./motion.ts";

// boop impulse: settles, overshoots gently, survives a slow 20fps frame time
for (const dt of [1 / 120, 1 / 60, 1 / 20]) {
  const s: Spring = { x: 0, v: BOOP_IMPULSE };
  let max = 0, min = 0;
  for (let t = 0; t < 3; t += dt) {
    stepSpring(s, dt);
    max = Math.max(max, s.x);
    min = Math.min(min, s.x);
  }
  assert.ok(Math.abs(s.x) < 1e-3 && Math.abs(s.v) < 1e-2, `settles at dt=${dt}`);
  assert.ok(max > 0.3 && max < 0.6, `peak ${max}`);
  assert.ok(-min < max * 0.2, `soft overshoot ${min}`);
}
// repeated boops stay bounded (impulses add, no explosion)
const s: Spring = { x: 0, v: 0 };
for (let i = 0; i < 20; i++) {
  s.v += BOOP_IMPULSE;
  stepSpring(s, 0.08);
  assert.ok(Math.abs(s.x) < 3);
}

assert.equal(blink(-1), 1);
assert.equal(blink(1), 1);
assert.ok(blink(0.09) < 0.1);
assert.equal(pulse(0, 1), 0);
assert.ok(Math.abs(pulse(0.5, 1) - 1) < 1e-9);
assert.equal(pulse(2, 1), 0);
assert.ok(damp(4, 0) === 0 && damp(4, 10) > 0.99);
console.log("motion ok");
