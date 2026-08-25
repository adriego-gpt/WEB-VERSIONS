import React, { useState } from "react";
import { Heart, PencilLine, Trash2, X, Check } from "lucide-react";
import { motion as Motion, AnimatePresence } from "framer-motion";
import { currency, discountPercent } from "../../utils/currency";
import { getProductColorSwatch } from "../../utils/productColor";
import { ANIMATION } from "../../constants/animation";
import { FALLBACK_IMAGE } from "../../constants/product";
import {
  getSelectionForColor,
  getImagesForColor,
  getSizesForColor,
  getStockForVariant,
  getStockStatus,
} from "../../domain/products/variants";

function getVisibleOptions(options = [], selectedOption, limit) {
  const uniqueOptions = [...new Set(options.filter(Boolean))];
  if (uniqueOptions.length <= limit) return uniqueOptions;
  const visibleOptions = uniqueOptions.slice(0, limit);
  if (selectedOption && !visibleOptions.includes(selectedOption)) {
    visibleOptions[visibleOptions.length - 1] = selectedOption;
  }
  return visibleOptions;
}

export function CatalogProductCard({
  product,
  selection,
  onChange,
  onOpenDetail,
  onAddToCart,
  onToggleFavorite,
  isFavorite,
  isAdmin,
  onEdit,
  onDelete,
}) {
  const [addedFeedback, setAddedFeedback] = useState(false);
  const resolvedSelection = getSelectionForColor(product, selection);
  const selectedColor = resolvedSelection.color;
  const selectedSize = resolvedSelection.size;
  const currentImages = getImagesForColor(product, selectedColor);
  const currentImage = currentImages[0] || FALLBACK_IMAGE;
  const discount = discountPercent(product.price, product.oldPrice);
  const sizesForSelectedColor = getSizesForColor(product, selectedColor);
  const availableStock = resolvedSelection.availableStock;
  const stockStatus = getStockStatus(availableStock);
  const isLowStock = availableStock > 0 && availableStock <= 2;
  const visibleColors = getVisibleOptions(product.colors, selectedColor, 3);
  const visibleSizes = getVisibleOptions(sizesForSelectedColor, selectedSize, 4);
  const hiddenColorCount = Math.max(0, product.colors.length - visibleColors.length);
  const hiddenSizeCount = Math.max(0, sizesForSelectedColor.length - visibleSizes.length);

  const handleAddToCart = (event) => {
    event.stopPropagation();
    if (availableStock <= 0 || addedFeedback) return;
    setAddedFeedback(true);
    onAddToCart(
      product,
      { sourceElement: event.currentTarget, image: currentImage },
      { color: selectedColor, size: selectedSize }
    );
    setTimeout(() => {
      setAddedFeedback(false);
    }, 1200);
  };

  return (
    <Motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: ANIMATION.base }} className="card product-card">
      <div className="product-img-wrap">
        <button type="button" onClick={() => onOpenDetail(product, { color: selectedColor, size: selectedSize })} className="product-image-main-btn" aria-label={`Ver detalle de ${product.name}`}>
          <AnimatePresence mode="wait">
            <Motion.img
              key={`${product.id}-${selectedColor}-${currentImage}`}
              src={currentImage}
              alt={product.name}
              loading="lazy"
              decoding="async"
              initial={{ opacity: 0, scale: 1.02 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.99 }}
              transition={{ duration: ANIMATION.fast }}
              className="product-img"
              onError={(event) => {
                if (event.currentTarget.src !== FALLBACK_IMAGE) {
                  event.currentTarget.src = FALLBACK_IMAGE;
                }
              }}
            />
          </AnimatePresence>
        </button>
        <div className="product-card-badges" style={{ position: "absolute", left: 10, top: 10, display: "flex", flexWrap: "wrap", gap: 6, pointerEvents: "none" }}>
          {(() => {
            const visibleBadges = [];
            if (product.offerEnabled && discount > 0) visibleBadges.push(<span key="offer" className="badge badge-offer">Oferta -{discount}%</span>);
            if (product.newArrival && visibleBadges.length < 2) visibleBadges.push(<span key="new" className="badge badge-light">Nuevo</span>);
            if (product.featured && visibleBadges.length < 2) visibleBadges.push(<span key="feat" className="badge badge-dark">Destacado</span>);
            return visibleBadges;
          })()}
        </div>
        <div className="product-card-floating-actions">
          <button type="button" className="icon-btn" onClick={() => onToggleFavorite(product.id)} aria-label="Guardar en favoritos"><Heart size={16} fill={isFavorite ? "currentColor" : "none"} /></button>
        </div>
        {isAdmin && (
          <div style={{ position: "absolute", left: 10, bottom: 10, display: "flex", gap: 8 }}>
            <button type="button" className="icon-btn" onClick={() => onEdit(product)} title="Editar producto" aria-label="Editar producto"><PencilLine size={16} /></button>
            <button type="button" className="icon-btn" onClick={() => onDelete(product.id)} title="Eliminar producto" aria-label="Eliminar producto"><Trash2 size={16} /></button>
          </div>
        )}
      </div>

      <div className="product-card-body">
        <div className="product-card-overview">
          <div className="product-card-identity">
            <p className="product-card-category">{product.category}</p>
            <button type="button" className="product-card-title-button" onClick={() => onOpenDetail(product, { color: selectedColor, size: selectedSize })}>
              <h4 className="product-card-title">{product.name}</h4>
            </button>
          </div>
          <div className="product-card-price-group">
            {product.offerEnabled && discount > 0 && <p className="offer-price-callout">AHORA -{discount}%</p>}
            <p className="product-card-price">{currency(product.price)}</p>
            {product.oldPrice > product.price && <p className="product-card-old-price">{currency(product.oldPrice)}</p>}
          </div>
        </div>

        <div className="product-card-variant-quick">
          <div className="product-card-variant-row product-card-color-row">
            <span className="product-card-variant-label">Color <strong>{selectedColor}</strong></span>
            <div className="product-card-color-options" aria-label={`Colores de ${product.name}`}>
              {visibleColors.map((color) => (
                <button
                  type="button"
                  key={color}
                  className={`product-card-color-swatch${selectedColor === color ? " active" : ""}`}
                  onClick={() => onChange(product.id, "color", color)}
                  aria-label={`Elegir color ${color}`}
                  aria-pressed={selectedColor === color}
                  title={color}
                >
                  <span style={{ "--variant-swatch": getProductColorSwatch(color) }} />
                </button>
              ))}
              {hiddenColorCount > 0 && (
                <button
                  type="button"
                  className="product-card-more-variants"
                  onClick={() => onOpenDetail(product, { color: selectedColor, size: selectedSize })}
                  aria-label={`Ver ${hiddenColorCount} colores adicionales de ${product.name}`}
                >
                  +{hiddenColorCount}
                </button>
              )}
            </div>
          </div>
          <div className="product-card-variant-row">
            <span className="product-card-variant-label">Talla <strong>{selectedSize}</strong></span>
            <div className="product-card-size-options" aria-label={`Tallas de ${product.name}`}>
              {visibleSizes.map((size) => {
                const sizeStock = getStockForVariant(product, selectedColor, size);
                return (
                  <button
                    type="button"
                    key={size}
                    className={`product-card-size-option${selectedSize === size ? " active" : ""}`}
                    onClick={() => sizeStock > 0 && onChange(product.id, "size", size)}
                    disabled={sizeStock <= 0}
                    aria-pressed={selectedSize === size}
                    aria-label={`Elegir talla ${size}${sizeStock <= 0 ? ", agotada" : ""}`}
                  >
                    {size}
                  </button>
                );
              })}
              {hiddenSizeCount > 0 && (
                <button
                  type="button"
                  className="product-card-more-variants"
                  onClick={() => onOpenDetail(product, { color: selectedColor, size: selectedSize })}
                  aria-label={`Ver ${hiddenSizeCount} tallas adicionales de ${product.name}`}
                >
                  +{hiddenSizeCount}
                </button>
              )}
            </div>
          </div>
          <div className="product-card-stock-line">
            <span className={`badge badge-${stockStatus.tone} ${isLowStock ? "badge-low-stock" : ""}`}>
              {isLowStock ? (availableStock === 1 ? "Última unidad" : `Últimas ${availableStock} unidades`) : stockStatus.label}
            </span>
          </div>
        </div>

        <div className="product-card-actions">
          <button
            type="button"
            className={`btn ${addedFeedback ? "btn-success" : "btn-primary"}`}
            style={{
              width: "100%",
              opacity: availableStock <= 0 ? 0.6 : 1,
              cursor: availableStock <= 0 ? "not-allowed" : (addedFeedback ? "default" : "pointer"),
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
              transition: "all 0.2s ease"
            }}
            onClick={handleAddToCart}
            disabled={availableStock <= 0 || addedFeedback}
          >
            {availableStock <= 0 ? (
              "Agotado"
            ) : addedFeedback ? (
              <>
                <Check size={16} /> ¡Agregado!
              </>
            ) : (
              "Agregar"
            )}
          </button>
        </div>
      </div>
    </Motion.div>
  );
}

export const MemoCatalogProductCard = React.memo(
  CatalogProductCard,
  (prev, next) => (
    prev.product === next.product
    && prev.selection === next.selection
    && prev.isFavorite === next.isFavorite
    && prev.isAdmin === next.isAdmin
  ),
);

export default MemoCatalogProductCard;
