import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import crypto from "node:crypto";

const THIS_FILE = fileURLToPath(import.meta.url);
const THIS_DIR = path.dirname(THIS_FILE);
const PROJECT_ROOT = path.resolve(THIS_DIR, "..", "..");
const APP_ORIGIN = "http://localhost:5173";
const ADMIN_PASSWORD = "Admin12345";
const ADMIN_IDENTIFIER = "admin@test.local";
const USER_PASSWORD = "SecPassword123";

const sandboxCwd = await fs.mkdtemp(path.join(os.tmpdir(), "atelier-concurrency-e2e-"));
process.chdir(sandboxCwd);

process.env.NODE_ENV = "test";
process.env.SECURITY_LOG_ENABLED = "false";
process.env.USER_ALLOWED_ORIGIN = APP_ORIGIN;
process.env.ADMIN_ALLOWED_ORIGIN = APP_ORIGIN;
process.env.USER_PASSWORD_RESET_BASE_URL = APP_ORIGIN;
process.env.USER_SESSION_SECRET = "user-sec-secret";
process.env.ADMIN_SESSION_SECRET = "admin-sec-secret";
process.env.ADMIN_EMAIL = ADMIN_IDENTIFIER;
process.env.ADMIN_USERNAME = ADMIN_IDENTIFIER;
process.env.ADMIN_PASSWORD_ALGORITHM = "scrypt";

const adminSalt = crypto.randomBytes(16).toString("base64url");
process.env.ADMIN_PASSWORD_SALT = adminSalt;
process.env.ADMIN_PASSWORD_HASH = crypto.scryptSync(ADMIN_PASSWORD, adminSalt, 64).toString("hex");

const importFromProject = (relativePath) => import(pathToFileURL(path.join(PROJECT_ROOT, relativePath)).href);

const [
  { updateStore, readStore },
  { default: csrfTokenHandler },
  { default: userAuthHandler },
  { default: adminSessionHandler },
  { default: catalogStateHandler },
  { default: checkoutOrderHandler }
] = await Promise.all([
  importFromProject("api/_lib/store.js"),
  importFromProject("api/csrf-token.js"),
  importFromProject("api/user-auth.js"),
  importFromProject("api/admin-session.js"),
  importFromProject("api/catalog-state.js"),
  importFromProject("api/checkout-order.js")
]);

function createMockResponse() {
  const headers = new Map();
  return {
    statusCode: 200,
    ended: false,
    body: "",
    jsonBody: undefined,
    setHeader(name, value) {
      const lower = String(name).toLowerCase();
      if (lower === "set-cookie") {
        const existing = headers.get("set-cookie") || [];
        const incoming = Array.isArray(value) ? value : [value];
        headers.set("set-cookie", [...existing, ...incoming]);
      } else {
        headers.set(lower, value);
      }
    },
    getHeader(name) {
      return headers.get(String(name).toLowerCase());
    },
    getHeaders() {
      const out = {};
      for (const [k, v] of headers.entries()) out[k] = v;
      return out;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.jsonBody = payload;
      this.body = JSON.stringify(payload);
      this.ended = true;
      return this;
    },
    end(payload) {
      if (payload !== undefined) this.body = String(payload);
      this.ended = true;
      return this;
    }
  };
}

function serializeCookies(cookieJar = {}) {
  return Object.entries(cookieJar)
    .map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
    .join("; ");
}

function applySetCookieHeaders(cookieJar = {}, response) {
  const rawHeaders = response.getHeader("set-cookie");
  if (!rawHeaders) return;
  const list = Array.isArray(rawHeaders) ? rawHeaders : [rawHeaders];
  for (const item of list) {
    const [cookiePair, ...attributes] = String(item).split(";").map((p) => p.trim());
    if (!cookiePair) continue;
    const eqIndex = cookiePair.indexOf("=");
    if (eqIndex <= 0) continue;
    const name = cookiePair.slice(0, eqIndex);
    const value = decodeURIComponent(cookiePair.slice(eqIndex + 1));
    const maxAge = attributes.find((a) => a.toLowerCase().startsWith("max-age="));
    if (maxAge && Number(maxAge.split("=")[1]) <= 0) {
      delete cookieJar[name];
      continue;
    }
    cookieJar[name] = value;
  }
}

