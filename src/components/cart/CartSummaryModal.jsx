import React, { useCallback, useMemo, useState, useRef, useEffect } from "react";
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
import { PickupLocation } from "../orders/PickupLocation";
import { normalizeAddressBook } from "../../domain/user/addressBook";
import { sanitizeLine, sanitizeParagraph, normalizeEntityId, stripDangerousContent } from "../../utils/sanitizers";
import { normalizeUserPhoneNumber } from "../../utils/phone";
import { FALLBACK_IMAGE, FILE_SECURITY } from "../../constants/product";
import { getStockForVariant, getStockStatus } from "../../domain/products/variants";
import { EmotionalEmptyState } from "../ui/EmotionalEmptyState";
import { AnimatedCurrencyValue } from "../ui/AnimatedCurrencyValue";
import { fileToDataUrl, normalizeImageSource } from "../../utils/fileUpload";
import { copyTextToClipboard } from "../../utils/clipboard";
import { triggerHaptic } from "../../utils/haptics";
import { buildWhatsAppLink } from "../../utils/url.js";
import { projectCartStock } from "../../domain/orders/cartEditing.js";
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
import { useCheckoutAvailability } from "../../hooks/useCheckoutAvailability";
import { useModalA11y } from "../../hooks/useModalA11y";
import { validateCheckoutDelivery } from "../../domain/orders/deliveryValidation.js";
import { CHECKOUT_HISTORY_KEY, readCheckoutHistoryStep, readCheckoutHistoryDepth, checkoutStepUrl } from "../../domain/orders/checkoutHistory.js";

