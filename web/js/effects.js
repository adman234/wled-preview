// Ports of the WLED 0.15.5 effects (wled00/FX.cpp) for 1D segments.
// Each effect is run(S) -> delay in ms, where S is a Segment from wled.js.
// The C code works on unsigned integers, so the ports use >>> 0, Math.imul and Math.trunc
// to keep the same wrap-around and integer division.
import {
  getStrip, random16, random8, scale8, scale8_video, qadd8, qsub8, triwave8, ease8InOutCubic, cubicwave8, quadwave8,
  sin16_t, cos16_t, sin8_t, cos8_t, sin_gap, triwave16, map, beat88, beat16, beat8, beatsin88_t, beatsin16_t, beatsin8_t,
  inoise16, inoise8, RGB, R, G, B, BLACK, WHITE, color_blend, color_add, color_fade, hsv2rgb_rainbow, getAverageLight,
  nscale8_video, nscale8, ColorFromPalette, palGradient, get_random_wheel_index,
} from './wled.js';
import { FX_NAMES } from './fxnames.js';

const FRAMETIME = 23;
const PALETTE_SOLID_WRAP = false;
const ULTRAWHITE = WHITE;
const mul = (a, b) => Math.imul(a, b) >>> 0; // uint32 multiply
const div = (a, b) => Math.trunc(a / b);     // C integer division
const now = () => getStrip().now >>> 0;
const SPEED_FORMULA_L = (S) => 5 + div(50 * (255 - S.speed), S.len);

const FX = {};

// ---------------------------------------------------------------- 0–12
function mode_static(S) { S.fill(S.SEGCOLOR(0)); return 350; }
FX[0] = mode_static;

function blink(S, color1, color2, strobe, do_palette) {
  let cycleTime = (255 - S.speed) * 20;
  let onTime = FRAMETIME;
  if (!strobe) onTime += (cycleTime * S.intensity) >> 8;
  cycleTime += FRAMETIME * 2;
  const it = div(now(), cycleTime), rem = now() % cycleTime;
  const on = it !== S.step || rem <= onTime;
  S.step = it;
  const color = on ? color1 : color2;
  if (color === color1 && do_palette) {
    for (let i = 0; i < S.len; i++) S.setPixelColor(i, S.color_from_palette(i, true, PALETTE_SOLID_WRAP, 0));
  } else S.fill(color);
  return FRAMETIME;
}
FX[1] = (S) => blink(S, S.SEGCOLOR(0), S.SEGCOLOR(1), false, true);
FX[26] = (S) => blink(S, S.color_wheel(S.call & 255), S.SEGCOLOR(1), false, false);
FX[23] = (S) => blink(S, S.SEGCOLOR(0), S.SEGCOLOR(1), true, true);
FX[24] = (S) => blink(S, S.color_wheel(S.call & 255), S.SEGCOLOR(1), true, false);

FX[2] = (S) => { // Breathe
  let v = 0;
  let counter = mul(now(), (S.speed >> 3) + 10) & 0xffff;
  counter = (counter >> 2) + (counter >> 4);
  if (counter < 16384) {
    if (counter > 8192) counter = 8192 - (counter - 8192);
    v = div(sin16_t(counter), 103);
  }
  const lum = 30 + v;
  for (let i = 0; i < S.len; i++) S.setPixelColor(i, color_blend(S.SEGCOLOR(1), S.color_from_palette(i, true, PALETTE_SOLID_WRAP, 0), lum));
  return FRAMETIME;
};

function color_wipe(S, rev, useRandomColors) {
  if (S.len === 1) return mode_static(S);
  const cycleTime = 750 + (255 - S.speed) * 150;
  const perc = now() % cycleTime;
  let prog = div(perc * 65535, cycleTime);
  const back = prog > 32767;
  if (back) { prog -= 32767; if (S.step === 0) S.step = 1; } else if (S.step === 2) S.step = 3;
  if (useRandomColors) {
    if (S.call === 0) { S.aux0 = random8(); S.step = 3; }
    if (S.step === 1) { S.aux1 = get_random_wheel_index(S.aux0); S.step = 2; }
    if (S.step === 3) { S.aux0 = get_random_wheel_index(S.aux1); S.step = 0; }
  }
  const ledIndex = (prog * S.len) >>> 15;
  let rem = ((prog * S.len) * 2) & 0xffff;
  rem = div(rem, S.intensity + 1);
  if (rem > 255) rem = 255;
  const col1 = useRandomColors ? S.color_wheel(S.aux1) : S.SEGCOLOR(1);
  for (let i = 0; i < S.len; i++) {
    const index = rev && back ? S.len - 1 - i : i;
    const col0 = useRandomColors ? S.color_wheel(S.aux0) : S.color_from_palette(index, true, PALETTE_SOLID_WRAP, 0);
    if (i < ledIndex) S.setPixelColor(index, back ? col1 : col0);
    else {
      S.setPixelColor(index, back ? col0 : col1);
      if (i === ledIndex) S.setPixelColor(index, color_blend(back ? col0 : col1, back ? col1 : col0, rem));
    }
  }
  return FRAMETIME;
}
FX[3] = (S) => color_wipe(S, false, false);
FX[6] = (S) => color_wipe(S, true, false);
FX[4] = (S) => color_wipe(S, false, true);
FX[36] = (S) => color_wipe(S, true, true);

FX[5] = (S) => { // Random Colors
  const cycleTime = 200 + (255 - S.speed) * 50;
  const it = div(now(), cycleTime), rem = now() % cycleTime;
  const fadedur = (cycleTime * S.intensity) >> 8;
  let fade = 255;
  if (fadedur) { fade = div(rem * 255, fadedur); if (fade > 255) fade = 255; }
  if (S.call === 0) { S.aux0 = random8(); S.step = 2; }
  if (it !== S.step) { S.aux1 = S.aux0; S.aux0 = get_random_wheel_index(S.aux0); S.step = it; }
  S.fill(color_blend(S.color_wheel(S.aux1), S.color_wheel(S.aux0), fade));
  return FRAMETIME;
};

FX[7] = (S) => { // Dynamic
  S.allocateData(S.len);
  if (S.call === 0) for (let i = 0; i < S.len; i++) S.data[i] = random8();
  const cycleTime = 50 + (255 - S.speed) * 15;
  const it = div(now(), cycleTime);
  if (it !== S.step && S.speed !== 0) {
    for (let i = 0; i < S.len; i++) if (random8() <= S.intensity) S.data[i] = random8();
    S.step = it;
  }
  for (let i = 0; i < S.len; i++) {
    if (S.check1) S.blendPixelColor(i, S.color_wheel(S.data[i]), 16);
    else S.setPixelColor(i, S.color_wheel(S.data[i]));
  }
  return FRAMETIME;
};

FX[8] = (S) => { // Colorloop
  const counter = (mul(now(), (S.speed >> 2) + 2) & 0xffff) >> 8;
  if (S.intensity < 128) S.fill(color_blend(S.color_wheel(counter), WHITE, 128 - S.intensity));
  else S.fill(S.color_wheel(counter));
  return FRAMETIME;
};
FX[9] = (S) => { // Rainbow
  const counter = (mul(now(), (S.speed >> 2) + 2) & 0xffff) >> 8;
  for (let i = 0; i < S.len; i++) {
    const index = (div(i * (16 << div(S.intensity, 29)), S.len) + counter) & 255;
    S.setPixelColor(i, S.color_wheel(index));
  }
  return FRAMETIME;
};

function scan(S, dual) {
  if (S.len === 1) return mode_static(S);
  const cycleTime = 750 + (255 - S.speed) * 150;
  const perc = now() % cycleTime;
  const prog = div(perc * 65535, cycleTime);
  const size = 1 + ((S.intensity * S.len) >> 9);
  const ledIndex = Math.floor((prog * (S.len * 2 - size * 2)) / 65536);
  if (!S.check2) S.fill(S.SEGCOLOR(1));
  const led_offset = Math.abs(ledIndex - (S.len - size));
  if (dual) {
    for (let j = led_offset; j < led_offset + size; j++) {
      const i2 = S.len - 1 - j;
      S.setPixelColor(i2, S.color_from_palette(i2, true, PALETTE_SOLID_WRAP, S.SEGCOLOR(2) ? 2 : 0));
    }
  }
  for (let j = led_offset; j < led_offset + size; j++) S.setPixelColor(j, S.color_from_palette(j, true, PALETTE_SOLID_WRAP, 0));
  return FRAMETIME;
}
FX[10] = (S) => scan(S, false);
FX[11] = (S) => scan(S, true);

FX[12] = (S) => { // Fade
  const lum = triwave16(mul(now(), (S.speed >> 3) + 10)) >> 8;
  for (let i = 0; i < S.len; i++) S.setPixelColor(i, color_blend(S.SEGCOLOR(1), S.color_from_palette(i, true, PALETTE_SOLID_WRAP, 0), lum));
  return FRAMETIME;
};

