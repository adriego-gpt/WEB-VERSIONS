import assert from "node:assert/strict";
import test, { after } from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

const originalCwd = process.cwd();
const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), "adriego-reservation-test-"));
process.chdir(sandbox);
Object.assign(process.env, { NODE_ENV: "test", VERCEL_ENV: "test", KV_REST_API_URL: "", KV_REST_API_TOKEN: "", USER_SESSION_SECRET: "reservation-test-secret", USER_ALLOWED_ORIGIN: "http://localhost:5173", SECURITY_LOG_ENABLED: "false", TELEGRAM_BOT_TOKEN: "", N8N_ORDER_WEBHOOK_URL: "", RESEND_API_KEY: "" });
const { readStore, updateStore, readRealtimeMeta } = await import("../../api/_lib/store.js");
const { RESERVATION_TTL_MS } = await import("../../api/_lib/checkoutReservations.js");
const { signPayload, createCsrfToken, CSRF_COOKIE_NAME } = await import("../../api/_lib/security.js");
const { default: checkout } = await import("../../api/checkout-order.js");
after(async () => { process.chdir(originalCwd); await fs.rm(sandbox, { recursive: true, force: true }); });
const csrf = createCsrfToken();
const guest = () => `adriego_guest_orders=${signPayload({ sub: `guest-${randomUUID()}`, purpose: "guest-orders", exp: Date.now() + 3600000 }, process.env.USER_SESSION_SECRET)}`;
const cart = [{ id: "p1", name: "Prenda", color: "Rojo", size: "M", price: 25, quantity: 1 }];
let calls = 0;
async function call(body, { action, cookie = guest(), withCsrf = true } = {}) {
  const headers = new Map();
  const res = { statusCode: 200, setHeader(key, value) { headers.set(key.toLowerCase(), value); }, getHeader(key) { return headers.get(key.toLowerCase()); }, status(code) { this.statusCode = code; return this; }, json(payload) { this.payload = payload; return this; }, end() {} };
  await checkout({ method: "POST", query: { action }, body, headers: { origin: "http://localhost:5173", "content-type": "application/json", "x-requested-with": "XMLHttpRequest", ...(withCsrf ? { "x-csrf-token": csrf } : {}), cookie: `${cookie}; ${CSRF_COOKIE_NAME}=${csrf}` }, socket: { remoteAddress: `127.0.1.${++calls}` } }, res);
  return res;
}
async function reset() {
  await updateStore(draft => { draft.checkoutReservations = []; draft.orders = []; draft.users = []; draft.products = [{ id: "p1", name: "Prenda", price: 25, isPublic: true, sizes: ["M"], variants: [{ uid: "v1", color: "Rojo", size: "M", stock: 1 }] }]; draft.storeSettings = { maintenanceSettings: { enabled: false } }; draft.contactSettings = { whatsappNumber: "593999999999" }; return draft; });
}
let requestCount = 0;
const request = reservationId => ({ cart, reservationId, guestCheckout: true, idempotencyKey: randomUUID(), paymentMethod: "card_link", delivery: { type: "pickup", fullName: "Prueba", phone: `099123${String(++requestCount).padStart(4, "0")}` } });

