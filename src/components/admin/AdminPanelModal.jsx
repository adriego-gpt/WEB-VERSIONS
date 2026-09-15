import { isValidEmail } from '../../utils';
import React, { Suspense, useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { RotateCcw, Plus, Package, UserRound, Navigation, ShieldCheck, Search, PencilLine, Mail, Copy, Trash2, CheckCircle2, Star, Link, Eye, EyeOff, AlertCircle, AlertTriangle, Play, RefreshCw, Upload, Image as ImageIcon, MapPin, SearchX, Clock, CreditCard, Tag, Tags, X, Image, ChevronDown, SlidersHorizontal, ZoomIn, MessageCircle, ExternalLink, Truck } from 'lucide-react';
import { ShowcaseProductCard } from "../catalog/ShowcaseProductCard";
import { CatalogProductCard } from "../catalog/CatalogProductCard";
import { ProductDraftPreview } from '../products/ProductDraftPreview';
import { AdminSectionHeader } from './AdminSectionHeader';
import { MaintenanceSettingsPanel } from './MaintenanceSettingsPanel';
import { ImageLightbox } from '../ui/ImageLightbox';
import { OrderStatusProgress } from '../orders/OrderStatusProgress';
import { normalizeOrderStatusForOrder, formatOrderDate, getOrderStatusMeta, getOrderStatusOptions } from '../../domain/orders/status';
import { getImagesForColor } from '../../domain/products/variants';
import { pruneSelection } from '../../domain/admin/selection';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { lazyWithRetry } from '../../utils/lazyWithRetry.js';
import {
  STORAGE_KEYS, PASSWORD_SECURITY, AUTH_FORM_DEFAULTS,
  AUTH_FIELD_LIMITS, FILE_SECURITY, PRODUCT_FORM_LIMITS, FALLBACK_IMAGE,
  PRODUCT_TYPE_OPTIONS, OFFER_TAB_VALUE, ADMIN_ORDER_DATE_FILTERS,
  ADMIN_ORDER_DELIVERY_FILTERS, ADMIN_ORDER_STATUS_FILTERS, TOAST_DURATION_MS,
  MAX_ADDRESS_BOOK_ENTRIES, DEFAULT_WHATSAPP_COUNTRY_CODE
} from '../../constants';
import {
  sanitizeLine, currency,
  normalizeOfferDiscountMode, normalizeImageSource, formatAdminTimestamp,
  normalizeSearchText, getCourierTrackingUrl
} from '../../utils';


function lazyAdminSection(importSection, exportName) {
  const Section = lazyWithRetry(() => importSection().then(module => ({ default: module[exportName] })));
  return function AdminSection(props) {
    return <Suspense fallback={<div className="admin-section-loader" role="status">Cargando sección…</div>}>
      <Section {...props} />
    </Suspense>;
  };
}

const ManagedEntitiesEditor = lazyAdminSection(() => import('./ManagedEntitiesEditor'), 'ManagedEntitiesEditor');
const CouponManagerPanel = lazyAdminSection(() => import('./CouponManagerPanel'), 'CouponManagerPanel');
const ProductCatalogPanel = lazyAdminSection(() => import('./ProductCatalogPanel'), 'ProductCatalogPanel');
const OfferManagerPanel = lazyAdminSection(() => import('./OfferManagerPanel'), 'OfferManagerPanel');
const ProductEditorPanel = lazyAdminSection(() => import('./ProductEditorPanel'), 'ProductEditorPanel');
const BankAccountsPanel = lazyAdminSection(() => import('./BankAccountsPanel'), 'BankAccountsPanel');
const CatalogImportPanel = lazyAdminSection(() => import('./CatalogImportPanel'), 'CatalogImportPanel');
const SeoSettingsPanel = lazyAdminSection(() => import('./SeoSettingsPanel'), 'SeoSettingsPanel');

function getOrderAgeMinutes(createdAt) {
  const createdMs = new Date(createdAt || "").getTime();
  if (!Number.isFinite(createdMs)) return 0;
  return Math.max(0, Math.round((Date.now() - createdMs) / 60000));
}

function formatOrderAge(minutes = 0) {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours > 0 ? `${days}d ${remHours}h` : `${days}d`;
}

function getOrderSlaMeta(order = {}) {
  const status = normalizeOrderStatusForOrder(order.status, order.deliveryType);
  const ageMinutes = getOrderAgeMinutes(order.createdAt);
  const formattedAge = formatOrderAge(ageMinutes);

  if (status === "Pendiente") {
    if (ageMinutes >= 90) return { tone: "danger", label: "SLA crítico", ageMinutes, formattedAge };
    if (ageMinutes >= 30) return { tone: "warning", label: "SLA en riesgo", ageMinutes, formattedAge };
    return { tone: "success", label: "SLA saludable", ageMinutes, formattedAge };
  }
  if (status === "Confirmado" || status === "Preparando") {
    if (ageMinutes >= 24 * 60) return { tone: "danger", label: "Retrasado", ageMinutes, formattedAge };
    return { tone: "warning", label: "En tiempo esperado", ageMinutes, formattedAge };
  }
  return { tone: "neutral", label: "SLA inactivo", ageMinutes, formattedAge };
}

function getCurrentImageForProduct(product, selectedColor) {
  return getImagesForColor(product, selectedColor)[0] || FALLBACK_IMAGE;
}

function loadInventoryMovements() {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem("adriego_admin_inventory_movements_v1") || "[]");
    return Array.isArray(parsed) ? parsed.slice(0, 50) : [];
  } catch {
    return [];
  }
}

function PromotionTabs({ activeTab, onChange }) {
  return (
    <nav className="admin-promotion-tabs" aria-label="Secciones de promociones">
      <button className={activeTab === "ofertas" ? "active" : ""} type="button" onClick={() => onChange("ofertas")}>Ofertas</button>
      <button className={activeTab === "cupones" ? "active" : ""} type="button" onClick={() => onChange("cupones")}>Cupones</button>
    </nav>
  );
}


