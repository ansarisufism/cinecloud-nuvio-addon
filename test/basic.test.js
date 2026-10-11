'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const manifest = require('../manifest.json');
const { items } = require('../data/catalog.json');

test('manifest declares valid basic Stremio fields', () => {
  assert.equal(typeof manifest.id, 'string');
  assert.equal(typeof manifest.version, 'string');
  assert.ok(Array.isArray(manifest.resources));
  assert.ok(manifest.resources.includes('stream'));
  assert.ok(Array.isArray(manifest.catalogs));
});

test('each demo item has a unique supported id and HTTPS stream URL', () => {
  const ids = new Set();
  for (const item of items) {
    assert.match(item.id, /^cc:/);
    assert.equal(item.type, 'movie');
    assert.ok(!ids.has(item.id), `duplicate item id: ${item.id}`);
    ids.add(item.id);
    assert.equal(new URL(item.streamUrl).protocol, 'https:');
  }
});
