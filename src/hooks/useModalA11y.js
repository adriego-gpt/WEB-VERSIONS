import { useEffect, useRef } from "react";

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Custom hook for WCAG 2.2 AA modal accessibility.
 * Manages:
 * 1. Initial focus when modal opens.
 * 2. Bidirectional focus trap (Tab / Shift+Tab).
 * 3. Escape key to close modal.
 * 4. Focus restoration to the previously active element upon closing.
 */
export function useModalA11y(open, onClose, options = {}) {
  const { initialFocusRef, disableEscape = false } = options;
  const containerRef = useRef(null);
  const previousFocusRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    // Capture the element that triggered the modal
    previousFocusRef.current = document.activeElement;

    // Shift focus into the modal smoothly
    const frameId = window.requestAnimationFrame(() => {
      if (initialFocusRef?.current) {
        initialFocusRef.current.focus();
      } else {
        const firstFocusable = containerRef.current?.querySelector(FOCUSABLE_SELECTOR);
        firstFocusable?.focus();
      }
    });

    const handleKeyDown = (event) => {
      // Escape key to dismiss
      if (event.key === "Escape" && !disableEscape) {
        event.preventDefault();
        onClose?.();
        return;
      }

      // Tab key navigation trap
      if (event.key === "Tab") {
        const focusableElements = [
          ...(containerRef.current?.querySelectorAll(FOCUSABLE_SELECTOR) || []),
        ];

        if (!focusableElements.length) {
          event.preventDefault();
          return;
        }

        const first = focusableElements[0];
        const last = focusableElements[focusableElements.length - 1];

        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.cancelAnimationFrame(frameId);
      document.removeEventListener("keydown", handleKeyDown);

      // Restore focus to the trigger element upon closing
      if (
        previousFocusRef.current instanceof HTMLElement &&
        previousFocusRef.current.isConnected
      ) {
        previousFocusRef.current.focus();
      }
    };
  }, [open, onClose, disableEscape, initialFocusRef]);

  return containerRef;
}

export default useModalA11y;
