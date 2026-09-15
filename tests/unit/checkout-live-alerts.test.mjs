import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Execute the production hook, not a copy of its polling logic.
function mount(checkAvailability) {
  const slots = [];
  let cursor = 0;
  const effects = [];
  const useRef = value => {
    const index = cursor++;
    return slots[index] ||= { current: value };
  };
  const useState = value => {
    const index = cursor++;
    if (!(index in slots)) slots[index] = value;
    return [slots[index], next => { slots[index] = typeof next === "function" ? next(slots[index]) : next; }];
  };
  const listeners = new Map();
  const timers = [];
  const window = { clearTimeout() {}, setTimeout(fn, delay) { timers.push({ fn, delay }); return timers.length; }, addEventListener(name, fn) { listeners.set(name, fn); }, removeEventListener() {} };
  const document = { hidden: false, addEventListener() {}, removeEventListener() {} };
  const source = readFileSync(new URL("../../src/hooks/useCheckoutAvailability.js", import.meta.url), "utf8")
    .replace(/^import .*?;\s*/s, "").replace("export function", "function");
  const createHook = new Function("useCallback", "useEffect", "useLayoutEffect", "useRef", "useState", "window", "document", "navigator", `${source}; return useCheckoutAvailability;`);
  const hook = createHook(fn => fn, fn => effects.push(fn), fn => fn(), useRef, useState, window, document, { onLine: true });
  const alerts = [];
  const props = { open: true, cart: [{ id: "p1", color: "Rojo", size: "M", quantity: 1, price: 25 }], onCheckAvailability: checkAvailability, onAvailabilityWarning: warning => alerts.push(warning) };
  const render = () => { cursor = 0; return hook(props); };
  return { render, alerts, props, effects, listeners, timers };
}

test("a sold last unit produces a visible warning without submitting an order, once per change", async () => {
  const failed = { ok: false, code: "OUT_OF_STOCK", message: "Prenda (Rojo / M) se agotó. No realices el pago." };
  const app = mount(async () => failed);
  await app.render().checkAvailability({ background: true });
  assert.equal(app.alerts.length, 1, "stock polling must actively warn the customer");
  assert.match(app.alerts[0].message, /se agotó/);
  await app.render().checkAvailability({ background: true });
  assert.equal(app.alerts.length, 1, "do not repeat the same warning every poll");
  app.props.onCheckAvailability = async () => ({ ok: true, message: "Disponible" });
  await app.render().checkAvailability();
  app.props.onCheckAvailability = async () => failed;
  await app.render().checkAvailability();
  assert.equal(app.alerts.length, 2, "a new outage after recovery must warn again");
});

test("a final server stock rejection owns the same alert and cannot be erased by an older successful poll", async () => {
  let resolve;
  const app = mount(() => new Promise(done => { resolve = done; }));
  const oldPoll = app.render().checkAvailability();
  const failure = { ok: false, code: "RESERVATION_EXPIRED", message: "La reserva terminó. No vuelvas a pagar." };
  app.render().reportAvailabilityFailure(failure);
  app.render().reportAvailabilityFailure(failure);
  assert.equal(app.render().availability.ok, false);
  assert.equal(app.alerts.length, 1);
  resolve({ ok: true, message: "Disponible" });
  await oldPoll;
  assert.equal(app.render().availability.code, "RESERVATION_EXPIRED");
});

test("an old successful poll cannot erase a newer sold-out result", async () => {
  let resolveOld;
  let call = 0;
  const app = mount(() => ++call === 1 ? new Promise(resolve => { resolveOld = resolve; }) : Promise.resolve({ ok: false, message: "Se agotó. No realices el pago." }));
  const old = app.render().checkAvailability({ background: true });
  await app.render().checkAvailability();
  resolveOld({ ok: true, message: "Disponible" });
  await old;
  assert.equal(app.render().availability.ok, false);
});

test("a payment-step check must not reuse an old delivery-step promise", async () => {
  let resolveOld;
  const app = mount(() => new Promise(resolve => { resolveOld = resolve; }));
  const old = app.render().checkAvailability({ background: true });
  app.props.onCheckAvailability = async () => ({ ok: false, code: "RESERVATION_EXPIRED", message: "Tu reserva terminó. No realices el pago." });
  const fresh = app.render().checkAvailability({ background: true });
  resolveOld({ ok: true, message: "Disponible" });
  await Promise.all([old, fresh]);
  assert.equal(app.render().availability.ok, false);
  assert.equal(app.alerts[0]?.code, "RESERVATION_EXPIRED");
});

test("reservation expiry blocks payment and alerts at the deadline, without waiting for polling", async () => {
  let expired = false;
  const app = mount(async () => expired
    ? { ok: false, code: "RESERVATION_EXPIRED", message: "Tu reserva terminó. No realices el pago." }
    : { ok: true, reservationId: "hold", serverNow: 1000, expiresAt: 301000, message: "Reservado" });
  await app.render().checkAvailability();
  app.render();
  const cleanup = app.effects[2]();
  assert.equal(app.timers[0].delay, 300000);
  expired = true;
  app.timers[0].fn();
  assert.equal(app.render().availability.ok, false);
  assert.equal(app.alerts[0].code, "RESERVATION_EXPIRED");
  assert.match(app.alerts[0].message, /no pagues otra vez/);
  cleanup();
});

test("closing the cart prevents late responses from notifying or enabling checkout", async () => {
  let resolve;
  const app = mount(() => new Promise(done => { resolve = done; }));
  const request = app.render().checkAvailability();
  app.props.open = false;
  app.render();
  resolve({ ok: false, message: "Se agotó" });
  await request;
  assert.equal(app.alerts.length, 0);
});
