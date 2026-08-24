/* global process */

import { bumpRealtimeMeta, readStore, updateStore } from "./_lib/store.js";
import { sanitizeOrderPatch } from "./_lib/storeSanitizers.js";
import {
  consumeRateLimit,
  ensureCsrfCookie,
  getAllowedOrigins,
  getClientIp,
  isOriginAllowed,
  monitorApiRequest,
  normalizeEmail,
  normalizeLine,
  parseCookies,
  requireJsonBody,
  requireCsrf,
  resolveVersionedUserSession,
  setCommonSecurityHeaders,
  verifySignedToken,
} from "./_lib/security.js";

const ADMIN_COOKIE_NAME = "adriego_admin_session";
const USER_COOKIE_NAME = "adriego_user_session";
const ENDPOINT_NAME = "orders";
const CANCELLED_STATUS = "Cancelado";
const DEFAULT_ORDER_STATUS = "Pendiente";

function getSessions(req) {
  const cookies = parseCookies(req.headers?.cookie || "");
  const adminSecret = String(process.env.ADMIN_SESSION_SECRET || "").trim();
  const userSecret = String(process.env.USER_SESSION_SECRET || "").trim();
  return {
    adminSession: adminSecret ? verifySignedToken(cookies[ADMIN_COOKIE_NAME] || cookies.atelier_admin_session || "", adminSecret) : null,
    userSession: userSecret ? verifySignedToken(cookies[USER_COOKIE_NAME] || cookies.atelier_user_session || "", userSecret) : null,
  };
}

function normalizeOrderStatus(value = "") {
  return normalizeLine(value) || DEFAULT_ORDER_STATUS;
}

function buildVariantKey(productId = "", color = "", size = "") {
  return `${String(productId)}::${normalizeLine(color).toLowerCase()}::${normalizeLine(size).toLowerCase()}`;
}

function aggregateOrderItems(items = []) {
  const source = Array.isArray(items) ? items : [];
  const grouped = new Map();

  source.forEach((item) => {
    const productId = String(item?.id || "");
    const color = normalizeLine(item?.color || "");
    const size = normalizeLine(item?.size || "");
    const quantity = Math.max(0, Math.floor(Number(item?.quantity) || 0));
    if (!productId || !color || !size || quantity <= 0) return;

    const key = buildVariantKey(productId, color, size);
    const previous = grouped.get(key);
    grouped.set(key, {
      key,
      productId,
      color,
      size,
      quantity: (previous?.quantity || 0) + quantity,
    });
  });

  return Array.from(grouped.values());
}

function rebuildProductStockBySize(product = {}) {
  const variants = Array.isArray(product.variants) ? product.variants : [];
  const variantSizes = variants.map((variant) => normalizeLine(variant?.size || "")).filter(Boolean);
  const declaredSizes = (Array.isArray(product.sizes) ? product.sizes : []).map((size) => normalizeLine(size || "")).filter(Boolean);
  const previousSizes = Object.keys(product?.stockBySize && typeof product.stockBySize === "object" ? product.stockBySize : {})
    .map((size) => normalizeLine(size || ""))
    .filter(Boolean);
  const allSizes = [...new Set([...declaredSizes, ...variantSizes, ...previousSizes])];

  return Object.fromEntries(
    allSizes.map((size) => [
      size,
      variants
        .filter((variant) => normalizeLine(variant?.size || "") === size)
        .reduce((total, variant) => total + Math.max(0, Number(variant?.stock) || 0), 0),
    ]),
  );
}

function normalizeStockReservation(rawReservation = {}, fallbackState = "reserved") {
  const safeReservation = rawReservation && typeof rawReservation === "object" ? rawReservation : {};
  const state = safeReservation.state === "released"
    ? "released"
    : (safeReservation.state === "reserved" ? "reserved" : fallbackState);
  return {
    state,
    reservedAt: String(safeReservation.reservedAt || ""),
    releasedAt: String(safeReservation.releasedAt || ""),
    lastSyncAt: String(safeReservation.lastSyncAt || ""),
    lastAction: normalizeLine(safeReservation.lastAction || ""),
    version: Math.max(0, Math.floor(Number(safeReservation.version) || 0)),
  };
}

