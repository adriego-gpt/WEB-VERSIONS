import React, { useEffect, useId, useRef } from "react";
import { AlertTriangle } from "lucide-react";
import { AnimatePresence, motion as Motion } from "framer-motion";
import { ANIMATION } from "../../constants/animation";

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export function ConfirmModal({
  open,
  title,
  description,
  confirmLabel = "Eliminar",
  cancelLabel = "Cancelar",
  secondaryLabel = "",
  confirmTone = "danger",
  children,
  onConfirm,
  onCancel,
  onSecondary,
}) {
  const dialogRef = useRef(null);
  const cancelButtonRef = useRef(null);
  const previousFocusRef = useRef(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open) return undefined;
    previousFocusRef.current = document.activeElement;
    const focusFrame = window.requestAnimationFrame(() => cancelButtonRef.current?.focus());
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel?.();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [...(dialogRef.current?.querySelectorAll(FOCUSABLE_SELECTOR) || [])];
      if (!focusable.length) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleKeyDown);
      previousFocusRef.current?.focus?.();
    };
  }, [open, onCancel]);

  return (
    <AnimatePresence>
      {open ? (
        <Motion.div
          className="modal-backdrop modal-backdrop-priority confirm-modal-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: 0.18, ease: ANIMATION.easeOut } }}
          exit={{ opacity: 0, transition: { duration: 0.14, ease: "easeOut" } }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) onCancel?.();
          }}
        >
          <Motion.section
            ref={dialogRef}
            className={`confirm-modal${secondaryLabel ? " confirm-modal-with-secondary" : ""}`}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descriptionId}
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: 0.2, ease: ANIMATION.easeOut } }}
            exit={{ opacity: 0, y: 8, scale: 0.97, transition: { duration: 0.14, ease: "easeOut" } }}
          >
            <div className="confirm-modal-icon" aria-hidden="true"><AlertTriangle size={22} /></div>
            <div>
              <h2 id={titleId} className="confirm-modal-title">{title}</h2>
              <p id={descriptionId} className="confirm-modal-description">{description}</p>
            </div>
            {children ? <div className="confirm-modal-content">{children}</div> : null}
            <div className="confirm-modal-actions">
              <button ref={cancelButtonRef} className="btn btn-outline" type="button" onClick={onCancel}>{cancelLabel}</button>
              {secondaryLabel ? (
                <button className="btn btn-danger" type="button" onClick={onSecondary}>{secondaryLabel}</button>
              ) : null}
              <button
                className={`btn ${confirmTone === "primary" ? "btn-primary" : "btn-danger"}`}
                type="button"
                onClick={onConfirm}
              >
                {confirmLabel}
              </button>
            </div>
          </Motion.section>
        </Motion.div>
      ) : null}
    </AnimatePresence>
  );
}
