import {
  BoxGeometry, BufferAttribute, BufferGeometry, CapsuleGeometry, Euler, Matrix4, Quaternion, Shape, ShapeGeometry,
  SphereGeometry, TorusGeometry, Vector3,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

// Ditó the teddy, built from primitives and merged per moving part (body, head, ear x2, eyes, arm, leg, nose,
// cheek, mouth, charm). Colours are display-space sRGB, matching the scene shaders. Alpha channel = gloss.

const C = {
  fur: "#ff8a2a",
  furDeep: "#e8650f",
  furLight: "#ffa552",
  cream: "#ffe8cf",
  creamShade: "#f3cfa8",
  innerEar: "#ffb08a",
  nose: "#5b2a1a",
  eye: "#1a0f14",
  white: "#ffffff",
  accent: "#ffe1bf", // cream stitched dash: the ó accent
  blush: "#ffa27a",
  mouth: "#7a2e1e",
  mouthIn: "#4a1a12",
  stitch: "#b8480e",
  brass: "#f0a865",
  heart: "#ff6a5a",
};

type V3 = [number, number, number];
const rgb = (hex: string): V3 => [parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255];
const smooth = (k: number) => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k));
const hash = (x: number, y: number, z: number) => {
  const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
  return s - Math.floor(s);
};

interface Look {
  gloss?: number;
  /** vertical colour gradient: blends toward `to` between y0 and y1 (final, placed coordinates) */
  grad?: { to: string; y0: number; y1: number };
}

/** Writes aCol (rgb + gloss). Fur gets a seeded +-4% brightness jitter keyed on position, so sphere seams match. */
function paint(g: BufferGeometry, hex: string, { gloss = 0, grad }: Look = {}) {
  const base = rgb(hex), to = grad ? rgb(grad.to) : base;
  const pos = g.attributes.position;
  const a = new Float32Array(pos.count * 4);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const k = grad ? smooth((y - grad.y0) / (grad.y1 - grad.y0)) : 0;
    const j = gloss === 0 ? 1 + (hash(Math.round(x * 40), Math.round(y * 40), Math.round(z * 40)) - 0.5) * 0.08 : 1;
    for (let c = 0; c < 3; c++) a[i * 4 + c] = Math.min(1, (base[c] + (to[c] - base[c]) * k) * j);
    a[i * 4 + 3] = gloss;
  }
  g.setAttribute("aCol", new BufferAttribute(a, 4));
  g.deleteAttribute("uv");
  return g;
}

function mk(g: BufferGeometry, hex: string, pos: V3 = [0, 0, 0], look: Look = {}, scl: V3 = [1, 1, 1], rot: V3 = [0, 0, 0]) {
  g.applyMatrix4(new Matrix4().compose(new Vector3(...pos), new Quaternion().setFromEuler(new Euler(...rot)), new Vector3(...scl)));
  return paint(g, hex, look);
}

const ball = (r: number, hex: string, pos: V3, scl: V3 = [1, 1, 1], look: Look = {}, seg = 32, rot: V3 = [0, 0, 0]) =>
  mk(new SphereGeometry(r, seg, Math.round(seg * 0.75)), hex, pos, look, scl, rot);
const dash = (len: number, r: number, hex: string, pos: V3, rot: V3 = [0, 0, 0]) =>
  mk(new CapsuleGeometry(r, Math.max(len - 2 * r, 0.001), 2, 6), hex, pos, {}, [1, 1, 1], rot);

/** Neck pivot (body space) and head ellipsoid (neck space). */
export const NECK: V3 = [0, 1.1, 0];
const HEAD_C = new Vector3(0, 0.82, 0.05);
const HEAD_R = new Vector3(1.25, 1.08, 1.1);
/** Point on the head surface along `dir`, pulled in by `inset`. */
function onHead(dir: V3, inset = 0): V3 {
  const d = new Vector3(...dir).normalize();
  const p = d.clone().multiply(HEAD_R).add(HEAD_C).addScaledVector(d, -inset);
  return [p.x, p.y, p.z];
}

