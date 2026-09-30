import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parsePresets } from '../web/js/parse.js';
import { PresetRenderer, effectName, isApproximated } from '../web/js/engine.js';
import { EFFECTS } from '../web/js/effects.js';

const presets = parsePresets(JSON.parse(readFileSync(new URL('../web/samples/presets.json', import.meta.url))), 150);

function seg(over) {
  return { start: 0, stop: 30, len: 30, grp: 1, spc: 0, of: 0, on: true, bri: 255, col: [[255, 0, 0], [0, 0, 255], [0, 255, 0]], fx: 0, sx: 128, ix: 128, pal: 0, rev: false, mi: false, ...over };
}
const render = (s, t = 1000, bri = 255) => {
  const r = new PresetRenderer({ segs: [s], bri, on: true }, 30);
  r.frame(0);
  return r.frame(t);
};

test('solid fills with colour 1 scaled by brightness', () => {
  const out = render(seg({}), 0, 128);
  assert.ok(Math.abs(out[0] - 128 * 255 / 255) < 1);
  assert.equal(out[1], 0);
});

test('every implemented effect renders finite values over time for several configs', () => {
  for (const id of Object.keys(EFFECTS)) {
    for (const pal of [0, 2, 4, 11, 35]) {
      const r = new PresetRenderer({ segs: [seg({ fx: Number(id), pal, grp: 2, spc: 1, mi: true })], bri: 200, on: true }, 30);
      for (let t = 0; t < 4000; t += 50) {
        const out = r.frame(t);
        for (const v of out) assert.ok(Number.isFinite(v) && v >= -0.001 && v <= 255.001, `fx ${id} (${EFFECTS[id].name}) pal ${pal} t ${t} -> ${v}`);
      }
    }
  }
});

test('segment bounds: pixels outside the segment stay black', () => {
  const out = render(seg({ start: 10, stop: 20, len: 10 }), 0);
  assert.equal(out[9 * 3], 0);
  assert.ok(out[10 * 3] > 0);
  assert.equal(out[20 * 3], 0);
});

test('reverse flips a gradient', () => {
  const a = render(seg({ fx: 46 }), 0), b = render(seg({ fx: 46, rev: true }), 0);
  assert.ok(Math.abs(a[0] - b[29 * 3]) < 1e-6);
});

test('mirror makes the strip symmetric', () => {
  const out = render(seg({ fx: 46, mi: true }), 0);
  assert.ok(Math.abs(out[0] - out[29 * 3]) < 1e-6);
});

test('off segments and off presets render black', () => {
  assert.ok(render(seg({ on: false }), 0).every((v) => v === 0));
  const r = new PresetRenderer({ segs: [seg({})], bri: 255, on: false }, 30);
  assert.ok(r.frame(0).every((v) => v === 0));
});

test('effects animate over time', () => {
  const r = new PresetRenderer({ segs: [seg({ fx: 9 })], bri: 255, on: true }, 30);
  const a = Array.from(r.frame(0)), b = Array.from(r.frame(1500));
  assert.notDeepEqual(a, b);
});

test('unknown effects fall back and are flagged approximated', () => {
  const s = seg({ fx: 79 });
  assert.ok(isApproximated(s));
  assert.equal(effectName(79), 'Ripple');
  const out = render(s, 500);
  assert.ok(out.some((v) => v > 0));
});

test('sample presets all render without throwing', () => {
  for (const p of presets.filter((x) => x.segs.length)) {
    const r = new PresetRenderer(p, 150);
    for (let t = 0; t < 2000; t += 100) r.frame(t);
  }
});

test('Chase 3 shows the three segment colours in bands', () => {
  const out = render(seg({ fx: 54, ix: 0, col: [[255, 0, 0], [0, 255, 0], [0, 0, 255]] }), 0);
  const seen = new Set();
  for (let i = 0; i < 30; i++) seen.add([out[i * 3], out[i * 3 + 1], out[i * 3 + 2]].map(Math.round).join());
  assert.equal(seen.size, 3);
});

test('Spots Fade pulses over time and Spots does not', () => {
  const a = Array.from(render(seg({ fx: 86, sx: 200, ix: 200 }), 0)), b = Array.from(render(seg({ fx: 86, sx: 200, ix: 200 }), 1500));
  assert.notDeepEqual(a, b);
  const c = Array.from(render(seg({ fx: 85, sx: 200, ix: 200 }), 0)), d = Array.from(render(seg({ fx: 85, sx: 200, ix: 200 }), 1500));
  assert.deepEqual(c, d);
});

test('Twinklefox/Twinklecat twinkle over a background', () => {
  for (const fx of [80, 81]) {
    const r = new PresetRenderer({ segs: [seg({ fx, pal: 11, col: [[255, 255, 255], [0, 0, 0], [0, 0, 0]] })], bri: 255, on: true }, 30);
    let lit = 0, dark = 0;
    for (let t = 0; t < 6000; t += 100) for (let i = 0; i < 30; i++) { const v = r.frame(t)[i * 3]; v > 100 ? lit++ : v < 10 && dark++; }
    assert.ok(lit > 0 && dark > 0, `fx ${fx}`);
  }
});

test('Noisefire is red/orange and Fill Noise varies with a palette', () => {
  const out = render(seg({ fx: 143 }), 2000);
  for (let i = 0; i < 30; i++) assert.ok(out[i * 3] >= out[i * 3 + 1] && out[i * 3 + 1] >= out[i * 3 + 2]);
  const fn = render(seg({ fx: 69, pal: 11 }), 2000);
  assert.ok(new Set(Array.from({ length: 30 }, (_, i) => Math.round(fn[i * 3]))).size > 5);
});

test('newly added effects are no longer flagged approximated', () => {
  for (const fx of [37, 54, 69, 80, 81, 86, 110, 143]) assert.ok(!isApproximated(seg({ fx })), `fx ${fx}`);
});