// ---------------------------------------------------------------- 13–33, 37, 52
function running(S, color1, color2, theatre = false) {
  const width = (theatre ? 3 : 1) + (S.intensity >> 4);
  const cycleTime = 50 + (255 - S.speed);
  const it = div(now(), cycleTime);
  const usePalette = color1 === S.SEGCOLOR(0);
  for (let i = 0; i < S.len; i++) {
    let col = color2;
    if (usePalette) color1 = S.color_from_palette(i, true, PALETTE_SOLID_WRAP, 0);
    if (theatre) {
      if (i % width === S.aux0) col = color1;
    } else {
      const pos = i % (width << 1);
      if (pos < S.aux0 - width || (pos >= S.aux0 && pos < S.aux0 + width)) col = color1;
    }
    S.setPixelColor(i, col);
  }
  if (it !== S.step) { S.aux0 = (S.aux0 + 1) % (theatre ? width : width << 1); S.step = it; }
  return FRAMETIME;
}
FX[13] = (S) => running(S, S.SEGCOLOR(0), S.SEGCOLOR(1), true);
FX[14] = (S) => running(S, S.color_wheel(S.step & 255), S.SEGCOLOR(1), true);
FX[37] = (S) => running(S, S.SEGCOLOR(0), S.SEGCOLOR(1));

function running_base(S, saw, dual = false) {
  const x_scale = S.intensity >> 2;
  const counter = mul(now(), S.speed) >>> 9;
  for (let i = 0; i < S.len; i++) {
    let a = (i * x_scale - counter) >>> 0;
    if (saw) {
      a &= 255;
      a = a < 16 ? 192 + a * 8 : map(a, 16, 255, 64, 192);
      a = 255 - a;
    }
    const s = dual ? sin_gap(a & 0xffff) : sin8_t(a & 255);
    let ca = color_blend(S.SEGCOLOR(1), S.color_from_palette(i, true, PALETTE_SOLID_WRAP, 0), s);
    if (dual) {
      const b = ((S.len - 1 - i) * x_scale - counter) >>> 0;
      const t = sin_gap(b & 0xffff);
      const cb = color_blend(S.SEGCOLOR(1), S.color_from_palette(i, true, PALETTE_SOLID_WRAP, 2), t);
      ca = color_blend(ca, cb, 127);
    }
    S.setPixelColor(i, ca);
  }
  return FRAMETIME;
}
FX[15] = (S) => running_base(S, false);
FX[16] = (S) => running_base(S, true);
FX[52] = (S) => running_base(S, false, true);

FX[17] = (S) => { // Twinkle
  S.fade_out(224);
  const cycleTime = 20 + (255 - S.speed) * 5;
  const it = div(now(), cycleTime);
  if (it !== S.step) {
    const maxOn = map(S.intensity, 0, 255, 1, S.len);
    if (S.aux0 >= maxOn) { S.aux0 = 0; S.aux1 = random16(); }
    S.aux0++;
    S.step = it;
  }
  let PRNG16 = S.aux1;
  for (let i = 0; i < S.aux0; i++) {
    PRNG16 = ((PRNG16 * 2053) + 13849) & 0xffff;
    const j = Math.floor((S.len * PRNG16) / 65536);
    S.setPixelColor(j, S.color_from_palette(j, true, PALETTE_SOLID_WRAP, 0));
  }
  return FRAMETIME;
};

function dissolve(S, color) {
  if (!S.state || S.call === 0) { S.state = new Array(S.len).fill(S.SEGCOLOR(1)); S.aux0 = 1; }
  const pixels = S.state;
  for (let j = 0; j <= div(S.len, 15); j++) {
    if (random8() <= S.intensity) {
      for (let times = 0; times < 10; times++) {
        const i = random16(S.len);
        if (S.aux0) {
          if (pixels[i] === S.SEGCOLOR(1)) {
            pixels[i] = color === S.SEGCOLOR(0) ? S.color_from_palette(i, true, PALETTE_SOLID_WRAP, 0) : color;
            break;
          }
        } else if (pixels[i] !== S.SEGCOLOR(1)) { pixels[i] = S.SEGCOLOR(1); break; }
      }
    }
  }
  for (let i = 0; i < S.len; i++) S.setPixelColor(i, pixels[i]);
  if (S.step > (255 - S.speed) + 15) { S.aux0 = S.aux0 ? 0 : 1; S.step = 0; } else S.step++;
  return FRAMETIME;
}
FX[18] = (S) => dissolve(S, S.check1 ? S.color_wheel(random8()) : S.SEGCOLOR(0));
FX[19] = (S) => dissolve(S, S.color_wheel(random8()));

FX[20] = (S) => { // Sparkle
  if (!S.check2) for (let i = 0; i < S.len; i++) S.setPixelColor(i, S.color_from_palette(i, true, PALETTE_SOLID_WRAP, 1));
  const cycleTime = 10 + (255 - S.speed) * 2;
  const it = div(now(), cycleTime);
  if (it !== S.step) { S.aux0 = random16(S.len); S.step = it; }
  S.setPixelColor(S.aux0, S.SEGCOLOR(0));
  return FRAMETIME;
};
function flash_sparkle(S, hyper) {
  if (!S.check2) for (let i = 0; i < S.len; i++) S.setPixelColor(i, S.color_from_palette(i, true, PALETTE_SOLID_WRAP, 0));
  if (((now() - S.aux0) >>> 0) > S.step) {
    if (random8((255 - S.intensity) >> 4) === 0) {
      const n = hyper ? Math.max(1, div(S.len, 3)) : 1;
      for (let i = 0; i < n; i++) S.setPixelColor(random16(S.len), S.SEGCOLOR(1));
    }
    S.step = now();
    S.aux0 = 255 - S.speed;
  }
  return FRAMETIME;
}
FX[21] = (S) => flash_sparkle(S, false);
FX[22] = (S) => flash_sparkle(S, true);

FX[25] = (S) => { // Strobe Mega
  for (let i = 0; i < S.len; i++) S.setPixelColor(i, S.color_from_palette(i, true, PALETTE_SOLID_WRAP, 1));
  S.aux0 = 50 + 20 * (255 - S.speed);
  const count = 2 * (div(S.intensity, 10) + 1);
  if (S.aux1 < count) {
    if ((S.aux1 & 1) === 0) { S.fill(S.SEGCOLOR(0)); S.aux0 = 15; } else S.aux0 = 50;
  }
  if (((now() - S.aux0) >>> 0) > S.step) {
    S.aux1++;
    if (S.aux1 > count) S.aux1 = 0;
    S.step = now();
  }
  return FRAMETIME;
};

FX[27] = (S) => { // Android
  for (let i = 0; i < S.len; i++) S.setPixelColor(i, S.color_from_palette(i, true, PALETTE_SOLID_WRAP, 1));
  if (S.aux1 > div(S.intensity * S.len, 255)) S.aux0 = 1;
  else if (S.aux1 < 2) S.aux0 = 0;
  let a = S.step & 0xffff;
  if (S.aux0 === 0) {
    if (S.call % 3 === 1) a++; else S.aux1++;
  } else {
    a++;
    if (S.call % 3 !== 1) S.aux1 = (S.aux1 - 1) & 0xffff;
  }
  if (a >= S.len) a = 0;
  if (a + S.aux1 < S.len) {
    for (let i = a; i < a + S.aux1; i++) S.setPixelColor(i, S.SEGCOLOR(0));
  } else {
    for (let i = a; i < S.len; i++) S.setPixelColor(i, S.SEGCOLOR(0));
    for (let i = 0; i < S.aux1 - (S.len - a); i++) S.setPixelColor(i, S.SEGCOLOR(0));
  }
  S.step = a;
  return 3 + div(8 * (255 - S.speed), S.len);
};

function chase(S, color1, color2, color3, do_palette) {
  const counter = mul(now(), (S.speed >> 2) + 1) & 0xffff;
  const a = ((counter * S.len) >>> 16) & 0xffff;
  const chase_random = S.mode === 29;
  if (chase_random) {
    if (a < S.step) { S.aux1 = S.aux0; S.aux0 = get_random_wheel_index(S.aux0); }
    color1 = S.color_wheel(S.aux0);
  }
  S.step = a;
  const size = 1 + ((S.intensity * S.len) >> 10);
  let b = (a + size) & 0xffff; if (b > S.len) b -= S.len;
  let c = (b + size) & 0xffff; if (c > S.len) c -= S.len;
  if (do_palette) for (let i = 0; i < S.len; i++) S.setPixelColor(i, S.color_from_palette(i, true, PALETTE_SOLID_WRAP, 1));
  else S.fill(color1);
  if (chase_random) {
    color1 = S.color_wheel(S.aux1);
    for (let i = a; i < S.len; i++) S.setPixelColor(i, color1);
  }
  if (a < b) for (let i = a; i < b; i++) S.setPixelColor(i, color2);
  else {
    for (let i = a; i < S.len; i++) S.setPixelColor(i, color2);
    for (let i = 0; i < b; i++) S.setPixelColor(i, color2);
  }
  if (b < c) for (let i = b; i < c; i++) S.setPixelColor(i, color3);
  else {
    for (let i = b; i < S.len; i++) S.setPixelColor(i, color3);
    for (let i = 0; i < c; i++) S.setPixelColor(i, color3);
  }
  return FRAMETIME;
}
FX[28] = (S) => chase(S, S.SEGCOLOR(1), S.SEGCOLOR(2) ? S.SEGCOLOR(2) : S.SEGCOLOR(0), S.SEGCOLOR(0), true);
FX[29] = (S) => chase(S, S.SEGCOLOR(1), S.SEGCOLOR(2) ? S.SEGCOLOR(2) : S.SEGCOLOR(0), S.SEGCOLOR(0), false);
FX[30] = (S) => { // Rainbow Runner
  const color_sep = Math.max(1, div(256, S.len));
  const color = S.color_wheel((S.step * color_sep + (S.call & 255)) & 255);
  return chase(S, color, S.SEGCOLOR(0), S.SEGCOLOR(1), false);
};
FX[33] = (S) => { // Chase Rainbow
  const n = S.step & 0xffff, m = (S.step + 1) % S.len;
  const color2 = S.color_wheel((div(n * 256, S.len) + (S.call & 255)) & 255);
  const color3 = S.color_wheel((div(m * 256, S.len) + (S.call & 255)) & 255);
  return chase(S, S.SEGCOLOR(0), color2, color3, false);
};

