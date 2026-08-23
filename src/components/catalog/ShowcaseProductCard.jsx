import React from "react";
import { currency, discountPercent } from "../../utils/currency";
import { FALLBACK_IMAGE } from "../../constants/product";
import { getFallbackSelection, getCurrentImageForProduct } from "../../domain/products/variants";

export function ShowcaseProductCard({ product, onOpenDetail, isDuplicate = false }) {
  const fallbackSelection = getFallbackSelection(product);
  const discount = discountPercent(product.price, product.oldPrice);
  const previewImage = getCurrentImageForProduct(product, fallbackSelection.color);

  return (
    <article className="featured-product-card" aria-hidden={isDuplicate ? "true" : undefined}>
      <button
        type="button"
        className="featured-product-link"
        onClick={() => onOpenDetail(product, fallbackSelection)}
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
        <span className="featured-product-info">
          <span className="featured-product-name">{product.name}</span>
          <span className="featured-product-prices">
            <strong>{currency(product.price)}</strong>
            {product.oldPrice > product.price ? <del>{currency(product.oldPrice)}</del> : null}
          </span>
        </span>
      </button>
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
