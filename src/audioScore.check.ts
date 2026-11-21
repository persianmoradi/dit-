import assert from "node:assert/strict";
import {
  angleOf, dayBar, dbToGain, DAY_BARS, DAY_BEAT, DAY_FORM, DAY_LEAD, DAY_METER, DAY_NOTES, freq, F_MAJOR, gainToDb, G_MAJOR, inKey, LULL_BARS, LULL_BEAT, LULL_CHORDS,
  LULL_MEL, LULL_METER, LULL_NOTES, lullabyBar, midi, mulberry32, nextCycle, pickDayVariant, rampCurve, snoreCycle, stepUp, untilTrough, xfadeCurves,
} from "./audioScore.ts";
import { SLEEP_BREATH_PERIOD } from "./scene/trickTimeline.ts";

const near = (a: number, b: number, e = 1e-6) => assert.ok(Math.abs(a - b) < e, `${a} !~ ${b}`);

// in key
for (const n of DAY_NOTES()) assert.ok(inKey(midi(n), G_MAJOR), `day ${n} not in G major`);
for (const n of LULL_NOTES()) assert.ok(inKey(midi(n), F_MAJOR), `lullaby ${n} not in F major`);

// bars sum to the meter (rests allowed only as a trailing gap in the lead; every bar fits inside it)
for (const [name, bars, meter] of [["day", DAY_LEAD, DAY_METER], ["lullaby", LULL_MEL, LULL_METER]] as const) {
  bars.forEach((bar, i) => {
    let prevEnd = 0;
    for (const [beat, dur] of bar) {
      assert.ok(beat >= prevEnd - 1e-9, `${name} bar ${i + 1} overlaps`);
      prevEnd = beat + dur;
    }
    assert.ok(prevEnd <= meter + 1e-9, `${name} bar ${i + 1} overruns: ${prevEnd}`);
    near(prevEnd, meter);
  });
}
// every bar has exactly one chord
assert.equal(DAY_FORM.length, 16);
assert.equal(LULL_CHORDS.length, 12);

// frequencies
near(freq("A4"), 440);
near(freq("C4"), 261.6256, 1e-3);
near(freq("A5"), 880);
near(freq("F#5"), 739.9888, 1e-3);
assert.equal(midi("Bb2"), 46);

// loop lengths
assert.ok(DAY_BARS >= 16 && DAY_LEAD.length === DAY_BARS);
assert.ok(LULL_BARS >= 8 && LULL_MEL.length === LULL_BARS);
near(DAY_BARS * DAY_METER * DAY_BEAT, 38.4);
near(LULL_BARS * LULL_METER * LULL_BEAT, 36);

// variation picker: deterministic with a seed, and stays in key
const loop = (seed: number) => {
  const r = mulberry32(seed);
  let thin = false;
  const out = [];
  for (let pass = 0; pass < 4; pass++) for (let b = 0; b < DAY_BARS; b++) {
    const x = dayBar(b, pass, r, thin);
    thin = x.thin;
    out.push(x.events);
  }
  return out;
};
assert.deepEqual(loop(7), loop(7));
assert.notDeepEqual(loop(7), loop(8));
for (const seed of [1, 2, 3]) for (const bar of loop(seed)) for (const e of bar) {
  for (const m of e.notes ?? (e.m === undefined ? [] : [e.m])) assert.ok(inKey(m, G_MAJOR), `variation note ${m} out of key`);
  assert.ok(e.t >= 0 && e.vel >= 0 && e.vel <= 1);
}
const lr = mulberry32(5);
for (let loopN = 0; loopN < 6; loopN++) for (let b = 0; b < LULL_BARS; b++) for (const e of lullabyBar(b, loopN, lr)) for (const m of e.notes ?? (e.m === undefined ? [] : [e.m])) assert.ok(inKey(m, F_MAJOR));
assert.equal(stepUp(midi("F#5"), G_MAJOR), midi("G5"));
assert.equal(stepUp(midi("B5"), G_MAJOR), midi("C6"));
// variants fire at roughly their rates, thin never twice in a row, fills only on bars 4/8/12/16
{
  const r = mulberry32(11);
  let tail = 0, fill = 0, prev = false;
  for (let i = 0; i < 4000; i++) {
    const v = pickDayVariant(r, i % 16, prev);
    assert.ok(!(v.thin && prev));
    if (v.fill) assert.equal(i % 4, 3);
    prev = v.thin;
    tail += +v.tailUp; fill += +v.fill;
  }
  assert.ok(tail / 4000 > 0.15 && tail / 4000 < 0.25, `tail rate ${tail / 4000}`);
  assert.ok(fill > 0);
}
// intro: first pass bars 1-2 are lead only
assert.ok(dayBar(0, 0, mulberry32(1)).events.every((e) => e.voice === "lead"));
assert.ok(dayBar(0, 1, mulberry32(1)).events.some((e) => e.voice === "kick"));

