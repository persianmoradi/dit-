import assert from "node:assert/strict";
import { TRICK_IDS } from "../tricks.ts";
import { heartPose, HEART_AT, HEART_LIFE, makePose, POSE_KEYS, SLEEP_ENTER, TRICK_DURATION, TRICK_EVENTS, trickPose, YAWN_DURATION, yawnPose } from "./trickTimeline.ts";

const TAU = Math.PI * 2;
const EPS = 1e-6;
const wrap = (x: number) => x - TAU * Math.round(x / TAU);
const neutral = (p: ReturnType<typeof makePose>, why: string) => {
  for (const k of POSE_KEYS) assert.ok(Math.abs(k === "yaw" ? wrap(p[k]) : p[k]) < EPS, `${why}: ${k}=${p[k]}`);
};

for (const id of TRICK_IDS) {
  const d = TRICK_DURATION[id];
  if (id === "sleep") assert.ok(d > SLEEP_ENTER && d <= 14, "sleep persists past its enter, up to 14 s");
  else assert.ok(d >= 1 && d <= 3, `${id} duration ${d}`);

  neutral(trickPose(id, 0), `${id} at 0`);
  if (id !== "sleep") neutral(trickPose(id, d), `${id} at end`);

  // finite and continuous at 60 fps (spin yaw compared unwrapped: it must be smooth, not just periodic)
  let prev = trickPose(id, 0);
  const cur = makePose();
  for (let k = 1; k / 60 < d && k / 60 <= 4; k++) {
    trickPose(id, k / 60, cur);
    for (const key of POSE_KEYS) {
      assert.ok(Number.isFinite(cur[key]), `${id}.${key} finite`);
      assert.ok(Math.abs(cur[key] - prev[key]) < 0.3, `${id}.${key} jumps ${Math.abs(cur[key] - prev[key])} at ${k / 60}s`);
    }
    prev = { ...cur };
  }

  const ev = TRICK_EVENTS[id];
  ev.forEach((e, i) => {
    assert.ok(e.at >= 0 && e.at < d, `${id} event ${i} inside duration`);
    if (i) assert.ok(e.at >= ev[i - 1].at, `${id} events sorted`);
    if (e.kind === "puff") assert.ok(e.s < 0 && e.s >= -1 && e.u > 0.3 && e.u < 0.7, `${id} puff ${i} is a negative-strength puff near him`);
    if (e.kind === "fluff") assert.ok(e.n > 0 && e.n <= 32, `${id} fluff fits the pool`);
  });
}

// moods are never set by a trick; only sleep curls
for (const id of TRICK_IDS) for (const a of [0.3, 1, 2]) {
  const p = trickPose(id, a);
  assert.ok(p.think === 0 && p.listen === 0, `${id} leaves the moods to the talk UI`);
  assert.ok(id === "sleep" ? p.curl >= 0 : p.curl === 0, `${id} curl`);
}
// jump: launch + landing fluff, the hard landing puff comes with the landing fluff
const jump = TRICK_EVENTS.jump;
assert.ok(jump.some((e) => e.kind === "fluff" && e.n === 20 && e.at > 1 && e.at < TRICK_DURATION.jump));
assert.ok(jump.some((e) => e.kind === "puff" && e.s === -1 && e.at === 1.25), "landing puff");
assert.ok(trickPose("jump", 0.2).legs < 0 && trickPose("jump", 1.0).legs > 0.5, "legs tuck on the crouch, dangle in the air");
assert.ok(trickPose("jump", 0.8).lift > 0.99 && trickPose("jump", 0.8).legs > 0.9, "airborne at the top");
// spin: a full turn, then back to facing the camera
assert.ok(Math.abs(trickPose("spin", TRICK_DURATION.spin - 1e-6).yaw - TAU) < 1e-3, "spin ends a full turn");
assert.ok(trickPose("spin", 1.0).yaw > 2 && trickPose("spin", 1.0).yaw < 5.5, "spin mid-turn");
// sleep holds its pose: curled, eyes shut
assert.ok(trickPose("sleep", 5).squint > 0.9 && trickPose("sleep", 5).sleepy === 1 && trickPose("sleep", 5).curl === 1);
assert.ok(trickPose("sleep", 5).headPitch > 0.45, "chin on the paws");
// dance kicks alternate legs
assert.ok(trickPose("dance", 0.375).legL > 0.25 && trickPose("dance", 0.375).legR === 0);
assert.ok(trickPose("dance", 1.125).legR > 0.25 && trickPose("dance", 1.125).legL === 0);
// yawn and heart return to nothing
neutral(yawnPose(YAWN_DURATION), "yawn end");
assert.ok(yawnPose(1.2).mouth > 0.8);
assert.equal(heartPose(HEART_AT - 0.1).scale, 0);
assert.ok(Math.abs(heartPose(HEART_AT + HEART_LIFE - 1e-9).scale) < 1e-6, "heart fades out");
assert.ok(heartPose(HEART_AT + 0.5).scale > 0.9 && heartPose(HEART_AT + 0.5).y > 0);

assert.ok(HEART_AT + HEART_LIFE <= TRICK_DURATION.hug);

console.log("tricks ok");