// ---------------------------------------------------------------- 31–62
const FLASH_COUNT = 4;
FX[31] = (S) => { // Twinkle → "Chase Flash"
  if (S.len === 1) return mode_static(S);
  const flash_step = S.call % (FLASH_COUNT * 2 + 1);
  for (let i = 0; i < S.len; i++) S.setPixelColor(i, S.color_from_palette(i, true, PALETTE_SOLID_WRAP, 0));
  let delay = 10 + div(30 * (255 - S.speed), S.len);
  if (flash_step < FLASH_COUNT * 2) {
    if (flash_step % 2 === 0) {
      const n = S.step, m = (S.step + 1) % S.len;
      S.setPixelColor(n, S.SEGCOLOR(1)); S.setPixelColor(m, S.SEGCOLOR(1));
      delay = 20;
    } else delay = 30;
  } else S.step = (S.step + 1) % S.len;
  return delay;
};
FX[32] = (S) => { // Chase Flash Rnd
  if (S.len === 1) return mode_static(S);
  const flash_step = S.call % (FLASH_COUNT * 2 + 1);
  for (let i = 0; i < S.aux1; i++) S.setPixelColor(i, S.color_wheel(S.aux0));
  let delay = 1 + div(10 * (255 - S.speed), S.len);
  if (flash_step < FLASH_COUNT * 2) {
    const n = S.aux1, m = (S.aux1 + 1) % S.len;
    if (flash_step % 2 === 0) {
      S.setPixelColor(n, S.SEGCOLOR(0)); S.setPixelColor(m, S.SEGCOLOR(0));
      delay = 20;
    } else {
      S.setPixelColor(n, S.color_wheel(S.aux0)); S.setPixelColor(m, S.SEGCOLOR(1));
      delay = 30;
    }
  } else {
    S.aux1 = (S.aux1 + 1) % S.len;
    if (S.aux1 === 0) S.aux0 = get_random_wheel_index(S.aux0);
  }
  return delay;
};

FX[34] = (S) => { // Colorful
  let numColors = 4;
  const cols = [0xff0000, 0xeebb00, 0x00ee00, 0x0077cc, 0, 0, 0, 0, 0];
  if (S.intensity > 160 || S.palette) {
    if (!S.palette) {
      numColors = 3;
      for (let i = 0; i < 3; i++) cols[i] = S.SEGCOLOR(i);
    } else {
      let fac = 80;
      if (S.palette === 52) { numColors = 5; fac = 61; }
      for (let i = 0; i < numColors; i++) cols[i] = S.color_from_palette(i * fac, false, true, 255);
    }
  } else if (S.intensity < 80) {
    cols[0] = 0xff8040; cols[1] = 0xe5d241; cols[2] = 0x77ff77; cols[3] = 0x77f0f0;
  }
  for (let i = numColors; i < numColors * 2 - 1; i++) cols[i] = cols[i - numColors];
  const cycleTime = 50 + 8 * (255 - S.speed);
  const it = div(now(), cycleTime);
  if (it !== S.step) {
    if (S.speed > 0) S.aux0++;
    if (S.aux0 >= numColors) S.aux0 = 0;
    S.step = it;
  }
  for (let i = 0; i < S.len; i += numColors) for (let j = 0; j < numColors; j++) S.setPixelColor(i + j, cols[S.aux0 + j]);
  return FRAMETIME;
};

FX[35] = (S) => { // Traffic Light
  if (S.len === 1) return mode_static(S);
  for (let i = 0; i < S.len; i++) S.setPixelColor(i, S.color_from_palette(i, true, PALETTE_SOLID_WRAP, 1));
  let mdelay = 500;
  for (let i = 0; i < S.len - 2; i += 3) {
    switch (S.aux0) {
      case 0: S.setPixelColor(i, 0xff0000); mdelay = 150 + 100 * (255 - S.speed); break;
      case 1: S.setPixelColor(i, 0xff0000); mdelay = 150 + 20 * (255 - S.speed); S.setPixelColor(i + 1, 0xeecc00); break;
      case 2: S.setPixelColor(i + 2, 0x00ff00); mdelay = 150 + 100 * (255 - S.speed); break;
      case 3: S.setPixelColor(i + 1, 0xeecc00); mdelay = 150 + 20 * (255 - S.speed); break;
    }
  }
  if (((now() - S.step) >>> 0) > mdelay) {
    S.aux0++;
    if (S.aux0 === 1 && S.intensity > 140) S.aux0 = 2;
    if (S.aux0 > 3) S.aux0 = 0;
    S.step = now();
  }
  return FRAMETIME;
};

FX[39] = (S) => { // Stream
  const cycleTime = 25 + 3 * (255 - S.speed);
  const it = div(now(), cycleTime);
  if (S.call === 0) S.aux0 = random16();
  const zoneSize = ((255 - S.intensity) >> 4) + 1;
  let PRNG16 = S.aux0;
  let z = it % zoneSize;
  let nzone = !z && it !== S.aux1;
  for (let i = S.len - 1; i >= 0; i--) {
    if (nzone || z >= zoneSize) {
      const lastrand = PRNG16 >> 8;
      let diff = 0;
      while (Math.abs(diff) < 42) {
        PRNG16 = ((PRNG16 * 2053) + 13849) & 0xffff;
        diff = (PRNG16 >> 8) - lastrand;
      }
      if (nzone) { S.aux0 = PRNG16; nzone = false; }
      z = 0;
    }
    S.setPixelColor(i, S.color_wheel(PRNG16 >> 8));
    z++;
  }
  S.aux1 = it & 0xffff;
  return FRAMETIME;
};

function larson_scanner(S) {
  if (S.len === 1) return mode_static(S);
  const speed = FRAMETIME * map(S.speed, 0, 255, 96, 2);
  const pixels = div(S.len, speed);
  S.fade_out(255 - S.intensity);
  if (S.step > now()) return FRAMETIME;
  let index = S.aux1 + pixels;
  if (pixels === 0) {
    const frames = div(speed, S.len);
    if (S.step++ < frames) return FRAMETIME;
    S.step = 0;
    index++;
  }
  if (index > S.len) {
    S.aux0 = S.aux0 ? 0 : 1;
    S.aux1 = 0;
    S.step = S.aux0 || S.check2 ? now() + S.custom1 * 25 : 0;
  } else {
    for (let i = S.aux1; i < index; i++) {
      const j = S.aux0 ? i : S.len - 1 - i;
      const c = S.color_from_palette(j, true, PALETTE_SOLID_WRAP, 0);
      S.setPixelColor(j, c);
      if (S.check1) S.setPixelColor(S.len - 1 - j, S.SEGCOLOR(2) ? S.SEGCOLOR(2) : c);
    }
    S.aux1 = index;
  }
  return FRAMETIME;
}
FX[40] = larson_scanner;
FX[60] = (S) => { S.check1 = true; return larson_scanner(S); };

FX[41] = (S) => { // Lighthouse (comet)
  if (S.len === 1) return mode_static(S);
  const counter = mul(now(), (S.speed >> 2) + 1) & 0xffff;
  const index = (counter * S.len) >>> 16;
  if (S.call === 0) S.aux0 = index;
  S.fade_out(S.intensity);
  S.setPixelColor(index, S.color_from_palette(index, true, PALETTE_SOLID_WRAP, 0));
  if (index > S.aux0) {
    for (let i = S.aux0; i < index; i++) S.setPixelColor(i, S.color_from_palette(i, true, PALETTE_SOLID_WRAP, 0));
  } else if (index < S.aux0 && index < 10) {
    for (let i = 0; i < index; i++) S.setPixelColor(i, S.color_from_palette(i, true, PALETTE_SOLID_WRAP, 0));
  }
  S.aux0 = index;
  return FRAMETIME;
};

