'use strict';

const express = require('express');
const { addonBuilder, getRouter } = require('stremio-addon-sdk');
const fs = require('node:fs');
const path = require('node:path');

const manifest = require('../manifest.json');
const catalogFile = path.join(__dirname, '..', 'data', 'catalog.json');
const catalogData = JSON.parse(fs.readFileSync(catalogFile, 'utf8'));
const items = Array.isArray(catalogData.items) ? catalogData.items : [];
const app = express();
const port = Number.parseInt(process.env.PORT || '7000', 10);

app.disable('x-powered-by');

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', service: 'cinecloud-nuvio-addon', version: manifest.version });
});

app.get('/manifest.json', (_req, res) => {
  res.set('Cache-Control', 'public, max-age=60');
  res.type('application/json').status(200).send(manifest);
});

const builder = new addonBuilder(manifest);

function toMeta(item) {
  return {
    id: item.id,
    type: item.type,
    name: item.name,
    description: item.description,
    releaseInfo: item.releaseInfo,
    genres: item.genres
  };
}

builder.defineCatalogHandler(({ type, id, extra = {} } = {}) => {
  if (type !== 'movie' || id !== 'cinecloud-open') return Promise.resolve({ metas: [] });
  const query = String(extra.search || '').trim().toLocaleLowerCase('en');
  const metas = items
    .filter((item) => item.type === type)
    .filter((item) => !query || `${item.name} ${item.description} ${(item.genres || []).join(' ')}`.toLocaleLowerCase('en').includes(query))
    .map(toMeta);
  return Promise.resolve({ metas });
});

builder.defineMetaHandler(({ type, id } = {}) => {
  const item = items.find((entry) => entry.type === type && entry.id === id);
  return Promise.resolve(item ? { meta: toMeta(item) } : { meta: null });
});

builder.defineStreamHandler(({ type, id } = {}) => {
  const item = items.find((entry) => entry.type === type && entry.id === id);
  if (!item || typeof item.streamUrl !== 'string') return Promise.resolve({ streams: [] });

  let streamUrl;
  try {
    streamUrl = new URL(item.streamUrl);
  } catch {
    return Promise.resolve({ streams: [] });
  }
  if (streamUrl.protocol !== 'https:') return Promise.resolve({ streams: [] });

  return Promise.resolve({
    streams: [{
      name: 'CineCloud • Open Movie',
      title: item.streamTitle || item.name,
      url: streamUrl.toString()
    }]
  });
});

app.use(getRouter(builder.getInterface()));

const server = app.listen(port, '0.0.0.0', () => {
  console.log(`CineCloud addon listening on 0.0.0.0:${port}`);
});

function shutdown(signal) {
  console.log(`${signal} received; shutting down gracefully`);
  server.close((error) => {
    if (error) {
      console.error('HTTP server shutdown failed:', error);
      process.exitCode = 1;
    }
    process.exit();
  });
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
