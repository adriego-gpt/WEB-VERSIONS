import React from "react";
import {
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  PencilLine,
  Plus,
  Search,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { currency } from "../../utils";
import { AdminSectionHeader } from "./AdminSectionHeader";

export function ProductCatalogPanel({
  products = [],
  query = "",
  onQueryChange,
  selectedSet = new Set(),
  allVisibleSelected = false,
  bulkBusy = false,
  getProductImage,
  onCreate,
  onToggleSelection,
  onToggleAllVisible,
  onClearSelection,
  onSetFeatured,
  onDeleteSelected,
  onToggleVisibility,
  onEdit,
  onDuplicate,
  onDelete,
}) {
  const selectedCount = selectedSet?.size || 0;

  return (
    <section className="admin-workspace admin-catalog-workspace" aria-labelledby="admin-catalog-title">
      <AdminSectionHeader
        title="Productos"
        titleId="admin-catalog-title"
        description="Busca, publica o edita productos sin perder el contexto del catálogo."
        meta={<span className="admin-count-label">{products.length} visibles</span>}
        actions={(
          <button className="btn btn-primary" type="button" onClick={onCreate}>
            <Plus size={16} />Nuevo producto
          </button>
        )}
      />

      <div className="admin-catalog-tools">
        <label className="admin-order-search">
          <Search size={18} aria-hidden="true" />
          <input
            className="input"
            placeholder="Buscar por nombre, categoría, tipo o tag"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
          />
        </label>
        <button className="btn btn-outline" type="button" onClick={onToggleAllVisible} disabled={!products.length}>
          <CheckCircle2 size={16} />
          {allVisibleSelected ? "Quitar visibles" : "Seleccionar visibles"}
        </button>
      </div>

      {selectedCount > 0 && (
        <div className="admin-selection-bar" role="region" aria-label="Acciones para productos seleccionados">
          <strong>{selectedCount} seleccionado{selectedCount === 1 ? "" : "s"}</strong>
          <div className="admin-selection-actions">
            <button className="btn btn-soft" type="button" disabled={bulkBusy} onClick={() => onSetFeatured(true)}>
              <Star size={15} />Destacar
            </button>
            <button className="btn btn-outline" type="button" disabled={bulkBusy} onClick={() => onSetFeatured(false)}>
              Quitar destacado
            </button>
            <button className="btn btn-outline" type="button" disabled={bulkBusy} onClick={onClearSelection}>
              <X size={15} />Limpiar
            </button>
            <button className="btn btn-danger" type="button" disabled={bulkBusy} onClick={onDeleteSelected}>
              <Trash2 size={15} />{bulkBusy ? "Procesando..." : "Eliminar"}
            </button>
          </div>
        </div>
      )}

      <div className="admin-catalog-list">
        {products.length === 0 ? (
          <div className="empty-admin-note">No hay productos que coincidan con la búsqueda actual.</div>
        ) : products.map((product) => {
          const colors = Array.isArray(product.colors) ? product.colors : [];
          const sizes = Array.isArray(product.sizes) ? product.sizes : [];
          const tags = Array.isArray(product.filterTags) ? product.filterTags : [];
          const isPublic = product.isPublic !== false;
          const price = Number(product.basePrice != null ? product.basePrice : product.price) || 0;
          return (
            <article key={product.id} className={`admin-catalog-item${selectedSet.has(String(product.id)) ? " is-selected" : ""}`}>
              <label className="admin-catalog-select" aria-label={`Seleccionar ${product.name}`}>
                <input
                  className="checkbox"
                  type="checkbox"
                  checked={selectedSet.has(String(product.id))}
                  onChange={() => onToggleSelection(product.id)}
                />
              </label>
              <img
                src={getProductImage(product, colors[0])}
                alt=""
                className="admin-catalog-thumb"
                loading="lazy"
                decoding="async"
              />
              <div className="admin-catalog-main">
                <div className="admin-catalog-title-row">
                  <div>
                    <h5>{product.name}</h5>
                    <p>{product.category || "Sin categoría"} · {product.productType || "General"}</p>
                  </div>
                  <strong>{currency(price)}</strong>
                </div>
                <div className="admin-catalog-meta">
                  <span>{colors.length} color{colors.length === 1 ? "" : "es"}</span>
                  <span>{sizes.length} talla{sizes.length === 1 ? "" : "s"}</span>
                  {tags.length > 0 && <span>{tags.length} tag{tags.length === 1 ? "" : "s"}</span>}
                  <span className={isPublic ? "is-success" : "is-muted"}>{isPublic ? "Público" : "Oculto"}</span>
                  {product.featured && <span className="is-featured">Destacado</span>}
                </div>
              </div>
              <div className="admin-catalog-actions">
                <button className="btn btn-outline" type="button" onClick={() => onToggleVisibility(product.id)}>
                  {isPublic ? <EyeOff size={15} /> : <Eye size={15} />}
                  {isPublic ? "Ocultar" : "Publicar"}
                </button>
                <button className="btn btn-soft" type="button" onClick={() => onEdit(product)}>
                  <PencilLine size={15} />Editar
                </button>
                <button
                  className="icon-btn"
                  type="button"
                  onClick={() => onDuplicate(product)}
                  aria-label={`Duplicar ${product.name}`}
                  title="Duplicar producto"
                >
                  <Copy size={16} />
                </button>
                <button
                  className="icon-btn admin-danger-icon"
                  type="button"
                  onClick={() => onDelete(product.id)}
                  aria-label={`Eliminar ${product.name}`}
                  title="Eliminar producto"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
