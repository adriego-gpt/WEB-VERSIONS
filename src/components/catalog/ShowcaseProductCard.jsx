import React, { useState, useEffect, useCallback } from "react";
import { currency, discountPercent } from "../../utils/currency";
import { FALLBACK_IMAGE } from "../../constants/product";
import { getProductColorSwatch } from "../../utils/productColor";
import {
  getCurrentImageForProduct,
  getSelectionForColor,
} from "../../domain/products/variants";

export function ShowcaseProductCard({ product, onOpenDetail, isDuplicate = false }) {
  const fallbackSelection = getSelectionForColor(product, { color: product.catalogColor });
  const [selectedColor, setSelectedColor] = useState(fallbackSelection.color);

  useEffect(() => {
    setSelectedColor(fallbackSelection.color);
  }, [product?.id, fallbackSelection.color]);

  const discount = discountPercent(product.price, product.oldPrice);
  const previewImage = getCurrentImageForProduct(product, selectedColor) || FALLBACK_IMAGE;
  const colors = Array.isArray(product?.colors) ? product.colors.filter(Boolean) : [];
  const visibleColors = colors.slice(0, 4);
  const hiddenColorCount = Math.max(0, colors.length - visibleColors.length);

  const handleColorClick = (event, color) => {
    event.stopPropagation();
    event.preventDefault();
    setSelectedColor(color);
  };

  const handleOpen = useCallback(() => {
    const resolved = getSelectionForColor(product, { color: selectedColor });
    onOpenDetail(product, resolved);
  }, [onOpenDetail, product, selectedColor]);

  return (
    <article className="featured-product-card" aria-hidden={isDuplicate ? "true" : undefined}>
      <div className="featured-product-link">
        <button
          type="button"
          className="featured-product-open"
          onClick={handleOpen}
          tabIndex={isDuplicate ? -1 : 0}
          aria-label={`Ver detalle de ${product.name}, ${currency(product.price)}`}
        >
          <span className="featured-product-image-wrap">
            <img
              src={previewImage}
              alt={isDuplicate ? "" : product.name}
              className="featured-product-image"
              loading="lazy"
              decoding="async"
              onError={(event) => {
                if (event.currentTarget.src !== FALLBACK_IMAGE) event.currentTarget.src = FALLBACK_IMAGE;
              }}
            />
            {product.offerEnabled && discount > 0 ? <span className="featured-product-discount">-{discount}%</span> : null}
          </span>
        </button>
        <span className="featured-product-info">
          <span className="featured-product-details">
            <button
              type="button"
              className="featured-product-name"
              onClick={handleOpen}
              tabIndex={isDuplicate ? -1 : 0}
            >
              {product.name}
            </button>
            {colors.length > 1 && (
              <span className="featured-product-swatches">
                {visibleColors.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={`featured-swatch${selectedColor === color ? " active" : ""}`}
                    onClick={(e) => handleColorClick(e, color)}
                    title={`Color ${color}`}
                    aria-label={`Color ${color}`}
                    tabIndex={isDuplicate ? -1 : 0}
                  >
                    <span style={{ "--variant-swatch": getProductColorSwatch(color, product.colorSwatches?.[color]) }} />
                  </button>
                ))}
                {hiddenColorCount > 0 && (
                  <span className="featured-swatch-more">+{hiddenColorCount}</span>
                )}
              </span>
            )}
          </span>
          <span className="featured-product-prices">
            <strong>{currency(product.price)}</strong>
            {product.oldPrice > product.price ? <del>{currency(product.oldPrice)}</del> : null}
          </span>
        </span>
      </div>
    </article>
  );
}

export const MemoShowcaseProductCard = React.memo(
  ShowcaseProductCard,
  (prev, next) => (
    prev.product === next.product
    && prev.isDuplicate === next.isDuplicate
    && prev.onOpenDetail === next.onOpenDetail
  ),
);

export default MemoShowcaseProductCard;