function mode_fireworks(S) {
  if (S.len === 1) return mode_static(S);
  const width = S.len, height = 1;
  if (S.call === 0) { S.aux0 = 0xffff; S.aux1 = 0xffff; }
  S.fade_out(128);
  if (!S.step) {
    const valid1 = S.aux0 < width * height, valid2 = S.aux1 < width * height;
    const sv1 = valid1 ? S.getPixelColor(S.aux0) : 0, sv2 = valid2 ? S.getPixelColor(S.aux1) : 0;
    S.blur(16);
    if (valid1) S.setPixelColor(S.aux0, sv1);
    if (valid2) S.setPixelColor(S.aux1, sv2);
  }
  for (let i = 0; i < Math.max(1, div(width, 20)); i++) {
    if (random8(129 - (S.intensity >> 1)) === 0) {
      const index = random16(width * height);
      S.setPixelColor(index, S.color_from_palette(random8(), false, false, 0));
      S.aux1 = S.aux0;
      S.aux0 = index;
    }
  }
  return FRAMETIME;
}
FX[42] = mode_fireworks;
FX[43] = (S) => { // Rain
  if (S.len === 1) return mode_static(S);
  const width = S.len, height = 1;
  S.step += FRAMETIME;
  if (S.call && S.step > SPEED_FORMULA_L(S)) {
    S.step = 1;
    const ctemp = S.getPixelColor(0);
    for (let i = 0; i < S.len - 1; i++) S.setPixelColor(i, S.getPixelColor(i + 1));
    S.setPixelColor(S.len - 1, ctemp);
    S.aux0 = (S.aux0 + 1) & 0xffff;
    S.aux1 = (S.aux1 + 1) & 0xffff;
    if (S.aux0 === 0) S.aux0 = 0xffff;
    if (S.aux1 === 0) S.aux0 = 0xffff; // sic: WLED resets aux0 here
    if (S.aux0 >= width * height) S.aux0 = 0;
    if (S.aux1 >= width * height) S.aux1 = 0;
  }
  return mode_fireworks(S);
};

FX[45] = (S) => { // Fire Flicker
  const cycleTime = 40 + (255 - S.speed);
  const it = div(now(), cycleTime);
  if (S.step === it) return FRAMETIME;
  const c = S.SEGCOLOR(0), r = R(c), g = G(c), b = B(c);
  let lum = S.palette === 0 ? Math.max(r, g, b) : 255;
  lum = div(lum, div(256 - S.intensity, 16) + 1);
  for (let i = 0; i < S.len; i++) {
    const flicker = random8(lum);
    if (S.palette === 0) S.setPixelColor(i, RGB(Math.max(r - flicker, 0), Math.max(g - flicker, 0), Math.max(b - flicker, 0)));
    else S.setPixelColor(i, S.color_from_palette(i, true, PALETTE_SOLID_WRAP, 0, 255 - flicker));
  }
  S.step = it;
  return FRAMETIME;
};

function gradient_base(S, loading) {
  if (S.len === 1) return mode_static(S);
  const counter = mul(now(), (S.speed >> 2) + 1) & 0xffff;
  let pp = ((counter * S.len) >>> 16) & 0xffff;
  if (S.call === 0) pp = 0;
  const brd = div(S.intensity, 2); // WLED: `1 + loading ? ix/2 : ix/4` is always ix/2
  const p1 = pp - S.len, p2 = pp + S.len;
  for (let i = 0; i < S.len; i++) {
    let val = loading ? Math.abs((i > pp ? p2 : pp) - i) : Math.min(Math.abs(pp - i), Math.abs(p1 - i), Math.abs(p2 - i));
    val = brd > val ? div(val * 255, brd) : 255;
    S.setPixelColor(i, color_blend(S.SEGCOLOR(0), S.color_from_palette(i, true, PALETTE_SOLID_WRAP, 1), val));
  }
  return FRAMETIME;
}
FX[46] = (S) => gradient_base(S, false);
FX[47] = (S) => gradient_base(S, true);

function police_base(S, color1, color2) {
  if (S.len === 1) return mode_static(S);
  const delay = 1 + div(FRAMETIME << 3, S.len);
  const it = div(now(), map(S.speed, 0, 255, delay << 4, delay));
  const offset = it % S.len;
  const width = Math.max(1, (S.len * (S.intensity + 1)) >> 9);
  for (let i = 0; i < width; i++) {
    S.setPixelColor((offset + i) % S.len, color1);
    S.setPixelColor((offset + i + (S.len >> 1)) % S.len, color2);
  }
  return FRAMETIME;
}
FX[50] = (S) => { // Two Dots
  if (!S.check2) S.fill(S.SEGCOLOR(2));
  const color2 = S.SEGCOLOR(1) === S.SEGCOLOR(2) ? S.SEGCOLOR(0) : S.SEGCOLOR(1);
  return police_base(S, S.SEGCOLOR(0), color2);
};

FX[54] = (S) => { // Tri Chase
  const color1 = S.SEGCOLOR(2), color2 = S.SEGCOLOR(0);
  const cycleTime = 50 + ((255 - S.speed) << 1);
  const it = div(now(), cycleTime);
  const width = 1 + (S.intensity >> 4);
  let index = it % (width * 3);
  for (let i = 0; i < S.len; i++, index++) {
    if (index > width * 3 - 1) index = 0;
    let color = color1;
    if (index > (width << 1) - 1) color = S.color_from_palette(i, true, PALETTE_SOLID_WRAP, 1);
    else if (index > width - 1) color = color2;
    S.setPixelColor(S.len - i - 1, color);
  }
  return FRAMETIME;
};
FX[55] = (S) => { // Tri Wipe
  const cycleTime = 1000 + (255 - S.speed) * 200;
  const perc = now() % cycleTime;
  const prog = div(perc * 65535, cycleTime);
  const ledIndex = Math.floor((prog * S.len * 3) / 65536);
  let ledOffset = ledIndex;
  for (let i = 0; i < S.len; i++) S.setPixelColor(i, S.color_from_palette(i, true, PALETTE_SOLID_WRAP, 2));
  if (ledIndex < S.len) {
    for (let i = 0; i < S.len; i++) S.setPixelColor(i, i > ledOffset ? S.SEGCOLOR(0) : S.SEGCOLOR(1));
  } else if (ledIndex < S.len * 2) {
    ledOffset = ledIndex - S.len;
    for (let i = ledOffset + 1; i < S.len; i++) S.setPixelColor(i, S.SEGCOLOR(1));
  } else {
    ledOffset = ledIndex - S.len * 2;
    for (let i = 0; i <= ledOffset; i++) S.setPixelColor(i, S.SEGCOLOR(0));
  }
  return FRAMETIME;
};
FX[56] = (S) => { // Tri Fade
  const counter = mul(now(), (S.speed >> 3) + 1) & 0xffff;
  const prog = (counter * 768) >>> 16;
  let color1, color2, stage;
  if (prog < 256) { color1 = S.SEGCOLOR(0); color2 = S.SEGCOLOR(1); stage = 0; }
  else if (prog < 512) { color1 = S.SEGCOLOR(1); color2 = S.SEGCOLOR(2); stage = 1; }
  else { color1 = S.SEGCOLOR(2); color2 = S.SEGCOLOR(0); stage = 2; }
  const stp = prog & 255;
  for (let i = 0; i < S.len; i++) {
    let color;
    if (stage === 2) color = color_blend(S.color_from_palette(i, true, PALETTE_SOLID_WRAP, 2), color2, stp);
    else if (stage === 1) color = color_blend(color1, S.color_from_palette(i, true, PALETTE_SOLID_WRAP, 2), stp);
    else color = color_blend(color1, color2, stp);
    S.setPixelColor(i, color);
  }
  return FRAMETIME;
};

FX[57] = (S) => { // Lightning
  if (S.len === 1) return mode_static(S);
  const ledstart = random16(S.len);
  const ledlen = 1 + random16(S.len - ledstart);
  let bri = div(255, random8(1, 3));
  if (S.aux1 === 0) {
    S.aux1 = random8(4, 4 + div(S.intensity, 20)) * 2;
    bri = 52;
    S.aux0 = 200;
  }
  if (!S.check2) S.fill(S.SEGCOLOR(1));
  if (S.aux1 > 3 && !(S.aux1 & 1)) {
    for (let i = ledstart; i < ledstart + ledlen; i++) S.setPixelColor(i, S.color_from_palette(i, true, PALETTE_SOLID_WRAP, 0, bri));
    S.aux1--;
    S.step = now();
  } else if (((now() - S.step) >>> 0) > S.aux0) {
    S.aux1--;
    if (S.aux1 < 2) S.aux1 = 0;
    S.aux0 = 50 + random8(100);
    if (S.aux1 === 2) S.aux0 = random8(255 - S.speed) * 100;
    S.step = now();
  }
  return FRAMETIME;
};

FX[58] = (S) => { // ICU
  let dest = S.step & 0xffff;
  const space = (S.intensity >> 3) + 2;
  const gap = div(S.len, space);
  if (!S.check2) S.fill(S.SEGCOLOR(1));
  const pindex = map(dest, 0, S.len - gap, 0, 255) & 255;
  const col = S.color_from_palette(pindex, false, false, 0);
  S.setPixelColor(dest, col);
  S.setPixelColor(dest + gap, col);
  if (S.aux0 === dest) {
    if (random8(6) === 0) {
      S.setPixelColor(dest, S.SEGCOLOR(1));
      S.setPixelColor(dest + gap, S.SEGCOLOR(1));
      return 200;
    }
    S.aux0 = random16(S.len - gap);
    return 1000 + random16(2000);
  }
  if (S.aux0 > S.step) { S.step++; dest++; } else if (S.aux0 < S.step) { S.step--; dest--; }
  S.setPixelColor(dest, col);
  S.setPixelColor(dest + gap, col);
  return SPEED_FORMULA_L(S);
};

