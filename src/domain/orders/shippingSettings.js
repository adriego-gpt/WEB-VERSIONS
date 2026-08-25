/**
 * Shipping Settings & Fee Calculation Domain Logic
 */

export const DEFAULT_SHIPPING_SETTINGS = Object.freeze({
  shippingEnabled: true,
  freeShippingThreshold: 50,
  localShippingCost: 3.5,
  nationalShippingCost: 5.5,
  localShippingCity: "Quito",
});

export function normalizeShippingSettings(raw = {}) {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_SHIPPING_SETTINGS };

  const parsedThreshold = Number(raw.freeShippingThreshold);
  const parsedLocal = Number(raw.localShippingCost);
  const parsedNational = Number(raw.nationalShippingCost);

  return {
    shippingEnabled: raw.shippingEnabled !== false,
    freeShippingThreshold: Number.isFinite(parsedThreshold) && parsedThreshold >= 0 ? Math.min(10000, parsedThreshold) : DEFAULT_SHIPPING_SETTINGS.freeShippingThreshold,
    localShippingCost: Number.isFinite(parsedLocal) && parsedLocal >= 0 ? Math.min(500, parsedLocal) : DEFAULT_SHIPPING_SETTINGS.localShippingCost,
    nationalShippingCost: Number.isFinite(parsedNational) && parsedNational >= 0 ? Math.min(500, parsedNational) : DEFAULT_SHIPPING_SETTINGS.nationalShippingCost,
    localShippingCity: String(raw.localShippingCity || DEFAULT_SHIPPING_SETTINGS.localShippingCity).trim() || "Quito",
  };
}

export function calculateShippingFee({
  subtotal = 0,
  deliveryType = "delivery",
  deliveryCity = "",
  shippingSettings = DEFAULT_SHIPPING_SETTINGS,
} = {}) {
  const settings = normalizeShippingSettings(shippingSettings);

  // Pickup is always free
  if (deliveryType !== "delivery") {
    return {
      shippingCost: 0,
      isFree: true,
      reason: "pickup",
    };
  }

  // If shipping charges are disabled globally
  if (!settings.shippingEnabled) {
    return {
      shippingCost: 0,
      isFree: true,
      reason: "disabled",
    };
  }

  const safeSubtotal = Math.max(0, Number(subtotal) || 0);

  // Free shipping threshold reached
  if (settings.freeShippingThreshold > 0 && safeSubtotal >= settings.freeShippingThreshold) {
    return {
      shippingCost: 0,
      isFree: true,
      reason: "threshold_reached",
    };
  }

  const cityCandidate = String(deliveryCity || "").trim().toLowerCase();
  const localCity = settings.localShippingCity.trim().toLowerCase();

  const isLocal = Boolean(cityCandidate && localCity && (
    cityCandidate.includes(localCity) || localCity.includes(cityCandidate)
  ));

  const cost = isLocal ? settings.localShippingCost : settings.nationalShippingCost;

  return {
    shippingCost: Number(cost.toFixed(2)),
    isFree: cost === 0,
    reason: isLocal ? "local" : "national",
  };
}

export function calculateFreeShippingProgress({
  subtotal = 0,
  shippingSettings = DEFAULT_SHIPPING_SETTINGS,
} = {}) {
  const settings = normalizeShippingSettings(shippingSettings);
  const safeSubtotal = Math.max(0, Number(subtotal) || 0);
  const threshold = settings.freeShippingThreshold;

  if (!settings.shippingEnabled || threshold <= 0) {
    return {
      eligible: false,
      threshold: 0,
      remaining: 0,
      progressPercent: 100,
      isFree: true,
    };
  }

  const remaining = Math.max(0, Number((threshold - safeSubtotal).toFixed(2)));
  const progressPercent = Math.min(100, Math.max(0, Math.round((safeSubtotal / threshold) * 100)));
  const isFree = remaining === 0;

  return {
    eligible: true,
    threshold,
    remaining,
    progressPercent,
    isFree,
  };
}
