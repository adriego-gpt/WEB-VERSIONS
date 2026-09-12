import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test, { after, before } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const THIS_FILE = fileURLToPath(import.meta.url);
const PROJECT_ROOT = path.resolve(path.dirname(THIS_FILE), "..", "..");
const APP_ORIGIN = "http://localhost:5173";
const sandboxCwd = await fs.mkdtemp(path.join(os.tmpdir(), "adriego-import-save-reload-"));
const originalCwd = process.cwd();

process.chdir(sandboxCwd);
process.env.NODE_ENV = "test";
process.env.SECURITY_LOG_ENABLED = "false";
process.env.USER_ALLOWED_ORIGIN = APP_ORIGIN;
process.env.ADMIN_ALLOWED_ORIGIN = APP_ORIGIN;
process.env.USER_SESSION_SECRET = "user-secret-import-test";
process.env.ADMIN_SESSION_SECRET = "admin-secret-import-test";

const importFromProject = (relativePath) => import(pathToFileURL(path.join(PROJECT_ROOT, relativePath)).href);

const [
  { updateStore },
  { createCsrfToken, signPayload },
  { default: catalogStateHandler },
  { parseCatalogCsv },
] = await Promise.all([
  importFromProject("api/_lib/store.js"),
  importFromProject("api/_lib/security.js"),
  importFromProject("api/catalog-state.js"),
  importFromProject("src/domain/admin/catalogCsv.js"),
]);

const CSRF_TOKEN = createCsrfToken("admin-session");

function createMockResponse() {
  const headers = new Map();
  return {
    statusCode: 200,
    ended: false,
    body: "",
    jsonBody: undefined,
    setHeader(name, value) {
      headers.set(String(name).toLowerCase(), value);
    },
    getHeader(name) {
      return headers.get(String(name).toLowerCase());
    },
    status(code) {
      this.statusCode = Number(code) || 200;
      return this;
    },
    json(payload) {
      this.setHeader("content-type", "application/json; charset=utf-8");
      this.jsonBody = payload;
      this.end(JSON.stringify(payload));
    },
    end(payload = "") {
      if (this.ended) return;
      this.ended = true;
      this.body = typeof payload === "string" ? payload : String(payload || "");
    },
  };
}

