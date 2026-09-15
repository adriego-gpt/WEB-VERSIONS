import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { getStockNotificationPresentation, isMaintenanceAvailability } from "../../src/domain/notifications/stock.js";

test("stock notices keep one concise, actionable message", () => {
  const presentation = getStockNotificationPresentation({
    code: "OUT_OF_STOCK",
    message: "Clásica Fibra YD (Azul Marino / S) se agotó. No realices el pago; retírala del carrito para continuar.",
  });
  assert.equal(presentation.title, "Esta talla se agotó");
  assert.equal(presentation.message, "Clásica Fibra YD (Azul Marino / S) se agotó.");
  assert.match(presentation.key, /OUT_OF_STOCK/);
});

test("stock notice variants distinguish reservation, connection, and partial stock", () => {
  assert.equal(getStockNotificationPresentation({ code: "RESERVATION_EXPIRED" }).title, "Reserva finalizada");
  assert.equal(getStockNotificationPresentation({ code: "OFFLINE" }).title, "No pudimos verificar el stock");
  assert.equal(getStockNotificationPresentation({ code: "INSUFFICIENT_STOCK", message: "Solo quedan 2 unidades." }).title, "Stock actualizado");
  assert.equal(getStockNotificationPresentation({ message: "El carrito cambió mientras comprobábamos el stock." }).title, "Revisa el carrito");
});

test("maintenance uses its dedicated page instead of a stock toast", () => {
  assert.equal(isMaintenanceAvailability({ code: "MAINTENANCE" }), true);
  assert.equal(isMaintenanceAvailability({ code: "STORE_MAINTENANCE" }), true);
  assert.equal(isMaintenanceAvailability({ message: "La tienda está en mantenimiento. No realices el pago todavía." }), true);
  assert.equal(isMaintenanceAvailability({ code: "OUT_OF_STOCK" }), false);
});

test("cart owns the only persistent stock message and product detail can choose quantity", async () => {
  const [cart, app, modal] = await Promise.all([
    fs.readFile(new URL("../../src/components/cart/CartSummaryModal.jsx", import.meta.url), "utf8"),
    fs.readFile(new URL("../../src/App.jsx", import.meta.url), "utf8"),
    fs.readFile(new URL("../../src/components/products/ProductModal.jsx", import.meta.url), "utf8"),
  ]);
  assert.match(cart, /stockBlocked && \(!isCheckoutStep \|\| needsAccountChoice\)/);
  assert.doesNotMatch(cart, /onAvailabilityWarning/);
  assert.doesNotMatch(cart, /!isCheckoutStep && \(!availability\.ok \|\| checkoutFormError\)/);
  assert.match(app, /!showCartSummary && !storeSettings\.maintenanceSettings\.enabled/);
  assert.match(modal, /product-modal-buy-composer/);
  assert.match(modal, /product-modal-buy-quantity/);
  assert.match(modal, /quantity: requestedQuantity/);
  assert.match(app, /const requestedQuantity = Math\.min\(10, Math\.max\(1, Math\.floor\(Number\(selectionOverride\?\.quantity\) \|\| 1\)\)\)/);
});
