import React, { useMemo, useState } from "react";
import { ArrowLeft, Check, Copy, ExternalLink, MapPin, MessageCircle, Package, Search, Truck, X, ZoomIn } from "lucide-react";
import { motion as Motion, AnimatePresence } from "framer-motion";
import { formatOrderDate, normalizeOrderStatusForOrder } from "../../domain/orders/status";
import { currency } from "../../utils/currency";
import { normalizeImageSource } from "../../utils/fileUpload";
import { getCourierTrackingUrl } from "../../utils/courierTracking";
import { FALLBACK_IMAGE } from "../../constants";
import { OrderStatusProgress } from "./OrderStatusProgress";
import { ImageLightbox } from "../ui/ImageLightbox";
import { useModalA11y } from "../../hooks/useModalA11y";
import { PickupLocation } from "./PickupLocation";

function getPaymentMethodLabel(order) {
  return order.paymentMethodLabel
    || (order.paymentMethod === "card_link" ? "Tarjeta mediante enlace de pago" : "Transferencia bancaria");
}

function getOrderImage(item) {
  return normalizeImageSource(item?.image) || FALLBACK_IMAGE;
}

export function OrdersModal({
  open,
  onClose,
  orders,
  onSearchChange,
  searchValue,
  onCopyOrderCode,
  onOpenOrderWhatsApp,
  contactSettings = {},
}) {
  const [proofPreview, setProofPreview] = useState(null);
  const [productPreview, setProductPreview] = useState(null);
  const [copiedGuideId, setCopiedGuideId] = useState(null);
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const containerRef = useModalA11y(open, onClose);
  const safeOrders = useMemo(() => (Array.isArray(orders) ? orders : []), [orders]);

  const selectedOrder = safeOrders.find((order) => String(order.id) === String(selectedOrderId)) || safeOrders[0] || null;

  const handleCopyGuideNumber = async (orderId, guideNumber) => {
    if (!guideNumber) return;
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(guideNumber);
        setCopiedGuideId(orderId);
        window.setTimeout(() => setCopiedGuideId(null), 2000);
      }
    } catch {
      // Clipboard access can be denied without affecting order tracking.
    }
  };

  const openOrder = (order) => {
    setSelectedOrderId(String(order.id));
    setMobileDetailOpen(true);
  };

  if (!open) return null;

  const normalizedStatus = selectedOrder
    ? normalizeOrderStatusForOrder(selectedOrder.status, selectedOrder.deliveryType)
    : "";
  const orderItems = Array.isArray(selectedOrder?.items) ? selectedOrder.items : [];
  const rawGuide = String(selectedOrder?.guideNumber || "").trim();
  let effectiveCourier = selectedOrder?.courierName || selectedOrder?.courier || "";
  let effectiveGuide = rawGuide;
  if (rawGuide.includes(":") && !effectiveCourier) {
    const parts = rawGuide.split(":");
    effectiveCourier = parts[0].trim();
    effectiveGuide = parts.slice(1).join(":").trim();
  }
  const canOpenWhatsApp = selectedOrder
    && typeof onOpenOrderWhatsApp === "function"
    && (normalizedStatus === "Listo para retiro" || normalizedStatus === "Enviado");
  const trackingUrl = getCourierTrackingUrl(effectiveCourier, effectiveGuide);

  return (
    <>
      <AnimatePresence>
        <Motion.div className="orders-page-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <Motion.section
            ref={containerRef}
            className={`orders-page${mobileDetailOpen && selectedOrder ? " is-mobile-detail" : ""}`}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.2 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="orders-page-title"
          >
            <header className="orders-page-header">
              <button type="button" onClick={onClose} className="orders-page-back" aria-label="Volver a la tienda">
                <ArrowLeft size={18} aria-hidden="true" /><span>Tienda</span>
              </button>
              <div className="orders-page-heading">
                <span className="orders-page-eyebrow">Tu cuenta</span>
                <h2 id="orders-page-title">Mis pedidos</h2>
              </div>
              <button type="button" onClick={onClose} className="icon-btn orders-page-close" aria-label="Cerrar pedidos">
                <X size={18} aria-hidden="true" />
              </button>
            </header>

            <div className="orders-page-layout">
              <aside className="orders-master" aria-label="Lista de pedidos">
                <label className="orders-search-control">
                  <Search size={16} aria-hidden="true" />
                  <input type="search" name="order-search" autoComplete="off" placeholder="Código o producto…" aria-label="Buscar por código o producto" value={searchValue} onChange={(event) => onSearchChange(event.target.value)} />
                </label>
                <div className="orders-master-count" aria-live="polite"><strong>{safeOrders.length}</strong> {safeOrders.length === 1 ? "pedido" : "pedidos"}</div>
                <div className="orders-master-list">
                  {!safeOrders.length ? (
                    <div className="orders-empty-state">
                      <Package size={24} aria-hidden="true" />
                      <strong>{searchValue?.trim() ? "No encontramos pedidos" : "Aún no tienes pedidos"}</strong>
                      <p>{searchValue?.trim() ? "Prueba con otro código o nombre de producto." : "Cuando realices una compra, podrás seguirla desde aquí."}</p>
                      {searchValue?.trim() && <button type="button" className="btn btn-outline" onClick={() => onSearchChange("")}>Limpiar búsqueda</button>}
                    </div>
                  ) : safeOrders.map((order) => {
                    const status = normalizeOrderStatusForOrder(order.status, order.deliveryType);
                    const active = String(order.id) === String(selectedOrder?.id);
                    return (
                      <article key={order.id} className={`orders-master-card${active ? " is-active" : ""}`}>
                        <button type="button" onClick={() => openOrder(order)} aria-current={active ? "true" : undefined}>
                          <span className="orders-master-card-top">
                            <span className={`order-status-dot is-${status.toLowerCase().replace(/\s+/g, "-")}`} aria-hidden="true" />
                            <strong>{status}</strong><b>{currency(order.total ?? order.subtotal)}</b>
                          </span>
                          <span className="orders-master-code">{order.code}</span>
                          <span className="orders-master-meta">{formatOrderDate(order.createdAt)} · {order.itemCount} {Number(order.itemCount) === 1 ? "prenda" : "prendas"} · {order.deliveryType === "pickup" ? "Retiro" : "Domicilio"}</span>
                          <span className="orders-master-action">Ver pedido <ArrowLeft size={13} aria-hidden="true" /></span>
                        </button>
                      </article>
                    );
                  })}
                </div>
              </aside>

              <main className="orders-detail">
                {selectedOrder ? (
                  <article className="order-passport">
                    <button type="button" className="orders-mobile-detail-back" onClick={() => setMobileDetailOpen(false)}><ArrowLeft size={17} aria-hidden="true" />Todos los pedidos</button>
                    <header className="order-passport-header">
                      <div>
                        <span className="order-passport-kicker">{normalizedStatus}</span>
                        <div className="order-passport-code-row">
                          <h3>{selectedOrder.code}</h3>
                          <button type="button" className="order-inline-copy" onClick={() => onCopyOrderCode(selectedOrder.code)} aria-label={`Copiar código ${selectedOrder.code}`}><Copy size={14} aria-hidden="true" />Copiar</button>
                        </div>
                        <p>{formatOrderDate(selectedOrder.createdAt)} · {selectedOrder.itemCount} {Number(selectedOrder.itemCount) === 1 ? "prenda" : "prendas"}</p>
                      </div>
                      <div className="order-passport-total"><span>Total</span><strong>{currency(selectedOrder.total ?? selectedOrder.subtotal)}</strong></div>
                    </header>

                    <section className="order-detail-section order-status-section" aria-label="Estado del pedido"><OrderStatusProgress status={selectedOrder.status} deliveryType={selectedOrder.deliveryType} /></section>

                    <section className="order-detail-section">
                      <div className="order-detail-heading"><div><span>Contenido</span><h4>Prendas</h4></div><small>{orderItems.length} {orderItems.length === 1 ? "producto" : "productos"}</small></div>
                      <div className="order-product-list">
                        {orderItems.map((item, itemIndex) => (
                          <div key={item.key || `${item.id || item.name}-${itemIndex}`} className="order-product-row">
                            <button type="button" className="order-product-image" onClick={() => setProductPreview({ src: getOrderImage(item), alt: item.name, title: item.name })} aria-label={`Ampliar imagen de ${item.name}`}>
                              <img src={getOrderImage(item)} alt="" width="72" height="90" loading="lazy" decoding="async" />
                            </button>
                            <div className="order-product-copy"><strong>{item.name}</strong><span>{item.color} · {item.size}</span><small>Cantidad {item.quantity}</small></div>
                            <strong className="order-product-price">{currency(item.price * item.quantity)}</strong>
                          </div>
                        ))}
                      </div>
                    </section>

                    <div className="order-detail-columns">
                      <section className="order-detail-section">
                        <div className="order-detail-heading"><div><span>Pago</span><h4>{getPaymentMethodLabel(selectedOrder)}</h4></div></div>
                        {selectedOrder.paymentBankAccount?.bankName ? <p className="order-detail-muted">Banco elegido: {selectedOrder.paymentBankAccount.bankName}</p> : null}
                        {selectedOrder.paymentProof ? (
                          <button type="button" className="order-proof-attachment" onClick={() => setProofPreview({ src: normalizeImageSource(selectedOrder.paymentProof) || FALLBACK_IMAGE, alt: `Comprobante ${selectedOrder.code}`, title: `Comprobante · ${selectedOrder.code}` })}>
                            <img src={normalizeImageSource(selectedOrder.paymentProof) || FALLBACK_IMAGE} alt="" width="56" height="56" loading="lazy" decoding="async" />
                            <span><strong>Comprobante enviado</strong><small>Ver comprobante</small></span><ZoomIn size={16} aria-hidden="true" />
                          </button>
                        ) : <p className="order-detail-muted">No hay un comprobante adjunto.</p>}
                      </section>

                      <section className="order-detail-section">
                        <div className="order-detail-heading"><div><span>Resumen</span><h4>Desglose</h4></div></div>
                        <div className="order-price-summary">
                          <div><span>Subtotal</span><strong>{currency(selectedOrder.subtotal)}</strong></div>
                          {selectedOrder.discountAmount > 0 && <div><span>Descuento</span><strong>-{currency(selectedOrder.discountAmount)}</strong></div>}
                          {selectedOrder.shippingCost > 0 ? <div><span>{selectedOrder.shippingLabel || "Envío"}</span><strong>+{currency(selectedOrder.shippingCost)}</strong></div> : selectedOrder.deliveryType === "delivery" && <div><span>Envío</span><strong className="is-free">Gratis</strong></div>}
                          {selectedOrder.paymentFeeAmount > 0 && <div><span>Comisión de pago</span><strong>+{currency(selectedOrder.paymentFeeAmount)}</strong></div>}
                          <div className="is-total"><span>Total</span><strong>{currency(selectedOrder.total ?? selectedOrder.subtotal)}</strong></div>
                        </div>
                      </section>
                    </div>

                    <section className="order-detail-section">
                      <div className="order-detail-heading"><div><span>{selectedOrder.deliveryType === "pickup" ? "Retiro" : "Entrega"}</span><h4>{selectedOrder.deliveryType === "pickup" ? "Retiro en tienda" : (effectiveGuide ? "Envío y guía" : "Entrega a domicilio")}</h4></div>{selectedOrder.deliveryType === "delivery" && <Truck size={18} aria-hidden="true" />}</div>
                      {selectedOrder.deliveryType === "delivery" ? (
                        <>
                          {effectiveGuide && (
                            <div className="order-tracking-card">
                              <div><span>{effectiveCourier || "Courier"}</span><strong>{effectiveGuide}</strong></div>
                              <div>
                                <button type="button" className="btn btn-outline" onClick={() => handleCopyGuideNumber(selectedOrder.id, effectiveGuide)}>{copiedGuideId === selectedOrder.id ? <Check size={14} /> : <Copy size={14} />}{copiedGuideId === selectedOrder.id ? "Copiada" : "Copiar"}</button>
                                {trackingUrl && <a href={trackingUrl} target="_blank" rel="noopener noreferrer" className="btn btn-primary"><ExternalLink size={14} />Rastrear</a>}
                              </div>
                            </div>
                          )}
                          <details className="order-address-details">
                            <summary><MapPin size={15} aria-hidden="true" />Ver dirección de entrega</summary>
                            <div><strong>{selectedOrder.deliveryAddress || "Dirección no registrada"}</strong>{selectedOrder.deliveryReference && <p>Referencia: {selectedOrder.deliveryReference}</p>}<p>Recibe: {selectedOrder.deliveryFullName || selectedOrder.customerName || "Cliente"}</p></div>
                          </details>
                        </>
                      ) : <PickupLocation key={selectedOrder.id} address={selectedOrder.pickupAddress || contactSettings.address} locationNote={selectedOrder.pickupNote || contactSettings.locationNote}
                        mapsLink={selectedOrder.pickupMapsLink || (!selectedOrder.pickupAddress || selectedOrder.pickupAddress === contactSettings.address ? contactSettings.mapsLink : "")}
                        mapsEmbedUrl={selectedOrder.pickupMapsEmbedUrl || (!selectedOrder.pickupAddress || selectedOrder.pickupAddress === contactSettings.address ? contactSettings.mapsEmbedUrl : "")} />}
                    </section>

                    {canOpenWhatsApp && <button type="button" className="btn btn-soft order-help-action" onClick={() => onOpenOrderWhatsApp(selectedOrder)}><MessageCircle size={16} />Consultar por WhatsApp</button>}
                  </article>
                ) : <div className="orders-detail-empty"><Package size={26} /><p>Selecciona un pedido para consultar sus detalles.</p></div>}
              </main>
            </div>
          </Motion.section>
        </Motion.div>
      </AnimatePresence>
      <ImageLightbox open={Boolean(proofPreview || productPreview)} src={proofPreview?.src || productPreview?.src || ""} alt={proofPreview?.alt || productPreview?.alt || "Imagen ampliada"} title={proofPreview?.title || productPreview?.title || "Imagen"} onClose={() => { setProofPreview(null); setProductPreview(null); }} />
    </>
  );
}

export default OrdersModal;
