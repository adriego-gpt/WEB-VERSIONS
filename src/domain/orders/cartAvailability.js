import { getStockForVariant } from "../products/variants.js";

/** Never silently discard a sold line or validate duplicate quantities separately. */
export function checkCartAvailability(cart = [], products = []) {
  if (!Array.isArray(cart) || !cart.length) return { ok: false, message: "Tu carrito está vacío." };
  const byId = new Map(products.map(product => [String(product.id), product]));
  const requested = new Map();
  for (const item of cart) {
    const product = byId.get(String(item.id));
    const label = `${product?.name || item.name || "Prenda"} (${item.color} / ${item.size})`;
    if (!product || product.isPublic === false) return { ok: false, message: `${label} ya no está disponible. No realices el pago; retírala del carrito.` };
    const key = JSON.stringify([String(item.id), item.color, item.size]);
    const quantity = Number(item.quantity);
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 10) return { ok: false, message: "Revisa las cantidades de tu carrito antes de pagar." };
    const total = (requested.get(key) || 0) + quantity;
    requested.set(key, total);
    const stock = getStockForVariant(product, item.color, item.size);
    if (stock < total) return { ok: false, message: stock <= 0
      ? `${label} se agotó. No realices el pago; retírala del carrito para continuar.`
      : `${stock === 1 ? "Solo queda 1 unidad" : `Solo quedan ${stock} unidades`} de ${label}. No realices el pago hasta ajustar la cantidad.` };
    if (!Number.isFinite(Number(product.price)) || Number(product.price) <= 0) return { ok: false, message: `${label} no tiene un precio válido. Contacta a la tienda antes de pagar.` };
    if (Math.abs(Number(item.price) - Number(product.price)) > 0.001) return { ok: false, message: `El precio de ${label} cambió. Revisa el total actualizado antes de pagar.` };
  }
  return { ok: true, message: "Disponibilidad comprobada. El carrito todavía no reserva las prendas." };
}
