// Colours are authored directly in display (sRGB) space; no colorspace chunk on purpose.
// Coordinates: v = screen height 0..1 (y up). "q" units are screen heights (x is scaled by aspect).

export const PART_SLOTS = 6;

export const backdropVertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.9999, 1.0);
}`;

// shared by the full-screen sky pass and the lip quad: noise, cursor/puff field, and the plump seat cloud
const cloudCommon = /* glsl */ `
uniform float uTime;
uniform float uAspect;
uniform float uCx;
uniform float uSeat;   // seat line, v (bobbing)
uniform float uShift;  // seat line minus its default: cloud banks follow it
uniform float uScale;
uniform float uSink;   // seat cloud top: + rises (sleep), - dents (landing)
uniform float uSwell;
uniform float uQ;      // 1 full, 0 cheaper (mobile / slow GPU)
uniform float uAct;    // 1 while any part/puff is alive
uniform vec4 uPart[${PART_SLOTS}]; // qx, qy, t0, strength (negative = puff)

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p, int oct) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 4; i++) {
    if (i >= oct) break;
    s += a * vnoise(p);
    p = p * 2.03 + vec2(17.3, 9.1);
    a *= 0.5;
  }
  return s / (1.0 - pow(0.5, float(oct)));
}

// xy: how far content slid aside (q units), z: hole (+) or swell (-), w: backlit rim around a hole
vec4 partField(vec2 q) {
  vec4 r = vec4(0.0);
  if (uAct < 0.5) return r;
  for (int i = 0; i < ${PART_SLOTS}; i++) {
    vec4 pt = uPart[i];
    float a = uTime - pt.z;
    if (pt.w == 0.0 || a < 0.0 || a > 6.0) continue;
    float se = pt.w * exp(-a / 2.6);
    vec2 d = q - pt.xy;
    float R = 0.16 + 0.015 * a;
    float w = exp(-dot(d, d) / (R * R));
    r.xy += d / (length(d) + 0.02) * 0.10 * abs(se) * w;
    r.z += (se > 0.0 ? 0.35 : 0.25) * se * w;
    r.w += max(se, 0.0) * 4.0 * w * (1.0 - w);
  }
  return r;
}

// the plump cloud he sits on. pc: relative to the seat line, bear-centred. returns rgb + alpha
vec4 seatCloud(vec2 pc, vec4 F, float zoom, float drift) {
  float s = uScale;
  float hw = 0.62 * s, hv = 0.2 * s;
  float yc = 0.05 * s - hv + uSink;
  vec2 pc0 = pc;
  pc -= F.xy * 0.35 * smoothstep(0.3 * s, 0.45 * s, abs(pc.x)); // the seat itself never moves
  vec2 p = pc / (0.18 * s) * zoom;
  p.x -= uTime * drift * uAspect / (0.18 * s) * zoom;
  p += 0.012 * sin(uTime * 0.35 + p.x * 3.0);
  int oct = uQ > 0.5 ? 4 : 3;
  float n = fbm(p, oct);
  float d0 = 1.0 - length(vec2(pc.x / hw, (pc.y - yc) / hv));
  float amp = 0.95 * uSwell;
  float d = 0.5 + d0 * 1.15 + (n - 0.5) * amp;
  // second tap, nudged toward the moon: where it is thinner than here, the edge faces the light
  vec2 toM = normalize(vec2(0.65, 0.76));
  float nL = fbm(p + toM * 0.1 * zoom, 3);
  float d0L = 1.0 - length(vec2((pc.x + toM.x * 0.02) / hw, (pc.y + toM.y * 0.02 - yc) / hv));
  float dL = 0.5 + d0L * 1.15 + (nL - 0.5) * amp;
  float lobe = smoothstep(0.3 * s, 0.45 * s, abs(pc0.x));
  float hz = F.z > 0.0 ? F.z * 0.35 * lobe : F.z;
  d -= hz;
  dL -= hz;
  float e = (yc - pc.y) / hv; // > 0 below the middle
  float shade = clamp((d - dL) * 7.0 + 0.32 - e * 0.18, 0.0, 1.0);
  vec3 col = mix(vec3(0.42, 0.227, 0.329), vec3(0.941, 0.627, 0.455), smoothstep(0.0, 0.5, shade));
  col = mix(col, vec3(1.0, 0.8, 0.6), smoothstep(0.5, 1.0, shade));
  col = mix(col, vec3(1.0, 0.604, 0.322), (1.0 - smoothstep(0.55, 0.85, d)) * smoothstep(-0.1, 0.5, e) * 0.75); // underside rim
  vec2 pq = vec2(pc0.x / (0.22 * s), pc0.y / (0.08 * s));
  col += vec3(1.0, 0.604, 0.322) * exp(-dot(pq, pq)) * 0.2; // light pool from the bear
  col = mix(col, vec3(1.0, 0.914, 0.812), clamp(-F.z * 2.5, 0.0, 0.6)); // puff
  col += vec3(1.0, 0.7, 0.45) * F.w * 0.12;
  float bot = smoothstep(0.35, 0.95, e); // the bottom melts into the bank behind it
  col = mix(col, vec3(0.29, 0.165, 0.29), bot);
  return vec4(col, smoothstep(0.42, 0.6, d) * (1.0 - bot));
}`;

export const backdropFragment = /* glsl */ `
uniform float uRingR;
uniform float uLite;
uniform float uPx;
varying vec2 vUv;
${cloudCommon}

