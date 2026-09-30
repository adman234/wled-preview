// Independent, approximate re-implementations of WLED's classic 1D effects,
// keyed by WLED effect id. They aim to look like the real thing (timing, colour
// use, palette handling) but are NOT bit-exact ports of the firmware.
//
// An effect is { name, pal0?, run(p) }. `p` is the per-segment context built in
// engine.js: len, t (ms), sx, ix, col[3], pal(idx), palN(i), set/fill/fade,
// rand(), state (persistent per segment), wheel(). `pal0` says what palette
// "Default" (id 0) means for the effect: 'col' (segment colour 1, default),
// 'rainbow' or 'fire'.
import { blend, scale, wheel, hsv } from './color.js';

const TAU = Math.PI * 2;
const tri = (x) => { const f = x - Math.floor(x); return f < 0.5 ? f * 2 : 2 - f * 2; }; // 0..1..0
const cycleMs = (p) => 750 + (255 - p.sx) * 150;
// WLED's common "counter": speed-scaled free-running 0..255 value
const counter = (p) => Math.floor((p.t * ((p.sx >> 2) + 2)) / 256) & 0xff;
const BLACK = [0, 0, 0];

export const EFFECTS = {};
const def = (id, name, run, pal0) => { EFFECTS[id] = { name, run, pal0 }; };

// ---- static / blinking -----------------------------------------------------
def(0, 'Solid', (p) => p.fill(p.col[0]));

function blinkBase(p, onTime, onCol, offCol) {
  const cycle = (255 - p.sx) * 20 + 20 + onTime;
  const on = p.t % cycle < onTime;
  p.fill(on ? onCol() : offCol);
}
def(1, 'Blink', (p) => {
  const cycle = (255 - p.sx) * 20 + 20;
  p.fill(p.t % cycle < (cycle * p.ix) / 255 ? p.pal(0) : p.col[1]);
});
def(26, 'Blink Rainbow', (p) => {
  const cycle = (255 - p.sx) * 20 + 20;
  const n = Math.floor(p.t / cycle);
  p.fill(p.t % cycle < (cycle * p.ix) / 255 ? wheel((n * 37) & 255) : p.col[1]);
});
def(23, 'Strobe', (p) => blinkBase(p, 40, () => p.pal(0), p.col[1]));
def(24, 'Strobe Rainbow', (p) => blinkBase(p, 40, () => wheel((Math.floor(p.t / 200) * 29) & 255), p.col[1]));
def(25, 'Strobe Mega', (p) => {
  const cycle = (255 - p.sx) * 20 + 300;
  const ph = p.t % cycle;
  p.fill(ph < 120 && ph % 40 < 20 ? p.pal(0) : p.col[1]);
});

def(2, 'Breathe', (p) => {
  const amt = (Math.sin((p.t / 1000) * (0.4 + (p.sx / 255) * 3) * TAU / 2) + 1) / 2;
  p.fill(blend(p.col[1], p.pal(0), amt));
});
def(12, 'Fade', (p) => {
  const amt = (Math.sin((p.t / 1000) * (0.3 + (p.sx / 255) * 3) * TAU / 2) + 1) / 2;
  p.fill(blend(p.col[1], p.pal(0), amt));
});

