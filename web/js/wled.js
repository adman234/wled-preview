// Ports of the WLED 0.15.5 / FastLED 3.6 primitives that the effects use.
// The effects need the same integer maths and helpers as the firmware.
// Colours are packed 0xRRGGBB numbers (W is folded into RGB when parsing).
import { PALETTES } from './palettes.js';

// ---------------------------------------------------------------- strip state
// WLED keeps a single PRNG, clock and random palette for the whole strip. Each PresetRenderer owns
// one strip object and installs it with setStrip() before it runs its segments.
export const newStrip = (seed = 1337) => ({ now: 0, bri: 255, seed: seed & 0xffff, randPal: null, newRandPal: null, lastPalChange: 0 });
let strip = newStrip();
export const setStrip = (s) => { strip = s; };
export const getStrip = () => strip;

// ---------------------------------------------------------------- FastLED PRNG
export const random16_get_seed = () => strip.seed;
export const random16_set_seed = (s) => { strip.seed = s & 0xffff; };
export function random16(lim) {
  strip.seed = (strip.seed * 2053 + 13849) & 0xffff;
  if (lim === undefined) return strip.seed;
  return Math.floor(strip.seed * (lim & 0xffff) / 65536);
}
export function random8(a, b) {
  strip.seed = (strip.seed * 2053 + 13849) & 0xffff;
  const r = ((strip.seed & 255) + (strip.seed >> 8)) & 255;
  if (a === undefined) return r;
  if (b === undefined) return (r * (a & 255)) >> 8;
  return ((a & 255) + ((r * ((b - a) & 255)) >> 8)) & 255;
}

// ---------------------------------------------------------------- lib8tion (SCALE8_FIXED)
export const scale8 = (i, s) => ((i & 255) * (1 + (s & 255))) >> 8;
export const scale8_video = (i, s) => (((i & 255) * (s & 255)) >> 8) + ((i & 255) && (s & 255) ? 1 : 0);
export const scale16 = (i, s) => Math.floor((i & 0xffff) * (1 + (s & 0xffff)) / 65536);
export const qadd8 = (a, b) => Math.min(255, (a & 255) + (b & 255));
export const qsub8 = (a, b) => Math.max(0, (a & 255) - (b & 255));
export const triwave8 = (i) => { i &= 255; if (i & 0x80) i = 255 - i; return (i << 1) & 255; };
export const ease8InOutQuad = (i) => {
  i &= 255; let j = i; if (j & 0x80) j = 255 - j;
  let jj2 = (scale8(j, j) << 1) & 255; if (i & 0x80) jj2 = 255 - jj2; return jj2;
};
export const ease16InOutQuad = (i) => {
  i &= 0xffff; let j = i; if (j & 0x8000) j = 65535 - j;
  let jj2 = (scale16(j, j) << 1) & 0xffff; if (i & 0x8000) jj2 = 65535 - jj2; return jj2;
};
export const ease8InOutCubic = (i) => {
  i &= 255; const ii = scale8(i, i), iii = scale8(ii, i);
  const r1 = 3 * ii - 2 * iii; return r1 & 0x100 ? 255 : r1 & 255;
};
export const cubicwave8 = (x) => ease8InOutCubic(triwave8(x));
export const quadwave8 = (x) => ease8InOutQuad(triwave8(x));

// ---------------------------------------------------------------- WLED wled_math.cpp
export function sin16_t(theta) {
  theta &= 0xffff; let scale = 1;
  if (theta > 0x7fff) { theta = 0xffff - theta; scale = -1; }
  const precal = theta * (0x7fff - theta);
  const res = Math.trunc(precal * (4 * 0x7fff) / (1342095361 - precal));
  return ((res << 16) >> 16) * scale;
}
export const cos16_t = (t) => sin16_t((t + 0x4000) & 0xffff);
export const sin8_t = (t) => Math.min(sin16_t((t & 255) * 257) + 0x7fff + 128, 0xffff) >> 8;
export const cos8_t = (t) => sin8_t((t + 64) & 255);
export const sin_gap = (i) => ((i & 0x100) ? 0 : sin8_t((i + 192) & 255));
export const triwave16 = (i) => { i &= 0xffff; return i < 0x8000 ? i * 2 : 0xffff - (i - 0x8000) * 2; };
// Arduino map() with C integer division
export const map = (x, a, b, c, d) => Math.trunc(((x - a) * (d - c)) / (b - a)) + c;

