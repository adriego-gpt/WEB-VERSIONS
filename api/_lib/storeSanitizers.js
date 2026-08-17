import crypto from "node:crypto";
import { normalizeCouponList } from "../../src/services/couponService.js";
import {
  isValidEmail,
  normalizeImageSource,
  normalizeLine,
  normalizeOptionLabel,
  normalizePhone,
  normalizeSafeUrl,
  sanitizeParagraph,
} from "./security.js";

const FALLBACK_IMAGE = "https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=1200&q=80";
const MAX_PRODUCTS = 250;
const MAX_HERO_SLIDES = 6;
const MAX_IMAGES_PER_COLOR = 8;
const DEFAULT_POST_PURCHASE_TEMPLATE = "Hola {cliente}, tu pedido {codigo} quedo registrado por {total}. Te ayudamos a finalizar pago y envio por aqui.";
const DEFAULT_ABANDONED_CART_TEMPLATE = "Hola {cliente}, tienes {items} producto(s) pendientes por {total}. Si quieres, te ayudo a cerrarlo ahora mismo.";
const DEFAULT_HERO_BADGE_TEXT = "La mejor coleccion premium, a un solo clic";

function clampNumber(value, minimum, maximum, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, parsed));
}

function sanitizeArray(value, maxItems = 100) {
  return Array.isArray(value) ? value.slice(0, maxItems) : [];
}

function sanitizeStringArray(value, maxItems = 12, maxLength = 40) {
  return [...new Set(
    sanitizeArray(value, maxItems)
      .map((entry) => normalizeOptionLabel(entry).slice(0, maxLength))
      .filter(Boolean),
  )];
}

function summarizeStockBySize(variants = [], sizes = []) {
  return Object.fromEntries(
    sizes.map((size) => [
      size,
      variants
        .filter((variant) => variant.size === size)
        .reduce((total, variant) => total + Math.max(0, Number(variant.stock) || 0), 0),
    ]),
  );
}

function sanitizeVariants(rawVariants = [], rawColors = [], rawSizes = [], rawStockBySize = {}) {
  const colorCandidates = sanitizeStringArray(rawColors, 12, 30);
  const sizeCandidates = sanitizeStringArray(rawSizes, 20, 20);
  const safeVariants = sanitizeArray(rawVariants, 120)
    .map((variant) => ({
      uid: String(variant?.uid || crypto.randomUUID()),
      color: normalizeOptionLabel(variant?.color || "").slice(0, 30),
      size: normalizeOptionLabel(variant?.size || "").slice(0, 20),
      stock: Math.max(0, Math.floor(Number(variant?.stock) || 0)),
    }))
    .filter((variant) => variant.color && variant.size);

  if (safeVariants.length) {
    return safeVariants.map((variant) => ({
      ...variant,
      stock: Math.min(999, variant.stock),
    }));
  }

  const fallbackColors = colorCandidates.length ? colorCandidates : ["General"];
  const fallbackSizes = sizeCandidates.length ? sizeCandidates : ["Única"];

  return fallbackColors.flatMap((color) => fallbackSizes.map((size) => ({
    uid: crypto.randomUUID(),
    color,
    size,
    stock: Math.min(999, Math.max(0, Math.floor(Number(rawStockBySize?.[size]) || 0))),
  })));
}

function sanitizeImagesByColor(rawImagesByColor = {}, colors = []) {
  const entries = rawImagesByColor && typeof rawImagesByColor === "object" && !Array.isArray(rawImagesByColor)
    ? Object.entries(rawImagesByColor).slice(0, 12)
    : [];

  const safeMap = new Map();

  entries.forEach(([rawColor, rawImages]) => {
    const color = normalizeOptionLabel(rawColor).slice(0, 30);
    if (!color) return;
    const safeImages = sanitizeArray(rawImages, MAX_IMAGES_PER_COLOR)
      .map((image) => normalizeImageSource(image))
      .filter(Boolean);
    if (safeImages.length) {
      safeMap.set(color, safeImages);
    }
  });

  colors.forEach((color) => {
    if (!safeMap.has(color)) {
      safeMap.set(color, [FALLBACK_IMAGE]);
    }
  });

  if (!safeMap.size) {
    safeMap.set("General", [FALLBACK_IMAGE]);
  }

  return Object.fromEntries(safeMap.entries());
}

