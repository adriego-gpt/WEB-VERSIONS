import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { FALLBACK_IMAGE } from "../../constants/product";

export function ImageLightbox({ open, src, alt = "Imagen ampliada", title = "Vista completa", onClose }) {
  const closeButtonRef = useRef(null);

  useEffect(() => {
    if (!open || typeof document === "undefined") return undefined;
    const returnFocusTo = document.activeElement;
    const focusTimer = window.setTimeout(() => closeButtonRef.current?.focus(), 0);
    const handleKeyDown = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onClose?.();
    };
    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", handleKeyDown, true);
      if (returnFocusTo instanceof HTMLElement && returnFocusTo.isConnected) returnFocusTo.focus();
    };
  }, [open, onClose]);

  if (!open || !src || typeof document === "undefined") return null;

  return createPortal(
    <div className="image-lightbox-backdrop" role="presentation" onClick={onClose}>
      <div className="image-lightbox" role="dialog" aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()}>
        <div className="image-lightbox-header">
          <strong>{title}</strong>
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
