import crypto from "node:crypto";
import { checkCartAvailability } from "../../src/domain/orders/cartAvailability.js";

export const RESERVATION_TTL_MS = 5 * 60 * 1000;
export const reservationCartKey = (cart) => JSON.stringify(cart.map(item => [String(item?.id), item?.color, item?.size, Number(item?.quantity)]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));

function totals(products) {
  return products.map(product => ({ ...product, stockBySize: Object.fromEntries((product.sizes || []).map(size => [size, (product.variants || []).filter(v => v.size === size).reduce((sum, v) => sum + Math.max(0, Number(v.stock) || 0), 0)])) }));
}

export function syncReservationDeadline(draft) {
  draft.meta = { ...draft.meta, realtime: { ...draft.meta?.realtime, reservationExpiresAt: Math.min(...(draft.checkoutReservations || []).map(r => r.expiresAt), Infinity) === Infinity ? 0 : Math.min(...draft.checkoutReservations.map(r => r.expiresAt)) } };
}

export function releaseReservation(draft, reservation) {
  // Return only the original variant; never resurrect a deleted/replaced product.
  draft.products = totals(draft.products.map(product => ({ ...product, variants: (product.variants || []).map(variant => {
    const quantity = reservation.items.filter(item => String(item.id) === String(product.id) && item.color === variant.color && item.size === variant.size && (!item.uid || item.uid === variant.uid)).reduce((sum, item) => sum + item.quantity, 0);
    return quantity ? { ...variant, stock: Math.max(0, Number(variant.stock) || 0) + quantity } : variant;
  }) })));
  draft.checkoutReservations = (draft.checkoutReservations || []).filter(r => r.id !== reservation.id);
  syncReservationDeadline(draft);
}

export function expireReservations(draft, now = Date.now()) {
  const expired = (draft.checkoutReservations || []).filter(r => r.expiresAt <= now);
  expired.forEach(r => releaseReservation(draft, r));
  return expired.length > 0;
}

export function getReservedProducts(draft, reservation) {
  return draft.products.map(product => ({ ...product, variants: (product.variants || []).map(variant => {
    const quantity = reservation.items.filter(item => String(item.id) === String(product.id) && item.color === variant.color && item.size === variant.size && (!item.uid || item.uid === variant.uid)).reduce((sum, item) => sum + item.quantity, 0);
    return { ...variant, stock: Math.max(0, Number(variant.stock) || 0) + quantity };
  }) }));
}

/** Return only units the shopper removed; never acquire stock or extend the deadline. */
export function trimReservationToCart(draft, reservation, cart) {
  const wanted = new Map();
  for (const item of cart) {
    const key = JSON.stringify([String(item.id), item.color, item.size]);
    wanted.set(key, (wanted.get(key) || 0) + Number(item.quantity));
  }
  const kept = [];
  const returned = [];
  for (const item of reservation.items) {
    const key = JSON.stringify([String(item.id), item.color, item.size]);
    const quantity = Math.min(item.quantity, wanted.get(key) || 0);
    wanted.set(key, Math.max(0, (wanted.get(key) || 0) - quantity));
    if (quantity) kept.push({ ...item, quantity });
    if (quantity < item.quantity) returned.push({ ...item, quantity: item.quantity - quantity });
  }
  if (!returned.length) return false;
  releaseReservation(draft, { ...reservation, items: returned });
  if (kept.length) draft.checkoutReservations.push({ ...reservation, items: kept });
  syncReservationDeadline(draft);
  return true;
}

export function reserveCart(draft, owner, cart, now = Date.now()) {
  if (!Array.isArray(cart) || cart.length < 1 || cart.length > 25 || cart.some(item => !item || typeof item.id !== "string" || item.id.length > 200 || typeof item.color !== "string" || item.color.length > 120 || typeof item.size !== "string" || item.size.length > 50)) return { ok: false, message: "Revisa los productos de tu carrito." };
  const existing = (draft.checkoutReservations || []).find(r => r.owner === owner);
  if (existing && reservationCartKey(existing.items) === reservationCartKey(cart)) {
    const availability = checkCartAvailability(cart, getReservedProducts(draft, existing));
    return availability.ok ? { ok: true, reservation: existing } : availability;
  }
  if (existing) releaseReservation(draft, existing);
  const availability = checkCartAvailability(cart, draft.products);
  if (!availability.ok) return availability;
  if (cart.some(item => !draft.products.find(p => String(p.id) === item.id)?.variants?.some(v => v.color === item.color && v.size === item.size))) return { ok: false, message: "La variante cambió. Revisa tu carrito antes de pagar." };
  if ((draft.checkoutReservations || []).length >= 200) return { ok: false, message: "Hay varias compras en curso. Intenta nuevamente en unos minutos." };
  const items = cart.map(item => {
    const product = draft.products.find(p => String(p.id) === String(item.id));
    const variant = product.variants.find(v => v.color === item.color && v.size === item.size);
    return { id: item.id, color: item.color, size: item.size, quantity: Number(item.quantity), uid: variant.uid || "", price: Number(product.price) };
  });
  const reservation = { id: crypto.randomUUID(), owner, items, createdAt: now, expiresAt: now + RESERVATION_TTL_MS };
  draft.products = totals(draft.products.map(product => ({ ...product, variants: (product.variants || []).map(variant => {
    const quantity = items.filter(item => String(item.id) === String(product.id) && item.color === variant.color && item.size === variant.size).reduce((sum, item) => sum + item.quantity, 0);
    return quantity ? { ...variant, stock: Number(variant.stock) - quantity } : variant;
  }) })));
  draft.checkoutReservations = [...(draft.checkoutReservations || []), reservation];
  syncReservationDeadline(draft);
  return { ok: true, reservation };
}
