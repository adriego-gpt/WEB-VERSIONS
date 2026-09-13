import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";

const originalCwd = process.cwd();
const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), "adriego-launch-"));
process.chdir(sandbox);
Object.assign(process.env, { NODE_ENV: "test", VERCEL_ENV: "test", KV_REST_API_URL: "", KV_REST_API_TOKEN: "", SECURITY_LOG_ENABLED: "false", USER_ALLOWED_ORIGIN: "http://localhost:5173", ADMIN_ALLOWED_ORIGIN: "http://localhost:5173", USER_SESSION_SECRET: "launch-test-user-secret", ADMIN_SESSION_SECRET: "launch-test-admin-secret", TELEGRAM_BOT_TOKEN: "test-token", TELEGRAM_ADMIN_CHAT_ID: "123", N8N_ORDER_WEBHOOK_URL: "https://automation.test/orders", N8N_WEBHOOK_SECRET: "test-secret" });
const { readStore, updateStore } = await import("../../api/_lib/store.js");
const { signPayload, createCsrfToken, CSRF_COOKIE_NAME } = await import("../../api/_lib/security.js");
const { default: checkout } = await import("../../api/checkout-order.js");
const { default: catalog } = await import("../../api/catalog-state.js");
const originalFetch = globalThis.fetch;
const notifications = [];
globalThis.fetch = async (url) => { notifications.push(String(url)); return Response.json({ ok: true }); };
after(async () => { globalThis.fetch = originalFetch; process.chdir(originalCwd); await fs.rm(sandbox, { recursive: true, force: true }); });
const token = signPayload({ sub: "launch-user", sessionVersion: 1, exp: Date.now() + 3600000 }, process.env.USER_SESSION_SECRET);
const csrf = createCsrfToken();
let calls = 0;
async function call(handler, body, { query = {}, method = "POST", cookie = `adriego_user_session=${token}; ${CSRF_COOKIE_NAME}=${csrf}` } = {}) {
  const headers = new Map();
  const res = { statusCode: 200, setHeader(key, value) { headers.set(key, value); }, getHeader(key) { return headers.get(key); }, status(code) { this.statusCode = code; return this; }, json(payload) { this.payload = payload; return this; }, send(payload) { this.payload = payload; return this; }, end() {} };
  await handler({ method, query, body, headers: { origin: "http://localhost:5173", "content-type": "application/json", "x-csrf-token": csrf, "x-requested-with": "XMLHttpRequest", cookie }, socket: { remoteAddress: `127.0.0.${++calls}` } }, res);
  return res;
}

test("checkout rejects malformed cart quantities, preserves historical orders and only notifies once", async () => {
  await updateStore((draft) => {
    draft.users = [{ id: "launch-user", name: "Prueba", email: "test@localhost.test", phone: "0991234567", sessionVersion: 1 }];
    draft.products = [{ id: "p1", name: "Prenda", isPublic: true, price: 25, variants: [{ uid: "v1", color: "Rojo", size: "M", stock: 200 }] }];
    draft.contactSettings = { whatsappNumber: "593999999999" };
    draft.orders = Array.from({ length: 400 }, (_, index) => ({ id: `old-${index}`, customerId: "another-user", createdAt: "2025-01-01T00:00:00Z" }));
    return draft;
  });
  const item = { id: "p1", color: "Rojo", size: "M", quantity: 1 };
  const payload = (cart) => ({ cart, idempotencyKey: randomUUID(), paymentMethod: "card_link", delivery: { type: "pickup" } });
  for (const quantity of [0, -1, 0.5, 11, "invalid"]) assert.equal((await call(checkout, payload([{ ...item, quantity }]))).statusCode, 400);
  assert.equal((await call(checkout, payload(Array.from({ length: 26 }, () => item)))).statusCode, 400);
  assert.equal((await readStore()).products[0].variants[0].stock, 200);
  await updateStore((draft) => { draft.contactSettings.whatsappNumber = ""; return draft; });
  assert.equal((await call(checkout, payload([item]))).statusCode, 409);
  assert.equal((await readStore()).products[0].variants[0].stock, 200);
  await updateStore((draft) => { draft.contactSettings.whatsappNumber = "593999999999"; return draft; });
  const request = payload([item]);
  assert.equal((await call(checkout, request)).statusCode, 200);
  const count = notifications.length;
  assert.ok(count > 0);
  const replay = await call(checkout, request);
  assert.equal(replay.payload.idempotentReplay, true);
  assert.equal(notifications.length, count);
  const state = await readStore();
  assert.equal(state.products[0].variants[0].stock, 199);
  assert.equal(state.orders.length, 401);
  assert.ok(state.orders.some((order) => order.id === "old-399"));
});

test("removed Drive actions stay unavailable and catalog reads cannot be invoked as writes", async () => {
  assert.equal((await call(catalog, undefined, { query: { action: "get-public" } })).statusCode, 405);
  const admin = signPayload({ sub: "admin", exp: Date.now() + 3600000 }, process.env.ADMIN_SESSION_SECRET);
  for (const action of ["drive-list", "drive-image"]) assert.equal((await call(catalog, undefined, { query: { action }, method: "GET", cookie: `adriego_admin_session=${admin}` })).statusCode, 400);
});
