
import { bumpRealtimeMeta, getStoreBackend, readStore, updateStore } from "./_lib/store.js";
import {
  sanitizeAdminCatalogPayload,
  sanitizeContactSettings,
  sanitizeStoreSettings,
} from "./_lib/storeSanitizers.js";
import {
  consumeRateLimit,
  ensureCsrfCookie,
  getAllowedOrigins,
  getClientIp,
  isOriginAllowed,
  monitorApiRequest,
  normalizeLine,
  parseCookies,
  requireJsonBody,
  requireCsrf,
  setCommonSecurityHeaders,
  verifySignedToken,
} from "./_lib/security.js";

const ADMIN_COOKIE_NAME = "adriego_admin_session";
const ENDPOINT_NAME = "catalog-state";

function sanitizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function buildSanitizedCatalogPayload(store = {}) {
  return sanitizeAdminCatalogPayload({
    products: sanitizeArray(store.products),
    coupons: sanitizeArray(store.coupons),
    contactSettings: store.contactSettings || null,
    storeSettings: store.storeSettings || null,
    productTypeRecords: sanitizeArray(store.productTypes),
    filterTagRecords: sanitizeArray(store.filterTags),
  });
}

function getCatalogVersion(store = {}) {
  return Math.max(0, Math.floor(Number(store?.meta?.realtime?.catalogVersion) || 0));
}
function resolveAdminSession(req) {
  const sessionSecret = String(process.env.ADMIN_SESSION_SECRET || "").trim();
  if (!sessionSecret) return null;
  const cookies = parseCookies(req.headers?.cookie || "");
  return verifySignedToken(cookies[ADMIN_COOKIE_NAME] || cookies.atelier_admin_session || "", sessionSecret);
}

