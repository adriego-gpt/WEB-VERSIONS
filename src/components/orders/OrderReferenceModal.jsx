import React, { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { motion as Motion, AnimatePresence } from "framer-motion";
import { FALLBACK_IMAGE } from "../../constants";
import { currency } from "../../utils/currency";
import { normalizeImageSource } from "../../utils/fileUpload";
import { getOrderStatusMeta, normalizeOrderStatusForOrder } from "../../domain/orders/status";

export function OrderReferenceModal({ open, order, onClose, statusTone }) {
  const dialogRef = useRef(null);
  const closeButtonRef = useRef(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open || typeof document === "undefined") return undefined;
    const returnFocusTo = document.activeElement;
    const focusTimer = window.setTimeout(() => closeButtonRef.current?.focus(), 0);
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        onCloseRef.current?.();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [...(dialogRef.current?.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) || [])].filter((element) => !element.hasAttribute("hidden"));
      if (focusable.length === 0) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", handleKeyDown, true);
      if (returnFocusTo instanceof HTMLElement && returnFocusTo.isConnected) returnFocusTo.focus();
    };
  }, [open]);

  if (!open || !order) return null;
  const status = normalizeOrderStatusForOrder(order.status, order.deliveryType);
  const statusClass = statusTone || getOrderStatusMeta(status).tone;
  const items = Array.isArray(order.items) ? order.items : [];
  return (
    <AnimatePresence>
      <Motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="modal-backdrop modal-backdrop-priority order-reference-backdrop" onClick={onClose}>
        <Motion.div ref={dialogRef} initial={{ opacity: 0, y: 24, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 18, scale: 0.97 }} transition={{ duration: 0.22 }} className="sheet order-reference-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="order-reference-title" tabIndex={-1}>
          <div className="sheet-header">
            <div>
              <p className="muted" style={{ margin: 0, textTransform: "uppercase", letterSpacing: ".25em", fontSize: 13 }}>Referencia visual</p>
              <h3 id="order-reference-title" style={{ margin: "8px 0 0", fontSize: 30 }}>{order.code}</h3>
            </div>
            <button ref={closeButtonRef} type="button" onClick={onClose} className="icon-btn" aria-label="Cerrar referencia del pedido"><X size={18} /></button>
          </div>
          <div className="sheet-body order-reference-body">
            <div className="order-reference-summary-row">
              <span className="badge badge-light">{order.itemCount} artículo(s)</span>
              <span className="badge badge-light">Subtotal: {currency(order.subtotal)}</span>
              {Number(order.discountAmount || 0) > 0 && <span className="badge badge-light">Descuento: -{currency(order.discountAmount)}</span>}
              <span className="badge badge-light">Total: {currency(order.total || order.subtotal)}</span>
              {order.couponCode && <span className="badge badge-light">Cupón: {order.couponCode}</span>}
              <span className={`order-status-pill ${statusClass}`}>{status}</span>
            </div>
            {items.length > 0 ? (
              <div className="order-reference-grid">
              {items.map((item, index) => (
                <div key={item.key || `${item.id || item.name}-${index}`} className="order-reference-card">
                  <img
                    src={normalizeImageSource(item.image) || FALLBACK_IMAGE}
                    alt={item.name || "Prenda del pedido"}
                    className="order-reference-card-image"
                    loading="eager"
                    decoding="async"
                    onError={(event) => {
                      event.currentTarget.onerror = null;
                      event.currentTarget.src = FALLBACK_IMAGE;
                    }}
                  />
                  <div className="order-reference-card-copy">
                    <strong>{item.name || "Prenda"}</strong>
                    <p className="muted" style={{ margin: "6px 0 0" }}>{item.color || "Sin color"} - {item.size || "Sin talla"}</p>
                    <p className="muted" style={{ margin: "6px 0 0" }}>Cantidad: {item.quantity}</p>
                    <p style={{ margin: "10px 0 0", fontWeight: 700 }}>{currency(item.price * item.quantity)}</p>
                  </div>
                </div>
              ))}
              </div>
            ) : (
              <div className="empty-admin-note">Este pedido no contiene prendas para mostrar.</div>
            )}
          </div>
        </Motion.div>
      </Motion.div>
    </AnimatePresence>
  );
}

export default OrderReferenceModal;
