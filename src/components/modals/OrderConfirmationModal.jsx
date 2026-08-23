import React, { useEffect, useRef, useState } from "react";
import { CheckCircle2, MessageCircle, Copy, Check, Package, X, Store, Truck, ArrowRight } from "lucide-react";
import { motion as Motion, AnimatePresence } from "framer-motion";

function formatCurrency(value) {
  return new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" }).format(Number(value) || 0);
}

export function OrderConfirmationModal({
  open,
  order,
  onClose,
  onOpenWhatsApp,
  onCopySummary,
  onViewOrders,
}) {
  const [copied, setCopied] = useState(false);
  const primaryButtonRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const timeoutId = window.setTimeout(() => {
      primaryButtonRef.current?.focus();
    }, 50);

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose?.();
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  if (!open || !order) return null;

  const items = Array.isArray(order.items) ? order.items : [];
  const isDelivery = order.deliveryType === "delivery";
  const isCardLink = order.paymentMethod === "card_link";

  const handleCopy = () => {
    if (typeof onCopySummary === "function") {
      onCopySummary(order);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2500);
  };

  return (
    <AnimatePresence>
      <Motion.div
        className="modal-backdrop order-confirmation-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={onClose}
      >
        <Motion.div
          className="sheet order-confirmation-sheet"
          role="dialog"
          aria-modal="true"
          aria-labelledby="order-confirm-title"
          aria-describedby="order-confirm-desc"
          initial={{ opacity: 0, y: 28, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.97 }}
          transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="sheet-header order-confirm-header">
            <div className="order-confirm-title-wrap">
              <div className="order-success-icon-badge" aria-hidden="true">
                <CheckCircle2 size={24} className="success-icon" />
              </div>
              <div>
                <p className="muted order-kicker" style={{ margin: 0, textTransform: "uppercase", letterSpacing: ".2em", fontSize: 12 }}>
                  ¡Pedido recibido!
                </p>
                <h2 id="order-confirm-title" style={{ margin: "4px 0 0", fontSize: "1.5rem", fontWeight: 700 }}>
                  Código #{order.code}
                </h2>
              </div>
            </div>
            <button
              type="button"
              className="icon-btn order-confirm-close"
              onClick={onClose}
              aria-label="Cerrar confirmación de pedido"
            >
              <X size={18} />
            </button>
          </div>

          <div className="sheet-body order-confirm-body" tabIndex={0}>
            {/* Status explanation notice */}
            <div className="order-pending-notice" id="order-confirm-desc" role="status" aria-live="polite">
              <div className="order-pending-badge-row">
                <span className="badge badge-accent">Estado: Pendiente de confirmación</span>
                <span className="order-delivery-mode-tag">
                  {isDelivery ? <><Truck size={14} /> Envío a domicilio</> : <><Store size={14} /> Retiro en tienda</>}
                </span>
              </div>
              <p className="order-pending-text" style={{ margin: "8px 0 0", fontSize: "0.92rem", lineHeight: 1.45 }}>
                Recibimos tu pedido. <strong>Para confirmarlo y coordinar el pago o la entrega</strong>, envíanos el resumen por WhatsApp.
              </p>
            </div>

            {/* Order Items Breakdown */}
            <div className="order-confirm-items-block">
              <p className="order-section-subtitle" style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".1em" }}>
                Resumen de tu compra ({items.length} {items.length === 1 ? "artículo" : "artículos"})
              </p>
              <div className="order-confirm-items-list">
                {items.map((item, idx) => (
                  <div key={item.key || idx} className="order-confirm-item-row">
                    <div className="order-item-main">
                      <p style={{ margin: 0, fontWeight: 600, fontSize: "0.95rem" }}>{item.name}</p>
                      <p className="muted" style={{ margin: "2px 0 0", fontSize: "0.82rem" }}>
                        Color: {item.color} · Talla: {item.size} · Cantidad: {item.quantity}
                      </p>
                    </div>
                    <span style={{ fontWeight: 700, fontSize: "0.95rem" }}>
                      {formatCurrency((item.price || 0) * (item.quantity || 1))}
                    </span>
                  </div>
                ))}
              </div>

              {/* Total calculation */}
              <div className="order-confirm-total-box">
                <div className="order-total-row">
                  <span className="muted">Subtotal:</span>
                  <span>{formatCurrency(order.subtotal)}</span>
                </div>
                {Number(order.discountAmount || 0) > 0 && (
                  <div className="order-total-row discount-row" style={{ color: "var(--brand-accent, #c57a45)" }}>
                    <span>Descuento ({order.couponCode || "cupón"}):</span>
                    <span>-{formatCurrency(order.discountAmount)}</span>
                  </div>
                )}
                {Number(order.paymentFeeAmount || 0) > 0 && (
                  <div className="order-total-row">
                    <span>Comisión tarjeta ({Number(order.paymentFeePercent || 6)}%):</span>
                    <span>+{formatCurrency(order.paymentFeeAmount)}</span>
                  </div>
                )}
                <div className="order-total-row">
                  <span className="muted">Forma de pago:</span>
                  <strong>{order.paymentMethodLabel || (isCardLink ? "Tarjeta mediante enlace" : "Transferencia bancaria")}</strong>
                </div>
                <div className="order-total-row final-total-row">
                  <strong>Total a pagar:</strong>
                  <strong className="order-final-amount">{formatCurrency(order.total || order.subtotal)}</strong>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="order-confirm-actions">
              <button
                ref={primaryButtonRef}
                type="button"
                className="btn btn-primary order-btn-whatsapp"
                onClick={() => onOpenWhatsApp?.(order)}
                aria-label={isCardLink ? "Solicitar enlace de pago con tarjeta por WhatsApp" : "Abrir WhatsApp para confirmar la transferencia"}
              >
                <MessageCircle size={18} />
                <span>{isCardLink ? "Solicitar enlace de pago" : "Confirmar transferencia"}</span>
                <ArrowRight size={16} />
              </button>

              <div className="order-secondary-actions">
                <button
                  type="button"
                  className={`btn btn-outline ${copied ? "is-copied" : ""}`}
                  onClick={handleCopy}
                  aria-label="Copiar resumen del pedido al portapapeles"
                >
                  {copied ? <Check size={16} className="text-success" /> : <Copy size={16} />}
                  <span>{copied ? "Resumen copiado" : "Copiar resumen"}</span>
                </button>

                <button
                  type="button"
                  className="btn btn-soft"
                  onClick={() => {
                    onClose?.();
                    onViewOrders?.();
                  }}
                  aria-label="Ver historial de pedidos"
                >
                  <Package size={16} />
                  <span>Mis pedidos</span>
                </button>
              </div>
            </div>

            <p className="muted order-safety-footnote" style={{ margin: "14px 0 0", textAlign: "center", fontSize: "0.78rem" }}>
              Si WhatsApp no se abre, copia el resumen y escríbenos directamente.
            </p>
          </div>
        </Motion.div>
      </Motion.div>
    </AnimatePresence>
  );
}