function createRequest({ method = "GET", query = {}, body = null, admin = false, csrf = true } = {}) {
  const cookies = [`adriego_csrf_token=${encodeURIComponent(CSRF_TOKEN)}`];
  if (admin) {
    cookies.push(`adriego_admin_session=${encodeURIComponent(signPayload({
      sub: "admin@test.local",
      iat: Date.now(),
      exp: Date.now() + 60_000,
    }, process.env.ADMIN_SESSION_SECRET))}`);
  }

  return {
    method,
    query,
    headers: {
      origin: APP_ORIGIN,
      host: "localhost:5173",
      cookie: cookies.join("; "),
      "x-requested-with": "XMLHttpRequest",
      ...(body ? { "content-type": "application/json" } : {}),
      ...(csrf ? { "x-csrf-token": CSRF_TOKEN } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    socket: { remoteAddress: "127.0.0.1" },
  };
}

async function callApi(options) {
  const req = createRequest(options);
  const res = createMockResponse();
  await catalogStateHandler(req, res);
  if (!res.ended) res.end();
  return res;
}

before(async () => {
  await updateStore((draft) => {
    draft.products = [];
    draft.coupons = [];
    draft.orders = [];
    return draft;
  });
});

after(async () => {
  process.chdir(originalCwd);
  await fs.rm(sandboxCwd, { recursive: true, force: true });
});

test("CSV import: new products default to isPublic: true when 'publico' header is omitted", () => {
  const csv = "sku,nombre,precio,color,talla,stock\nCAM-01,Camisa Lino,39.9,Blanco,M,10";
  const result = parseCatalogCsv(csv, []);
  assert.equal(result.errors.length, 0);
  assert.equal(result.products.length, 1);
  assert.equal(result.products[0].isPublic, true);
  assert.equal(result.products[0].name, "Camisa Lino");
});

test("CSV import: explicit publico 'no' and 'si' are respected", () => {
  const csv = "sku,nombre,precio,publico,color,talla,stock\nDRAFT-01,Borrador Oculto,50,no,Negro,S,5\nPUB-01,Producto Visible,60,si,Azul,L,8";
  const result = parseCatalogCsv(csv, []);
  assert.equal(result.errors.length, 0);
  assert.equal(result.products.length, 2);

  const draftProd = result.products.find((p) => p.sku === "DRAFT-01");
  const pubProd = result.products.find((p) => p.sku === "PUB-01");

  assert.ok(draftProd);
  assert.equal(draftProd.isPublic, false);

  assert.ok(pubProd);
  assert.equal(pubProd.isPublic, true);
});

test("API lifecycle: imported products persist and public reads filter drafts", async () => {
  // 1. Parse CSV containing one public product and one draft product
  const csv = "sku,nombre,precio,publico,color,talla,stock\nCAM-PUB,Camisa Publicada,45,si,Blanco,M,10\nCAM-DFT,Camisa Borrador,45,no,Azul,M,5";
  const parsed = parseCatalogCsv(csv, []);
  assert.equal(parsed.errors.length, 0);
  assert.equal(parsed.products.length, 2);

  // 2. Admin saves the imported products via /api/catalog-state?action=sync
  const syncResponse = await callApi({
    method: "POST",
    query: { action: "sync" },
    admin: true,
    csrf: true,
    body: {
      data: {
        products: parsed.products,
      },
      baseCatalogVersion: 0,
      writeProtocol: 2,
    },
  });

  assert.equal(syncResponse.statusCode, 200);
  assert.equal(syncResponse.jsonBody?.ok, true);

  // 3. Public request (/api/catalog-state?action=get-public) returns ONLY the published product
  const publicResponse = await callApi({
    method: "GET",
    query: { action: "get-public" },
    admin: false,
  });

  assert.equal(publicResponse.statusCode, 200);
  assert.equal(publicResponse.jsonBody?.ok, true);
  const publicProducts = publicResponse.jsonBody?.data?.products || [];
  assert.equal(publicProducts.length, 1);
  assert.equal(publicProducts[0].sku, "CAM-PUB");
  assert.equal(publicProducts.some((p) => p.sku === "CAM-DFT"), false);

  // 4. Unauthorized sync attempt is rejected with 401
  const unauthorizedSyncResponse = await callApi({
    method: "POST",
    query: { action: "sync" },
    admin: false,
    csrf: true,
    body: { data: { products: [] } },
  });
  assert.equal(unauthorizedSyncResponse.statusCode, 401);
  assert.equal(unauthorizedSyncResponse.jsonBody?.ok, false);

  // 4b. Non-admin GET request never leaks draft/private products
  const nonAdminGetResponse = await callApi({
    method: "GET",
    query: { action: "get" },
    admin: false,
  });
  assert.equal(nonAdminGetResponse.statusCode, 200);
  assert.equal(nonAdminGetResponse.jsonBody?.ok, true);
  assert.equal(nonAdminGetResponse.jsonBody?.data?.products?.length, 1);
  assert.equal(nonAdminGetResponse.jsonBody?.data?.products?.[0]?.sku, "CAM-PUB");
  assert.equal("coupons" in (nonAdminGetResponse.jsonBody?.data || {}), false);
  assert.equal("orderHistory" in (nonAdminGetResponse.jsonBody?.data || {}), false);

  // 5. Admin reload (/api/catalog-state?action=get) preserves BOTH products (public and draft)
  const adminReloadResponse = await callApi({
    method: "GET",
    query: { action: "get" },
    admin: true,
  });

  assert.equal(adminReloadResponse.statusCode, 200);
  assert.equal(adminReloadResponse.jsonBody?.ok, true);
  const adminProducts = adminReloadResponse.jsonBody?.data?.products || [];
  assert.equal(adminProducts.length, 2);
  assert.ok(adminProducts.some((p) => p.sku === "CAM-PUB" && p.isPublic === true));
  assert.ok(adminProducts.some((p) => p.sku === "CAM-DFT" && p.isPublic === false));
});

test("CSV import with 'destacados' column preserves featured: true across sync and reload", async () => {
  const csv = "sku,nombre,precio,publico,destacados,color,talla,stock\nDEST-001,Vestido Destacado,75,si,si,Negro,M,12";
  const parsed = parseCatalogCsv(csv, []);
  assert.equal(parsed.errors.length, 0);
  assert.equal(parsed.products.length, 1);
  assert.equal(parsed.products[0].featured, true);
  assert.equal(parsed.products[0].isPublic, true);

  const preCheckResponse = await callApi({
    method: "GET",
    query: { action: "get" },
    admin: true,
  });
  const currentVersion = preCheckResponse.jsonBody?.data?.catalogVersion ?? 0;

  const syncResponse = await callApi({
    method: "POST",
    query: { action: "sync" },
    admin: true,
    csrf: true,
    body: {
      data: {
        products: parsed.products,
      },
      baseCatalogVersion: currentVersion,
      writeProtocol: 2,
    },
  });

  assert.equal(syncResponse.statusCode, 200);
  assert.equal(syncResponse.jsonBody?.ok, true);

  // Admin reload confirms product is featured and public
  const adminReloadResponse = await callApi({
    method: "GET",
    query: { action: "get" },
    admin: true,
  });

  assert.equal(adminReloadResponse.statusCode, 200);
  const products = adminReloadResponse.jsonBody?.data?.products || [];
  const featuredProduct = products.find((p) => p.sku === "DEST-001");
  assert.ok(featuredProduct);
  assert.equal(featuredProduct.featured, true);
  assert.equal(featuredProduct.isPublic, true);
});
