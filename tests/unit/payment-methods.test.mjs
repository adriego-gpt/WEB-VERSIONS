import test from "node:test";
import assert from "node:assert/strict";
import {
  PAYMENT_METHODS,
  calculatePayableTotal,
  calculatePaymentFee,
  normalizeCardFeePercent,
  normalizePaymentMethod,
} from "../../src/domain/orders/payment.js";

test("transferencia no agrega comisión", () => {
  assert.equal(calculatePaymentFee(100, PAYMENT_METHODS.transfer, 6), 0);
  assert.equal(calculatePayableTotal(100, PAYMENT_METHODS.transfer, 6), 100);
});

test("tarjeta agrega 6% y redondea a centavos", () => {
  assert.equal(calculatePaymentFee(89.99, PAYMENT_METHODS.cardLink, 6), 5.4);
  assert.equal(calculatePayableTotal(89.99, PAYMENT_METHODS.cardLink, 6), 95.39);
});

test("normaliza métodos y mantiene fija la comisión", () => {
  assert.equal(normalizePaymentMethod("unknown"), PAYMENT_METHODS.transfer);
  assert.equal(normalizeCardFeePercent("invalid"), 6);
  assert.equal(normalizeCardFeePercent(99), 6);
  assert.equal(normalizeCardFeePercent(-4), 6);
});
