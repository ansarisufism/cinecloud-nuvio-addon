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
const providers = require('./providers').createProviderRegistry({ libraryItems: items });

app.disable('x-powered-by');

app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'cinecloud-nuvio-addon',
    version: manifest.version,
    providers: providers.enabled
  });
});

app.get('/manifest.json', (_req, res) => {
  res.set('Cache-Control', 'public, max-age=60');
  res.type('application/json').status(200).send(manifest);
});

const builder = new addonBuilder(manifest);

builder.defineCatalogHandler(async ({ type, id, extra = {} } = {}) => {
  const supportedCatalog = manifest.catalogs.some((catalog) => catalog.type === type && catalog.id === id);
  if (!supportedCatalog) return { metas: [] };

  try {
    const metas = await providers.catalog({ type, catalogId: id, search: extra.search || '' });
    return { metas };
  } catch (error) {
    console.error('[addon] Catalog handler failed safely:', error && error.message ? error.message : 'unknown error');
    return { metas: [] };
  }
});

builder.defineMetaHandler(async ({ type, id } = {}) => {
  try {
    const meta = await providers.meta({ type, id });
    return { meta: meta || null };
  } catch (error) {
    console.error('[addon] Metadata handler failed safely:', error && error.message ? error.message : 'unknown error');
    return { meta: null };
  }
});

builder.defineStreamHandler(async ({ type, id } = {}) => {
  try {
    const streams = await providers.streams({ type, id });
    return { streams: streams || [] };
  } catch (error) {
    console.error('[addon] Stream handler failed safely:', error && error.message ? error.message : 'unknown error');
    return { streams: [] };
  }
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
