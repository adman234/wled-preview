// Runs presets the way WLED 0.15's WS2812FX::service() does: a fixed frame clock, each segment
// re-run when its next_time comes up, effects drawing into a virtual buffer that is then mapped
// onto the physical strip (grouping, spacing, reverse, mirror, offset).
import { EFFECTS } from './effects.js';
import { FX_NAMES } from './fxnames.js';
import { isKnownPalette } from './palettes.js';
import { Segment, newStrip, setStrip, getStrip, handleRandomPalette, color_fade, R, G, B } from './wled.js';

const TICK = 23; // WLED's default 42 fps target
const MAX_CATCHUP = 100; // ticks run per frame at most, e.g. after the tab was hidden

export const effectName = (id) => FX_NAMES[id] ?? `Effect #${id}`;
export const isApproximated = (seg) => !EFFECTS[seg.fx] || !isKnownPalette(seg.pal);

// Stand-in for effects that are not ported yet: the segment palette scrolling along the strip.
function fallback(S) {
  const shift = getStrip().now >>> 4;
  for (let i = 0; i < S.len; i++) S.setPixelColor(i, S.color_from_palette((Math.trunc(i * 255 / S.len) + shift) & 255, false, true, 0));
  return TICK;
}

// sRGB encode: WLED's colours are gamma-corrected for LEDs (linear light); the screen expects sRGB.
const encode = (v) => 255 * Math.pow(v / 255, 1 / 2.2);

export class SegmentRunner {
  constructor(seg) {
    this.seg = seg;
    this.S = new Segment(seg);
    this.run = EFFECTS[seg.fx]?.run ?? fallback;
  }

  // One strip tick at time `now`. Runs the effect if this segment's frame is due.
  tick(now) {
    const S = this.S;
    if (now < S.next_time) return;
    S.now = now;
    S.loadPalette();
    const delay = this.run(S);
    S.call++;
    S.next_time = now + (Number.isFinite(delay) ? delay : TICK);
  }

  // Map the virtual buffer onto the physical pixels, as Segment::setPixelColor() does in 1D.
  paint(out, total, masterBri) {
    const seg = this.seg, S = this.S;
    if (seg.on === false || seg.len <= 0) return;
    const { start, stop } = seg, plen = stop - start, grp = Math.max(1, seg.grp), grpLen = grp + seg.spc;
    const of = ((seg.of % plen) + plen) % plen;
    const k = masterBri / 255;
    const put = (idx, r, g, b) => {
      if (idx < 0 || idx >= total) return;
      out[idx * 3] = r; out[idx * 3 + 1] = g; out[idx * 3 + 2] = b;
    };
    for (let i = 0; i < S.len; i++) {
      let c = S.px[i];
      if (seg.bri < 255) c = color_fade(c, seg.bri);
      const r = encode(R(c) * k), g = encode(G(c) * k), b = encode(B(c) * k);
      const v = seg.rev ? S.len - i - 1 : i;
      const base = start + v * grpLen;
      for (let j = 0; j < grp; j++) {
        let set = base + (seg.rev ? -j : j);
        if (set < start || set >= stop) continue;
        if (seg.mi) {
          let mir = stop - set + start - 1 + of;
          if (mir >= stop) mir -= plen;
          put(mir, r, g, b);
        }
        set += of;
        if (set >= stop) set -= plen;
        put(set, r, g, b);
      }
    }
  }
}

export class PresetRenderer {
  constructor(preset, total, seed = 1) {
    this.preset = preset;
    this.total = total;
    this.strip = newStrip(seed);
    this.runners = preset.segs.map((s) => new SegmentRunner(s));
    this.out = new Float32Array(total * 3);
    this.t0 = null;
    this.last = -TICK;
  }

  tick(t) {
    const strip = this.strip;
    strip.now = t;
    strip.bri = this.preset.on ? this.preset.bri : 0;
    strip.segCount = this.runners.filter((r) => r.seg.len > 0).length;
    handleRandomPalette();
    this.runners.forEach((r, i) => { r.S.segIdx = i; r.tick(t); });
  }

  frame(now) {
    if (this.t0 === null) this.t0 = now;
    const t = Math.max(0, now - this.t0);
    setStrip(this.strip);
    if (t - this.last > TICK * MAX_CATCHUP) this.last = t - TICK * MAX_CATCHUP;
    while (this.last + TICK <= t) { this.last += TICK; this.tick(this.last); }
    this.out.fill(0);
    const bri = this.preset.on ? this.preset.bri : 0;
    for (const r of this.runners) r.paint(this.out, this.total, bri);
    return this.out;
  }
}