function applyOrderStockSync(draft = {}, order = {}, direction = "restore") {
  const items = aggregateOrderItems(order?.items);
  if (!items.length) {
    return { ok: true, touched: false, warnings: [] };
  }

  const products = Array.isArray(draft.products) ? draft.products : [];
  const productsById = new Map(products.map((product, index) => [String(product?.id || ""), { product, index }]));
  const warnings = [];
  const resolvedEntries = [];

  for (const item of items) {
    const productRef = productsById.get(item.productId);
    if (!productRef?.product) {
      if (direction === "restore") {
        warnings.push(`No se encontro el producto ${item.productId} para reintegrar stock.`);
        continue;
      }
      return {
        ok: false,
        message: `No se puede reactivar: falta el producto ${item.productId} en catalogo.`,
      };
    }

    const safeVariants = Array.isArray(productRef.product.variants) ? productRef.product.variants : [];
    const variantIndex = safeVariants.findIndex((variant) => (
      normalizeLine(variant?.color || "").toLowerCase() === item.color.toLowerCase()
      && normalizeLine(variant?.size || "").toLowerCase() === item.size.toLowerCase()
    ));

    if (variantIndex < 0) {
      if (direction === "restore") {
        warnings.push(`No se encontro la variante ${item.color}/${item.size} para ${productRef.product.name || item.productId}.`);
        continue;
      }
      return {
        ok: false,
        message: `No se puede reactivar: falta la variante ${item.color}/${item.size}.`,
      };
    }

    const variant = safeVariants[variantIndex];
    const currentStock = Math.max(0, Number(variant?.stock) || 0);
    if (direction === "reserve" && currentStock < item.quantity) {
      return {
        ok: false,
        message: `Stock insuficiente para reactivar ${productRef.product.name || item.productId} (${item.color}/${item.size}).`,
      };
    }

    resolvedEntries.push({
      productIndex: productRef.index,
      variantIndex,
      quantity: item.quantity,
    });
  }

  if (!resolvedEntries.length) {
    return { ok: true, touched: false, warnings };
  }

  const touchedProductIndexes = new Set();
  resolvedEntries.forEach(({ productIndex, variantIndex, quantity }) => {
    const product = products[productIndex];
    if (!product) return;
    const safeVariants = Array.isArray(product.variants) ? product.variants : [];
    const variant = safeVariants[variantIndex];
    if (!variant) return;

    const currentStock = Math.max(0, Number(variant.stock) || 0);
    const nextStock = direction === "restore"
      ? currentStock + quantity
      : Math.max(0, currentStock - quantity);
    safeVariants[variantIndex] = {
      ...variant,
      stock: nextStock,
    };
    product.variants = safeVariants;
    touchedProductIndexes.add(productIndex);
  });

  touchedProductIndexes.forEach((productIndex) => {
    const product = products[productIndex];
    if (!product) return;
    product.stockBySize = rebuildProductStockBySize(product);
  });

  draft.products = products;
  return { ok: true, touched: touchedProductIndexes.size > 0, warnings };
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
    res.status(403).json({ ok: false, message: "Origin not allowed" });
    return;
  }

  const { adminSession, userSession } = getSessions(req);
  const isAdmin = Boolean(adminSession);
  const clientIp = getClientIp(req);

  const action = normalizeLine(req.query?.action || "list").toLowerCase();

  if (action === "list") {
    if (req.method !== "GET") {
      res.status(405).json({ ok: false, message: "Method not allowed" });
      return;
    }
    const listRateLimit = await consumeRateLimit(
      isAdmin ? "orders-list-admin-ip" : "orders-list-user-ip",
      clientIp,
      isAdmin ? 120 : 80,
      10 * 60 * 1000,
      {
        endpoint: ENDPOINT_NAME,
        ip: clientIp,
      },
    );
    if (!listRateLimit.ok) {
      res.setHeader("Retry-After", String(Math.ceil(listRateLimit.retryAfterMs / 1000)));
      res.status(429).json({ ok: false, message: "Too many requests" });
      return;
    }
    const store = await readStore();
    const sessionUser = resolveVersionedUserSession(store.users, userSession);
    if (!isAdmin && !sessionUser) {
      res.status(401).json({ ok: false, message: "No autorizado" });
      return;
    }
    const userId = sessionUser ? String(sessionUser.id) : "";
    const userEmail = sessionUser ? normalizeEmail(sessionUser.email) : "";
    const orders = Array.isArray(store.orders) ? store.orders : [];
    const visibleOrders = isAdmin
      ? orders
      : orders.filter((order) => (
        String(order.customerId || "") === userId
        || (
          !String(order.customerId || "")
          && userEmail
          && normalizeEmail(order.customerEmail || "") === userEmail
        )
      ));
    res.status(200).json({
      ok: true,
      orderHistory: visibleOrders,
    });
    return;
  }

  if (!isAdmin) {
    res.status(403).json({ ok: false, message: "Solo admin puede editar pedidos" });
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ ok: false, message: "Method not allowed" });
    return;
  }

  if (!requireCsrf(req, res, { endpoint: ENDPOINT_NAME })) return;
  const mutateRateLimit = await consumeRateLimit("orders-mutate-admin-ip", clientIp, 50, 10 * 60 * 1000, {
    endpoint: ENDPOINT_NAME,
    ip: clientIp,
  });
  if (!mutateRateLimit.ok) {
    res.setHeader("Retry-After", String(Math.ceil(mutateRateLimit.retryAfterMs / 1000)));
    res.status(429).json({ ok: false, message: "Too many requests" });
    return;
  }

  const body = requireJsonBody(req, res, { endpoint: ENDPOINT_NAME });
  if (!body) return;
  const orderId = normalizeLine(body.orderId || "");
  if (!orderId) {
    res.status(400).json({ ok: false, message: "orderId requerido" });
    return;
  }

  if (action === "update") {
    const patch = sanitizeOrderPatch(body);
    if (!Object.keys(patch).length) {
      res.status(400).json({ ok: false, message: "No hay cambios validos para guardar" });
      return;
    }

    let updated = false;
    let mutateError = "";
    let responseMessage = "";
    let responseWarning = "";
    let shouldBumpCatalog = false;

    const nowIso = new Date().toISOString();
    const nextStore = await updateStore((draft) => {
      const orders = Array.isArray(draft.orders) ? draft.orders : [];
      draft.orders = orders.map((order) => {
        if (String(order.id || "") !== orderId) return order;

        const currentStatus = normalizeOrderStatus(order.status);
        const requestedStatus = patch.status ? normalizeOrderStatus(patch.status) : currentStatus;
        const nextStatus = requestedStatus || currentStatus;
        const fallbackReservationState = currentStatus === CANCELLED_STATUS ? "released" : "reserved";
        const currentReservation = normalizeStockReservation(order.stockReservation, fallbackReservationState);
        const patchIncludesStatus = Object.prototype.hasOwnProperty.call(patch, "status");
        const mustRestoreStock = nextStatus === CANCELLED_STATUS && currentReservation.state !== "released" && patchIncludesStatus;
        const mustReserveStock = nextStatus !== CANCELLED_STATUS && currentReservation.state !== "reserved" && patchIncludesStatus;

        if (mustRestoreStock) {
          const syncResult = applyOrderStockSync(draft, order, "restore");
          if (!syncResult.ok) {
            mutateError = syncResult.message || "No se pudo reintegrar stock al cancelar el pedido.";
            return order;
          }
          if (syncResult.touched) {
            shouldBumpCatalog = true;
            responseMessage = "Pedido cancelado y stock reintegrado automaticamente.";
          } else if (!responseMessage) {
            responseMessage = "Pedido cancelado sin ajustes de stock pendientes.";
          }
          if (syncResult.warnings.length) {
            responseWarning = syncResult.warnings.join(" ");
          }
        } else if (mustReserveStock) {
          const syncResult = applyOrderStockSync(draft, order, "reserve");
          if (!syncResult.ok) {
            mutateError = syncResult.message || "No se pudo reactivar el pedido por un conflicto de stock.";
            return order;
          }
          if (syncResult.touched) {
            shouldBumpCatalog = true;
            responseMessage = "Pedido reactivado y stock reservado nuevamente.";
          }
          if (syncResult.warnings.length) {
            responseWarning = syncResult.warnings.join(" ");
          }
        }

        updated = true;
        const nextReservationState = nextStatus === CANCELLED_STATUS ? "released" : "reserved";
        const nextReservation = {
          ...currentReservation,
          state: nextReservationState,
          reservedAt: nextReservationState === "reserved"
            ? (currentReservation.reservedAt || nowIso)
            : currentReservation.reservedAt,
          releasedAt: nextReservationState === "released"
            ? nowIso
            : currentReservation.releasedAt,
          lastSyncAt: nowIso,
          lastAction: patchIncludesStatus ? (nextReservationState === "released" ? "cancelled" : "reactivated") : "updated",
          version: currentReservation.version + (patchIncludesStatus ? 1 : 0),
        };

        return {
          ...order,
          ...patch,
          status: nextStatus,
          stockReservation: nextReservation,
        };
      });

      if (mutateError) return draft;
      if (updated) {
        bumpRealtimeMeta(draft, shouldBumpCatalog ? ["orders", "catalog"] : ["orders"]);
      }
      return draft;
    });

    if (mutateError) {
      res.status(409).json({ ok: false, message: mutateError });
      return;
    }

    if (!updated) {
      res.status(404).json({ ok: false, message: "Pedido no encontrado" });
      return;
    }

    res.status(200).json({
      ok: true,
      orderHistory: Array.isArray(nextStore.orders) ? nextStore.orders : [],
      message: responseMessage || "",
      warning: responseWarning || "",
    });
    return;
  }

  if (action === "delete") {
    let deleted = false;
    const nextStore = await updateStore((draft) => {
      const previousOrders = Array.isArray(draft.orders) ? draft.orders : [];
      draft.orders = previousOrders.filter((order) => {
        const keep = String(order.id) !== orderId;
        if (!keep) deleted = true;
        return keep;
      });
      if (deleted) {
        bumpRealtimeMeta(draft, ["orders"]);
      }
      return draft;
    });

    if (!deleted) {
      res.status(404).json({ ok: false, message: "Pedido no encontrado" });
      return;
    }

    res.status(200).json({ ok: true, orderHistory: Array.isArray(nextStore.orders) ? nextStore.orders : [] });
    return;
  }

  res.status(400).json({ ok: false, message: "Accion no valida" });
}