// ---- colour cycling / rainbow ----------------------------------------------
def(8, 'Colorloop', (p) => p.fill(p.pal(counter(p))), 'rainbow');
def(9, 'Rainbow', (p) => {
  const c = counter(p);
  const spread = 0.25 + p.ix / 128;
  for (let i = 0; i < p.len; i++) p.set(i, p.pal(c + (i * 256 * spread) / Math.max(1, p.len)));
}, 'rainbow');
def(65, 'Palette', (p) => {
  const c = Math.floor((p.t * ((p.sx >> 3) + 1)) / 256);
  for (let i = 0; i < p.len; i++) p.set(i, p.pal(c + (i * 255) / p.len));
}, 'rainbow');
def(67, 'Colorwaves', (p) => {
  const c = Math.floor(p.t / (60 - p.sx / 6));
  for (let i = 0; i < p.len; i++) {
    const w = Math.sin(((i / p.len) * 2 + p.t / (3000 - p.sx * 8)) * TAU) * 0.5 + 0.5;
    p.set(i, scale(p.pal(c + (i * 255) / p.len), 0.35 + 0.65 * w));
  }
}, 'rainbow');
def(63, 'Pride 2015', (p) => {
  for (let i = 0; i < p.len; i++) {
    const h = (p.t / 40) * (0.5 + p.sx / 128) + i * 6 + Math.sin(p.t / 2000 + i / 8) * 40;
    const v = 0.4 + 0.6 * (Math.sin(p.t / 700 + i / 3) * 0.5 + 0.5);
    p.set(i, hsv(h, 1, v));
  }
});
def(5, 'Random Colors', (p) => {
  const s = p.state, cyc = cycleMs(p) / 4;
  const n = Math.floor(p.t / cyc);
  if (s.n !== n) { s.prev = s.cur || wheel(p.rand() * 255); s.cur = p.palRand(); s.n = n; }
  p.fill(blend(s.prev, s.cur, Math.min(1, (p.t % cyc) / Math.min(cyc, 1000))));
}, 'rainbow');
def(7, 'Dynamic', (p) => {
  const s = p.state;
  if (!s.px) s.px = Array.from({ length: p.len }, () => p.palRand());
  const rate = 0.02 + p.sx / 2000;
  const smooth = p.ix > 128;
  for (let i = 0; i < p.len; i++) {
    if (p.rand() < rate) s.px[i] = p.palRand();
    p.set(i, s.px[i]);
  }
  void smooth;
}, 'rainbow');

// ---- wipes ------------------------------------------------------------------
function wipe(p, a, b, back) {
  const c = cycleMs(p);
  const prog = (p.t % c) / c;
  const half = prog < 0.5;
  const f = (half ? prog : prog - 0.5) * 2;
  const n = Math.floor(f * p.len);
  for (let i = 0; i < p.len; i++) {
    const j = back && !half ? p.len - 1 - i : i;
    const covered = (back && !half ? p.len - 1 - i : i) < n;
    void j;
    p.set(i, half ? (i < n ? a : b) : covered ? b : a);
  }
}
def(3, 'Wipe', (p) => wipe(p, p.pal(0), p.col[1], false));
def(6, 'Sweep', (p) => wipe(p, p.pal(0), p.col[1], true));
def(4, 'Wipe Random', (p) => {
  const c = cycleMs(p);
  const n = Math.floor(p.t / c);
  const s = p.state;
  if (s.n !== n) { s.n = n; s.a = wheel(p.rand() * 255); s.b = wheel(p.rand() * 255); }
  wipe(p, s.a, s.b, false);
});
def(36, 'Sweep Random', (p) => {
  const c = cycleMs(p);
  const n = Math.floor(p.t / c);
  const s = p.state;
  if (s.n !== n) { s.n = n; s.a = wheel(p.rand() * 255); s.b = wheel(p.rand() * 255); }
  wipe(p, s.a, s.b, true);
});
def(55, 'Tri Wipe', (p) => {
  const c = cycleMs(p);
  const prog = (p.t % c) / c;
  const seg = Math.floor(prog * 3);
  const f = prog * 3 - seg;
  const n = Math.floor(f * p.len);
  const cur = p.col[seg % 3], prev = p.col[(seg + 2) % 3];
  for (let i = 0; i < p.len; i++) p.set(i, i < n ? cur : prev);
});
def(56, 'Tri Fade', (p) => {
  const prog = (p.t / (cycleMs(p) / 2)) % 3;
  const seg = Math.floor(prog);
  p.fill(blend(p.col[seg], p.col[(seg + 1) % 3], prog - seg));
});

