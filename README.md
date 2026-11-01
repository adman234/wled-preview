# WLED Preview

A tiny web app that lets you **preview your [WLED](https://github.com/wled/WLED) presets without touching your LEDs**.
Upload your `presets.json` (and optionally `cfg.json`) and see each preset animated on a virtual copy of your setup.

**Use it here: <https://adman234.github.io/wled-preview/>**

- Runs entirely in your browser – files are never uploaded anywhere.
- Shows each LED output from `cfg.json` (or a matrix, if one is configured); `cfg.json` is optional.
- Honours segment start/stop, reverse, mirror, grouping/spacing, offset, per-segment and master brightness, palettes and colours.
- Animated thumbnail of every preset in the list, segment table per preset, playlists are stepped through.
- **Copy** any preset as JSON, **Import** (paste) a preset to add it to the list, and **Export** a `presets.json` that includes your imports, ready to restore to the device.
- ~70 WLED effects implemented (Fire 2012, Rainbow, Colorwaves, Twinkle, Scanner, Meteor, Plasma…).

> **Approximate preview.** Effects are independent JavaScript re-implementations, *not* the WLED firmware, so timing and
> detail differ slightly. Effects that aren't implemented yet are flagged **approximated** and shown as a generic palette
> animation. Audio-reactive and 2D-specific effects aren't supported yet. See [TODO.md](TODO.md).

## Getting your files from WLED

Browse to `http://<wled-ip>/presets.json` and `http://<wled-ip>/cfg.json` and save them
(or *Config → Security & Updates → Backup presets / Backup configuration*). Then drop them on the page.
Use **Load sample** to try it without any files.

## Run it locally

It's a static site with no build step, hosted on GitHub Pages. To run your own copy, serve the `web/` folder with any
web server, for example `python3 -m http.server 8080 -d web`, then open <http://localhost:8080>.

## Development

```sh
npm test      # node:test unit tests for parsing and the effect engine (Node 22+, no dependencies)
```

Layout: `web/js/parse.js` (cfg/presets parsing), `effects.js` (effect implementations), `palettes.js`, `engine.js`
(segment rendering), `app.js` (UI). CI (`.github/workflows/pages.yml`) runs the tests on every push and pull request, and deploys `web/` to GitHub Pages
on pushes to `main`.

## License

MIT. Not affiliated with or endorsed by the WLED project.
