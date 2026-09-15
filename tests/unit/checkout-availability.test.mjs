import assert from "node:assert/strict";
import test from "node:test";
import { checkCartAvailability } from "../../src/domain/orders/cartAvailability.js";
import { CHECKOUT_HISTORY_KEY, checkoutStepUrl, readCheckoutHistoryStep, readCheckoutHistoryDepth } from "../../src/domain/orders/checkoutHistory.js";

const product = { id: "p1", name: "Prenda", price: 25, variants: [{ color: "Rojo", size: "M", stock: 1 }] };
const line = { id: "p1", name: "Prenda", price: 25, color: "Rojo", size: "M", quantity: 1 };
test("available cart passes, but does not claim a reservation", () => {
  const result = checkCartAvailability([line], [product]);
  assert.equal(result.ok, true);
  assert.match(result.message, /no reserva/);
});
test("a sale on another device blocks payment immediately", () => {
  const result = checkCartAvailability([line], [{ ...product, variants: [{ color: "Rojo", size: "M", stock: 0 }] }]);
  assert.equal(result.ok, false);
  assert.match(result.message, /se agotó.*No realices el pago/);
});
test("removed, hidden and changed variants stay identifiable", () => {
  for (const products of [[], [{ ...product, isPublic: false }], [{ ...product, variants: [] }]]) {
    const result = checkCartAvailability([line], products);
    assert.equal(result.ok, false);
    assert.match(result.message, /Prenda.*Rojo.*M/);
  }
});
test("duplicate lines cannot independently claim the last unit", () => {
  assert.equal(checkCartAvailability([line, line], [product]).ok, false);
});
test("malformed quantities and invalid prices cannot reach payment", () => {
  for (const quantity of [0, -1, 1.5, 11, NaN]) assert.equal(checkCartAvailability([{ ...line, quantity }], [product]).ok, false);
  for (const price of [0, -1, NaN]) assert.equal(checkCartAvailability([line], [{ ...product, price }]).ok, false);
});
test("changed price requires an updated total before payment", () => {
  assert.match(checkCartAvailability([line], [{ ...product, price: 30 }]).message, /precio.*cambió/);
  assert.equal(checkCartAvailability([{ ...line, price: 30 }], [{ ...product, price: 30 }]).ok, true);
});
test("checkout history returns to delivery, summary and parent without external URLs", () => {
  assert.equal(readCheckoutHistoryStep({ [CHECKOUT_HISTORY_KEY]: "payment" }), "payment");
  assert.equal(readCheckoutHistoryStep({ [CHECKOUT_HISTORY_KEY]: "https://evil.test" }), "summary");
  assert.equal(checkoutStepUrl("https://adriego.shop/carrito?foo=1#x", "delivery"), "/carrito?foo=1&paso=entrega#x");
  assert.equal(checkoutStepUrl("https://adriego.shop/carrito?paso=pago", "summary"), "/carrito");
  assert.equal(readCheckoutHistoryDepth({ [CHECKOUT_HISTORY_KEY]: "payment" }), 2);
  assert.equal(readCheckoutHistoryDepth({ [CHECKOUT_HISTORY_KEY]: "summary", adriegoCheckoutDepth: 4 }), 4);
  assert.equal(readCheckoutHistoryDepth({ adriegoCheckoutDepth: -10 }), 0);
});
