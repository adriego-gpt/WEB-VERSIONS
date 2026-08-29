import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  X,
  Star,
  ChevronLeft,
  ChevronRight,
  Eye,
  Truck,
  RotateCcw,
  ShieldCheck,
  ShoppingBag,
} from "lucide-react";
import { motion as Motion, AnimatePresence } from "framer-motion";
import { ANIMATION } from "../../constants/animation";
import { FALLBACK_IMAGE } from "../../constants/product";
import { useSwipeGesture } from "../../hooks/useSwipeGesture";
import { currency, discountPercent } from "../../utils/currency";
import { getProductColorSwatch } from "../../utils/productColor";
import { triggerHaptic } from "../../utils/haptics";
import {
  getSelectionForColor,
  getImagesForColor,
  getSizesForColor,
  getStockForVariant,
  getStockStatus,
} from "../../domain/products/variants";

export function ProductModal({
  product,
  selection,
  onClose,
  onChange,
  onAddToCart,
  cartEditMode = false,
  isAdmin,
  onEditProduct,
  recommendations = [],
  onOpenRecommendation,
}) {
  const resolvedSelection = product ? getSelectionForColor(product, selection) : null;
  const [imageIndex, setImageIndex] = useState(0);
  const [imagePreviewOpen, setImagePreviewOpen] = useState(false);
  const [previewScale, setPreviewScale] = useState(1);
  const [previewZoomOrigin, setPreviewZoomOrigin] = useState("50% 50%");
  const [previewPan, setPreviewPan] = useState({ x: 0, y: 0 });
  const [previewPanning, setPreviewPanning] = useState(false);
  const previewSwipeStartRef = useRef(null);
  const previewSwipeIntentRef = useRef(null);
  const previewDidSwipeRef = useRef(false);
  const previewHandledByPointerRef = useRef(false);
  const previewPanStartRef = useRef(null);
  const previewPointersRef = useRef(new Map());
  const previewPinchRef = useRef(null);
  const recommendationTrackRef = useRef(null);
  const modalRef = useRef(null);
  const modalRightRef = useRef(null);
  const previewScaleRef = useRef(1);
  const previewPanRef = useRef({ x: 0, y: 0 });
  const imagePreviewOpenRef = useRef(false);
  const detailHistoryKeyRef = useRef(null);
  const initialProductIdRef = useRef(product?.id);
  const previewHistoryKeyRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const currentImages = product ? getImagesForColor(product, resolvedSelection?.color) : [];
  const safeImageIndex = currentImages.length ? Math.min(imageIndex, currentImages.length - 1) : 0;
  const activeImage = currentImages[safeImageIndex] || currentImages[0] || FALLBACK_IMAGE;
  const discount = product ? discountPercent(product.price, product.oldPrice) : 0;
  const sizesForSelectedColor = product ? getSizesForColor(product, resolvedSelection?.color) : [];
  const selectedStock = product ? getStockForVariant(product, resolvedSelection?.color, resolvedSelection?.size) : 0;
  const stockStatus = getStockStatus(selectedStock);
  const isLowStock = selectedStock > 0 && selectedStock <= 2;
  const hasMultipleImages = currentImages.length > 1;
  const previewZoomed = previewScale > 1.01;
  const isTouchLikePointer = (pointerType) => pointerType === "touch" || pointerType === "pen";
  const clampPreviewPan = (pan, scale, element) => {
    const maxX = Math.max(0, (element.offsetWidth * (scale - 1)) / 2);
    const maxY = Math.max(0, (element.offsetHeight * (scale - 1)) / 2);
    return {
      x: Math.max(-maxX, Math.min(maxX, pan.x)),
      y: Math.max(-maxY, Math.min(maxY, pan.y)),
    };
  };
  const setPreviewTransform = (scale, pan) => {
    previewScaleRef.current = scale;
    previewPanRef.current = pan;
    setPreviewScale(scale);
    setPreviewPan(pan);
  };
  const resetImagePreview = useCallback(() => {
    imagePreviewOpenRef.current = false;
    setImagePreviewOpen(false);
    previewScaleRef.current = 1;
    previewPanRef.current = { x: 0, y: 0 };
    setPreviewScale(1);
    setPreviewZoomOrigin("50% 50%");
    setPreviewPan({ x: 0, y: 0 });
    setPreviewPanning(false);
    previewSwipeStartRef.current = null;
    previewSwipeIntentRef.current = null;
    previewDidSwipeRef.current = false;
    previewHandledByPointerRef.current = false;
    previewPanStartRef.current = null;
    previewPointersRef.current.clear();
    previewPinchRef.current = null;
  }, [setImagePreviewOpen, setPreviewPan, setPreviewPanning, setPreviewScale, setPreviewZoomOrigin]);

  const openImagePreview = () => {
    if (typeof window !== "undefined") {
      const historyKey = `${detailHistoryKeyRef.current}-image`;
      previewHistoryKeyRef.current = historyKey;
      window.history.pushState(
        { ...window.history.state, adriegoOverlayKey: historyKey, adriegoOverlay: "product-image-preview" },
        "",
        window.location.href,
      );
    }
    imagePreviewOpenRef.current = true;
    setImagePreviewOpen(true);
    previewScaleRef.current = 1;
    previewPanRef.current = { x: 0, y: 0 };
    setPreviewScale(1);
    setPreviewZoomOrigin("50% 50%");
    setPreviewPan({ x: 0, y: 0 });
    setPreviewPanning(false);
    previewSwipeStartRef.current = null;
    previewSwipeIntentRef.current = null;
    previewDidSwipeRef.current = false;
    previewHandledByPointerRef.current = false;
    previewPointersRef.current.clear();
    previewPinchRef.current = null;
  };

  const closeImagePreview = useCallback(() => {
    if (typeof window !== "undefined" && window.history.state?.adriegoOverlayKey === previewHistoryKeyRef.current) {
      window.history.back();
      return;
    }
    resetImagePreview();
  }, [resetImagePreview]);

  const closeProductDetail = useCallback(() => {
    if (typeof window !== "undefined" && window.history.state?.adriegoOverlayKey === detailHistoryKeyRef.current) {
      window.history.back();
      return;
    }
    onCloseRef.current?.();
  }, []);

  const updatePreviewZoomOrigin = (event) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const x = ((event.clientX - bounds.left) / bounds.width) * 100;
    const y = ((event.clientY - bounds.top) / bounds.height) * 100;
    setPreviewZoomOrigin(`${x}% ${y}%`);
  };

  const togglePreviewZoom = (event) => {
    const nextScale = previewScaleRef.current > 1.01 ? 1 : 2.2;
    if (event && nextScale > 1) {
      updatePreviewZoomOrigin(event);
    }
    setPreviewTransform(nextScale, { x: 0, y: 0 });
    setPreviewPanning(false);
  };

  const handleDetailImageClick = () => {
    openImagePreview();
  };

  const handlePreviewPointerDown = (event) => {
    if (!isTouchLikePointer(event.pointerType)) return;
    const pointer = { x: event.clientX, y: event.clientY };
    previewPointersRef.current.set(event.pointerId, pointer);
    event.currentTarget.setPointerCapture?.(event.pointerId);

    if (previewPointersRef.current.size >= 2) {
      const [first, second] = [...previewPointersRef.current.values()];
      previewPinchRef.current = {
        distance: Math.hypot(second.x - first.x, second.y - first.y),
        scale: previewScaleRef.current,
        pan: previewPanRef.current,
        center: { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 },
      };
      previewSwipeStartRef.current = null;
      previewSwipeIntentRef.current = null;
      setPreviewPanning(true);
      return;
    }

    if (previewScaleRef.current > 1.01) {
      previewPanStartRef.current = {
        x: event.clientX,
        y: event.clientY,
        panX: previewPanRef.current.x,
        panY: previewPanRef.current.y,
      };
      setPreviewPanning(true);
      return;
    }
    previewSwipeStartRef.current = { x: event.clientX, y: event.clientY };
    previewSwipeIntentRef.current = null;
    previewDidSwipeRef.current = false;
  };

  const handlePreviewPointerMove = (event) => {
    if (!isTouchLikePointer(event.pointerType)) return;
    if (!previewPointersRef.current.has(event.pointerId)) return;
    previewPointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (previewPointersRef.current.size >= 2) {
      const [first, second] = [...previewPointersRef.current.values()];
      const pinch = previewPinchRef.current || {
        distance: Math.hypot(second.x - first.x, second.y - first.y),
        scale: previewScaleRef.current,
        pan: previewPanRef.current,
        center: { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 },
      };
      previewPinchRef.current = pinch;
      const distance = Math.hypot(second.x - first.x, second.y - first.y);
      const scale = Math.max(1, Math.min(3.5, pinch.scale * (distance / Math.max(1, pinch.distance))));
      const center = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
      const pan = clampPreviewPan({
        x: pinch.pan.x + center.x - pinch.center.x,
        y: pinch.pan.y + center.y - pinch.center.y,
      }, scale, event.currentTarget);
      setPreviewTransform(scale, pan);
      setPreviewPanning(true);
      previewHandledByPointerRef.current = true;
      if (event.cancelable) event.preventDefault();
      return;
    }

    if (previewScaleRef.current > 1.01 && previewPanStartRef.current) {
      const { x, y, panX, panY } = previewPanStartRef.current;
      const pan = clampPreviewPan({ x: panX + event.clientX - x, y: panY + event.clientY - y }, previewScaleRef.current, event.currentTarget);
      setPreviewTransform(previewScaleRef.current, pan);
      if (event.cancelable) event.preventDefault();
      return;
    }
    if (!previewSwipeStartRef.current) return;
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
    if (!isTouchLikePointer(event.pointerType)) return;
    const hadPinch = Boolean(previewPinchRef.current) || previewPointersRef.current.size >= 2;
    previewPointersRef.current.delete(event.pointerId);
    if (hadPinch) {
      previewPinchRef.current = null;
      const [remainingPointer] = previewPointersRef.current.values();
      if (remainingPointer && previewScaleRef.current > 1.01) {
        previewPanStartRef.current = {
          x: remainingPointer.x,
          y: remainingPointer.y,
          panX: previewPanRef.current.x,
          panY: previewPanRef.current.y,
        };
      } else {
        setPreviewPanning(false);
      }
      previewHandledByPointerRef.current = true;
      return;
    }
    if (previewScaleRef.current > 1.01 && previewPanStartRef.current) {
      const { x, y } = previewPanStartRef.current;
      const wasTap = Math.abs(event.clientX - x) < 10 && Math.abs(event.clientY - y) < 10;
      previewPanStartRef.current = null;
      setPreviewPanning(false);
      previewHandledByPointerRef.current = true;
      if (wasTap) togglePreviewZoom(event);
      return;
    }
    if (!previewSwipeStartRef.current) return;
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

  const scrollRecommendations = (direction) => {
    recommendationTrackRef.current?.scrollBy({
      left: direction * Math.max(180, recommendationTrackRef.current.clientWidth * 0.72),
      behavior: "smooth",
    });
  };

  const goToPreviousImage = () => {
    if (!hasMultipleImages) return;
    setImageIndex((previous) => (previous - 1 + currentImages.length) % currentImages.length);
  };

  const goToNextImage = () => {
    if (!hasMultipleImages) return;
    setImageIndex((previous) => (previous + 1) % currentImages.length);
  };

  const detailImageSwipeHandlers = useSwipeGesture({
    enabled: hasMultipleImages,
    onSwipeLeft: goToNextImage,
    onSwipeRight: goToPreviousImage,
  });

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setImageIndex(0);
      resetImagePreview();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [resetImagePreview, resolvedSelection?.color, product?.id]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (modalRef.current) modalRef.current.scrollTop = 0;
      if (modalRightRef.current) modalRightRef.current.scrollTop = 0;
    });

    return () => window.cancelAnimationFrame(frame);
  }, [product?.id]);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const productId = initialProductIdRef.current;
    if (!productId || typeof window === "undefined") return undefined;
    const historyKey = `product-detail-${productId}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    detailHistoryKeyRef.current = historyKey;
    window.history.pushState(
      { ...window.history.state, adriegoOverlayKey: historyKey, adriegoOverlay: "product-detail" },
      "",
      window.location.href,
    );
    const handlePopState = () => {
      if (imagePreviewOpenRef.current) {
        resetImagePreview();
        return;
      }
      onCloseRef.current?.();
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [resetImagePreview]);

  const previousFocusRef = useRef(null);

  useEffect(() => {
    if (product) {
      previousFocusRef.current = document.activeElement;
    } else if (previousFocusRef.current instanceof HTMLElement && previousFocusRef.current.isConnected) {
      previousFocusRef.current.focus();
    }
  }, [product]);

  useEffect(() => {
    if (!product || typeof window === "undefined") return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (imagePreviewOpen) {
          closeImagePreview();
        } else {
          closeProductDetail();
        }
      } else if (event.key === "ArrowLeft" && hasMultipleImages) {
        event.preventDefault();
        setImageIndex((previous) => (previous - 1 + currentImages.length) % currentImages.length);
      } else if (event.key === "ArrowRight" && hasMultipleImages) {
        event.preventDefault();
        setImageIndex((previous) => (previous + 1) % currentImages.length);
      } else if (event.key === "Tab") {
        const FOCUSABLE_SELECTOR = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
        const focusableElements = [...(modalRef.current?.querySelectorAll(FOCUSABLE_SELECTOR) || [])];
        if (focusableElements.length > 0) {
          const first = focusableElements[0];
          const last = focusableElements[focusableElements.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [product, hasMultipleImages, currentImages.length, imagePreviewOpen, closeImagePreview, closeProductDetail]);

  if (!product) return null;

  return (
    <AnimatePresence>
      <Motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, transition: { duration: 0.2, ease: "easeOut" } }}
        exit={{ opacity: 0, transition: { duration: 0.14, ease: "easeOut" } }}
        className="modal-backdrop"
        onClick={closeProductDetail}
      >
        <Motion.div
          initial={{ opacity: 0, y: 18, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: 0.22, ease: ANIMATION.easeOut } }}
          exit={{ opacity: 0, y: 10, scale: 0.97, transition: { duration: 0.14, ease: "easeOut" } }}
          className="modal"
          ref={modalRef}
          role="dialog"
          aria-modal="true"
          aria-label={`Detalle de ${product.name}`}
          onClick={(event) => event.stopPropagation()}
        >
          <button onClick={closeProductDetail} className="icon-btn product-modal-close" aria-label="Cerrar detalle del producto">
            <X size={18} />
          </button>

          <div className="modal-left">
            <button onClick={closeProductDetail} className="icon-btn product-modal-mobile-close" aria-label="Cerrar detalle del producto">
              <X size={18} />
            </button>
            <AnimatePresence mode="wait">
              <button
                type="button"
                className="modal-image-open-btn"
                {...detailImageSwipeHandlers}
                onClick={handleDetailImageClick}
                aria-label={`Abrir imagen ampliada de ${product.name}`}
              >
                <Motion.img
                  key={`${product.id}-${resolvedSelection?.color}-${safeImageIndex}-${activeImage}`}
                  src={activeImage}
                  alt={product.name}
                  loading="eager"
                  decoding="async"
                  initial={{ opacity: 0.8, scale: 1.01 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0.8, scale: 0.99 }}
                  transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                  className="modal-img"
                  draggable={false}
                  style={{
                    cursor: "zoom-in",
                    touchAction: "pan-y pinch-zoom",
                  }}
                  onError={(event) => {
                    if (event.currentTarget.src !== FALLBACK_IMAGE) {
                      event.currentTarget.src = FALLBACK_IMAGE;
                    }
                  }}
                />
              </button>
            </AnimatePresence>
            <div className="product-modal-zoom-wrap">
              <button type="button" className="badge badge-light modal-zoom-toggle" onClick={openImagePreview} aria-label="Abrir imagen del producto">
                <span className="pointer-instruction">Haz clic para ampliar</span>
                <span className="touch-instruction">Toca para ampliar</span>
              </button>
            </div>
            {hasMultipleImages && (
              <>
                <button
                  className="icon-btn carousel-arrow left"
                  type="button"
                  onClick={() => {
                    triggerHaptic("light");
                    goToPreviousImage();
                  }}
                  aria-label="Imagen anterior"
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  className="icon-btn carousel-arrow right"
                  type="button"
                  onClick={() => {
                    triggerHaptic("light");
                    goToNextImage();
                  }}
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

          <div className="modal-right" ref={modalRightRef}>
            <div className="product-modal-heading">
              <div className="product-modal-identity">
                <p className="product-modal-category-eyebrow">
                  {product.category} · {product.productType || "Colección"}
                </p>
                <h3 className="product-modal-title">{product.name}</h3>
              </div>

              <div className="product-modal-price-row">
                <div className="product-modal-price-block">
                  <span className="product-modal-price">{currency(product.price)}</span>
                  {product.oldPrice > product.price && (
                    <span className="product-modal-old-price">{currency(product.oldPrice)}</span>
                  )}
                </div>
                <div className="product-modal-badges">
                  {discount > 0 && <span className="badge badge-offer">-{discount}%</span>}
                  <span className="badge badge-light"><Star size={13} fill="currentColor" /> {product.rating || "4.9"}</span>
                  {product.newArrival && <span className="badge badge-dark">Nuevo</span>}
                </div>
              </div>
            </div>

            <p className="product-modal-description muted">{product.description}</p>

            <div className="product-modal-variant-panel">
              <fieldset className="product-modal-option-group">
                <legend className="product-modal-option-legend">
                  <span>Color: <strong>{resolvedSelection?.color}</strong></span>
                </legend>
                <div className="product-modal-option-scroll product-modal-color-list">
                  {product.colors.map((color) => (
                    <button
                      type="button"
                      key={color}
                      onClick={() => {
                        triggerHaptic("selection");
                        onChange(product.id, "color", color);
                      }}
                      className={`product-modal-color-option${resolvedSelection?.color === color ? " active" : ""}`}
                      aria-pressed={resolvedSelection?.color === color}
                      aria-label={`Elegir color ${color}`}
                    >
                      <span className="product-modal-color-swatch" style={{ "--variant-swatch": getProductColorSwatch(color, product.colorSwatches?.[color]) }} />
                      <span>{color}</span>
                    </button>
                  ))}
                </div>
              </fieldset>

              <fieldset className="product-modal-option-group product-modal-size-group">
                <legend className="product-modal-option-legend product-modal-size-legend">
                  <span>Talla: <strong>{resolvedSelection?.size}</strong></span>
                  <span className={`stock-badge stock-badge-${stockStatus.tone} ${isLowStock ? "stock-badge-low" : ""}`}>
                    <span className="stock-dot" aria-hidden="true" />
                    <span>
                      {isLowStock
                        ? (selectedStock === 1 ? `Última unidad` : `Quedan ${selectedStock} uds.`)
                        : stockStatus.label}
                    </span>
                  </span>
                </legend>
                <div className="product-modal-option-scroll product-modal-size-list">
                  {sizesForSelectedColor.map((size) => {
                    const sizeStock = getStockForVariant(product, resolvedSelection?.color, size);
                    return (
                      <button
                        type="button"
                        key={size}
                        onClick={() => {
                          if (sizeStock > 0) {
                            triggerHaptic("selection");
                            onChange(product.id, "size", size);
                          }
                        }}
                        className={`product-modal-size-option${resolvedSelection?.size === size ? " active" : ""}`}
                        disabled={sizeStock <= 0}
                        aria-pressed={resolvedSelection?.size === size}
                        aria-label={`Elegir talla ${size}${sizeStock <= 0 ? ", agotada" : ""}`}
                      >
                        {size}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            </div>

            <div className={`product-modal-actions ${isAdmin ? "product-modal-actions-admin" : ""}`}>
              <button
                className="btn btn-primary product-modal-buy-btn"
                onClick={(event) => {
                  if (selectedStock > 0) {
                    triggerHaptic("medium");
                    onAddToCart(product, { sourceElement: event.currentTarget, image: activeImage });
                  }
                }}
                disabled={selectedStock <= 0}
                style={{ opacity: selectedStock <= 0 ? 0.6 : 1, cursor: selectedStock <= 0 ? "not-allowed" : "pointer" }}
              >
                <ShoppingBag size={18} />
                <span>
                  {selectedStock <= 0
                    ? "Agotado"
                    : (cartEditMode
                      ? "Guardar cambios"
                      : `Agregar al carrito · ${currency(product.price)}`)}
                </span>
              </button>
              <button className="btn btn-outline product-modal-dismiss-btn" onClick={onClose}>
                Seguir viendo
              </button>
              {isAdmin && (
                <button className="btn btn-soft" onClick={() => onEditProduct(product)}>
                  <Eye size={16} />
                  Editar
                </button>
              )}
            </div>

            <div className="product-modal-trust-strip">
              <div className="product-modal-trust-item">
                <Truck size={17} strokeWidth={1.5} className="trust-icon" />
                <span className="trust-title">Envíos Seguros</span>
                <span className="trust-subtitle">Por WhatsApp</span>
              </div>
              <div className="product-modal-trust-divider" aria-hidden="true" />
              <div className="product-modal-trust-item">
                <RotateCcw size={17} strokeWidth={1.5} className="trust-icon" />
                <span className="trust-title">Cambios Fáciles</span>
                <span className="trust-subtitle">Asesoría directa</span>
              </div>
              <div className="product-modal-trust-divider" aria-hidden="true" />
              <div className="product-modal-trust-item">
                <ShieldCheck size={17} strokeWidth={1.5} className="trust-icon" />
                <span className="trust-title">Compra Confiable</span>
                <span className="trust-subtitle">Garantía oficial</span>
              </div>
            </div>

            {recommendations.length > 0 && onOpenRecommendation && (
              <section className="product-modal-related" aria-labelledby="product-related-title">
                <div className="product-modal-related-header">
                  <div>
                    <p className="product-modal-related-eyebrow">Para seguir explorando</p>
                    <h4 id="product-related-title">También te puede gustar</h4>
                  </div>
                  <div className="product-modal-recommend-controls" aria-label="Mover recomendaciones">
                    <button type="button" className="product-modal-recommend-arrow" onClick={() => scrollRecommendations(-1)} aria-label="Recomendaciones anteriores">
                      <ChevronLeft size={17} />
                    </button>
                    <button type="button" className="product-modal-recommend-arrow" onClick={() => scrollRecommendations(1)} aria-label="Más recomendaciones">
                      <ChevronRight size={17} />
                    </button>
                  </div>
                </div>
                <div className="product-modal-related-carousel">
                  <div ref={recommendationTrackRef} className="product-modal-recommend-grid">
                    {recommendations.map((recommendedProduct) => {
                      const recommendedSelection = getSelectionForColor(recommendedProduct, null);
                      const recommendedImage = getImagesForColor(recommendedProduct, recommendedSelection?.color)[0] || FALLBACK_IMAGE;
                      const recommendedDiscount = discountPercent(recommendedProduct.price, recommendedProduct.oldPrice);
                      return (
                        <button
                          key={recommendedProduct.id}
                          type="button"
                          className="product-modal-recommend-card"
                          onClick={() => onOpenRecommendation(recommendedProduct)}
                          aria-label={`Ver ${recommendedProduct.name}, ${currency(recommendedProduct.price)}`}
                        >
                          <span className="product-modal-recommend-image-wrap">
                            <img
                              src={recommendedImage}
                              alt=""
                              loading="lazy"
                              decoding="async"
                              onError={(event) => {
                                if (event.currentTarget.src !== FALLBACK_IMAGE) event.currentTarget.src = FALLBACK_IMAGE;
                              }}
                            />
                            <span className="product-modal-recommend-price">{currency(recommendedProduct.price)}</span>
                            {recommendedDiscount > 0 && <span className="product-modal-recommend-discount">-{recommendedDiscount}%</span>}
                          </span>
                          <span className="product-modal-recommend-body">
                            <span className="product-modal-recommend-name">{recommendedProduct.name}</span>
                            <span className="product-modal-recommend-footer">
                              <span>{recommendedProduct.productType || recommendedProduct.category || "Prenda"}</span>
                              <strong><Eye size={13} aria-hidden="true" /> Ver detalle</strong>
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </section>
            )}
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
                transform: previewZoomed
                  ? `translate3d(${previewPan.x}px, ${previewPan.y}px, 0) scale(${previewScale})`
                  : "translate3d(0, 0, 0) scale(1)",
                transformOrigin: previewZoomed ? "center center" : previewZoomOrigin,
                transition: previewPanning ? "none" : "transform 160ms var(--ease-standard)",
                cursor: previewZoomed ? (previewPanning ? "grabbing" : "grab") : "zoom-in",
                touchAction: "none",
                willChange: "transform",
              }}
              onClick={handlePreviewImageClick}
              onPointerDown={handlePreviewPointerDown}
              onPointerMove={handlePreviewPointerMove}
              onPointerUp={handlePreviewPointerUp}
              onPointerCancel={() => {
                previewSwipeStartRef.current = null;
                previewSwipeIntentRef.current = null;
                previewPanStartRef.current = null;
                previewPointersRef.current.clear();
                previewPinchRef.current = null;
                setPreviewPanning(false);
              }}
              onMouseMove={(event) => {
                if (!previewZoomed || previewPanning) return;
                updatePreviewZoomOrigin(event);
              }}
              onError={(event) => {
                if (event.currentTarget.src !== FALLBACK_IMAGE) {
                  event.currentTarget.src = FALLBACK_IMAGE;
                }
              }}
            />
            <p className="image-preview-hint" aria-live="polite">
              <span className="pointer-instruction">
                {previewZoomed ? "Arrastra para recorrer la imagen" : "Haz clic en la imagen para acercar"}
              </span>
              <span className="touch-instruction">
                {previewZoomed ? "Arrastra con un dedo o ajusta con dos dedos" : "Separa dos dedos para acercar"}
              </span>
            </p>
          </Motion.div>
        </Motion.div>
      )}
    </AnimatePresence>
  );
}

export default ProductModal;
