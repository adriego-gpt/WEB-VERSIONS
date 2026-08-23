import React from "react";
import { PencilLine, RotateCcw, Search, ShieldCheck } from "lucide-react";
import {
  computeOfferPrice,
  currency,
  normalizeOfferDiscountMode,
  resolveOfferDiscount,
} from "../../utils";
import { AdminSectionHeader } from "./AdminSectionHeader";

export function OfferManagerPanel({
  products,
  query,
  onQueryChange,
  activeCount,
  pendingCount,
  hasPendingChanges,
  saving,
  dirtyById,
  getDraft,
  getProductImage,
  onUpdateDraft,
  onReset,
  onSave,
  onEditProduct,
}) {
  return (
    <section className="admin-workspace admin-offers-workspace" aria-labelledby="admin-offers-title">
      <AdminSectionHeader
        title="Ofertas"
        titleId="admin-offers-title"
        description="Activa descuentos y revisa el precio final antes de publicarlos."
        meta={<span className="admin-count-label">{activeCount} activas</span>}
        actions={(
          <>
            {hasPendingChanges && <span className="admin-unsaved-label">{pendingCount} sin guardar</span>}
            <button className="btn btn-outline" type="button" onClick={onReset} disabled={!hasPendingChanges || saving}>
              <RotateCcw size={16} />Restablecer
            </button>
            <button className="btn btn-primary" type="button" onClick={onSave} disabled={!hasPendingChanges || saving}>
              <ShieldCheck size={16} />{saving ? "Guardando..." : "Guardar cambios"}
            </button>
          </>
        )}
      />

      <div className="admin-catalog-tools admin-offer-tools">
        <label className="admin-order-search">
          <Search size={18} aria-hidden="true" />
          <input
            className="input"
            placeholder="Buscar producto para aplicar una oferta"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
          />
        </label>
      </div>

      <div className="admin-offer-list">
        {products.length === 0 ? (
          <div className="empty-admin-note">No hay productos para mostrar con esa búsqueda.</div>
        ) : products.map((product) => {
          const productId = String(product.id);
          const draft = getDraft(product);
          const basePrice = Math.max(0, Number(product.basePrice != null ? product.basePrice : product.price) || 0);
          const offerMode = normalizeOfferDiscountMode(draft.offerDiscountMode);
          const resolvedOffer = resolveOfferDiscount(basePrice, offerMode, draft.offerDiscountValue);
          const offerPercent = Math.round(resolvedOffer.percent);
          const offerEnabled = Boolean(draft.offerEnabled);
          const finalPrice = offerEnabled ? computeOfferPrice(basePrice, resolvedOffer.percent) : basePrice;
          const colors = Array.isArray(product.colors) ? product.colors : [];
          return (
            <article key={`offer-${product.id}`} className={`admin-offer-item${offerEnabled ? " is-active" : ""}${dirtyById[productId] ? " is-dirty" : ""}`}>
              <img
                src={getProductImage(product, colors[0])}
                alt=""
                className="admin-offer-thumb"
                loading="lazy"
                decoding="async"
              />
              <div className="admin-offer-main">
                <div className="admin-offer-heading">
                  <div>
                    <h5>{product.name}</h5>
                    <p>{product.category || "Sin categoría"}</p>
                  </div>
                  {dirtyById[productId] && <span className="admin-unsaved-label">Pendiente</span>}
                </div>
                <div className="admin-offer-prices">
                  <span>Base <strong>{currency(basePrice)}</strong></span>
                  <span className={offerEnabled ? "is-active" : ""}>Final <strong>{currency(finalPrice)}</strong></span>
                  {offerEnabled && offerPercent > 0 && <b>-{offerPercent}%</b>}
                </div>
              </div>
              <div className="admin-offer-controls">
                <label className="admin-switch-row">
                  <input
                    className="checkbox"
                    type="checkbox"
                    checked={offerEnabled}
                    onChange={(event) => onUpdateDraft(product.id, { offerEnabled: event.target.checked })}
                  />
                  <span>{offerEnabled ? "Oferta activa" : "Sin oferta"}</span>
                </label>
                {offerEnabled && (
                  <div className="admin-offer-value-controls">
                    <select
                      className="select"
                      aria-label={`Tipo de descuento para ${product.name}`}
                      value={offerMode}
                      onChange={(event) => onUpdateDraft(product.id, { offerDiscountMode: event.target.value })}
                    >
                      <option value="percent">Porcentaje</option>
                      <option value="amount">Monto fijo</option>
                    </select>
                    <label className="admin-offer-value-field">
                      <span>{offerMode === "amount" ? "Descuento $" : "Descuento %"}</span>
                      <input
                        className="input"
                        type="text"
                        inputMode="decimal"
                        value={String(draft.offerDiscountValue != null ? draft.offerDiscountValue : 0)}
                        onChange={(event) => onUpdateDraft(product.id, { offerDiscountValue: event.target.value })}
                      />
                    </label>
                  </div>
                )}
                <button className="btn btn-outline admin-offer-edit-btn" type="button" onClick={() => onEditProduct(product)}>
                  <PencilLine size={15} />Editar producto
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {hasPendingChanges && (
        <div className="admin-sticky-action-bar">
          <span><strong>{pendingCount}</strong> cambio{pendingCount === 1 ? "" : "s"} pendiente{pendingCount === 1 ? "" : "s"}</span>
          <button className="btn btn-primary" type="button" onClick={onSave} disabled={saving}>
            <ShieldCheck size={16} />{saving ? "Guardando..." : "Guardar ofertas"}
          </button>
        </div>
      )}
    </section>
  );
}