FX[59] = (S) => { // Multi Comet
  const cycleTime = 10 + (255 - S.speed);
  const it = div(now(), cycleTime);
  if (S.step === it) return FRAMETIME;
  if (!S.state) S.state = new Uint16Array(8);
  S.fade_out(div(S.intensity, 2) + 128);
  const comets = S.state;
  for (let i = 0; i < 8; i++) {
    if (comets[i] < S.len) {
      const index = comets[i];
      if (S.SEGCOLOR(2) !== 0) S.setPixelColor(index, i % 2 ? S.color_from_palette(index, true, PALETTE_SOLID_WRAP, 0) : S.SEGCOLOR(2));
      else S.setPixelColor(index, S.color_from_palette(index, true, PALETTE_SOLID_WRAP, 0));
      comets[i]++;
    } else if (!random16(S.len)) comets[i] = 0;
  }
  S.step = it;
  return FRAMETIME;
};

FX[61] = (S) => { // Stream 2
  if (S.call === 0) { S.step = RGB(random8(), random8(), random8()); S.aux0 = random16(); }
  const strip = getStrip();
  const prevSeed = strip.seed;
  const cycleTime = 25 + 3 * (255 - S.speed);
  const it = div(now(), cycleTime);
  let color = S.step;
  strip.seed = S.aux0 & 0xffff;
  for (let i = S.len - 1; i >= 0; i--) {
    const r = random8(6) !== 0 ? R(color) : random8();
    const g = random8(6) !== 0 ? G(color) : random8();
    const b = random8(6) !== 0 ? B(color) : random8();
    color = RGB(r, g, b);
    S.setPixelColor(i, color);
    if (i === S.len - 1 && S.aux1 !== (it & 0xffff)) { S.step = color; S.aux0 = strip.seed; }
  }
  S.aux1 = it & 0xffff;
  strip.seed = prevSeed;
  return FRAMETIME;
};

FX[62] = (S) => { // Oscillate
  if (S.call === 0 || !S.state) {
    const sz = div(S.len, 8) & 255;
    S.state = [
      { pos: div(S.len, 4) & 0xffff, size: sz, dir: 1, speed: 1 },
      { pos: (div(S.len, 4) * 3) & 0xffff, size: sz, dir: 1, speed: 2 },
      { pos: (div(S.len, 4) * 2) & 0xffff, size: sz, dir: -1, speed: 1 },
    ];
  }
  const osc = S.state;
  const cycleTime = 20 + 2 * (255 - S.speed);
  const it = div(now(), cycleTime);
  for (const o of osc) {
    if (it !== S.step) o.pos = (o.pos + o.dir * o.speed) & 0xffff;
    o.size = div(S.len, 3 + div(S.intensity, 8)) & 255;
    if (o.dir === -1 && o.pos > S.len << 1) { o.pos = 0; o.dir = 1; o.speed = S.speed > 100 ? random8(2, 4) : random8(1, 3); }
    if (o.dir === 1 && o.pos >= S.len - 1) { o.pos = S.len - 1; o.dir = -1; o.speed = S.speed > 100 ? random8(2, 4) : random8(1, 3); }
  }
  for (let i = 0; i < S.len; i++) {
    let color = BLACK;
    for (let j = 0; j < 3; j++) {
      if (i >= osc[j].pos - osc[j].size && i <= osc[j].pos + osc[j].size) {
        color = color === BLACK ? S.SEGCOLOR(j) : color_blend(color, S.SEGCOLOR(j), 128);
      }
    }
    S.setPixelColor(i, color);
  }
  S.step = it;
  return FRAMETIME;
};

// ---------------------------------------------------------------- 63–73
// CRGB |= CRGB: per-channel max
const rgbMax = (a, b) => RGB(Math.max(R(a), R(b)), Math.max(G(a), G(b)), Math.max(B(a), B(b)));

FX[63] = (S) => { // Pride 2015
  const duration = 10 + S.speed;
  let sPseudotime = S.step >>> 0;
  let sHue16 = S.aux0;
  const sat8 = beatsin88_t(87, 220, 250) & 255;
  const brightdepth = beatsin88_t(341, 96, 224) & 255;
  const brightnessthetainc16 = beatsin88_t(203, 25 * 256, 40 * 256);
  const msmultiplier = beatsin88_t(147, 23, 60);
  let hue16 = sHue16;
  const hueinc16 = beatsin88_t(113, 1, 3000);
  sPseudotime = (sPseudotime + duration * msmultiplier) >>> 0;
  sHue16 = (sHue16 + duration * beatsin88_t(400, 5, 9)) >>> 0;
  let brightnesstheta16 = sPseudotime;
  for (let i = 0; i < S.len; i++) {
    hue16 = (hue16 + hueinc16) >>> 0;
    const hue8 = (hue16 >>> 8) & 255;
    brightnesstheta16 = (brightnesstheta16 + brightnessthetainc16) >>> 0;
    const b16 = sin16_t(brightnesstheta16 & 0xffff) + 32768;
    const bri16 = Math.floor((b16 * b16) / 65536);
    let bri8 = Math.floor((bri16 * brightdepth) / 65536) & 255;
    bri8 = (bri8 + (255 - brightdepth)) & 255;
    S.blendPixelColor(i, hsv2rgb_rainbow(hue8, sat8, bri8), 64);
  }
  S.step = sPseudotime;
  S.aux0 = sHue16 & 0xffff;
  return FRAMETIME;
};

FX[64] = (S) => { // Juggle
  if (S.len === 1) return mode_static(S);
  S.fadeToBlackBy(192 - div(3 * S.intensity, 4));
  let dothue = 0;
  for (let i = 0; i < 8; i++) {
    const index = beatsin88_t(((16 + S.speed) * (i + 7)) & 0xffff, 0, S.len - 1);
    const add = S.palette === 0 ? hsv2rgb_rainbow(dothue, 220, 255) : ColorFromPalette(S.curPal, dothue, 255);
    S.setPixelColor(index, rgbMax(S.getPixelColor(index), add));
    dothue = (dothue + 32) & 255;
  }
  return FRAMETIME;
};

FX[65] = (S) => { // Palette (float path, as on ESP32)
  const strip = getStrip();
  const cols = S.len;
  const rows = strip.segCount || 1; // 1D: one row per active segment
  const theta = !S.check2
    ? (S.custom1 + 128) * (Math.PI / 256)
    : (mul(now(), (S.custom1 >> 4) + 1) & 0xffff) * (2 * Math.PI / 0xffff);
  const sinTheta = Math.sin(theta), cosTheta = Math.cos(theta);
  const maxX = Math.max(1, cols - 1), maxY = Math.max(1, rows - 1);
  const sq = S.check3;
  const maxXIn = sq ? maxX : 1, maxYIn = sq ? maxY : 1;
  const maxXOut = !sq ? maxX : 1, maxYOut = !sq ? maxY : 1;
  const centerX = maxXOut / 2, centerY = maxYOut / 2;
  const scale = Math.abs(sinTheta) + (Math.abs(cosTheta) * maxYOut / maxXOut);
  const y = S.segIdx || 0;
  const ytCosTheta = (cosTheta * (y - centerY * maxYIn)) / (maxYIn * scale);
  const paletteOffset = !S.check1 ? S.speed : (mul(now(), (S.speed >> 3) + 1) & 0xffff) >> 8;
  for (let x = 0; x < cols; x++) {
    const xtSinTheta = (sinTheta * (x - centerX * maxXIn)) / (maxXIn * scale);
    const sourceX = xtSinTheta + ytCosTheta + centerX;
    let colorIndex = Math.trunc((Math.min(Math.max(sourceX, 0), maxXOut) * 255) / maxXOut);
    if (S.intensity <= 128) colorIndex = div(colorIndex * S.intensity, 128);
    else colorIndex = div((S.intensity - 112) * colorIndex, 16);
    colorIndex -= paletteOffset;
    S.setPixelColor(x, S.color_wheel(colorIndex & 255));
  }
  return FRAMETIME;
};

FX[66] = (S) => { // Fire 2012
  if (S.len === 1) return mode_static(S);
  S.allocateData(S.len);
  const heat = S.data;
  const it = now() >>> 5;
  const ignition = Math.max(3, div(S.len, 10)) & 255;
  for (let i = 0; i < S.len; i++) {
    const cool = it !== S.step ? random8((div((20 + div(S.speed, 3)) * 16, S.len) + 2) & 255) : random8(4);
    const minTemp = i < ignition ? (div(ignition - i, 4) + 16) & 255 : 0;
    const temp = qsub8(heat[i], cool);
    heat[i] = temp < minTemp ? minTemp : temp;
  }
  if (it !== S.step) {
    for (let k = S.len - 1; k > 1; k--) heat[k] = div(heat[k - 1] + (heat[k - 2] << 1), 3);
    if (random8() <= S.intensity) {
      const y = random8(ignition);
      const boost = div((17 + S.custom3) * (ignition - (y >> 1)), ignition) & 255;
      heat[y] = qadd8(heat[y], random8((96 + 2 * boost) & 255, (207 + boost) & 255));
    }
  }
  for (let j = 0; j < S.len; j++) S.setPixelColor(j, ColorFromPalette(S.curPal, Math.min(heat[j], 240), 255, false));
  if (it !== S.step) S.step = it;
  return FRAMETIME;
};

