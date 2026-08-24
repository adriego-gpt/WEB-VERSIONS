import React, { useEffect, useState } from "react";
import { X, Copy, MessageCircle, Search, ZoomIn, Truck, MapPin, Check } from "lucide-react";
import { motion as Motion, AnimatePresence } from "framer-motion";
import { formatOrderDate, normalizeOrderStatusForOrder } from "../../domain/orders/status";
import { currency } from "../../utils/currency";
import { normalizeImageSource } from "../../utils/fileUpload";
import { FALLBACK_IMAGE } from "../../constants";
import { OrderStatusProgress } from "./OrderStatusProgress";
import { OrderReferenceStrip } from "./OrderReferenceStrip";
import { ImageLightbox } from "../ui/ImageLightbox";

export function OrdersModal({
  open,
  onClose,
  orders,
  onSearchChange,
  searchValue,
  onOpenReference,
  onCopyOrderCode,
  onOpenOrderWhatsApp,
}) {
  const [proofPreview, setProofPreview] = useState(null);
  const [copiedGuideId, setCopiedGuideId] = useState(null);

  const handleCopyGuideNumber = async (orderId, guideNumber) => {
    if (!guideNumber) return;
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(guideNumber);
        setCopiedGuideId(orderId);
        window.setTimeout(() => setCopiedGuideId(null), 2000);
      }
    } catch {
      // Fallback
    }
  };

  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose?.();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <>
    <AnimatePresence>
      <Motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="modal-backdrop" onClick={onClose}>
        <Motion.div
          initial={{ opacity: 0, y: 24, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 18, scale: 0.97 }}
          transition={{ duration: 0.22 }}
          className="sheet orders-sheet"
          role="dialog"
          aria-modal="true"
          aria-label="Seguimiento de pedidos"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="sheet-header orders-sheet-header">
            <div>
              <h3>Seguimiento de pedidos</h3>
              <p className="muted orders-sheet-subtitle">Tus pedidos y su estado actual</p>
            </div>
            <button type="button" onClick={onClose} className="icon-btn" aria-label="Cerrar seguimiento de pedidos"><X size={18} /></button>
          </div>
          <div className="sheet-body orders-sheet-body">
            <label className="orders-search-control">
              <Search size={16} aria-hidden="true" />
              <input
                type="search"
                placeholder="Código o producto"
                aria-label="Buscar por código o producto"
                value={searchValue}
                onChange={(event) => onSearchChange(event.target.value)}
              />
            </label>
            {(!orders || orders.length === 0) ? (
              <div className="empty-admin-note">Aún no tienes pedidos.</div>
            ) : orders.map((order) => {
              const normalizedStatus = normalizeOrderStatusForOrder(order.status, order.deliveryType);
              const canOpenWhatsApp = typeof onOpenOrderWhatsApp === "function"
                && (normalizedStatus === "Listo para retiro" || normalizedStatus === "Enviado");
              const paymentMethodLabel = order.paymentMethodLabel
                || (order.paymentMethod === "card_link" ? "Tarjeta mediante enlace de pago" : "Transferencia bancaria");
              const orderItems = Array.isArray(order.items) ? order.items : [];
              return (
                <div key={order.id} className="cart-item customer-order-card">
                  <div className="admin-toolbar customer-order-header">
                    <div>
                      <div className="order-code-row">
                        <p className="customer-order-code-title">{order.code}</p>
                        <button type="button" className="btn btn-outline order-copy-btn" onClick={() => onCopyOrderCode(order.code)}>
                          <Copy size={13} />
                          Copiar
                        </button>
                      </div>
                      <p className="muted" style={{ margin: "6px 0 0", fontSize: 13 }}>{formatOrderDate(order.createdAt)} · {order.itemCount} {Number(order.itemCount) === 1 ? "prenda" : "prendas"}</p>
                    </div>
                    <div className="customer-order-total">
                      <span className="muted">Total</span>
                      <strong>{currency(order.total || order.subtotal)}</strong>
                    </div>
                  </div>
                  <OrderStatusProgress status={order.status} deliveryType={order.deliveryType} />

                  {order.deliveryType === "delivery" && (
                    <div className="customer-order-shipping-card">
                      <div className="customer-order-shipping-head">
                        <span className="customer-order-shipping-icon">
                          <Truck size={16} />
                        </span>
                        <div className="customer-order-shipping-title-box">
                          <strong className="customer-order-shipping-title">
                            {order.guideNumber ? "Información de despacho y guía" : "Entrega a domicilio"}
                          </strong>
                          <span className="customer-order-shipping-city">
                            {order.deliveryCity || "Envío nacional"}
                          </span>
                        </div>
                      </div>

                      {order.guideNumber ? (
                        <div className="customer-order-guide-box">
                          <div className="customer-order-guide-info">
                            <span className="customer-order-guide-courier">
                              {order.courierName || "Courier de transporte"}
                            </span>
                            <div className="customer-order-guide-number-row">
                              <span className="muted">Guía:</span>
                              <strong className="customer-order-guide-code">{order.guideNumber}</strong>
                            </div>
                          </div>
                          <button
                            type="button"
                            className="btn btn-outline customer-order-copy-guide-btn"
                            onClick={() => handleCopyGuideNumber(order.id, order.guideNumber)}
                          >
                            {copiedGuideId === order.id ? (
                              <>
                                <Check size={13} />
                                <span>¡Copiada!</span>
                              </>
                            ) : (
                              <>
                                <Copy size={13} />
                                <span>Copiar guía</span>
                              </>
                            )}
                          </button>
                        </div>
                      ) : (
                        <div className="customer-order-pending-guide-note">
                          <p>
                            {normalizedStatus === "Enviado"
                              ? "Tu pedido ya fue despachado. El número de guía se reflejará aquí tan pronto como el courier complete el registro."
                              : "Tu paquete se enviará a esta ubicación una vez finalizada la preparación."}
                          </p>
                        </div>
                      )}

                      <div className="customer-order-shipping-address-summary">
                        <p className="customer-order-shipping-address-line">
                          <MapPin size={13} />
                          <span>{order.deliveryAddress || "Dirección no registrada"}</span>
                        </p>
                        {order.deliveryReference && (
                          <p className="customer-order-shipping-ref-line">
                            <span className="muted">Ref:</span> {order.deliveryReference}
                          </p>
                        )}
                        {(order.deliveryFullName || order.customerName) && (
                          <p className="customer-order-shipping-contact-line">
                            <span className="muted">Recibe:</span> {order.deliveryFullName || order.customerName}
                            {order.deliveryIdNumber ? ` (C.I: ${order.deliveryIdNumber})` : ""}
                            {order.deliveryPhone ? ` · Tel: ${order.deliveryPhone}` : ""}
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {canOpenWhatsApp && (
                    <button type="button" className="btn btn-soft" onClick={() => onOpenOrderWhatsApp(order)}>
                      <MessageCircle size={15} />
                      Abrir WhatsApp
                    </button>
                  )}
                  <OrderReferenceStrip order={order} onOpen={onOpenReference} />
                  <details className="customer-order-details">
                    <summary>Ver prendas y desglose</summary>
                    <div className="customer-order-details-content">
                      <div className="customer-order-payment-method">
                        <span className="muted">Forma de pago</span>
                        <strong>{paymentMethodLabel}</strong>
                        {order.paymentBankAccount?.bankName ? <small>Banco elegido: {order.paymentBankAccount.bankName}</small> : null}
                        {order.paymentFeeAmount > 0 && <small>Incluye {order.paymentFeePercent}% de comisión por tarjeta.</small>}
                      </div>
                      {(order.discountAmount > 0 || order.couponCode || order.paymentFeeAmount > 0) && (
                        <div className="order-money-block">
                          <div>
                            <span className="muted">Subtotal</span>
                            <strong>{currency(order.subtotal)}</strong>
                          </div>
                          {order.discountAmount > 0 && (
                            <div>
                              <span className="muted">Descuento</span>
                              <strong>-{currency(order.discountAmount)}</strong>
                            </div>
                          )}
                          {order.paymentFeeAmount > 0 && (
                            <div>
                              <span className="muted">Comisión tarjeta</span>
                              <strong>+{currency(order.paymentFeeAmount)}</strong>
                            </div>
                          )}
                          <div>
                            <span className="muted">Total</span>
                            <strong>{currency(order.total || order.subtotal)}</strong>
                          </div>
                        </div>
                      )}
                      {order.couponCode && <span className="badge badge-light">Cupón: {order.couponCode}</span>}
                      {order.guideNumber && <p className="helper-text" style={{ margin: 0 }}>Guía de envío: <strong>{order.guideNumber}</strong></p>}
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
                          <span><ZoomIn size={15} />Abrir comprobante</span>
                        </button>
                      ) : null}
                      <div className="grid customer-order-items">
                        {orderItems.map((item, itemIndex) => (
                          <div key={item.key || `${item.id || item.name}-${itemIndex}`} className="customer-order-item-row">
                            <span>{item.name} · {item.color} · {item.size} ×{item.quantity}</span>
                            <strong>{currency(item.price * item.quantity)}</strong>
                          </div>
                        ))}
                      </div>
                    </div>
                  </details>
                </div>
              );
            })}
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

export default OrdersModal;
