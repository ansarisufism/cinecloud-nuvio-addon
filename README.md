# CineCloud Nuvio Addon

A minimal Node.js add-on server exposing a Stremio-compatible `/manifest.json`, a `/health` endpoint, a searchable movie catalog, and stream responses for explicitly licensed demo media.

> Starter package only. It does not scrape third-party streaming sites. Only add content you own or have permission to distribute.

## Run locally

Requires Node.js 18+.

```sh
npm install
npm start
```

Check `http://localhost:7000/health` and `http://localhost:7000/manifest.json`.

## Render

The repository includes a `render.yaml` Blueprint configured for a free Node web service, `npm install`, `npm start`, and `/health`. After applying the Blueprint in Render, verify `/health` and `/manifest.json` on the assigned HTTPS hostname.

## Licensed demo content

The sample catalog points to Big Buck Bunny, a Blender Foundation open movie identified as Creative Commons Attribution 3.0. Comply with that license and provide attribution when redistributing.