export const EYE_Y = onHead([0.52, 0.12, 0.84], 0.05)[1];
export const EAR_BASES: [V3, V3] = [onHead([-0.68, 0.74, 0.02], 0.1), onHead([0.68, 0.74, 0.02], 0.1)];
export const SHOULDERS: [V3, V3] = [[-0.98, 0.8, 0.2], [0.98, 0.8, 0.2]];
export const LEG_BASES: [V3, V3] = [[-0.62, 0.22, 0.78], [0.62, 0.22, 0.78]]; // seated: hips on the belly, legs point at the camera
const MUZZLE = onHead([0, -0.24, 0.9], 0.12); // cream muzzle centre (radii 0.44, 0.35, 0.35)
export const NOSE_POS: V3 = [0, MUZZLE[1] + 0.17, MUZZLE[2] + 0.3];
export const MOUTH_POS: V3 = [0, MUZZLE[1] - 0.05, MUZZLE[2] + 0.31];
export const CHEEK_POS: [V3, V3] = [onHead([-0.7, -0.12, 0.68], 0.08), onHead([0.7, -0.12, 0.68], 0.08)];
export const CHARM_POS: V3 = [0, 0.82, 1.0]; // body space, swings from here
export const HEART_POS: V3 = [0, 0.3, 1.7]; // in front of the muzzle so it reads from the camera
const MZ_Z = MUZZLE[2] + 0.335; // muzzle surface depth near the mouth, for flat decals

