import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";

const originalCwd = process.cwd();
const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), "adriego-maintenance-"));
process.chdir(sandbox);
Object.assign(process.env, { NODE_ENV: "test", VERCEL_ENV: "test", KV_REST_API_URL: "", KV_REST_API_TOKEN: "", SECURITY_LOG_ENABLED: "false", USER_ALLOWED_ORIGIN: "http://localhost:5173", ADMIN_ALLOWED_ORIGIN: "http://localhost:5173", USER_SESSION_SECRET: "maintenance-test-user-secret", ADMIN_SESSION_SECRET: "maintenance-test-admin-secret", TELEGRAM_BOT_TOKEN: "", N8N_ORDER_WEBHOOK_URL: "" });
const { readStore, updateStore } = await import("../../api/_lib/store.js");
const { signPayload, createCsrfToken, CSRF_COOKIE_NAME } = await import("../../api/_lib/security.js");
const { default: catalog } = await import("../../api/catalog-state.js");
const { default: checkout } = await import("../../api/checkout-order.js");
const { default: orders } = await import("../../api/orders.js");
const { default: seo } = await import("../../api/seo.js");
const { normalizeMaintenanceSettings } = await import("../../src/domain/store/maintenance.js");
const { resolvePickupLocation } = await import("../../src/domain/contact/pickupLocation.js");
after(async () => { process.chdir(originalCwd); await fs.rm(sandbox, { recursive: true, force: true }); });

const csrf = createCsrfToken();
const admin = signPayload({ sub: "admin", exp: Date.now() + 3600000 }, process.env.ADMIN_SESSION_SECRET);
let calls = 0;
async function call(handler, body, { action, cookie = "", method = "POST", withCsrf = true, pathname = "/" } = {}) {
  const headers = new Map();
  const res = { statusCode: 200, setHeader(key, value) { headers.set(key.toLowerCase(), value); }, getHeader(key) { return headers.get(key.toLowerCase()); }, status(code) { this.statusCode = code; return this; }, json(payload) { this.payload = payload; return this; }, send(payload) { this.payload = payload; return this; }, end() {} };
  await handler({ method, query: { action, path: pathname }, body, headers: { origin: "http://localhost:5173", "content-type": "application/json", ...(withCsrf ? { "x-csrf-token": csrf } : {}), "x-requested-with": "XMLHttpRequest", cookie: `${cookie}; ${CSRF_COOKIE_NAME}=${csrf}` }, socket: { remoteAddress: `127.0.0.${++calls}` } }, res);
  return res;
}
const save = (enabled, extra = {}) => call(catalog, { maintenanceSettings: { enabled, title: "Aviso de prueba", ...extra } }, { action: "sync-maintenance", cookie: `adriego_admin_session=${admin}` });