// beat functions use strip.now (WLED overrides FastLED's millis source)
export const beat88 = (bpm88, tb = 0) => (Math.imul(Math.imul((strip.now - tb) >>> 0, bpm88 & 0xffff), 280) >>> 16) & 0xffff;
export const beat16 = (bpm, tb = 0) => { bpm &= 0xffff; if (bpm < 256) bpm <<= 8; return beat88(bpm, tb); };
export const beat8 = (bpm, tb = 0) => beat16(bpm, tb) >> 8;
export function beatsin88_t(bpm, lo = 0, hi = 65535, tb = 0, ph = 0) {
  const bs = (sin16_t((beat88(bpm, tb) + ph) & 0xffff) + 32768) & 0xffff;
  return (lo + scale16(bs, (hi - lo) & 0xffff)) & 0xffff;
}
export function beatsin16_t(bpm, lo = 0, hi = 65535, tb = 0, ph = 0) {
  const bs = (sin16_t((beat16(bpm, tb) + ph) & 0xffff) + 32768) & 0xffff;
  return (lo + scale16(bs, (hi - lo) & 0xffff)) & 0xffff;
}
export function beatsin8_t(bpm, lo = 0, hi = 255, tb = 0, ph = 0) {
  const bs = sin8_t((beat8(bpm, tb) + ph) & 255);
  return ((lo & 255) + scale8(bs, (hi - lo) & 255)) & 255;
}

// ---------------------------------------------------------------- FastLED noise (NOISE_FIXED)
const PERM = [151,160,137,91,90,15,131,13,201,95,96,53,194,233,7,225,140,36,103,30,69,142,8,99,37,240,21,10,23,190,6,148,247,120,234,75,0,26,197,62,94,252,219,203,117,35,11,32,57,177,33,88,237,149,56,87,174,20,125,136,171,168,68,175,74,165,71,134,139,48,27,166,77,146,158,231,83,111,229,122,60,211,133,230,220,105,92,41,55,46,245,40,244,102,143,54,65,25,63,161,1,216,80,73,209,76,132,187,208,89,18,169,200,196,135,130,116,188,159,86,164,100,109,198,173,186,3,64,52,217,226,250,124,123,5,202,38,147,118,126,255,82,85,212,207,206,59,227,47,16,58,17,182,189,28,42,223,183,170,213,119,248,152,2,44,154,163,70,221,153,101,155,167,43,172,9,129,22,39,253,19,98,108,110,79,113,224,232,178,185,112,104,218,246,97,228,251,34,242,193,238,210,144,12,191,179,162,241,81,51,145,235,249,14,239,107,49,192,214,31,181,199,106,157,184,84,204,176,115,121,50,45,127,4,150,254,138,236,205,93,222,114,67,29,24,72,243,141,128,195,78,66,215,61,156,180,151];
const P = (i) => PERM[i];
const i16 = (v) => (v << 16) >> 16;
const i8 = (v) => (v << 24) >> 24;
const avg15 = (a, b) => i16((a >> 1) + (b >> 1) + (a & 1));
const avg7 = (a, b) => i8((a >> 1) + (b >> 1) + (a & 1));
function grad16_3(hash, x, y, z) {
  hash &= 15;
  let u = hash < 8 ? x : y;
  let v = hash < 4 ? y : (hash === 12 || hash === 14 ? x : z);
  if (hash & 1) u = i16(-u);
  if (hash & 2) v = i16(-v);
  return avg15(u, v);
}
function grad16_2(hash, x, y) {
  hash &= 7;
  let u, v;
  if (hash < 4) { u = x; v = y; } else { u = y; v = x; }
  if (hash & 1) u = i16(-u);
  if (hash & 2) v = i16(-v);
  return avg15(u, v);
}
function grad8_2(hash, x, y) {
  let u, v;
  if (hash & 4) { u = y; v = x; } else { u = x; v = y; }
  if (hash & 1) u = i8(-u);
  if (hash & 2) v = i8(-v);
  return avg7(u, v);
}
const lerp15by16 = (a, b, f) => (b > a ? i16(a + scale16((b - a) & 0xffff, f)) : i16(a - scale16((a - b) & 0xffff, f)));
const lerp7by8 = (a, b, f) => (b > a ? i8(a + scale8((b - a) & 255, f)) : i8(a - scale8((a - b) & 255, f)));