// crossfade is equal power and monotonic, from either end and from mid-fade
for (const [a, b] of [[0, Math.PI / 2], [Math.PI / 2, 0], [angleOf(0.8, 0.3), Math.PI / 2]] as const) {
  const { day, sleep } = xfadeCurves(a, b);
  assert.equal(day.length, 64);
  for (let i = 0; i < 64; i++) near(day[i] ** 2 + sleep[i] ** 2, 1, 1e-5);
  for (let i = 1; i < 64; i++) {
    const up = b > a;
    assert.ok(up ? sleep[i] >= sleep[i - 1] && day[i] <= day[i - 1] : sleep[i] <= sleep[i - 1] && day[i] >= day[i - 1]);
  }
}
const rc = rampCurve(0, 1);
assert.ok(rc[0] === 0 && Math.abs(rc[63] - 1) < 1e-6);
for (let i = 1; i < 64; i++) assert.ok(rc[i] >= rc[i - 1]);

// dB
near(dbToGain(0), 1);
near(dbToGain(-20), 0.1);
near(dbToGain(-8), 0.3981, 1e-3);
near(gainToDb(dbToGain(-13.5)), -13.5);

// snores: one per breath period, inhale at the breath trough (sin(phase) minimum)
const P = SLEEP_BREATH_PERIOD;
assert.equal(P, 5.5);
near(untilTrough(-Math.PI / 2, P), 0);
near(untilTrough(Math.PI / 2, P), P / 2); // peak -> trough is half a period away
for (const ph of [0, 1, 2.5, 4, 9, -3]) {
  const now = 100, t = nextCycle(now, ph, P, now);
  assert.ok(t >= now && t < now + P + 1e-9);
  near(Math.sin(ph + (2 * Math.PI * (t - now)) / P), -1, 1e-9); // lands on the trough
}
{
  const r = mulberry32(3);
  let at = 100, prevSkip = false, cycles = 0, skips = 0;
  const starts: number[] = [];
  for (let i = 0; i < 200; i++) {
    const t = nextCycle(at - 1, -Math.PI / 2 + 0.3 + (2 * Math.PI * (at - 101)) / P, P, at); // live breath grid (phase advances with the clock)
    const c = snoreCycle(r, prevSkip, P);
    assert.ok(!(c.skip && prevSkip), "skipped twice in a row");
    prevSkip = c.skip;
    starts.push(t);
    at = t + 0.75 * P;
    if (c.skip) skips++;
    else {
      cycles++;
      for (const p of c.parts) {
        assert.ok(p.at >= 0 && p.at + p.dur < P + 0.5, `${p.kind} outside its breath`);
        assert.ok(p.db <= -30, `${p.kind} too loud: ${p.db}`);
      }
      const ex = c.parts.find((p) => p.kind === "exhale");
      if (ex) assert.ok(Math.abs(ex.at - P / 2) <= 0.1 + 1e-9, "exhale at the breath peak");
    }
  }
  for (let i = 1; i < starts.length; i++) near(starts[i] - starts[i - 1], P, 1e-6); // exactly one cycle per breath
  assert.ok(skips > 0 && cycles > skips);
}
console.log("audioScore.check ok");