test("maintenance is persistent, protected, and blocks new orders without losing receipts or stock", async (t) => {
  await updateStore((draft) => {
    draft.products = [{ id: "p1", name: "Prenda", isPublic: true, price: 25, variants: [{ uid: "v1", color: "Rojo", size: "M", stock: 5 }] }];
    draft.storeSettings = { brandName: "Tienda de prueba", maintenanceSettings: { enabled: false }, shippingSettings: { localShippingCost: 7 } };
    draft.contactSettings = { address: "Punto de retiro de prueba", mapsLink: "https://maps.app.goo.gl/test", mapsEmbedUrl: "https://www.google.com/maps/embed?pb=test", locationNote: "Entrada de prueba", whatsappNumber: "593999999999", legalBusinessName: "Negocio de prueba" };
    draft.orders = [];
    return draft;
  });
  await t.test("requires admin authorization, CSRF and an explicit boolean", async () => {
    assert.equal((await call(catalog, { maintenanceSettings: { enabled: true } }, { action: "sync-maintenance" })).statusCode, 401);
    assert.equal((await call(catalog, { maintenanceSettings: { enabled: true } }, { action: "sync-maintenance", cookie: `adriego_admin_session=${admin}`, withCsrf: false })).statusCode, 403);
    assert.equal((await save("true")).statusCode, 400);
    const response = await save(true);
    assert.equal(response.statusCode, 200);
    const state = await readStore();
    assert.equal(state.storeSettings.maintenanceSettings.enabled, true);
    assert.equal(state.storeSettings.shippingSettings.localShippingCost, 7);
    assert.equal(state.products[0].variants[0].stock, 5);
  });
  await t.test("old catalog/contact saves cannot disable maintenance", async () => {
    const state = await readStore();
    const products = [{ ...state.products[0], name: "Prenda editada durante mantenimiento" }, { id: "p2", name: "Prenda nueva durante mantenimiento", isPublic: true, price: 30, variants: [{ uid: "v2", color: "Azul", size: "L", stock: 3 }] }];
    const response = await call(catalog, { data: { products, contactSettings: state.contactSettings, storeSettings: { brandName: "Tienda de prueba" } }, writeProtocol: 2, baseCatalogVersion: state.meta.realtime.catalogVersion }, { action: "sync", cookie: `adriego_admin_session=${admin}` });
    assert.equal(response.statusCode, 200);
    const updated = await readStore();
    assert.equal(updated.storeSettings.maintenanceSettings.enabled, true);
    assert.equal(updated.products[0].name, "Prenda editada durante mantenimiento");
    assert.equal(updated.products[1].name, "Prenda nueva durante mantenimiento");
    assert.equal(updated.products[1].variants[0].stock, 3);
    assert.equal((await call(catalog, { contactSettings: state.contactSettings, storeSettings: { maintenanceSettings: { enabled: false } } }, { action: "sync-contact", cookie: `adriego_admin_session=${admin}` })).statusCode, 200);
    assert.equal((await readStore()).storeSettings.maintenanceSettings.enabled, true);
  });
  const request = { guestCheckout: true, cart: [{ id: "p1", color: "Rojo", size: "M", quantity: 1 }], idempotencyKey: randomUUID(), paymentMethod: "card_link", delivery: { type: "pickup", fullName: "Invitada de prueba", phone: "0991234567" } };
  await t.test("paused checkout returns retry guidance and changes no inventory", async () => {
    const response = await call(checkout, request);
    assert.equal(response.statusCode, 503);
    assert.equal(response.payload.code, "STORE_MAINTENANCE");
    assert.equal(response.getHeader("Retry-After"), "300");
    const state = await readStore();
    assert.equal(state.orders.length, 0);
    assert.equal(state.products[0].variants[0].stock, 5);
    const publicResponse = await call(catalog, undefined, { action: "get-public", method: "GET" });
    assert.equal(publicResponse.payload.data.storeSettings.maintenanceSettings.enabled, true);
  });
  await t.test("public pages return a temporary 503 rather than replacing indexed product content", async () => {
    await save(true, { message: "Prueba </script><script>alert(1)</script>", returnMessage: "Regreso de prueba" });
    const response = await call(seo, undefined, { method: "GET", pathname: "/producto/prenda" });
    assert.equal(response.statusCode, 503);
    assert.equal(response.getHeader("Cache-Control"), "no-store, max-age=0");
    assert.equal(response.getHeader("Retry-After"), "300");
    assert.match(response.payload, /store-maintenance-state/);
    assert.match(response.getHeader("Content-Security-Policy"), /script-src 'self'/);
    assert.match(response.getHeader("Content-Security-Policy"), /style-src 'self'/);
    assert.doesNotMatch(response.payload, /noindex|<script>alert|schema.org/);
    assert.doesNotMatch(response.payload, /href="\/admin"|>Administración</);
    assert.equal((await call(seo, undefined, { action: "sitemap", method: "GET" })).statusCode, 200);
  });
  await save(false);
  const created = await call(checkout, request);
  assert.equal(created.statusCode, 200);
  const guestCookie = [].concat(created.getHeader("Set-Cookie") || []).find((value) => value.startsWith("adriego_guest_orders=")).split(";")[0];
  await t.test("guest receipts keep the original map even if the store address later changes", async () => {
    assert.equal(created.payload.order.pickupMapsLink, "https://maps.app.goo.gl/test");
    assert.equal(created.payload.order.pickupMapsEmbedUrl, "https://www.google.com/maps/embed?pb=test");
    await updateStore((draft) => { draft.contactSettings.mapsLink = "https://maps.app.goo.gl/another"; return draft; });
    await save(true);
    const response = await call(orders, undefined, { method: "GET", cookie: guestCookie });
    assert.equal(response.statusCode, 200);
    assert.equal(response.payload.orderHistory[0].pickupMapsLink, created.payload.order.pickupMapsLink);
    const replay = await call(checkout, request, { cookie: guestCookie });
    assert.equal(replay.statusCode, 200);
    assert.equal(replay.payload.idempotentReplay, true);
    assert.equal((await readStore()).products[0].variants[0].stock, 4);
  });
});

test("default maintenance remains off and malformed map URLs never become an iframe", () => {
  assert.equal(normalizeMaintenanceSettings().enabled, false);
  assert.equal(normalizeMaintenanceSettings({ enabled: "true" }).enabled, false);
  assert.equal(normalizeMaintenanceSettings({ enabled: true, title: "" }).title, "Volvemos pronto");
  for (const url of ["javascript:alert(1)", "https://google.com.evil.test/maps", "https://evil.test/maps", "https://user:pass@www.google.com/maps", "http://www.google.com/maps"]) assert.equal(resolvePickupLocation({ mapsEmbedUrl: url }).mapsEmbedUrl, "");
  assert.match(resolvePickupLocation({ address: "Retiro & local" }).mapsLink, /query=Retiro%20%26%20local/);
});