// ---- scans / chases ----------------------------------------------------------
function dot(p, pos, size, c) {
  for (let k = 0; k < size; k++) {
    const i = Math.round(pos) + k;
    if (i >= 0 && i < p.len) p.set(i, c);
  }
}
def(10, 'Scan', (p) => {
  const size = 1 + ((p.ix * p.len) >> 9);
  const pos = tri((p.t % cycleMs(p)) / cycleMs(p)) * (p.len - size);
  p.fill(p.col[1]);
  dot(p, pos, size, p.pal(0));
});
def(11, 'Scan Dual', (p) => {
  const size = 1 + ((p.ix * p.len) >> 9);
  const pos = tri((p.t % cycleMs(p)) / cycleMs(p)) * (p.len - size);
  p.fill(p.col[1]);
  dot(p, pos, size, p.pal(0));
  dot(p, p.len - size - pos, size, p.pal(0));
});
function larson(p, dual) {
  p.fadeBy(0.35 + (p.ix / 255) * 0.6);
  const c = cycleMs(p) / 3;
  const pos = tri((p.t % c) / c) * (p.len - 1);
  p.set(Math.round(pos), p.pal(0));
  if (dual) p.set(p.len - 1 - Math.round(pos), p.col[2][0] || p.col[2][1] || p.col[2][2] ? p.col[2] : p.pal(0));
}
def(40, 'Scanner', (p) => larson(p, false));
def(60, 'Scanner Dual', (p) => larson(p, true));
def(58, 'ICU', (p) => {
  const c = cycleMs(p) / 2;
  const pos = tri((p.t % c) / c) * (p.len / 2 - 1);
  p.fill(p.col[1]);
  p.set(Math.round(pos), p.pal(0));
  p.set(Math.round(pos + p.len / 2), p.pal(0));
});

function chase(p, colFn, bg) {
  const size = 1 + ((p.ix * p.len) >> 9);
  const pos = (((p.t * ((p.sx >> 2) + 1)) / 256) * p.len / 64) % p.len;
  p.fill(bg);
  for (let k = 0; k < size; k++) p.set(Math.floor(pos + k) % p.len, colFn());
}
def(28, 'Chase', (p) => chase(p, () => p.pal(0), p.col[1]));
def(29, 'Chase Random', (p) => {
  const n = Math.floor(((p.t * ((p.sx >> 2) + 1)) / 256 / 64));
  const s = p.state; if (s.n !== n) { s.n = n; s.c = wheel(p.rand() * 255); }
  chase(p, () => s.c, p.col[1]);
}, 'rainbow');
def(30, 'Chase Rainbow', (p) => chase(p, () => wheel(counter(p)), p.col[1]));
def(33, 'Rainbow Runner', (p) => {
  const pos = (((p.t * ((p.sx >> 2) + 1)) / 256 / 4)) % 256;
  for (let i = 0; i < p.len; i++) p.set(i, (Math.floor(i + pos) % 8) < 4 ? wheel(counter(p) + i * 4) : p.col[1]);
});
def(13, 'Theater', (p) => {
  const w = 3, off = Math.floor(p.t * ((p.sx >> 2) + 1) / 256 / 6);
  for (let i = 0; i < p.len; i++) p.set(i, (i + off) % w === 0 ? p.pal(0) : p.col[1]);
});
def(14, 'Theater Rainbow', (p) => {
  const w = 3, off = Math.floor(p.t * ((p.sx >> 2) + 1) / 256 / 6);
  for (let i = 0; i < p.len; i++) p.set(i, (i + off) % w === 0 ? wheel(counter(p) + i * 2) : p.col[1]);
});
function runningLights(p, saw, dual) {
  const w = 2 + p.ix / 16, off = (p.t * ((p.sx >> 2) + 1)) / 256 / 12;
  for (let i = 0; i < p.len; i++) {
    const x = (i + off) / w;
    const l = saw ? 1 - (x - Math.floor(x)) : Math.sin(x * TAU / 2 * 2) * 0.5 + 0.5;
    const l2 = dual ? Math.sin(((p.len - 1 - i) + off) / w * TAU) * 0.5 + 0.5 : 0;
    p.set(i, blend(p.col[1], p.pal(i * 255 / p.len), Math.max(l, l2)));
  }
}
def(15, 'Running', (p) => runningLights(p, false, false));
def(52, 'Running Dual', (p) => runningLights(p, false, true));
def(16, 'Saw', (p) => runningLights(p, true, false));
def(34, 'Colorful', (p) => {
  const off = Math.floor((p.t * ((p.sx >> 2) + 1)) / 256 / 8);
  for (let i = 0; i < p.len; i++) p.set(i, p.col[Math.floor((i + off) / 4) % 3]);
});
def(27, 'Android', (p) => {
  const c = cycleMs(p) / 4;
  const size = Math.max(2, Math.floor(p.len * (0.2 + 0.4 * tri((p.t % (c * 2)) / (c * 2)))));
  const pos = Math.floor(((p.t / c) * p.len / 8) % p.len);
  p.fill(p.col[1]);
  for (let k = 0; k < size; k++) p.set((pos + k) % p.len, p.pal(0));
});
def(47, 'Loading', (p) => {
  const c = cycleMs(p) / 4;
  const f = (p.t % c) / c;
  const n = Math.floor(f * p.len);
  for (let i = 0; i < p.len; i++) p.set(i, i < n ? p.pal(0) : p.col[1]);
});
def(50, 'Two Dots', (p) => {
  const c = cycleMs(p) / 3;
  const pos = tri((p.t % c) / c) * (p.len - 1);
  p.fill(p.col[2]);
  p.set(Math.round(pos), p.col[0]);
  p.set(Math.round(p.len - 1 - pos), p.col[1]);
});
def(46, 'Gradient', (p) => {
  const spread = 0.2 + p.ix / 128;
  for (let i = 0; i < p.len; i++) p.set(i, blend(p.col[0], p.col[1], Math.min(1, (i / p.len) * spread)));
});

