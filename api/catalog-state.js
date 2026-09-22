
import { createHmac, randomUUID } from "node:crypto";
import { Buffer } from "node:buffer";
import { normalizeMaintenanceSettings } from "../src/domain/store/maintenance.js";
import { fetchWithTimeout } from "./_lib/network.js";
import { notifyIndexNowInProduction } from "./_lib/indexNow.js";
import { FILE_SECURITY } from "../src/constants/product.js";
import { bumpRealtimeMeta, getStoreBackend, readStore, updateStore } from "./_lib/store.js";
import {
  sanitizeAdminCatalogPayload,
  sanitizeContactSettings,
  sanitizePhysicalStockEvents,
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
const MAX_PRODUCT_IMAGE_BYTES = FILE_SECURITY.maxCatalogImageBytes;
const ALLOWED_PRODUCT_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const IMAGEKIT_AUTH_LIFETIME_SECONDS = 10 * 60;
const IMAGEKIT_API_URL = "https://api.imagekit.io/v1/files";
const IMAGEKIT_CATALOG_IMAGE_PREFIX = "/catalog/products/";
const MAX_IMAGE_CLEANUP_PER_SYNC = 20;
const MAX_PENDING_IMAGE_CLEANUPS = 200;

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

function normalizeImageKitEndpoint(value = "") {
  try {
    const parsed = new URL(String(value || "").trim());
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) return "";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

function validateImageKitAuthPayload(payload = {}) {
  const contentType = normalizeLine(payload?.contentType || "").toLowerCase();
  const size = Math.floor(Number(payload?.size) || 0);
  if (!ALLOWED_PRODUCT_IMAGE_TYPES.includes(contentType)) {
    return { ok: false, message: "Solo se permiten imágenes JPG, PNG o WebP" };
  }
  if (size <= 0 || size > MAX_PRODUCT_IMAGE_BYTES) {
    return { ok: false, message: "La imagen optimizada excede el tamaño permitido" };
  }
  return { ok: true, contentType, size };
}

function createImageKitUploadAuth(privateKey, nowMs = Date.now()) {
  const token = randomUUID();
  const expire = Math.floor(nowMs / 1000) + IMAGEKIT_AUTH_LIFETIME_SECONDS;
  const signature = createHmac("sha1", privateKey).update(`${token}${expire}`).digest("hex");
  return { token, expire, signature };
}

function normalizeCatalogImagePath(value = "") {
  const path = String(value || "").trim();
  if (!path.startsWith(IMAGEKIT_CATALOG_IMAGE_PREFIX) || path.includes("\\") || path.includes("?")) return "";
  const parts = path.split("/").filter(Boolean);
  if (parts.length < 4 || parts.some((part) => part === "." || part === ".." || !part)) return "";
  if (!/\.(?:jpe?g|png|webp)$/i.test(parts.at(-1) || "")) return "";
  return `/${parts.join("/")}`;
}

function getCatalogImagePathFromUrl(value = "", urlEndpoint = "") {
  try {
    const imageUrl = new URL(String(value || "").trim());
    const endpoint = new URL(String(urlEndpoint || "").trim());
    if (imageUrl.protocol !== "https:" || endpoint.protocol !== "https:" || imageUrl.origin !== endpoint.origin) return "";
    const endpointPath = endpoint.pathname.replace(/\/$/, "");
    if (!imageUrl.pathname.startsWith(`${endpointPath}/`)) return "";
    return normalizeCatalogImagePath(decodeURIComponent(imageUrl.pathname.slice(endpointPath.length)));
  } catch {
    return "";
  }
}

function collectCatalogImagePaths(catalog = {}, urlEndpoint = "") {
  const urls = [];
  for (const product of (Array.isArray(catalog?.products) ? catalog.products : [])) {
    for (const images of Object.values(product?.imagesByColor || {})) {
      if (Array.isArray(images)) urls.push(...images);
    }
  }
  for (const slide of (Array.isArray(catalog?.storeSettings?.heroSlides) ? catalog.storeSettings.heroSlides : [])) {
    urls.push(slide?.image);
  }
  const seoImages = catalog?.storeSettings?.seoSettings;
  urls.push(seoImages?.faviconUrl, seoImages?.logoUrl, seoImages?.imageUrl);
  for (const account of (Array.isArray(catalog?.contactSettings?.paymentSettings?.bankAccounts)
    ? catalog.contactSettings.paymentSettings.bankAccounts
    : [])) {
    urls.push(account?.bankLogoImage, account?.bankQrImage);
  }
  return new Set(urls.map((url) => getCatalogImagePathFromUrl(url, urlEndpoint)).filter(Boolean));
}

function getPendingImageCleanupPaths(value = []) {
  return [...new Set((Array.isArray(value) ? value : [])
    .map(normalizeCatalogImagePath)
    .filter(Boolean))].slice(0, MAX_PENDING_IMAGE_CLEANUPS);
}

function getImageKitAuthorization(privateKey = "") {
  return `Basic ${Buffer.from(`${String(privateKey)}:`).toString("base64")}`;
}

async function deleteImageKitCatalogAssets(paths = [], privateKey = "", fetchFn = fetchWithTimeout) {
  const pendingPaths = getPendingImageCleanupPaths(paths).slice(0, MAX_IMAGE_CLEANUP_PER_SYNC);
  const deletedPaths = [];
  const retryPaths = [];
  if (!pendingPaths.length || !String(privateKey || "").trim()) {
    return { deletedPaths, retryPaths: pendingPaths };
  }

  const headers = { Accept: "application/json", Authorization: getImageKitAuthorization(privateKey) };
  const signal = AbortSignal.timeout(6000);
  for (const [index, imagePath] of pendingPaths.entries()) {
    if (signal.aborted) { retryPaths.push(...pendingPaths.slice(index)); break; }
    const segments = imagePath.split("/").filter(Boolean);
    const fileName = segments.pop();
    const folderPath = `/${segments.join("/")}`;
    try {
      const query = new URLSearchParams({ path: folderPath, searchQuery: `name = "${fileName}"`, fileType: "image", limit: "10" });
      const lookup = await fetchFn(`${IMAGEKIT_API_URL}?${query.toString()}`, { headers, signal });
      if (!lookup.ok) throw new Error(`imagekit-list-${lookup.status}`);
      const files = await lookup.json();
      const matchingFiles = (Array.isArray(files) ? files : []).filter((file) => (
        String(file?.name || "") === fileName && String(file?.path || "") === folderPath && String(file?.fileId || "")
      ));
      if (!matchingFiles.length) {
        // It may have been deleted manually. There is nothing left to retry.
        deletedPaths.push(imagePath);
        continue;
      }
      const deleteResults = await Promise.all(matchingFiles.map(async (file) => {
        const response = await fetchFn(`${IMAGEKIT_API_URL}/${encodeURIComponent(file.fileId)}`, { method: "DELETE", headers, signal });
        if (!response.ok && response.status !== 404) throw new Error(`imagekit-delete-${response.status}`);
      }));
      void deleteResults;
      deletedPaths.push(imagePath);
    } catch {
      retryPaths.push(imagePath);
    }
  }
  return { deletedPaths, retryPaths };
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
    if (body.type !== "imagekit.generate-upload-auth") {
      res.status(400).json({ ok: false, message: "Solicitud de carga no válida" });
      return;
    }

    const validatedPayload = validateImageKitAuthPayload(body.payload);
    if (!validatedPayload.ok) {
      res.status(400).json({ ok: false, message: validatedPayload.message });
      return;
    }

    const publicKey = String(process.env.IMAGEKIT_PUBLIC_KEY || "").trim();
    const privateKey = String(process.env.IMAGEKIT_PRIVATE_KEY || "").trim();
    const urlEndpoint = normalizeImageKitEndpoint(process.env.IMAGEKIT_URL_ENDPOINT);
    if (!publicKey || !privateKey || !urlEndpoint) {
      res.status(503).json({ ok: false, message: "ImageKit no está configurado. Agrega sus tres variables de entorno." });
      return;
    }

    res.status(200).json({
      ok: true,
      type: "imagekit.upload-auth",
      publicKey,
      urlEndpoint,
      ...createImageKitUploadAuth(privateKey),
    });
    return;
  }

  if (action === "get" || isPublicRead) {
    if (!["GET", "HEAD"].includes(String(req.method || "GET").toUpperCase())) {
      res.setHeader("Allow", "GET, HEAD");
      return res.status(405).json({ ok: false, message: "Method not allowed" });
    }
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
    const canReadPrivateCatalog = isAdmin && !isPublicRead;
    const payload = {
      products: canReadPrivateCatalog
        ? sanitizedCatalog.products
        : sanitizedCatalog.products.filter((product) => product?.isPublic !== false),
      contactSettings: sanitizedCatalog.contactSettings || null,
      storeSettings: sanitizedCatalog.storeSettings || null,
      productTypeRecords: sanitizedCatalog.productTypeRecords,
      filterTagRecords: sanitizedCatalog.filterTagRecords,
      catalogVersion: getCatalogVersion(store),
      storageBackend: getStoreBackend(),
    };

    if (canReadPrivateCatalog) {
      payload.coupons = sanitizedCatalog.coupons;
      payload.orderHistory = sanitizeArray(store.orders);
      payload.physicalStockEvents = sanitizePhysicalStockEvents(store.physicalStockEvents);
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    } else if (isPublicRead) {
      const requestedVersion = Number(req.query?.v);
      const isVersioned = Number.isInteger(requestedVersion)
        && requestedVersion > 0
        && requestedVersion === payload.catalogVersion;
      if (req.query?.fresh === "1") {
        res.setHeader("Cache-Control", "no-store, max-age=0");
        res.setHeader("Vercel-CDN-Cache-Control", "no-store");
      } else {
        setPublicCatalogCacheHeaders(res, { versioned: isVersioned });
      }
    } else {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    }

    res.status(200).json({ ok: true, data: payload });
    return;
  }

  if (action !== "sync" && action !== "sync-contact" && action !== "sync-maintenance") {
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

  if (action === "sync-maintenance") {
    if (typeof body?.maintenanceSettings?.enabled !== "boolean") {
      return res.status(400).json({ ok: false, message: "Indica si el mantenimiento está activo." });
    }
    const maintenanceSettings = normalizeMaintenanceSettings(body.maintenanceSettings);
    const nextStore = await updateStore((draft) => {
      draft.storeSettings = { ...(draft.storeSettings || {}), maintenanceSettings };
      bumpRealtimeMeta(draft, ["catalog"]);
      return draft;
    });
    return res.status(200).json({ ok: true, data: {
      maintenanceSettings,
      catalogVersion: getCatalogVersion(nextStore),
    } });
  }

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
          maintenanceSettings: normalizeMaintenanceSettings(draft.storeSettings?.maintenanceSettings),
        });
      }
      bumpRealtimeMeta(draft, ["catalog"]);
      return draft;
    });
    const sanitizedCatalog = buildSanitizedCatalogPayload(nextStore);
    await notifyIndexNowInProduction(sanitizedCatalog.products);
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

  // Older open tabs can automatically upload a fallback catalog on hydration.
  // Require the release that only writes after an explicit admin action.
  if (body?.writeProtocol !== 2) {
    res.status(409).json({ ok: false, code: "CATALOG_CLIENT_OUTDATED", message: "Actualiza la página antes de guardar. Esta versión antigua no puede modificar el catálogo." });
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
  const pendingInventoryMovement = sanitizePhysicalStockEvents(body?.data?.inventoryMovement ? [body.data.inventoryMovement] : [])[0] || null;
  const imageKitEndpoint = normalizeImageKitEndpoint(process.env.IMAGEKIT_URL_ENDPOINT);

  let conflictState = null;
  let queuedImageCleanupPaths = [];
  let nextStore = await updateStore((draft) => {
    const currentVersion = getCatalogVersion(draft);
    if (requestedBaseVersion !== currentVersion) {
      conflictState = {
        currentVersion,
        currentState: buildSanitizedCatalogPayload(draft),
      };
      return draft;
    }
    const previousImagePaths = collectCatalogImagePaths(draft, imageKitEndpoint);
    draft.products = sanitized.products;
    draft.coupons = sanitized.coupons;
    draft.contactSettings = sanitized.contactSettings;
    draft.storeSettings = { ...sanitized.storeSettings, maintenanceSettings: normalizeMaintenanceSettings(draft.storeSettings?.maintenanceSettings) };
    draft.productTypes = sanitized.productTypeRecords;
    draft.filterTags = sanitized.filterTagRecords;
    const retainedImagePaths = collectCatalogImagePaths(draft, imageKitEndpoint);
    const noLongerReferencedPaths = [...previousImagePaths].filter((imagePath) => !retainedImagePaths.has(imagePath));
    const currentQueue = getPendingImageCleanupPaths(draft?.meta?.imageCleanupQueue);
    queuedImageCleanupPaths = getPendingImageCleanupPaths([...currentQueue, ...noLongerReferencedPaths]).filter(imagePath => !retainedImagePaths.has(imagePath));
    draft.meta = {
      ...(draft.meta || {}),
      imageCleanupQueue: queuedImageCleanupPaths,
    };
    if (pendingInventoryMovement) {
      const existingEvents = Array.isArray(draft.physicalStockEvents) ? draft.physicalStockEvents : [];
      if (!existingEvents.some((event) => String(event?.id) === pendingInventoryMovement.id)) {
        draft.physicalStockEvents = [...existingEvents, pendingInventoryMovement].slice(-80);
      }
    }
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
  const imageCleanup = await deleteImageKitCatalogAssets(
    queuedImageCleanupPaths,
    String(process.env.IMAGEKIT_PRIVATE_KEY || "").trim(),
  );
  if (imageCleanup.deletedPaths.length) {
    const deletedPathSet = new Set(imageCleanup.deletedPaths);
    nextStore = await updateStore((draft) => {
      const queue = getPendingImageCleanupPaths(draft?.meta?.imageCleanupQueue)
        .filter((imagePath) => !deletedPathSet.has(imagePath));
      draft.meta = { ...(draft.meta || {}), imageCleanupQueue: queue };
      return draft;
    });
  }
  const sanitizedCatalog = buildSanitizedCatalogPayload(nextStore);
  await notifyIndexNowInProduction(sanitizedCatalog.products);

  res.status(200).json({
    ok: true,
    data: {
      products: sanitizedCatalog.products,
      coupons: sanitizedCatalog.coupons,
      orderHistory: sanitizeArray(nextStore.orders),
      physicalStockEvents: sanitizePhysicalStockEvents(nextStore.physicalStockEvents),
      contactSettings: sanitizedCatalog.contactSettings || null,
      storeSettings: sanitizedCatalog.storeSettings || null,
      productTypeRecords: sanitizedCatalog.productTypeRecords,
      filterTagRecords: sanitizedCatalog.filterTagRecords,
      catalogVersion: getCatalogVersion(nextStore),
      storageBackend: getStoreBackend(),
      imageCleanup: {
        deleted: imageCleanup.deletedPaths.length,
        pending: getPendingImageCleanupPaths(nextStore?.meta?.imageCleanupQueue).length,
      },
    },
  });
}

export {
  ALLOWED_PRODUCT_IMAGE_TYPES,
  collectCatalogImagePaths,
  deleteImageKitCatalogAssets,
  getCatalogImagePathFromUrl,
  getPendingImageCleanupPaths,
  MAX_PRODUCT_IMAGE_BYTES,
  createImageKitUploadAuth,
  normalizeImageKitEndpoint,
  validateImageKitAuthPayload,
};

