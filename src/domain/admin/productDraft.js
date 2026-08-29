export const PRODUCT_DRAFT_VERSION = 1;
export const PRODUCT_DRAFT_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
export const PRODUCT_DRAFT_MAX_CHARS = 2_500_000;

function normalizeDraftColor(color = {}) {
  return {
    name: String(color.name || ""),
    hex: String(color.hex || ""),
    images: Array.isArray(color.images) ? color.images.map((image) => String(image || "")) : [],
    sizes: Array.isArray(color.sizes)
      ? color.sizes.map((entry) => ({
        size: String(entry?.size || ""),
        stock: String(entry?.stock ?? ""),
      }))
      : [],
  };
}

export function getProductFormSignature(form = {}) {
  return JSON.stringify({
    id: form.id == null ? null : String(form.id),
    name: String(form.name || ""),
    price: String(form.price ?? ""),
    oldPrice: String(form.oldPrice ?? ""),
    category: String(form.category || ""),
    productType: String(form.productType || ""),
    description: String(form.description || ""),
    filterTagsText: String(form.filterTagsText || ""),
    catalogColor: String(form.catalogColor || ""),
    featured: Boolean(form.featured),
    rating: String(form.rating ?? ""),
    newArrival: Boolean(form.newArrival),
    isPublic: form.isPublic !== false,
    offerEnabled: Boolean(form.offerEnabled),
    offerDiscountMode: String(form.offerDiscountMode || "percent"),
    offerDiscountValue: String(form.offerDiscountValue ?? "0"),
    offerExtraDiscount: String(form.offerExtraDiscount ?? "0"),
    colorsData: Array.isArray(form.colorsData) ? form.colorsData.map(normalizeDraftColor) : [],
  });
}

export function createProductDraftPayload(form, baselineSignature, savedAt = new Date().toISOString()) {
  return {
    version: PRODUCT_DRAFT_VERSION,
    savedAt,
    baselineSignature: String(baselineSignature || ""),
    form,
  };
}

export function parseProductDraftPayload(rawValue, options = {}) {
  if (!rawValue || typeof rawValue !== "string") return null;
  const now = Number(options.now) || Date.now();
  const maxAgeMs = Number(options.maxAgeMs) || PRODUCT_DRAFT_MAX_AGE_MS;
  try {
    const parsed = JSON.parse(rawValue);
    const savedAtMs = new Date(parsed?.savedAt || "").getTime();
    if (parsed?.version !== PRODUCT_DRAFT_VERSION) return null;
    if (!parsed.form || typeof parsed.form !== "object" || !Array.isArray(parsed.form.colorsData)) return null;
    if (!Number.isFinite(savedAtMs) || now - savedAtMs > maxAgeMs || savedAtMs - now > 5 * 60 * 1000) return null;
    return {
      ...parsed,
      baselineSignature: String(parsed.baselineSignature || ""),
    };
  } catch {
    return null;
  }
}