FX[67] = (S) => { // Colorwaves
  const duration = 10 + S.speed;
  let sPseudotime = S.step >>> 0;
  let sHue16 = S.aux0;
  const brightdepth = beatsin88_t(341, 96, 224);
  const brightnessthetainc16 = beatsin88_t(203, 25 * 256, 40 * 256);
  const msmultiplier = beatsin88_t(147, 23, 60);
  let hue16 = sHue16;
  const hueinc16 = div(beatsin88_t(113, 60, 300) * S.intensity * 10, 255);
  sPseudotime = (sPseudotime + duration * msmultiplier) >>> 0;
  sHue16 = (sHue16 + duration * beatsin88_t(400, 5, 9)) >>> 0;
  let brightnesstheta16 = sPseudotime;
  for (let i = 0; i < S.len; i++) {
    hue16 = (hue16 + hueinc16) >>> 0;
    const h16_128 = hue16 >>> 7;
    const hue8 = (h16_128 & 0x100 ? 255 - (h16_128 >>> 1) : h16_128 >>> 1) & 255;
    brightnesstheta16 = (brightnesstheta16 + brightnessthetainc16) >>> 0;
    const b16 = sin16_t(brightnesstheta16 & 0xffff) + 32768;
    const bri16 = Math.floor((b16 * b16) / 65536);
    let bri8 = Math.floor((bri16 * brightdepth) / 65536) & 255;
    bri8 = (bri8 + (255 - brightdepth)) & 255;
    S.blendPixelColor(i, S.color_from_palette(hue8, false, PALETTE_SOLID_WRAP, 0, bri8), 128);
  }
  S.step = sPseudotime;
  S.aux0 = sHue16 & 0xffff;
  return FRAMETIME;
};

FX[68] = (S) => { // BPM
  const stp = div(now(), 20) & 255;
  const beat = beatsin8_t(S.speed, 64, 255);
  for (let i = 0; i < S.len; i++) {
    S.setPixelColor(i, S.color_from_palette(stp + i * 2, false, PALETTE_SOLID_WRAP, 0, beat - stp + i * 10));
  }
  return FRAMETIME;
};

FX[69] = (S) => { // Fill Noise
  if (S.call === 0) S.step = random16(12345);
  for (let i = 0; i < S.len; i++) {
    const index = inoise8(i * S.len, S.step + i * S.len);
    S.setPixelColor(i, S.color_from_palette(index, false, PALETTE_SOLID_WRAP, 0));
  }
  S.step = (S.step + beatsin8_t(S.speed, 1, 6)) >>> 0;
  return FRAMETIME;
};

FX[70] = (S) => { // Noise 1
  const scale = 320;
  S.step = (S.step + 1 + div(S.speed, 16)) >>> 0;
  for (let i = 0; i < S.len; i++) {
    const shift_x = beatsin8_t(11);
    const shift_y = div(S.step, 42);
    const real_x = mul(i + shift_x, scale), real_y = mul(i + shift_y, scale);
    const noise = inoise16(real_x, real_y, S.step) >> 8;
    const index = sin8_t(noise * 3);
    S.setPixelColor(i, S.color_from_palette(index, false, PALETTE_SOLID_WRAP, 0));
  }
  return FRAMETIME;
};
FX[71] = (S) => { // Noise 2
  const scale = 1000;
  S.step = (S.step + 1 + (S.speed >> 1)) >>> 0;
  for (let i = 0; i < S.len; i++) {
    const shift_x = S.step >>> 6;
    const real_x = mul(i + shift_x, scale);
    const noise = inoise16(real_x, 0, 4223) >> 8;
    const index = sin8_t(noise * 3);
    S.setPixelColor(i, S.color_from_palette(index, false, PALETTE_SOLID_WRAP, 0, noise));
  }
  return FRAMETIME;
};
FX[72] = (S) => { // Noise 3
  const scale = 800;
  S.step = (S.step + 1 + S.speed) >>> 0;
  for (let i = 0; i < S.len; i++) {
    const real_x = mul(i + 4223, scale), real_y = mul(i + 1234, scale);
    const real_z = mul(S.step, 8);
    const noise = inoise16(real_x, real_y, real_z) >> 8;
    const index = sin8_t(noise * 3);
    S.setPixelColor(i, S.color_from_palette(index, false, PALETTE_SOLID_WRAP, 0, noise));
  }
  return FRAMETIME;
};
FX[73] = (S) => { // Noise 4
  const stp = mul(now(), S.speed) >>> 7;
  for (let i = 0; i < S.len; i++) {
    const index = inoise16((i << 12) >>> 0, stp);
    S.setPixelColor(i, S.color_from_palette(index, false, PALETTE_SOLID_WRAP, 0));
  }
  return FRAMETIME;
};

// ---------------------------------------------------------------- 74–79
const qaddRGB = (a, b) => RGB(qadd8(R(a), R(b)), qadd8(G(a), G(b)), qadd8(B(a), B(b))); // CRGB +=

FX[74] = (S) => { // Colortwinkles
  S.allocateData((S.len + 7) >> 3);
  const bits = S.data;
  const bri = getStrip().bri;
  const fadeUpAmount = bri > 28 ? 8 + (S.speed >> 2) : 68 - bri;
  const fadeDownAmount = bri > 28 ? 8 + (S.speed >> 3) : 68 - bri;
  for (let i = 0; i < S.len; i++) {
    let c = S.getPixelColor(i);
    const prev = c;
    const index = i >> 3, bit = 1 << (i & 7);
    if (bits[index] & bit) {
      c = qaddRGB(c, nscale8_video(c, fadeUpAmount));
      if (R(c) === 255 || G(c) === 255 || B(c) === 255) bits[index] &= ~bit;
      S.setPixelColor(i, c);
      if (S.getPixelColor(i) === prev) { c = qaddRGB(c, c); S.setPixelColor(i, c); }
    } else {
      S.setPixelColor(i, nscale8(c, 255 - fadeDownAmount));
    }
  }
  for (let j = 0; j <= div(S.len, 50); j++) {
    if (random8() <= S.intensity) {
      for (let times = 0; times < 5; times++) {
        const i = random16(S.len);
        if (S.getPixelColor(i) === 0) {
          const c = ColorFromPalette(S.curPal, random8(), 64, false);
          bits[i >> 3] |= 1 << (i & 7);
          S.setPixelColor(i, c);
          break;
        }
      }
    }
  }
  return FRAMETIME; // FRAMETIME_FIXED
};

FX[75] = (S) => { // Lake
  const sp = div(S.speed, 10);
  const wave1 = beatsin8_t(sp + 2, -64, 64);
  const wave2 = beatsin8_t(sp + 1, -64, 64);
  const wave3 = beatsin8_t(sp + 2, 0, 80);
  for (let i = 0; i < S.len; i++) {
    const index = (cos8_t((i * 15 + wave1) & 255) >> 1) + (cubicwave8((i * 23 + wave2) & 255) >> 1);
    const lum = index > wave3 ? index - wave3 : 0;
    S.setPixelColor(i, S.color_from_palette(index, false, false, 0, lum));
  }
  return FRAMETIME;
};

FX[76] = (S) => { // Meteor
  if (S.len === 1) return mode_static(S);
  S.allocateData(S.len);
  const trail = S.data;
  const meteorSize = 1 + div(S.len, 20);
  const counter = mul(now(), (S.speed >> 2) + 8);
  const inn = (mul(counter, S.len) >>> 16) & 0xffff;
  const max = S.palette === 5 ? 239 : 255;
  for (let i = 0; i < S.len; i++) {
    if (random8() <= 255 - S.intensity) {
      const meteorTrailDecay = 128 + random8(127);
      trail[i] = scale8(trail[i], meteorTrailDecay);
      let index = trail[i], idx = 255;
      let bri = S.palette === 35 || S.palette === 36 ? 255 : trail[i];
      if (!S.check1) { idx = 0; index = map(i, 0, S.len, 0, max); bri = trail[i]; }
      S.setPixelColor(i, S.color_from_palette(index, false, false, idx, bri));
    }
  }
  for (let j = 0; j < meteorSize; j++) {
    const index = (inn + j) % S.len;
    let idx = 255;
    let i = trail[index] = max;
    if (!S.check1) { i = map(index, 0, S.len, 0, max); idx = 0; }
    S.setPixelColor(index, S.color_from_palette(i, false, false, idx, 255));
  }
  return FRAMETIME;
};

FX[77] = (S) => { // Meteor Smooth
  if (S.len === 1) return mode_static(S);
  S.allocateData(S.len);
  const trail = S.data;
  const meteorSize = 1 + div(S.len, 20);
  const inn = map((S.step >>> 6) & 0xff, 0, 255, 0, S.len - 1);
  const max = S.palette === 5 || !S.check1 ? 240 : 255;
  for (let i = 0; i < S.len; i++) {
    if (random8() <= 255 - S.intensity) {
      const change = trail[i] + 4 - random8(24);
      trail[i] = Math.min(Math.max(change, 0), max);
      S.setPixelColor(i, S.check1 ? S.color_from_palette(i, true, false, 0, trail[i]) : S.color_from_palette(trail[i], false, true, 255));
    }
  }
  for (let j = 0; j < meteorSize; j++) {
    let index = inn + j;
    if (index >= S.len) index -= S.len;
    trail[index] = max;
    S.setPixelColor(index, S.check1 ? S.color_from_palette(index, true, false, 0, trail[index]) : S.color_from_palette(trail[index], false, true, 255));
  }
  S.step = (S.step + S.speed + 1) >>> 0;
  return FRAMETIME;
};

