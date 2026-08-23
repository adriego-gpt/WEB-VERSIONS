export const CHECKOUT_STEPS = Object.freeze({
  summary: "summary",
  delivery: "delivery",
  payment: "payment",
});

export function getNextCheckoutStep(step) {
  if (step === CHECKOUT_STEPS.summary) return CHECKOUT_STEPS.delivery;
  if (step === CHECKOUT_STEPS.delivery) return CHECKOUT_STEPS.payment;
  return CHECKOUT_STEPS.payment;
}

export function getPreviousCheckoutStep(step) {
  if (step === CHECKOUT_STEPS.payment) return CHECKOUT_STEPS.delivery;
  return CHECKOUT_STEPS.summary;
}
