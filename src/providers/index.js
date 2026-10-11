'use strict';

const { createPikahdProvider, normalizeDirectStream } = require('./pikahd');

function parseProviderList(value) {
  const raw = typeof value === 'string' && value.trim() ? value : 'library';
  return [...new Set(raw.split(',').map((part) => part.trim().toLowerCase()).filter(Boolean))];
}

function createLibraryProvider(items = []) {
  return {
    id: 'library',
    ownsId: (id) => typeof id === 'string' && id.startsWith('cc:'),
    async catalog({ type, search = '' } = {}) {
      const query = String(search || '').trim().toLocaleLowerCase('en');
      return items
        .filter((item) => !type || item.type === type)
        .filter((item) => !query || `${item.name} ${item.description || ''} ${(item.genres || []).join(' ')}`.toLocaleLowerCase('en').includes(query))
        .map(({ streamUrl, streamTitle, ...item }) => item);
    },
    async meta({ type, id } = {}) {
      const item = items.find((entry) => entry.id === id && (!type || entry.type === type));
      if (!item) return null;
      const { streamUrl, streamTitle, ...meta } = item;
      return meta;
    },
    async streams({ type, id } = {}) {
      const item = items.find((entry) => entry.id === id && (!type || entry.type === type));
      if (!item || typeof item.streamUrl !== 'string') return [];
      const stream = normalizeDirectStream({ url: item.streamUrl, title: item.streamTitle || item.name, name: 'CineCloud • Open Movie' }, item.name);
      return stream ? [stream] : [];
    }
  };
}

function createProviderRegistry({
  libraryItems = [],
  env = process.env,
  fetchImpl = globalThis.fetch,
  logger = console
} = {}) {
  const selected = parseProviderList(env.PROVIDERS);
  const known = new Map([
    ['library', () => createLibraryProvider(libraryItems)],
    ['pikahd', () => createPikahdProvider({
      endpoint: env.PIKAHD_API_URL,
      fetchImpl,
      timeoutMs: Number.parseInt(env.PIKAHD_TIMEOUT_MS || '5000', 10) || 5000,
      cacheTtlMs: Number.parseInt(env.PIKAHD_CACHE_TTL_MS || '30000', 10) || 30000,
      logger
    })]
  ]);
  const providers = [];
  for (const id of selected) {
    const factory = known.get(id);
    if (!factory) {
      logger.warn?.(`[providers] Provider "${id}" is not installed; skipping it.`);
      continue;
    }
    try {
      const provider = factory();
      providers.push(provider);
      if (id === 'pikahd' && !provider.isConfigured()) {
        logger.warn?.('[pikahd] Provider selected but PIKAHD_API_URL is missing or invalid; it will return empty results.');
      }
    } catch (error) {
      logger.warn?.(`[providers] Could not initialize "${id}"; skipping it.`);
    }
  }

  function providerForId(id) {
    return providers.find((provider) => provider.ownsId(id));
  }

  return {
    enabled: providers.map((provider) => provider.id),
    async catalog({ type, catalogId, search = '' } = {}) {
      if (catalogId && !['cinecloud-open', 'cinecloud-series'].includes(catalogId)) return [];
      const results = [];
      for (const provider of providers) {
        try {
          const items = await provider.catalog({ type, search });
          if (Array.isArray(items)) results.push(...items);
        } catch (error) {
          logger.warn?.(`[providers] "${provider.id}" catalog failed; continuing with remaining providers.`);
        }
      }
      const seen = new Set();
      return results.filter((item) => {
        if (!item || !item.id || seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      });
    },
    async meta({ type, id } = {}) {
      const provider = providerForId(id);
      if (!provider) return null;
      try {
        return await provider.meta({ type, id });
      } catch (error) {
        logger.warn?.(`[providers] "${provider.id}" metadata lookup failed.`);
        return null;
      }
    },
    async streams({ type, id } = {}) {
      const provider = providerForId(id);
      if (!provider) return [];
      try {
        const streams = await provider.streams({ type, id });
        return Array.isArray(streams) ? streams : [];
      } catch (error) {
        logger.warn?.(`[providers] "${provider.id}" stream lookup failed.`);
        return [];
      }
    }
  };
}

module.exports = { createProviderRegistry, createLibraryProvider, parseProviderList };