vec3 skyCol(vec2 qb, float v, vec2 qw) {
  vec3 col = mix(vec3(0.231, 0.110, 0.086), vec3(0.114, 0.078, 0.149), smoothstep(0.0, 0.22, v));
  col = mix(col, vec3(0.078, 0.082, 0.169), smoothstep(0.22, 0.5, v));
  col = mix(col, vec3(0.024, 0.035, 0.078), smoothstep(0.5, 1.0, v));
  col += vec3(1.0, 0.518, 0.22) * exp(-length(qb * vec2(1.0, 2.4)) * 4.2) * 0.95; // amber glow behind the bear

  // stars, only well above the town
  float sm = smoothstep(0.28, 0.5, v);
  if (sm > 0.0) {
    vec2 sp = qw * 85.0;
    vec2 id = floor(sp);
    float h = hash(id);
    if (h > 0.965) {
      vec2 o = vec2(hash(id + 1.3), hash(id + 7.1)) - 0.5;
      float d = length(fract(sp) - 0.5 - o * 0.6);
      float tw = 0.55 + 0.45 * sin(uTime * (0.8 + h * 2.0) + h * 50.0);
      col += vec3(1.0, 0.93, 0.85) * smoothstep(0.13, 0.0, d) * tw * sm * (h - 0.965) * 45.0;
    }
  }
  // moon, inside the gate
  float md = length(qb - vec2(0.17, 0.2) * uScale);
  col += vec3(1.0, 0.722, 0.447) * exp(-md * 14.0) * 0.35;
  col = mix(col, vec3(1.0, 0.886, 0.722), smoothstep(0.04, 0.036, md));
  // the gate: a thin brass ring
  float dr = abs(length(qb) - uRingR);
  col += vec3(1.0, 0.66, 0.36) * (smoothstep(0.0028, 0.0, dr) * 0.85 + exp(-dr * 80.0) * 0.22);
  return col;
}