function inoise16_raw3(x, y, z) {
  const X = (x >>> 16) & 255, Y = (y >>> 16) & 255, Z = (z >>> 16) & 255;
  const A = (P(X) + Y) & 255, AA = (P(A) + Z) & 255, AB = (P(A + 1) + Z) & 255;
  const B = (P(X + 1) + Y) & 255, BA = (P(B) + Z) & 255, BB = (P(B + 1) + Z) & 255;
  let u = x & 0xffff, v = y & 0xffff, w = z & 0xffff;
  const xx = (u >> 1) & 0x7fff, yy = (v >> 1) & 0x7fff, zz = (w >> 1) & 0x7fff, N = 0x8000;
  u = ease16InOutQuad(u); v = ease16InOutQuad(v); w = ease16InOutQuad(w);
  const X1 = lerp15by16(grad16_3(P(AA), xx, yy, zz), grad16_3(P(BA), i16(xx - N), yy, zz), u);
  const X2 = lerp15by16(grad16_3(P(AB), xx, i16(yy - N), zz), grad16_3(P(BB), i16(xx - N), i16(yy - N), zz), u);
  const X3 = lerp15by16(grad16_3(P(AA + 1), xx, yy, i16(zz - N)), grad16_3(P(BA + 1), i16(xx - N), yy, i16(zz - N)), u);
  const X4 = lerp15by16(grad16_3(P(AB + 1), xx, i16(yy - N), i16(zz - N)), grad16_3(P(BB + 1), i16(xx - N), i16(yy - N), i16(zz - N)), u);
  return lerp15by16(lerp15by16(X1, X2, v), lerp15by16(X3, X4, v), w);
}
function inoise16_raw2(x, y) {
  const X = (x >>> 16) & 255, Y = (y >>> 16) & 255;
  const A = (P(X) + Y) & 255, AA = P(A), AB = P(A + 1);
  const B = (P(X + 1) + Y) & 255, BA = P(B), BB = P(B + 1);
  let u = x & 0xffff, v = y & 0xffff;
  const xx = (u >> 1) & 0x7fff, yy = (v >> 1) & 0x7fff, N = 0x8000;
  u = ease16InOutQuad(u); v = ease16InOutQuad(v);
  const X1 = lerp15by16(grad16_2(P(AA), xx, yy), grad16_2(P(BA), i16(xx - N), yy), u);
  const X2 = lerp15by16(grad16_2(P(AB), xx, i16(yy - N)), grad16_2(P(BB), i16(xx - N), i16(yy - N)), u);
  return lerp15by16(X1, X2, v);
}
export function inoise16(x, y, z) {
  if (z === undefined) return Math.floor((((inoise16_raw2(x >>> 0, y >>> 0) + 17308) >>> 0) * 484) / 256) & 0xffff;
  return Math.floor((((inoise16_raw3(x >>> 0, y >>> 0, z >>> 0) + 19052) >>> 0) * 440) / 256) & 0xffff;
}
export function inoise8(x, y) {
  x &= 0xffff; y &= 0xffff;
  const X = x >> 8, Y = y >> 8;
  const A = (P(X) + Y) & 255, AA = P(A), AB = P(A + 1);
  const B = (P(X + 1) + Y) & 255, BA = P(B), BB = P(B + 1);
  let u = x & 255, v = y & 255;
  const xx = (u >> 1) & 0x7f, yy = (v >> 1) & 0x7f, N = 0x80;
  u = ease8InOutQuad(u); v = ease8InOutQuad(v);
  const X1 = lerp7by8(grad8_2(P(AA), xx, yy), grad8_2(P(BA), i8(xx - N), yy), u);
  const X2 = lerp7by8(grad8_2(P(AB), xx, i8(yy - N)), grad8_2(P(BB), i8(xx - N), i8(yy - N)), u);
  const n = i8(lerp7by8(X1, X2, v) + 64) & 255;
  return qadd8(n, n);
}

