import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

export function useCheckoutAvailability({ open, cart, onCheckAvailability, onAvailabilityWarning, refreshKey }) {
  const signature = JSON.stringify(cart.map(({ id, color, size, quantity, price }) => [id, color, size, quantity, price]));
  const latest = useRef({ signature, cart, open, checker: onCheckAvailability, warning: onAvailabilityWarning });
  const generation = useRef(0);
  useLayoutEffect(() => {
    if (latest.current.signature !== signature || latest.current.open !== open || latest.current.checker !== onCheckAvailability) generation.current += 1;
    latest.current = { signature, cart, open, checker: onCheckAvailability, warning: onAvailabilityWarning };
  }, [signature, cart, open, onCheckAvailability, onAvailabilityWarning]);
  const pending = useRef(null);
  const lastWarning = useRef("");
  const [status, setStatus] = useState({ ok: false, message: "Comprobando disponibilidad…", signature: "" });

  const warn = useCallback((result, cartSignature) => {
    if (result.ok) { lastWarning.current = ""; return; }
    const key = JSON.stringify([cartSignature, result.code, result.message]);
    if (lastWarning.current === key) return;
    lastWarning.current = key;
    latest.current.warning?.(result);
  }, []);

  const check = useCallback(async ({ background = false, reserve = false } = {}) => {
    const snapshot = latest.current;
    if (!snapshot.open || !snapshot.cart.length) return { ok: false, message: "Tu carrito está vacío o cerrado." };
    if (!reserve && pending.current?.signature === snapshot.signature && pending.current.checker === snapshot.checker && pending.current.generation === generation.current && (background || !pending.current.background)) return pending.current.promise;
    const requestGeneration = ++generation.current;
    const promise = (async () => {
      let result;
      try {
        result = typeof onCheckAvailability === "function"
          ? await onCheckAvailability(snapshot.cart, { background, reserve })
          : { ok: false, message: "No pudimos verificar la disponibilidad. No realices el pago todavía." };
      } catch {
        result = { ok: false, message: "No hay conexión para verificar el stock. No realices el pago todavía." };
      }
      if (typeof navigator !== "undefined" && navigator.onLine === false) result = { ok: false, message: "Sin conexión: no realices el pago hasta verificar el stock." };
      if (generation.current !== requestGeneration || latest.current.signature !== snapshot.signature || latest.current.checker !== snapshot.checker || !latest.current.open) return { ok: false, message: "La comprobación cambió. Revisa el carrito y vuelve a continuar." };
      setStatus(previous => previous.ok === result.ok && previous.message === result.message && previous.signature === snapshot.signature && previous.checker === snapshot.checker && JSON.stringify(previous.stock) === JSON.stringify(result.stock) && previous.expiresAt === result.expiresAt && previous.reservationId === result.reservationId
        ? previous : { ...result, signature: snapshot.signature, checker: snapshot.checker });
      warn(result, snapshot.signature);
      return result;
    })();
    pending.current = { signature: snapshot.signature, checker: snapshot.checker, generation: requestGeneration, promise, background };
    try { return await promise; } finally {
      if (pending.current?.promise === promise) pending.current = null;
    }
  }, [onCheckAvailability, warn]);

  useEffect(() => {
    if (!open || !status.ok || !status.reservationId || !status.expiresAt || status.signature !== signature || status.checker !== onCheckAvailability) return undefined;
    const remaining = Math.max(0, status.expiresAt - status.serverNow);
    const timer = window.setTimeout(() => {
      if (!latest.current.open || latest.current.signature !== signature || latest.current.checker !== onCheckAvailability) return;
      generation.current += 1;
      const expired = { ...status, ok: false, code: "RESERVATION_EXPIRED", message: "Tu reserva de 5 minutos terminó. No realices el pago. Revisa la disponibilidad y reserva nuevamente. Si ya pagaste, conserva tu comprobante y contacta a la tienda; no pagues otra vez." };
      setStatus(expired);
      warn(expired, signature);
      void check({ background: true });
    }, remaining);
    return () => window.clearTimeout(timer);
  }, [open, status, signature, onCheckAvailability, check, warn]);

  useEffect(() => {
    if (!open || !cart.length) return undefined;
    let stopped = false;
    let timer;
    const refresh = async () => {
      window.clearTimeout(timer);
      if (document.hidden || stopped) return;
      await check({ background: true });
      window.clearTimeout(timer);
      if (!stopped && !document.hidden) timer = window.setTimeout(refresh, 5000);
    };
    const offline = () => {
      generation.current += 1;
      const result = { ok: false, signature, checker: onCheckAvailability, code: "OFFLINE", message: "Sin conexión: no podemos verificar el stock. No realices el pago todavía." };
      setStatus(result);
      warn(result, signature);
    };
    window.addEventListener("offline", offline);
    window.addEventListener("online", refresh);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    void refresh();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", refresh);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [open, signature, cart.length, check, onCheckAvailability, warn, refreshKey]);

  const reportAvailabilityFailure = useCallback((result) => {
    const snapshot = latest.current;
    if (!snapshot.open || !snapshot.cart.length || result?.ok !== false) return;
    generation.current += 1;
    setStatus({ ...result, signature: snapshot.signature, checker: snapshot.checker });
    warn(result, snapshot.signature);
  }, [warn]);
  return { availability: status.signature === signature && status.checker === onCheckAvailability ? status : { ok: false, message: "Comprobando disponibilidad…" }, checkAvailability: check, reportAvailabilityFailure };
}
