
import { handleUpload } from "@vercel/blob/client";
import { bumpRealtimeMeta, getStoreBackend, readStore, updateStore } from "./_lib/store.js";
import {
  sanitizeAdminCatalogPayload,
  sanitizeContactSettings,
  sanitizeStoreSettings,
} from "./_lib/storeSanitizers.js";
import {
  consumeRateLimit,
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
const MAX_PRODUCT_IMAGE_BYTES = 150 * 1024;
const ALLOWED_PRODUCT_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const PRODUCT_IMAGE_PATH_PATTERN = /^catalog\/products\/\d{4}-\d{2}\/[a-f0-9-]{20,}\.(?:jpe?g|png|webp)$/i;

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

function getCatalogImageUploadPolicy(pathname, multipart = false) {
  const safePathname = normalizeLine(pathname || "");
  if (multipart || !PRODUCT_IMAGE_PATH_PATTERN.test(safePathname)) {
    throw new Error("Ruta de imagen no permitida");
  }
  return {
    allowedContentTypes: ALLOWED_PRODUCT_IMAGE_TYPES,
    maximumSizeInBytes: MAX_PRODUCT_IMAGE_BYTES,
    addRandomSuffix: true,
    allowOverwrite: false,
    cacheControlMaxAge: 60 * 60 * 24 * 365,
    validUntil: Date.now() + (5 * 60 * 1000),
  };
}

function setPublicCatalogCacheHeaders(res, { versioned = false } = {}) {
  res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
  res.setHeader(
    "Vercel-CDN-Cache-Control",
    versioned
      ? "public, s-maxage=31536000, stale-while-revalidate=86400"
      : "public, s-maxage=60, stale-while-revalidate=300",
  );
}

export default async function handler(req, res) {
  monitorApiRequest(req, res, ENDPOINT_NAME);
  setCommonSecurityHeaders(res);

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
  const isPublicRead = action === "get-public";
  const adminSession = isPublicRead ? null : resolveAdminSession(req);
  const isAdmin = Boolean(adminSession);
  const clientIp = getClientIp(req);

  if (action === "image-upload") {
    if (!isOriginAllowed(req, getAllowedOrigins(process.env.ADMIN_ALLOWED_ORIGIN))) {
      res.status(403).json({ ok: false, message: "Origen no permitido" });
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

    const uploadRateLimit = await consumeRateLimit("catalog-image-upload-admin-ip", clientIp, 120, 10 * 60 * 1000, {
      endpoint: ENDPOINT_NAME,
      ip: clientIp,
    });
    if (!uploadRateLimit.ok) {
      res.setHeader("Retry-After", String(Math.ceil(uploadRateLimit.retryAfterMs / 1000)));
      res.status(429).json({ ok: false, message: "Too many requests" });
      return;
    }

    const body = requireJsonBody(req, res, { endpoint: ENDPOINT_NAME });
    if (!body) return;
    if (body.type !== "blob.generate-client-token") {
      res.status(400).json({ ok: false, message: "Solicitud de carga no válida" });
      return;
    }

    const blobToken = String(process.env.BLOB_READ_WRITE_TOKEN || "").trim();
    if (!blobToken) {
      res.status(503).json({ ok: false, message: "Almacenamiento de imágenes no configurado" });
      return;
    }

    try {
      const response = await handleUpload({
        token: blobToken,
        request: req,
        body,
        onBeforeGenerateToken: async (pathname, _clientPayload, multipart) => (
          getCatalogImageUploadPolicy(pathname, multipart)
        ),
      });
      res.status(200).json(response);
    } catch {
      res.status(400).json({ ok: false, message: "No se pudo autorizar la carga de la imagen" });
    }
    return;
  }

  if (action === "get" || isPublicRead) {
    const rateLimit = await consumeRateLimit(isPublicRead ? "catalog-get-public-ip" : "catalog-get-ip", clientIp, 180, 10 * 60 * 1000, {
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

    if (isAdmin && !isPublicRead) {
      payload.coupons = sanitizedCatalog.coupons;
      payload.orderHistory = sanitizeArray(store.orders);
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    } else if (isPublicRead) {
      const requestedVersion = Number(req.query?.v);
      const isVersioned = Number.isInteger(requestedVersion)
        && requestedVersion > 0
        && requestedVersion === payload.catalogVersion;
      setPublicCatalogCacheHeaders(res, { versioned: isVersioned });
    } else {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
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

  const syncRateLimit = await consumeRateLimit("catalog-sync-admin-ip", clientIp, 300, 10 * 60 * 1000, {
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

export {
  ALLOWED_PRODUCT_IMAGE_TYPES,
  MAX_PRODUCT_IMAGE_BYTES,
  getCatalogImageUploadPolicy,
};

