import { parseCfg, parsePresets, inferTotal } from './parse.js';
import { PresetRenderer, effectName, isApproximated } from './engine.js';
import { paletteName } from './palettes.js';
import { matrixXY } from './layout.js';

const $ = (id) => document.getElementById(id);
const state = { cfg: null, presets: [], total: 0, sel: null, renderer: null, paused: false, size: 10, playlist: null };
const thumbs = new Map(); // preset id -> {renderer, canvas}
const visible = new Set();

// ---------- loading ----------
async function readJson(file) {
  const text = await file.text();
  try { return JSON.parse(text); } catch (e) { throw new Error(`${file.name}: not valid JSON (${e.message})`); }
}
function showError(msg) { const e = $('error'); e.hidden = !msg; e.textContent = msg || ''; }

function classify(json) {
  if (json && json.hw && json.hw.led) return 'cfg';
  return 'presets';
}

async function loadFiles(files) {
  showError('');
  try {
    for (const f of files) {
      const json = await readJson(f);
      if (classify(json) === 'cfg') setCfg(json, f.name); else setPresets(json, f.name);
    }
  } catch (e) { showError(e.message); }
}
function setCfg(json, name) {
  state.cfg = parseCfg(json);
  $('drop-cfg').classList.add('ok');
  $('cfg-status').textContent = `${name} – ${state.cfg.total} LEDs, ${state.cfg.outputs.length} output(s)${state.cfg.matrix ? `, ${state.cfg.matrix.w}×${state.cfg.matrix.h} matrix` : ''}`;
  $('devname').textContent = state.cfg.name;
  rebuild();
}
function setPresets(json, name) {
  state.rawPresets = json; state.presetsName = name;
  $('drop-presets').classList.add('ok');
  $('presets-status').textContent = name;
  rebuild();
}
function rebuild() {
  if (!state.rawPresets) return;
  const hint = state.cfg ? state.cfg.total : 0;
  state.presets = parsePresets(state.rawPresets, hint);
  state.total = state.cfg ? state.cfg.total : inferTotal(state.presets);
  if (!state.presets.length) { showError('No presets found in that file.'); return; }
  if (!state.total) { showError('Could not work out how many LEDs you have – upload cfg.json too.'); return; }
  $('presets-status').textContent = `${state.presetsName} – ${state.presets.length} presets`;
  thumbs.clear(); visible.clear();
  buildList();
  $('search').hidden = false;
  select(state.sel && state.presets.find((p) => p.id === state.sel) ? state.sel : state.presets[0].id);
}

// ---------- preset list ----------
const io = new IntersectionObserver((entries) => {
  for (const e of entries) e.isIntersecting ? visible.add(e.target.dataset.id) : visible.delete(e.target.dataset.id);
});
function buildList() {
  const ul = $('list');
  ul.textContent = '';
  io.disconnect();
  for (const p of state.presets) {
    const li = document.createElement('li');
    li.dataset.id = p.id;
    const tag = p.playlist ? 'playlist' : `${p.segs.length} seg`;
    li.innerHTML = `<div class="n"><span class="id"></span><span class="name"></span><span class="tag"></span></div>`;
    li.querySelector('.id').textContent = p.id;
    li.querySelector('.name').textContent = p.name;
    li.querySelector('.tag').textContent = tag;
    if (!p.playlist) { const c = document.createElement('canvas'); c.width = 240; c.height = 8; li.appendChild(c); }
    li.addEventListener('click', () => select(p.id));
    ul.appendChild(li);
    io.observe(li);
  }
  filterList();
}
function filterList() {
  const q = $('search').value.trim().toLowerCase();
  for (const li of $('list').children) {
    const p = state.presets.find((x) => x.id === li.dataset.id);
    li.hidden = q && !(p.name.toLowerCase().includes(q) || p.id === q);
  }
}
$('search').addEventListener('input', filterList);

