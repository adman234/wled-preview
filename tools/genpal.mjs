// Generates web/js/palettes.js from WLED 0.15.5 palettes.h + FastLED built-ins.
import fs from 'node:fs';
const [, , wledDir, outFile] = process.argv;
const ph = fs.readFileSync(`${wledDir}/palettes.h`, 'utf8');
const fcn = fs.readFileSync(`${wledDir}/FX_fcn.cpp`, 'utf8');

const arrays = {};
for (const m of ph.matchAll(/const\s+byte\s+(\w+)\[\]\s+PROGMEM\s*=\s*\{([^}]*)\}/g)) {
  arrays[m[1]] = m[2].replace(/\/\/.*$/gm, '').split(',').map((s) => s.trim()).filter(Boolean).map(Number);
}
const list = ph.slice(ph.indexOf('gGradientPalettes[]'));
const order = [...list.matchAll(/^\s*(\w+_gp)\b/gm)].map((m) => m[1]);
const names = JSON.parse(fcn.match(/JSON_palette_names\[\] PROGMEM = R"=====\(([\s\S]*?)\)====="/)[1]);

// FastLED fill_gradient_RGB (integer maths, as in colorutils.cpp)
function fillGrad(e, s, c1, t, c2) {
  if (t < s) { [s, t] = [t, s]; [c1, c2] = [c2, c1]; }
  const div = t - s || 1;
  const d = [0, 1, 2].map((k) => Math.trunc(((c2[k] - c1[k]) << 7) / div) * 2);
  const a = c1.map((v) => v << 8);
  for (let i = s; i <= t; i++) {
    e[i] = a.map((v) => (v >> 8) & 255);
    for (let k = 0; k < 3; k++) a[k] = (a[k] + d[k]) & 0xffff;
  }
}
// FastLED CRGBPalette16::loadDynamicGradientPalette
function gradTo16(b) {
  const e = new Array(16);
  let count = 0;
  while (b[count * 4] !== 255) count++;
  count++;
  let last = -1, p = 0, start = [b[1], b[2], b[3]], is = 0;
  while (is < 255) {
    p++;
    const ie = b[p * 4], end = [b[p * 4 + 1], b[p * 4 + 2], b[p * 4 + 3]];
    let s8 = is >> 4, e8 = ie >> 4;
    if (count < 16) {
      if (s8 <= last && last < 15) { s8 = last + 1; if (e8 < s8) e8 = s8; }
      last = e8;
    }
    fillGrad(e, s8, start, e8, end);
    is = ie; start = end;
  }
  return e;
}
const hex = (e) => '[' + e.map((c) => '0x' + ((c[0] << 16) | (c[1] << 8) | c[2]).toString(16).padStart(6, '0')).join(', ') + ']';

const out = [];
for (let i = 0; i < order.length; i++) {
  const id = i + 13;
  out.push(`  ${id}: [${JSON.stringify(names[id])}, ${hex(gradTo16(arrays[order[i]]))}],`);
}
const tpl = fs.readFileSync(new URL('./palettes.tpl.js', import.meta.url), 'utf8');
fs.writeFileSync(outFile, tpl.replace('/*GRADIENTS*/', out.join('\n')));
console.log(`wrote ${order.length} gradient palettes (13-${12 + order.length})`);
