// Copy / import / export helpers for raw presets.json data.
const PRESET_KEYS = ['seg', 'playlist', 'n', 'ps', 'on', 'bri', 'win'];
const looksLikePreset = (o) => o && typeof o === 'object' && !Array.isArray(o) && PRESET_KEYS.some((k) => k in o);

// Text placed on the clipboard for a preset: the bare preset object, as WLED stores it.
export const presetToText = (raw) => JSON.stringify(raw, null, 2);

// Accepts: a bare preset object, {"<id>": {...}, ...}, or a pasted fragment like "5":{...}.
// Returns an array of preset objects (ids are dropped; new ones are assigned on import).
export function parseImport(text) {
  const src = String(text).trim();
  if (!src) throw new Error('Nothing to import – paste a preset first.');
  let json;
  try { json = JSON.parse(src); } catch (e) {
    try { json = JSON.parse(`{${src.replace(/,\s*$/, '')}}`); } catch { throw new Error(`That isn't valid JSON (${e.message}).`); }
  }
  if (!json || typeof json !== 'object' || Array.isArray(json)) throw new Error('Expected a JSON object describing a preset.');
  if (looksLikePreset(json)) return [json];
  const vals = Object.entries(json).filter(([id]) => id !== '0').map(([, v]) => v);
  if (!vals.length || !vals.every(looksLikePreset)) throw new Error('This doesn\'t look like a WLED preset (expected "seg", "playlist" or "n").');
  return vals;
}

// Smallest unused preset id in WLED's 1..250 range.
export function nextId(keys) {
  const used = new Set(Array.from(keys, String));
  for (let i = 1; i <= 250; i++) if (!used.has(String(i))) return String(i);
  throw new Error('All 250 preset slots are in use.');
}

export const exportText = (raw) => JSON.stringify(raw);