async function callApi(handler, {
  method = "GET",
  query = {},
  json,
  cookieJar = {},
  csrfToken = "",
  extraHeaders = {},
  remoteAddress = "127.0.0.1",
} = {}) {
  const headers = {
    origin: APP_ORIGIN,
    host: "localhost:5173",
    ...extraHeaders,
  };
  if (Object.keys(cookieJar).length) {
    headers.cookie = serializeCookies(cookieJar);
  }
  if (json !== undefined) {
    headers["content-type"] = "application/json";
  }
  if (csrfToken) {
    headers["x-csrf-token"] = csrfToken;
    headers["x-requested-with"] = "XMLHttpRequest";
  }

  const request = {
    method,
    query,
    headers,
    body: json !== undefined ? json : "",
    socket: { remoteAddress },
  };
  const response = createMockResponse();
  await handler(request, response);
  if (!response.ended) response.end();
  applySetCookieHeaders(cookieJar, response);

  if (response.jsonBody === undefined && response.body) {
    try {
      response.jsonBody = JSON.parse(response.body);
    } catch {}
  }
  return response;
}

async function getCsrfToken(cookieJar) {
  const response = await callApi(csrfTokenHandler, { method: "GET", cookieJar });
  assert.equal(response.statusCode, 200);
  return response.jsonBody.token;
}