// ---------- selection & playback ----------
function select(id) {
  state.sel = id;
  for (const li of $('list').children) li.classList.toggle('sel', li.dataset.id === id);
  const p = state.presets.find((x) => x.id === id);
  $('empty').hidden = true; $('view').hidden = false;
  $('pname').textContent = `${p.id} · ${p.name}`;
  state.playlist = null;
  if (p.playlist) startPlaylist(p); else startPreset(p);
  buildStrips();
}
function startPreset(p) {
  state.current = p;
  state.renderer = new PresetRenderer(p, state.total);
  describe(p);
}
function startPlaylist(p) {
  const items = p.playlist.items.filter((i) => state.presets.find((x) => x.id === i.id && !x.playlist));
  if (!items.length) { state.renderer = null; $('notice').hidden = false; $('notice').textContent = 'This playlist does not reference any previewable presets.'; $('segs').querySelector('tbody').textContent = ''; return; }
  state.playlist = { items, i: 0, until: 0 };
  advancePlaylist(performance.now());
}
function advancePlaylist(now) {
  const pl = state.playlist;
  const item = pl.items[pl.i % pl.items.length];
  const target = state.presets.find((x) => x.id === item.id);
  pl.until = now + Math.max(1, item.dur) * 1000;
  startPreset(target);
  $('pname').textContent = `${state.sel} · ${state.presets.find((x) => x.id === state.sel).name} – now playing ${target.id} · ${target.name}`;
  pl.i++;
}

function describe(p) {
  const tbody = $('segs').querySelector('tbody');
  tbody.textContent = '';
  const notes = new Set();
  p.segs.forEach((s, i) => {
    const tr = document.createElement('tr');
    const approx = isApproximated(s);
    if (approx) notes.add(`${effectName(s.fx)} (effect ${s.fx}) / ${paletteName(s.pal)} is not fully supported yet – a generic palette animation is shown instead.`);
    const cells = [s.id ?? i, `${s.start}–${s.stop - 1} (${s.len})`, effectName(s.fx), paletteName(s.pal), s.sx, s.ix];
    for (const c of cells) { const td = document.createElement('td'); td.textContent = c; tr.appendChild(td); }
    if (approx) { const sp = document.createElement('span'); sp.className = 'approx'; sp.textContent = 'approximated'; tr.children[2].appendChild(sp); }
    const colTd = document.createElement('td');
    for (const c of s.col) { const sw = document.createElement('span'); sw.className = 'sw'; sw.style.background = `rgb(${c})`; colTd.appendChild(sw); }
    tr.appendChild(colTd);
    const flags = [s.on ? '' : 'off', s.rev ? 'rev' : '', s.mi ? 'mirror' : '', s.grp > 1 ? `grp ${s.grp}` : '', s.spc ? `spc ${s.spc}` : '', s.of ? `off ${s.of}` : '', s.bri < 255 ? `bri ${s.bri}` : ''].filter(Boolean).join(', ');
    const fl = document.createElement('td'); fl.textContent = flags; tr.appendChild(fl);
    tbody.appendChild(tr);
  });
  $('notice').hidden = !notes.size;
  $('notice').textContent = [...notes].join(' ');
}

// ---------- drawing ----------
let strips = []; // {canvas, start, len, matrix}
function buildStrips() {
  const box = $('strips');
  box.textContent = '';
  strips = [];
  const cfg = state.cfg;
  if (cfg && cfg.matrix) {
    const c = document.createElement('canvas');
    box.appendChild(c);
    strips.push({ canvas: c, matrix: cfg.matrix, start: 0, len: state.total });
    return;
  }
  const outs = cfg && cfg.outputs.length ? cfg.outputs : [{ start: 0, len: state.total, pin: '', index: 0 }];
  for (const o of outs) {
    const label = document.createElement('div');
    label.className = 'strip-label';
    label.textContent = `Output ${o.index + 1}${o.pin !== undefined && o.pin !== '' ? ` (GPIO ${o.pin})` : ''} – LEDs ${o.start}–${o.start + o.len - 1}`;
    const c = document.createElement('canvas');
    box.append(label, c);
    strips.push({ canvas: c, start: o.start, len: o.len, rev: o.rev });
  }
}

function sizeCanvas(c, w, h) {
  const dpr = window.devicePixelRatio || 1;
  if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
    c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    c.style.height = `${h}px`;
  }
  const ctx = c.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

function drawLed(ctx, x, y, r, rgb) {
  const R = rgb[0], G = rgb[1], B = rgb[2];
  const lum = Math.max(R, G, B);
  if (lum < 2) { ctx.fillStyle = '#15171c'; ctx.beginPath(); ctx.arc(x, y, r * 0.7, 0, 6.3); ctx.fill(); return; }
  // boost so dim LEDs stay visible on screen
  const k = lum < 255 ? Math.min(255 / lum, 1 + (255 - lum) / 255 * 0.6) : 1;
  const col = `rgb(${Math.min(255, R * k) | 0},${Math.min(255, G * k) | 0},${Math.min(255, B * k) | 0})`;
  if (r >= 4) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.2);
    g.addColorStop(0, col.replace('rgb', 'rgba').replace(')', `,${Math.min(0.55, lum / 400)})`));
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(x - r * 2.2, y - r * 2.2, r * 4.4, r * 4.4);
  }
  ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, r * 0.75, 0, 6.3); ctx.fill();
}

