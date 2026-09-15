import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CHECKOUT_STEPS } from "../../src/domain/orders/checkoutFlow.js";
import { PAYMENT_METHODS } from "../../src/domain/orders/payment.js";

const source = readFileSync(new URL("../../src/components/cart/CartSummaryModal.jsx", import.meta.url), "utf8");
const start = source.indexOf("  const drawAttentionToStock = useCallback");
const end = source.indexOf("\n  useEffect", start);
const callback = source.slice(start, end);
function exercise({ reduced = false, top = 500, bottom = 950, focus = false, mounted = true } = {}) {
  const calls = [];
  const notice = { animate: () => { calls.push("animate"); return { cancel() {} }; },
    getBoundingClientRect: () => ({ top, bottom }), scrollIntoView: options => calls.push(options), focus: () => calls.push("focus") };
  const draw = new Function("useCallback", "stockNoticeRef", "attentionAnimationRef", "window", `${callback}; return drawAttentionToStock;`)(
    fn => fn, { current: mounted ? notice : null }, { current: null }, { innerHeight: 800, matchMedia: () => ({ matches: reduced }) },
  );
  draw(focus);
  return calls;
}
test("an off-screen stock alert gets one short attention animation and is brought into view", () => {
  assert.deepEqual(exercise({ focus: true }), ["animate", { behavior: "smooth", block: "center" }, "focus"]);
});
test("reduced-motion users get a visible focused alert without movement animation", () => {
  assert.deepEqual(exercise({ reduced: true, focus: true }), [{ behavior: "instant", block: "center" }, "focus"]);
});
test("an already visible alert does not move the page and a closed cart receives no attention", () => {
  assert.deepEqual(exercise({ top: 120, bottom: 300 }), ["animate"]);
  assert.deepEqual(exercise({ mounted: false }), []);
});

test("double-tapping Continue cannot start duplicate cart actions", async () => {
  const start = source.indexOf("  const handleCheckoutAction = async");
  const end = source.indexOf("  const handleCopyAccount", start);
  const handler = source.slice(start, end);
  let calls = 0;
  let resolve;
  const pending = new Promise(done => { resolve = done; });
  const dependencies = { availabilityBusy: false, checkoutBusy: false, checkoutActionBusyRef: { current: false }, needsAccountChoice: false,
    setAvailabilityBusy: () => {}, checkAvailability: () => { calls += 1; return pending; }, setCheckoutFormError: () => {} };
  const action = new Function(...Object.keys(dependencies), `${handler}; return handleCheckoutAction;`)(...Object.values(dependencies));
  const first = action();
  const second = action();
  resolve({ ok: false });
  await Promise.all([first, second]);
  assert.equal(calls, 1);
  assert.equal(dependencies.checkoutActionBusyRef.current, false);
});

test("changing a paid cart requires reviewing the proof instead of silently sending it or asking for another payment", async () => {
  const start = source.indexOf("  const handleCheckoutAction = async");
  const end = source.indexOf("  const handleCopyAccount", start);
  let error = "";
  let submissions = 0;
  let scrolled = 0;
  const dependencies = { availabilityBusy: false, checkoutBusy: false, checkoutActionBusyRef: { current: false }, needsAccountChoice: false,
    setAvailabilityBusy: () => {}, checkAvailability: async () => ({ ok: true }), setCheckoutFormError: message => { error = message; },
    CHECKOUT_STEPS, checkoutStep: CHECKOUT_STEPS.payment, PAYMENT_METHODS, selectedPaymentMethod: PAYMENT_METHODS.transfer,
    transferReady: true, selectedBankAccount: { id: "bank" }, paymentProof: "attached-proof", proofMatchesCart: false,
    setProofAttention: () => {}, proofSectionRef: { current: { scrollIntoView: () => { scrolled += 1; } } }, onCheckout: () => { submissions += 1; },
  };
  const action = new Function(...Object.keys(dependencies), `${source.slice(start, end)}; return handleCheckoutAction;`)(...Object.values(dependencies));
  await action();
  assert.equal(submissions, 0);
  assert.equal(scrolled, 1);
  assert.match(error, /no transfieras otra vez/);
  assert.match(error, /carrito cambió/);
});
