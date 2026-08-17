const ORDER_REFERENCE_PREFIX = "ORDER-";
const ORDER_REFERENCE_BASE = 10000;

function sanitizeLine(value = "") {
  return String(value).replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeOptionLabel(value = "") {
  return String(value).trim().replace(/\s+/g, " ");
}

function normalizeCode(value = "") {
  return sanitizeLine(value).toUpperCase();
}

function normalizeNumeric(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

function normalizePositiveInteger(value, fallback = 0) {
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

function safeDateToIso(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return null;
  return parsed.toISOString();
}

function normalizePercentage(value) {
  return Math.max(0, Math.min(100, normalizeNumeric(value, 0)));
}

function normalizeHourValue(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const match = raw.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (!match) return "";
  const hours = match[1].padStart(2, "0");
  const minutes = match[2];
  return `${hours}:${minutes}`;
}

function hourValueToMinutes(value = "") {
  const normalized = normalizeHourValue(value);
  if (!normalized) return null;
  const [hours, minutes] = normalized.split(":").map((part) => Number(part));
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return (hours * 60) + minutes;
}

function normalizeCouponList(rawCoupons = []) {
  if (!Array.isArray(rawCoupons)) return [];
  return rawCoupons
    .map((coupon) => normalizeCoupon(coupon))
    .filter((coupon) => coupon && coupon.code);
}

function normalizeCoupon(rawCoupon = {}) {
  const code = normalizeCode(rawCoupon.code || "");
  if (!code) return null;

  const discountType = rawCoupon.discountType === "fixed" ? "fixed" : "percentage";
  const discountValue = discountType === "percentage"
    ? normalizePercentage(rawCoupon.discountValue)
    : Math.max(0, normalizeNumeric(rawCoupon.discountValue, 0));

  const excludedProductIds = Array.isArray(rawCoupon.excludedProductIds)
    ? rawCoupon.excludedProductIds.map((entry) => String(entry)).filter(Boolean)
    : [];

  const excludedProductTypes = Array.isArray(rawCoupon.excludedProductTypes)
    ? rawCoupon.excludedProductTypes.map((entry) => normalizeOptionLabel(entry).toLowerCase()).filter(Boolean)
    : [];

  const allowedCategories = Array.isArray(rawCoupon.allowedCategories)
    ? rawCoupon.allowedCategories.map((entry) => normalizeOptionLabel(entry).toLowerCase()).filter(Boolean)
    : [];

  const startsAt = safeDateToIso(rawCoupon.startsAt);
  const activeHourStart = normalizeHourValue(rawCoupon.activeHourStart || "");
  const activeHourEnd = normalizeHourValue(rawCoupon.activeHourEnd || "");

  const usageByUser = rawCoupon.usageByUser && typeof rawCoupon.usageByUser === "object"
    ? Object.fromEntries(
      Object.entries(rawCoupon.usageByUser)
        .map(([userId, count]) => [String(userId), normalizePositiveInteger(count, 0)])
        .filter(([userId]) => Boolean(userId)),
    )
    : {};

  const nowIso = new Date().toISOString();

  return {
    id: rawCoupon.id || `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    code,
    discountType,
    discountValue,
    minPurchase: Math.max(0, normalizeNumeric(rawCoupon.minPurchase, 0)),
    excludedProductIds,
    excludedProductTypes,
    allowedCategories,
    limitPerUser: normalizePositiveInteger(rawCoupon.limitPerUser, 0),
    limitGlobal: normalizePositiveInteger(rawCoupon.limitGlobal, 0),
    startsAt,
    expiresAt: safeDateToIso(rawCoupon.expiresAt),
    activeHourStart,
    activeHourEnd,
    active: rawCoupon.active !== false,
    usageTotal: normalizePositiveInteger(rawCoupon.usageTotal, 0),
    usageByUser,
    createdAt: rawCoupon.createdAt || nowIso,
    updatedAt: rawCoupon.updatedAt || nowIso,
  };
}

function toCurrency(value) {
  return new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" }).format(Number(value) || 0);
}

function isCouponExpired(coupon, nowMs = Date.now()) {
  if (!coupon?.expiresAt) return false;
  const expiresMs = new Date(coupon.expiresAt).getTime();
  if (!Number.isFinite(expiresMs)) return false;
  return expiresMs < nowMs;
}

function isCouponBeforeStart(coupon, nowMs = Date.now()) {
  if (!coupon?.startsAt) return false;
  const startsMs = new Date(coupon.startsAt).getTime();
  if (!Number.isFinite(startsMs)) return false;
  return nowMs < startsMs;
}

function isCurrentTimeOutsideCouponWindow(coupon, now = new Date()) {
  const startMinutes = hourValueToMinutes(coupon?.activeHourStart || "");
  const endMinutes = hourValueToMinutes(coupon?.activeHourEnd || "");
  if (startMinutes == null || endMinutes == null) return false;
  const currentMinutes = (now.getHours() * 60) + now.getMinutes();
  if (startMinutes === endMinutes) return false;
  if (startMinutes < endMinutes) {
    return currentMinutes < startMinutes || currentMinutes > endMinutes;
  }
  return currentMinutes > endMinutes && currentMinutes < startMinutes;
}

function buildCouponMessage(state) {
  if (!state || !state.code) return "";
  const excludedItems = state.excludedItemsCount || 0;
  if (state.ok && excludedItems > 0) {
    return `Cupon aplicado parcialmente. ${excludedItems} producto(s) estan excluidos del descuento.`;
  }
  if (state.ok) {
    return `Cupon ${state.code} aplicado correctamente.`;
  }
  if (state.reason === "not-found") return "No encontramos ese cupon.";
  if (state.reason === "inactive") return "Este cupon esta desactivado.";
  if (state.reason === "not-started") return "Este cupon aun no esta activo.";
  if (state.reason === "expired") return "Este cupon esta vencido.";
  if (state.reason === "outside-schedule") return "Este cupon solo aplica en el horario configurado.";
  if (state.reason === "min-purchase") {
    return `Necesitas un minimo de compra de ${toCurrency(state.minPurchase || 0)} para usar este cupon.`;
  }
  if (state.reason === "no-eligible-items") {
    return "El cupon no aplica a los productos del carrito actual.";
  }
  if (state.reason === "user-limit") return "Ya alcanzaste el limite de uso de este cupon para tu cuenta.";
  if (state.reason === "global-limit") return "Este cupon alcanzo su limite de usos global.";
  if (state.reason === "requires-user") return "Inicia sesion para usar este cupon.";
  return "No pudimos aplicar el cupon.";
}

function evaluateCoupon({ code, coupons, cart, productsById, currentUser }) {
  const normalizedCode = normalizeCode(code);
  const subtotal = (Array.isArray(cart) ? cart : []).reduce((total, item) => total + (Number(item.price) || 0) * (Number(item.quantity) || 0), 0);
  const emptyResult = {
    ok: false,
    code: normalizedCode,
    reason: normalizedCode ? "not-found" : "empty",
    subtotal,
    eligibleSubtotal: subtotal,
    excludedSubtotal: 0,
    discountAmount: 0,
    minPurchase: 0,
    total: subtotal,
    coupon: null,
    eligibleItemsCount: 0,
    excludedItemsCount: 0,
    message: "",
  };
  if (!normalizedCode) return { ...emptyResult, message: "" };

  const coupon = (Array.isArray(coupons) ? coupons : []).find((entry) => normalizeCode(entry.code) === normalizedCode);
  if (!coupon) {
    return {
      ...emptyResult,
      message: buildCouponMessage({ ...emptyResult, code: normalizedCode }),
    };
  }

  const isInactive = coupon.active === false;
  if (isInactive) {
    const state = { ...emptyResult, coupon, reason: "inactive", code: coupon.code };
    return { ...state, message: buildCouponMessage(state) };
  }

  if (isCouponBeforeStart(coupon)) {
    const state = { ...emptyResult, coupon, reason: "not-started", code: coupon.code };
    return { ...state, message: buildCouponMessage(state) };
  }

  if (isCouponExpired(coupon)) {
    const state = { ...emptyResult, coupon, reason: "expired", code: coupon.code };
    return { ...state, message: buildCouponMessage(state) };
  }

  if (isCurrentTimeOutsideCouponWindow(coupon)) {
    const state = { ...emptyResult, coupon, reason: "outside-schedule", code: coupon.code };
    return { ...state, message: buildCouponMessage(state) };
  }

  if (coupon.limitGlobal > 0 && coupon.usageTotal >= coupon.limitGlobal) {
    const state = { ...emptyResult, coupon, reason: "global-limit", code: coupon.code };
    return { ...state, message: buildCouponMessage(state) };
  }

  if (coupon.limitPerUser > 0 && !currentUser?.id) {
    const state = { ...emptyResult, coupon, reason: "requires-user", code: coupon.code };
    return { ...state, message: buildCouponMessage(state) };
  }

  const currentUserUsage = currentUser?.id ? Number(coupon.usageByUser?.[currentUser.id]) || 0 : 0;
  if (coupon.limitPerUser > 0 && currentUserUsage >= coupon.limitPerUser) {
    const state = { ...emptyResult, coupon, reason: "user-limit", code: coupon.code };
    return { ...state, message: buildCouponMessage(state) };
  }

  if (subtotal < coupon.minPurchase) {
    const state = {
      ...emptyResult,
      coupon,
      code: coupon.code,
      reason: "min-purchase",
      minPurchase: coupon.minPurchase,
    };
    return { ...state, message: buildCouponMessage(state) };
  }

  const productIdSet = new Set((coupon.excludedProductIds || []).map((entry) => String(entry)));
  const productTypeSet = new Set((coupon.excludedProductTypes || []).map((entry) => normalizeOptionLabel(entry).toLowerCase()));
  const allowedCategorySet = new Set((coupon.allowedCategories || []).map((entry) => normalizeOptionLabel(entry).toLowerCase()));

  let excludedSubtotal = 0;
  let eligibleSubtotal = 0;
  let excludedItemsCount = 0;
  let eligibleItemsCount = 0;

  (Array.isArray(cart) ? cart : []).forEach((item) => {
    const lineAmount = (Number(item.price) || 0) * (Number(item.quantity) || 0);
    const product = productsById?.get?.(item.id);
    const normalizedType = normalizeOptionLabel(product?.productType || "").toLowerCase();
    const normalizedCategory = normalizeOptionLabel(product?.category || "").toLowerCase();
    const categoryNotAllowed = allowedCategorySet.size > 0 && (!normalizedCategory || !allowedCategorySet.has(normalizedCategory));
    const isExcluded = productIdSet.has(String(item.id))
      || (normalizedType && productTypeSet.has(normalizedType))
      || (normalizedCategory && productTypeSet.has(normalizedCategory))
      || categoryNotAllowed;

    if (isExcluded) {
      excludedSubtotal += lineAmount;
      excludedItemsCount += 1;
      return;
    }
    eligibleSubtotal += lineAmount;
    eligibleItemsCount += 1;
  });

  if (eligibleSubtotal <= 0) {
    const state = {
      ...emptyResult,
      coupon,
      code: coupon.code,
      reason: "no-eligible-items",
      excludedSubtotal,
      eligibleSubtotal,
      excludedItemsCount,
      eligibleItemsCount,
    };
    return { ...state, message: buildCouponMessage(state) };
  }

  const rawDiscount = coupon.discountType === "percentage"
    ? eligibleSubtotal * (coupon.discountValue / 100)
    : coupon.discountValue;
  const discountAmount = Math.max(0, Math.min(eligibleSubtotal, rawDiscount));
  const total = Math.max(0, subtotal - discountAmount);

  const state = {
    ok: true,
    reason: excludedItemsCount > 0 ? "partial" : "applied",
    code: coupon.code,
    subtotal,
    eligibleSubtotal,
    excludedSubtotal,
    discountAmount,
    minPurchase: coupon.minPurchase,
    total,
    coupon,
    eligibleItemsCount,
    excludedItemsCount,
  };

  return { ...state, message: buildCouponMessage(state) };
}

function applyCouponUsage(coupon, userId = "") {
  if (!coupon) return coupon;
  const normalizedUserId = String(userId || "");
  const usageByUser = {
    ...(coupon.usageByUser || {}),
  };
  if (normalizedUserId) {
    usageByUser[normalizedUserId] = (Number(usageByUser[normalizedUserId]) || 0) + 1;
  }
  return {
    ...coupon,
    usageTotal: (Number(coupon.usageTotal) || 0) + 1,
    usageByUser,
    updatedAt: new Date().toISOString(),
  };
}

function toInputDateTimeValue(isoString = null) {
  if (!isoString) return "";
  const date = new Date(isoString);
  if (!Number.isFinite(date.getTime())) return "";
  const tzOffset = date.getTimezoneOffset() * 60000;
  const localDate = new Date(date.getTime() - tzOffset);
  return localDate.toISOString().slice(0, 16);
}

function fromInputDateTimeValue(value = "") {
  const trimmed = String(value || "").trim();
  if (!trimmed) return null;
  const date = new Date(trimmed);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toISOString();
}

function createEmptyCouponDraft() {
  return {
    id: "",
    code: "",
    discountType: "percentage",
    discountValue: "",
    minPurchase: "",
    startsAt: "",
    expiresAt: "",
    activeHourStart: "",
    activeHourEnd: "",
    allowedCategoriesText: "",
    excludedProductIds: [],
    excludedProductTypesText: "",
    limitPerUser: "",
    limitGlobal: "",
    active: true,
  };
}

function couponToDraft(coupon) {
  if (!coupon) return createEmptyCouponDraft();
  return {
    id: coupon.id,
    code: coupon.code,
    discountType: coupon.discountType,
    discountValue: String(coupon.discountValue),
    minPurchase: String(coupon.minPurchase || 0),
    startsAt: toInputDateTimeValue(coupon.startsAt),
    expiresAt: toInputDateTimeValue(coupon.expiresAt),
    activeHourStart: normalizeHourValue(coupon.activeHourStart || ""),
    activeHourEnd: normalizeHourValue(coupon.activeHourEnd || ""),
    allowedCategoriesText: (coupon.allowedCategories || []).join(", "),
    excludedProductIds: Array.isArray(coupon.excludedProductIds) ? coupon.excludedProductIds.map((entry) => String(entry)) : [],
    excludedProductTypesText: (coupon.excludedProductTypes || []).join(", "),
    limitPerUser: coupon.limitPerUser ? String(coupon.limitPerUser) : "",
    limitGlobal: coupon.limitGlobal ? String(coupon.limitGlobal) : "",
    active: coupon.active !== false,
  };
}

function parseCouponDraft(draft) {
  const normalizedCode = normalizeCode(draft.code);
  if (!normalizedCode) {
    return { error: "Ingresa el codigo del cupon." };
  }

  const discountType = draft.discountType === "fixed" ? "fixed" : "percentage";
  const discountValue = normalizeNumeric(draft.discountValue, 0);
  if (discountValue <= 0) {
    return { error: "Define un valor de descuento valido." };
  }
  if (discountType === "percentage" && discountValue > 100) {
    return { error: "El descuento porcentual no puede superar 100%." };
  }

  const minPurchase = Math.max(0, normalizeNumeric(draft.minPurchase, 0));
  const limitPerUser = normalizePositiveInteger(draft.limitPerUser || 0, 0);
  const limitGlobal = normalizePositiveInteger(draft.limitGlobal || 0, 0);
  const startsAt = fromInputDateTimeValue(draft.startsAt);
  const excludedProductTypes = String(draft.excludedProductTypesText || "")
    .split(",")
    .map((item) => normalizeOptionLabel(item).toLowerCase())
    .filter(Boolean);
  const allowedCategories = String(draft.allowedCategoriesText || "")
    .split(",")
    .map((item) => normalizeOptionLabel(item).toLowerCase())
    .filter(Boolean);

  const expiresAt = fromInputDateTimeValue(draft.expiresAt);
  const activeHourStart = normalizeHourValue(draft.activeHourStart || "");
  const activeHourEnd = normalizeHourValue(draft.activeHourEnd || "");
  if (startsAt && expiresAt && new Date(startsAt).getTime() > new Date(expiresAt).getTime()) {
    return { error: "La fecha de inicio no puede ser posterior a la fecha de expiracion." };
  }
  if ((activeHourStart && !activeHourEnd) || (!activeHourStart && activeHourEnd)) {
    return { error: "Configura hora de inicio y fin para la ventana horaria del cupon." };
  }

  return {
    value: normalizeCoupon({
      id: draft.id || `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      code: normalizedCode,
      discountType,
      discountValue,
      minPurchase,
      startsAt,
      expiresAt,
      activeHourStart,
      activeHourEnd,
      allowedCategories,
      excludedProductIds: Array.isArray(draft.excludedProductIds) ? draft.excludedProductIds.map((entry) => String(entry)).filter(Boolean) : [],
      excludedProductTypes,
      limitPerUser,
      limitGlobal,
      active: draft.active !== false,
    }),
  };
}

function createFriendlyOrderCode(orderHistory = []) {
  const safeOrders = Array.isArray(orderHistory) ? orderHistory : [];
  const maxExisting = safeOrders.reduce((max, order) => {
    const code = String(order?.code || "");
    const match = code.match(/^ORDER-(\d+)$/i);
    if (!match) return max;
    const numeric = Number(match[1]);
    if (!Number.isFinite(numeric)) return max;
    return Math.max(max, numeric);
  }, ORDER_REFERENCE_BASE - 1);
  const next = Math.max(ORDER_REFERENCE_BASE, maxExisting + 1);
  return `${ORDER_REFERENCE_PREFIX}${next}`;
}

export {
  createEmptyCouponDraft,
  couponToDraft,
  parseCouponDraft,
  normalizeCouponList,
  normalizeCoupon,
  normalizeCode,
  evaluateCoupon,
  applyCouponUsage,
  buildCouponMessage,
  createFriendlyOrderCode,
};


