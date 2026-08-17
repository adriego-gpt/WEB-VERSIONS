/* global process */

import { bumpRealtimeMeta, getStoreBackend, readStore, updateStore } from "./_lib/store.js";
import { sanitizeAdminCatalogPayload } from "./_lib/storeSanitizers.js";
import {
  ensureCsrfCookie,
  getAllowedOrigins,
  isOriginAllowed,
  monitorApiRequest,
  normalizeLine,
  parseCookies,
  requireJsonBody,
  requireCsrf,
  setCommonSecurityHeaders,
  verifySignedToken,
} from "./_lib/security.js";

const ADMIN_COOKIE_NAME = "atelier_admin_session";
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

function resolveAdminSession(req) {
  const sessionSecret = String(process.env.ADMIN_SESSION_SECRET || "").trim();
  if (!sessionSecret) return null;
  const cookies = parseCookies(req.headers?.cookie || "");
  return verifySignedToken(cookies[ADMIN_COOKIE_NAME] || "", sessionSecret);
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

  if (action === "get") {
    const store = await readStore();
    const sanitizedCatalog = buildSanitizedCatalogPayload(store);
    const payload = {
      products: sanitizedCatalog.products,
      contactSettings: sanitizedCatalog.contactSettings || null,
      storeSettings: sanitizedCatalog.storeSettings || null,
      productTypeRecords: sanitizedCatalog.productTypeRecords,
      filterTagRecords: sanitizedCatalog.filterTagRecords,
      storageBackend: getStoreBackend(),
    };

    if (isAdmin) {
      payload.coupons = sanitizedCatalog.coupons;
      payload.orderHistory = sanitizeArray(store.orders);
    }

    res.status(200).json({ ok: true, data: payload });
    return;
  }

  if (action !== "sync") {
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

  const body = requireJsonBody(req, res, { endpoint: ENDPOINT_NAME });
  if (!body) return;
  const sanitized = sanitizeAdminCatalogPayload(body?.data && typeof body.data === "object" ? body.data : {});

  const nextStore = await updateStore((draft) => {
    draft.products = sanitized.products;
    draft.coupons = sanitized.coupons;
    draft.contactSettings = sanitized.contactSettings;
    draft.storeSettings = sanitized.storeSettings;
    draft.productTypes = sanitized.productTypeRecords;
    draft.filterTags = sanitized.filterTagRecords;
    bumpRealtimeMeta(draft, ["catalog"]);
    return draft;
  });
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
      storageBackend: getStoreBackend(),
    },
  });
}

