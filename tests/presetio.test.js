import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseImport, nextId, presetToText, exportText } from '../web/js/presetio.js';

const preset = { n: 'Test', seg: [{ id: 0, start: 0, stop: 10, fx: 9 }] };

test('copy text round-trips through import', () => {
  assert.deepEqual(parseImport(presetToText(preset)), [preset]);
});

test('import accepts id-keyed maps and "id":{…} fragments', () => {
  assert.deepEqual(parseImport(JSON.stringify({ 0: {}, 4: preset, 7: preset })), [preset, preset]);
  assert.deepEqual(parseImport(`"3":${JSON.stringify(preset)},`), [preset]);
});

test('import rejects junk', () => {
  assert.throws(() => parseImport(''), /Nothing/);
  assert.throws(() => parseImport('not json'), /valid JSON/);
  assert.throws(() => parseImport('[1,2]'), /object/);
  assert.throws(() => parseImport('{"foo":{"bar":1}}'), /look like/);
});

test('nextId picks the smallest free slot', () => {
  assert.equal(nextId(['0', '1', '2', '4']), '3');
  assert.equal(nextId([]), '1');
  assert.throws(() => nextId(Array.from({ length: 250 }, (_, i) => i + 1)), /250/);
});

test('export keeps the original json untouched plus additions', () => {
  const raw = { 0: {}, 1: preset };
  raw[nextId(Object.keys(raw))] = { n: 'New', seg: [] };
  assert.deepEqual(JSON.parse(exportText(raw)), { 0: {}, 1: preset, 2: { n: 'New', seg: [] } });
});