void main() {
  float v = vUv.y;
  float vv = v - uShift;
  vec2 qw = vec2((vUv.x - 0.5) * uAspect, v);
  vec2 qb = vec2((vUv.x - uCx) * uAspect, v - 0.5 - uShift);
  vec3 col = skyCol(qb, v, qw);
  vec4 F = partField(qw);
  int oct = uQ > 0.5 ? 4 : 3;

  // far cloud bank (drifts right)
  if (uLite < 0.5 && vv > 0.08 && vv < 0.26) {
    vec2 p = vec2((qw.x - F.x * 0.6 - uTime * 0.004 * uAspect) * 3.2, (vv - F.y * 0.6) * 11.0);
    float d = fbm(p, oct - 1) - F.z * 0.6;
    float m = smoothstep(0.08, 0.14, vv) * smoothstep(0.26, 0.18, vv);
    float edge = 1.0 - smoothstep(0.45, 0.75, d);
    vec3 c = mix(vec3(0.353, 0.165, 0.188), vec3(0.784, 0.443, 0.29), edge * edge);
    col = mix(col, c, smoothstep(0.4, 0.62, d) * 0.55 * m);
  }

  // town silhouette (static), a clock tower, flickering windows
  if (v < 0.21) {
    float cw = 0.035;
    float ci = floor(qw.x / cw);
    float fx = qw.x / cw - ci;
    float h = hash(vec2(ci, 3.7));
    float bh = 0.012 + h * 0.05;
    float top = bh + step(0.8, hash(vec2(ci, 9.1))) * 0.012 * (1.0 - abs(fx - 0.5) * 2.0);
    float m = (1.0 - smoothstep(top - uPx, top + uPx, v)) * 0.9;
    float tx = abs(qw.x - (0.14 - 0.5) * uAspect);
    float tower = (1.0 - smoothstep(0.17 - uPx, 0.17 + uPx, v)) * (1.0 - smoothstep(0.007 - uPx, 0.007 + uPx, tx));
    float tr = (1.0 - smoothstep(0.0, uPx * 1.5, tx - 0.009 * (1.0 - (v - 0.17) / 0.025))) * step(0.17, v) * step(v, 0.195);
    col = mix(col, vec3(0.071, 0.051, 0.09), m);
    col = mix(col, vec3(0.059, 0.043, 0.086), max(tower, tr));
    col += vec3(1.0, 0.694, 0.361) * (1.0 - smoothstep(0.0, 0.006, length(vec2(tx, v - 0.152)))) * 0.8 * (1.0 - tr); // clock face
    if (v < bh - 0.002 && fx > 0.15 && fx < 0.85) {
      float wx = (fx - 0.15) / 0.7 * 2.0;
      float ry = v / bh * 3.0;
      vec2 wid = vec2(ci * 2.0 + floor(wx), floor(ry));
      float hw = hash(wid + 5.0);
      float lit = step(hw, uAspect < 0.7 ? 0.05 : 0.07) * step(-0.6, sin(uTime * 0.15 + hw * 40.0 * 14.0));
      if (lit > 0.0) {
        float fc = fract(wx), fr = fract(ry);
        float core = smoothstep(0.2, 0.26, fc) * smoothstep(0.8, 0.74, fc) * smoothstep(0.3, 0.36, fr) * smoothstep(0.75, 0.69, fr);
        float halo = smoothstep(0.05, 0.3, fc) * smoothstep(0.95, 0.7, fc) * smoothstep(0.1, 0.4, fr) * smoothstep(0.95, 0.65, fr);
        col += vec3(1.0, 0.694, 0.361) * (core + halo * 0.22) * m;
      }
    }
  }

  // mid cloud layer (drifts left), partly covers the town
  if (vv > 0.1 && vv < 0.24) {
    vec2 p = vec2((qw.x - F.x - uTime * -0.008 * uAspect) * 3.6, (vv - F.y) * 12.0);
    float d = fbm(p + 4.0, oct) - F.z;
    float m = smoothstep(0.1, 0.15, vv) * smoothstep(0.24, 0.2, vv);
    float edge = (1.0 - smoothstep(0.5, 0.8, d)) * (0.5 + 0.5 * smoothstep(0.1, 0.24, vv)) + F.w * 0.12;
    vec3 c = mix(vec3(0.29, 0.165, 0.29), vec3(1.0, 0.698, 0.478), edge);
    c = mix(c, vec3(1.0, 0.914, 0.812), clamp(-F.z * 2.5, 0.0, 0.6));
    col = mix(col, c, smoothstep(0.42, 0.62, d) * 0.8 * m);
  }

  // faint wisps up high
  if (uLite < 0.5 && v > 0.62 && v < 0.8) {
    vec2 p = vec2((qw.x - F.x * 0.8 - uTime * 0.003 * uAspect) * 2.2, (v - F.y * 0.8) * 7.0);
    float d = fbm(p + 9.0, 3);
    col += vec3(1.0, 0.788, 0.627) * smoothstep(0.5, 0.75, d) * 0.1 * smoothstep(0.62, 0.68, v) * smoothstep(0.8, 0.74, v);
  }

  // the seat cloud
  vec2 pc = vec2(qb.x, v - uSeat);
  if (abs(pc.x) < 0.84 * uScale && pc.y > -0.5 * uScale && pc.y < 0.2 * uScale) {
    vec4 c = seatCloud(pc, F, 1.0, 0.0);
    col = mix(col, c.rgb, c.a);
  }

  col *= 1.0 - 0.35 * pow(length((vUv - 0.5) * vec2(1.1, 1.3)), 2.2);
  col += (hash(gl_FragCoord.xy + fract(uTime)) - 0.5) / 255.0;
  gl_FragColor = vec4(col, 1.0);
}`;

// thin band across the seat line, in front of the bear: the cloud fluffs over his cut line
export const lipVertex = /* glsl */ `
uniform float uSeat;
uniform float uScale;
uniform float uSink;
varying vec2 vUv;
void main() {
  float v = mix(uSeat - 0.02, uSeat + 0.075 * uScale + max(uSink, 0.0), uv.y);
  vUv = vec2(uv.x, v);
  gl_Position = vec4(position.x, v * 2.0 - 1.0, 0.0, 1.0);
}`;

export const lipFragment = /* glsl */ `
varying vec2 vUv;
${cloudCommon}
void main() {
  vec2 qw = vec2((vUv.x - 0.5) * uAspect, vUv.y);
  vec2 pc = vec2((vUv.x - uCx) * uAspect, vUv.y - uSeat);
  vec4 F = partField(qw);
  F *= vec4(0.5 / 0.35, 0.5 / 0.35, 0.5 / 0.35, 1.0); // seatCloud applies 0.35 to the slide and holes; the lip wants 0.5
  vec4 c = seatCloud(pc, F, 1.15, 0.012);
  float top = 0.075 * uScale + max(uSink, 0.0);
  float a = c.a * smoothstep(top, top - 0.03 * uScale, pc.y) * smoothstep(-0.02, -0.005, pc.y);
  gl_FragColor = vec4(c.rgb, a);
}`;

export const figureVertex = /* glsl */ `
attribute vec4 aCol;
varying vec4 vCol;
varying vec3 vN;
varying vec3 vWorld;
void main() {
  vCol = aCol;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

// soft two-tone clay: dusky cool shadows, warm rim from the amber glow, bounce light off the cloud
export const figureFragment = /* glsl */ `
uniform float uScale;
uniform float uCut; // world y of the seat line
varying vec4 vCol;
varying vec3 vN;
varying vec3 vWorld;
void main() {
  float yy = vWorld.y - uCut;
  if (yy < -0.02) discard; // the lip hides the soft cut
  vec3 n = normalize(vN);
  vec3 v = normalize(cameraPosition - vWorld);
  vec3 L = normalize(vec3(-0.65, 0.6, 0.42));
  float t = smoothstep(0.2, 0.85, dot(n, L) * 0.5 + 0.5);
  vec3 col = mix(vCol.rgb * vec3(0.36, 0.27, 0.38), vCol.rgb * 0.97, t);
  col *= mix(0.78, 1.0, smoothstep(-0.7, 0.3, n.y)); // soft occlusion on undersides
  col += vec3(1.0, 0.62, 0.32) * pow(1.0 - max(dot(n, v), 0.0), 2.6) * 0.42;
  col += vec3(1.0, 0.55, 0.25) * max(-n.y, 0.0) * 0.2;
  col += vec3(1.0, 0.96, 0.9) * pow(max(dot(n, normalize(L + v)), 0.0), 70.0) * vCol.a * 1.1;
  float y = yy / uScale;
  col *= 1.0 - 0.3 * exp(-y * 10.0);
  col += vec3(1.0, 0.6, 0.3) * exp(-y * 60.0) * 0.4;
  gl_FragColor = vec4(col, smoothstep(-0.02, 0.08, yy));
}`;

export const fluffVertex = /* glsl */ `
attribute float aSize;
attribute vec4 aCol;
uniform float uK;
varying vec4 vC;
void main() {
  vC = aCol;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * uK / -mv.z;
}`;

export const fluffFragment = /* glsl */ `
uniform sampler2D uMap;
varying vec4 vC;
void main() { gl_FragColor = vec4(vC.rgb, texture2D(uMap, gl_PointCoord).a * vC.a); }`;