FX[78] = (S) => { // Railway
  if (S.len === 1) return mode_static(S);
  const dur = (256 - S.speed) * 40;
  const rampdur = ((dur * S.intensity) >> 8) & 0xffff;
  if (S.step > dur) { S.step = 0; S.aux0 = S.aux0 ? 0 : 1; }
  let pos = 255;
  if (rampdur !== 0) {
    const p0 = div(S.step * 255, rampdur);
    if (p0 < 255) pos = p0;
  }
  if (S.aux0) pos = 255 - pos;
  for (let i = 0; i < S.len; i += 2) {
    S.setPixelColor(i, S.color_from_palette(255 - pos, false, false, 255));
    if (i < S.len - 1) S.setPixelColor(i + 1, S.color_from_palette(pos, false, false, 255));
  }
  S.step += FRAMETIME;
  return FRAMETIME;
};

function ripple_base(S) {
  const maxRipples = Math.min(1 + (S.len >> 2), 100);
  if (!S.state || S.state.length !== maxRipples) S.state = Array.from({ length: maxRipples }, () => ({ state: 0, color: 0, pos: 0 }));
  const ripples = S.state;
  for (const r of ripples) {
    let ripplestate = r.state;
    if (ripplestate) {
      const rippledecay = (S.speed >> 4) + 1;
      const rippleorigin = r.pos;
      const col = S.color_from_palette(r.color, false, false, 255);
      const propagation = mul(div(ripplestate, rippledecay) - 1, S.speed + 1);
      const propI = propagation >> 8;
      const propF = propagation & 0xff;
      const amp = ripplestate < 17 ? triwave8((ripplestate - 1) * 8) : map(ripplestate, 17, 255, 255, 2);
      const left = rippleorigin - propI - 1;
      const right = rippleorigin + propI + 2;
      for (let v = 0; v < 4; v++) {
        const mag = scale8(cubicwave8(((propF >> 2) + v * 64) & 255), amp);
        S.setPixelColor(left + v, color_blend(S.getPixelColor(left + v), col, mag));
        S.setPixelColor(right - v, color_blend(S.getPixelColor(right - v), col, mag));
      }
      ripplestate += rippledecay;
      r.state = ripplestate > 254 ? 0 : ripplestate;
    } else if (random16(5100 + 10000) <= S.intensity) {
      r.state = 1;
      r.pos = random16(S.len);
      r.color = random8();
    }
  }
  return FRAMETIME;
}
FX[79] = (S) => { // Ripple
  if (S.len === 1) return mode_static(S);
  if (!S.check2) S.fill(S.SEGCOLOR(1));
  else S.fade_out(250);
  return ripple_base(S);
};
FX[99] = (S) => { // Ripple Rainbow
  if (S.len === 1) return mode_static(S);
  if (S.call === 0) { S.aux0 = random8(); S.aux1 = random8(); }
  if (S.aux0 === S.aux1) S.aux1 = random8();
  else if (S.aux1 > S.aux0) S.aux0++;
  else S.aux0--;
  S.fill(color_blend(S.color_wheel(S.aux0), BLACK, 235));
  return ripple_base(S);
};

// ---------------------------------------------------------------- 80–88
function twinklefox_one_twinkle(S, ms, salt, cat) {
  const ticks = div(ms, S.aux0);
  const fastcycle8 = ticks & 255;
  let slowcycle16 = ((ticks >>> 8) + salt) & 0xffff;
  slowcycle16 = (slowcycle16 + sin8_t(slowcycle16 & 255)) & 0xffff;
  slowcycle16 = (slowcycle16 * 2053 + 1384) & 0xffff;
  const slowcycle8 = ((slowcycle16 & 0xff) + (slowcycle16 >> 8)) & 255;
  const twinkleDensity = (S.intensity >> 5) + 1;
  let bright = 0;
  if (((slowcycle8 & 0x0e) >> 1) < twinkleDensity) {
    let ph = fastcycle8;
    if (cat) bright = 255 - ph;
    else if (ph < 86) bright = ph * 3;
    else { ph -= 86; bright = 255 - (ph + (ph >> 1)); }
  }
  const hue = (slowcycle8 - salt) & 255;
  if (bright <= 0) return BLACK;
  let c = ColorFromPalette(S.curPal, hue, bright, false);
  if (!S.check1 && fastcycle8 >= 128) {
    const cooling = (fastcycle8 - 128) >> 4;
    c = RGB(R(c), qsub8(G(c), cooling), qsub8(B(c), cooling * 2));
  }
  return c;
}
function twinklefox_base(S, cat) {
  let PRNG16 = 11337;
  if (S.speed > 100) S.aux0 = 3 + ((255 - S.speed) >> 3);
  else S.aux0 = 22 + ((100 - S.speed) >> 1);
  let bg = S.SEGCOLOR(1);
  const bglight = getAverageLight(bg);
  if (bglight > 64) bg = nscale8_video(bg, 16);
  else if (bglight > 16) bg = nscale8_video(bg, 64);
  else bg = nscale8_video(bg, 86);
  const backgroundBrightness = getAverageLight(bg);
  for (let i = 0; i < S.len; i++) {
    PRNG16 = (PRNG16 * 2053 + 1384) & 0xffff;
    const myclockoffset16 = PRNG16;
    PRNG16 = (PRNG16 * 2053 + 1384) & 0xffff;
    const myspeedmultiplierQ5_3 = ((((PRNG16 & 0xff) >> 4) + (PRNG16 & 0x0f)) & 0x0f) + 0x08;
    const myclock30 = ((mul(now(), myspeedmultiplierQ5_3) >>> 3) + myclockoffset16) >>> 0;
    const myunique8 = PRNG16 >> 8;
    const c = twinklefox_one_twinkle(S, myclock30, myunique8, cat);
    const deltabright = getAverageLight(c) - backgroundBrightness;
    if (deltabright >= 32 || !bg) S.setPixelColor(i, c);
    else if (deltabright > 0) S.setPixelColor(i, color_blend(bg, c, deltabright * 8));
    else S.setPixelColor(i, bg);
  }
  return FRAMETIME;
}
FX[80] = (S) => twinklefox_base(S, false);
FX[81] = (S) => twinklefox_base(S, true);

function spots_base(S, threshold) {
  if (S.len === 1) return mode_static(S);
  if (!S.check2) S.fill(S.SEGCOLOR(1));
  const maxZones = S.len >> 2;
  const zones = 1 + ((S.intensity * maxZones) >> 8);
  const zoneLen = div(S.len, zones);
  const offset = (S.len - zones * zoneLen) >> 1;
  for (let z = 0; z < zones; z++) {
    const pos = offset + z * zoneLen;
    for (let i = 0; i < zoneLen; i++) {
      const wave = triwave16(div(i * 0xffff, zoneLen));
      if (wave > threshold) {
        const index = pos + i;
        const s = div((wave - threshold) * 255, 0xffff - threshold);
        S.setPixelColor(index, color_blend(S.color_from_palette(index, true, PALETTE_SOLID_WRAP, 0), S.SEGCOLOR(1), 255 - s));
      }
    }
  }
  return FRAMETIME;
}
FX[85] = (S) => spots_base(S, (255 - S.speed) << 8);
FX[86] = (S) => { // Spots Fade
  const counter = mul(now(), (S.speed >> 2) + 8);
  const t = triwave16(counter);
  const tr = (t >> 1) + (t >> 2);
  return spots_base(S, tr);
};

function glitter_base(S, intensity, col = ULTRAWHITE) {
  if (intensity > random8()) S.setPixelColor(random16(S.len), col);
}
FX[87] = (S) => { // Glitter
  if (!S.check2) {
    let counter = 0;
    if (S.speed !== 0) counter = (mul(now(), (S.speed >> 3) + 1) & 0xffff) >> 8;
    const noWrap = S.speed === 0; // paletteBlend 0 (the default)
    for (let i = 0; i < S.len; i++) {
      let colorIndex = (div(i * 255, S.len) - counter) >>> 0;
      if (noWrap) colorIndex = map(colorIndex, 0, 255, 0, 240);
      S.setPixelColor(i, S.color_from_palette(colorIndex, false, true, 255));
    }
  }
  glitter_base(S, S.intensity, S.SEGCOLOR(2) ? S.SEGCOLOR(2) : ULTRAWHITE);
  return FRAMETIME;
};

