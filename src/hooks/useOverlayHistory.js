import { useEffect, useLayoutEffect, useRef } from "react";
import { createUuid } from "../utils/uid.js";

/** Store only UI state in history: never passwords, contact data or proof images. */
export function useOverlayHistory({ open, onClose, step, onStepChange }) {
  const callbacks = useRef({ onClose, onStepChange });
  const keyRef = useRef(null);
  const lifetimeRef = useRef(0);
  const initialStep = useRef(step);
  useLayoutEffect(() => {
    callbacks.current = { onClose, onStepChange };
    initialStep.current = step;
  }, [onClose, onStepChange, step]);
  useEffect(() => {
    if (!open || typeof window === "undefined") return undefined;
    const lifetime = ++lifetimeRef.current;
    const pathname = window.location.pathname;
    // React StrictMode replays setup/cleanup. Reuse our entry rather than
    // pushing twice and immediately navigating back out of the new overlay.
    const parent = window.history.state || {};
    const reuseEntry = keyRef.current && parent.adriegoModal?.key === keyRef.current;
    const key = reuseEntry ? keyRef.current : createUuid();
    keyRef.current = key;
    if (!reuseEntry) window.history.pushState({ ...parent, adriegoModal: { key, step: initialStep.current, depth: 0 } }, document.title, window.location.href);
    const restore = () => {
      const modal = window.history.state?.adriegoModal;
      if (modal?.key !== key) callbacks.current.onClose?.();
      else if (modal.step !== undefined) callbacks.current.onStepChange?.(modal.step);
    };
    window.addEventListener("popstate", restore);
    return () => {
      window.removeEventListener("popstate", restore);
      queueMicrotask(() => {
        // The current generation must be re-read here: StrictMode may already
        // have replayed this effect before this cleanup microtask runs.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        if (lifetimeRef.current !== lifetime) return;
        const modal = window.history.state?.adriegoModal;
        if (modal?.key === key && window.location.pathname === pathname) window.history.go(-(modal.depth + 1));
        keyRef.current = null;
      });
    };
  }, [open]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const modal = window.history.state?.adriegoModal;
    if (!open || step === undefined || modal?.key !== keyRef.current || modal.step === step) return;
    window.history.pushState({ ...window.history.state, adriegoModal: { ...modal, step, depth: modal.depth + 1 } }, document.title, window.location.href);
  }, [open, step]);
}