test("Offensive Concurrency & Race Condition Suite", async (t) => {
  // Setup product with stock = 1
  await updateStore((draft) => {
    draft.products = [
      {
        id: "prod-scarce",
        name: "Edición Limitada",
        price: 50,
        colors: ["#111111"],
        sizes: ["M"],
        variants: [
          { uid: "var-scarce-1", color: "#111111", size: "M", stock: 1 }
        ],
        stockBySize: { M: 1 }
      }
    ];
    draft.orders = [];
    draft.users = [];
    if (!draft.meta) draft.meta = { realtime: {} };
    draft.meta.realtime.catalogVersion = 10;
    return draft;
  });

  // Register User 1 and User 2
  const user1Cookies = {};
  const user1Csrf = await getCsrfToken(user1Cookies);
  await callApi(userAuthHandler, {
    method: "POST",
    query: { action: "register" },
    cookieJar: user1Cookies,
    csrfToken: user1Csrf,
    json: { name: "Comprador 1", email: "user1@test.local", username: "user1", password: USER_PASSWORD, phone: "0999999991" }
  });

  const user2Cookies = {};
  const user2Csrf = await getCsrfToken(user2Cookies);
  await callApi(userAuthHandler, {
    method: "POST",
    query: { action: "register" },
    cookieJar: user2Cookies,
    csrfToken: user2Csrf,
    json: { name: "Comprador 2", email: "user2@test.local", username: "user2", password: USER_PASSWORD, phone: "0999999992" }
  });

  await t.test("1. Two simultaneous purchases of the last single unit in stock", async () => {
    if (globalThis.__ATELIER_RATE_LIMIT_STORE__) {
      globalThis.__ATELIER_RATE_LIMIT_STORE__.clear();
    }
    const user1CheckoutCsrf = await getCsrfToken(user1Cookies);
    const user2CheckoutCsrf = await getCsrfToken(user2Cookies);

    const user1CheckoutPromise = callApi(checkoutOrderHandler, {
      method: "POST",
      cookieJar: user1Cookies,
      csrfToken: user1CheckoutCsrf,
      extraHeaders: { "x-forwarded-for": "10.0.0.1" },
      json: {
        idempotencyKey: crypto.randomUUID(),
        cart: [{ id: "prod-scarce", color: "#111111", size: "M", quantity: 1 }],
        deliveryType: "pickup",
        deliveryDetails: { fullName: "Comprador 1", idNumber: "111", city: "Quito", address: "Av 1", phone: "0999999991" }
      }
    });

    const user2CheckoutPromise = callApi(checkoutOrderHandler, {
      method: "POST",
      cookieJar: user2Cookies,
      csrfToken: user2CheckoutCsrf,
      extraHeaders: { "x-forwarded-for": "10.0.0.2" },
      json: {
        idempotencyKey: crypto.randomUUID(),
        cart: [{ id: "prod-scarce", color: "#111111", size: "M", quantity: 1 }],
        deliveryType: "pickup",
        deliveryDetails: { fullName: "Comprador 2", idNumber: "222", city: "Quito", address: "Av 2", phone: "0999999992" }
      }
    });

    const [res1, res2] = await Promise.all([user1CheckoutPromise, user2CheckoutPromise]);
    console.log("CHECKOUT CONCURRENCY RESULTS:", { s1: res1.statusCode, b1: res1.jsonBody, s2: res2.statusCode, b2: res2.jsonBody });
    const statusCodes = [res1.statusCode, res2.statusCode];

    assert.ok(statusCodes.includes(200), "Exactly one purchase must succeed with 200");
    assert.ok(statusCodes.includes(400), "The other simultaneous purchase must fail with 400 Out of stock");

    const catalogResp = await callApi(catalogStateHandler, { method: "GET" });
    const scarceProduct = catalogResp.jsonBody?.data?.products?.find((p) => p.id === "prod-scarce");
    assert.equal(scarceProduct.variants[0].stock, 0, "Variant stock must be 0 and cannot go negative");

    const store = await readStore();
    assert.equal(store.orders.length, 1, "Exactly one order must be recorded in the store");
  });

  await t.test("2. Two administrators saving simultaneously with the same baseCatalogVersion", async () => {
    const admin1Cookies = {};
    const admin1Csrf = await getCsrfToken(admin1Cookies);
    await callApi(adminSessionHandler, {
      method: "POST",
      query: { action: "login" },
      cookieJar: admin1Cookies,
      csrfToken: admin1Csrf,
      json: { identifier: ADMIN_IDENTIFIER, password: ADMIN_PASSWORD }
    });

    const admin2Cookies = {};
    const admin2Csrf = await getCsrfToken(admin2Cookies);
    await callApi(adminSessionHandler, {
      method: "POST",
      query: { action: "login" },
      cookieJar: admin2Cookies,
      csrfToken: admin2Csrf,
      json: { identifier: ADMIN_IDENTIFIER, password: ADMIN_PASSWORD }
    });

    // Both read catalog version
    const catResp = await callApi(catalogStateHandler, { method: "GET", cookieJar: admin1Cookies });
    const baseVersion = catResp.jsonBody?.data?.catalogVersion;
    assert.ok(baseVersion > 0, "Catalog version must be positive");

    const catalogData = catResp.jsonBody?.data;

    // Both try to save simultaneously with the SAME baseCatalogVersion
    const mod1 = JSON.parse(JSON.stringify(catalogData));
    mod1.products[0].price = 111;

    const mod2 = JSON.parse(JSON.stringify(catalogData));
    mod2.products[0].price = 222;

    const admin1SyncCsrf = await getCsrfToken(admin1Cookies);
    const admin2SyncCsrf = await getCsrfToken(admin2Cookies);

    const save1Promise = callApi(catalogStateHandler, {
      method: "POST",
      query: { action: "sync" },
      cookieJar: admin1Cookies,
      csrfToken: admin1SyncCsrf,
      json: { baseCatalogVersion: baseVersion, data: mod1 }
    });

    const save2Promise = callApi(catalogStateHandler, {
      method: "POST",
      query: { action: "sync" },
      cookieJar: admin2Cookies,
      csrfToken: admin2SyncCsrf,
      json: { baseCatalogVersion: baseVersion, data: mod2 }
    });

    const [save1, save2] = await Promise.all([save1Promise, save2Promise]);
    const saveStatuses = [save1.statusCode, save2.statusCode];

    assert.ok(saveStatuses.includes(200), "First save must succeed with 200");
    assert.ok(saveStatuses.includes(409), "Second conflicting save must fail with 409 Conflict");

    const conflictResp = save1.statusCode === 409 ? save1 : save2;
    assert.equal(conflictResp.jsonBody?.code, "CATALOG_VERSION_CONFLICT");
    assert.equal(conflictResp.jsonBody?.currentVersion, baseVersion + 1);
  });
});
