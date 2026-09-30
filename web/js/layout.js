// Maps LED indices to 2D positions for matrix setups (cfg.json hw.led.matrix.panels).
export function matrixXY(matrix, idx) {
  let base = 0;
  for (const p of matrix.panels) {
    const n = p.w * p.h;
    if (idx < base + n) {
      const k = idx - base;
      let col, row;
      if (!p.v) {
        row = Math.floor(k / p.w); col = k % p.w;
        if (p.s && row % 2) col = p.w - 1 - col;
      } else {
        col = Math.floor(k / p.h); row = k % p.h;
        if (p.s && col % 2) row = p.h - 1 - row;
      }
      if (p.r) col = p.w - 1 - col;
      if (p.b) row = p.h - 1 - row;
      return [p.x + col, p.y + row];
    }
    base += n;
  }
  return null;
}
