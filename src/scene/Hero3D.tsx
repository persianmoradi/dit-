import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { BufferAttribute, BufferGeometry, CanvasTexture, Color, Group, Points, ShaderMaterial, Vector3, Vector4 } from "three";
import { boops } from "../boop.ts";
import { breath as breathClock, moods, talk, tricks, type TrickId } from "../tricks.ts";
import { buildBear, buildHeart, CHARM_POS, CHEEK_POS, EAR_BASES, EYE_Y, HEART_POS, LEG_BASES, MOUTH_POS, NECK, NOSE_POS, SHOULDERS } from "./bear.ts";
import { blink, BOOP_IMPULSE, damp, pulse, stepSpring } from "./motion.ts";
import { backdropFragment, backdropVertex, figureFragment, figureVertex, fluffFragment, fluffVertex, lipFragment, lipVertex, PART_SLOTS } from "./shaders.ts";
import {
  addPose, clearPose, copyPose, DAY_BREATH_PERIOD, heartPose, HOLD_AGE, makePose, SLEEP_BREATH_PERIOD, TRICK_DURATION, TRICK_EVENTS, trickPose, YAWN_DURATION, yawnPose,
} from "./trickTimeline.ts";

const RING_R = 0.33;
const BEAR_SCALE = 0.78;
const STATIC_TIME = 14; // frozen moment for reduced motion
const EAR_TILT = 0.35;
const ARM_REST_Z = 0.5;
const ARM_REST_X = -0.35; // paws rest on his knees
const LEG_REST_X = -1.3; // seated: legs point at the camera
const FADE = 0.5; // a trick cut short (or sleep ending) eases back to idle instead of popping
const FLUFFS = 32;
const FLUFF_LIFE = 1.3;
const VIS = 2 * 13.7 * Math.tan(Math.PI / 12); // world height visible at z=0 (camera fov 30)
const SEAT0 = 0.5 - 1.03 / VIS; // seat line (world y 0) as a screen v, camera at y 1.03
const KB_SEAT = 0.58; // mobile keyboard open: the bear moves up into the visible strip
const KB_SHRINK = 0.38;
const SLOW_FRAME = 0.018;
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const seg01 = (a: number, from: number, to: number) => Math.min(1, Math.max(0, (a - from) / (to - from)));

const makeSprite = () => {
  const c = document.createElement("canvas");
  c.width = c.height = 32;
  const x = c.getContext("2d")!;
  const g = x.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.55, "rgba(255,255,255,0.55)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = g;
  x.fillRect(0, 0, 32, 32);
  return new CanvasTexture(c);
};