// ---------------------------------------------------------------- colour helpers
export const RGB = (r, g, b) => ((r & 255) << 16) | ((g & 255) << 8) | (b & 255);
export const R = (c) => (c >> 16) & 255;
export const G = (c) => (c >> 8) & 255;
export const B = (c) => c & 255;
export const BLACK = 0, WHITE = 0xffffff;

const GAMMA = Array.from({ length: 256 }, (_, i) => Math.trunc(Math.pow(i / 255, 2.8) * 255 + 0.5));
export const gamma8 = (v) => GAMMA[v & 255];
export const gamma32 = (c) => RGB(GAMMA[R(c)], GAMMA[G(c)], GAMMA[B(c)]);

export function color_blend(c1, c2, blend) {
  blend &= 0xffff;
  if (blend === 0) return c1;
  if (blend === 255) return c2;
  const ch = (a, b) => ((((b * blend) + (a * (255 - blend))) >>> 0) >>> 8) & 255;
  return RGB(ch(R(c1), R(c2)), ch(G(c1), G(c2)), ch(B(c1), B(c2)));
}
export function color_add(c1, c2, fast = false) {
  if (c1 === 0) return c2;
  if (c2 === 0) return c1;
  if (fast) return RGB(qadd8(R(c1), R(c2)), qadd8(G(c1), G(c2)), qadd8(B(c1), B(c2)));
  const r = R(c1) + R(c2), g = G(c1) + G(c2), b = B(c1) + B(c2);
  const m = Math.max(r, g, b);
  if (m < 256) return RGB(r, g, b);
  return RGB(Math.trunc(r * 255 / m), Math.trunc(g * 255 / m), Math.trunc(b * 255 / m));
}
export function color_fade(c, amt, video = false) {
  amt &= 255;
  if (c === 0 || amt + (video ? 1 : 0) === 0) return 0;
  const f = video ? (v) => ((v * amt) >> 8) + (v && amt ? 1 : 0) : (v) => (v * amt) >> 8;
  return RGB(f(R(c)), f(G(c)), f(B(c)));
}
// FastLED hsv2rgb_rainbow (CHSV -> CRGB conversion used by CRGB(CHSV))
export function hsv2rgb_rainbow(hue, sat, val) {
  hue &= 255; sat &= 255; val &= 255;
  const offset8 = (hue & 0x1f) << 3;
  const third = scale8(offset8, 85), twothirds = scale8(offset8, 170);
  let r, g, b;
  if (!(hue & 0x80)) {
    if (!(hue & 0x40)) {
      if (!(hue & 0x20)) { r = 255 - third; g = third; b = 0; } else { r = 171; g = 85 + third; b = 0; }
    } else if (!(hue & 0x20)) { r = 171 - twothirds; g = 170 + third; b = 0; } else { r = 0; g = 255 - third; b = third; }
  } else if (!(hue & 0x40)) {
    if (!(hue & 0x20)) { r = 0; g = 171 - twothirds; b = 85 + twothirds; } else { r = third; g = 0; b = 255 - third; }
  } else if (!(hue & 0x20)) { r = 85 + third; g = 0; b = 171 - third; } else { r = 170 + third; g = 0; b = 85 - third; }
  if (sat !== 255) {
    if (sat === 0) { r = g = b = 255; } else {
      const desat = scale8_video(255 - sat, 255 - sat), satscale = 255 - desat;
      r = scale8(r, satscale) + desat; g = scale8(g, satscale) + desat; b = scale8(b, satscale) + desat;
    }
  }
  if (val !== 255) {
    val = scale8_video(val, val);
    if (val === 0) return 0;
    r = scale8(r, val); g = scale8(g, val); b = scale8(b, val);
  }
  return RGB(r, g, b);
}
export const getAverageLight = (c) => scale8(R(c), 85) + scale8(G(c), 85) + scale8(B(c), 85);
export const nscale8_video = (c, s) => RGB(scale8_video(R(c), s), scale8_video(G(c), s), scale8_video(B(c), s));
export const nscale8 = (c, s) => RGB(scale8(R(c), s), scale8(G(c), s), scale8(B(c), s));

