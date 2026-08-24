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
  Send,
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
  getSecurityMetricsSnapshot,
  listServerOrders,
  previewCouponApplication,
  resetSecurityMetricsSnapshot,
  syncCatalogState,
  syncContactState,
  updateServerOrder,
} from "./services/serverStateService";
import { ensureCsrfToken } from "./services/httpClient";
import { useBodyScrollLock } from "./hooks/useBodyScrollLock";
import { useMobileNavGuards } from "./hooks/useMobileNavGuards";
import { useSwipeGesture } from "./hooks/useSwipeGesture";
import { useCatalogBootstrap } from "./hooks/useCatalogBootstrap";
import { useRealtimeSync } from "./hooks/useRealtimeSync";
import { useUserStateSync } from "./hooks/useUserStateSync";
import { buildUserStateSignature, hydrateRemoteUserState } from "./domain/user/remoteState";
import { resolvePublicLocation } from "./domain/contact/publicLocation";
import {
  normalizeBankAccounts,
  paymentSettingsMatch,
  withBankAccounts,
} from "./domain/contact/paymentSettings";
import { enqueueAsyncOperation } from "./utils/asyncQueue";
import {
  PRODUCT_DRAFT_MAX_CHARS,
  createProductDraftPayload,
  getProductFormSignature,
  parseProductDraftPayload,
} from "./domain/admin/productDraft";
import { trackAnalyticsEvent } from "./services/analyticsService";
import { AnimatedCurrencyValue } from "./components/ui/AnimatedCurrencyValue";
import { EmotionalEmptyState } from "./components/ui/EmotionalEmptyState";
import { ConfirmModal } from "./components/ui/ConfirmModal";
import { CustomDropdown } from "./components/ui/CustomDropdown";
import { AnnouncementBar } from "./components/ui/AnnouncementBar";
import { normalizeOrderStatusForOrder } from "./domain/orders/status";
import {
  PAYMENT_METHODS,
  getPaymentMethodLabel,
  normalizeCardFeePercent,
  normalizePaymentMethod,
} from "./domain/orders/payment";
import { OrderStatusProgress } from "./components/orders/OrderStatusProgress";
import { OrderReferenceStrip } from "./components/orders/OrderReferenceStrip";
import { ProductDraftPreview } from "./components/products/ProductDraftPreview";
import { MemoFeaturedProductMarquee as ExternalFeaturedProductMarquee } from "./components/catalog/FeaturedProductMarquee";
import { MemoCatalogProductCard as ExternalMemoCatalogProductCard } from "./components/catalog/CatalogProductCard";
import { CatalogSkeletonCard as ExternalCatalogSkeletonCard } from "./components/catalog/CatalogSkeletonCard";
import { CatalogPagination as ExternalCatalogPagination } from "./components/catalog/CatalogPagination";
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
  stripDangerousContent,
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
  normalizeImageSource,
  fileToDataUrl,
  createUid,
  createUuid,
  formatMinutesRemaining,
  formatAdminTimestamp,
  hasStrongPassword,
  normalizeUsername,
  buildAuthValidation,
} from "./utils";

import { lazyWithRetry } from "./utils/lazyWithRetry.js";
import { ErrorBoundary } from "./components/ui/ErrorBoundary.jsx";

const { startTransition } = React;
const UserAuthSheet = lazyWithRetry(() => import("./components/modals/AuthModals").then((module) => ({ default: module.UserAuthModal })));
const ProfileModal = lazyWithRetry(() => import("./components/modals/AuthModals").then((module) => ({ default: module.ProfileModal })));
const ExternalAdminPanelModal = lazyWithRetry(() => import("./components/admin/AdminPanelModal").then((module) => ({ default: module.AdminPanelModal })));
const ADMIN_PANEL_HISTORY_KEY = "__adriegoAdminPanel";
const MAX_RECENTLY_VIEWED_PRODUCTS = 4;
const ProductModal = lazyWithRetry(() => import("./components/products/ProductModal"));
const CartSummaryModal = lazyWithRetry(() => import("./components/cart/CartSummaryModal"));
const FavoritesModal = lazyWithRetry(() => import("./components/cart/FavoritesModal"));
const ProfileQuickMenu = lazyWithRetry(() => import("./components/cart/ProfileQuickMenu"));
const OrdersModal = lazyWithRetry(() => import("./components/orders/OrdersModal"));
const OrderReferenceModal = lazyWithRetry(() => import("./components/orders/OrderReferenceModal"));
const LegalModal = lazyWithRetry(() => import("./components/modals/LegalModal").then((module) => ({ default: module.LegalModal })));

const CATALOG_SORT_OPTIONS = new Set(["destacados", "nuevos", "mejor-valorados", "precio-asc", "precio-desc"]);

function readCatalogRouteState() {
  const defaults = { search: "", category: "Todos", productType: "Todos", sortBy: "destacados", page: 1 };
  if (typeof window === "undefined") return defaults;
  const params = new URL(window.location.href).searchParams;
  const parsedPage = Math.floor(Number(params.get("pagina")));
  const requestedSort = sanitizeLine(params.get("orden") || "");
  return {
    search: sanitizeLine(params.get("q") || "").slice(0, 120),
    category: sanitizeLine(params.get("categoria") || "").slice(0, 80) || defaults.category,
    productType: sanitizeLine(params.get("tipo") || "").slice(0, 80) || defaults.productType,
    sortBy: CATALOG_SORT_OPTIONS.has(requestedSort) ? requestedSort : defaults.sortBy,
    page: Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : defaults.page,
  };
}

function decodeRouteSegment(value) {
  try {
    return slugify(decodeURIComponent(String(value || "")));
  } catch {
    return "";
  }
}

function upsertRouteMeta(selector, [attribute, attributeValue], content) {
  if (typeof document === "undefined") return;
  let meta = document.querySelector(selector);
  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute(attribute, attributeValue);
    document.head.appendChild(meta);
  }
  meta.setAttribute("content", String(content || ""));
}

function readStoredProductDraft() {
  if (typeof window === "undefined") return null;
  try {
    const rawValue = window.localStorage.getItem(STORAGE_KEYS.adminProductDraft);
    const parsed = parseProductDraftPayload(rawValue);
    if (rawValue && !parsed) window.localStorage.removeItem(STORAGE_KEYS.adminProductDraft);
    return parsed;
  } catch {
    return null;
  }
}

function removeStoredProductDraft() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEYS.adminProductDraft);
  } catch {
    // Storage can be unavailable in private or restricted browser contexts.
  }
}


function normalizeStoredFavorites(rawValue = []) {
  const list = Array.isArray(rawValue) ? rawValue : [];
  return [...new Set(list.map((entry) => normalizeEntityId(entry)).filter(Boolean))];
}

function normalizeRecentlyViewedProductIds(rawValue = []) {
  const list = Array.isArray(rawValue) ? rawValue : [];
  return [...new Set(list.map((entry) => normalizeEntityId(entry)).filter(Boolean))]
    .slice(0, MAX_RECENTLY_VIEWED_PRODUCTS);
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
    name: "Pantalón Tailored Flow",
    price: 69.99,
    oldPrice: 84.99,
    category: "Mujer",
    description: "Pantalón recto de talle alto con estructura impecable y caída fluida.",
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
  mapsLink: "",
  instagram: "https://instagram.com/adriegostore",
  facebook: "https://facebook.com/adriegostore",
  tiktok: "",
  paymentSettings: {
    bankAccounts: [],
    bankName: "",
    accountType: "Ahorros",
    accountNumber: "",
    accountHolder: "",
    accountId: "",
    bankLogoImage: "",
    bankQrImage: "",
    cardFeePercent: 6,
  },
};

