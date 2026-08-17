import { requestJson } from "./httpClient";
import { cachedRequest, invalidateCachedRequest } from "./smartCache";

const SERVER_CACHE_KEYS = {
  catalog: "server:catalog-state",
  orders: "server:orders-list",
  security: "server:security-metrics",
  realtime: "server:realtime-sync",
};

function postJson(endpoint, payload) {
  return requestJson(endpoint, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

function getCatalogState(options = {}) {
  const {
    force = false,
    preferCache = true,
    maxAgeMs = 25000,
  } = options;
  return cachedRequest(
    SERVER_CACHE_KEYS.catalog,
    () => requestJson("/api/catalog-state?action=get", {
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

function syncCatalogState(data) {
  return postJson("/api/catalog-state?action=sync", { data }).then((response) => {
    if (response?.ok) {
      invalidateCachedRequest([
        SERVER_CACHE_KEYS.catalog,
        SERVER_CACHE_KEYS.orders,
        SERVER_CACHE_KEYS.security,
        SERVER_CACHE_KEYS.realtime,
      ]);
    }
    return response;
  });
}

function createServerCheckoutOrder(payload) {
  return postJson("/api/checkout-order", payload).then((response) => {
    if (response?.ok) {
      invalidateCachedRequest([
        SERVER_CACHE_KEYS.catalog,
        SERVER_CACHE_KEYS.orders,
        SERVER_CACHE_KEYS.security,
        SERVER_CACHE_KEYS.realtime,
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
        SERVER_CACHE_KEYS.realtime,
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
        SERVER_CACHE_KEYS.realtime,
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
    force = false,
    preferCache = true,
    maxAgeMs = 3000,
  } = options;
  return cachedRequest(
    SERVER_CACHE_KEYS.realtime,
    () => requestJson("/api/realtime-sync?action=status", {
      method: "GET",
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
  createServerCheckoutOrder,
  previewCouponApplication,
  listServerOrders,
  updateServerOrder,
  deleteServerOrder,
  getSecurityMetricsSnapshot,
  resetSecurityMetricsSnapshot,
  getRealtimeSyncStatus,
};
