export const PRODUCT_DRAFT_VERSION = 1;
export const PRODUCT_DRAFT_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
export const PRODUCT_DRAFT_MAX_CHARS = 2_500_000;

function normalizeDraftSizeKey(value = "") {
  return String(value).trim().toLocaleLowerCase("es");
}

export function addSizeToColorDrafts(colorsData = [], rawSize = "", options = {}) {
  const size = String(rawSize || "").trim();
  if (!size || !Array.isArray(colorsData)) return colorsData;
  const sizeKey = normalizeDraftSizeKey(size);
  const targetColorUid = options.colorUid == null ? null : String(options.colorUid);
  const maxSizes = Math.max(1, Number(options.maxSizes) || Number.POSITIVE_INFINITY);
  const makeUid = typeof options.createUid === "function"
    ? options.createUid
    : () => globalThis.crypto?.randomUUID?.() || `size-${Date.now()}`;
  let changed = false;
  const nextColors = colorsData.map((color) => {
    if (targetColorUid != null && String(color?.uid) !== targetColorUid) return color;
    const sizes = Array.isArray(color?.sizes) ? color.sizes : [];
    if (sizes.some((entry) => normalizeDraftSizeKey(entry?.size) === sizeKey)) return color;
    const emptyRowIndex = sizes.findIndex((entry) => !String(entry?.size || "").trim());
    if (emptyRowIndex >= 0) {
      changed = true;
      return {
        ...color,
        sizes: sizes.map((entry, index) => index === emptyRowIndex ? { ...entry, size } : entry),
      };
    }
    if (sizes.length >= maxSizes) return color;
    changed = true;
    return {
      ...color,
      sizes: [...sizes, { uid: makeUid(), size, stock: "0" }],
    };
  });
  return changed ? nextColors : colorsData;
}

export function removeSizeFromColorDrafts(colorsData = [], rawSize = "", options = {}) {
  const sizeKey = normalizeDraftSizeKey(rawSize);
  if (!sizeKey || !Array.isArray(colorsData)) return colorsData;
  const makeUid = typeof options.createUid === "function"
    ? options.createUid
    : () => globalThis.crypto?.randomUUID?.() || `size-${Date.now()}`;
  let changed = false;
  const nextColors = colorsData.map((color) => {
    const sizes = Array.isArray(color?.sizes) ? color.sizes : [];
    const remainingSizes = sizes.filter((entry) => normalizeDraftSizeKey(entry?.size) !== sizeKey);
    if (remainingSizes.length === sizes.length) return color;
    changed = true;
    return {
      ...color,
      sizes: remainingSizes.length
        ? remainingSizes
        : [{ uid: makeUid(), size: "", stock: "0" }],
    };
  });
  return changed ? nextColors : colorsData;
}

export function moveColorImageInDrafts(colorsData = [], colorUid, fromIndex, toIndex) {
  if (!Array.isArray(colorsData)) return colorsData;
  const safeColorUid = colorUid == null ? "" : String(colorUid);
  const safeFromIndex = Number(fromIndex);
  const safeToIndex = Number(toIndex);
  if (!safeColorUid
    || !Number.isInteger(safeFromIndex)
    || !Number.isInteger(safeToIndex)
    || safeFromIndex === safeToIndex) return colorsData;

  let changed = false;
  const nextColors = colorsData.map((color) => {
    if (String(color?.uid) !== safeColorUid) return color;
    const images = Array.isArray(color?.images) ? color.images : [];
    if (safeFromIndex < 0
      || safeToIndex < 0
      || safeFromIndex >= images.length
      || safeToIndex >= images.length) return color;

    const nextImages = [...images];
    const nextImageViews = images.map((_, index) => color.imageViews?.[index] || "");
    const [movedImage] = nextImages.splice(safeFromIndex, 1);
    const [movedView] = nextImageViews.splice(safeFromIndex, 1);
    nextImages.splice(safeToIndex, 0, movedImage);
    nextImageViews.splice(safeToIndex, 0, movedView);
    changed = true;
    return { ...color, images: nextImages, imageViews: nextImageViews };
  });

  return changed ? nextColors : colorsData;
}

function normalizeDraftColor(color = {}) {
  return {
    name: String(color.name || ""),
    hex: String(color.hex || ""),
    images: Array.isArray(color.images) ? color.images.map((image) => String(image || "")) : [],
    imageViews: Array.isArray(color.imageViews) ? color.imageViews : [],
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
    sku: String(form.sku || ""),
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
