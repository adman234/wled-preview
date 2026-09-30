import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCfg, parsePresets, inferTotal } from '../web/js/parse.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../web/samples/${f}`, import.meta.url)));

test('parseCfg reads outputs and total', () => {
  const cfg = parseCfg(load('cfg.json'));
  assert.equal(cfg.total, 150);
  assert.deepEqual(cfg.outputs.map((o) => [o.start, o.len]), [[0, 90], [90, 60]]);
  assert.equal(cfg.matrix, null);
});

test('parseCfg rejects non-WLED json', () => {
  assert.throws(() => parseCfg({ foo: 1 }), /hw\.led/);
});

test('parseCfg detects matrix panels', () => {
  const cfg = parseCfg({ hw: { led: { total: 64, ins: [{ start: 0, len: 64 }], matrix: { panels: [{ x: 0, y: 0, w: 8, h: 8, s: true }] } } } });
  assert.equal(cfg.matrix.w, 8);
  assert.equal(cfg.matrix.h, 8);
});

test('parsePresets skips empty, sorts, handles playlists', () => {
  const ps = parsePresets(load('presets.json'), 150);
  assert.equal(ps[0].id, '1');
  assert.ok(!ps.find((p) => p.id === '0'));
  const pl = ps.find((p) => p.playlist);
  assert.deepEqual(pl.playlist.items.map((i) => i.id), ['1', '2', '3']);
  assert.equal(pl.playlist.items[0].dur, 10);
});

test('segments get WLED defaults and RGBW colours fold white in', () => {
  const [p] = parsePresets({ 1: { n: 'x', seg: [{ stop: 10, col: [[10, 20, 30, 5], '#ff0000'] }] } });
  const s = p.segs[0];
  assert.equal(s.sx, 128);
  assert.equal(s.grp, 1);
  assert.deepEqual(s.col[0], [15, 25, 35]);
  assert.deepEqual(s.col[1], [255, 0, 0]);
});

test('inferTotal uses highest stop', () => {
  assert.equal(inferTotal(parsePresets(load('presets.json'), 150)), 150);
});
