/* global process */

import { evaluateCoupon, normalizeCode, normalizeCouponList } from "../src/services/couponService.js";
import { readStore } from "./_lib/store.js";
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

const USER_COOKIE_NAME = "adriego_user_session";
const CART_ITEM_LIMIT = 25;
const LINE_ITEM_LIMIT = 10;
const ENDPOINT_NAME = "coupon-preview";

function verifyUserSession(req) {
  const secret = String(process.env.USER_SESSION_SECRET || "").trim();
  if (!secret) return null;
  const cookies = parseCookies(req.headers?.cookie || "");
  return verifySignedToken(cookies[USER_COOKIE_NAME] || cookies.atelier_user_session || "", secret);
}

function getProductImage(product, color) {
  const imagesByColor = product?.imagesByColor || {};
  if (imagesByColor[color]?.length) return imagesByColor[color][0];
  const fallbackColor = Array.isArray(product?.colors) ? product.colors[0] : Object.keys(imagesByColor)[0];
  if (fallbackColor && imagesByColor[fallbackColor]?.length) return imagesByColor[fallbackColor][0];
  return "";
}

function buildVariantKey(productId = "", color = "", size = "") {
  return `${String(productId)}::${normalizeLine(color)}::${normalizeLine(size)}`;
}

function sanitizeCart(rawCart = [], productsById = new Map()) {
  const cart = Array.isArray(rawCart) ? rawCart.slice(0, CART_ITEM_LIMIT) : [];
  const normalized = [];
  const requestedByVariant = new Map();

  for (const rawItem of cart) {
    const productId = String(rawItem?.id || "");
    const color = normalizeLine(rawItem?.color || "");
    const size = normalizeLine(rawItem?.size || "");
    const quantity = Math.max(1, Math.min(LINE_ITEM_LIMIT, Math.floor(Number(rawItem?.quantity) || 1)));
    const product = productsById.get(productId);
    if (!product || !color || !size) {
      return { ok: false, message: "El carrito contiene productos inválidos." };
    }

    if (product.isPublic === false) {
      return { ok: false, message: `El producto ${product.name} ya no esta disponible para compra.` };
    }

    const variant = (Array.isArray(product.variants) ? product.variants : []).find((entry) => (
      normalizeLine(entry.color) === color && normalizeLine(entry.size) === size
    ));

    if (!variant) {
      return { ok: false, message: `La variante ${product.name} (${color} ${size}) ya no está disponible.` };
    }

    const itemPrice = Number(product.price);
    if (!Number.isFinite(itemPrice) || itemPrice <= 0) {
      return { ok: false, message: `El producto ${product.name} tiene un precio inválido.` };
    }

    const availableStock = Math.max(0, Number(variant.stock) || 0);
    const variantKey = buildVariantKey(productId, color, size);
    const requestedStock = (requestedByVariant.get(variantKey) || 0) + quantity;
    requestedByVariant.set(variantKey, requestedStock);
    if (availableStock < requestedStock) {
      return { ok: false, message: `Stock insuficiente para ${product.name} (${color} ${size}).` };
    }

    normalized.push({
      key: normalizeLine(rawItem?.key || `${productId}-${color}-${size}`),
      id: productId,
      name: normalizeLine(product.name || ""),
      price: Number(itemPrice.toFixed(2)),
      image: getProductImage(product, color),
      color,
      size,
      quantity,
    });
  }

  return {
    ok: true,
    cart: normalized,
  };
}

function pickCouponState(result, couponCode) {
  return {
    ok: Boolean(result?.ok),
    code: normalizeCode(couponCode || result?.code || ""),
    reason: result?.reason || (couponCode ? "not-found" : "empty"),
    message: result?.message || "",
    subtotal: Number(result?.subtotal) || 0,
    eligibleSubtotal: Number(result?.eligibleSubtotal) || 0,
    excludedSubtotal: Number(result?.excludedSubtotal) || 0,
    discountAmount: Number(result?.discountAmount) || 0,
    minPurchase: Number(result?.minPurchase) || 0,
    total: Number(result?.total) || Number(result?.subtotal) || 0,
    eligibleItemsCount: Number(result?.eligibleItemsCount) || 0,
    excludedItemsCount: Number(result?.excludedItemsCount) || 0,
  };
}

export default async function handler(req, res) {
  monitorApiRequest(req, res, ENDPOINT_NAME);
  setCommonSecurityHeaders(res);
  ensureCsrfCookie(req, res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ ok: false, message: "Method not allowed" });
    return;
  }

  const allowedOrigins = getAllowedOrigins(process.env.USER_ALLOWED_ORIGIN);
  if (!isOriginAllowed(req, allowedOrigins)) {
    res.status(403).json({ ok: false, message: "Origin not allowed" });
    return;
  }

  if (!requireCsrf(req, res, { endpoint: ENDPOINT_NAME })) {
    return;
  }

  const ip = getClientIp(req);
  const ipLimit = await consumeRateLimit("coupon-preview-ip", ip, 30, 10 * 60 * 1000, {
    endpoint: ENDPOINT_NAME,
    ip,
  });
  if (!ipLimit.ok) {
    res.setHeader("Retry-After", String(Math.ceil(ipLimit.retryAfterMs / 1000)));
    res.status(429).json({ ok: false, message: "Too many requests" });
    return;
  }

  const body = requireJsonBody(req, res, { endpoint: ENDPOINT_NAME });
  if (!body) return;
  const couponCode = normalizeCode(body?.couponCode || "");
  const rawCart = Array.isArray(body?.cart) ? body.cart : [];

  const store = await readStore();
  const products = Array.isArray(store.products) ? store.products : [];
  const productsById = new Map(products.map((entry) => [String(entry.id), entry]));
  const cartState = sanitizeCart(rawCart, productsById);

  if (!cartState.ok) {
    res.status(400).json({ ok: false, message: cartState.message });
    return;
  }

  const session = verifyUserSession(req);
  const sessionUser = resolveVersionedUserSession(store.users, session);
  const currentUser = sessionUser
    ? {
        id: String(sessionUser.id),
        email: normalizeEmail(sessionUser.email || ""),
      }
    : null;

  const couponEvaluation = evaluateCoupon({
    code: couponCode,
    coupons: normalizeCouponList(Array.isArray(store.coupons) ? store.coupons : []),
    cart: cartState.cart,
    productsById,
    currentUser,
  });

  res.status(200).json({
    ok: true,
    couponState: pickCouponState(couponEvaluation, couponCode),
  });
}