FX[88] = (S) => { // Candle
  const valrange = S.intensity;
  const rndval = valrange >> 1;
  let speedFactor = 4;
  if (S.speed > 252) speedFactor = 1;
  else if (S.speed > 99) speedFactor = 2;
  else if (S.speed > 49) speedFactor = 3;
  let s = S.aux0, s_target = S.aux1, fadeStep = S.step;
  if (fadeStep === 0) { s = 128; s_target = 130 + random8(4); fadeStep = 1; }
  let newTarget = false;
  if (s_target > s) { s = qadd8(s, fadeStep); if (s >= s_target) newTarget = true; }
  else { s = qsub8(s, fadeStep); if (s <= s_target) newTarget = true; }
  if (newTarget) {
    s_target = random8(rndval) + random8(rndval);
    if (s_target < (rndval >> 1)) s_target = (rndval >> 1) + random8(rndval);
    s_target += 255 - valrange;
    const dif = s_target > s ? s_target - s : s - s_target;
    fadeStep = dif >> speedFactor;
    if (fadeStep === 0) fadeStep = 1;
  }
  for (let j = 0; j < S.len; j++) S.setPixelColor(j, color_blend(S.SEGCOLOR(1), S.color_from_palette(j, true, PALETTE_SOLID_WRAP, 0), s));
  S.aux0 = s; S.aux1 = s_target & 0xffff; S.step = fadeStep;
  return FRAMETIME; // FRAMETIME_FIXED
};

// ---------------------------------------------------------------- 91–97
FX[91] = (S) => { // Bouncing Balls
  if (S.len === 1) return mode_static(S);
  const maxNumBalls = 16;
  if (!S.state) S.state = Array.from({ length: maxNumBalls }, () => ({ lastBounceTime: 0, impactVelocity: 0, height: 0 }));
  const balls = S.state;
  if (!S.check2) S.fill(S.SEGCOLOR(2) ? BLACK : S.SEGCOLOR(1));
  const numBalls = div(S.intensity * (maxNumBalls - 1), 255) + 1;
  const gravity = -9.81;
  const hasCol2 = !!S.SEGCOLOR(2);
  const time = now();
  if (S.call === 0) for (const b of balls) b.lastBounceTime = time;
  for (let i = 0; i < numBalls; i++) {
    const b = balls[i];
    const timeSinceLastBounce = div((time - b.lastBounceTime) >>> 0, div(255 - S.speed, 64) + 1);
    const timeSec = timeSinceLastBounce / 1000;
    b.height = Math.fround((0.5 * gravity * timeSec + b.impactVelocity) * timeSec);
    if (b.height <= 0) {
      b.height = 0;
      const dampening = 0.9 - i / (numBalls * numBalls);
      b.impactVelocity = Math.fround(dampening * b.impactVelocity);
      b.lastBounceTime = time;
      if (b.impactVelocity < 0.015) b.impactVelocity = Math.fround((Math.sqrt(-2 * gravity) * random8(5, 11)) / 10);
    } else if (b.height > 1) continue;
    let color = S.SEGCOLOR(0);
    if (S.palette) color = S.color_wheel(i * div(256, Math.max(numBalls, 8)));
    else if (hasCol2) color = S.SEGCOLOR(i % 3);
    S.setPixelColor(Math.round(b.height * (S.len - 1)), color);
  }
  return FRAMETIME;
};

function sinelon_base(S, dual, rainbow = false) {
  if (S.len === 1) return mode_static(S);
  S.fade_out(S.intensity);
  const pos = beatsin16_t(div(S.speed, 10), 0, S.len - 1);
  if (S.call === 0) S.aux0 = pos;
  let color1 = S.color_from_palette(pos, true, false, 0);
  let color2 = S.SEGCOLOR(2);
  if (rainbow) color1 = S.color_wheel((pos & 7) * 32);
  S.setPixelColor(pos, color1);
  if (dual) {
    if (!color2) color2 = S.color_from_palette(pos, true, false, 0);
    if (rainbow) color2 = color1;
    S.setPixelColor(S.len - 1 - pos, color2);
  }
  if (S.aux0 !== pos) {
    if (S.aux0 < pos) {
      for (let i = S.aux0; i < pos; i++) { S.setPixelColor(i, color1); if (dual) S.setPixelColor(S.len - 1 - i, color2); }
    } else {
      for (let i = S.aux0; i > pos; i--) { S.setPixelColor(i, color1); if (dual) S.setPixelColor(S.len - 1 - i, color2); }
    }
    S.aux0 = pos;
  }
  return FRAMETIME;
}
FX[92] = (S) => sinelon_base(S, false);
FX[93] = (S) => sinelon_base(S, true);
FX[94] = (S) => sinelon_base(S, false, true);

FX[95] = (S) => { // Popcorn
  if (S.len === 1) return mode_static(S);
  const usablePopcorns = 21;
  if (!S.state) S.state = Array.from({ length: usablePopcorns }, () => ({ pos: 0, vel: 0, colIndex: 0 }));
  const popcorn = S.state;
  const hasCol2 = !!S.SEGCOLOR(2);
  if (!S.check2) S.fill(hasCol2 ? BLACK : S.SEGCOLOR(1));
  const gravity = Math.fround((-0.0001 - S.speed / 200000) * S.len);
  let numPopcorn = div(S.intensity * usablePopcorns, 255);
  if (numPopcorn === 0) numPopcorn = 1;
  for (let i = 0; i < numPopcorn; i++) {
    const p = popcorn[i];
    if (p.pos >= 0) {
      p.pos = Math.fround(p.pos + p.vel);
      p.vel = Math.fround(p.vel + gravity);
    } else if (random8() < 2) {
      p.pos = 0.01;
      let peakHeight = 128 + random8(128);
      peakHeight = (peakHeight * (S.len - 1)) >> 8;
      p.vel = Math.fround(Math.sqrt(-2 * gravity * peakHeight));
      if (S.palette) p.colIndex = random8();
      else {
        let col = random8(0, 3);
        if (!S.SEGCOLOR(2) || !S.SEGCOLOR(col)) col = 0;
        p.colIndex = col;
      }
    }
    if (p.pos >= 0) {
      let col = S.color_wheel(p.colIndex);
      if (!S.palette && p.colIndex < 3) col = S.SEGCOLOR(p.colIndex);
      const ledIndex = Math.trunc(p.pos);
      if (ledIndex < S.len) S.setPixelColor(ledIndex, col);
    }
  }
  return FRAMETIME;
};

FX[97] = (S) => { // Plasma
  if (S.call === 0) S.aux0 = random8(0, 2);
  const thisPhase = beatsin8_t(6 + S.aux0, -64, 64);
  const thatPhase = beatsin8_t(7 + S.aux0, -64, 64);
  for (let i = 0; i < S.len; i++) {
    const colorIndex = (cubicwave8((i * (2 + 3 * (S.speed >> 5)) + thisPhase) & 255) >> 1)
      + (cos8_t((i * (1 + 2 * (S.speed >> 5)) + thatPhase) & 255) >> 1);
    const thisBright = qsub8(colorIndex, beatsin8_t(7, 0, 128 - (S.intensity >> 1)));
    S.setPixelColor(i, S.color_from_palette(colorIndex, false, PALETTE_SOLID_WRAP, 0, thisBright));
  }
  return FRAMETIME;
};

// ---------------------------------------------------------------- 110, 143
FX[110] = (S) => { // Flow
  let counter = 0;
  if (S.speed !== 0) counter = mul(now(), (S.speed >> 2) + 1) >>> 8;
  const maxZones = div(S.len, 6);
  let zones = (S.intensity * maxZones) >> 8;
  if (zones & 1) zones++;
  if (zones < 2) zones = 2;
  const zoneLen = div(S.len, zones);
  const offset = (S.len - zones * zoneLen) >> 1;
  S.fill(S.color_from_palette(-counter, false, true, 255));
  for (let z = 0; z < zones; z++) {
    const pos = offset + z * zoneLen;
    for (let i = 0; i < zoneLen; i++) {
      const colorIndex = (div(i * 255, zoneLen) - counter) >>> 0;
      let led = z & 1 ? i : zoneLen - 1 - i;
      if (S.reverse) led = zoneLen - 1 - led;
      S.setPixelColor(pos + led, S.color_from_palette(colorIndex, false, true, 255));
    }
  }
  return FRAMETIME;
};

const NOISEFIRE_PAL = [
  hsv2rgb_rainbow(0, 255, 2), hsv2rgb_rainbow(0, 255, 4), hsv2rgb_rainbow(0, 255, 8), hsv2rgb_rainbow(0, 255, 8),
  hsv2rgb_rainbow(0, 255, 16), 0xff0000, 0xff0000, 0xff0000,
  0xff8c00, 0xff8c00, 0xffa500, 0xffa500,
  0xffff00, 0xffa500, 0xffff00, 0xffff00,
];
FX[143] = (S) => { // Noisefire (audio-reactive; WLED's default simulated sound, UMS_BeatSin)
  const volumeSmth = beatsin8_t(div(120, 9), 0, 255); // fftResult[8]
  if (S.call === 0) S.fill(BLACK);
  for (let i = 0; i < S.len; i++) {
    let index = inoise8(div(i * S.speed, 64), div(mul(mul(now(), S.speed) >>> 6, S.len), 255));
    index = div((255 - div(i * 256, S.len)) * index, 256 - S.intensity);
    S.setPixelColor(i, ColorFromPalette(NOISEFIRE_PAL, index & 255, (volumeSmth * 2) & 255, true));
  }
  return FRAMETIME;
};

// @@MORE

export const EFFECTS = {};
for (const [id, run] of Object.entries(FX)) EFFECTS[id] = { name: FX_NAMES[id], run };
export { mode_static };
