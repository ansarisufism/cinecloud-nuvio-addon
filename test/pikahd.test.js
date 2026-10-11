'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createPikahdProvider, isAllowedFeedEndpoint, normalizeItem } = require('../src/providers/pikahd');
const { createProviderRegistry, parseProviderList } = require('../src/providers');

const quietLogger = { warn() {} };
const jsonResponse = (payload) => ({
  ok: true,
  headers: { get: () => 'application/json; charset=utf-8' },
  json: async () => payload
});

test('PikaHD adapter reads an authorized JSON feed and resolves direct HLS streams', async () => {
  const feed = {
    items: [{
      id: 'pikahd:demo-anime',
      type: 'series',
      title: 'Demo Anime (Hindi Dubbed)',
      poster: 'https://cdn.example.test/posters/demo.jpg',
      tags: ['Hindi Dubbed', 'Multi-Audio'],
      description: 'Licensed test fixture only.',
      streams: [
        { name: 'CDN', title: 'HLS', url: 'https://media.example.test/demo/index.m3u8' },
        { name: 'Invalid embed', title: 'Player', url: 'https://player.example.test/embed?id=123' }
      ]
    }]
  };
  let calls = 0;
  const provider = createPikahdProvider({
    endpoint: 'https://catalog.example.test/feed.json',
    fetchImpl: async () => { calls += 1; return jsonResponse(feed); },
    logger: quietLogger
  });

  const catalog = await provider.catalog({ type: 'series', search: 'hindi dubbed' });
  assert.equal(catalog.length, 1);
  assert.equal(catalog[0].id, 'pikahd:demo-anime');
  assert.equal(catalog[0].name, 'Demo Anime (Hindi Dubbed)');
  assert.deepEqual(catalog[0].genres, ['Hindi Dubbed', 'Multi-Audio']);
  assert.equal(catalog[0].poster, 'https://cdn.example.test/posters/demo.jpg');

  const meta = await provider.meta({ type: 'series', id: 'pikahd:demo-anime' });
  assert.equal(meta.name, 'Demo Anime (Hindi Dubbed)');

  const streams = await provider.streams({ type: 'series', id: 'pikahd:demo-anime' });
  assert.equal(streams.length, 1);
  assert.equal(streams[0].url, 'https://media.example.test/demo/index.m3u8');
  assert.equal(calls, 1, 'feed result should be cached across catalog/meta/stream lookups');
});

test('provider rejects a PikaHD website URL as a feed endpoint and never fetches it', async () => {
  let calls = 0;
  const provider = createPikahdProvider({
    endpoint: 'https://new.pikahd.co/',
    fetchImpl: async () => { calls += 1; return jsonResponse({ items: [] }); },
    logger: quietLogger
  });
  assert.equal(isAllowedFeedEndpoint('https://new.pikahd.co/'), false);
  assert.equal(provider.isConfigured(), false);
  assert.deepEqual(await provider.catalog({ type: 'movie' }), []);
  assert.equal(calls, 0);
});

test('network errors and timeouts degrade to empty results instead of throwing', async () => {
  const provider = createPikahdProvider({
    endpoint: 'https://catalog.example.test/feed.json',
    fetchImpl: async () => { throw new Error('network blocked'); },
    timeoutMs: 50,
    logger: quietLogger
  });
  assert.deepEqual(await provider.catalog({ type: 'movie' }), []);
  assert.equal(await provider.meta({ type: 'movie', id: 'pikahd:anything' }), null);
  assert.deepEqual(await provider.streams({ type: 'movie', id: 'pikahd:anything' }), []);
});

test('invalid items and non-direct/player URLs are discarded', () => {
  assert.equal(normalizeItem({ title: '', type: 'movie' }), null);
  const item = normalizeItem({
    id: 'sample',
    type: 'movie',
    title: 'Sample',
    streams: [
      'https://media.example.test/sample.mp4',
      'https://player.example.test/bradmax/endpoint?asset=sample',
      'http://media.example.test/insecure.mp4'
    ]
  });
  assert.equal(item.id, 'pikahd:sample');
  assert.deepEqual(item.streams.map((stream) => stream.url), ['https://media.example.test/sample.mp4']);
});

test('PROVIDERS environment setting is parsed and missing providers do not crash registry', async () => {
  assert.deepEqual(parseProviderList(' library, archive,PIKAHD,library '), ['library', 'archive', 'pikahd']);
  const registry = createProviderRegistry({
    libraryItems: [],
    env: { PROVIDERS: 'library,archive,pikahd', PIKAHD_API_URL: '' },
    logger: quietLogger
  });
  assert.deepEqual(registry.enabled, ['library', 'pikahd']);
  assert.deepEqual(await registry.catalog({ type: 'movie', catalogId: 'cinecloud-open' }), []);
});
