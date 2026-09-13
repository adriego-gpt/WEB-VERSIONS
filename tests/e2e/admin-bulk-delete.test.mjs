import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test, { after } from "node:test";

const root = process.cwd();
const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), "adriego-bulk-delete-test-"));
const values = { NODE_ENV: "test", VERCEL_ENV: "test", KV_REST_API_URL: "", KV_REST_API_TOKEN: "", ADMIN_SESSION_SECRET: "local-bulk-test-secret", USER_SESSION_SECRET: "local-user-test-secret", ADMIN_ALLOWED_ORIGIN: "http://localhost:5179", USER_ALLOWED_ORIGIN: "http://localhost:5179", SECURITY_LOG_ENABLED: "false" };
const originalEnv = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
process.chdir(sandbox);
Object.assign(process.env, values);
const load = (file) => import(pathToFileURL(path.join(root, file)).href);
const { default: handler } = await load("api/orders.js");
const { readStore, updateStore } = await load("api/_lib/store.js");
const { signPayload } = await load("api/_lib/security.js");
after(async () => {
  for (const key of Object.keys(values)) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
  process.chdir(root);
  await fs.rm(sandbox, { recursive: true, force: true });
});

async function seed() {
  await updateStore((draft) => {
    draft.products = [{ id: "p1", name: "Fixture", sizes: ["M"], imagesByColor: { Azul: ["catalog-photo"] }, variants: [{ color: "Azul", size: "M", stock: 2 }] }];
    draft.orders = Array.from({ length: 4 }, (_, index) => ({ id: `o${index + 1}`, code: `TEST-${index + 1}`, status: index === 1 ? "Cancelado" : "Pendiente", stockReservation: { state: index === 1 ? "released" : "reserved" }, paymentProof: "data:image/png;base64,dGVzdA==", items: [{ id: "p1", color: "Azul", size: "M", quantity: 3 }], createdAt: "2026-09-13T00:00:00Z" }));
    return draft;
  });
}

async function remove(orderIds, { admin = true, csrf = true, origin = "http://localhost:5179", method = "POST" } = {}) {
  const session = signPayload({ sub: "local-admin", exp: Date.now() + 60000 }, process.env.ADMIN_SESSION_SECRET);
  const response = { headers: {}, setHeader(key, value) { this.headers[key] = value; }, getHeader(key) { return this.headers[key]; }, status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
  await handler({ method, query: { action: "delete-many" }, headers: { origin, "content-type": "application/json", cookie: `adriego_csrf_token=test-csrf${admin ? `; adriego_admin_session=${session}` : ""}`, ...(csrf ? { "x-csrf-token": "test-csrf", "x-requested-with": "XMLHttpRequest" } : {}), "x-forwarded-for": "192.0.2.41" }, body: { orderIds } }, response);
  return response;
}

test("one batch removes only selected orders, keeps catalog photos and restores reserved stock once", async () => {
  await seed();
  const before = await readStore();
  const response = await remove(["o1", "o2", "o1"]);
  assert.equal(response.code, 200);
  assert.equal(response.body.deleted, 2);
  assert.deepEqual(response.body.deletedIds, ["o1", "o2"]);
  const after = await readStore();
  assert.deepEqual(after.orders.map(({ id }) => id), ["o3", "o4"]);
  assert.equal(after.orders[0].paymentProof, before.orders[2].paymentProof);
  assert.deepEqual(after.products[0].imagesByColor, before.products[0].imagesByColor);
  assert.equal(after.products[0].variants[0].stock, 5);
  assert.equal(after.meta.realtime.ordersVersion, before.meta.realtime.ordersVersion + 1);
  assert.equal(after.meta.realtime.catalogVersion, before.meta.realtime.catalogVersion + 1);
});

test("replayed, overlapping and already removed selections do not duplicate inventory", async () => {
  await seed();
  const responses = await Promise.all([remove(["o1", "o3"]), remove(["o1", "o3"])]);
  assert.equal(responses.reduce((sum, response) => sum + response.body.deleted, 0), 2);
  assert.equal((await readStore()).products[0].variants[0].stock, 8);
  const before = await readStore();
  const retry = await remove(["o1", "missing"]);
  assert.equal(retry.body.deleted, 0);
  assert.deepEqual(retry.body.missingIds, ["o1", "missing"]);
  assert.equal((await readStore()).meta.realtime.ordersVersion, before.meta.realtime.ordersVersion);
});

test("invalid batches are rejected in full before any deletion", async () => {
  await seed();
  for (const ids of [null, [], "o1", ["o1", {}], ["o1", ""], ["o1", " o2"], ["o1", "x".repeat(201)], Array.from({ length: 26 }, () => "o1")]) {
    assert.equal((await remove(ids)).code, 400);
    assert.equal((await readStore()).orders.length, 4);
  }
});

test("batch deletion requires admin, CSRF, allowed origin and POST", async () => {
  await seed();
  for (const [options, status] of [[{ admin: false }, 403], [{ csrf: false }, 403], [{ origin: "https://untrusted.invalid" }, 403], [{ method: "GET" }, 405]]) {
    assert.equal((await remove(["o1"], options)).code, status);
    assert.equal((await readStore()).orders.length, 4);
  }
});

test("storage failures never claim successful deletion", async () => {
  await seed();
  process.env.NODE_ENV = "production";
  try {
    const response = await remove(["o1", "o3"]);
    assert.equal(response.code, 503);
    assert.equal(response.body.ok, false);
  } finally { process.env.NODE_ENV = "test"; }
  assert.equal((await readStore()).orders.length, 4);
  assert.equal((await readStore()).products[0].variants[0].stock, 2);
});
