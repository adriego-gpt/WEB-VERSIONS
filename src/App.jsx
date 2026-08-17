import React, { Suspense, lazy, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  ShoppingBag,
  Plus,
  Minus,
  Trash2,
  MessageCircle,
  Search,
  Filter,
  Heart,
  Star,
  ChevronRight,
  ChevronLeft,
  ShieldCheck,
  Truck,
  RotateCcw,
  X,
  Tag,
  Tags,
  PencilLine,
  Clock3,
  BadgeCheck,
  Package,
  KeyRound,
  CheckCircle2,
  CircleX,
  Eye,
  Menu,
  UserRound,
  House,
  LayoutGrid,
  Copy,
  Navigation,
  Mail,
  MapPin,
  Store,
} from "lucide-react";
import { motion as Motion, AnimatePresence, MotionConfig } from "framer-motion";
import {
  couponToDraft,
  createEmptyCouponDraft,
  normalizeCode,
  normalizeCouponList,
  parseCouponDraft,
} from "./services/couponService";
import {
  getAdminSessionStatus,
  loginAdminSession,
  logoutAdminSession,
  touchAdminSession,
} from "./services/adminSessionService";
import {
  changeUserPassword,
  confirmUserPasswordReset,
  getUserSessionStatus,
  loginUserAccount,
  logoutUserAccount,
  requestUserPasswordReset,
  registerUserAccount,
  syncUserAccountState,
  updateUserProfile,
} from "./services/userAccountService";
import {
  deleteAdminUserRecord,
  generateAdminUserPasswordResetLink,
  listAdminUsers,
  sendAdminUserPasswordResetLink,
  updateAdminUserRecord,
} from "./services/adminUsersService";
import {
  createServerCheckoutOrder,
  deleteServerOrder,
  getCatalogState,
  getRealtimeSyncStatus,
  getSecurityMetricsSnapshot,
  listServerOrders,
  previewCouponApplication,
  resetSecurityMetricsSnapshot,
  syncCatalogState,
  updateServerOrder,
} from "./services/serverStateService";
import { ensureCsrfToken } from "./services/httpClient";
import { useBodyScrollLock } from "./hooks/useBodyScrollLock";
import { useMobileNavGuards } from "./hooks/useMobileNavGuards";
import whatsappIconUrl from "./assets/social/whatsapp.svg";
import instagramIconUrl from "./assets/social/instagram.svg";
import facebookIconUrl from "./assets/social/facebook.svg";
import tiktokIconUrl from "./assets/social/tiktok.svg";
import "./App.css";
import {
  ANIMATION,
  STORAGE_KEYS,
  PASSWORD_SECURITY,
  AUTH_FORM_DEFAULTS,
  AUTH_FIELD_LIMITS,
  FILE_SECURITY,
  PRODUCT_FORM_LIMITS,
  FALLBACK_IMAGE,
  PRODUCT_TYPE_OPTIONS,
  OFFER_TAB_VALUE,
  ADMIN_ORDER_DATE_FILTERS,
  ADMIN_ORDER_DELIVERY_FILTERS,
  ADMIN_ORDER_STATUS_FILTERS,
  TOAST_DURATION_MS,
  MAX_ADDRESS_BOOK_ENTRIES,
  DEFAULT_WHATSAPP_COUNTRY_CODE,
} from "./constants";
import {
  normalizeEntityId,
  normalizeOptionLabel,
  sanitizeLine,
  sanitizeParagraph,
  normalizeEmail,
  slugify,
  splitFilterTagsText,
  currency,
  discountPercent,
  computeOfferPrice,
  normalizeOfferDiscountMode,
  parseLoosePositiveNumber,
  resolveOfferDiscount,
  hasRawOfferMetadata,
  readStorage,
  saveStorage,
  removeStorage,
  normalizePhoneNumber,
  normalizeUserPhoneNumber,
  normalizeWhatsAppInternationalNumber,
  normalizeSafeUrl,
  isValidEmail,
  normalizeContactEmail,
  buildMailtoLink,
  buildWhatsAppLink,
  buildWhatsAppApiSendLink,
  buildWhatsAppWebSendLink,
  buildWhatsAppLinkFromBase,
  launchExternalUrl,
  launchWhatsAppUrl,
  preOpenExternalWindow,
  closeExternalWindow,
  copyTextToClipboard,
  estimateDataUrlBytes,
  normalizeImageSource,
  fileToDataUrl,
  createUid,
  formatMinutesRemaining,
  formatAdminTimestamp,
  hasStrongPassword,
  normalizeUsername,
  buildUsernameFromAuth,
  getPasswordChecks,
  buildAuthValidation,
} from "./utils";

const { startTransition } = React;
const UserAuthSheet = lazy(() => import("./components/modals/AuthModals").then((module) => ({ default: module.UserAuthModal })));
const ProfileModal = lazy(() => import("./components/modals/AuthModals").then((module) => ({ default: module.ProfileModal })));


function normalizeStoredFavorites(rawValue = []) {
  const list = Array.isArray(rawValue) ? rawValue : [];
  return [...new Set(list.map((entry) => normalizeEntityId(entry)).filter(Boolean))];
}

function normalizeStoredCart(rawValue = []) {
  const list = Array.isArray(rawValue) ? rawValue : [];
  return list
    .map((item) => {
      const id = normalizeEntityId(item?.id);
      const color = normalizeOptionLabel(item?.color || "");
      const size = normalizeOptionLabel(item?.size || "");
      if (!id || !color || !size) return null;
      const quantity = Math.max(1, Math.min(10, Number(item?.quantity) || 1));
      const key = sanitizeLine(item?.key || `${id}-${color}-${size}`) || `${id}-${color}-${size}`;
      return {
        ...item,
        id,
        color,
        size,
        quantity,
        key,
      };
    })
    .filter(Boolean);
}

function normalizeAccountCartState(rawValue = []) {
  return normalizeStoredCart(rawValue).map((item) => ({
    key: sanitizeLine(item.key || `${item.id}-${item.color}-${item.size}`),
    id: normalizeEntityId(item.id),
    color: normalizeOptionLabel(item.color || ""),
    size: normalizeOptionLabel(item.size || ""),
    quantity: Math.max(1, Math.min(10, Number(item.quantity) || 1)),
  }));
}



function normalizeManagedEntity(entry, prefix = "item") {
  const name = normalizeOptionLabel(typeof entry === "string" ? entry : entry?.name || entry?.label || "");
  const slug = slugify(typeof entry === "string" ? entry : entry?.slug || entry?.name || entry?.label || "");
  const id = typeof entry === "object" && entry?.id ? entry.id : `${prefix}-${slug || createUid()}`;
  return {
    id,
    name,
    slug,
    active: typeof entry === "object" ? entry?.active !== false : true,
    draftName: name,
    draftSlug: slug,
  };
}

function buildManagedEntities(rawEntries = [], fallbackNames = [], discoveredNames = [], prefix = "item") {
  const combined = [
    ...fallbackNames.map((item) => normalizeManagedEntity(item, prefix)),
    ...(Array.isArray(rawEntries) ? rawEntries.map((item) => normalizeManagedEntity(item, prefix)) : []),
    ...discoveredNames.map((item) => normalizeManagedEntity(item, prefix)),
  ];

  const map = new Map();
  combined.forEach((entry) => {
    if (!entry.name) return;
    const key = entry.name.toLowerCase();
    if (!map.has(key)) {
      map.set(key, entry);
      return;
    }
    const previous = map.get(key);
    map.set(key, {
      ...previous,
      id: previous.id || entry.id,
      active: previous.active || entry.active,
      slug: previous.slug || entry.slug,
      draftName: previous.name || entry.name,
      draftSlug: previous.slug || entry.slug,
    });
  });

  return Array.from(map.values());
}

function ensureManagedEntity(records = [], rawName, prefix = "item") {
  const name = normalizeOptionLabel(rawName);
  if (!name) return records;
  const index = records.findIndex((item) => item.name.toLowerCase() === name.toLowerCase());
  if (index >= 0) {
    const current = records[index];
    if (current.active) return records;
    return records.map((record, recordIndex) => recordIndex === index ? { ...record, active: true, draftName: record.name, draftSlug: record.slug } : record);
  }
  const slug = slugify(name);
  return [
    ...records,
    {
      id: `${prefix}-${slug || createUid()}`,
      name,
      slug,
      active: true,
      draftName: name,
      draftSlug: slug,
    },
  ];
}

function ensureManagedEntityExists(records = [], rawName, prefix = "item") {
  const name = normalizeOptionLabel(rawName);
  if (!name) return records;
  if (records.some((item) => item.name.toLowerCase() === name.toLowerCase())) return records;
  const slug = slugify(name);
  return [
    ...records,
    {
      id: `${prefix}-${slug || createUid()}`,
      name,
      slug,
      active: true,
      draftName: name,
      draftSlug: slug,
    },
  ];
}

const initialProducts = [
  {
    id: 1,
    name: "Blazer Oversize Premium",
    price: 89.99,
    oldPrice: 109.99,
    category: "Mujer",
    description: "Blazer de silueta amplia con cada elegante. Ideal para looks de da y noche.",
    imagesByColor: {
      Negro: [
        "https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=1200&q=80",
        "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=1200&q=80",
      ],
      Beige: ["https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=1200&q=80"],
      Blanco: ["https://images.unsplash.com/photo-1496747611176-843222e1e57c?auto=format&fit=crop&w=1200&q=80"],
    },
    colors: ["Negro", "Beige", "Blanco"],
    sizes: ["XS", "S", "M", "L"],
    featured: true,
    rating: 4.9,
    newArrival: true,
    productType: "Blazers",
    filterTags: ["Premium", "Oficina", "Nueva coleccion"],
  },
  {
    id: 2,
    name: "Camisa Linen Fit",
    price: 49.99,
    oldPrice: 59.99,
    category: "Hombre",
    description: "Camisa ligera de inspiracin resort con tacto fresco y ajuste impecable.",
    imagesByColor: {
      Blanco: ["https://images.unsplash.com/photo-1512436991641-6745cdb1723f?auto=format&fit=crop&w=1200&q=80"],
      Celeste: ["https://images.unsplash.com/photo-1507679799987-c73779587ccf?auto=format&fit=crop&w=1200&q=80"],
      Negro: ["https://images.unsplash.com/photo-1506629905607-d9c297d66f42?auto=format&fit=crop&w=1200&q=80"],
    },
    colors: ["Blanco", "Celeste", "Negro"],
    sizes: ["S", "M", "L", "XL"],
    featured: false,
    rating: 4.8,
    newArrival: false,
    productType: "Camisas",
    filterTags: ["Casual", "Lino"],
  },
  {
    id: 3,
    name: "Vestido Midi Satin",
    price: 79.99,
    oldPrice: 95.99,
    category: "Mujer",
    description: "Vestido de acabado satinado con movimiento suave y estilo sofisticado.",
    imagesByColor: {
      Rojo: ["https://images.unsplash.com/photo-1496747611176-843222e1e57c?auto=format&fit=crop&w=1200&q=80"],
      Negro: ["https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=1200&q=80"],
      Champagne: ["https://images.unsplash.com/photo-1487412947147-5cebf100ffc2?auto=format&fit=crop&w=1200&q=80"],
    },
    colors: ["Rojo", "Negro", "Champagne"],
    sizes: ["XS", "S", "M"],
    featured: true,
    rating: 4.9,
    newArrival: true,
    productType: "Vestidos",
    filterTags: ["Fiesta", "Satinado", "Premium"],
  },
  {
    id: 4,
    name: "Chaqueta Urban",
    price: 99.99,
    oldPrice: 119.99,
    category: "Hombre",
    description: "Chaqueta verstil con presencia moderna para elevar outfits casuales.",
    imagesByColor: {
      Negro: ["https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=1200&q=80"],
      Gris: ["https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=1200&q=80"],
      Verde: ["https://images.unsplash.com/photo-1507679799987-c73779587ccf?auto=format&fit=crop&w=1200&q=80"],
    },
    colors: ["Negro", "Gris", "Verde"],
    sizes: ["M", "L", "XL"],
    featured: false,
    rating: 4.7,
    newArrival: false,
    productType: "Chaquetas",
    filterTags: ["Streetwear", "Urbano"],
  },
  {
    id: 5,
    name: "Top Rib Essential",
    price: 34.99,
    oldPrice: 42.99,
    category: "Mujer",
    description: "Top ajustado bsico premium, perfecto para combinar con prendas clave.",
    imagesByColor: {
      Blanco: ["https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=1200&q=80"],
      Negro: ["https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=1200&q=80"],
      Nude: ["https://images.unsplash.com/photo-1487412947147-5cebf100ffc2?auto=format&fit=crop&w=1200&q=80"],
    },
    colors: ["Blanco", "Negro", "Nude"],
    sizes: ["XS", "S", "M", "L"],
    featured: false,
    rating: 4.8,
    newArrival: true,
    productType: "Tops",
    filterTags: ["Bsicos", "Rib", "Nuevo"],
  },
  {
    id: 6,
    name: "Pantaln Tailored Flow",
    price: 69.99,
    oldPrice: 84.99,
    category: "Mujer",
    description: "Pantaln recto de talle alto con estructura impecable y cada fluida.",
    imagesByColor: {
      Negro: ["https://images.unsplash.com/photo-1506629905607-d9c297d66f42?auto=format&fit=crop&w=1200&q=80"],
      Camel: ["https://images.unsplash.com/photo-1512436991641-6745cdb1723f?auto=format&fit=crop&w=1200&q=80"],
      Gris: ["https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=1200&q=80"],
    },
    colors: ["Negro", "Camel", "Gris"],
    sizes: ["S", "M", "L"],
    featured: true,
    rating: 4.9,
    newArrival: false,
    productType: "Pantalones",
    filterTags: ["Oficina", "Sastrero"],
  },
];

const defaultContactSettings = {
  address: "Av. Principal 123, Quito, Ecuador",
  locationNote: "Te esperamos en nuestro showroom para una asesora personalizada; tambien puedes abrir la ruta en Google Maps y llegar en minutos.",
  whatsappNumber: "593999999999",
  whatsappLink: "",
  phone: "",
  email: "",
  mapsLink: "https://maps.app.goo.gl/gc5qGjhA4xoQyzr68",
  instagram: "https://instagram.com/atelierstudio",
  facebook: "https://facebook.com/atelierstudio",
  tiktok: "",
};

const defaultStoreSettings = {
  brandLabel: "Adriego Store",
  brandName: "Adriego Store",
  heroBadgeText: "La mejor coleccion premium, a un solo clic",
  primaryCtaText: "Comprar ahora",
  offerLabel: "Ofertas",
  offerPercentage: 30,
  offerText: "Seleccion curada con descuento por tiempo limitado.",
  saleTitle: "Compra facil y atencion inmediata",
  saleDescription: "Arma tu pedido en minutos y recibe acompanamiento por WhatsApp para confirmar talla, disponibilidad y entrega.",
  footerTitle: "Vistanos y conversemos",
  footerText: "Atencion personalizada por WhatsApp, Instagram, Facebook y TikTok.",
  automationSettings: {
    postPurchaseEnabled: false,
    postPurchaseTemplate: "",
    abandonedCartEnabled: true,
    abandonedCartDelayMinutes: 45,
    abandonedCartTemplate: "Hola {cliente}, tienes {items} producto(s) pendientes por {total}. Si quieres, te ayudo a cerrarlo ahora mismo.",
  },
  heroSlides: [
    {
      id: "slide-1",
      title: "Nueva coleccion",
      subtitle: "Minimalismo, elegancia y venta directa por WhatsApp.",
      image: "https://images.unsplash.com/photo-1445205170230-053b83016050?auto=format&fit=crop&w=1400&q=80",
      linkedProductId: "",
      targetUrl: "",
    },
    {
      id: "slide-2",
      title: "Looks que convierten",
      subtitle: "Diseno premium inspirado en marcas de moda editorial.",
      image: "https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=1400&q=80",
      linkedProductId: "",
      targetUrl: "",
    },
    {
      id: "slide-3",
      title: "Compra rapida",
      subtitle: "Carrito elegante, detalles del pedido y cierre en un clic.",
      image: "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=1400&q=80",
      linkedProductId: "",
      targetUrl: "",
    },
  ],
};




function normalizeAutomationSettings(rawSettings = {}) {
  const source = rawSettings && typeof rawSettings === "object" ? rawSettings : {};
  const abandonedCartTemplate = sanitizeParagraph(source.abandonedCartTemplate || defaultStoreSettings.automationSettings.abandonedCartTemplate).slice(0, 600);
  const parsedDelay = Math.floor(Number(source.abandonedCartDelayMinutes));
  const abandonedCartDelayMinutes = Number.isFinite(parsedDelay)
    ? Math.min(1440, Math.max(5, parsedDelay))
    : defaultStoreSettings.automationSettings.abandonedCartDelayMinutes;
  return {
    postPurchaseEnabled: false,
    postPurchaseTemplate: "",
    abandonedCartEnabled: source.abandonedCartEnabled !== false,
    abandonedCartDelayMinutes,
    abandonedCartTemplate: abandonedCartTemplate || defaultStoreSettings.automationSettings.abandonedCartTemplate,
  };
}

function getOrderAgeMinutes(createdAt) {
  const createdMs = new Date(createdAt || "").getTime();
  if (!Number.isFinite(createdMs)) return 0;
  return Math.max(0, Math.round((Date.now() - createdMs) / 60000));
}

function getOrderSlaMeta(order = {}) {
  const status = normalizeOrderStatusForOrder(order.status, order.deliveryType);
  const ageMinutes = getOrderAgeMinutes(order.createdAt);

  if (status === "Cancelado" || status === "Entregado") {
    return { tone: "light", label: "Cerrado", ageMinutes };
  }
  if (status === "Pendiente") {
    if (ageMinutes >= 90) return { tone: "danger", label: "SLA critico", ageMinutes };
    if (ageMinutes >= 30) return { tone: "warning", label: "SLA en riesgo", ageMinutes };
    return { tone: "success", label: "SLA saludable", ageMinutes };
  }
  if (status === "Confirmado" || status === "Preparando") {
    if (ageMinutes >= 360) return { tone: "danger", label: "Preparacion lenta", ageMinutes };
    if (ageMinutes >= 120) return { tone: "warning", label: "Preparacion en riesgo", ageMinutes };
    return { tone: "success", label: "Preparacion en tiempo", ageMinutes };
  }
  if (status === "Enviado") {
    if (ageMinutes >= 2880) return { tone: "warning", label: "Entrega extendida", ageMinutes };
    return { tone: "light", label: "En ruta", ageMinutes };
  }
  if (status === "Listo para retiro") {
    if (ageMinutes >= 2880) return { tone: "warning", label: "Pendiente de retiro", ageMinutes };
    return { tone: "success", label: "Listo para entregar", ageMinutes };
  }
  return { tone: "light", label: "En seguimiento", ageMinutes };
}

function buildCouponFallbackState(couponCode, subtotal, message = "") {
  return {
    ok: false,
    code: normalizeCode(couponCode),
    message: message || "No pudimos validar el cupon en este momento.",
    subtotal,
    eligibleSubtotal: subtotal,
    excludedSubtotal: 0,
    discountAmount: 0,
    minPurchase: 0,
    total: subtotal,
    eligibleItemsCount: 0,
    excludedItemsCount: 0,
  };
}



function normalizeAddressBookEntry(rawEntry = {}, fallbackId = "") {
  const address = sanitizeParagraph(rawEntry?.address || "").slice(0, 320);
  if (!address) return null;
  const normalizedId = normalizeEntityId(rawEntry?.id || fallbackId || createUid());
  return {
    id: normalizedId || createUid(),
    label: sanitizeLine(rawEntry?.label || "Direccion guardada").slice(0, 48) || "Direccion guardada",
    address,
    city: sanitizeLine(rawEntry?.city || "").slice(0, 80),
    reference: sanitizeParagraph(rawEntry?.reference || "").slice(0, 260),
    phone: normalizeUserPhoneNumber(rawEntry?.phone || ""),
    isDefault: Boolean(rawEntry?.isDefault),
    updatedAt: String(rawEntry?.updatedAt || new Date().toISOString()),
  };
}

function normalizeAddressBook(rawAddressBook = [], options = {}) {
  const source = Array.isArray(rawAddressBook) ? rawAddressBook : [];
  const allowFallback = Boolean(options?.allowFallback);
  const fallbackAddress = sanitizeParagraph(options?.fallbackAddress || "").slice(0, 320);
  const fallbackPhone = normalizeUserPhoneNumber(options?.fallbackPhone || "");
  const deduped = [];
  const seenIds = new Set();

  source.forEach((entry, index) => {
    const normalized = normalizeAddressBookEntry(entry, `addr-${index + 1}`);
    if (!normalized) return;
    if (seenIds.has(normalized.id)) return;
    seenIds.add(normalized.id);
    deduped.push(normalized);
  });

  if (!deduped.length && allowFallback && fallbackAddress) {
    deduped.push(normalizeAddressBookEntry({
      label: "Principal",
      address: fallbackAddress,
      phone: fallbackPhone,
      isDefault: true,
    }, "addr-default"));
  }

  const clipped = deduped
    .filter(Boolean)
    .slice(0, MAX_ADDRESS_BOOK_ENTRIES);

  if (!clipped.length) return [];
  const explicitDefaultIndex = clipped.findIndex((entry) => entry.isDefault);
  return clipped.map((entry, index) => ({
    ...entry,
    isDefault: explicitDefaultIndex >= 0 ? explicitDefaultIndex === index : index === 0,
  }));
}

function getDefaultAddressBookEntry(addressBook = []) {
  const normalizedBook = normalizeAddressBook(addressBook);
  if (!normalizedBook.length) return null;
  return normalizedBook.find((entry) => entry.isDefault) || normalizedBook[0] || null;
}

function isSameAddressBookEntry(left = {}, right = {}) {
  return sanitizeParagraph(left.address || "") === sanitizeParagraph(right.address || "")
    && sanitizeLine(left.city || "") === sanitizeLine(right.city || "")
    && sanitizeParagraph(left.reference || "") === sanitizeParagraph(right.reference || "")
    && normalizeUserPhoneNumber(left.phone || "") === normalizeUserPhoneNumber(right.phone || "");
}




const BRAND_ICON_MAP = {
  whatsapp: whatsappIconUrl,
  instagram: instagramIconUrl,
  facebook: facebookIconUrl,
  tiktok: tiktokIconUrl,
};

function BrandSocialIcon({ icon, label, size = 15 }) {
  const iconUrl = BRAND_ICON_MAP[icon];
  if (!iconUrl) return null;
  return (
    <img
      src={iconUrl}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      data-label={label}
    />
  );
}






function createEmptyProductForm() {
  return {
    id: null,
    name: "",
    price: "",
    oldPrice: "",
    category: "Mujer",
    productType: "General",
    description: "",
    filterTagsText: "",
    featured: false,
    rating: "5",
    newArrival: true,
    isPublic: true,
    offerEnabled: false,
    offerDiscountMode: "percent",
    offerDiscountValue: "0",
    offerExtraDiscount: "0",
    colorsData: [
      {
        uid: createUid(),
        name: "Negro",
        images: [""],
        sizes: [
          { uid: createUid(), size: "S", stock: "5" },
          { uid: createUid(), size: "M", stock: "3" },
        ],
      },
    ],
  };
}

function normalizeProduct(rawProduct) {
  const rawColors = Array.isArray(rawProduct.colors)
    ? rawProduct.colors
    : typeof rawProduct.colors === "string"
      ? rawProduct.colors.split(",").map((item) => item.trim()).filter(Boolean)
      : [];

  let imagesByColor = rawProduct.imagesByColor || {};
  if ((!imagesByColor || Object.keys(imagesByColor).length === 0) && rawProduct.image) {
    const fallbackColor = rawColors[0] || "General";
    imagesByColor = { [fallbackColor]: [rawProduct.image] };
  }

  const colorNames = Object.keys(imagesByColor).length ? Object.keys(imagesByColor) : rawColors.length ? rawColors : ["General"];
  const fallbackImage = [].concat.apply([], Object.values(imagesByColor)).find(Boolean) || FALLBACK_IMAGE;
  const safeImagesByColor = Object.fromEntries(
    colorNames.map((color) => {
      const safeImages = Array.isArray(imagesByColor[color]) ? imagesByColor[color].map((item) => normalizeImageSource(item)).filter(Boolean) : [];
      return [color, safeImages.length ? safeImages : [fallbackImage]];
    }),
  );

  const sizes = Array.isArray(rawProduct.sizes)
    ? rawProduct.sizes
    : typeof rawProduct.sizes === "string"
      ? rawProduct.sizes.split(",").map((item) => item.trim()).filter(Boolean)
      : ["Única"];

  const normalizedSizes = sizes.length ? sizes : ["Única"];
  const stockBySize = parseStockBySize(rawProduct.stockBySize, normalizedSizes);
  const variants = buildVariantList(rawProduct.variants, colorNames, normalizedSizes, stockBySize);
  const filterTags = Array.isArray(rawProduct.filterTags)
    ? rawProduct.filterTags.map((item) => sanitizeLine(item)).filter(Boolean)
    : splitFilterTagsText(rawProduct.filterTags || "");

  const allSizes = [...new Set((variants.length ? variants : []).map((variant) => variant.size))];
  const offerDiscountMode = normalizeOfferDiscountMode(rawProduct.offerDiscountMode);
  const offerEnabled = Boolean(rawProduct.offerEnabled);
  const rawPrice = Math.max(0, Number(rawProduct.price) || 0);
  const explicitBasePrice = rawProduct.basePrice != null ? Math.max(0, Number(rawProduct.basePrice) || 0) : 0;
  const fallbackOfferPercent = Math.max(0, Number(rawProduct.offerExtraDiscount) || 0);
  const fallbackOfferAmount = Math.max(0, Number(rawProduct.offerExtraAmount) || 0);
  const fallbackOfferValue = rawProduct.offerDiscountValue != null
    ? parseLoosePositiveNumber(rawProduct.offerDiscountValue)
    : (offerDiscountMode === "amount" ? fallbackOfferAmount : fallbackOfferPercent);
  const inferredBasePrice = (() => {
    if (explicitBasePrice > 0 || !offerEnabled) return 0;
    if (offerDiscountMode === "amount") {
      const amount = Math.max(fallbackOfferValue, fallbackOfferAmount);
      return amount > 0 ? rawPrice + amount : 0;
    }
    const percent = Math.min(99, Math.max(fallbackOfferValue, fallbackOfferPercent));
    if (percent <= 0) return 0;
    return rawPrice / Math.max(0.01, (1 - (percent / 100)));
  })();
  const basePrice = Math.max(explicitBasePrice, rawPrice, inferredBasePrice);
  const resolvedOffer = resolveOfferDiscount(basePrice, offerDiscountMode, fallbackOfferValue);
  const effectivePrice = offerEnabled ? computeOfferPrice(basePrice, resolvedOffer.percent) : basePrice;
  const parsedOldPrice = Number(rawProduct.oldPrice != null ? rawProduct.oldPrice : basePrice) || basePrice;
  const oldPrice = Math.max(parsedOldPrice, basePrice);

  return {
    ...rawProduct,
    id: normalizeEntityId(rawProduct.id || createUid()),
    basePrice,
    price: effectivePrice,
    oldPrice,
    description: sanitizeParagraph(rawProduct.description || ""),
    category: sanitizeLine(rawProduct.category || "General"),
    productType: sanitizeLine(rawProduct.productType || "General"),
    imagesByColor: safeImagesByColor,
    colors: colorNames,
    sizes: allSizes.length ? allSizes : normalizedSizes,
    variants,
    stockBySize: summarizeStockBySize(variants, allSizes.length ? allSizes : normalizedSizes),
    filterTags,
    featured: Boolean(rawProduct.featured),
    rating: Number(rawProduct.rating) || 5,
    newArrival: Boolean(rawProduct.newArrival),
    isPublic: rawProduct.isPublic !== false,
    offerEnabled,
    offerDiscountMode: resolvedOffer.mode,
    offerDiscountValue: resolvedOffer.value,
    offerExtraDiscount: resolvedOffer.percent,
    offerExtraAmount: resolvedOffer.amount,
  };
}

function normalizeContactSettings(rawSettings = {}) {
  return {
    address: sanitizeParagraph(rawSettings.address != null ? rawSettings.address : defaultContactSettings.address),
    locationNote: sanitizeParagraph(rawSettings.locationNote != null ? rawSettings.locationNote : defaultContactSettings.locationNote),
    whatsappNumber: normalizePhoneNumber(rawSettings.whatsappNumber != null ? rawSettings.whatsappNumber : defaultContactSettings.whatsappNumber),
    whatsappLink: normalizeSafeUrl(rawSettings.whatsappLink != null ? rawSettings.whatsappLink : defaultContactSettings.whatsappLink),
    phone: normalizePhoneNumber(rawSettings.phone != null ? rawSettings.phone : defaultContactSettings.phone),
    email: normalizeContactEmail(rawSettings.email != null ? rawSettings.email : defaultContactSettings.email),
    mapsLink: normalizeSafeUrl(rawSettings.mapsLink != null ? rawSettings.mapsLink : defaultContactSettings.mapsLink),
    instagram: normalizeSafeUrl(rawSettings.instagram != null ? rawSettings.instagram : defaultContactSettings.instagram),
    facebook: normalizeSafeUrl(rawSettings.facebook != null ? rawSettings.facebook : defaultContactSettings.facebook),
    tiktok: normalizeSafeUrl(rawSettings.tiktok != null ? rawSettings.tiktok : defaultContactSettings.tiktok),
  };
}

function resolveContactSettingsWithServerFallback(serverSettings = {}, fallbackSettings = {}) {
  const normalizedServer = normalizeContactSettings(serverSettings);
  const normalizedFallback = normalizeContactSettings(fallbackSettings);
  return {
    ...normalizedServer,
    mapsLink: normalizedServer.mapsLink || normalizedFallback.mapsLink,
  };
}

function normalizeBrandText(value = "", fallback = "Adriego Store") {
  const normalized = sanitizeLine(value || "");
  if (!normalized) return fallback;
  if (/atelier/i.test(normalized)) return "Adriego Store";
  return normalized;
}

function mergeStoreSettings(rawSettings = {}) {
  const incomingSlides = Array.isArray(rawSettings.heroSlides) && rawSettings.heroSlides.length
    ? rawSettings.heroSlides
    : defaultStoreSettings.heroSlides;

  const rawHeroBadge = sanitizeLine(rawSettings.heroBadgeText != null ? rawSettings.heroBadgeText : defaultStoreSettings.heroBadgeText);
  const heroBadgeText = /premium\s+listo\s+para\s+vender/i.test(rawHeroBadge)
    ? defaultStoreSettings.heroBadgeText
    : rawHeroBadge;

  return {
    ...defaultStoreSettings,
    ...rawSettings,
    brandLabel: normalizeBrandText(rawSettings.brandLabel != null ? rawSettings.brandLabel : defaultStoreSettings.brandLabel),
    brandName: normalizeBrandText(rawSettings.brandName != null ? rawSettings.brandName : defaultStoreSettings.brandName),
    heroBadgeText,
    primaryCtaText: sanitizeLine(rawSettings.primaryCtaText != null ? rawSettings.primaryCtaText : defaultStoreSettings.primaryCtaText),
    offerLabel: sanitizeLine(rawSettings.offerLabel != null ? rawSettings.offerLabel : defaultStoreSettings.offerLabel),
    offerPercentage: (() => {
      const rawValue = rawSettings.offerPercentage != null ? rawSettings.offerPercentage : defaultStoreSettings.offerPercentage;
      const parsed = Number.parseInt(String(rawValue).replace(/[^\d-]/g, ""), 10);
      if (!Number.isFinite(parsed)) return defaultStoreSettings.offerPercentage;
      return Math.max(0, Math.abs(parsed));
    })(),
    offerText: sanitizeLine(rawSettings.offerText != null ? rawSettings.offerText : defaultStoreSettings.offerText),
    saleTitle: sanitizeLine(rawSettings.saleTitle != null ? rawSettings.saleTitle : defaultStoreSettings.saleTitle),
    saleDescription: sanitizeParagraph(rawSettings.saleDescription != null ? rawSettings.saleDescription : defaultStoreSettings.saleDescription),
    footerTitle: sanitizeLine(rawSettings.footerTitle != null ? rawSettings.footerTitle : defaultStoreSettings.footerTitle),
    footerText: sanitizeParagraph(rawSettings.footerText != null ? rawSettings.footerText : defaultStoreSettings.footerText),
    automationSettings: normalizeAutomationSettings(
      rawSettings.automationSettings != null
        ? rawSettings.automationSettings
        : defaultStoreSettings.automationSettings,
    ),
    heroSlides: incomingSlides.map((slide, index) => ({
      id: slide.id || defaultStoreSettings.heroSlides[index]?.id || createUid(),
      title: sanitizeLine(slide.title != null ? slide.title : ((defaultStoreSettings.heroSlides[index] && defaultStoreSettings.heroSlides[index].title) || "")),
      subtitle: sanitizeParagraph(slide.subtitle != null ? slide.subtitle : ((defaultStoreSettings.heroSlides[index] && defaultStoreSettings.heroSlides[index].subtitle) || "")),
      image: normalizeSafeUrl(slide.image || defaultStoreSettings.heroSlides[index]?.image || FALLBACK_IMAGE) || FALLBACK_IMAGE,
      linkedProductId: (slide.linkedProductId != null ? String(slide.linkedProductId) : ""),
      targetUrl: normalizeSafeUrl(slide.targetUrl != null ? slide.targetUrl : ""),
    })),
  };
}

function getStoredProducts() {
  return initialProducts.map(normalizeProduct);
}

function getImagesForColor(product, color) {
  const requestedColor = color && product.imagesByColor[color]?.length ? color : null;
  const fallbackColor = requestedColor || product.colors.find((item) => product.imagesByColor[item]?.length) || Object.keys(product.imagesByColor)[0];
  return product.imagesByColor[fallbackColor] || [FALLBACK_IMAGE];
}

function getCurrentImageForProduct(product, selectedColor) {
  return getImagesForColor(product, selectedColor)[0] || FALLBACK_IMAGE;
}

function parseStockBySize(rawStockBySize, sizes = []) {
  const fallbackSizes = Array.isArray(sizes) && sizes.length ? sizes : ["Única"];

  if (rawStockBySize && typeof rawStockBySize === "object" && !Array.isArray(rawStockBySize)) {
    return Object.fromEntries(
      fallbackSizes.map((size) => [size, Math.max(0, Number(rawStockBySize[size] ?? 5) || 0)]),
    );
  }

  if (typeof rawStockBySize === "string") {
    const parsedEntries = rawStockBySize
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const [size, amount] = entry.split(":").map((item) => item.trim());
        return size ? [size, Math.max(0, Number(amount) || 0)] : null;
      })
      .filter(Boolean);

    if (parsedEntries.length) {
      const lookup = Object.fromEntries(parsedEntries);
      return Object.fromEntries(
        fallbackSizes.map((size) => [size, Math.max(0, Number(lookup[size] ?? 0) || 0)]),
      );
    }
  }

  return Object.fromEntries(fallbackSizes.map((size) => [size, 5]));
}

function buildVariantList(rawVariants = [], colors = [], sizes = [], stockBySize = {}) {
  if (Array.isArray(rawVariants) && rawVariants.length) {
    return rawVariants
      .map((variant) => ({
        uid: variant.uid || createUid(),
        color: normalizeOptionLabel(variant.color || "General"),
        size: normalizeOptionLabel(variant.size || "Única"),
        stock: Math.max(0, Number(variant.stock) || 0),
      }))
      .filter((variant) => variant.color && variant.size);
  }

  const safeColors = colors.length ? colors : ["General"];
  const safeSizes = sizes.length ? sizes : ["Única"];
  return safeColors.flatMap((color) => safeSizes.map((size) => ({
    uid: createUid(),
    color,
    size,
    stock: Math.max(0, Number(stockBySize[size] ?? 0) || 0),
  })));
}

function summarizeStockBySize(variants = [], sizes = []) {
  const safeSizes = sizes.length ? sizes : [...new Set(variants.map((variant) => variant.size))];
  return Object.fromEntries(
    safeSizes.map((size) => [
      size,
      variants.filter((variant) => variant.size === size).reduce((total, variant) => total + Math.max(0, Number(variant.stock) || 0), 0),
    ]),
  );
}

function getSizesForColor(product, color) {
  return [...new Set((product?.variants || []).filter((variant) => variant.color === color).map((variant) => variant.size))];
}

function getStockForVariant(product, color, size) {
  const match = (product?.variants || []).find((variant) => variant.color === color && variant.size === size);
  return Math.max(0, Number(match?.stock ?? 0) || 0);
}

function hasProductAvailableStock(product) {
  return (product?.variants || []).some((variant) => Math.max(0, Number(variant?.stock ?? 0) || 0) > 0);
}

function getFallbackSelection(product, preferredSelection = null) {
  const safeColor = product?.colors?.[0] || "General";
  const safeSize = product?.sizes?.[0] || "Unica";
  if (!product) {
    return { color: safeColor, size: safeSize, availableStock: 0 };
  }

  const desiredColor = preferredSelection?.color;
  const desiredSize = preferredSelection?.size;
  if (desiredColor && desiredSize) {
    const desiredStock = getStockForVariant(product, desiredColor, desiredSize);
    if (desiredStock > 0) {
      return { color: desiredColor, size: desiredSize, availableStock: desiredStock };
    }
  }

  if (desiredColor) {
    const firstForColor = (product.variants || []).find((variant) => variant.color === desiredColor && (Number(variant.stock) || 0) > 0);
    if (firstForColor) {
      return {
        color: firstForColor.color,
        size: firstForColor.size,
        availableStock: Math.max(0, Number(firstForColor.stock) || 0),
      };
    }
  }

  const defaultColor = product.colors?.[0];
  if (defaultColor) {
    const firstForDefaultColor = (product.variants || []).find((variant) => variant.color === defaultColor && (Number(variant.stock) || 0) > 0);
    if (firstForDefaultColor) {
      return {
        color: firstForDefaultColor.color,
        size: firstForDefaultColor.size,
        availableStock: Math.max(0, Number(firstForDefaultColor.stock) || 0),
      };
    }
  }

  const firstAvailable = (product.variants || []).find((variant) => (Number(variant.stock) || 0) > 0);
  if (firstAvailable) {
    return {
      color: firstAvailable.color,
      size: firstAvailable.size,
      availableStock: Math.max(0, Number(firstAvailable.stock) || 0),
    };
  }

  return { color: safeColor, size: safeSize, availableStock: 0 };
}

function getSelectionForColor(product, preferredSelection = null) {
  const safeColor = product?.colors?.[0] || "General";
  const safeSize = product?.sizes?.[0] || "Unica";
  if (!product) {
    return { color: safeColor, size: safeSize, availableStock: 0 };
  }

  const availableColors = Array.isArray(product.colors) && product.colors.length
    ? product.colors
    : [...new Set((product.variants || []).map((variant) => variant.color).filter(Boolean))];
  const desiredColor = preferredSelection?.color && availableColors.includes(preferredSelection.color)
    ? preferredSelection.color
    : (availableColors[0] || safeColor);

  const sizesForColor = getSizesForColor(product, desiredColor);
  const desiredSize = preferredSelection?.size;
  const desiredSizeStock = desiredSize ? getStockForVariant(product, desiredColor, desiredSize) : 0;
  if (desiredSize && sizesForColor.includes(desiredSize) && desiredSizeStock > 0) {
    return {
      color: desiredColor,
      size: desiredSize,
      availableStock: desiredSizeStock,
    };
  }

  const firstAvailableSize = sizesForColor.find((size) => getStockForVariant(product, desiredColor, size) > 0);
  const fallbackSize = firstAvailableSize
    || (desiredSize && sizesForColor.includes(desiredSize) ? desiredSize : "")
    || sizesForColor[0]
    || safeSize;

  return {
    color: desiredColor,
    size: fallbackSize,
    availableStock: getStockForVariant(product, desiredColor, fallbackSize),
  };
}


function groupVariantsByColor(variants = [], imagesByColor = {}) {
  const colors = [...new Set([
    ...Object.keys(imagesByColor || {}),
    ...variants.map((variant) => variant.color),
  ].filter(Boolean))];

  return colors.map((color) => ({
    uid: createUid(),
    name: color,
    images: imagesByColor[color]?.length ? [...imagesByColor[color]] : [""],
    sizes: (() => {
      const entries = variants.filter((variant) => variant.color === color);
      if (!entries.length) {
        return [{ uid: createUid(), size: "Única", stock: "0" }];
      }
      return entries.map((variant) => ({
        uid: createUid(),
        size: variant.size,
        stock: String(variant.stock),
      }));
    })(),
  }));
}

function getStockStatus(stock) {
  if (stock <= 0) return { label: "Agotado", tone: "danger" };
  if (stock === 1) return { label: "Solo queda 1", tone: "dark" };
  if (stock <= 3) return { label: `Quedan ${stock}`, tone: "warning" };
  return { label: "Disponible", tone: "success" };
}

function createSeededRandom(seedText = "") {
  let seed = 0;
  const value = String(seedText || "seed");
  for (let index = 0; index < value.length; index += 1) {
    seed = ((seed << 5) - seed + value.charCodeAt(index)) | 0;
  }
  return () => {
    seed = (seed * 1664525 + 1013904223) | 0;
    return ((seed >>> 0) % 100000) / 100000;
  };
}

function buildConfettiPieces(seed, count = 18) {
  const rand = createSeededRandom(seed);
  const palette = ["#111111", "#f59e0b", "#10b981", "#3b82f6", "#ef4444", "#ec4899"];
  return Array.from({ length: count }, (_, index) => {
    const angle = (Math.PI * 2 * (index / count)) + (rand() - 0.5) * 0.6;
    const distance = 78 + rand() * 138;
    return {
      key: `${seed}-${index}`,
      x: Math.cos(angle) * distance,
      y: Math.sin(angle) * distance - (12 + rand() * 26),
      rotate: (rand() - 0.5) * 660,
      duration: 0.62 + rand() * 0.35,
      delay: rand() * 0.08,
      width: 5 + Math.floor(rand() * 5),
      height: 6 + Math.floor(rand() * 8),
      color: palette[Math.floor(rand() * palette.length)],
    };
  });
}

function AnimatedCurrencyValue({ value, className = "", duration = 360 }) {
  const target = Number(value) || 0;
  const [animatedValue, setAnimatedValue] = useState(target);
  const previousValueRef = useRef(target);

  useEffect(() => {
    const from = previousValueRef.current;
    if (Math.abs(from - target) < 0.01) {
      previousValueRef.current = target;
      return undefined;
    }

    let frameId = 0;
    const startTime = performance.now();
    const step = (now) => {
      const progress = Math.min(1, (now - startTime) / duration);
      const eased = 1 - ((1 - progress) ** 3);
      const nextValue = from + ((target - from) * eased);
      setAnimatedValue(nextValue);
      if (progress < 1) {
        frameId = window.requestAnimationFrame(step);
      } else {
        previousValueRef.current = target;
      }
    };

    frameId = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(frameId);
  }, [duration, target]);

  return <span className={className}>{currency(animatedValue)}</span>;
}

function EmotionalEmptyState({
  icon,
  title,
  description,
  actionLabel = "",
  onAction,
}) {
  return (
    <div className="empty-emotional-state">
      <div className="empty-emotional-icon">
        {icon ? React.createElement(icon, { size: 22 }) : null}
      </div>
      <h4>{title}</h4>
      <p>{description}</p>
      {actionLabel && onAction && (
        <button type="button" className="btn btn-primary empty-emotional-cta" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}

function ConfettiBurst({ id, tone = "default" }) {
  const pieces = useMemo(() => buildConfettiPieces(`${tone}-${id}`), [id, tone]);
  return (
    <div className={`confetti-burst confetti-${tone}`} aria-hidden="true">
      {pieces.map((piece) => (
        <Motion.span
          key={piece.key}
          className="confetti-piece"
          style={{ width: piece.width, height: piece.height, background: piece.color }}
          initial={{ x: 0, y: 0, rotate: 0, opacity: 0.98, scale: 0.9 }}
          animate={{ x: piece.x, y: piece.y, rotate: piece.rotate, opacity: 0, scale: 1 }}
          transition={{ duration: piece.duration, ease: "easeOut", delay: piece.delay }}
        />
      ))}
    </div>
  );
}


function normalizeOrderStatus(value = "Pendiente") {
  const normalized = normalizeOptionLabel(value).toLowerCase();
  const legacyMap = {
    "pendiente de pago": "Pendiente",
    pagado: "Confirmado",
    pendiente: "Pendiente",
    confirmado: "Confirmado",
    preparando: "Preparando",
    enviado: "Enviado",
    "listo para retiro": "Listo para retiro",
    "listo para recoger": "Listo para retiro",
    "listo para entrega": "Listo para retiro",
    "listo en local": "Listo para retiro",
    "retiro listo": "Listo para retiro",
    recibido: "Entregado",
    finalizado: "Entregado",
    entregado: "Entregado",
    cancelado: "Cancelado",
  };
  return legacyMap[normalized] || "Pendiente";
}

function getOrderStatusOptions(deliveryType = "delivery") {
  if (deliveryType === "pickup") {
    return ["Pendiente", "Confirmado", "Preparando", "Listo para retiro", "Entregado", "Cancelado"];
  }
  return ["Pendiente", "Confirmado", "Preparando", "Enviado", "Entregado", "Cancelado"];
}

function normalizeOrderStatusForOrder(status, deliveryType = "delivery") {
  const normalizedStatus = normalizeOrderStatus(status);
  if (deliveryType === "pickup" && normalizedStatus === "Enviado") return "Listo para retiro";
  if (deliveryType !== "pickup" && normalizedStatus === "Listo para retiro") return "Preparando";
  return normalizedStatus;
}

const ORDER_STATUS_META = {
  Pendiente: { tone: "pending", icon: Clock3, description: "Recibimos tu solicitud y esta pendiente de revision." },
  Confirmado: { tone: "confirmed", icon: BadgeCheck, description: "El pedido fue validado y esta confirmado." },
  Preparando: { tone: "preparing", icon: Package, description: "Estamos organizando y preparando tus prendas." },
  Enviado: { tone: "shipped", icon: Truck, description: "Tu pedido salio y va en camino." },
  "Listo para retiro": { tone: "pickup-ready", icon: Store, description: "Tu pedido esta listo para retiro en local." },
  Entregado: { tone: "delivered", icon: CheckCircle2, description: "El pedido fue entregado correctamente." },
  Cancelado: { tone: "cancelled", icon: CircleX, description: "El pedido fue cancelado y ya no continua en proceso." },
};

function getOrderStatusMeta(status) {
  return ORDER_STATUS_META[normalizeOrderStatus(status)] || ORDER_STATUS_META.Pendiente;
}

function normalizeOrderRecord(order = {}) {
  const subtotal = Number(order.subtotal) || 0;
  const discountAmount = Math.max(0, Number(order.discountAmount) || 0);
  const deliveryType = order.deliveryType === "delivery" ? "delivery" : "pickup";
  return {
    ...order,
    id: order.id || createUid(),
    code: order.code || `ORDER-${Math.floor(10000 + Math.random() * 90000)}`,
    createdAt: order.createdAt || new Date().toISOString(),
    subtotal,
    discountAmount,
    total: Math.max(0, Number(order.total) || subtotal - discountAmount),
    couponCode: normalizeCode(order.couponCode || ""),
    couponDiscountType: order.couponDiscountType === "fixed" ? "fixed" : (order.couponDiscountType === "percentage" ? "percentage" : ""),
    couponDiscountValue: Math.max(0, Number(order.couponDiscountValue) || 0),
    couponEligibleSubtotal: Math.max(0, Number(order.couponEligibleSubtotal) || 0),
    couponExcludedSubtotal: Math.max(0, Number(order.couponExcludedSubtotal) || 0),
    itemCount: Number(order.itemCount) || (Array.isArray(order.items) ? order.items.reduce((total, item) => total + (Number(item.quantity) || 0), 0) : 0),
    status: normalizeOrderStatusForOrder(order.status, deliveryType),
    guideNumber: order.guideNumber || "",
    paymentProof: order.paymentProof || "",
    customerId: order.customerId || "",
    customerName: order.customerName || "Cliente",
    customerEmail: order.customerEmail || "",
    customerPhone: order.customerPhone || "",
    deliveryType,
    deliveryLabel: order.deliveryLabel || (deliveryType === "delivery" ? "Envio a domicilio" : "Retiro en local"),
    deliveryFullName: sanitizeLine(order.deliveryFullName || ""),
    deliveryIdNumber: sanitizeLine(order.deliveryIdNumber || ""),
    deliveryCity: sanitizeLine(order.deliveryCity || ""),
    deliveryAddress: sanitizeParagraph(order.deliveryAddress || ""),
    deliveryReference: sanitizeParagraph(order.deliveryReference || ""),
    deliveryPhone: normalizeUserPhoneNumber(order.deliveryPhone || ""),
    pickupAddress: sanitizeLine(order.pickupAddress || ""),
    pickupNote: sanitizeParagraph(order.pickupNote || ""),
    stockReservation: {
      state: order?.stockReservation?.state === "released"
        ? "released"
        : "reserved",
      reservedAt: sanitizeLine(order?.stockReservation?.reservedAt || ""),
      releasedAt: sanitizeLine(order?.stockReservation?.releasedAt || ""),
      lastSyncAt: sanitizeLine(order?.stockReservation?.lastSyncAt || ""),
      lastAction: sanitizeLine(order?.stockReservation?.lastAction || ""),
      version: Math.max(0, Number(order?.stockReservation?.version) || 0),
    },
    items: Array.isArray(order.items) ? order.items.map((item) => ({ ...item })) : [],
  };
}

function OrderStatusProgress({ status, deliveryType = "delivery" }) {
  const normalizedStatus = normalizeOrderStatusForOrder(status, deliveryType);
  const currentMeta = getOrderStatusMeta(normalizedStatus);
  const steps = getOrderStatusOptions(deliveryType).filter((item) => item !== "Cancelado");
  const currentIndex = steps.indexOf(normalizedStatus);
  const progress = normalizedStatus === "Cancelado" ? 0 : ((currentIndex + 1) / steps.length) * 100;
  const Icon = currentMeta.icon;

  if (normalizedStatus === "Cancelado") {
    return (
      <div className="order-progress">
        <span className={`order-status-pill ${currentMeta.tone}`}><Icon size={16} /> {normalizedStatus}</span>
        <div className="order-progress-cancelled">
          <strong>Pedido cancelado</strong>
          <p style={{ margin: 0 }}>{currentMeta.description}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="order-progress">
      <span className={`order-status-pill ${currentMeta.tone}`}><Icon size={16} /> {normalizedStatus}</span>
      <div className="order-progress-bar" aria-hidden="true">
        <div className="order-progress-bar-fill" style={{ width: `${progress}%` }} />
      </div>
      <div className="order-progress-steps">
        {steps.map((step, index) => {
          const StepIcon = getOrderStatusMeta(step).icon;
          const stepState = index < currentIndex ? "done" : index === currentIndex ? "active" : "upcoming";
          return (
            <div key={step} className={`order-progress-step ${stepState}`}>
              <div className="order-progress-bullet"><StepIcon size={18} /></div>
              <p className="order-progress-label">{step}</p>
              <p className="order-progress-caption">{getOrderStatusMeta(step).description}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatOrderDate(value) {
  if (!value) return "Sin fecha";
  try {
    return new Intl.DateTimeFormat("es-EC", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  } catch {
    return value;
  }
}

function OrderReferenceStrip({ order, onOpen, actionLabel = "Ver referencia" }) {
  const previewItems = Array.isArray(order?.items) ? order.items.slice(0, 3) : [];
  const remainingItems = Math.max(0, (order?.items?.length || 0) - previewItems.length);
  const leadingItem = previewItems[0];

  return (
    <button type="button" className="order-reference-strip" onClick={() => onOpen?.(order)}>
      <div className="order-reference-thumbs" aria-hidden="true">
        {previewItems.map((item, index) => (
          <img
            key={`${item.key || item.name}-${index}`}
            src={item.image || FALLBACK_IMAGE}
            alt=""
            className="order-reference-thumb"
            style={{ transform: `translateX(${index * -10}px)`, zIndex: previewItems.length - index }}
          />
        ))}
        {remainingItems > 0 && <span className="order-reference-more">+{remainingItems}</span>}
      </div>
      <div className="order-reference-copy">
        <p className="order-reference-title">Referencia visual del pedido</p>
        <p className="order-reference-subtitle">
          {leadingItem ? `${leadingItem.name}${order.items.length > 1 ? ` y ${order.items.length - 1} prenda(s) mas` : ""}` : "Ver prendas del pedido"}
        </p>
      </div>
      <span className="order-reference-action">{actionLabel}</span>
    </button>
  );
}

function OrderReferenceModal({ open, order, onClose }) {
  if (!open || !order) return null;

  return (
    <AnimatePresence>
      <Motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="modal-backdrop modal-backdrop-priority order-reference-backdrop" onClick={onClose}>
        <Motion.div
          initial={{ opacity: 0, y: 24, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 18, scale: 0.97 }}
          transition={{ duration: 0.22 }}
          className="sheet order-reference-modal"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="sheet-header">
            <div>
              <p className="muted" style={{ margin: 0, textTransform: "uppercase", letterSpacing: ".25em", fontSize: 13 }}>Referencia visual</p>
              <h3 style={{ margin: "8px 0 0", fontSize: 30 }}>{order.code}</h3>
            </div>
            <button onClick={onClose} className="icon-btn"><X size={18} /></button>
          </div>
          <div className="sheet-body order-reference-body">
            <div className="order-reference-summary-row">
              <span className="badge badge-light">{order.itemCount} item(s)</span>
              <span className="badge badge-light">Subtotal: {currency(order.subtotal)}</span>
              <span className="badge badge-light">Descuento: -{currency(order.discountAmount || 0)}</span>
              <span className="badge badge-light">Total: {currency(order.total || order.subtotal)}</span>
              {order.couponCode && <span className="badge badge-light">Cupon: {order.couponCode}</span>}
              <span className={`order-status-pill ${getOrderStatusMeta(normalizeOrderStatusForOrder(order.status, order.deliveryType)).tone}`}>{normalizeOrderStatusForOrder(order.status, order.deliveryType)}</span>
            </div>
            <div className="order-reference-grid">
              {order.items.map((item) => (
                <div key={item.key} className="order-reference-card">
                  <img src={item.image || FALLBACK_IMAGE} alt={item.name} className="order-reference-card-image" loading="lazy" decoding="async" />
                  <div className="order-reference-card-copy">
                    <strong>{item.name}</strong>
                    <p className="muted" style={{ margin: "6px 0 0" }}>{item.color} - {item.size}</p>
                    <p className="muted" style={{ margin: "6px 0 0" }}>Cantidad: {item.quantity}</p>
                    <p style={{ margin: "10px 0 0", fontWeight: 700 }}>{currency(item.price * item.quantity)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Motion.div>
      </Motion.div>
    </AnimatePresence>
  );
}

function syncSelections(products, previousSelections) {
  return Object.fromEntries(
    products.map((product) => {
      const previous = previousSelections[product.id] || {};
      const fallback = getFallbackSelection(product, previous);
      return [product.id, { color: fallback.color, size: fallback.size }];
    }),
  );
}

function createProductForm(product) {
  const normalizedOfferMode = normalizeOfferDiscountMode(product.offerDiscountMode);
  const fallbackOfferValue = product.offerDiscountValue != null
    ? product.offerDiscountValue
    : (normalizedOfferMode === "amount"
      ? (product.offerExtraAmount != null ? product.offerExtraAmount : 0)
      : (product.offerExtraDiscount != null ? product.offerExtraDiscount : 0));
  return {
    id: product.id,
    name: product.name,
    price: String(product.basePrice != null ? product.basePrice : product.price),
    oldPrice: String(product.oldPrice),
    category: product.category,
    productType: product.productType || "General",
    description: product.description,
    filterTagsText: (product.filterTags || []).join(", "),
    featured: Boolean(product.featured),
    rating: String(product.rating),
    newArrival: Boolean(product.newArrival),
    isPublic: product.isPublic !== false,
    offerEnabled: Boolean(product.offerEnabled),
    offerDiscountMode: normalizedOfferMode,
    offerDiscountValue: String(fallbackOfferValue || 0),
    offerExtraDiscount: String(product.offerExtraDiscount || 0),
    colorsData: groupVariantsByColor(product.variants || [], product.imagesByColor),
  };
}

function buildProductFromForm(form) {
  const parsedColors = form.colorsData
    .map((color) => ({
      name: sanitizeLine(color.name),
      images: color.images.map((image) => normalizeImageSource(image)).filter(Boolean),
      sizes: (color.sizes || []).map((sizeRow) => ({
        size: sanitizeLine(sizeRow.size),
        stock: Math.max(0, Number(sizeRow.stock) || 0),
      })).filter((sizeRow) => sizeRow.size),
    }))
    .filter((color) => color.name);

  const safeName = sanitizeLine(form.name);
  if (!safeName || safeName.length < 2) {
    return { error: "Debes ingresar el nombre del producto." };
  }

  const safePrice = Number(form.price);
  if (!Number.isFinite(safePrice) || safePrice <= 0) {
    return { error: "Debes ingresar un precio valido." };
  }

  if (!parsedColors.length) {
    return { error: "Agrega al menos un color para el producto." };
  }

  if (parsedColors.length > PRODUCT_FORM_LIMITS.maxColors) {
    return { error: `Solo puedes registrar hasta ${PRODUCT_FORM_LIMITS.maxColors} colores por producto.` };
  }

  if (parsedColors.some((color) => color.images.length === 0)) {
    return { error: "Cada color necesita al menos una foto en su galera." };
  }

  if (parsedColors.some((color) => color.images.length > PRODUCT_FORM_LIMITS.maxImagesPerColor)) {
    return { error: `Cada color admite maximo ${PRODUCT_FORM_LIMITS.maxImagesPerColor} imagenes.` };
  }

  if (parsedColors.some((color) => color.sizes.length === 0)) {
    return { error: "Cada color debe tener al menos una talla." };
  }

  if (parsedColors.some((color) => color.sizes.length > PRODUCT_FORM_LIMITS.maxSizesPerColor)) {
    return { error: `Cada color admite maximo ${PRODUCT_FORM_LIMITS.maxSizesPerColor} tallas.` };
  }

  const colorNamesLower = parsedColors.map((color) => color.name.toLowerCase());
  if (new Set(colorNamesLower).size !== colorNamesLower.length) {
    return { error: "No repitas colores en el mismo producto." };
  }

  const duplicatedVariant = parsedColors.some((color) => {
    const lowered = color.sizes.map((entry) => entry.size.toLowerCase());
    return new Set(lowered).size !== lowered.length;
  });
  if (duplicatedVariant) {
    return { error: "No repitas la misma talla dentro del mismo color." };
  }

  const variants = parsedColors.flatMap((color) => color.sizes.map((entry) => ({
    uid: createUid(),
    color: color.name,
    size: entry.size,
    stock: entry.stock,
  })));

  const sizes = [...new Set(variants.map((variant) => variant.size))];
  const imagesByColor = Object.fromEntries(parsedColors.map((color) => [color.name, color.images]));
  const filterTags = form.filterTagsText
    .split(",")
    .map((item) => sanitizeLine(item))
    .filter(Boolean);

  if (filterTags.length > PRODUCT_FORM_LIMITS.maxFilterTags) {
    return { error: `Solo puedes guardar hasta ${PRODUCT_FORM_LIMITS.maxFilterTags} filtros por producto.` };
  }

  const parsedRating = Math.max(0, Math.min(5, Number(form.rating) || 5));
  const normalizedOfferDiscountMode = normalizeOfferDiscountMode(form.offerDiscountMode);
  const resolvedOffer = resolveOfferDiscount(Number(form.price), normalizedOfferDiscountMode, form.offerDiscountValue);

  return {
    value: {
      id: normalizeEntityId(form.id || createUid()),
      name: safeName,
      basePrice: safePrice,
      price: safePrice,
      oldPrice: Math.max(Number(form.oldPrice || safePrice), safePrice),
      category: sanitizeLine(form.category) || "General",
      productType: sanitizeLine(form.productType) || "General",
      description: sanitizeParagraph(form.description),
      imagesByColor,
      colors: parsedColors.map((color) => color.name),
      sizes,
      variants,
      stockBySize: summarizeStockBySize(variants, sizes),
      filterTags,
      featured: Boolean(form.featured),
      rating: parsedRating,
      newArrival: Boolean(form.newArrival),
      isPublic: Boolean(form.isPublic),
      offerEnabled: Boolean(form.offerEnabled),
      offerDiscountMode: resolvedOffer.mode,
      offerDiscountValue: resolvedOffer.value,
      offerExtraDiscount: resolvedOffer.percent,
      offerExtraAmount: resolvedOffer.amount,
    },
  };
}

function ProductModal({
  product,
  selection,
  onClose,
  onChange,
  onAddToCart,
  cartEditMode = false,
  isAdmin,
  onEditProduct,
}) {
  const resolvedSelection = product ? getSelectionForColor(product, selection) : null;
  const [imageIndex, setImageIndex] = useState(0);
  const [imagePreviewOpen, setImagePreviewOpen] = useState(false);
  const [previewZoomed, setPreviewZoomed] = useState(false);
  const [previewZoomOrigin, setPreviewZoomOrigin] = useState("50% 50%");
  const previewSwipeStartRef = useRef(null);
  const previewSwipeIntentRef = useRef(null);
  const previewDidSwipeRef = useRef(false);
  const previewHandledByPointerRef = useRef(false);
  const currentImages = product ? getImagesForColor(product, resolvedSelection?.color) : [];
  const safeImageIndex = currentImages.length ? Math.min(imageIndex, currentImages.length - 1) : 0;
  const activeImage = currentImages[safeImageIndex] || currentImages[0] || FALLBACK_IMAGE;
  const discount = product ? discountPercent(product.price, product.oldPrice) : 0;
  const sizesForSelectedColor = product ? getSizesForColor(product, resolvedSelection?.color) : [];
  const selectedStock = product ? getStockForVariant(product, resolvedSelection?.color, resolvedSelection?.size) : 0;
  const stockStatus = getStockStatus(selectedStock);
  const isLowStock = selectedStock > 0 && selectedStock <= 2;
  const hasMultipleImages = currentImages.length > 1;
  const isTouchLikePointer = (pointerType) => pointerType === "touch" || pointerType === "pen";
  const openImagePreview = () => {
    setImagePreviewOpen(true);
    setPreviewZoomed(false);
    setPreviewZoomOrigin("50% 50%");
    previewSwipeStartRef.current = null;
    previewSwipeIntentRef.current = null;
    previewDidSwipeRef.current = false;
    previewHandledByPointerRef.current = false;
  };

  const closeImagePreview = () => {
    setImagePreviewOpen(false);
    setPreviewZoomed(false);
    setPreviewZoomOrigin("50% 50%");
    previewSwipeStartRef.current = null;
    previewSwipeIntentRef.current = null;
    previewDidSwipeRef.current = false;
    previewHandledByPointerRef.current = false;
  };

  const updatePreviewZoomOrigin = (event) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const x = ((event.clientX - bounds.left) / bounds.width) * 100;
    const y = ((event.clientY - bounds.top) / bounds.height) * 100;
    setPreviewZoomOrigin(`${x}% ${y}%`);
  };

  const togglePreviewZoom = (event) => {
    if (event) {
      updatePreviewZoomOrigin(event);
    }
    setPreviewZoomed((previous) => !previous);
  };

  const handleDetailImageClick = () => {
    openImagePreview();
  };

  const handlePreviewPointerDown = (event) => {
    if (!isTouchLikePointer(event.pointerType)) return;
    previewSwipeStartRef.current = { x: event.clientX, y: event.clientY };
    previewSwipeIntentRef.current = null;
    previewDidSwipeRef.current = false;
  };

  const handlePreviewPointerMove = (event) => {
    if (!isTouchLikePointer(event.pointerType) || !previewSwipeStartRef.current) return;
    const deltaX = event.clientX - previewSwipeStartRef.current.x;
    const deltaY = event.clientY - previewSwipeStartRef.current.y;
    if (!previewSwipeIntentRef.current && (Math.abs(deltaX) > 8 || Math.abs(deltaY) > 8)) {
      if (Math.abs(deltaX) > Math.abs(deltaY) * 1.15) {
        previewSwipeIntentRef.current = "horizontal";
      } else if (Math.abs(deltaY) > Math.abs(deltaX) * 1.15) {
        previewSwipeIntentRef.current = "vertical";
      }
    }
    if (previewSwipeIntentRef.current === "horizontal" && event.cancelable) {
      event.preventDefault();
    }
  };

  const handlePreviewPointerUp = (event) => {
    if (!isTouchLikePointer(event.pointerType) || !previewSwipeStartRef.current) return;
    const distanceX = event.clientX - previewSwipeStartRef.current.x;
    const distanceY = event.clientY - previewSwipeStartRef.current.y;
    const horizontalSwipe = hasMultipleImages
      && (previewSwipeIntentRef.current === "horizontal"
      || (Math.abs(distanceX) > 40 && Math.abs(distanceX) > Math.abs(distanceY) * 1.2));
    previewSwipeStartRef.current = null;
    previewSwipeIntentRef.current = null;

    if (horizontalSwipe) {
      previewDidSwipeRef.current = true;
      previewHandledByPointerRef.current = true;
      if (distanceX > 0) {
        goToPreviousImage();
      } else {
        goToNextImage();
      }
      return;
    }

    previewHandledByPointerRef.current = true;
    togglePreviewZoom(event);
  };

  const handlePreviewImageClick = (event) => {
    if (previewHandledByPointerRef.current) {
      previewHandledByPointerRef.current = false;
      return;
    }
    if (previewDidSwipeRef.current) {
      previewDidSwipeRef.current = false;
      return;
    }
    togglePreviewZoom(event);
  };

  const goToPreviousImage = () => {
    if (!hasMultipleImages) return;
    setImageIndex((previous) => (previous - 1 + currentImages.length) % currentImages.length);
  };

  const goToNextImage = () => {
    if (!hasMultipleImages) return;
    setImageIndex((previous) => (previous + 1) % currentImages.length);
  };

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setImageIndex(0);
      setImagePreviewOpen(false);
      setPreviewZoomed(false);
      setPreviewZoomOrigin("50% 50%");
      previewSwipeStartRef.current = null;
      previewSwipeIntentRef.current = null;
      previewDidSwipeRef.current = false;
      previewHandledByPointerRef.current = false;
    });

    return () => window.cancelAnimationFrame(frame);
  }, [resolvedSelection?.color, product?.id]);

  useEffect(() => {
    if (!product || typeof window === "undefined") return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "Escape" && imagePreviewOpen) {
        event.preventDefault();
        closeImagePreview();
      } else if (event.key === "ArrowLeft" && hasMultipleImages) {
        event.preventDefault();
        setImageIndex((previous) => (previous - 1 + currentImages.length) % currentImages.length);
      } else if (event.key === "ArrowRight" && hasMultipleImages) {
        event.preventDefault();
        setImageIndex((previous) => (previous + 1) % currentImages.length);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [product, hasMultipleImages, currentImages.length, imagePreviewOpen]);

  if (!product) return null;

  return (
    <AnimatePresence>
      <Motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="modal-backdrop" onClick={onClose}>
        <Motion.div
          initial={{ opacity: 0, y: 30, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.97 }}
          transition={{ duration: 0.25 }}
          className="modal"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="modal-left">
            <button onClick={onClose} className="icon-btn" style={{ position: "absolute", right: 16, top: 16, zIndex: 2 }}>
              <X size={18} />
            </button>
            <AnimatePresence mode="wait">
              <button
                type="button"
                className="modal-image-open-btn"
                onClick={handleDetailImageClick}
                aria-label={`Abrir imagen ampliada de ${product.name}`}
              >
                <Motion.img
                  key={`${product.id}-${resolvedSelection?.color}-${safeImageIndex}-${activeImage}`}
                  src={activeImage}
                  alt={product.name}
                  loading="eager"
                  decoding="async"
                  initial={{ opacity: 0, scale: 1.02 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.99 }}
                  transition={{ duration: 0.18 }}
                  className="modal-img"
                  draggable={false}
                  style={{
                    cursor: "zoom-in",
                    touchAction: "manipulation",
                  }}
                  onError={(event) => {
                    if (event.currentTarget.src !== FALLBACK_IMAGE) {
                      event.currentTarget.src = FALLBACK_IMAGE;
                    }
                  }}
                />
              </button>
            </AnimatePresence>
            <div style={{ position: "absolute", left: 16, top: 16, zIndex: 2 }}>
              <button type="button" className="badge badge-light modal-zoom-toggle" onClick={openImagePreview} aria-label="Abrir imagen del producto">
                Toca para ampliar
              </button>
            </div>
            {hasMultipleImages && (
              <>
                <button
                  className="icon-btn carousel-arrow left"
                  type="button"
                  onClick={goToPreviousImage}
                  aria-label="Imagen anterior"
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  className="icon-btn carousel-arrow right"
                  type="button"
                  onClick={goToNextImage}
                  aria-label="Imagen siguiente"
                >
                  <ChevronRight size={18} />
                </button>
                <div className="thumb-counter">
                  {safeImageIndex + 1} / {currentImages.length}
                </div>
                <div className="thumb-row">
                  {currentImages.map((_, index) => (
                    <button
                      key={index}
                      type="button"
                      className={`dot ${safeImageIndex === index ? "active" : ""}`}
                      onClick={() => setImageIndex(index)}
                      aria-label={`Ver imagen ${index + 1}`}
                    />
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="modal-right">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start" }}>
              <div>
                <p className="muted" style={{ fontSize: 13, letterSpacing: ".24em", textTransform: "uppercase" }}>{product.category}</p>
                <h3 style={{ margin: "8px 0 0", fontSize: 34 }}>{product.name}</h3>
                <p className="muted" style={{ margin: "8px 0 0", fontSize: 14 }}>Tipo: {product.productType || "General"}</p>
              </div>
              <div style={{ textAlign: "right" }}>
                <p style={{ margin: 0, fontSize: 28, fontWeight: 600 }}>{currency(product.price)}</p>
                {product.oldPrice > product.price && (
                  <p style={{ margin: "4px 0 0", fontSize: 14, color: "#a1a1aa", textDecoration: "line-through" }}>{currency(product.oldPrice)}</p>
                )}
              </div>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, margin: "18px 0" }}>
              {discount > 0 && <span className="badge badge-dark">-{discount}%</span>}
              <span className="badge badge-light"><Star size={14} /> {product.rating}</span>
              {product.newArrival && <span className="badge badge-light">Nuevo</span>}
            </div>

            <p className="muted" style={{ lineHeight: 1.8 }}>{product.description}</p>

            <div style={{ marginTop: 24 }}>
              <p style={{ fontWeight: 600, marginBottom: 10 }}>Color: {resolvedSelection?.color}</p>
              <div className="chip-row">
                {product.colors.map((color) => (
                  <button key={color} onClick={() => onChange(product.id, "color", color)} className={`chip ${resolvedSelection?.color === color ? "active" : ""}`}>{color}</button>
                ))}
              </div>
            </div>

            <div style={{ marginTop: 24 }}>
              <p style={{ fontWeight: 600, marginBottom: 10 }}>Talla</p>
              <div className="chip-row">
                {sizesForSelectedColor.map((size) => {
                  const sizeStock = getStockForVariant(product, resolvedSelection?.color, size);
                  return (
                    <button key={size} onClick={() => sizeStock > 0 && onChange(product.id, "size", size)} className={`chip ${resolvedSelection?.size === size ? "active" : ""}`} disabled={sizeStock <= 0} style={{ opacity: sizeStock <= 0 ? 0.45 : 1, cursor: sizeStock <= 0 ? "not-allowed" : "pointer" }}>
                      {size}
                    </button>
                  );
                })}
              </div>
              <div style={{ marginTop: 12 }}>
                <span className={`badge badge-${stockStatus.tone} ${isLowStock ? "badge-low-stock" : ""}`}>{stockStatus.label}</span>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: isAdmin ? "1fr 1fr 1fr" : "1fr 1fr", gap: 12, marginTop: 30 }}>
              <button className="btn btn-primary" onClick={(event) => onAddToCart(product, { sourceElement: event.currentTarget, image: activeImage })} disabled={selectedStock <= 0} style={{ opacity: selectedStock <= 0 ? 0.6 : 1, cursor: selectedStock <= 0 ? "not-allowed" : "pointer" }}>{selectedStock <= 0 ? "Agotado" : (cartEditMode ? "Guardar cambios" : "Agregar al carrito")}</button>
              <button className="btn btn-outline" onClick={onClose}>Seguir viendo</button>
              {isAdmin && (
                <button className="btn btn-soft" onClick={() => onEditProduct(product)}>
                  <Eye size={16} />
                  Editar
                </button>
              )}
            </div>

            <div className="grid" style={{ gridTemplateColumns: "repeat(3, 1fr)", marginTop: 28, gap: 12 }}>
              <div style={{ background: "#fafafa", borderRadius: 22, padding: 16 }}><Truck size={18} /><p style={{ fontWeight: 600, marginBottom: 6 }}>Envios confiables</p><p className="muted" style={{ fontSize: 13 }}>Entrega coordinada por WhatsApp.</p></div>
              <div style={{ background: "#fafafa", borderRadius: 22, padding: 16 }}><RotateCcw size={18} /><p style={{ fontWeight: 600, marginBottom: 6 }}>Cambios faciles</p><p className="muted" style={{ fontSize: 13 }}>Atencion directa con tu cliente.</p></div>
              <div style={{ background: "#fafafa", borderRadius: 22, padding: 16 }}><ShieldCheck size={18} /><p style={{ fontWeight: 600, marginBottom: 6 }}>Compra segura</p><p className="muted" style={{ fontSize: 13 }}>Confirmacion personalizada.</p></div>
            </div>
          </div>
        </Motion.div>
      </Motion.div>
      {imagePreviewOpen && (
        <Motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="modal-backdrop modal-backdrop-priority image-preview-backdrop"
          onClick={closeImagePreview}
        >
          <Motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 8 }}
            transition={{ duration: 0.2 }}
            className="image-preview-shell"
            onClick={(event) => event.stopPropagation()}
          >
            <button onClick={closeImagePreview} className="icon-btn image-preview-close" aria-label="Cerrar vista de imagen">
              <X size={18} />
            </button>
            {hasMultipleImages && (
              <>
                <button className="icon-btn carousel-arrow left" type="button" onClick={goToPreviousImage} aria-label="Imagen anterior">
                  <ChevronLeft size={18} />
                </button>
                <button className="icon-btn carousel-arrow right" type="button" onClick={goToNextImage} aria-label="Imagen siguiente">
                  <ChevronRight size={18} />
                </button>
                <div className="thumb-counter">
                  {safeImageIndex + 1} / {currentImages.length}
                </div>
              </>
            )}
            <Motion.img
              key={`preview-${product.id}-${selection?.color}-${safeImageIndex}-${activeImage}`}
              src={activeImage}
              alt={`${product.name} ampliada`}
              className="image-preview-media"
              loading="eager"
              decoding="async"
              draggable={false}
              style={{
                transform: previewZoomed ? "scale(1.95)" : "scale(1)",
                transformOrigin: previewZoomOrigin,
                transition: "transform .2s ease",
                cursor: previewZoomed ? "zoom-out" : "zoom-in",
                touchAction: previewZoomed ? "none" : "pan-y",
              }}
              onClick={handlePreviewImageClick}
              onPointerDown={handlePreviewPointerDown}
              onPointerMove={handlePreviewPointerMove}
              onPointerUp={handlePreviewPointerUp}
              onPointerCancel={() => {
                previewSwipeStartRef.current = null;
                previewSwipeIntentRef.current = null;
              }}
              onMouseMove={(event) => {
                if (!previewZoomed) return;
                updatePreviewZoomOrigin(event);
              }}
              onError={(event) => {
                if (event.currentTarget.src !== FALLBACK_IMAGE) {
                  event.currentTarget.src = FALLBACK_IMAGE;
                }
              }}
            />
            <button
              type="button"
              className="badge badge-light modal-zoom-toggle"
              style={{ position: "absolute", left: 14, top: 14, zIndex: 3 }}
              onClick={() => setPreviewZoomed((previous) => !previous)}
              aria-label="Activar o desactivar zoom"
            >
              {previewZoomed ? "Quitar zoom" : "Zoom"}
            </button>
          </Motion.div>
        </Motion.div>
      )}
    </AnimatePresence>
  );
}

function ProductDraftPreview({ form, activeColor, setActiveColor, imageIndex, setImageIndex }) {
  const cleanColors = form.colorsData
    .map((color) => ({
      name: color.name.trim(),
      images: color.images.map((image) => image.trim()).filter(Boolean),
      sizes: Array.isArray(color.sizes) ? color.sizes : [],
    }))
    .filter((color) => color.name);

  const selectedColor = cleanColors.find((color) => color.name === activeColor) || cleanColors[0];
  const previewImages = selectedColor?.images || [];
  const previewImage = previewImages[imageIndex] || previewImages[0] || "";
  const previewSizes = selectedColor?.sizes || [];
  const previewBasePrice = Number(form.price || 0);
  const previewOfferConfig = resolveOfferDiscount(previewBasePrice, form.offerDiscountMode, form.offerDiscountValue);
  const previewOfferExtra = form.offerEnabled ? previewOfferConfig.percent : 0;
  const previewFinalPrice = form.offerEnabled ? computeOfferPrice(previewBasePrice, previewOfferExtra) : previewBasePrice;
  const previewOldPrice = Number(form.oldPrice || previewBasePrice || 0);
  const previewDiscount = discountPercent(previewFinalPrice, Math.max(previewOldPrice, previewBasePrice));

  return (
    <div className="card preview-panel">
      {previewImage ? (
        <img src={previewImage} alt={form.name || "Vista previa"} className="preview-panel-img" loading="lazy" decoding="async" />
      ) : (
        <div className="preview-placeholder">
          <div style={{ textAlign: "center", padding: 18 }}>
            <p style={{ fontWeight: 600, margin: 0 }}>Vista previa en tiempo real</p>
            <p className="muted" style={{ marginBottom: 0 }}>Sube una foto o pega una URL para ver el producto.</p>
          </div>
        </div>
      )}

      <div style={{ padding: 22, display: "grid", gap: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <div>
            <p className="muted" style={{ margin: 0, fontSize: 14 }}>{form.category || "Categoria"}</p>
            <h4 style={{ margin: "6px 0 0", fontSize: 24 }}>{form.name || "Nombre del producto"}</h4>
            <p className="muted" style={{ margin: "6px 0 0", fontSize: 13 }}>Tipo: {form.productType || "General"}</p>
          </div>
          <div style={{ textAlign: "right" }}>
            <p style={{ margin: 0, fontWeight: 600 }}>{currency(previewFinalPrice)}</p>
            {Math.max(previewOldPrice, previewBasePrice) > previewFinalPrice && (
              <p className="muted" style={{ margin: "4px 0 0", fontSize: 13, textDecoration: "line-through" }}>{currency(Math.max(previewOldPrice, previewBasePrice))}</p>
            )}
          </div>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {previewDiscount > 0 && <span className="badge badge-dark">-{previewDiscount}%</span>}
            {form.offerEnabled && previewOfferExtra > 0 && (
              <span className="badge badge-warning">
                {form.offerDiscountMode === "amount"
                  ? `Oferta extra -${currency(previewOfferConfig.amount)} (${Math.round(previewOfferExtra)}%)`
                  : `Oferta extra -${Math.round(previewOfferExtra)}%`}
              </span>
            )}
          {form.newArrival && <span className="badge badge-light">Nuevo</span>}
          {form.featured && <span className="badge badge-success">Destacado</span>}
          {form.isPublic === false && <span className="badge badge-warning">Oculto del publico</span>}
        </div>

        <p className="muted" style={{ margin: 0, lineHeight: 1.8 }}>{form.description || "La descripcion del producto se reflejara aqui conforme escribes."}</p>

        <div>
          <p style={{ fontWeight: 600, marginBottom: 10 }}>Colores</p>
          <div className="chip-row">
            {cleanColors.length ? (
              cleanColors.map((color) => (
                <button key={color.name} className={`chip ${selectedColor?.name === color.name ? "active" : ""}`} onClick={() => { setActiveColor(color.name); setImageIndex(0); }}>
                  {color.name}
                </button>
              ))
            ) : (
              <span className="muted">Agrega variantes de color para verlas aqui.</span>
            )}
          </div>
        </div>

        <div>
          <p style={{ fontWeight: 600, marginBottom: 10 }}>Tallas</p>
          <div className="chip-row">
            {previewSizes.length ? previewSizes.map((entry) => <span key={entry.uid} className="chip">{entry.size || "Talla"} - {Math.max(0, Number(entry.stock) || 0)}</span>) : <span className="muted">Sin tallas todava.</span>}
          </div>
        </div>

        {previewImages.length > 1 && (
          <div>
            <p style={{ fontWeight: 600, marginBottom: 10 }}>Galera de {selectedColor?.name}</p>
            <div className="mini-thumb-row">
              {previewImages.map((image, index) => (
                <button
                  key={`${selectedColor?.name}-${index}`}
                  className="icon-btn"
                  style={{ width: 72, height: 72, padding: 0, overflow: "hidden", border: imageIndex === index ? "2px solid #111" : "1px solid rgba(0,0,0,.08)" }}
                  onClick={() => setImageIndex(index)}
                >
                  <img src={image} alt={`${selectedColor?.name} ${index + 1}`} className="mini-thumb" style={{ width: "100%", height: "100%", border: 0 }} loading="lazy" decoding="async" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


function OrdersModal({
  open,
  onClose,
  orders,
  onSearchChange,
  searchValue,
  onOpenReference,
  onCopyOrderCode,
  onOpenOrderWhatsApp,
}) {
  if (!open) return null;
  return (
    <AnimatePresence>
      <Motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="modal-backdrop" onClick={onClose}>
        <Motion.div initial={{ opacity: 0, y: 24, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 18, scale: 0.97 }} transition={{ duration: 0.22 }} className="sheet" onClick={(event) => event.stopPropagation()}>
          <div className="sheet-header">
            <div>
              <p className="muted" style={{ margin: 0, textTransform: "uppercase", letterSpacing: ".25em", fontSize: 13 }}>Tus ordenes</p>
              <h3 style={{ margin: "8px 0 0", fontSize: 32 }}>Seguimiento de pedidos</h3>
            </div>
            <button onClick={onClose} className="icon-btn"><X size={18} /></button>
          </div>
          <div className="sheet-body orders-sheet-body">
            <input className="input" placeholder="Buscar por codigo o producto" value={searchValue} onChange={(event) => onSearchChange(event.target.value)} />
            {orders.length === 0 ? (
              <div className="empty-admin-note">Aun no tienes ordenes guardadas.</div>
            ) : orders.map((order) => {
              const normalizedStatus = normalizeOrderStatusForOrder(order.status, order.deliveryType);
              const canOpenWhatsApp = typeof onOpenOrderWhatsApp === "function"
                && (normalizedStatus === "Listo para retiro" || normalizedStatus === "Enviado");
              return (
              <div key={order.id} className="cart-item customer-order-card">
                <div className="admin-toolbar customer-order-header">
                  <div>
                    <div className="order-code-row">
                      <p style={{ margin: 0, fontWeight: 700 }}>{order.code}</p>
                      <button type="button" className="btn btn-outline order-copy-btn" onClick={() => onCopyOrderCode(order.code)}>
                        <Copy size={13} />
                        Copiar
                      </button>
                    </div>
                    <p className="muted" style={{ margin: "6px 0 0", fontSize: 13 }}>{formatOrderDate(order.createdAt)} - {order.itemCount} item(s)</p>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <span className={`badge badge-light customer-order-status ${normalizedStatus.toLowerCase()}`}>{normalizedStatus}</span>
                    <p style={{ margin: "8px 0 0", fontWeight: 700 }}>{currency(order.total || order.subtotal)}</p>
                  </div>
                </div>
                {(order.discountAmount > 0 || order.couponCode) && (
                  <div className="order-money-block">
                    <div>
                      <span className="muted">Subtotal</span>
                      <strong>{currency(order.subtotal)}</strong>
                    </div>
                    <div>
                      <span className="muted">Descuento</span>
                      <strong>-{currency(order.discountAmount || 0)}</strong>
                    </div>
                    <div>
                      <span className="muted">Total</span>
                      <strong>{currency(order.total || order.subtotal)}</strong>
                    </div>
                  </div>
                )}
                {order.couponCode && <span className="badge badge-light">Cupon: {order.couponCode}</span>}
                <OrderStatusProgress status={order.status} deliveryType={order.deliveryType} />
                {canOpenWhatsApp && (
                  <button type="button" className="btn btn-soft" onClick={() => onOpenOrderWhatsApp(order)}>
                    <MessageCircle size={15} />
                    Abrir WhatsApp
                  </button>
                )}
                <OrderReferenceStrip order={order} onOpen={onOpenReference} />
                {(order.guideNumber || order.paymentProof) && <div className="divider" />}
                {order.guideNumber && <p className="helper-text" style={{ margin: 0 }}>Guia de envio: <strong>{order.guideNumber}</strong></p>}
                {order.paymentProof && <div style={{ marginTop: 10 }}><img src={normalizeImageSource(order.paymentProof) || FALLBACK_IMAGE} alt={`Comprobante ${order.code}`} className="preview-image" loading="lazy" decoding="async" /></div>}
                <div className="divider" />
                <div className="grid customer-order-items" style={{ gap: 8 }}>
                  {order.items.map((item) => (
                    <div key={item.key} className="customer-order-item-row">
                      <span>{item.name} - {item.color} - {item.size} x{item.quantity}</span>
                      <strong>{currency(item.price * item.quantity)}</strong>
                    </div>
                  ))}
                </div>
              </div>
              );
            })}
          </div>
        </Motion.div>
      </Motion.div>
    </AnimatePresence>
  );
}

function ProfileQuickMenu({
  open,
  position,
  onClose,
  onOpenSection,
  onOpenOrders,
  onLogout,
}) {
  if (!open) return null;

  return (
    <AnimatePresence>
      <Motion.div
        className="profile-quick-menu-layer"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.14 }}
        onClick={onClose}
      >
        <Motion.div
          className="profile-quick-menu"
          style={{ top: `${position.top}px`, left: `${position.left}px` }}
          initial={{ opacity: 0, y: -8, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -6, scale: 0.97 }}
          transition={{ duration: 0.18 }}
          onClick={(event) => event.stopPropagation()}
        >
          <button type="button" className="profile-quick-item" onClick={() => onOpenSection("datos")}>
            <UserRound size={15} />
            <span>Datos personales</span>
          </button>
          <button type="button" className="profile-quick-item" onClick={() => onOpenSection("password")}>
            <KeyRound size={15} />
            <span>Cambiar contrasena</span>
          </button>
          <button type="button" className="profile-quick-item" onClick={() => onOpenSection("direccion")}>
            <MapPin size={15} />
            <span>Libreta de direcciones</span>
          </button>
          <button type="button" className="profile-quick-item" onClick={onOpenOrders}>
            <Package size={15} />
            <span>Mis pedidos</span>
          </button>
          <button type="button" className="profile-quick-item profile-quick-item-danger" onClick={onLogout}>
            <X size={15} />
            <span>Cerrar sesion</span>
          </button>
        </Motion.div>
      </Motion.div>
    </AnimatePresence>
  );
}

function CartSummaryModal({
  open,
  onClose,
  cart,
  subtotal,
  discountAmount,
  finalTotal,
  totalItems,
  onUpdateQuantity,
  onRemoveItem,
  onOpenItem,
  onEditItem,
  products,
  onCheckout,
  onSaveCheckoutAddress,
  checkoutDisabled,
  requiresLogin,
  couponDraftCode,
  onCouponDraftChange,
  onApplyCoupon,
  onRemoveCoupon,
  couponState,
  hasActiveCoupon,
  couponBusy,
  checkoutBusy,
  onBrowseCatalog,
  currentUser,
  savedAddresses = [],
  contactSettings,
}) {
  const normalizedSavedAddresses = useMemo(() => normalizeAddressBook(savedAddresses), [savedAddresses]);
  const defaultSavedAddress = normalizedSavedAddresses.find((entry) => entry.isDefault) || normalizedSavedAddresses[0] || null;
  const hasSavedAddresses = normalizedSavedAddresses.length > 0;
  const createInitialDeliveryDraft = () => ({
    fullName: sanitizeLine(currentUser?.name || ""),
    idNumber: "",
    city: sanitizeLine(defaultSavedAddress?.city || ""),
    address: sanitizeParagraph(defaultSavedAddress?.address || currentUser?.shippingAddress || ""),
    reference: sanitizeParagraph(defaultSavedAddress?.reference || ""),
    phone: normalizeUserPhoneNumber(defaultSavedAddress?.phone || currentUser?.phone || ""),
  });
  const [checkoutStep, setCheckoutStep] = useState("summary");
  const [deliveryType, setDeliveryType] = useState("pickup");
  const [deliveryDraft, setDeliveryDraft] = useState(() => createInitialDeliveryDraft());
  const [selectedSavedAddressId, setSelectedSavedAddressId] = useState(() => (defaultSavedAddress?.id || ""));
  const effectiveSelectedSavedAddressId = normalizeEntityId(selectedSavedAddressId || defaultSavedAddress?.id || "");
  const [checkoutFormError, setCheckoutFormError] = useState("");
  const checkoutSummaryRef = useRef(null);

  const pickupAddress = sanitizeLine(contactSettings?.address || "");
  const pickupNote = sanitizeParagraph(contactSettings?.locationNote || "");
  const pickupMapsLink = sanitizeLine(contactSettings?.mapsLink || "");
  const normalizedCouponCode = sanitizeLine(couponState?.code || couponDraftCode || "");
  const couponQuickLabel = hasActiveCoupon
    ? `Cupon ${normalizedCouponCode || "aplicado"} activo`
    : "Tienes cupon? Aplicalo en el resumen";
  const checkoutButtonLabel = checkoutBusy
    ? "Registrando pedido..."
    : requiresLogin
      ? "Inicia sesion para confirmar"
      : checkoutStep === "summary"
        ? "Confirmar pedido"
        : (deliveryType === "pickup" ? "Enviar pedido (Retiro)" : "Enviar pedido (Domicilio)");
  const handleDeliveryDraftChange = (field, value) => {
    if (field === "city" || field === "address" || field === "reference" || field === "phone") {
      setSelectedSavedAddressId("");
    }
    setDeliveryDraft((previous) => ({
      ...previous,
      [field]: field === "phone"
        ? normalizeUserPhoneNumber(value)
        : field === "address" || field === "reference"
          ? sanitizeParagraph(value)
          : sanitizeLine(value),
        }));
  };
  const applySavedAddressToDeliveryDraft = (addressEntry = null) => {
    if (!addressEntry) return;
    setSelectedSavedAddressId(String(addressEntry.id || ""));
    setDeliveryDraft((previous) => ({
      ...previous,
      city: sanitizeLine(addressEntry.city || ""),
      address: sanitizeParagraph(addressEntry.address || ""),
      reference: sanitizeParagraph(addressEntry.reference || ""),
      phone: normalizeUserPhoneNumber(addressEntry.phone || previous.phone || ""),
    }));
    setCheckoutFormError("");
  };

  const handleCheckoutAction = () => {
    if (requiresLogin) {
      onCheckout(null);
      return;
    }
    if (checkoutStep === "summary") {
      setCheckoutStep("confirm");
      setCheckoutFormError("");
      return;
    }

    if (deliveryType === "delivery") {
      const fullName = sanitizeLine(deliveryDraft.fullName || "");
      const idNumber = sanitizeLine(deliveryDraft.idNumber || "");
      const city = sanitizeLine(deliveryDraft.city || "");
      const address = sanitizeParagraph(deliveryDraft.address || "");
      const reference = sanitizeParagraph(deliveryDraft.reference || "");
      const phone = normalizeUserPhoneNumber(deliveryDraft.phone || "");
      if (!fullName || !idNumber || !city || !address || !reference || phone.length !== AUTH_FIELD_LIMITS.phone) {
        setCheckoutFormError("Completa nombre, cedula, ciudad, direccion, referencia y telefono para envio.");
        return;
      }
    }

    setCheckoutFormError("");
    onCheckout({
      deliveryType,
      selectedAddressId: effectiveSelectedSavedAddressId,
      deliveryDetails: {
        fullName: sanitizeLine(deliveryDraft.fullName || ""),
        idNumber: sanitizeLine(deliveryDraft.idNumber || ""),
        city: sanitizeLine(deliveryDraft.city || ""),
        address: sanitizeParagraph(deliveryDraft.address || ""),
        reference: sanitizeParagraph(deliveryDraft.reference || ""),
        phone: normalizeUserPhoneNumber(deliveryDraft.phone || ""),
      },
    });
  };

  const handleSaveCheckoutAddress = async () => {
    if (deliveryType !== "delivery" || typeof onSaveCheckoutAddress !== "function") return;
    const city = sanitizeLine(deliveryDraft.city || "");
    const address = sanitizeParagraph(deliveryDraft.address || "");
    const reference = sanitizeParagraph(deliveryDraft.reference || "");
    const phone = normalizeUserPhoneNumber(deliveryDraft.phone || "");
    if (!city || !address) {
      setCheckoutFormError("Completa ciudad y direccion para guardar esta direccion en tu libreta.");
      return;
    }
    const result = await onSaveCheckoutAddress({
      city,
      address,
      reference,
      phone,
      isDefault: !hasSavedAddresses,
    });
    if (!result?.ok) {
      setCheckoutFormError(result?.message || "No pudimos guardar la direccion en tu libreta.");
      return;
    }
    const savedId = normalizeEntityId(result.savedEntryId || "");
    if (savedId) {
      setSelectedSavedAddressId(savedId);
    }
    setCheckoutFormError("");
  };

  useEffect(() => {
    if (checkoutStep !== "confirm") return;
    const summaryNode = checkoutSummaryRef.current;
    if (!summaryNode || typeof summaryNode.scrollTo !== "function") return;
    summaryNode.scrollTo({ top: 0, behavior: "smooth" });
  }, [checkoutStep, deliveryType]);

  if (!open) return null;

  return (
    <AnimatePresence>
      <Motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="modal-backdrop" onClick={onClose}>
        <Motion.div
          initial={{ opacity: 0, y: 24, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 18, scale: 0.97 }}
          transition={{ duration: 0.22 }}
          className="sheet cart-fullscreen-sheet"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="sheet-header">
            <div>
              <p className="muted" style={{ margin: 0, textTransform: "uppercase", letterSpacing: ".22em", fontSize: 12 }}>Resumen del pedido</p>
              <h3 style={{ margin: "6px 0 0", fontSize: 25 }}>Tu carrito completo</h3>
            </div>
            <button onClick={onClose} className="icon-btn">
              <X size={18} />
            </button>
          </div>

          <div className={`cart-fullscreen-content ${checkoutStep === "confirm" ? "is-confirm-step" : ""}`}>
            <div className={`sheet-body cart-fullscreen-list ${checkoutStep === "confirm" ? "is-confirm-step" : ""}`}>
              {cart.length === 0 ? (
                <EmotionalEmptyState
                  icon={ShoppingBag}
                  title="Tu carrito te esta esperando"
                  description="Explora la coleccion y agrega tus prendas favoritas para armar un pedido increble."
                  actionLabel="Ir al catalogo"
                  onAction={onBrowseCatalog}
                />
              ) : (
                cart.map((item) => {
                  const productRecord = products.find((product) => product.id === item.id);
                  const stockStatus = getStockStatus(getStockForVariant(productRecord, item.color, item.size));
                  return (
                    <Motion.div key={item.key} layout className="cart-item sheet-product-card cart-line-item">
                      <div className="cart-line-layout">
                        <button onClick={() => onOpenItem(item)} className="sheet-thumb-button cart-line-thumb-btn" aria-label={`Ver ${item.name}`}>
                          <img src={item.image} alt={item.name} className="sheet-product-thumb cart-line-thumb" loading="lazy" decoding="async" />
                        </button>

                        <button onClick={() => onOpenItem(item)} className="sheet-product-title-button cart-line-main" aria-label={`Ver detalle de ${item.name}`}>
                          <p className="sheet-product-title cart-line-title">{item.name}</p>
                          <p className="muted sheet-product-meta-text cart-line-meta">{item.color} - {item.size}</p>
                          <p className="muted sheet-product-meta-text sheet-stock-text cart-line-stock">{stockStatus.label}</p>
                        </button>

                        <div className="cart-line-side">
                          <div className="cart-line-actions">
                            <button type="button" className="btn btn-soft cart-line-edit-btn" onClick={() => onEditItem(item)}>
                              <PencilLine size={13} />
                              Editar
                            </button>
                            <button onClick={() => onRemoveItem(item.key)} className="sheet-remove-btn cart-line-remove-btn" aria-label="Quitar producto del carrito">
                              <Trash2 size={15} />
                            </button>
                          </div>
                          <div className="qty sheet-qty cart-line-qty">
                            <button className="qty-control-btn" onClick={() => onUpdateQuantity(item.key, -1)} aria-label="Disminuir cantidad"><Minus size={14} /></button>
                            <span className="cart-line-qty-value">{item.quantity}</span>
                            <button className="qty-control-btn" onClick={() => onUpdateQuantity(item.key, 1)} aria-label="Aumentar cantidad"><Plus size={14} /></button>
                          </div>
                          <p className="sheet-product-price cart-line-price">{currency(item.price * item.quantity)}</p>
                        </div>
                      </div>
                    </Motion.div>
                  );
                })
              )}
            </div>

            <div
              className={`sheet-footer cart-fullscreen-summary ${checkoutStep === "confirm" ? "is-confirm-step" : ""}`}
              ref={checkoutSummaryRef}
            >
              <div className="cart-footer-details">
                {checkoutStep === "summary" ? (
                  <div className="surface coupon-surface">
                    <div className="coupon-head">
                      <p style={{ margin: 0, fontWeight: 600 }}>Cupon de descuento</p>
                      {hasActiveCoupon && (
                        <button type="button" className="link-btn coupon-remove-btn" onClick={onRemoveCoupon}>
                          Quitar
                        </button>
                      )}
                    </div>
                    <div className="coupon-row">
                      <input
                        className="input"
                        placeholder="Codigo"
                        value={couponDraftCode}
                        onChange={(event) => onCouponDraftChange(event.target.value)}
                      />
                      <button type="button" className="btn btn-outline" onClick={onApplyCoupon} disabled={couponBusy || cart.length === 0} aria-busy={couponBusy}>
                        {couponBusy ? "Validando..." : "Aplicar"}
                      </button>
                    </div>
                    {!!couponState?.message && (
                      <p className={`helper-text ${couponState?.ok ? "coupon-ok" : "coupon-error"}`} style={{ margin: 0 }}>
                        {couponState.message}
                      </p>
                    )}
                    {couponState?.ok && couponState.excludedItemsCount > 0 && (
                      <p className="helper-text" style={{ margin: 0 }}>
                        El descuento se aplica solo a productos elegibles: {currency(couponState.eligibleSubtotal)}.
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="surface coupon-mini-surface">
                    <button type="button" className="btn btn-soft coupon-mini-toggle" onClick={() => setCheckoutStep("summary")}>
                      <Tag size={13} />
                      {couponQuickLabel}
                    </button>
                    {hasActiveCoupon && (
                      <button type="button" className="link-btn coupon-remove-btn" onClick={onRemoveCoupon}>
                        Quitar
                      </button>
                    )}
                  </div>
                )}
                <div className="cart-footer-meta-row"><span className="muted">Productos</span><strong>{totalItems}</strong></div>
                <div className="cart-footer-meta-row"><span className="muted">Subtotal</span><strong><AnimatedCurrencyValue value={subtotal} /></strong></div>
                <div className="cart-footer-meta-row"><span className="muted">Descuento</span><strong>-<AnimatedCurrencyValue value={discountAmount} /></strong></div>
              </div>

              {cart.length > 0 && !requiresLogin && checkoutStep === "confirm" && (
                <div className="surface checkout-confirm-surface">
                  <div className="checkout-confirm-head">
                    <div className="checkout-confirm-head-row">
                      <div>
                        <p className="muted checkout-confirm-step">Paso 2 de 2</p>
                        <h4 className="checkout-confirm-title">Confirmar entrega</h4>
                      </div>
                      <button type="button" className="btn btn-soft checkout-back-btn-inline" onClick={() => setCheckoutStep("summary")}>
                        <ChevronLeft size={14} />
                        Volver al resumen
                      </button>
                    </div>
                  </div>

                  <div className="checkout-delivery-switch" role="tablist" aria-label="Tipo de entrega">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={deliveryType === "pickup"}
                      className={`checkout-delivery-tab ${deliveryType === "pickup" ? "active" : ""}`}
                      onClick={() => {
                        setDeliveryType("pickup");
                        setCheckoutFormError("");
                      }}
                    >
                      <Store size={14} />
                      Retiro en local
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={deliveryType === "delivery"}
                      className={`checkout-delivery-tab ${deliveryType === "delivery" ? "active" : ""}`}
                      onClick={() => {
                        setDeliveryType("delivery");
                        setCheckoutFormError("");
                      }}
                    >
                      <Truck size={14} />
                      Envio a domicilio
                    </button>
                  </div>

                  {deliveryType === "pickup" ? (
                    <div className="checkout-pickup-box">
                      <p className="checkout-pickup-line"><MapPin size={14} /> {pickupAddress || "Direccion no configurada aun."}</p>
                      {pickupNote && <p className="helper-text" style={{ margin: 0 }}>{pickupNote}</p>}
                      {pickupMapsLink && (
                        <a className="link-btn checkout-pickup-link" href={pickupMapsLink} target="_blank" rel="noopener noreferrer">
                          Ver ubicacion en Google Maps
                        </a>
                      )}
                    </div>
                  ) : (
                    <div className="checkout-delivery-form">
                      {hasSavedAddresses && (
                        <div className="checkout-saved-addresses">
                          <p className="muted checkout-saved-addresses-title">Libreta de direcciones</p>
                          <div className="checkout-saved-address-list">
                            {normalizedSavedAddresses.map((entry) => {
                              const isActive = String(entry.id || "") === String(effectiveSelectedSavedAddressId || "");
                              return (
                                <button
                                  key={entry.id}
                                  type="button"
                                  className={`checkout-saved-address-chip ${isActive ? "active" : ""}`}
                                  onClick={() => applySavedAddressToDeliveryDraft(entry)}
                                >
                                  <span className="checkout-saved-address-chip-label">{entry.label}</span>
                                  <span className="checkout-saved-address-chip-text">{entry.address}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      {!hasSavedAddresses && (
                        <p className="helper-text" style={{ margin: 0 }}>
                          Aun no tienes direcciones guardadas. Completa este formulario y tu direccion se guardara automaticamente al confirmar.
                        </p>
                      )}
                      <div className="checkout-delivery-grid">
                        <input className="input" placeholder="Nombre completo" value={deliveryDraft.fullName} onChange={(event) => handleDeliveryDraftChange("fullName", event.target.value)} />
                        <input className="input" placeholder="Cedula" value={deliveryDraft.idNumber} onChange={(event) => handleDeliveryDraftChange("idNumber", event.target.value)} />
                        <input className="input" placeholder="Ciudad" value={deliveryDraft.city} onChange={(event) => handleDeliveryDraftChange("city", event.target.value)} />
                        <input className="input" placeholder="Telefono (10 digitos)" value={deliveryDraft.phone} onChange={(event) => handleDeliveryDraftChange("phone", event.target.value)} />
                        <textarea className="textarea checkout-delivery-full" placeholder="Direccion exacta" value={deliveryDraft.address} onChange={(event) => handleDeliveryDraftChange("address", event.target.value)} />
                        <textarea className="textarea checkout-delivery-full" placeholder="Referencia de entrega" value={deliveryDraft.reference} onChange={(event) => handleDeliveryDraftChange("reference", event.target.value)} />
                      </div>
                      <button
                        type="button"
                        className="btn btn-outline"
                        onClick={() => { void handleSaveCheckoutAddress(); }}
                        disabled={typeof onSaveCheckoutAddress !== "function"}
                      >
                        Guardar direccion en libreta
                      </button>
                    </div>
                  )}

                  {checkoutFormError && <p className="helper-text coupon-error" style={{ margin: 0 }}>{checkoutFormError}</p>}
                </div>
              )}

              <div className={`cart-checkout-cta ${checkoutStep === "confirm" ? "is-confirm-step" : ""}`}>
                <div className="cart-footer-total-row"><span>Total</span><strong><AnimatedCurrencyValue value={finalTotal} /></strong></div>
                <button
                  className="btn btn-primary"
                  onClick={handleCheckoutAction}
                  disabled={cart.length === 0 || checkoutDisabled || checkoutBusy}
                  aria-busy={checkoutBusy}
                  style={{ opacity: cart.length === 0 || checkoutDisabled || checkoutBusy ? 0.6 : 1, cursor: cart.length === 0 || checkoutDisabled || checkoutBusy ? "not-allowed" : "pointer" }}
                >
                  <MessageCircle size={18} />
                  {checkoutButtonLabel}
                </button>
              </div>
              {requiresLogin && cart.length > 0 && (
                <p className="helper-text sheet-login-hint">
                  Gracias por elegirnos. Inicia sesion para guardar tu pedido, seguimiento y confirmacion.
                </p>
              )}
            </div>
          </div>
        </Motion.div>
      </Motion.div>
    </AnimatePresence>
  );
}

function FavoritesModal({
  open,
  onClose,
  favorites,
  products,
  onOpenProduct,
  onToggleFavorite,
  onBrowseCatalog,
}) {
  if (!open) return null;

  const favoriteProducts = favorites
    .map((favoriteId) => products.find((product) => product.id === favoriteId))
    .filter(Boolean);

  return (
    <AnimatePresence>
      <Motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="modal-backdrop" onClick={onClose}>
        <Motion.div
          initial={{ opacity: 0, y: 24, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 18, scale: 0.97 }}
          transition={{ duration: 0.22 }}
          className="sheet"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="sheet-header">
            <div>
              <p className="muted" style={{ margin: 0, textTransform: "uppercase", letterSpacing: ".25em", fontSize: 13 }}>Favoritos</p>
              <h3 style={{ margin: "8px 0 0", fontSize: 32 }}>Tus prendas guardadas</h3>
            </div>
            <button onClick={onClose} className="icon-btn">
              <X size={18} />
            </button>
          </div>

          <div className="sheet-body">
            {favoriteProducts.length === 0 ? (
              <EmotionalEmptyState
                icon={Heart}
                title="Aun no guardas favoritos"
                description="Marca prendas con el corazon y aqui tendras tu seleccion para volver a ellas en segundos."
                actionLabel="Explorar coleccion"
                onAction={onBrowseCatalog}
              />
            ) : (
              favoriteProducts.map((product) => (
                <Motion.div key={product.id} layout className="cart-item sheet-product-card">
                  <div className="sheet-product-layout">
                    <button onClick={() => onOpenProduct(product)} className="sheet-thumb-button">
                      <img src={getCurrentImageForProduct(product, product.colors[0])} alt={product.name} className="sheet-product-thumb" loading="lazy" decoding="async" />
                    </button>

                    <div className="sheet-product-main">
                      <div className="sheet-product-top">
                        <button onClick={() => onOpenProduct(product)} className="sheet-product-title-button">
                          <p className="sheet-product-title">{product.name}</p>
                          <p className="muted sheet-product-meta-text">{product.category}</p>
                        </button>

                        <button onClick={() => onToggleFavorite(product.id)} className="sheet-remove-btn" aria-label="Quitar de favoritos">
                          <Heart size={16} fill="currentColor" />
                        </button>
                      </div>

                      <div className="sheet-product-bottom sheet-product-bottom-favorites">
                        <p className="sheet-product-price">{currency(product.price)}</p>
                        <button className="btn btn-outline sheet-detail-btn" onClick={() => onOpenProduct(product)}>Ver detalle</button>
                      </div>
                    </div>
                  </div>
                </Motion.div>
              ))
            )}
          </div>
        </Motion.div>
      </Motion.div>
    </AnimatePresence>
  );
}

function ShowcaseProductCard({ product, onOpenDetail, onAddToCart }) {
  const fallbackSelection = getFallbackSelection(product);
  const hasStock = fallbackSelection.availableStock > 0;
  const discount = discountPercent(product.price, product.oldPrice);
  const previewImage = getCurrentImageForProduct(product, fallbackSelection.color);

  return (
    <Motion.div whileHover={{ y: -4 }} className="card product-card">
      <div className="product-img-wrap">
        <button type="button" onClick={() => onOpenDetail(product, fallbackSelection)} className="product-image-main-btn" aria-label={`Ver detalle de ${product.name}`}>
          <img src={previewImage} alt={product.name} className="product-img" loading="lazy" decoding="async" />
        </button>
      </div>
      <div className="product-card-body">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
          <div>
            <p className="muted" style={{ margin: 0, fontSize: 14 }}>{product.category}</p>
            <button onClick={() => onOpenDetail(product, fallbackSelection)} style={{ border: 0, background: "transparent", padding: 0, cursor: "pointer", textAlign: "left" }}>
              <h4 className="product-card-title">{product.name}</h4>
            </button>
          </div>
          <span className="muted" style={{ fontSize: 14, display: "inline-flex", alignItems: "center", gap: 4 }}>
            <Star size={13} fill="currentColor" />
            {product.rating}
          </span>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontWeight: 600 }}>{currency(product.price)}</span>
          {product.oldPrice > product.price && <span className="muted" style={{ textDecoration: "line-through", fontSize: 14 }}>{currency(product.oldPrice)}</span>}
          {discount > 0 && <span className="badge badge-light">-{discount}%</span>}
        </div>

        {!!product.filterTags?.length && (
          <div className="product-card-tags">
            {product.filterTags.slice(0, 2).map((tag) => <span key={tag} className="badge badge-light">{tag}</span>)}
          </div>
        )}

        <div className="product-card-actions">
          <button
            className="btn btn-primary"
            onClick={(event) => onAddToCart(product, { sourceElement: event.currentTarget, image: previewImage }, fallbackSelection)}
            disabled={!hasStock}
            style={{ opacity: hasStock ? 1 : 0.6, cursor: hasStock ? "pointer" : "not-allowed" }}
          >
            {hasStock ? "Agregar" : "Agotado"}
          </button>
          <button className="btn btn-outline product-detail-btn" onClick={() => onOpenDetail(product, fallbackSelection)}>Detalle</button>
        </div>
      </div>
    </Motion.div>
  );
}

function CatalogProductCard({
  product,
  selection,
  onChange,
  onOpenDetail,
  onAddToCart,
  onToggleFavorite,
  isFavorite,
  isAdmin,
  onEdit,
  onDelete,
}) {
  const resolvedSelection = getSelectionForColor(product, selection);
  const selectedColor = resolvedSelection.color;
  const selectedSize = resolvedSelection.size;
  const currentImages = getImagesForColor(product, selectedColor);
  const currentImage = currentImages[0] || FALLBACK_IMAGE;
  const discount = discountPercent(product.price, product.oldPrice);
  const sizesForSelectedColor = getSizesForColor(product, selectedColor);
  const availableStock = resolvedSelection.availableStock;
  const stockStatus = getStockStatus(availableStock);
  const isLowStock = availableStock > 0 && availableStock <= 2;

  return (
    <Motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: ANIMATION.base }} className="card product-card">
      <div className="product-img-wrap">
        <button type="button" onClick={() => onOpenDetail(product, { color: selectedColor, size: selectedSize })} className="product-image-main-btn" aria-label={`Ver detalle de ${product.name}`}>
          <AnimatePresence mode="wait">
            <Motion.img
              key={`${product.id}-${selectedColor}-${currentImage}`}
              src={currentImage}
              alt={product.name}
              loading="lazy"
              decoding="async"
              initial={{ opacity: 0, scale: 1.02 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.99 }}
              transition={{ duration: ANIMATION.fast }}
              className="product-img"
            />
          </AnimatePresence>
        </button>
        <div style={{ position: "absolute", left: 10, top: 10, display: "flex", flexWrap: "wrap", gap: 6, pointerEvents: "none" }}>
          {product.offerEnabled && discount > 0 && <span className="badge badge-offer">Oferta -{discount}%</span>}
          {product.newArrival && <span className="badge badge-light">Nuevo</span>}
          {product.featured && <span className="badge badge-dark">Destacado</span>}
        </div>
        <div className="product-card-floating-actions">
          <button className="icon-btn" onClick={() => onToggleFavorite(product.id)} aria-label="Guardar en favoritos"><Heart size={16} fill={isFavorite ? "currentColor" : "none"} /></button>
        </div>
        {isAdmin && (
          <div style={{ position: "absolute", left: 10, bottom: 10, display: "flex", gap: 8 }}>
            <button className="icon-btn" onClick={() => onEdit(product)} title="Editar producto"><PencilLine size={16} /></button>
            <button className="icon-btn" onClick={() => onDelete(product.id)} title="Eliminar producto"><Trash2 size={16} /></button>
          </div>
        )}
      </div>

      <div className="product-card-body">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <div>
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>{product.category}</p>
            <button onClick={() => onOpenDetail(product, { color: selectedColor, size: selectedSize })} style={{ border: 0, background: "transparent", padding: 0, cursor: "pointer", textAlign: "left" }}>
              <h4 className="product-card-title">{product.name}</h4>
            </button>
            <p className="muted" style={{ margin: "6px 0 0", fontSize: 12 }}>{product.productType || "General"}</p>
          </div>
          <div style={{ textAlign: "right" }}>
            {product.offerEnabled && discount > 0 && <p className="offer-price-callout">AHORA -{discount}%</p>}
            <p style={{ margin: 0, fontWeight: 600 }}>{currency(product.price)}</p>
            {product.oldPrice > product.price && <p className="muted" style={{ margin: "4px 0 0", fontSize: 12, textDecoration: "line-through" }}>{currency(product.oldPrice)}</p>}
          </div>
        </div>

        <p className="muted product-card-description">{product.description}</p>

        {!!product.filterTags?.length && (
          <div className="product-card-tags">
            {product.filterTags.slice(0, 3).map((tag) => <span key={tag} className="badge badge-light">{tag}</span>)}
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
          <Star size={14} fill="currentColor" /> {product.rating}
          {discount > 0 && <><span className="muted">|</span><span className="muted">-{discount}%</span></>}
        </div>

        <div className="product-card-variant-block">
          <div>
            <label className="muted" style={{ display: "block", marginBottom: 8, fontSize: 13 }}>Color</label>
            <div className="chip-row">
              {product.colors.map((color) => (
                <button key={color} className={`chip ${selectedColor === color ? "active" : ""}`} onClick={() => onChange(product.id, "color", color)}>{color}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="muted" style={{ display: "block", marginBottom: 8, fontSize: 13 }}>Talla</label>
            <div className="chip-row">
              {sizesForSelectedColor.map((size) => {
                const sizeStock = getStockForVariant(product, selectedColor, size);
                return (
                  <button key={size} className={`chip ${selectedSize === size ? "active" : ""}`} onClick={() => sizeStock > 0 && onChange(product.id, "size", size)} disabled={sizeStock <= 0} style={{ opacity: sizeStock <= 0 ? 0.45 : 1, cursor: sizeStock <= 0 ? "not-allowed" : "pointer" }}>
                    {size}
                  </button>
                );
              })}
            </div>
            <div style={{ marginTop: 10 }}>
              <span className={`badge badge-${stockStatus.tone} ${isLowStock ? "badge-low-stock" : ""}`}>{stockStatus.label}</span>
            </div>
          </div>
        </div>

        <div className="product-card-actions">
          <button className="btn btn-primary" onClick={(event) => onAddToCart(product, { sourceElement: event.currentTarget, image: currentImage })} disabled={availableStock <= 0} style={{ opacity: availableStock <= 0 ? 0.6 : 1, cursor: availableStock <= 0 ? "not-allowed" : "pointer" }}>{availableStock <= 0 ? "Agotado" : "Agregar"}</button>
          <button className="btn btn-outline product-detail-btn" onClick={() => onOpenDetail(product, { color: selectedColor, size: selectedSize })}>Detalle</button>
        </div>
      </div>
    </Motion.div>
  );
}

function CatalogSkeletonCard() {
  return (
    <div className="card product-card skeleton-card" aria-hidden="true">
      <div className="skeleton-block skeleton-image" />
      <div className="product-card-body">
        <div className="skeleton-line skeleton-line-sm" />
        <div className="skeleton-line" />
        <div className="skeleton-line skeleton-line-sm" />
        <div className="skeleton-chip-row">
          <span className="skeleton-chip" />
          <span className="skeleton-chip" />
          <span className="skeleton-chip" />
        </div>
        <div className="skeleton-actions">
          <span className="skeleton-pill" />
          <span className="skeleton-pill skeleton-pill-light" />
        </div>
      </div>
    </div>
  );
}

function CatalogPagination({
  currentPage,
  totalPages,
  pageWindow,
  onPageChange,
}) {
  if (totalPages <= 1) return null;

  return (
    <div className="catalog-pagination" aria-label="Paginacion del catalogo">
      <button
        type="button"
        className="btn btn-outline catalog-page-btn"
        onClick={() => onPageChange(Math.max(1, currentPage - 1))}
        disabled={currentPage === 1}
      >
        <ChevronLeft size={16} />
        Anterior
      </button>

      <div className="catalog-page-numbers">
        {pageWindow[0] > 1 && <span className="catalog-page-ellipsis">...</span>}
        {pageWindow.map((pageNumber) => (
          <button
            key={pageNumber}
            type="button"
            className={`catalog-page-number ${pageNumber === currentPage ? "active" : ""}`}
            onClick={() => onPageChange(pageNumber)}
            aria-current={pageNumber === currentPage ? "page" : undefined}
          >
            {pageNumber}
          </button>
        ))}
        {pageWindow[pageWindow.length - 1] < totalPages && <span className="catalog-page-ellipsis">...</span>}
      </div>

      <button
        type="button"
        className="btn btn-outline catalog-page-btn"
        onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
        disabled={currentPage === totalPages}
      >
        Siguiente
        <ChevronRight size={16} />
      </button>
    </div>
  );
}

function ManagedEntitiesEditor(props) {
  const {
    title,
    description,
    icon,
    records,
    products,
    entityType,
    addInput,
    setAddInput,
    onAdd,
    onDraftChange,
    onSave,
    onDelete,
    onToggleActive,
  } = props;
  const Icon = icon;
  const [replacementMap, setReplacementMap] = useState({});
  const isType = entityType === "productType";

  const getAssociationCount = (record) => products.filter((product) => (
    isType
      ? normalizeOptionLabel(product.productType || "").toLowerCase() === record.name.toLowerCase()
      : (product.filterTags || []).some((tag) => normalizeOptionLabel(tag).toLowerCase() === record.name.toLowerCase())
  )).length;

  const alternativesFor = (record) => records
    .filter((other) => other.id !== record.id)
    .sort((left, right) => {
      if (left.active === right.active) return left.name.localeCompare(right.name, "es", { sensitivity: "base" });
      return left.active ? -1 : 1;
    });

  return (
    <div className="card" style={{ padding: 22 }}>
      <div className="admin-toolbar">
        <div>
          <p className="muted" style={{ textTransform: "uppercase", letterSpacing: ".25em", fontSize: 13 }}>{title}</p>
          <h4 style={{ margin: "6px 0 0", fontSize: 28, display: "flex", alignItems: "center", gap: 10 }}><Icon size={22} /> {title}</h4>
          <p className="muted" style={{ marginBottom: 0, lineHeight: 1.8 }}>{description}</p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 10, marginTop: 18 }}>
        <input className="input" placeholder={isType ? "Agregar tipo de producto" : "Agregar filtro/tag"} value={addInput} onChange={(event) => setAddInput(event.target.value)} />
        <button className="btn btn-outline" type="button" onClick={onAdd}><Plus size={16} />Agregar</button>
      </div>

      <div className="entity-grid" style={{ marginTop: 18 }}>
        {records.length === 0 ? (
          <div className="empty-admin-note">Todava no hay elementos registrados en esta seccin.</div>
        ) : records.map((record) => {
          const associationCount = getAssociationCount(record);
          const replacement = replacementMap[record.id] || (associationCount > 0 ? alternativesFor(record)[0]?.name || "" : "");
          return (
            <div key={record.id} className="entity-row">
              <div className="entity-row-head">
                <div>
                  <h5 style={{ margin: 0, fontSize: 20 }}>{record.name}</h5>
                  <div className="entity-row-meta" style={{ marginTop: 10 }}>
                    <span className="badge badge-light">slug: {record.slug || slugify(record.name)}</span>
                    <span className={`badge ${record.active ? "badge-success" : "badge-light"}`}>{record.active ? "Activo" : "Oculto"}</span>
                    <span className="badge badge-light">{associationCount} {isType ? "producto(s)" : "asociacion(es)"}</span>
                  </div>
                </div>
                <div className="entity-actions">
                  <button className="btn btn-outline" type="button" onClick={() => onToggleActive(record.id)}>{record.active ? "Ocultar" : "Activar"}</button>
                </div>
              </div>

              <div className="entity-edit-grid">
                <input className="input" placeholder="Nombre" value={record.draftName ?? record.name} onChange={(event) => onDraftChange(record.id, "draftName", event.target.value)} />
                <input className="input" placeholder="Slug" value={record.draftSlug ?? record.slug} onChange={(event) => onDraftChange(record.id, "draftSlug", event.target.value)} />
                <button className="btn btn-soft" type="button" onClick={() => onSave(record.id)}><PencilLine size={16} />Guardar</button>
                <button className="btn btn-danger" type="button" onClick={() => onDelete(record.id, replacement)}><Trash2 size={16} />Eliminar</button>
              </div>

              {associationCount > 0 && (
                <div className="entity-assignment">
                  <select className="select" value={replacement} onChange={(event) => setReplacementMap((previous) => ({ ...previous, [record.id]: event.target.value }))}>
                    <option value="">{isType ? "Selecciona una reasignacion" : "Eliminar sin reemplazo"}</option>
                    {alternativesFor(record).map((item) => <option key={item.id} value={item.name}>{item.name}{item.active ? "" : " (oculto)"}</option>)}
                  </select>
                  <p className="helper-text" style={{ margin: 0 }}>
                    {isType
                      ? "Si este tipo esta asignado a productos, debes escoger a cual se moveran antes de eliminarlo."
                      : "Puedes reemplazar el filtro por otro o eliminarlo de todos los productos asociados."}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CouponManagerPanel({
  coupons,
  couponDraft,
  couponEditorMessage,
  couponEditorError,
  products,
  productTypeOptions,
  onCouponDraftFieldChange,
  onToggleCouponDraftProduct,
  onToggleCouponDraftProductType,
  onSaveCoupon,
  onResetCouponDraft,
  onEditCoupon,
  onToggleCouponActive,
  onDeleteCoupon,
}) {
  const selectedExcludedTypes = new Set(
    splitFilterTagsText(couponDraft.excludedProductTypesText || "").map((item) => item.toLowerCase()),
  );

  return (
    <div className="admin-tab-panel">
      <div className="card" style={{ padding: 22 }}>
        <div className="admin-toolbar">
          <div>
            <p className="muted" style={{ textTransform: "uppercase", letterSpacing: ".25em", fontSize: 13 }}>Descuentos</p>
            <h4 style={{ margin: "6px 0 0", fontSize: 28 }}>{couponDraft.id ? "Editar cupon" : "Crear cupon"}</h4>
          </div>
          <div className="admin-actions">
            {couponDraft.id && <button className="btn btn-outline" onClick={onResetCouponDraft}><X size={16} />Cancelar</button>}
            <button className="btn btn-primary" onClick={onSaveCoupon}><ShieldCheck size={16} />Guardar cupon</button>
          </div>
        </div>

        {(couponEditorMessage || couponEditorError) && (
          <div style={{ marginTop: 14 }}>
            {couponEditorMessage && <div className="status-message status-success">{couponEditorMessage}</div>}
            {couponEditorError && <div className="status-message status-error" style={{ marginTop: couponEditorMessage ? 10 : 0 }}>{couponEditorError}</div>}
          </div>
        )}

        <div className="settings-grid" style={{ marginTop: 18 }}>
          <input className="input" placeholder="Codigo (ej: VIP20)" value={couponDraft.code} onChange={(event) => onCouponDraftFieldChange("code", event.target.value)} />
          <select className="select" value={couponDraft.discountType} onChange={(event) => onCouponDraftFieldChange("discountType", event.target.value)}>
            <option value="percentage">Porcentaje (%)</option>
            <option value="fixed">Monto fijo ($)</option>
          </select>
          <input className="input" type="number" min="0" placeholder="Valor del descuento" value={couponDraft.discountValue} onChange={(event) => onCouponDraftFieldChange("discountValue", event.target.value)} />
          <input className="input" type="number" min="0" placeholder="Minimo de compra" value={couponDraft.minPurchase} onChange={(event) => onCouponDraftFieldChange("minPurchase", event.target.value)} />
          <input className="input" type="number" min="0" placeholder="Limite por usuario (0 = sin lmite)" value={couponDraft.limitPerUser} onChange={(event) => onCouponDraftFieldChange("limitPerUser", event.target.value)} />
          <input className="input" type="number" min="0" placeholder="Limite global (0 = sin lmite)" value={couponDraft.limitGlobal} onChange={(event) => onCouponDraftFieldChange("limitGlobal", event.target.value)} />
          <div className="admin-full">
            <label className="helper-text" style={{ display: "block", marginBottom: 8 }}>Activo desde (opcional)</label>
            <input className="input" type="datetime-local" value={couponDraft.startsAt || ""} onChange={(event) => onCouponDraftFieldChange("startsAt", event.target.value)} />
          </div>
          <div className="admin-full">
            <label className="helper-text" style={{ display: "block", marginBottom: 8 }}>Expira el (opcional)</label>
            <input className="input" type="datetime-local" value={couponDraft.expiresAt} onChange={(event) => onCouponDraftFieldChange("expiresAt", event.target.value)} />
          </div>
          <input className="input" type="time" value={couponDraft.activeHourStart || ""} onChange={(event) => onCouponDraftFieldChange("activeHourStart", event.target.value)} placeholder="Hora inicio" />
          <input className="input" type="time" value={couponDraft.activeHourEnd || ""} onChange={(event) => onCouponDraftFieldChange("activeHourEnd", event.target.value)} placeholder="Hora fin" />
          <div className="admin-full">
            <label className="helper-text" style={{ display: "block", marginBottom: 8 }}>Categorias permitidas (opcional)</label>
            <input className="input" placeholder="Ej: mujer, hombre, premium" value={couponDraft.allowedCategoriesText || ""} onChange={(event) => onCouponDraftFieldChange("allowedCategoriesText", event.target.value)} />
            <p className="helper-text" style={{ margin: "8px 0 0" }}>
              Si dejas vacio, aplica a cualquier categoria elegible.
            </p>
          </div>
          <div className="admin-full">
            <label style={{ display: "inline-flex", alignItems: "center", gap: 10, fontWeight: 600 }}>
              <input className="checkbox" type="checkbox" checked={couponDraft.active !== false} onChange={(event) => onCouponDraftFieldChange("active", event.target.checked)} />
              Cupon activo
            </label>
          </div>
          <div className="admin-full">
            <label className="helper-text" style={{ display: "block", marginBottom: 8 }}>Tipos/categorias excluidas</label>
            <div className="chip-row coupon-type-chip-row">
              {productTypeOptions.map((productType) => {
                const normalizedType = normalizeOptionLabel(productType);
                if (!normalizedType) return null;
                const selected = selectedExcludedTypes.has(normalizedType.toLowerCase());
                return (
                  <button
                    key={normalizedType}
                    type="button"
                    className={`chip ${selected ? "active" : ""}`}
                    onClick={() => onToggleCouponDraftProductType(normalizedType)}
                  >
                    {normalizedType}
                  </button>
                );
              })}
            </div>
            <label className="helper-text" style={{ display: "block", margin: "10px 0 8px" }}>Tambien puedes escribirlos manualmente separados por coma</label>
            <input className="input" placeholder={`Ej: licras, ${productTypeOptions[0] || "blazers"}`} value={couponDraft.excludedProductTypesText} onChange={(event) => onCouponDraftFieldChange("excludedProductTypesText", event.target.value)} />
          </div>
          <div className="admin-full">
            <p className="helper-text" style={{ marginTop: 0 }}>Productos excluidos del descuento</p>
            <div className="coupon-products-grid">
              {products.map((product) => {
                const productId = String(product.id);
                const selected = (couponDraft.excludedProductIds || []).map((entry) => String(entry)).includes(productId);
                return (
                  <button
                    key={productId}
                    type="button"
                    className={`coupon-product-pill ${selected ? "selected" : ""}`}
                    onClick={() => onToggleCouponDraftProduct(productId)}
                  >
                    <input type="checkbox" checked={selected} readOnly />
                    <span>{product.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 22 }}>
        <div className="admin-toolbar">
          <div>
            <p className="muted" style={{ textTransform: "uppercase", letterSpacing: ".25em", fontSize: 13 }}>Listado</p>
            <h4 style={{ margin: "6px 0 0", fontSize: 28 }}>Cupones registrados</h4>
          </div>
          <span className="badge badge-light">{coupons.length} cupon(es)</span>
        </div>
        <div className="stack" style={{ marginTop: 16 }}>
          {coupons.length === 0 ? (
            <div className="empty-admin-note">Aun no hay cupones creados.</div>
          ) : coupons.map((coupon) => (
            <div key={coupon.id} className="coupon-row-card">
              <div className="admin-toolbar">
                <div>
                  <strong>{coupon.code}</strong>
                  <p className="muted" style={{ margin: "6px 0 0", fontSize: 13 }}>
                    {coupon.discountType === "percentage" ? `${coupon.discountValue}%` : currency(coupon.discountValue)} - minimo {currency(coupon.minPurchase || 0)}
                  </p>
                </div>
                <div className="admin-actions">
                  <span className={`badge ${coupon.active ? "badge-success" : "badge-light"}`}>{coupon.active ? "Activo" : "Inactivo"}</span>
                  <button className="btn btn-soft" onClick={() => onEditCoupon(coupon)}><PencilLine size={16} />Editar</button>
                  <button className="btn btn-outline" onClick={() => onToggleCouponActive(coupon.id)}>{coupon.active ? "Desactivar" : "Activar"}</button>
                  <button className="btn btn-danger" onClick={() => onDeleteCoupon(coupon.id)}><Trash2 size={16} />Eliminar</button>
                </div>
              </div>
              <div className="chip-row" style={{ marginTop: 10 }}>
                <span className="badge badge-light">Usos: {coupon.usageTotal}</span>
                {coupon.limitGlobal > 0 && <span className="badge badge-light">Limite global: {coupon.limitGlobal}</span>}
                {coupon.limitPerUser > 0 && <span className="badge badge-light">Limite por usuario: {coupon.limitPerUser}</span>}
                {coupon.startsAt && <span className="badge badge-light">Desde: {new Date(coupon.startsAt).toLocaleString("es-EC")}</span>}
                {coupon.expiresAt && <span className="badge badge-light">Expira: {new Date(coupon.expiresAt).toLocaleString("es-EC")}</span>}
                {(coupon.activeHourStart && coupon.activeHourEnd) && <span className="badge badge-light">Horario: {coupon.activeHourStart} - {coupon.activeHourEnd}</span>}
                {!!coupon.allowedCategories?.length && <span className="badge badge-light">Categorias: {coupon.allowedCategories.join(", ")}</span>}
                {!!coupon.excludedProductIds?.length && <span className="badge badge-warning">{coupon.excludedProductIds.length} producto(s) excluidos</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AdminPanelModal({
  open,
  onClose,
  adminTab,
  setAdminTab,
  editorMessage,
  editorError,
  adminProductCount,
  adminColorVariantCount,
  adminPhotoCount,
  adminOutOfStockCount,
  adminLowStockCount,
  adminPendingOrders,
  adminRegisteredUsers,
  adminOrdersToday,
  adminRevenueTotal,
  adminAverageOrderTotal,
  adminCatalogQuery,
  setAdminCatalogQuery,
  onSaveOffers,
  offersSaving,
  adminCatalogProducts,
  products,
  startEditingProduct,
  handleDeleteProduct,
  bulkDeleteCatalogProducts,
  bulkSetCatalogFeatured,
  toggleProductPublicVisibility,
  productForm,
  resetEditor,
  handleProductFieldChange,
  setContactDraft,
  contactDraft,
  saveContactConfiguration,
  contactSyncFeedback,
  addColorVariant,
  handleColorFieldChange,
  removeColorVariant,
  handleColorFilesUpload,
  addImageField,
  handleColorImageChange,
  removeImageField,
  saveProduct,
  setStoreDraft,
  storeDraft,
  handleStoreSlideImageUpload,
  saveStoreConfiguration,
  addHeroSlide,
  removeHeroSlide,
  previewColor,
  setPreviewColor,
  previewImageIndex,
  setPreviewImageIndex,
  filteredOrderHistory,
  orderSearch,
  setOrderSearch,
  orderStatusFilter,
  setOrderStatusFilter,
  orderDeliveryFilter,
  setOrderDeliveryFilter,
  orderDateFilter,
  setOrderDateFilter,
  orderCustomerFilter,
  setOrderCustomerFilter,
  clearAdminOrderFilters,
  adminOrderCustomerOptions,
  updateOrderStatus,
  updateOrderGuide,
  updateOrderPaymentProof,
  clearOrderPaymentProof,
  handleOrderProofUpload,
  deleteOrder,
  onOpenOrderReference,
  onCopyOrderCode,
  liveOrdersEnabled,
  setLiveOrdersEnabled,
  liveOrdersRefreshing,
  liveOrdersUpdatedAt,
  orderLiveAlert,
  clearOrderLiveAlert,
  refreshOrdersFromServer,
  productTypeOptions,
  customProductTypeInput,
  setCustomProductTypeInput,
  addManagedProductType,
  filterTagOptions,
  customFilterTagInput,
  setCustomFilterTagInput,
  addManagedFilterTag,
  appendFilterTagToForm,
  removeFilterTagFromForm,
  addSizeRow,
  handleSizeRowChange,
  removeSizeRow,
  productTypeRecords,
  filterTagRecords,
  handleManagedProductTypeDraftChange,
  saveManagedProductType,
  deleteManagedProductType,
  toggleManagedProductTypeActive,
  handleManagedFilterTagDraftChange,
  saveManagedFilterTag,
  deleteManagedFilterTag,
  toggleManagedFilterTagActive,
  coupons,
  couponDraft,
  couponEditorMessage,
  couponEditorError,
  handleCouponDraftFieldChange,
  toggleCouponDraftProduct,
  toggleCouponDraftProductType,
  saveCoupon,
  resetCouponDraft,
  startEditingCoupon,
  toggleCouponActive,
  deleteCoupon,
  securityMetrics,
  securityMetricsBusy,
  securityMetricsResetBusy,
  securityMetricsError,
  securityMetricsUpdatedAt,
  refreshSecurityMetrics,
  resetSecurityMetricsData,
  adminUsers,
  adminUsersBusy,
  adminUsersError,
  adminUsersSearch,
  setAdminUsersSearch,
  refreshAdminUsers,
  saveAdminUser,
  removeAdminUser,
  sendAdminUserResetLink,
  copyAdminUserResetLink,
}) {
  const [offerDraftById, setOfferDraftById] = useState({});
  const [offerDirtyById, setOfferDirtyById] = useState({});
  const [editingUserId, setEditingUserId] = useState("");
  const [adminUserDraft, setAdminUserDraft] = useState({
    name: "",
    lastName: "",
    email: "",
    username: "",
    phone: "",
    shippingAddress: "",
  });
  const [adminUserSaveBusy, setAdminUserSaveBusy] = useState(false);
  const [adminUserDeleteBusyId, setAdminUserDeleteBusyId] = useState("");
  const [adminUserResetBusyId, setAdminUserResetBusyId] = useState("");
  const [adminUserCopyResetBusyId, setAdminUserCopyResetBusyId] = useState("");
  const [selectedCatalogProductIds, setSelectedCatalogProductIds] = useState([]);
  const [catalogBulkBusy, setCatalogBulkBusy] = useState(false);

  const createOfferDraftFromProduct = useCallback((product) => {
    const offerMode = normalizeOfferDiscountMode(product.offerDiscountMode);
    const fallbackOfferValue = product.offerDiscountValue != null
      ? product.offerDiscountValue
      : (offerMode === "amount"
        ? (product.offerExtraAmount != null ? product.offerExtraAmount : 0)
        : (product.offerExtraDiscount != null ? product.offerExtraDiscount : 0));
    return {
      offerEnabled: Boolean(product.offerEnabled),
      offerDiscountMode: offerMode,
      offerDiscountValue: String(fallbackOfferValue ?? 0),
    };
  }, []);
  const getOfferDraftForProduct = useCallback((product) => {
    const productId = String(product.id);
    return offerDraftById[productId] || createOfferDraftFromProduct(product);
  }, [offerDraftById, createOfferDraftFromProduct]);

  const tabs = [
    { id: "resumen", label: "Resumen" },
    { id: "usuarios", label: "Usuarios" },
    { id: "catalogo", label: "Catálogo" },
    { id: "ofertas", label: "Ofertas" },
    { id: "producto", label: productForm.id ? "Editar producto" : "Nuevo producto" },
    { id: "taxonomias", label: "Tipos y filtros" },
    { id: "cupones", label: "Cupones" },
    { id: "contacto", label: "Contacto" },
    { id: "portada", label: "Portada" },
    { id: "pedidos", label: "Pedidos" },
    { id: "seguridad", label: "Seguridad" },
  ];

  const formTags = splitFilterTagsText(productForm.filterTagsText);
  const normalizedAdminUsersQuery = sanitizeLine(adminUsersSearch || "").toLowerCase();
  const visibleAdminUsers = useMemo(() => {
    if (!normalizedAdminUsersQuery) return adminUsers;
    return adminUsers.filter((user) => {
      const searchText = [
        user.name,
        user.lastName,
        user.email,
        user.username,
        user.phone,
      ].join(" ").toLowerCase();
      return searchText.includes(normalizedAdminUsersQuery);
    });
  }, [adminUsers, normalizedAdminUsersQuery]);
  const visibleCatalogProductIds = useMemo(
    () => adminCatalogProducts.map((product) => String(product.id)),
    [adminCatalogProducts],
  );
  const selectedCatalogSet = useMemo(
    () => new Set(selectedCatalogProductIds.map((entry) => String(entry))),
    [selectedCatalogProductIds],
  );
  const selectedVisibleCatalogCount = useMemo(
    () => visibleCatalogProductIds.filter((id) => selectedCatalogSet.has(id)).length,
    [selectedCatalogSet, visibleCatalogProductIds],
  );
  const allVisibleCatalogSelected = visibleCatalogProductIds.length > 0 && selectedVisibleCatalogCount === visibleCatalogProductIds.length;

  const startEditingUser = (user) => {
    const safeUser = user || {};
    setEditingUserId(String(safeUser.id || ""));
    setAdminUserDraft({
      name: safeUser.name || "",
      lastName: safeUser.lastName || "",
      email: safeUser.email || "",
      username: safeUser.username || "",
      phone: safeUser.phone || "",
      shippingAddress: safeUser.shippingAddress || "",
    });
  };

  const cancelEditingUser = () => {
    setEditingUserId("");
    setAdminUserDraft({
      name: "",
      lastName: "",
      email: "",
      username: "",
      phone: "",
      shippingAddress: "",
    });
  };

  const saveEditingUser = async () => {
    if (!editingUserId || adminUserSaveBusy) return;
    setAdminUserSaveBusy(true);
    const result = await saveAdminUser({
      userId: editingUserId,
      ...adminUserDraft,
    });
    setAdminUserSaveBusy(false);
    if (result?.ok) {
      cancelEditingUser();
    }
  };

  const deleteUserFromAdmin = async (user) => {
    const userId = String(user?.id || "");
    if (!userId || adminUserDeleteBusyId) return;
    const displayName = sanitizeLine([user?.name, user?.lastName].filter(Boolean).join(" ")) || user?.email || "este usuario";
    if (typeof window !== "undefined" && !window.confirm(`Eliminar ${displayName}?`)) return;
    setAdminUserDeleteBusyId(userId);
    await removeAdminUser(userId);
    setAdminUserDeleteBusyId("");
    if (editingUserId === userId) {
      cancelEditingUser();
    }
  };

  const sendResetLinkToUser = async (user) => {
    const userId = String(user?.id || "");
    if (!userId || adminUserResetBusyId) return;
    setAdminUserResetBusyId(userId);
    try {
      await sendAdminUserResetLink({
        userId,
        email: user?.email || "",
      });
    } finally {
      setAdminUserResetBusyId("");
    }
  };

  const copyResetLinkForUser = async (user) => {
    const userId = String(user?.id || "");
    if (!userId || adminUserCopyResetBusyId) return;
    setAdminUserCopyResetBusyId(userId);
    try {
      await copyAdminUserResetLink({
        userId,
        email: user?.email || "",
      });
    } finally {
      setAdminUserCopyResetBusyId("");
    }
  };

  const toggleCatalogSelection = (productId) => {
    const normalizedId = String(productId || "");
    if (!normalizedId) return;
    setSelectedCatalogProductIds((previous) => {
      const set = new Set(previous.map((entry) => String(entry)));
      if (set.has(normalizedId)) {
        set.delete(normalizedId);
      } else {
        set.add(normalizedId);
      }
      return [...set];
    });
  };

  const toggleSelectAllVisibleCatalogProducts = () => {
    if (!visibleCatalogProductIds.length) return;
    setSelectedCatalogProductIds((previous) => {
      const set = new Set(previous.map((entry) => String(entry)));
      if (allVisibleCatalogSelected) {
        visibleCatalogProductIds.forEach((id) => set.delete(id));
      } else {
        visibleCatalogProductIds.forEach((id) => set.add(id));
      }
      return [...set];
    });
  };

  const clearCatalogSelection = () => {
    setSelectedCatalogProductIds([]);
  };

  const runCatalogBulkAction = async (runner, emptyMessage) => {
    const targetIds = [...selectedCatalogSet];
    if (!targetIds.length) {
      if (emptyMessage) {
        window.alert(emptyMessage);
      }
      return;
    }
    if (catalogBulkBusy) return;
    setCatalogBulkBusy(true);
    try {
      const result = await runner(targetIds);
      if (result?.ok) {
        clearCatalogSelection();
      }
    } finally {
      setCatalogBulkBusy(false);
    }
  };

  useEffect(() => {
    setSelectedCatalogProductIds((previous) => previous.filter((id) => visibleCatalogProductIds.includes(String(id))));
  }, [visibleCatalogProductIds]);

  if (!open) return null;

  const offerPendingCount = Object.values(offerDirtyById).filter(Boolean).length;
  const hasPendingOfferChanges = offerPendingCount > 0;
  const activeOfferCount = adminCatalogProducts.reduce((total, product) => {
    const draft = getOfferDraftForProduct(product);
    return total + (draft.offerEnabled ? 1 : 0);
  }, 0);

  const updateOfferDraft = (productId, patch = {}) => {
    const normalizedId = String(productId);
    setOfferDraftById((previous) => {
      const product = products.find((entry) => String(entry.id) === normalizedId);
      const baseDraft = previous[normalizedId]
        || (product ? createOfferDraftFromProduct(product) : {
          offerEnabled: false,
          offerDiscountMode: "percent",
          offerDiscountValue: "0",
        });
      const nextDraft = {
        ...baseDraft,
        ...patch,
      };
      if (patch.offerDiscountMode != null) {
        nextDraft.offerDiscountMode = normalizeOfferDiscountMode(patch.offerDiscountMode);
      }
      if (patch.offerDiscountValue != null) {
        nextDraft.offerDiscountValue = String(patch.offerDiscountValue);
      }
      return {
        ...previous,
        [normalizedId]: nextDraft,
      };
    });
    setOfferDirtyById((previous) => ({
      ...previous,
      [normalizedId]: true,
    }));
  };

  const resetOfferDrafts = () => {
    setOfferDraftById({});
    setOfferDirtyById({});
  };

  const handleSaveOffersDraft = async () => {
    if (!hasPendingOfferChanges || offersSaving || typeof onSaveOffers !== "function") return;
    const payload = {};
    Object.entries(offerDraftById).forEach(([productId, draft]) => {
      if (!offerDirtyById[productId]) return;
      payload[productId] = {
        offerEnabled: Boolean(draft.offerEnabled),
        offerDiscountMode: normalizeOfferDiscountMode(draft.offerDiscountMode),
        offerDiscountValue: draft.offerDiscountValue,
      };
    });
    const result = await onSaveOffers(payload);
    if (result?.ok) {
      setOfferDraftById({});
      setOfferDirtyById({});
    }
  };

  const metricsEndpoints = securityMetrics?.endpoints && typeof securityMetrics.endpoints === "object"
    ? Object.entries(securityMetrics.endpoints)
    : [];
  const securityTotals = metricsEndpoints.reduce((accumulator, [, entry]) => {
    const source = entry || {};
    accumulator.requests += Number(source.requests) || 0;
    accumulator.errors += Number(source.errors) || 0;
    accumulator.rateLimited += Number(source.rateLimited) || 0;
    accumulator.csrfRejected += Number(source.csrfRejected) || 0;
    accumulator.invalidJson += Number(source.invalidJson) || 0;
    accumulator.invalidContentType += Number(source.invalidContentType) || 0;
    accumulator.payloadTooLarge += Number(source.payloadTooLarge) || 0;
    return accumulator;
  }, {
    requests: 0,
    errors: 0,
    rateLimited: 0,
    csrfRejected: 0,
    invalidJson: 0,
    invalidContentType: 0,
    payloadTooLarge: 0,
  });

  return (
    <AnimatePresence>
      <Motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="modal-backdrop" onClick={onClose}>
        <Motion.div initial={{ opacity: 0, y: 24, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 18, scale: 0.98 }} transition={{ duration: ANIMATION.base }} className="admin-modal-shell" onClick={(event) => event.stopPropagation()}>
          <button type="button" className="icon-btn admin-modal-close-top" onClick={onClose} aria-label="Cerrar panel admin">
            <X size={18} />
          </button>
          <div className="admin-sidebar-nav">
            <div>
              <p style={{ margin: 0, textTransform: "uppercase", letterSpacing: ".25em", fontSize: 12, color: "rgba(255,255,255,.65)" }}>Panel admin</p>
              <h3 style={{ margin: "8px 0 0", fontSize: 30 }}>Administración</h3>
              <p style={{ margin: "10px 0 0", color: "rgba(255,255,255,.72)", lineHeight: 1.7 }}>Gestiona catalogo, pedidos, contacto y contenido del local desde un solo lugar.</p>
            </div>
            <div className="grid" style={{ gap: 10 }}>
              {tabs.map((tab) => (
                <button key={tab.id} className={`admin-tab-btn ${adminTab === tab.id ? "active" : ""}`} onClick={() => setAdminTab(tab.id)}>{tab.label}</button>
              ))}
            </div>
            <button className="btn btn-outline" onClick={onClose}><X size={16} />Cerrar panel</button>
          </div>

          <div className="admin-modal-content">
            {(editorMessage || editorError) && (
              <div>
                {editorMessage && <div className="status-message status-success">{editorMessage}</div>}
                {editorError && <div className="status-message status-error" style={{ marginTop: editorMessage ? 10 : 0 }}>{editorError}</div>}
              </div>
            )}

            {adminTab === "resumen" && (
              <div className="admin-tab-panel">
                <div className="card" style={{ padding: 22 }}>
                  <div className="admin-toolbar">
                    <div>
                      <p className="muted" style={{ textTransform: "uppercase", letterSpacing: ".25em", fontSize: 13 }}>Resumen operativo</p>
                      <h4 style={{ margin: "6px 0 0", fontSize: 28 }}>Panel ejecutivo</h4>
                      <p className="helper-text" style={{ marginTop: 8 }}>Inventario, ventas, usuarios y seguridad en una sola vista.</p>
                    </div>
                    <div className="admin-actions">
                      <button className="btn btn-soft" onClick={() => refreshAdminUsers({ force: true, preferCache: false })} disabled={adminUsersBusy}>
                        <RotateCcw size={16} />
                        {adminUsersBusy ? "Usuarios..." : "Usuarios"}
                      </button>
                      <button className="btn btn-soft" onClick={() => refreshSecurityMetrics({ force: true, preferCache: false })} disabled={securityMetricsBusy}>
                        <RotateCcw size={16} />
                        {securityMetricsBusy ? "Seguridad..." : "Seguridad"}
                      </button>
                    </div>
                  </div>

                  <div className="admin-kpi-grid" style={{ marginTop: 18 }}>
                    <div className="admin-kpi-card">
                      <p className="admin-kpi-title">Productos</p>
                      <strong className="admin-kpi-value">{adminProductCount}</strong>
                      <p className="admin-kpi-hint">{adminOutOfStockCount} sin stock · {adminLowStockCount} stock bajo</p>
                    </div>
                    <div className="admin-kpi-card">
                      <p className="admin-kpi-title">Cobertura de catálogo</p>
                      <strong className="admin-kpi-value">{adminColorVariantCount}</strong>
                      <p className="admin-kpi-hint">{adminPhotoCount} fotos cargadas</p>
                    </div>
                    <div className="admin-kpi-card">
                      <p className="admin-kpi-title">Pedidos pendientes</p>
                      <strong className="admin-kpi-value">{adminPendingOrders}</strong>
                      <p className="admin-kpi-hint">{adminOrdersToday} pedidos hoy</p>
                    </div>
                    <div className="admin-kpi-card">
                      <p className="admin-kpi-title">Usuarios registrados</p>
                      <strong className="admin-kpi-value">{adminRegisteredUsers}</strong>
                      <p className="admin-kpi-hint">Gestiona cuentas en la pestaña Usuarios</p>
                    </div>
                    <div className="admin-kpi-card">
                      <p className="admin-kpi-title">Ventas acumuladas</p>
                      <strong className="admin-kpi-value" style={{ fontSize: 20 }}>{currency(adminRevenueTotal)}</strong>
                      <p className="admin-kpi-hint">Ticket promedio: {currency(adminAverageOrderTotal)}</p>
                    </div>
                    <div className="admin-kpi-card">
                      <p className="admin-kpi-title">Eventos de seguridad</p>
                      <strong className="admin-kpi-value">{securityTotals.rateLimited + securityTotals.csrfRejected + securityTotals.errors}</strong>
                      <p className="admin-kpi-hint">Rate-limit + CSRF + errores</p>
                    </div>
                    <div className="admin-kpi-card">
                      <p className="admin-kpi-title">Ultima lectura</p>
                      <strong className="admin-kpi-value" style={{ fontSize: 16 }}>{formatAdminTimestamp(securityMetricsUpdatedAt || securityMetrics?.generatedAt)}</strong>
                      <p className="admin-kpi-hint">Monitoreo en tiempo real</p>
                    </div>
                  </div>

                  <div className="admin-quick-actions" style={{ marginTop: 18 }}>
                    <button className="btn btn-primary" onClick={() => { resetEditor(); setAdminTab("producto"); }}>
                      <Plus size={16} />
                      Nuevo producto
                    </button>
                    <button className="btn btn-outline" onClick={() => setAdminTab("pedidos")}>
                      <Package size={16} />
                      Revisar pedidos
                    </button>
                    <button className="btn btn-outline" onClick={() => setAdminTab("usuarios")}>
                      <UserRound size={16} />
                      Gestionar usuarios
                    </button>
                    <button className="btn btn-outline" onClick={() => setAdminTab("contacto")}>
                      <Navigation size={16} />
                      Editar contacto
                    </button>
                    <button className="btn btn-outline" onClick={() => setAdminTab("seguridad")}>
                      <ShieldCheck size={16} />
                      Ver seguridad
                    </button>
                  </div>
                </div>
              </div>
            )}

            {adminTab === "usuarios" && (
              <div className="admin-tab-panel">
                <div className="card admin-users-card" style={{ padding: 22 }}>
                  <div className="admin-toolbar admin-users-toolbar">
                    <div>
                      <p className="muted" style={{ textTransform: "uppercase", letterSpacing: ".25em", fontSize: 13 }}>Clientes y cuentas</p>
                      <h4 className="admin-users-title" style={{ margin: "6px 0 0", fontSize: 28 }}>Usuarios registrados</h4>
                      <p className="helper-text" style={{ marginTop: 8 }}>Busca por nombre o correo, edita perfil y elimina cuentas.</p>
                    </div>
                    <div className="admin-actions admin-users-top-actions">
                      <span className="badge badge-light">{visibleAdminUsers.length} visibles</span>
                      <button className="btn btn-soft" onClick={() => refreshAdminUsers({ force: true, preferCache: false })} disabled={adminUsersBusy}>
                        <RotateCcw size={16} />
                        {adminUsersBusy ? "Actualizando..." : "Actualizar"}
                      </button>
                    </div>
                  </div>

                  <div className="admin-search-row admin-users-search-row" style={{ marginTop: 14 }}>
                    <Search size={16} />
                    <input
                      className="input"
                      placeholder="Buscar por nombre, correo o usuario"
                      value={adminUsersSearch}
                      onChange={(event) => setAdminUsersSearch(event.target.value)}
                    />
                  </div>

                  {adminUsersError && (
                    <div className="status-message status-error" style={{ marginTop: 12 }}>
                      {adminUsersError}
                    </div>
                  )}

                  <div className="admin-list" style={{ marginTop: 18 }}>
                    {visibleAdminUsers.length === 0 ? (
                      <div className="empty-admin-note">{adminUsersBusy ? "Cargando usuarios..." : "No hay usuarios que coincidan con la búsqueda."}</div>
                    ) : visibleAdminUsers.map((user) => {
                      const userId = String(user.id || "");
                      const isEditing = editingUserId === userId;
                      const isDeleting = adminUserDeleteBusyId === userId;
                      const isResetting = adminUserResetBusyId === userId;
                      const isCopyingReset = adminUserCopyResetBusyId === userId;
                      const canResetPassword = isValidEmail(user.email || "");
                      return (
                        <div key={userId || user.email} className="admin-product-row admin-user-row" style={{ alignItems: "flex-start" }}>
                          <div className="admin-user-avatar" style={{ width: 56, height: 56, borderRadius: 14, background: "rgba(0,0,0,.06)", display: "grid", placeItems: "center", fontWeight: 700 }}>
                            {String((user.name || user.email || "U").trim().charAt(0) || "U").toUpperCase()}
                          </div>
                          <div className="admin-user-main" style={{ width: "100%" }}>
                            {!isEditing && (
                              <div className="stack admin-user-meta" style={{ gap: 6 }}>
                                <h5 className="admin-card-title admin-user-name">{sanitizeLine([user.name, user.lastName].filter(Boolean).join(" ")) || "Sin nombre"}</h5>
                                <p className="muted admin-user-line" style={{ margin: 0 }}>{user.email || "Sin correo"}{user.username ? ` - @${user.username}` : ""}</p>
                                <p className="muted admin-user-line" style={{ margin: 0 }}>{user.phone ? `Tel: ${user.phone}` : "Sin telefono"}{user.shippingAddress ? ` - ${user.shippingAddress}` : ""}</p>
                                <p className="helper-text admin-user-line" style={{ margin: 0 }}>
                                  Actualizado: {formatAdminTimestamp(user.updatedAt || user.createdAt)}
                                </p>
                              </div>
                            )}

                            {isEditing && (
                              <div className="settings-grid admin-user-edit-grid">
                                <input className="input" placeholder="Nombre" value={adminUserDraft.name} onChange={(event) => setAdminUserDraft((previous) => ({ ...previous, name: event.target.value }))} />
                                <input className="input" placeholder="Apellido" value={adminUserDraft.lastName} onChange={(event) => setAdminUserDraft((previous) => ({ ...previous, lastName: event.target.value }))} />
                                <input className="input" placeholder="Correo" value={adminUserDraft.email} onChange={(event) => setAdminUserDraft((previous) => ({ ...previous, email: event.target.value }))} />
                                <input className="input" placeholder="Usuario" value={adminUserDraft.username} onChange={(event) => setAdminUserDraft((previous) => ({ ...previous, username: event.target.value }))} />
                                <input className="input" placeholder="Telefono" value={adminUserDraft.phone} onChange={(event) => setAdminUserDraft((previous) => ({ ...previous, phone: event.target.value }))} />
                                <div className="admin-full">
                                  <textarea className="textarea" placeholder="Direccion de envio" value={adminUserDraft.shippingAddress} onChange={(event) => setAdminUserDraft((previous) => ({ ...previous, shippingAddress: event.target.value }))} />
                                </div>
                              </div>
                            )}
                          </div>
                          <div className="admin-actions admin-user-actions">
                            {!isEditing && (
                              <>
                                <button className="btn btn-soft" onClick={() => startEditingUser(user)}><PencilLine size={16} />Editar</button>
                                <button
                                  className="btn btn-soft"
                                  onClick={() => { void sendResetLinkToUser(user); }}
                                  disabled={!canResetPassword || isResetting || isCopyingReset}
                                  title={canResetPassword ? "Enviar correo de restablecimiento" : "El usuario no tiene un correo valido"}
                                >
                                  <Mail size={16} />
                                  {isResetting ? "Enviando..." : "Enviar reset"}
                                </button>
                                <button
                                  className="btn btn-soft"
                                  onClick={() => { void copyResetLinkForUser(user); }}
                                  disabled={!canResetPassword || isCopyingReset || isResetting}
                                  title={canResetPassword ? "Generar y copiar enlace de restablecimiento" : "El usuario no tiene un correo valido"}
                                >
                                  <Copy size={16} />
                                  {isCopyingReset ? "Copiando..." : "Copiar enlace"}
                                </button>
                                <button className="btn btn-danger" onClick={() => { void deleteUserFromAdmin(user); }} disabled={isDeleting}>
                                  <Trash2 size={16} />
                                  {isDeleting ? "Eliminando..." : "Eliminar"}
                                </button>
                              </>
                            )}
                            {isEditing && (
                              <>
                                <button className="btn btn-primary" onClick={() => { void saveEditingUser(); }} disabled={adminUserSaveBusy}>
                                  <ShieldCheck size={16} />
                                  {adminUserSaveBusy ? "Guardando..." : "Guardar"}
                                </button>
                                <button className="btn btn-outline" onClick={cancelEditingUser}>
                                  <X size={16} />
                                  Cancelar
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {adminTab === "catalogo" && (
              <div className="admin-tab-panel">
                <div className="card" style={{ padding: 22 }}>
                  <div className="admin-toolbar">
                    <div>
                      <p className="muted" style={{ textTransform: "uppercase", letterSpacing: ".25em", fontSize: 13 }}>Catálogo</p>
                      <h4 style={{ margin: "6px 0 0", fontSize: 28 }}>Productos disponibles</h4>
                    </div>
                    <button className="btn btn-primary" onClick={() => { resetEditor(); setAdminTab("producto"); }}><Plus size={16} />Nuevo producto</button>
                  </div>
                  <div className="admin-actions" style={{ marginTop: 12, flexWrap: "wrap" }}>
                    <span className="badge badge-light">{selectedCatalogSet.size} seleccionados</span>
                    <button className="btn btn-soft" type="button" onClick={toggleSelectAllVisibleCatalogProducts}>
                      <CheckCircle2 size={16} />
                      {allVisibleCatalogSelected ? "Quitar visibles" : "Seleccionar visibles"}
                    </button>
                    <button className="btn btn-outline" type="button" onClick={clearCatalogSelection} disabled={!selectedCatalogSet.size}>
                      <X size={16} />
                      Limpiar selección
                    </button>
                    <button
                      className="btn btn-soft"
                      type="button"
                      disabled={catalogBulkBusy || !selectedCatalogSet.size}
                      onClick={() => {
                        void runCatalogBulkAction(
                          (ids) => bulkSetCatalogFeatured(ids, true),
                          "Selecciona al menos un producto para destacar.",
                        );
                      }}
                    >
                      <Star size={16} />
                      Destacar
                    </button>
                    <button
                      className="btn btn-soft"
                      type="button"
                      disabled={catalogBulkBusy || !selectedCatalogSet.size}
                      onClick={() => {
                        void runCatalogBulkAction(
                          (ids) => bulkSetCatalogFeatured(ids, false),
                          "Selecciona al menos un producto para quitar destacado.",
                        );
                      }}
                    >
                      <Star size={16} />
                      Quitar destacado
                    </button>
                    <button
                      className="btn btn-danger"
                      type="button"
                      disabled={catalogBulkBusy || !selectedCatalogSet.size}
                      onClick={() => {
                        if (typeof window !== "undefined" && !window.confirm(`Eliminar ${selectedCatalogSet.size} producto(s) seleccionados?`)) return;
                        void runCatalogBulkAction(
                          (ids) => bulkDeleteCatalogProducts(ids),
                          "Selecciona al menos un producto para eliminar.",
                        );
                      }}
                    >
                      <Trash2 size={16} />
                      {catalogBulkBusy ? "Procesando..." : "Eliminar seleccionados"}
                    </button>
                  </div>
                  <div className="admin-search-row" style={{ marginTop: 14 }}>
                    <Search size={16} />
                    <input
                      className="input"
                      placeholder="Buscar por nombre, categoría, tipo o tag"
                      value={adminCatalogQuery}
                      onChange={(event) => setAdminCatalogQuery(event.target.value)}
                    />
                  </div>
                  <div className="admin-list" style={{ marginTop: 18 }}>
                    {adminCatalogProducts.length === 0 ? (
                      <div className="empty-admin-note">No hay productos que coincidan con la búsqueda actual.</div>
                    ) : adminCatalogProducts.map((product) => (
                      <div key={product.id} className="admin-product-row admin-catalog-row">
                        <label className="admin-catalog-select">
                          <input
                            className="checkbox"
                            type="checkbox"
                            checked={selectedCatalogSet.has(String(product.id))}
                            onChange={() => toggleCatalogSelection(product.id)}
                          />
                        </label>
                        <img src={getCurrentImageForProduct(product, product.colors[0])} alt={product.name} className="admin-product-thumb" loading="lazy" decoding="async" />
                        <div>
                          <p className="muted" style={{ margin: 0, fontSize: 14 }}>{product.category}</p>
                          <h5 className="admin-card-title">{product.name}</h5>
                          <p className="muted" style={{ margin: "6px 0 0", lineHeight: 1.6 }}>{product.colors.length} color{product.colors.length === 1 ? "" : "es"} - {product.sizes.join(", ")}</p>
                          <div className="chip-row" style={{ marginTop: 8 }}>
                            <span className="badge badge-light">{product.productType || "General"}</span>
                            {product.featured ? <span className="badge badge-success">Destacado</span> : null}
                            {product.isPublic === false ? <span className="badge badge-warning">Oculto</span> : <span className="badge badge-light">Publico</span>}
                            {!!product.filterTags?.length && product.filterTags.slice(0, 3).map((tag) => <span key={tag} className="badge badge-light">{tag}</span>)}
                          </div>
                        </div>
                        <div className="admin-actions">
                          <button className="btn btn-outline" type="button" onClick={() => toggleProductPublicVisibility(product.id)}>
                            {product.isPublic === false ? "Publicar" : "Ocultar"}
                          </button>
                          <button className="btn btn-soft" onClick={() => { startEditingProduct(product); setAdminTab("producto"); }}><PencilLine size={16} />Editar</button>
                          <button className="btn btn-danger" onClick={() => handleDeleteProduct(product.id)}><Trash2 size={16} />Eliminar</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {adminTab === "ofertas" && (
              <div className="admin-tab-panel">
                <div className="card" style={{ padding: 22 }}>
                  <div className="admin-toolbar">
                    <div>
                      <p className="muted" style={{ textTransform: "uppercase", letterSpacing: ".25em", fontSize: 13 }}>Ofertas</p>
                      <h4 style={{ margin: "6px 0 0", fontSize: 28 }}>Descuento extra por prenda</h4>
                      <p className="helper-text" style={{ marginTop: 8 }}>
                        Configura descuentos por porcentaje o valor fijo y guarda los cambios para que queden persistidos.
                      </p>
                    </div>
                    <div className="admin-actions">
                      <span className="badge badge-light">{activeOfferCount} en oferta</span>
                      {hasPendingOfferChanges && <span className="badge badge-warning">{offerPendingCount} sin guardar</span>}
                      <button
                        className="btn btn-outline"
                        type="button"
                        onClick={resetOfferDrafts}
                        disabled={!hasPendingOfferChanges || offersSaving}
                      >
                        <RotateCcw size={16} />
                        Restablecer
                      </button>
                      <button
                        className="btn btn-primary"
                        type="button"
                        onClick={() => { void handleSaveOffersDraft(); }}
                        disabled={!hasPendingOfferChanges || offersSaving}
                      >
                        <ShieldCheck size={16} />
                        {offersSaving ? "Guardando..." : "Guardar ofertas"}
                      </button>
                    </div>
                  </div>
                  <div className="admin-search-row" style={{ marginTop: 14 }}>
                    <Search size={16} />
                    <input
                      className="input"
                      placeholder="Buscar producto para oferta"
                      value={adminCatalogQuery}
                      onChange={(event) => setAdminCatalogQuery(event.target.value)}
                    />
                  </div>
                  <div className="admin-list" style={{ marginTop: 18 }}>
                    {adminCatalogProducts.length === 0 ? (
                      <div className="empty-admin-note">No hay productos para mostrar con esa búsqueda.</div>
                    ) : adminCatalogProducts.map((product) => {
                      const productId = String(product.id);
                      const draft = getOfferDraftForProduct(product);
                      const basePrice = Math.max(0, Number(product.basePrice != null ? product.basePrice : product.price) || 0);
                      const offerMode = normalizeOfferDiscountMode(draft.offerDiscountMode);
                      const resolvedOffer = resolveOfferDiscount(basePrice, offerMode, draft.offerDiscountValue);
                      const offerPercent = Math.round(resolvedOffer.percent);
                      const offerEnabled = Boolean(draft.offerEnabled);
                      const finalOfferPrice = offerEnabled ? computeOfferPrice(basePrice, resolvedOffer.percent) : basePrice;

                      return (
                        <div key={`offer-${product.id}`} className="admin-product-row offer-admin-row">
                          <img src={getCurrentImageForProduct(product, product.colors[0])} alt={product.name} className="admin-product-thumb" loading="lazy" decoding="async" />
                          <div>
                            <p className="muted" style={{ margin: 0, fontSize: 14 }}>{product.category}</p>
                            <h5 className="admin-card-title">{product.name}</h5>
                            <div className="offer-admin-summary">
                              <span>Base: <strong>{currency(basePrice)}</strong></span>
                              <span className={`offer-admin-final ${offerEnabled ? "active" : ""}`}>
                                Final: <strong>{currency(finalOfferPrice)}</strong>
                              </span>
                              {offerEnabled && offerPercent > 0 && <span className="offer-admin-percent">-{offerPercent}%</span>}
                              {offerDirtyById[productId] && <span className="badge badge-warning">Pendiente</span>}
                            </div>
                          </div>
                          <div className="offer-admin-controls">
                            <label className="offer-admin-toggle">
                              <input
                                className="checkbox"
                                type="checkbox"
                                checked={offerEnabled}
                                onChange={(event) => updateOfferDraft(product.id, { offerEnabled: event.target.checked })}
                              />
                              Activar
                            </label>
                            <select
                              className="select"
                              value={offerMode}
                              onChange={(event) => updateOfferDraft(product.id, { offerDiscountMode: event.target.value })}
                              disabled={!offerEnabled}
                            >
                              <option value="percent">%</option>
                              <option value="amount">$</option>
                            </select>
                            <input
                              className="input"
                              type="text"
                              inputMode="decimal"
                              value={String(draft.offerDiscountValue != null ? draft.offerDiscountValue : 0)}
                              placeholder={offerMode === "amount" ? "Valor $" : "Porcentaje"}
                              disabled={!offerEnabled}
                              onChange={(event) => updateOfferDraft(product.id, { offerDiscountValue: event.target.value })}
                            />
                            <button className="btn btn-soft offer-admin-edit-btn" type="button" onClick={() => { startEditingProduct(product); setAdminTab("producto"); }}>
                              <PencilLine size={14} />
                              Editar
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {adminTab === "producto" && (
              <div className="admin-layout" style={{ gridTemplateColumns: "minmax(0, 1.1fr) minmax(320px, .9fr)" }}>
                <div className="admin-tab-panel" id="admin-editor">
                  <div className="card" style={{ padding: 22 }}>
                    <div className="admin-toolbar">
                      <div>
                        <p className="muted" style={{ textTransform: "uppercase", letterSpacing: ".25em", fontSize: 13 }}>{productForm.id ? "Edicion" : "Alta"}</p>
                        <h4 style={{ margin: "6px 0 0", fontSize: 28 }}>{productForm.id ? "Editar producto" : "Agregar producto"}</h4>
                      </div>
                      {productForm.id && (<button className="btn btn-outline" onClick={resetEditor}><X size={16} />Cancelar edicion</button>)}
                    </div>
                    <div className="admin-grid" style={{ marginTop: 18 }}>
                      <input className="input" placeholder="Nombre del producto" value={productForm.name} onChange={(event) => handleProductFieldChange("name", event.target.value)} />
                      <input className="input" placeholder="Categoria" value={productForm.category} onChange={(event) => handleProductFieldChange("category", event.target.value)} />

                      <div className="admin-full surface">
                        <div style={{ display: "grid", gap: 12 }}>
                          <div>
                            <p style={{ margin: 0, fontWeight: 600 }}>Tipo de producto</p>
                            <p className="helper-text">Ahora tambien puedes editarlo o eliminarlo desde la pestana "Tipos y filtros".</p>
                          </div>
                          <select className="select" value={productForm.productType} onChange={(event) => handleProductFieldChange("productType", event.target.value)}>
                            {productTypeOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                          </select>
                          <div className="chip-row">
                            {productTypeOptions.map((item) => (
                              <button key={item} type="button" className={`chip ${productForm.productType === item ? "active" : ""}`} onClick={() => handleProductFieldChange("productType", item)}>{item}</button>
                            ))}
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10 }}>
                            <input className="input" placeholder="Agregar nuevo tipo" value={customProductTypeInput} onChange={(event) => setCustomProductTypeInput(event.target.value)} />
                            <button type="button" className="btn btn-outline" onClick={addManagedProductType}><Plus size={16} />Agregar</button>
                          </div>
                        </div>
                      </div>

                      <input className="input" type="number" placeholder="Precio actual" value={productForm.price} onChange={(event) => handleProductFieldChange("price", event.target.value)} />
                      <input className="input" type="number" placeholder="Precio anterior" value={productForm.oldPrice} onChange={(event) => handleProductFieldChange("oldPrice", event.target.value)} />
                      <input className="input" type="number" min="0" max="5" step="0.1" placeholder="Rating" value={productForm.rating} onChange={(event) => handleProductFieldChange("rating", event.target.value)} />
                      <div className="admin-full"><textarea className="textarea" placeholder="Descripcion" value={productForm.description} onChange={(event) => handleProductFieldChange("description", event.target.value)} /></div>

                      <div className="admin-full surface">
                        <div style={{ display: "grid", gap: 12 }}>
                          <div>
                            <p style={{ margin: 0, fontWeight: 600 }}>Filtros / tags del producto</p>
                            <p className="helper-text">Puedes crearlos aqui rapidamente y luego editarlos o depurarlos en la pestana "Tipos y filtros".</p>
                          </div>
                          {!!formTags.length && (
                            <div className="chip-row">
                              {formTags.map((tag) => (
                                <button key={tag} type="button" className="badge badge-light" style={{ border: 0, cursor: "pointer" }} onClick={() => removeFilterTagFromForm(tag)}>
                                  {tag}
                                  <X size={12} />
                                </button>
                              ))}
                            </div>
                          )}
                          <div className="chip-row">
                              {filterTagOptions.map((tag) => (
                                <button key={tag} type="button" className={`chip ${formTags.includes(tag) ? "active" : ""}`} onClick={() => appendFilterTagToForm(tag)}>{tag}</button>
                              ))}
                            </div>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10 }}>
                            <input className="input" placeholder="Agregar nuevo filtro" value={customFilterTagInput} onChange={(event) => setCustomFilterTagInput(event.target.value)} />
                            <button type="button" className="btn btn-outline" onClick={addManagedFilterTag}><Plus size={16} />Agregar</button>
                          </div>
                        </div>
                      </div>
                    

                      <div className="admin-full surface">
                        <div style={{ display: "grid", gap: 12 }}>
                          <div className="chip-row" style={{ justifyContent: "space-between" }}>
                            <label style={{ display: "inline-flex", alignItems: "center", gap: 10, fontWeight: 600 }}><input className="checkbox" type="checkbox" checked={productForm.featured} onChange={(event) => handleProductFieldChange("featured", event.target.checked)} />Marcar como destacado</label>
                            <label style={{ display: "inline-flex", alignItems: "center", gap: 10, fontWeight: 600 }}><input className="checkbox" type="checkbox" checked={productForm.newArrival} onChange={(event) => handleProductFieldChange("newArrival", event.target.checked)} />Mostrar como nuevo</label>
                          </div>
                          <label style={{ display: "inline-flex", alignItems: "center", gap: 10, fontWeight: 600 }}>
                            <input
                              className="checkbox"
                              type="checkbox"
                              checked={Boolean(productForm.isPublic)}
                              onChange={(event) => handleProductFieldChange("isPublic", event.target.checked)}
                            />
                            Visible al publico
                          </label>
                          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 140px 140px", gap: 10, alignItems: "end" }}>
                            <label style={{ display: "inline-flex", alignItems: "center", gap: 10, fontWeight: 600 }}>
                              <input
                                className="checkbox"
                                type="checkbox"
                                checked={Boolean(productForm.offerEnabled)}
                                onChange={(event) => handleProductFieldChange("offerEnabled", event.target.checked)}
                              />
                              Incluir en pestana de ofertas
                            </label>
                            <select
                              className="select"
                              value={productForm.offerDiscountMode || "percent"}
                              onChange={(event) => handleProductFieldChange("offerDiscountMode", event.target.value)}
                              disabled={!productForm.offerEnabled}
                            >
                              <option value="percent">Extra %</option>
                              <option value="amount">Extra $</option>
                            </select>
                            <input
                              className="input"
                              type="text"
                              inputMode="decimal"
                              placeholder={productForm.offerDiscountMode === "amount" ? "Valor $" : "Porcentaje"}
                              value={productForm.offerDiscountValue}
                              onChange={(event) => handleProductFieldChange("offerDiscountValue", event.target.value)}
                              disabled={!productForm.offerEnabled}
                            />
                          </div>
                          <p className="helper-text">Activalo para mostrar esta prenda en la tienda y aplicar descuento extra por porcentaje o valor fijo.</p>
                        </div>
                      </div>

                      <div className="admin-full">
                        <div className="admin-toolbar" style={{ marginBottom: 14 }}>
                          <div>
                            <h5 style={{ margin: 0, fontSize: 20 }}>Variantes por color + talla</h5>
                            <p className="helper-text">Cada color tiene su propia galeria y stock por talla.</p>
                          </div>
                          <button className="btn btn-soft" type="button" onClick={addColorVariant}><Plus size={16} />Agregar color</button>
                        </div>
                        <div className="grid" style={{ gap: 14 }}>
                          {productForm.colorsData.map((color) => (
                            <div key={color.uid} className="variant-card">
                              <div className="variant-header">
                                <input className="input" style={{ flex: 1 }} placeholder="Nombre del color" value={color.name} onChange={(event) => handleColorFieldChange(color.uid, "name", event.target.value)} />
                                <button className="btn btn-outline" style={{ padding: "12px 16px" }} type="button" onClick={() => removeColorVariant(color.uid)} disabled={productForm.colorsData.length === 1}><Trash2 size={16} />Quitar color</button>
                              </div>

                              <div className="upload-box">
                                <div className="admin-toolbar">
                                  <div>
                                    <p style={{ margin: 0, fontWeight: 600 }}>Fotos de {color.name || "este color"}</p>
                                    <p className="helper-text">Puedes pegar URLs, subir varias imágenes y eliminar las que no quieras conservar.</p>
                                  </div>
                                  <div className="admin-actions">
                                    <button className="btn btn-soft" type="button" onClick={() => addImageField(color.uid)}><Plus size={16} />Agregar campo</button>
                                    <label className="btn btn-outline" style={{ cursor: "pointer" }}><Plus size={16} />Subir fotos<input type="file" accept="image/*" multiple style={{ display: "none" }} onChange={(event) => handleColorFilesUpload(color.uid, event)} /></label>
                                  </div>
                                </div>
                              </div>

                              <div className="image-row">
                                {color.images.map((image, imageIndex) => (
                                  <div key={`${color.uid}-${imageIndex}`} className="image-editor">
                                    <input className="input" placeholder={`URL de imagen ${imageIndex + 1}`} value={image} onChange={(event) => handleColorImageChange(color.uid, imageIndex, event.target.value)} />
                                    <button className="btn btn-outline" type="button" onClick={() => removeImageField(color.uid, imageIndex)}><Trash2 size={16} />Quitar</button>
                                  </div>
                                ))}
                                {!!color.images.filter(Boolean).length && (
                                  <div className="mini-thumb-row">
                                    {color.images.filter(Boolean).map((image, index) => <img key={`${color.uid}-thumb-${index}`} src={image} alt={`${color.name || "color"} ${index + 1}`} className="mini-thumb" loading="lazy" decoding="async" />)}
                                  </div>
                                )}
                              </div>

                              <div className="surface">
                                <div className="admin-toolbar" style={{ marginBottom: 12 }}>
                                  <div>
                                    <p style={{ margin: 0, fontWeight: 600 }}>Tallas de {color.name || "este color"}</p>
                                    <p className="helper-text">Edita cada combinacin color+talla con su stock exacto.</p>
                                  </div>
                                  <button type="button" className="btn btn-soft" onClick={() => addSizeRow(color.uid)}><Plus size={16} />Agregar talla</button>
                                </div>
                                <div className="stack">
                                  {(color.sizes || []).map((sizeRow) => (
                                    <div key={sizeRow.uid} className="variant-size-row">
                                      <input className="input" placeholder="Talla" value={sizeRow.size} onChange={(event) => handleSizeRowChange(color.uid, sizeRow.uid, "size", event.target.value)} />
                                      <input className="input" type="number" min="0" placeholder="Stock" value={sizeRow.stock} onChange={(event) => handleSizeRowChange(color.uid, sizeRow.uid, "stock", event.target.value)} />
                                      <button type="button" className="btn btn-outline" onClick={() => removeSizeRow(color.uid, sizeRow.uid)}><Trash2 size={16} />Quitar</button>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    

                    <div className="product-editor-footer">
                      <button className="btn btn-primary" type="button" onClick={saveProduct}><ShieldCheck size={16} />Guardar producto</button>
                      <button className="btn btn-outline" type="button" onClick={resetEditor}>Restablecer datos</button>
                    </div>
                  </div>
                </div>
                </div>

                <ProductDraftPreview
                  form={productForm}
                  activeColor={previewColor}
                  setActiveColor={setPreviewColor}
                  imageIndex={previewImageIndex}
                  setImageIndex={setPreviewImageIndex}
                />
              </div>
            )}

            {adminTab === "taxonomias" && (
              <div className="admin-tab-panel entity-columns">
                <ManagedEntitiesEditor
                  title="Tipos de producto"
                  description="Edita, ocualta o elimina tipos sin romper productos asociados. Si un tipo esta en uso, puedes reasignar sus productos antes de borrarlo."
                  icon={Tag}
                  records={productTypeRecords}
                  products={products}
                  entityType="productType"
                  addInput={customProductTypeInput}
                  setAddInput={setCustomProductTypeInput}
                  onAdd={addManagedProductType}
                  onDraftChange={handleManagedProductTypeDraftChange}
                  onSave={saveManagedProductType}
                  onDelete={deleteManagedProductType}
                  onToggleActive={toggleManagedProductTypeActive}
                />
                <ManagedEntitiesEditor
                  title="Filtros y tags"
                  description="Administra nombres, slug y visibilidad de los filtros. Al eliminar uno puedes reemplazarlo o quitarlo de los productos relacionados."
                  icon={Tags}
                  records={filterTagRecords}
                  products={products}
                  entityType="filterTag"
                  addInput={customFilterTagInput}
                  setAddInput={setCustomFilterTagInput}
                  onAdd={addManagedFilterTag}
                  onDraftChange={handleManagedFilterTagDraftChange}
                  onSave={saveManagedFilterTag}
                  onDelete={deleteManagedFilterTag}
                  onToggleActive={toggleManagedFilterTagActive}
                />
              </div>
            )}

            {adminTab === "cupones" && (
              <CouponManagerPanel
                coupons={coupons}
                couponDraft={couponDraft}
                couponEditorMessage={couponEditorMessage}
                couponEditorError={couponEditorError}
                products={products}
                productTypeOptions={productTypeOptions}
                onCouponDraftFieldChange={handleCouponDraftFieldChange}
                onToggleCouponDraftProduct={toggleCouponDraftProduct}
                onToggleCouponDraftProductType={toggleCouponDraftProductType}
                onSaveCoupon={saveCoupon}
                onResetCouponDraft={resetCouponDraft}
                onEditCoupon={startEditingCoupon}
                onToggleCouponActive={toggleCouponActive}
                onDeleteCoupon={deleteCoupon}
              />
            )}

            {adminTab === "contacto" && (
              <div className="admin-tab-panel">
                <div className="card" style={{ padding: 22 }}>
                  <div className="admin-toolbar">
                    <div>
                      <p className="muted" style={{ textTransform: "uppercase", letterSpacing: ".25em", fontSize: 13 }}>Configuracin de contacto</p>
                      <h4 style={{ margin: "6px 0 0", fontSize: 28 }}>WhatsApp, direccion y redes</h4>
                    </div>
                  </div>
                  <div className="settings-grid" style={{ marginTop: 18 }}>
                    <div className="admin-full"><input className="input" placeholder="Direccion del local" value={contactDraft.address} onChange={(event) => setContactDraft((previous) => ({ ...previous, address: event.target.value }))} /></div>
                    <input className="input" placeholder="Numero de WhatsApp para pedidos" value={contactDraft.whatsappNumber} onChange={(event) => setContactDraft((previous) => ({ ...previous, whatsappNumber: event.target.value }))} />
                    <input className="input" placeholder="Enlace directo de WhatsApp (opcional)" value={contactDraft.whatsappLink} onChange={(event) => setContactDraft((previous) => ({ ...previous, whatsappLink: event.target.value }))} />
                    <input className="input" placeholder="Telefono de contacto (opcional)" value={contactDraft.phone || ""} onChange={(event) => setContactDraft((previous) => ({ ...previous, phone: event.target.value }))} />
                    <input className="input" placeholder="Correo de contacto (opcional)" value={contactDraft.email || ""} onChange={(event) => setContactDraft((previous) => ({ ...previous, email: event.target.value }))} />
                    <input className="input" placeholder="Enlace de Google Maps" value={contactDraft.mapsLink || ""} onChange={(event) => setContactDraft((previous) => ({ ...previous, mapsLink: event.target.value }))} />
                    <div className="admin-full">
                      <textarea
                        className="textarea"
                        placeholder="Texto breve debajo de la ubicacion (como llegar)"
                        value={contactDraft.locationNote || ""}
                        onChange={(event) => setContactDraft((previous) => ({ ...previous, locationNote: event.target.value }))}
                      />
                    </div>
                    <div className="admin-full">
                      <input
                        className="input"
                        placeholder="Titulo del bloque de contacto visible en la web"
                        value={storeDraft.footerTitle || ""}
                        onChange={(event) => setStoreDraft((previous) => ({ ...previous, footerTitle: event.target.value }))}
                      />
                    </div>
                    <div className="admin-full">
                      <textarea
                        className="textarea"
                        placeholder="Texto del bloque de contacto visible en la web"
                        value={storeDraft.footerText || ""}
                        onChange={(event) => setStoreDraft((previous) => ({ ...previous, footerText: event.target.value }))}
                      />
                    </div>
                    <input className="input" placeholder="Enlace de Instagram" value={contactDraft.instagram} onChange={(event) => setContactDraft((previous) => ({ ...previous, instagram: event.target.value }))} />
                    <input className="input" placeholder="Enlace de Facebook" value={contactDraft.facebook} onChange={(event) => setContactDraft((previous) => ({ ...previous, facebook: event.target.value }))} />
                    <input className="input" placeholder="Enlace de TikTok" value={contactDraft.tiktok} onChange={(event) => setContactDraft((previous) => ({ ...previous, tiktok: event.target.value }))} />
                    <div className="admin-full">
                      <button className="btn btn-primary" onClick={saveContactConfiguration}>
                        <ShieldCheck size={16} />
                        Guardar contacto y redes
                      </button>
                    </div>
                    {contactSyncFeedback?.message && (
                      <div className="admin-full">
                        <div className={`status-message ${contactSyncFeedback.tone === "success" ? "status-success" : (contactSyncFeedback.tone === "error" ? "status-error" : "status-warning")}`}>
                          {contactSyncFeedback.message}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {adminTab === "portada" && (
              <div className="admin-tab-panel">
                <div className="card" style={{ padding: 22 }}>
                  <div className="admin-toolbar">
                    <div>
                      <p className="muted" style={{ textTransform: "uppercase", letterSpacing: ".25em", fontSize: 13 }}>Branding y portada</p>
                      <h4 style={{ margin: "6px 0 0", fontSize: 28 }}>Hero y slides restaurados</h4>
                      <p className="muted" style={{ marginBottom: 0, lineHeight: 1.8 }}>Configura titulo, subtitulo y destino de cada slide. Tambien puedes ajustar etiqueta y porcentaje del bloque de ofertas del catalogo.</p>
                    </div>
                  </div>

                  <div className="settings-grid" style={{ marginTop: 18 }}>
                    <input className="input" placeholder="Etiqueta de marca" value={storeDraft.brandLabel} onChange={(event) => setStoreDraft((previous) => ({ ...previous, brandLabel: event.target.value }))} />
                    <input className="input" placeholder="Nombre de marca" value={storeDraft.brandName} onChange={(event) => setStoreDraft((previous) => ({ ...previous, brandName: event.target.value }))} />
                    <input className="input" placeholder="Badge principal del hero" value={storeDraft.heroBadgeText || ""} onChange={(event) => setStoreDraft((previous) => ({ ...previous, heroBadgeText: event.target.value }))} />
                    <input className="input" placeholder="Texto CTA principal" value={storeDraft.primaryCtaText || ""} onChange={(event) => setStoreDraft((previous) => ({ ...previous, primaryCtaText: event.target.value }))} />
                    <input className="input" placeholder="Etiqueta de ofertas (ej: Ofertas)" value={storeDraft.offerLabel || ""} onChange={(event) => setStoreDraft((previous) => ({ ...previous, offerLabel: event.target.value }))} />
                    <input className="input" placeholder="Porcentaje de oferta (ej: 30)" value={storeDraft.offerPercentage ?? ""} onChange={(event) => setStoreDraft((previous) => ({ ...previous, offerPercentage: event.target.value }))} />
                    <div className="admin-full"><input className="input" placeholder="Texto breve de oferta (opcional)" value={storeDraft.offerText || ""} onChange={(event) => setStoreDraft((previous) => ({ ...previous, offerText: event.target.value }))} /></div>
                    <input className="input" placeholder="Titulo del bloque de WhatsApp" value={storeDraft.saleTitle} onChange={(event) => setStoreDraft((previous) => ({ ...previous, saleTitle: event.target.value }))} />
                    <div className="admin-full"><textarea className="textarea" placeholder="Descripcion del bloque de WhatsApp" value={storeDraft.saleDescription} onChange={(event) => setStoreDraft((previous) => ({ ...previous, saleDescription: event.target.value }))} /></div>
                    <input className="input" placeholder="Titulo del footer" value={storeDraft.footerTitle} onChange={(event) => setStoreDraft((previous) => ({ ...previous, footerTitle: event.target.value }))} />
                    <input className="input" placeholder="Texto del footer" value={storeDraft.footerText} onChange={(event) => setStoreDraft((previous) => ({ ...previous, footerText: event.target.value }))} />

                    <div className="admin-full">
                      <div className="slides-toolbar" style={{ margin: "6px 0 12px" }}>
                        <h5 style={{ margin: 0, fontSize: 20 }}>Slides del hero</h5>
                        <button className="btn btn-soft" onClick={addHeroSlide}><Plus size={16} />Agregar slide</button>
                      </div>
                      <div className="grid" style={{ gap: 14 }}>
                        {storeDraft.heroSlides.map((slide, index) => (
                          <div key={slide.id} className="slide-card">
                            <div className="admin-toolbar">
                              <strong>Slide {index + 1}</strong>
                              <div className="admin-actions">
                                <label className="btn btn-outline" style={{ cursor: "pointer" }}><Plus size={16} />Subir imagen<input type="file" accept="image/*" style={{ display: "none" }} onChange={(event) => handleStoreSlideImageUpload(slide.id, event)} /></label>
                                <button className="btn btn-outline" onClick={() => removeHeroSlide(slide.id)} disabled={storeDraft.heroSlides.length === 1}><Trash2 size={16} />Quitar</button>
                              </div>
                            </div>
                            <input className="input" placeholder="Titulo del slide" value={slide.title || ""} onChange={(event) => setStoreDraft((previous) => ({ ...previous, heroSlides: previous.heroSlides.map((entry) => entry.id === slide.id ? { ...entry, title: event.target.value } : entry) }))} />
                            <textarea className="textarea" placeholder="Subtitulo del slide" value={slide.subtitle || ""} onChange={(event) => setStoreDraft((previous) => ({ ...previous, heroSlides: previous.heroSlides.map((entry) => entry.id === slide.id ? { ...entry, subtitle: event.target.value } : entry) }))} />
                            <select className="select" value={slide.linkedProductId || ""} onChange={(event) => setStoreDraft((previous) => ({ ...previous, heroSlides: previous.heroSlides.map((entry) => entry.id === slide.id ? { ...entry, linkedProductId: event.target.value } : entry) }))}>
                              <option value="">Sin producto relacionado</option>
                              {products.map((product) => <option key={product.id} value={String(product.id)}>{product.name}</option>)}
                            </select>
                            <input className="input" placeholder="URL externa opcional (tiene prioridad sobre el producto)" value={slide.targetUrl || ""} onChange={(event) => setStoreDraft((previous) => ({ ...previous, heroSlides: previous.heroSlides.map((entry) => entry.id === slide.id ? { ...entry, targetUrl: event.target.value } : entry) }))} />
                            <input className="input" placeholder="URL de imagen" value={slide.image} onChange={(event) => setStoreDraft((previous) => ({ ...previous, heroSlides: previous.heroSlides.map((entry) => entry.id === slide.id ? { ...entry, image: event.target.value } : entry) }))} />
                            <p className="helper-text">La imagen conserva el clic al producto relacionado o a la URL configurada, pero el slide vuelve a mostrar su texto editorial.</p>
                            {slide.image && <img src={slide.image} alt={slide.title || `Slide ${index + 1}`} className="preview-image" loading="lazy" decoding="async" />}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="admin-full"><button className="btn btn-primary" onClick={saveStoreConfiguration}><ShieldCheck size={16} />Guardar portada y branding</button></div>
                  </div>
                </div>
              </div>
            )}

            {adminTab === "pedidos" && (
              <div className="admin-tab-panel">
                <div className="card" style={{ padding: 22 }}>
                  <div className="admin-toolbar">
                    <div>
                      <p className="muted" style={{ textTransform: "uppercase", letterSpacing: ".25em", fontSize: 13 }}>Seguimiento</p>
                      <h4 style={{ margin: "6px 0 0", fontSize: 28 }}>Pedidos guardados</h4>
                    </div>
                    <div className="admin-actions">
                      <span className="badge badge-light">{filteredOrderHistory.length} registros</span>
                      <span className="badge badge-light">Ultima: {formatAdminTimestamp(liveOrdersUpdatedAt)}</span>
                      <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontWeight: 600 }}>
                        <input
                          className="checkbox"
                          type="checkbox"
                          checked={liveOrdersEnabled}
                          onChange={(event) => setLiveOrdersEnabled(event.target.checked)}
                        />
                        En vivo
                      </label>
                      <button className="btn btn-soft" onClick={() => refreshOrdersFromServer({ force: true, preferCache: false, notifyAdminOnNew: false })} disabled={liveOrdersRefreshing}>
                        <RotateCcw size={16} />
                        {liveOrdersRefreshing ? "Actualizando..." : "Actualizar"}
                      </button>
                    </div>
                  </div>
                  {orderLiveAlert && (
                    <div className="order-live-alert-card">
                      <div>
                        <p className="order-live-alert-kicker">Alerta en vivo</p>
                        <h5 className="order-live-alert-title">
                          {orderLiveAlert.totalNew > 1 ? `${orderLiveAlert.totalNew} pedidos nuevos` : "Nuevo pedido recibido"}
                        </h5>
                        <p className="order-live-alert-copy">
                          {orderLiveAlert.orderCode
                            ? `Pedido ${orderLiveAlert.orderCode} - ${orderLiveAlert.customerName} - ${currency(orderLiveAlert.total)}`
                            : "Hay nuevos pedidos pendientes de revision inmediata."}
                        </p>
                        <p className="helper-text">Detectado: {formatAdminTimestamp(orderLiveAlert.detectedAt || orderLiveAlert.createdAt)}</p>
                      </div>
                      <button className="btn btn-outline" type="button" onClick={clearOrderLiveAlert}>
                        Ocultar alerta
                      </button>
                    </div>
                  )}
                  <div className="stack" style={{ marginTop: 18 }}>
                    <div className="admin-order-filters">
                      <div className="admin-order-filters-grid">
                        <input
                          className="input"
                          placeholder="Buscar por codigo, cliente, correo, telefono o producto"
                          value={orderSearch}
                          onChange={(event) => setOrderSearch(event.target.value)}
                        />
                        <input
                          className="input"
                          list="admin-order-customer-options"
                          placeholder="Filtrar por cliente"
                          value={orderCustomerFilter}
                          onChange={(event) => setOrderCustomerFilter(event.target.value)}
                        />
                        <datalist id="admin-order-customer-options">
                          {adminOrderCustomerOptions.map((label) => (
                            <option key={label} value={label} />
                          ))}
                        </datalist>
                        <select className="select" value={orderStatusFilter} onChange={(event) => setOrderStatusFilter(event.target.value)}>
                          {ADMIN_ORDER_STATUS_FILTERS.map((status) => (
                            <option key={status} value={status}>
                              {status === "all" ? "Todos los estados" : status}
                            </option>
                          ))}
                        </select>
                        <select className="select" value={orderDeliveryFilter} onChange={(event) => setOrderDeliveryFilter(event.target.value)}>
                          {ADMIN_ORDER_DELIVERY_FILTERS.map((deliveryType) => (
                            <option key={deliveryType} value={deliveryType}>
                              {deliveryType === "all"
                                ? "Todas las entregas"
                                : (deliveryType === "delivery" ? "Solo domicilio" : "Solo retiro")}
                            </option>
                          ))}
                        </select>
                        <select className="select" value={orderDateFilter} onChange={(event) => setOrderDateFilter(event.target.value)}>
                          {ADMIN_ORDER_DATE_FILTERS.map((dateFilter) => (
                            <option key={dateFilter} value={dateFilter}>
                              {dateFilter === "all"
                                ? "Todas las fechas"
                                : (dateFilter === "today"
                                  ? "Hoy"
                                  : (dateFilter === "last7" ? "Ultimos 7 dias" : "Ultimos 30 dias"))}
                            </option>
                          ))}
                        </select>
                        <button
                          className="btn btn-outline"
                          type="button"
                          onClick={clearAdminOrderFilters}
                          disabled={orderStatusFilter === "all"
                            && orderDeliveryFilter === "all"
                            && orderDateFilter === "all"
                            && !orderSearch.trim()
                            && !orderCustomerFilter.trim()}
                        >
                          Limpiar filtros
                        </button>
                      </div>
                    </div>
                    <div className="admin-list">
                      {filteredOrderHistory.length === 0 ? (
                        <div className="empty-admin-note">No hay pedidos que coincidan con la busqueda.</div>
                      ) : filteredOrderHistory.map((order) => {
                        const orderSla = getOrderSlaMeta(order);
                        const normalizedOrderStatus = normalizeOrderStatusForOrder(order.status, order.deliveryType);
                        const isPickupOrder = order.deliveryType === "pickup";
                        const isDeliveryOrder = order.deliveryType === "delivery";
                        const isCancelledOrder = normalizedOrderStatus === "Cancelado";
                        const orderStatusOptions = getOrderStatusOptions(order.deliveryType);
                        const canMarkPickupReady = isPickupOrder && ["Pendiente", "Confirmado", "Preparando"].includes(normalizedOrderStatus);
                        const canConfirmPickup = isPickupOrder && normalizedOrderStatus === "Listo para retiro";
                        const stockReservationState = order?.stockReservation?.state === "released" ? "released" : "reserved";
                        const deliveryContactName = order.deliveryFullName || order.customerName || "Cliente";
                        const deliveryPhone = order.deliveryPhone || order.customerPhone || "";
                        return (
                        <div key={order.id} className="cart-item admin-order-card">
                          <div className="admin-toolbar admin-order-header">
                            <div className="admin-order-main">
                              <div className="order-code-row">
                                <p className="admin-order-code">{order.code}</p>
                                <button type="button" className="btn btn-outline order-copy-btn" onClick={() => onCopyOrderCode(order.code)}>
                                  <Copy size={13} />
                                  Copiar
                                </button>
                              </div>
                              <p className="muted" style={{ margin: "6px 0 0", fontSize: 13 }}>{formatOrderDate(order.createdAt)} - {order.itemCount} item(s)</p>
                              <p className="muted" style={{ margin: "6px 0 0", fontSize: 13 }}>{order.customerName || "Cliente"}{order.customerEmail ? ` - ${order.customerEmail}` : ""}</p>
                              <p className="muted" style={{ margin: "6px 0 0", fontSize: 13 }}>
                                Entrega: {order.deliveryLabel || (isDeliveryOrder ? "Envio a domicilio" : "Retiro en local")}
                              </p>
                              <div className="chip-row" style={{ marginTop: 8 }}>
                                <span className={`badge ${orderSla.tone === "danger" ? "badge-danger" : (orderSla.tone === "warning" ? "badge-warning" : (orderSla.tone === "success" ? "badge-success" : "badge-light"))}`}>
                                  {orderSla.label}
                                </span>
                                <span className="badge badge-light">{orderSla.ageMinutes} min</span>
                                <span className={`badge ${stockReservationState === "released" ? "badge-warning" : "badge-light"}`}>
                                  Stock: {stockReservationState === "released" ? "Liberado" : "Reservado"}
                                </span>
                              </div>
                            </div>
                            <div className="admin-order-summary">
                              <button className="btn btn-outline admin-order-reference-btn" onClick={() => onOpenOrderReference(order)}>
                                Referencia visual
                              </button>
                              <p style={{ margin: 0, fontWeight: 700 }}>{currency(order.total || order.subtotal)}</p>
                            </div>
                          </div>
                          {(order.discountAmount > 0 || order.couponCode) && (
                            <div className="order-money-block">
                              <div>
                                <span className="muted">Subtotal</span>
                                <strong>{currency(order.subtotal)}</strong>
                              </div>
                              <div>
                                <span className="muted">Descuento</span>
                                <strong>-{currency(order.discountAmount || 0)}</strong>
                              </div>
                              <div>
                                <span className="muted">Total</span>
                                <strong>{currency(order.total || order.subtotal)}</strong>
                              </div>
                            </div>
                          )}
                          {order.couponCode && <span className="badge badge-light">Cupon: {order.couponCode}</span>}

                          <OrderStatusProgress status={order.status} deliveryType={order.deliveryType} />
                          {isCancelledOrder && (
                            <div className={`order-stock-sync-note ${stockReservationState === "released" ? "is-ok" : "is-warning"}`}>
                              {stockReservationState === "released"
                                ? "Stock reintegrado correctamente para este pedido cancelado."
                                : "Pedido cancelado con stock pendiente de reintegro. Revisa inventario."}
                            </div>
                          )}

                          {isDeliveryOrder ? (
                            <div className="admin-delivery-highlight">
                              <div className="admin-delivery-highlight-head">
                                <span className="badge badge-warning">Envio a domicilio</span>
                                <strong>{order.deliveryCity || "Ciudad no definida"}</strong>
                              </div>
                              <p className="admin-delivery-address">{order.deliveryAddress || "Direccion no registrada"}</p>
                              <div className="admin-delivery-grid">
                                <p>
                                  <span>Referencia</span>
                                  <strong>{order.deliveryReference || "Sin referencia"}</strong>
                                </p>
                                <p>
                                  <span>Cliente</span>
                                  <strong>{deliveryContactName}</strong>
                                </p>
                                <p>
                                  <span>Telefono</span>
                                  <strong>{deliveryPhone || "Sin telefono"}</strong>
                                </p>
                              </div>
                            </div>
                          ) : (
                            <div className="admin-pickup-summary">
                              <strong>Retiro en local</strong>
                              <p>{order.pickupAddress || "Sin direccion de retiro registrada"}</p>
                              {order.pickupNote && <p className="muted">Referencia: {order.pickupNote}</p>}
                            </div>
                          )}

                          {isPickupOrder && (
                            <div className="pickup-order-panel">
                              <div>
                                <p className="pickup-order-panel-title">Retiro en local</p>
                                <p className="pickup-order-panel-text">
                                  {normalizedOrderStatus === "Entregado"
                                    ? "Entrega confirmada al cliente."
                                    : (normalizedOrderStatus === "Listo para retiro"
                                      ? "Pedido listo para entrega en tienda. Confirma cuando el cliente retire."
                                      : "Cuando este preparado, marca el pedido como listo para retiro para notificar internamente.")}
                                </p>
                              </div>
                              <div className="pickup-order-panel-actions">
                                {canMarkPickupReady && (
                                  <button className="btn btn-soft" onClick={() => updateOrderStatus(order.id, "Listo para retiro")}>
                                    Marcar listo para retiro
                                  </button>
                                )}
                                {canConfirmPickup && (
                                  <button className="btn btn-primary" onClick={() => updateOrderStatus(order.id, "Entregado")}>
                                    Confirmar entrega
                                  </button>
                                )}
                                {!canMarkPickupReady && !canConfirmPickup && (
                                  <span className="badge badge-light">Estado: {normalizedOrderStatus}</span>
                                )}
                              </div>
                            </div>
                          )}

                          <div className="stack admin-order-actions">
                            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 10, alignItems: "center" }}>
                              <select className="select" value={normalizedOrderStatus} onChange={(event) => updateOrderStatus(order.id, event.target.value)}>
                                {orderStatusOptions.map((status) => <option key={status} value={status}>{status}</option>)}
                              </select>
                              <button className="btn btn-danger" onClick={() => deleteOrder(order.id)}><Trash2 size={16} />Borrar</button>
                            </div>
                            <input className="input" placeholder="Guia de envio" value={order.guideNumber || ""} onChange={(event) => updateOrderGuide(order.id, event.target.value)} />
                            <div className="stack surface">
                              <input className="input" placeholder="Comprobante de pago (URL o data URL)" value={order.paymentProof || ""} onChange={(event) => updateOrderPaymentProof(order.id, event.target.value)} />
                              <div className="admin-actions">
                                <label className="btn btn-outline" style={{ cursor: "pointer", width: "fit-content" }}>
                                  <Plus size={16} />Subir comprobante
                                  <input type="file" accept="image/*" style={{ display: "none" }} onChange={(event) => handleOrderProofUpload(order.id, event)} />
                                </label>
                                {order.paymentProof && <button className="btn btn-outline" onClick={() => clearOrderPaymentProof(order.id)}><Trash2 size={16} />Eliminar foto</button>}
                              </div>
                              {order.paymentProof && <img src={normalizeImageSource(order.paymentProof) || FALLBACK_IMAGE} alt={`Comprobante ${order.code}`} className="preview-image" loading="lazy" decoding="async" />}
                            </div>
                            <div className="grid admin-order-items">
                              {order.items.map((item) => (
                                <div key={item.key} className="admin-order-item-row">
                                  <span>{item.name} - {item.color} - {item.size} x{item.quantity}</span>
                                  <strong>{currency(item.price * item.quantity)}</strong>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {adminTab === "seguridad" && (
              <div className="admin-tab-panel">
                <div className="card" style={{ padding: 22 }}>
                  <div className="admin-toolbar">
                    <div>
                      <p className="muted" style={{ textTransform: "uppercase", letterSpacing: ".25em", fontSize: 13 }}>Seguridad y trafico</p>
                      <h4 style={{ margin: "6px 0 0", fontSize: 28 }}>Metricas por endpoint</h4>
                      <p className="helper-text" style={{ marginTop: 8 }}>Monitorea bloqueos CSRF, rate-limit y errores para detectar cuellos de botella y abuso.</p>
                    </div>
                    <div className="admin-actions">
                      <button className="btn btn-soft" onClick={() => refreshSecurityMetrics({ force: true, preferCache: false })} disabled={securityMetricsBusy}>
                        <RotateCcw size={16} />
                        {securityMetricsBusy ? "Actualizando..." : "Actualizar"}
                      </button>
                      <button className="btn btn-outline" onClick={resetSecurityMetricsData} disabled={securityMetricsResetBusy}>
                        <Trash2 size={16} />
                        {securityMetricsResetBusy ? "Reiniciando..." : "Reiniciar metricas"}
                      </button>
                    </div>
                  </div>

                  {securityMetricsError && (
                    <div className="status-message status-error" style={{ marginTop: 14 }}>
                      {securityMetricsError}
                    </div>
                  )}

                  <div className="admin-kpi-grid" style={{ marginTop: 18 }}>
                    <div className="admin-kpi-card">
                      <p className="admin-kpi-title">Requests</p>
                      <strong className="admin-kpi-value">{securityTotals.requests}</strong>
                    </div>
                    <div className="admin-kpi-card">
                      <p className="admin-kpi-title">Rate limited</p>
                      <strong className="admin-kpi-value">{securityTotals.rateLimited}</strong>
                    </div>
                    <div className="admin-kpi-card">
                      <p className="admin-kpi-title">CSRF rechazados</p>
                      <strong className="admin-kpi-value">{securityTotals.csrfRejected}</strong>
                    </div>
                    <div className="admin-kpi-card">
                      <p className="admin-kpi-title">Errores 4xx/5xx</p>
                      <strong className="admin-kpi-value">{securityTotals.errors}</strong>
                    </div>
                  </div>

                  <p className="helper-text" style={{ marginTop: 14 }}>
                    Ultima actualizacion: {formatAdminTimestamp(securityMetricsUpdatedAt || securityMetrics?.generatedAt)}
                  </p>

                  <div className="security-endpoint-list" style={{ marginTop: 14 }}>
                    {metricsEndpoints.length === 0 ? (
                      <div className="empty-admin-note">Sin actividad registrada an.</div>
                    ) : metricsEndpoints
                      .sort((left, right) => {
                        const leftData = left[1] || {};
                        const rightData = right[1] || {};
                        return (Number(rightData.requests) || 0) - (Number(leftData.requests) || 0);
                      })
                      .map(([endpointName, endpointStats]) => (
                        <div key={endpointName} className="security-endpoint-card">
                          <div className="security-endpoint-head">
                            <strong>{endpointName}</strong>
                            <span className="badge badge-light">{Number(endpointStats?.requests) || 0} req</span>
                          </div>
                          <div className="security-endpoint-grid">
                            <span className={`badge ${(Number(endpointStats?.rateLimited) || 0) > 0 ? "badge-warning" : "badge-light"}`}>Rate limit: {Number(endpointStats?.rateLimited) || 0}</span>
                            <span className={`badge ${(Number(endpointStats?.csrfRejected) || 0) > 0 ? "badge-danger" : "badge-light"}`}>CSRF: {Number(endpointStats?.csrfRejected) || 0}</span>
                            <span className={`badge ${(Number(endpointStats?.invalidJson) || 0) > 0 ? "badge-warning" : "badge-light"}`}>JSON invalido: {Number(endpointStats?.invalidJson) || 0}</span>
                            <span className={`badge ${(Number(endpointStats?.payloadTooLarge) || 0) > 0 ? "badge-warning" : "badge-light"}`}>Payload grande: {Number(endpointStats?.payloadTooLarge) || 0}</span>
                            <span className={`badge ${(Number(endpointStats?.errors) || 0) > 0 ? "badge-danger" : "badge-light"}`}>Errores: {Number(endpointStats?.errors) || 0}</span>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </Motion.div>
      </Motion.div>
    </AnimatePresence>
  );
}

const MemoShowcaseProductCard = React.memo(
  ShowcaseProductCard,
  (prev, next) => prev.product === next.product,
);

const MemoCatalogProductCard = React.memo(
  CatalogProductCard,
  (prev, next) => (
    prev.product === next.product
    && prev.selection === next.selection
    && prev.isFavorite === next.isFavorite
    && prev.isAdmin === next.isAdmin
  ),
);

export default function App() {
  const [products, setProducts] = useState(() => getStoredProducts());
  const [selections, setSelections] = useState({});
  const [cart, setCart] = useState(() => normalizeStoredCart(readStorage(STORAGE_KEYS.cart, [])));
  const [favorites, setFavorites] = useState(() => normalizeStoredFavorites(readStorage(STORAGE_KEYS.favorites, [])));
  const [orderHistory, setOrderHistory] = useState([]);
  const [coupons, setCoupons] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [adminSession, setAdminSession] = useState(null);
  const [productTypeRecords, setProductTypeRecords] = useState(() => buildManagedEntities(
    [],
    PRODUCT_TYPE_OPTIONS,
    getStoredProducts().map((product) => product.productType || "General"),
    "product-type",
  ));
  const [filterTagRecords, setFilterTagRecords] = useState(() => buildManagedEntities(
    [],
    initialProducts.flatMap((product) => product.filterTags || []),
    getStoredProducts().flatMap((product) => product.filterTags || []),
    "filter-tag",
  ));
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Todos");
  const [productTypeFilter, setProductTypeFilter] = useState("Todos");
  const [sortBy, setSortBy] = useState("destacados");
  const [catalogPage, setCatalogPage] = useState(1);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [editingCartItemKey, setEditingCartItemKey] = useState(null);
  const [heroIndex, setHeroIndex] = useState(0);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [showMobileNav, setShowMobileNav] = useState(false);
  const [adminTab, setAdminTab] = useState("resumen");
  const [showCartSummary, setShowCartSummary] = useState(false);
  const [showFavoritesPanel, setShowFavoritesPanel] = useState(false);
  const [showOrdersModal, setShowOrdersModal] = useState(false);
  const [showProfileQuickMenu, setShowProfileQuickMenu] = useState(false);
  const [profileQuickMenuPosition, setProfileQuickMenuPosition] = useState({ top: 86, left: 16 });
  const [showUserAuth, setShowUserAuth] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profileModalSection, setProfileModalSection] = useState("datos");
  const [authMode, setAuthMode] = useState("login");
  const [referenceOrder, setReferenceOrder] = useState(null);
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authPasswordVisible, setAuthPasswordVisible] = useState(false);
  const [authResetEmailLocked, setAuthResetEmailLocked] = useState(false);
  const [postAuthDestination, setPostAuthDestination] = useState(null);
  const [authForm, setAuthForm] = useState(() => ({ ...AUTH_FORM_DEFAULTS }));
  const [profileDraft, setProfileDraft] = useState({ name: "", lastName: "", phone: "", email: "", shippingAddress: "", addressBook: [] });
  const [profileFeedback, setProfileFeedback] = useState(null);
  const [addressBookDraft, setAddressBookDraft] = useState({
    label: "",
    address: "",
    city: "",
    reference: "",
    phone: "",
    isDefault: false,
  });
  const [addressBookEditingId, setAddressBookEditingId] = useState("");
  const [passwordDraft, setPasswordDraft] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [passwordFeedback, setPasswordFeedback] = useState(null);
  const [couponInputCode, setCouponInputCode] = useState("");
  const [activeCouponCode, setActiveCouponCode] = useState("");
  const [couponDraft, setCouponDraft] = useState(() => createEmptyCouponDraft());
  const [couponEditorMessage, setCouponEditorMessage] = useState("");
  const [couponEditorError, setCouponEditorError] = useState("");
  const [orderSearch, setOrderSearch] = useState("");
  const [orderStatusFilter, setOrderStatusFilter] = useState("all");
  const [orderDeliveryFilter, setOrderDeliveryFilter] = useState("all");
  const [orderDateFilter, setOrderDateFilter] = useState("all");
  const [orderCustomerFilter, setOrderCustomerFilter] = useState("");
  const [liveOrdersEnabled, setLiveOrdersEnabled] = useState(true);
  const [liveOrdersRefreshing, setLiveOrdersRefreshing] = useState(false);
  const [liveOrdersUpdatedAt, setLiveOrdersUpdatedAt] = useState("");
  const [userOrderSearch, setUserOrderSearch] = useState("");
  const [productForm, setProductForm] = useState(() => createEmptyProductForm());
  const [previewColor, setPreviewColor] = useState("Negro");
  const [previewImageIndex, setPreviewImageIndex] = useState(0);
  const [customProductTypeInput, setCustomProductTypeInput] = useState("");
  const [customFilterTagInput, setCustomFilterTagInput] = useState("");
  const [editorMessage, setEditorMessage] = useState("");
  const [editorError, setEditorError] = useState("");
  const [offerSaveBusy, setOfferSaveBusy] = useState(false);
  const [contactSyncFeedback, setContactSyncFeedback] = useState(null);
  const [securityMetrics, setSecurityMetrics] = useState(null);
  const [securityMetricsBusy, setSecurityMetricsBusy] = useState(false);
  const [securityMetricsResetBusy, setSecurityMetricsResetBusy] = useState(false);
  const [securityMetricsError, setSecurityMetricsError] = useState("");
  const [securityMetricsUpdatedAt, setSecurityMetricsUpdatedAt] = useState("");
  const [contactSettings, setContactSettings] = useState(() => normalizeContactSettings(defaultContactSettings));
  const [contactDraft, setContactDraft] = useState(() => normalizeContactSettings(defaultContactSettings));
  const [storeSettings, setStoreSettings] = useState(() => mergeStoreSettings(defaultStoreSettings));
  const [storeDraft, setStoreDraft] = useState(() => mergeStoreSettings(defaultStoreSettings));
  const [adminCatalogQuery, setAdminCatalogQuery] = useState("");
  const [adminUsers, setAdminUsers] = useState([]);
  const [adminUsersBusy, setAdminUsersBusy] = useState(false);
  const [adminUsersError, setAdminUsersError] = useState("");
  const [adminUsersSearch, setAdminUsersSearch] = useState("");
  const [adminUsersUpdatedAt, setAdminUsersUpdatedAt] = useState("");
  const [toast, setToast] = useState(null);
  const [orderLiveAlert, setOrderLiveAlert] = useState(null);
  const [catalogReady, setCatalogReady] = useState(false);
  const [storageBackend, setStorageBackend] = useState("");
  const [couponState, setCouponState] = useState(null);
  const [couponBusy, setCouponBusy] = useState(false);
  const [couponApplyNonce, setCouponApplyNonce] = useState(0);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [confettiBursts, setConfettiBursts] = useState([]);
  const [flyToCartFx, setFlyToCartFx] = useState(null);
  const [activeMobileSection, setActiveMobileSection] = useState("inicio");
  const catalogSearchInputRef = useRef(null);
  const productsRef = useRef(products);
  const couponsRef = useRef(coupons);
  const cartRef = useRef(cart);
  const favoritesRef = useRef(favorites);
  const contactSettingsRef = useRef(contactSettings);
  const storeSettingsRef = useRef(storeSettings);
  const productTypeRecordsRef = useRef(productTypeRecords);
  const filterTagRecordsRef = useRef(filterTagRecords);
  const catalogSyncTimeoutRef = useRef(null);
  const catalogSyncQueueRef = useRef(Promise.resolve());
  const catalogSyncErrorShownRef = useRef(false);
  const orderPatchTimersRef = useRef(new Map());
  const confettiTimersRef = useRef(new Map());
  const pendingCouponCelebrationRef = useRef("");
  const flyToCartTimerRef = useRef(null);
  const desktopCartAnchorRef = useRef(null);
  const mobileCartAnchorRef = useRef(null);
  const userStateSyncTimerRef = useRef(null);
  const userStateSyncBusyRef = useRef(false);
  const userStateSyncQueuedRef = useRef(false);
  const userStateLastSignatureRef = useRef("");
  const applyingRemoteUserStateRef = useRef(false);
  const realtimeSyncVersionsRef = useRef({
    global: 0,
    catalog: 0,
    orders: 0,
    users: 0,
    userState: 0,
    currentUserStateVersion: 0,
  });
  const storageBackendWarningShownRef = useRef(false);
  const adminTouchWarningShownRef = useRef(false);
  const knownAdminOrderIdsRef = useRef(new Set());
  const adminOrdersHydratedRef = useRef(false);
  const deferredSearch = useDeferredValue(search);
  const deferredOrderSearch = useDeferredValue(orderSearch);
  const deferredOrderCustomerFilter = useDeferredValue(orderCustomerFilter);
  const deferredUserOrderSearch = useDeferredValue(userOrderSearch);
  const deferredAdminCatalogQuery = useDeferredValue(adminCatalogQuery);
  const authValidation = useMemo(() => buildAuthValidation(authMode, authForm), [authMode, authForm]);
  const [isMobileViewport, setIsMobileViewport] = useState(() => (
    typeof window !== "undefined" ? window.matchMedia("(max-width: 760px)").matches : false
  ));

  const heroSlides = storeSettings.heroSlides.length ? storeSettings.heroSlides : defaultStoreSettings.heroSlides;
  const activeHeroSlide = heroSlides[heroIndex] || defaultStoreSettings.heroSlides[0];
  const heroSlideHasAction = Boolean(activeHeroSlide?.linkedProductId || activeHeroSlide?.targetUrl?.trim());
  const shouldPauseHeroAutoplay = showAdminPanel
    || showMobileNav
    || showCartSummary
    || showFavoritesPanel
    || showOrdersModal
    || showProfileQuickMenu
    || showUserAuth
    || showProfileModal
    || Boolean(selectedProduct);
  const heroAutoplayDelayMs = isMobileViewport ? 5600 : 4200;

  const catalogOfferLabel = useMemo(() => {
    const normalized = normalizeOptionLabel(storeSettings.offerLabel);
    return normalized || defaultStoreSettings.offerLabel;
  }, [storeSettings.offerLabel]);
  const catalogOfferPercentage = useMemo(() => {
    const parsed = Number.parseInt(String(storeSettings.offerPercentage ?? "").replace(/[^\d-]/g, ""), 10);
    if (!Number.isFinite(parsed)) return defaultStoreSettings.offerPercentage;
    return Math.max(0, Math.abs(parsed));
  }, [storeSettings.offerPercentage]);
  const catalogOfferPercentageBadge = catalogOfferPercentage > 0 ? `-${catalogOfferPercentage}%` : "";
  const catalogOfferText = useMemo(() => {
    const normalized = sanitizeLine(storeSettings.offerText || "");
    return normalized || defaultStoreSettings.offerText;
  }, [storeSettings.offerText]);
  const catalogOfferTabLabel = catalogOfferPercentageBadge ? `${catalogOfferLabel} ${catalogOfferPercentageBadge}` : catalogOfferLabel;
  const collectionAudienceTabs = useMemo(() => {
    const baseTabs = ["Todos", "Mujer", "Hombre"];
    const reserved = new Set(baseTabs.map((label) => label.toLowerCase()));
    const dynamicCategories = [...new Set(products
      .filter((product) => product.isPublic !== false)
      .map((product) => normalizeOptionLabel(product.category))
      .filter(Boolean))]
      .filter((label) => {
        const normalized = label.toLowerCase();
        return !reserved.has(normalized) && normalized !== "unisex";
      });

    const tabs = [...baseTabs, ...dynamicCategories];
    const normalizedCategory = normalizeOptionLabel(category).toLowerCase();
    if (
      category !== OFFER_TAB_VALUE
      && category !== "Todos"
      && normalizedCategory !== "unisex"
      && !tabs.some((item) => item.toLowerCase() === normalizedCategory)
    ) {
      tabs.push(category);
    }

    return [
      ...tabs.map((item) => ({ value: item, label: item, isOffer: false })),
      { value: OFFER_TAB_VALUE, label: catalogOfferTabLabel, isOffer: true },
    ];
  }, [products, category, catalogOfferTabLabel]);
  const productsById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const activeProductTypeNames = useMemo(
    () => productTypeRecords
      .filter((record) => record.active)
      .map((record) => normalizeOptionLabel(record.name))
      .filter(Boolean),
    [productTypeRecords],
  );
  const activeFilterTagNames = useMemo(
    () => filterTagRecords
      .filter((record) => record.active)
      .map((record) => normalizeOptionLabel(record.name))
      .filter(Boolean),
    [filterTagRecords],
  );

  const productTypeOptions = useMemo(() => {
    const mergedTypes = [...activeProductTypeNames];

    if (productForm.productType && !mergedTypes.some((item) => item.toLowerCase() === normalizeOptionLabel(productForm.productType).toLowerCase())) {
      mergedTypes.push(normalizeOptionLabel(productForm.productType));
    }

    if (!mergedTypes.length) {
      mergedTypes.push("General");
    }

    return [...new Set(mergedTypes)];
  }, [activeProductTypeNames, productForm.productType]);

  const filterTagOptions = useMemo(() => {
    const mergedTags = [...activeFilterTagNames];

    const currentFormTags = splitFilterTagsText(productForm.filterTagsText || "");
    currentFormTags.forEach((tag) => {
      const normalizedTag = normalizeOptionLabel(tag);
      if (!normalizedTag) return;
      if (!mergedTags.some((item) => item.toLowerCase() === normalizedTag.toLowerCase())) {
        mergedTags.push(normalizedTag);
      }
    });

    return [...new Set(mergedTags)];
  }, [activeFilterTagNames, productForm.filterTagsText]);

  const normalizedCatalogSearch = deferredSearch.toLowerCase().trim();
  const normalizedOrderSearch = deferredOrderSearch.toLowerCase().trim();
  const normalizedOrderCustomerFilter = deferredOrderCustomerFilter.toLowerCase().trim();
  const normalizedUserOrderSearch = deferredUserOrderSearch.toLowerCase().trim();
  const normalizedAdminCatalogSearch = deferredAdminCatalogQuery.toLowerCase().trim();
  const normalizedProductTypeFilter = useMemo(() => normalizeOptionLabel(productTypeFilter), [productTypeFilter]);

  const productSearchIndex = useMemo(() => products.map((product) => {
    const normalizedType = normalizeOptionLabel(product.productType || "General");
    const catalogText = `${product.name} ${product.category} ${product.productType || ""} ${product.description} ${(product.filterTags || []).join(" ")}`.toLowerCase();
    const adminText = `${product.name} ${product.category} ${product.productType || ""} ${(product.filterTags || []).join(" ")} ${product.offerEnabled ? "oferta" : ""}`.toLowerCase();
    return {
      product,
      normalizedType,
      catalogText,
      adminText,
    };
  }), [products]);

  const filteredProducts = useMemo(() => {
    const isOfferTabActive = category === OFFER_TAB_VALUE;
    const normalizedCategoryFilter = normalizeOptionLabel(category).toLowerCase();
    let list = productSearchIndex
      .filter((entry) => {
        const matchesPublic = entry.product.isPublic !== false;
        const matchesSearch = !normalizedCatalogSearch || entry.catalogText.includes(normalizedCatalogSearch);
        const matchesCategory = category === "Todos"
          || isOfferTabActive
          || normalizeOptionLabel(entry.product.category).toLowerCase() === normalizedCategoryFilter;
        const matchesType = productTypeFilter === "Todos" || entry.normalizedType === normalizedProductTypeFilter;
        const matchesOffer = !isOfferTabActive || Boolean(entry.product.offerEnabled);
        return matchesPublic && matchesSearch && matchesCategory && matchesType && matchesOffer;
      })
      .map((entry) => entry.product);

    if (sortBy === "precio-asc") list = [...list].sort((a, b) => a.price - b.price);
    if (sortBy === "precio-desc") list = [...list].sort((a, b) => b.price - a.price);
    if (sortBy === "rating") list = [...list].sort((a, b) => b.rating - a.rating);
    if (sortBy === "nuevos") list = [...list].sort((a, b) => Number(b.newArrival) - Number(a.newArrival));
    if (sortBy === "destacados") list = [...list].sort((a, b) => Number(b.featured) - Number(a.featured));

    return list;
  }, [
    productSearchIndex,
    normalizedCatalogSearch,
    category,
    productTypeFilter,
    normalizedProductTypeFilter,
    sortBy,
  ]);
  const catalogPageSize = isMobileViewport ? 8 : 12;
  const totalCatalogPages = Math.max(1, Math.ceil(filteredProducts.length / catalogPageSize));
  const safeCatalogPage = Math.min(catalogPage, totalCatalogPages);
  const paginatedProducts = useMemo(() => {
    const startIndex = (safeCatalogPage - 1) * catalogPageSize;
    return filteredProducts.slice(startIndex, startIndex + catalogPageSize);
  }, [filteredProducts, safeCatalogPage, catalogPageSize]);
  const catalogPageWindow = useMemo(() => {
    const visiblePages = 5;
    if (totalCatalogPages <= visiblePages) {
      return Array.from({ length: totalCatalogPages }, (_, index) => index + 1);
    }
    const startPage = Math.max(1, Math.min(safeCatalogPage - 2, totalCatalogPages - visiblePages + 1));
    return Array.from({ length: visiblePages }, (_, index) => startPage + index);
  }, [safeCatalogPage, totalCatalogPages]);
  const catalogRangeStart = filteredProducts.length === 0 ? 0 : ((safeCatalogPage - 1) * catalogPageSize) + 1;
  const catalogRangeEnd = Math.min(filteredProducts.length, safeCatalogPage * catalogPageSize);

  const orderSearchIndex = useMemo(() => orderHistory.map((order) => ({
    order,
    text: [
      order.code,
      order.customerName,
      order.customerEmail,
      order.customerPhone,
      order.deliveryCity,
      order.deliveryAddress,
      order.deliveryReference,
      order.deliveryPhone,
      order.items.map((item) => `${item.name} ${item.color} ${item.size}`).join(" "),
    ].join(" ").toLowerCase(),
  })), [orderHistory]);
  const adminOrderCustomerOptions = useMemo(() => {
    const options = new Set();
    orderHistory.forEach((order) => {
      const name = sanitizeLine(order.customerName || order.deliveryFullName || "");
      const email = normalizeEmail(order.customerEmail || "");
      if (name) options.add(name);
      if (email) options.add(email);
    });
    return Array.from(options.values()).sort((left, right) => left.localeCompare(right));
  }, [orderHistory]);

  const customerOrderSearchIndex = useMemo(() => orderHistory
    .filter((order) => {
      const matchesUserId = currentUser?.id && String(order.customerId || "") === String(currentUser.id);
      const matchesUserEmail = normalizeEmail(order.customerEmail || "") && normalizeEmail(order.customerEmail || "") === normalizeEmail(currentUser?.email || "");
      return Boolean(matchesUserId || matchesUserEmail);
    })
    .map((order) => ({
      order,
      text: `${order.code} ${order.items.map((item) => `${item.name} ${item.color} ${item.size}`).join(" ")}`.toLowerCase(),
    })), [orderHistory, currentUser?.id, currentUser?.email]);

  const adminProductSearchIndex = useMemo(() => productSearchIndex.map((entry) => ({
    product: entry.product,
    text: entry.adminText,
  })), [productSearchIndex]);

  const stockReadyProducts = useMemo(
    () => products.filter((product) => product.isPublic !== false && hasProductAvailableStock(product)),
    [products],
  );

  const featuredProducts = useMemo(() => {
    const featuredInStock = stockReadyProducts.filter((product) => product.featured);
    if (featuredInStock.length >= 4) {
      return featuredInStock.slice(0, 4);
    }
    const fallbackInStock = stockReadyProducts
      .filter((product) => !product.featured)
      .sort((left, right) => (Number(right.newArrival) - Number(left.newArrival)) || ((Number(right.rating) || 0) - (Number(left.rating) || 0)));
    return [...featuredInStock, ...fallbackInStock].slice(0, 4);
  }, [stockReadyProducts]);

  const recommendedProducts = useMemo(() => {
    const cartProductIds = new Set(cart.map((item) => String(item.id)));
    const cartProducts = cart
      .map((item) => productsById.get(normalizeEntityId(item.id)))
      .filter(Boolean);
    const anchorProducts = selectedProduct ? [selectedProduct, ...cartProducts] : cartProducts;
    const anchorTypes = new Set(anchorProducts.map((item) => normalizeOptionLabel(item?.productType || "").toLowerCase()).filter(Boolean));
    const anchorCategories = new Set(anchorProducts.map((item) => normalizeOptionLabel(item?.category || "").toLowerCase()).filter(Boolean));
    if (productTypeFilter !== "Todos") {
      anchorTypes.add(normalizeOptionLabel(productTypeFilter).toLowerCase());
    }

    const scoredProducts = stockReadyProducts
      .filter((product) => !cartProductIds.has(String(product.id)))
      .map((product) => {
        const normalizedType = normalizeOptionLabel(product.productType || "").toLowerCase();
        const normalizedCategory = normalizeOptionLabel(product.category || "").toLowerCase();
        const score = (anchorTypes.size && anchorTypes.has(normalizedType) ? 4 : 0)
          + (anchorCategories.size && anchorCategories.has(normalizedCategory) ? 2 : 0)
          + (product.featured ? 1.4 : 0)
          + (product.newArrival ? 1.1 : 0)
          + ((Number(product.rating) || 0) / 5);
        return { product, score };
      })
      .sort((left, right) => right.score - left.score || right.product.rating - left.product.rating);

    return scoredProducts.slice(0, 10).map((entry) => entry.product);
  }, [cart, stockReadyProducts, productsById, productTypeFilter, selectedProduct]);

  const subtotal = useMemo(() => cart.reduce((total, item) => total + item.price * item.quantity, 0), [cart]);
  const totalItems = useMemo(() => cart.reduce((total, item) => total + item.quantity, 0), [cart]);
  const appliedCouponState = activeCouponCode ? couponState : null;
  const discountAmount = appliedCouponState?.ok ? appliedCouponState.discountAmount : 0;
  const finalTotal = appliedCouponState?.ok ? appliedCouponState.total : subtotal;
  const currentUserAddressBook = useMemo(
    () => normalizeAddressBook(currentUser?.addressBook),
    [currentUser?.addressBook],
  );

  const filteredOrderHistory = useMemo(() => {
    const base = !normalizedOrderSearch
      ? orderHistory
      : orderSearchIndex
        .filter((entry) => entry.text.includes(normalizedOrderSearch))
        .map((entry) => entry.order);

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const last7Days = now.getTime() - (7 * 24 * 60 * 60 * 1000);
    const last30Days = now.getTime() - (30 * 24 * 60 * 60 * 1000);

    return base.filter((order) => {
      const normalizedStatus = normalizeOrderStatusForOrder(order.status, order.deliveryType);
      const matchesStatus = orderStatusFilter === "all" || normalizedStatus === orderStatusFilter;
      if (!matchesStatus) return false;

      const matchesDelivery = orderDeliveryFilter === "all" || order.deliveryType === orderDeliveryFilter;
      if (!matchesDelivery) return false;

      const customerText = [
        order.customerName,
        order.deliveryFullName,
        order.customerEmail,
        order.customerPhone,
        order.deliveryPhone,
      ].join(" ").toLowerCase();
      const matchesCustomer = !normalizedOrderCustomerFilter || customerText.includes(normalizedOrderCustomerFilter);
      if (!matchesCustomer) return false;

      if (orderDateFilter === "all") return true;
      const createdAtMs = new Date(order.createdAt || "").getTime();
      if (!Number.isFinite(createdAtMs)) return false;
      if (orderDateFilter === "today") return createdAtMs >= startOfToday.getTime();
      if (orderDateFilter === "last7") return createdAtMs >= last7Days;
      if (orderDateFilter === "last30") return createdAtMs >= last30Days;
      return true;
    });
  }, [
    orderHistory,
    orderSearchIndex,
    normalizedOrderSearch,
    normalizedOrderCustomerFilter,
    orderStatusFilter,
    orderDeliveryFilter,
    orderDateFilter,
  ]);

  const customerOrders = useMemo(() => {
    if (!currentUser?.id && !normalizeEmail(currentUser?.email || "")) return [];
    const filtered = !normalizedUserOrderSearch
      ? customerOrderSearchIndex
      : customerOrderSearchIndex.filter((entry) => entry.text.includes(normalizedUserOrderSearch));
    return filtered.map((entry) => entry.order);
  }, [customerOrderSearchIndex, currentUser, normalizedUserOrderSearch]);

  const footerWhatsAppLink = useMemo(() => contactSettings.whatsappLink || buildWhatsAppLink(contactSettings.whatsappNumber), [contactSettings.whatsappLink, contactSettings.whatsappNumber]);
  const footerEmailLink = useMemo(() => buildMailtoLink(contactSettings.email), [contactSettings.email]);
  const footerLocationNote = useMemo(() => {
    const normalized = sanitizeParagraph(contactSettings.locationNote || "");
    return normalized || defaultContactSettings.locationNote;
  }, [contactSettings.locationNote]);
  const isAdmin = Boolean(adminSession);
  const securityMetricsGeneratedAt = String(securityMetrics?.generatedAt || "");
  const mobileQuickActive = showCartSummary
    ? "carrito"
    : showFavoritesPanel
      ? "favoritos"
      : activeMobileSection;

  const adminProductCount = products.length;
  const adminPhotoCount = products.reduce((total, product) => total + Object.values(product.imagesByColor || {}).flat().length, 0);
  const adminColorVariantCount = products.reduce((total, product) => total + product.colors.length, 0);
  const adminOutOfStockCount = products.filter((product) => product.variants.every((variant) => Number(variant.stock) <= 0)).length;
  const adminLowStockCount = products.filter((product) => {
    const totalStock = product.variants.reduce((total, variant) => total + Number(variant.stock || 0), 0);
    return totalStock > 0 && totalStock <= 5;
  }).length;
  const adminPendingOrders = orderHistory.filter((order) => normalizeOrderStatusForOrder(order.status, order.deliveryType) === "Pendiente").length;
  const adminRegisteredUsers = adminUsers.length;
  const adminOrdersToday = useMemo(() => {
    const today = new Date();
    return orderHistory.filter((order) => {
      const created = new Date(order.createdAt || "");
      return Number.isFinite(created.getTime())
        && created.getFullYear() === today.getFullYear()
        && created.getMonth() === today.getMonth()
        && created.getDate() === today.getDate();
    }).length;
  }, [orderHistory]);
  const adminRevenueTotal = useMemo(() => orderHistory.reduce((total, order) => {
    if (normalizeOrderStatusForOrder(order.status, order.deliveryType) === "Cancelado") return total;
    return total + (Number(order.total || order.subtotal) || 0);
  }, 0), [orderHistory]);
  const adminAverageOrderTotal = useMemo(() => {
    const validOrders = orderHistory.filter((order) => normalizeOrderStatusForOrder(order.status, order.deliveryType) !== "Cancelado");
    if (!validOrders.length) return 0;
    return validOrders.reduce((total, order) => total + (Number(order.total || order.subtotal) || 0), 0) / validOrders.length;
  }, [orderHistory]);

  const adminCatalogProducts = useMemo(() => {
    const list = !normalizedAdminCatalogSearch
      ? adminProductSearchIndex
      : adminProductSearchIndex.filter((entry) => entry.text.includes(normalizedAdminCatalogSearch));
    return list
      .map((entry) => entry.product)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [adminProductSearchIndex, normalizedAdminCatalogSearch]);

  const activeFilterPills = useMemo(() => {
    const pills = [];
    if (search.trim()) pills.push({ key: "search", label: `Busqueda: ${search.trim()}`, onClear: () => setSearch("") });
    if (category !== "Todos") {
      const categoryLabel = category === OFFER_TAB_VALUE ? catalogOfferTabLabel : category;
      pills.push({ key: "category", label: `Categoria: ${categoryLabel}`, onClear: () => setCategory("Todos") });
    }
    if (productTypeFilter !== "Todos") pills.push({ key: "type", label: `Tipo: ${productTypeFilter}`, onClear: () => setProductTypeFilter("Todos") });
    if (sortBy !== "destacados") {
      const sortLabels = {
        nuevos: "Nuevos",
        rating: "Mejor valorados",
        "precio-asc": "Precio ascendente",
        "precio-desc": "Precio descendente",
      };
      pills.push({ key: "sort", label: `Orden: ${sortLabels[sortBy] || sortBy}`, onClear: () => setSortBy("destacados") });
    }
    return pills;
  }, [search, category, catalogOfferTabLabel, productTypeFilter, sortBy]);

  const showToastMessage = useCallback((payload, tone = "success") => {
    const toneLabels = {
      success: "Listo",
      error: "No se pudo completar",
      warning: "Atencion",
      info: "Te acompanamos",
    };

    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
      const resolvedTone = payload.tone || tone;
      const resolvedMessage = sanitizeLine(payload.message || "");
      const resolvedTitle = sanitizeLine(payload.title || toneLabels[resolvedTone] || toneLabels.success);
      const resolvedKind = sanitizeLine(payload.kind || "").toLowerCase();
      setToast({
        id: createUid(),
        tone: resolvedTone,
        title: resolvedTitle,
        message: resolvedMessage,
        kind: resolvedKind,
      });
      return;
    }

    const resolvedMessage = sanitizeLine(String(payload || ""));
    setToast({
      id: createUid(),
      tone,
      title: toneLabels[tone] || toneLabels.success,
      message: resolvedMessage,
      kind: "",
    });
  }, []);

  const refreshSecurityMetrics = useCallback(async ({ silent = false, force = false, preferCache = true } = {}) => {
    if (!silent) {
      setSecurityMetricsBusy(true);
    }
    const applyMetrics = (payload = {}) => {
      setSecurityMetrics(payload.metrics);
      setSecurityMetricsUpdatedAt(payload.metrics.generatedAt || new Date().toISOString());
      setSecurityMetricsError("");
    };

    const result = await getSecurityMetricsSnapshot({ force, preferCache });
    if (!result.ok || !result.metrics) {
      const message = result.message || "No pudimos cargar las metricas de seguridad.";
      setSecurityMetricsError(message);
      if (!silent) {
        showToastMessage(message, "error");
      }
      setSecurityMetricsBusy(false);
      return false;
    }
    applyMetrics(result);

    if (preferCache && !force && result.cache?.hit && result.cache?.stale) {
      const freshResult = await getSecurityMetricsSnapshot({ force: true, preferCache: false });
      if (freshResult.ok && freshResult.metrics) {
        applyMetrics(freshResult);
      }
    }

    setSecurityMetricsBusy(false);
    return true;
  }, [showToastMessage]);

  const refreshAdminUsers = useCallback(async ({ silent = false, force = false, preferCache = true } = {}) => {
    if (!isAdmin) {
      setAdminUsers([]);
      setAdminUsersError("");
      setAdminUsersUpdatedAt("");
      return false;
    }
    if (!silent) {
      setAdminUsersBusy(true);
    }
    const applyUsers = (payload = {}) => {
      setAdminUsers(payload.users);
      setAdminUsersError("");
      setAdminUsersUpdatedAt(new Date().toISOString());
    };

    const result = await listAdminUsers({ force, preferCache });
    if (!result.ok || !Array.isArray(result.users)) {
      const message = result.message || "No pudimos cargar los usuarios.";
      setAdminUsersError(message);
      if (!silent) {
        showToastMessage(message, "error");
      }
      setAdminUsersBusy(false);
      return false;
    }
    applyUsers(result);

    if (preferCache && !force && result.cache?.hit && result.cache?.stale) {
      const freshResult = await listAdminUsers({ force: true, preferCache: false });
      if (freshResult.ok && Array.isArray(freshResult.users)) {
        applyUsers(freshResult);
      }
    }

    setAdminUsersBusy(false);
    return true;
  }, [isAdmin, showToastMessage]);

  const saveAdminUser = useCallback(async (payload = {}) => {
    const response = await updateAdminUserRecord(payload);
    if (!response.ok) {
      showToastMessage(response.message || "No pudimos actualizar el usuario.", "error");
      return response;
    }
    if (Array.isArray(response.users)) {
      setAdminUsers(response.users);
      setAdminUsersUpdatedAt(new Date().toISOString());
    } else {
      void refreshAdminUsers({ silent: true });
    }
    setAdminUsersError("");
    showToastMessage("Usuario actualizado.", "success");
    return response;
  }, [refreshAdminUsers, showToastMessage]);

  const removeAdminUser = useCallback(async (userId = "") => {
    const response = await deleteAdminUserRecord({ userId });
    if (!response.ok) {
      showToastMessage(response.message || "No pudimos eliminar el usuario.", "error");
      return response;
    }
    if (Array.isArray(response.users)) {
      setAdminUsers(response.users);
      setAdminUsersUpdatedAt(new Date().toISOString());
    } else {
      void refreshAdminUsers({ silent: true });
    }
    setAdminUsersError("");
    showToastMessage("Usuario eliminado.", "success");
    return response;
  }, [refreshAdminUsers, showToastMessage]);

  const sendAdminUserResetLink = useCallback(async (payload = {}) => {
    const response = await sendAdminUserPasswordResetLink(payload);
    if (!response.ok) {
      showToastMessage(response.message || "No pudimos enviar el correo de recuperacion.", "error");
      return response;
    }
    const targetEmail = normalizeEmail(response?.user?.email || payload.email || "");
    const safeTarget = targetEmail || "el usuario seleccionado";
    showToastMessage(`Enlace de recuperacion enviado a ${safeTarget}.`, "success");
    return response;
  }, [showToastMessage]);

  const copyAdminUserResetLink = useCallback(async (payload = {}) => {
    const response = await generateAdminUserPasswordResetLink(payload);
    if (!response.ok || !response.resetLink) {
      showToastMessage(response.message || "No pudimos generar el enlace de recuperacion.", "error");
      return response;
    }
    const copied = await copyTextToClipboard(response.resetLink);
    if (!copied) {
      showToastMessage("No pudimos copiar el enlace al portapapeles.", "error");
      return {
        ...response,
        ok: false,
        message: "No pudimos copiar el enlace al portapapeles.",
      };
    }
    showToastMessage("Enlace de recuperacion copiado.", "success");
    return {
      ...response,
      copied: true,
    };
  }, [showToastMessage]);

  const refreshOrdersFromServer = useCallback(async ({
    silent = false,
    force = false,
    preferCache = true,
    notifyAdminOnNew = false,
  } = {}) => {
    if (!currentUser?.id && !isAdmin) {
      setOrderHistory([]);
      setLiveOrdersUpdatedAt("");
      setLiveOrdersRefreshing(false);
      return false;
    }
    if (!silent) {
      setLiveOrdersRefreshing(true);
    }
    const result = await listServerOrders({ force, preferCache });
    if (!result.ok || !Array.isArray(result.orderHistory)) {
      if (!silent) {
        setToast({
          id: createUid(),
          tone: "error",
          title: "No se pudo actualizar",
          message: sanitizeLine(result.message || "No pudimos actualizar la cola de pedidos."),
        });
      }
      setLiveOrdersRefreshing(false);
      return false;
    }

    const normalizedOrders = result.orderHistory.map(normalizeOrderRecord);
    startTransition(() => {
      setOrderHistory(normalizedOrders);
    });
    setLiveOrdersUpdatedAt(new Date().toISOString());

    if (isAdmin) {
      const nextIds = new Set(
        normalizedOrders
          .map((order) => String(order.id || order.code || "").trim())
          .filter(Boolean),
      );
      if (!adminOrdersHydratedRef.current) {
        knownAdminOrderIdsRef.current = nextIds;
        adminOrdersHydratedRef.current = true;
      } else if (notifyAdminOnNew) {
        const previousIds = knownAdminOrderIdsRef.current;
        const newOrders = normalizedOrders.filter((order) => {
          const key = String(order.id || order.code || "").trim();
          return Boolean(key) && !previousIds.has(key);
        });
        knownAdminOrderIdsRef.current = nextIds;
        if (newOrders.length > 0) {
          const firstOrder = newOrders[0];
          const orderLabel = sanitizeLine(firstOrder?.code || "");
          const totalNew = newOrders.length;
          setOrderLiveAlert({
            totalNew,
            orderCode: orderLabel,
            customerName: sanitizeLine(firstOrder?.customerName || "Cliente"),
            total: Number(firstOrder?.total || firstOrder?.subtotal || 0),
            createdAt: firstOrder?.createdAt || "",
            detectedAt: new Date().toISOString(),
          });
          showToastMessage({
            tone: "warning",
            kind: "order-alert",
            title: totalNew > 1 ? `${totalNew} pedidos nuevos` : "Nuevo pedido recibido",
            message: totalNew > 1
              ? "Revisa la pestaña Pedidos para atenderlos de inmediato."
              : orderLabel
                ? `Se registro el pedido ${orderLabel}.`
                : "Se registro un nuevo pedido en la tienda.",
          });
        }
      } else {
        knownAdminOrderIdsRef.current = nextIds;
      }
    }

    if (preferCache && !force && result.cache?.hit && result.cache?.stale) {
      const freshResult = await listServerOrders({ force: true, preferCache: false });
      if (freshResult.ok && Array.isArray(freshResult.orderHistory)) {
        const freshOrders = freshResult.orderHistory.map(normalizeOrderRecord);
        startTransition(() => {
          setOrderHistory(freshOrders);
        });
        setLiveOrdersUpdatedAt(new Date().toISOString());
        if (isAdmin) {
          knownAdminOrderIdsRef.current = new Set(
            freshOrders
              .map((order) => String(order.id || order.code || "").trim())
              .filter(Boolean),
          );
          adminOrdersHydratedRef.current = true;
        }
      }
    }

    setLiveOrdersRefreshing(false);
    return true;
  }, [currentUser?.id, isAdmin, showToastMessage]);

  const buildUserStateSignature = useCallback((nextCart = [], nextFavorites = []) => {
    const normalizedCart = normalizeAccountCartState(nextCart);
    const normalizedFavorites = normalizeStoredFavorites(nextFavorites);
    return JSON.stringify({
      cart: normalizedCart,
      favorites: normalizedFavorites,
    });
  }, []);

  const syncUserStateNow = useCallback(async () => {
    if (!currentUser?.id) return;
    if (userStateSyncBusyRef.current) {
      userStateSyncQueuedRef.current = true;
      return;
    }

    const payloadCart = normalizeAccountCartState(cartRef.current);
    const payloadFavorites = normalizeStoredFavorites(favoritesRef.current);
    const nextSignature = buildUserStateSignature(payloadCart, payloadFavorites);
    if (!nextSignature || nextSignature === userStateLastSignatureRef.current) {
      return;
    }

    userStateSyncBusyRef.current = true;
    try {
      const baseStateVersion = Math.max(
        Number(realtimeSyncVersionsRef.current.currentUserStateVersion || 0),
        Number(currentUser?.stateVersion || 0),
      );
      const result = await syncUserAccountState({
        cart: payloadCart,
        favorites: payloadFavorites,
        baseStateVersion,
      });
      if (!result?.ok || !result.user) {
        return;
      }
      userStateLastSignatureRef.current = nextSignature;
      realtimeSyncVersionsRef.current.currentUserStateVersion = Math.max(
        Number(realtimeSyncVersionsRef.current.currentUserStateVersion || 0),
        Number(result.user.stateVersion || 0),
      );
      setCurrentUser(result.user);
    } finally {
      userStateSyncBusyRef.current = false;
      if (userStateSyncQueuedRef.current) {
        userStateSyncQueuedRef.current = false;
        if (userStateSyncTimerRef.current) {
          window.clearTimeout(userStateSyncTimerRef.current);
        }
        userStateSyncTimerRef.current = window.setTimeout(() => {
          void syncUserStateNow();
        }, 120);
      }
    }
  }, [buildUserStateSignature, currentUser?.id, currentUser?.stateVersion]);

  const queueUserStateSync = useCallback((delayMs = 480) => {
    if (!currentUser?.id) return;
    if (userStateSyncTimerRef.current) {
      window.clearTimeout(userStateSyncTimerRef.current);
    }
    userStateSyncTimerRef.current = window.setTimeout(() => {
      void syncUserStateNow();
    }, Math.max(120, Number(delayMs) || 480));
  }, [currentUser?.id, syncUserStateNow]);

  const getVisibleCartAnchorElement = () => {
    const candidates = [mobileCartAnchorRef.current, desktopCartAnchorRef.current].filter(Boolean);
    const visible = candidates.find((node) => {
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
    return visible || candidates[0] || null;
  };

  const triggerConfetti = (tone = "default") => {
    const id = createUid();
    setConfettiBursts((previous) => [...previous, { id, tone }]);
    if (typeof window === "undefined") return;
    const timerId = window.setTimeout(() => {
      setConfettiBursts((previous) => previous.filter((burst) => burst.id !== id));
      confettiTimersRef.current.delete(id);
    }, 980);
    confettiTimersRef.current.set(id, timerId);
  };

  const triggerFlyToCart = (meta = {}) => {
    if (typeof window === "undefined") return;
    const sourceElement = meta.sourceElement;
    const targetElement = getVisibleCartAnchorElement();
    if (!sourceElement || !targetElement?.getBoundingClientRect) return;
    const startRect = sourceElement.getBoundingClientRect();
    const endRect = targetElement.getBoundingClientRect();
    if (startRect.width <= 0 || startRect.height <= 0 || endRect.width <= 0 || endRect.height <= 0) return;

    setFlyToCartFx({
      id: createUid(),
      image: normalizeImageSource(meta.image) || FALLBACK_IMAGE,
      startX: startRect.left + (startRect.width / 2) - 22,
      startY: startRect.top + (startRect.height / 2) - 22,
      endX: endRect.left + (endRect.width / 2) - 11,
      endY: endRect.top + (endRect.height / 2) - 11,
    });

    if (flyToCartTimerRef.current) {
      window.clearTimeout(flyToCartTimerRef.current);
    }
    flyToCartTimerRef.current = window.setTimeout(() => {
      setFlyToCartFx(null);
      flyToCartTimerRef.current = null;
    }, 700);
  };

  const applyCatalogStateFromServer = useCallback((data = {}) => {
    const previousProductsMap = new Map(productsRef.current.map((product) => [String(product.id), product]));
    const incomingProducts = Array.isArray(data.products)
      ? data.products.map((rawProduct) => {
          const productId = rawProduct?.id != null ? String(rawProduct.id) : "";
          const previousProduct = previousProductsMap.get(productId);
          const hasIsPublicFlag = Object.prototype.hasOwnProperty.call(rawProduct || {}, "isPublic");
          if (!hasRawOfferMetadata(rawProduct) && previousProduct) {
            return normalizeProduct({
              ...rawProduct,
              basePrice: previousProduct.basePrice,
              offerEnabled: previousProduct.offerEnabled,
              offerDiscountMode: previousProduct.offerDiscountMode,
              offerDiscountValue: previousProduct.offerDiscountValue,
              offerExtraDiscount: previousProduct.offerExtraDiscount,
              offerExtraAmount: previousProduct.offerExtraAmount,
              ...(hasIsPublicFlag ? {} : { isPublic: previousProduct.isPublic !== false }),
            });
          }
          if (!hasIsPublicFlag && previousProduct) {
            return normalizeProduct({
              ...rawProduct,
              isPublic: previousProduct.isPublic !== false,
            });
          }
          return normalizeProduct(rawProduct);
        })
      : [];
    const fallbackProducts = initialProducts.map(normalizeProduct);
    const resolvedProducts = incomingProducts.length ? incomingProducts : fallbackProducts;

    startTransition(() => {
      setProducts(resolvedProducts);
      if (Array.isArray(data.coupons)) {
        setCoupons(normalizeCouponList(data.coupons));
      }
      if (Array.isArray(data.orderHistory)) {
        setOrderHistory(data.orderHistory.map(normalizeOrderRecord));
      }
      setStorageBackend(sanitizeLine(data.storageBackend || ""));

      if (data.contactSettings) {
        setContactSettings(resolveContactSettingsWithServerFallback(data.contactSettings, defaultContactSettings));
      }
      if (data.storeSettings) {
        setStoreSettings(mergeStoreSettings(data.storeSettings));
      }

      setProductTypeRecords(buildManagedEntities(
        data.productTypeRecords,
        PRODUCT_TYPE_OPTIONS,
        resolvedProducts.map((product) => product.productType || "General"),
        "product-type",
      ));
      setFilterTagRecords(buildManagedEntities(
        data.filterTagRecords,
        [],
        resolvedProducts.flatMap((product) => product.filterTags || []),
        "filter-tag",
      ));
    });
  }, []);

  const syncCatalogSnapshot = useCallback(async (overrides = {}, { silent = false, reconcile = false } = {}) => {
    const runSync = async () => {
      if (!isAdmin || !catalogReady) {
        return {
          ok: false,
          skipped: true,
          message: "Necesitas una sesion admin activa para sincronizar cambios.",
        };
      }

      const payload = {
        products: productsRef.current,
        coupons: couponsRef.current,
        contactSettings: contactSettingsRef.current,
        storeSettings: storeSettingsRef.current,
        productTypeRecords: productTypeRecordsRef.current,
        filterTagRecords: filterTagRecordsRef.current,
        ...overrides,
      };

      const result = await syncCatalogState(payload);
      if (!result.ok) {
        if (!silent) {
          showToastMessage(result.message || "No pudimos sincronizar cambios con el servidor.", "warning");
        }
        return result;
      }

      if (reconcile && result.data) {
        applyCatalogStateFromServer(result.data);
      }
      catalogSyncErrorShownRef.current = false;
      return result;
    };

    const queuedSync = catalogSyncQueueRef.current
      .catch(() => undefined)
      .then(() => runSync());
    catalogSyncQueueRef.current = queuedSync.then(() => undefined).catch(() => undefined);
    return queuedSync;
  }, [applyCatalogStateFromServer, catalogReady, isAdmin, showToastMessage]);

  useEffect(() => {
    if (!heroSlides.length || typeof document === "undefined") return undefined;
    let intervalId = null;

    const clearAutoplay = () => {
      if (intervalId != null) {
        window.clearInterval(intervalId);
        intervalId = null;
      }
    };

    const startAutoplay = () => {
      if (document.hidden || shouldPauseHeroAutoplay) return;
      clearAutoplay();
      intervalId = window.setInterval(() => {
        setHeroIndex((previous) => (previous + 1) % heroSlides.length);
      }, heroAutoplayDelayMs);
    };

    const handleVisibilityChange = () => {
      if (document.hidden || shouldPauseHeroAutoplay) {
        clearAutoplay();
        return;
      }
      startAutoplay();
    };

    startAutoplay();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      clearAutoplay();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [heroSlides.length, heroAutoplayDelayMs, shouldPauseHeroAutoplay]);

  useEffect(() => {
    if (heroIndex >= heroSlides.length) {
      setHeroIndex(0);
    }
  }, [heroIndex, heroSlides.length]);

  useEffect(() => {
    setSelections((previous) => syncSelections(products, previous));
  }, [products]);

  useEffect(() => {
    saveStorage(STORAGE_KEYS.cart, cart);
  }, [cart]);

  useEffect(() => {
    if (cart.length > 0) return;
    setCouponInputCode("");
    setActiveCouponCode("");
    setCouponState(null);
    setCouponBusy(false);
    pendingCouponCelebrationRef.current = "";
  }, [cart.length]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!activeCouponCode) {
        setCouponState(null);
        setCouponBusy(false);
        return;
      }
      setCouponBusy(true);
      try {
        const response = await previewCouponApplication({
          couponCode: activeCouponCode,
          cart,
        });
        if (cancelled) return;
        const nextCouponState = response.ok && response.couponState
          ? response.couponState
          : buildCouponFallbackState(activeCouponCode, subtotal, response.message);
        setCouponState(nextCouponState);
        if (
          nextCouponState?.ok
          && pendingCouponCelebrationRef.current
          && normalizeCode(pendingCouponCelebrationRef.current) === normalizeCode(nextCouponState.code)
        ) {
          triggerConfetti("coupon");
          pendingCouponCelebrationRef.current = "";
        } else if (!nextCouponState?.ok && normalizeCode(pendingCouponCelebrationRef.current) === normalizeCode(activeCouponCode)) {
          pendingCouponCelebrationRef.current = "";
        }
      } finally {
        if (!cancelled) {
          setCouponBusy(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeCouponCode, cart, currentUser?.id, subtotal, couponApplyNonce]);

  useEffect(() => {
    saveStorage(STORAGE_KEYS.favorites, favorites);
  }, [favorites]);

  useEffect(() => {
    setCatalogPage(1);
  }, [search, category, productTypeFilter, sortBy]);

  useEffect(() => {
    if (catalogPage <= totalCatalogPages) return;
    setCatalogPage(totalCatalogPages);
  }, [catalogPage, totalCatalogPages]);

  useEffect(() => {
    if (currentUser) return;
    setShowProfileModal(false);
  }, [currentUser]);

  useEffect(() => {
    if (currentUser?.id) return;
    realtimeSyncVersionsRef.current.currentUserStateVersion = 0;
    userStateLastSignatureRef.current = "";
    userStateSyncQueuedRef.current = false;
    userStateSyncBusyRef.current = false;
    applyingRemoteUserStateRef.current = false;
    if (userStateSyncTimerRef.current) {
      window.clearTimeout(userStateSyncTimerRef.current);
      userStateSyncTimerRef.current = null;
    }
  }, [currentUser?.id]);

  useEffect(() => {
    if (!currentUser?.id) return;

    const remoteCart = normalizeAccountCartState(currentUser.cart || []);
    const remoteFavorites = normalizeStoredFavorites(currentUser.favorites || []);
    const remoteSignature = buildUserStateSignature(remoteCart, remoteFavorites);
    const localSignature = buildUserStateSignature(cartRef.current, favoritesRef.current);

    realtimeSyncVersionsRef.current.currentUserStateVersion = Math.max(
      Number(realtimeSyncVersionsRef.current.currentUserStateVersion || 0),
      Number(currentUser.stateVersion || 0),
    );

    if (!remoteSignature || remoteSignature === localSignature) {
      userStateLastSignatureRef.current = remoteSignature || localSignature;
      return;
    }

    const currentCartByKey = new Map(
      normalizeStoredCart(cartRef.current).map((entry) => [String(entry.key || ""), entry]),
    );
    const liveProductsById = new Map(
      (Array.isArray(productsRef.current) ? productsRef.current : []).map((product) => [normalizeEntityId(product?.id), product]),
    );
    const hydratedRemoteCart = remoteCart.filter((entry) => {
      const product = liveProductsById.get(normalizeEntityId(entry.id));
      return Boolean(product) && product.isPublic !== false;
    }).map((entry) => {
      const key = String(entry.key || "");
      const previousLine = currentCartByKey.get(key);
      const product = liveProductsById.get(normalizeEntityId(entry.id));
      return {
        ...entry,
        name: sanitizeLine(product?.name || previousLine?.name || "Producto"),
        price: Number(product?.price || previousLine?.price || 0) || 0,
        image: normalizeImageSource(
          getCurrentImageForProduct(product, entry.color)
          || previousLine?.image
          || FALLBACK_IMAGE,
        ) || FALLBACK_IMAGE,
      };
    });
    const hydratedRemoteFavorites = remoteFavorites.filter((favoriteId) => {
      const product = liveProductsById.get(normalizeEntityId(favoriteId));
      return Boolean(product) && product.isPublic !== false;
    });

    applyingRemoteUserStateRef.current = true;
    setCart(hydratedRemoteCart);
    setFavorites(hydratedRemoteFavorites);
    userStateLastSignatureRef.current = remoteSignature;
    window.setTimeout(() => {
      applyingRemoteUserStateRef.current = false;
    }, 0);
  }, [
    buildUserStateSignature,
    currentUser?.cart,
    currentUser?.favorites,
    currentUser?.id,
    currentUser?.stateVersion,
    currentUser?.stateUpdatedAt,
  ]);

  useEffect(() => {
    if (!currentUser?.id) return;
    if (applyingRemoteUserStateRef.current) return;
    queueUserStateSync();
  }, [cart, favorites, currentUser?.id, queueUserStateSync]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await getUserSessionStatus();
      if (cancelled) return;
      if (result.ok && result.authenticated && result.user) {
        setCurrentUser(result.user);
      } else {
        setCurrentUser(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await getAdminSessionStatus();
      if (cancelled) return;
      if (result.ok && result.isAdmin && result.session) {
        setAdminSession({
          username: result.session.username,
          expiresAt: Number(result.session.expiresAt) || 0,
          issuedAt: Number(result.session.issuedAt) || Date.now(),
        });
        return;
      }
      setAdminSession(null);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (isAdmin) return;
    setAdminUsers([]);
    setAdminUsersError("");
    setAdminUsersSearch("");
    setAdminUsersUpdatedAt("");
  }, [isAdmin]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const currentUrl = new URL(window.location.href);
    const resetToken = sanitizeLine(
      currentUrl.searchParams.get("resetToken")
      || currentUrl.searchParams.get("token")
      || "",
    ).slice(0, AUTH_FIELD_LIMITS.resetToken);
    if (!resetToken) return;

    const email = normalizeEmail(currentUrl.searchParams.get("email") || "").slice(0, AUTH_FIELD_LIMITS.email);
    const hasTrustedResetEmail = Boolean(email);

    setAuthForm((previous) => ({
      ...previous,
      email: email || previous.email,
      resetToken,
      password: "",
      confirmPassword: "",
    }));
    setAuthMode("reset");
    setAuthResetEmailLocked(hasTrustedResetEmail);
    setAuthError("");
    setAuthBusy(false);
    setAuthPasswordVisible(false);
    setShowProfileModal(false);
    setShowUserAuth(true);

    currentUrl.searchParams.delete("resetToken");
    currentUrl.searchParams.delete("token");
    currentUrl.searchParams.delete("email");
    const nextQuery = currentUrl.searchParams.toString();
    const nextUrl = `${currentUrl.pathname}${nextQuery ? `?${nextQuery}` : ""}${currentUrl.hash || ""}`;
    window.history.replaceState({}, document.title, nextUrl);
  }, []);

  useEffect(() => {
    void ensureCsrfToken();
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const hints = [
      { rel: "preconnect", href: "https://images.unsplash.com", crossOrigin: "anonymous" },
      { rel: "dns-prefetch", href: "https://images.unsplash.com" },
    ];

    const createdNodes = [];
    hints.forEach((hint) => {
      if (document.head.querySelector(`link[rel="${hint.rel}"][href="${hint.href}"]`)) return;
      const link = document.createElement("link");
      link.rel = hint.rel;
      link.href = hint.href;
      if (hint.crossOrigin) {
        link.crossOrigin = hint.crossOrigin;
      }
      document.head.appendChild(link);
      createdNodes.push(link);
    });

    return () => {
      createdNodes.forEach((node) => {
        if (node.parentNode) {
          node.parentNode.removeChild(node);
        }
      });
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await getCatalogState({ preferCache: true, force: false });
      if (cancelled) return;
      if (result.ok && result.data) {
        applyCatalogStateFromServer(result.data);
      }
      setCatalogReady(true);

      if (result.cache?.hit) {
        const freshResult = await getCatalogState({ preferCache: false, force: true });
        if (cancelled) return;
        if (freshResult.ok && freshResult.data) {
          applyCatalogStateFromServer(freshResult.data);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applyCatalogStateFromServer]);

  useEffect(() => {
    void refreshOrdersFromServer({ silent: true });
  }, [refreshOrdersFromServer]);

  useEffect(() => {
    if (!catalogReady) return undefined;
    let cancelled = false;
    let timerId = null;

    const scheduleNext = () => {
      if (cancelled) return;
      const isVisible = typeof document === "undefined" || document.visibilityState === "visible";
      timerId = window.setTimeout(() => {
        void pollRealtimeSync();
      }, isVisible ? 3500 : 10000);
    };

    const pollRealtimeSync = async (force = false) => {
      const result = await getRealtimeSyncStatus({
        force,
        preferCache: !force,
        maxAgeMs: force ? 0 : 2500,
      });
      if (cancelled || !result?.ok || !result.versions) {
        scheduleNext();
        return;
      }

      const previousVersions = realtimeSyncVersionsRef.current;
      const nextVersions = {
        global: Math.max(0, Number(result.versions.global) || 0),
        catalog: Math.max(0, Number(result.versions.catalog) || 0),
        orders: Math.max(0, Number(result.versions.orders) || 0),
        users: Math.max(0, Number(result.versions.users) || 0),
        userState: Math.max(0, Number(result.versions.userState) || 0),
        currentUserStateVersion: Math.max(0, Number(result.currentUser?.stateVersion) || 0),
      };
      realtimeSyncVersionsRef.current = nextVersions;

      const catalogChanged = nextVersions.catalog > Math.max(0, Number(previousVersions.catalog) || 0);
      const ordersChanged = nextVersions.orders > Math.max(0, Number(previousVersions.orders) || 0);
      const usersChanged = nextVersions.users > Math.max(0, Number(previousVersions.users) || 0);
      const userStateChanged = Boolean(currentUser?.id)
        && nextVersions.currentUserStateVersion > Math.max(0, Number(previousVersions.currentUserStateVersion) || 0);

      if (catalogChanged && !(showAdminPanel && isAdmin && adminTab === "producto")) {
        const catalogResult = await getCatalogState({ preferCache: false, force: true });
        if (!cancelled && catalogResult.ok && catalogResult.data) {
          applyCatalogStateFromServer(catalogResult.data);
        }
      }

      if (ordersChanged && (currentUser?.id || isAdmin)) {
        void refreshOrdersFromServer({
          silent: true,
          force: true,
          preferCache: false,
          notifyAdminOnNew: Boolean(isAdmin),
        });
      }

      if (usersChanged && isAdmin && showAdminPanel && (adminTab === "usuarios" || adminTab === "resumen")) {
        void refreshAdminUsers({
          silent: true,
          force: true,
          preferCache: false,
        });
      }

      if (userStateChanged) {
        const sessionResult = await getUserSessionStatus();
        if (!cancelled) {
          if (sessionResult.ok && sessionResult.authenticated && sessionResult.user) {
            setCurrentUser(sessionResult.user);
          } else {
            setCurrentUser(null);
          }
        }
      }

      scheduleNext();
    };

    const handleFocus = () => {
      void pollRealtimeSync(true);
    };
    const handleOnline = () => {
      void pollRealtimeSync(true);
    };
    const handleVisibility = () => {
      if (typeof document === "undefined") return;
      if (document.visibilityState !== "visible") return;
      void pollRealtimeSync(true);
    };

    window.addEventListener("focus", handleFocus);
    window.addEventListener("online", handleOnline);
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibility);
    }
    void pollRealtimeSync(true);

    return () => {
      cancelled = true;
      if (timerId) {
        window.clearTimeout(timerId);
      }
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("online", handleOnline);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibility);
      }
    };
  }, [
    adminTab,
    applyCatalogStateFromServer,
    catalogReady,
    currentUser?.id,
    isAdmin,
    refreshAdminUsers,
    refreshOrdersFromServer,
    showAdminPanel,
  ]);

  useEffect(() => {
    if (!showAdminPanel || !isAdmin || !liveOrdersEnabled) return undefined;

    void refreshOrdersFromServer({
      silent: true,
      preferCache: true,
      force: false,
      notifyAdminOnNew: true,
    });

    const intervalId = window.setInterval(() => {
      void refreshOrdersFromServer({
        silent: true,
        preferCache: true,
        force: false,
        notifyAdminOnNew: true,
      });
    }, 30000);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [showAdminPanel, isAdmin, liveOrdersEnabled, refreshOrdersFromServer]);

  useEffect(() => {
    if (!catalogReady) return undefined;
    let cancelled = false;

    const revalidateCatalog = async () => {
      if (cancelled) return;
      if (showAdminPanel && isAdmin && adminTab === "producto") return;
      const result = await getCatalogState({ preferCache: false, force: true });
      if (cancelled) return;
      if (result.ok && result.data) {
        applyCatalogStateFromServer(result.data);
      }
    };

    const visibilityHandler = () => {
      if (typeof document === "undefined") return;
      if (document.visibilityState !== "visible") return;
      void revalidateCatalog();
    };

    window.addEventListener("focus", revalidateCatalog);
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", visibilityHandler);
    }
    const intervalId = window.setInterval(() => {
      void revalidateCatalog();
    }, 90000);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", revalidateCatalog);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", visibilityHandler);
      }
      window.clearInterval(intervalId);
    };
  }, [catalogReady, showAdminPanel, isAdmin, adminTab, applyCatalogStateFromServer]);

  useEffect(() => {
    if (!showAdminPanel || !isAdmin) return;
    if (adminTab !== "seguridad" && adminTab !== "resumen") return;

    const lastSnapshot = securityMetricsGeneratedAt || securityMetricsUpdatedAt;
    const snapshotTime = lastSnapshot ? new Date(lastSnapshot).getTime() : 0;
    const shouldRefresh = !snapshotTime || (Date.now() - snapshotTime > 45000);
    if (!shouldRefresh) return;

    void refreshSecurityMetrics({ silent: true });
  }, [
    showAdminPanel,
    isAdmin,
    adminTab,
    securityMetricsGeneratedAt,
    securityMetricsUpdatedAt,
    refreshSecurityMetrics,
  ]);

  useEffect(() => {
    if (!showAdminPanel || !isAdmin) return;
    if (adminTab !== "usuarios" && adminTab !== "resumen") return;

    const snapshotTime = adminUsersUpdatedAt ? new Date(adminUsersUpdatedAt).getTime() : 0;
    const shouldRefresh = !snapshotTime || (Date.now() - snapshotTime > 45000);
    if (!shouldRefresh) return;

    void refreshAdminUsers({ silent: true });
  }, [
    showAdminPanel,
    isAdmin,
    adminTab,
    adminUsersUpdatedAt,
    refreshAdminUsers,
  ]);

  useEffect(() => {
    if (!catalogReady || !isAdmin) return undefined;
    if (catalogSyncTimeoutRef.current) {
      window.clearTimeout(catalogSyncTimeoutRef.current);
    }
    catalogSyncTimeoutRef.current = window.setTimeout(async () => {
      const result = await syncCatalogSnapshot({}, { silent: true });
      if (!result.ok) {
        if (!catalogSyncErrorShownRef.current) {
          showToastMessage("No pudimos sincronizar catalogo seguro con el servidor.", "warning");
          catalogSyncErrorShownRef.current = true;
        }
        return;
      }
      catalogSyncErrorShownRef.current = false;
    }, 700);
    return () => {
      if (catalogSyncTimeoutRef.current) {
        window.clearTimeout(catalogSyncTimeoutRef.current);
      }
    };
  }, [
    catalogReady,
    isAdmin,
    products,
    coupons,
    contactSettings,
    storeSettings,
    productTypeRecords,
    filterTagRecords,
    showToastMessage,
    syncCatalogSnapshot,
  ]);

  useEffect(() => {
    if (!catalogReady || !isAdmin) return;
    if (storageBackend !== "local-file") return;
    if (storageBackendWarningShownRef.current) return;
    storageBackendWarningShownRef.current = true;
    showToastMessage(
      "El servidor sigue en almacenamiento local temporal. Configura KV_REST_API_URL y KV_REST_API_TOKEN en Vercel para sincronizacion real entre dispositivos.",
      "warning",
    );
  }, [catalogReady, isAdmin, showToastMessage, storageBackend]);

  useEffect(() => {
    removeStorage(STORAGE_KEYS.products);
    removeStorage(STORAGE_KEYS.contact);
    removeStorage(STORAGE_KEYS.store);
    removeStorage(STORAGE_KEYS.productTypes);
    removeStorage(STORAGE_KEYS.filterTags);
    removeStorage("atelier-password-resets-v1");
    removeStorage("atelier-orders-v1");
    removeStorage("atelier-coupons-v1");
    removeStorage("atelier-admin-session-v2");
    removeStorage("atelier-admin-lock-v1");
    removeStorage("atelier-users-v1");
    removeStorage("atelier-user-session-v1");
  }, []);

  useEffect(() => () => {
    if (typeof window === "undefined") return;
    orderPatchTimersRef.current.forEach((entry) => {
      if (entry?.id) window.clearTimeout(entry.id);
    });
    orderPatchTimersRef.current.clear();
  }, []);

  useEffect(() => {
    if (!adminSession) return undefined;
    const remaining = adminSession.expiresAt - Date.now();
    if (remaining <= 0) {
      setAdminSession(null);
      setShowAdminPanel(false);
      setEditorMessage("La sesion de administracion expiro por seguridad.");
      setEditorError("");
      return undefined;
    }
    const timerId = window.setTimeout(() => {
      setAdminSession(null);
      setShowAdminPanel(false);
      setSelectedProduct(null);
      setEditorMessage("La sesion de administracion expiro por seguridad.");
      setEditorError("");
    }, remaining);
    return () => window.clearTimeout(timerId);
  }, [adminSession]);

  useEffect(() => {
    if (!isAdmin || typeof window === "undefined") return undefined;
    let lastTouch = Date.now();
    let syncing = false;
    let cancelled = false;
    const touchSession = async () => {
      const now = Date.now();
      if (now - lastTouch < 60000 || syncing) return;
      lastTouch = now;
      syncing = true;
      try {
        const result = await touchAdminSession();
        if (cancelled) return;
        if (result.ok && result.isAdmin && result.session) {
          adminTouchWarningShownRef.current = false;
          setAdminSession({
            username: result.session.username,
            expiresAt: Number(result.session.expiresAt) || 0,
            issuedAt: Number(result.session.issuedAt) || Date.now(),
          });
          return;
        }

        const status = Number(result?.status) || 0;
        if (status === 401 || status === 403) {
          setAdminSession(null);
          setShowAdminPanel(false);
          setSelectedProduct(null);
          setEditorMessage("La sesion de administracion expiro por seguridad.");
          setEditorError("");
          return;
        }

        if (!adminTouchWarningShownRef.current) {
          adminTouchWarningShownRef.current = true;
          showToastMessage("No pudimos refrescar la sesion admin. Reintentaremos automaticamente.", "warning");
        }
      } finally {
        syncing = false;
      }
    };
    window.addEventListener("pointerdown", touchSession);
    window.addEventListener("keydown", touchSession);
    return () => {
      cancelled = true;
      window.removeEventListener("pointerdown", touchSession);
      window.removeEventListener("keydown", touchSession);
    };
  }, [isAdmin, showToastMessage]);

  useEffect(() => {
    productsRef.current = products;
  }, [products]);

  useEffect(() => {
    couponsRef.current = coupons;
  }, [coupons]);

  useEffect(() => {
    cartRef.current = cart;
  }, [cart]);

  useEffect(() => {
    favoritesRef.current = favorites;
  }, [favorites]);

  useEffect(() => {
    contactSettingsRef.current = contactSettings;
  }, [contactSettings]);

  useEffect(() => {
    storeSettingsRef.current = storeSettings;
  }, [storeSettings]);

  useEffect(() => {
    productTypeRecordsRef.current = productTypeRecords;
  }, [productTypeRecords]);

  useEffect(() => {
    filterTagRecordsRef.current = filterTagRecords;
  }, [filterTagRecords]);

  useEffect(() => {
    const editingContact =
      showAdminPanel
      && isAdmin
      && adminTab === "contacto";
    if (editingContact) return;
    setContactDraft(contactSettings);
  }, [adminTab, contactSettings, isAdmin, showAdminPanel]);

  useEffect(() => {
    const editingStoreText =
      showAdminPanel
      && isAdmin
      && (adminTab === "portada" || adminTab === "contacto");
    if (editingStoreText) return;
    setStoreDraft(storeSettings);
  }, [adminTab, isAdmin, showAdminPanel, storeSettings]);

  useEffect(() => {
    if (!toast) return undefined;
    const timeoutId = window.setTimeout(() => setToast(null), TOAST_DURATION_MS);
    return () => window.clearTimeout(timeoutId);
  }, [toast]);

  useEffect(() => {
    const availableColors = productForm.colorsData.map((color) => color.name.trim()).filter(Boolean);
    if (!availableColors.includes(previewColor)) {
      setPreviewColor(availableColors[0] || "");
      setPreviewImageIndex(0);
    }
  }, [productForm.colorsData, previewColor]);

  useEffect(() => {
    if (!selectedProduct) return;
    const freshProduct = products.find((product) => product.id === selectedProduct.id);
    if (!freshProduct) {
      setSelectedProduct(null);
      return;
    }
    if (freshProduct !== selectedProduct) {
      setSelectedProduct(freshProduct);
    }
  }, [products, selectedProduct]);

  useEffect(() => {
    setCart((previous) => {
      const next = previous
        .map((item) => {
          const product = productsById.get(normalizeEntityId(item.id));
          if (!product) return null;
          return {
            ...item,
            id: normalizeEntityId(item.id),
            name: product.name,
            price: product.price,
            image: getCurrentImageForProduct(product, item.color),
          };
        })
        .filter(Boolean);

      const unchanged = next.length === previous.length && next.every((item, index) => {
        const current = previous[index];
        if (!current) return false;
        return item.id === current.id
          && item.key === current.key
          && item.name === current.name
          && item.color === current.color
          && item.size === current.size
          && item.quantity === current.quantity
          && item.price === current.price
          && item.image === current.image;
      });

      return unchanged ? previous : next;
    });
  }, [products, productsById]);

  useEffect(() => {
    setProductTypeRecords((previous) => products.reduce((records, product) => ensureManagedEntityExists(records, product.productType || "General", "product-type"), previous));
    setFilterTagRecords((previous) => products.flatMap((product) => product.filterTags || []).reduce((records, tag) => ensureManagedEntityExists(records, tag, "filter-tag"), previous));
  }, [products]);

  useEffect(() => {
    if (isAdmin) return;
    setCart((previous) => {
      const normalized = normalizeStoredCart(previous);
      const filtered = normalized.filter((item) => {
        const product = productsById.get(normalizeEntityId(item.id));
        return Boolean(product) && product.isPublic !== false;
      });
      if (filtered.length !== normalized.length) return filtered;
      const unchanged = filtered.length === previous.length && filtered.every((item, index) => {
        const current = previous[index];
        return current
          && item.key === current.key
          && item.id === current.id
          && item.color === current.color
          && item.size === current.size
          && item.quantity === current.quantity;
      });
      return unchanged ? previous : filtered;
    });
  }, [productsById, isAdmin]);

  useEffect(() => {
    if (isAdmin) return;
    setFavorites((previous) => {
      const normalized = normalizeStoredFavorites(previous);
      const filtered = normalized.filter((favoriteId) => {
        const product = productsById.get(favoriteId);
        return Boolean(product) && product.isPublic !== false;
      });
      if (filtered.length !== normalized.length) return filtered;
      const unchanged = filtered.length === previous.length && filtered.every((item, index) => item === previous[index]);
      return unchanged ? previous : filtered;
    });
  }, [productsById, isAdmin]);

  useEffect(() => {
    if (productTypeFilter !== "Todos" && !productTypeOptions.includes(productTypeFilter)) {
      setProductTypeFilter("Todos");
    }
  }, [productTypeOptions, productTypeFilter]);

  useEffect(() => {
    if (adminTab !== "producto") return;
    if (productForm.id) return;

    const activeTypeSet = new Set(activeProductTypeNames.map((item) => item.toLowerCase()));
    const activeTagSet = new Set(activeFilterTagNames.map((item) => item.toLowerCase()));
    const fallbackType = activeProductTypeNames[0] || "General";

    setProductForm((previous) => {
      let changed = false;
      const currentType = normalizeOptionLabel(previous.productType || "");
      const safeType = currentType && activeTypeSet.has(currentType.toLowerCase())
        ? currentType
        : fallbackType;
      if (safeType !== previous.productType) {
        changed = true;
      }

      const currentTags = splitFilterTagsText(previous.filterTagsText || "");
      const safeTags = currentTags.filter((tag) => activeTagSet.has(tag.toLowerCase()));
      const safeTagsText = safeTags.join(", ");
      if (safeTagsText !== (previous.filterTagsText || "")) {
        changed = true;
      }

      const safePublic = previous.isPublic !== false;
      if (safePublic !== previous.isPublic) {
        changed = true;
      }

      if (!changed) return previous;
      return {
        ...previous,
        productType: safeType,
        filterTagsText: safeTagsText,
        isPublic: safePublic,
      };
    });
  }, [adminTab, productForm.id, activeProductTypeNames, activeFilterTagNames]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const mediaQuery = window.matchMedia("(max-width: 760px)");
    const syncViewport = () => setIsMobileViewport(mediaQuery.matches);
    syncViewport();
    mediaQuery.addEventListener?.("change", syncViewport);
    window.addEventListener("resize", syncViewport);
    return () => {
      mediaQuery.removeEventListener?.("change", syncViewport);
      window.removeEventListener("resize", syncViewport);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const sections = [
      { id: "inicio", tab: "inicio" },
      { id: "destacados", tab: "inicio" },
      { id: "coleccion", tab: "catalogo" },
      { id: "recomendados", tab: "inicio" },
      { id: "contacto", tab: "inicio" },
    ];

    const syncActiveSection = () => {
      if (showCartSummary || showFavoritesPanel) return;
      const pivot = window.innerHeight * 0.32;
      let nextTab = "inicio";
      for (const section of sections) {
        const node = document.getElementById(section.id);
        if (!node) continue;
        if (node.getBoundingClientRect().top <= pivot) {
          nextTab = section.tab;
        }
      }
      setActiveMobileSection(nextTab);
    };

    syncActiveSection();
    window.addEventListener("scroll", syncActiveSection, { passive: true });
    window.addEventListener("resize", syncActiveSection);
    return () => {
      window.removeEventListener("scroll", syncActiveSection);
      window.removeEventListener("resize", syncActiveSection);
    };
  }, [showCartSummary, showFavoritesPanel]);

  const shouldLockBody = Boolean(
    selectedProduct
    || showCartSummary
    || showFavoritesPanel
    || showOrdersModal
    || showUserAuth
    || showProfileModal
    || referenceOrder
    || (showMobileNav && isMobileViewport)
    || (showAdminPanel && isAdmin)
  );

  useEffect(() => {
    if (!showProfileQuickMenu) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === "Escape") {
        setShowProfileQuickMenu(false);
      }
    };
    const closeOnResize = () => {
      setShowProfileQuickMenu(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", closeOnResize);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", closeOnResize);
    };
  }, [showProfileQuickMenu]);

  useEffect(() => {
    if (currentUser?.id) return;
    setShowProfileQuickMenu(false);
  }, [currentUser?.id]);

  useBodyScrollLock(shouldLockBody);
  useMobileNavGuards({
    setShowMobileNav,
    selectedProduct,
    showCartSummary,
    showFavoritesPanel,
    showOrdersModal,
    showUserAuth,
    showProfileModal,
    showAdminPanel,
  });

  useEffect(() => () => {
    confettiTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
    confettiTimersRef.current.clear();
    if (flyToCartTimerRef.current) {
      window.clearTimeout(flyToCartTimerRef.current);
      flyToCartTimerRef.current = null;
    }
    if (userStateSyncTimerRef.current) {
      window.clearTimeout(userStateSyncTimerRef.current);
      userStateSyncTimerRef.current = null;
    }
  }, []);

  const buildWhatsAppOrderMessage = (order, { variant = "full" } = {}) => {
    const safeVariant = variant === "compact" || variant === "minimal" ? variant : "full";
    const deliveryMode = order.deliveryType === "delivery" ? "Envio a domicilio" : "Retiro en local";
    if (safeVariant === "minimal") {
      return [
        `Hola Adriego Store, pedido ${order.code}.`,
        `Cliente: ${order.customerName || "Cliente"}`,
        `Entrega: ${deliveryMode}`,
        `Total: ${currency(order.total || order.subtotal)}`,
        "Ayudame con disponibilidad y forma de pago, por favor.",
      ].filter(Boolean).join("\n");
    }

    const safeItems = Array.isArray(order.items) ? order.items : [];
    const compactItems = safeVariant === "compact" ? safeItems.slice(0, 3) : safeItems;
    const remainingItems = Math.max(0, safeItems.length - compactItems.length);
    return [
      `Hola Adriego Store, quiero hacer este pedido. Codigo: ${order.code}`,
      "",
      `Cliente: ${order.customerName || "Cliente"}`,
      order.customerPhone ? `Telefono: ${order.customerPhone}` : "",
      order.customerEmail ? `Correo: ${order.customerEmail}` : "",
      `Entrega: ${deliveryMode}`,
      order.deliveryType === "delivery"
        ? `Datos envio: ${order.deliveryFullName || order.customerName || "Cliente"} - CI ${order.deliveryIdNumber || "N/D"} - ${order.deliveryCity || "Ciudad"}`
        : "",
      order.deliveryType === "delivery" ? `Direccion: ${order.deliveryAddress || "N/D"}` : "",
      order.deliveryType === "delivery" ? `Referencia: ${order.deliveryReference || "N/D"}` : "",
      order.deliveryType === "delivery" ? `Telefono entrega: ${order.deliveryPhone || order.customerPhone || "N/D"}` : "",
      order.deliveryType !== "delivery" && order.pickupAddress ? `Retiro en: ${order.pickupAddress}` : "",
      order.deliveryType !== "delivery" && order.pickupNote ? `Referencia local: ${order.pickupNote}` : "",
      "",
      ...compactItems.map((item, index) => `${index + 1}. ${item.name} | Color: ${item.color} | Talla: ${item.size} | Cantidad: ${item.quantity} | ${currency(item.price * item.quantity)}`),
      safeVariant === "compact" && remainingItems > 0 ? `+${remainingItems} prenda(s) adicional(es).` : "",
      "",
      `Subtotal: ${currency(order.subtotal)}`,
      order.discountAmount > 0 ? `Descuento: -${currency(order.discountAmount)}` : "",
      order.couponCode ? `Cupon aplicado: ${order.couponCode}` : "",
      `Total final: ${currency(order.total || order.subtotal)}`,
      "",
      "Por favor indiquenme disponibilidad y forma de pago.",
    ].filter(Boolean).join("\n");
  };

  const buildWhatsAppOrderUrl = (order, serverWhatsAppUrl = "", options = {}) => {
    const isMobile = Boolean(options.mobile);
    const WHATSAPP_URL_MAX_LENGTH = isMobile ? 1300 : 2600;
    const messageVariants = isMobile
      ? ["compact", "minimal", "full"]
      : ["full", "compact", "minimal"];
    const safeServerUrl = normalizeSafeUrl(serverWhatsAppUrl);
    const safeLink = normalizeSafeUrl(contactSettings.whatsappLink || "");
    const safeNumber = normalizeWhatsAppInternationalNumber(contactSettings.whatsappNumber || "");
    const candidates = [];

    const pushCandidate = (url, mode) => {
      const safeUrl = normalizeSafeUrl(url);
      if (!safeUrl) return;
      if (candidates.some((entry) => entry.url === safeUrl)) return;
      candidates.push({ url: safeUrl, mode });
    };

    pushCandidate(safeServerUrl, "server");

    if (safeNumber) {
      messageVariants.forEach((variant) => {
        const message = buildWhatsAppOrderMessage(order, { variant });
        if (!isMobile) pushCandidate(buildWhatsAppApiSendLink(safeNumber, message), `api-${variant}`);
        pushCandidate(buildWhatsAppLink(safeNumber, message), `number-${variant}`);
        if (!isMobile) pushCandidate(buildWhatsAppWebSendLink(safeNumber, message), `web-${variant}`);
      });
    }
    if (safeLink) {
      messageVariants.forEach((variant) => {
        const message = buildWhatsAppOrderMessage(order, { variant });
        pushCandidate(buildWhatsAppLinkFromBase(safeLink, message), `link-${variant}`);
      });
    }

    const fitting = candidates.find((entry) => entry.url.length <= WHATSAPP_URL_MAX_LENGTH);
    if (fitting) return fitting;

    const sortedByLength = [...candidates].sort((left, right) => left.url.length - right.url.length);
    return sortedByLength[0] || { url: "", mode: "none" };
  };

  const buildWhatsAppOrderFollowupMessage = (order) => {
    const normalizedStatus = normalizeOrderStatusForOrder(order?.status, order?.deliveryType);
    const deliveryMode = order?.deliveryType === "delivery" ? "Envio a domicilio" : "Retiro en local";
    const statusSummary = normalizedStatus === "Listo para retiro"
      ? "listo para retiro"
      : (normalizedStatus === "Enviado" ? "enviado" : normalizedStatus.toLowerCase());
    return [
      `Hola Adriego Store, soy ${order?.customerName || "cliente"}.`,
      `Mi pedido ${order?.code || ""} aparece como ${statusSummary}.`,
      `Tipo de entrega: ${deliveryMode}.`,
      order?.deliveryType === "delivery"
        ? "Quiero confirmar la entrega a domicilio."
        : "Quiero coordinar el retiro en local.",
      "Gracias.",
    ].filter(Boolean).join("\n");
  };

  const buildWhatsAppOrderFollowupUrl = (order, options = {}) => {
    const isMobile = Boolean(options.mobile);
    const safeNumber = normalizeWhatsAppInternationalNumber(contactSettings.whatsappNumber || "");
    const safeLink = normalizeSafeUrl(contactSettings.whatsappLink || "");
    const message = buildWhatsAppOrderFollowupMessage(order);

    if (safeNumber) {
      if (!isMobile) {
        return (
          buildWhatsAppApiSendLink(safeNumber, message)
          || buildWhatsAppLink(safeNumber, message)
          || buildWhatsAppWebSendLink(safeNumber, message)
        );
      }
      return buildWhatsAppLink(safeNumber, message) || buildWhatsAppApiSendLink(safeNumber, message);
    }
    if (safeLink) return buildWhatsAppLinkFromBase(safeLink, message) || safeLink;
    return "";
  };

  const handleSelection = (productId, field, value) => {
    const product = productsById.get(productId);
    setSelections((previous) => {
      const current = previous[productId] || {};
      if (!product) {
        return {
          ...previous,
          [productId]: {
            ...current,
            [field]: value,
          },
        };
      }

      if (field === "color") {
        const fallbackSelection = getSelectionForColor(product, {
          color: value,
          size: current.size,
        });
        const nextSizes = getSizesForColor(product, fallbackSelection.color);
        const currentSizeStock = current.size ? getStockForVariant(product, fallbackSelection.color, current.size) : 0;
        return {
          ...previous,
          [productId]: {
            color: fallbackSelection.color,
            size: currentSizeStock > 0 && nextSizes.includes(current.size)
              ? current.size
              : (fallbackSelection.size || nextSizes[0] || product.sizes[0]),
          },
        };
      }

      return {
        ...previous,
        [productId]: {
          ...current,
          [field]: value,
        },
      };
    });
  };

  const clearCartState = () => {
    setCart([]);
    removeStorage(STORAGE_KEYS.cart);
    setShowCartSummary(false);
  };

  const openProductDetail = (product, selectionOverride = null, options = {}) => {
    if (!product) return;
    if (!isAdmin && product.isPublic === false) {
      showToastMessage("Este producto ya no esta visible en catalogo.", "info");
      return;
    }
    if (!options?.fromCartEdit) {
      setEditingCartItemKey(null);
    }
    const preferredInput = selectionOverride || selections[product.id] || {};
    const preferred = getFallbackSelection(product, preferredInput);

    setSelections((previous) => ({
      ...previous,
      [product.id]: {
        color: preferred.color,
        size: preferred.size,
      },
    }));

    setShowCartSummary(false);
    setShowFavoritesPanel(false);
    window.setTimeout(() => {
      setSelectedProduct(product);
    }, 150);
  };

  const closeProductModal = ({ returnToCart = false } = {}) => {
    const wasEditingCartItem = Boolean(editingCartItemKey);
    setSelectedProduct(null);
    setEditingCartItemKey(null);
    if (returnToCart && wasEditingCartItem) {
      setShowCartSummary(true);
    }
  };

  const browseCatalogFromModal = () => {
    setShowCartSummary(false);
    setShowFavoritesPanel(false);
    if (typeof document === "undefined") return;
    document.getElementById("coleccion")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const scrollToSection = (sectionId) => {
    if (typeof document === "undefined") return;
    document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const addToCart = (product, animationMeta = null, selectionOverride = null) => {
    if (!isAdmin && product?.isPublic === false) {
      showToastMessage("Este producto ya no esta disponible para compra.", "info");
      return;
    }
    const selection = getFallbackSelection(product, selectionOverride || selections[product.id] || {});
    if ((selections[product.id]?.color !== selection.color || selections[product.id]?.size !== selection.size) && selection.availableStock > 0) {
      setSelections((previous) => ({
        ...previous,
        [product.id]: { color: selection.color, size: selection.size },
      }));
    }
    const key = `${product.id}-${selection.color}-${selection.size}`;
    const chosenImage = getCurrentImageForProduct(product, selection.color);
    const availableStock = selection.availableStock;
    let cartWasUpdated = false;

    setCart((previous) => {
      if (editingCartItemKey) {
        const editingItem = previous.find((item) => item.key === editingCartItemKey);
        if (!editingItem) {
          showToastMessage("No pudimos encontrar el item que estabas editando.", "error");
          return previous;
        }

        if (availableStock <= 0) {
          showToastMessage("Esa talla esta agotada por ahora.", "error");
          return previous;
        }

        const requestedQuantity = Math.max(1, Number(editingItem.quantity) || 1);
        const adjustedQuantity = Math.min(requestedQuantity, availableStock);

        if (key === editingItem.key) {
          if (adjustedQuantity < requestedQuantity) {
            showToastMessage(`Stock limitado para esa variante. Ajustamos a ${adjustedQuantity} unidad(es).`, "warning");
          } else {
            showToastMessage("Cambios guardados en tu carrito.", "success");
          }
          cartWasUpdated = true;
          return previous.map((item) => (
            item.key === editingItem.key
              ? {
                  ...item,
                  id: product.id,
                  name: product.name,
                  price: product.price,
                  image: chosenImage,
                  color: selection.color,
                  size: selection.size,
                  quantity: adjustedQuantity,
                }
              : item
          ));
        }

        const withoutEditing = previous.filter((item) => item.key !== editingItem.key);
        const duplicate = withoutEditing.find((item) => item.key === key);

        if (duplicate) {
          const mergedDesired = duplicate.quantity + adjustedQuantity;
          const mergedQuantity = Math.min(mergedDesired, availableStock);
          if (mergedQuantity < mergedDesired) {
            showToastMessage(`Se fusiono con un item existente y se ajusto a ${mergedQuantity} unidad(es) por stock.`, "warning");
          } else {
            showToastMessage("Cambios guardados y productos fusionados en tu carrito.", "success");
          }
          cartWasUpdated = true;
          return withoutEditing.map((item) => (
            item.key === key
              ? {
                  ...item,
                  id: product.id,
                  name: product.name,
                  price: product.price,
                  image: chosenImage,
                  color: selection.color,
                  size: selection.size,
                  quantity: mergedQuantity,
                }
              : item
          ));
        }

        if (adjustedQuantity < requestedQuantity) {
          showToastMessage(`Stock limitado para esa variante. Ajustamos a ${adjustedQuantity} unidad(es).`, "warning");
        } else {
          showToastMessage("Cambios guardados en tu carrito.", "success");
        }
        cartWasUpdated = true;

        return [
          ...withoutEditing,
          {
            ...editingItem,
            key,
            id: product.id,
            name: product.name,
            price: product.price,
            image: chosenImage,
            color: selection.color,
            size: selection.size,
            quantity: adjustedQuantity,
          },
        ];
      }

      const existing = previous.find((item) => item.key === key);
      if (existing) {
        if (existing.quantity >= availableStock) {
          showToastMessage("Ya alcanzaste el stock disponible para esa talla.", "warning");
          return previous;
        }
        showToastMessage("Cantidad actualizada en tu carrito.", "success");
        cartWasUpdated = true;
        return previous.map((item) => item.key === key ? { ...item, quantity: item.quantity + 1 } : item);
      }
      if (availableStock <= 0) {
        showToastMessage("Esa talla esta agotada por ahora.", "error");
        return previous;
      }
      showToastMessage(`"${product.name}" se agrego al carrito.`, "success");
      cartWasUpdated = true;
      return [
        ...previous,
        {
          key,
          id: product.id,
          name: product.name,
          price: product.price,
          image: chosenImage,
          color: selection.color,
          size: selection.size,
          quantity: 1,
        },
      ];
    });

    if (!cartWasUpdated) return;
    triggerFlyToCart({
      sourceElement: animationMeta?.sourceElement,
      image: animationMeta?.image || chosenImage,
    });
  };

  const updateQuantity = (key, delta) => {
    setCart((previous) => previous
      .map((item) => {
        if (item.key !== key) return item;
        const product = productsById.get(normalizeEntityId(item.id));
        const availableStock = getStockForVariant(product, item.color, item.size);
        const nextQuantity = item.quantity + delta;
        if (nextQuantity > availableStock) return item;
        return nextQuantity <= 0 ? null : { ...item, quantity: nextQuantity };
      })
      .filter(Boolean));
  };

  const removeItem = (key) => {
    setCart((previous) => previous.filter((item) => item.key !== key));
  };

  const handleAuthFieldChange = (field, value) => {
    if (field === "email" && authMode === "reset" && authResetEmailLocked) {
      return;
    }
    let nextValue = value;
    if (field === "phone") {
      nextValue = normalizeUserPhoneNumber(value);
    } else if (field === "email") {
      nextValue = sanitizeLine(value).slice(0, AUTH_FIELD_LIMITS.email);
    } else if (field === "username") {
      nextValue = normalizeUsername(value);
    } else if (field === "name") {
      nextValue = sanitizeLine(value).slice(0, AUTH_FIELD_LIMITS.name);
    } else if (field === "resetToken") {
      nextValue = sanitizeLine(value).slice(0, AUTH_FIELD_LIMITS.resetToken);
    } else if (field === "password" || field === "confirmPassword") {
      nextValue = String(value || "").slice(0, AUTH_FIELD_LIMITS.password);
    }
    setAuthForm((previous) => ({ ...previous, [field]: nextValue }));
    if (authError) setAuthError("");
  };

  const openUserAuth = ({
    mode = "login",
    destination = null,
    error = "",
    email = "",
    resetToken = "",
  } = {}) => {
    setAuthResetEmailLocked(false);
    setAuthMode(mode);
    setPostAuthDestination(destination);
    setAuthError(error);
    setAuthBusy(false);
    setAuthPasswordVisible(false);
    setShowProfileModal(false);
    setShowProfileQuickMenu(false);
    setAuthForm((previous) => ({
      ...previous,
      email: email ? normalizeEmail(email).slice(0, AUTH_FIELD_LIMITS.email) : previous.email,
      resetToken: resetToken ? sanitizeLine(resetToken).slice(0, AUTH_FIELD_LIMITS.resetToken) : "",
      password: "",
      confirmPassword: "",
    }));
    setShowUserAuth(true);
  };

  const closeUserAuth = () => {
    setShowUserAuth(false);
    setAuthError("");
    setAuthBusy(false);
    setAuthPasswordVisible(false);
    setAuthResetEmailLocked(false);
    setPostAuthDestination(null);
    setAuthForm((previous) => ({ ...previous, password: "", confirmPassword: "", resetToken: "" }));
  };

  const resetAuthForm = () => {
    setAuthForm({ ...AUTH_FORM_DEFAULTS });
    setAuthBusy(false);
    setAuthPasswordVisible(false);
  };

  const handleCopyOrderCode = async (orderCode) => {
    const copied = await copyTextToClipboard(orderCode);
    showToastMessage(copied ? `Referencia ${orderCode} copiada.` : "No pudimos copiar la referencia.", copied ? "success" : "error");
  };

  const handleOpenOrderWhatsApp = (order) => {
    const normalizedStatus = normalizeOrderStatusForOrder(order?.status, order?.deliveryType);
    if (normalizedStatus !== "Listo para retiro" && normalizedStatus !== "Enviado") {
      showToastMessage("WhatsApp se habilita cuando el pedido esta enviado o listo para retiro.", "info");
      return;
    }

    const pendingExternalWindow = preOpenExternalWindow();
    const targetUrl = buildWhatsAppOrderFollowupUrl(order, { mobile: isMobileViewport });
    if (!targetUrl) {
      closeExternalWindow(pendingExternalWindow);
      showToastMessage("Configura un numero o enlace de WhatsApp para continuar.", "error");
      return;
    }

    const launchResult = launchWhatsAppUrl(targetUrl, {
      preferredWindow: pendingExternalWindow,
      isMobile: isMobileViewport,
      fallbackDelayMs: isMobileViewport ? 1300 : 900,
    });
    if (!launchResult.launched) {
      closeExternalWindow(pendingExternalWindow);
      showToastMessage("No pudimos abrir WhatsApp automaticamente. Intenta de nuevo.", "warning");
    }
  };

  const handleUserLogout = async ({ closeMobileNav = false } = {}) => {
    await logoutUserAccount();
    setCurrentUser(null);
    setOrderHistory([]);
    clearActiveCoupon();
    setShowProfileModal(false);
    setShowProfileQuickMenu(false);
    if (closeMobileNav) {
      setShowMobileNav(false);
    }
    showToastMessage("Sesion cerrada.", "success");
  };

  const resetSecurityMetricsData = async () => {
    if (securityMetricsResetBusy) return;
    setSecurityMetricsResetBusy(true);
    const result = await resetSecurityMetricsSnapshot();
    if (!result.ok) {
      const message = result.message || "No pudimos reiniciar las metricas.";
      setSecurityMetricsError(message);
      showToastMessage(message, "error");
      setSecurityMetricsResetBusy(false);
      return;
    }
    await refreshSecurityMetrics({ silent: true });
    setSecurityMetricsError("");
    setSecurityMetricsResetBusy(false);
    showToastMessage("Metricas de seguridad reiniciadas.", "success");
  };

  const handleAdminLogout = async ({ closeMobileNav = false } = {}) => {
    await logoutAdminSession();
    adminTouchWarningShownRef.current = false;
    adminOrdersHydratedRef.current = false;
    knownAdminOrderIdsRef.current = new Set();
    setAdminSession(null);
    setCoupons([]);
    setOrderHistory([]);
    setAdminUsers([]);
    setAdminUsersError("");
    setAdminUsersSearch("");
    setAdminUsersUpdatedAt("");
    setSecurityMetrics(null);
    setSecurityMetricsError("");
    setSecurityMetricsUpdatedAt("");
    setOrderLiveAlert(null);
    setContactSyncFeedback(null);
    setShowAdminPanel(false);
    setSelectedProduct(null);
    setEditorMessage("Sesion de administracion cerrada.");
    setEditorError("");
    if (closeMobileNav) {
      setShowMobileNav(false);
    }
    showToastMessage("Sesion administrativa cerrada.", "success");
  };

  const openAdminPanel = async ({ closeMobileNav = false } = {}) => {
    const result = await touchAdminSession();
    if (result.ok && result.isAdmin && result.session) {
      adminTouchWarningShownRef.current = false;
      setAdminSession({
        username: result.session.username,
        expiresAt: Number(result.session.expiresAt) || 0,
        issuedAt: Number(result.session.issuedAt) || Date.now(),
      });
      const catalogResult = await getCatalogState({ preferCache: true, force: false });
      if (catalogResult.ok && catalogResult.data) {
        applyCatalogStateFromServer(catalogResult.data);
        setCatalogReady(true);
      }
      await refreshSecurityMetrics({ silent: true, preferCache: true });
      await refreshAdminUsers({ silent: true, preferCache: true });
      await refreshOrdersFromServer({ silent: true, preferCache: true, notifyAdminOnNew: false });
      setOrderLiveAlert(null);
      setShowAdminPanel(true);
      setAdminTab("resumen");
      if (closeMobileNav) {
        setShowMobileNav(false);
      }
      return;
    }
    setAdminSession(null);
    setShowAdminPanel(false);
    if (closeMobileNav) {
      setShowMobileNav(false);
    }
    showToastMessage("La sesion administrativa expiro. Inicia sesion nuevamente.", "error");
  };

  const resetAddressBookEditor = () => {
    setAddressBookEditingId("");
    setAddressBookDraft({
      label: "",
      address: "",
      city: "",
      reference: "",
      phone: "",
      isDefault: false,
    });
  };

  const openProfileModal = (section = "datos") => {
    if (!currentUser?.id) {
      openUserAuth({ mode: "login" });
      return;
    }
    const normalizedAddressBook = normalizeAddressBook(currentUser.addressBook);
    const defaultAddress = getDefaultAddressBookEntry(normalizedAddressBook);
    const safeSection = section === "password" || section === "direccion" ? section : "datos";
    setProfileDraft({
      name: sanitizeLine(currentUser.name || ""),
      lastName: sanitizeLine(currentUser.lastName || ""),
      phone: normalizeUserPhoneNumber(currentUser.phone || ""),
      email: normalizeEmail(currentUser.email || ""),
      shippingAddress: sanitizeParagraph(defaultAddress?.address || currentUser.shippingAddress || ""),
      addressBook: normalizedAddressBook,
    });
    resetAddressBookEditor();
    setPasswordDraft({ currentPassword: "", newPassword: "", confirmPassword: "" });
    setProfileFeedback(null);
    setPasswordFeedback(null);
    setProfileModalSection(safeSection);
    setShowProfileQuickMenu(false);
    setShowProfileModal(true);
  };

  const openProfileQuickMenu = (event = null) => {
    if (!currentUser?.id) {
      openUserAuth({ mode: "login" });
      return;
    }
    const menuWidth = 232;
    const menuHeight = 212;
    const margin = 10;

    const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 360;
    const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 640;

    const triggerRect = event?.currentTarget?.getBoundingClientRect?.();
    const proposedLeft = triggerRect ? (triggerRect.right - menuWidth) : (viewportWidth - menuWidth - margin);
    const proposedTop = triggerRect ? (triggerRect.bottom + 8) : 86;

    const nextLeft = Math.max(margin, Math.min(proposedLeft, viewportWidth - menuWidth - margin));
    const nextTop = Math.max(66, Math.min(proposedTop, viewportHeight - menuHeight - margin));

    setProfileQuickMenuPosition({ top: nextTop, left: nextLeft });
    setShowProfileQuickMenu(true);
  };

  const openProfileActionFromMenu = (section) => {
    setShowProfileQuickMenu(false);
    openProfileModal(section);
  };

  const openOrdersFromProfileMenu = () => {
    setShowProfileQuickMenu(false);
    setShowOrdersModal(true);
  };

  const handleProfileFieldChange = (field, value) => {
    setProfileDraft((previous) => ({
      ...previous,
      [field]: field === "phone"
          ? normalizeUserPhoneNumber(value)
          : sanitizeLine(value),
    }));
  };

  const handleAddressBookDraftFieldChange = (field, value) => {
    setAddressBookDraft((previous) => ({
      ...previous,
      [field]: field === "isDefault"
        ? Boolean(value)
        : field === "phone"
          ? normalizeUserPhoneNumber(value)
          : field === "address" || field === "reference"
            ? sanitizeParagraph(value)
            : sanitizeLine(value),
    }));
  };

  const syncAddressBookForCurrentUser = async (nextBook = [], options = {}) => {
    if (!currentUser?.id) {
      return { ok: false, message: "Debes iniciar sesion para actualizar tu libreta." };
    }

    const normalizedAddressBook = normalizeAddressBook(nextBook);
    const defaultAddress = getDefaultAddressBookEntry(normalizedAddressBook);
    const response = await updateUserProfile({
      name: sanitizeLine(currentUser.name || ""),
      lastName: sanitizeLine(currentUser.lastName || ""),
      phone: normalizeUserPhoneNumber(currentUser.phone || ""),
      email: normalizeEmail(currentUser.email || ""),
      shippingAddress: sanitizeParagraph(defaultAddress?.address || ""),
      addressBook: normalizedAddressBook,
    });

    if (!response.ok || !response.user) {
      const errorMessage = options.errorMessage || response.message || "No pudimos sincronizar la libreta de direcciones.";
      if (!options.silent) {
        setProfileFeedback({ tone: "error", message: errorMessage });
      }
      return { ok: false, message: errorMessage };
    }

    const nextAddressBook = normalizeAddressBook(response.user.addressBook);
    const nextDefaultAddress = getDefaultAddressBookEntry(nextAddressBook);
    const nextUser = {
      ...response.user,
      shippingAddress: sanitizeParagraph(response.user.shippingAddress || nextDefaultAddress?.address || ""),
      addressBook: nextAddressBook,
    };
    setCurrentUser(nextUser);
    setProfileDraft((previous) => ({
      ...previous,
      shippingAddress: nextUser.shippingAddress,
      addressBook: nextAddressBook,
    }));

    if (options.successMessage) {
      setProfileFeedback({ tone: "success", message: options.successMessage });
    }

    return {
      ok: true,
      user: nextUser,
      addressBook: nextAddressBook,
      defaultAddress: nextDefaultAddress,
    };
  };

  const handleSelectAddressBookEntry = async (entryId) => {
    const normalizedEntryId = normalizeEntityId(entryId);
    if (!normalizedEntryId) return;
    const currentBook = normalizeAddressBook(profileDraft.addressBook);
    const selectedEntry = currentBook.find((entry) => String(entry.id) === normalizedEntryId);
    if (!selectedEntry) return;
    const nextBook = currentBook.map((entry) => ({
      ...entry,
      isDefault: String(entry.id) === normalizedEntryId,
    }));
    setProfileDraft((previous) => ({
      ...previous,
      shippingAddress: selectedEntry.address || previous.shippingAddress,
      addressBook: nextBook,
    }));
    await syncAddressBookForCurrentUser(nextBook, {
      successMessage: "Direccion principal actualizada.",
      errorMessage: "No pudimos actualizar la direccion principal.",
    });
  };

  const handleEditAddressBookEntry = (entryId) => {
    const normalizedEntryId = normalizeEntityId(entryId);
    if (!normalizedEntryId) return;
    const targetEntry = (profileDraft.addressBook || []).find((entry) => String(entry.id) === normalizedEntryId);
    if (!targetEntry) return;
    setAddressBookEditingId(normalizedEntryId);
    setAddressBookDraft({
      label: sanitizeLine(targetEntry.label || ""),
      address: sanitizeParagraph(targetEntry.address || ""),
      city: sanitizeLine(targetEntry.city || ""),
      reference: sanitizeParagraph(targetEntry.reference || ""),
      phone: normalizeUserPhoneNumber(targetEntry.phone || ""),
      isDefault: Boolean(targetEntry.isDefault),
    });
  };

  const handleDeleteAddressBookEntry = async (entryId) => {
    const normalizedEntryId = normalizeEntityId(entryId);
    if (!normalizedEntryId) return;
    const nextBook = normalizeAddressBook(
      (profileDraft.addressBook || []).filter((entry) => String(entry.id) !== normalizedEntryId),
    );
    setProfileDraft((previous) => ({
      ...previous,
      addressBook: nextBook,
      shippingAddress: sanitizeParagraph(getDefaultAddressBookEntry(nextBook)?.address || ""),
    }));
    if (String(addressBookEditingId || "") === normalizedEntryId) {
      resetAddressBookEditor();
    }
    await syncAddressBookForCurrentUser(nextBook, {
      successMessage: "Direccion eliminada de tu libreta.",
      errorMessage: "No pudimos eliminar la direccion en este momento.",
    });
  };

  const handleSaveAddressBookEntry = async () => {
    const normalizedEntry = normalizeAddressBookEntry({
      ...addressBookDraft,
      id: addressBookEditingId || createUid(),
    });
    if (!normalizedEntry || !normalizedEntry.address) {
      setProfileFeedback({ tone: "error", message: "Ingresa una direccion valida para guardarla." });
      return;
    }

    const currentBook = normalizeAddressBook(profileDraft.addressBook);
    const isEditing = Boolean(addressBookEditingId);
    const mergedBook = isEditing
      ? currentBook.map((entry) => (String(entry.id) === String(addressBookEditingId) ? normalizedEntry : entry))
      : [normalizedEntry, ...currentBook];
    const trimmedBook = mergedBook.slice(0, MAX_ADDRESS_BOOK_ENTRIES);
    const nextBook = normalizeAddressBook(trimmedBook.map((entry) => ({
      ...entry,
      isDefault: normalizedEntry.isDefault
        ? String(entry.id) === String(normalizedEntry.id)
        : entry.isDefault,
    })));

    setProfileDraft((previous) => ({
      ...previous,
      shippingAddress: sanitizeParagraph(getDefaultAddressBookEntry(nextBook)?.address || previous.shippingAddress),
      addressBook: nextBook,
    }));

    const syncResult = await syncAddressBookForCurrentUser(nextBook, {
      successMessage: addressBookEditingId ? "Direccion guardada correctamente." : "Direccion agregada a tu libreta.",
      errorMessage: "No pudimos guardar la direccion en tu libreta.",
    });
    if (syncResult.ok) {
      resetAddressBookEditor();
    }
  };

  const handleSaveProfile = async () => {
    if (!currentUser?.id) return;
    const email = normalizeEmail(profileDraft.email);
    const name = sanitizeLine(profileDraft.name);
    const lastName = sanitizeLine(profileDraft.lastName);
    const phone = normalizeUserPhoneNumber(profileDraft.phone);
    const addressBook = normalizeAddressBook(profileDraft.addressBook);
    const shippingAddress = sanitizeParagraph(getDefaultAddressBookEntry(addressBook)?.address || profileDraft.shippingAddress || "");

    if (!name) {
      setProfileFeedback({ tone: "error", message: "Ingresa tu nombre." });
      return;
    }
    if (!isValidEmail(email)) {
      setProfileFeedback({ tone: "error", message: "Ingresa un correo electronico valido." });
      return;
    }
    if (phone && phone.length !== AUTH_FIELD_LIMITS.phone) {
      setProfileFeedback({ tone: "error", message: "El telefono debe tener 10 digitos." });
      return;
    }

    const response = await updateUserProfile({
      name,
      lastName,
      phone,
      email,
      shippingAddress,
      addressBook,
    });
    if (!response.ok) {
      setProfileFeedback({ tone: "error", message: response.message || "No pudimos actualizar el perfil." });
      return;
    }
    if (response.user) {
      const normalizedResponseAddressBook = normalizeAddressBook(response.user.addressBook);
      const normalizedResponseDefaultAddress = getDefaultAddressBookEntry(normalizedResponseAddressBook);
      setCurrentUser({
        ...response.user,
        shippingAddress: sanitizeParagraph(response.user.shippingAddress || normalizedResponseDefaultAddress?.address || ""),
        addressBook: normalizedResponseAddressBook,
      });
      setProfileDraft({
        name: sanitizeLine(response.user.name || ""),
        lastName: sanitizeLine(response.user.lastName || ""),
        phone: normalizeUserPhoneNumber(response.user.phone || ""),
        email: normalizeEmail(response.user.email || ""),
        shippingAddress: sanitizeParagraph(response.user.shippingAddress || normalizedResponseDefaultAddress?.address || ""),
        addressBook: normalizedResponseAddressBook,
      });
    }
    setProfileFeedback({ tone: "success", message: "Datos personales actualizados correctamente." });
    showToastMessage("Datos personales actualizados.", "success");
  };

  const saveCheckoutAddressToBook = async (payload = {}) => {
    if (!currentUser?.id) {
      return { ok: false, message: "Debes iniciar sesion para guardar direcciones." };
    }

    const normalizedEntry = normalizeAddressBookEntry({
      id: createUid(),
      label: payload.label || "Entrega",
      address: payload.address,
      city: payload.city,
      reference: payload.reference,
      phone: payload.phone,
      isDefault: Boolean(payload.isDefault),
    });

    if (!normalizedEntry || !normalizedEntry.address) {
      return { ok: false, message: "Ingresa una direccion valida para guardarla." };
    }

    const currentBook = normalizeAddressBook(currentUser.addressBook);
    const existingEntry = currentBook.find((entry) => isSameAddressBookEntry(entry, normalizedEntry));
    if (existingEntry) {
      return { ok: true, savedEntryId: String(existingEntry.id || ""), addressBook: currentBook };
    }

    let nextBook = [normalizedEntry, ...currentBook].slice(0, MAX_ADDRESS_BOOK_ENTRIES);
    if (!currentBook.length || normalizedEntry.isDefault) {
      nextBook = nextBook.map((entry) => ({
        ...entry,
        isDefault: String(entry.id) === String(normalizedEntry.id),
      }));
    }
    nextBook = normalizeAddressBook(nextBook);

    const syncResult = await syncAddressBookForCurrentUser(nextBook, {
      silent: true,
      errorMessage: "No pudimos guardar la direccion en tu libreta.",
    });
    if (!syncResult.ok) {
      return { ok: false, message: syncResult.message || "No pudimos guardar la direccion en tu libreta." };
    }

    const syncedBook = normalizeAddressBook(syncResult.addressBook);
    const syncedMatch = syncedBook.find((entry) => isSameAddressBookEntry(entry, normalizedEntry));
    return {
      ok: true,
      savedEntryId: String(syncedMatch?.id || normalizedEntry.id || ""),
      addressBook: syncedBook,
    };
  };

  const handlePasswordFieldChange = (field, value) => {
    setPasswordDraft((previous) => ({ ...previous, [field]: value }));
  };

  const handleChangePassword = async () => {
    if (!currentUser?.id) return;
    const currentPassword = String(passwordDraft.currentPassword || "").trim();
    const newPassword = String(passwordDraft.newPassword || "").trim();
    const confirmPassword = String(passwordDraft.confirmPassword || "").trim();

    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordFeedback({ tone: "error", message: "Completa todos los campos de contrasena." });
      return;
    }
    if (!hasStrongPassword(newPassword)) {
      setPasswordFeedback({ tone: "error", message: `La nueva contrasena debe tener minimo ${PASSWORD_SECURITY.minLength} caracteres con letras y numeros.` });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordFeedback({ tone: "error", message: "La confirmacion no coincide con la nueva contrasena." });
      return;
    }

    const response = await changeUserPassword({
      currentPassword,
      newPassword,
      confirmPassword,
    });
    if (!response.ok) {
      setPasswordFeedback({ tone: "error", message: response.message || "No pudimos actualizar la contrasena." });
      return;
    }

    setPasswordDraft({ currentPassword: "", newPassword: "", confirmPassword: "" });
    setPasswordFeedback({ tone: "success", message: "Contrasena actualizada correctamente." });
    showToastMessage("Contrasena actualizada.", "success");
  };

  const handleCouponDraftFieldChange = (field, value) => {
    setCouponDraft((previous) => ({ ...previous, [field]: value }));
  };

  const toggleCouponDraftProduct = (productId) => {
    setCouponDraft((previous) => {
      const selectedIds = new Set(previous.excludedProductIds || []);
      if (selectedIds.has(productId)) {
        selectedIds.delete(productId);
      } else {
        selectedIds.add(productId);
      }
      return {
        ...previous,
        excludedProductIds: [...selectedIds],
      };
    });
  };

  const toggleCouponDraftProductType = (productTypeName) => {
    const normalizedType = normalizeOptionLabel(productTypeName);
    if (!normalizedType) return;

    setCouponDraft((previous) => {
      const currentTypes = splitFilterTagsText(previous.excludedProductTypesText || "");
      const exists = currentTypes.some((entry) => entry.toLowerCase() === normalizedType.toLowerCase());
      const nextTypes = exists
        ? currentTypes.filter((entry) => entry.toLowerCase() !== normalizedType.toLowerCase())
        : [...currentTypes, normalizedType];

      return {
        ...previous,
        excludedProductTypesText: nextTypes.join(", "),
      };
    });
  };

  const resetCouponDraft = () => {
    setCouponDraft(createEmptyCouponDraft());
    setCouponEditorMessage("");
    setCouponEditorError("");
  };

  const startEditingCoupon = (coupon) => {
    setCouponDraft(couponToDraft(coupon));
    setCouponEditorMessage("");
    setCouponEditorError("");
    setAdminTab("cupones");
  };

  const saveCoupon = async () => {
    const existingCoupon = coupons.find((coupon) => coupon.id === couponDraft.id);
    const parsed = parseCouponDraft(couponDraft);
    if (parsed.error || !parsed.value) {
      setCouponEditorMessage("");
      setCouponEditorError(parsed.error || "No pudimos guardar el cupon.");
      return;
    }
    const normalized = {
      ...parsed.value,
      usageTotal: existingCoupon ? Number(existingCoupon.usageTotal) || 0 : Number(parsed.value.usageTotal) || 0,
      usageByUser: existingCoupon ? { ...(existingCoupon.usageByUser || {}) } : { ...(parsed.value.usageByUser || {}) },
      createdAt: existingCoupon?.createdAt || parsed.value.createdAt || new Date().toISOString(),
    };

    const duplicated = coupons.some((coupon) => (
      coupon.id !== normalized.id && normalizeCode(coupon.code) === normalizeCode(normalized.code)
    ));
    if (duplicated) {
      setCouponEditorMessage("");
      setCouponEditorError("Ya existe un cupon con ese codigo.");
      return;
    }

    const nextCoupons = (() => {
      const exists = coupons.some((coupon) => coupon.id === normalized.id);
      if (exists) {
        return coupons.map((coupon) => (coupon.id === normalized.id ? { ...coupon, ...normalized, updatedAt: new Date().toISOString() } : coupon));
      }
      return [{ ...normalized, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, ...coupons];
    })();
    setCoupons(nextCoupons);
    couponsRef.current = nextCoupons;

    setCouponEditorError("");
    setCouponEditorMessage(`Cupon ${normalized.code} guardado correctamente.`);
    setCouponDraft(createEmptyCouponDraft());

    const syncResult = await syncCatalogSnapshot({
      coupons: nextCoupons,
    }, { silent: true });
    if (!syncResult.ok) {
      setCouponEditorError(syncResult.message || "No pudimos sincronizar el cupon con el servidor.");
      return;
    }
    showToastMessage(`Cupon ${normalized.code} sincronizado.`, "success");
  };

  const toggleCouponActive = async (couponId) => {
    const previousCoupons = coupons;
    const normalizedCouponId = normalizeEntityId(couponId);
    const nextCoupons = coupons.map((coupon) => (
      normalizeEntityId(coupon.id) === normalizedCouponId
        ? { ...coupon, active: coupon.active === false, updatedAt: new Date().toISOString() }
        : coupon
    ));
    setCoupons(nextCoupons);
    couponsRef.current = nextCoupons;
    const syncResult = await syncCatalogSnapshot({ coupons: nextCoupons }, { silent: true });
    if (!syncResult.ok) {
      setCoupons(previousCoupons);
      couponsRef.current = previousCoupons;
      showToastMessage(syncResult.message || "No pudimos sincronizar el cambio de estado del cupon.", "error");
      return;
    }
    showToastMessage("Estado del cupon actualizado.", "success");
  };

  const deleteCoupon = async (couponId) => {
    const normalizedCouponId = normalizeEntityId(couponId);
    const target = coupons.find((coupon) => normalizeEntityId(coupon.id) === normalizedCouponId);
    if (!target) return;
    if (typeof window !== "undefined" && !window.confirm(`Eliminar el cupon ${target.code}?`)) return;
    const nextCoupons = coupons.filter((coupon) => normalizeEntityId(coupon.id) !== normalizedCouponId);
    setCoupons(nextCoupons);
    couponsRef.current = nextCoupons;
    setCouponEditorError("");
    setCouponEditorMessage(`Cupon ${target.code} eliminado.`);
    if (activeCouponCode && normalizeCode(target.code) === normalizeCode(activeCouponCode)) {
      clearActiveCoupon();
    }
    const syncResult = await syncCatalogSnapshot({
      coupons: nextCoupons,
    }, { silent: true });
    if (!syncResult.ok) {
      setCouponEditorError(syncResult.message || "No pudimos sincronizar la eliminacion del cupon.");
      return;
    }
    showToastMessage(`Cupon ${target.code} eliminado y sincronizado.`, "success");
  };

  const applyCouponFromInput = () => {
    if (couponBusy) return;
    const normalized = normalizeCode(couponInputCode);
    if (!normalized) {
      showToastMessage("Ingresa un codigo de cupon para aplicar.", "error");
      return;
    }

    setCouponInputCode(normalized);
    setCouponBusy(true);
    pendingCouponCelebrationRef.current = normalized;
    setActiveCouponCode(normalized);
    setCouponApplyNonce((previous) => previous + 1);
  };

  const clearActiveCoupon = () => {
    setCouponInputCode("");
    setActiveCouponCode("");
    setCouponState(null);
    setCouponBusy(false);
    pendingCouponCelebrationRef.current = "";
  };

  const openCatalogSearch = () => {
    if (typeof document === "undefined") return;
    setActiveMobileSection("catalogo");
    const focusSearchField = () => {
      catalogSearchInputRef.current?.focus();
      catalogSearchInputRef.current?.select?.();
    };
    focusSearchField();
    document.getElementById("coleccion")?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(focusSearchField, 240);
    window.setTimeout(focusSearchField, 420);
  };

  const handleUserAuthSubmit = async (event) => {
    event.preventDefault();
    if (authBusy) return;
    if (!authValidation.canSubmit) {
      setAuthError(authValidation.firstError || "Revisa los campos para continuar.");
      return;
    }

    if (authMode === "forgot") {
      const { email } = authValidation.forgotPayload;
      setAuthBusy(true);
      try {
        const response = await requestUserPasswordReset({ email });
        if (!response.ok) {
          if (response.status === 429) {
            setAuthError("Demasiados intentos. Espera un momento e intenta de nuevo.");
            return;
          }
          setAuthError(response.message || "No pudimos iniciar la recuperacion en este momento.");
          return;
        }

        setAuthMode("login");
        setAuthResetEmailLocked(false);
        setAuthError("");
        setAuthForm((previous) => ({
          ...previous,
          email,
          password: "",
          confirmPassword: "",
          resetToken: "",
        }));
        showToastMessage({
          title: "Revisa tu correo",
          message: "Si existe una cuenta con ese correo, te enviamos un enlace para restablecer tu contrasena.",
        }, "success");
      } finally {
        setAuthBusy(false);
      }
      return;
    }

    if (authMode === "reset") {
      const { email, token, password, confirmPassword } = authValidation.resetPayload;
      setAuthBusy(true);
      try {
        const response = await confirmUserPasswordReset({
          email,
          token,
          newPassword: password,
          confirmPassword,
        });
        if (!response.ok) {
          setAuthError(response.message || "No pudimos restablecer tu contrasena.");
          return;
        }

        setAuthMode("login");
        setAuthResetEmailLocked(false);
        setAuthError("");
        setAuthForm((previous) => ({
          ...previous,
          email,
          resetToken: "",
          password: "",
          confirmPassword: "",
        }));
        showToastMessage({
          title: "Contrasena actualizada",
          message: "Ya puedes iniciar sesion con tu nueva contrasena.",
        }, "success");
      } finally {
        setAuthBusy(false);
      }
      return;
    }

    if (authMode === "register") {
      const {
        name,
        email,
        username,
        password,
        phone,
        confirmPassword,
      } = authValidation.registerPayload;

      setAuthBusy(true);
      try {
        const registerResponse = await registerUserAccount({
          name,
          email,
          username,
          password,
          phone,
          confirmPassword,
        });
        if (!registerResponse.ok || !registerResponse.user) {
          setAuthError(registerResponse.message || "No pudimos crear tu cuenta.");
          return;
        }

        await logoutAdminSession();
        setCurrentUser(registerResponse.user);
        setAdminSession(null);
        setShowUserAuth(false);
        setAuthError("");
        const nextDestination = postAuthDestination;
        setPostAuthDestination(null);
        resetAuthForm();
        const firstName = (name.split(" ")[0] || "cliente");
        triggerConfetti("welcome");
        showToastMessage({
          title: `Bienvenida ${firstName}`,
          message: "Tu cuenta esta activa. Gracias por confiar en nosotros.",
        }, "success");
        if (nextDestination === "cart") {
          setShowCartSummary(true);
        }
      } finally {
        setAuthBusy(false);
      }
      return;
    }

    const { identifier, password } = authValidation.loginPayload;
    setAuthBusy(true);
    try {
      const adminLoginResult = await loginAdminSession(identifier, password);
      if (adminLoginResult.ok && adminLoginResult.isAdmin && adminLoginResult.session) {
        await logoutUserAccount();
        adminTouchWarningShownRef.current = false;
        setCurrentUser(null);
        setAdminSession({
          username: adminLoginResult.session.username,
          expiresAt: Number(adminLoginResult.session.expiresAt) || 0,
          issuedAt: Number(adminLoginResult.session.issuedAt) || Date.now(),
        });
        const catalogResult = await getCatalogState({ preferCache: true, force: false });
        if (catalogResult.ok && catalogResult.data) {
          applyCatalogStateFromServer(catalogResult.data);
          setCatalogReady(true);
        }
        await refreshSecurityMetrics({ silent: true, preferCache: true });
        await refreshAdminUsers({ silent: true, preferCache: true });
        await refreshOrdersFromServer({ silent: true, preferCache: true, notifyAdminOnNew: false });
        setOrderLiveAlert(null);
        setShowUserAuth(false);
        setPostAuthDestination(null);
        setShowAdminPanel(true);
        setAdminTab("resumen");
        setAuthMode("login");
        setAuthError("");
        resetAuthForm();
        setEditorMessage(`Panel de administracion activado con ${adminLoginResult.session.username}.`);
        setEditorError("");
        showToastMessage({
          title: "Sesion administrativa activa",
          message: "Acceso confirmado al panel de administracion.",
        }, "success");
        return;
      }
      if (adminLoginResult.status === 429 && Number(adminLoginResult.lockUntil) > Date.now()) {
        setAuthError(`Acceso administrativo temporalmente bloqueado. Intenta de nuevo en ${formatMinutesRemaining(adminLoginResult.lockUntil)}.`);
        return;
      }

      const userLoginResponse = await loginUserAccount({
        identifier,
        password,
      });
      if (!userLoginResponse.ok || !userLoginResponse.user) {
        setAuthError(userLoginResponse.message || "Correo, usuario o contrasena incorrectos.");
        return;
      }

      const nextDestination = postAuthDestination;
      const firstName = ((userLoginResponse.user.name || "cliente").split(" ")[0] || "cliente");

      await logoutAdminSession();
      setCurrentUser(userLoginResponse.user);
      setAdminSession(null);
      setShowUserAuth(false);
      setAuthError("");
      setPostAuthDestination(null);
      resetAuthForm();
      triggerConfetti("welcome");
      showToastMessage({
        title: `Bienvenido de nuevo ${firstName}`,
        message: "Es un placer volver a verte. Tu cuenta ya esta lista.",
      }, "success");

      if (nextDestination === "cart") {
        setShowCartSummary(true);
      }
    } finally {
      setAuthBusy(false);
    }
  };

  const handleCheckoutViaWhatsApp = async (checkoutPayload = null) => {
    if (!cart.length || checkoutBusy) return;

    if (!currentUser?.email) {
      setShowCartSummary(false);
      openUserAuth({
        mode: "login",
        destination: "cart",
        error: "Inicia sesion o crea tu cuenta para guardar y rastrear el pedido antes de enviarlo por WhatsApp.",
      });
      return;
    }

    if (activeCouponCode && !appliedCouponState?.ok) {
      showToastMessage(appliedCouponState.message || "El cupon no es valido para este carrito. Corrigelo o quitalo para continuar.", "error");
      return;
    }

    const unavailableCartLine = cart.find((line) => {
      const product = productsById.get(normalizeEntityId(line.id));
      if (!product || product.isPublic === false) return true;
      const availableStock = getStockForVariant(product, line.color, line.size);
      return availableStock <= 0 || Number(line.quantity || 0) > availableStock;
    });
    if (unavailableCartLine) {
      showToastMessage("Tu carrito tiene productos ocultos o sin stock. Revísalo antes de enviar el pedido.", "warning");
      setShowCartSummary(true);
      return;
    }

    const pendingExternalWindow = preOpenExternalWindow();
    let whatsappLaunched = false;

    const deliveryType = checkoutPayload?.deliveryType === "delivery" ? "delivery" : "pickup";
    const selectedAddressId = normalizeEntityId(checkoutPayload?.selectedAddressId || "");
    const payloadDetails = checkoutPayload?.deliveryDetails || {};
    const deliveryDetails = {
      fullName: sanitizeLine(payloadDetails.fullName || currentUser?.name || ""),
      idNumber: sanitizeLine(payloadDetails.idNumber || ""),
      city: sanitizeLine(payloadDetails.city || ""),
      address: sanitizeParagraph(payloadDetails.address || currentUser?.shippingAddress || ""),
      reference: sanitizeParagraph(payloadDetails.reference || ""),
      phone: normalizeUserPhoneNumber(payloadDetails.phone || currentUser?.phone || ""),
    };

    if (deliveryType === "delivery") {
      if (!deliveryDetails.fullName || !deliveryDetails.idNumber || !deliveryDetails.city || !deliveryDetails.address || !deliveryDetails.reference) {
        closeExternalWindow(pendingExternalWindow);
        showToastMessage("Completa todos los datos de envio antes de confirmar el pedido.", "error");
        return;
      }
      if (deliveryDetails.phone.length !== AUTH_FIELD_LIMITS.phone) {
        closeExternalWindow(pendingExternalWindow);
        showToastMessage("El telefono para envio debe tener 10 digitos.", "error");
        return;
      }

      const addressBook = normalizeAddressBook(currentUser?.addressBook);
      const selectedAddress = addressBook.find((entry) => String(entry.id || "") === selectedAddressId);
      const hasMatchingAddress = selectedAddress || addressBook.some((entry) => isSameAddressBookEntry(entry, deliveryDetails));
      if (!hasMatchingAddress) {
        const saveAddressResult = await saveCheckoutAddressToBook({
          label: "Entrega",
          city: deliveryDetails.city,
          address: deliveryDetails.address,
          reference: deliveryDetails.reference,
          phone: deliveryDetails.phone,
          isDefault: addressBook.length === 0,
        });
        if (!saveAddressResult.ok) {
          closeExternalWindow(pendingExternalWindow);
          showToastMessage(saveAddressResult.message || "No pudimos guardar tu direccion en la libreta.", "error");
          return;
        }
      }
    }

    setCheckoutBusy(true);
    showToastMessage({
      tone: "info",
      title: "Gracias por tu compra",
      message: "Estamos registrando tu pedido y validando disponibilidad.",
    }, "info");
    try {
      const response = await createServerCheckoutOrder({
        cart,
        couponCode: activeCouponCode,
        delivery: {
          type: deliveryType,
          ...deliveryDetails,
        },
      });
      if (!response.ok || !response.order) {
        showToastMessage(response.message || "No pudimos procesar el pedido en el servidor.", "error");
        return;
      }

      if (Array.isArray(response.products)) {
        setProducts(response.products.map(normalizeProduct));
      }
      if (Array.isArray(response.orderHistory)) {
        const normalizedResponseOrder = normalizeOrderRecord(response.order);
        const normalizedHistory = response.orderHistory.map(normalizeOrderRecord);
        const hasNewOrder = normalizedHistory.some((order) => String(order.id || "") === String(normalizedResponseOrder.id || ""));
        setOrderHistory(hasNewOrder ? normalizedHistory : [normalizedResponseOrder, ...normalizedHistory].slice(0, 200));
        setLiveOrdersUpdatedAt(new Date().toISOString());
      } else {
        const normalizedResponseOrder = normalizeOrderRecord(response.order);
        setOrderHistory((previous) => {
          const withoutCurrent = previous.filter((order) => String(order.id || "") !== String(normalizedResponseOrder.id || ""));
          return [normalizedResponseOrder, ...withoutCurrent].slice(0, 200);
        });
        setLiveOrdersUpdatedAt(new Date().toISOString());
      }

      void refreshOrdersFromServer({ silent: true, force: true, preferCache: false, notifyAdminOnNew: false });

      const firstName = ((currentUser?.name || "cliente").split(" ")[0] || "cliente");
      const whatsappTarget = buildWhatsAppOrderUrl(response.order, response.whatsappUrl || "", {
        mobile: isMobileViewport,
      });
      const launchResult = launchWhatsAppUrl(whatsappTarget.url, {
        preferredWindow: pendingExternalWindow,
        isMobile: isMobileViewport,
        fallbackDelayMs: isMobileViewport ? 1450 : 1200,
      });
      const launched = Boolean(launchResult.launched);
      if (!launched) {
        closeExternalWindow(pendingExternalWindow);
        showToastMessage("Pedido registrado. No pudimos abrir WhatsApp automaticamente; abre la app manualmente para enviarlo.", "warning");
      } else {
        whatsappLaunched = true;
        if (launchResult.mode === "deep-link" || launchResult.mode === "deep-link-window") {
          showToastMessage("Pedido registrado. Intentamos abrir WhatsApp directamente en tu aplicacion.", "success");
        }
        if (["number-compact", "api-compact", "link-compact", "web-compact"].includes(whatsappTarget.mode)) {
          showToastMessage("Pedido registrado. Abrimos WhatsApp con un resumen compacto para evitar errores de enlace largo.", "info");
        } else if (["number-minimal", "api-minimal", "link-minimal", "web-minimal"].includes(whatsappTarget.mode)) {
          showToastMessage("Pedido registrado. Abrimos WhatsApp con un mensaje breve para asegurar el texto prellenado.", "info");
        }
      }

      clearActiveCoupon();
      clearCartState();
      setShowOrdersModal(true);
      triggerConfetti("checkout");
      showToastMessage({
        title: `Pedido ${response.order.code} confirmado`,
        message: `Gracias ${firstName}. Tu pedido esta guardado y listo para finalizar por WhatsApp.`,
      }, "success");
    } catch (error) {
      closeExternalWindow(pendingExternalWindow);
      const message = error instanceof Error
        ? error.message
        : "No pudimos registrar el pedido en este momento. Intenta de nuevo.";
      showToastMessage(message, "error");
    } finally {
      if (!whatsappLaunched) {
        closeExternalWindow(pendingExternalWindow);
      }
      setCheckoutBusy(false);
    }
  };

  const openProductFromCartItem = (item) => {
    const product = productsById.get(normalizeEntityId(item.id));
    if (!product) return;
    openProductDetail(product, { color: item.color, size: item.size });
  };

  const startEditingCartItem = (item) => {
    const product = productsById.get(normalizeEntityId(item.id));
    if (!product) return;
    setEditingCartItemKey(item.key);
    openProductDetail(product, { color: item.color, size: item.size }, { fromCartEdit: true });
  };

  const toggleFavorite = (productId) => {
    const normalizedProductId = normalizeEntityId(productId);
    if (!normalizedProductId) return;
    setFavorites((previous) => (
      previous.includes(normalizedProductId)
        ? previous.filter((item) => item !== normalizedProductId)
        : [...previous, normalizedProductId]
    ));
  };

  const resetEditor = () => {
    const emptyForm = createEmptyProductForm();
    emptyForm.productType = activeProductTypeNames[0] || "General";
    emptyForm.isPublic = true;
    setProductForm(emptyForm);
    setPreviewColor(emptyForm.colorsData[0]?.name || "");
    setPreviewImageIndex(0);
    setCustomProductTypeInput("");
    setCustomFilterTagInput("");
    setEditorMessage("");
    setEditorError("");
  };

  const startEditingProduct = (product) => {
    const form = createProductForm(product);
    setProductForm(form);
    setPreviewColor(form.colorsData[0]?.name || "");
    setPreviewImageIndex(0);
    setCustomProductTypeInput("");
    setCustomFilterTagInput("");
    setEditorMessage("");
    setEditorError("");
    setSelectedProduct(null);
    setShowAdminPanel(true);
    setAdminTab("producto");
    if (typeof document !== "undefined") {
      window.setTimeout(() => {
        document.getElementById("admin-editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
        touchAdminSession();
      }, 80);
    }
  };

  const handleDeleteProduct = async (productId) => {
    const normalizedProductId = normalizeEntityId(productId);
    const target = products.find((product) => normalizeEntityId(product.id) === normalizedProductId);
    if (!target) return;
    if (typeof window !== "undefined" && !window.confirm(`Eliminar "${target.name}" del catalogo?`)) return;

    const nextProducts = products.filter((product) => normalizeEntityId(product.id) !== normalizedProductId);
    const nextFavorites = favorites.filter((favoriteId) => normalizeEntityId(favoriteId) !== normalizedProductId);
    setProducts(nextProducts);
    setFavorites(nextFavorites);
    productsRef.current = nextProducts;

    if (selectedProduct?.id === normalizedProductId) {
      setSelectedProduct(null);
    }
    if (productForm.id === normalizedProductId) {
      resetEditor();
    }

    const syncResult = await syncCatalogSnapshot({
      products: nextProducts,
    }, { silent: true });

    if (!syncResult.ok) {
      setProducts(products);
      setFavorites(favorites);
      productsRef.current = products;
      setEditorError(syncResult.message || "No pudimos sincronizar la eliminacion con el servidor.");
      setEditorMessage("");
      showToastMessage(syncResult.message || "No pudimos sincronizar la eliminacion con el servidor.", "error");
      return;
    }

    setEditorMessage(`"${target.name}" fue eliminado del catalogo.`);
    setEditorError("");
    showToastMessage(`"${target.name}" eliminado y sincronizado.`, "success");
  };

  const bulkDeleteCatalogProducts = async (productIds = []) => {
    const idSet = new Set((Array.isArray(productIds) ? productIds : []).map((item) => normalizeEntityId(item)).filter(Boolean));
    if (!idSet.size) {
      return { ok: false, removed: 0, message: "No hay productos seleccionados." };
    }

    const previousProducts = products;
    const previousFavorites = favorites;
    const removedProducts = products.filter((product) => idSet.has(normalizeEntityId(product.id)));
    const nextProducts = products.filter((product) => !idSet.has(normalizeEntityId(product.id)));
    const nextFavorites = favorites.filter((favoriteId) => !idSet.has(normalizeEntityId(favoriteId)));

    if (!removedProducts.length) {
      return { ok: false, removed: 0, message: "No encontramos productos válidos para eliminar." };
    }

    setProducts(nextProducts);
    setFavorites(nextFavorites);
    productsRef.current = nextProducts;

    if (selectedProduct?.id && idSet.has(normalizeEntityId(selectedProduct.id))) {
      setSelectedProduct(null);
    }
    if (productForm.id && idSet.has(normalizeEntityId(productForm.id))) {
      resetEditor();
    }

    const syncResult = await syncCatalogSnapshot({
      products: nextProducts,
    }, { silent: true });

    if (!syncResult.ok) {
      setProducts(previousProducts);
      setFavorites(previousFavorites);
      productsRef.current = previousProducts;
      showToastMessage(syncResult.message || "No pudimos sincronizar la eliminación masiva.", "error");
      return { ok: false, removed: 0, message: syncResult.message || "sync-error" };
    }

    setEditorMessage(`${removedProducts.length} producto(s) eliminados del catálogo.`);
    setEditorError("");
    showToastMessage(`${removedProducts.length} producto(s) eliminados y sincronizados.`, "success");
    return { ok: true, removed: removedProducts.length };
  };

  const bulkSetCatalogFeatured = async (productIds = [], featured = true) => {
    const idSet = new Set((Array.isArray(productIds) ? productIds : []).map((item) => normalizeEntityId(item)).filter(Boolean));
    if (!idSet.size) {
      return { ok: false, updated: 0, message: "No hay productos seleccionados." };
    }

    const previousProducts = products;
    let updatedCount = 0;
    const nextProducts = products.map((product) => {
      const productId = normalizeEntityId(product.id);
      if (!idSet.has(productId)) return product;
      if (Boolean(product.featured) === Boolean(featured)) return product;
      updatedCount += 1;
      return normalizeProduct({
        ...product,
        featured: Boolean(featured),
      });
    });

    if (!updatedCount) {
      return { ok: true, updated: 0 };
    }

    setProducts(nextProducts);
    productsRef.current = nextProducts;

    const syncResult = await syncCatalogSnapshot({
      products: nextProducts,
    }, { silent: true });
    if (!syncResult.ok) {
      setProducts(previousProducts);
      productsRef.current = previousProducts;
      showToastMessage(syncResult.message || "No pudimos sincronizar la acción masiva.", "error");
      return { ok: false, updated: 0, message: syncResult.message || "sync-error" };
    }

    const label = featured ? "destacados" : "sin destacado";
    setEditorMessage(`${updatedCount} producto(s) actualizados como ${label}.`);
    setEditorError("");
    showToastMessage(`${updatedCount} producto(s) actualizados.`, "success");
    return { ok: true, updated: updatedCount };
  };

  const toggleProductPublicVisibility = async (productId, nextPublicValue = null) => {
    const normalizedProductId = normalizeEntityId(productId);
    if (!normalizedProductId) return { ok: false, message: "Producto invalido." };

    const previousProducts = products;
    const targetProduct = previousProducts.find((product) => normalizeEntityId(product.id) === normalizedProductId);
    if (!targetProduct) return { ok: false, message: "Producto no encontrado." };

    const resolvedIsPublic = nextPublicValue == null
      ? targetProduct.isPublic === false
      : Boolean(nextPublicValue);

    if (Boolean(targetProduct.isPublic !== false) === resolvedIsPublic) {
      return { ok: true, unchanged: true };
    }

    const nextProducts = previousProducts.map((product) => (
      normalizeEntityId(product.id) === normalizedProductId
        ? normalizeProduct({ ...product, isPublic: resolvedIsPublic })
        : product
    ));

    setProducts(nextProducts);
    productsRef.current = nextProducts;
    setProductForm((previous) => (
      normalizeEntityId(previous.id) === normalizedProductId
        ? { ...previous, isPublic: resolvedIsPublic }
        : previous
    ));

    const syncResult = await syncCatalogSnapshot({
      products: nextProducts,
    }, { silent: true });

    if (!syncResult.ok) {
      setProducts(previousProducts);
      productsRef.current = previousProducts;
      setProductForm((previous) => (
        normalizeEntityId(previous.id) === normalizedProductId
          ? { ...previous, isPublic: targetProduct.isPublic !== false }
          : previous
      ));
      showToastMessage(syncResult.message || "No pudimos sincronizar la visibilidad del producto.", "error");
      return { ok: false, message: syncResult.message || "sync-error" };
    }

    const stateLabel = resolvedIsPublic ? "visible al publico" : "oculto del publico";
    setEditorMessage(`Producto "${targetProduct.name}" ahora esta ${stateLabel}.`);
    setEditorError("");
    showToastMessage(`Producto ${resolvedIsPublic ? "publicado" : "ocultado"} correctamente.`, "success");
    return { ok: true };
  };

  const handleProductFieldChange = (field, value) => {
    const shouldSanitizeLine = ["name", "category", "productType"].includes(field);
    const shouldSanitizeNumeric = ["offerExtraDiscount", "offerDiscountValue"].includes(field);
    const nextValue = shouldSanitizeLine
      ? sanitizeLine(value)
      : shouldSanitizeNumeric
        ? String(value)
          .replace(",", ".")
          .replace(/[^\d.]/g, "")
          .replace(/(\..*?)\..*/g, "$1")
        : value;
    setProductForm((previous) => ({ ...previous, [field]: nextValue }));
  };

  const addManagedProductType = () => {
    const normalizedValue = normalizeOptionLabel(customProductTypeInput);
    if (!normalizedValue) {
      setEditorError("Ingresa un nombre valido para el tipo de producto.");
      return;
    }
    setProductTypeRecords((previous) => ensureManagedEntity(previous, normalizedValue, "product-type"));
    setProductForm((previous) => ({ ...previous, productType: normalizedValue }));
    setCustomProductTypeInput("");
    setEditorMessage(`Tipo de prenda "${normalizedValue}" agregado.`);
    setEditorError("");
  };

  const handleManagedProductTypeDraftChange = (recordId, field, value) => {
    setProductTypeRecords((previous) => previous.map((record) => {
      if (record.id !== recordId) return record;
      if (field === "draftName") {
        const nextName = normalizeOptionLabel(value);
        return {
          ...record,
          draftName: nextName,
          draftSlug: record.draftSlug || record.slug || slugify(nextName),
        };
      }
      return {
        ...record,
        draftSlug: slugify(value),
      };
    }));
  };

  const saveManagedProductType = (recordId) => {
    const record = productTypeRecords.find((entry) => entry.id === recordId);
    if (!record) return;

    const nextName = normalizeOptionLabel(record.draftName || record.name);
    const nextSlug = slugify(record.draftSlug || record.slug || nextName);

    if (!nextName) {
      setEditorError("El tipo de producto no puede quedar vaco.");
      return;
    }

    const duplicated = productTypeRecords.some((entry) => entry.id !== recordId && entry.name.toLowerCase() === nextName.toLowerCase());
    if (duplicated) {
      setEditorError("Ya existe otro tipo de producto con ese nombre.");
      return;
    }

    setProductTypeRecords((previous) => previous.map((entry) => entry.id === recordId ? { ...entry, name: nextName, slug: nextSlug, draftName: nextName, draftSlug: nextSlug, active: true } : entry));

    if (record.name.toLowerCase() !== nextName.toLowerCase()) {
      setProducts((previous) => previous.map((product) => normalizeOptionLabel(product.productType || "").toLowerCase() === record.name.toLowerCase() ? { ...product, productType: nextName } : product));
      setProductForm((previous) => normalizeOptionLabel(previous.productType || "").toLowerCase() === record.name.toLowerCase() ? { ...previous, productType: nextName } : previous);
      setProductTypeFilter((previous) => previous.toLowerCase() === record.name.toLowerCase() ? nextName : previous);
    }

    setEditorMessage(`Tipo de producto actualizado a "${nextName}".`);
    setEditorError("");
  };

  const toggleManagedProductTypeActive = (recordId) => {
    setProductTypeRecords((previous) => previous.map((record) => record.id === recordId ? { ...record, active: !record.active } : record));
  };

  const deleteManagedProductType = (recordId, replacementName) => {
    const record = productTypeRecords.find((entry) => entry.id === recordId);
    if (!record) return;

    const associatedCount = products.filter((product) => normalizeOptionLabel(product.productType || "").toLowerCase() === record.name.toLowerCase()).length;
    const replacement = normalizeOptionLabel(replacementName);
    const fallbackReplacement = productTypeRecords.find((entry) => entry.id !== recordId && entry.active)?.name
      || (record.name.toLowerCase() === "general" ? "Sin tipo" : "General");
    const effectiveReplacement = associatedCount > 0 ? (replacement || fallbackReplacement) : replacement;

    if (associatedCount > 0 && !effectiveReplacement) {
      setEditorError("No encontramos un tipo de reemplazo valido para reasignar productos.");
      return;
    }

    if (typeof window !== "undefined" && !window.confirm(`Eliminar el tipo de producto "${record.name}"?`)) return;

    if (associatedCount > 0) {
      setProducts((previous) => previous.map((product) => normalizeOptionLabel(product.productType || "").toLowerCase() === record.name.toLowerCase() ? { ...product, productType: effectiveReplacement } : product));
      setProductForm((previous) => normalizeOptionLabel(previous.productType || "").toLowerCase() === record.name.toLowerCase() ? { ...previous, productType: effectiveReplacement } : previous);
      setProductTypeFilter((previous) => previous.toLowerCase() === record.name.toLowerCase() ? effectiveReplacement : previous);
    }

    setProductTypeRecords((previous) => {
      const withFallback = associatedCount > 0
        ? ensureManagedEntity(previous, effectiveReplacement, "product-type")
        : previous;
      return withFallback.filter((entry) => entry.id !== recordId);
    });
    setEditorMessage(`Tipo de producto "${record.name}" eliminado${effectiveReplacement ? ` y reasignado a "${effectiveReplacement}"` : ""}.`);
    setEditorError("");
  };

  const appendFilterTagToForm = (rawTag) => {
    const normalizedValue = normalizeOptionLabel(rawTag);
    if (!normalizedValue) return;

    setFilterTagRecords((previous) => ensureManagedEntity(previous, normalizedValue, "filter-tag"));
    setProductForm((previous) => {
      const currentTags = splitFilterTagsText(previous.filterTagsText);
      if (currentTags.some((tag) => tag.toLowerCase() === normalizedValue.toLowerCase())) return previous;
      return { ...previous, filterTagsText: [...currentTags, normalizedValue].join(", ") };
    });
    setCustomFilterTagInput("");
  };

  const removeFilterTagFromForm = (tagToRemove) => {
    setProductForm((previous) => ({
      ...previous,
      filterTagsText: splitFilterTagsText(previous.filterTagsText)
        .filter((tag) => tag.toLowerCase() !== tagToRemove.toLowerCase())
        .join(", "),
    }));
  };

  const addManagedFilterTag = () => {
    const normalizedValue = normalizeOptionLabel(customFilterTagInput);
    if (!normalizedValue) {
      setEditorError("Ingresa un nombre valido para el filtro.");
      return;
    }
    setFilterTagRecords((previous) => ensureManagedEntity(previous, normalizedValue, "filter-tag"));
    if (adminTab === "producto") {
      appendFilterTagToForm(normalizedValue);
    }
    setCustomFilterTagInput("");
    setEditorMessage(`Filtro "${normalizedValue}" agregado.`);
    setEditorError("");
  };

  const handleManagedFilterTagDraftChange = (recordId, field, value) => {
    setFilterTagRecords((previous) => previous.map((record) => {
      if (record.id !== recordId) return record;
      if (field === "draftName") {
        const nextName = normalizeOptionLabel(value);
        return {
          ...record,
          draftName: nextName,
          draftSlug: record.draftSlug || record.slug || slugify(nextName),
        };
      }
      return {
        ...record,
        draftSlug: slugify(value),
      };
    }));
  };

  const saveManagedFilterTag = (recordId) => {
    const record = filterTagRecords.find((entry) => entry.id === recordId);
    if (!record) return;

    const nextName = normalizeOptionLabel(record.draftName || record.name);
    const nextSlug = slugify(record.draftSlug || record.slug || nextName);

    if (!nextName) {
      setEditorError("El filtro no puede quedar vaco.");
      return;
    }

    const duplicated = filterTagRecords.some((entry) => entry.id !== recordId && entry.name.toLowerCase() === nextName.toLowerCase());
    if (duplicated) {
      setEditorError("Ya existe otro filtro con ese nombre.");
      return;
    }

    setFilterTagRecords((previous) => previous.map((entry) => entry.id === recordId ? { ...entry, name: nextName, slug: nextSlug, draftName: nextName, draftSlug: nextSlug, active: true } : entry));

    if (record.name.toLowerCase() !== nextName.toLowerCase()) {
      setProducts((previous) => previous.map((product) => {
        const nextTags = (product.filterTags || []).map((tag) => normalizeOptionLabel(tag).toLowerCase() === record.name.toLowerCase() ? nextName : tag);
        return { ...product, filterTags: [...new Set(nextTags.map((tag) => normalizeOptionLabel(tag)).filter(Boolean))] };
      }));
      setProductForm((previous) => ({
        ...previous,
        filterTagsText: splitFilterTagsText(previous.filterTagsText).map((tag) => tag.toLowerCase() === record.name.toLowerCase() ? nextName : tag).join(", "),
      }));
    }

    setEditorMessage(`Filtro actualizado a "${nextName}".`);
    setEditorError("");
  };

  const toggleManagedFilterTagActive = (recordId) => {
    setFilterTagRecords((previous) => previous.map((record) => record.id === recordId ? { ...record, active: !record.active } : record));
  };

  const deleteManagedFilterTag = (recordId, replacementName) => {
    const record = filterTagRecords.find((entry) => entry.id === recordId);
    if (!record) return;

    const replacement = normalizeOptionLabel(replacementName);

    if (typeof window !== "undefined" && !window.confirm(`Eliminar el filtro "${record.name}"?`)) return;

    setProducts((previous) => previous.map((product) => {
      const currentTags = splitFilterTagsText((product.filterTags || []).join(", "));
      const withoutDeleted = currentTags.filter((tag) => tag.toLowerCase() !== record.name.toLowerCase());
      const nextTags = replacement ? [...withoutDeleted, replacement] : withoutDeleted;
      return { ...product, filterTags: [...new Set(nextTags)] };
    }));

    setProductForm((previous) => {
      const currentTags = splitFilterTagsText(previous.filterTagsText).filter((tag) => tag.toLowerCase() !== record.name.toLowerCase());
      const nextTags = replacement ? [...currentTags, replacement] : currentTags;
      return { ...previous, filterTagsText: [...new Set(nextTags)].join(", ") };
    });

    setFilterTagRecords((previous) => previous.filter((entry) => entry.id !== recordId));
    setEditorMessage(`Filtro "${record.name}" eliminado${replacement ? ` y reemplazado por "${replacement}"` : ""}.`);
    setEditorError("");
  };

  const handleColorFieldChange = (uid, field, value) => {
    setProductForm((previous) => ({
      ...previous,
      colorsData: previous.colorsData.map((color) => color.uid === uid ? { ...color, [field]: field === "name" ? normalizeOptionLabel(value) : value } : color),
    }));
  };

  const handleColorImageChange = (uid, imageIndex, value) => {
    setProductForm((previous) => ({
      ...previous,
      colorsData: previous.colorsData.map((color) => {
        if (color.uid !== uid) return color;
        return {
          ...color,
          images: color.images.map((image, index) => index === imageIndex ? value : image),
        };
      }),
    }));
  };

  const addSizeRow = (uid) => {
    setProductForm((previous) => ({
      ...previous,
      colorsData: previous.colorsData.map((color) => color.uid === uid ? {
        ...color,
        sizes: [...(color.sizes || []), { uid: createUid(), size: "", stock: "0" }],
      } : color),
    }));
  };

  const handleSizeRowChange = (colorUid, sizeUid, field, value) => {
    setProductForm((previous) => ({
      ...previous,
      colorsData: previous.colorsData.map((color) => color.uid === colorUid ? {
        ...color,
        sizes: (color.sizes || []).map((entry) => entry.uid === sizeUid ? {
          ...entry,
          [field]: field === "size" ? normalizeOptionLabel(value) : value,
        } : entry),
      } : color),
    }));
  };

  const removeSizeRow = (colorUid, sizeUid) => {
    setProductForm((previous) => ({
      ...previous,
      colorsData: previous.colorsData.map((color) => {
        if (color.uid !== colorUid) return color;
        const nextSizes = (color.sizes || []).filter((entry) => entry.uid !== sizeUid);
        return {
          ...color,
          sizes: nextSizes.length ? nextSizes : [{ uid: createUid(), size: "", stock: "0" }],
        };
      }),
    }));
  };

  const addColorVariant = () => {
    setProductForm((previous) => ({
      ...previous,
      colorsData: [
        ...previous.colorsData,
        {
          uid: createUid(),
          name: "",
          images: [""],
          sizes: [{ uid: createUid(), size: "", stock: "0" }],
        },
      ],
    }));
    setEditorError("");
  };

  const removeColorVariant = (uid) => {
    setProductForm((previous) => {
      if (previous.colorsData.length === 1) return previous;
      return {
        ...previous,
        colorsData: previous.colorsData.filter((color) => color.uid !== uid),
      };
    });
  };

  const addImageField = (uid) => {
    setProductForm((previous) => ({
      ...previous,
      colorsData: previous.colorsData.map((color) => {
        if (color.uid !== uid) return color;
        return { ...color, images: [...color.images, ""] };
      }),
    }));
  };

  const removeImageField = (uid, imageIndex) => {
    setProductForm((previous) => ({
      ...previous,
      colorsData: previous.colorsData.map((color) => {
        if (color.uid !== uid) return color;
        const nextImages = color.images.filter((_, index) => index !== imageIndex);
        return { ...color, images: nextImages.length ? nextImages : [""] };
      }),
    }));
  };

  const handleColorFilesUpload = async (uid, event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    try {
      const uploadedImages = await Promise.all(files.map((file) => fileToDataUrl(file)));

      setProductForm((previous) => ({
        ...previous,
        colorsData: previous.colorsData.map((color) => {
          if (color.uid !== uid) return color;
          const currentImages = color.images.filter(Boolean);
          return {
            ...color,
            images: currentImages.length ? [...currentImages, ...uploadedImages] : uploadedImages,
          };
        }),
      }));
      setEditorError("");
      showToastMessage(`${uploadedImages.length} imagen(es) cargadas correctamente.`, "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "No pudimos cargar una o mas imagenes.";
      setEditorError(message);
      showToastMessage(message, "error");
    }
    event.target.value = "";
  };

  const handleStoreSlideImageUpload = async (slideId, event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const image = await fileToDataUrl(file);
      setStoreDraft((previous) => ({
        ...previous,
        heroSlides: previous.heroSlides.map((slide) => slide.id === slideId ? { ...slide, image } : slide),
      }));
      showToastMessage("Slide actualizado.", "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "No pudimos subir la imagen del slide.";
      setEditorError(message);
      showToastMessage(message, "error");
    }
    event.target.value = "";
  };

  const addHeroSlide = () => {
    setStoreDraft((previous) => ({
      ...previous,
      heroSlides: [
        ...previous.heroSlides,
        {
          id: createUid(),
          title: `Slide ${previous.heroSlides.length + 1}`,
          subtitle: "Describe aqui el mensaje del slide.",
          image: FALLBACK_IMAGE,
          linkedProductId: "",
          targetUrl: "",
        },
      ],
    }));
  };

  const removeHeroSlide = (slideId) => {
    setStoreDraft((previous) => {
      if (previous.heroSlides.length === 1) return previous;
      return {
        ...previous,
        heroSlides: previous.heroSlides.filter((slide) => slide.id !== slideId),
      };
    });
  };

  const applyOfferPatchToProduct = useCallback((product, patch = {}) => {
    const basePrice = Math.max(0, Number(product.basePrice != null ? product.basePrice : product.price) || 0);
    const previousMode = normalizeOfferDiscountMode(product.offerDiscountMode);
    const nextMode = normalizeOfferDiscountMode(
      patch.offerDiscountMode != null ? patch.offerDiscountMode : previousMode,
    );
    const currentFallbackValue = product.offerDiscountValue != null
      ? product.offerDiscountValue
      : (previousMode === "amount"
        ? (product.offerExtraAmount != null ? product.offerExtraAmount : 0)
        : (product.offerExtraDiscount != null ? product.offerExtraDiscount : 0));

    const rawNextValue = patch.offerDiscountValue != null
      ? patch.offerDiscountValue
      : currentFallbackValue;

    const resolvedOffer = resolveOfferDiscount(basePrice, nextMode, rawNextValue);
    const offerEnabled = patch.offerEnabled != null
      ? Boolean(patch.offerEnabled)
      : Boolean(product.offerEnabled);
    const nextPrice = offerEnabled ? computeOfferPrice(basePrice, resolvedOffer.percent) : basePrice;

    return normalizeProduct({
      ...product,
      offerEnabled,
      offerDiscountMode: resolvedOffer.mode,
      offerDiscountValue: resolvedOffer.value,
      offerExtraDiscount: resolvedOffer.percent,
      offerExtraAmount: resolvedOffer.amount,
      basePrice,
      price: nextPrice,
    });
  }, []);

  const saveOffersFromAdmin = async (draftById = {}) => {
    if (!draftById || typeof draftById !== "object") {
      return { ok: false, saved: 0 };
    }
    const pendingIds = new Set(Object.keys(draftById).map((entry) => String(entry)));
    if (!pendingIds.size) {
      return { ok: true, saved: 0 };
    }

    let nextProductsSnapshot = null;
    let savedCount = 0;
    setProducts((previous) => {
      const updated = previous.map((product) => {
        const productId = String(product.id);
        if (!pendingIds.has(productId)) return product;
        const patch = draftById[productId] || draftById[product.id];
        if (!patch) return product;
        const nextProduct = applyOfferPatchToProduct(product, patch);
        const unchanged = nextProduct.offerEnabled === product.offerEnabled
          && nextProduct.offerDiscountMode === product.offerDiscountMode
          && Number(nextProduct.offerDiscountValue) === Number(product.offerDiscountValue)
          && Number(nextProduct.offerExtraDiscount) === Number(product.offerExtraDiscount)
          && Number(nextProduct.offerExtraAmount) === Number(product.offerExtraAmount)
          && Number(nextProduct.price) === Number(product.price)
          && Number(nextProduct.basePrice) === Number(product.basePrice);
        if (unchanged) return product;
        savedCount += 1;
        return nextProduct;
      });
      nextProductsSnapshot = updated;
      return updated;
    });
    if (nextProductsSnapshot) {
      productsRef.current = nextProductsSnapshot;
    }

    if (savedCount === 0) {
      setEditorMessage("No había cambios pendientes para guardar en ofertas.");
      setEditorError("");
      return { ok: true, saved: 0 };
    }

    if (productForm.id != null) {
      const updatedProduct = (nextProductsSnapshot || []).find(
        (product) => String(product.id) === String(productForm.id),
      );
      if (updatedProduct) {
        setProductForm(createProductForm(updatedProduct));
      }
    }

    setOfferSaveBusy(true);
    try {
      const syncResult = await syncCatalogSnapshot({
        products: nextProductsSnapshot || productsRef.current,
      }, { silent: true });

      if (!syncResult.ok) {
        const message = syncResult.message || "Se guardaron las ofertas localmente, pero falló la sincronización con el servidor.";
        setEditorError(message);
        showToastMessage(message, "warning");
        return { ok: false, saved: savedCount };
      }

      catalogSyncErrorShownRef.current = false;
      setEditorMessage(`${savedCount} oferta${savedCount === 1 ? "" : "s"} guardada${savedCount === 1 ? "" : "s"} correctamente.`);
      setEditorError("");
      showToastMessage("Ofertas sincronizadas con el servidor.", "success");
      return { ok: true, saved: savedCount };
    } finally {
      setOfferSaveBusy(false);
    }
  };

  const saveProduct = async () => {
    const builtProduct = buildProductFromForm(productForm);
    if (builtProduct.error) {
      setEditorError(builtProduct.error);
      setEditorMessage("");
      return;
    }

    const normalizedProduct = normalizeProduct(builtProduct.value);
    const nextProductTypeRecords = ensureManagedEntity(productTypeRecords, normalizedProduct.productType, "product-type");
    const nextFilterTagRecords = normalizedProduct.filterTags.reduce(
      (records, tag) => ensureManagedEntity(records, tag, "filter-tag"),
      filterTagRecords,
    );
    const nextProducts = productForm.id
      ? products.map((product) => normalizeEntityId(product.id) === normalizeEntityId(normalizedProduct.id) ? normalizedProduct : product)
      : [normalizedProduct, ...products];

    setProductTypeRecords(nextProductTypeRecords);
    setFilterTagRecords(nextFilterTagRecords);
    setProducts(nextProducts);
    productsRef.current = nextProducts;
    productTypeRecordsRef.current = nextProductTypeRecords;
    filterTagRecordsRef.current = nextFilterTagRecords;

    setEditorMessage(productForm.id ? `Producto "${normalizedProduct.name}" actualizado.` : `Producto "${normalizedProduct.name}" agregado al catalogo.`);
    setEditorError("");
    resetEditor();

    const syncResult = await syncCatalogSnapshot({
      products: nextProducts,
      productTypeRecords: nextProductTypeRecords,
      filterTagRecords: nextFilterTagRecords,
    }, { silent: true });

    if (!syncResult.ok) {
      setEditorError(syncResult.message || "Guardamos cambios localmente, pero no pudimos sincronizar con el servidor.");
      showToastMessage(syncResult.message || "Guardamos cambios localmente, pero no pudimos sincronizar con el servidor.", "warning");
      return;
    }

    showToastMessage(`Producto "${normalizedProduct.name}" sincronizado con el servidor.`, "success");
  };

  const saveContactConfiguration = async () => {
    const emailDraft = normalizeEmail(contactDraft.email || "");
    if (emailDraft && !isValidEmail(emailDraft)) {
      setEditorError("El correo de contacto no tiene un formato valido.");
      setEditorMessage("");
      setContactSyncFeedback({
        tone: "error",
        message: "No se pudo sincronizar: correo de contacto invalido.",
      });
      return;
    }
    const nextContactSettings = normalizeContactSettings({ ...contactDraft });
    if (!nextContactSettings.whatsappNumber && !nextContactSettings.whatsappLink) {
      setEditorError("Configura al menos un numero o enlace de WhatsApp para permitir checkout.");
      setEditorMessage("");
      setContactSyncFeedback({
        tone: "error",
        message: "No se pudo sincronizar: falta WhatsApp para checkout.",
      });
      return;
    }
    const nextStoreSettings = mergeStoreSettings({
      ...storeSettingsRef.current,
      footerTitle: sanitizeLine(storeDraft.footerTitle || ""),
      footerText: sanitizeParagraph(storeDraft.footerText || ""),
    });
    setContactSettings(nextContactSettings);
    setStoreSettings(nextStoreSettings);
    setStoreDraft((previous) => ({
      ...previous,
      footerTitle: nextStoreSettings.footerTitle,
      footerText: nextStoreSettings.footerText,
    }));
    contactSettingsRef.current = nextContactSettings;
    storeSettingsRef.current = nextStoreSettings;
    setEditorMessage("La informacion de contacto, redes y texto visible del bloque de contacto fue actualizada.");
    setEditorError("");
    showToastMessage("Configuracion de contacto guardada.", "success");

    const localTimestamp = new Date().toISOString();
    setContactSyncFeedback({
      tone: "warning",
      message: `Guardado local completado. Sincronizando con servidor... (${formatAdminTimestamp(localTimestamp)})`,
    });

    if (!isAdmin || !catalogReady) {
      setContactSyncFeedback({
        tone: "warning",
        message: "Guardado localmente. Inicia sesion admin para sincronizar con servidor.",
      });
      return;
    }

    const syncResult = await syncCatalogSnapshot({
      contactSettings: nextContactSettings,
      storeSettings: nextStoreSettings,
    }, { silent: true });
    if (!syncResult.ok) {
      showToastMessage("Guardado localmente. No pudimos sincronizar con el servidor todavia.", "warning");
      setContactSyncFeedback({
        tone: "warning",
        message: "Guardado localmente. Falto sincronizar con servidor; intenta nuevamente.",
      });
    } else {
      catalogSyncErrorShownRef.current = false;
      const syncedAt = new Date().toISOString();
      setContactSyncFeedback({
        tone: "success",
        message: `Sincronizado con servidor: ${formatAdminTimestamp(syncedAt)}`,
      });
    }
  };

  const saveStoreConfiguration = async () => {
    const nextStoreSettings = mergeStoreSettings(storeDraft);
    setStoreSettings(nextStoreSettings);
    storeSettingsRef.current = nextStoreSettings;
    setEditorMessage("La portada, branding, ofertas y slides fueron actualizados.");
    setEditorError("");
    const syncResult = await syncCatalogSnapshot({
      storeSettings: nextStoreSettings,
    }, { silent: true });
    if (!syncResult.ok) {
      showToastMessage(syncResult.message || "Guardamos cambios localmente, pero no pudimos sincronizar la configuracion.", "warning");
      return;
    }
    showToastMessage("Portada, branding y slides actualizados y sincronizados.", "success");
  };

  const updateOrderStatus = async (orderId, nextStatus) => {
    const targetOrder = orderHistory.find((order) => order.id === orderId);
    const normalizedStatus = normalizeOrderStatusForOrder(nextStatus, targetOrder?.deliveryType || "delivery");
    const response = await updateServerOrder({
      orderId,
      status: normalizedStatus,
    });
    if (!response.ok) {
      showToastMessage(response.message || "No pudimos actualizar el estado del pedido.", "error");
      return;
    }
    if (Array.isArray(response.orderHistory)) {
      setOrderHistory(response.orderHistory.map(normalizeOrderRecord));
      setLiveOrdersUpdatedAt(new Date().toISOString());
    }
    const serverMessage = sanitizeLine(response.message || "");
    const serverWarning = sanitizeLine(response.warning || "");
    const summaryMessage = serverMessage || `Estado del pedido actualizado a "${normalizedStatus}".`;
    setEditorMessage(summaryMessage);
    setEditorError("");
    showToastMessage(summaryMessage, "success");
    if (serverWarning) {
      showToastMessage(serverWarning, "warning");
    }
  };
  const clearAdminOrderFilters = () => {
    setOrderSearch("");
    setOrderStatusFilter("all");
    setOrderDeliveryFilter("all");
    setOrderDateFilter("all");
    setOrderCustomerFilter("");
  };

  const scheduleOrderPatchSync = (orderId, patch) => {
    const currentTimer = orderPatchTimersRef.current.get(orderId);
    if (currentTimer?.id) {
      window.clearTimeout(currentTimer.id);
    }
    const mergedPatch = {
      ...(currentTimer?.patch || {}),
      ...patch,
    };
    const timerId = window.setTimeout(async () => {
      const response = await updateServerOrder({
        orderId,
        ...mergedPatch,
      });
      if (!response.ok) {
        showToastMessage(response.message || "No pudimos sincronizar los cambios del pedido.", "error");
      } else if (Array.isArray(response.orderHistory)) {
        setOrderHistory(response.orderHistory.map(normalizeOrderRecord));
        setLiveOrdersUpdatedAt(new Date().toISOString());
      }
      orderPatchTimersRef.current.delete(orderId);
    }, 450);
    orderPatchTimersRef.current.set(orderId, {
      id: timerId,
      patch: mergedPatch,
    });
  };

  const updateOrderGuide = async (orderId, guideNumber) => {
    const safeGuideNumber = sanitizeLine(guideNumber);
    setOrderHistory((previous) => previous.map((order) => (
      order.id === orderId ? { ...order, guideNumber: safeGuideNumber } : order
    )));
    scheduleOrderPatchSync(orderId, { guideNumber: safeGuideNumber });
  };

  const updateOrderPaymentProof = async (orderId, paymentProof) => {
    setOrderHistory((previous) => previous.map((order) => (
      order.id === orderId ? { ...order, paymentProof } : order
    )));
    scheduleOrderPatchSync(orderId, { paymentProof });
  };

  const clearOrderPaymentProof = async (orderId) => {
    await updateOrderPaymentProof(orderId, "");
    setEditorMessage("La foto del comprobante fue eliminada.");
    setEditorError("");
  };

  const handleOrderProofUpload = async (orderId, event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const image = await fileToDataUrl(file);
      await updateOrderPaymentProof(orderId, image);
      showToastMessage("Comprobante cargado correctamente.", "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "No pudimos cargar el comprobante.";
      setEditorError(message);
      showToastMessage(message, "error");
    }
    event.target.value = "";
  };

  const deleteOrder = async (orderId) => {
    const target = orderHistory.find((order) => order.id === orderId);
    if (!target) return;
    if (typeof window !== "undefined" && !window.confirm(`Eliminar el pedido ${target.code}?`)) return;
    const response = await deleteServerOrder({ orderId });
    if (!response.ok) {
      showToastMessage(response.message || "No pudimos eliminar el pedido.", "error");
      return;
    }
    if (Array.isArray(response.orderHistory)) {
      setOrderHistory(response.orderHistory.map(normalizeOrderRecord));
      setLiveOrdersUpdatedAt(new Date().toISOString());
    }
    setEditorMessage(`Pedido ${target.code} eliminado.`);
    setEditorError("");
  };

  const handleHeroSlideClick = (slide) => {
    if (!slide) return;

    if (slide.targetUrl?.trim()) {
      launchExternalUrl(slide.targetUrl.trim());
      return;
    }

    if (slide.linkedProductId) {
      const product = products.find((entry) => String(entry.id) === String(slide.linkedProductId));
      if (product) {
        openProductDetail(product);
      }
    }
  };

  const checkoutDisabled = Boolean(checkoutBusy || couponBusy || (activeCouponCode && !appliedCouponState?.ok));
  const toastTone = toast?.tone || "success";
  const ToastIcon = toastTone === "error"
    ? CircleX
    : (toastTone === "warning" ? Clock3 : (toastTone === "info" ? MessageCircle : BadgeCheck));

  return (
    <MotionConfig reducedMotion="user">
      <>
      <ProductModal
        product={selectedProduct}
        selection={selectedProduct ? selections[selectedProduct.id] : null}
        onClose={() => closeProductModal({ returnToCart: true })}
        onChange={handleSelection}
        cartEditMode={Boolean(editingCartItemKey)}
        onAddToCart={(product, animationMeta) => {
          const wasEditingCartItem = Boolean(editingCartItemKey);
          addToCart(product, animationMeta);
          closeProductModal();
          if (wasEditingCartItem) {
            setShowCartSummary(true);
          }
        }}
        isAdmin={isAdmin}
        onEditProduct={(product) => {
          startEditingProduct(product);
          setSelectedProduct(null);
        }}
      />

      <AnimatePresence>
        {flyToCartFx && (
          <Motion.img
            key={flyToCartFx.id}
            src={flyToCartFx.image}
            alt=""
            className="fly-to-cart-thumb"
            initial={{ x: 0, y: 0, scale: 1, opacity: 0.95, rotate: 0 }}
            animate={{
              x: flyToCartFx.endX - flyToCartFx.startX,
              y: flyToCartFx.endY - flyToCartFx.startY,
              scale: 0.22,
              opacity: 0.2,
              rotate: 10,
            }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.64, ease: [0.2, 0.8, 0.2, 1] }}
            style={{ left: flyToCartFx.startX, top: flyToCartFx.startY }}
          />
        )}
      </AnimatePresence>

      <div className="confetti-root" aria-hidden="true">
        <AnimatePresence>
          {confettiBursts.map((burst) => (
            <ConfettiBurst key={burst.id} id={burst.id} tone={burst.tone} />
          ))}
        </AnimatePresence>
      </div>

      <CartSummaryModal
        key={`cart-summary-${showCartSummary ? "open" : "closed"}-${currentUser?.id || "guest"}`}
        open={showCartSummary}
        onClose={() => setShowCartSummary(false)}
        cart={cart}
        subtotal={subtotal}
        discountAmount={discountAmount}
        finalTotal={finalTotal}
        totalItems={totalItems}
        onUpdateQuantity={updateQuantity}
        onRemoveItem={removeItem}
        onOpenItem={openProductFromCartItem}
        onEditItem={startEditingCartItem}
        products={products}
        onCheckout={handleCheckoutViaWhatsApp}
        onSaveCheckoutAddress={saveCheckoutAddressToBook}
        checkoutDisabled={checkoutDisabled}
        requiresLogin={!currentUser?.email}
        couponDraftCode={couponInputCode}
        onCouponDraftChange={setCouponInputCode}
        onApplyCoupon={applyCouponFromInput}
        onRemoveCoupon={clearActiveCoupon}
        couponState={activeCouponCode ? appliedCouponState : null}
        hasActiveCoupon={Boolean(activeCouponCode)}
        couponBusy={couponBusy}
        checkoutBusy={checkoutBusy}
        onBrowseCatalog={browseCatalogFromModal}
        currentUser={currentUser}
        savedAddresses={currentUserAddressBook}
        contactSettings={contactSettings}
      />

      <FavoritesModal
        open={showFavoritesPanel}
        onClose={() => setShowFavoritesPanel(false)}
        favorites={favorites}
        products={products}
        onOpenProduct={(product) => openProductDetail(product)}
        onToggleFavorite={toggleFavorite}
        onBrowseCatalog={browseCatalogFromModal}
      />

      <ProfileQuickMenu
        open={showProfileQuickMenu}
        position={profileQuickMenuPosition}
        onClose={() => setShowProfileQuickMenu(false)}
        onOpenSection={openProfileActionFromMenu}
        onOpenOrders={openOrdersFromProfileMenu}
        onLogout={() => { void handleUserLogout(); }}
      />

      <Suspense fallback={null}>
        <UserAuthSheet
          open={showUserAuth}
          mode={authMode}
          form={authForm}
          validation={authValidation}
          canSubmit={authValidation.canSubmit}
          error={authError}
          busy={authBusy}
          passwordVisible={authPasswordVisible}
          resetEmailLocked={authResetEmailLocked}
          onClose={closeUserAuth}
          onModeChange={(nextMode) => {
            setAuthMode(nextMode);
            setAuthResetEmailLocked(false);
            setAuthError("");
            setAuthBusy(false);
            setAuthPasswordVisible(false);
            setAuthForm((previous) => ({ ...previous, password: "", confirmPassword: "", resetToken: nextMode === "reset" ? previous.resetToken : "" }));
          }}
          onFieldChange={handleAuthFieldChange}
          onTogglePasswordVisibility={() => setAuthPasswordVisible((previous) => !previous)}
          onSubmit={handleUserAuthSubmit}
        />

        <ProfileModal
          open={showProfileModal}
          onClose={() => {
            setShowProfileModal(false);
            setProfileFeedback(null);
            setPasswordFeedback(null);
            resetAddressBookEditor();
          }}
          activeSection={profileModalSection}
          profileDraft={profileDraft}
          onFieldChange={handleProfileFieldChange}
          onSaveProfile={handleSaveProfile}
          addressBookDraft={addressBookDraft}
          addressBookEditingId={addressBookEditingId}
          onAddressBookDraftChange={handleAddressBookDraftFieldChange}
          onSaveAddressBookEntry={handleSaveAddressBookEntry}
          onEditAddressBookEntry={handleEditAddressBookEntry}
          onDeleteAddressBookEntry={handleDeleteAddressBookEntry}
          onSelectAddressBookEntry={handleSelectAddressBookEntry}
          profileFeedback={profileFeedback}
          passwordDraft={passwordDraft}
          onPasswordFieldChange={handlePasswordFieldChange}
          onChangePassword={handleChangePassword}
          passwordFeedback={passwordFeedback}
        />
      </Suspense>

      <OrdersModal
        open={showOrdersModal}
        onClose={() => setShowOrdersModal(false)}
        orders={customerOrders}
        onSearchChange={setUserOrderSearch}
        searchValue={userOrderSearch}
        onOpenReference={setReferenceOrder}
        onCopyOrderCode={handleCopyOrderCode}
        onOpenOrderWhatsApp={handleOpenOrderWhatsApp}
      />

      <AdminPanelModal
        open={showAdminPanel && isAdmin}
        onClose={() => setShowAdminPanel(false)}
        adminTab={adminTab === "inventario" ? "resumen" : adminTab}
        setAdminTab={(nextTab) => setAdminTab(nextTab === "inventario" ? "resumen" : nextTab)}
        editorMessage={editorMessage}
        editorError={editorError}
        adminProductCount={adminProductCount}
        adminColorVariantCount={adminColorVariantCount}
        adminPhotoCount={adminPhotoCount}
        adminOutOfStockCount={adminOutOfStockCount}
        adminLowStockCount={adminLowStockCount}
        adminPendingOrders={adminPendingOrders}
        adminRegisteredUsers={adminRegisteredUsers}
        adminOrdersToday={adminOrdersToday}
        adminRevenueTotal={adminRevenueTotal}
        adminAverageOrderTotal={adminAverageOrderTotal}
        adminCatalogQuery={adminCatalogQuery}
        setAdminCatalogQuery={setAdminCatalogQuery}
        onSaveOffers={saveOffersFromAdmin}
        offersSaving={offerSaveBusy}
        adminCatalogProducts={adminCatalogProducts}
        products={products}
        startEditingProduct={startEditingProduct}
        handleDeleteProduct={handleDeleteProduct}
        bulkDeleteCatalogProducts={bulkDeleteCatalogProducts}
        bulkSetCatalogFeatured={bulkSetCatalogFeatured}
        toggleProductPublicVisibility={toggleProductPublicVisibility}
        productForm={productForm}
        resetEditor={resetEditor}
        handleProductFieldChange={handleProductFieldChange}
        setContactDraft={setContactDraft}
        contactDraft={contactDraft}
        saveContactConfiguration={saveContactConfiguration}
        contactSyncFeedback={contactSyncFeedback}
        addColorVariant={addColorVariant}
        handleColorFieldChange={handleColorFieldChange}
        removeColorVariant={removeColorVariant}
        handleColorFilesUpload={handleColorFilesUpload}
        addImageField={addImageField}
        handleColorImageChange={handleColorImageChange}
        removeImageField={removeImageField}
        saveProduct={saveProduct}
        setStoreDraft={setStoreDraft}
        storeDraft={storeDraft}
        handleStoreSlideImageUpload={handleStoreSlideImageUpload}
        saveStoreConfiguration={saveStoreConfiguration}
        addHeroSlide={addHeroSlide}
        removeHeroSlide={removeHeroSlide}
        previewColor={previewColor}
        setPreviewColor={setPreviewColor}
        previewImageIndex={previewImageIndex}
        setPreviewImageIndex={setPreviewImageIndex}
        filteredOrderHistory={filteredOrderHistory}
        orderSearch={orderSearch}
        setOrderSearch={setOrderSearch}
        orderStatusFilter={orderStatusFilter}
        setOrderStatusFilter={setOrderStatusFilter}
        orderDeliveryFilter={orderDeliveryFilter}
        setOrderDeliveryFilter={setOrderDeliveryFilter}
        orderDateFilter={orderDateFilter}
        setOrderDateFilter={setOrderDateFilter}
        orderCustomerFilter={orderCustomerFilter}
        setOrderCustomerFilter={setOrderCustomerFilter}
        clearAdminOrderFilters={clearAdminOrderFilters}
        adminOrderCustomerOptions={adminOrderCustomerOptions}
        updateOrderStatus={updateOrderStatus}
        updateOrderGuide={updateOrderGuide}
        updateOrderPaymentProof={updateOrderPaymentProof}
        clearOrderPaymentProof={clearOrderPaymentProof}
        handleOrderProofUpload={handleOrderProofUpload}
        deleteOrder={deleteOrder}
        liveOrdersEnabled={liveOrdersEnabled}
        setLiveOrdersEnabled={setLiveOrdersEnabled}
        liveOrdersRefreshing={liveOrdersRefreshing}
        liveOrdersUpdatedAt={liveOrdersUpdatedAt}
        orderLiveAlert={orderLiveAlert}
        clearOrderLiveAlert={() => setOrderLiveAlert(null)}
        refreshOrdersFromServer={refreshOrdersFromServer}
        onOpenOrderReference={setReferenceOrder}
        onCopyOrderCode={handleCopyOrderCode}
        productTypeOptions={productTypeOptions}
        customProductTypeInput={customProductTypeInput}
        setCustomProductTypeInput={setCustomProductTypeInput}
        addManagedProductType={addManagedProductType}
        filterTagOptions={filterTagOptions}
        customFilterTagInput={customFilterTagInput}
        setCustomFilterTagInput={setCustomFilterTagInput}
        addManagedFilterTag={addManagedFilterTag}
        appendFilterTagToForm={appendFilterTagToForm}
        removeFilterTagFromForm={removeFilterTagFromForm}
        addSizeRow={addSizeRow}
        handleSizeRowChange={handleSizeRowChange}
        removeSizeRow={removeSizeRow}
        productTypeRecords={productTypeRecords}
        filterTagRecords={filterTagRecords}
        handleManagedProductTypeDraftChange={handleManagedProductTypeDraftChange}
        saveManagedProductType={saveManagedProductType}
        deleteManagedProductType={deleteManagedProductType}
        toggleManagedProductTypeActive={toggleManagedProductTypeActive}
        handleManagedFilterTagDraftChange={handleManagedFilterTagDraftChange}
        saveManagedFilterTag={saveManagedFilterTag}
        deleteManagedFilterTag={deleteManagedFilterTag}
        toggleManagedFilterTagActive={toggleManagedFilterTagActive}
        coupons={coupons}
        couponDraft={couponDraft}
        couponEditorMessage={couponEditorMessage}
        couponEditorError={couponEditorError}
        handleCouponDraftFieldChange={handleCouponDraftFieldChange}
        toggleCouponDraftProduct={toggleCouponDraftProduct}
        toggleCouponDraftProductType={toggleCouponDraftProductType}
        saveCoupon={saveCoupon}
        resetCouponDraft={resetCouponDraft}
        startEditingCoupon={startEditingCoupon}
        toggleCouponActive={toggleCouponActive}
        deleteCoupon={deleteCoupon}
        securityMetrics={securityMetrics}
        securityMetricsBusy={securityMetricsBusy}
        securityMetricsResetBusy={securityMetricsResetBusy}
        securityMetricsError={securityMetricsError}
        securityMetricsUpdatedAt={securityMetricsUpdatedAt}
        refreshSecurityMetrics={refreshSecurityMetrics}
        resetSecurityMetricsData={resetSecurityMetricsData}
        adminUsers={adminUsers}
        adminUsersBusy={adminUsersBusy}
        adminUsersError={adminUsersError}
        adminUsersSearch={adminUsersSearch}
        setAdminUsersSearch={setAdminUsersSearch}
        refreshAdminUsers={refreshAdminUsers}
        saveAdminUser={saveAdminUser}
        removeAdminUser={removeAdminUser}
        sendAdminUserResetLink={sendAdminUserResetLink}
        copyAdminUserResetLink={copyAdminUserResetLink}
      />

      <OrderReferenceModal
        open={Boolean(referenceOrder)}
        order={referenceOrder}
        onClose={() => setReferenceOrder(null)}
      />

      {isAdmin && !showAdminPanel && orderLiveAlert && (
        <aside className="global-admin-order-alert" role="status" aria-live="polite">
          <div className="global-admin-order-alert-copy">
            <p className="order-live-alert-kicker">Alerta admin</p>
            <h4 className="order-live-alert-title">
              {orderLiveAlert.totalNew > 1 ? `${orderLiveAlert.totalNew} pedidos nuevos` : "Nuevo pedido recibido"}
            </h4>
            <p className="order-live-alert-copy">
              {orderLiveAlert.orderCode
                ? `Pedido ${orderLiveAlert.orderCode} - ${orderLiveAlert.customerName} - ${currency(orderLiveAlert.total)}`
                : "Hay nuevos pedidos pendientes de revision inmediata."}
            </p>
            <p className="helper-text">Detectado: {formatAdminTimestamp(orderLiveAlert.detectedAt || orderLiveAlert.createdAt)}</p>
          </div>
          <div className="global-admin-order-alert-actions">
            <button
              className="btn btn-primary"
              type="button"
              onClick={() => {
                setAdminTab("pedidos");
                setShowAdminPanel(true);
              }}
            >
              Ver pedidos
            </button>
            <button className="btn btn-outline" type="button" onClick={() => setOrderLiveAlert(null)}>
              Ocultar
            </button>
          </div>
        </aside>
      )}

      <AnimatePresence>
        {toast && (
          <Motion.div
            className={`toast-stack ${toast.tone || "success"} ${toast.kind ? `toast-kind-${toast.kind}` : ""}`}
            initial={{ opacity: 0, y: 24, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 360, damping: 30, mass: 0.7 }}
            role="status"
            aria-live="polite"
          >
            <span className="toast-icon" aria-hidden="true"><ToastIcon size={15} /></span>
            <span className="toast-copy">
              {toast.title && <strong className="toast-title">{toast.title}</strong>}
              {toast.message && <span className="toast-message">{toast.message}</span>}
            </span>
            <button type="button" className="icon-btn toast-close" aria-label="Cerrar notificacin" onClick={() => setToast(null)}>
              <X size={14} />
            </button>
          </Motion.div>
        )}
      </AnimatePresence>

      <header className="topbar">
        <div className="container nav">
          <div className="nav-brand">
            <div>
              <p style={{ margin: 0, fontSize: 12, letterSpacing: ".35em", textTransform: "uppercase", color: "#71717a" }}>{storeSettings.brandLabel}</p>
              <h1 style={{ margin: "4px 0 0", fontSize: 28, fontWeight: 600, letterSpacing: ".25em" }}>{storeSettings.brandName}</h1>
            </div>
            <div className="mobile-header-tools" role="group" aria-label="Accesos rapidos">
              <button type="button" className="icon-quick-btn" onClick={openCatalogSearch} aria-label="Buscar prendas">
                <Search size={18} />
              </button>
              <button
                type="button"
                className="icon-quick-btn"
                onClick={(event) => {
                  if (currentUser) {
                    openProfileQuickMenu(event);
                    return;
                  }
                  openUserAuth({ mode: "login" });
                }}
                aria-label={currentUser ? "Mi perfil" : "Ingresar"}
              >
                <UserRound size={18} />
              </button>
              <button type="button" className="icon-quick-btn icon-quick-btn-badge" onClick={() => setShowFavoritesPanel(true)} aria-label="Favoritos">
                <Heart size={18} />
                {favorites.length > 0 && <span className="icon-quick-badge">{Math.min(favorites.length, 99)}</span>}
              </button>
              <button type="button" ref={mobileCartAnchorRef} className="icon-quick-btn icon-quick-btn-badge" onClick={() => setShowCartSummary(true)} aria-label="Carrito">
                <ShoppingBag size={18} />
                {totalItems > 0 && <span className="icon-quick-badge">{Math.min(totalItems, 99)}</span>}
              </button>
              <button
                type="button"
                className="icon-btn nav-menu-toggle"
                onClick={() => setShowMobileNav((previous) => !previous)}
                aria-label={showMobileNav ? "Cerrar menu" : "Abrir menu"}
                aria-expanded={showMobileNav}
              >
                <Menu size={18} />
              </button>
            </div>
          </div>

          <nav className="nav-links">
            <a href="#destacados" onClick={() => setShowMobileNav(false)}>Destacados</a>
            <a href="#coleccion" onClick={() => setShowMobileNav(false)}>Coleccion</a>
            <a href="#recomendados" onClick={() => setShowMobileNav(false)}>Recomendados</a>
            <a href="#contacto" onClick={() => setShowMobileNav(false)}>Contacto</a>
          </nav>

          <div className="nav-actions">
            <div className="nav-icon-actions" role="group" aria-label="Acciones rapidas">
              <button type="button" className="icon-quick-btn" onClick={openCatalogSearch} aria-label="Buscar prendas" title="Buscar prendas">
                <Search size={19} />
              </button>
              <button
                type="button"
                className="icon-quick-btn"
                onClick={(event) => {
                  if (currentUser) {
                    openProfileQuickMenu(event);
                    return;
                  }
                  openUserAuth({ mode: "login" });
                }}
                aria-label={currentUser ? "Mi perfil" : "Ingresar"}
                title={currentUser ? "Mi perfil" : "Ingresar"}
              >
                <UserRound size={19} />
              </button>
              <button type="button" className="icon-quick-btn icon-quick-btn-badge" onClick={() => setShowFavoritesPanel(true)} aria-label="Favoritos" title="Favoritos">
                <Heart size={19} />
                {favorites.length > 0 && <span className="icon-quick-badge">{Math.min(favorites.length, 99)}</span>}
              </button>
              <button type="button" ref={desktopCartAnchorRef} className="icon-quick-btn icon-quick-btn-badge" onClick={() => setShowCartSummary(true)} aria-label="Carrito" title="Carrito">
                <ShoppingBag size={19} />
                {totalItems > 0 && <span className="icon-quick-badge">{Math.min(totalItems, 99)}</span>}
              </button>
            </div>

            {currentUser && !isAdmin && (
              <>
                <button className="btn btn-outline nav-account-inline" style={{ padding: "10px 14px" }} onClick={() => setShowOrdersModal(true)}>
                  <Package size={14} />
                  Mis pedidos
                </button>
                <button className="btn btn-outline nav-account-inline" style={{ padding: "10px 14px" }} onClick={() => handleUserLogout()}>
                  <X size={14} />
                  Salir
                </button>
              </>
            )}

            {isAdmin && (
              <>
                <button className="btn btn-soft nav-admin-btn" style={{ padding: "10px 14px" }} onClick={() => openAdminPanel()}>
                  <ShieldCheck size={14} />
                  Panel admin
                </button>
                <button className="btn btn-outline nav-admin-btn" style={{ padding: "10px 14px" }} onClick={() => handleAdminLogout()}>
                  <X size={14} />
                  Cerrar sesion
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <AnimatePresence>
        {showMobileNav && (
          <Motion.div
            className="mobile-nav-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowMobileNav(false)}
          >
            <Motion.nav
              className="mobile-nav-panel"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ duration: ANIMATION.base }}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mobile-nav-head">
                <strong>{storeSettings.brandName}</strong>
                <button type="button" className="icon-btn" onClick={() => setShowMobileNav(false)} aria-label="Cerrar menu">
                  <X size={16} />
                </button>
              </div>
              <p className="mobile-nav-subhead">
                {currentUser?.name ? `Hola, ${currentUser.name}` : "Explora la tienda y encuentra tus favoritos"}
              </p>
              <div className="mobile-nav-section">
                <p className="mobile-nav-section-label">Navegacion</p>
                <div className="mobile-nav-links">
                  <a href="#destacados" onClick={() => setShowMobileNav(false)}>
                    <span>Destacados</span>
                    <ChevronRight size={15} />
                  </a>
                  <a href="#coleccion" onClick={() => setShowMobileNav(false)}>
                    <span>Coleccion</span>
                    <ChevronRight size={15} />
                  </a>
                  <a href="#recomendados" onClick={() => setShowMobileNav(false)}>
                    <span>Recomendados</span>
                    <ChevronRight size={15} />
                  </a>
                  <a href="#contacto" onClick={() => setShowMobileNav(false)}>
                    <span>Contacto</span>
                    <ChevronRight size={15} />
                  </a>
                </div>
              </div>
              <div className="mobile-quick-icons" role="group" aria-label="Accesos rapidos">
                <button type="button" className="icon-quick-btn" onClick={() => { setShowMobileNav(false); openCatalogSearch(); }} aria-label="Buscar">
                  <Search size={18} />
                </button>
                <button
                  type="button"
                  className="icon-quick-btn"
                  onClick={(event) => {
                    setShowMobileNav(false);
                    if (currentUser) {
                      openProfileQuickMenu(event);
                      return;
                    }
                    openUserAuth({ mode: "login" });
                  }}
                  aria-label={currentUser ? "Mi perfil" : "Ingresar"}
                >
                  <UserRound size={18} />
                </button>
                <button type="button" className="icon-quick-btn icon-quick-btn-badge" onClick={() => { setShowMobileNav(false); setShowFavoritesPanel(true); }} aria-label="Favoritos">
                  <Heart size={18} />
                  {favorites.length > 0 && <span className="icon-quick-badge">{Math.min(favorites.length, 99)}</span>}
                </button>
                <button type="button" className="icon-quick-btn icon-quick-btn-badge" onClick={() => { setShowMobileNav(false); setShowCartSummary(true); }} aria-label="Carrito">
                  <ShoppingBag size={18} />
                  {totalItems > 0 && <span className="icon-quick-badge">{Math.min(totalItems, 99)}</span>}
                </button>
              </div>
              <div className="mobile-nav-actions">
                <div className="mobile-nav-primary-grid">
                  <button className="btn btn-outline" onClick={() => { setShowMobileNav(false); setShowFavoritesPanel(true); }}>
                    <Heart size={14} />
                    Favoritos ({favorites.length})
                  </button>
                  <button className="btn btn-primary" onClick={() => { setShowMobileNav(false); setShowCartSummary(true); }}>
                    <ShoppingBag size={14} />
                    Carrito ({totalItems})
                  </button>
                </div>
                <div className="mobile-nav-account-grid">
                  {currentUser ? (
                    <>
                      <button className="btn btn-outline" onClick={(event) => { setShowMobileNav(false); openProfileQuickMenu(event); }}>
                        <UserRound size={14} />
                        Mi perfil
                      </button>
                      <button className="btn btn-outline" onClick={() => { setShowMobileNav(false); setShowOrdersModal(true); }}>
                        <Package size={14} />
                        Mis pedidos
                      </button>
                      <button className="btn btn-outline mobile-nav-logout-btn" onClick={() => handleUserLogout({ closeMobileNav: true })}>
                        <X size={14} />
                        Cerrar sesion
                      </button>
                    </>
                  ) : !isAdmin ? (
                    <button className="btn btn-outline" onClick={() => { setShowMobileNav(false); openUserAuth({ mode: "login" }); }}>
                      <ChevronRight size={14} />
                      Ingresar / crear cuenta
                    </button>
                  ) : null}
                </div>
                <div className="mobile-nav-admin-grid">
                  {isAdmin && (
                    <>
                      <button
                        className="btn btn-soft"
                        onClick={() => {
                          setShowMobileNav(false);
                          openAdminPanel({ closeMobileNav: true });
                        }}
                      >
                        <ShieldCheck size={14} />
                        Panel admin
                      </button>
                      <button
                        className="btn btn-outline"
                        onClick={() => {
                          handleAdminLogout({ closeMobileNav: true });
                        }}
                      >
                        <X size={14} />
                        Cerrar sesion admin
                      </button>
                    </>
                  )}
                </div>
              </div>
            </Motion.nav>
          </Motion.div>
        )}
      </AnimatePresence>

      <nav className="mobile-bottom-nav" aria-label="Navegacion rapida movil">
        <button
          type="button"
          className={`mobile-bottom-item ${mobileQuickActive === "inicio" ? "active" : ""}`}
          onClick={() => {
            setShowMobileNav(false);
            setActiveMobileSection("inicio");
            scrollToSection("inicio");
          }}
          aria-label="Ir a inicio"
        >
          <House size={17} />
          <span>Inicio</span>
        </button>
        <button
          type="button"
          className={`mobile-bottom-item ${mobileQuickActive === "catalogo" ? "active" : ""}`}
          onClick={() => {
            setShowMobileNav(false);
            setActiveMobileSection("catalogo");
            scrollToSection("coleccion");
          }}
          aria-label="Ir a catalogo"
        >
          <LayoutGrid size={17} />
          <span>Catalogo</span>
        </button>
        <button
          type="button"
          className={`mobile-bottom-item mobile-bottom-item-badge ${mobileQuickActive === "favoritos" ? "active" : ""}`}
          onClick={() => {
            setShowMobileNav(false);
            setShowFavoritesPanel(true);
          }}
          aria-label="Abrir favoritos"
        >
          <Heart size={17} />
          <span>Favoritos</span>
          {favorites.length > 0 && <span className="mobile-bottom-badge">{Math.min(favorites.length, 99)}</span>}
        </button>
        <button
          type="button"
          className={`mobile-bottom-item mobile-bottom-item-badge ${mobileQuickActive === "carrito" ? "active" : ""}`}
          onClick={() => {
            setShowMobileNav(false);
            setShowCartSummary(true);
          }}
          aria-label="Abrir carrito"
        >
          <ShoppingBag size={17} />
          <span>Carrito</span>
          {totalItems > 0 && <span className="mobile-bottom-badge">{Math.min(totalItems, 99)}</span>}
        </button>
      </nav>

      <section id="inicio" className="hero">
        <div className="container hero-grid hero-shell">
          <Motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: ANIMATION.medium }} className="hero-copy-panel">
            <span className="badge badge-dark hero-badge">{storeSettings.heroBadgeText}</span>
            <h2 className="section-title hero-title" style={{ fontSize: "clamp(34px, 6vw, 64px)", marginTop: 18 }}>{activeHeroSlide?.title || "Nueva coleccion"}</h2>
            <p className="muted hero-copy" style={{ fontSize: 18, lineHeight: 1.8, maxWidth: 620 }}>
              {activeHeroSlide?.subtitle || "Descubre prendas con una presentacin visual elegante y lista para convertir."}
            </p>
            <div className="hero-actions" style={{ marginTop: 20 }}>
              <a href="#coleccion" className="btn btn-primary">{storeSettings.primaryCtaText}</a>
              <button className="btn btn-outline" onClick={() => setShowCartSummary(true)}>
                <ShoppingBag size={16} />
                Ver carrito
              </button>
            </div>
            <div className="trust-badges-row">
              <span className="trust-badge-pill">
                <Truck size={14} />
                Envio rapido
              </span>
              <span className="trust-badge-pill">
                <ShieldCheck size={14} />
                Pago seguro
              </span>
              <span className="trust-badge-pill">
                <RotateCcw size={14} />
                Cambios faciles
              </span>
            </div>
          </Motion.div>

          <Motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: ANIMATION.medium }}
            className="hero-media-panel"
          >
            <button
              type="button"
              className={`hero-slide-button ${heroSlideHasAction ? "is-clickable" : "is-static"}`}
              onClick={() => heroSlideHasAction && handleHeroSlideClick(activeHeroSlide)}
              aria-label={heroSlideHasAction ? "Abrir destino del slide" : "Slide principal"}
              disabled={!heroSlideHasAction}
            >
              <div className="hero-img-wrap">
                <AnimatePresence mode="wait">
                  <Motion.img
                    key={activeHeroSlide?.image || heroIndex}
                    src={activeHeroSlide?.image || FALLBACK_IMAGE}
                    alt={activeHeroSlide?.title || "Slide principal"}
                    loading="eager"
                    decoding="async"
                    initial={{ opacity: 0, scale: 1.03 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.99 }}
                    transition={{ duration: ANIMATION.medium }}
                    className="hero-img"
                    onError={(event) => {
                      if (event.currentTarget.src !== FALLBACK_IMAGE) {
                        event.currentTarget.src = FALLBACK_IMAGE;
                      }
                    }}
                  />
                </AnimatePresence>
              </div>
            </button>

            <div className="hero-slide-meta">
              <div>
                <p className="hero-caption-title" style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>{activeHeroSlide?.title || "Nueva portada"}</p>
              </div>
              {heroSlideHasAction && (
                <span className="hero-slide-link-hint">
                  Ver detalle
                  <ChevronRight size={18} />
                </span>
              )}
            </div>

            {heroSlides.length > 1 && (
              <div className="hero-slide-indicators" aria-label="Indicadores del hero">
                {heroSlides.map((slide, index) => (
                  <button
                    key={slide.id || index}
                    type="button"
                    className={`hero-slide-dot ${index === heroIndex ? "active" : ""}`}
                    aria-label={`Ir al slide ${index + 1}`}
                    onClick={() => setHeroIndex(index)}
                  />
                ))}
              </div>
            )}
          </Motion.div>
        </div>
      </section>

      <Motion.section
        id="destacados"
        className="container section-shell"
        style={{ padding: "16px 0 40px" }}
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: ANIMATION.medium }}
      >
        <p className="muted" style={{ textTransform: "uppercase", letterSpacing: ".25em", fontSize: 13 }}>Seleccion</p>
        <h3 style={{ marginTop: 8, fontSize: 34 }}>Productos destacados</h3>
        <div className="featured-grid" style={{ marginTop: 22 }}>
          {!catalogReady
            ? Array.from({ length: 4 }, (_, index) => <CatalogSkeletonCard key={`featured-skeleton-${index}`} />)
            : featuredProducts.map((product) => (
                <MemoShowcaseProductCard
                  key={product.id}
                  product={product}
                  onOpenDetail={openProductDetail}
                  onAddToCart={addToCart}
                />
              ))}
        </div>
      </Motion.section>

      <main className="container catalog-main" style={{ paddingBottom: 48 }}>
        <div style={{ display: "grid", gap: 40 }}>
          <section id="coleccion" className="section-shell catalog-section">
            <div className="catalog-shell">
              <div className="catalog-head">
                <p className="muted catalog-kicker">Catalogo</p>
                <h3 className="catalog-title">Coleccion completa</h3>
              </div>

              <div className="catalog-primary-row">
                <div className="collection-audience-wrap" aria-label="Filtrar por coleccion">
                  <div className="collection-audience-tabs" role="tablist" aria-label="Colecciones por audiencia">
                    {collectionAudienceTabs.map((item) => {
                      const isActive = category === item.value;
                      return (
                        <Motion.button
                          key={item.value}
                          type="button"
                          role="tab"
                          aria-selected={isActive}
                          className={`collection-audience-tab ${isActive ? "active" : ""}`}
                          title={item.isOffer ? catalogOfferText : undefined}
                          onClick={() => setCategory(item.value)}
                          whileTap={{ scale: 0.97 }}
                        >
                          <span className="collection-audience-label">{item.label}</span>
                          {isActive && (
                            <Motion.span
                              layoutId="collection-audience-active"
                              className="collection-audience-indicator"
                              transition={{ type: "spring", stiffness: 420, damping: 34 }}
                            />
                          )}
                        </Motion.button>
                      );
                    })}
                  </div>
                </div>

                <div className="catalog-offer-search">
                  <div className="filter-field catalog-search-field">
                    <Search size={15} className="filter-icon" />
                    <input
                      ref={catalogSearchInputRef}
                      className="input"
                      placeholder="Buscar prendas"
                      aria-label="Buscar prendas"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                    />
                  </div>
                </div>
              </div>

              <div className="filter-toolbar compact-toolbar catalog-filter-toolbar">
                <div className="filter-field filter-field-type">
                  <Filter size={15} className="filter-icon" />
                  <select className="select" aria-label="Filtrar por tipo" value={productTypeFilter} onChange={(event) => setProductTypeFilter(event.target.value)}>
                    <option value="Todos">Todos los tipos</option>
                    {productTypeOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </div>
                <div className="filter-field filter-field-sort">
                  <Filter size={15} className="filter-icon" />
                  <select className="select" aria-label="Ordenar catalogo" value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
                    <option value="destacados">Destacados</option>
                    <option value="nuevos">Nuevos</option>
                    <option value="rating">Mejor valorados</option>
                    <option value="precio-asc">Precio: menor a mayor</option>
                    <option value="precio-desc">Precio: mayor a menor</option>
                  </select>
                </div>
              </div>

              <div className="catalog-feedback-row">
                <div className="catalog-feedback-stats">
                  <p className="helper-text catalog-feedback-text">
                    {filteredProducts.length} resultado(s) de {products.length} productos.
                  </p>
                  {catalogReady && filteredProducts.length > 0 && (
                    <p className="helper-text catalog-feedback-text">
                      Mostrando {catalogRangeStart}-{catalogRangeEnd} - Pagina {safeCatalogPage} de {totalCatalogPages}
                    </p>
                  )}
                </div>
                {activeFilterPills.length > 0 && (
                  <button
                    type="button"
                    className="btn btn-outline catalog-clear-btn"
                    onClick={() => {
                      setSearch("");
                      setCategory("Todos");
                      setProductTypeFilter("Todos");
                      setSortBy("destacados");
                    }}
                  >
                    Limpiar filtros
                  </button>
                )}
              </div>

              {activeFilterPills.length > 0 && (
                <div className="filter-chip-scroll catalog-active-filters" aria-label="Filtros activos">
                  {activeFilterPills.map((pill) => (
                    <button key={pill.key} type="button" className="badge badge-light active-filter-pill" onClick={pill.onClear}>
                      {pill.label}
                      <X size={12} />
                    </button>
                  ))}
                </div>
              )}

              <div className="products-grid catalog-products-grid">
                {!catalogReady ? (
                  Array.from({ length: 8 }, (_, index) => <CatalogSkeletonCard key={`catalog-skeleton-${index}`} />)
                ) : filteredProducts.length === 0 ? (
                  <div className="empty-admin-note" style={{ gridColumn: "1 / -1" }}>No encontramos productos con los filtros actuales. Prueba quitando un filtro o buscando otra palabra.</div>
                ) : paginatedProducts.map((product) => (
                  <MemoCatalogProductCard
                    key={product.id}
                    product={product}
                    selection={selections[product.id]}
                    onChange={handleSelection}
                    onOpenDetail={openProductDetail}
                    onAddToCart={addToCart}
                    onToggleFavorite={toggleFavorite}
                    isFavorite={favorites.includes(product.id)}
                    isAdmin={isAdmin}
                    onEdit={startEditingProduct}
                    onDelete={handleDeleteProduct}
                  />
                ))}
              </div>

              {catalogReady && filteredProducts.length > 0 && (
                <CatalogPagination
                  currentPage={safeCatalogPage}
                  totalPages={totalCatalogPages}
                  pageWindow={catalogPageWindow}
                  onPageChange={setCatalogPage}
                />
              )}
            </div>
          </section>

          <Motion.section
            className="section-shell"
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: ANIMATION.medium }}
          >
            <div className="sale-panel" style={{ borderRadius: 30, background: "#111", color: "white", padding: 26 }}>
              <p style={{ margin: 0, textTransform: "uppercase", letterSpacing: ".25em", fontSize: 13, color: "rgba(255,255,255,.65)" }}>Atencion personalizada</p>
              <h3 style={{ marginTop: 10, fontSize: 34 }}>{storeSettings.saleTitle}</h3>
              <p style={{ color: "rgba(255,255,255,.75)", maxWidth: 780, lineHeight: 1.8 }}>{storeSettings.saleDescription}</p>
            </div>
          </Motion.section>

          <Motion.section
            id="recomendados"
            className="section-shell"
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: ANIMATION.medium }}
          >
            <p className="muted" style={{ textTransform: "uppercase", letterSpacing: ".25em", fontSize: 13 }}>Sugerencias</p>
            <h3 style={{ marginTop: 8, fontSize: 34 }}>Recomendados para ti</h3>
            <div className="recommend-grid" style={{ marginTop: 22 }}>
              {!catalogReady
                ? Array.from({ length: 3 }, (_, index) => <CatalogSkeletonCard key={`recommend-skeleton-${index}`} />)
                : recommendedProducts.slice(0, 3).map((product) => (
                    <MemoShowcaseProductCard
                      key={product.id}
                      product={product}
                      onOpenDetail={openProductDetail}
                      onAddToCart={addToCart}
                    />
                  ))}
            </div>
          </Motion.section>
        </div>
      </main>

      <Motion.footer
        id="contacto"
        className="footer section-shell"
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: ANIMATION.medium }}
      >
        <div className="container">
          <div className="footer-card">
            <div className="footer-grid">
              <div>
                <p style={{ margin: 0, textTransform: "uppercase", letterSpacing: ".25em", fontSize: 13, color: "rgba(255,255,255,.65)" }}>Contacto</p>
                <h3 style={{ marginTop: 10, fontSize: 34 }}>{storeSettings.footerTitle}</h3>
                <p style={{ color: "rgba(255,255,255,.78)", maxWidth: 640, lineHeight: 1.8 }}>{storeSettings.footerText}</p>
                <div className="social-row" style={{ marginTop: 18 }}>
                  {footerWhatsAppLink && (
                    <a className="social-link" href={footerWhatsAppLink} target="_blank" rel="noopener noreferrer">
                      <span className="social-link-icon"><BrandSocialIcon icon="whatsapp" label="WhatsApp" /></span>
                      <span>WhatsApp</span>
                    </a>
                  )}
                  {footerEmailLink && (
                    <a className="social-link" href={footerEmailLink}>
                      <span className="social-link-icon"><Mail size={15} /></span>
                      <span>Correo</span>
                    </a>
                  )}
                  {contactSettings.instagram && (
                    <a className="social-link" href={contactSettings.instagram} target="_blank" rel="noopener noreferrer">
                      <span className="social-link-icon"><BrandSocialIcon icon="instagram" label="Instagram" /></span>
                      <span>Instagram</span>
                    </a>
                  )}
                  {contactSettings.facebook && (
                    <a className="social-link" href={contactSettings.facebook} target="_blank" rel="noopener noreferrer">
                      <span className="social-link-icon"><BrandSocialIcon icon="facebook" label="Facebook" /></span>
                      <span>Facebook</span>
                    </a>
                  )}
                  {contactSettings.tiktok && (
                    <a className="social-link" href={contactSettings.tiktok} target="_blank" rel="noopener noreferrer">
                      <span className="social-link-icon"><BrandSocialIcon icon="tiktok" label="TikTok" /></span>
                      <span>TikTok</span>
                    </a>
                  )}
                </div>
              </div>

              <div className="surface contact-local-card" style={{ background: "rgba(255,255,255,.08)", borderColor: "rgba(255,255,255,.12)" }}>
                <p className="contact-local-title"><Store size={16} />Informacion del local</p>
                <div className="contact-location-row">
                  <span className="social-link-icon contact-location-icon"><Navigation size={14} /></span>
                  <p style={{ margin: 0, lineHeight: 1.8 }}>{contactSettings.address}</p>
                </div>
                {footerLocationNote && <p className="contact-location-note">{footerLocationNote}</p>}
                {contactSettings.mapsLink && (
                  <div className="contact-location-cta-wrap">
                    <a className="social-link contact-location-cta" href={contactSettings.mapsLink} target="_blank" rel="noopener noreferrer">
                      <span className="social-link-icon"><MapPin size={15} /></span>
                      <span>Como llegar</span>
                    </a>
                  </div>
                )}

                <div className="divider" style={{ background: "rgba(255,255,255,.12)", marginTop: 18 }} />
                <p className="helper-text" style={{ color: "rgba(255,255,255,.64)" }}>
                  Escribenos y te asesoramos en talla, colores y disponibilidad en tiempo real.
                </p>
              </div>
            </div>
          </div>
        </div>
      </Motion.footer>
      </>
    </MotionConfig>
  );
}



















