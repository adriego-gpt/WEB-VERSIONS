/* global process */

import crypto from "node:crypto";
import { bumpRealtimeMeta, updateStore } from "./_lib/store.js";
import {
  applyCouponUsage,
  createFriendlyOrderCode,
  evaluateCoupon,
  normalizeCode,
  normalizeCouponList,
} from "../src/services/couponService.js";
import {
  consumeRateLimit,
  ensureCsrfCookie,
  getAllowedOrigins,
  getClientIp,
  isOriginAllowed,
  monitorApiRequest,
  normalizeEmail,
  normalizeLine,
  normalizePhone,
  parseCookies,
  requireJsonBody,
  requireCsrf,
  setCommonSecurityHeaders,
  verifySignedToken,
} from "./_lib/security.js";

const USER_COOKIE_NAME = "atelier_user_session";
const CART_ITEM_LIMIT = 25;
const LINE_ITEM_LIMIT = 10;
const ENDPOINT_NAME = "checkout-order";
const DEFAULT_WHATSAPP_COUNTRY_CODE = "593";

function currency(value) {
  return new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" }).format(Number(value) || 0);
}

function normalizeWhatsAppInternationalNumber(value = "", options = {}) {
  const digits = normalizePhone(value);
  if (!digits) return "";

  const defaultCountryCode = normalizePhone(options.defaultCountryCode || DEFAULT_WHATSAPP_COUNTRY_CODE).slice(0, 4);
  const withoutDialPrefix = digits.startsWith("00") ? digits.slice(2) : digits;

  let normalized = withoutDialPrefix;
  if (defaultCountryCode) {
    if (withoutDialPrefix.startsWith("0") && withoutDialPrefix.length >= 9 && withoutDialPrefix.length <= 11) {
      normalized = `${defaultCountryCode}${withoutDialPrefix.slice(1)}`;
    } else if (!withoutDialPrefix.startsWith(defaultCountryCode) && withoutDialPrefix.length <= 9) {
      normalized = `${defaultCountryCode}${withoutDialPrefix}`;
    }
  }

  const clipped = normalizePhone(normalized).slice(0, 15);
  if (clipped.length < 8) return "";
  return clipped;
}