// ---- sparkle family -----------------------------------------------------------
def(20, 'Sparkle', (p) => {
  p.fill(p.col[1]);
  if (p.rand() < 0.3 + p.sx / 400) p.state.i = Math.floor(p.rand() * p.len);
  if (p.state.i !== undefined) p.set(p.state.i, p.pal(0));
});
def(21, 'Sparkle Dark', (p) => {
  p.fill(p.pal(0));
  if (p.rand() < 0.3 + p.sx / 400) p.state.i = Math.floor(p.rand() * p.len);
  if (p.state.i !== undefined) p.set(p.state.i, p.col[1]);
});
def(87, 'Glitter', (p) => {
  for (let i = 0; i < p.len; i++) p.set(i, p.pal(i * 255 / p.len + p.t / 50));
  if (p.rand() < p.ix / 255) for (let k = 0; k < 1 + p.len / 40; k++) p.set(Math.floor(p.rand() * p.len), [255, 255, 255]);
}, 'rainbow');
def(17, 'Twinkle', (p) => {
  const s = p.state;
  if (!s.lv) s.lv = new Float32Array(p.len);
  const spawn = (p.ix / 255) * 0.08 + 0.004;
  const decay = 0.02 + p.sx / 255 * 0.12;
  for (let i = 0; i < p.len; i++) {
    if (p.rand() < spawn) s.lv[i] = 1;
    s.lv[i] = Math.max(0, s.lv[i] - decay);
    p.set(i, blend(p.col[1], p.pal(i * 255 / p.len), Math.min(1, s.lv[i] * 1.5)));
  }
});
def(74, 'Colortwinkles', (p) => {
  const s = p.state;
  if (!s.lv) { s.lv = new Float32Array(p.len); s.c = []; }
  for (let i = 0; i < p.len; i++) {
    if (s.lv[i] <= 0 && p.rand() < 0.01 + p.ix / 4000) { s.lv[i] = 1; s.c[i] = p.palRand(); }
    if (s.lv[i] > 0) s.lv[i] = Math.max(0, s.lv[i] - 0.01 - p.sx / 6000);
    p.set(i, scale(s.c[i] || BLACK, tri(1 - s.lv[i]) ));
  }
}, 'rainbow');
function dissolve(p, rnd) {
  const s = p.state;
  if (!s.m) { s.m = new Uint8Array(p.len); s.fill = true; s.cols = []; }
  const rate = Math.max(1, Math.floor(p.len * (0.01 + p.sx / 2000)));
  for (let k = 0; k < rate; k++) {
    const i = Math.floor(p.rand() * p.len);
    if (s.fill) { s.m[i] = 1; s.cols[i] = rnd ? wheel(p.rand() * 255) : null; }
    else s.m[i] = 0;
  }
  if (p.rand() < 0.01 + p.sx / 4000) {
    const on = s.m.reduce((a, b) => a + b, 0);
    if (s.fill && on > p.len * 0.95) s.fill = false;
    else if (!s.fill && on < p.len * 0.05) s.fill = true;
  }
  for (let i = 0; i < p.len; i++) p.set(i, s.m[i] ? s.cols[i] || p.pal(i * 255 / p.len) : p.col[1]);
}
def(18, 'Dissolve', (p) => dissolve(p, false));
def(19, 'Dissolve Rnd', (p) => dissolve(p, true));
def(45, 'Fire Flicker', (p) => {
  const base = p.pal(0);
  for (let i = 0; i < p.len; i++) p.set(i, scale(base, 1 - (p.rand() * (0.15 + p.ix / 400)) ));
});
def(57, 'Lightning', (p) => {
  const s = p.state;
  p.fadeBy(0.6);
  if (!s.next) s.next = p.t + 500;
  if (p.t >= s.next) {
    const start = Math.floor(p.rand() * p.len * 0.8), w = Math.max(3, Math.floor(p.len * (0.1 + p.ix / 800)));
    for (let i = start; i < Math.min(p.len, start + w); i++) p.set(i, p.col[0]);
    s.next = p.t + 60 + p.rand() * (300 + (255 - p.sx) * 12);
  }
});
def(42, 'Fireworks', (p) => {
  p.fadeBy(0.87);
  if (p.rand() < 0.02 + p.sx / 1500) {
    const i = Math.floor(p.rand() * p.len), c = p.palRand();
    for (let k = -1; k <= 1; k++) if (i + k >= 0 && i + k < p.len) p.set(i + k, k === 0 ? [255, 255, 255] : c);
  }
}, 'rainbow');
def(43, 'Rain', (p) => {
  const s = p.state;
  if (!s.drops) s.drops = [];
  p.fadeBy(0.8);
  if (p.rand() < 0.03 + p.sx / 1000) s.drops.push({ pos: 0, c: p.pal(p.rand() * 255) });
  s.drops = s.drops.filter((d) => (d.pos += 0.4 + p.sx / 255) < p.len);
  for (const d of s.drops) p.set(Math.floor(d.pos), d.c);
}, 'col');

