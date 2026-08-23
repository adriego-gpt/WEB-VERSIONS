import React from "react";
import { FALLBACK_IMAGE } from "../../constants";
import { normalizeImageSource } from "../../utils/fileUpload";

export function OrderReferenceStrip({ order, onOpen, actionLabel = "Ver referencia" }) {
  const previewItems = Array.isArray(order?.items) ? order.items.slice(0, 3) : [];
  const remainingItems = Math.max(0, (order?.items?.length || 0) - previewItems.length);
  const leadingItem = previewItems[0];

  return (
    <button type="button" className="order-reference-strip" onClick={() => onOpen?.(order)}>
      <div className="order-reference-thumbs" aria-hidden="true">
        {previewItems.map((item, index) => (
          <img
            key={`${item.key || item.name}-${index}`}
            src={normalizeImageSource(item.image) || FALLBACK_IMAGE}
            alt=""
            className="order-reference-thumb"
            loading="eager"
            decoding="async"
            onError={(event) => {
              event.currentTarget.onerror = null;
              event.currentTarget.src = FALLBACK_IMAGE;
            }}
            style={{ transform: `translateX(${index * -10}px)`, zIndex: previewItems.length - index }}
          />
        ))}
        {remainingItems > 0 && <span className="order-reference-more">+{remainingItems}</span>}
      </div>
      <div className="order-reference-copy">
        <p className="order-reference-title">Referencia visual del pedido</p>
        <p className="order-reference-subtitle">
          {leadingItem ? `${leadingItem.name}${order.items.length > 1 ? ` y ${order.items.length - 1} prenda(s) mas` : ""}` : "Ver prendas del pedido"}
        </p>
      </div>
      <span className="order-reference-action">{actionLabel}</span>
    </button>
  );
}

export default OrderReferenceStrip;
