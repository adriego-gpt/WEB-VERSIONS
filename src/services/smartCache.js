const CACHE_PREFIX = "atelier-smart-cache-v1:";
const memoryCache = new Map();
const inflightCache = new Map();

function nowMs() {
  return Date.now();
}

function resolveStorageKey(key = "") {
  return `${CACHE_PREFIX}${String(key || "").trim()}`;
}

function readPersistedCache(key = "") {
  if (typeof window === "undefined") return null;
  try {
    const rawValue = window.sessionStorage.getItem(resolveStorageKey(key));
    if (!rawValue) return null;
    const parsed = JSON.parse(rawValue);
    if (!parsed || typeof parsed !== "object") return null;
    if (!Number.isFinite(Number(parsed.timestamp))) return null;
    return {
      value: parsed.value,
      timestamp: Number(parsed.timestamp),
    };
  } catch {
    return null;
  }
}

function writePersistedCache(key = "", entry = null) {
  if (typeof window === "undefined") return;
  try {
    if (!entry) {
      window.sessionStorage.removeItem(resolveStorageKey(key));
      return;
    }
    window.sessionStorage.setItem(resolveStorageKey(key), JSON.stringify({
      value: entry.value,
      timestamp: entry.timestamp,
    }));
  } catch {
    // Ignore cache persistence failures.
  }
}

function getCacheEntry(cacheKey = "", { persist = true } = {}) {
  const key = String(cacheKey || "").trim();
  if (!key) return null;
  const inMemoryEntry = memoryCache.get(key);
  if (inMemoryEntry) return inMemoryEntry;
  if (!persist) return null;
  const persistedEntry = readPersistedCache(key);
  if (!persistedEntry) return null;
  memoryCache.set(key, persistedEntry);
  return persistedEntry;
}

function setCacheEntry(cacheKey = "", response = null, { persist = true } = {}) {
  const key = String(cacheKey || "").trim();
  if (!key || !response) return;
  const entry = {
    value: response,
    timestamp: nowMs(),
  };
  memoryCache.set(key, entry);
  if (persist) {
    writePersistedCache(key, entry);
  }
}

function createCacheMeta(entry = null, maxAgeMs = 0) {
  if (!entry) {
    return {
      hit: false,
      stale: false,
      ageMs: 0,
    };
  }
  const ageMs = Math.max(0, nowMs() - Number(entry.timestamp || 0));
  return {
    hit: true,
    stale: ageMs > Math.max(0, Number(maxAgeMs) || 0),
    ageMs,
  };
}

async function cachedRequest(cacheKey = "", fetcher, options = {}) {
  const key = String(cacheKey || "").trim();
  if (!key || typeof fetcher !== "function") {
    return fetcher();
  }

  const {
    maxAgeMs = 20000,
    force = false,
    preferCache = true,
    allowStaleOnError = true,
    persist = true,
  } = options;

  const cachedEntry = getCacheEntry(key, { persist });
  const cachedMeta = createCacheMeta(cachedEntry, maxAgeMs);

  if (!force && cachedEntry && (preferCache || !cachedMeta.stale)) {
    return {
      ...(cachedEntry.value || {}),
      cache: cachedMeta,
    };
  }

  const inflightRequest = inflightCache.get(key);
  if (inflightRequest && !force) {
    return inflightRequest;
  }

  const requestPromise = Promise.resolve()
    .then(() => fetcher())
    .then((response) => {
      if (response?.ok) {
        setCacheEntry(key, response, { persist });
      }
      if (!response?.ok && cachedEntry && allowStaleOnError) {
        return {
          ...(cachedEntry.value || {}),
          ok: true,
          cache: {
            ...cachedMeta,
            stale: true,
            fallback: true,
          },
        };
      }
      return {
        ...(response || {}),
        cache: {
          hit: false,
          stale: false,
          ageMs: 0,
        },
      };
    })
    .finally(() => {
      const active = inflightCache.get(key);
      if (active === requestPromise) {
        inflightCache.delete(key);
      }
    });

  inflightCache.set(key, requestPromise);
  return requestPromise;
}

function invalidateCachedRequest(cacheKeys = []) {
  const keys = Array.isArray(cacheKeys) ? cacheKeys : [cacheKeys];
  keys
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .forEach((key) => {
      memoryCache.delete(key);
      inflightCache.delete(key);
      writePersistedCache(key, null);
    });
}

export {
  cachedRequest,
  invalidateCachedRequest,
};
