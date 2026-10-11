'use strict';

const DEFAULT_TIMEOUT_MS = 5000;
const CACHE_TTL_MS = 30_000;
const PROVIDER_ID = 'pikahd';

function asHttpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

function isAllowedFeedEndpoint(value) {
  const url = asHttpsUrl(value);
  if (!url) return false;
  // Do not crawl the third-party streaming website. Configure an authorized JSON feed
  // hosted on a service you control or have explicit permission to access.
  const host = url.hostname.toLowerCase();
  if (host === 'pikahd.co' || host.endsWith('.pikahd.co')) return false;
  return true;
}

function cleanString(value, maxLength = 500) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

function slugify(value) {
  return cleanString(value, 180)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

function normalizeDirectStream(value, fallbackTitle = '') {
  const rawUrl = typeof value === 'string' ? value : value && value.url;
  const url = asHttpsUrl(rawUrl);
  if (!url) return null;
  // Only direct media file URLs are accepted; embedded players and player APIs are not
  // resolved or scraped. HLS manifests and common direct video files are supported.
  if (!/\.(m3u8|mp4|m4v|webm|mov|mkv)(?:$)/i.test(url.pathname)) return null;
  const title = cleanString(value && typeof value === 'object' ? value.title : '', 200)
    || fallbackTitle
    || 'Licensed stream';
  return {
    name: cleanString(value && typeof value === 'object' ? value.name : '', 80) || 'CineCloud • Authorized feed',
    title,
    url: url.toString()
  };
}

function normalizeItem(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const name = cleanString(raw.name || raw.title, 250);
  const idBase = slugify(raw.id || name);
  const type = raw.type === 'series' ? 'series' : raw.type === 'movie' ? 'movie' : null;
  if (!name || !idBase || !type) return null;

  const posterUrl = asHttpsUrl(raw.poster || raw.posterUrl || raw.poster_url);
  const backgroundUrl = asHttpsUrl(raw.background || raw.backgroundUrl);
  const genres = Array.isArray(raw.genres) ? raw.genres : Array.isArray(raw.tags) ? raw.tags : [];
  const streamsIn = Array.isArray(raw.streams) ? raw.streams : raw.streamUrl ? [raw.streamUrl] : [];
  const streams = streamsIn
    .map((stream) => normalizeDirectStream(stream, name))
    .filter(Boolean);

  return {
    id: idBase.startsWith(`${PROVIDER_ID}:`) ? idBase : `${PROVIDER_ID}:${idBase}`,
    type,
    name,
    description: cleanString(raw.description, 3000),
    releaseInfo: cleanString(raw.releaseInfo || raw.year, 50),
    genres: [...new Set(genres.map((tag) => cleanString(tag, 80)).filter(Boolean))].slice(0, 30),
    poster: posterUrl ? posterUrl.toString() : undefined,
    background: backgroundUrl ? backgroundUrl.toString() : undefined,
    streams,
    source: PROVIDER_ID
  };
}

function createPikahdProvider({
  endpoint = process.env.PIKAHD_API_URL,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  cacheTtlMs = CACHE_TTL_MS,
  logger = console
} = {}) {
  let cachedItems = null;
  let cacheExpiresAt = 0;
  let pendingFetch = null;

  async function loadItems() {
    if (!endpoint || !isAllowedFeedEndpoint(endpoint) || typeof fetchImpl !== 'function') {
      return [];
    }
    if (cachedItems && Date.now() < cacheExpiresAt) return cachedItems;
    if (pendingFetch) return pendingFetch;

    pendingFetch = (async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(endpoint, {
          headers: { accept: 'application/json' },
          signal: controller.signal
        });
        if (!response || !response.ok) {
          logger.warn?.('[pikahd] Authorized feed request failed; provider returning empty results.');
          return [];
        }
        const contentType = response.headers?.get?.('content-type') || '';
        if (contentType && !contentType.toLowerCase().includes('json')) {
          logger.warn?.('[pikahd] Authorized feed did not return JSON; provider returning empty results.');
          return [];
        }
        const payload = await response.json();
        const rawItems = Array.isArray(payload) ? payload : payload && payload.items;
        if (!Array.isArray(rawItems)) {
          logger.warn?.('[pikahd] Authorized feed schema is invalid; provider returning empty results.');
          return [];
        }
        const normalized = rawItems.map(normalizeItem).filter(Boolean);
        cachedItems = normalized;
        cacheExpiresAt = Date.now() + Math.max(0, cacheTtlMs);
        return normalized;
      } catch (error) {
        logger.warn?.(`[pikahd] Authorized feed unavailable (${error && error.name ? error.name : 'network error'}); provider returning empty results.`);
        return [];
      } finally {
        clearTimeout(timeout);
        pendingFetch = null;
      }
    })();

    return pendingFetch;
  }

  return {
    id: PROVIDER_ID,
    isConfigured: () => Boolean(endpoint && isAllowedFeedEndpoint(endpoint)),
    ownsId: (id) => typeof id === 'string' && id.startsWith(`${PROVIDER_ID}:`),
    async catalog({ type, search = '' } = {}) {
      try {
        const query = cleanString(search, 200).toLocaleLowerCase('en');
        return (await loadItems())
          .filter((item) => !type || item.type === type)
          .filter((item) => !query || `${item.name} ${item.description} ${item.genres.join(' ')}`.toLocaleLowerCase('en').includes(query))
          .map(({ streams, ...item }) => item);
      } catch (error) {
        logger.warn?.('[pikahd] Catalog lookup failed; returning empty results.');
        return [];
      }
    },
    async meta({ type, id } = {}) {
      try {
        const item = (await loadItems()).find((entry) => entry.id === id && (!type || entry.type === type));
        if (!item) return null;
        const { streams, ...meta } = item;
        return meta;
      } catch {
        return null;
      }
    },
    async streams({ type, id } = {}) {
      try {
        const item = (await loadItems()).find((entry) => entry.id === id && (!type || entry.type === type));
        return item ? item.streams : [];
      } catch {
        return [];
      }
    }
  };
}

module.exports = {
  createPikahdProvider,
  isAllowedFeedEndpoint,
  normalizeDirectStream,
  normalizeItem
};