// FastLED ColorFromPalette for CRGBPalette16 (pal = 16 packed colours)
export function ColorFromPalette(pal, index, bri = 255, blend = true) {
  index &= 255; bri &= 255;
  const hi4 = index >> 4, lo4 = index & 15;
  const e = pal[hi4];
  let r = R(e), g = G(e), b = B(e);
  if (lo4 && blend) {
    const n = pal[hi4 === 15 ? 0 : hi4 + 1];
    const f2 = lo4 << 4, f1 = 255 - f2;
    r = scale8(r, f1) + scale8(R(n), f2);
    g = scale8(g, f1) + scale8(G(n), f2);
    b = scale8(b, f1) + scale8(B(n), f2);
  }
  if (bri !== 255) {
    if (!bri) return 0;
    bri++;
    if (r) r = scale8(r, bri);
    if (g) g = scale8(g, bri);
    if (b) b = scale8(b, bri);
  }
  return RGB(r, g, b);
}

// ---------------------------------------------------------------- palettes
// FastLED fill_gradient_RGB on a 16-entry palette (integer maths, as in colorutils.cpp)
function fillGrad(e, s, c1, t, c2) {
  if (t < s) { [s, t] = [t, s]; [c1, c2] = [c2, c1]; }
  const div = t - s || 1;
  const cs = [R(c1), G(c1), B(c1)], ce = [R(c2), G(c2), B(c2)];
  const d = [0, 1, 2].map((k) => Math.trunc(((ce[k] - cs[k]) << 7) / div) * 2);
  const a = cs.map((v) => v << 8);
  for (let i = s; i <= t; i++) {
    e[i] = RGB(a[0] >> 8, a[1] >> 8, a[2] >> 8);
    for (let k = 0; k < 3; k++) a[k] = (a[k] + d[k]) & 0xffff;
  }
}
export function palGradient(...c) {
  const e = new Array(16).fill(0);
  if (c.length === 1) e.fill(c[0]);
  else if (c.length === 2) fillGrad(e, 0, c[0], 15, c[1]);
  else if (c.length === 3) { fillGrad(e, 0, c[0], 8, c[1]); fillGrad(e, 8, c[1], 15, c[2]); }
  else { fillGrad(e, 0, c[0], 5, c[1]); fillGrad(e, 5, c[1], 10, c[2]); fillGrad(e, 10, c[2], 15, c[3]); }
  return e;
}
// WLED generateRandomPalette (the harmonic variant WLED uses by default is approximated by this one)
const generateRandomPalette = () => palGradient(
  hsv2rgb_rainbow(random8(), random8(160, 255), random8(128, 255)), hsv2rgb_rainbow(random8(), random8(160, 255), random8(128, 255)),
  hsv2rgb_rainbow(random8(), random8(160, 255), random8(128, 255)), hsv2rgb_rainbow(random8(), random8(160, 255), random8(128, 255)));
