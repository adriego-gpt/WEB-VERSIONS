import test from "node:test";
import assert from "node:assert/strict";
import {
  CHECKOUT_STEPS,
  getNextCheckoutStep,
  getPreviousCheckoutStep,
} from "../../src/domain/orders/checkoutFlow.js";

test("el pago solo aparece después de confirmar la entrega", () => {
  assert.equal(getNextCheckoutStep(CHECKOUT_STEPS.summary), CHECKOUT_STEPS.delivery);
  assert.equal(getNextCheckoutStep(CHECKOUT_STEPS.delivery), CHECKOUT_STEPS.payment);
  assert.equal(getPreviousCheckoutStep(CHECKOUT_STEPS.payment), CHECKOUT_STEPS.delivery);
  assert.equal(getPreviousCheckoutStep(CHECKOUT_STEPS.delivery), CHECKOUT_STEPS.summary);
});
