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

function adoptCatalogVersion(version) {
  const normalizedVersion = Number(version);
  if (Number.isInteger(normalizedVersion) && normalizedVersion >= 0) {
    latestCatalogVersion = normalizedVersion;
  }
}

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
    fresh = false,
  } = options;
  const normalizedVersion = Number.isInteger(Number(catalogVersion)) && Number(catalogVersion) > 0
    ? Math.floor(Number(catalogVersion))
    : 0;
  const endpoint = admin
    ? "/api/catalog-state?action=get"
    : `/api/catalog-state?action=get-public${fresh ? `&fresh=1&check=${createUuid()}` : (normalizedVersion ? `&v=${normalizedVersion}` : "")}`;
  return cachedRequest(
    admin ? SERVER_CACHE_KEYS.catalogAdmin : SERVER_CACHE_KEYS.catalogPublic,
    () => requestJson(endpoint, {
      method: "GET",
      credentials: admin ? "include" : "omit",
    }),
    {
      force: force || fresh,
      preferCache: preferCache && !fresh,
      maxAgeMs,
      persist: !admin,
      allowStaleOnError: !force && !fresh,
    },
  ).then(rememberCatalogVersion);
}

function syncCatalogState(data, options = {}) {
  const requestedVersion = Number(options.baseCatalogVersion);
  const baseCatalogVersion = Number.isInteger(requestedVersion) && requestedVersion >= 0
    ? requestedVersion
    : latestCatalogVersion;
  return postJson("/api/catalog-state?action=sync", { data, baseCatalogVersion, writeProtocol: 2 }).then((response) => {
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

function syncMaintenanceState(maintenanceSettings) {
  return postJson("/api/catalog-state?action=sync-maintenance", { maintenanceSettings }).then((response) => {
    if (response?.ok) {
      rememberCatalogVersion(response);
      invalidateCachedRequest([SERVER_CACHE_KEYS.catalogPublic, SERVER_CACHE_KEYS.catalogAdmin, SERVER_CACHE_KEYS.realtimePublic, SERVER_CACHE_KEYS.realtimePrivate]);
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
      allowStaleOnError: !force,
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

function requestOrderDeletion(action, payload) {
  return postJson(`/api/orders?action=${action}`, payload).then((response) => {
    if (response?.ok) {
      invalidateCachedRequest([
        SERVER_CACHE_KEYS.catalogPublic,
        SERVER_CACHE_KEYS.catalogAdmin,
        SERVER_CACHE_KEYS.realtimePublic,
        SERVER_CACHE_KEYS.orders,
        SERVER_CACHE_KEYS.security,
        SERVER_CACHE_KEYS.realtimePrivate,
      ]);
    }
    return response;
  });
}

const RESERVATION_STORAGE_KEY = "adriego:checkout-reservation:v1";
let memoryReservationId = "";
export function getCheckoutReservationId() {
  try { return sessionStorage.getItem(RESERVATION_STORAGE_KEY) || memoryReservationId; } catch { return memoryReservationId; }
}
export function clearCheckoutReservation() {
  memoryReservationId = "";
  try { sessionStorage.removeItem(RESERVATION_STORAGE_KEY); } catch { /* Storage may be disabled. */ }
}
export async function checkServerCheckoutReservation(cart, { reserve = false, allowCartChanges = false } = {}) {
  const reservationId = getCheckoutReservationId();
  if (!reserve && !reservationId) return { ok: false, code: "RESERVATION_REQUIRED", message: "Revisa el carrito y confirma la entrega para reservar las prendas antes de pagar." };
  const result = await postJson(`/api/checkout-order?action=${reserve ? "reserve" : "reservation-status"}`, { cart, reservationId, allowCartChanges });
  if (result.ok && result.reservationId) {
    memoryReservationId = result.reservationId;
    try { sessionStorage.setItem(RESERVATION_STORAGE_KEY, result.reservationId); } catch { /* The cart also keeps the id in memory. */ }
    if (reserve) invalidateCachedRequest([SERVER_CACHE_KEYS.catalogPublic, SERVER_CACHE_KEYS.catalogAdmin, SERVER_CACHE_KEYS.realtimePublic, SERVER_CACHE_KEYS.realtimePrivate]);
  }
  return result;
}

export async function adjustServerCheckoutReservation(cart) {
  const reservationId = getCheckoutReservationId();
  if (!reservationId) return { ok: true };
  const result = await postJson("/api/checkout-order?action=adjust-reservation", { cart, reservationId });
  if (result.ok) {
    if (!result.remainingReservationId && getCheckoutReservationId() === reservationId) clearCheckoutReservation();
    invalidateCachedRequest([SERVER_CACHE_KEYS.catalogPublic, SERVER_CACHE_KEYS.catalogAdmin, SERVER_CACHE_KEYS.realtimePublic, SERVER_CACHE_KEYS.realtimePrivate]);
  }
  return result;
}

function deleteServerOrder(payload) {
  return requestOrderDeletion("delete", payload);
}

function deleteServerOrders(payload) {
  return requestOrderDeletion("delete-many", payload);
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
    () => requestJson(`/api/realtime-sync?action=${privateStatus ? "status" : "public-status"}${force && !privateStatus ? `&live=1&check=${createUuid()}` : ""}`, {
      method: "GET",
      credentials: privateStatus ? "include" : "omit",
    }),
    {
      force,
      preferCache,
      maxAgeMs,
      persist: false,
      allowStaleOnError: !force,
    },
  );
}

export {
  adoptCatalogVersion,
  getCatalogState,
  syncCatalogState,
  syncContactState,
  syncMaintenanceState,
  createServerCheckoutOrder,
  previewCouponApplication,
  listServerOrders,
  updateServerOrder,
  deleteServerOrder,
  deleteServerOrders,
  getSecurityMetricsSnapshot,
  resetSecurityMetricsSnapshot,
  getRealtimeSyncStatus,
};
