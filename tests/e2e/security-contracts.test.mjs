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

const sandboxCwd = await fs.mkdtemp(path.join(os.tmpdir(), "atelier-sec-e2e-"));
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
  { readStore, updateStore },
  { default: csrfTokenHandler },
  { default: userAuthHandler },
  { default: adminSessionHandler },
  { default: catalogStateHandler },
  { default: checkoutOrderHandler },
  { default: ordersHandler },
  { default: couponPreviewHandler }
] = await Promise.all([
  importFromProject("api/_lib/store.js"),
  importFromProject("api/csrf-token.js"),
  importFromProject("api/user-auth.js"),
  importFromProject("api/admin-session.js"),
  importFromProject("api/catalog-state.js"),
  importFromProject("api/checkout-order.js"),
  importFromProject("api/orders.js"),
  importFromProject("api/coupon-preview.js")
]);

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

function serializeCookies(cookieJar) {
  return Object.entries(cookieJar)
    .map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
    .join("; ");
}

function applySetCookieHeaders(cookieJar, response) {
  const rawHeader = response.getHeader("set-cookie");
  const entries = Array.isArray(rawHeader) ? rawHeader : (rawHeader ? [rawHeader] : []);
  for (const entry of entries) {
    const parts = String(entry).split(";").map((item) => item.trim()).filter(Boolean);
    if (!parts.length) continue;
    const [namePart, ...attributes] = parts;
    const separatorIndex = namePart.indexOf("=");
    if (separatorIndex <= 0) continue;
    const name = namePart.slice(0, separatorIndex);
    const value = decodeURIComponent(namePart.slice(separatorIndex + 1));
    const maxAge = attributes.find((attribute) => attribute.toLowerCase().startsWith("max-age="));
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
} = {}) {
  const headers = {
    origin: APP_ORIGIN,
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
    body: json !== undefined ? JSON.stringify(json) : "",
    socket: {
      remoteAddress: "127.0.0.1",
    },
  };
  const response = createMockResponse();

  await handler(request, response);
  if (!response.ended) {
    response.end();
  }
  applySetCookieHeaders(cookieJar, response);

  if (response.jsonBody === undefined && response.body) {
    try {
      response.jsonBody = JSON.parse(response.body);
    } catch {
      // No-op for non-JSON responses.
    }
  }

  return response;
}

