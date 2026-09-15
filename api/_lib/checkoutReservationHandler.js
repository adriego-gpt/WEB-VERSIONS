import { readStore, updateStore, bumpRealtimeMeta } from "./store.js";
import { ensureGuestSession, readGuestSession } from "./guestSession.js";
import { reserveCart, getReservedProducts, reservationCartKey, trimReservationToCart } from "./checkoutReservations.js";
import { checkCartAvailability } from "../../src/domain/orders/cartAvailability.js";
import { consumeRateLimit, getClientIp, parseCookies, verifySignedToken, resolveVersionedUserSession } from "./security.js";

// Uses checkout-order's POST-only, JSON, same-origin and CSRF boundary.
export async function handleCheckoutReservation(req, res, body) {
  const action = req.query?.action;
  const adjusting = action === "adjust-reservation";
  const session = verifySignedToken(parseCookies(req.headers?.cookie || "").adriego_user_session, process.env.USER_SESSION_SECRET);
  const guest = session ? null : (readGuestSession(req) || (action === "reserve" ? ensureGuestSession(req, res) : null));
  if (!session && !guest) { res.status(401).json({ ok: false, message: "Vuelve a revisar el carrito para continuar." }); return; }
  const owner = session?.sub || guest.sub;
  const cart = body.cart;
  if (!Array.isArray(cart) || (!cart.length && !adjusting) || cart.length > 25 || cart.some(item => !item || typeof item.id !== "string" || typeof item.color !== "string" || typeof item.size !== "string" || (adjusting && (!Number.isSafeInteger(Number(item.quantity)) || Number(item.quantity) < 1 || Number(item.quantity) > 10)))) { res.status(400).json({ ok: false, message: "El carrito no es válido." }); return; }
  if (action === "reserve") {
    const limit = await consumeRateLimit("checkout-reservation-ip", getClientIp(req), 8, 5 * 60 * 1000, { endpoint: "checkout-reservation" });
    if (!limit.ok) { res.setHeader("Retry-After", String(Math.ceil(limit.retryAfterMs / 1000))); res.status(429).json({ ok: false, message: "Espera unos minutos antes de reservar de nuevo." }); return; }
  } else {
    const limit = await consumeRateLimit("checkout-reservation-status-ip", getClientIp(req), 240, 10 * 60 * 1000, { endpoint: "checkout-reservation" });
    if (!limit.ok) { res.setHeader("Retry-After", String(Math.ceil(limit.retryAfterMs / 1000))); res.status(429).json({ ok: false, message: "No podemos comprobar la reserva ahora. No realices el pago todavía." }); return; }
  }
  let result;
  let editingStock;
  const inspect = draft => {
    if (session && !resolveVersionedUserSession(draft.users, session)) { result = { ok: false, status: 401, message: "Tu sesión expiró. Inicia sesión nuevamente." }; return draft; }
    if (draft.storeSettings?.maintenanceSettings?.enabled) { result = { ok: false, status: 503, message: "La tienda está en mantenimiento. No realices el pago." }; return draft; }
    if (adjusting) {
      const reservation = (draft.checkoutReservations || []).find(r => r.owner === owner && r.id === body.reservationId && r.expiresAt > Date.now());
      if (reservation && trimReservationToCart(draft, reservation, cart)) bumpRealtimeMeta(draft, ["catalog"]);
      result = { ok: true, adjusted: true, remainingReservationId: (draft.checkoutReservations || []).find(r => r.owner === owner && r.id === body.reservationId)?.id || "", message: "Carrito actualizado." };
    } else if (action === "reserve") {
      const before = JSON.stringify(draft.checkoutReservations);
      result = reserveCart(draft, owner, cart);
      if (JSON.stringify(draft.checkoutReservations) !== before) bumpRealtimeMeta(draft, ["catalog"]);
    } else {
      const reservation = (draft.checkoutReservations || []).find(r => r.owner === owner && r.id === body.reservationId && r.expiresAt > Date.now());
      const matches = reservation && reservationCartKey(reservation.items) === reservationCartKey(cart);
      result = reservation && (matches || body.allowCartChanges === true)
        ? { ...checkCartAvailability(cart, getReservedProducts(draft, reservation)), reservation, projection: !matches }
        : { ok: false, code: "RESERVATION_EXPIRED", message: "La reserva terminó o el carrito cambió. No realices el pago. Revisa la disponibilidad y reserva nuevamente." };
    }
    const owned = (draft.checkoutReservations || []).find(r => r.owner === owner && r.expiresAt > Date.now());
    if (owned) {
      const effective = getReservedProducts(draft, owned);
      editingStock = { stockExpiresAt: owned.expiresAt, serverNow: Date.now(), stock: effective.flatMap(product => (product.variants || [])
        .filter(variant => [...cart, ...owned.items].some(item => String(item.id) === String(product.id) && item.color === variant.color && item.size === variant.size))
        .map(variant => ({ id: String(product.id), color: variant.color, size: variant.size, uid: variant.uid || "", stock: variant.stock }))) };
    }
    if (result.ok && !adjusting) {
      const effective = getReservedProducts(draft, result.reservation);
      result = { ok: true, reservationId: result.projection ? "" : result.reservation.id, expiresAt: result.projection ? 0 : result.reservation.expiresAt, serverNow: Date.now(), message: result.projection ? "Carrito actualizado. Confirma la entrega para reservar estas prendas antes de pagar." : "Prendas reservadas durante 5 minutos. Envía el comprobante antes de que termine el tiempo.", stock: cart.map(item => ({ id: item.id, color: item.color, size: item.size, stock: effective.find(p => String(p.id) === item.id)?.variants.find(v => v.color === item.color && v.size === item.size)?.stock || 0 })), paymentSettings: draft.contactSettings?.paymentSettings || {} };
    }
    return draft;
  };
  try {
    if (action === "reserve" || adjusting) await updateStore(inspect);
    else inspect(await readStore());
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    res.setHeader("Vercel-CDN-Cache-Control", "no-store");
    res.status(result.ok ? 200 : result.status || 409).json({ ...(result.ok ? result : { ok: false, code: result.code, message: result.message }), ...editingStock });
  } catch {
    res.status(503).json({ ok: false, message: "No pudimos proteger el stock. No realices el pago; vuelve a intentarlo." });
  }
}
