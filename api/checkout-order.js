
import crypto from "node:crypto";
import { bumpRealtimeMeta, updateStore } from "./_lib/store.js";
import { dispatchOrderNotifications } from "./_lib/notifications.js";
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
  normalizeImageSource,
  normalizeLine,
  normalizePhone,
  parseCookies,
  requireJsonBody,
  requireCsrf,
  setCommonSecurityHeaders,
  verifySignedToken,
} from "./_lib/security.js";
import {
  PAYMENT_METHODS,
  calculatePayableTotal,
  calculatePaymentFee,
  getPaymentMethodLabel,
  normalizeCardFeePercent,
  normalizePaymentMethod,
} from "../src/domain/orders/payment.js";
import { getReadyBankAccounts } from "../src/domain/contact/paymentSettings.js";

const USER_COOKIE_NAME = "adriego_user_session";
const CART_ITEM_LIMIT = 25;
const LINE_ITEM_LIMIT = 10;
const ENDPOINT_NAME = "checkout-order";
const DEFAULT_WHATSAPP_COUNTRY_CODE = "593";
const IDEMPOTENCY_TTL_MS = Math.max(
  60 * 60 * 1000,
  (Number(process.env.CHECKOUT_IDEMPOTENCY_TTL_HOURS) || 72) * 60 * 60 * 1000,
);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LEGACY_PICKUP_ADDRESS = "av. principal 123, quito, ecuador";

function normalizeSessionVersion(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 1) return 1;
  return Math.floor(numeric);
}

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

  const configuredPickupAddress = normalizeLine(contactSettings?.address || "");
  const hasRealPickupAddress = configuredPickupAddress.toLowerCase() !== LEGACY_PICKUP_ADDRESS;
  const safePayload = {
    deliveryType,
    deliveryLabel: deliveryType === "delivery" ? "Envio a domicilio" : "Retiro en local",
    deliveryFullName: baseName,
    deliveryIdNumber: normalizeLine(rawDelivery?.idNumber || "").slice(0, 40),
    deliveryCity: normalizeLine(rawDelivery?.city || "").slice(0, 80),
    deliveryAddress: normalizeLine(rawDelivery?.address || "").slice(0, 260),
    deliveryReference: normalizeLine(rawDelivery?.reference || "").slice(0, 260),
    deliveryPhone: basePhone.slice(0, 20),
    pickupAddress: deliveryType === "pickup" && hasRealPickupAddress ? configuredPickupAddress.slice(0, 280) : "",
    pickupNote: deliveryType === "pickup" && hasRealPickupAddress ? normalizeLine(contactSettings?.locationNote || "").slice(0, 320) : "",
  };

  if (deliveryType === "delivery") {
    const missingRequired = !safePayload.deliveryFullName
      || !safePayload.deliveryIdNumber
      || !safePayload.deliveryCity
      || !safePayload.deliveryAddress
      || !safePayload.deliveryPhone;
    if (missingRequired) {
      return { ok: false, message: "Completa nombre, cédula, ciudad, dirección y teléfono para el envío." };
    }
    if (safePayload.deliveryPhone.length < 9) {
      return { ok: false, message: "El teléfono de entrega no es válido." };
    }
  }

  return { ok: true, delivery: safePayload };
}

