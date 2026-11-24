# Roadmap / TODO

## Long-term

- [ ] **Segment editor** – preview *and edit* segments in the web UI, and adjust their physical layout (strip order, folds/rows, matrix panels, LED positions) so the preview matches your real installation.
- [ ] **AI-generated presets** – describe a look ("slow warm sunset with occasional sparkles") and have a model propose segments, effects, palettes and colours, previewed live before accepting.
- [ ] **Export configuration** – download a new `presets.json` / `cfg.json` containing edited and newly generated presets, ready to restore on the device.

## Preview accuracy

- [x] Port effects 0–37, 39–43, 45–47, 50, 52, 54–81, 85–88, 91–95, 97, 99, 110 and 143 from WLED 0.15.5 `FX.cpp`.
- [ ] Port the remaining 1D effects: 38 Aurora, 44 Tetrix, 48 Rolling Balls, 49 Fairy, 51 Fairytwinkle, 82–84 Halloween Eyes / Solid Pattern / Solid Pattern Tri, 89 Fireworks Starburst, 90 Fireworks 1D, 96 Drip, 98 Percent, and ids 100+ (Heartbeat, Pacifica, Candle Multi, Solid Glitter, Sunrise, Phased, Twinkleup, Noise Pal, Sine, Phased Noise, Chunchun, Dancing Shadows, Washing Machine, Blends, TV Simulator, Dynamic Smooth, audio-reactive effects…).
- [ ] 2D effects for matrix setups (Game of Life, Plasma Ball, Julia, Matrix, Distortion Waves…) – currently matrices run 1D effects over the pixel index.
- [x] Match WLED's frame clock (23 ms ticks, per-segment `next_time`), PRNG, trig and noise.
- [ ] Ideal end state: compile WLED's FX code to WebAssembly so previews are exact.
- [x] All built-in palettes (ids 0–70): the 65 fixed ones generated from WLED's `palettes.h`, plus Default, Random and the colour-based ones.
- [ ] Custom `palette*.json` files.
- [ ] Segment blend modes, transitions and "ps" (apply preset) chains; `nl` (nightlight) and `bri` fades.
- [x] WLED's colour gamma, then linear brightness shown as sRGB on screen.
- [ ] Colour order and RGBW/CCT handling.
- [ ] Audio-reactive (AudioReactive usermod) effects driven by uploaded audio or microphone.

## Other ideas and enhancements

- [ ] Live mode: connect to a WLED device by IP (`/json/state`, `/json/fxdata`, `/json/pal`) to import presets and effect/palette names directly instead of uploading files.
- [ ] Push a previewed preset to the real device with one click.
- [ ] Compare two presets side by side; "preview all" grid view.
- [ ] Virtual layout backgrounds: upload a photo of your room/tree/case and place LEDs on it; 3D view for sculptures and trees.
- [ ] Support a custom LED map (`ledmap.json`) for arbitrary 2D/3D positions.
- [ ] Search/filter by effect or palette, sort, tags; highlight unused/duplicate presets.
- [ ] Preview the *timeline* of playlists and nightlight/timer macros.
- [ ] Preset diff tool and version history between backups.
- [ ] Bulk edit: swap palette/colour/brightness across many presets.
- [ ] Shareable preview links / GIF or MP4 export of a preset.
- [ ] Multiple devices/profiles stored locally (IndexedDB) so you can compare setups.
- [ ] Import WLED 0.15+ effect metadata so custom/usermod effects show correct names.
- [ ] Accessibility: reduced-motion option, colour-blind friendly labels, keyboard navigation.
- [ ] PWA install for offline use.
