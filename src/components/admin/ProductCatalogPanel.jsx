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
import { isLegacyInlineCatalogImage } from "../../domain/admin/legacyImageMigration.js";
import { AdminSectionHeader } from "./AdminSectionHeader";

export function ProductCatalogPanel({
  products = [],
  query = "",
  onQueryChange,
  quickView: controlledQuickView,
  onQuickViewChange,
  selectedSet = new Set(),
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
  const [internalQuickView, setInternalQuickView] = React.useState("all");
  const quickView = controlledQuickView !== undefined ? controlledQuickView : internalQuickView;
  const setQuickView = onQuickViewChange || setInternalQuickView;
  const [sortMode, setSortMode] = React.useState("name");
  const visibleProducts = React.useMemo(() => {
    const matches = products.filter((product) => {
      const stock = (product.variants || []).reduce((total, variant) => total + Math.max(0, Number(variant.stock) || 0), 0);
      const imageCount = Object.values(product.imagesByColor || {}).flat().filter(Boolean).length;
      if (quickView === "draft") return product.isPublic === false;
      if (quickView === "published") return product.isPublic !== false;
      if (quickView === "legacy-photos") {
        return Object.values(product.imagesByColor || {}).flat().some((img) => isLegacyInlineCatalogImage(img));
      }
      if (quickView === "no-photo") return imageCount === 0;
      if (quickView === "out") return stock === 0;
      if (quickView === "low") return stock > 0 && stock <= 5;
      if (quickView === "offer") return Boolean(product.offerEnabled);
      if (quickView === "featured") return Boolean(product.featured);
      return true;
    });
    return [...matches].sort((left, right) => {
      if (sortMode === "price-asc") return Number(left.basePrice ?? left.price) - Number(right.basePrice ?? right.price);
      if (sortMode === "price-desc") return Number(right.basePrice ?? right.price) - Number(left.basePrice ?? left.price);
      if (sortMode === "stock") {
        const stockFor = (product) => (product.variants || []).reduce((total, variant) => total + Math.max(0, Number(variant.stock) || 0), 0);
        return stockFor(left) - stockFor(right);
      }
      return String(left.name || "").localeCompare(String(right.name || ""), "es", { sensitivity: "base" });
    });
  }, [products, quickView, sortMode]);
  const visibleProductIds = React.useMemo(() => visibleProducts.map((product) => String(product.id)), [visibleProducts]);
  const allDisplayedSelected = visibleProductIds.length > 0 && visibleProductIds.every((id) => selectedSet.has(id));

  return (
    <section className="admin-workspace admin-catalog-workspace" aria-labelledby="admin-catalog-title">
      <AdminSectionHeader
        title="Productos"
        titleId="admin-catalog-title"
        description="Busca, publica o edita productos sin perder el contexto del catálogo."
        meta={<span className="admin-count-label">{visibleProducts.length} de {products.length}</span>}
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
        <button
          className="btn btn-outline"
          type="button"
          onClick={() => onToggleAllVisible(visibleProductIds)}
          disabled={!visibleProductIds.length}
        >
          <CheckCircle2 size={16} />
          {allDisplayedSelected ? "Quitar visibles" : "Seleccionar visibles"}
        </button>
      </div>

      <div className="admin-catalog-viewbar">
        <div className="admin-quick-views" aria-label="Vistas rápidas del catálogo">
          {[
            ["all", "Todos"], ["draft", "Borradores"], ["published", "Publicados"], ["legacy-photos", "Por migrar"],
            ["no-photo", "Sin foto"], ["out", "Agotados"], ["low", "Stock bajo"], ["offer", "Con oferta"], ["featured", "Destacados"],
          ].map(([value, label]) => <button key={value} type="button" className={quickView === value ? "active" : ""} onClick={() => setQuickView(value)}>{label}</button>)}
        </div>
        <label className="admin-catalog-sort"><span>Ordenar</span><select className="select" value={sortMode} onChange={(event) => setSortMode(event.target.value)}><option value="name">Nombre</option><option value="price-asc">Precio menor</option><option value="price-desc">Precio mayor</option><option value="stock">Menor stock</option></select></label>
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
              <Trash2 size={15} />{bulkBusy ? "Procesando…" : "Eliminar"}
            </button>
          </div>
        </div>
      )}

      <div className="admin-catalog-list">
        {visibleProducts.length === 0 ? (
          <div className="empty-admin-note">No hay productos que coincidan con la búsqueda actual.</div>
        ) : visibleProducts.map((product) => {
          const colors = Array.isArray(product.colors) ? product.colors : [];
          const sizes = Array.isArray(product.sizes) ? product.sizes : [];
          const tags = Array.isArray(product.filterTags) ? product.filterTags : [];
          const isPublic = product.isPublic !== false;
          const hasLegacyImages = Object.values(product.imagesByColor || {}).flat().some((img) => isLegacyInlineCatalogImage(img));
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
                width="64"
                height="68"
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
                  {product.sku && <span>SKU {product.sku}</span>}
                  <span>{colors.length} color{colors.length === 1 ? "" : "es"}</span>
                  <span>{sizes.length} talla{sizes.length === 1 ? "" : "s"}</span>
                  {tags.length > 0 && <span>{tags.length} tag{tags.length === 1 ? "" : "s"}</span>}
                  <span className={isPublic ? "is-success" : "is-muted"}>{isPublic ? "Público" : "Oculto"}</span>
                  {hasLegacyImages && <span className="admin-status-label is-warning">Fotos por migrar</span>}
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