async function getCsrfToken(cookieJar) {
  const response = await callApi(csrfTokenHandler, {
    method: "GET",
    cookieJar,
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.jsonBody?.ok, true);
  assert.ok(response.jsonBody?.token, "CSRF token should be returned");
  return response.jsonBody.token;
}

test("Security Contracts", async (t) => {
  await t.test("Setup base catalog", async () => {
    await updateStore((draft) => {
      draft.products = [
        {
          id: "prod-sec",
          name: "Security Product",
          price: 10,
          colors: ["Rojo"],
          sizes: ["M"],
          variants: [
            { uid: "var-sec-1", color: "Rojo", size: "M", stock: 5 }
          ],
          stockBySize: { M: 5 }
        }
      ];
      draft.coupons = [];
      draft.orders = [];
      if (!draft.meta) draft.meta = { realtime: {} };
      draft.meta.realtime.catalogVersion = 10;
      return draft;
    });
  });

  let userCookies = {};
  let userCsrf = "";

  await t.test("Register user for tests", async () => {
    userCsrf = await getCsrfToken(userCookies);
    const registerResponse = await callApi(userAuthHandler, {
      method: "POST",
      query: { action: "register" },
      cookieJar: userCookies,
      csrfToken: userCsrf,
      json: {
        name: "Security User",
        email: "secuser@test.local",
        username: "secuser",
        password: USER_PASSWORD,
        phone: "0999999999"
      }
    });
    assert.equal(registerResponse.statusCode, 200);
  });

  await t.test("1. Password reset must reject unverified Host headers", async () => {
    const cookies = {};
    const csrf = await getCsrfToken(cookies);

    const resetResponse = await callApi(userAuthHandler, {
      method: "POST",
      query: { action: "request-password-reset" },
      cookieJar: cookies,
      csrfToken: csrf,
      extraHeaders: {
        "x-forwarded-host": "evil-attacker.com",
        "host": "evil-attacker.com"
      },
      json: { email: "secuser@test.local" }
    });

    assert.equal(resetResponse.statusCode, 200);
    const link = resetResponse.jsonBody?.resetLink;
    assert.ok(link, "Reset link should be returned in test mode");
    assert.ok(link.startsWith(APP_ORIGIN), "Link should use configured base URL");
    assert.ok(!link.includes("evil-attacker.com"), "Link must not contain malicious host");
  });

  await t.test("2. Session cookie invalidation after password change", async () => {
    const loginResp = await callApi(userAuthHandler, {
      method: "POST",
      query: { action: "login" },
      cookieJar: userCookies,
      csrfToken: userCsrf,
      json: { identifier: "secuser@test.local", password: USER_PASSWORD }
    });
    assert.equal(loginResp.statusCode, 200);

    const oldSessionCookie = userCookies["adriego_user_session"] || userCookies["atelier_user_session"];
    assert.ok(oldSessionCookie, "Session cookie should be set");

    const changePwResp = await callApi(userAuthHandler, {
      method: "POST",
      query: { action: "change-password" },
      cookieJar: userCookies,
      csrfToken: userCsrf,
      json: { currentPassword: USER_PASSWORD, newPassword: "NewSecPassword123", confirmPassword: "NewSecPassword123" }
    });
    assert.equal(changePwResp.statusCode, 200);

    const newSessionCookie = userCookies["adriego_user_session"] || userCookies["atelier_user_session"];
    assert.ok(newSessionCookie, "New session cookie should be set after password change");
    assert.notEqual(oldSessionCookie, newSessionCookie, "Session cookie must rotate");

    // Old cookie should be invalid
    const oldCookieJar = { "adriego_user_session": oldSessionCookie, "atelier_user_session": oldSessionCookie };
    const oldCsrf = await getCsrfToken(oldCookieJar);

    const profileResp = await callApi(userAuthHandler, {
      method: "POST",
      query: { action: "update-profile" },
      cookieJar: oldCookieJar,
      csrfToken: oldCsrf,
      json: {}
    });
    assert.equal(profileResp.statusCode, 401, "Old session cookie should be rejected");
  });

  await t.test("2b. Logout clears the browser session and a later login restores synchronized state", async () => {
    const lifecycleCookies = {};
    const lifecycleCsrf = await getCsrfToken(lifecycleCookies);
    const loginResponse = await callApi(userAuthHandler, {
      method: "POST",
      query: { action: "login" },
      cookieJar: lifecycleCookies,
      csrfToken: lifecycleCsrf,
      json: { identifier: "secuser@test.local", password: "NewSecPassword123" },
    });
    assert.equal(loginResponse.statusCode, 200);

    const syncResponse = await callApi(userAuthHandler, {
      method: "POST",
      query: { action: "sync-state" },
      cookieJar: lifecycleCookies,
      csrfToken: lifecycleCsrf,
      json: {
        baseStateVersion: Number(loginResponse.jsonBody?.user?.stateVersion || 0),
        cart: [{ key: "logout-line", id: "prod-sec", color: "Rojo", size: "M", quantity: 1 }],
        favorites: ["prod-sec"],
      },
    });
    assert.equal(syncResponse.statusCode, 200);

    const logoutResponse = await callApi(userAuthHandler, {
      method: "POST",
      query: { action: "logout" },
      cookieJar: lifecycleCookies,
      csrfToken: lifecycleCsrf,
      json: {},
    });
    assert.equal(logoutResponse.statusCode, 200);
    assert.equal(lifecycleCookies.adriego_user_session, undefined, "Logout must clear the browser session cookie");

    const statusAfterLogout = await callApi(userAuthHandler, {
      method: "GET",
      query: { action: "status" },
      cookieJar: lifecycleCookies,
    });
    assert.equal(statusAfterLogout.jsonBody?.authenticated, false);

    const loginAgainResponse = await callApi(userAuthHandler, {
      method: "POST",
      query: { action: "login" },
      cookieJar: lifecycleCookies,
      csrfToken: lifecycleCsrf,
      json: { identifier: "secuser@test.local", password: "NewSecPassword123" },
    });
    assert.equal(loginAgainResponse.statusCode, 200);
    assert.equal(loginAgainResponse.jsonBody?.user?.cart?.[0]?.key, "logout-line");
    assert.equal(loginAgainResponse.jsonBody?.user?.favorites?.includes("prod-sec"), true);
  });

  await t.test("3. Idempotent checkout deducts stock only once", async () => {
    const checkoutPayload = {
      cart: [{ id: "prod-sec", color: "Rojo", size: "M", quantity: 2 }],
      deliveryType: "pickup",
      deliveryDetails: { fullName: "Sec User", idNumber: "123", city: "C", address: "A", reference: "R", phone: "0999999999" }
    };

    // Missing idempotency key -> 400
    const resNoKey = await callApi(checkoutOrderHandler, {
      method: "POST",
      cookieJar: userCookies,
      csrfToken: userCsrf,
      json: checkoutPayload
    });
    assert.equal(resNoKey.statusCode, 400);

    const idempotencyKey = crypto.randomUUID();
    const payloadWithKey = { ...checkoutPayload, idempotencyKey };

    // First request
    const resFirst = await callApi(checkoutOrderHandler, {
      method: "POST",
      cookieJar: userCookies,
      csrfToken: userCsrf,
      json: payloadWithKey
    });
    assert.equal(resFirst.statusCode, 200);
    const orderId1 = resFirst.jsonBody?.order?.id;
    assert.ok(orderId1);

    // Second request with SAME idempotencyKey
    const resSecond = await callApi(checkoutOrderHandler, {
      method: "POST",
      cookieJar: userCookies,
      csrfToken: userCsrf,
      json: payloadWithKey
    });
    assert.equal(resSecond.statusCode, 200);
    const orderId2 = resSecond.jsonBody?.order?.id;
    assert.equal(orderId1, orderId2, "Should return the exact same order for repeated idempotencyKey");

    // Verify stock only dropped once
    const catalogResp = await callApi(catalogStateHandler, {
      method: "GET"
    });
    const catalog = catalogResp.jsonBody?.data;
    const prod = catalog.products.find(p => p.id === "prod-sec");
    const stock = prod.variants[0].stock;
    assert.equal(stock, 3, "Stock should drop by 2 only once");
  });

  let adminCookies = {};
  let adminCsrf = "";

  await t.test("4. Obsolete catalog version returns 409", async () => {
    adminCsrf = await getCsrfToken(adminCookies);
    const loginResp = await callApi(adminSessionHandler, {
      method: "POST",
      query: { action: "login" },
      cookieJar: adminCookies,
      csrfToken: adminCsrf,
      json: { identifier: ADMIN_IDENTIFIER, password: ADMIN_PASSWORD }
    });
    assert.equal(loginResp.statusCode, 200);

    // Get current catalog and version
    const getResp = await callApi(catalogStateHandler, {
      method: "GET",
      cookieJar: adminCookies
    });
    const catalogData = getResp.jsonBody?.data;
    const currentVersion = catalogData.catalogVersion;
    assert.ok(currentVersion > 0, "Catalog should have a positive version");

    const obsoleteVersion = currentVersion - 1;
    const mutatedProducts = JSON.parse(JSON.stringify(catalogData.products));
    mutatedProducts[0].price = 999;

    const updateResp = await callApi(catalogStateHandler, {
      method: "POST",
      query: { action: "sync" },
      cookieJar: adminCookies,
      csrfToken: adminCsrf,
      json: {
        baseCatalogVersion: obsoleteVersion,
        writeProtocol: 2,
        data: { ...catalogData, products: mutatedProducts }
      }
    });

    assert.equal(updateResp.statusCode, 409, "Should return 409 Conflict for obsolete version");

    // Verify it didn't change
    const verifyResp = await callApi(catalogStateHandler, {
      method: "GET",
      cookieJar: adminCookies
    });
    const newCatalogData = verifyResp.jsonBody?.data;
    assert.equal(newCatalogData.products[0].price, 10, "Price should NOT be updated by obsolete version request");
  });

  await t.test("legacy tabs cannot overwrite the catalog even with a current version", async () => {
    const before = await readStore();
    const response = await callApi(catalogStateHandler, {
      method: "POST", query: { action: "sync" }, cookieJar: adminCookies, csrfToken: adminCsrf,
      json: { baseCatalogVersion: before.meta.realtime.catalogVersion, data: { products: [], contactSettings: {} } },
    });
    assert.equal(response.statusCode, 409);
    assert.equal(response.jsonBody.code, "CATALOG_CLIENT_OUTDATED");
    assert.deepEqual(await readStore(), before);
  });

  await t.test("internal notes remain administrative across list, fresh checkout and replay", async () => {
    const stored = (await readStore()).orders[0];
    const note = "Privado: revisar empaque\nNo compartir con el cliente";
    const adminUpdate = await callApi(ordersHandler, {
      method: "POST", query: { action: "update" }, cookieJar: adminCookies, csrfToken: adminCsrf,
      json: { orderId: stored.id, internalNote: note },
    });
    assert.equal(adminUpdate.statusCode, 200);
    assert.equal(adminUpdate.jsonBody.orderHistory.find((o) => o.id === stored.id).internalNote, note);
    for (const handler of [ordersHandler, catalogStateHandler]) {
      const response = await callApi(handler, { method: "GET", cookieJar: adminCookies });
      const history = response.jsonBody.orderHistory || response.jsonBody.data.orderHistory;
      assert.equal(history.find((o) => o.id === stored.id).internalNote, note);
    }
    const list = await callApi(ordersHandler, { method: "GET", cookieJar: userCookies });
    assert.equal(list.statusCode, 200);
    assert.equal(Object.hasOwn(list.jsonBody.orderHistory[0], "internalNote"), false);
    assert.equal(list.jsonBody.orderHistory[0].total, stored.total);
    assert.deepEqual(list.jsonBody.orderHistory[0].items, stored.items);
    const payload = { cart: [{ id: "prod-sec", color: "Rojo", size: "M", quantity: 1 }] };
    for (const idempotencyKey of [crypto.randomUUID(), stored.idempotencyKey]) {
      const checkout = await callApi(checkoutOrderHandler, {
        method: "POST", cookieJar: userCookies, csrfToken: userCsrf, json: { ...payload, idempotencyKey },
      });
      assert.equal(checkout.statusCode, 200);
      assert.equal(Object.hasOwn(checkout.jsonBody.order, "internalNote"), false);
      assert.ok(checkout.jsonBody.orderHistory.every((o) => !Object.hasOwn(o, "internalNote")));
      if (idempotencyKey === stored.idempotencyKey) {
        assert.equal(checkout.jsonBody.idempotentReplay, true);
        assert.equal(checkout.jsonBody.order.id, stored.id);
      }
    }
    assert.equal((await readStore()).orders.find((o) => o.id === stored.id).internalNote, note);
  });

  await t.test("100 percent coupons preserve zero in preview, checkout and replay", async () => {
    await updateStore((draft) => {
      draft.coupons = [{ code: "GRATIS", discountType: "percentage", discountValue: 100, active: true }];
      return draft;
    });
    const cart = [{ id: "prod-sec", color: "Rojo", size: "M", quantity: 1 }];
    const preview = await callApi(couponPreviewHandler, {
      method: "POST", cookieJar: userCookies, csrfToken: userCsrf, json: { cart, couponCode: "GRATIS" },
    });
    assert.equal(preview.statusCode, 200);
    assert.equal(preview.jsonBody.couponState.ok, true);
    assert.equal(preview.jsonBody.couponState.total, 0);
    const idempotencyKey = crypto.randomUUID();
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await callApi(checkoutOrderHandler, {
        method: "POST", cookieJar: userCookies, csrfToken: userCsrf,
        json: { cart, couponCode: "GRATIS", idempotencyKey },
      });
      assert.equal(response.statusCode, 200);
      assert.equal(response.jsonBody.order.subtotal, 10);
      assert.equal(response.jsonBody.order.discountAmount, 10);
      assert.equal(response.jsonBody.order.paymentBaseTotal, 0);
      assert.equal(response.jsonBody.order.total, 0);
    }
  });

  await t.test("5. Protected routes must require session and CSRF", async () => {
    // 5a. Missing CSRF -> 403
    const noCsrfResp = await callApi(catalogStateHandler, {
      method: "POST",
      query: { action: "sync" },
      cookieJar: adminCookies,
      csrfToken: "", // explicitly missing
      json: {
        baseCatalogVersion: 100,
        writeProtocol: 2,
        data: { products: [] }
      }
    });
    assert.equal(noCsrfResp.statusCode, 403, "Missing CSRF should return 403");

    // 5b. Missing Session -> 401
    const emptyCookies = {};
    const validCsrfForEmpty = await getCsrfToken(emptyCookies);
    const noSessionResp = await callApi(catalogStateHandler, {
      method: "POST",
      query: { action: "sync" },
      cookieJar: emptyCookies,
      csrfToken: validCsrfForEmpty,
      json: {
        baseCatalogVersion: 100,
        writeProtocol: 2,
        data: { products: [] }
      }
    });
    assert.equal(noSessionResp.statusCode, 401, "Missing Session should return 401");
  });

  await t.test("6. Production must reject missing persistent storage", async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousKvUrl = process.env.KV_REST_API_URL;
    const previousKvToken = process.env.KV_REST_API_TOKEN;
    process.env.NODE_ENV = "production";
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;

    await assert.rejects(
      () => readStore(),
      (error) => error?.code === "PERSISTENT_STORE_REQUIRED",
      "Production must fail closed when KV is missing",
    );

    process.env.NODE_ENV = previousNodeEnv;
    if (previousKvUrl === undefined) delete process.env.KV_REST_API_URL;
    else process.env.KV_REST_API_URL = previousKvUrl;
    if (previousKvToken === undefined) delete process.env.KV_REST_API_TOKEN;
    else process.env.KV_REST_API_TOKEN = previousKvToken;
  });
});
