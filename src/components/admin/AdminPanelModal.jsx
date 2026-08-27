import { isValidEmail } from '../../utils';
import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { motion as Motion, AnimatePresence } from 'framer-motion';
import { RotateCcw, Plus, Package, UserRound, Navigation, ShieldCheck, Search, PencilLine, Mail, Copy, Trash2, CheckCircle2, Star, Link, Eye, AlertCircle, AlertTriangle, Play, RefreshCw, Upload, Image as ImageIcon, MapPin, SearchX, Clock, CreditCard, Tag, Tags, X, Image, ChevronDown, SlidersHorizontal, ZoomIn, MessageCircle, ExternalLink, Truck } from 'lucide-react';
import { ShowcaseProductCard } from "../catalog/ShowcaseProductCard";
import { CatalogProductCard } from "../catalog/CatalogProductCard";
import { ProductDraftPreview } from '../products/ProductDraftPreview';
import { ManagedEntitiesEditor } from './ManagedEntitiesEditor';
import { CouponManagerPanel } from './CouponManagerPanel';
import { ProductCatalogPanel } from './ProductCatalogPanel';
import { OfferManagerPanel } from './OfferManagerPanel';
import { ProductEditorPanel } from './ProductEditorPanel';
import { AdminSectionHeader } from './AdminSectionHeader';
import { BankAccountsPanel } from './BankAccountsPanel';
import { ImageLightbox } from '../ui/ImageLightbox';
import { OrderStatusProgress } from '../orders/OrderStatusProgress';
import { normalizeOrderStatusForOrder, formatOrderDate, getOrderStatusOptions } from '../../domain/orders/status';
import { getImagesForColor } from '../../domain/products/variants';
import { useModalA11y } from '../../hooks/useModalA11y';
import {
  ANIMATION, STORAGE_KEYS, PASSWORD_SECURITY, AUTH_FORM_DEFAULTS,
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


function getOrderAgeMinutes(createdAt) {
  const createdMs = new Date(createdAt || "").getTime();
  if (!Number.isFinite(createdMs)) return 0;
  return Math.max(0, Math.round((Date.now() - createdMs) / 60000));
}

function getOrderSlaMeta(order = {}) {
  const status = normalizeOrderStatusForOrder(order.status, order.deliveryType);
  const ageMinutes = getOrderAgeMinutes(order.createdAt);

  if (status === "Pendiente") {
    if (ageMinutes >= 90) return { tone: "danger", label: "SLA crítico", ageMinutes };
    if (ageMinutes >= 30) return { tone: "warning", label: "SLA en riesgo", ageMinutes };
    return { tone: "success", label: "SLA saludable", ageMinutes };
  }
  if (status === "Confirmado" || status === "Preparando") {
    if (ageMinutes >= 24 * 60) return { tone: "danger", label: "Retrasado", ageMinutes };
    return { tone: "warning", label: "En tiempo esperado", ageMinutes };
  }
  return { tone: "neutral", label: "SLA inactivo", ageMinutes };
}

function getCurrentImageForProduct(product, selectedColor) {
  return getImagesForColor(product, selectedColor)[0] || FALLBACK_IMAGE;
}


export function AdminPanelModal({
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
  duplicateProduct,
  handleDeleteProduct,
  bulkDeleteCatalogProducts,
  bulkSetCatalogFeatured,
  toggleProductPublicVisibility,
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
  addImageField,
  handleColorImageChange,
  removeImageField,
  saveProduct,
  setStoreDraft,
  storeDraft,
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
  updateOrderGuide,
  updateOrderCourier,
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
  requestDestructiveConfirmation,
}) {
  const containerRef = useModalA11y(open, onClose);
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
  const [expandedOrderId, setExpandedOrderId] = useState("");
  const [showOrderFilters, setShowOrderFilters] = useState(false);
  const [proofPreview, setProofPreview] = useState(null);

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
      label: "Operación",
      tabs: [
        { id: "resumen", label: "Resumen" },
        { id: "pedidos", label: "Pedidos" },
        { id: "usuarios", label: "Usuarios" },
      ],
    },
    {
      label: "Catálogo",
      tabs: [
        { id: "catalogo", label: "Productos" },
        { id: "producto", label: productForm.id ? "Editar producto" : "Nuevo producto" },
        { id: "ofertas", label: "Ofertas" },
        { id: "taxonomias", label: "Tipos y filtros" },
        { id: "cupones", label: "Cupones" },
      ],
    },
    {
      label: "Tienda",
      tabs: [
        { id: "cuentas", label: "Cuentas bancarias" },
        { id: "contacto", label: "Contacto" },
        { id: "portada", label: "Portada y Envíos" },
      ],
    },
    {
      label: "Sistema",
      tabs: [
        { id: "seguridad", label: "Seguridad" },
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
  const selectedVisibleCatalogCount = useMemo(
    () => visibleCatalogProductIds.filter((id) => selectedCatalogSet.has(id)).length,
    [selectedCatalogSet, visibleCatalogProductIds],
  );
  const allVisibleCatalogSelected = visibleCatalogProductIds.length > 0 && selectedVisibleCatalogCount === visibleCatalogProductIds.length;

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
    const confirmed = await requestDestructiveConfirmation({
      title: `¿Eliminar permanentemente a ${displayName}?`,
      description: "Perderá el acceso a su cuenta y su historial. Esta acción no se puede deshacer.",
    });
    if (!confirmed) return;
    setAdminUserDeleteBusyId(userId);
    await removeAdminUser(userId);
    setAdminUserDeleteBusyId("");
    if (editingUserId === userId) {
      cancelEditingUser();
    }
    if (expandedUserId === userId) setExpandedUserId("");
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
  const activeOrderFilterCount = [
    orderStatusFilter !== "all",
    orderDeliveryFilter !== "all",
    orderDateFilter !== "all",
    Boolean(orderCustomerFilter.trim()),
  ].filter(Boolean).length;

  return (
    <>
    <AnimatePresence>
      <Motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="modal-backdrop" onClick={onClose}>
        <Motion.div
          ref={containerRef}
          role="dialog"
          aria-modal="true"
          aria-label="Panel de administración"
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 18, scale: 0.98 }}
          transition={{ duration: ANIMATION.base }}
          className="admin-modal-shell"
          onClick={(event) => event.stopPropagation()}
        >
          <button type="button" className="icon-btn admin-modal-close-top" onClick={onClose} aria-label="Cerrar panel admin">
            <X size={18} />
          </button>
          <div className="admin-sidebar-nav">
            <div className="admin-sidebar-heading">
              <h3>Administración</h3>
              <p>Acciones de tienda y operación.</p>
            </div>
            <nav className="admin-nav-groups" aria-label="Secciones administrativas">
              {tabGroups.map((group) => (
                <div className="admin-nav-group" key={group.label}>
                  <p className="admin-nav-group-label">{group.label}</p>
                  <div className="admin-nav-group-items">
                    {group.tabs.map((tab) => (
                      <button key={tab.id} className={`admin-tab-btn ${adminTab === tab.id ? "active" : ""}`} onClick={() => setAdminTab(tab.id)}>{tab.label}</button>
                    ))}
                  </div>
                </div>
              ))}
            </nav>
            <button className="btn btn-outline admin-panel-close-btn" onClick={onClose}><X size={16} />Cerrar panel</button>
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
                <div className="card admin-general-card">
                  <AdminSectionHeader
                    title="Resumen"
                    description="Inventario, ventas, pedidos y seguridad en una sola vista."
                    actions={(
                      <>
                      <button className="btn btn-soft" onClick={() => refreshAdminUsers({ force: true, preferCache: false })} disabled={adminUsersBusy}>
                        <RotateCcw size={16} />
                        {adminUsersBusy ? "Usuarios..." : "Usuarios"}
                      </button>
                      <button className="btn btn-soft" onClick={() => refreshSecurityMetrics({ force: true, preferCache: false })} disabled={securityMetricsBusy}>
                        <RotateCcw size={16} />
                        {securityMetricsBusy ? "Seguridad..." : "Seguridad"}
                      </button>
                      </>
                    )}
                  />

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
                <div className="card admin-users-card admin-general-card">
                  <AdminSectionHeader
                    title="Usuarios"
                    description="Busca cuentas y abre sus acciones solo cuando las necesites."
                    meta={<span className="admin-count-label">{visibleAdminUsers.length} visibles</span>}
                    actions={(
                      <>
                      <button className="btn btn-soft" onClick={() => refreshAdminUsers({ force: true, preferCache: false })} disabled={adminUsersBusy}>
                        <RotateCcw size={16} />
                        {adminUsersBusy ? "Actualizando..." : "Actualizar"}
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
                      <div className="empty-admin-note">{adminUsersBusy ? "Cargando usuarios..." : "No hay usuarios que coincidan con la búsqueda."}</div>
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
                                    <button className="btn btn-soft" onClick={() => startEditingUser(user)}><PencilLine size={16} />Editar datos</button>
                                    <details className="admin-row-menu">
                                      <summary className="btn btn-outline">Más acciones<ChevronDown size={14} /></summary>
                                      <div className="admin-row-menu-popover">
                                        <button className="btn btn-soft" onClick={() => { void sendResetLinkToUser(user); }} disabled={!canResetPassword || isResetting || isCopyingReset} title={canResetPassword ? "Enviar correo de restablecimiento" : "El usuario no tiene un correo válido"}><Mail size={16} />{isResetting ? "Enviando..." : "Enviar restablecimiento"}</button>
                                        <button className="btn btn-soft" onClick={() => { void copyResetLinkForUser(user); }} disabled={!canResetPassword || isCopyingReset || isResetting} title={canResetPassword ? "Generar y copiar enlace de restablecimiento" : "El usuario no tiene un correo válido"}><Copy size={16} />{isCopyingReset ? "Copiando..." : "Copiar enlace"}</button>
                                        <button className="btn btn-danger" onClick={() => { void deleteUserFromAdmin(user); }} disabled={isDeleting}><Trash2 size={16} />{isDeleting ? "Eliminando..." : "Eliminar usuario"}</button>
                                      </div>
                                    </details>
                                  </>
                                ) : (
                                  <>
                                    <button className="btn btn-primary" onClick={() => { void saveEditingUser(); }} disabled={adminUserSaveBusy}><ShieldCheck size={16} />{adminUserSaveBusy ? "Guardando..." : "Guardar cambios"}</button>
                                    <button className="btn btn-outline" onClick={cancelEditingUser}><X size={16} />Cancelar</button>
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
                  selectedSet={selectedCatalogSet}
                  allVisibleSelected={allVisibleCatalogSelected}
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
                  onEdit={(product) => { startEditingProduct(product); setAdminTab("producto"); }}
                  onDuplicate={duplicateProduct}
                  onDelete={handleDeleteProduct}
                />
              </div>
            )}

            {adminTab === "ofertas" && (
              <div className="admin-tab-panel">
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
                  onEditProduct={(product) => { startEditingProduct(product); setAdminTab("producto"); }}
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
                    onAddImageField={addImageField}
                    onColorImageChange={handleColorImageChange}
                    onRemoveImageField={removeImageField}
                    onAddSize={addSizeRow}
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
                    <div className="admin-full"><input className="input" placeholder="Direccion del local" value={contactDraft.address} onChange={(event) => setContactDraft((previous) => ({ ...previous, address: event.target.value }))} /></div>
                    <input className="input" placeholder="Numero de WhatsApp para pedidos" value={contactDraft.whatsappNumber} onChange={(event) => setContactDraft((previous) => ({ ...previous, whatsappNumber: event.target.value }))} />
                    <input className="input" placeholder="Enlace directo de WhatsApp (opcional)" value={contactDraft.whatsappLink} onChange={(event) => setContactDraft((previous) => ({ ...previous, whatsappLink: event.target.value }))} />
                    <input className="input" placeholder="Telefono de contacto (opcional)" value={contactDraft.phone || ""} onChange={(event) => setContactDraft((previous) => ({ ...previous, phone: event.target.value }))} />
                    <input className="input" placeholder="Correo de contacto (opcional)" value={contactDraft.email || ""} onChange={(event) => setContactDraft((previous) => ({ ...previous, email: event.target.value }))} />
                    <input className="input" placeholder="Google Maps (maps.app.goo.gl/...)" value={contactDraft.mapsLink || ""} onChange={(event) => setContactDraft((previous) => ({ ...previous, mapsLink: event.target.value }))} />
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
                      <button className="btn btn-primary" onClick={saveContactConfiguration} disabled={contactSaveBusy || bankQrUploadBusy} aria-busy={contactSaveBusy}>
                        <ShieldCheck size={16} />
                        {contactSaveBusy ? "Guardando..." : "Guardar contacto"}
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
                <div className="card admin-general-card">
                  <AdminSectionHeader
                    title="Portada y Tarifas de Envío"
                    description="Configura los costos de envío a domicilio, la meta de envío gratis y la identidad visual de la tienda."
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
                    <input className="input" placeholder="Etiqueta de marca" value={storeDraft.brandLabel || ""} onChange={(event) => setStoreDraft((previous) => ({ ...previous, brandLabel: event.target.value }))} />
                    <input className="input" placeholder="Nombre de marca" value={storeDraft.brandName || ""} onChange={(event) => setStoreDraft((previous) => ({ ...previous, brandName: event.target.value }))} />
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
                        <button className="btn btn-soft" onClick={addHeroSlide}><Plus size={16} />Agregar slide</button>
                      </div>
                      <div className="admin-slide-list">
                        {(storeDraft.heroSlides || []).map((slide, index) => (
                          <details key={slide.id} className="admin-slide-editor">
                            <summary>
                              {slide.image
                                ? <img src={slide.image} alt="" loading="lazy" decoding="async" />
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
                                <button className="btn btn-outline" onClick={() => removeHeroSlide(slide.id)} disabled={(storeDraft.heroSlides || []).length === 1}><Trash2 size={16} />Quitar</button>
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
                      <button className="btn btn-primary" onClick={saveStoreConfiguration}>
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
                      <button className="btn btn-soft" onClick={() => refreshOrdersFromServer({ force: true, preferCache: false, notifyAdminOnNew: false })} disabled={liveOrdersRefreshing}>
                        <RotateCcw size={16} />
                        {liveOrdersRefreshing ? "Actualizando..." : "Actualizar"}
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
                    <button
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
                    <strong>{filteredOrderHistory.length} {filteredOrderHistory.length === 1 ? "pedido" : "pedidos"}</strong>
                    <span>Actualizado {formatAdminTimestamp(liveOrdersUpdatedAt)}</span>
                  </div>

                  <div className="admin-order-list">
                    {filteredOrderHistory.length === 0 ? (
                      <div className="empty-admin-note">No hay pedidos que coincidan con la búsqueda.</div>
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
                      return (
                        <article key={order.id} className={`admin-order-row${isExpanded ? " is-expanded" : ""}`}>
                          <div className="admin-order-row-summary">
                            <button
                              className="admin-order-disclosure"
                              type="button"
                              onClick={() => setExpandedOrderId((current) => (current === order.id ? "" : order.id))}
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
                              <span className={`admin-order-sla is-${orderSla.tone}`}>{orderSla.label} · {orderSla.ageMinutes} min</span>
                            </button>
                            <div className="admin-order-row-controls">
                              <select
                                className="select admin-order-status-select"
                                aria-label={`Estado del pedido ${order.code}`}
                                value={normalizedOrderStatus}
                                onChange={(event) => updateOrderStatus(order.id, event.target.value)}
                              >
                                {orderStatusOptions.map((status) => <option key={status} value={status}>{status}</option>)}
                              </select>
                              <strong className="admin-order-row-total">{currency(order.total || order.subtotal)}</strong>
                              <button
                                className="icon-btn admin-order-expand-btn"
                                type="button"
                                onClick={() => setExpandedOrderId((current) => (current === order.id ? "" : order.id))}
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
                              <div className="admin-order-detail-toolbar">
                                <div className="admin-order-detail-actions">
                                  <button type="button" className="btn btn-outline" onClick={() => onCopyOrderCode(order.code)}>
                                    <Copy size={14} />Copiar código
                                  </button>
                                  <button className="btn btn-outline" onClick={() => onOpenOrderReference(order)}>
                                    <Eye size={15} />Referencia visual
                                  </button>
                                </div>
                                <span className={`badge ${stockReservationState === "released" ? "badge-warning" : "badge-light"}`}>
                                  Stock {stockReservationState === "released" ? "liberado" : "reservado"}
                                </span>
                              </div>

                              <div className="order-money-block">
                                <div><span className="muted">Subtotal</span><strong>{currency(order.subtotal)}</strong></div>
                                {order.discountAmount > 0 && <div><span className="muted">Descuento</span><strong>-{currency(order.discountAmount)}</strong></div>}
                                {order.shippingCost > 0 ? (
                                  <div><span className="muted">{order.shippingLabel || "Costo de envío"}</span><strong>+{currency(order.shippingCost)}</strong></div>
                                ) : isDeliveryOrder ? (
                                  <div><span className="muted">Envío</span><strong style={{ color: "var(--success, #16a34a)" }}>GRATIS</strong></div>
                                ) : null}
                                {order.paymentFeeAmount > 0 && <div><span className="muted">Comisión tarjeta</span><strong>+{currency(order.paymentFeeAmount)}</strong></div>}
                                <div><span className="muted">Total</span><strong>{currency(order.total || order.subtotal)}</strong></div>
                                <div><span className="muted">Forma de pago</span><strong>{order.paymentMethodLabel || (order.paymentMethod === "card_link" ? "Tarjeta por enlace" : "Transferencia")}</strong></div>
                                {order.paymentBankAccount?.bankName && <div><span className="muted">Banco elegido</span><strong>{order.paymentBankAccount.bankName}</strong></div>}
                                {order.couponCode && <div><span className="muted">Cupón</span><strong>{order.couponCode}</strong></div>}
                              </div>

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
                                    <div className="admin-delivery-badge-group">
                                      <span className="badge badge-warning">Envío a domicilio</span>
                                      <strong className="admin-delivery-city-title">{order.deliveryCity || "Ciudad no definida"}</strong>
                                    </div>
                                    {deliveryPhone && (
                                      <a
                                        href={`https://wa.me/593${String(deliveryPhone || "").replace(/\D/g, "").replace(/^0+/, "")}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="btn btn-outline admin-delivery-wa-btn"
                                      >
                                        <MessageCircle size={14} />
                                        <span>WhatsApp Repartidor / Cliente</span>
                                      </a>
                                    )}
                                  </div>
                                  <div className="admin-delivery-destination-box">
                                    <p className="admin-delivery-address-label">Dirección exacta:</p>
                                    <p className="admin-delivery-address">{order.deliveryAddress || "Dirección no registrada"}</p>
                                  </div>
                                  <div className="admin-delivery-grid">
                                    <p><span>Referencia</span><strong>{order.deliveryReference || "Sin referencia"}</strong></p>
                                    <p><span>Destinatario</span><strong>{deliveryContactName}</strong></p>
                                    <p><span>Cédula / RUC</span><strong>{order.deliveryIdNumber || "No registrada"}</strong></p>
                                    <p><span>Teléfono</span><strong>{deliveryPhone || "Sin teléfono"}</strong></p>
                                  </div>
                                </div>
                              ) : (
                                <div className="admin-pickup-summary">
                                  <strong>Retiro en local</strong>
                                  <p>{order.pickupAddress || "Sin dirección de retiro registrada"}</p>
                                  {order.pickupNote && <p className="muted">Referencia: {order.pickupNote}</p>}
                                </div>
                              )}

                              {isPickupOrder && (
                                <div className="pickup-order-panel">
                                  <div>
                                    <p className="pickup-order-panel-title">Preparación para retiro</p>
                                    <p className="pickup-order-panel-text">
                                      {normalizedOrderStatus === "Entregado"
                                        ? "Entrega confirmada al cliente."
                                        : (normalizedOrderStatus === "Listo para retiro"
                                          ? "Pedido listo. Confirma cuando el cliente lo retire."
                                          : "Cuando esté preparado, márcalo como listo para retiro.")}
                                    </p>
                                  </div>
                                  <div className="pickup-order-panel-actions">
                                    {canMarkPickupReady && <button className="btn btn-soft" onClick={() => updateOrderStatus(order.id, "Listo para retiro")}>Marcar listo</button>}
                                    {canConfirmPickup && <button className="btn btn-primary" onClick={() => updateOrderStatus(order.id, "Entregado")}>Confirmar entrega</button>}
                                    {!canMarkPickupReady && !canConfirmPickup && <span className="badge badge-light">{normalizedOrderStatus}</span>}
                                  </div>
                                </div>
                              )}

                              <div className="admin-order-fulfillment-grid">
                                <label className="entity-field">
                                  <span>Courier / Transporte</span>
                                  <input
                                    className="input"
                                    placeholder="Ej. Servientrega, LaarCourier, Cooperativa..."
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
                                        style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', color: 'var(--color-primary)' }}
                                      >
                                        <ExternalLink size={12} />
                                        <span>Rastrear online</span>
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
                                <div className="admin-order-payment-proof">
                                  <label className="entity-field">
                                    <span>Comprobante de pago</span>
                                    <input className="input" placeholder="URL del comprobante" value={order.paymentProof || ""} onChange={(event) => updateOrderPaymentProof(order.id, event.target.value)} />
                                  </label>
                                  <div className="admin-order-detail-actions">
                                    <label className="btn btn-outline admin-file-btn">
                                      <Plus size={16} />Subir imagen
                                      <input type="file" accept="image/*" onChange={(event) => handleOrderProofUpload(order.id, event)} />
                                    </label>
                                    {order.paymentProof && <button className="btn btn-outline" onClick={() => clearOrderPaymentProof(order.id)}><Trash2 size={16} />Quitar imagen</button>}
                                  </div>
                                  {order.paymentProof ? (
                                    <button
                                      type="button"
                                      className="image-preview-trigger"
                                      onClick={() => setProofPreview({
                                        src: normalizeImageSource(order.paymentProof) || FALLBACK_IMAGE,
                                        alt: `Comprobante ${order.code}`,
                                        title: `Comprobante · ${order.code}`,
                                      })}
                                    >
                                      <img src={normalizeImageSource(order.paymentProof) || FALLBACK_IMAGE} alt="" className="preview-image" loading="lazy" decoding="async" />
                                      <span><ZoomIn size={15} />Abrir comprobante completo</span>
                                    </button>
                                  ) : null}
                                </div>
                              </div>

                              <div className="admin-order-items-section">
                                <div className="admin-order-items-heading">
                                  <strong>Productos</strong>
                                  <span>{order.itemCount} {order.itemCount === 1 ? "artículo" : "artículos"}</span>
                                </div>
                                <div className="admin-order-items">
                                  {order.items.map((item) => (
                                    <div key={item.key} className="admin-order-item-row">
                                      <span>{item.name} · {item.color} · {item.size} ×{item.quantity}</span>
                                      <strong>{currency(item.price * item.quantity)}</strong>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              <div className="admin-order-danger-actions">
                                <button className="btn btn-danger" onClick={() => deleteOrder(order.id)}><Trash2 size={16} />Eliminar pedido</button>
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
                      <button className="btn btn-soft" onClick={() => refreshSecurityMetrics({ force: true, preferCache: false })} disabled={securityMetricsBusy}>
                        <RotateCcw size={16} />
                        {securityMetricsBusy ? "Actualizando..." : "Actualizar"}
                      </button>
                      <button className="btn btn-outline" onClick={resetSecurityMetricsData} disabled={securityMetricsResetBusy}>
                        <Trash2 size={16} />
                        {securityMetricsResetBusy ? "Reiniciando..." : "Reiniciar metricas"}
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
        </Motion.div>
      </Motion.div>
    </AnimatePresence>
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