export function Hero3D({ reducedMotion }: { reducedMotion: boolean }) {
  const { gl, camera, invalidate } = useThree();
  const root = useRef<Group>(null);
  const body = useRef<Group>(null);
  const head = useRef<Group>(null);
  const eyes = useRef<Group>(null);
  const earL = useRef<Group>(null);
  const earR = useRef<Group>(null);
  const armL = useRef<Group>(null);
  const armR = useRef<Group>(null);
  const legL = useRef<Group>(null);
  const legR = useRef<Group>(null);
  const cheekL = useRef<Group>(null);
  const cheekR = useRef<Group>(null);
  const noseG = useRef<Group>(null);
  const mouthG = useRef<Group>(null);
  const charm = useRef<Group>(null);
  const fx = useRef<Group>(null); // world-space effects (fluff, heart): never yaw with the bear
  const heartG = useRef<Group>(null);
  // layout the bear sits in (written every frame, read by pointer/boop handlers)
  const screen = useRef({ aspect: 1, cx: 0.5, seat: SEAT0, scale: 1 });
  const pointer = useRef({ x: 0, y: 0, lastU: -1, lastV: -1, lastT: 0, touched: false, tu: 0.5, tv: 0.5, su: 0.5, sv: 0.5, has: false, pend: 0 });
  const look = useRef({ x: 0, y: 0, ex: 0, ey: 0 }); // head gaze and (faster) eye gaze
  // idle schedule + boop spring, all on our own clock
  const life = useRef({
    blinkAt: 2, dbl: false, twitchAt: 4, twitchSide: 0, lookAt: 6, lookEnd: 0, tx: 0, ty: 0, yawnAt: 25, yawnStart: -10,
    pokeAt: 14, pokePuffed: true, boopAt: -10, bph: 0, squash: { x: 0, v: 0 }, sink: { x: 0, v: 0 },
    thinkW: 0, listenW: 0, thinkT: 0, thinkStart: -10, kbK: 0, wasThinking: false,
  });
  // trick playback: start time on our clock, next event, and the last applied pose (to ease out of it)
  const trick = useRef({ id: null as TrickId | null, start: 0, ev: 0, fadeStart: -10, last: makePose(), from: makePose() });
  // talking bob state: smoothed weight, current syllable, and syllables left before a word break
  const speak = useRef({ w: 0, sylStart: 0, sylEnd: 0, amp: 0, left: 0, mouth: 0 });
  const mood = useRef(moods.get());
  const quality = useRef({ slow: 0, dropped: false });
  const anchors = useRef({ key: "", hx: NaN, hy: NaN, mx: NaN, my: NaN });
  // fluff pool: allocated once, recycled
  const fl = useMemo(
    () => ({ next: 0, alive: 0, birth: new Float32Array(FLUFFS).fill(-100), p0: new Float32Array(FLUFFS * 3), v: new Float32Array(FLUFFS * 3), s0: new Float32Array(FLUFFS) }),
    [],
  );
  const poses = useMemo(() => ({ acc: makePose(), tr: makePose(), aux: makePose() }), []);
  const hp = useMemo(() => ({ scale: 0, y: 0, x: 0 }), []);
  const lite = useMemo(() => window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 720, []);
  const partMax = lite ? 3 : PART_SLOTS;

  const bear = useMemo(buildBear, []);
  const heart = useMemo(buildHeart, []);
  const fluffGeo = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(new Float32Array(FLUFFS * 3), 3).setUsage(35048));
    g.setAttribute("aSize", new BufferAttribute(new Float32Array(FLUFFS), 1).setUsage(35048));
    g.setAttribute("aCol", new BufferAttribute(new Float32Array(FLUFFS * 4), 4).setUsage(35048));
    return g;
  }, []);
  const sprite = useMemo(makeSprite, []);
  const fluffMat = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: fluffVertex,
        fragmentShader: fluffFragment,
        transparent: true,
        depthWrite: false,
        uniforms: { uK: { value: 1 }, uMap: { value: sprite } },
      }),
    [sprite],
  );
  const fluffPoints = useMemo(() => {
    const p = new Points(fluffGeo, fluffMat);
    p.frustumCulled = false;
    p.visible = false;
    p.renderOrder = 3;
    return p;
  }, [fluffGeo, fluffMat]);

  const shared = useMemo(
    () => ({
      uTime: { value: 0 },
      uAspect: { value: 1 },
      uCx: { value: 0.5 },
      uSeat: { value: SEAT0 },
      uShift: { value: 0 },
      uScale: { value: 1 },
      uSink: { value: 0 },
      uSwell: { value: 1 },
      uQ: { value: lite ? 0 : 1 },
      uAct: { value: 0 },
      uPart: { value: Array.from({ length: PART_SLOTS }, () => new Vector4()) },
    }),
    [lite],
  );
  const bgMat = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: backdropVertex,
        fragmentShader: backdropFragment,
        depthTest: false,
        depthWrite: false,
        uniforms: { ...shared, uRingR: { value: RING_R }, uLite: { value: lite ? 1 : 0 }, uPx: { value: 0.001 } },
      }),
    [shared, lite],
  );
  const lipMat = useMemo(
    () => new ShaderMaterial({ vertexShader: lipVertex, fragmentShader: lipFragment, depthTest: false, depthWrite: false, transparent: true, uniforms: shared }),
    [shared],
  );
  const figureMat = useMemo(
    () => new ShaderMaterial({ vertexShader: figureVertex, fragmentShader: figureFragment, transparent: true, uniforms: { uScale: { value: 1 }, uCut: { value: 0 } } }),
    [],
  );

  useEffect(() => invalidate(), [reducedMotion, invalidate]); // repaint the still pose when the setting flips
  useEffect(
    () => () => {
      document.body.style.cursor = "";
      Object.values(bear).forEach((g) => g.dispose());
      heart.dispose();
      fluffGeo.dispose();
      fluffMat.dispose();
      sprite.dispose();
      bgMat.dispose();
      lipMat.dispose();
      figureMat.dispose();
    },
    [bear, heart, fluffGeo, fluffMat, sprite, bgMat, lipMat, figureMat],
  );

  // thinking / listening / keyboard flags from the talk UI: refs only, the frame loop reads them
  useEffect(() => {
    mood.current = moods.get();
    return moods.subscribe(() => {
      mood.current = moods.get();
      invalidate();
    });
  }, [invalidate]);

  const parts = shared.uPart.value;
  const slot = useRef(0);
  /** u/v: screen position, 0..1 y up. s > 0 parts the clouds, s < 0 puffs them. */
  const addPart = (u: number, v: number, t: number, s: number) => {
    parts[slot.current].set((u - 0.5) * screen.current.aspect, v, t, s);
    slot.current = (slot.current + 1) % partMax;
  };
  /** A puff at an offset from the bear's centre (event u: 0.5 = right under him). */
  const puffAt = (u: number, t: number, s: number) => {
    const sc = screen.current;
    addPart(sc.cx + (u - 0.5) * sc.scale, sc.seat, t, s);
  };
  // own clock: R3F zeroes state.clock when frameloop goes "never" (hero offscreen), which replayed the intro
  const clock = useRef({ elapsedTime: 0 }).current;

  // a boop from anywhere (3D click or the DOM button): squash-and-stretch + a puff under him
  useEffect(
    () =>
      boops.subscribe(() => {
        if (tricks.get() === "sleep") tricks.done(); // a poke wakes him
        if (reducedMotion) return;
        const L = life.current;
        const t = clock.elapsedTime;
        L.squash.v += BOOP_IMPULSE;
        L.boopAt = t;
        puffAt(0.5, t, -0.5);
        invalidate();
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reducedMotion, clock, invalidate],
  );

  // trick started/stopped from the DOM: remember the start on our clock, and the pose to ease out of
  useEffect(() => {
    const T = trick.current;
    let hold = 0;
    const sync = () => {
      const next = tricks.get();
      if (next === T.id) return;
      const t = clock.elapsedTime;
      if (T.id === "sleep" && !next) life.current.yawnStart = t; // wakes with a stretch
      copyPose(T.from, T.last);
      T.fadeStart = t;
      T.id = next;
      T.start = t;
      T.ev = 0;
      clearTimeout(hold);
      // reduced motion: a still pose hold, then hand control back (no travel, no puffs)
      if (reducedMotion && next) hold = window.setTimeout(() => tricks.get() === next && tricks.done(), next === "sleep" ? 14000 : 1000);
      invalidate();
    };
    sync();
    const off = tricks.subscribe(sync);
    return () => {
      off();
      clearTimeout(hold);
    };
  }, [reducedMotion, clock, invalidate]);

  useEffect(() => {
    if (reducedMotion) return;
    const el = gl.domElement;
    let releaseTimer = 0;
    let pressed = false;
    // cached rect: avoids a forced layout on every pointermove
    let r = el.getBoundingClientRect();
    let dirty = false;
    const measure = () => (dirty = true); // re-measure lazily on the next pointer event

    window.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    const toUv = (e: PointerEvent) => {
      if (dirty) {
        r = el.getBoundingClientRect();
        dirty = false;
      }
      const u = (e.clientX - r.left) / r.width;
      const v = 1 - (e.clientY - r.top) / r.height;
      return u >= 0 && u <= 1 && v >= 0 && v <= 1 ? [u, v] : null;
    };
    const aim = (u: number, v: number) => {
      const p = pointer.current, sc = screen.current;
      p.x = Math.max(-1, Math.min(1, (u - sc.cx) * 2)); // relative to the bear, not the screen
      p.y = Math.max(-1, Math.min(1, (v - sc.seat - 0.17) * 2));
      p.tu = u;
      p.tv = v;
      if (!p.has) (p.su = u), (p.sv = v), (p.has = true);
      p.touched = true;
    };
    // mouse/pen: Ditó watches the cursor anywhere over the hero, and the clouds part lazily under it
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch" && !pressed) return;
      const uv = toUv(e);
      if (!uv) return;
      aim(uv[0], uv[1]);
      const p = pointer.current;
      const t = clock.elapsedTime;
      if (Math.hypot(uv[0] - p.lastU, uv[1] - p.lastV) > 0.05 && t - p.lastT > 0.22) {
        p.pend = Math.max(p.pend, 0.55);
        p.lastU = uv[0];
        p.lastV = uv[1];
        p.lastT = t;
      }
    };
    // touch: only a tap/press on the hero turns Ditó's head; page scrolling stays native
    const onDown = (e: PointerEvent) => {
      const uv = toUv(e);
      if (!uv || (e.target as Element | null)?.closest("a, button, input, form")) return;
      pressed = true;
      clearTimeout(releaseTimer);
      aim(uv[0], uv[1]);
      const p = pointer.current;
      p.pend = 0.7;
      if (e.pointerType !== "mouse") (p.su = uv[0]), (p.sv = uv[1]);
    };
    const onUp = (e: PointerEvent) => {
      pressed = false;
      if (e.pointerType !== "mouse") releaseTimer = window.setTimeout(() => (pointer.current.touched = false), 1400);
    };
    const onLeave = () => (pointer.current.touched = false);
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("pointerup", onUp, { passive: true });
    window.addEventListener("pointercancel", onUp, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    return () => {
      clearTimeout(releaseTimer);
      window.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      document.documentElement.removeEventListener("pointerleave", onLeave);
    };
  }, [reducedMotion, clock, gl]);

  const tmp = useMemo(() => new Vector3(), []);
  const tint = useMemo(() => [new Color("#fff1e0"), new Color("#ffc99a")], []);
  const rootStyle = document.documentElement.style;

  // project a point (world, bear at rest) to canvas px and write the CSS var pair when it changed
  const writeAnchor = (name: "head" | "mouth", x: number, y: number, z: number, w: number, h: number, last: { x: number; y: number }) => {
    tmp.set(x, y, z).project(camera);
    const px = Math.round((tmp.x * 0.5 + 0.5) * w), py = Math.round((1 - (tmp.y * 0.5 + 0.5)) * h);
    if (px !== last.x) rootStyle.setProperty(`--${name}-x`, `${px}px`);
    if (py !== last.y) rootStyle.setProperty(`--${name}-y`, `${py}px`);
    last.x = px;
    last.y = py;
  };
  const aHead = useMemo(() => ({ x: NaN, y: NaN }), []);
  const aMouth = useMemo(() => ({ x: NaN, y: NaN }), []);

  // priority 1: we own the render (one pass: sky + figure + lip + fluff, ordered by renderOrder)
  useFrame((state, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    clock.elapsedTime += Math.min(rawDelta, 0.25); // real time on slow devices, no jump after a stall
    const now = clock.elapsedTime;
    const anim = !reducedMotion;
    const t = anim ? now : STATIC_TIME;
    const { width: cw, height: ch } = state.size;
    const aspect = cw / ch;
    const L = life.current, p = pointer.current, lk = look.current, T = trick.current, S = speak.current;
    const { acc, tr, aux } = poses;
    const md = mood.current;

    // ---- slow GPU: after 2 s over budget drop to dpr 1 and one fewer octave
    const Q = quality.current;
    if (anim && !Q.dropped) {
      Q.slow = Math.min(3, Math.max(0, Q.slow + (rawDelta > SLOW_FRAME && rawDelta < 0.25 ? rawDelta : -rawDelta)));
      if (Q.slow > 2) {
        Q.dropped = true;
        shared.uQ.value = 0;
        state.setDpr(1);
      }
    }

    // ---- layout: centre column (desktop leaves the right for the talk UI), keyboard shrink + lift, mobile seat
    L.kbK = anim ? L.kbK + ((md.kb ? 1 : 0) - L.kbK) * damp(5, dt) : md.kb ? 1 : 0;
    const kb = L.kbK;
    const cx = cw >= 1100 ? 0.4 : 0.5;
    const seatBase = (SEAT0 + (0.4 - SEAT0) * Math.min(1, Math.max(0, (1 - aspect) / 0.3))) * (1 - kb) + KB_SEAT * kb;
    const scale = Math.min(1, Math.max(0.62, aspect * 1.3)) * (1 - KB_SHRINK * kb);
    const bobV = anim ? Math.sin(t * 1.43) * 0.003 * (1 - 0.5 * Math.min(1, acc.sleepy)) : 0; // cloud and bear float together
    const seat = seatBase + bobV;
    const offX = (cx - 0.5) * VIS * aspect;
    const offY = (seatBase - SEAT0) * VIS;
    const sK = scale * BEAR_SCALE;
    const sc = screen.current;
    sc.aspect = aspect;
    sc.cx = cx;
    sc.seat = seat;
    sc.scale = scale;

    // ---- head/mouth anchors for the DOM (speech bubble, zzz): only when the layout changed
    const an = anchors.current;
    const key = `${cw}|${ch}|${cx}|${seatBase.toFixed(4)}|${scale.toFixed(4)}`;
    if (key !== an.key) {
      an.key = key;
      const ry = offY + 0.3 * scale;
      writeAnchor("head", offX + 1.35 * sK, ry + (NECK[1] + 0.9) * sK, 0, cw, ch, aHead);
      writeAnchor("mouth", offX + MOUTH_POS[0] * sK, ry + (NECK[1] + MOUTH_POS[1]) * sK, MOUTH_POS[2] * sK, cw, ch, aMouth);
    }

    // ---- cursor parting: the spawn point lags the cursor so the cloud follows lazily
    if (anim && p.has) {
      p.su += (p.tu - p.su) * damp(2.2, dt);
      p.sv += (p.tv - p.sv) * damp(2.2, dt);
      if (p.pend > 0) (addPart(p.su, p.sv, now, p.pend), (p.pend = 0));
    }
    let act = 0;
    for (let i = 0; i < PART_SLOTS; i++) if (parts[i].w !== 0 && now - parts[i].z < 6) act = 1;
    shared.uAct.value = act;

    // ---- tricks: pose timeline (pure), events, and easing out of whatever was playing
    clearPose(acc);
    let age = -1;
    if (T.id) {
      if (anim) {
        age = now - T.start;
        const evs = TRICK_EVENTS[T.id];
        while (T.ev < evs.length && age >= evs[T.ev].at) {
          const ev = evs[T.ev++];
          if (ev.kind === "puff") {
            puffAt(ev.u, now, ev.s);
            if (ev.s <= -1) L.sink.v -= 0.43 * scale * -ev.s; // the landing dents the cloud
          } else if (ev.kind === "fluff") {
            for (let k = 0; k < ev.n; k++) {
              const i = fl.next;
              fl.next = (fl.next + 1) % FLUFFS;
              fl.birth[i] = now;
              fl.p0[i * 3] = rand(-0.6, 0.6);
              fl.p0[i * 3 + 1] = 0.05;
              fl.p0[i * 3 + 2] = rand(0.3, 1.0);
              fl.v[i * 3] = rand(-0.5, 0.5);
              fl.v[i * 3 + 1] = rand(1.2, 2.1);
              fl.v[i * 3 + 2] = rand(-0.2, 0.4);
              fl.s0[i] = rand(0.08, 0.16);
              const c = tint[k % 2];
              const col = fluffGeo.attributes.aCol.array as Float32Array;
              col[i * 4] = c.r;
              col[i * 4 + 1] = c.g;
              col[i * 4 + 2] = c.b;
            }
            fl.alive = 1;
            fluffPoints.visible = true;
          }
        }
        trickPose(T.id, age, tr);
        if (age >= TRICK_DURATION[T.id]) tricks.done();
      } else {
        trickPose(T.id, HOLD_AGE[T.id], tr);
        tr.yaw = tr.lift = tr.legs = 0; // reduced motion: pose only, no travel
      }
      copyPose(T.last, tr);
      addPose(acc, tr);
    } else clearPose(T.last);
    const fw = anim ? 1 - seg01(now - T.fadeStart, 0, FADE) : 0;
    if (fw > 0) addPose(acc, T.from, fw * fw);

    // ---- moods from the talk UI: eased weights, then they behave like any other pose key
    const thinking = md.thinking && !T.id;
    if (thinking && !L.wasThinking) L.thinkStart = now;
    L.wasThinking = thinking;
    L.thinkT = thinking ? L.thinkT + dt : 0;
    L.thinkW = anim ? L.thinkW + ((thinking ? 1 : 0) - L.thinkW) * damp(6, dt) : thinking ? 1 : 0;
    L.listenW = anim ? L.listenW + ((md.listening && !T.id ? 1 : 0) - L.listenW) * damp(6, dt) : md.listening && !T.id ? 1 : 0;
    acc.think = L.thinkW;
    acc.listen = L.listenW;
    const chin = seg01(L.thinkT, 1.2, 1.7) * L.thinkW;
    acc.headRoll += 0.14 * acc.think - 0.1 * acc.listen;
    acc.headPitch += -0.06 * acc.think - 0.04 * acc.listen;
    acc.ears += 0.15 * acc.listen;

    const busy = !!T.id;
    const talking = anim && talk.get();
    const sl = Math.min(1, Math.max(0, acc.sleepy));
    const happy = pulse(t - L.boopAt, 1.1);

    // ---- talking bob: ~3 Hz nod, syllables with a random envelope, a short close between words
    S.w += ((talking ? 1 : 0) - S.w) * damp(10, dt);
    if (talking && now >= S.sylEnd) {
      S.sylStart = now;
      if (S.left <= 0) (S.sylEnd = now + 0.15), (S.amp = 0), (S.left = Math.floor(rand(4, 8)));
      else S.left--, (S.sylEnd = now + rand(0.12, 0.22)), (S.amp = rand(0.2, 0.8));
    }
    const env = talking ? S.amp * Math.sin(Math.PI * Math.min(1, (now - S.sylStart) / (S.sylEnd - S.sylStart))) : 0;
    S.mouth += (env - S.mouth) * damp(40, dt);
    if (S.w > 0.002) {
      acc.mouth += S.mouth * S.w;
      acc.headPitch += (Math.sin(now * Math.PI * 6.2) * 0.05 + S.mouth * 0.03) * S.w;
      acc.lift += 0.01 * S.w;
    }

    // ---- idle: yawn/stretch (never during a trick or chat)
    if (anim) {
      if (now >= L.yawnAt) {
        if (busy || talking || sl > 0.05) L.yawnAt = now + 4;
        else (L.yawnStart = now), (L.yawnAt = now + rand(40, 70));
      }
      if (now - L.yawnStart < YAWN_DURATION) addPose(acc, yawnPose(now - L.yawnStart, aux));
    }

    // ---- idle: breathing phase accumulates so the sleep slowdown (3.6 s -> 5.5 s) never jumps
    const period = DAY_BREATH_PERIOD + (SLEEP_BREATH_PERIOD - DAY_BREATH_PERIOD) * sl;
    if (anim) L.bph += (dt * Math.PI * 2) / period;
    breathClock.phase = L.bph; // read by the snore scheduler (src/audio.ts); trough = inhale start
    const breath = anim ? Math.sin(L.bph) : 0;
    const amp = 1 + 0.6 * sl;

    // ---- idle: every 14-22 s the right paw pokes the cloud (and he glances down)
    let poke = 0;
    if (anim && !busy && !talking) {
      if (t >= L.pokeAt + 0.8) (L.pokeAt = t + rand(14, 22)), (L.pokePuffed = false);
      poke = pulse(t - L.pokeAt, 0.8);
      if (!L.pokePuffed && t >= L.pokeAt + 0.4) {
        L.pokePuffed = true;
        addPart(cx + (1.25 * sK) / (VIS * aspect), seat + 0.01, now, -0.25);
      }
    }

    // ---- gaze: the pointer, or an occasional look-around when it is idle; thinking glances toward the bubble
    let tx = 0.24, ty = -0.18; // the still pose
    if (anim) {
      if (t >= L.lookAt) {
        L.tx = rand(-0.7, 0.7);
        L.ty = rand(-0.43, 0.43);
        L.lookEnd = t + rand(1.5, 3);
        L.lookAt = t + rand(6, 11);
      }
      if (t > L.lookEnd) L.tx = L.ty = 0;
      tx = p.touched ? p.x : sl > 0.5 ? 0 : L.tx;
      ty = p.touched ? p.y : sl > 0.5 ? 0 : L.ty;
      if (poke > 0.05 && !p.touched) (tx = 0.3), (ty = -0.5);
      if (thinking) (tx = 0.5), (ty = 0.3);
      lk.x += (tx - lk.x) * damp(3.2, dt);
      lk.y += (ty - lk.y) * damp(3.2, dt);
      lk.ex += (tx - lk.ex) * damp(8.5, dt); // eyes lead the head
      lk.ey += (ty - lk.ey) * damp(8.5, dt);
    } else if (thinking) lk.x = lk.ex = 0.5, (lk.y = lk.ey = 0.3);
    else lk.x = lk.ex = tx, (lk.y = lk.ey = ty);

    // ---- seat cloud: sleep swells it around him, a landing dents it (spring)
    stepSpring(L.sink, dt, 9, 0.62);
    if (!anim) L.sink.x = L.sink.v = 0;
    const sink = 0.035 * scale * Math.min(1, acc.curl) + L.sink.x;

    // ---- root: rises out of the cloud on intro, floats with it, sway, trick travel
    const ease = 1 - Math.pow(1 - Math.min(1, t / 2.4), 3);
    stepSpring(L.squash, dt);
    const sq = L.squash.x;
    const g = root.current!, b = body.current!, h = head.current!, e = eyes.current!, el = earL.current!, er = earR.current!;
    g.scale.setScalar(sK);
    g.position.set(offX, offY + bobV * VIS + 0.3 * scale + (ease - 1) * 4 * scale + Math.max(sq, 0) * 0.22 * scale + acc.lift * scale + sink * VIS, 0);
    g.rotation.set((anim ? Math.sin(t * 0.86) * 0.02 : 0) + acc.lean, acc.yaw, (anim ? Math.sin(t * 1.14) * 0.025 : 0) + acc.roll);

    const bx = 1 - sq * 0.07 - breath * 0.005 * amp + acc.sqX;
    b.scale.set(bx, 1 + sq * 0.12 + breath * 0.012 * amp + acc.sqY, bx);
    b.rotation.y = lk.x * 0.18;
    h.position.y = NECK[1] + (anim ? Math.sin(L.bph - (0.6 * Math.PI * 2) / period) * 0.012 * amp : 0);
    h.rotation.set(-lk.y * 0.28 + acc.headPitch, lk.x * 0.5, -lk.x * 0.06 + (anim ? Math.sin(t * 0.4) * 0.02 : 0) + acc.headRoll);
    e.position.set(lk.ex * 0.05, EYE_Y + lk.ey * 0.04, 0);

    // ---- blink (15% double), squint from tricks/boop, wide eyes while listening
    let open = 1;
    if (anim) {
      if (t > L.blinkAt + 0.14) {
        if (!L.dbl && Math.random() < 0.15) (L.dbl = true), (L.blinkAt += 0.32);
        else (L.dbl = false), (L.blinkAt = t + rand(2.6, 5.6));
      }
      open = blink(t - L.blinkAt, 0.14);
    }
    e.scale.set(1, Math.min(open, 1 - happy * 0.75) * (1 - Math.min(0.92, acc.squint)) * (1 + 0.08 * acc.listen), 1);

    // ---- ears: occasional twitch (the other ear echoes), fold back when booped, perk while talking; one flick when thinking starts
    if (anim && t > L.twitchAt + 0.45) {
      L.twitchAt = t + rand(5, 9);
      L.twitchSide = Math.random() < 0.5 ? 0 : 1;
    }
    const tw = pulse(t - L.twitchAt, 0.3) * 0.3;
    const echo = pulse(t - L.twitchAt - 0.12, 0.3) * 0.075;
    const earX = -0.1 - happy * 0.35 - S.w * 0.05;
    const flick = anim ? pulse(now - L.thinkStart - 0.2, 0.3) * 0.3 : 0;
    el.rotation.set(earX, 0, EAR_TILT + acc.ears + flick + (L.twitchSide === 0 ? tw : echo));
    er.rotation.set(earX, 0, -(EAR_TILT + acc.ears + (L.twitchSide === 1 ? tw : echo)));

    // ---- arms: breathing sway, trick offsets, the cloud poke, paw to chin while thinking
    const sway = -breath * 0.04;
    armR.current!.rotation.set(ARM_REST_X + acc.armFwd + acc.pawR - 0.55 * poke - 1.0 * chin, 0, ARM_REST_Z + acc.armR + sway - 0.35 * chin);
    armL.current!.rotation.set(ARM_REST_X + acc.armFwd, 0, -(ARM_REST_Z + acc.armL + sway));

    // ---- small parts: charm swing + boop jiggle, nose boop, cheeks, mouth, legs
    const since = t - L.boopAt;
    charm.current!.rotation.z = -g.rotation.z * 3 + (anim ? Math.sin(t * 1.14 - 0.46) * 0.1 : 0) + (since > 0 && since < 2 ? Math.sin(since * 22) * Math.exp(-since * 5) * 0.5 : 0);
    noseG.current!.scale.setScalar(1 + 0.25 * pulse(since, 0.3));
    cheekL.current!.scale.setScalar(1 + acc.cheek);
    cheekR.current!.scale.setScalar(1 + acc.cheek);
    const mo = Math.min(1, Math.max(0, acc.mouth)) * (1 - acc.listen);
    const mg = mouthG.current!;
    mg.visible = mo > 0.03;
    mg.scale.set(1 + 0.3 * mo, mo, 1);
    const curl = Math.min(1, acc.curl);
    const dangle = anim ? Math.sin(t * 7) * 0.1 * Math.max(acc.legs, 0) : 0;
    const lgL = legL.current!, lgR = legR.current!;
    lgL.position.x = -(0.62 - 0.17 * curl);
    lgR.position.x = 0.62 - 0.17 * curl;
    lgL.rotation.set(LEG_REST_X + 0.95 * acc.legs + 0.6 * curl + acc.legL + dangle, 0, -0.18);
    lgR.rotation.set(LEG_REST_X + 0.95 * acc.legs + 0.6 * curl + acc.legR - dangle, 0, 0.18);

    // ---- effects: hug heart, cloud fluff (both only alive while their timers run)
    const hg = heartG.current!;
    heartPose(T.id === "hug" && anim ? age : -1, hp);
    hg.visible = hp.scale > 0.001;
    if (hg.visible) {
      hg.position.set(HEART_POS[0] + hp.x + hp.y * 0.45, HEART_POS[1] + hp.y, HEART_POS[2]);
      hg.scale.setScalar(0.5 * hp.scale);
    }
    const fxg = fx.current!;
    fxg.scale.setScalar(sK);
    fxg.position.set(offX, offY + bobV * VIS, 0);
    if (fl.alive) {
      const pos = (fluffGeo.attributes.position as BufferAttribute).array as Float32Array;
      const siz = (fluffGeo.attributes.aSize as BufferAttribute).array as Float32Array;
      const col = (fluffGeo.attributes.aCol as BufferAttribute).array as Float32Array;
      let live = 0;
      for (let i = 0; i < FLUFFS; i++) {
        const a = now - fl.birth[i];
        if (a < 0 || a >= FLUFF_LIFE) {
          col[i * 4 + 3] = 0;
          siz[i] = 0;
          continue;
        }
        live = 1;
        const k = a / FLUFF_LIFE;
        pos[i * 3] = fl.p0[i * 3] + fl.v[i * 3] * a;
        pos[i * 3 + 1] = fl.p0[i * 3 + 1] + fl.v[i * 3 + 1] * a - 1.1 * 2.2 * a * a; // gravity 2.2
        pos[i * 3 + 2] = fl.p0[i * 3 + 2] + fl.v[i * 3 + 2] * a;
        siz[i] = fl.s0[i] * (1 + 0.8 * k);
        col[i * 4 + 3] = Math.min(1, a * 10) * (1 - k) * 0.9;
      }
      fluffGeo.attributes.position.needsUpdate = fluffGeo.attributes.aSize.needsUpdate = fluffGeo.attributes.aCol.needsUpdate = true;
      if (!live) (fl.alive = 0), (fluffPoints.visible = false);
    }
    fluffMat.uniforms.uK.value = (ch * gl.getPixelRatio() * sK) / (2 * Math.tan(Math.PI / 12));

    const u = shared;
    u.uTime.value = t;
    u.uAspect.value = aspect;
    u.uCx.value = cx;
    u.uSeat.value = seat;
    u.uShift.value = seatBase - SEAT0;
    u.uScale.value = scale;
    u.uSink.value = sink;
    u.uSwell.value = 1 + 0.3 * Math.min(1, acc.curl);
    bgMat.uniforms.uRingR.value = RING_R * scale;
    bgMat.uniforms.uPx.value = 1 / ch;
    figureMat.uniforms.uScale.value = sK;
    figureMat.uniforms.uCut.value = offY + bobV * VIS;

    gl.render(state.scene, camera);
  }, 1);

  return (
    <>
      <mesh renderOrder={-1} frustumCulled={false} material={bgMat} raycast={() => null}>
        <planeGeometry args={[2, 2]} />
      </mesh>
      <mesh renderOrder={2} frustumCulled={false} material={lipMat} raycast={() => null}>
        <planeGeometry args={[2, 2]} />
      </mesh>
      <group
        ref={root}
        onClick={(ev) => {
          ev.stopPropagation();
          boops.boop();
        }}
        onPointerOver={() => (document.body.style.cursor = "pointer")}
        onPointerOut={() => (document.body.style.cursor = "")}
      >
        <group ref={body}>
          <mesh geometry={bear.body} material={figureMat} />
          <group ref={charm} position={CHARM_POS}>
            <mesh geometry={bear.charm} material={figureMat} />
          </group>
          <group ref={legL} position={LEG_BASES[0]}>
            <mesh geometry={bear.leg} material={figureMat} />
          </group>
          <group ref={legR} position={LEG_BASES[1]}>
            <mesh geometry={bear.leg} material={figureMat} />
          </group>
          <group ref={armL} position={SHOULDERS[0]}>
            <mesh geometry={bear.arm} material={figureMat} />
          </group>
          <group ref={armR} position={SHOULDERS[1]}>
            <mesh geometry={bear.arm} material={figureMat} />
          </group>
          <group ref={head} position={NECK}>
            <mesh geometry={bear.head} material={figureMat} />
            <group ref={earL} position={EAR_BASES[0]}>
              <mesh geometry={bear.ear} material={figureMat} />
            </group>
            <group ref={earR} position={EAR_BASES[1]}>
              <mesh geometry={bear.earR} material={figureMat} />
            </group>
            <group ref={eyes} position-y={EYE_Y}>
              <mesh geometry={bear.eyes} material={figureMat} />
            </group>
            <group ref={cheekL} position={CHEEK_POS[0]}>
              <mesh geometry={bear.cheek} material={figureMat} />
            </group>
            <group ref={cheekR} position={CHEEK_POS[1]}>
              <mesh geometry={bear.cheek} material={figureMat} />
            </group>
            <group ref={noseG} position={NOSE_POS}>
              <mesh geometry={bear.nose} material={figureMat} />
            </group>
            <group ref={mouthG} position={MOUTH_POS} visible={false}>
              <mesh geometry={bear.mouth} material={figureMat} />
            </group>
          </group>
        </group>
      </group>
      <group ref={fx}>
        <primitive object={fluffPoints} raycast={() => null} />
        <group ref={heartG} visible={false}>
          <mesh geometry={heart} material={figureMat} raycast={() => null} />
        </group>
      </group>
    </>
  );
}
