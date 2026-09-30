// Renders a preset (list of segments) into an RGB frame for a given time.
import { EFFECTS } from './effects.js';
import { PALETTES, sampleStops, isKnownPalette } from './palettes.js';
import { wheel, mulberry32 } from './color.js';

// Names for effects we don't implement (shown in the UI; preview uses a fallback).
export const EXTRA_NAMES = {
  31: 'Chase Flash', 32: 'Chase Flash Rnd', 35: 'Traffic Light', 37: 'Chase 2', 38: 'Aurora', 39: 'Stream', 41: 'Lighthouse',
  44: 'Tetrix', 48: 'Police', 49: 'Fairy', 51: 'Fairytwinkle', 53: 'Chase 3', 54: 'Chase 3', 59: 'Multi Comet', 61: 'Stream 2', 62: 'Oscillate',
  68: 'Bpm', 69: 'Fill Noise', 70: 'Noise 1', 71: 'Noise 2', 72: 'Noise 3', 73: 'Noise 4', 75: 'Lake', 78: 'Railway', 79: 'Ripple',
  80: 'Twinklefox', 81: 'Twinklecat', 82: 'Halloween Eyes', 83: 'Solid Pattern', 84: 'Solid Pattern Tri', 85: 'Spots', 86: 'Spots Fade',
  89: 'Starburst', 90: 'Exploding Fireworks', 93: 'Sinelon Dual', 94: 'Sinelon Rainbow', 96: 'Drip', 98: 'Percent', 99: 'Ripple Rainbow', 100: 'Heartbeat',
};

export const effectName = (id) => (EFFECTS[id] ? EFFECTS[id].name : EXTRA_NAMES[id] || `Effect #${id}`);
export const isApproximated = (seg) => !EFFECTS[seg.fx] || !isKnownPalette(seg.pal);

// Fallback for effects we haven't implemented: scroll the segment's palette.
const FALLBACK = { name: 'Fallback', pal0: 'rainbow', run: (p) => { for (let i = 0; i < p.len; i++) p.set(i, p.pal(i * 255 / p.len + p.t / (30 - p.sx / 10))); } };

function buildPalette(seg, pal0, rand, t) {
  const c = seg.col;
  const id = seg.pal;
  let stops;
  switch (id) {
    case 0:
      if (pal0 === 'rainbow') stops = PALETTES[11][1];
      else if (pal0 === 'fire') stops = PALETTES[35][1];
      else return () => c[0];
      break;
    case 1: { const off = t / 40; return (i) => wheel(i + off); }
    case 2: return () => c[0];
    case 3: stops = [[0, ...c[0]], [127, ...c[0]], [128, ...c[1]], [255, ...c[1]]]; break;
    case 4: stops = [[0, ...c[0]], [128, ...c[1]], [255, ...c[2]]]; break;
    case 5: stops = [[0, ...c[0]], [85, ...c[0]], [86, ...c[1]], [170, ...c[1]], [171, ...c[2]], [255, ...c[2]]]; break;
    default: stops = PALETTES[id] ? PALETTES[id][1] : PALETTES[11][1];
  }
  return (i) => sampleStops(stops, i);
}

export class SegmentRunner {
  constructor(seg, seed = 1) {
    this.seg = seg;
    this.state = {};
    this.rand = mulberry32(seed + (seg.start | 0) * 7919);
    this.last = null;
    const grpLen = seg.grp + seg.spc;
    this.vlen = Math.max(1, Math.ceil(seg.len / grpLen));
    this.elen = seg.mi ? Math.ceil(this.vlen / 2) : this.vlen;
    this.buf = new Float32Array(this.elen * 3);
  }

  render(t) {
    const seg = this.seg;
    const fx = EFFECTS[seg.fx] || FALLBACK;
    const dt = this.last === null ? 16 : t - this.last;
    this.last = t;
    const len = this.elen, buf = this.buf, rand = this.rand;
    const palFn = buildPalette(seg, fx.pal0, rand, t);
    const p = {
      len, t, dt, sx: seg.sx, ix: seg.ix, col: seg.col, state: this.state, rand,
      buf,
      set(i, c) { i = Math.floor(i); if (i >= 0 && i < len) { buf[i * 3] = c[0]; buf[i * 3 + 1] = c[1]; buf[i * 3 + 2] = c[2]; } },
      get(i) { return i >= 0 && i < len ? [buf[i * 3], buf[i * 3 + 1], buf[i * 3 + 2]] : [0, 0, 0]; },
      fill(c) { for (let i = 0; i < len; i++) { buf[i * 3] = c[0]; buf[i * 3 + 1] = c[1]; buf[i * 3 + 2] = c[2]; } },
      fadeBy(f) { for (let i = 0; i < buf.length; i++) buf[i] *= f; },
      pal: palFn,
      palRand: () => palFn(rand() * 255),
    };
    fx.run(p);
    return buf;
  }

  // Write this segment's current frame into out (Float32Array total*3) using grouping/mirror/reverse/offset.
  paint(out, total, t, masterBri) {
    const seg = this.seg;
    if (!seg.on) return;
    const buf = this.render(t);
    const grpLen = seg.grp + seg.spc;
    const k = (masterBri / 255) * (seg.bri / 255);
    for (let v = 0; v < this.vlen; v++) {
      let src = seg.rev ? this.vlen - 1 - v : v;
      if (seg.mi && src >= this.elen) src = this.vlen - 1 - src;
      const r = buf[src * 3] * k, g = buf[src * 3 + 1] * k, b = buf[src * 3 + 2] * k;
      for (let j = 0; j < seg.grp; j++) {
        let phys = v * grpLen + j;
        if (phys >= seg.len) break;
        phys = (phys + seg.of) % seg.len;
        const idx = seg.start + phys;
        if (idx >= 0 && idx < total) { out[idx * 3] = r; out[idx * 3 + 1] = g; out[idx * 3 + 2] = b; }
      }
    }
  }
}

export class PresetRenderer {
  constructor(preset, total, seed = 1) {
    this.preset = preset;
    this.total = total;
    this.runners = preset.segs.map((s) => new SegmentRunner(s, seed));
    this.out = new Float32Array(total * 3);
    this.t0 = null;
  }

  frame(now) {
    if (this.t0 === null) this.t0 = now;
    const t = now - this.t0;
    this.out.fill(0);
    const bri = this.preset.on ? this.preset.bri : 0;
    for (const r of this.runners) r.paint(this.out, this.total, t, bri);
    return this.out;
  }
}