const defaultStoreSettings = {
  brandLabel: "Luxury Fashion",
  brandName: "Adriego Store",
  heroBadgeText: "Estilo seleccionado para ti",
  primaryCtaText: "Explorar colección",
  offerLabel: "Ofertas",
  offerPercentage: 30,
  offerText: "Prendas seleccionadas con precio especial por tiempo limitado.",
  saleTitle: "Tu pedido, claro y sencillo.",
  saleDescription: "Elige tus prendas, confirma tus datos y escríbenos por WhatsApp para completar la compra.",
  footerTitle: "¿Necesitas ayuda para elegir?",
  footerText: "Escríbenos para consultar tallas, colores, disponibilidad o el estado de tu pedido.",
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
      title: "Nueva colección",
      subtitle: "Prendas versátiles para crear looks con personalidad.",
      image: "https://images.unsplash.com/photo-1445205170230-053b83016050?auto=format&fit=crop&w=1400&q=80",
      linkedProductId: "",
      targetUrl: "",
    },
    {
      id: "slide-2",
      title: "Encuentra tu próximo look",
      subtitle: "Explora colores, cortes y detalles para combinar a tu manera.",
      image: "https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=1400&q=80",
      linkedProductId: "",
      targetUrl: "",
    },
    {
      id: "slide-3",
      title: "Compra a tu ritmo",
      subtitle: "Guarda tus favoritos, arma tu pedido y confírmalo por WhatsApp.",
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
  const rawPaymentSettings = rawSettings.paymentSettings && typeof rawSettings.paymentSettings === "object"
    ? rawSettings.paymentSettings
    : {};
  const defaultPaymentSettings = defaultContactSettings.paymentSettings;
  const bankAccounts = normalizeBankAccounts(rawPaymentSettings).map((account, index) => ({
    id: normalizeEntityId(account.id || `bank-${index + 1}`) || `bank-${index + 1}`,
    bankName: sanitizeLine(account.bankName),
    accountType: sanitizeLine(account.accountType || "Ahorros") || "Ahorros",
    accountNumber: sanitizeLine(account.accountNumber),
    accountHolder: sanitizeLine(account.accountHolder),
    accountId: sanitizeLine(account.accountId),
    bankLogoImage: normalizeImageSource(account.bankLogoImage),
    bankQrImage: normalizeImageSource(account.bankQrImage),
  }));
  const primaryBankAccount = bankAccounts[0] || {};
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
    paymentSettings: {
      bankAccounts,
      bankName: primaryBankAccount.bankName || defaultPaymentSettings.bankName,
      accountType: primaryBankAccount.accountType || defaultPaymentSettings.accountType,
      accountNumber: primaryBankAccount.accountNumber || defaultPaymentSettings.accountNumber,
      accountHolder: primaryBankAccount.accountHolder || defaultPaymentSettings.accountHolder,
      accountId: primaryBankAccount.accountId || defaultPaymentSettings.accountId,
      bankLogoImage: primaryBankAccount.bankLogoImage || defaultPaymentSettings.bankLogoImage,
      bankQrImage: primaryBankAccount.bankQrImage || defaultPaymentSettings.bankQrImage,
      cardFeePercent: normalizeCardFeePercent(rawPaymentSettings.cardFeePercent, defaultPaymentSettings.cardFeePercent),
    },
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

function replaceLegacyStoreCopy(value, legacyValue, replacement) {
  const legacyValues = Array.isArray(legacyValue) ? legacyValue : [legacyValue];
  return !value || legacyValues.includes(value) ? replacement : value;
}

function mergeStoreSettings(rawSettings = {}) {
  const incomingSlides = Array.isArray(rawSettings.heroSlides) && rawSettings.heroSlides.length
    ? rawSettings.heroSlides
    : defaultStoreSettings.heroSlides;

  const rawHeroBadge = sanitizeLine(rawSettings.heroBadgeText != null ? rawSettings.heroBadgeText : defaultStoreSettings.heroBadgeText);
  const heroBadgeText = !rawHeroBadge
    || /premium\s+listo\s+para\s+vender/i.test(rawHeroBadge)
    || rawHeroBadge === "La mejor coleccion premium, a un solo clic"
    ? defaultStoreSettings.heroBadgeText
    : rawHeroBadge;
  const brandName = normalizeBrandText(
    rawSettings.brandName != null ? rawSettings.brandName : defaultStoreSettings.brandName,
    defaultStoreSettings.brandName,
  );
  const normalizedBrandLabel = normalizeBrandText(
    rawSettings.brandLabel != null ? rawSettings.brandLabel : defaultStoreSettings.brandLabel,
    defaultStoreSettings.brandLabel,
  );
  const brandLabel = normalizedBrandLabel.toLowerCase() === brandName.toLowerCase()
    ? defaultStoreSettings.brandLabel
    : normalizedBrandLabel;

  return {
    ...defaultStoreSettings,
    ...rawSettings,
    brandLabel,
    brandName,
    heroBadgeText,
    primaryCtaText: replaceLegacyStoreCopy(
      sanitizeLine(rawSettings.primaryCtaText != null ? rawSettings.primaryCtaText : defaultStoreSettings.primaryCtaText),
      "Comprar ahora",
      defaultStoreSettings.primaryCtaText,
    ),
    offerLabel: sanitizeLine(rawSettings.offerLabel != null ? rawSettings.offerLabel : defaultStoreSettings.offerLabel) || defaultStoreSettings.offerLabel,
    offerPercentage: (() => {
      const rawValue = rawSettings.offerPercentage != null ? rawSettings.offerPercentage : defaultStoreSettings.offerPercentage;
      const parsed = Number.parseInt(String(rawValue).replace(/[^\d-]/g, ""), 10);
      if (!Number.isFinite(parsed)) return defaultStoreSettings.offerPercentage;
      return Math.max(0, Math.abs(parsed));
    })(),
    offerText: replaceLegacyStoreCopy(
      sanitizeLine(rawSettings.offerText != null ? rawSettings.offerText : defaultStoreSettings.offerText),
      ["Seleccion curada con descuento por tiempo limitado.", "Selección curada con descuento por tiempo limitado."],
      defaultStoreSettings.offerText,
    ),
    saleTitle: replaceLegacyStoreCopy(
      sanitizeLine(rawSettings.saleTitle != null ? rawSettings.saleTitle : defaultStoreSettings.saleTitle),
      [
        "Compra facil y atencion inmediata",
        "Compra fácil y atención inmediata",
        "Comprar es simple. Confirmamos contigo por WhatsApp.",
        "Tu pedido, paso a paso.",
      ],
      defaultStoreSettings.saleTitle,
    ),
    saleDescription: replaceLegacyStoreCopy(
      sanitizeParagraph(rawSettings.saleDescription != null ? rawSettings.saleDescription : defaultStoreSettings.saleDescription),
      [
        "Arma tu pedido en minutos y recibe acompanamiento por WhatsApp para confirmar talla, disponibilidad y entrega.",
        "Arma tu pedido en minutos y recibe acompañamiento por WhatsApp para confirmar talla, disponibilidad y entrega.",
        "Arma tu pedido a tu ritmo y recibe un resumen listo para enviar. La confirmación final se hace contigo, de forma personalizada.",
        "Elige tus prendas, revisa tus datos y envíanos el pedido por WhatsApp.",
      ],
      defaultStoreSettings.saleDescription,
    ),
    footerTitle: replaceLegacyStoreCopy(
      sanitizeLine(rawSettings.footerTitle != null ? rawSettings.footerTitle : defaultStoreSettings.footerTitle),
      ["Vistanos y conversemos", "Estamos para ayudarte"],
      defaultStoreSettings.footerTitle,
    ),
    footerText: replaceLegacyStoreCopy(
      sanitizeParagraph(rawSettings.footerText != null ? rawSettings.footerText : defaultStoreSettings.footerText),
      [
        "Atencion personalizada por WhatsApp, Instagram, Facebook y TikTok.",
        "Escríbenos para consultar tallas, colores y disponibilidad.",
      ],
      defaultStoreSettings.footerText,
    ),
    automationSettings: normalizeAutomationSettings(
      rawSettings.automationSettings != null
        ? rawSettings.automationSettings
        : defaultStoreSettings.automationSettings,
    ),
    heroSlides: incomingSlides.map((slide, index) => {
      const defaultSlide = defaultStoreSettings.heroSlides[index] || {
        title: "Descubre tu próximo look",
        subtitle: "Explora la colección y encuentra prendas para combinar a tu manera.",
        image: FALLBACK_IMAGE,
      };
      const legacyTitles = ["Nueva coleccion", "Looks que convierten", "Compra rapida"];
      const legacySubtitles = [
        "Minimalismo, elegancia y venta directa por WhatsApp.",
        "Diseno premium inspirado en marcas de moda editorial.",
        "Carrito elegante, detalles del pedido y cierre en un clic.",
      ];
      return {
        id: slide.id || defaultSlide.id || createUid(),
        title: replaceLegacyStoreCopy(sanitizeLine(slide.title), legacyTitles[index] || "", defaultSlide.title),
        subtitle: replaceLegacyStoreCopy(sanitizeParagraph(slide.subtitle), legacySubtitles[index] || "", defaultSlide.subtitle),
        image: normalizeSafeUrl(slide.image || defaultSlide.image || FALLBACK_IMAGE) || FALLBACK_IMAGE,
        linkedProductId: (slide.linkedProductId != null ? String(slide.linkedProductId) : ""),
        targetUrl: normalizeSafeUrl(slide.targetUrl != null ? slide.targetUrl : ""),
      };
    }),
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


function normalizeOrderRecord(order = {}) {
  const subtotal = Number(order.subtotal) || 0;
  const discountAmount = Math.max(0, Number(order.discountAmount) || 0);
  const deliveryType = order.deliveryType === "delivery" ? "delivery" : "pickup";
  const paymentMethod = normalizePaymentMethod(order.paymentMethod);
  const paymentFeePercent = Math.max(0, Number(order.paymentFeePercent) || 0);
  const paymentFeeAmount = Math.max(0, Number(order.paymentFeeAmount) || 0);
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
    paymentMethod,
    paymentMethodLabel: sanitizeLine(order.paymentMethodLabel || getPaymentMethodLabel(paymentMethod)),
    paymentBaseTotal: Math.max(0, Number(order.paymentBaseTotal) || subtotal - discountAmount),
    paymentFeePercent,
    paymentFeeAmount,
    paymentBankAccountId: sanitizeLine(order.paymentBankAccountId || order?.paymentBankAccount?.id || ""),
    paymentBankAccount: order?.paymentBankAccount && typeof order.paymentBankAccount === "object"
      ? {
          id: sanitizeLine(order.paymentBankAccount.id || order.paymentBankAccountId || ""),
          bankName: sanitizeLine(order.paymentBankAccount.bankName || ""),
          accountType: sanitizeLine(order.paymentBankAccount.accountType || ""),
          accountNumber: sanitizeLine(order.paymentBankAccount.accountNumber || ""),
          accountHolder: sanitizeLine(order.paymentBankAccount.accountHolder || ""),
          accountId: sanitizeLine(order.paymentBankAccount.accountId || ""),
        }
      : null,
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














function ShowcaseProductCard({ product, onOpenDetail, onAddToCart }) {
  const [isSelectingSize, setIsSelectingSize] = useState(false);
  const [justAddedSize, setJustAddedSize] = useState("");
  const fallbackSelection = getFallbackSelection(product);
  const selectedColor = fallbackSelection.color;
  const selectedSize = fallbackSelection.size;
  const hasStock = fallbackSelection.availableStock > 0;
  const discount = discountPercent(product.price, product.oldPrice);
  const previewImage = getCurrentImageForProduct(product, selectedColor);
  const sizesForSelectedColor = getSizesForColor(product, selectedColor);

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

        {isSelectingSize ? (
          <div className="quick-size-picker" onClick={(e) => e.stopPropagation()}>
            <div className="quick-size-header">
              <span className="quick-size-title">Talla para <strong>{selectedColor}</strong>:</span>
              <button
                type="button"
                className="quick-size-close-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsSelectingSize(false);
                }}
                aria-label="Cerrar selector de talla"
              >
                <X size={14} />
              </button>
            </div>
            <div className="quick-size-chips">
              {sizesForSelectedColor.map((size) => {
                const sizeStock = getStockForVariant(product, selectedColor, size);
                const isOutOfStock = sizeStock <= 0;
                const isSelected = selectedSize === size;
                const wasAdded = justAddedSize === size;
                const isLocked = Boolean(justAddedSize);
                return (
                  <button
                    key={size}
                    type="button"
                    className={`quick-size-chip${isSelected ? " selected" : ""}${isOutOfStock ? " out-of-stock" : ""}${wasAdded ? " added" : ""}`}
                    disabled={isOutOfStock || isLocked}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (isOutOfStock || isLocked) return;
                      setJustAddedSize(size);
                      onAddToCart(
                        product,
                        { sourceElement: event.currentTarget, image: previewImage },
                        { color: selectedColor, size }
                      );
                      setTimeout(() => {
                        setIsSelectingSize(false);
                        setJustAddedSize("");
                      }, 400);
                    }}
                    title={isOutOfStock ? `${size} (Agotado)` : `Agregar talla ${size}`}
                  >
                    {size}
                    {wasAdded && <Check size={12} className="quick-size-check" />}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="product-card-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={(event) => {
                event.stopPropagation();
                if (!hasStock) return;
                setIsSelectingSize(true);
              }}
              disabled={!hasStock}
              style={{ opacity: hasStock ? 1 : 0.6, cursor: hasStock ? "pointer" : "not-allowed" }}
            >
              {hasStock ? "Agregar" : "Agotado"}
            </button>
            <button type="button" className="btn btn-outline product-detail-btn" onClick={() => onOpenDetail(product, fallbackSelection)}>Detalle</button>
          </div>
        )}
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
  const [isSelectingSize, setIsSelectingSize] = useState(false);
  const [justAddedSize, setJustAddedSize] = useState("");
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
              <span className={`badge badge-${stockStatus.tone} ${isLowStock ? "badge-low-stock" : ""}`}>
                {isLowStock ? (availableStock === 1 ? "Última unidad" : `Últimas ${availableStock} unidades`) : stockStatus.label}
              </span>
            </div>
          </div>
        </div>

        {isSelectingSize ? (
          <div className="quick-size-picker" onClick={(e) => e.stopPropagation()}>
            <div className="quick-size-header">
              <span className="quick-size-title">Talla para <strong>{selectedColor}</strong>:</span>
              <button
                type="button"
                className="quick-size-close-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsSelectingSize(false);
                }}
                aria-label="Cerrar selector de talla"
              >
                <X size={14} />
              </button>
            </div>
            <div className="quick-size-chips">
              {sizesForSelectedColor.map((size) => {
                const sizeStock = getStockForVariant(product, selectedColor, size);
                const isOutOfStock = sizeStock <= 0;
                const isSelected = selectedSize === size;
                const wasAdded = justAddedSize === size;
                const isLocked = Boolean(justAddedSize);
                return (
                  <button
                    key={size}
                    type="button"
                    className={`quick-size-chip${isSelected ? " selected" : ""}${isOutOfStock ? " out-of-stock" : ""}${wasAdded ? " added" : ""}`}
                    disabled={isOutOfStock || isLocked}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (isOutOfStock || isLocked) return;
                      setJustAddedSize(size);
                      onChange(product.id, "size", size);
                      onAddToCart(
                        product,
                        { sourceElement: event.currentTarget, image: currentImage },
                        { color: selectedColor, size }
                      );
                      setTimeout(() => {
                        setIsSelectingSize(false);
                        setJustAddedSize("");
                      }, 400);
                    }}
                    title={isOutOfStock ? `${size} (Agotado)` : `Agregar talla ${size}`}
                  >
                    {size}
                    {wasAdded && <Check size={12} className="quick-size-check" />}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="product-card-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={(event) => {
                event.stopPropagation();
                if (availableStock <= 0) return;
                setIsSelectingSize(true);
              }}
              disabled={availableStock <= 0}
              style={{ opacity: availableStock <= 0 ? 0.6 : 1, cursor: availableStock <= 0 ? "not-allowed" : "pointer" }}
            >
              {availableStock <= 0 ? "Agotado" : "Agregar"}
            </button>
            <button type="button" className="btn btn-outline product-detail-btn" onClick={() => onOpenDetail(product, { color: selectedColor, size: selectedSize })}>Detalle</button>
          </div>
        )}
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

export default function App() {
  const [products, setProducts] = useState(() => getStoredProducts());
  const [selections, setSelections] = useState({});
  const [cart, setCart] = useState(() => normalizeStoredCart(readStorage(STORAGE_KEYS.cart, [])));
  const [favorites, setFavorites] = useState(() => normalizeStoredFavorites(readStorage(STORAGE_KEYS.favorites, [])));
  const [recentlyViewedProductIds, setRecentlyViewedProductIds] = useState(() => (
    normalizeRecentlyViewedProductIds(readStorage(STORAGE_KEYS.recentlyViewedProducts, []))
  ));
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
  const [initialCatalogRouteState] = useState(readCatalogRouteState);
  const [search, setSearch] = useState(initialCatalogRouteState.search);
  const [category, setCategory] = useState(initialCatalogRouteState.category);
  const [productTypeFilter, setProductTypeFilter] = useState(initialCatalogRouteState.productType);
  const [sortBy, setSortBy] = useState(initialCatalogRouteState.sortBy);
  const [catalogPage, setCatalogPage] = useState(initialCatalogRouteState.page);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [editingCartItemKey, setEditingCartItemKey] = useState(null);
  const [heroIndex, setHeroIndex] = useState(0);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [destructiveConfirmation, setDestructiveConfirmation] = useState(null);
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
  const [legalModalState, setLegalModalState] = useState({ open: false, tab: "exchanges" });
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
  const [productFormBaseline, setProductFormBaseline] = useState(() => getProductFormSignature(createEmptyProductForm()));
  const [productDraftRecovery, setProductDraftRecovery] = useState(() => readStoredProductDraft());
  const [productDraftSavedAt, setProductDraftSavedAt] = useState("");
  const [productDraftSaveError, setProductDraftSaveError] = useState("");
  const [previewColor, setPreviewColor] = useState("Negro");
  const [previewImageIndex, setPreviewImageIndex] = useState(0);
  const [customProductTypeInput, setCustomProductTypeInput] = useState("");
  const [customFilterTagInput, setCustomFilterTagInput] = useState("");
  const [editorMessage, setEditorMessage] = useState("");
  const [editorError, setEditorError] = useState("");
  const [offerSaveBusy, setOfferSaveBusy] = useState(false);
  const [contactSaveBusy, setContactSaveBusy] = useState(false);
  const [bankQrUploadBusy, setBankQrUploadBusy] = useState(false);
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
  const [pathname, setPathname] = useState(() => {
    if (typeof window === "undefined") return "/";
    return window.location.pathname || "/";
  });
  const productFormSignature = useMemo(() => getProductFormSignature(productForm), [productForm]);
  const hasUnsavedProductChanges = productFormSignature !== productFormBaseline;
  const catalogSearchInputRef = useRef(null);
  const productsRef = useRef(products);
  const couponsRef = useRef(coupons);
  const cartRef = useRef(cart);
  const favoritesRef = useRef(favorites);
  const pendingGuestStateMergeRef = useRef(null);
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
  const resetLinkHandledRef = useRef(false);
  const catalogFiltersInitializedRef = useRef(false);
  const restoringCatalogRouteRef = useRef(false);
  const lastCatalogSearchSignatureRef = useRef("");
  const destructiveConfirmationResolverRef = useRef(null);
  const adminPanelHistoryEntryRef = useRef(false);

  const discardProductDraft = useCallback(() => {
    removeStoredProductDraft();
    setProductDraftRecovery(null);
    setProductDraftSavedAt("");
    setProductDraftSaveError("");
  }, []);

  const restoreProductDraft = useCallback(() => {
    if (!productDraftRecovery?.form) return;
    const restoredForm = productDraftRecovery.form;
    setProductForm(restoredForm);
    setProductFormBaseline(
      productDraftRecovery.baselineSignature || getProductFormSignature(createEmptyProductForm()),
    );
    setPreviewColor(restoredForm.colorsData?.[0]?.name || "");
    setPreviewImageIndex(0);
    setProductDraftSavedAt(productDraftRecovery.savedAt || "");
    setProductDraftSaveError("");
    setProductDraftRecovery(null);
    setEditorMessage("Borrador recuperado. Revísalo y guarda cuando esté listo.");
    setEditorError("");
  }, [productDraftRecovery]);

  const persistProductDraftNow = useCallback(() => {
    if (typeof window === "undefined") return false;
    try {
      const savedAt = new Date().toISOString();
      const payload = createProductDraftPayload(productForm, productFormBaseline, savedAt);
      const serialized = JSON.stringify(payload);
      if (serialized.length > PRODUCT_DRAFT_MAX_CHARS) {
        setProductDraftSaveError("El borrador contiene demasiadas imágenes para guardarse automáticamente.");
        return false;
      }
      window.localStorage.setItem(STORAGE_KEYS.adminProductDraft, serialized);
      setProductDraftSavedAt(savedAt);
      setProductDraftSaveError("");
      return true;
    } catch {
      setProductDraftSaveError("No se pudo guardar el borrador en este navegador.");
      return false;
    }
  }, [productForm, productFormBaseline]);

  const discardCurrentProductChanges = useCallback(() => {
    const normalizedProductId = normalizeEntityId(productForm.id);
    const savedProduct = normalizedProductId
      ? products.find((product) => normalizeEntityId(product.id) === normalizedProductId)
      : null;
    const cleanForm = savedProduct ? createProductForm(savedProduct) : createEmptyProductForm();
    setProductForm(cleanForm);
    setProductFormBaseline(getProductFormSignature(cleanForm));
    setPreviewColor(cleanForm.colorsData?.[0]?.name || "");
    setPreviewImageIndex(0);
    setCustomProductTypeInput("");
    setCustomFilterTagInput("");
    setEditorMessage("");
    setEditorError("");
    discardProductDraft();
  }, [discardProductDraft, productForm.id, products]);

  const closeAdminPanel = useCallback(() => {
    if (
      typeof window !== "undefined"
      && adminPanelHistoryEntryRef.current
      && window.history.state?.[ADMIN_PANEL_HISTORY_KEY]
    ) {
      adminPanelHistoryEntryRef.current = false;
      setShowAdminPanel(false);
      window.history.back();
      return;
    }
    adminPanelHistoryEntryRef.current = false;
    setShowAdminPanel(false);
  }, []);

  const requestDestructiveConfirmation = useCallback((request) => new Promise((resolve) => {
    destructiveConfirmationResolverRef.current = resolve;
    setDestructiveConfirmation(request);
  }), []);

  const settleDestructiveConfirmation = useCallback((confirmed) => {
    const resolve = destructiveConfirmationResolverRef.current;
    destructiveConfirmationResolverRef.current = null;
    setDestructiveConfirmation(null);
    resolve?.(confirmed);
  }, []);

  const requestProductExitDecision = useCallback(async ({ title, description }) => {
    const decision = await requestDestructiveConfirmation({
      title,
      description,
      cancelLabel: "Quedarme",
      secondaryLabel: "Salir sin guardar",
      secondaryValue: "discard",
      confirmLabel: "Guardar borrador y salir",
      confirmTone: "primary",
    });
    if (!decision) return "stay";
    if (decision === "discard") {
      discardCurrentProductChanges();
      return "discard";
    }
    return persistProductDraftNow() ? "save" : "stay";
  }, [discardCurrentProductChanges, persistProductDraftNow, requestDestructiveConfirmation]);

  const requestCloseAdminPanel = useCallback(async () => {
    if (adminTab === "producto" && hasUnsavedProductChanges) {
      const decision = await requestProductExitDecision({
        title: "¿Salir del editor?",
        description: "Tienes cambios sin publicar. Puedes guardar el borrador para continuar después o salir descartándolos.",
      });
      if (decision === "stay") return;
    }
    closeAdminPanel();
  }, [adminTab, closeAdminPanel, hasUnsavedProductChanges, requestProductExitDecision]);

  const requestAdminTabChange = useCallback(async (requestedTab) => {
    const nextTab = requestedTab === "inventario" ? "resumen" : requestedTab;
    if (adminTab === "producto" && nextTab !== "producto" && hasUnsavedProductChanges) {
      const decision = await requestProductExitDecision({
        title: "¿Cambiar de sección?",
        description: "Tienes cambios sin publicar. Puedes guardar el borrador para retomarlo después o descartarlos antes de cambiar de sección.",
      });
      if (decision === "stay") return;
    }
    setAdminTab(nextTab);
  }, [adminTab, hasUnsavedProductChanges, requestProductExitDecision]);

  const normalizedPathname = pathname.replace(/\/+$/, "") || "/";
  const productRouteMatch = normalizedPathname.match(/^\/producto\/([^/]+)$/);
  const productRouteSlug = productRouteMatch ? decodeRouteSegment(productRouteMatch[1]) : "";
  const isResetRoute = normalizedPathname === "/cuenta/restablecer";
  const routedProduct = productRouteSlug
    ? products.find((entry) => (
      entry?.isPublic !== false
      && slugify(entry?.slug || entry?.name || entry?.id || "") === productRouteSlug
    ))
    : null;

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const handlePopState = () => {
      const nextPathname = window.location.pathname || "/";
      setPathname(nextPathname);
      if (nextPathname !== "/") return;
      const nextCatalogState = readCatalogRouteState();
      restoringCatalogRouteRef.current = true;
      setSearch(nextCatalogState.search);
      setCategory(nextCatalogState.category);
      setProductTypeFilter(nextCatalogState.productType);
      setSortBy(nextCatalogState.sortBy);
      setCatalogPage(nextCatalogState.page);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const isMissingRoute = normalizedPathname !== "/"
      && !isResetRoute
      && (!productRouteSlug || (catalogReady && !routedProduct));
    const robots = isResetRoute || isMissingRoute
      ? "noindex, nofollow"
      : "index, follow";
    let robotsMeta = document.querySelector('meta[name="robots"]');
    if (!robotsMeta) {
      robotsMeta = document.createElement("meta");
      robotsMeta.setAttribute("name", "robots");
      document.head.appendChild(robotsMeta);
    }
    robotsMeta.setAttribute("content", robots);
    const origin = window.location.origin;
    const productName = sanitizeLine(routedProduct?.name || "Producto");
    const productDescription = sanitizeParagraph(
      routedProduct?.description || `Compra ${productName} en Adriego Store. Pedidos directos por WhatsApp.`,
    ).slice(0, 160);
    const productImage = normalizeSafeUrl(
      routedProduct?.images?.[0] || routedProduct?.image || FALLBACK_IMAGE,
    ) || FALLBACK_IMAGE;
    const title = isResetRoute
      ? "Restablecer contraseña | Adriego Store"
      : (isMissingRoute
        ? "Página no encontrada | Adriego Store"
        : (routedProduct ? `${productName} | Adriego Store` : "Adriego Store | Moda seleccionada"));
    const description = routedProduct ? productDescription : "Descubre Adriego Store. Moda seleccionada con atención personalizada por WhatsApp.";
    document.title = title;
    upsertRouteMeta('meta[name="description"]', ["name", "description"], description);
    upsertRouteMeta('meta[property="og:title"]', ["property", "og:title"], title);
    upsertRouteMeta('meta[property="og:description"]', ["property", "og:description"], description);
    upsertRouteMeta('meta[property="og:type"]', ["property", "og:type"], routedProduct ? "product" : "website");
    upsertRouteMeta('meta[property="og:url"]', ["property", "og:url"], `${origin}${normalizedPathname}`);
    upsertRouteMeta('meta[name="twitter:title"]', ["name", "twitter:title"], title);
    upsertRouteMeta('meta[name="twitter:description"]', ["name", "twitter:description"], description);

    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.setAttribute("rel", "canonical");
      document.head.appendChild(canonical);
    }
    canonical.setAttribute("href", `${origin}${normalizedPathname}`);

    const existingSchema = document.getElementById("route-product-jsonld");
    if (!routedProduct || isMissingRoute) {
      existingSchema?.remove();
      return;
    }
    const schema = existingSchema || document.createElement("script");
    schema.id = "route-product-jsonld";
    schema.type = "application/ld+json";
    schema.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Product",
      name: productName,
      image: [productImage],
      description: productDescription,
      sku: String(routedProduct.id || productRouteSlug),
      offers: {
        "@type": "Offer",
        priceCurrency: "USD",
        price: Number(routedProduct.price || 0).toFixed(2),
        availability: hasProductAvailableStock(routedProduct)
          ? "https://schema.org/InStock"
          : "https://schema.org/OutOfStock",
        url: `${origin}${normalizedPathname}`,
      },
    });
    if (!existingSchema) document.head.appendChild(schema);
  }, [catalogReady, isResetRoute, normalizedPathname, productRouteSlug, routedProduct]);
  const knownAdminOrderIdsRef = useRef(new Set());
  const adminOrdersHydratedRef = useRef(false);
  const checkoutAttemptRef = useRef({ signature: "", idempotencyKey: "" });
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
    || legalModalState.open
    || Boolean(selectedProduct);
  const heroAutoplayDelayMs = isMobileViewport ? 5600 : 4200;
  const showPreviousHeroSlide = useCallback(() => {
    setHeroIndex((previous) => (previous - 1 + heroSlides.length) % heroSlides.length);
  }, [heroSlides.length]);
  const showNextHeroSlide = useCallback(() => {
    setHeroIndex((previous) => (previous + 1) % heroSlides.length);
  }, [heroSlides.length]);
  const heroSwipeHandlers = useSwipeGesture({
    enabled: isMobileViewport && heroSlides.length > 1,
    onSwipeLeft: showNextHeroSlide,
    onSwipeRight: showPreviousHeroSlide,
  });

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
  const recentlyViewedProducts = useMemo(() => recentlyViewedProductIds
    .map((productId) => productsById.get(productId))
    .filter((product) => product && product.isPublic !== false)
    .slice(0, MAX_RECENTLY_VIEWED_PRODUCTS), [productsById, recentlyViewedProductIds]);
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
    const selectedProductId = selectedProduct ? String(selectedProduct.id) : "";
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
      .filter((product) => String(product.id) !== selectedProductId && !cartProductIds.has(String(product.id)))
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
  const publicContactSettings = useMemo(() => {
    const publicLocation = resolvePublicLocation(contactSettings, defaultContactSettings.address);
    const normalizedDefaultWhatsapp = normalizePhoneNumber(defaultContactSettings.whatsappNumber);
    const hasExplicitWhatsappLink = Boolean(sanitizeLine(contactSettings.whatsappLink || ""));
    const isLegacySocialLink = (value) => /atelierstudio/i.test(String(value || ""));
    const hasPublicWhatsapp = Boolean(
      footerWhatsAppLink
      && (hasExplicitWhatsappLink || normalizePhoneNumber(contactSettings.whatsappNumber) !== normalizedDefaultWhatsapp)
    );

    return {
      ...publicLocation,
      whatsappLink: hasPublicWhatsapp ? footerWhatsAppLink : "",
      emailLink: footerEmailLink,
      instagram: isLegacySocialLink(contactSettings.instagram) ? "" : contactSettings.instagram,
      facebook: isLegacySocialLink(contactSettings.facebook) ? "" : contactSettings.facebook,
      tiktok: contactSettings.tiktok,
      paymentSettings: contactSettings.paymentSettings,
    };
  }, [contactSettings, footerEmailLink, footerWhatsAppLink]);
  const isAdmin = Boolean(adminSession);

  useEffect(() => {
    if (
      typeof window === "undefined"
      || !isAdmin
      || adminTab !== "producto"
      || !hasUnsavedProductChanges
      || productDraftRecovery
    ) return undefined;

    const timeoutId = window.setTimeout(persistProductDraftNow, 650);

    return () => window.clearTimeout(timeoutId);
  }, [
    adminTab,
    hasUnsavedProductChanges,
    isAdmin,
    persistProductDraftNow,
    productDraftRecovery,
  ]);

  useEffect(() => {
    if (typeof window === "undefined" || !showAdminPanel || adminTab !== "producto" || !hasUnsavedProductChanges) return undefined;
    const preventAccidentalUnload = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", preventAccidentalUnload);
    return () => window.removeEventListener("beforeunload", preventAccidentalUnload);
  }, [adminTab, hasUnsavedProductChanges, showAdminPanel]);

  useEffect(() => {
    if (!showAdminPanel || !isAdmin || typeof window === "undefined") return undefined;

    const currentState = window.history.state && typeof window.history.state === "object"
      ? window.history.state
      : {};
    if (!currentState[ADMIN_PANEL_HISTORY_KEY]) {
      window.history.pushState({
        ...currentState,
        [ADMIN_PANEL_HISTORY_KEY]: true,
      }, document.title, window.location.href);
    }
    adminPanelHistoryEntryRef.current = true;

    const closeFromBrowserHistory = async () => {
      if (!adminPanelHistoryEntryRef.current) return;
      if (adminTab === "producto" && hasUnsavedProductChanges) {
        const decision = await requestProductExitDecision({
          title: "¿Salir del editor?",
          description: "Tienes cambios sin publicar. Puedes guardar el borrador para continuar después o salir descartándolos.",
        });
        if (decision === "stay") {
          const currentState = window.history.state && typeof window.history.state === "object"
            ? window.history.state
            : {};
          window.history.pushState({ ...currentState, [ADMIN_PANEL_HISTORY_KEY]: true }, document.title, window.location.href);
          adminPanelHistoryEntryRef.current = true;
          return;
        }
      }
      adminPanelHistoryEntryRef.current = false;
      setShowAdminPanel(false);
    };
    window.addEventListener("popstate", closeFromBrowserHistory);
    return () => window.removeEventListener("popstate", closeFromBrowserHistory);
  }, [adminTab, hasUnsavedProductChanges, isAdmin, requestProductExitDecision, showAdminPanel]);

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

  const getUserStateSignature = useCallback((nextCart = [], nextFavorites = []) => (
    buildUserStateSignature(nextCart, nextFavorites, {
      normalizeCart: normalizeAccountCartState,
      normalizeFavorites: normalizeStoredFavorites,
    })
  ), []);

  const {
    applyingRemoteStateRef: applyingRemoteUserStateRef,
    flushUserStateSync,
    lastSignatureRef: userStateLastSignatureRef,
    queueUserStateSync,
    resetUserStateSync,
  } = useUserStateSync({
    currentUserId: currentUser?.id,
    currentUserStateVersion: currentUser?.stateVersion,
    cartRef,
    favoritesRef,
    realtimeVersionsRef: realtimeSyncVersionsRef,
    normalizeCart: normalizeAccountCartState,
    normalizeFavorites: normalizeStoredFavorites,
    getSignature: getUserStateSignature,
    setCurrentUser,
  });

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

    return enqueueAsyncOperation(catalogSyncQueueRef, runSync);
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
    saveStorage(STORAGE_KEYS.recentlyViewedProducts, recentlyViewedProductIds);
  }, [recentlyViewedProductIds]);

  useEffect(() => {
    const productId = normalizeEntityId(selectedProduct?.id);
    if (!productId || selectedProduct?.isPublic === false) return;

    setRecentlyViewedProductIds((previous) => {
      const next = normalizeRecentlyViewedProductIds([
        productId,
        ...previous.filter((entry) => entry !== productId),
      ]);
      const unchanged = next.length === previous.length
        && next.every((entry, index) => entry === previous[index]);
      return unchanged ? previous : next;
    });
  }, [selectedProduct?.id, selectedProduct?.isPublic]);

  useEffect(() => {
    if (!catalogReady) return;
    setRecentlyViewedProductIds((previous) => {
      const next = previous.filter((productId) => {
        const product = productsById.get(productId);
        return Boolean(product) && product.isPublic !== false;
      });
      return next.length === previous.length ? previous : next;
    });
  }, [catalogReady, productsById]);

  useEffect(() => {
    if (!catalogFiltersInitializedRef.current) {
      catalogFiltersInitializedRef.current = true;
      return;
    }
    if (restoringCatalogRouteRef.current) {
      restoringCatalogRouteRef.current = false;
      return;
    }
    setCatalogPage(1);
  }, [search, category, productTypeFilter, sortBy]);

  useEffect(() => {
    if (typeof window === "undefined" || !catalogReady || normalizedPathname !== "/") return;
    const currentUrl = new URL(window.location.href);
    const params = currentUrl.searchParams;
    ["q", "categoria", "tipo", "orden", "pagina"].forEach((key) => params.delete(key));
    if (search.trim()) params.set("q", search.trim());
    if (category !== "Todos") params.set("categoria", category);
    if (productTypeFilter !== "Todos") params.set("tipo", productTypeFilter);
    if (sortBy !== "destacados") params.set("orden", sortBy);
    if (safeCatalogPage > 1) params.set("pagina", String(safeCatalogPage));
    const nextUrl = `${currentUrl.pathname}${params.toString() ? `?${params.toString()}` : ""}${currentUrl.hash}`;
    const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (nextUrl !== currentPath) {
      window.history.replaceState(window.history.state, document.title, nextUrl);
    }
  }, [catalogReady, category, normalizedPathname, productTypeFilter, safeCatalogPage, search, sortBy]);

  useEffect(() => {
    const query = search.trim();
    if (!query) return undefined;
    const signature = `${query}|${category}|${productTypeFilter}|${sortBy}|${filteredProducts.length}`;
    const timerId = window.setTimeout(() => {
      if (lastCatalogSearchSignatureRef.current === signature) return;
      lastCatalogSearchSignatureRef.current = signature;
      trackAnalyticsEvent("catalog_search", {
        query_term: query,
        category: category === "Todos" ? "" : category,
        results_count: filteredProducts.length,
        has_discount_filter: category === OFFER_TAB_VALUE,
      });
    }, 450);
    return () => window.clearTimeout(timerId);
  }, [category, filteredProducts.length, productTypeFilter, search, sortBy]);

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
    resetUserStateSync();
  }, [currentUser?.id, resetUserStateSync]);

  useEffect(() => {
    if (!currentUser?.id) return;

    const remoteCart = normalizeAccountCartState(currentUser.cart || []);
    const remoteFavorites = normalizeStoredFavorites(currentUser.favorites || []);
    const remoteSignature = getUserStateSignature(remoteCart, remoteFavorites);
    const localSignature = getUserStateSignature(cartRef.current, favoritesRef.current);
    const pendingGuestState = pendingGuestStateMergeRef.current;
    const shouldMergeGuestState = Boolean(
      pendingGuestState
      && String(pendingGuestState.userId || "") === String(currentUser.id || ""),
    );
    if (pendingGuestState && !shouldMergeGuestState) {
      pendingGuestStateMergeRef.current = null;
    }

    realtimeSyncVersionsRef.current.currentUserStateVersion = Math.max(
      Number(realtimeSyncVersionsRef.current.currentUserStateVersion || 0),
      Number(currentUser.stateVersion || 0),
    );

    if (!shouldMergeGuestState && (!remoteSignature || remoteSignature === localSignature)) {
      userStateLastSignatureRef.current = remoteSignature || localSignature;
      return;
    }

    const hydratedState = hydrateRemoteUserState({
      remoteCart,
      remoteFavorites,
      localCart: shouldMergeGuestState ? pendingGuestState.cart : cartRef.current,
      localFavorites: shouldMergeGuestState ? pendingGuestState.favorites : favoritesRef.current,
      mergeLocalState: shouldMergeGuestState,
      products: productsRef.current,
      getImageForProduct: getCurrentImageForProduct,
      normalizeCart: normalizeAccountCartState,
      normalizeFavorites: normalizeStoredFavorites,
    });
    const hydratedSignature = getUserStateSignature(hydratedState.cart, hydratedState.favorites);
    if (shouldMergeGuestState) {
      pendingGuestStateMergeRef.current = null;
    }

    applyingRemoteUserStateRef.current = true;
    setCart(hydratedState.cart);
    setFavorites(hydratedState.favorites);
    userStateLastSignatureRef.current = remoteSignature;
    window.setTimeout(() => {
      applyingRemoteUserStateRef.current = false;
      if (shouldMergeGuestState && hydratedSignature !== remoteSignature) {
        queueUserStateSync(120);
      }
    }, 0);
  }, [
    getUserStateSignature,
    currentUser?.cart,
    currentUser?.favorites,
    currentUser?.id,
    currentUser?.stateVersion,
    currentUser?.stateUpdatedAt,
    applyingRemoteUserStateRef,
    queueUserStateSync,
    userStateLastSignatureRef,
  ]);

  useEffect(() => {
    if (!currentUser?.id) return;
    if (applyingRemoteUserStateRef.current) return;
    queueUserStateSync();
  }, [cart, favorites, currentUser?.id, applyingRemoteUserStateRef, queueUserStateSync]);

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
    resetLinkHandledRef.current = true;

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

    // Old reset links used the home page. Keep them working but replace the
    // visible address with the dedicated, noindex recovery route immediately.
    currentUrl.pathname = "/cuenta/restablecer";
    currentUrl.searchParams.delete("resetToken");
    currentUrl.searchParams.delete("token");
    currentUrl.searchParams.delete("email");
    const nextQuery = currentUrl.searchParams.toString();
    const nextUrl = `${currentUrl.pathname}${nextQuery ? `?${nextQuery}` : ""}${currentUrl.hash || ""}`;
    window.history.replaceState({}, document.title, nextUrl);
    setPathname(currentUrl.pathname);
  }, []);

  useEffect(() => {
    if (!isResetRoute || resetLinkHandledRef.current) return;
    setAuthMode("forgot");
    setAuthResetEmailLocked(false);
    setAuthError("");
    setAuthBusy(false);
    setShowProfileModal(false);
    setShowUserAuth(true);
  }, [isResetRoute]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (normalizedPathname === "/carrito") {
      setShowCartSummary(true);
      window.history.replaceState({}, document.title, "/");
      setPathname("/");
    } else if (normalizedPathname === "/favoritos") {
      setShowFavoritesPanel(true);
      window.history.replaceState({}, document.title, "/");
      setPathname("/");
    } else if (normalizedPathname === "/pedidos") {
      setShowOrdersModal(true);
      window.history.replaceState({}, document.title, "/");
      setPathname("/");
    } else if (normalizedPathname === "/admin") {
      setShowAdminLogin(true);
      window.history.replaceState({}, document.title, "/");
      setPathname("/");
    } else if (normalizedPathname === "/buscar") {
      openCatalogSearch();
      window.history.replaceState({}, document.title, "/");
      setPathname("/");
    }
  }, [normalizedPathname]);

  useEffect(() => {
    if (!catalogReady) return;
    if (productRouteSlug) {
      const product = products.find((entry) => (
        entry?.isPublic !== false
        && slugify(entry?.slug || entry?.name || entry?.id || "") === productRouteSlug
      ));
      if (product) {
        setSelectedProduct((previous) => (String(previous?.id) === String(product.id) ? previous : product));
      }
    } else if (selectedProduct && !editingCartItemKey) {
      setSelectedProduct(null);
    }
  }, [catalogReady, editingCartItemKey, productRouteSlug, products, selectedProduct]);

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

  useCatalogBootstrap({
    applyCatalogState: applyCatalogStateFromServer,
    setCatalogReady,
  });

  useEffect(() => {
    void refreshOrdersFromServer({ silent: true });
  }, [refreshOrdersFromServer]);

  useRealtimeSync({
    adminTab,
    applyCatalogState: applyCatalogStateFromServer,
    catalogReady,
    currentUserId: currentUser?.id,
    isAdmin,
    realtimeVersionsRef: realtimeSyncVersionsRef,
    refreshAdminUsers,
    refreshOrders: refreshOrdersFromServer,
    setCurrentUser,
    showAdminPanel,
  });

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
      closeAdminPanel();
      setEditorMessage("La sesion de administracion expiro por seguridad.");
      setEditorError("");
      return undefined;
    }
    const timerId = window.setTimeout(() => {
      setAdminSession(null);
      closeAdminPanel();
      setSelectedProduct(null);
      setEditorMessage("La sesion de administracion expiro por seguridad.");
      setEditorError("");
    }, remaining);
    return () => window.clearTimeout(timerId);
  }, [adminSession, closeAdminPanel]);

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
          closeAdminPanel();
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
  }, [closeAdminPanel, isAdmin, showToastMessage]);

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
      && (adminTab === "contacto" || adminTab === "cuentas");
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
      { id: "contacto", tab: "inicio" },
    ];

    let ticking = false;
    const syncActiveSection = () => {
      if (showCartSummary || showFavoritesPanel) {
        ticking = false;
        return;
      }
      const pivot = window.innerHeight * 0.32;
      let nextTab = "inicio";
      for (const section of sections) {
        const node = document.getElementById(section.id);
        if (!node) continue;
        if (node.getBoundingClientRect().top <= pivot) {
          nextTab = section.tab;
        }
      }
      setActiveMobileSection((prev) => (prev !== nextTab ? nextTab : prev));
      ticking = false;
    };

    const handleScrollOrResize = () => {
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(syncActiveSection);
      }
    };

    handleScrollOrResize();
    window.addEventListener("scroll", handleScrollOrResize, { passive: true });
    window.addEventListener("resize", handleScrollOrResize, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScrollOrResize);
      window.removeEventListener("resize", handleScrollOrResize);
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
  }, []);

  const buildWhatsAppOrderMessage = (order, { variant = "full" } = {}) => {
    const safeVariant = variant === "compact" || variant === "minimal" ? variant : "full";
    const isDelivery = order.deliveryType === "delivery";
    const deliveryMode = isDelivery ? "Envío a domicilio" : "Retiro en local";
    const isCard = normalizePaymentMethod(order.paymentMethod) === "card_link";
    const bankName = order.paymentBankAccount?.bankName || "";
    const methodSummary = isCard
      ? "Tarjeta de crédito / débito (Enlace)"
      : (bankName ? `Transferencia (${bankName})` : "Transferencia bancaria");

    if (safeVariant === "minimal") {
      return [
        `*PEDIDO · ${order.code}*`,
        `• *Cliente:* ${order.customerName || "Cliente"}`,
        `• *Entrega:* ${deliveryMode}`,
        `• *Pago:* ${methodSummary}`,
        `• *TOTAL:* *${currency(order.total || order.subtotal)}*`,
        "",
        isCard
          ? "_Por favor envíenme el enlace seguro para pagar con tarjeta._"
          : "_Adjunto mi comprobante de transferencia para confirmación._",
      ].filter(Boolean).join("\n");
    }

    const safeItems = Array.isArray(order.items) ? order.items : [];
    const compactItems = safeVariant === "compact" ? safeItems.slice(0, 3) : safeItems;
    const remainingItems = Math.max(0, safeItems.length - compactItems.length);

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

    lines.push(
      "",
      `*PRENDAS SELECCIONADAS*`,
      ...compactItems.map((item, index) => (
        `${index + 1}. *${item.name}*\n   ▫️ Color: ${item.color} | Talla: ${item.size} | Cantidad: ${item.quantity} | ${currency(item.price * item.quantity)}`
      )),
      safeVariant === "compact" && remainingItems > 0 ? `+${remainingItems} prenda(s) adicional(es).` : "",
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
  };

  const buildWhatsAppOrderUrl = (order, serverWhatsAppUrl = "", options = {}) => {
    const isMobile = Boolean(options.mobile);
    const WHATSAPP_URL_MAX_LENGTH = 3500;
    const messageVariants = ["full", "compact", "minimal"];
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
    pushCandidate(safeServerUrl, "server");

    const fitting = candidates.find((entry) => entry.url.length <= WHATSAPP_URL_MAX_LENGTH);
    if (fitting) return fitting;

    const sortedByLength = [...candidates].sort((left, right) => left.url.length - right.url.length);
    return sortedByLength[0] || { url: "", mode: "none" };
  };

  const buildWhatsAppOrderFollowupMessage = (order) => {
    const normalizedStatus = normalizeOrderStatusForOrder(order?.status, order?.deliveryType);
    const deliveryMode = order?.deliveryType === "delivery" ? "Envío a domicilio" : "Retiro en local";
    const statusSummary = normalizedStatus === "Listo para retiro"
      ? "Listo para retiro"
      : (normalizedStatus === "Enviado" ? "Enviado" : normalizedStatus);
    return [
      `*CONSULTA DE PEDIDO · ADRIEGO STORE*`,
      `*Código:* ${order?.code || ""}`,
      `━━━━━━━━━━━━━━━━━━━━`,
      `• *Cliente:* ${order?.customerName || "Cliente"}`,
      `• *Estado:* ${statusSummary}`,
      `• *Entrega:* ${deliveryMode}`,
      `• *Total:* ${currency(order?.total || order?.subtotal || 0)}`,
      `━━━━━━━━━━━━━━━━━━━━`,
      order?.deliveryType === "delivery"
        ? "_Hola, deseo consultar el estado de la entrega a mi domicilio._"
        : "_Hola, deseo coordinar el retiro de mi pedido en el local._",
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
      showToastMessage("Esta prenda ya no está disponible.", "info");
      return;
    }
    if (!options?.fromCartEdit) {
      setEditingCartItemKey(null);
    }
    const preferredInput = selectionOverride || selections[product.id] || {};
    const preferred = getFallbackSelection(product, preferredInput);
    trackAnalyticsEvent("product_opened", {
      product_id: String(product.id || ""),
      slug: String(product.slug || product.id || ""),
      category: String(product.category || ""),
      price: Number(product.price || 0),
      has_offer: Boolean(product.offerEnabled),
      discount_percentage: discountPercent(product.price, product.oldPrice),
      source: String(options.source || "catalog"),
    });

    setSelections((previous) => ({
      ...previous,
      [product.id]: {
        color: preferred.color,
        size: preferred.size,
      },
    }));

    setShowCartSummary(false);
    setShowFavoritesPanel(false);
    const productSlug = slugify(product.slug || product.name || product.id || "");
    if (productSlug && options.syncRoute !== false && typeof window !== "undefined") {
      const nextPath = `/producto/${encodeURIComponent(productSlug)}`;
      if (window.location.pathname !== nextPath) {
        window.history.pushState({}, document.title, nextPath);
        setPathname(nextPath);
      }
    }
    window.setTimeout(() => {
      setSelectedProduct(product);
    }, 150);
  };

  const closeProductModal = ({ returnToCart = false } = {}) => {
    const wasEditingCartItem = Boolean(editingCartItemKey);
    if (productRouteSlug && typeof window !== "undefined") {
      window.history.replaceState({}, document.title, "/");
      setPathname("/");
    }
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
      showToastMessage("Esta prenda ya no está disponible.", "info");
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
          showToastMessage("Esa talla está agotada por ahora.", "error");
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
        showToastMessage("Esa talla está agotada por ahora.", "error");
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
    trackAnalyticsEvent("cart_item_added", {
      product_id: String(product.id || ""),
      variant_size: String(selection.size || ""),
      variant_color: String(selection.color || ""),
      unit_price: Number(product.price || 0),
      quantity: 1,
    });
    triggerFlyToCart({
      sourceElement: animationMeta?.sourceElement,
      image: animationMeta?.image || chosenImage,
    });
  };

  const updateQuantity = async (key, delta) => {
    const item = cart.find((entry) => entry.key === key);
    if (!item) return;

    if (item.quantity + delta <= 0) {
      const confirmed = await requestDestructiveConfirmation({
        title: "¿Eliminar prenda?",
        description: `¿Estás seguro de que deseas quitar "${item.name}" (${item.color} - ${item.size}) de tu carrito?`,
        confirmLabel: "Eliminar",
        cancelLabel: "Conservar",
        confirmTone: "danger",
      });
      if (!confirmed) return;
      setCart((previous) => previous.filter((entry) => entry.key !== key));
      showToastMessage("Prenda eliminada del carrito.", "info");
      return;
    }

    setCart((previous) => previous
      .map((entry) => {
        if (entry.key !== key) return entry;
        const product = productsById.get(normalizeEntityId(entry.id));
        const availableStock = getStockForVariant(product, entry.color, entry.size);
        const nextQuantity = entry.quantity + delta;
        if (nextQuantity > availableStock) return entry;
        return { ...entry, quantity: nextQuantity };
      }));
  };

  const removeItem = async (key) => {
    const item = cart.find((entry) => entry.key === key);
    if (!item) return;

    const confirmed = await requestDestructiveConfirmation({
      title: "¿Eliminar prenda?",
      description: `¿Estás seguro de que deseas quitar "${item.name}" (${item.color} - ${item.size}) de tu carrito?`,
      confirmLabel: "Eliminar",
      cancelLabel: "Conservar",
      confirmTone: "danger",
    });
    if (!confirmed) return;

    setCart((previous) => previous.filter((entry) => entry.key !== key));
    showToastMessage("Prenda eliminada del carrito.", "info");
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
      nextValue = stripDangerousContent(value).replace(/[\r\n\t]+/g, " ").slice(0, AUTH_FIELD_LIMITS.name);
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
      showToastMessage("Podrás escribirnos por WhatsApp cuando el pedido esté enviado o listo para retirar.", "info");
      return;
    }

    const pendingExternalWindow = preOpenExternalWindow();
    const targetUrl = buildWhatsAppOrderFollowupUrl(order, { mobile: isMobileViewport });
    if (!targetUrl) {
      closeExternalWindow(pendingExternalWindow);
      showToastMessage("WhatsApp no está disponible en este momento. Escríbenos por otro medio de contacto.", "error");
      return;
    }

    const launchResult = launchWhatsAppUrl(targetUrl, {
      preferredWindow: pendingExternalWindow,
      isMobile: isMobileViewport,
      fallbackDelayMs: isMobileViewport ? 1300 : 900,
    });
    if (!launchResult.launched) {
      closeExternalWindow(pendingExternalWindow);
      showToastMessage("No pudimos abrir WhatsApp automáticamente. Inténtalo nuevamente.", "warning");
    }
  };

  const handleUserLogout = async ({ closeMobileNav = false } = {}) => {
    await flushUserStateSync();
    const logoutResult = await logoutUserAccount();
    if (!logoutResult?.ok) {
      showToastMessage("No pudimos cerrar la sesión. Revisa tu conexión e inténtalo nuevamente.", "error");
      return;
    }
    // ASVS V7.4: only terminate local state after the server confirms session invalidation.
    resetUserStateSync();
    pendingGuestStateMergeRef.current = null;
    // ASVS V14.3: remove account-scoped browser data on logout to prevent cross-user disclosure.
    cartRef.current = [];
    favoritesRef.current = [];
    setCart([]);
    setFavorites([]);
    removeStorage(STORAGE_KEYS.cart);
    removeStorage(STORAGE_KEYS.favorites);
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
    closeAdminPanel();
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
    closeAdminPanel();
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
          : stripDangerousContent(value).replace(/[\r\n\t]+/g, " "),
    }));
  };

  const handleAddressBookDraftFieldChange = (field, value) => {
    setAddressBookDraft((previous) => ({
      ...previous,
      [field]: field === "isDefault"
        ? Boolean(value)
        : field === "phone"
          ? normalizeUserPhoneNumber(value)
          : stripDangerousContent(value).replace(/[\r\n\t]+/g, " "),
    }));
  };

  const syncAddressBookForCurrentUser = async (nextBook = [], options = {}) => {
    if (!currentUser?.id) {
      return { ok: false, message: "Inicia sesión para actualizar tus direcciones." };
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
      const errorMessage = options.errorMessage || "No pudimos guardar tus direcciones. Inténtalo nuevamente.";
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
      successMessage: "Dirección principal actualizada.",
      errorMessage: "No pudimos actualizar la dirección principal.",
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
      successMessage: "Dirección eliminada de tu libreta.",
      errorMessage: "No pudimos eliminar la dirección en este momento.",
    });
  };

  const handleSaveAddressBookEntry = async () => {
    const normalizedEntry = normalizeAddressBookEntry({
      ...addressBookDraft,
      id: addressBookEditingId || createUid(),
    });
    if (!normalizedEntry || !normalizedEntry.address) {
      setProfileFeedback({ tone: "error", message: "Ingresa una dirección válida para guardarla." });
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
      successMessage: addressBookEditingId ? "Dirección actualizada." : "Dirección guardada.",
      errorMessage: "No pudimos guardar la dirección.",
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
      setProfileFeedback({ tone: "error", message: "Ingresa un correo electrónico válido." });
      return;
    }
    if (phone && phone.length !== AUTH_FIELD_LIMITS.phone) {
      setProfileFeedback({ tone: "error", message: "El teléfono debe tener 10 dígitos." });
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
      return { ok: false, message: "Inicia sesión para guardar direcciones." };
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
      return { ok: false, message: "Ingresa una dirección válida para guardarla." };
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
      errorMessage: "No pudimos guardar la dirección.",
    });
    if (!syncResult.ok) {
      return { ok: false, message: syncResult.message || "No pudimos guardar la dirección." };
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
      setPasswordFeedback({ tone: "error", message: "Completa todos los campos de contraseña." });
      return;
    }
    if (!hasStrongPassword(newPassword)) {
      setPasswordFeedback({ tone: "error", message: `La nueva contraseña debe tener mínimo ${PASSWORD_SECURITY.minLength} caracteres con letras y números.` });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordFeedback({ tone: "error", message: "La confirmación no coincide con la nueva contraseña." });
      return;
    }

    const response = await changeUserPassword({
      currentPassword,
      newPassword,
      confirmPassword,
    });
    if (!response.ok) {
      setPasswordFeedback({ tone: "error", message: response.message || "No pudimos actualizar la contraseña." });
      return;
    }

    setPasswordDraft({ currentPassword: "", newPassword: "", confirmPassword: "" });
    setPasswordFeedback({ tone: "success", message: "Contraseña actualizada correctamente." });
    showToastMessage("Contraseña actualizada.", "success");
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
    const confirmed = await requestDestructiveConfirmation({
      title: `¿Eliminar el cupón “${target.code}”?`,
      description: "Dejará de ser válido para nuevas compras. Los pedidos históricos no se modificarán.",
    });
    if (!confirmed) return;
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
      showToastMessage("Ingresa un código de cupón para aplicarlo.", "error");
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
    if (selectedProduct) {
      setSelectedProduct(null);
    }
    if (productRouteSlug && typeof window !== "undefined") {
      window.history.replaceState({}, document.title, "/");
      setPathname("/");
    }
    setShowCartSummary(false);
    setShowFavoritesPanel(false);
    setShowMobileNav(false);
    setShowOrdersModal(false);
    setShowUserAuth(false);
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

  const handleGoHome = useCallback(() => {
    setActiveMobileSection("inicio");
    setSearch("");
    setCategory("Todos");
    setProductTypeFilter("Todos");
    setSortBy("featured");
    setCatalogPage(1);
    setEditingCartItemKey(null);
    setShowMobileNav(false);

    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
      if (window.history && window.location.search) {
        window.history.pushState(null, "", window.location.pathname);
      }
    }
  }, []);

  const stageGuestStateMerge = (user) => {
    const guestCart = normalizeAccountCartState(cart);
    const guestFavorites = normalizeStoredFavorites(favorites);
    pendingGuestStateMergeRef.current = guestCart.length || guestFavorites.length
      ? {
          userId: String(user?.id || ""),
          cart: guestCart,
          favorites: guestFavorites,
        }
      : null;
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
          setAuthError(response.message || "No pudimos iniciar la recuperación en este momento.");
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
          message: "Si existe una cuenta con ese correo, te enviamos un enlace para restablecer tu contraseña.",
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
          setAuthError(response.message || "No pudimos restablecer tu contraseña.");
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
          title: "Contraseña actualizada",
          message: "Ya puedes iniciar sesión con tu nueva contraseña.",
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
        stageGuestStateMerge(registerResponse.user);
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
          message: "Tu cuenta está activa. Gracias por confiar en nosotros.",
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
        pendingGuestStateMergeRef.current = null;
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
        setAuthError(userLoginResponse.message || "Correo, usuario o contraseña incorrectos.");
        return;
      }

      const nextDestination = postAuthDestination;
      const firstName = ((userLoginResponse.user.name || "cliente").split(" ")[0] || "cliente");

      await logoutAdminSession();
      stageGuestStateMerge(userLoginResponse.user);
      setCurrentUser(userLoginResponse.user);
      setAdminSession(null);
      setShowUserAuth(false);
      setAuthError("");
      setPostAuthDestination(null);
      resetAuthForm();
      triggerConfetti("welcome");
      showToastMessage({
        title: `Bienvenido de nuevo ${firstName}`,
        message: "Es un placer volver a verte. Tu cuenta ya está lista.",
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
        error: "Inicia sesión o crea tu cuenta para guardar y seguir tu pedido antes de enviarlo por WhatsApp.",
      });
      return;
    }

    if (activeCouponCode && !appliedCouponState?.ok) {
      showToastMessage(appliedCouponState.message || "El cupón no es válido para este carrito. Corrígelo o quítalo para continuar.", "error");
      return;
    }

    const unavailableCartLine = cart.find((line) => {
      const product = productsById.get(normalizeEntityId(line.id));
      if (!product || product.isPublic === false) return true;
      const availableStock = getStockForVariant(product, line.color, line.size);
      return availableStock <= 0 || Number(line.quantity || 0) > availableStock;
    });
    if (unavailableCartLine) {
      showToastMessage("Algunas prendas de tu carrito ya no están disponibles. Revísalo antes de continuar.", "warning");
      setShowCartSummary(true);
      return;
    }

    const pendingExternalWindow = preOpenExternalWindow();
    let whatsappLaunched = false;

    const deliveryType = checkoutPayload?.deliveryType === "delivery" ? "delivery" : "pickup";
    const paymentMethod = normalizePaymentMethod(checkoutPayload?.paymentMethod);
    const paymentProof = paymentMethod === PAYMENT_METHODS.transfer
      ? normalizeImageSource(checkoutPayload?.paymentProof || "")
      : "";
    const bankAccountId = paymentMethod === PAYMENT_METHODS.transfer
      ? sanitizeLine(checkoutPayload?.bankAccountId || "")
      : "";
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

    if (paymentMethod === PAYMENT_METHODS.transfer && !paymentProof) {
      closeExternalWindow(pendingExternalWindow);
      showToastMessage("Es obligatorio adjuntar el comprobante de transferencia antes de confirmar tu pedido.", "error");
      return;
    }

    if (deliveryType === "delivery") {
      if (!deliveryDetails.fullName || !deliveryDetails.idNumber || !deliveryDetails.city || !deliveryDetails.address || !deliveryDetails.reference) {
        closeExternalWindow(pendingExternalWindow);
        showToastMessage("Completa todos los datos de envío antes de confirmar el pedido.", "error");
        return;
      }
      if (deliveryDetails.phone.length !== AUTH_FIELD_LIMITS.phone) {
        closeExternalWindow(pendingExternalWindow);
        showToastMessage("El teléfono para envío debe tener 10 dígitos.", "error");
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
          showToastMessage(saveAddressResult.message || "No pudimos guardar tu dirección.", "error");
          return;
        }
      }
    }

    trackAnalyticsEvent("checkout_started", {
      subtotal: Number(subtotal || 0),
      item_count: Number(totalItems || 0),
      unique_products: new Set(cart.map((line) => String(line.id || ""))).size,
      coupon_applied: Boolean(activeCouponCode),
      delivery_type_selected: deliveryType,
    });
    setCheckoutBusy(true);
    showToastMessage({
      tone: "info",
      title: "Estamos preparando tu pedido",
      message: "Un momento mientras confirmamos los datos.",
    }, "info");
    try {
      const checkoutRequest = {
        cart,
        couponCode: activeCouponCode,
        paymentMethod,
        paymentProof,
        bankAccountId,
        delivery: {
          type: deliveryType,
          ...deliveryDetails,
        },
      };
      const checkoutSignature = JSON.stringify(checkoutRequest);
      const idempotencyKey = checkoutAttemptRef.current.signature === checkoutSignature
        ? checkoutAttemptRef.current.idempotencyKey
        : createUuid();
      checkoutAttemptRef.current = { signature: checkoutSignature, idempotencyKey };
      const response = await createServerCheckoutOrder({ ...checkoutRequest, idempotencyKey });
      if (!response.ok || !response.order) {
        showToastMessage("No pudimos recibir tu pedido. Revisa tu carrito e inténtalo nuevamente.", "error");
        return;
      }
      checkoutAttemptRef.current = { signature: "", idempotencyKey: "" };

      trackAnalyticsEvent("order_created", {
        order_id: String(response.order.id || ""),
        total: Number(response.order.total || response.order.subtotal || 0),
        discount_amount: Number(response.order.discountAmount || 0),
        item_count: Number(response.order.itemCount || cart.length),
        delivery_type: deliveryType,
        coupon_used: Boolean(activeCouponCode),
      });

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
        showToastMessage("Recibimos tu pedido, pero no pudimos abrir WhatsApp. Ábrelo y envíanos el resumen desde Mis pedidos.", "warning");
      } else {
        whatsappLaunched = true;
        trackAnalyticsEvent("whatsapp_opened", {
          order_id: String(response.order.id || ""),
          total: Number(response.order.total || response.order.subtotal || 0),
          device_type: isMobileViewport ? "mobile" : "desktop",
          is_reopen: false,
        });
      }

      clearActiveCoupon();
      clearCartState();
      setShowOrdersModal(true);
      triggerConfetti("checkout");
      showToastMessage({
        title: `Pedido ${response.order.code} recibido`,
        message: `Gracias ${firstName}. Envíanos el resumen por WhatsApp para confirmarlo.`,
      }, "success");
    } catch {
      closeExternalWindow(pendingExternalWindow);
      showToastMessage("No pudimos recibir tu pedido. Revisa tu conexión e inténtalo nuevamente.", "error");
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
    setProductFormBaseline(getProductFormSignature(emptyForm));
    discardProductDraft();
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
    setProductFormBaseline(getProductFormSignature(form));
    discardProductDraft();
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

  const openRecommendedProduct = (product) => {
    if (!product) return;
    const productSlug = slugify(product.slug || product.name || product.id || "");
    if (productSlug && typeof window !== "undefined") {
      const nextPath = `/producto/${encodeURIComponent(productSlug)}`;
      window.history.replaceState(window.history.state, document.title, nextPath);
      setPathname(nextPath);
    }
    openProductDetail(product, null, { source: "product_recommendation", syncRoute: false });
  };

  const duplicateProductForAdmin = (product) => {
    const form = createProductForm(product);
    form.id = null;
    form.name = `${sanitizeLine(product?.name || "Producto")} copia`;
    form.isPublic = false;
    form.featured = false;
    const emptyBaseline = createEmptyProductForm();
    emptyBaseline.productType = activeProductTypeNames[0] || "General";
    setProductForm(form);
    setProductFormBaseline(getProductFormSignature(emptyBaseline));
    discardProductDraft();
    setPreviewColor(form.colorsData[0]?.name || "");
    setPreviewImageIndex(0);
    setCustomProductTypeInput("");
    setCustomFilterTagInput("");
    setEditorMessage(`Copia de "${product?.name || "Producto"}" lista para revisar. Se mantendrá oculta hasta que decidas publicarla.`);
    setEditorError("");
    setSelectedProduct(null);
    setShowAdminPanel(true);
    setAdminTab("producto");
  };

  const handleDeleteProduct = async (productId) => {
    const normalizedProductId = normalizeEntityId(productId);
    const target = products.find((product) => normalizeEntityId(product.id) === normalizedProductId);
    if (!target) return;
    const confirmed = await requestDestructiveConfirmation({
      title: `¿Eliminar “${target.name}”?`,
      description: "Esta acción no se puede deshacer. El producto se quitará del catálogo y de los favoritos de los usuarios.",
    });
    if (!confirmed) return;

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
    const shouldSanitizeNumeric = ["offerExtraDiscount", "offerDiscountValue"].includes(field);
    const nextValue = shouldSanitizeNumeric
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

  const deleteManagedProductType = async (recordId, replacementName) => {
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

    const confirmed = await requestDestructiveConfirmation({
      title: `¿Eliminar el tipo “${record.name}”?`,
      description: associatedCount > 0
        ? `Los ${associatedCount} producto(s) afectados se reasignarán a “${effectiveReplacement}”. Esta acción no se puede deshacer.`
        : "Esta acción no se puede deshacer.",
    });
    if (!confirmed) return;

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

  const deleteManagedFilterTag = async (recordId, replacementName) => {
    const record = filterTagRecords.find((entry) => entry.id === recordId);
    if (!record) return;

    const replacement = normalizeOptionLabel(replacementName);

    const associatedCount = products.filter((product) => (
      product.filterTags || []
    ).some((tag) => normalizeOptionLabel(tag).toLowerCase() === record.name.toLowerCase())).length;
    const confirmed = await requestDestructiveConfirmation({
      title: `¿Eliminar el filtro “${record.name}”?`,
      description: associatedCount > 0
        ? `Se eliminará de ${associatedCount} producto(s)${replacement ? ` y se reemplazará por “${replacement}”` : ""}. Esta acción no se puede deshacer.`
        : "Esta acción no se puede deshacer.",
    });
    if (!confirmed) return;

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

  const handleBankImageUpload = async (accountId, field, event) => {
    if (field !== "bankLogoImage" && field !== "bankQrImage") return;
    const file = event.target.files?.[0];
    if (!file) return;
    setBankQrUploadBusy(true);
    try {
      const bankImage = await fileToDataUrl(file);
      setContactDraft((previous) => ({
        ...previous,
        paymentSettings: withBankAccounts(
          previous.paymentSettings,
          normalizeBankAccounts(
            previous.paymentSettings,
            { keepEmpty: true, preserveWhitespace: true },
          ).map((account) => (
            account.id === accountId ? { ...account, [field]: bankImage } : account
          )),
        ),
      }));
      showToastMessage(field === "bankLogoImage" ? "Logo bancario cargado." : "QR bancario cargado.", "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "No pudimos cargar la imagen bancaria.";
      setEditorError(message);
      showToastMessage(message, "error");
    } finally {
      setBankQrUploadBusy(false);
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
    if (contactSaveBusy || bankQrUploadBusy) return;
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
    const rawMapsLink = sanitizeLine(contactDraft.mapsLink || "");
    const normalizedMapsLink = normalizeSafeUrl(rawMapsLink);
    if (rawMapsLink && !/^https?:\/\//i.test(normalizedMapsLink)) {
      setEditorError("El enlace de Google Maps no es válido. Copia el enlace completo desde Google Maps.");
      setEditorMessage("");
      setContactSyncFeedback({
        tone: "error",
        message: "No se pudo guardar: revisa el enlace de Google Maps.",
      });
      return;
    }
    const nextContactSettings = normalizeContactSettings({
      ...contactDraft,
      mapsLink: normalizedMapsLink,
    });
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
    if (!isAdmin || !catalogReady) {
      setEditorError("Necesitas una sesión administrativa activa para guardar esta configuración.");
      setEditorMessage("");
      setContactSyncFeedback({
        tone: "error",
        message: "No se guardó: la sesión administrativa no está disponible.",
      });
      return;
    }

    setContactSaveBusy(true);
    setEditorError("");
    setEditorMessage("");
    setContactSyncFeedback({ tone: "warning", message: "Guardando cuentas bancarias y datos de contacto..." });
    const previousContactSettings = contactSettingsRef.current;
    const previousStoreSettings = storeSettingsRef.current;
    contactSettingsRef.current = nextContactSettings;
    storeSettingsRef.current = nextStoreSettings;
    try {
      const syncResult = await enqueueAsyncOperation(
        catalogSyncQueueRef,
        () => syncContactState(nextContactSettings, nextStoreSettings),
      );
      if (!syncResult.ok) {
        if (contactSettingsRef.current === nextContactSettings) {
          contactSettingsRef.current = previousContactSettings;
        }
        if (storeSettingsRef.current === nextStoreSettings) {
          storeSettingsRef.current = previousStoreSettings;
        }
        const message = syncResult.message || "No pudimos guardar la configuración en el servidor.";
        setEditorError(message);
        showToastMessage(message, "error");
        setContactSyncFeedback({ tone: "error", message: `No se guardó: ${message}` });
        return;
      }

      const verifiedContactSettings = syncResult.data?.contactSettings
        ? resolveContactSettingsWithServerFallback(
            syncResult.data.contactSettings,
            defaultContactSettings,
          )
        : null;
      if (
        !verifiedContactSettings
        || !paymentSettingsMatch(
          nextContactSettings.paymentSettings,
          verifiedContactSettings.paymentSettings,
        )
      ) {
        const message = "El servidor no confirmó todas las cuentas bancarias, sus logos o sus QR. Tus cambios siguen en el formulario para que puedas reintentar.";
        setContactSettings(previousContactSettings);
        setContactDraft(nextContactSettings);
        contactSettingsRef.current = previousContactSettings;
        storeSettingsRef.current = previousStoreSettings;
        setEditorError(message);
        showToastMessage(message, "error");
        setContactSyncFeedback({ tone: "error", message });
        return;
      }

      const persistedContactSettings = resolveContactSettingsWithServerFallback(
        syncResult.data.contactSettings,
        defaultContactSettings,
      );
      const persistedStoreSettings = mergeStoreSettings(
        syncResult.data?.storeSettings || nextStoreSettings,
      );
      setContactSettings(persistedContactSettings);
      setContactDraft(persistedContactSettings);
      setStoreSettings(persistedStoreSettings);
      setStoreDraft((previous) => ({
        ...previous,
        footerTitle: persistedStoreSettings.footerTitle,
        footerText: persistedStoreSettings.footerText,
      }));
      contactSettingsRef.current = persistedContactSettings;
      storeSettingsRef.current = persistedStoreSettings;
      catalogSyncErrorShownRef.current = false;
      const syncedAt = new Date().toISOString();
      setEditorMessage("Las cuentas bancarias y los datos de contacto quedaron guardados.");
      showToastMessage("Métodos de pago guardados correctamente.", "success");
      setContactSyncFeedback({
        tone: "success",
        message: `Guardado en servidor: ${formatAdminTimestamp(syncedAt)}`,
      });
    } finally {
      setContactSaveBusy(false);
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
    showToastMessage("Comprobante eliminado.", "success");
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
    const confirmed = await requestDestructiveConfirmation({
      title: `¿Eliminar el pedido ${target.code}?`,
      description: "Se perderá el registro de esta venta y el historial visible para el cliente. Esta acción no se puede deshacer.",
    });
    if (!confirmed) return;
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
  const knownDirectRoutes = new Set(["/", "/cuenta/restablecer", "/carrito", "/favoritos", "/pedidos", "/admin", "/buscar"]);
  const routeNotFound = catalogReady
    && !knownDirectRoutes.has(normalizedPathname)
    && (!productRouteSlug || (catalogReady && !routedProduct));

  const returnHomeFromRoute = () => {
    if (typeof window !== "undefined") {
      window.history.pushState({}, document.title, "/");
    }
    setPathname("/");
  };

  if (routeNotFound) {
    return (
      <MotionConfig reducedMotion="user">
        <RouteNotFound onReturnHome={returnHomeFromRoute} />
      </MotionConfig>
    );
  }

  return (
    <MotionConfig reducedMotion="user">
      <>
      {selectedProduct && (
        <ErrorBoundary onReset={() => closeProductModal({ returnToCart: true })}>
          <Suspense fallback={null}>
            <ProductModal
              product={selectedProduct}
              selection={selectedProduct ? selections[selectedProduct.id] : null}
              recommendations={recommendedProducts.slice(0, 4)}
              onOpenRecommendation={openRecommendedProduct}
              onClose={() => closeProductModal({ returnToCart: true })}
              onChange={handleSelection}
              cartEditMode={Boolean(editingCartItemKey)}
              onAddToCart={(product, animationMeta) => {
                const wasEditingCartItem = Boolean(editingCartItemKey);
                addToCart(product, animationMeta);
                if (wasEditingCartItem) {
                  closeProductModal();
                  setShowCartSummary(true);
                }
              }}
              isAdmin={isAdmin}
              onEditProduct={(product) => {
                startEditingProduct(product);
                setSelectedProduct(null);
              }}
            />
          </Suspense>
        </ErrorBoundary>
      )}

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

      {showCartSummary && (
        <ErrorBoundary onReset={() => setShowCartSummary(false)}>
          <Suspense fallback={null}>
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
              contactSettings={publicContactSettings}
            />
          </Suspense>
        </ErrorBoundary>
      )}

      {showFavoritesPanel && (
        <ErrorBoundary onReset={() => setShowFavoritesPanel(false)}>
          <Suspense fallback={null}>
            <FavoritesModal
              open={showFavoritesPanel}
              onClose={() => setShowFavoritesPanel(false)}
              favorites={favorites}
              products={products}
              onOpenProduct={(product) => openProductDetail(product)}
              onToggleFavorite={toggleFavorite}
              onBrowseCatalog={browseCatalogFromModal}
            />
          </Suspense>
        </ErrorBoundary>
      )}

      {showProfileQuickMenu && (
        <ErrorBoundary onReset={() => setShowProfileQuickMenu(false)}>
          <Suspense fallback={null}>
            <ProfileQuickMenu
              open={showProfileQuickMenu}
              position={profileQuickMenuPosition}
              onClose={() => setShowProfileQuickMenu(false)}
              onOpenSection={openProfileActionFromMenu}
              onOpenOrders={openOrdersFromProfileMenu}
              onLogout={() => { void handleUserLogout(); }}
            />
          </Suspense>
        </ErrorBoundary>
      )}

      <ErrorBoundary onReset={() => { setShowUserAuth(false); setShowProfileModal(false); }}>
        <Suspense fallback={null}>
          {showUserAuth && (
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
          )}

          {showProfileModal && (
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
          )}
        </Suspense>
      </ErrorBoundary>

      {showOrdersModal && (
        <ErrorBoundary onReset={() => setShowOrdersModal(false)}>
          <Suspense fallback={null}>
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
          </Suspense>
        </ErrorBoundary>
{legalModalState.open && (
        <ErrorBoundary onReset={() => setLegalModalState((prev) => ({ ...prev, open: false }))}>
          <Suspense fallback={null}>
            <LegalModal
              open={legalModalState.open}
              tab={legalModalState.tab}
              onTabChange={(tab) => setLegalModalState((prev) => ({ ...prev, tab }))}
              onClose={() => setLegalModalState((prev) => ({ ...prev, open: false }))}
              brandName={storeSettings.brandName || "Adriego Store"}
            />
          </Suspense>
        </ErrorBoundary>
      )}

      {showAdminPanel && isAdmin && (
        <ErrorBoundary onReset={requestCloseAdminPanel}>
          <Suspense fallback={null}>
            <ExternalAdminPanelModal
              open={showAdminPanel && isAdmin}
              onClose={requestCloseAdminPanel}
              adminTab={adminTab === "inventario" ? "resumen" : adminTab}
              setAdminTab={requestAdminTabChange}
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
              duplicateProduct={duplicateProductForAdmin}
              handleDeleteProduct={handleDeleteProduct}
              bulkDeleteCatalogProducts={bulkDeleteCatalogProducts}
              bulkSetCatalogFeatured={bulkSetCatalogFeatured}
              toggleProductPublicVisibility={toggleProductPublicVisibility}
              productForm={productForm}
              productDraftRecovery={productDraftRecovery}
              productDraftSavedAt={productDraftSavedAt}
              productDraftSaveError={productDraftSaveError}
              hasUnsavedProductChanges={hasUnsavedProductChanges}
              restoreProductDraft={restoreProductDraft}
              saveCurrentProductDraft={saveCurrentProductDraft}
              discardCurrentProductChanges={discardCurrentProductChanges}
              handleProductFieldChange={handleProductFieldChange}
              handleToggleColor={handleToggleColor}
              handleColorVariantChange={handleColorVariantChange}
              addColorVariant={addColorVariant}
              removeColorVariant={removeColorVariant}
              handleBulkStockChange={handleBulkStockChange}
              applyStockToAllVariants={applyStockToAllVariants}
              handleProductImageUpload={handleProductImageUpload}
              handleRemoveProductImage={handleRemoveProductImage}
              handleSetPrimaryImage={handleSetPrimaryImage}
              saveProduct={saveProduct}
              startCreatingProduct={startCreatingProduct}
              storeSettings={storeSettings}
              storeDraft={storeDraft}
              setStoreDraft={setStoreDraft}
              onSaveStore={saveStoreInfo}
              savingStore={savingStore}
              contactSettings={contactSettings}
              contactDraft={contactDraft}
              setContactDraft={setContactDraft}
              onSaveContact={saveContactInfo}
              savingContact={savingContact}
              orders={adminOrders}
              onUpdateOrderStatus={handleUpdateOrderStatus}
              onDeleteOrder={handleDeleteOrder}
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
              requestDestructiveConfirmation={requestDestructiveConfirmation}
            />
          </Suspense>
        </ErrorBoundary>
      )}

      <ConfirmModal
        open={Boolean(destructiveConfirmation)}
        title={destructiveConfirmation?.title || "¿Confirmar acción?"}
        description={destructiveConfirmation?.description || "Esta acción no se puede deshacer."}
        confirmLabel={destructiveConfirmation?.confirmLabel || "Eliminar"}
        cancelLabel={destructiveConfirmation?.cancelLabel || "Cancelar"}
        secondaryLabel={destructiveConfirmation?.secondaryLabel || ""}
        confirmTone={destructiveConfirmation?.confirmTone || "danger"}
        onCancel={() => settleDestructiveConfirmation(false)}
        onSecondary={() => settleDestructiveConfirmation(destructiveConfirmation?.secondaryValue || "secondary")}
        onConfirm={() => settleDestructiveConfirmation(true)}
      >
        {destructiveConfirmation?.content}
      </ConfirmModal>

      {referenceOrder && (
        <ErrorBoundary onReset={() => setReferenceOrder(null)}>
          <Suspense fallback={null}>
            <OrderReferenceModal
              open={Boolean(referenceOrder)}
              order={referenceOrder}
              onClose={() => setReferenceOrder(null)}
            />
          </Suspense>
        </ErrorBoundary>
      )}

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
            <button type="button" className="icon-btn toast-close" aria-label="Cerrar notificación" onClick={() => setToast(null)}>
              <X size={14} />
            </button>
          </Motion.div>
        )}
      </AnimatePresence>

      <a className="skip-link" href="#main-content">Saltar al catálogo</a>

      <AnnouncementBar />

      <header className="topbar">
        <div className="container nav">
          <div className="nav-brand">
            <button
              type="button"
              className="brand-wordmark-btn"
              onClick={handleGoHome}
              aria-label={`Volver al inicio - ${storeSettings.brandName || "Adriego Store"}`}
            >
              {storeSettings.brandLabel.toLowerCase() !== storeSettings.brandName.toLowerCase() && (
                <p className="brand-label">{storeSettings.brandLabel}</p>
              )}
              <h1 className="brand-wordmark">{storeSettings.brandName}</h1>
            </button>
            <div className="mobile-header-tools" role="group" aria-label="Accesos rápidos">
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
            <a href="#coleccion" onClick={() => { setCategory(OFFER_TAB_VALUE); setShowMobileNav(false); }}>Ofertas</a>
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
                <button
                  type="button"
                  className="brand-wordmark-btn"
                  onClick={handleGoHome}
                  aria-label={`Volver al inicio - ${storeSettings.brandName || "Adriego Store"}`}
                >
                  <strong>{storeSettings.brandName}</strong>
                </button>
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
                    <span>Colección</span>
                    <ChevronRight size={15} />
                  </a>
                  <a href="#coleccion" onClick={() => { setCategory(OFFER_TAB_VALUE); setShowMobileNav(false); }}>
                    <span>Ofertas</span>
                    <ChevronRight size={15} />
                  </a>
                  <a href="#contacto" onClick={() => setShowMobileNav(false)}>
                    <span>Contacto</span>
                    <ChevronRight size={15} />
                  </a>
                </div>
              </div>
              <div className="mobile-quick-icons" role="group" aria-label="Accesos rápidos">
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
          aria-label="Ir al catálogo"
        >
          <LayoutGrid size={17} />
          <span>Catálogo</span>
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
            <h2 className="section-title hero-title" style={{ fontSize: "clamp(34px, 6vw, 64px)", marginTop: 18 }}>{activeHeroSlide?.title || "Nueva colección"}</h2>
            <p className="muted hero-copy" style={{ fontSize: 18, lineHeight: 1.8, maxWidth: 620 }}>
              {activeHeroSlide?.subtitle || "Explora prendas versátiles y encuentra tu próximo look."}
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
                Envío rápido
              </span>
              <span className="trust-badge-pill">
                <ShieldCheck size={14} />
                Pago seguro
              </span>
              <span className="trust-badge-pill">
                <RotateCcw size={14} />
                Cambios fáciles
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
              {...heroSwipeHandlers}
              onClick={() => heroSlideHasAction && handleHeroSlideClick(activeHeroSlide)}
              aria-label={heroSlideHasAction ? "Abrir contenido de la portada" : "Imagen de portada"}
              aria-disabled={!heroSlideHasAction}
            >
              <div className="hero-img-wrap">
                <AnimatePresence mode="wait">
                  <Motion.img
                    key={activeHeroSlide?.image || heroIndex}
                    src={activeHeroSlide?.image || FALLBACK_IMAGE}
                    alt={activeHeroSlide?.title || "Imagen de portada"}
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
                <p className="hero-caption-title" style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>{activeHeroSlide?.title || "Nueva colección"}</p>
              </div>
              {heroSlideHasAction && (
                <span className="hero-slide-link-hint">
                  Ver detalle
                  <ChevronRight size={18} />
                </span>
              )}
            </div>

            {heroSlides.length > 1 && (
              <div className="hero-slide-indicators" aria-label="Imágenes de portada">
                {heroSlides.map((slide, index) => (
                  <button
                    key={slide.id || index}
                    type="button"
                    className={`hero-slide-dot ${index === heroIndex ? "active" : ""}`}
                    aria-label={`Ir a la imagen ${index + 1}`}
                    onClick={() => setHeroIndex(index)}
                  />
                ))}
              </div>
            )}
          </Motion.div>
        </div>
      </section>

      <ExternalFeaturedProductMarquee
        products={featuredProducts}
        catalogReady={catalogReady}
        onOpenDetail={openProductDetail}
      />

      <main id="main-content" className="container catalog-main" style={{ paddingBottom: 48 }} tabIndex={-1}>
        <div style={{ display: "grid", gap: 40 }}>
          <section id="coleccion" className="section-shell catalog-section">
            <div className="catalog-shell">
              <div className="catalog-head">
                <p className="muted catalog-kicker">Catálogo</p>
                <h3 className="catalog-title">Colección completa</h3>
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
                  <CustomDropdown
                    options={[
                      { value: "Todos", label: "Todos los tipos" },
                      ...productTypeOptions.map((item) => ({ value: item, label: item })),
                    ]}
                    value={productTypeFilter}
                    onChange={setProductTypeFilter}
                    icon={Filter}
                    placeholder="Tipo de prenda"
                    ariaLabel="Filtrar por tipo"
                  />
                </div>
                <div className="filter-field filter-field-sort">
                  <CustomDropdown
                    options={[
                      { value: "destacados", label: "Destacados" },
                      { value: "nuevos", label: "Nuevos" },
                      { value: "rating", label: "Mejor valorados" },
                      { value: "precio-asc", label: "Precio: menor a mayor" },
                      { value: "precio-desc", label: "Precio: mayor a menor" },
                    ]}
                    value={sortBy}
                    onChange={setSortBy}
                    icon={Filter}
                    placeholder="Ordenar por"
                    ariaLabel="Ordenar catálogo"
                  />
                </div>
              </div>

              <div className="catalog-feedback-row">
                <div className="catalog-feedback-stats">
                  <p className="helper-text catalog-feedback-text">
                    {filteredProducts.length} {filteredProducts.length === 1 ? "prenda encontrada" : "prendas encontradas"}.
                  </p>
                  {catalogReady && filteredProducts.length > 0 && (
                    <p className="helper-text catalog-feedback-text">
                      Página {safeCatalogPage} de {totalCatalogPages} · prendas {catalogRangeStart}-{catalogRangeEnd}
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
                  Array.from({ length: 8 }, (_, index) => <ExternalCatalogSkeletonCard key={`catalog-skeleton-${index}`} />)
                ) : filteredProducts.length === 0 ? (
                  <div className="empty-admin-note" style={{ gridColumn: "1 / -1" }}>No encontramos productos con los filtros actuales. Prueba quitando un filtro o buscando otra palabra.</div>
                ) : paginatedProducts.map((product) => (
                  <ExternalMemoCatalogProductCard
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
                <ExternalCatalogPagination
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
            <div className="purchase-process">
              <div className="purchase-process-intro">
                <h3>{storeSettings.saleTitle}</h3>
                <p>{storeSettings.saleDescription}</p>
              </div>
              <ol className="purchase-process-steps" aria-label="Cómo comprar en Adriego Store">
                <li className="purchase-process-step">
                  <span className="purchase-process-icon" aria-hidden="true"><ShoppingBag size={19} /></span>
                  <div className="purchase-process-step-copy">
                    <span className="purchase-process-step-number" aria-hidden="true">01</span>
                    <div>
                      <h4>Elige tu prenda</h4>
                      <p>Escoge talla, color y cantidad.</p>
                    </div>
                  </div>
                </li>
                <li className="purchase-process-step">
                  <span className="purchase-process-icon" aria-hidden="true"><Package size={19} /></span>
                  <div className="purchase-process-step-copy">
                    <span className="purchase-process-step-number" aria-hidden="true">02</span>
                    <div>
                      <h4>Revisa tus datos</h4>
                      <p>Confirma contacto y entrega.</p>
                    </div>
                  </div>
                </li>
                <li className="purchase-process-step">
                  <span className="purchase-process-icon purchase-process-icon-final" aria-hidden="true"><Send size={18} /></span>
                  <div className="purchase-process-step-copy">
                    <span className="purchase-process-step-number" aria-hidden="true">03</span>
                    <div>
                      <h4>Envía por WhatsApp</h4>
                      <p>Recibe confirmación personalizada.</p>
                    </div>
                  </div>
                </li>
              </ol>
            </div>
          </Motion.section>

        </div>
      </main>

      {recentlyViewedProducts.length > 0 && (
        <Motion.section
          className="recently-viewed-section section-shell"
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: ANIMATION.medium }}
          aria-labelledby="recently-viewed-title"
        >
          <div className="container">
            <div className="recently-viewed-rail">
              <h3 id="recently-viewed-title">Visto recientemente</h3>
              <div className="recently-viewed-images">
                {recentlyViewedProducts.map((product) => (
                  <button
                    key={product.id}
                    type="button"
                    className="recently-viewed-item"
                    onClick={() => openProductDetail(product, null, { source: "recently_viewed" })}
                    aria-label={`Volver a ver ${product.name}`}
                  >
                    <img
                      src={getCurrentImageForProduct(product, selections[product.id]?.color)}
                      alt={product.name}
                      loading="lazy"
                      decoding="async"
                      onError={(event) => {
                        if (event.currentTarget.src !== FALLBACK_IMAGE) event.currentTarget.src = FALLBACK_IMAGE;
                      }}
                    />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Motion.section>
      )}

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
            <div className={`footer-grid${publicContactSettings.address || publicContactSettings.mapsLink ? "" : " footer-grid-single"}`}>
              <div className="footer-copy">
                <h3>{storeSettings.footerTitle}</h3>
                <p>{storeSettings.footerText}</p>
                <div className="social-row">
                  {publicContactSettings.whatsappLink && (
                    <a className="social-link" href={publicContactSettings.whatsappLink} target="_blank" rel="noopener noreferrer">
                      <span className="social-link-icon"><BrandSocialIcon icon="whatsapp" label="WhatsApp" /></span>
                      <span>WhatsApp</span>
                    </a>
                  )}
                  {publicContactSettings.emailLink && (
                    <a className="social-link" href={publicContactSettings.emailLink}>
                      <span className="social-link-icon"><Mail size={15} /></span>
                      <span>Correo</span>
                    </a>
                  )}
                  {publicContactSettings.instagram && (
                    <a className="social-link" href={publicContactSettings.instagram} target="_blank" rel="noopener noreferrer">
                      <span className="social-link-icon"><BrandSocialIcon icon="instagram" label="Instagram" /></span>
                      <span>Instagram</span>
                    </a>
                  )}
                  {publicContactSettings.facebook && (
                    <a className="social-link" href={publicContactSettings.facebook} target="_blank" rel="noopener noreferrer">
                      <span className="social-link-icon"><BrandSocialIcon icon="facebook" label="Facebook" /></span>
                      <span>Facebook</span>
                    </a>
                  )}
                  {publicContactSettings.tiktok && (
                    <a className="social-link" href={publicContactSettings.tiktok} target="_blank" rel="noopener noreferrer">
                      <span className="social-link-icon"><BrandSocialIcon icon="tiktok" label="TikTok" /></span>
                      <span>TikTok</span>
                    </a>
                  )}
                </div>
              </div>

              {(publicContactSettings.address || publicContactSettings.mapsLink) && (
                <div className="contact-location-panel">
                  <span className="contact-location-icon" aria-hidden="true"><MapPin size={20} /></span>
                  <div className="contact-location-copy">
                    <strong>{publicContactSettings.address ? "Visítanos" : "Encuéntranos"}</strong>
                    <p>{publicContactSettings.address || "Consulta nuestra ubicación en Google Maps."}</p>
                  </div>
                  {publicContactSettings.mapsLink && (
                    <a className="contact-location-link" href={publicContactSettings.mapsLink} target="_blank" rel="noopener noreferrer">
                      Abrir mapa
                      <ChevronRight size={17} />
                    </a>
                  )}
                </div>
              )}
            </div>
            <button
              type="button"
              className="footer-brand-signature-btn"
              onClick={handleGoHome}
              aria-label={`Volver al inicio - ${storeSettings.brandName || "Adriego Store"}`}
            >
              <p className="footer-brand-signature" aria-label="Adriego Store">
                <span>ADRIEGO</span>
                <small>STORE</small>
              </p>
            </button>
          </div>

          <div className="footer-subbar" aria-label="Políticas y documentos legales">
            <nav className="footer-legal-links">
              <button
                type="button"
                className="footer-legal-btn"
                onClick={() => setLegalModalState({ open: true, tab: "exchanges" })}
              >
                <span className="footer-legal-label-full">Política de Cambios</span>
                <span className="footer-legal-label-compact">Cambios</span>
              </button>
              <span className="footer-legal-divider" aria-hidden="true">•</span>
              <button
                type="button"
                className="footer-legal-btn"
                onClick={() => setLegalModalState({ open: true, tab: "privacy" })}
              >
                <span className="footer-legal-label-full">Privacidad de Datos</span>
                <span className="footer-legal-label-compact">Privacidad</span>
              </button>
              <span className="footer-legal-divider" aria-hidden="true">•</span>
              <button
                type="button"
                className="footer-legal-btn"
                onClick={() => setLegalModalState({ open: true, tab: "terms" })}
              >
                <span className="footer-legal-label-full">Términos de Compra</span>
                <span className="footer-legal-label-compact">Términos</span>
              </button>
              <span className="footer-legal-divider" aria-hidden="true">•</span>
              <button
                type="button"
                className="footer-legal-btn"
                onClick={() => setLegalModalState({ open: true, tab: "cookies" })}
              >
                <span className="footer-legal-label-full">Uso de Cookies</span>
                <span className="footer-legal-label-compact">Cookies</span>
              </button>
            </nav>
            <p className="footer-copyright">
              © {new Date().getFullYear()} {storeSettings.brandName || "Adriego Store"}. Todos los derechos reservados.
            </p>
          </div>
        </div>
      </Motion.footer>
      </>
    </MotionConfig>
  );
}



