function buildOrderText(order) {
  const isDelivery = order.deliveryType === "delivery";
  const isCard = normalizePaymentMethod(order.paymentMethod) === "card_link";
  const bankName = order.paymentBankAccount?.bankName || "";
  const methodSummary = isCard
    ? "Tarjeta de crédito / débito (Enlace)"
    : (bankName ? `Transferencia (${bankName})` : "Transferencia bancaria");

  const lines = [
    `*NUEVO PEDIDO · ADRIEGO STORE*`,
    `*Código:* ${order.code}`,
    `━━━━━━━━━━━━━━━━━━━━`,
    "",
    `*DATOS DEL CLIENTE*`,
    `• *Cliente:* ${order.customerName || "Cliente"}`,
    order.customerPhone ? `• *Teléfono:* ${order.customerPhone}` : "",
    order.customerEmail ? `• *Correo:* ${order.customerEmail}` : "",
  ];

  if (isDelivery) {
    lines.push(
      `• *Modalidad:* Envío a domicilio`,
      order.deliveryFullName && order.deliveryFullName !== order.customerName ? `• *Destinatario:* ${order.deliveryFullName}` : "",
      order.deliveryIdNumber ? `• *Cédula / RUC:* ${order.deliveryIdNumber}` : "",
      order.deliveryCity ? `• *Ciudad:* ${order.deliveryCity}` : "",
      order.deliveryAddress ? `• *Dirección:* ${order.deliveryAddress}` : "",
      order.deliveryReference ? `• *Referencia:* ${order.deliveryReference}` : "",
      order.deliveryPhone && order.deliveryPhone !== order.customerPhone ? `• *Teléfono de entrega:* ${order.deliveryPhone}` : "",
    );
  } else {
    lines.push(
      `• *Modalidad:* Retiro en local`,
      order.pickupAddress ? `• *Punto de retiro:* ${order.pickupAddress}` : "",
      order.pickupNote ? `• *Referencia:* ${order.pickupNote}` : "",
    );
  }

  const items = Array.isArray(order.items) ? order.items : [];
  lines.push(
    "",
    `*PRENDAS SELECCIONADAS*`,
    ...items.map((item, index) => (
      `${index + 1}. *${item.name}*\n   ▫️ Color: ${item.color} | Talla: ${item.size} | Cantidad: ${item.quantity} | ${currency(item.price * item.quantity)}`
    )),
    "",
    `*RESUMEN DE PAGO*`,
    `• *Subtotal:* ${currency(order.subtotal)}`,
    order.discountAmount > 0 ? `• *Descuento:* -${currency(order.discountAmount)}` : "",
    order.couponCode ? `• *Cupón aplicado:* ${order.couponCode}` : "",
    `• *Forma de pago:* ${methodSummary}`,
    order.paymentFeeAmount > 0 ? `• *Comisión tarjeta (${order.paymentFeePercent}%):* +${currency(order.paymentFeeAmount)}` : "",
    order.paymentProof ? `• *Comprobante:* Adjuntado en la web` : "",
    `• *TOTAL A PAGAR:* *${currency(order.total || order.subtotal)}*`,
    "",
    `━━━━━━━━━━━━━━━━━━━━`,
    isCard
      ? "_Por favor envíenme el enlace seguro para realizar el pago con tarjeta._"
      : "_He registrado mi pedido y adjuntado el comprobante para su validación._",
  );

  return lines.filter(Boolean).join("\n");
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
  const rateLimit = await consumeRateLimit("checkout-ip", requestIp, 10, 10 * 60 * 1000, {
    endpoint: ENDPOINT_NAME,
    ip: requestIp,
  });
  if (!rateLimit.ok) {
    res.setHeader("Retry-After", String(Math.ceil(rateLimit.retryAfterMs / 1000)));
    res.status(429).json({ ok: false, message: "Too many requests" });
    return;
  }

  const cookies = parseCookies(req.headers?.cookie || "");
  const session = verifySignedToken(cookies[USER_COOKIE_NAME] || cookies.atelier_user_session || "", userSessionSecret);
  if (!session) {
    res.status(401).json({ ok: false, message: "Inicia sesión para finalizar la compra." });
    return;
  }

  const body = requireJsonBody(req, res, { endpoint: ENDPOINT_NAME });
  if (!body) return;
  const idempotencyKey = normalizeLine(body?.idempotencyKey || "").toLowerCase();
  if (!UUID_PATTERN.test(idempotencyKey)) {
    res.status(400).json({
      ok: false,
      code: "INVALID_IDEMPOTENCY_KEY",
      message: "idempotencyKey debe ser un UUID valido.",
    });
    return;
  }
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
    if (normalizeSessionVersion(session.sessionVersion) !== normalizeSessionVersion(user.sessionVersion)) {
      responsePayload = { ok: false, status: 401, message: "Tu sesión expiró. Inicia sesión nuevamente." };
      return draft;
    }

    const previousOrders = Array.isArray(draft.orders) ? draft.orders : [];
    const idempotencyCutoff = Date.now() - IDEMPOTENCY_TTL_MS;
    const existingOrder = previousOrders.find((order) => (
      String(order.customerId || "") === String(user.id)
      && String(order.idempotencyKey || "").toLowerCase() === idempotencyKey
      && Date.parse(order.createdAt || "") >= idempotencyCutoff
    ));
    if (existingOrder) {
      const visibleOrderHistory = previousOrders.filter((order) => (
        String(order.customerId || "") === String(user.id)
        || (
          !String(order.customerId || "")
          && normalizeEmail(order.customerEmail || "") === normalizeEmail(user.email || "")
        )
      ));
      const whatsappNumber = normalizePhone(draft.contactSettings?.whatsappNumber || "");
      responsePayload = {
        ok: true,
        idempotentReplay: true,
        order: existingOrder,
        products: Array.isArray(draft.products) ? draft.products : [],
        orderHistory: visibleOrderHistory,
        whatsappUrl: buildWhatsAppLink(whatsappNumber, buildOrderText(existingOrder)),
      };
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
    const paymentBaseTotal = couponEvaluation.ok ? Number(couponEvaluation.total) || subtotal : subtotal;
    const paymentSettings = draft.contactSettings?.paymentSettings || {};
    const readyBankAccounts = getReadyBankAccounts(paymentSettings);
    const transferReady = readyBankAccounts.length > 0;
    const paymentMethod = body?.paymentMethod
      ? normalizePaymentMethod(body.paymentMethod)
      : (transferReady ? PAYMENT_METHODS.transfer : PAYMENT_METHODS.cardLink);
    if (paymentMethod === PAYMENT_METHODS.transfer && !transferReady) {
      responsePayload = {
        ok: false,
        status: 409,
        message: "La transferencia bancaria todavía no está configurada. Elige tarjeta o contacta a la tienda.",
      };
      return draft;
    }
    const requestedBankAccountId = normalizeLine(body?.bankAccountId || "");
    const selectedBankAccount = paymentMethod === PAYMENT_METHODS.transfer
      ? (readyBankAccounts.find((account) => account.id === requestedBankAccountId) || (!requestedBankAccountId ? readyBankAccounts[0] : null))
      : null;
    if (paymentMethod === PAYMENT_METHODS.transfer && !selectedBankAccount) {
      responsePayload = {
        ok: false,
        status: 400,
        message: "La cuenta bancaria seleccionada ya no está disponible. Elige otra cuenta e inténtalo de nuevo.",
      };
      return draft;
    }
    const paymentProof = paymentMethod === PAYMENT_METHODS.transfer
      ? normalizeImageSource(body?.paymentProof || "")
      : "";
    if (paymentMethod === PAYMENT_METHODS.transfer && !paymentProof) {
      responsePayload = {
        ok: false,
        status: 400,
        message: "Es obligatorio adjuntar el comprobante de transferencia para confirmar el pedido.",
      };
      return draft;
    }
    const paymentFeePercent = normalizeCardFeePercent(paymentSettings.cardFeePercent);
    const paymentFeeAmount = calculatePaymentFee(paymentBaseTotal, paymentMethod, paymentFeePercent);
    const total = calculatePayableTotal(paymentBaseTotal, paymentMethod, paymentFeePercent);

    const code = createFriendlyOrderCode(previousOrders);
    const nowIso = new Date().toISOString();
    const nextOrder = {
      id: crypto.randomUUID(),
      idempotencyKey,
      code,
      createdAt: nowIso,
      subtotal,
      discountAmount,
      total,
      paymentMethod,
      paymentMethodLabel: getPaymentMethodLabel(paymentMethod),
      paymentBaseTotal,
      paymentFeePercent: paymentMethod === PAYMENT_METHODS.cardLink ? paymentFeePercent : 0,
      paymentFeeAmount,
      paymentBankAccountId: selectedBankAccount?.id || "",
      paymentBankAccount: selectedBankAccount ? {
        id: selectedBankAccount.id,
        bankName: normalizeLine(selectedBankAccount.bankName || "").slice(0, 80),
        accountType: normalizeLine(selectedBankAccount.accountType || "").slice(0, 40),
        accountNumber: normalizeLine(selectedBankAccount.accountNumber || "").slice(0, 80),
        accountHolder: normalizeLine(selectedBankAccount.accountHolder || "").slice(0, 120),
        accountId: normalizeLine(selectedBankAccount.accountId || "").slice(0, 40),
      } : null,
      couponCode: couponEvaluation.ok ? couponEvaluation.code : "",
      couponDiscountType: couponEvaluation.ok ? couponEvaluation?.coupon?.discountType || "" : "",
      couponDiscountValue: couponEvaluation.ok ? Number(couponEvaluation?.coupon?.discountValue) || 0 : 0,
      couponEligibleSubtotal: couponEvaluation.ok ? Number(couponEvaluation.eligibleSubtotal) || 0 : 0,
      couponExcludedSubtotal: couponEvaluation.ok ? Number(couponEvaluation.excludedSubtotal) || 0 : 0,
      itemCount: safeCart.reduce((acc, item) => acc + item.quantity, 0),
      status: normalizeOrderStatus("Pendiente"),
      guideNumber: "",
      paymentProof,
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

    const lowStockAlerts = [];

    draft.products = products.map((product) => {
      const related = safeCart.filter((item) => String(item.id) === String(product.id));
      if (!related.length) return product;

      const nextVariants = (Array.isArray(product.variants) ? product.variants : []).map((variant) => {
        const variantKey = buildVariantKey(product.id, variant.color, variant.size);
        const requestedQuantity = requestedByVariant.get(variantKey) || 0;
        if (!requestedQuantity) return variant;
        const nextStock = Math.max(0, (Number(variant.stock) || 0) - requestedQuantity);
        if (nextStock <= 1) {
          lowStockAlerts.push({
            productName: product.name,
            color: variant.color,
            size: variant.size,
            remainingStock: nextStock,
          });
        }
        return {
          ...variant,
          stock: nextStock,
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
      lowStockAlerts,
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

  if (responsePayload.order) {
    try {
      await dispatchOrderNotifications(responsePayload.order, {
        lowStockAlerts: responsePayload.lowStockAlerts,
      });
    } catch (err) {
      console.error("[notifications-dispatch-error]", err?.message || err);
    }
  }

  res.status(200).json(responsePayload);
}