// ---- palette-driven motion --------------------------------------------------
def(64, 'Juggle', (p) => {
  p.fadeBy(0.75);
  for (let k = 0; k < 4; k++) p.set(Math.floor((Math.sin(p.t / 1000 * (k + 1) * (0.5 + p.sx / 200)) * 0.5 + 0.5) * (p.len - 1)), p.pal(k * 64 + p.t / 40));
}, 'rainbow');
def(92, 'Sinelon', (p) => {
  p.fadeBy(0.85);
  const pos = (Math.sin(p.t / 1000 * (0.6 + p.sx / 80)) * 0.5 + 0.5) * (p.len - 1);
  dot(p, pos, 1 + (p.ix >> 6), p.pal(p.t / 30));
}, 'rainbow');
def(76, 'Meteor', (p) => {
  const size = 1 + (p.ix >> 4);
  const pos = ((p.t * (0.02 + p.sx / 2500)) % (p.len + size * 2));
  for (let i = 0; i < p.len; i++) if (p.rand() > 0.5) p.set(i, scale(p.get(i), 0.85));
  dot(p, pos - size, size, p.pal(0));
});
def(77, 'Meteor Smooth', (p) => {
  const size = 1 + (p.ix >> 4);
  const pos = ((p.t * (0.02 + p.sx / 2500)) % (p.len + size * 2));
  p.fadeBy(0.88);
  dot(p, pos - size, size, p.pal(0));
});
def(66, 'Fire 2012', (p) => {
  // Classic Fire2012 algorithm; heat kept in 0..1.
  const s = p.state;
  if (!s.h) s.h = new Float32Array(p.len);
  const cooling = 20 + (255 - p.sx) * 0.4, sparking = 0.3 + (p.ix / 255) * 0.6;
  for (let i = 0; i < p.len; i++) s.h[i] = Math.max(0, s.h[i] - (p.rand() * ((cooling * 10) / p.len + 2)) / 255);
  for (let i = p.len - 1; i >= 2; i--) s.h[i] = (s.h[i - 1] + s.h[i - 2] + s.h[i - 2]) / 3;
  if (p.rand() < sparking) {
    const i = Math.floor(p.rand() * Math.min(7, p.len));
    s.h[i] = Math.min(1, s.h[i] + (160 + p.rand() * 95) / 255);
  }
  for (let i = 0; i < p.len; i++) p.set(i, p.pal(Math.min(255, s.h[i] * 255)));
}, 'fire');
def(88, 'Candle', (p) => {
  const s = p.state;
  s.v = (s.v ?? 0.7) + (p.rand() - 0.5) * (0.05 + p.sx / 1500);
  s.v = Math.min(1, Math.max(0.35, s.v));
  const base = p.pal(0);
  for (let i = 0; i < p.len; i++) p.set(i, scale(base, Math.min(1, s.v * (0.9 + p.rand() * 0.1))));
});
def(91, 'Bouncing Balls', (p) => {
  const s = p.state;
  const n = 1 + (p.ix >> 6);
  if (!s.b) s.b = Array.from({ length: n }, (_, k) => ({ y: 1, v: 0, k }));
  p.fill(p.col[1]);
  const dt = Math.min(0.05, p.dt / 1000) * (0.5 + p.sx / 128);
  for (const b of s.b) {
    b.v -= 3.5 * dt; b.y += b.v * dt * 2;
    if (b.y <= 0) { b.y = 0; b.v = Math.abs(b.v) * 0.9 || 0; if (b.v < 0.2) b.v = 1.6 + p.rand() * 0.6; }
    p.set(Math.min(p.len - 1, Math.round(b.y * (p.len - 1))), p.pal(b.k * 255 / n));
  }
}, 'rainbow');
def(95, 'Popcorn', (p) => {
  const s = p.state;
  if (!s.k) s.k = [];
  p.fill(p.col[1]);
  if (p.rand() < 0.04 + p.ix / 1200) s.k.push({ y: 0, v: 0.6 + p.rand() * 0.8, c: p.pal(p.rand() * 255) });
  const dt = Math.min(0.05, p.dt / 1000) * (0.6 + p.sx / 160);
  s.k = s.k.filter((k) => { k.v -= 2.2 * dt; k.y += k.v * dt * 2; return k.y > 0; });
  for (const k of s.k) p.set(Math.min(p.len - 1, Math.round(k.y * (p.len - 1))), k.c);
});
def(97, 'Plasma', (p) => {
  const t = p.t / 1000 * (0.3 + p.sx / 120);
  for (let i = 0; i < p.len; i++) {
    const x = i / p.len * (2 + p.ix / 64);
    const v = (Math.sin(x * 4 + t) + Math.sin(x * 7 - t * 1.3) + Math.sin(x * 2.3 + t * 0.7) + 3) / 6;
    p.set(i, p.pal(v * 255));
  }
}, 'rainbow');