// Called once per strip tick: new random palette every 5 s, blended in with nblendPaletteTowardPalette(…, 48).
export function handleRandomPalette() {
  const s = strip;
  if (!s.randPal) { s.randPal = generateRandomPalette(); s.newRandPal = s.randPal.slice(); s.lastPalChange = 0; }
  if (s.now - s.lastPalChange > 5000) { s.newRandPal = generateRandomPalette(); s.lastPalChange = s.now; }
  let changes = 0;
  outer: for (let i = 0; i < 16; i++) {
    const cur = [R(s.randPal[i]), G(s.randPal[i]), B(s.randPal[i])], tgt = [R(s.newRandPal[i]), G(s.newRandPal[i]), B(s.newRandPal[i])];
    for (let k = 0; k < 3; k++) {
      if (cur[k] === tgt[k]) continue;
      if (cur[k] < tgt[k]) { cur[k]++; changes++; }
      if (cur[k] > tgt[k]) { cur[k]--; changes++; if (cur[k] > tgt[k]) cur[k]--; }
      s.randPal[i] = RGB(cur[0], cur[1], cur[2]);
      if (changes >= 48) break outer;
    }
  }
}

// Palette WLED loads when the segment palette is 0 ("Default") for these effects
const FX_DEFAULT_PAL = { 66: 35, 67: 26, 69: 9, 70: 20, 71: 43, 72: 35, 73: 26, 78: 3, 87: 11, 104: 35 };

// ---------------------------------------------------------------- Segment
// Mirrors WLED's Segment: a virtual pixel buffer of SEGLEN entries plus the effect state.
export class Segment {
  constructor(seg) {
    this.seg = seg;
    this.mode = seg.fx;
    this.start = seg.start; this.stop = seg.stop; this.plen = seg.len;
    this.grp = seg.grp; this.spc = seg.spc; this.offset = seg.of;
    this.reverse = seg.rev; this.mirror = seg.mi;
    let vlen = Math.ceil(this.plen / (this.grp + this.spc));
    if (this.mirror) vlen = (vlen + 1) >> 1;
    this.len = Math.max(1, vlen);
    this.speed = seg.sx & 255; this.intensity = seg.ix & 255;
    this.custom1 = seg.c1 ?? 128; this.custom2 = seg.c2 ?? 128; this.custom3 = seg.c3 ?? 16;
    this.check1 = !!seg.o1; this.check2 = !!seg.o2; this.check3 = !!seg.o3;
    this.palette = seg.pal > 70 && seg.pal < 245 ? 0 : seg.pal;
    this.colors = seg.col.map((c) => RGB(c[0], c[1], c[2]));
    this.step = 0; this.call = 0; this.aux0 = 0; this.aux1 = 0; this.data = null; this.state = null;
    this.next_time = 0;
    this.px = new Array(this.len).fill(0);
    this.curPal = null;
    this.now = 0;
  }

  allocateData(n) { if (!this.data || this.data.length !== n) this.data = new Uint8Array(n); return true; }

  loadPalette() {
    let p = this.palette;
    if (p === 0 && FX_DEFAULT_PAL[this.mode] !== undefined) p = FX_DEFAULT_PAL[this.mode];
    const prim = gamma32(this.colors[0]), sec = gamma32(this.colors[1]), ter = gamma32(this.colors[2]);
    switch (p) {
      case 0: this.curPal = PALETTES[6][1]; break;
      case 1: this.curPal = strip.randPal || PALETTES[6][1]; break;
      case 2: this.curPal = palGradient(prim); break;
      case 3: this.curPal = palGradient(prim, prim, sec, sec); break;
      case 4: this.curPal = palGradient(ter, sec, prim); break;
      case 5:
        this.curPal = this.colors[2]
          ? [prim, prim, prim, prim, prim, sec, sec, sec, sec, sec, ter, ter, ter, ter, ter, prim]
          : [prim, prim, prim, prim, prim, prim, prim, prim, sec, sec, sec, sec, sec, sec, sec, sec];
        break;
      default: this.curPal = (PALETTES[p] || PALETTES[6])[1];
    }
  }