function drawStrip(s, frame) {
  const w = s.canvas.parentElement.clientWidth - 24;
  const size = state.size;
  if (s.matrix) {
    const m = s.matrix, cell = Math.max(size, 6) + 4;
    const cw = Math.min(cell, Math.floor(w / m.w));
    const ctx = sizeCanvas(s.canvas, w, cw * m.h);
    ctx.clearRect(0, 0, w, cw * m.h);
    const cnt = Math.min(state.total, m.panels.reduce((a, p) => a + p.w * p.h, 0));
    for (let i = 0; i < cnt; i++) {
      const xy = matrixXY(m, i); if (!xy) continue;
      drawLed(ctx, xy[0] * cw + cw / 2, xy[1] * cw + cw / 2, cw / 2, [frame[i * 3], frame[i * 3 + 1], frame[i * 3 + 2]]);
    }
    return;
  }
  const pitch = size + 4;
  const perRow = Math.max(1, Math.floor(w / pitch));
  const rows = Math.ceil(s.len / perRow);
  const ctx = sizeCanvas(s.canvas, w, rows * pitch);
  ctx.clearRect(0, 0, w, rows * pitch);
  const pitchX = Math.min(pitch * 2, w / Math.min(perRow, s.len));
  for (let i = 0; i < s.len; i++) {
    const j = s.rev ? s.len - 1 - i : i;
    const idx = s.start + j;
    const row = Math.floor(i / perRow), col = i % perRow;
    drawLed(ctx, col * pitchX + pitchX / 2, row * pitch + pitch / 2, size / 2, [frame[idx * 3], frame[idx * 3 + 1], frame[idx * 3 + 2]]);
  }
}

function drawThumb(canvas, frame) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, n = state.total, step = Math.max(1, Math.floor(n / W));
  const px = W / Math.min(n, W);
  for (let x = 0, i = 0; i < n && x < W; i += step, x += px) {
    ctx.fillStyle = `rgb(${frame[i * 3] | 0},${frame[i * 3 + 1] | 0},${frame[i * 3 + 2] | 0})`;
    ctx.fillRect(x, 0, Math.ceil(px), canvas.height);
  }
}

let lastThumb = 0;
function tick(now) {
  requestAnimationFrame(tick);
  if (state.paused || !state.renderer) return;
  if (state.playlist && now >= state.playlist.until) advancePlaylist(now);
  const frame = state.renderer.frame(now);
  for (const s of strips) drawStrip(s, frame);
  if (now - lastThumb > 66 && state.presets.length) {
    lastThumb = now;
    for (const id of visible) {
      const li = $('list').querySelector(`li[data-id="${CSS.escape(id)}"]`);
      const c = li && li.querySelector('canvas');
      if (!c) continue;
      let t = thumbs.get(id);
      if (!t) { const p = state.presets.find((x) => x.id === id); t = new PresetRenderer(p, state.total); thumbs.set(id, t); }
      drawThumb(c, t.frame(now));
    }
  }
}
requestAnimationFrame(tick);

// ---------- wiring ----------
$('file-cfg').addEventListener('change', (e) => loadFiles(e.target.files));
$('file-presets').addEventListener('change', (e) => loadFiles(e.target.files));
$('pause').addEventListener('click', () => { state.paused = !state.paused; $('pause').textContent = state.paused ? 'Resume' : 'Pause'; });
$('size').addEventListener('input', (e) => { state.size = +e.target.value; });
for (const ev of ['dragover', 'drop']) document.body.addEventListener(ev, (e) => { e.preventDefault(); });
document.body.addEventListener('drop', (e) => loadFiles(e.dataTransfer.files));
$('sample').addEventListener('click', async () => {
  showError('');
  try {
    const [c, p] = await Promise.all(['samples/cfg.json', 'samples/presets.json'].map((u) => fetch(u).then((r) => r.json())));
    setCfg(c, 'sample cfg.json'); setPresets(p, 'sample presets.json');
  } catch (e) { showError(`Could not load sample: ${e.message}`); }
});