function CheckoutField({ label, name, error, required = false, className = "", children }) {
  const id = `checkout-${name}`;
  return <div className={`checkout-field ${className}`}>
    <label htmlFor={id}>{label}{required && <span aria-hidden="true"> *</span>}</label>
    {React.cloneElement(children, { id, name: id, required, "aria-label": undefined, "aria-invalid": Boolean(error), "aria-describedby": error ? `${id}-error` : undefined })}
    {error && <small id={`${id}-error`} className="checkout-field-error" aria-live="polite">{error}</small>}
  </div>;
}

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
  onCheckAvailability,
  onBrowseCatalog,
  currentUser,
  savedAddresses = [],
  contactSettings,
  storeSettings,
}) {
  const dialogRef = useModalA11y(open, onClose, { disableEscape: checkoutBusy });
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
  const [availabilityBusy, setAvailabilityBusy] = useState(false);
  const checkoutActionBusyRef = useRef(false);
  const checkForStep = useCallback((lines, options) => onCheckAvailability(lines, { ...options, reservationOnly: checkoutStep === CHECKOUT_STEPS.payment }), [onCheckAvailability, checkoutStep]);
  const stockNoticeRef = useRef(null);
  const lastStockAttentionRef = useRef("");
  const attentionAnimationRef = useRef(null);
  const drawAttentionToStock = useCallback((focus = false) => {
    const notice = stockNoticeRef.current;
    if (!notice) return;
    attentionAnimationRef.current?.cancel();
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (!reducedMotion && typeof notice.animate === "function") {
      attentionAnimationRef.current = notice.animate([
        { transform: "translateX(0)" }, { transform: "translateX(-3px)" },
        { transform: "translateX(3px)" }, { transform: "translateX(-2px)" }, { transform: "translateX(0)" },
      ], { duration: 380, easing: "ease-out" });
    }
    const rect = notice.getBoundingClientRect();
    if (rect.top < 100 || rect.bottom > window.innerHeight - 80) notice.scrollIntoView({ behavior: reducedMotion ? "instant" : "smooth", block: "center" });
    if (focus) notice.focus({ preventScroll: true });
  }, []);
  useEffect(() => () => attentionAnimationRef.current?.cancel(), []);
  const { availability, checkAvailability: runAvailabilityCheck, reportAvailabilityFailure } = useCheckoutAvailability({ open, cart, onCheckAvailability: checkForStep, refreshKey: products });
  const checkAvailability = async (options) => {
    const result = await runAvailabilityCheck(options);
    if (!result.ok) window.requestAnimationFrame(() => drawAttentionToStock(true));
    return result;
  };
  const [reservationRemaining, setReservationRemaining] = useState(0);
  useEffect(() => {
    if (!availability.expiresAt) { setReservationRemaining(0); return undefined; }
    const deadline = Date.now() + Math.max(0, availability.expiresAt - availability.serverNow);
    const tick = () => setReservationRemaining(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [availability.expiresAt, availability.serverNow]);
  const reservationValid = availability.ok && Boolean(availability.reservationId) && reservationRemaining > 0;
  const effectiveProducts = useMemo(() => products.map(product => projectCartStock(product, {
    stock: availability.stock,
    stockDeadline: Date.now() + Math.max(0, (availability.stockExpiresAt || availability.expiresAt || 0) - (availability.serverNow || Date.now())),
  })), [products, availability.stock, availability.stockExpiresAt, availability.expiresAt, availability.serverNow, availability.ok]);
  const changeCheckoutStep = (step) => {
    if (typeof window !== "undefined" && window.location.pathname === "/carrito") {
      window.history.pushState({ ...(window.history.state || {}), [CHECKOUT_HISTORY_KEY]: step, adriegoCheckoutDepth: readCheckoutHistoryDepth(window.history.state) + 1 }, document.title, checkoutStepUrl(window.location.href, step));
    }
    setCheckoutStep(step);
  };
  const goBackCheckoutStep = () => {
    if (typeof window !== "undefined" && window.location.pathname === "/carrito" && window.history.state?.[CHECKOUT_HISTORY_KEY] === checkoutStep) window.history.back();
    else setCheckoutStep(getPreviousCheckoutStep(checkoutStep));
  };
  useEffect(() => {
    if (!open) return undefined;
    // A reload must revalidate before exposing bank details again.
    window.history.replaceState({ ...(window.history.state || {}), adriegoCheckoutDepth: readCheckoutHistoryDepth(window.history.state), [CHECKOUT_HISTORY_KEY]: CHECKOUT_STEPS.summary }, document.title, checkoutStepUrl(window.location.href, CHECKOUT_STEPS.summary));
    const restoreStep = () => {
      if (window.location.pathname === "/carrito") {
        setCheckoutStep(readCheckoutHistoryStep(window.history.state));
        setCheckoutFormError("");
      }
    };
    window.addEventListener("popstate", restoreStep);
    return () => window.removeEventListener("popstate", restoreStep);
  }, [open]);
  const [guestCheckout, setGuestCheckout] = useState(false);
  const needsAccountChoice = requiresLogin && !guestCheckout;
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
  const [deliveryErrors, setDeliveryErrors] = useState({});
  const [paymentProof, setPaymentProof] = useState("");
  const [paymentProofCartKey, setPaymentProofCartKey] = useState("");
  const cartContentsKey = JSON.stringify(cart.map(({ id, color, size, quantity, price }) => [id, color, size, quantity, price]));
  const previousCartContentsRef = useRef(cartContentsKey);
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
    return undefined;
  }, [open]);

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
  const assistanceUrl = buildWhatsAppLink(contactSettings?.whatsappNumber || contactSettings?.phone);
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
  const cartProofKey = JSON.stringify([cartContentsKey, baseTotalWithShipping, selectedBankAccountId]);
  const proofMatchesCart = paymentProofCartKey === cartProofKey;
  useEffect(() => {
    const changed = previousCartContentsRef.current !== cartContentsKey;
    previousCartContentsRef.current = cartContentsKey;
    if (!changed || !isPaymentStep) return;
    setCheckoutStep(CHECKOUT_STEPS.summary);
    setCheckoutFormError("");
    if (window.location.pathname === "/carrito") window.history.replaceState({ ...(window.history.state || {}), [CHECKOUT_HISTORY_KEY]: CHECKOUT_STEPS.summary }, document.title, checkoutStepUrl(window.location.href, CHECKOUT_STEPS.summary));
  }, [cartContentsKey, isPaymentStep]);
  const couponQuickLabel = hasActiveCoupon
    ? `Cupón ${normalizedCouponCode || "aplicado"} activo`
    : "¿Tienes cupón? Aplícalo en el resumen";
  const checkoutButtonLabel = availabilityBusy ? "Verificando disponibilidad…" : checkoutBusy
    ? "Registrando pedido..."
    : needsAccountChoice
      ? "Inicia sesión para confirmar"
      : checkoutStep === CHECKOUT_STEPS.summary
        ? "Continuar con la entrega"
        : checkoutStep === CHECKOUT_STEPS.delivery
          ? "Confirmar dirección y continuar"
        : selectedPaymentMethod === PAYMENT_METHODS.cardLink
          ? `Solicitar enlace de pago (+${cardFeePercent}%)`
          : selectedBankAccount
            ? "Enviar pedido y comprobante"
            : "Selecciona un banco";

  const handleDeliveryDraftChange = (field, value) => {
    setDeliveryErrors(previous => previous[field] ? { ...previous, [field]: "" } : previous);
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
    setDeliveryErrors({});
  };

  const unavailableCartItems = useMemo(() => {
    return (cart || []).filter((item) => {
      const productRecord = effectiveProducts.find((product) => String(product.id) === String(item.id));
      if (!productRecord || productRecord.isPublic === false) return true;
      const availableStock = getStockForVariant(productRecord, item.color, item.size);
      return availableStock <= 0 || item.quantity > availableStock;
    });
  }, [cart, effectiveProducts]);

  const hasUnavailableItems = unavailableCartItems.length > 0;
  const checkingStock = availability.message === "Comprobando disponibilidad…";
  const stockBlocked = cart.length > 0 && !checkingStock && (!availability.ok || hasUnavailableItems);
  const stockAttentionKey = stockBlocked ? JSON.stringify([checkoutStep, availability.message, unavailableCartItems.map(item => item.key)]) : "";
  useEffect(() => {
    if (!open || !stockAttentionKey) { lastStockAttentionRef.current = ""; return; }
    if (lastStockAttentionRef.current === stockAttentionKey) return;
    lastStockAttentionRef.current = stockAttentionKey;
    drawAttentionToStock();
  }, [open, stockAttentionKey, drawAttentionToStock]);

  const validateDeliverySelection = () => {
    const errors = validateCheckoutDelivery(deliveryDraft, { deliveryType, guestCheckout });
    setDeliveryErrors(errors);
    setCheckoutFormError("");
    const firstInvalidField = Object.keys(errors)[0];
    if (!firstInvalidField) return true;
    if (errors.city || errors.address) {
      setUseCustomAddress(true);
      setSelectedSavedAddressId("");
    }
    window.requestAnimationFrame(() => {
      const field = document.getElementById(`checkout-${firstInvalidField}`);
      field?.closest(".checkout-field")?.scrollIntoView({ block: "center", behavior: "instant" });
      field?.focus({ preventScroll: true });
    });
    return false;
  };

  const chooseDeliveryType = (type) => {
    setDeliveryType(type);
    setDeliveryErrors({});
    setCheckoutFormError("");
  };
  const handleDeliveryTypeKeyDown = (event) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? "pickup" : event.key === "End" ? "delivery" : deliveryType === "pickup" ? "delivery" : "pickup";
    chooseDeliveryType(next);
    document.getElementById(`delivery-choice-${next}`)?.focus({ preventScroll: true });
  };

  const handleCheckoutAction = async () => {
    if (availabilityBusy || checkoutBusy || checkoutActionBusyRef.current) return;
    checkoutActionBusyRef.current = true;
    try {
    if (needsAccountChoice) {
      onCheckout(null);
      return;
    }

    setAvailabilityBusy(true);
    let verified;
    try { verified = await checkAvailability(); } finally { setAvailabilityBusy(false); }
    if (!verified.ok) { setCheckoutFormError(""); return; }

    if (checkoutStep === CHECKOUT_STEPS.summary) {
      changeCheckoutStep(getNextCheckoutStep(checkoutStep));
      setCheckoutFormError("");
      return;
    }
    if (checkoutStep === CHECKOUT_STEPS.delivery) {
      if (!validateDeliverySelection()) return;
      setAvailabilityBusy(true);
      let held;
      try { held = await checkAvailability({ reserve: true }); } finally { setAvailabilityBusy(false); }
      if (!held.ok) { setCheckoutFormError(""); return; }
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
      changeCheckoutStep(getNextCheckoutStep(checkoutStep));
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
      if (!paymentProof || !proofMatchesCart) {
        setCheckoutFormError(paymentProof
          ? "El carrito cambió. Revisa el importe y vuelve a adjuntar el comprobante correcto. Si ya pagaste, no transfieras otra vez; contacta a la tienda si necesitas ayuda."
          : "Sube la foto o captura de tu comprobante bancario para enviar el pedido a revisión.");
        setProofAttention(true);
        proofSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
    }

    setCheckoutFormError("");
    const submitted = await onCheckout({
      guestCheckout: requiresLogin && guestCheckout,
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
    if (submitted?.ok === false) {
      reportAvailabilityFailure(submitted);
      window.requestAnimationFrame(() => drawAttentionToStock(true));
    }
    } finally {
      checkoutActionBusyRef.current = false;
    }
  };

  const handleCopyAccount = async () => {
    const verified = await checkAvailability();
    if (!verified.ok) { setCheckoutFormError(""); return; }
    const latestAccount = getReadyBankAccounts(verified.paymentSettings || {}).find(account => account.id === selectedBankAccount?.id);
    if (!latestAccount || latestAccount.accountNumber !== selectedBankAccount?.accountNumber) {
      setCheckoutFormError("Los datos bancarios cambiaron. Revisa la cuenta actualizada antes de transferir.");
      return;
    }
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
    const verified = await checkAvailability();
    if (!verified.ok) { setPaymentProofError(""); return; }
    setPaymentProofBusy(true);
    setPaymentProofError("");
    try {
      const nextPaymentProof = await fileToDataUrl(file);
      setPaymentProof(nextPaymentProof);
      setPaymentProofCartKey(cartProofKey);
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
    setPaymentProofCartKey("");
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
        onClick={() => { if (!checkoutBusy) onClose?.(); }}
      >
        <Motion.div
          initial={{ opacity: 0, y: 18, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: 0.22, ease: ANIMATION.easeOut } }}
          exit={{ opacity: 0, y: 10, scale: 0.97, transition: { duration: 0.14, ease: "easeOut" } }}
          className="sheet cart-fullscreen-sheet"
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label="Resumen de tu carrito"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="sheet-header">
            <div>
              <h3 style={{ margin: 0, fontSize: 25 }}>Tu carrito completo</h3>
            </div>
            <button type="button" onClick={onClose} disabled={checkoutBusy} className="icon-btn" aria-label="Cerrar carrito">
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
                <>
                {stockBlocked && (!isCheckoutStep || needsAccountChoice) && (
                  <div className="cart-stock-warning-banner" role="alert" ref={stockNoticeRef} tabIndex={-1}>
                    <AlertCircle size={18} aria-hidden="true" />
                    <div>
                      <strong>No continúes al pago todavía</strong>
                      <p>{!availability.ok ? availability.message : "Una talla ya no está disponible o cambió su stock. Disminuye la cantidad, edita la talla o retira la prenda marcada para continuar."}</p>
                      <button type="button" className="link-btn" onClick={() => { void checkAvailability(); }}>Revisar disponibilidad</button>
                    </div>
                  </div>
                )}
                {(cart || []).map((item) => {
                  const productRecord = effectiveProducts.find((product) => String(product.id) === String(item.id));
                  const availableStock = productRecord ? getStockForVariant(productRecord, item.color, item.size) : 0;
                  const isOutOfStock = availableStock <= 0 || !productRecord || productRecord.isPublic === false;
                  const isOverStock = !isOutOfStock && item.quantity > availableStock;
                  const stockStatus = getStockStatus(availableStock);
                  return (
                    <Motion.div key={item.key} layout className={`cart-item sheet-product-card cart-line-item ${isOutOfStock ? "is-out-of-stock" : ""}`}>
                      <div className="cart-line-layout">
                        <button type="button" disabled={checkoutBusy} onClick={() => onOpenItem(item)} className="sheet-thumb-button cart-line-thumb-btn" aria-label={`Ver ${item.name}`}>
                          <img
                            src={item.image}
                            alt={item.name}
                            className="sheet-product-thumb cart-line-thumb"
                            loading="eager"
                            decoding="async"
                            onError={(event) => {
                              if (event.currentTarget.src !== FALLBACK_IMAGE) {
                                event.currentTarget.src = FALLBACK_IMAGE;
                              }
                            }}
                          />
                        </button>

                        <button type="button" disabled={checkoutBusy} onClick={() => onOpenItem(item)} className="sheet-product-title-button cart-line-main" aria-label={`Ver detalle de ${item.name}`}>
                          <p className="sheet-product-title cart-line-title">{item.name}</p>
                          <p className="muted sheet-product-meta-text cart-line-meta">{item.color} - {item.size}</p>
                          {isOutOfStock ? (
                            <span className="stock-badge stock-badge-danger stock-badge-compact cart-line-stock-badge">
                              <span className="stock-dot" aria-hidden="true" />
                              <span>Agotado</span>
                            </span>
                          ) : isOverStock ? (
                            <span className="stock-badge stock-badge-warning stock-badge-compact cart-line-stock-badge">
                              <span className="stock-dot" aria-hidden="true" />
                              <span>Solo {availableStock} disponible{availableStock === 1 ? "" : "s"}</span>
                            </span>
                          ) : (
                            <span className={`stock-badge stock-badge-${stockStatus.tone} stock-badge-compact cart-line-stock-badge`}>
                              <span className="stock-dot" aria-hidden="true" />
                              <span>{stockStatus.label}</span>
                            </span>
                          )}
                        </button>

                        <div className="cart-line-side">
                          <div className="cart-line-actions">
                            <button type="button" disabled={checkoutBusy} className="btn btn-soft cart-line-edit-btn" onClick={() => onEditItem(item)}>
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
                              disabled={checkoutBusy}
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
                              disabled={checkoutBusy}
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
                              disabled={checkoutBusy || isOutOfStock || item.quantity >= Math.min(10, availableStock)}
                            >
                              <Plus size={14} />
                            </button>
                          </div>
                          <p className="sheet-product-price cart-line-price">{currency(item.price * item.quantity)}</p>
                        </div>
                      </div>
                    </Motion.div>
                  );
                })}
                </>
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

              {cart.length > 0 && !needsAccountChoice && isCheckoutStep && (
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
                        onClick={goBackCheckoutStep}
                      >
                        <ChevronLeft size={14} />
                        {isPaymentStep ? "Editar entrega" : "Volver al resumen"}
                      </button>
                    </div>
                  </div>

                  {checkoutStep === CHECKOUT_STEPS.delivery && (
                    <>
                    {guestCheckout && (
                      <fieldset className="guest-checkout-contact">
                        <legend>Comprar sin cuenta</legend>
                        <p>Podrás consultar tus pedidos en este navegador durante 30 días. Para ayuda desde otro dispositivo, guarda el código de tu pedido y contacta a la tienda.</p>
                        {deliveryType === "pickup" && <>
                          <CheckoutField label="Nombre completo" name="fullName" required error={deliveryErrors.fullName}><input className="input" autoComplete="name" value={deliveryDraft.fullName} onChange={(event) => handleDeliveryDraftChange("fullName", event.target.value)} /></CheckoutField>
                          <CheckoutField label="Teléfono de contacto" name="phone" required error={deliveryErrors.phone}><input className="input" type="tel" inputMode="tel" autoComplete="tel-national" maxLength={10} value={deliveryDraft.phone} onChange={(event) => handleDeliveryDraftChange("phone", event.target.value)} /></CheckoutField>
                        </>}
                      </fieldset>
                    )}
                    <div className="checkout-delivery-switch" role="radiogroup" aria-label="Tipo de entrega">
                    <button
                      type="button"
                      role="radio"
                      id="delivery-choice-pickup"
                      aria-checked={deliveryType === "pickup"}
                      tabIndex={deliveryType === "pickup" ? 0 : -1}
                      className={`checkout-delivery-tab ${deliveryType === "pickup" ? "active" : ""}`}
                      onClick={() => chooseDeliveryType("pickup")}
                      onKeyDown={handleDeliveryTypeKeyDown}
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
                      role="radio"
                      id="delivery-choice-delivery"
                      aria-checked={deliveryType === "delivery"}
                      tabIndex={deliveryType === "delivery" ? 0 : -1}
                      className={`checkout-delivery-tab ${deliveryType === "delivery" ? "active" : ""}`}
                      onClick={() => chooseDeliveryType("delivery")}
                      onKeyDown={handleDeliveryTypeKeyDown}
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
                      <PickupLocation locationNote={pickupNote} mapsLink={pickupMapsLink} mapsEmbedUrl={contactSettings?.mapsEmbedUrl} address={pickupAddress} hideAddress />
                    </div>
                  ) : (
                    <div className="checkout-delivery-form">
                      <div className="checkout-recipient-card">
                        <p className="checkout-section-badge-title">Datos del destinatario (obligatorios)</p>
                        <div className="checkout-delivery-grid recipient-grid">
                          <CheckoutField label="Nombre completo de quien recibe" name="fullName" required error={deliveryErrors.fullName}><input
                            className="input"
                            placeholder="Nombre completo de quien recibe *"
                            aria-label="Nombre completo"
                            value={deliveryDraft.fullName}
                            autoComplete="name"
                            onChange={(event) => handleDeliveryDraftChange("fullName", event.target.value)}
                          /></CheckoutField>
                          <CheckoutField label="Cédula o RUC" name="idNumber" required error={deliveryErrors.idNumber}><input
                            className="input"
                            placeholder="Cédula / RUC (10 a 13 dígitos) *"
                            aria-label="Cédula de identidad"
                            inputMode="numeric"
                            autoComplete="off"
                            maxLength={13}
                            value={deliveryDraft.idNumber}
                            onChange={(event) => handleDeliveryDraftChange("idNumber", event.target.value.replace(/\D/g, "").slice(0, 13))}
                          /></CheckoutField>
                          <CheckoutField label="Teléfono móvil" name="phone" required error={deliveryErrors.phone}><input
                            className="input"
                            placeholder="Teléfono móvil (10 dígitos) *"
                            aria-label="Teléfono para entrega"
                            inputMode="tel"
                            type="tel"
                            autoComplete="tel-national"
                            maxLength={10}
                            value={deliveryDraft.phone}
                            onChange={(event) => handleDeliveryDraftChange("phone", event.target.value.replace(/\D/g, "").slice(0, 10))}
                          /></CheckoutField>
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
                              <CheckoutField label="Ciudad o cantón" name="city" required error={deliveryErrors.city}><input
                                className="input"
                                placeholder="Ciudad / Cantón *"
                                aria-label="Ciudad"
                                value={deliveryDraft.city}
                                autoComplete="address-level2"
                                onChange={(event) => handleDeliveryDraftChange("city", event.target.value)}
                              /></CheckoutField>
                              <CheckoutField label="Dirección exacta" name="address" required className="checkout-delivery-full" error={deliveryErrors.address}><textarea
                                className="textarea checkout-delivery-full"
                                placeholder="Dirección exacta (Calle principal, número e intersección) *"
                                aria-label="Dirección exacta"
                                value={deliveryDraft.address}
                                autoComplete="street-address"
                                onChange={(event) => handleDeliveryDraftChange("address", event.target.value)}
                              /></CheckoutField>
                              <CheckoutField label="Referencia de entrega (opcional)" name="reference" className="checkout-delivery-full"><textarea
                                className="textarea checkout-delivery-full"
                                placeholder="Referencia de entrega (Opcional: Color de fachada, depto, indicaciones...)"
                                aria-label="Referencia de entrega (opcional)"
                                value={deliveryDraft.reference}
                                onChange={(event) => handleDeliveryDraftChange("reference", event.target.value)}
                              /></CheckoutField>
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

                  <div className={`checkout-availability-notice ${availability.ok && !hasUnavailableItems ? "is-verified" : "is-blocked"}`} role={availability.ok && !hasUnavailableItems ? "status" : "alert"} ref={stockNoticeRef} tabIndex={-1}>
                    <AlertCircle size={16} aria-hidden="true" />
                    <div><strong>{availability.ok && !hasUnavailableItems ? "Disponibilidad actualizada" : "No realices el pago todavía"}</strong><p>{!availability.ok ? availability.message : hasUnavailableItems ? "Una prenda se agotó o cambió su stock. Ajusta el carrito antes de pagar." : availability.message}</p>{isPaymentStep && (!availability.ok || hasUnavailableItems) && <p>Si ya transferiste, no vuelvas a pagar. Conserva tu comprobante y {assistanceUrl ? <a href={assistanceUrl} target="_blank" rel="noopener noreferrer">contacta a la tienda</a> : "contacta a la tienda"} para resolverlo.</p>}</div>
                    {isPaymentStep && availability.reservationId && <span className="checkout-reservation-time" aria-live="off">{reservationRemaining > 0 ? `Reserva: ${Math.floor(reservationRemaining / 60)}:${String(reservationRemaining % 60).padStart(2, "0")}` : "Reserva vencida. No realices el pago."}</span>}
                    {(!availability.ok || (isPaymentStep && !reservationValid)) && <button type="button" className="link-btn" onClick={() => { void checkAvailability({ reserve: isPaymentStep }); }}>{isPaymentStep ? "Revisar y reservar de nuevo" : "Reintentar"}</button>}
                  </div>

                  {isPaymentStep && reservationValid && !hasUnavailableItems && (
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
                      <button type="button" className="link-btn" onClick={goBackCheckoutStep}>Editar</button>
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
                                onClick={async () => {
                                  const verified = await checkAvailability();
                                  if (!verified.ok) { setCheckoutFormError(""); return; }
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
                            onClick={async () => {
                              const verified = await checkAvailability();
                              if (!verified.ok) { setCheckoutFormError(""); return; }
                              const latestAccount = getReadyBankAccounts(verified.paymentSettings || {}).find(account => account.id === selectedBankAccount?.id);
                              if (!latestAccount || latestAccount.bankQrImage !== bankQrImage) { setCheckoutFormError("El QR bancario cambió. Revisa los datos actualizados antes de transferir."); return; }
                              setLightboxImage({
                              src: bankQrImage,
                              alt: `QR para transferir a ${sanitizeLine(selectedBankAccount?.bankName || "la cuenta bancaria")}`,
                              title: `QR · ${sanitizeLine(selectedBankAccount?.bankName || "Cuenta bancaria")}`,
                            }); }}
                            aria-label={`Abrir QR de ${sanitizeLine(selectedBankAccount?.bankName || "la cuenta bancaria")}`}
                          >
                            <img className="checkout-bank-qr" src={bankQrImage} alt="" />
                            <span><ZoomIn size={13} />Ampliar QR</span>
                          </button>
                        ) : null}
                      </div>
                      <div
                        ref={proofSectionRef}
                        className={`checkout-payment-proof ${paymentProof ? "has-file" : ""} ${proofAttention && (!paymentProof || !proofMatchesCart) ? "is-required-attention" : ""}`}
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
                              <span>{proofMatchesCart ? "Listo para guardar con el pedido" : "El carrito cambió. Revisa el importe antes de enviarlo."}</span>
                            </div>
                            <button type="button" disabled={checkoutBusy} className="icon-btn" onClick={handleRemovePaymentProof} aria-label="Quitar comprobante">
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
                          <strong>Solicita tu enlace seguro por WhatsApp</strong>
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

              {!isCheckoutStep && checkoutFormError && (
                <div className="checkout-form-notice" role="alert">
                  <AlertCircle size={16} aria-hidden="true" />
                  <span>{checkoutFormError}</span>
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
                  disabled={cart.length === 0 || checkoutDisabled || checkoutBusy || availabilityBusy || hasUnavailableItems || (isPaymentStep && !reservationValid)}
                  aria-busy={checkoutBusy || availabilityBusy}
                >
                  {isPaymentStep
                    ? (selectedPaymentMethod === PAYMENT_METHODS.transfer ? <Landmark size={18} /> : <MessageCircle size={18} />)
                    : <ChevronRight size={18} />}
                  {checkoutButtonLabel}
                </button>
              </div>
              {needsAccountChoice && cart.length > 0 && (
                <button type="button" className="btn btn-outline" onClick={async () => { if (availabilityBusy) return; setAvailabilityBusy(true); let verified; try { verified = await checkAvailability(); } finally { setAvailabilityBusy(false); } if (!verified.ok) { setCheckoutFormError(""); return; } setGuestCheckout(true); changeCheckoutStep(CHECKOUT_STEPS.delivery); setCheckoutFormError(""); }} disabled={availabilityBusy || hasUnavailableItems}>Comprar sin cuenta</button>
              )}
              {needsAccountChoice && cart.length > 0 && (
                <p className="helper-text sheet-login-hint">
                  Puedes comprar sin cuenta o iniciar sesión para guardar tus direcciones y seguir tus compras desde otros dispositivos.
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
