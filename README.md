# WLED Preview

A tiny self-hosted web UI that lets you **preview your [WLED](https://github.com/wled/WLED) presets without touching your LEDs**.
Upload your `presets.json` (and optionally `cfg.json`) and see each preset animated on a virtual copy of your setup.

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

## Run it

### Docker

```sh
docker run -d --name wled-preview -p 8080:8080 ghcr.io/adman234/wled-preview:latest
```

Open <http://localhost:8080>. A `docker-compose.yml` is included too. Images are published for `linux/amd64` and `linux/arm64`.

### Unraid

1. In the Unraid web UI go to **Docker → Add Container → Template** and choose *Add a template by URL*, or copy
   [`unraid/wled-preview.xml`](unraid/wled-preview.xml) to `/boot/config/plugins/dockerMan/templates-user/` on your server.
2. Select **wled-preview**, adjust the port if 8080 is taken, and click **Apply**.

The container needs no volumes or environment variables.

### Without Docker

It is a static site: `cd web && python3 -m http.server 8080` (or any web server).

## Development

```sh
npm test      # node:test unit tests for parsing and the effect engine (Node 22+, no dependencies)
```

Layout: `web/js/parse.js` (cfg/presets parsing), `effects.js` (effect implementations), `palettes.js`, `engine.js`
(segment rendering), `app.js` (UI). CI (`.github/workflows/ci.yml`) runs tests and publishes `ghcr.io/adman234/wled-preview`
on pushes to `main` (`latest`) and on `v*` tags (semver).

After the first publish, set the GHCR package visibility to **public** (package settings) so Unraid can pull it without credentials.

## License

MIT. Not affiliated with or endorsed by the WLED project.