export function AdminPanelModal({
  open,
  onClose,
  adminTab,
  setAdminTab,
  editorMessage,
  editorError,
  realtimeSyncStatus,
  retryRealtimeSync,
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
  onImportCatalog,
  onCreatePhotoDraft,
  onAdjustInventory,
  physicalStockEvents = [],
  offersSaving,
  adminCatalogProducts,
  products,
  startEditingProduct,
  duplicateProduct,
  handleDeleteProduct,
  bulkDeleteCatalogProducts,
  bulkSetCatalogFeatured,
  bulkSetCatalogVisibility,
  toggleProductPublicVisibility,
  toggleProductFeatured,
  productForm,
  productDraftRecovery,
  productDraftSavedAt,
  productDraftSaveError,
  hasUnsavedProductChanges,
  restoreProductDraft,
  discardProductDraft,
  resetEditor,
  handleProductFieldChange,
  setContactDraft,
  contactDraft,
  saveContactConfiguration,
  contactSaveBusy,
  bankQrUploadBusy,
  contactSyncFeedback,
  addColorVariant,
  handleColorFieldChange,
  removeColorVariant,
  handleColorFilesUpload,
  onMigrateLegacyImages,
  onMigrateAllLegacyImages,
  catalogImageUploadStateByColor,
  cancelCatalogImageUpload,
  addImageField,
  handleColorImageChange,
  removeImageField,
  saveProduct,
  setStoreDraft,
  storeDraft,
  storeSettings,
  onSaveBrandSeo,
  maintenanceEnabled,
  maintenanceSaveBusy,
  onSaveMaintenance,
  handleStoreSlideImageUpload,
  handleBankImageUpload,
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
  bulkUpdateOrderStatus,
  bulkDeleteOrders,
  updateOrderGuide,
  updateOrderCourier,
  updateOrderInternalNote,
  orderPatchStateById,
  retryOrderPatch,
  updateOrderPaymentProof,
  clearOrderPaymentProof,
  handleOrderProofUpload,
  deleteOrder,
  deletingOrderIds = [],
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
  addSizeToAllColors,
  removeSizeFromAllColors,
  handleSizeRowChange,
  removeSizeRow,
  productTypeRecords,
  filterTagRecords,
  handleManagedProductTypeDraftChange,
  saveManagedProductType,
  deleteManagedProductType,
  toggleManagedProductTypeActive,
  bulkSetManagedProductTypesActive,
  bulkDeleteManagedProductTypes,
  handleManagedFilterTagDraftChange,
  saveManagedFilterTag,
  deleteManagedFilterTag,
  toggleManagedFilterTagActive,
  bulkSetManagedFilterTagsActive,
  bulkDeleteManagedFilterTags,
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
  requestDestructiveConfirmation,
}) {
  useBodyScrollLock(open !== false);
  const [catalogPhotoFiles, setCatalogPhotoFiles] = useState([]);
  const [offerDraftById, setOfferDraftById] = useState({});
  const [offerDirtyById, setOfferDirtyById] = useState({});
  const [editingUserId, setEditingUserId] = useState("");
  const [expandedUserId, setExpandedUserId] = useState("");
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
  const [selectedInventoryProductIds, setSelectedInventoryProductIds] = useState([]);
  const [inventoryBulkBusy, setInventoryBulkBusy] = useState(false);
  const [selectedOrderIds, setSelectedOrderIds] = useState([]);
  const [orderBulkStatus, setOrderBulkStatus] = useState("Preparando");
  const [orderBulkBusy, setOrderBulkBusy] = useState(false);
  const orderBulkActionRef = useRef(false);
  const [orderBulkAction, setOrderBulkAction] = useState("");
  const [orderBulkFeedback, setOrderBulkFeedback] = useState(null);
  const [expandedOrderId, setExpandedOrderId] = useState(null);
  const [catalogQuickView, setCatalogQuickView] = useState("all");
  const [showOrderFilters, setShowOrderFilters] = useState(false);
  const [orderQuickView, setOrderQuickView] = useState("pending");
  const [proofPreview, setProofPreview] = useState(null);
  const [inventoryProductId, setInventoryProductId] = useState("");
  const [inventoryVariantKey, setInventoryVariantKey] = useState("");
  const [inventoryDelta, setInventoryDelta] = useState("");
  const [inventoryReason, setInventoryReason] = useState("");
  const [inventoryFeedback, setInventoryFeedback] = useState(null);
  const [inventoryBusy, setInventoryBusy] = useState(false);
  const [inventoryMovements, setInventoryMovements] = useState(loadInventoryMovements);
  const visibleInventoryMovements = useMemo(() => {
    const byId = new Map();
    [...inventoryMovements, ...physicalStockEvents].forEach((movement) => {
      if (movement?.id && !byId.has(String(movement.id))) byId.set(String(movement.id), movement);
    });
    return [...byId.values()].sort((left, right) => new Date(right.createdAt || 0) - new Date(left.createdAt || 0)).slice(0, 20);
  }, [inventoryMovements, physicalStockEvents]);
  const inventoryProduct = useMemo(
    () => products.find((product) => String(product.id) === String(inventoryProductId)) || null,
    [inventoryProductId, products],
  );
  const matchesOrderView = (order, view) => {
    const status = normalizeOrderStatusForOrder(order.status, order.deliveryType);
    if (view === "pending") return status === "Pendiente";
    if (view === "risk") return ["warning", "danger"].includes(getOrderSlaMeta(order).tone);
    if (view === "preparing") return ["Confirmado", "Preparando"].includes(status);
    if (view === "sent") return status === "Enviado";
    if (view === "pickup") return order.deliveryType === "pickup";
    return true;
  };
  const operationalOrderHistory = useMemo(
    () => filteredOrderHistory.filter((order) => matchesOrderView(order, orderQuickView)),
    [filteredOrderHistory, orderQuickView],
  );
  const selectedInventorySet = useMemo(() => new Set(selectedInventoryProductIds.map(String)), [selectedInventoryProductIds]);
  const selectedOrderSet = useMemo(() => new Set(selectedOrderIds.map(String)), [selectedOrderIds]);
  const operationalOrderIds = useMemo(() => operationalOrderHistory.map((order) => String(order.id)), [operationalOrderHistory]);

  const toggleOrderExpand = (orderId) => {
    setExpandedOrderId((current) => (String(current) === String(orderId) ? null : orderId));
  };

  useEffect(() => {
    const existingIds = new Set(products.map((product) => String(product.id)));
    setSelectedInventoryProductIds((previous) => pruneSelection(previous, existingIds));
  }, [products]);

  useEffect(() => {
    const visibleIds = new Set(operationalOrderIds);
    setSelectedOrderIds((previous) => pruneSelection(previous, visibleIds));
  }, [operationalOrderIds]);

  const toggleInventorySelection = (productId) => {
    const id = String(productId);
    setSelectedInventoryProductIds((previous) => previous.includes(id) ? previous.filter((item) => item !== id) : [...previous, id]);
  };

  const toggleAllInventoryProducts = () => {
    const ids = products.map((product) => String(product.id));
    setSelectedInventoryProductIds(ids.every((id) => selectedInventorySet.has(id)) ? [] : ids);
  };

  const runInventoryBulkAction = async (runner) => {
    if (!selectedInventorySet.size || inventoryBulkBusy) return;
    setInventoryBulkBusy(true);
    try {
      const result = await runner([...selectedInventorySet]);
      if (result?.ok) setSelectedInventoryProductIds([]);
    } finally {
      setInventoryBulkBusy(false);
    }
  };

  const toggleOrderSelection = (orderId) => {
    if (orderBulkBusy) return;
    const id = String(orderId);
    setOrderBulkFeedback(null);
    if (!selectedOrderSet.has(id) && selectedOrderSet.size >= 25) {
      setOrderBulkFeedback({ tone: "error", message: "Puedes procesar hasta 25 pedidos por lote." });
      return;
    }
    setSelectedOrderIds((previous) => previous.includes(id) ? previous.filter((item) => item !== id) : [...previous, id]);
  };

  const toggleAllVisibleOrders = () => {
    if (orderBulkBusy) return;
    const limitedIds = operationalOrderIds.slice(0, 25);
    const allSelected = limitedIds.length > 0 && limitedIds.every((id) => selectedOrderSet.has(id));
    setSelectedOrderIds(allSelected ? [] : limitedIds);
    setOrderBulkFeedback(operationalOrderIds.length > 25 && !allSelected
      ? { tone: "warning", message: "Seleccionamos los primeros 25 pedidos visibles para proteger la operación." }
      : null);
  };

  const applyBulkOrderStatus = async () => {
    if (!selectedOrderSet.size || orderBulkActionRef.current || deletingOrderIds.length) return;
    const ids = [...selectedOrderSet];
    orderBulkActionRef.current = true;
    setOrderBulkBusy(true);
    setOrderBulkAction("status");
    setOrderBulkFeedback(null);
    try {
      if (orderBulkStatus === "Cancelado") {
        const confirmed = await requestDestructiveConfirmation({
          title: `¿Cancelar ${ids.length} pedido${ids.length === 1 ? "" : "s"}?`,
          description: "El stock reservado puede reintegrarse. Revisa los pedidos seleccionados antes de continuar.",
        });
        if (!confirmed) return;
      }
      const result = await bulkUpdateOrderStatus(ids, orderBulkStatus);
      if (result?.ok) {
        setSelectedOrderIds([]);
        setOrderBulkFeedback({ tone: "success", message: `${result.updated} pedido(s) actualizados.` });
      } else {
        setOrderBulkFeedback({ tone: "error", message: result?.message || "No pudimos completar la acción masiva." });
      }
    } catch {
      setOrderBulkFeedback({ tone: "error", message: "La conexión falló. Los pedidos siguen seleccionados para que puedas reintentar." });
    } finally {
      orderBulkActionRef.current = false;
      setOrderBulkBusy(false);
      setOrderBulkAction("");
    }
  };

  const deleteSelectedOrders = async () => {
    if (!selectedOrderSet.size || orderBulkActionRef.current || deletingOrderIds.length) return;
    const ids = [...selectedOrderSet];
    orderBulkActionRef.current = true;
    setOrderBulkBusy(true);
    setOrderBulkAction("delete");
    setOrderBulkFeedback(null);
    try {
      const result = await bulkDeleteOrders(ids);
      if (result?.cancelled) return;
      if (result?.ok) {
        setSelectedOrderIds((previous) => previous.filter((id) => !ids.includes(id)));
        setOrderBulkFeedback({ tone: result.warning ? "warning" : "success", message: [result.message, result.warning].filter(Boolean).join(" ") });
      } else {
        setOrderBulkFeedback({ tone: "error", message: result?.message || "No pudimos eliminar los pedidos. La selección se conserva para reintentar." });
      }
    } catch {
      setOrderBulkFeedback({ tone: "error", message: "La conexión falló. Los pedidos siguen seleccionados para que puedas reintentar." });
    } finally {
      orderBulkActionRef.current = false;
      setOrderBulkBusy(false);
      setOrderBulkAction("");
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem("adriego_admin_inventory_movements_v1", JSON.stringify(inventoryMovements.slice(0, 50)));
    } catch {
      // The catalog adjustment is still saved remotely; only this local audit view is optional.
    }
  }, [inventoryMovements]);

  const submitInventoryMovement = async (event) => {
    event.preventDefault();
    if (inventoryBusy) return;
    let variant = [];
    try { variant = JSON.parse(inventoryVariantKey); } catch { variant = []; }
    setInventoryBusy(true);
    setInventoryFeedback(null);
    try {
      const result = await onAdjustInventory({
        productId: inventoryProductId,
        color: variant[0],
        size: variant[1],
        delta: Number(inventoryDelta),
        reason: inventoryReason,
      });
      if (!result?.ok) {
        setInventoryFeedback({ tone: "error", message: result?.message || "No se pudo guardar el movimiento." });
        return;
      }
      setInventoryMovements((current) => [result.movement, ...current].slice(0, 50));
      setInventoryDelta("");
      setInventoryReason("");
      setInventoryFeedback({ tone: "success", message: "Movimiento guardado y stock sincronizado." });
    } catch {
      setInventoryFeedback({ tone: "error", message: "La conexión falló. No se cambió el stock; puedes reintentar." });
    } finally {
      setInventoryBusy(false);
    }
  };

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

  const tabGroups = [
    {
      label: "Hoy",
      tabs: [
        { id: "resumen", label: "Resumen", description: "Prioridades, alertas y actividad de la tienda.", icon: CheckCircle2 },
      ],
    },
    {
      label: "Vender",
      tabs: [
        { id: "catalogo", label: "Catálogo", description: "Busca, filtra y administra todos los productos.", icon: Package },
        { id: "producto", label: productForm.id ? "Editar producto" : "Nuevo producto", description: "Información, variantes, fotografías y publicación.", icon: Plus },
        { id: "importar", label: "Importar", description: "Crea productos desde fotos o valida un catálogo CSV antes de guardarlo.", icon: Upload },
        { id: "inventario", label: "Inventario", description: "Controla existencias y registra cada movimiento.", icon: Package, badge: adminLowStockCount + adminOutOfStockCount },
        { id: "ofertas", label: "Ofertas", description: "Configura precios promocionales y cambios pendientes.", icon: Star },
        { id: "cupones", label: "Cupones", description: "Crea reglas, vigencias y simulaciones de descuento.", icon: Tag },
      ],
    },
    {
      label: "Clientes",
      tabs: [
        { id: "pedidos", label: "Pedidos", description: "Prioriza, prepara y da seguimiento a las órdenes.", icon: Truck, badge: adminPendingOrders },
        { id: "usuarios", label: "Clientes", description: "Consulta cuentas y datos necesarios para atender pedidos.", icon: UserRound },
      ],
    },
    {
      label: "Tienda",
      tabs: [
        { id: "taxonomias", label: "Tipos y tags", description: "Organiza los datos maestros usados por el catálogo.", icon: Tags },
        { id: "portada", label: "Portada y Envíos", description: "Edita la presentación, entrega y retiro de la tienda.", icon: Image },
        { id: "seo", label: "Identidad y buscadores", description: "Nombre de marca, resultado de búsqueda e imágenes al compartir.", icon: Search },
        { id: "cuentas", label: "Cuentas bancarias", description: "Administra las cuentas visibles al confirmar pedidos.", icon: CreditCard },
        { id: "contacto", label: "Contacto", description: "Actualiza WhatsApp, ubicación y canales de atención.", icon: MapPin },
      ],
    },
    {
      label: "Sistema",
      tabs: [
        { id: "seguridad", label: "Seguridad", description: "Revisa actividad, límites y cuentas administrativas.", icon: ShieldCheck },
      ],
    },
  ];

  const normalizedAdminUsersQuery = normalizeSearchText(adminUsersSearch);
  const visibleAdminUsers = useMemo(() => {
    if (!normalizedAdminUsersQuery) return adminUsers;
    return adminUsers.filter((user) => {
      const searchText = normalizeSearchText([
        user.name,
        user.lastName,
        user.email,
        user.username,
        user.phone,
      ].join(" "));
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
  const startEditingUser = (user) => {
    const safeUser = user || {};
    const userId = String(safeUser.id || "");
    setExpandedUserId(userId);
    setEditingUserId(userId);
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
    try {
      const result = await saveAdminUser({
        userId: editingUserId,
        ...adminUserDraft,
      });
      if (result?.ok) cancelEditingUser();
    } finally {
      setAdminUserSaveBusy(false);
    }
  };

  const deleteUserFromAdmin = async (user) => {
    const userId = String(user?.id || "");
    if (!userId || adminUserDeleteBusyId) return;
    const displayName = sanitizeLine([user?.name, user?.lastName].filter(Boolean).join(" ")) || user?.email || "este usuario";
    const confirmed = await requestDestructiveConfirmation({
      title: `¿Eliminar permanentemente a ${displayName}?`,
      description: "Perderá el acceso a su cuenta y su historial. Esta acción no se puede deshacer.",
    });
    if (!confirmed) return;
    setAdminUserDeleteBusyId(userId);
    try {
      const result = await removeAdminUser(userId);
      if (!result?.ok) return;
      if (editingUserId === userId) cancelEditingUser();
      if (expandedUserId === userId) setExpandedUserId("");
    } finally {
      setAdminUserDeleteBusyId("");
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

  const toggleSelectAllVisibleCatalogProducts = (requestedIds = visibleCatalogProductIds) => {
    const targetIds = requestedIds.map((id) => String(id)).filter(Boolean);
    if (!targetIds.length) return;
    setSelectedCatalogProductIds((previous) => {
      const set = new Set(previous.map((entry) => String(entry)));
      const allTargetsSelected = targetIds.every((id) => set.has(id));
      if (allTargetsSelected) {
        targetIds.forEach((id) => set.delete(id));
      } else {
        targetIds.forEach((id) => set.add(id));
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
    setSelectedCatalogProductIds((previous) => pruneSelection(previous, visibleCatalogProductIds));
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
    try {
      const result = await onSaveOffers(payload);
      if (result?.ok) {
        setOfferDraftById({});
        setOfferDirtyById({});
      }
    } catch {
      // Keep every pending draft so the administrator can retry without re-entering values.
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
  const activeOrderFilterCount = [
    orderStatusFilter !== "all",
    orderDeliveryFilter !== "all",
    orderDateFilter !== "all",
    Boolean(orderCustomerFilter.trim()),
  ].filter(Boolean).length;
  const activeTabMeta = tabGroups.flatMap((group) => group.tabs).find((tab) => tab.id === adminTab)
    || tabGroups[0].tabs[0];

  return (
    <>
      <main className="admin-workspace-root" aria-label="Panel de administración">
        <a className="admin-skip-link" href="#admin-main-content">Saltar al contenido</a>
        <div className="admin-modal-shell">
          <div className="admin-sidebar-nav">
            <div className="admin-sidebar-heading">
              <h3>Adriego Admin</h3>
              <p>Tu centro de operación.</p>
            </div>
            <nav className="admin-nav-groups" aria-label="Secciones administrativas">
              {tabGroups.map((group) => (
                <div className="admin-nav-group" key={group.label}>
                  <p className="admin-nav-group-label">{group.label}</p>
                  <div className="admin-nav-group-items">
                    {group.tabs.map((tab) => (
                        <button type="button"
                          key={tab.id}
                          className={`admin-tab-btn ${adminTab === tab.id ? "active" : ""}`}
                          onClick={() => setAdminTab(tab.id)}
                          aria-current={adminTab === tab.id ? "page" : undefined}
                        >
                          {React.createElement(tab.icon, { size: 16, "aria-hidden": true })}
                          <span>{tab.label}</span>
                          {Number(tab.badge) > 0 && <em aria-label={`${tab.badge} pendientes`}>{Math.min(tab.badge, 99)}</em>}
                        </button>
                    ))}
                  </div>
                </div>
              ))}
            </nav>
            <button type="button" className="btn btn-outline admin-panel-close-btn" onClick={(e) => { e.preventDefault(); onClose?.(); }}><ExternalLink size={16} />Volver a la tienda</button>
          </div>

          <div className="admin-modal-content" id="admin-main-content" tabIndex="-1">
            <header className="admin-workspace-topbar">
              <div>
                <strong>{activeTabMeta.label}</strong>
                <span>{activeTabMeta.description}</span>
              </div>
              <div className="admin-topbar-actions">
                <span
                  className={`admin-sync-status is-${realtimeSyncStatus?.state || "checking"}`}
                  role="status"
                  title={realtimeSyncStatus?.message || "Estado de sincronización"}
                >
                  <i aria-hidden="true" />
                  {realtimeSyncStatus?.state === "synced"
                    ? "Sincronizado"
                    : realtimeSyncStatus?.state === "offline"
                      ? "Sin conexión"
                      : realtimeSyncStatus?.state === "deferred"
                        ? "Cambios pendientes"
                      : realtimeSyncStatus?.state === "error"
                        ? "Error de sincronización"
                        : "Comprobando…"}
                </span>
                {(realtimeSyncStatus?.state === "offline" || realtimeSyncStatus?.state === "error") && (
                  <button type="button" className="admin-sync-retry" onClick={retryRealtimeSync}>
                    <RefreshCw size={13} /> Reintentar
                  </button>
                )}
                <button type="button" className="btn btn-outline" onClick={(e) => { e.preventDefault(); onClose?.(); }}><ExternalLink size={16} />Ver tienda</button>
              </div>
            </header>
            {(editorMessage || editorError) && (
              <div aria-live="polite" aria-atomic="true">
                {editorMessage && <div className="status-message status-success">{editorMessage}</div>}
                {editorError && <div className="status-message status-error" style={{ marginTop: editorMessage ? 10 : 0 }}>{editorError}</div>}
              </div>
            )}

            {adminTab === "resumen" && (
              <div className="admin-tab-panel">
                <div className="card admin-general-card">
                  <AdminSectionHeader
                    title="Resumen"
                    description="Inventario, ventas, pedidos y seguridad en una sola vista."
                    actions={(
                      <>
                      <button type="button" className="btn btn-soft" onClick={() => refreshAdminUsers({ force: true, preferCache: false })} disabled={adminUsersBusy}>
                        <RotateCcw size={16} />
                        {adminUsersBusy ? "Usuarios…" : "Usuarios"}
                      </button>
                      <button type="button" className="btn btn-soft" onClick={() => refreshSecurityMetrics({ force: true, preferCache: false })} disabled={securityMetricsBusy}>
                        <RotateCcw size={16} />
                        {securityMetricsBusy ? "Seguridad…" : "Seguridad"}
                      </button>
                      </>
                    )}
                  />

                  <div className="admin-kpi-grid" style={{ marginTop: 18 }}>
                    <div
                      className="admin-kpi-card is-interactive"
                      role="button"
                      tabIndex={0}
                      onClick={() => { setAdminCatalogQuery(""); setCatalogQuickView("all"); setAdminTab("catalogo"); }}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setAdminCatalogQuery(""); setCatalogQuickView("all"); setAdminTab("catalogo"); } }}
                    >
                      <p className="admin-kpi-title">Productos</p>
                      <strong className="admin-kpi-value">{adminProductCount}</strong>
                      <div className="admin-kpi-actions-row">
                        <button
                          type="button"
                          className="admin-kpi-pill is-danger"
                          onClick={(e) => {
                            e.stopPropagation();
                            setAdminCatalogQuery("");
                            setCatalogQuickView("out");
                            setAdminTab("catalogo");
                          }}
                          title="Filtrar productos sin stock en el catálogo"
                        >
                          {adminOutOfStockCount} sin stock
                        </button>
                        <button
                          type="button"
                          className="admin-kpi-pill is-warning"
                          onClick={(e) => {
                            e.stopPropagation();
                            setAdminCatalogQuery("");
                            setCatalogQuickView("low");
                            setAdminTab("catalogo");
                          }}
                          title="Filtrar productos con stock bajo en el catálogo"
                        >
                          {adminLowStockCount} stock bajo
                        </button>
                      </div>
                    </div>

                    <div
                      className="admin-kpi-card is-interactive"
                      role="button"
                      tabIndex={0}
                      onClick={() => { setAdminCatalogQuery(""); setCatalogQuickView("all"); setAdminTab("catalogo"); }}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setAdminCatalogQuery(""); setCatalogQuickView("all"); setAdminTab("catalogo"); } }}
                    >
                      <p className="admin-kpi-title">Cobertura de catálogo</p>
                      <strong className="admin-kpi-value">{adminColorVariantCount}</strong>
                      <p className="admin-kpi-hint">{adminPhotoCount} fotos cargadas · Ver catálogo</p>
                    </div>

                    <div
                      className="admin-kpi-card is-interactive"
                      role="button"
                      tabIndex={0}
                      onClick={() => { setOrderQuickView("pending"); setAdminTab("pedidos"); }}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOrderQuickView("pending"); setAdminTab("pedidos"); } }}
                    >
                      <p className="admin-kpi-title">Pedidos pendientes</p>
                      <strong className="admin-kpi-value">{adminPendingOrders}</strong>
                      <p className="admin-kpi-hint">{adminOrdersToday} pedidos hoy · Ver pendientes</p>
                    </div>

                    <div
                      className="admin-kpi-card is-interactive"
                      role="button"
                      tabIndex={0}
                      onClick={() => setAdminTab("usuarios")}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setAdminTab("usuarios"); } }}
                    >
                      <p className="admin-kpi-title">Usuarios registrados</p>
                      <strong className="admin-kpi-value">{adminRegisteredUsers}</strong>
                      <p className="admin-kpi-hint">Gestionar cuentas de clientes</p>
                    </div>

                    <div
                      className="admin-kpi-card is-interactive"
                      role="button"
                      tabIndex={0}
                      onClick={() => { setOrderQuickView("all"); setAdminTab("pedidos"); }}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOrderQuickView("all"); setAdminTab("pedidos"); } }}
                    >
                      <p className="admin-kpi-title">Ventas acumuladas</p>
                      <strong className="admin-kpi-value" style={{ fontSize: 20 }}>{currency(adminRevenueTotal)}</strong>
                      <p className="admin-kpi-hint">Ticket promedio: {currency(adminAverageOrderTotal)}</p>
                    </div>

                    <div
                      className="admin-kpi-card is-interactive"
                      role="button"
                      tabIndex={0}
                      onClick={() => setAdminTab("seguridad")}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setAdminTab("seguridad"); } }}
                    >
                      <p className="admin-kpi-title">Eventos de seguridad</p>
                      <strong className="admin-kpi-value">{securityTotals.rateLimited + securityTotals.csrfRejected + securityTotals.errors}</strong>
                      <p className="admin-kpi-hint">Ver panel de seguridad</p>
                    </div>

                    <div
                      className="admin-kpi-card is-interactive"
                      role="button"
                      tabIndex={0}
                      onClick={() => setAdminTab("seguridad")}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setAdminTab("seguridad"); } }}
                    >
                      <p className="admin-kpi-title">Última lectura</p>
                      <strong className="admin-kpi-value" style={{ fontSize: 16 }}>{formatAdminTimestamp(securityMetricsUpdatedAt || securityMetrics?.generatedAt)}</strong>
                      <p className="admin-kpi-hint">Monitoreo en tiempo real</p>
                    </div>
                  </div>

                  <div className="admin-quick-actions" style={{ marginTop: 18 }}>
                    <button type="button" className="btn btn-primary" onClick={() => { resetEditor(); setAdminTab("producto"); }}>
                      <Plus size={16} />
                      Nuevo producto
                    </button>
                    <button type="button" className="btn btn-outline" onClick={() => setAdminTab("pedidos")}>
                      <Package size={16} />
                      Revisar pedidos
                    </button>
                    <button type="button" className="btn btn-outline" onClick={() => setAdminTab("usuarios")}>
                      <UserRound size={16} />
                      Gestionar usuarios
                    </button>
                    <button type="button" className="btn btn-outline" onClick={() => setAdminTab("contacto")}>
                      <Navigation size={16} />
                      Editar contacto
                    </button>
                    <button type="button" className="btn btn-outline" onClick={() => setAdminTab("seguridad")}>
                      <ShieldCheck size={16} />
                      Ver seguridad
                    </button>
                  </div>
                </div>
              </div>
            )}

            {adminTab === "usuarios" && (
              <div className="admin-tab-panel">
                <div className="card admin-users-card admin-general-card">
                  <AdminSectionHeader
                    title="Usuarios"
                    description="Busca cuentas y abre sus acciones solo cuando las necesites."
                    meta={<span className="admin-count-label">{visibleAdminUsers.length} visibles</span>}
                    actions={(
                      <>
                      <button type="button" className="btn btn-soft" onClick={() => refreshAdminUsers({ force: true, preferCache: false })} disabled={adminUsersBusy}>
                        <RotateCcw size={16} />
                        {adminUsersBusy ? "Actualizando…" : "Actualizar"}
                      </button>
                      </>
                    )}
                  />

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

                  <div className="admin-list admin-users-list">
                    {visibleAdminUsers.length === 0 ? (
                      <div className="empty-admin-note">{adminUsersBusy ? "Cargando usuarios…" : "No hay usuarios que coincidan con la búsqueda."}</div>
                    ) : visibleAdminUsers.map((user) => {
                      const userId = String(user.id || "");
                      const isEditing = editingUserId === userId;
                      const isExpanded = expandedUserId === userId;
                      const isDeleting = adminUserDeleteBusyId === userId;
                      const isResetting = adminUserResetBusyId === userId;
                      const isCopyingReset = adminUserCopyResetBusyId === userId;
                      const canResetPassword = isValidEmail(user.email || "");
                      const displayName = sanitizeLine([user.name, user.lastName].filter(Boolean).join(" ")) || "Sin nombre";
                      return (
                        <article key={userId || user.email} className={`admin-user-row${isExpanded ? " is-expanded" : ""}${isEditing ? " is-editing" : ""}`}>
                          <button type="button" className="admin-user-summary" aria-expanded={isExpanded} aria-controls={`admin-user-details-${userId}`} onClick={() => {
                            if (!isEditing) setExpandedUserId((current) => current === userId ? "" : userId);
                          }}>
                            <span className="admin-user-avatar" aria-hidden="true">{String((user.name || user.email || "U").trim().charAt(0) || "U").toUpperCase()}</span>
                            <span className="admin-user-summary-copy">
                              <strong>{displayName}</strong>
                              <small>{user.email || "Sin correo"}{user.username ? ` · @${user.username}` : ""}</small>
                            </span>
                            <span className="admin-user-summary-phone">{user.phone || "Sin teléfono"}</span>
                            <ChevronDown className="admin-user-chevron" size={18} aria-hidden="true" />
                          </button>

                          {isExpanded ? (
                            <div className="admin-user-details" id={`admin-user-details-${userId}`}>
                              {!isEditing ? (
                                <div className="admin-user-detail-grid">
                                  <div><span>Teléfono</span><strong>{user.phone || "Sin teléfono"}</strong></div>
                                  <div><span>Dirección de envío</span><strong>{user.shippingAddress || "Sin dirección"}</strong></div>
                                  <div><span>Última actualización</span><strong>{formatAdminTimestamp(user.updatedAt || user.createdAt)}</strong></div>
                                </div>
                              ) : (
                                <div className="settings-grid admin-user-edit-grid">
                                  <input className="input" placeholder="Nombre" value={adminUserDraft.name} onChange={(event) => setAdminUserDraft((previous) => ({ ...previous, name: event.target.value }))} />
                                  <input className="input" placeholder="Apellido" value={adminUserDraft.lastName} onChange={(event) => setAdminUserDraft((previous) => ({ ...previous, lastName: event.target.value }))} />
                                  <input className="input" placeholder="Correo" value={adminUserDraft.email} onChange={(event) => setAdminUserDraft((previous) => ({ ...previous, email: event.target.value }))} />
                                  <input className="input" placeholder="Usuario" value={adminUserDraft.username} onChange={(event) => setAdminUserDraft((previous) => ({ ...previous, username: event.target.value }))} />
                                  <input className="input" placeholder="Teléfono" inputMode="tel" maxLength={10} value={adminUserDraft.phone} onChange={(event) => setAdminUserDraft((previous) => ({ ...previous, phone: event.target.value.replace(/\D/g, "").slice(0, 10) }))} />
                                  <div className="admin-full"><textarea className="textarea" placeholder="Dirección de envío" value={adminUserDraft.shippingAddress} onChange={(event) => setAdminUserDraft((previous) => ({ ...previous, shippingAddress: event.target.value }))} /></div>
                                </div>
                              )}

                              <div className="admin-actions admin-user-actions">
                                {!isEditing ? (
                                  <>
                                    <button type="button" className="btn btn-soft" onClick={() => startEditingUser(user)}><PencilLine size={16} />Editar datos</button>
                                    <details className="admin-row-menu">
                                      <summary className="btn btn-outline">Más acciones<ChevronDown size={14} /></summary>
                                      <div className="admin-row-menu-popover">
                                        <button type="button" className="btn btn-soft" onClick={() => { void sendResetLinkToUser(user); }} disabled={!canResetPassword || isResetting || isCopyingReset} title={canResetPassword ? "Enviar correo de restablecimiento" : "El usuario no tiene un correo válido"}><Mail size={16} />{isResetting ? "Enviando…" : "Enviar restablecimiento"}</button>
                                        <button type="button" className="btn btn-soft" onClick={() => { void copyResetLinkForUser(user); }} disabled={!canResetPassword || isCopyingReset || isResetting} title={canResetPassword ? "Generar y copiar enlace de restablecimiento" : "El usuario no tiene un correo válido"}><Copy size={16} />{isCopyingReset ? "Copiando…" : "Copiar enlace"}</button>
                                        <button type="button" className="btn btn-danger" onClick={() => { void deleteUserFromAdmin(user); }} disabled={isDeleting}><Trash2 size={16} />{isDeleting ? "Eliminando…" : "Eliminar usuario"}</button>
                                      </div>
                                    </details>
                                  </>
                                ) : (
                                  <>
                                    <button type="button" className="btn btn-primary" onClick={() => { void saveEditingUser(); }} disabled={adminUserSaveBusy}><ShieldCheck size={16} />{adminUserSaveBusy ? "Guardando…" : "Guardar cambios"}</button>
                                    <button type="button" className="btn btn-outline" onClick={cancelEditingUser}><X size={16} />Cancelar</button>
                                  </>
                                )}
                              </div>
                            </div>
                          ) : null}
                        </article>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {adminTab === "catalogo" && (
              <div className="admin-tab-panel">
                <ProductCatalogPanel
                  products={adminCatalogProducts}
                  query={adminCatalogQuery}
                  onQueryChange={setAdminCatalogQuery}
                  quickView={catalogQuickView}
                  onQuickViewChange={setCatalogQuickView}
                  selectedSet={selectedCatalogSet}
                  bulkBusy={catalogBulkBusy}
                  getProductImage={getCurrentImageForProduct}
                  onCreate={() => { resetEditor(); setAdminTab("producto"); }}
                  onToggleSelection={toggleCatalogSelection}
                  onToggleAllVisible={toggleSelectAllVisibleCatalogProducts}
                  onClearSelection={clearCatalogSelection}
                  onSetFeatured={(featured) => {
                    void runCatalogBulkAction(
                      (ids) => bulkSetCatalogFeatured(ids, featured),
                      featured
                        ? "Selecciona al menos un producto para destacar."
                        : "Selecciona al menos un producto para quitar destacado.",
                    );
                  }}
                  onDeleteSelected={async () => {
                    const count = selectedCatalogSet.size;
                    const confirmed = await requestDestructiveConfirmation({
                      title: `¿Eliminar ${count} producto${count === 1 ? "" : "s"}?`,
                      description: "Esta acción no se puede deshacer. Los productos se quitarán del catálogo y de los favoritos de los usuarios.",
                    });
                    if (!confirmed) return;
                    void runCatalogBulkAction(
                      (ids) => bulkDeleteCatalogProducts(ids),
                      "Selecciona al menos un producto para eliminar.",
                    );
                  }}
                  onToggleVisibility={toggleProductPublicVisibility}
                  onToggleFeatured={toggleProductFeatured}
                  onEdit={startEditingProduct}
                  onDuplicate={duplicateProduct}
                  onDelete={handleDeleteProduct}
                />
              </div>
            )}

              <div className="admin-tab-panel" hidden={adminTab !== "importar"} style={adminTab !== "importar" ? { display: "none" } : undefined}>
              <CatalogImportPanel
                products={products}
                onImport={onImportCatalog}
                onCreatePhotoDraft={onCreatePhotoDraft}
                photoFiles={catalogPhotoFiles}
                onPhotoFilesChange={setCatalogPhotoFiles}
              />
              </div>
            {adminTab === "inventario" && (
              <div className="admin-tab-panel">
                <section className="admin-workspace admin-inventory-workspace">
                  <AdminSectionHeader title="Inventario" description="Detecta agotados y stock bajo; abre el producto para ajustar sus variantes con seguridad." meta={<span className="admin-count-label">{adminOutOfStockCount + adminLowStockCount} requieren atención</span>} />
                  <div className="inventory-summary-strip">
                    <button type="button" onClick={() => { setAdminCatalogQuery(""); setCatalogQuickView("all"); setAdminTab("catalogo"); }}>
                      <strong>{adminProductCount}</strong><span>Productos</span>
                    </button>
                    <button type="button" className="is-warning" onClick={() => { setAdminCatalogQuery(""); setCatalogQuickView("low"); setAdminTab("catalogo"); }}>
                      <strong>{adminLowStockCount}</strong><span>Stock bajo</span>
                    </button>
                    <button type="button" className="is-danger" onClick={() => { setAdminCatalogQuery(""); setCatalogQuickView("out"); setAdminTab("catalogo"); }}>
                      <strong>{adminOutOfStockCount}</strong><span>Agotados</span>
                    </button>
                  </div>
                  <form className="inventory-adjustment-form" onSubmit={submitInventoryMovement}>
                    <div className="inventory-adjustment-heading"><strong>Registrar movimiento</strong><span>Entrada positiva o salida negativa. Cada cambio se sincroniza por separado.</span></div>
                    <label><span>Producto</span><select className="select" value={inventoryProductId} onChange={(event) => { setInventoryProductId(event.target.value); setInventoryVariantKey(""); }}><option value="">Seleccionar producto</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>
                    <label><span>Variante</span><select className="select" value={inventoryVariantKey} disabled={!inventoryProduct} onChange={(event) => setInventoryVariantKey(event.target.value)}><option value="">Seleccionar variante</option>{(inventoryProduct?.variants || []).map((variant) => <option key={`${variant.color}-${variant.size}`} value={JSON.stringify([variant.color, variant.size])}>{variant.color} / {variant.size} · {variant.stock || 0} disponibles</option>)}</select></label>
                    <label><span>Cantidad</span><input className="input" type="number" step="1" placeholder="Ej. 5 o -2" value={inventoryDelta} onChange={(event) => setInventoryDelta(event.target.value)} /></label>
                    <label className="inventory-reason-field"><span>Motivo</span><input className="input" maxLength={120} placeholder="Ej. Conteo físico o devolución" value={inventoryReason} onChange={(event) => setInventoryReason(event.target.value)} /></label>
                    <button className="btn btn-primary" type="submit" disabled={inventoryBusy}>{inventoryBusy ? "Guardando…" : "Guardar movimiento"}</button>
                    {inventoryFeedback && <div className={`status-message status-${inventoryFeedback.tone}`} role="status" aria-live="polite">{inventoryFeedback.message}</div>}
                  </form>
                  {visibleInventoryMovements.length > 0 && <div className="inventory-movement-log"><strong>Movimientos recientes</strong>{visibleInventoryMovements.slice(0, 12).map((movement) => <div key={movement.id}><span>{new Intl.DateTimeFormat("es-EC", { dateStyle: "short", timeStyle: "short" }).format(new Date(movement.createdAt))}</span><b>{movement.productName} · {movement.color}/{movement.size}</b><em className={movement.delta > 0 ? "is-positive" : "is-negative"}>{movement.delta > 0 ? "+" : ""}{movement.delta}</em><span>{movement.reason}{movement.status === "reverted" ? " · Deshecho" : ""}</span></div>)}</div>}
                  {products.length > 0 && (
                    <div className={`inventory-bulk-bar${selectedInventorySet.size ? " has-selection" : ""}`}>
                      <label className="admin-selection-control">
                        <input type="checkbox" checked={products.every((product) => selectedInventorySet.has(String(product.id)))} onChange={toggleAllInventoryProducts} />
                        <span>{selectedInventorySet.size ? `${selectedInventorySet.size} seleccionados` : "Seleccionar inventario"}</span>
                      </label>
                      {selectedInventorySet.size > 0 && (
                        <div className="inventory-bulk-actions">
                          <button className="btn btn-soft" type="button" disabled={inventoryBulkBusy} onClick={() => runInventoryBulkAction((ids) => bulkSetCatalogVisibility(ids, true))}><Eye size={15} />Publicar</button>
                          <button className="btn btn-outline" type="button" disabled={inventoryBulkBusy} onClick={() => runInventoryBulkAction((ids) => bulkSetCatalogVisibility(ids, false))}><EyeOff size={15} />Ocultar</button>
                          <button className="btn btn-danger" type="button" disabled={inventoryBulkBusy} onClick={async () => {
                            const count = selectedInventorySet.size;
                            const confirmed = await requestDestructiveConfirmation({
                              title: `¿Eliminar ${count} producto${count === 1 ? "" : "s"}?`,
                              description: "Se eliminarán del catálogo y del inventario. Esta acción no se puede deshacer.",
                            });
                            if (confirmed) void runInventoryBulkAction(bulkDeleteCatalogProducts);
                          }}><Trash2 size={15} />Eliminar</button>
                          {inventoryBulkBusy && <span className="bulk-action-progress" role="status" aria-live="polite">Procesando acción...</span>}
                        </div>
                      )}
                    </div>
                  )}
                  <div className="inventory-product-list">
                    {products.map((product) => {
                      const stock = (product.variants || []).reduce((total, variant) => total + Math.max(0, Number(variant.stock) || 0), 0);
                      return <article key={product.id} className={selectedInventorySet.has(String(product.id)) ? "is-selected" : ""}><label className="inventory-row-selector" aria-label={`Seleccionar ${product.name}`}><input type="checkbox" checked={selectedInventorySet.has(String(product.id))} onChange={() => toggleInventorySelection(product.id)} /></label><div><strong>{product.name}</strong><span>{product.sku || "Sin SKU"} · {(product.variants || []).length} variantes</span></div><span className={`inventory-stock${stock === 0 ? " is-danger" : stock <= 5 ? " is-warning" : ""}`}>{stock} unidades</span><button className="btn btn-outline" type="button" onClick={() => startEditingProduct(product)}><PencilLine size={15} />Ajustar</button></article>;
                    })}
                  </div>
                </section>
              </div>
            )}

            {adminTab === "ofertas" && (
              <div className="admin-tab-panel">
                <PromotionTabs activeTab={adminTab} onChange={setAdminTab} />
                <OfferManagerPanel
                  products={adminCatalogProducts}
                  query={adminCatalogQuery}
                  onQueryChange={setAdminCatalogQuery}
                  activeCount={activeOfferCount}
                  pendingCount={offerPendingCount}
                  hasPendingChanges={hasPendingOfferChanges}
                  saving={offersSaving}
                  dirtyById={offerDirtyById}
                  getDraft={getOfferDraftForProduct}
                  getProductImage={getCurrentImageForProduct}
                  onUpdateDraft={updateOfferDraft}
                  onReset={resetOfferDrafts}
                  onSave={() => { void handleSaveOffersDraft(); }}
                  onEditProduct={startEditingProduct}
                />
              </div>
            )}

            {adminTab === "producto" && (
              <div className="admin-layout product-editor-layout">
                <div className="admin-tab-panel" id="admin-editor">
                  <ProductEditorPanel
                    key={productForm.id || "new-product"}
                    form={productForm}
                    draftRecovery={productDraftRecovery}
                    draftSavedAt={productDraftSavedAt}
                    draftSaveError={productDraftSaveError}
                    hasUnsavedChanges={hasUnsavedProductChanges}
                    onRestoreDraft={restoreProductDraft}
                    onDiscardDraft={discardProductDraft}
                    productTypeOptions={productTypeOptions}
                    filterTagOptions={filterTagOptions}
                    customProductTypeInput={customProductTypeInput}
                    setCustomProductTypeInput={setCustomProductTypeInput}
                    customFilterTagInput={customFilterTagInput}
                    setCustomFilterTagInput={setCustomFilterTagInput}
                    onAddProductType={addManagedProductType}
                    onAddFilterTag={addManagedFilterTag}
                    onAppendFilterTag={appendFilterTagToForm}
                    onRemoveFilterTag={removeFilterTagFromForm}
                    onFieldChange={handleProductFieldChange}
                    onAddColor={addColorVariant}
                    onColorFieldChange={handleColorFieldChange}
                    onRemoveColor={removeColorVariant}
                    onColorFilesUpload={handleColorFilesUpload}
                    onMigrateLegacyImages={onMigrateLegacyImages}
                    onMigrateAllLegacyImages={onMigrateAllLegacyImages}
                    imageUploadStateByColor={catalogImageUploadStateByColor}
                    onCancelImageUpload={cancelCatalogImageUpload}
                    onAddImageField={addImageField}
                    onColorImageChange={handleColorImageChange}
                    onRemoveImageField={removeImageField}
                    onAddSize={addSizeRow}
                    onAddSizeToAll={addSizeToAllColors}
                    onRemoveSizeFromAll={removeSizeFromAllColors}
                    onSizeChange={handleSizeRowChange}
                    onRemoveSize={removeSizeRow}
                    onSave={saveProduct}
                    onReset={resetEditor}
                  />
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

            {/* Editor anterior conservado temporalmente como referencia de migración.
              <div className="admin-layout" style={{ gridTemplateColumns: "minmax(0, 1.1fr) minmax(320px, .9fr)" }}>
                <div className="admin-tab-panel" id="admin-editor">
                  <div className="card" style={{ padding: 22 }}>
                    <div className="admin-toolbar">
                      <div>
                        <p className="muted" style={{ textTransform: "uppercase", letterSpacing: ".25em", fontSize: 13 }}>{productForm.id ? "Edicion" : "Alta"}</p>
                        <h4 style={{ margin: "6px 0 0", fontSize: 28 }}>{productForm.id ? "Editar producto" : "Agregar producto"}</h4>
                      </div>
                      {productForm.id && (<button type="button" className="btn btn-outline" onClick={resetEditor}><X size={16} />Cancelar edicion</button>)}
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
                                    {color.images.filter(Boolean).map((image, index) => <img key={`${color.uid}-thumb-${index}`} src={image} alt={`${color.name || "color"} ${index + 1}`} className="mini-thumb" width="64" height="64" loading="lazy" decoding="async" />)}
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
            */}

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
                  onBulkSetActive={bulkSetManagedProductTypesActive}
                  onBulkDelete={bulkDeleteManagedProductTypes}
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
                  onBulkSetActive={bulkSetManagedFilterTagsActive}
                  onBulkDelete={bulkDeleteManagedFilterTags}
                />
              </div>
            )}

            {adminTab === "cupones" && (
              <div className="admin-tab-panel">
                <PromotionTabs activeTab={adminTab} onChange={setAdminTab} />
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
              </div>
            )}

            {adminTab === "cuentas" && (
              <BankAccountsPanel
                contactDraft={contactDraft}
                setContactDraft={setContactDraft}
                saveContactConfiguration={saveContactConfiguration}
                contactSaveBusy={contactSaveBusy}
                bankQrUploadBusy={bankQrUploadBusy}
                contactSyncFeedback={contactSyncFeedback}
                handleBankImageUpload={handleBankImageUpload}
                requestDestructiveConfirmation={requestDestructiveConfirmation}
              />
            )}

            {adminTab === "contacto" && (
              <div className="admin-tab-panel">
                <div className="card admin-general-card">
                  <AdminSectionHeader
                    title="Contacto y redes"
                    description="Actualiza los canales que usarán los clientes para encontrarte y escribirte."
                  />
                  <div className="settings-grid" style={{ marginTop: 18 }}>
                    <label className="entity-field admin-full"><span>Nombre del responsable o razón social</span><input className="input" value={contactDraft.legalBusinessName || ""} maxLength={160} onChange={(event) => setContactDraft((previous) => ({ ...previous, legalBusinessName: event.target.value }))} /><small className="helper-text">Se publica en privacidad para identificar al responsable del tratamiento de datos.</small></label>
                    <label className="entity-field admin-full"><span>Domicilio legal del negocio</span><input className="input" value={contactDraft.legalAddress || ""} maxLength={280} onChange={(event) => setContactDraft((previous) => ({ ...previous, legalAddress: event.target.value }))} /><small className="helper-text">Puede diferir del punto de retiro. Si lo dejas vacío se muestra la dirección del local.</small></label>
                    <div className="admin-full"><input className="input" placeholder="Direccion del local" value={contactDraft.address} onChange={(event) => setContactDraft((previous) => ({ ...previous, address: event.target.value }))} /></div>
                    <input className="input" placeholder="Numero de WhatsApp para pedidos" value={contactDraft.whatsappNumber} onChange={(event) => setContactDraft((previous) => ({ ...previous, whatsappNumber: event.target.value }))} />
                    <input className="input" placeholder="Enlace directo de WhatsApp (opcional)" value={contactDraft.whatsappLink} onChange={(event) => setContactDraft((previous) => ({ ...previous, whatsappLink: event.target.value }))} />
                    <input className="input" placeholder="Telefono de contacto (opcional)" value={contactDraft.phone || ""} onChange={(event) => setContactDraft((previous) => ({ ...previous, phone: event.target.value }))} />
                    <input className="input" placeholder="Correo de contacto (opcional)" value={contactDraft.email || ""} onChange={(event) => setContactDraft((previous) => ({ ...previous, email: event.target.value }))} />
                    <input className="input" placeholder="Google Maps (maps.app.goo.gl/...)" value={contactDraft.mapsLink || ""} onChange={(event) => setContactDraft((previous) => ({ ...previous, mapsLink: event.target.value }))} />
                    <div className="admin-full">
                      <input className="input" placeholder="URL de embed del mapa (Google Maps → Compartir → Incorporar → copiar src)" value={contactDraft.mapsEmbedUrl || ""} onChange={(event) => setContactDraft((previous) => ({ ...previous, mapsEmbedUrl: event.target.value }))} />
                      <small className="muted" style={{ display: "block", marginTop: 4, fontSize: "0.78rem", lineHeight: 1.4 }}>
                        Abre Google Maps → tu ubicación → Compartir → Incorporar un mapa → copia solo la URL del <code>src="..."</code>
                      </small>
                    </div>
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
                      <button type="button" className="btn btn-primary" onClick={saveContactConfiguration} disabled={contactSaveBusy || bankQrUploadBusy} aria-busy={contactSaveBusy}>
                        <ShieldCheck size={16} />
                        {contactSaveBusy ? "Guardando…" : "Guardar contacto"}
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

            {adminTab === "seo" && <SeoSettingsPanel settings={storeSettings} onSave={onSaveBrandSeo} />}
            {adminTab === "portada" && (
              <div className="admin-tab-panel">
                <div className="card admin-general-card">
                  <AdminSectionHeader
                    title="Portada y Tarifas de Envío"
                    description="Configura los costos de envío a domicilio, la meta de envío gratis y la identidad visual de la tienda."
                  />

                  <MaintenanceSettingsPanel
                    settings={storeDraft.maintenanceSettings}
                    onChange={(maintenanceSettings) => setStoreDraft((previous) => ({ ...previous, maintenanceSettings }))}
                    enabled={maintenanceEnabled}
                    busy={maintenanceSaveBusy}
                    onSave={onSaveMaintenance}
                  />

                  {/* SECCIÓN 1: TARIFAS DE ENVÍO */}
                  <div className="admin-full" style={{ marginTop: 18 }}>
                    <div className="card" style={{ padding: "18px", background: "rgba(15, 23, 42, 0.02)", border: "1px solid rgba(15, 23, 42, 0.08)", borderRadius: "14px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
                        <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(15, 23, 42, 0.06)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <Truck size={18} />
                        </div>
                        <div>
                          <h5 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Tarifas de Envío y Despacho</h5>
                          <p className="helper-text" style={{ margin: 0 }}>Define los costos de entrega y el monto para desbloquear Envío Gratis en el carrito.</p>
                        </div>
                      </div>

                      <div className="settings-grid" style={{ marginTop: 16 }}>
                        <label className="admin-live-toggle admin-full" style={{ margin: "2px 0 8px" }}>
                          <input
                            className="checkbox"
                            type="checkbox"
                            checked={storeDraft?.shippingSettings?.shippingEnabled !== false}
                            onChange={(event) => setStoreDraft((previous) => ({
                              ...previous,
                              shippingSettings: {
                                ...(previous?.shippingSettings || {}),
                                shippingEnabled: event.target.checked,
                              },
                            }))}
                          />
                          <span style={{ fontWeight: 600 }}>Cobrar costo de envío a domicilio</span>
                        </label>

                        <label className="entity-field">
                          <span style={{ fontWeight: 500 }}>Ciudad local de despacho</span>
                          <input
                            className="input"
                            placeholder="Ej. Quito"
                            value={storeDraft?.shippingSettings?.localShippingCity || "Quito"}
                            onChange={(event) => setStoreDraft((previous) => ({
                              ...previous,
                              shippingSettings: {
                                ...(previous?.shippingSettings || {}),
                                localShippingCity: event.target.value,
                              },
                            }))}
                          />
                          <small className="helper-text">Los pedidos a esta ciudad pagarán tarifa local.</small>
                        </label>

                        <label className="entity-field">
                          <span style={{ fontWeight: 500 }}>Costo de envío local ($)</span>
                          <input
                            className="input"
                            type="number"
                            step="0.25"
                            min="0"
                            placeholder="3.50"
                            value={storeDraft?.shippingSettings?.localShippingCost ?? 3.5}
                            onChange={(event) => setStoreDraft((previous) => ({
                              ...previous,
                              shippingSettings: {
                                ...(previous?.shippingSettings || {}),
                                localShippingCost: event.target.value,
                              },
                            }))}
                          />
                          <small className="helper-text">Tarifa dentro de tu misma ciudad.</small>
                        </label>

                        <label className="entity-field">
                          <span style={{ fontWeight: 500 }}>Costo de envío nacional ($)</span>
                          <input
                            className="input"
                            type="number"
                            step="0.25"
                            min="0"
                            placeholder="5.50"
                            value={storeDraft?.shippingSettings?.nationalShippingCost ?? 5.5}
                            onChange={(event) => setStoreDraft((previous) => ({
                              ...previous,
                              shippingSettings: {
                                ...(previous?.shippingSettings || {}),
                                nationalShippingCost: event.target.value,
                              },
                            }))}
                          />
                          <small className="helper-text">Tarifa para el resto de ciudades del país.</small>
                        </label>

                        <label className="entity-field">
                          <span style={{ fontWeight: 500 }}>Monto mínimo para Envío Gratis ($)</span>
                          <input
                            className="input"
                            type="number"
                            step="1"
                            min="0"
                            placeholder="50.00"
                            value={storeDraft?.shippingSettings?.freeShippingThreshold ?? 50}
                            onChange={(event) => setStoreDraft((previous) => ({
                              ...previous,
                              shippingSettings: {
                                ...(previous?.shippingSettings || {}),
                                freeShippingThreshold: event.target.value,
                              },
                            }))}
                          />
                          <small className="helper-text">Si el subtotal supera este valor, el envío es $0.</small>
                        </label>
                      </div>
                    </div>
                  </div>

                  {/* SECCIÓN 2: IDENTIDAD Y TEXTOS */}
                  <div className="admin-full" style={{ marginTop: 22 }}>
                    <h5 style={{ margin: "0 0 12px", fontSize: 18, fontWeight: 700 }}>Identidad y Textos de la Tienda</h5>
                  </div>

                  <div className="settings-grid">
                    <input className="input" placeholder="Badge principal del hero" value={storeDraft.heroBadgeText || ""} onChange={(event) => setStoreDraft((previous) => ({ ...previous, heroBadgeText: event.target.value }))} />
                    <input className="input" placeholder="Texto CTA principal" value={storeDraft.primaryCtaText || ""} onChange={(event) => setStoreDraft((previous) => ({ ...previous, primaryCtaText: event.target.value }))} />
                    <input className="input" placeholder="Etiqueta de ofertas (ej: Ofertas)" value={storeDraft.offerLabel || ""} onChange={(event) => setStoreDraft((previous) => ({ ...previous, offerLabel: event.target.value }))} />
                    <input className="input" placeholder="Porcentaje de oferta (ej: 30)" value={storeDraft.offerPercentage ?? ""} onChange={(event) => setStoreDraft((previous) => ({ ...previous, offerPercentage: event.target.value }))} />
                    <div className="admin-full"><input className="input" placeholder="Texto breve de oferta (opcional)" value={storeDraft.offerText || ""} onChange={(event) => setStoreDraft((previous) => ({ ...previous, offerText: event.target.value }))} /></div>
                    <input className="input" placeholder="Titulo del bloque de WhatsApp" value={storeDraft.saleTitle || ""} onChange={(event) => setStoreDraft((previous) => ({ ...previous, saleTitle: event.target.value }))} />
                    <div className="admin-full"><textarea className="textarea" placeholder="Descripcion del bloque de WhatsApp" value={storeDraft.saleDescription || ""} onChange={(event) => setStoreDraft((previous) => ({ ...previous, saleDescription: event.target.value }))} /></div>
                    <input className="input" placeholder="Titulo del footer" value={storeDraft.footerTitle || ""} onChange={(event) => setStoreDraft((previous) => ({ ...previous, footerTitle: event.target.value }))} />
                    <input className="input" placeholder="Texto del footer" value={storeDraft.footerText || ""} onChange={(event) => setStoreDraft((previous) => ({ ...previous, footerText: event.target.value }))} />

                    {/* SECCIÓN 3: SLIDES DEL HERO */}
                    <div className="admin-full">
                      <div className="slides-toolbar" style={{ margin: "14px 0 12px" }}>
                        <h5 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Slides del hero</h5>
                        <button type="button" className="btn btn-soft" onClick={addHeroSlide}><Plus size={16} />Agregar slide</button>
                      </div>
                      <div className="admin-slide-list">
                        {(storeDraft.heroSlides || []).map((slide, index) => (
                          <details key={slide.id} className="admin-slide-editor">
                            <summary>
                              {slide.image
                                ? <img src={slide.image} alt="" width="48" height="44" loading="lazy" decoding="async" />
                                : <span className="admin-slide-placeholder"><ImageIcon size={17} /></span>}
                              <span>
                                <strong>{slide.title || `Slide ${index + 1}`}</strong>
                                <small>{slide.linkedProductId ? "Vinculado a producto" : (slide.targetUrl ? "Vinculado a URL" : "Sin destino configurado")}</small>
                              </span>
                              <ChevronDown size={18} aria-hidden="true" />
                            </summary>
                            <div className="admin-slide-editor-body">
                              <div className="admin-actions">
                                <label className="btn btn-outline admin-file-btn"><Upload size={16} />Subir imagen<input type="file" accept="image/*" onChange={(event) => handleStoreSlideImageUpload(slide.id, event)} /></label>
                                <button type="button" className="btn btn-outline" onClick={() => removeHeroSlide(slide.id)} disabled={(storeDraft.heroSlides || []).length === 1}><Trash2 size={16} />Quitar</button>
                              </div>
                              <input className="input" placeholder="Título del slide" value={slide.title || ""} onChange={(event) => setStoreDraft((previous) => ({ ...previous, heroSlides: (previous.heroSlides || []).map((entry) => entry.id === slide.id ? { ...entry, title: event.target.value } : entry) }))} />
                              <textarea className="textarea" placeholder="Subtítulo del slide" value={slide.subtitle || ""} onChange={(event) => setStoreDraft((previous) => ({ ...previous, heroSlides: (previous.heroSlides || []).map((entry) => entry.id === slide.id ? { ...entry, subtitle: event.target.value } : entry) }))} />
                              <select className="select" value={slide.linkedProductId || ""} onChange={(event) => setStoreDraft((previous) => ({ ...previous, heroSlides: (previous.heroSlides || []).map((entry) => entry.id === slide.id ? { ...entry, linkedProductId: event.target.value } : entry) }))}>
                                <option value="">Sin producto relacionado</option>
                                {products.map((product) => <option key={product.id} value={String(product.id)}>{product.name}</option>)}
                              </select>
                              <input className="input" placeholder="URL externa opcional" value={slide.targetUrl || ""} onChange={(event) => setStoreDraft((previous) => ({ ...previous, heroSlides: (previous.heroSlides || []).map((entry) => entry.id === slide.id ? { ...entry, targetUrl: event.target.value } : entry) }))} />
                              <input className="input" placeholder="URL de imagen" value={slide.image || ""} onChange={(event) => setStoreDraft((previous) => ({ ...previous, heroSlides: (previous.heroSlides || []).map((entry) => entry.id === slide.id ? { ...entry, image: event.target.value } : entry) }))} />
                            </div>
                          </details>
                        ))}
                      </div>
                    </div>

                    <div className="admin-full" style={{ marginTop: 12 }}>
                      <button type="button" className="btn btn-primary" onClick={saveStoreConfiguration}>
                        <ShieldCheck size={16} />Guardar ajustes, tarifas y portada
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {adminTab === "pedidos" && (
              <div className="admin-tab-panel">
                <section className="admin-workspace admin-orders-workspace" aria-labelledby="admin-orders-title">
                  <AdminSectionHeader
                    title="Pedidos"
                    titleId="admin-orders-title"
                    description="Localiza una orden, actualiza su estado y abre el detalle solo cuando lo necesites."
                    actions={(
                      <>
                      <label className="admin-live-toggle">
                        <input
                          className="checkbox"
                          type="checkbox"
                          checked={liveOrdersEnabled}
                          onChange={(event) => setLiveOrdersEnabled(event.target.checked)}
                        />
                        Actualización en vivo
                      </label>
                      <button type="button" className="btn btn-soft" onClick={() => refreshOrdersFromServer({ force: true, preferCache: false, notifyAdminOnNew: false })} disabled={liveOrdersRefreshing}>
                        <RotateCcw size={16} />
                        {liveOrdersRefreshing ? "Actualizando…" : "Actualizar"}
                      </button>
                      </>
                    )}
                  />
                  {orderLiveAlert && (
                    <div className="order-live-alert-card" role="status">
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

                  <div className="admin-quick-views admin-order-quick-views" aria-label="Vistas operativas de pedidos">
                    {[["pending", "Pendientes"], ["risk", "En riesgo"], ["preparing", "Preparando"], ["sent", "Enviados"], ["pickup", "Retiro"], ["all", "Todos"]].map(([value, label]) => (
                      <button key={value} type="button" aria-pressed={orderQuickView === value} className={orderQuickView === value ? "active" : ""} onClick={() => setOrderQuickView(value)}>{label} <span>{filteredOrderHistory.filter((order) => matchesOrderView(order, value)).length}</span></button>
                    ))}
                  </div>

                  <div className="admin-order-tools">
                    <label className="admin-order-search">
                      <Search size={18} aria-hidden="true" />
                      <input
                        className="input"
                        placeholder="Buscar código, cliente, teléfono o producto"
                        value={orderSearch}
                        onChange={(event) => setOrderSearch(event.target.value)}
                      />
                    </label>
                    <button type="button"
                      className={`btn btn-outline admin-filter-toggle${activeOrderFilterCount > 0 ? " has-filters" : ""}`}
                      type="button"
                      onClick={() => setShowOrderFilters((current) => !current)}
                      aria-expanded={showOrderFilters}
                      aria-controls="admin-order-filter-panel"
                    >
                      <SlidersHorizontal size={16} />
                      Filtros
                      {activeOrderFilterCount > 0 && <span>{activeOrderFilterCount}</span>}
                    </button>
                  </div>

                  {showOrderFilters && (
                    <div id="admin-order-filter-panel" className="admin-order-filters">
                      <div className="admin-order-filters-grid">
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
                  )}

                  <div className="admin-order-results-meta">
                    <strong>{operationalOrderHistory.length} {operationalOrderHistory.length === 1 ? "pedido" : "pedidos"}</strong>
                    <span>Actualizado {formatAdminTimestamp(liveOrdersUpdatedAt)}</span>
                  </div>

                  {operationalOrderHistory.length > 0 && (
                    <div className={`order-bulk-bar${selectedOrderSet.size ? " has-selection" : ""}`}>
                      <label className="admin-selection-control">
                        <input type="checkbox" disabled={orderBulkBusy} checked={operationalOrderIds.length > 0 && operationalOrderIds.slice(0, 25).every((id) => selectedOrderSet.has(id))} onChange={toggleAllVisibleOrders} />
                        <span>{selectedOrderSet.size ? `${selectedOrderSet.size} seleccionados` : "Seleccionar visibles"}</span>
                      </label>
                      {selectedOrderSet.size > 0 && (
                        <div className="order-bulk-actions">
                          <select className="select" disabled={orderBulkBusy || deletingOrderIds.length > 0} aria-label="Nuevo estado para los pedidos seleccionados" value={orderBulkStatus} onChange={(event) => setOrderBulkStatus(event.target.value)}>
                            <option value="Confirmado">Confirmar</option>
                            <option value="Preparando">Marcar preparando</option>
                            <option value="Enviado">Enviado / listo para retiro</option>
                            <option value="Entregado">Marcar entregado</option>
                            <option value="Cancelado">Cancelar pedidos</option>
                          </select>
                          <button className="btn btn-primary" type="button" disabled={orderBulkBusy || deletingOrderIds.length > 0} onClick={() => { void applyBulkOrderStatus(); }}>{orderBulkAction === "status" ? "Actualizando…" : "Aplicar estado"}</button>
                          <button className="btn btn-outline" type="button" disabled={orderBulkBusy} onClick={() => setSelectedOrderIds([])}>Limpiar</button>
                          <button className="btn btn-danger order-bulk-delete" type="button" disabled={orderBulkBusy || deletingOrderIds.length > 0} aria-busy={orderBulkAction === "delete"} onClick={() => { void deleteSelectedOrders(); }}><Trash2 size={15} />{orderBulkAction === "delete" ? "Eliminando…" : "Eliminar seleccionados"}</button>
                        </div>
                      )}
                    </div>
                  )}
                  {orderBulkFeedback && <div className={`status-message status-${orderBulkFeedback.tone} order-bulk-feedback`} role="status" aria-live="polite">{orderBulkFeedback.message}</div>}

                  <div className="admin-order-list">
                    {operationalOrderHistory.length === 0 ? (
                      <div className="empty-admin-note">No hay pedidos que coincidan con la búsqueda.</div>
                    ) : operationalOrderHistory.map((order) => {
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
                      const rawGuide = String(order.guideNumber || "").trim();
                      let effectiveCourier = order.courierName || order.courier || "";
                      let effectiveGuide = rawGuide;
                      if (rawGuide.includes(":") && !effectiveCourier) {
                        const parts = rawGuide.split(":");
                        effectiveCourier = parts[0].trim();
                        effectiveGuide = parts.slice(1).join(":").trim();
                      }
                      const isExpanded = expandedOrderId === order.id;
                      const detailsId = `admin-order-${order.id}-details`;
                      const patchState = orderPatchStateById?.[order.id];
                      const nextOrderAction = (() => {
                        if (normalizedOrderStatus === "Pendiente") return { label: "Confirmar pedido", status: "Confirmado" };
                        if (normalizedOrderStatus === "Confirmado") return { label: "Empezar preparación", status: "Preparando" };
                        if (normalizedOrderStatus === "Preparando") {
                          return isPickupOrder
                            ? { label: "Marcar listo para retiro", status: "Listo para retiro" }
                            : { label: "Registrar envío", status: "Enviado" };
                        }
                        if (normalizedOrderStatus === "Listo para retiro" || normalizedOrderStatus === "Enviado") {
                          return { label: "Marcar entregado", status: "Entregado" };
                        }
                        return null;
                      })();
                      return (
                        <article key={order.id} className={`admin-order-row${isExpanded ? " is-expanded" : ""}`}>
                          <div className="admin-order-row-summary">
                            <label className="admin-order-selector" aria-label={`Seleccionar pedido ${order.code}`}>
                              <input type="checkbox" disabled={orderBulkBusy} checked={selectedOrderSet.has(String(order.id))} onChange={() => toggleOrderSelection(order.id)} />
                            </label>
                            <button
                              className="admin-order-disclosure"
                              type="button"
                              onClick={() => toggleOrderExpand(order.id)}
                              aria-expanded={isExpanded}
                              aria-controls={detailsId}
                            >
                              <span className="admin-order-identity">
                                <strong>{order.code}</strong>
                                <span>{order.customerName || "Cliente"}</span>
                              </span>
                              <span className="admin-order-row-meta">
                                {formatOrderDate(order.createdAt)} · {order.itemCount} {order.itemCount === 1 ? "artículo" : "artículos"} · {isDeliveryOrder ? "Domicilio" : "Retiro"}
                              </span>
                              <span className={`admin-order-sla is-${orderSla.tone}`}>{orderSla.label} · {orderSla.formattedAge || `${orderSla.ageMinutes} min`}</span>
                            </button>
                            <div className="admin-order-row-controls">
                              <span className={`order-status-pill ${getOrderStatusMeta(normalizedOrderStatus).tone}`}>{normalizedOrderStatus}</span>
                              <strong className="admin-order-row-total">{currency(order.total ?? order.subtotal)}</strong>
                              <button
                                className="icon-btn admin-order-expand-btn"
                                type="button"
                                onClick={() => toggleOrderExpand(order.id)}
                                aria-expanded={isExpanded}
                                aria-controls={detailsId}
                                aria-label={isExpanded ? `Ocultar detalle de ${order.code}` : `Ver detalle de ${order.code}`}
                              >
                                <ChevronDown size={18} aria-hidden="true" />
                              </button>
                            </div>
                          </div>

                          {isExpanded && (
                            <div id={detailsId} className="admin-order-details">
                              {/* Cabecera del Detalle de la Orden */}
                              <div className="admin-order-detail-toolbar">
                                <div className="admin-order-detail-heading">
                                  <h4>Pedido {order.code}</h4>
                                  <p>{order.customerName || "Cliente"} · {formatOrderDate(order.createdAt)}</p>
                                </div>
                                <div className="admin-order-detail-actions">
                                  {nextOrderAction && (
                                    <button type="button" className="btn btn-primary" onClick={() => updateOrderStatus(order.id, nextOrderAction.status)}>
                                      {nextOrderAction.label}
                                    </button>
                                  )}
                                  <button type="button" className="btn btn-outline" onClick={() => onCopyOrderCode(order.code)}>
                                    <Copy size={14} />Copiar código
                                  </button>
                                  <select className="select admin-order-status-select" aria-label={`Estado del pedido ${order.code}`} value={normalizedOrderStatus} onChange={(event) => updateOrderStatus(order.id, event.target.value)}>
                                    {orderStatusOptions.map((status) => <option key={status} value={status}>{status}</option>)}
                                  </select>
                                  <span className={`badge ${stockReservationState === "released" ? "badge-warning" : "badge-light"}`}>
                                    Stock {stockReservationState === "released" ? "liberado" : "reservado"}
                                  </span>
                                </div>
                              </div>

                              {isCancelledOrder && (
                                <div className={`order-stock-sync-note ${stockReservationState === "released" ? "is-ok" : "is-warning"}`}>
                                  {stockReservationState === "released"
                                    ? "Stock reintegrado correctamente para este pedido cancelado."
                                    : "Pedido cancelado con stock pendiente de reintegro. Revisa inventario."}
                                </div>
                              )}

                              <div className="admin-order-sections-grid">
                                {/* Tarjeta Financiera y Pago */}
                                <section className="admin-order-card admin-order-money-card">
                                  <div className="admin-order-card-header">
                                    <CreditCard size={16} />
                                    <h6>Resumen de Pago</h6>
                                  </div>
                                  <div className="admin-order-finances-list">
                                    <div className="admin-order-finance-row"><span>Subtotal</span><strong>{currency(order.subtotal)}</strong></div>
                                    {order.discountAmount > 0 && <div className="admin-order-finance-row is-discount"><span>Descuento</span><strong>-{currency(order.discountAmount)}</strong></div>}
                                    {order.shippingCost > 0 ? (
                                      <div className="admin-order-finance-row"><span>{order.shippingLabel || "Envío"}</span><strong>+{currency(order.shippingCost)}</strong></div>
                                    ) : isDeliveryOrder ? (
                                      <div className="admin-order-finance-row is-free-shipping"><span>Envío</span><strong>GRATIS</strong></div>
                                    ) : null}
                                    {order.paymentFeeAmount > 0 && <div className="admin-order-finance-row"><span>Comisión tarjeta</span><strong>+{currency(order.paymentFeeAmount)}</strong></div>}
                                    <div className="admin-order-finance-row admin-order-total-row"><span>Total</span><strong>{currency(order.total ?? order.subtotal)}</strong></div>
                                  </div>
                                  <div className="admin-order-payment-meta">
                                    <div className="admin-order-payment-badge">
                                      <span className="muted">Forma de pago:</span>
                                      <strong>{order.paymentMethodLabel || (order.paymentMethod === "card_link" ? "Tarjeta por enlace" : "Transferencia")}</strong>
                                    </div>
                                    {order.paymentBankAccount?.bankName && (
                                      <div className="admin-order-payment-badge">
                                        <span className="muted">Banco:</span>
                                        <strong>{order.paymentBankAccount.bankName}</strong>
                                      </div>
                                    )}
                                    {order.couponCode && (
                                      <div className="admin-order-payment-badge">
                                        <span className="muted">Cupón:</span>
                                        <strong>{order.couponCode}</strong>
                                      </div>
                                    )}
                                  </div>
                                </section>

                                {/* Tarjeta de Destino y Entrega */}
                                <section className="admin-order-card admin-order-shipping-card">
                                  <div className="admin-order-card-header">
                                    <Truck size={16} />
                                    <h6>{isDeliveryOrder ? "Envío a Domicilio" : "Retiro en Local"}</h6>
                                  </div>
                                  {isDeliveryOrder ? (
                                    <div className="admin-order-shipping-content">
                                      <div className="admin-order-shipping-destination">
                                        <span className="admin-order-city-pill">{order.deliveryCity || "Ciudad sin definir"}</span>
                                        {deliveryPhone && (
                                          <a
                                            href={`https://wa.me/593${String(deliveryPhone || "").replace(/\D/g, "").replace(/^0+/, "")}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="btn btn-outline admin-delivery-wa-btn"
                                          >
                                            <MessageCircle size={14} />
                                            <span>WhatsApp</span>
                                          </a>
                                        )}
                                      </div>
                                      <div className="admin-order-address-box">
                                        <p className="admin-order-address-text">{order.deliveryAddress || "Sin dirección registrada"}</p>
                                        {order.deliveryReference && <p className="admin-order-ref-text">Ref: {order.deliveryReference}</p>}
                                      </div>
                                      <div className="admin-order-recipient-grid">
                                        <div><span className="muted">Destinatario</span><strong>{deliveryContactName}</strong></div>
                                        <div><span className="muted">Cédula / RUC</span><strong>{order.deliveryIdNumber || "No registrada"}</strong></div>
                                        <div><span className="muted">Teléfono</span><strong>{deliveryPhone || "Sin teléfono"}</strong></div>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="admin-order-pickup-content">
                                      <div className="admin-order-address-box">
                                        <p className="admin-order-address-text">{order.pickupAddress || "Sin dirección de retiro registrada"}</p>
                                        {order.pickupNote && <p className="admin-order-ref-text">Ref: {order.pickupNote}</p>}
                                      </div>
                                      <div className="pickup-order-panel-actions">
                                        {canMarkPickupReady && <button type="button" className="btn btn-soft" onClick={() => updateOrderStatus(order.id, "Listo para retiro")}>Marcar listo para retiro</button>}
                                        {canConfirmPickup && <button type="button" className="btn btn-primary" onClick={() => updateOrderStatus(order.id, "Entregado")}>Confirmar entrega</button>}
                                        {!canMarkPickupReady && !canConfirmPickup && <span className="badge badge-light">{normalizedOrderStatus}</span>}
                                      </div>
                                    </div>
                                  )}
                                </section>

                                {/* Tarjeta de Logística y Comprobante */}
                                <section className="admin-order-card admin-order-fulfillment-card">
                                  <div className="admin-order-card-header">
                                    <MapPin size={16} />
                                    <h6>Rastreo y Comprobante</h6>
                                  </div>
                                  <div className="admin-order-logistics-grid">
                                    <label className="entity-field">
                                      <span>Courier / Transporte</span>
                                      <input
                                        className="input"
                                        placeholder="Ej. Servientrega, LaarCourier..."
                                        value={effectiveCourier}
                                        onChange={(event) => updateOrderCourier?.(order.id, event.target.value)}
                                      />
                                    </label>
                                    <label className="entity-field">
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span>Guía de rastreo</span>
                                        {effectiveGuide && getCourierTrackingUrl(effectiveCourier, effectiveGuide) && (
                                          <a
                                            href={getCourierTrackingUrl(effectiveCourier, effectiveGuide)}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="admin-inline-track-link"
                                          >
                                            <ExternalLink size={12} />
                                            <span>Rastrear</span>
                                          </a>
                                        )}
                                      </div>
                                      <input
                                        className="input"
                                        placeholder="Número de guía"
                                        value={effectiveGuide}
                                        onChange={(event) => updateOrderGuide(order.id, event.target.value)}
                                      />
                                    </label>
                                  </div>

                                  <div className="admin-order-proof-section">
                                    <div className="admin-order-proof-header">
                                      <span className="muted">Comprobante de pago</span>
                                      <div className="admin-actions">
                                        <label className="btn btn-outline btn-sm admin-file-btn">
                                          <Plus size={14} />{order.paymentProof ? "Cambiar foto" : "Subir comprobante"}
                                          <input type="file" accept="image/*" onChange={(event) => handleOrderProofUpload(order.id, event)} />
                                        </label>
                                        {order.paymentProof && <button type="button" className="icon-btn admin-danger-icon" onClick={() => clearOrderPaymentProof(order.id)} title="Quitar comprobante"><Trash2 size={14} /></button>}
                                      </div>
                                    </div>
                                    {order.paymentProof ? (
                                      <button
                                        type="button"
                                        className="admin-proof-attachment"
                                        onClick={() => setProofPreview({
                                          src: normalizeImageSource(order.paymentProof) || FALLBACK_IMAGE,
                                          alt: `Comprobante ${order.code}`,
                                          title: `Comprobante · ${order.code}`,
                                        })}
                                      >
                                        <img src={normalizeImageSource(order.paymentProof) || FALLBACK_IMAGE} alt="" width="52" height="52" loading="lazy" decoding="async" />
                                        <span><strong>Comprobante adjunto</strong><small><ZoomIn size={13} />Ver en tamaño completo</small></span>
                                      </button>
                                    ) : (
                                      <p className="helper-text" style={{ margin: "6px 0 0" }}>Sin comprobante de transferencia adjunto.</p>
                                    )}
                                    <details className="admin-proof-advanced">
                                      <summary>Opciones avanzadas (URL directa)</summary>
                                      <label className="entity-field">
                                        <span>URL del comprobante</span>
                                        <input className="input" placeholder="https://…" value={order.paymentProof || ""} onChange={(event) => updateOrderPaymentProof(order.id, event.target.value)} />
                                      </label>
                                    </details>
                                  </div>
                                </section>

                                {/* Tarjeta de Nota Interna */}
                                <section className="admin-order-card admin-order-notes-card">
                                  <div className="admin-order-card-header">
                                    <PencilLine size={16} />
                                    <h6>Nota Interna <small style={{ fontWeight: "normal", color: "#888" }}>(solo admin)</small></h6>
                                    {patchState?.status && (
                                      <span className={`admin-note-status is-${patchState.status}`}>
                                        {patchState.status === "pending" && "Guardando..."}
                                        {patchState.status === "saved" && "Guardado"}
                                        {patchState.status === "error" && (
                                          <>
                                            Error al guardar
                                            <button type="button" className="btn btn-outline btn-sm" style={{ marginLeft: 6, padding: "2px 6px", fontSize: 10 }} onClick={() => retryOrderPatch(order.id)}>Reintentar</button>
                                          </>
                                        )}
                                      </span>
                                    )}
                                  </div>
                                  <textarea
                                    className="textarea"
                                    maxLength={600}
                                    value={order.internalNote || ""}
                                    onChange={(event) => updateOrderInternalNote(order.id, event.target.value)}
                                    placeholder="Añade recordatorios, indicaciones de empaque o notas de entrega..."
                                    style={{ minHeight: "72px" }}
                                  />
                                </section>
                              </div>

                              {/* Sección de Productos / Artículos */}
                              <section className="admin-order-items-section">
                                <div className="admin-order-items-heading">
                                  <strong>Prendas en este pedido</strong>
                                  <span>{order.itemCount} {order.itemCount === 1 ? "artículo" : "artículos"}</span>
                                </div>
                                <div className="admin-order-items">
                                  {order.items.map((item) => (
                                    <div key={item.key} className="admin-order-item-row">
                                      <img src={normalizeImageSource(item.image) || FALLBACK_IMAGE} alt="" width="48" height="60" loading="lazy" decoding="async" />
                                      <div className="admin-order-item-info">
                                        <strong>{item.name}</strong>
                                        <span>{item.color} · Talla {item.size} · {item.quantity} {item.quantity === 1 ? "unidad" : "unidades"}</span>
                                      </div>
                                      <div className="admin-order-item-pricing">
                                        <strong>{currency(item.price * item.quantity)}</strong>
                                        {item.quantity > 1 && <small>{currency(item.price)} c/u</small>}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </section>

                              <div className="admin-order-danger-actions">
                                <button
                                  type="button"
                                  className="btn btn-outline admin-danger-icon"
                                  onClick={() => deleteOrder(order.id)}
                                  disabled={orderBulkBusy || deletingOrderIds.includes(order.id)}
                                  aria-busy={deletingOrderIds.includes(order.id)}
                                >
                                  <Trash2 size={15} />{deletingOrderIds.includes(order.id) ? "Eliminando…" : "Eliminar pedido y adjuntos"}
                                </button>
                              </div>
                            </div>
                          )}
                        </article>
                      );
                    })}
                  </div>
                </section>
              </div>
            )}

            {adminTab === "seguridad" && (
              <div className="admin-tab-panel">
                <div className="card admin-general-card">
                  <AdminSectionHeader
                    title="Seguridad"
                    description="Monitorea bloqueos, tráfico y errores para detectar actividad inusual."
                    actions={(
                      <>
                      <button type="button" className="btn btn-soft" onClick={() => refreshSecurityMetrics({ force: true, preferCache: false })} disabled={securityMetricsBusy}>
                        <RotateCcw size={16} />
                        {securityMetricsBusy ? "Actualizando…" : "Actualizar"}
                      </button>
                      <button type="button" className="btn btn-outline" onClick={resetSecurityMetricsData} disabled={securityMetricsResetBusy}>
                        <Trash2 size={16} />
                        {securityMetricsResetBusy ? "Reiniciando…" : "Reiniciar métricas"}
                      </button>
                      </>
                    )}
                  />

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
        </div>
      </main>
    <ImageLightbox
      open={Boolean(proofPreview)}
      src={proofPreview?.src || ""}
      alt={proofPreview?.alt || "Comprobante ampliado"}
      title={proofPreview?.title || "Comprobante"}
      onClose={() => setProofPreview(null)}
    />
    </>
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

export default AdminPanelModal;
