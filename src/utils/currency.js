/**
 * Currency formatting and pricing utilities.
 */

export function currency(value) {
  return new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" }).format(Number(value) || 0);
}

export function discountPercent(price, oldPrice) {
  const currentPrice = Number(price) || 0;
  const previousPrice = Number(oldPrice) || 0;
  if (!previousPrice || previousPrice <= currentPrice) return 0;
  return Math.round(((previousPrice - currentPrice) / previousPrice) * 100);
}

export function computeOfferPrice(basePrice, extraDiscountPercent) {
  const normalizedBase = Math.max(0, Number(basePrice) || 0);
  const normalizedExtra = Math.max(0, Number(extraDiscountPercent) || 0);
  if (!normalizedBase || !normalizedExtra) return normalizedBase;
  const discounted = normalizedBase * (1 - (normalizedExtra / 100));
  return Math.max(0, Number(discounted.toFixed(2)));
}

export function normalizeOfferDiscountMode(value = "percent") {
  return value === "amount" ? "amount" : "percent";
}

export function parseLoosePositiveNumber(value = "") {
  if (value == null) return 0;
  const normalized = String(value)
    .replace(",", ".")
    .replace(/[^\d.]/g, "")
    .replace(/(\..*?)\..*/g, "$1");
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, parsed);
}

export function resolveOfferDiscount(basePrice, mode, rawValue) {
  const normalizedBase = Math.max(0, Number(basePrice) || 0);
  const normalizedMode = normalizeOfferDiscountMode(mode);
  if (!normalizedBase) {
    return {
      mode: normalizedMode,
      value: 0,
      percent: 0,
      amount: 0,
    };
  }

  if (normalizedMode === "amount") {
    const amount = Math.min(normalizedBase, parseLoosePositiveNumber(rawValue));
    const percent = amount > 0 ? (amount / normalizedBase) * 100 : 0;
    return {
      mode: normalizedMode,
      value: Number(amount.toFixed(2)),
      percent: Number(Math.min(99, percent).toFixed(2)),
      amount: Number(amount.toFixed(2)),
    };
  }

  const percent = Math.min(99, parseLoosePositiveNumber(rawValue));
  const amount = normalizedBase * (percent / 100);
  return {
    mode: normalizedMode,
    value: Number(percent.toFixed(2)),
    percent: Number(percent.toFixed(2)),
    amount: Number(amount.toFixed(2)),
  };
}

export function hasRawOfferMetadata(rawProduct) {
  if (!rawProduct || typeof rawProduct !== "object") return false;
  return rawProduct.basePrice != null
    || rawProduct.offerEnabled != null
    || rawProduct.offerDiscountMode != null
    || rawProduct.offerDiscountValue != null
    || rawProduct.offerExtraDiscount != null
    || rawProduct.offerExtraAmount != null;
}
