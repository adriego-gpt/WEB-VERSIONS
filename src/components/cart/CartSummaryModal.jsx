import React, { useMemo, useState, useRef, useEffect } from "react";
import {
  X,
  ShoppingBag,
  PencilLine,
  Trash2,
  Minus,
  Plus,
  Tag,
  ChevronLeft,
  ChevronRight,
  Store,
  Truck,
  MapPin,
  MessageCircle,
  Landmark,
  CreditCard,
  LockKeyhole,
  Check,
  Copy,
  Upload,
  FileCheck2,
  ZoomIn,
  AlertCircle,
} from "lucide-react";
import { motion as Motion, AnimatePresence } from "framer-motion";
import { ANIMATION } from "../../constants/animation";
import { currency } from "../../utils/currency";
import { normalizeAddressBook } from "../../domain/user/addressBook";
import { sanitizeLine, sanitizeParagraph, normalizeEntityId, stripDangerousContent } from "../../utils/sanitizers";
import { normalizeUserPhoneNumber } from "../../utils/phone";
import { AUTH_FIELD_LIMITS } from "../../constants/auth";
import { FILE_SECURITY } from "../../constants/product";
import { getStockForVariant, getStockStatus } from "../../domain/products/variants";
import { EmotionalEmptyState } from "../ui/EmotionalEmptyState";
import { AnimatedCurrencyValue } from "../ui/AnimatedCurrencyValue";
import { fileToDataUrl, normalizeImageSource } from "../../utils/fileUpload";
import { copyTextToClipboard } from "../../utils/clipboard";
import { triggerHaptic } from "../../utils/haptics";
import {
  PAYMENT_METHODS,
  calculatePayableTotal,
  calculatePaymentFee,
  normalizeCardFeePercent,
} from "../../domain/orders/payment";
import {
  CHECKOUT_STEPS,
  getNextCheckoutStep,
  getPreviousCheckoutStep,
} from "../../domain/orders/checkoutFlow";
import { getReadyBankAccounts } from "../../domain/contact/paymentSettings";
import {
  calculateFreeShippingProgress,
  calculateShippingFee,
  normalizeShippingSettings,
} from "../../domain/orders/shippingSettings";
import { ImageLightbox } from "../ui/ImageLightbox";

