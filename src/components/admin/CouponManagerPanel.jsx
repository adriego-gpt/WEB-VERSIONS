import React, { useState } from "react";
import { ChevronDown, PencilLine, Plus, ShieldCheck, Trash2, X } from "lucide-react";
import { splitFilterTagsText, normalizeOptionLabel, currency } from "../../utils";
import { AdminSectionHeader } from "./AdminSectionHeader";

export function CouponManagerPanel({
  coupons = [],
  couponDraft = {},
  couponEditorMessage,
  couponEditorError,
  products = [],
  productTypeOptions = [],
  onCouponDraftFieldChange,
  onToggleCouponDraftProduct,
  onToggleCouponDraftProductType,
  onSaveCoupon,
  onResetCouponDraft,
  onEditCoupon,
  onToggleCouponActive,
  onDeleteCoupon,
}) {
  const [showEditor, setShowEditor] = useState(Boolean(couponDraft?.id));
  const [expandedCouponId, setExpandedCouponId] = useState("");
  const selectedExcludedTypes = new Set(
    splitFilterTagsText(couponDraft?.excludedProductTypesText || "").map((item) => item.toLowerCase()),
  );

  const startNewCoupon = () => {
    onResetCouponDraft();
    setShowEditor(true);
  };

  const cancelEditor = () => {
    onResetCouponDraft();
    setShowEditor(false);
  };

  const editCoupon = (coupon) => {
    onEditCoupon(coupon);
    setShowEditor(true);
  };

  return (
    <div className="admin-tab-panel">
      <section className="admin-workspace coupon-manager-workspace" aria-labelledby="coupon-manager-title">
        <AdminSectionHeader
          title="Cupones"
          titleId="coupon-manager-title"
          description="Consulta los códigos existentes y abre el editor solo cuando necesites crear o modificar uno."
          meta={<span className="admin-count-label">{coupons.length} registrados</span>}
          actions={(
            <button className="btn btn-primary" type="button" onClick={startNewCoupon}>
              <Plus size={16} />Nuevo cupón
            </button>
          )}
        />

        {showEditor && (
          <div className="coupon-editor-panel">
            <div className="coupon-editor-head">
              <div>
                <h5>{couponDraft.id ? `Editar ${couponDraft.code || "cupón"}` : "Crear cupón"}</h5>
                <p>Configura primero el descuento; los límites y restricciones son opcionales.</p>
              </div>
              <div className="admin-actions">
                <button className="btn btn-outline" type="button" onClick={cancelEditor}><X size={16} />Cancelar</button>
                <button className="btn btn-primary" type="button" onClick={onSaveCoupon}><ShieldCheck size={16} />Guardar cupón</button>
              </div>
            </div>

            {(couponEditorMessage || couponEditorError) && (
              <div>
                {couponEditorMessage && <div className="status-message status-success">{couponEditorMessage}</div>}
                {couponEditorError && <div className="status-message status-error">{couponEditorError}</div>}
              </div>
            )}

            <div className="coupon-core-fields">
              <label className="product-editor-field">
                <span className="product-editor-field-label">Código</span>
                <input className="input" placeholder="Ej. VIP20" value={couponDraft.code} onChange={(event) => onCouponDraftFieldChange("code", event.target.value)} />
              </label>
              <label className="product-editor-field">
                <span className="product-editor-field-label">Tipo de descuento</span>
                <select className="select" value={couponDraft.discountType} onChange={(event) => onCouponDraftFieldChange("discountType", event.target.value)}>
                  <option value="percentage">Porcentaje</option>
                  <option value="fixed">Monto fijo</option>
                </select>
              </label>
              <label className="product-editor-field">
                <span className="product-editor-field-label">Valor</span>
                <input className="input" type="number" min="0" placeholder="0" value={couponDraft.discountValue} onChange={(event) => onCouponDraftFieldChange("discountValue", event.target.value)} />
              </label>
              <label className="product-editor-field">
                <span className="product-editor-field-label">Compra mínima</span>
                <input className="input" type="number" min="0" placeholder="0" value={couponDraft.minPurchase} onChange={(event) => onCouponDraftFieldChange("minPurchase", event.target.value)} />
              </label>
              <label className="admin-switch-row coupon-active-toggle">
                <input className="checkbox" type="checkbox" checked={couponDraft.active !== false} onChange={(event) => onCouponDraftFieldChange("active", event.target.checked)} />
                Cupón activo
              </label>
            </div>

            <details className="admin-settings-disclosure">
              <summary>Límites y vigencia <ChevronDown size={17} /></summary>
              <div className="admin-settings-disclosure-body settings-grid">
                <label className="product-editor-field">
                  <span className="product-editor-field-label">Límite por usuario</span>
                  <input className="input" type="number" min="0" value={couponDraft.limitPerUser} onChange={(event) => onCouponDraftFieldChange("limitPerUser", event.target.value)} />
                </label>
                <label className="product-editor-field">
                  <span className="product-editor-field-label">Límite global</span>
                  <input className="input" type="number" min="0" value={couponDraft.limitGlobal} onChange={(event) => onCouponDraftFieldChange("limitGlobal", event.target.value)} />
                </label>
                <label className="product-editor-field">
                  <span className="product-editor-field-label">Activo desde</span>
                  <input className="input" type="datetime-local" value={couponDraft.startsAt || ""} onChange={(event) => onCouponDraftFieldChange("startsAt", event.target.value)} />
                </label>
                <label className="product-editor-field">
                  <span className="product-editor-field-label">Expira</span>
                  <input className="input" type="datetime-local" value={couponDraft.expiresAt || ""} onChange={(event) => onCouponDraftFieldChange("expiresAt", event.target.value)} />
                </label>
                <label className="product-editor-field">
                  <span className="product-editor-field-label">Hora inicial</span>
                  <input className="input" type="time" value={couponDraft.activeHourStart || ""} onChange={(event) => onCouponDraftFieldChange("activeHourStart", event.target.value)} />
                </label>
                <label className="product-editor-field">
                  <span className="product-editor-field-label">Hora final</span>
                  <input className="input" type="time" value={couponDraft.activeHourEnd || ""} onChange={(event) => onCouponDraftFieldChange("activeHourEnd", event.target.value)} />
                </label>
              </div>
            </details>

            <details className="admin-settings-disclosure">
              <summary>Restricciones de productos <ChevronDown size={17} /></summary>
              <div className="admin-settings-disclosure-body">
                <label className="product-editor-field">
                  <span className="product-editor-field-label">Categorías permitidas</span>
                  <input className="input" placeholder="Separadas por coma; vacío permite todas" value={couponDraft.allowedCategoriesText || ""} onChange={(event) => onCouponDraftFieldChange("allowedCategoriesText", event.target.value)} />
                </label>
                <div className="product-editor-field">
                  <span className="product-editor-field-label">Tipos excluidos</span>
                  <div className="chip-row coupon-type-chip-row">
                    {productTypeOptions.map((productType) => {
                      const normalizedType = normalizeOptionLabel(productType);
                      if (!normalizedType) return null;
                      const selected = selectedExcludedTypes.has(normalizedType.toLowerCase());
                      return (
                        <button key={normalizedType} type="button" className={`chip ${selected ? "active" : ""}`} onClick={() => onToggleCouponDraftProductType(normalizedType)}>
                          {normalizedType}
                        </button>
                      );
                    })}
                  </div>
                  <input className="input" placeholder="También puedes escribirlos separados por coma" value={couponDraft.excludedProductTypesText} onChange={(event) => onCouponDraftFieldChange("excludedProductTypesText", event.target.value)} />
                </div>
                <div className="product-editor-field">
                  <span className="product-editor-field-label">Productos excluidos</span>
                  <div className="coupon-products-grid">
                    {products.map((product) => {
                      const productId = String(product.id);
                      const selected = (couponDraft.excludedProductIds || []).map((entry) => String(entry)).includes(productId);
                      return (
                        <button key={productId} type="button" className={`coupon-product-pill ${selected ? "selected" : ""}`} onClick={() => onToggleCouponDraftProduct(productId)}>
                          <input type="checkbox" checked={selected} readOnly />
                          <span>{product.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </details>
          </div>
        )}

        <div className="coupon-list-header">
          <strong>Cupones registrados</strong>
          <span>{coupons.length}</span>
        </div>
        <div className="coupon-compact-list">
          {coupons.length === 0 ? (
            <div className="empty-admin-note">Aún no hay cupones creados.</div>
          ) : coupons.map((coupon) => {
            const isExpanded = expandedCouponId === coupon.id;
            const detailsId = `coupon-${coupon.id}-details`;
            return (
              <article key={coupon.id} className={`coupon-compact-row${isExpanded ? " is-expanded" : ""}`}>
                <button className="coupon-row-disclosure" type="button" onClick={() => setExpandedCouponId(isExpanded ? "" : coupon.id)} aria-expanded={isExpanded} aria-controls={detailsId}>
                  <span className={`entity-status-dot${coupon.active ? " is-active" : ""}`} />
                  <span><strong>{coupon.code}</strong><small>{coupon.discountType === "percentage" ? `${coupon.discountValue}%` : currency(coupon.discountValue)} · mínimo ${currency(coupon.minPurchase || 0)}</small></span>
                  <span>{coupon.usageTotal || 0} usos</span>
                  <ChevronDown size={17} aria-hidden="true" />
                </button>
                <div className="coupon-row-actions">
                  <button className="btn btn-soft" type="button" onClick={() => editCoupon(coupon)}><PencilLine size={15} />Editar</button>
                  <button className="btn btn-outline" type="button" onClick={() => onToggleCouponActive(coupon.id)}>{coupon.active ? "Desactivar" : "Activar"}</button>
                </div>
                {isExpanded && (
                  <div id={detailsId} className="coupon-row-details">
                    <div className="coupon-row-facts">
                      {coupon.limitGlobal > 0 && <span>Límite global: {coupon.limitGlobal}</span>}
                      {coupon.limitPerUser > 0 && <span>Por usuario: {coupon.limitPerUser}</span>}
                      {coupon.startsAt && <span>Desde: {new Date(coupon.startsAt).toLocaleString("es-EC")}</span>}
                      {coupon.expiresAt && <span>Expira: {new Date(coupon.expiresAt).toLocaleString("es-EC")}</span>}
                      {!!coupon.excludedProductIds?.length && <span>{coupon.excludedProductIds.length} productos excluidos</span>}
                    </div>
                    <button className="btn btn-danger" type="button" onClick={() => onDeleteCoupon(coupon.id)}><Trash2 size={15} />Eliminar cupón</button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}