function sanitizeProducts(rawProducts = []) {
  return sanitizeArray(rawProducts, MAX_PRODUCTS)
    .map((product) => {
      const name = normalizeLine(product?.name || "").slice(0, 120);
      if (!name) return null;

      const productId = product?.id != null ? String(product.id) : crypto.randomUUID();
      const rawPrice = clampNumber(product?.price, 0, 100000, 0);
      const offerEnabled = Boolean(product?.offerEnabled);
      const offerDiscountMode = product?.offerDiscountMode === "amount" ? "amount" : "percent";
      const rawOfferValue = offerDiscountMode === "amount"
        ? clampNumber(product?.offerDiscountValue ?? product?.offerExtraAmount, 0, 100000, 0)
        : clampNumber(product?.offerDiscountValue ?? product?.offerExtraDiscount, 0, 99, 0);
      const explicitBasePrice = product?.basePrice != null
        ? clampNumber(product?.basePrice, 0, 100000, rawPrice)
        : 0;
      const baseForFallback = Math.max(explicitBasePrice, rawPrice);
      const fallbackOfferPercent = offerDiscountMode === "percent"
        ? rawOfferValue
        : (baseForFallback > 0 ? ((rawOfferValue / baseForFallback) * 100) : 0);
      const fallbackOfferAmount = offerDiscountMode === "amount"
        ? rawOfferValue
        : (baseForFallback * (rawOfferValue / 100));
      const inferredBaseFromPercent = offerEnabled && offerDiscountMode === "percent" && fallbackOfferPercent > 0
        ? rawPrice / Math.max(0.01, (1 - (Math.min(99, fallbackOfferPercent) / 100)))
        : 0;
      const inferredBaseFromAmount = offerEnabled && offerDiscountMode === "amount" && fallbackOfferAmount > 0
        ? rawPrice + fallbackOfferAmount
        : 0;
      const safeBasePrice = clampNumber(
        Math.max(explicitBasePrice, rawPrice, inferredBaseFromPercent, inferredBaseFromAmount),
        0,
        100000,
        rawPrice,
      );

      let safeOfferPercent = clampNumber(product?.offerExtraDiscount, 0, 99, fallbackOfferPercent);
      let safeOfferAmount = clampNumber(product?.offerExtraAmount, 0, 100000, fallbackOfferAmount);

      if (offerDiscountMode === "amount") {
        safeOfferAmount = Math.min(safeBasePrice, safeOfferAmount);
        safeOfferPercent = safeBasePrice > 0 ? Math.min(99, (safeOfferAmount / safeBasePrice) * 100) : 0;
      } else {
        safeOfferPercent = Math.min(99, safeOfferPercent);
        safeOfferAmount = safeBasePrice * (safeOfferPercent / 100);
      }

      const normalizedOfferPercent = Number(safeOfferPercent.toFixed(2));
      const normalizedOfferAmount = Number(safeOfferAmount.toFixed(2));
      const offerDiscountValue = offerDiscountMode === "amount"
        ? normalizedOfferAmount
        : normalizedOfferPercent;
      const effectivePrice = offerEnabled
        ? Math.max(0, Number((safeBasePrice * (1 - (normalizedOfferPercent / 100))).toFixed(2)))
        : safeBasePrice;
      const safeOldPrice = clampNumber(product?.oldPrice ?? safeBasePrice, 0, 100000, safeBasePrice);
      const oldPrice = Math.max(safeOldPrice, safeBasePrice, effectivePrice);

      const variants = sanitizeVariants(product?.variants, product?.colors, product?.sizes, product?.stockBySize);
      const colors = sanitizeStringArray(variants.map((variant) => variant.color), 12, 30);
      const sizes = sanitizeStringArray(variants.map((variant) => variant.size), 20, 20);
      const imagesByColor = sanitizeImagesByColor(product?.imagesByColor, colors);

      return {
        id: productId,
        name,
        basePrice: safeBasePrice,
        price: effectivePrice,
        oldPrice,
        category: normalizeLine(product?.category || "General").slice(0, 40),
        productType: normalizeLine(product?.productType || "General").slice(0, 40),
        description: sanitizeParagraph(product?.description || "").slice(0, 1200),
        imagesByColor,
        colors,
        sizes,
        variants,
        stockBySize: summarizeStockBySize(variants, sizes),
        filterTags: sanitizeStringArray(product?.filterTags, 12, 40),
        featured: Boolean(product?.featured),
        rating: clampNumber(product?.rating, 0, 5, 5),
        newArrival: Boolean(product?.newArrival),
        isPublic: product?.isPublic !== false,
        offerEnabled,
        offerDiscountMode,
        offerDiscountValue,
        offerExtraDiscount: normalizedOfferPercent,
        offerExtraAmount: normalizedOfferAmount,
      };
    })
    .filter(Boolean);
}

function sanitizeManagedEntities(rawRecords = [], prefix = "item") {
  return sanitizeArray(rawRecords, 80)
    .map((record) => {
      const name = normalizeOptionLabel(record?.name || record?.label || "").slice(0, 40);
      if (!name) return null;
      const slug = normalizeLine(record?.slug || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60);

      return {
        id: String(record?.id || `${prefix}-${slug || crypto.randomUUID()}`),
        name,
        slug: slug || name.toLowerCase().replace(/\s+/g, "-"),
        active: record?.active !== false,
      };
    })
    .filter(Boolean);
}

