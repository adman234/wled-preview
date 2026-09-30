# Roadmap / TODO

## Long-term

- [ ] **Segment editor** – preview *and edit* segments in the web UI, and adjust their physical layout (strip order, folds/rows, matrix panels, LED positions) so the preview matches your real installation.
- [ ] **AI-generated presets** – describe a look ("slow warm sunset with occasional sparkles") and have a model propose segments, effects, palettes and colours, previewed live before accepting.
- [ ] **Export configuration** – download a new `presets.json` / `cfg.json` containing edited and newly generated presets, ready to restore on the device.

## Preview accuracy

- [ ] Implement the remaining 1D effects (Ripple, Twinklefox, Noise*, Lake, Railway, Police, Fairy, Spots, Heartbeat, Drip, Starburst, …).
- [ ] 2D effects for matrix setups (Game of Life, Plasma Ball, Julia, Matrix, Distortion Waves…) – currently matrices run 1D effects over the pixel index.
- [ ] Verify timing/curves against the real firmware; ideal end state is compiling WLED's FX code to WebAssembly so previews are exact.
- [ ] Complete the palette table (remaining built-in palettes, custom `palette*.json` files).
- [ ] Segment blend modes, transitions and "ps" (apply preset) chains; `nl` (nightlight) and `bri` fades.
- [ ] Gamma correction, colour order and RGBW/CCT handling to match how real LEDs look.
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
- [ ] Auth / reverse-proxy docs; PWA install for offline use.