test("five-minute reservation protects payment and expires atomically", async t => {
  assert.equal(RESERVATION_TTL_MS, 300000);
  await t.test("only one simultaneous buyer gets the last unit", async () => {
    await reset();
    const buyers = [guest(), guest()];
    const responses = await Promise.all(buyers.map(cookie => call({ cart }, { action: "reserve", cookie })));
    assert.deepEqual(responses.map(r => r.statusCode).sort(), [200, 409]);
    const state = await readStore();
    assert.equal(state.products[0].variants[0].stock, 0);
    assert.equal(state.checkoutReservations.length, 1);
    const hold = state.checkoutReservations[0];
    assert.equal(hold.expiresAt - hold.createdAt, 300000);
    assert.equal(state.meta.realtime.reservationExpiresAt, hold.expiresAt);
  });
  await t.test("N simultaneous buyers conserve every unit without duplicate holds", async () => {
    await reset();
    const availableUnits = 17;
    const buyerCount = 64;
    await updateStore(draft => {
      draft.products[0].variants[0].stock = availableUnits;
      return draft;
    });
    if (globalThis.__ATELIER_RATE_LIMIT_STORE__) globalThis.__ATELIER_RATE_LIMIT_STORE__.clear();
    const buyers = Array.from({ length: buyerCount }, () => guest());
    const responses = await Promise.all(buyers.map(cookie => call({ cart }, { action: "reserve", cookie })));
    assert.equal(responses.filter(response => response.statusCode === 200).length, availableUnits);
    assert.equal(responses.filter(response => response.statusCode === 409).length, buyerCount - availableUnits);
    const state = await readStore();
    const heldUnits = state.checkoutReservations.reduce((total, reservation) => (
      total + reservation.items.reduce((itemTotal, item) => itemTotal + Number(item.quantity || 0), 0)
    ), 0);
    assert.equal(state.products[0].variants[0].stock, 0);
    assert.equal(state.checkoutReservations.length, availableUnits);
    assert.equal(new Set(state.checkoutReservations.map(reservation => reservation.id)).size, availableUnits);
    assert.equal(heldUnits, availableUnits);
  });
  await t.test("removing every cart line releases its hold without waiting five minutes", async () => {
    await reset();
    const cookie = guest();
    const reserved = await call({ cart }, { action: "reserve", cookie });
    const released = await call({ cart: [], reservationId: reserved.payload.reservationId }, { action: "adjust-reservation", cookie });
    assert.equal(released.statusCode, 200);
    assert.equal((await readStore()).products[0].variants[0].stock, 1);
    assert.equal((await readStore()).checkoutReservations.length, 0);
    assert.equal((await call({ cart }, { action: "reserve" })).statusCode, 200);
  });
  await t.test("decreasing releases only unused units, increasing does not silently reserve or extend time", async () => {
    await reset();
    await updateStore(draft => { draft.products[0].variants[0].stock = 3; return draft; });
    const cookie = guest();
    const three = [{ ...cart[0], quantity: 3 }];
    const reserved = await call({ cart: three }, { action: "reserve", cookie });
    const reservationId = reserved.payload.reservationId;
    const reduced = await call({ cart, reservationId }, { action: "adjust-reservation", cookie });
    assert.equal(reduced.statusCode, 200);
    let state = await readStore();
    assert.equal(state.products[0].variants[0].stock, 2);
    assert.equal(state.checkoutReservations[0].items[0].quantity, 1);
    assert.equal(state.checkoutReservations[0].expiresAt, reserved.payload.expiresAt);
    await call({ cart: three, reservationId }, { action: "adjust-reservation", cookie });
    state = await readStore();
    assert.equal(state.products[0].variants[0].stock, 2);
    assert.equal(state.checkoutReservations[0].items[0].quantity, 1);
    assert.equal((await call({ cart: three, reservationId }, { action: "reservation-status", cookie })).statusCode, 409);
    await call({ cart: [], reservationId }, { action: "adjust-reservation" });
    assert.equal((await readStore()).checkoutReservations.length, 1);
    assert.equal((await call({ cart: [], reservationId }, { action: "adjust-reservation", cookie, withCsrf: false })).statusCode, 403);
    assert.equal((await call({ cart: [{ ...cart[0], quantity: -1 }], reservationId }, { action: "adjust-reservation", cookie })).statusCode, 400);
  });
  await t.test("owner sees held stock, refresh does not extend its deadline and another buyer cannot use its id", async () => {
    await reset();
    const cookie = guest();
    const reserved = await call({ cart }, { action: "reserve", cookie });
    const { reservationId, expiresAt } = reserved.payload;
    const status = await call({ cart, reservationId }, { action: "reservation-status", cookie });
    assert.equal(status.statusCode, 200);
    assert.equal(status.payload.stock[0].stock, 1);
    assert.equal(status.getHeader("Cache-Control"), "private, no-store, max-age=0");
    assert.equal((await call({ cart }, { action: "reserve", cookie })).payload.expiresAt, expiresAt);
    assert.equal((await call({ cart, reservationId }, { action: "reservation-status" })).statusCode, 409);
    assert.equal((await call(request(reservationId))).statusCode, 409);
    assert.equal((await readStore()).checkoutReservations.length, 1);
  });
  await t.test("confirmed order consumes reservation once and replay never doubles the stock deduction", async () => {
    await reset();
    const cookie = guest();
    const reserved = await call({ cart }, { action: "reserve", cookie });
    const body = request(reserved.payload.reservationId);
    const created = await call(body, { cookie });
    assert.equal(created.statusCode, 200);
    assert.equal((await readStore()).checkoutReservations.length, 0);
    assert.equal((await readStore()).products[0].variants[0].stock, 0);
    assert.equal((await call(body, { cookie })).payload.idempotentReplay, true);
    assert.equal((await readStore()).orders.length, 1);
    assert.equal((await call(request())).statusCode, 400);
  });
  await t.test("editing a cart can see its own held units but cannot pay using the old reservation", async () => {
    await reset();
    await updateStore(draft => { draft.products.push({ ...draft.products[0], id: "p2", variants: [{ uid: "v2", color: "Rojo", size: "M", stock: 1 }] }); return draft; });
    const cookie = guest();
    const reserved = await call({ cart }, { action: "reserve", cookie });
    const reservationId = reserved.payload.reservationId;
    const changed = [...cart, { ...cart[0], id: "p2" }];
    const projection = await call({ cart: changed, reservationId, allowCartChanges: true }, { action: "reservation-status", cookie });
    assert.equal(projection.statusCode, 200);
    assert.equal(projection.payload.stock[0].stock, 1);
    assert.equal(projection.payload.reservationId, "");
    assert.equal(projection.payload.expiresAt, 0);
    assert.equal(projection.payload.stockExpiresAt, reserved.payload.expiresAt);
    assert.equal((await call({ cart: changed, reservationId }, { action: "reservation-status", cookie })).statusCode, 409);
    assert.equal((await call({ cart: changed, reservationId, allowCartChanges: true }, { action: "reservation-status" })).statusCode, 409);
    assert.equal((await call({ ...request(reservationId), cart: changed }, { cookie })).statusCode, 409);
    assert.equal((await readStore()).orders.length, 0);
    const replaced = await call({ cart: changed }, { action: "reserve", cookie });
    assert.equal(replaced.statusCode, 200);
    assert.notEqual(replaced.payload.reservationId, reservationId);
    assert.equal((await readStore()).checkoutReservations.length, 1);
    assert.deepEqual((await readStore()).products.map(p => p.variants[0].stock), [0, 0]);
  });
  await t.test("an overlarge edited cart still exposes its owner's usable units for recovery, not payment permission", async () => {
    await reset();
    const cookie = guest();
    const reserved = await call({ cart }, { action: "reserve", cookie });
    const changed = [{ ...cart[0], quantity: 2 }];
    const status = await call({ cart: changed, reservationId: reserved.payload.reservationId, allowCartChanges: true }, { action: "reservation-status", cookie });
    assert.equal(status.statusCode, 409);
    assert.equal(status.payload.stock[0].stock, 1);
    assert.equal(status.payload.stock[0].uid, "v1");
    assert.equal(status.payload.stockExpiresAt, reserved.payload.expiresAt);
    assert.equal(status.payload.reservationId, undefined);
    const reduced = await call({ cart, reservationId: reserved.payload.reservationId, allowCartChanges: true }, { action: "reservation-status", cookie });
    assert.equal(reduced.statusCode, 200);
    const stranger = await call({ cart: changed, reservationId: reserved.payload.reservationId, allowCartChanges: true }, { action: "reservation-status" });
    assert.equal(stranger.payload.stock, undefined);
    assert.equal((await readStore()).products[0].variants[0].stock, 0);
  });
  await t.test("expired reservation restores stock before any new checkout and stale proof cannot finalize it", async () => {
    await reset();
    const cookie = guest();
    const reserved = await call({ cart }, { action: "reserve", cookie });
    await updateStore(draft => { draft.checkoutReservations[0].expiresAt = Date.now() - 1; draft.meta.realtime.reservationExpiresAt = Date.now() - 1; return draft; });
    await readRealtimeMeta();
    const state = await readStore();
    assert.equal(state.products[0].variants[0].stock, 1);
    assert.equal(state.checkoutReservations.length, 0);
    assert.equal((await call(request(reserved.payload.reservationId), { cookie })).payload.code, "RESERVATION_EXPIRED");
    assert.equal((await readStore()).orders.length, 0);
    assert.equal((await call({ cart }, { action: "reserve" })).statusCode, 200);
  });
  await t.test("CSRF, invalid quantities, changed cart and maintenance block unsafe payment", async () => {
    await reset();
    assert.equal((await call({ cart }, { action: "reserve", withCsrf: false })).statusCode, 403);
    for (const quantity of [0, -1, 1.5, 11]) assert.equal((await call({ cart: [{ ...cart[0], quantity }] }, { action: "reserve" })).statusCode, 409);
    const cookie = guest();
    const reserved = await call({ cart }, { action: "reserve", cookie });
    assert.equal((await call({ cart: [null], reservationId: reserved.payload.reservationId }, { action: "reservation-status", cookie })).statusCode, 400);
    assert.equal((await call({ ...request(reserved.payload.reservationId), cart: [{ ...cart[0], quantity: 2 }] }, { cookie })).statusCode, 409);
    await updateStore(draft => { draft.storeSettings.maintenanceSettings.enabled = true; return draft; });
    assert.equal((await call({ cart, reservationId: reserved.payload.reservationId }, { action: "reservation-status", cookie })).statusCode, 503);
    assert.equal((await readStore()).orders.length, 0);
  });
  await t.test("expiry never resurrects a removed or replaced variant", async () => {
    await reset();
    await call({ cart }, { action: "reserve" });
    await updateStore(draft => { draft.products[0].variants[0] = { uid: "replacement", color: "Rojo", size: "M", stock: 3 }; draft.checkoutReservations[0].expiresAt = 1; return draft; });
    assert.equal((await readStore()).products[0].variants[0].stock, 3);
  });
});
