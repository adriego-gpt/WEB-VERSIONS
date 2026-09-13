import React from "react";
import { currency, discountPercent } from "../../utils/currency";
import { FALLBACK_IMAGE } from "../../constants/product";
import { getResponsiveImageSources, applyImageFallback } from "../../domain/products/imageSources.js";
import {
  getCurrentImageForProduct,
  getSelectionForColor,
} from "../../domain/products/variants";

export function ShowcaseProductCard({ product, onOpenDetail, isDuplicate = false }) {
  const principalSelection = getSelectionForColor(product, { color: product.catalogColor });
  const principalColor = principalSelection.color;
  const discount = discountPercent(product.price, product.oldPrice);
  const previewImage = getCurrentImageForProduct(product, principalColor) || FALLBACK_IMAGE;

  const handleOpen = () => {
    const resolved = getSelectionForColor(product, { color: principalColor });
    onOpenDetail(product, resolved);
  };

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
              srcSet={getResponsiveImageSources(previewImage)}
              sizes="(max-width: 768px) 50vw, (max-width: 1100px) 33vw, 25vw"
              alt={isDuplicate ? "" : product.name}
              className="featured-product-image"
              loading="lazy"
              decoding="async"
              onError={(event) => applyImageFallback(event.currentTarget, FALLBACK_IMAGE)}
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
