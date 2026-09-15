import React, { useId, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { FALLBACK_IMAGE } from "../../constants/product";
import { useBodyScrollLock } from "../../hooks/useBodyScrollLock";
import { useOverlayHistory } from "../../hooks/useOverlayHistory";
import { useModalA11y } from "../../hooks/useModalA11y";

export function ImageLightbox({ open, src, alt = "Imagen ampliada", title = "Vista completa", onClose }) {
  const closeButtonRef = useRef(null);
  const titleId = useId();
  const visible = Boolean(open && src);
  const containerRef = useModalA11y(visible, onClose, { initialFocusRef: closeButtonRef });
  useBodyScrollLock(visible);
  useOverlayHistory({ open: visible, onClose });

  if (!open || !src || typeof document === "undefined") return null;

  return createPortal(
    <div className="image-lightbox-backdrop" role="presentation" onClick={onClose}>
      <div ref={containerRef} className="image-lightbox" role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={(event) => event.stopPropagation()}>
        <div className="image-lightbox-header">
          <strong id={titleId}>{title}</strong>
          <button ref={closeButtonRef} type="button" className="icon-btn" onClick={onClose} aria-label="Cerrar imagen ampliada">
            <X size={19} />
          </button>
        </div>
        <div className="image-lightbox-stage">
          <img
            src={src}
            alt={alt}
            decoding="async"
            onError={(e) => {
              e.currentTarget.onerror = null;
              e.currentTarget.src = FALLBACK_IMAGE;
            }}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default ImageLightbox;
