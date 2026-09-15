import { CHECKOUT_STEPS } from "./checkoutFlow.js";

export const CHECKOUT_HISTORY_KEY = "adriegoCheckoutStep";
export function readCheckoutHistoryDepth(state) {
  const depth = state?.adriegoCheckoutDepth;
  if (Number.isSafeInteger(depth) && depth >= 0 && depth <= 100) return depth;
  return state?.[CHECKOUT_HISTORY_KEY] === "payment" ? 2 : state?.[CHECKOUT_HISTORY_KEY] === "delivery" ? 1 : 0;
}
export function readCheckoutHistoryStep(state) {
  return Object.values(CHECKOUT_STEPS).includes(state?.[CHECKOUT_HISTORY_KEY])
    ? state[CHECKOUT_HISTORY_KEY] : CHECKOUT_STEPS.summary;
}
export function checkoutStepUrl(href, step) {
  const url = new URL(href);
  if (step === CHECKOUT_STEPS.summary) url.searchParams.delete("paso");
  else url.searchParams.set("paso", step === CHECKOUT_STEPS.delivery ? "entrega" : "pago");
  return `${url.pathname}${url.search}${url.hash}`;
}
