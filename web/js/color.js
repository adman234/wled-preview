// Small colour helpers. Colours are [r,g,b] arrays (0-255).
export const clamp = (v, lo = 0, hi = 255) => (v < lo ? lo : v > hi ? hi : v);

export function blend(a, b, amt) {
  // amt 0 -> a, 1 -> b
  const t = clamp(amt, 0, 1);
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export function scale(c, f) {
  return [c[0] * f, c[1] * f, c[2] * f];
}

export function hsv(h, s, v) {
  // h 0-255, s 0-1, v 0-1
  const hh = ((h % 256) + 256) % 256 / 255 * 6;
  const i = Math.floor(hh) % 6;
  const f = hh - Math.floor(hh);
  const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
  const [r, g, b] = [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i];
  return [r * 255, g * 255, b * 255];
}

// WLED-style colour wheel: 0-255 -> fully saturated rainbow.
export function wheel(pos) {
  return hsv(pos, 1, 1);
}

export function parseColor(v) {
  if (Array.isArray(v)) return [v[0] | 0, v[1] | 0, v[2] | 0]; // RGBW: white channel folded in by caller
  if (typeof v === 'string') {
    const h = v.replace('#', '');
    if (/^[0-9a-f]{6}/i.test(h)) return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  if (typeof v === 'number') return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  return [0, 0, 0];
}

export function parseColorWithWhite(v) {
  const c = parseColor(v);
  if (Array.isArray(v) && v.length >= 4 && v[3] > 0) {
    // Approximate the white channel as neutral white added to RGB
    return [clamp(c[0] + v[3]), clamp(c[1] + v[3]), clamp(c[2] + v[3])];
  }
  return c;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