function sanitizeContactSettings(rawSettings = {}) {
  const normalizedEmail = normalizeLine(rawSettings?.email || "").slice(0, 120).toLowerCase();
  return {
    address: sanitizeParagraph(rawSettings?.address || "").slice(0, 280),
    locationNote: sanitizeParagraph(rawSettings?.locationNote || "").slice(0, 320),
    whatsappNumber: normalizePhone(rawSettings?.whatsappNumber || "").slice(0, 20),
    whatsappLink: normalizeSafeUrl(rawSettings?.whatsappLink || ""),
    phone: normalizePhone(rawSettings?.phone || "").slice(0, 20),
    email: isValidEmail(normalizedEmail) ? normalizedEmail : "",
    mapsLink: normalizeSafeUrl(rawSettings?.mapsLink || ""),
    instagram: normalizeSafeUrl(rawSettings?.instagram || ""),
    facebook: normalizeSafeUrl(rawSettings?.facebook || ""),
    tiktok: normalizeSafeUrl(rawSettings?.tiktok || ""),
  };
}

function sanitizeStoreSettings(rawSettings = {}) {
  const automationSource = rawSettings?.automationSettings && typeof rawSettings.automationSettings === "object"
    ? rawSettings.automationSettings
    : {};
  const heroSlides = sanitizeArray(rawSettings?.heroSlides, MAX_HERO_SLIDES).map((slide) => ({
    id: String(slide?.id || crypto.randomUUID()),
    title: normalizeLine(slide?.title || "").slice(0, 80),
    subtitle: sanitizeParagraph(slide?.subtitle || "").slice(0, 240),
    image: normalizeSafeUrl(slide?.image || "") || FALLBACK_IMAGE,
    linkedProductId: slide?.linkedProductId != null ? String(slide.linkedProductId) : "",
    targetUrl: normalizeSafeUrl(slide?.targetUrl || ""),
  }));

  const rawHeroBadgeText = normalizeLine(rawSettings?.heroBadgeText || "").slice(0, 100);
  const heroBadgeText = /premium\s+listo\s+para\s+vender/i.test(rawHeroBadgeText)
    ? DEFAULT_HERO_BADGE_TEXT
    : rawHeroBadgeText;

  return {
    brandLabel: normalizeLine(rawSettings?.brandLabel || "").slice(0, 80),
    brandName: normalizeLine(rawSettings?.brandName || "").slice(0, 80),
    heroBadgeText,
    primaryCtaText: normalizeLine(rawSettings?.primaryCtaText || "").slice(0, 40),
    offerLabel: normalizeLine(rawSettings?.offerLabel || "").slice(0, 40),
    offerPercentage: clampNumber(rawSettings?.offerPercentage, 0, 99, 0),
    offerText: normalizeLine(rawSettings?.offerText || "").slice(0, 120),
    saleTitle: normalizeLine(rawSettings?.saleTitle || "").slice(0, 120),
    saleDescription: sanitizeParagraph(rawSettings?.saleDescription || "").slice(0, 320),
    footerTitle: normalizeLine(rawSettings?.footerTitle || "").slice(0, 120),
    footerText: sanitizeParagraph(rawSettings?.footerText || "").slice(0, 320),
    automationSettings: {
      postPurchaseEnabled: automationSource.postPurchaseEnabled !== false,
      postPurchaseTemplate: sanitizeParagraph(automationSource.postPurchaseTemplate || DEFAULT_POST_PURCHASE_TEMPLATE).slice(0, 600) || DEFAULT_POST_PURCHASE_TEMPLATE,
      abandonedCartEnabled: automationSource.abandonedCartEnabled !== false,
      abandonedCartDelayMinutes: Math.floor(clampNumber(automationSource.abandonedCartDelayMinutes, 5, 1440, 45)),
      abandonedCartTemplate: sanitizeParagraph(automationSource.abandonedCartTemplate || DEFAULT_ABANDONED_CART_TEMPLATE).slice(0, 600) || DEFAULT_ABANDONED_CART_TEMPLATE,
    },
    heroSlides,
  };
}

function sanitizeOrderPatch(rawPatch = {}) {
  const allowedStatuses = new Set(["Pendiente", "Confirmado", "Preparando", "Enviado", "Listo para retiro", "Entregado", "Cancelado"]);
  const next = {};

  if (rawPatch?.status != null) {
    const safeStatus = normalizeLine(rawPatch.status);
    if (allowedStatuses.has(safeStatus)) {
      next.status = safeStatus;
    }
  }

  if (rawPatch?.guideNumber != null) {
    next.guideNumber = normalizeLine(rawPatch.guideNumber).slice(0, 80);
  }

  if (rawPatch?.paymentProof != null) {
    next.paymentProof = normalizeImageSource(rawPatch.paymentProof);
  }

  return next;
}

function sanitizeAdminCatalogPayload(rawData = {}) {
  return {
    products: sanitizeProducts(rawData?.products),
    coupons: normalizeCouponList(rawData?.coupons),
    contactSettings: sanitizeContactSettings(rawData?.contactSettings),
    storeSettings: sanitizeStoreSettings(rawData?.storeSettings),
    productTypeRecords: sanitizeManagedEntities(rawData?.productTypeRecords, "product-type"),
    filterTagRecords: sanitizeManagedEntities(rawData?.filterTagRecords, "filter-tag"),
  };
}

export {
  sanitizeAdminCatalogPayload,
  sanitizeContactSettings,
  sanitizeManagedEntities,
  sanitizeOrderPatch,
  sanitizeProducts,
  sanitizeStoreSettings,
};