export function buildBear() {
  // body: ellipsoid, darker toward the cloud, cream belly patch on a slightly larger stitched-on edge
  const patchZ = (y: number) => 0.55 + 0.42 * Math.sqrt(Math.max(0, 1 - ((y - 0.3) / 0.8) ** 2));
  const seam: BufferGeometry[] = [];
  for (let i = 0; i < 9; i++) {
    const y = 0.93 - i * 0.1;
    seam.push(dash(0.05, 0.016, C.stitch, [0, y, patchZ(y) + 0.004]));
  }
  const body = mergeGeometries([
    ball(1, C.fur, [0, 0.25, 0], [1.05, 1, 0.9], { grad: { to: C.furDeep, y0: 0.35, y1: -0.5 } }),
    ball(1, C.creamShade, [0, 0.3, 0.53], [0.78, 0.86, 0.4]),
    ball(1, C.cream, [0, 0.3, 0.55], [0.72, 0.8, 0.42]),
    ...seam,
  ])!;

  // head (neck space): big round, protruding cream muzzle, stitched forehead seam, brow dash
  const fore: BufferGeometry[] = [];
  for (let i = 0; i < 5; i++) {
    const a = 0.3 + i * 0.15;
    fore.push(dash(0.06, 0.016, C.stitch, onHead([0, Math.cos(a), Math.sin(a)], -0.004), [a - Math.PI / 2, 0, 0]));
  }
  const arc = (side: number) => mk(new TorusGeometry(0.085, 0.015, 6, 14, Math.PI), C.mouth, [side * 0.085, MOUTH_POS[1] + 0.07, MZ_Z], {}, [1, 1, 1], [0, 0, Math.PI]);
  const head = mergeGeometries([
    ball(1, C.fur, HEAD_C.toArray() as V3, HEAD_R.toArray() as V3, { grad: { to: C.furLight, y0: 1.3, y1: 1.95 } }, 40),
    ball(0.44, C.cream, MUZZLE, [1, 0.8, 0.8]),
    ball(0.2, C.cream, [0, MUZZLE[1] - 0.26, MUZZLE[2] - 0.02]),
    dash(0.1, 0.014, C.mouth, [0, MOUTH_POS[1] + 0.12, MZ_Z]), // philtrum
    arc(-1), arc(1),
    dash(0.3, 0.05, C.accent, onHead([0.52, 0.45, 0.78], 0.03), [0, 0.2, 0.3 + Math.PI / 2]),
    ...fore,
  ])!;

  // ear pivots at its base; right ear carries the mended patch
  const earParts = (): BufferGeometry[] => [
    ball(0.38, C.fur, [0, 0.2, 0], [1, 1, 0.5], { grad: { to: C.furLight, y0: 0.0, y1: 0.55 } }),
    ball(0.22, C.innerEar, [0, 0.2, 0.12], [1, 1, 0.28]),
  ];
  const ear = mergeGeometries(earParts())!;
  const earR = mergeGeometries([
    ...earParts(),
    mk(new BoxGeometry(0.2, 0.2, 0.03), C.cream, [0.13, 0.34, 0.165], {}, [1, 1, 1], [0, 0, 0.3]),
    dash(0.22, 0.012, C.stitch, [0.13, 0.34, 0.185], [0, 0, 0.3 + Math.PI / 4]),
    dash(0.22, 0.012, C.stitch, [0.13, 0.34, 0.185], [0, 0, 0.3 - Math.PI / 4]),
  ])!;

  // eyes are built around eye level so the group can blink by scaling y
  const eyes: BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    const [x, y, z] = onHead([side * 0.52, 0.12, 0.84], 0.05);
    eyes.push(
      ball(0.13, C.eye, [x, y - EYE_Y, z], [0.9, 1, 0.6], { gloss: 1 }, 16, [0, side * 0.35, 0]),
      ball(0.04, C.white, [x - 0.04, y - EYE_Y + 0.05, z + 0.06], [1, 1, 1], { gloss: 1 }, 10),
    );
  }

  const nose = mergeGeometries([
    ball(0.12, C.nose, [0, 0, 0], [1.4, 0.9, 0.8], { gloss: 0.6 }, 20),
    ball(0.03, C.white, [-0.06, 0.05, 0.08], [1, 1, 1], { gloss: 1 }, 8),
  ])!;

  const arm = mergeGeometries([
    mk(new CapsuleGeometry(0.27, 0.21, 8, 20), C.fur, [0, -0.375, 0]),
    ball(0.24, C.cream, [0, -0.7, 0.03], [1, 1, 1], {}, 20),
  ])!;
  // short stubby legs (hanging down in leg space; Hero3D rotates them forward), cream foot pad at the end
  const leg = mergeGeometries([
    mk(new CapsuleGeometry(0.34, 0.2, 6, 16), C.furDeep, [0, -0.3, 0]),
    ball(0.3, C.cream, [0, -0.62, 0.1], [1, 0.6, 1.3], {}, 18),
  ])!;

  const charm = mergeGeometries([
    dash(0.24, 0.012, C.cream, [0, -0.12, 0]),
    mk(new TorusGeometry(0.13, 0.025, 8, 24), C.brass, [0, -0.36, 0], { gloss: 0.8 }),
  ])!;

  return {
    body, head, ear, earR, eyes: mergeGeometries(eyes)!, nose, arm, leg, charm,
    cheek: ball(0.15, C.blush, [0, 0, 0], [1, 0.75, 0.45], {}, 14),
    mouth: ball(0.12, C.mouthIn, [0, 0, 0], [1, 1, 0.5], {}, 16),
  };
}

export function buildHeart() {
  const s = new Shape();
  s.moveTo(0, -0.45);
  s.bezierCurveTo(-0.1, -0.35, -0.5, -0.05, -0.5, 0.2);
  s.bezierCurveTo(-0.5, 0.45, -0.15, 0.55, 0, 0.3);
  s.bezierCurveTo(0.15, 0.55, 0.5, 0.45, 0.5, 0.2);
  s.bezierCurveTo(0.5, -0.05, 0.1, -0.35, 0, -0.45);
  return paint(new ShapeGeometry(s, 12), C.heart, { gloss: 0.5 });
}
