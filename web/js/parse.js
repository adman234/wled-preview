// Parsing of WLED cfg.json and presets.json into a normalised model.
import { parseColorWithWhite } from './color.js';

const DEFAULT_COLORS = [[255, 160, 0], [0, 0, 0], [0, 0, 0]];

export function parseCfg(cfg) {
  if (!cfg || typeof cfg !== 'object') throw new Error('cfg.json is not a JSON object');
  const led = cfg.hw && cfg.hw.led;
  if (!led) throw new Error('cfg.json has no hw.led section - is this a WLED configuration file?');
  const outputs = (led.ins || []).map((o, i) => ({
    index: i,
    start: o.start | 0,
    len: o.len | 0,
    pin: Array.isArray(o.pin) ? o.pin.join(',') : o.pin,
    type: o.type,
    rev: !!o.rev,
    skip: o.skip | 0,
  })).filter((o) => o.len > 0);
  let total = led.total | 0;
  if (!total) total = outputs.reduce((m, o) => Math.max(m, o.start + o.len), 0);
  if (!outputs.length && total) outputs.push({ index: 0, start: 0, len: total, pin: '?', rev: false, skip: 0 });

  let matrix = null;
  const panels = led.matrix && led.matrix.panels;
  if (Array.isArray(panels) && panels.length) {
    const w = Math.max(...panels.map((p) => (p.x | 0) + (p.w | 0)));
    const h = Math.max(...panels.map((p) => (p.y | 0) + (p.h | 0)));
    if (w > 1 && h > 1) matrix = { w, h, panels: panels.map((p) => ({ b: !!p.b, r: !!p.r, v: !!p.v, s: !!p.s, x: p.x | 0, y: p.y | 0, w: p.w | 0, h: p.h | 0 })) };
  }
  return { name: (cfg.id && cfg.id.name) || (cfg.id && cfg.id.mdns) || 'WLED', total, outputs, matrix };
}

function normaliseSeg(raw, total) {
  const start = raw.start | 0;
  const stop = raw.stop !== undefined ? raw.stop | 0 : total;
  const cols = Array.isArray(raw.col) ? raw.col : [];
  const col = [0, 1, 2].map((i) => (cols[i] !== undefined ? parseColorWithWhite(cols[i]) : DEFAULT_COLORS[i]));
  return {
    id: raw.id,
    n: raw.n || '',
    start,
    stop,
    len: stop - start,
    grp: Math.max(1, raw.grp | 0 || 1),
    spc: raw.spc | 0,
    of: raw.of | 0,
    on: raw.on !== false && raw.on !== 0,
    bri: raw.bri !== undefined ? raw.bri | 0 : 255,
    col,
    fx: raw.fx | 0,
    sx: raw.sx !== undefined ? raw.sx | 0 : 128,
    ix: raw.ix !== undefined ? raw.ix | 0 : 128,
    pal: raw.pal | 0,
    rev: !!raw.rev,
    mi: !!raw.mi,
  };
}

export function parsePresets(data, total = 0) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('presets.json is not a JSON object keyed by preset id');
  const presets = [];
  for (const [id, p] of Object.entries(data)) {
    if (id === '0' || !p || typeof p !== 'object' || !Object.keys(p).length) continue;
    let segRaw = p.seg;
    if (segRaw && !Array.isArray(segRaw)) segRaw = [segRaw];
    const segs = (segRaw || []).map((s) => normaliseSeg(s, total)).filter((s) => s.len > 0);
    const preset = {
      id: String(id),
      name: p.n || `Preset ${id}`,
      bri: p.bri !== undefined ? p.bri | 0 : 128,
      on: p.on !== false && p.on !== 0,
      segs,
      playlist: null,
    };
    if (p.playlist && Array.isArray(p.playlist.ps)) {
      const ps = p.playlist.ps;
      const dur = Array.isArray(p.playlist.dur) ? p.playlist.dur : [p.playlist.dur ?? 30];
      preset.playlist = {
        items: ps.map((pid, i) => ({ id: String(pid), dur: (dur[i] ?? dur[dur.length - 1] ?? 30) / 10 })),
        repeat: p.playlist.repeat | 0,
      };
    }
    presets.push(preset);
  }
  presets.sort((a, b) => Number(a.id) - Number(b.id));
  return presets;
}

// Longest LED index referenced by the presets (used when no cfg.json was supplied)
export function inferTotal(presets) {
  return presets.reduce((m, p) => p.segs.reduce((mm, s) => Math.max(mm, s.stop), m), 0);
}
