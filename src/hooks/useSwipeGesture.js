import { useCallback, useRef } from "react";

const SWIPE_POINTERS = new Set(["touch", "pen", "mouse"]);

export function useSwipeGesture({
  enabled = true,
  threshold = 42,
  onSwipeLeft,
  onSwipeRight,
} = {}) {
  const startRef = useRef(null);
  const intentRef = useRef(null);
  const suppressClickRef = useRef(false);

  const reset = useCallback(() => {
    startRef.current = null;
    intentRef.current = null;
  }, []);

  const onPointerDown = useCallback((event) => {
    if (!enabled || !SWIPE_POINTERS.has(event.pointerType)) return;
    startRef.current = { x: event.clientX, y: event.clientY };
    intentRef.current = null;
    suppressClickRef.current = false;
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }, [enabled]);

  const onPointerMove = useCallback((event) => {
    if (!startRef.current || !SWIPE_POINTERS.has(event.pointerType)) return;
    const deltaX = event.clientX - startRef.current.x;
    const deltaY = event.clientY - startRef.current.y;
    if (!intentRef.current && (Math.abs(deltaX) > 8 || Math.abs(deltaY) > 8)) {
      intentRef.current = Math.abs(deltaX) > Math.abs(deltaY) * 1.15 ? "horizontal" : "vertical";
    }
    if (intentRef.current === "horizontal" && event.cancelable) event.preventDefault();
  }, []);

  const onPointerUp = useCallback((event) => {
    if (!startRef.current || !SWIPE_POINTERS.has(event.pointerType)) return;
    const deltaX = event.clientX - startRef.current.x;
    const deltaY = event.clientY - startRef.current.y;
    const isSwipe = Math.abs(deltaX) >= threshold && Math.abs(deltaX) > Math.abs(deltaY) * 1.15;
    reset();
    if (!isSwipe) return;
    suppressClickRef.current = true;
    if (deltaX < 0) onSwipeLeft?.();
    else onSwipeRight?.();
  }, [onSwipeLeft, onSwipeRight, reset, threshold]);

  const onPointerCancel = useCallback(() => {
    reset();
  }, [reset]);

  const onClickCapture = useCallback((event) => {
    if (!suppressClickRef.current) return;
    suppressClickRef.current = false;
    event.preventDefault();
    event.stopPropagation();
  }, []);

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onClickCapture,
  };
}
