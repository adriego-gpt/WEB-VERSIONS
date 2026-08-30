import { requestJson } from "./httpClient.js";
import { cachedRequest, invalidateCachedRequest } from "./smartCache.js";
import { createUuid } from "../utils/uid.js";

const SERVER_CACHE_KEYS = {
  catalogPublic: "server:catalog-state:public",
  catalogAdmin: "server:catalog-state:admin",
  orders: "server:orders-list",
  security: "server:security-metrics",
  realtimePublic: "server:realtime-sync:public",
  realtimePrivate: "server:realtime-sync:private",
};

let latestCatalogVersion = 0;

function rememberCatalogVersion(response) {
  const version = Number(response?.data?.catalogVersion);
  if (Number.isInteger(version) && version >= 0) {
    latestCatalogVersion = version;
  }
  return response;
}

function postJson(endpoint, payload) {
  return requestJson(endpoint, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

function getCatalogState(options = {}) {
  const {
    admin = false,
    catalogVersion = latestCatalogVersion,
    force = false,
    preferCache = true,
    maxAgeMs = 25000,
  } = options;
  const normalizedVersion = Number.isInteger(Number(catalogVersion)) && Number(catalogVersion) > 0
    ? Math.floor(Number(catalogVersion))
    : 0;
  const endpoint = admin
    ? "/api/catalog-state?action=get"
    : `/api/catalog-state?action=get-public${normalizedVersion ? `&v=${normalizedVersion}` : ""}`;
  return cachedRequest(
    admin ? SERVER_CACHE_KEYS.catalogAdmin : SERVER_CACHE_KEYS.catalogPublic,
    () => requestJson(endpoint, {
      method: "GET",
      credentials: admin ? "include" : "omit",
    }),
    {
      force,
      preferCache,
      maxAgeMs,
      persist: !admin,
    },
  ).then(rememberCatalogVersion);
}

function syncCatalogState(data, options = {}) {
  const requestedVersion = Number(options.baseCatalogVersion);
  const baseCatalogVersion = Number.isInteger(requestedVersion) && requestedVersion >= 0
    ? requestedVersion
    : latestCatalogVersion;
  return postJson("/api/catalog-state?action=sync", { data, baseCatalogVersion }).then((response) => {
    if (response?.ok) {
      rememberCatalogVersion(response);
      invalidateCachedRequest([
        SERVER_CACHE_KEYS.catalogPublic,
        SERVER_CACHE_KEYS.catalogAdmin,
        SERVER_CACHE_KEYS.orders,
        SERVER_CACHE_KEYS.security,
        SERVER_CACHE_KEYS.realtimePublic,
        SERVER_CACHE_KEYS.realtimePrivate,
      ]);
    }
    return response;
  });
}

function syncContactState(contactSettings, storeSettings) {
  return postJson("/api/catalog-state?action=sync-contact", {
    contactSettings,
    storeSettings,
  }).then((response) => {
    if (response?.ok) {
      rememberCatalogVersion(response);
      invalidateCachedRequest([
        SERVER_CACHE_KEYS.catalogPublic,
        SERVER_CACHE_KEYS.catalogAdmin,
        SERVER_CACHE_KEYS.realtimePublic,
        SERVER_CACHE_KEYS.realtimePrivate,
      ]);
    }
    return response;
  });
}

function createServerCheckoutOrder(payload) {
  const requestPayload = {
    ...payload,
    idempotencyKey: payload?.idempotencyKey || createUuid(),
  };
  return postJson("/api/checkout-order", requestPayload).then((response) => {
    if (response?.ok) {
      invalidateCachedRequest([
        SERVER_CACHE_KEYS.catalogPublic,
        SERVER_CACHE_KEYS.catalogAdmin,
        SERVER_CACHE_KEYS.orders,
        SERVER_CACHE_KEYS.security,
        SERVER_CACHE_KEYS.realtimePublic,
        SERVER_CACHE_KEYS.realtimePrivate,
      ]);
    }
    return response;
  });
}

function previewCouponApplication(payload) {
  return postJson("/api/coupon-preview", payload);
}

function listServerOrders(options = {}) {
  const {
    force = false,
    preferCache = true,
    maxAgeMs = 12000,
  } = options;
  return cachedRequest(
    SERVER_CACHE_KEYS.orders,
    () => requestJson("/api/orders?action=list", {
      method: "GET",
    }),
    {
      force,
      preferCache,
      maxAgeMs,
      persist: true,
    },
  );
}

function updateServerOrder(payload) {
  return postJson("/api/orders?action=update", payload).then((response) => {
    if (response?.ok) {
      invalidateCachedRequest([
        SERVER_CACHE_KEYS.orders,
        SERVER_CACHE_KEYS.security,
        SERVER_CACHE_KEYS.realtimePrivate,
      ]);
    }
    return response;
  });
}

function deleteServerOrder(payload) {
  return postJson("/api/orders?action=delete", payload).then((response) => {
    if (response?.ok) {
      invalidateCachedRequest([
        SERVER_CACHE_KEYS.orders,
        SERVER_CACHE_KEYS.security,
        SERVER_CACHE_KEYS.realtimePrivate,
      ]);
    }
    return response;
  });
}

function getSecurityMetricsSnapshot(options = {}) {
  const {
    force = false,
    preferCache = true,
    maxAgeMs = 30000,
  } = options;
  return cachedRequest(
    SERVER_CACHE_KEYS.security,
    () => requestJson("/api/security-metrics?action=snapshot", {
      method: "GET",
    }),
    {
      force,
      preferCache,
      maxAgeMs,
      persist: true,
    },
  );
}

function resetSecurityMetricsSnapshot() {
  return postJson("/api/security-metrics?action=reset", {}).then((response) => {
    if (response?.ok) {
      invalidateCachedRequest(SERVER_CACHE_KEYS.security);
    }
    return response;
  });
}

function getRealtimeSyncStatus(options = {}) {
  const {
    privateStatus = false,
    force = false,
    preferCache = true,
    maxAgeMs = 3000,
  } = options;
  return cachedRequest(
    privateStatus ? SERVER_CACHE_KEYS.realtimePrivate : SERVER_CACHE_KEYS.realtimePublic,
    () => requestJson(`/api/realtime-sync?action=${privateStatus ? "status" : "public-status"}`, {
      method: "GET",
      credentials: privateStatus ? "include" : "omit",
    }),
    {
      force,
      preferCache,
      maxAgeMs,
      persist: false,
    },
  );
}

export {
  getCatalogState,
  syncCatalogState,
  syncContactState,
  createServerCheckoutOrder,
  previewCouponApplication,
  listServerOrders,
  updateServerOrder,
  deleteServerOrder,
  getSecurityMetricsSnapshot,
  resetSecurityMetricsSnapshot,
  getRealtimeSyncStatus,
};