export default async function handler(req, res) {
  monitorApiRequest(req, res, ENDPOINT_NAME);
  setCommonSecurityHeaders(res);
  ensureCsrfCookie(req, res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  const allowedOrigins = getAllowedOrigins(
    process.env.USER_ALLOWED_ORIGIN,
    process.env.ADMIN_ALLOWED_ORIGIN,
  );
  if (!isOriginAllowed(req, allowedOrigins)) {
    res.status(403).json({ ok: false, message: "Origen no permitido" });
    return;
  }

  const action = normalizeLine(req.query?.action || "get").toLowerCase();
  const adminSession = resolveAdminSession(req);
  const isAdmin = Boolean(adminSession);
  const clientIp = getClientIp(req);

  if (action === "get") {
    const rateLimit = await consumeRateLimit("catalog-get-ip", clientIp, 180, 10 * 60 * 1000, {
      endpoint: ENDPOINT_NAME,
      ip: clientIp,
    });
    if (!rateLimit.ok) {
      res.setHeader("Retry-After", String(Math.ceil(rateLimit.retryAfterMs / 1000)));
      res.status(429).json({ ok: false, message: "Too many requests" });
      return;
    }

    const store = await readStore();
    const sanitizedCatalog = buildSanitizedCatalogPayload(store);
    const payload = {
      products: sanitizedCatalog.products,
      contactSettings: sanitizedCatalog.contactSettings || null,
      storeSettings: sanitizedCatalog.storeSettings || null,
      productTypeRecords: sanitizedCatalog.productTypeRecords,
      filterTagRecords: sanitizedCatalog.filterTagRecords,
      catalogVersion: getCatalogVersion(store),
      storageBackend: getStoreBackend(),
    };

    if (isAdmin) {
      payload.coupons = sanitizedCatalog.coupons;
      payload.orderHistory = sanitizeArray(store.orders);
    }

    res.status(200).json({ ok: true, data: payload });
    return;
  }

  if (action !== "sync" && action !== "sync-contact") {
    res.status(400).json({ ok: false, message: "Accion no valida" });
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ ok: false, message: "Method not allowed" });
    return;
  }

  if (!requireCsrf(req, res, { endpoint: ENDPOINT_NAME })) return;

  if (!isAdmin) {
    res.status(401).json({ ok: false, message: "No autorizado" });
    return;
  }

  const syncRateLimit = await consumeRateLimit("catalog-sync-admin-ip", clientIp, 60, 10 * 60 * 1000, {
    endpoint: ENDPOINT_NAME,
    ip: clientIp,
  });
  if (!syncRateLimit.ok) {
    res.setHeader("Retry-After", String(Math.ceil(syncRateLimit.retryAfterMs / 1000)));
    res.status(429).json({ ok: false, message: "Too many requests" });
    return;
  }

  const body = requireJsonBody(req, res, { endpoint: ENDPOINT_NAME });
  if (!body) return;

  if (action === "sync-contact") {
    const nextContactSettings = sanitizeContactSettings(body?.contactSettings || {});
    const rawStoreSettings = body?.storeSettings && typeof body.storeSettings === "object"
      ? body.storeSettings
      : null;
    const nextStore = await updateStore((draft) => {
      draft.contactSettings = nextContactSettings;
      if (rawStoreSettings) {
        draft.storeSettings = sanitizeStoreSettings({
          ...(draft.storeSettings || {}),
          ...rawStoreSettings,
        });
      }
      bumpRealtimeMeta(draft, ["catalog"]);
      return draft;
    });
    const sanitizedCatalog = buildSanitizedCatalogPayload(nextStore);
    res.status(200).json({
      ok: true,
      data: {
        contactSettings: sanitizedCatalog.contactSettings || null,
        storeSettings: sanitizedCatalog.storeSettings || null,
        catalogVersion: getCatalogVersion(nextStore),
        storageBackend: getStoreBackend(),
      },
    });
    return;
  }

  const requestedBaseVersion = Number(body?.baseCatalogVersion);
  if (!Number.isInteger(requestedBaseVersion) || requestedBaseVersion < 0) {
    res.status(400).json({
      ok: false,
      code: "INVALID_CATALOG_VERSION",
      message: "baseCatalogVersion es requerido para guardar el catalogo.",
    });
    return;
  }
  const sanitized = sanitizeAdminCatalogPayload(body?.data && typeof body.data === "object" ? body.data : {});

  let conflictState = null;
  const nextStore = await updateStore((draft) => {
    const currentVersion = getCatalogVersion(draft);
    if (requestedBaseVersion !== currentVersion) {
      conflictState = {
        currentVersion,
        currentState: buildSanitizedCatalogPayload(draft),
      };
      return draft;
    }
    draft.products = sanitized.products;
    draft.coupons = sanitized.coupons;
    draft.contactSettings = sanitized.contactSettings;
    draft.storeSettings = sanitized.storeSettings;
    draft.productTypes = sanitized.productTypeRecords;
    draft.filterTags = sanitized.filterTagRecords;
    bumpRealtimeMeta(draft, ["catalog"]);
    return draft;
  });

  if (conflictState) {
    res.status(409).json({
      ok: false,
      code: "CATALOG_VERSION_CONFLICT",
      message: "El catalogo cambio en otra sesion. Recarga antes de guardar.",
      currentVersion: conflictState.currentVersion,
      currentState: {
        ...conflictState.currentState,
        catalogVersion: conflictState.currentVersion,
      },
    });
    return;
  }
  const sanitizedCatalog = buildSanitizedCatalogPayload(nextStore);

  res.status(200).json({
    ok: true,
    data: {
      products: sanitizedCatalog.products,
      coupons: sanitizedCatalog.coupons,
      orderHistory: sanitizeArray(nextStore.orders),
      contactSettings: sanitizedCatalog.contactSettings || null,
      storeSettings: sanitizedCatalog.storeSettings || null,
      productTypeRecords: sanitizedCatalog.productTypeRecords,
      filterTagRecords: sanitizedCatalog.filterTagRecords,
      catalogVersion: getCatalogVersion(nextStore),
      storageBackend: getStoreBackend(),
    },
  });
}