export function CartSummaryModal({
  open,
  onClose,
  cart = [],
  subtotal = 0,
  discountAmount = 0,
  finalTotal: _finalTotal = 0,
  totalItems = 0,
  onUpdateQuantity,
  onRemoveItem,
  onOpenItem,
  onEditItem,
  products = [],
  onCheckout,
  onSaveCheckoutAddress,
  checkoutDisabled = false,
  requiresLogin = false,
  couponDraftCode = "",
  onCouponDraftChange,
  onApplyCoupon,
  onRemoveCoupon,
  couponState,
  hasActiveCoupon = false,
  couponBusy = false,
  checkoutBusy = false,
  onBrowseCatalog,
  currentUser,
  savedAddresses = [],
  contactSettings,
  storeSettings,
}) {
  const normalizedSavedAddresses = useMemo(() => normalizeAddressBook(savedAddresses), [savedAddresses]);
  const defaultSavedAddress = normalizedSavedAddresses.find((entry) => entry.isDefault) || normalizedSavedAddresses[0] || null;
  const hasSavedAddresses = normalizedSavedAddresses.length > 0;
  const paymentSettings = contactSettings?.paymentSettings || {};
  const cardFeePercent = normalizeCardFeePercent(paymentSettings.cardFeePercent);
  const readyBankAccounts = useMemo(
    () => getReadyBankAccounts(contactSettings?.paymentSettings || {}),
    [contactSettings?.paymentSettings],
  );
  const transferReady = readyBankAccounts.length > 0;
  const createInitialDeliveryDraft = () => {
    const userFullName = [currentUser?.name, currentUser?.lastName].filter(Boolean).join(" ").trim() || currentUser?.name || "";
    return {
      fullName: sanitizeLine(defaultSavedAddress?.fullName || userFullName),
      idNumber: sanitizeLine(defaultSavedAddress?.idNumber || currentUser?.idNumber || ""),
      city: sanitizeLine(defaultSavedAddress?.city || ""),
      address: sanitizeParagraph(defaultSavedAddress?.address || currentUser?.shippingAddress || ""),
      reference: sanitizeParagraph(defaultSavedAddress?.reference || ""),
      phone: normalizeUserPhoneNumber(defaultSavedAddress?.phone || currentUser?.phone || ""),
    };
  };
  const [checkoutStep, setCheckoutStep] = useState(CHECKOUT_STEPS.summary);
  const [deliveryType, setDeliveryType] = useState("pickup");
  const [paymentMethod, setPaymentMethod] = useState(() => (
    transferReady ? PAYMENT_METHODS.transfer : PAYMENT_METHODS.cardLink
  ));
  const selectedPaymentMethod = transferReady ? paymentMethod : PAYMENT_METHODS.cardLink;
  const [deliveryDraft, setDeliveryDraft] = useState(() => createInitialDeliveryDraft());
  const [selectedSavedAddressId, setSelectedSavedAddressId] = useState(() => (defaultSavedAddress?.id || ""));
  const [useCustomAddress, setUseCustomAddress] = useState(false);
  const [saveAddressToBook, setSaveAddressToBook] = useState(true);
  const effectiveSelectedSavedAddressId = useCustomAddress ? "" : normalizeEntityId(selectedSavedAddressId || defaultSavedAddress?.id || "");
  const [checkoutFormError, setCheckoutFormError] = useState("");
  const [paymentProof, setPaymentProof] = useState("");
  const [paymentProofName, setPaymentProofName] = useState("");
  const [paymentProofBusy, setPaymentProofBusy] = useState(false);
  const [paymentProofError, setPaymentProofError] = useState("");
  const [proofAttention, setProofAttention] = useState(false);
  const [accountCopyFeedback, setAccountCopyFeedback] = useState("");
  const [selectedBankAccountId, setSelectedBankAccountId] = useState("");
  const [lightboxImage, setLightboxImage] = useState(null);
  const selectedBankAccount = readyBankAccounts.find((account) => account.id === selectedBankAccountId) || null;
  const selectedBankLogoImage = normalizeImageSource(selectedBankAccount?.bankLogoImage || "");
  const bankQrImage = normalizeImageSource(selectedBankAccount?.bankQrImage || "");
  const checkoutSummaryRef = useRef(null);
  const proofSectionRef = useRef(null);
  const accountCopyTimerRef = useRef(null);

  useEffect(() => {
    if (!open) {
      setCheckoutStep(CHECKOUT_STEPS.summary);
      setCheckoutFormError("");
      setPaymentProofError("");
      setProofAttention(false);
      return undefined;
    }
    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !checkoutBusy) {
        onClose?.();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, checkoutBusy, onClose]);

  useEffect(() => () => {
    if (accountCopyTimerRef.current) {
      window.clearTimeout(accountCopyTimerRef.current);
    }
  }, []);

  useEffect(() => {
    if (!readyBankAccounts.length) {
      setSelectedBankAccountId("");
      return;
    }
    if (selectedBankAccountId && !readyBankAccounts.some((account) => account.id === selectedBankAccountId)) {
      setSelectedBankAccountId("");
    }
  }, [readyBankAccounts, selectedBankAccountId]);

  useEffect(() => {
    if (!currentUser) return;
    const userFullName = [currentUser.name, currentUser.lastName].filter(Boolean).join(" ").trim() || currentUser.name || "";
    setDeliveryDraft((prev) => ({
      fullName: prev.fullName || sanitizeLine(defaultSavedAddress?.fullName || userFullName),
      idNumber: prev.idNumber || sanitizeLine(defaultSavedAddress?.idNumber || currentUser.idNumber || ""),
      city: prev.city || sanitizeLine(defaultSavedAddress?.city || ""),
      address: prev.address || sanitizeParagraph(defaultSavedAddress?.address || currentUser.shippingAddress || ""),
      reference: prev.reference || sanitizeParagraph(defaultSavedAddress?.reference || ""),
      phone: prev.phone || normalizeUserPhoneNumber(defaultSavedAddress?.phone || currentUser.phone || ""),
    }));
    if (defaultSavedAddress?.id && !selectedSavedAddressId) {
      setSelectedSavedAddressId(String(defaultSavedAddress.id));
    }
  }, [currentUser, defaultSavedAddress, selectedSavedAddressId]);

  const pickupAddress = sanitizeLine(contactSettings?.address || "");
  const pickupNote = sanitizeParagraph(contactSettings?.locationNote || "");
  const pickupMapsLink = sanitizeLine(contactSettings?.mapsLink || "");
  const normalizedCouponCode = sanitizeLine(couponState?.code || couponDraftCode || "");

  const shippingSettings = useMemo(
    () => normalizeShippingSettings(storeSettings?.shippingSettings),
    [storeSettings?.shippingSettings],
  );

  const freeShippingProgress = useMemo(
    () => calculateFreeShippingProgress({ subtotal, shippingSettings }),
    [subtotal, shippingSettings],
  );

  const shippingCalculation = useMemo(
    () => calculateShippingFee({
      subtotal: Math.max(0, subtotal - discountAmount),
      deliveryType,
      deliveryCity: deliveryDraft.city,
      shippingSettings,
    }),
    [subtotal, discountAmount, deliveryType, deliveryDraft.city, shippingSettings],
  );

  const effectiveShippingCost = shippingCalculation.shippingCost;
  const isDelivery = deliveryType === "delivery";
  const baseTotalWithShipping = Math.max(
    0,
    Number((subtotal - discountAmount + (isDelivery ? effectiveShippingCost : 0)).toFixed(2)),
  );
  const paymentFeeAmount = calculatePaymentFee(baseTotalWithShipping, selectedPaymentMethod, cardFeePercent);
  const payableTotal = calculatePayableTotal(baseTotalWithShipping, selectedPaymentMethod, cardFeePercent);
  const isCheckoutStep = checkoutStep !== CHECKOUT_STEPS.summary;
  const isPaymentStep = checkoutStep === CHECKOUT_STEPS.payment;
  const displayedTotal = isPaymentStep
    ? payableTotal
    : (isCheckoutStep ? baseTotalWithShipping : Math.max(0, Number((subtotal - discountAmount).toFixed(2))));
  const couponQuickLabel = hasActiveCoupon
    ? `Cupón ${normalizedCouponCode || "aplicado"} activo`
    : "¿Tienes cupón? Aplícalo en el resumen";
  const checkoutButtonLabel = checkoutBusy
    ? "Registrando pedido..."
    : requiresLogin
      ? "Inicia sesión para confirmar"
      : checkoutStep === CHECKOUT_STEPS.summary
        ? "Continuar con la entrega"
        : checkoutStep === CHECKOUT_STEPS.delivery
          ? "Confirmar dirección y continuar"
        : selectedPaymentMethod === PAYMENT_METHODS.cardLink
          ? `Solicitar enlace de pago (+${cardFeePercent}%)`
          : selectedBankAccount
            ? "Confirmar pago por transferencia"
            : "Selecciona un banco";

  const handleDeliveryDraftChange = (field, value) => {
    setDeliveryDraft((previous) => ({
      ...previous,
      [field]: field === "phone"
        ? normalizeUserPhoneNumber(value)
        : field === "idNumber"
          ? String(value || "").replace(/\D/g, "").slice(0, 13)
          : field === "address" || field === "reference"
            ? stripDangerousContent(value).replace(/\r/g, "")
            : stripDangerousContent(value).replace(/[\r\n\t]+/g, " "),
    }));
  };

  const applySavedAddressToDeliveryDraft = (addressEntry = null) => {
    if (!addressEntry) return;
    const userFullName = [currentUser?.name, currentUser?.lastName].filter(Boolean).join(" ").trim() || currentUser?.name || "";
    setUseCustomAddress(false);
    setSelectedSavedAddressId(String(addressEntry.id || ""));
    setDeliveryDraft((previous) => ({
      ...previous,
      fullName: sanitizeLine(addressEntry.fullName || previous.fullName || userFullName),
      idNumber: sanitizeLine(addressEntry.idNumber || currentUser?.idNumber || previous.idNumber || ""),
      city: sanitizeLine(addressEntry.city || previous.city || ""),
      address: sanitizeParagraph(addressEntry.address || ""),
      reference: sanitizeParagraph(addressEntry.reference || ""),
      phone: normalizeUserPhoneNumber(addressEntry.phone || currentUser?.phone || previous.phone || ""),
    }));
    setCheckoutFormError("");
  };

  const validateDeliverySelection = () => {
    if (deliveryType !== "delivery") return true;
    const fullName = sanitizeLine(deliveryDraft.fullName || "");
    const idNumber = sanitizeLine(deliveryDraft.idNumber || "");
    const city = sanitizeLine(deliveryDraft.city || "");
    const address = sanitizeParagraph(deliveryDraft.address || "");
    const phone = normalizeUserPhoneNumber(deliveryDraft.phone || "");

    if (!fullName) {
      setCheckoutFormError("Por favor ingresa el nombre de quien recibe.");
      return false;
    }
    if (!idNumber || idNumber.length < 10) {
      setCheckoutFormError("La cédula de identidad o RUC es obligatoria (mínimo 10 dígitos).");
      return false;
    }
    if (!phone || phone.length !== AUTH_FIELD_LIMITS.phone) {
      setCheckoutFormError("El número de teléfono móvil es obligatorio y debe tener 10 dígitos.");
      return false;
    }
    if (!city || !address) {
      setCheckoutFormError("Por favor completa la ciudad y la dirección exacta de entrega.");
      return false;
    }
    return true;
  };

  const handleCheckoutAction = () => {
    if (requiresLogin) {
      onCheckout(null);
      return;
    }
    if (checkoutStep === CHECKOUT_STEPS.summary) {
      setCheckoutStep(getNextCheckoutStep(checkoutStep));
      setCheckoutFormError("");
      return;
    }
    if (checkoutStep === CHECKOUT_STEPS.delivery) {
      if (!validateDeliverySelection()) return;
      if (
        deliveryType === "delivery" &&
        saveAddressToBook &&
        currentUser?.id &&
        typeof onSaveCheckoutAddress === "function"
      ) {
        void onSaveCheckoutAddress({
          id: effectiveSelectedSavedAddressId || undefined,
          label: "Entrega",
          fullName: sanitizeLine(deliveryDraft.fullName || ""),
          idNumber: sanitizeLine(deliveryDraft.idNumber || ""),
          city: sanitizeLine(deliveryDraft.city || ""),
          address: sanitizeParagraph(deliveryDraft.address || ""),
          reference: sanitizeParagraph(deliveryDraft.reference || ""),
          phone: normalizeUserPhoneNumber(deliveryDraft.phone || ""),
          isDefault: !hasSavedAddresses || Boolean(defaultSavedAddress?.id === effectiveSelectedSavedAddressId),
        });
      }
      setCheckoutStep(getNextCheckoutStep(checkoutStep));
      setCheckoutFormError("");
      return;
    }

    if (selectedPaymentMethod === PAYMENT_METHODS.transfer) {
      if (!transferReady) {
        setCheckoutFormError("La transferencia no está disponible en este momento. Elige otro método de pago.");
        return;
      }
      if (!selectedBankAccount) {
        setCheckoutFormError("Selecciona el banco al que realizarás la transferencia.");
        return;
      }
      if (!paymentProof) {
        setCheckoutFormError("Por favor sube la foto o captura de tu comprobante bancario para confirmar el pedido.");
        setProofAttention(true);
        proofSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
    }

    setCheckoutFormError("");
    onCheckout({
      deliveryType,
      paymentMethod: selectedPaymentMethod,
      paymentProof: selectedPaymentMethod === PAYMENT_METHODS.transfer ? paymentProof : "",
      bankAccountId: selectedPaymentMethod === PAYMENT_METHODS.transfer ? selectedBankAccount?.id || "" : "",
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

  const handleCopyAccount = async () => {
    const accountNumber = sanitizeLine(selectedBankAccount?.accountNumber || "");
    if (!accountNumber) return;
    const copied = await copyTextToClipboard(accountNumber);
    setAccountCopyFeedback(copied ? "Cuenta copiada" : "No se pudo copiar. Mantén presionado el número.");
    if (accountCopyTimerRef.current) {
      window.clearTimeout(accountCopyTimerRef.current);
    }
    accountCopyTimerRef.current = window.setTimeout(() => {
      setAccountCopyFeedback("");
      accountCopyTimerRef.current = null;
    }, 3000);
  };

  const handlePaymentProofChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setPaymentProofBusy(true);
    setPaymentProofError("");
    try {
      const nextPaymentProof = await fileToDataUrl(file);
      setPaymentProof(nextPaymentProof);
      setPaymentProofName(sanitizeLine(file.name || "Comprobante").slice(0, 80));
      setProofAttention(false);
      setCheckoutFormError("");
    } catch (error) {
      setPaymentProofError(error instanceof Error ? error.message : "No pudimos cargar el comprobante.");
    } finally {
      setPaymentProofBusy(false);
    }
  };

  const handleRemovePaymentProof = () => {
    setPaymentProof("");
    setPaymentProofName("");
    setPaymentProofError("");
    setProofAttention(false);
  };

  useEffect(() => {
    if (checkoutStep === CHECKOUT_STEPS.summary) return;
    const summaryNode = checkoutSummaryRef.current;
    if (!summaryNode || typeof summaryNode.scrollTo !== "function") return;
    summaryNode.scrollTo({ top: 0, behavior: "smooth" });
  }, [checkoutStep, deliveryType]);

  if (!open) return null;

  return (
    <>
    <AnimatePresence>
      <Motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, transition: { duration: 0.2, ease: "easeOut" } }}
        exit={{ opacity: 0, transition: { duration: 0.14, ease: "easeOut" } }}
        className="modal-backdrop"
        onClick={onClose}
      >
        <Motion.div
          initial={{ opacity: 0, y: 18, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: 0.22, ease: ANIMATION.easeOut } }}
          exit={{ opacity: 0, y: 10, scale: 0.97, transition: { duration: 0.14, ease: "easeOut" } }}
          className="sheet cart-fullscreen-sheet"
          role="dialog"
          aria-modal="true"
          aria-label="Resumen de tu carrito"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="sheet-header">
            <div>
              <h3 style={{ margin: 0, fontSize: 25 }}>Tu carrito completo</h3>
            </div>
            <button type="button" onClick={onClose} className="icon-btn" aria-label="Cerrar carrito">
              <X size={18} />
            </button>
          </div>

          <div className={`cart-fullscreen-content ${isCheckoutStep ? "is-confirm-step" : ""}`}>
            <div className={`sheet-body cart-fullscreen-list ${isCheckoutStep ? "is-confirm-step" : ""}`}>
              {cart.length > 0 && freeShippingProgress.eligible && (
                <div className={`free-shipping-progress-banner ${freeShippingProgress.isFree ? "is-unlocked" : ""}`}>
                  <div className="free-shipping-progress-head">
                    <span className="free-shipping-icon">
                      <Truck size={15} />
                    </span>
                    <span className="free-shipping-text">
                      {freeShippingProgress.isFree ? (
                        <strong>🎉 ¡Felicidades! Tienes Envío GRATIS en este pedido</strong>
                      ) : (
                        <span>Te faltan <strong>{currency(freeShippingProgress.remaining)}</strong> para tener <strong>Envío GRATIS</strong></span>
                      )}
                    </span>
                  </div>
                  <div className="free-shipping-progress-track">
                    <div
                      className="free-shipping-progress-fill"
                      style={{ transform: `scaleX(${Math.min(1, (freeShippingProgress.progressPercent || 0) / 100)})` }}
                    />
                  </div>
                </div>
              )}

              {cart.length === 0 ? (
                <EmotionalEmptyState
                  icon={ShoppingBag}
                  title="Tu carrito te está esperando"
                  description="Explora la colección y agrega tus prendas favoritas para armar tu pedido."
                  actionLabel="Ir al catálogo"
                  onAction={onBrowseCatalog}
                />
              ) : (
                (cart || []).map((item) => {
                  const productRecord = (products || []).find((product) => product.id === item.id);
                  const stockStatus = getStockStatus(getStockForVariant(productRecord, item.color, item.size));
                  return (
                    <Motion.div key={item.key} layout className="cart-item sheet-product-card cart-line-item">
                      <div className="cart-line-layout">
                        <button type="button" onClick={() => onOpenItem(item)} className="sheet-thumb-button cart-line-thumb-btn" aria-label={`Ver ${item.name}`}>
                          <img src={item.image} alt={item.name} className="sheet-product-thumb cart-line-thumb" loading="eager" decoding="async" />
                        </button>

                        <button type="button" onClick={() => onOpenItem(item)} className="sheet-product-title-button cart-line-main" aria-label={`Ver detalle de ${item.name}`}>
                          <p className="sheet-product-title cart-line-title">{item.name}</p>
                          <p className="muted sheet-product-meta-text cart-line-meta">{item.color} - {item.size}</p>
                          <span className={`stock-badge stock-badge-${stockStatus.tone} stock-badge-compact`} style={{ marginTop: 4 }}>
                            <span className="stock-dot" aria-hidden="true" />
                            <span>{stockStatus.label}</span>
                          </span>
                        </button>

                        <div className="cart-line-side">
                          <div className="cart-line-actions">
                            <button type="button" className="btn btn-soft cart-line-edit-btn" onClick={() => onEditItem(item)}>
                              <PencilLine size={13} />
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                triggerHaptic("medium");
                                onRemoveItem(item.key);
                              }}
                              className="sheet-remove-btn cart-line-remove-btn"
                              aria-label="Quitar producto del carrito"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                          <div className="qty sheet-qty cart-line-qty">
                            <button
                              type="button"
                              className="qty-control-btn"
                              onClick={() => {
                                triggerHaptic("light");
                                onUpdateQuantity(item.key, -1);
                              }}
                              aria-label="Disminuir cantidad"
                            >
                              <Minus size={14} />
                            </button>
                            <span className="cart-line-qty-value">{item.quantity}</span>
                            <button
                              type="button"
                              className="qty-control-btn"
                              onClick={() => {
                                triggerHaptic("light");
                                onUpdateQuantity(item.key, 1);
                              }}
                              aria-label="Aumentar cantidad"
                            >
                              <Plus size={14} />
                            </button>
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
              className={`sheet-footer cart-fullscreen-summary ${isCheckoutStep ? "is-confirm-step" : ""}`}
              ref={checkoutSummaryRef}
            >
              <div className="cart-footer-details">
                {checkoutStep === CHECKOUT_STEPS.summary ? (
                  <div className="surface coupon-surface">
                    <div className="coupon-head">
                      <p style={{ margin: 0, fontWeight: 600 }}>Cupón de descuento</p>
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
                        aria-label="Código de cupón"
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
                    <button type="button" className="btn btn-soft coupon-mini-toggle" onClick={() => setCheckoutStep(CHECKOUT_STEPS.summary)}>
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
              </div>

              {cart.length > 0 && !requiresLogin && isCheckoutStep && (
                <div className="surface checkout-confirm-surface">
                  <div className="checkout-confirm-head">
                    <div className="checkout-step-progress" role="list" aria-label="Progreso del pedido">
                      <span
                        className={`checkout-step-item ${isPaymentStep ? "is-complete" : "is-active"}`}
                        role="listitem"
                        aria-current={!isPaymentStep ? "step" : undefined}
                      >
                        <span className="checkout-step-marker" aria-hidden="true">{isPaymentStep ? <Check size={13} /> : "1"}</span>
                        <span>Entrega</span>
                      </span>
                      <span className={`checkout-step-line ${isPaymentStep ? "is-complete" : ""}`} aria-hidden="true" />
                      <span
                        className={`checkout-step-item ${isPaymentStep ? "is-active" : ""}`}
                        role="listitem"
                        aria-current={isPaymentStep ? "step" : undefined}
                      >
                        <span className="checkout-step-marker" aria-hidden="true">2</span>
                        <span>Pago</span>
                      </span>
                    </div>
                    <div className="checkout-confirm-head-row">
                      <div className="checkout-confirm-heading-copy">
                        <h4 className="checkout-confirm-title">{isPaymentStep ? "¿Cómo deseas pagar?" : "¿Dónde deseas recibir tu pedido?"}</h4>
                        <p className="checkout-confirm-support">
                          {isPaymentStep
                            ? "Elige una opción para ver el total final."
                            : "Selecciona retiro en local o envío a domicilio."}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="btn btn-soft checkout-back-btn-inline"
                        onClick={() => setCheckoutStep(getPreviousCheckoutStep(checkoutStep))}
                      >
                        <ChevronLeft size={14} />
                        {isPaymentStep ? "Editar entrega" : "Volver al resumen"}
                      </button>
                    </div>
                  </div>

                  {checkoutStep === CHECKOUT_STEPS.delivery && (
                    <>
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
                      <span className="checkout-delivery-tab-icon"><Store size={18} /></span>
                      <span className="checkout-delivery-tab-copy">
                        <strong>Retiro en local</strong>
                        <small>Recoge tu pedido en nuestro local</small>
                      </span>
                      <span className="checkout-delivery-tab-status" aria-hidden="true">
                        {deliveryType === "pickup" && <Check size={14} />}
                      </span>
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
                      <span className="checkout-delivery-tab-icon"><Truck size={18} /></span>
                      <span className="checkout-delivery-tab-copy">
                        <strong>Envío a domicilio</strong>
                        <small>Completa la dirección de entrega</small>
                      </span>
                      <span className="checkout-delivery-tab-status" aria-hidden="true">
                        {deliveryType === "delivery" && <Check size={14} />}
                      </span>
                    </button>
                  </div>

                    {deliveryType === "pickup" ? (
                    <div className="checkout-pickup-box">
                      <div className="checkout-pickup-heading">
                        <span className="checkout-pickup-icon" aria-hidden="true"><MapPin size={17} /></span>
                        <div>
                          <span className="checkout-pickup-label">Punto de retiro seleccionado</span>
                          <strong className="checkout-pickup-address">{pickupAddress || "El punto de retiro se coordina por WhatsApp al confirmar."}</strong>
                        </div>
                      </div>
                      {pickupNote && <p className="helper-text" style={{ margin: 0 }}>{pickupNote}</p>}
                      {pickupMapsLink && (
                        <a className="link-btn checkout-pickup-link" href={pickupMapsLink} target="_blank" rel="noopener noreferrer">
                          Abrir ruta en Google Maps
                          <ChevronRight size={14} aria-hidden="true" />
                        </a>
                      )}
                    </div>
                  ) : (
                    <div className="checkout-delivery-form">
                      <div className="checkout-recipient-card">
                        <p className="checkout-section-badge-title">Datos del destinatario (obligatorios)</p>
                        <div className="checkout-delivery-grid recipient-grid">
                          <input
                            className="input"
                            placeholder="Nombre completo de quien recibe *"
                            aria-label="Nombre completo"
                            value={deliveryDraft.fullName}
                            onChange={(event) => handleDeliveryDraftChange("fullName", event.target.value)}
                          />
                          <input
                            className="input"
                            placeholder="Cédula / RUC (10 a 13 dígitos) *"
                            aria-label="Cédula de identidad"
                            inputMode="numeric"
                            maxLength={13}
                            value={deliveryDraft.idNumber}
                            onChange={(event) => handleDeliveryDraftChange("idNumber", event.target.value.replace(/\D/g, "").slice(0, 13))}
                          />
                          <input
                            className="input"
                            placeholder="Teléfono móvil (10 dígitos) *"
                            aria-label="Teléfono para entrega"
                            inputMode="tel"
                            maxLength={10}
                            value={deliveryDraft.phone}
                            onChange={(event) => handleDeliveryDraftChange("phone", event.target.value.replace(/\D/g, "").slice(0, 10))}
                          />
                        </div>
                      </div>

                      <div className="checkout-address-box">
                        <p className="checkout-section-badge-title">Dirección de entrega</p>

                        {hasSavedAddresses && !useCustomAddress ? (
                          <div className="checkout-saved-addresses-flow">
                            <div className="checkout-saved-address-list">
                              {normalizedSavedAddresses.map((entry) => {
                                const isActive = String(entry.id || "") === String(effectiveSelectedSavedAddressId || "");
                                return (
                                  <button
                                    key={entry.id}
                                    type="button"
                                    className={`checkout-saved-address-card ${isActive ? "active" : ""}`}
                                    onClick={() => applySavedAddressToDeliveryDraft(entry)}
                                  >
                                    <div className="checkout-saved-address-radio">
                                      <span className={`custom-radio-circle ${isActive ? "selected" : ""}`} />
                                    </div>
                                    <div className="checkout-saved-address-content">
                                      <div className="checkout-saved-address-top">
                                        <strong className="checkout-saved-address-label">{entry.label || "Dirección guardada"}</strong>
                                        {entry.isDefault && <span className="badge badge-dark">Principal</span>}
                                      </div>
                                      <p className="checkout-saved-address-text">{entry.address}</p>
                                      <div className="checkout-saved-address-details">
                                        {entry.fullName && <span>Recibe: {entry.fullName}</span>}
                                        {entry.idNumber && <span>C.I: {entry.idNumber}</span>}
                                        {entry.city && <span>{entry.city}</span>}
                                        {entry.phone && <span>Tel: {entry.phone}</span>}
                                        {entry.reference && <span>Ref: {entry.reference}</span>}
                                      </div>
                                    </div>
                                  </button>
                                );
                              })}
                            </div>

                            <button
                              type="button"
                              className="checkout-add-address-trigger"
                              onClick={() => {
                                setUseCustomAddress(true);
                                setSelectedSavedAddressId("");
                                setDeliveryDraft((prev) => ({
                                  ...prev,
                                  city: "",
                                  address: "",
                                  reference: "",
                                }));
                              }}
                            >
                              <Plus size={15} />
                              <span>Usar otra dirección de entrega</span>
                            </button>
                          </div>
                        ) : (
                          <div className="checkout-custom-address-container">
                            {hasSavedAddresses && (
                              <button
                                type="button"
                                className="checkout-back-to-saved-link"
                                onClick={() => {
                                  setUseCustomAddress(false);
                                  if (defaultSavedAddress) {
                                    applySavedAddressToDeliveryDraft(defaultSavedAddress);
                                  }
                                }}
                              >
                                <ChevronLeft size={14} />
                                <span>Volver a mis direcciones guardadas</span>
                              </button>
                            )}

                            <div className="checkout-delivery-grid">
                              <input
                                className="input"
                                placeholder="Ciudad / Cantón *"
                                aria-label="Ciudad"
                                value={deliveryDraft.city}
                                onChange={(event) => handleDeliveryDraftChange("city", event.target.value)}
                              />
                              <textarea
                                className="textarea checkout-delivery-full"
                                placeholder="Dirección exacta (Calle principal, número e intersección) *"
                                aria-label="Dirección exacta"
                                value={deliveryDraft.address}
                                onChange={(event) => handleDeliveryDraftChange("address", event.target.value)}
                              />
                              <textarea
                                className="textarea checkout-delivery-full"
                                placeholder="Referencia de entrega (Opcional: Color de fachada, depto, indicaciones...)"
                                aria-label="Referencia de entrega (opcional)"
                                value={deliveryDraft.reference}
                                onChange={(event) => handleDeliveryDraftChange("reference", event.target.value)}
                              />
                            </div>

                            {currentUser?.id && (
                              <label className="checkout-save-address-checkbox">
                                <input
                                  type="checkbox"
                                  checked={saveAddressToBook}
                                  onChange={(e) => setSaveAddressToBook(e.target.checked)}
                                />
                                <span>Guardar esta dirección en mi libreta para futuros pedidos</span>
                              </label>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    )}
                    </>
                  )}

                  {isPaymentStep && (
                    <>
                    <div className="checkout-delivery-confirmation">
                      <div className="checkout-delivery-confirmation-icon" aria-hidden="true">
                        {deliveryType === "delivery" ? <Truck size={18} /> : <Store size={18} />}
                      </div>
                      <div>
                        <strong>{deliveryType === "delivery" ? "Envío a domicilio confirmado" : "Retiro en local confirmado"}</strong>
                        <p>
                          {deliveryType === "delivery"
                            ? `${sanitizeLine(deliveryDraft.city || "")} · ${sanitizeParagraph(deliveryDraft.address || "")}`
                            : (pickupAddress || "La ubicación se coordina por WhatsApp.")}
                        </p>
                      </div>
                      <button type="button" className="link-btn" onClick={() => setCheckoutStep(CHECKOUT_STEPS.delivery)}>Editar</button>
                    </div>

                    <section className="checkout-payment-section" aria-labelledby="checkout-payment-title">
                    <div className="checkout-payment-heading">
                      <div>
                        <h5 id="checkout-payment-title">Método de pago</h5>
                        <p>Selecciona transferencia o tarjeta. El total se actualizará automáticamente.</p>
                      </div>
                      <LockKeyhole size={18} aria-hidden="true" />
                    </div>
                    <div className="checkout-payment-options" role="radiogroup" aria-label="Método de pago">
                      <button
                        type="button"
                        role="radio"
                        aria-checked={selectedPaymentMethod === PAYMENT_METHODS.transfer}
                        className={`checkout-payment-option ${selectedPaymentMethod === PAYMENT_METHODS.transfer ? "active" : ""}`}
                        onClick={() => {
                          setPaymentMethod(PAYMENT_METHODS.transfer);
                          setCheckoutFormError("");
                        }}
                        disabled={!transferReady}
                      >
                        <Landmark size={19} aria-hidden="true" />
                        <span><strong>Transferencia</strong><small>{transferReady ? "Sin comisión" : "No disponible"}</small></span>
                      </button>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={selectedPaymentMethod === PAYMENT_METHODS.cardLink}
                        className={`checkout-payment-option ${selectedPaymentMethod === PAYMENT_METHODS.cardLink ? "active" : ""}`}
                        onClick={() => {
                          setPaymentMethod(PAYMENT_METHODS.cardLink);
                          setCheckoutFormError("");
                        }}
                      >
                        <CreditCard size={19} aria-hidden="true" />
                        <span><strong>Tarjeta</strong><small>Solicitar link · +{cardFeePercent}%</small></span>
                      </button>
                    </div>

                    {selectedPaymentMethod === PAYMENT_METHODS.transfer ? (
                      <>
                      <fieldset className="checkout-bank-selector">
                        <legend>Selecciona el banco</legend>
                        <p>Elige dónde realizarás la transferencia para ver los datos de pago.</p>
                        <div className="checkout-bank-choice-grid" role="radiogroup" aria-label="Banco para la transferencia">
                          {readyBankAccounts.map((account) => {
                            const isSelected = selectedBankAccount?.id === account.id;
                            const accountEnding = sanitizeLine(account.accountNumber || "").slice(-4);
                            const bankLogoImage = normalizeImageSource(account.bankLogoImage || "");
                            return (
                              <button
                                key={account.id}
                                type="button"
                                role="radio"
                                aria-checked={isSelected}
                                aria-controls="checkout-selected-bank-details"
                                className={`checkout-bank-choice ${isSelected ? "active" : ""}`}
                                onClick={() => {
                                  setSelectedBankAccountId(account.id);
                                  setAccountCopyFeedback("");
                                  setCheckoutFormError("");
                                }}
                              >
                                <span className="checkout-bank-choice-logo" aria-hidden="true">
                                  {bankLogoImage ? <img src={bankLogoImage} alt="" /> : <Landmark size={18} />}
                                </span>
                                <span>
                                  <strong>{sanitizeLine(account.bankName || "Banco")}</strong>
                                  <small>{sanitizeLine(account.accountType || "Cuenta")}{accountEnding ? ` · termina en ${accountEnding}` : ""}</small>
                                </span>
                                <Check className="checkout-bank-choice-check" size={16} aria-hidden="true" />
                              </button>
                            );
                          })}
                        </div>
                      </fieldset>
                      {selectedBankAccount ? (
                      <>
                      <div id="checkout-selected-bank-details" className="checkout-bank-details">
                        <div className="checkout-bank-copy">
                          <div className="checkout-bank-heading">
                            <span className="checkout-bank-detail-logo" aria-hidden="true">
                              {selectedBankLogoImage ? <img src={selectedBankLogoImage} alt="" /> : <Landmark size={20} />}
                            </span>
                            <p className="checkout-bank-name">{sanitizeLine(selectedBankAccount?.bankName || "Banco")}</p>
                          </div>
                          <dl>
                            <div className="checkout-bank-account-row">
                              <dt>Cuenta</dt>
                              <dd>
                                <span className="checkout-bank-account-number">{sanitizeLine(selectedBankAccount?.accountType || "Cuenta")} · {sanitizeLine(selectedBankAccount?.accountNumber || "")}</span>
                                <span className="checkout-bank-copy-action">
                                  <button type="button" className="checkout-bank-copy-btn" onClick={() => { void handleCopyAccount(); }}>
                                    <Copy size={13} aria-hidden="true" />
                                    Copiar cuenta
                                  </button>
                                  <span className="checkout-bank-copy-feedback" role="status" aria-live="polite">{accountCopyFeedback}</span>
                                </span>
                              </dd>
                            </div>
                            <div><dt>Titular</dt><dd>{sanitizeLine(selectedBankAccount?.accountHolder || "")}</dd></div>
                            {selectedBankAccount?.accountId && <div><dt>Cédula/RUC</dt><dd>{sanitizeLine(selectedBankAccount.accountId)}</dd></div>}
                          </dl>
                          <p className="checkout-bank-note">Transfiere el total exacto y adjunta el comprobante para que podamos verificar el pago.</p>
                        </div>
                        {bankQrImage ? (
                          <button
                            type="button"
                            className="checkout-bank-qr-trigger"
                            onClick={() => setLightboxImage({
                              src: bankQrImage,
                              alt: `QR para transferir a ${sanitizeLine(selectedBankAccount?.bankName || "la cuenta bancaria")}`,
                              title: `QR · ${sanitizeLine(selectedBankAccount?.bankName || "Cuenta bancaria")}`,
                            })}
                            aria-label={`Abrir QR de ${sanitizeLine(selectedBankAccount?.bankName || "la cuenta bancaria")}`}
                          >
                            <img className="checkout-bank-qr" src={bankQrImage} alt="" />
                            <span><ZoomIn size={13} />Ampliar QR</span>
                          </button>
                        ) : null}
                      </div>
                      <div
                        ref={proofSectionRef}
                        className={`checkout-payment-proof ${paymentProof ? "has-file" : ""} ${proofAttention && !paymentProof ? "is-required-attention" : ""}`}
                      >
                        <div className="checkout-payment-proof-heading">
                          <span className="checkout-payment-proof-icon" aria-hidden="true">
                            {paymentProof ? <FileCheck2 size={18} /> : <Upload size={18} />}
                          </span>
                          <div>
                            <strong>
                              Comprobante de transferencia
                              <span className="checkout-badge-required">Requerido</span>
                            </strong>
                            <p>Sube la foto o captura de tu transferencia (JPG, PNG o WEBP de hasta {FILE_SECURITY.maxImageSizeMb} MB). La adjuntaremos a tu pedido para validarlo.</p>
                          </div>
                        </div>
                        {proofAttention && !paymentProof && (
                          <div className="checkout-proof-missing-alert" role="alert">
                            <AlertCircle size={15} aria-hidden="true" />
                            <span>Debes adjuntar la captura del pago antes de confirmar</span>
                          </div>
                        )}
                        {paymentProof ? (
                          <div className="checkout-payment-proof-file">
                            <button
                              type="button"
                              className="checkout-proof-preview-trigger"
                              onClick={() => setLightboxImage({
                                src: paymentProof,
                                alt: "Comprobante de transferencia",
                                title: "Comprobante de transferencia",
                              })}
                              aria-label="Abrir comprobante de transferencia"
                            >
                              <img src={paymentProof} alt="" />
                              <ZoomIn size={13} aria-hidden="true" />
                            </button>
                            <div>
                              <strong>{paymentProofName || "Comprobante cargado"}</strong>
                              <span>Listo para guardar con el pedido</span>
                            </div>
                            <button type="button" className="icon-btn" onClick={handleRemovePaymentProof} aria-label="Quitar comprobante">
                              <Trash2 size={15} />
                            </button>
                          </div>
                        ) : (
                          <label className={`btn btn-outline checkout-payment-proof-upload ${paymentProofBusy ? "is-busy" : ""}`}>
                            <Upload size={15} aria-hidden="true" />
                            {paymentProofBusy ? "Procesando imagen..." : "Subir comprobante"}
                            <input
                              type="file"
                              className="visually-hidden"
                              accept="image/png,image/jpeg,image/webp"
                              onChange={(event) => { void handlePaymentProofChange(event); }}
                              disabled={paymentProofBusy}
                              aria-label="Subir comprobante de transferencia"
                            />
                          </label>
                        )}
                        {paymentProofError && <p className="checkout-payment-proof-error" role="alert">{paymentProofError}</p>}
                      </div>
                      </>
                      ) : (
                        <div id="checkout-selected-bank-details" className="checkout-bank-selection-prompt" role="status">
                          Selecciona un banco para mostrar el número de cuenta, titular y código QR.
                        </div>
                      )}
                      </>
                    ) : (
                      <div className="checkout-card-link-note">
                        <CreditCard size={20} aria-hidden="true" />
                        <div>
                          <strong>Solicitaremos tu enlace seguro por WhatsApp</strong>
                          <p>No ingreses datos de tarjeta en esta web. La comisión de {cardFeePercent}% equivale a {currency(paymentFeeAmount)}.</p>
                        </div>
                      </div>
                    )}
                    </section>
                    </>
                  )}

                  {checkoutFormError && (
                    <div className="checkout-form-notice" role="alert">
                      <AlertCircle size={16} aria-hidden="true" />
                      <span>{checkoutFormError}</span>
                    </div>
                  )}
                </div>
              )}

              <div className={`cart-checkout-cta ${isCheckoutStep ? "is-confirm-step" : ""}`}>
                <div className="checkout-amount-summary" aria-label="Resumen de importes">
                  <div className="cart-footer-meta-row"><span>Productos</span><strong>{totalItems}</strong></div>
                  <div className="cart-footer-meta-row"><span>Subtotal</span><strong><AnimatedCurrencyValue value={subtotal} /></strong></div>
                  {discountAmount > 0 && (
                    <div className="cart-footer-meta-row is-discount"><span>Descuento</span><strong>-<AnimatedCurrencyValue value={discountAmount} /></strong></div>
                  )}
                  {isCheckoutStep && (
                    <div className="cart-footer-meta-row is-shipping">
                      <span>Envío ({deliveryType === "delivery" ? (effectiveShippingCost === 0 ? "Gratis" : (shippingCalculation.reason === "local" ? "Local" : "Nacional")) : "Retiro"})</span>
                      <strong>
                        {deliveryType !== "delivery" || effectiveShippingCost === 0 ? (
                          <span className="badge badge-success" style={{ fontSize: "11px", padding: "2px 6px" }}>GRATIS</span>
                        ) : (
                          <span>+<AnimatedCurrencyValue value={effectiveShippingCost} /></span>
                        )}
                      </strong>
                    </div>
                  )}
                  {isPaymentStep && paymentFeeAmount > 0 && <div className="cart-footer-fee-row"><span>Comisión tarjeta ({cardFeePercent}%)</span><strong>+<AnimatedCurrencyValue value={paymentFeeAmount} /></strong></div>}
                  <div className="cart-footer-total-row"><span>Total</span><strong><AnimatedCurrencyValue value={displayedTotal} /></strong></div>
                </div>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleCheckoutAction}
                  disabled={cart.length === 0 || checkoutDisabled || checkoutBusy}
                  aria-busy={checkoutBusy}
                  style={{ opacity: cart.length === 0 || checkoutDisabled || checkoutBusy ? 0.6 : 1, cursor: cart.length === 0 || checkoutDisabled || checkoutBusy ? "not-allowed" : "pointer" }}
                >
                  {isPaymentStep
                    ? (selectedPaymentMethod === PAYMENT_METHODS.transfer ? <Landmark size={18} /> : <MessageCircle size={18} />)
                    : <ChevronRight size={18} />}
                  {checkoutButtonLabel}
                </button>
              </div>
              {requiresLogin && cart.length > 0 && (
                <p className="helper-text sheet-login-hint">
                  Gracias por elegirnos. Inicia sesión para guardar tu pedido, seguimiento y confirmación.
                </p>
              )}
            </div>
          </div>
        </Motion.div>
      </Motion.div>
    </AnimatePresence>
    <ImageLightbox
      open={Boolean(lightboxImage)}
      src={lightboxImage?.src || ""}
      alt={lightboxImage?.alt || "Imagen ampliada"}
      title={lightboxImage?.title || "Vista completa"}
      onClose={() => setLightboxImage(null)}
    />
    </>
  );
}

export default CartSummaryModal;
