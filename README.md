# CineCloud Nuvio Addon

A minimal Node.js addon exposing `/manifest.json`, `/health`, a searchable catalog, and stream responses for open or explicitly authorized media.

> This project intentionally does not crawl third-party streaming websites or resolve player/embed endpoints. Configure a JSON feed only when you own it or have explicit permission to access and distribute the listed media.

## Run locally

Requires Node.js 18+.

```sh
npm install
npm start
npm test
```

Check `http://localhost:7000/health` and `http://localhost:7000/manifest.json`.

## Provider configuration

The registry reads a comma-separated `PROVIDERS` variable. Local media is provided by `library`; `pikahd` is an adapter for an authorized JSON feed. Unknown/unavailable providers are skipped without bringing down the addon.

Example environment:

```sh
PROVIDERS=library,pikahd
PIKAHD_API_URL=https://catalog.your-domain.example/feed.json
PIKAHD_TIMEOUT_MS=5000
PIKAHD_CACHE_TTL_MS=30000
```

Set these in your hosting provider's environment settings. The endpoint must be HTTPS and must not be on `pikahd.co` or its subdomains; that website is not crawled. Requests that fail, time out, or return invalid JSON degrade to empty results instead of crashing the addon.

Expected feed shape:

```json
{
  "items": [
    {
      "id": "licensed-title-1",
      "type": "series",
      "title": "Licensed Anime (Hindi Dubbed)",
      "description": "Content details and license information",
      "poster": "https://cdn.your-domain.example/poster.jpg",
      "tags": ["Hindi Dubbed", "Multi-Audio"],
      "streams": [
        {
          "name": "Authorized CDN",
          "title": "HLS",
          "url": "https://cdn.your-domain.example/video/index.m3u8"
        }
      ]
    }
  ]
}
```

The adapter accepts direct HTTPS video file URLs ending in `.m3u8`, `.mp4`, `.m4v`, `.webm`, `.mov`, or `.mkv`. Embedded players, Player.js/Bradmax endpoints, HTTP links, and other non-direct URLs are discarded rather than resolved.

The repository currently includes `library` and `pikahd` providers. If a value such as `archive` is placed in `PROVIDERS` before that provider has been implemented, it is skipped with a warning.

## Render

The repository includes a `render.yaml` Blueprint configured for a free Node web service, `npm install`, `npm start`, and `/health`.

## Licensed demo content

The built-in sample points to Big Buck Bunny, a Blender Foundation open movie identified as Creative Commons Attribution 3.0. Comply with the license and provide attribution when redistributing.