function buildWhatsAppLink(number, text = "") {
  const digits = normalizeWhatsAppInternationalNumber(number);
  if (!digits) return "";
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
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
  const safeCart = Array.isArray(rawCart) ? rawCart.slice(0, CART_ITEM_LIMIT) : [];
  const normalized = [];
  const requestedByVariant = new Map();

  for (const rawItem of safeCart) {
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
  return { ok: true, cart: normalized };
}

function normalizeOrderStatus(value = "Pendiente") {
  const safe = normalizeLine(value);
  return safe || "Pendiente";
}

function normalizeDeliveryType(value = "pickup") {
  return normalizeLine(value) === "delivery" ? "delivery" : "pickup";
}

function sanitizeDeliveryPayload(rawDelivery = {}, user = {}, contactSettings = {}) {
  const deliveryType = normalizeDeliveryType(rawDelivery?.type || rawDelivery?.deliveryType || "pickup");
  const baseName = normalizeLine(rawDelivery?.fullName || user?.name || "Cliente").slice(0, 120);
  const basePhone = normalizePhone(rawDelivery?.phone || user?.phone || "");

  const safePayload = {
    deliveryType,
    deliveryLabel: deliveryType === "delivery" ? "Envio a domicilio" : "Retiro en local",
    deliveryFullName: baseName,
    deliveryIdNumber: normalizeLine(rawDelivery?.idNumber || "").slice(0, 40),
    deliveryCity: normalizeLine(rawDelivery?.city || "").slice(0, 80),
    deliveryAddress: normalizeLine(rawDelivery?.address || "").slice(0, 260),
    deliveryReference: normalizeLine(rawDelivery?.reference || "").slice(0, 260),
    deliveryPhone: basePhone.slice(0, 20),
    pickupAddress: deliveryType === "pickup" ? normalizeLine(contactSettings?.address || "").slice(0, 280) : "",
    pickupNote: deliveryType === "pickup" ? normalizeLine(contactSettings?.locationNote || "").slice(0, 320) : "",
  };

  if (deliveryType === "delivery") {
    const missingRequired = !safePayload.deliveryFullName
      || !safePayload.deliveryIdNumber
      || !safePayload.deliveryCity
      || !safePayload.deliveryAddress
      || !safePayload.deliveryReference
      || !safePayload.deliveryPhone;
    if (missingRequired) {
      return { ok: false, message: "Completa nombre, cedula, ciudad, direccion, referencia y telefono para envio." };
    }
    if (safePayload.deliveryPhone.length < 9) {
      return { ok: false, message: "El telefono de entrega no es valido." };
    }
  }

  return { ok: true, delivery: safePayload };
}

function buildOrderText(order) {
  const deliveryMode = order.deliveryType === "delivery" ? "Envio a domicilio" : "Retiro en local";
  return [
    `Hola, quiero hacer este pedido. Codigo: ${order.code}`,
    "",
    `Cliente: ${order.customerName || "Cliente"}`,
    order.customerPhone ? `Telefono: ${order.customerPhone}` : "",
    order.customerEmail ? `Correo: ${order.customerEmail}` : "",
    `Entrega: ${deliveryMode}`,
    order.deliveryType === "delivery"
      ? `Datos entrega: ${order.deliveryFullName || order.customerName || "Cliente"} - CI ${order.deliveryIdNumber || "N/D"} - ${order.deliveryCity || "Ciudad"}`
      : "",
    order.deliveryType === "delivery" ? `Direccion: ${order.deliveryAddress || "N/D"}` : "",
    order.deliveryType === "delivery" ? `Referencia: ${order.deliveryReference || "N/D"}` : "",
    order.deliveryType === "delivery" ? `Telefono entrega: ${order.deliveryPhone || order.customerPhone || "N/D"}` : "",
    order.deliveryType !== "delivery" && order.pickupAddress ? `Retiro en: ${order.pickupAddress}` : "",
    order.deliveryType !== "delivery" && order.pickupNote ? `Referencia local: ${order.pickupNote}` : "",
    "",
    ...order.items.map((item, index) => `${index + 1}. ${item.name} | Color: ${item.color} | Talla: ${item.size} | Cantidad: ${item.quantity} | ${currency(item.price * item.quantity)}`),
    "",
    `Subtotal: ${currency(order.subtotal)}`,
    order.discountAmount > 0 ? `Descuento: -${currency(order.discountAmount)}` : "",
    order.couponCode ? `Cupon aplicado: ${order.couponCode}` : "",
    `Total final: ${currency(order.total || order.subtotal)}`,
    "",
    "Por favor indiquenme disponibilidad y forma de pago.",
  ].filter(Boolean).join("\n");
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

  if (!requireCsrf(req, res, { endpoint: ENDPOINT_NAME })) return;

  const userSessionSecret = String(process.env.USER_SESSION_SECRET || "").trim();
  if (!userSessionSecret) {
    res.status(500).json({ ok: false, message: "User session no configurada" });
    return;
  }

  const requestIp = getClientIp(req);
  const rateLimit = consumeRateLimit("checkout-ip", requestIp, 10, 10 * 60 * 1000, {
    endpoint: ENDPOINT_NAME,
    ip: requestIp,
  });
  if (!rateLimit.ok) {
    res.setHeader("Retry-After", String(Math.ceil(rateLimit.retryAfterMs / 1000)));
    res.status(429).json({ ok: false, message: "Too many requests" });
    return;
  }

  const cookies = parseCookies(req.headers?.cookie || "");
  const session = verifySignedToken(cookies[USER_COOKIE_NAME] || "", userSessionSecret);
  if (!session) {
    res.status(401).json({ ok: false, message: "Inicia sesión para finalizar la compra." });
    return;
  }

  const body = requireJsonBody(req, res, { endpoint: ENDPOINT_NAME });
  if (!body) return;
  const couponCode = normalizeCode(body?.couponCode || "");
  const rawCart = Array.isArray(body?.cart) ? body.cart : [];
  if (!rawCart.length) {
    res.status(400).json({ ok: false, message: "El carrito está vacío." });
    return;
  }

  let responsePayload = null;

  await updateStore((draft) => {
    const users = Array.isArray(draft.users) ? draft.users : [];
    const user = users.find((entry) => String(entry.id) === String(session.sub));
    if (!user) {
      responsePayload = { ok: false, status: 401, message: "No pudimos validar tu sesión." };
      return draft;
    }

    const products = Array.isArray(draft.products) ? draft.products : [];
    if (!products.length) {
      responsePayload = { ok: false, status: 409, message: "El catálogo seguro no está sincronizado. Inicia sesión admin y guarda cambios." };
      return draft;
    }

    const productsById = new Map(products.map((entry) => [String(entry.id), entry]));
    const cartState = sanitizeCart(rawCart, productsById);
    if (!cartState.ok) {
      responsePayload = { ok: false, status: 400, message: cartState.message };
      return draft;
    }

    const deliveryState = sanitizeDeliveryPayload(body?.delivery || {}, user, draft.contactSettings || {});
    if (!deliveryState.ok) {
      responsePayload = { ok: false, status: 400, message: deliveryState.message };
      return draft;
    }

    const safeCart = cartState.cart;
    const coupons = normalizeCouponList(Array.isArray(draft.coupons) ? draft.coupons : []);
    const couponEvaluation = evaluateCoupon({
      code: couponCode,
      coupons,
      cart: safeCart,
      productsById,
      currentUser: {
        id: String(user.id),
        email: normalizeEmail(user.email),
      },
    });
    if (couponCode && !couponEvaluation.ok) {
      responsePayload = { ok: false, status: 400, message: couponEvaluation.message || "El cupón no es válido para este carrito." };
      return draft;
    }

    const subtotal = safeCart.reduce((total, item) => total + item.price * item.quantity, 0);
    const discountAmount = couponEvaluation.ok ? Number(couponEvaluation.discountAmount) || 0 : 0;
    const total = couponEvaluation.ok ? Number(couponEvaluation.total) || subtotal : subtotal;

    const previousOrders = Array.isArray(draft.orders) ? draft.orders : [];
    const code = createFriendlyOrderCode(previousOrders);
    const nowIso = new Date().toISOString();
    const nextOrder = {
      id: crypto.randomUUID(),
      code,
      createdAt: nowIso,
      subtotal,
      discountAmount,
      total,
      couponCode: couponEvaluation.ok ? couponEvaluation.code : "",
      couponDiscountType: couponEvaluation.ok ? couponEvaluation?.coupon?.discountType || "" : "",
      couponDiscountValue: couponEvaluation.ok ? Number(couponEvaluation?.coupon?.discountValue) || 0 : 0,
      couponEligibleSubtotal: couponEvaluation.ok ? Number(couponEvaluation.eligibleSubtotal) || 0 : 0,
      couponExcludedSubtotal: couponEvaluation.ok ? Number(couponEvaluation.excludedSubtotal) || 0 : 0,
      itemCount: safeCart.reduce((acc, item) => acc + item.quantity, 0),
      status: normalizeOrderStatus("Pendiente"),
      guideNumber: "",
      paymentProof: "",
      customerId: String(user.id),
      customerName: normalizeLine(deliveryState.delivery.deliveryFullName || user.name || "Cliente"),
      customerEmail: normalizeEmail(user.email || ""),
      customerPhone: normalizePhone(deliveryState.delivery.deliveryPhone || user.phone || ""),
      deliveryType: deliveryState.delivery.deliveryType,
      deliveryLabel: deliveryState.delivery.deliveryLabel,
      deliveryFullName: deliveryState.delivery.deliveryFullName,
      deliveryIdNumber: deliveryState.delivery.deliveryIdNumber,
      deliveryCity: deliveryState.delivery.deliveryCity,
      deliveryAddress: deliveryState.delivery.deliveryAddress,
      deliveryReference: deliveryState.delivery.deliveryReference,
      deliveryPhone: deliveryState.delivery.deliveryPhone,
      pickupAddress: deliveryState.delivery.pickupAddress,
      pickupNote: deliveryState.delivery.pickupNote,
      stockReservation: {
        state: "reserved",
        reservedAt: nowIso,
        releasedAt: "",
        lastSyncAt: nowIso,
        lastAction: "checkout",
        version: 1,
      },
      items: safeCart.map((item) => ({ ...item })),
    };

    const requestedByVariant = safeCart.reduce((acc, item) => {
      const key = buildVariantKey(item.id, item.color, item.size);
      acc.set(key, (acc.get(key) || 0) + (Number(item.quantity) || 0));
      return acc;
    }, new Map());

    draft.products = products.map((product) => {
      const related = safeCart.filter((item) => String(item.id) === String(product.id));
      if (!related.length) return product;

      const nextVariants = (Array.isArray(product.variants) ? product.variants : []).map((variant) => {
        const variantKey = buildVariantKey(product.id, variant.color, variant.size);
        const requestedQuantity = requestedByVariant.get(variantKey) || 0;
        if (!requestedQuantity) return variant;
        return {
          ...variant,
          stock: Math.max(0, (Number(variant.stock) || 0) - requestedQuantity),
        };
      });

      const sizes = Array.isArray(product.sizes) ? product.sizes : [];
      const stockBySize = Object.fromEntries(
        sizes.map((size) => [
          size,
          nextVariants
            .filter((variant) => normalizeLine(variant.size) === normalizeLine(size))
            .reduce((acc, variant) => acc + Math.max(0, Number(variant.stock) || 0), 0),
        ]),
      );

      return {
        ...product,
        variants: nextVariants,
        stockBySize,
      };
    });

    if (couponEvaluation.ok && couponEvaluation.coupon?.id) {
      draft.coupons = coupons.map((coupon) => (
        coupon.id === couponEvaluation.coupon.id
          ? applyCouponUsage(coupon, String(user.id))
          : coupon
      ));
    } else {
      draft.coupons = coupons;
    }

    draft.orders = [nextOrder, ...previousOrders].slice(0, 400);
    draft.users = users.map((entry) => (
      String(entry.id) === String(user.id)
        ? {
            ...entry,
            cartState: [],
            stateUpdatedAt: nowIso,
            stateVersion: Math.max(0, Number(entry.stateVersion) || 0) + 1,
            updatedAt: nowIso,
          }
        : entry
    ));
    bumpRealtimeMeta(draft, ["catalog", "orders", "user-state"]);

    const whatsappNumber = normalizePhone(draft.contactSettings?.whatsappNumber || "");
    const message = buildOrderText(nextOrder);
    const whatsappUrl = buildWhatsAppLink(whatsappNumber, message);
    const visibleOrderHistory = draft.orders.filter((order) => (
      String(order.customerId || "") === String(user.id)
      || (
        !String(order.customerId || "")
        && normalizeEmail(order.customerEmail || "") === normalizeEmail(user.email || "")
      )
    ));

    responsePayload = {
      ok: true,
      order: nextOrder,
      products: draft.products,
      orderHistory: visibleOrderHistory,
      whatsappUrl,
    };
    return draft;
  });

  if (!responsePayload) {
    res.status(500).json({ ok: false, message: "No pudimos procesar el pedido." });
    return;
  }

  if (!responsePayload.ok) {
    res.status(responsePayload.status || 400).json({
      ok: false,
      message: responsePayload.message || "No pudimos procesar el pedido.",
    });
    return;
  }

  res.status(200).json(responsePayload);
}
