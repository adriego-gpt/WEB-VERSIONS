import React from "react";

export function CatalogSkeletonCard() {
  return (
    <div className="card product-card skeleton-card" aria-hidden="true">
      <div className="skeleton-block skeleton-image" />
      <div className="product-card-body">
        <div className="skeleton-line skeleton-line-sm" />
        <div className="skeleton-line" />
        <div className="skeleton-line skeleton-line-sm" />
        <div className="skeleton-chip-row">
          <span className="skeleton-chip" />
          <span className="skeleton-chip" />
          <span className="skeleton-chip" />
        </div>
        <div className="skeleton-actions">
          <span className="skeleton-pill" />
          <span className="skeleton-pill skeleton-pill-light" />
        </div>
      </div>
    </div>
  );
}

export default CatalogSkeletonCard;