  SEGCOLOR(x) { return gamma32(this.colors[x]); }
  setPixelColor(i, c) { i = Math.trunc(i); if (i >= 0 && i < this.len) this.px[i] = c & 0xffffff; }
  getPixelColor(i) { i = Math.trunc(i); return i >= 0 && i < this.len ? this.px[i] : 0; }
  fill(c) { this.px.fill(c & 0xffffff); }
  blendPixelColor(n, c, b) { this.setPixelColor(n, color_blend(this.getPixelColor(n), c, b)); }
  addPixelColor(n, c, fast = false) { this.setPixelColor(n, color_add(this.getPixelColor(n), c, fast)); }
  fadeToBlackBy(f) {
    f &= 255; if (!f) return;
    for (let i = 0; i < this.len; i++) this.px[i] = color_fade(this.px[i], 255 - f);
  }
  fade_out(rate) {
    rate = ((256 - (rate & 255)) >> 1) & 255;
    const mapped = Math.trunc(256 / (rate + 1));
    const bg = this.colors[1];
    for (let x = 0; x < this.len; x++) {
      let color = this.px[x];
      if (color === bg) continue;
      let out = 0;
      for (let s = 0; s < 24; s += 8) {
        const c2 = (bg >> s) & 255, c1 = (color >> s) & 255;
        let delta = Math.trunc((c2 - c1) * mapped / 256);
        if (delta === 0) delta += c2 === c1 ? 0 : c2 > c1 ? 1 : -1;
        out |= ((c1 + delta) & 255) << s;
      }
      this.px[x] = out;
    }
  }
  blur(amt) {
    amt &= 255; if (!amt) return;
    const keep = 255 - amt, seep = amt >> 1;
    let carry = 0, lastnew = 0, last = 0, curnew = 0;
    for (let i = 0; i < this.len; i++) {
      const cur = this.getPixelColor(i);
      const part = color_fade(cur, seep);
      curnew = color_fade(cur, keep);
      if (i > 0) {
        if (carry) curnew = color_add(curnew, carry, true);
        const prev = color_add(lastnew, part, true);
        if (last !== prev) this.setPixelColor(i - 1, prev);
      } else this.setPixelColor(i, curnew);
      lastnew = curnew; last = cur; carry = part;
    }
    this.setPixelColor(this.len - 1, curnew);
  }
  color_wheel(pos) {
    if (this.palette) return this.color_from_palette(pos, false, true, 0);
    pos = 255 - (pos & 255);
    if (pos < 85) return RGB(255 - pos * 3, 0, pos * 3);
    if (pos < 170) { pos -= 85; return RGB(0, pos * 3, 255 - pos * 3); }
    pos -= 170; return RGB(pos * 3, 255 - pos * 3, 0);
  }
  color_from_palette(i, mapping, wrap, mcol, pbri = 255) {
    pbri &= 255;
    const color = gamma32(this.colors[mcol < 3 ? mcol : 0]);
    if (this.palette === 0 && mcol < 3) return pbri === 255 ? color : color_fade(color, pbri, true);
    let idx = i & 0xffff;
    if (mapping && this.len > 1) idx = Math.trunc((idx * 255) / (this.len - 1));
    if (!wrap) idx = scale8(idx, 240);
    return ColorFromPalette(this.curPal, idx & 255, pbri, true);
  }
}

// WLED get_random_wheel_index
export function get_random_wheel_index(pos) {
  let r = 0, d = 0;
  while (d < 42) {
    r = random8();
    const x = Math.abs((pos & 255) - r);
    d = Math.min(x, 255 - x);
  }
  return r;
}
