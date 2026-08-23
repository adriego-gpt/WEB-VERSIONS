import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test, { after } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const THIS_FILE = fileURLToPath(import.meta.url);
const THIS_DIR = path.dirname(THIS_FILE);
const PROJECT_ROOT = path.resolve(THIS_DIR, "..", "..");
const APP_ORIGIN = "http://localhost:5173";
const ADMIN_PASSWORD = "Admin12345";
const ADMIN_IDENTIFIER = "admin@test.local";
const USER_PASSWORD = "Realtime123";
const MAPS_TEST_URL = "https://maps.app.goo.gl/gc5qGjhA4xoQyzr68";

const sandboxCwd = await fs.mkdtemp(path.join(os.tmpdir(), "atelier-realtime-e2e-"));
const originalCwd = process.cwd();
process.chdir(sandboxCwd);

process.env.NODE_ENV = "test";
process.env.SECURITY_LOG_ENABLED = "false";
process.env.USER_ALLOWED_ORIGIN = APP_ORIGIN;
process.env.ADMIN_ALLOWED_ORIGIN = APP_ORIGIN;
process.env.USER_SESSION_SECRET = "user-secret-realtime";
process.env.ADMIN_SESSION_SECRET = "admin-secret-realtime";
process.env.ADMIN_EMAIL = ADMIN_IDENTIFIER;
process.env.ADMIN_USERNAME = ADMIN_IDENTIFIER;
process.env.ADMIN_PASSWORD_ALGORITHM = "scrypt";

const adminSalt = crypto.randomBytes(16).toString("base64url");
process.env.ADMIN_PASSWORD_SALT = adminSalt;
process.env.ADMIN_PASSWORD_HASH = crypto.scryptSync(ADMIN_PASSWORD, adminSalt, 64).toString("hex");

const importFromProject = (relativePath) => import(pathToFileURL(path.join(PROJECT_ROOT, relativePath)).href);

const [
  { updateStore },
  { default: csrfTokenHandler },
  { default: userAuthHandler },
  { default: adminSessionHandler },
  { default: catalogStateHandler },
  { default: checkoutOrderHandler },
  { default: ordersHandler },
  { default: realtimeSyncHandler },
] = await Promise.all([
  importFromProject("api/_lib/store.js"),
  importFromProject("api/csrf-token.js"),
  importFromProject("api/user-auth.js"),
  importFromProject("api/admin-session.js"),
  importFromProject("api/catalog-state.js"),
  importFromProject("api/checkout-order.js"),
  importFromProject("api/orders.js"),
  importFromProject("api/realtime-sync.js"),
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
      // Non-JSON body.
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
  assert.ok(response.jsonBody?.token);
  return response.jsonBody.token;
}

async function seedCatalogBaseData() {
  await updateStore((draft) => {
    draft.products = [
      {
        id: "prod-rt-1",
        name: "Vestido Realtime",
        price: 59.99,
        colors: ["Negro"],
        sizes: ["M", "L"],
        imagesByColor: {
          Negro: ["https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=1200&q=80"],
        },
        variants: [
          { uid: "rt-var-1", color: "Negro", size: "M", stock: 12 },
          { uid: "rt-var-2", color: "Negro", size: "L", stock: 12 },
        ],
        stockBySize: { M: 12, L: 12 },
      },
    ];
    draft.coupons = [];
    draft.orders = [];
    draft.contactSettings = {
      address: "Centro Comercial Local 2",
      locationNote: "Frente al parque principal",
      whatsappNumber: "593999999999",
      whatsappLink: "",
      phone: "",
      email: "ventas@atelier.test",
      mapsLink: MAPS_TEST_URL,
      instagram: "https://instagram.com/atelierstudio",
      facebook: "https://facebook.com/atelierstudio",
      tiktok: "https://www.tiktok.com/@atelierstudio",
    };
    draft.storeSettings = null;
    draft.productTypes = [];
    draft.filterTags = [];
    return draft;
  });
}

test("realtime sync keeps user/admin state consistent across devices", async () => {
  await seedCatalogBaseData();

  const deviceA = {};
  const deviceB = {};
  const adminCookies = {};
  const csrfA = await getCsrfToken(deviceA);
  const csrfB = await getCsrfToken(deviceB);
  const csrfAdmin = await getCsrfToken(adminCookies);

  const registerResponse = await callApi(userAuthHandler, {
    method: "POST",
    query: { action: "register" },
    cookieJar: deviceA,
    csrfToken: csrfA,
    json: {
      name: "Ana Realtime",
      email: "ana.realtime@cliente.test",
      username: "anarealtime",
      password: USER_PASSWORD,
      confirmPassword: USER_PASSWORD,
      phone: "0999000111",
    },
  });
  assert.equal(registerResponse.statusCode, 200);
  assert.equal(registerResponse.jsonBody?.ok, true);

  const loginDeviceB = await callApi(userAuthHandler, {
    method: "POST",
    query: { action: "login" },
    cookieJar: deviceB,
    csrfToken: csrfB,
    json: {
      identifier: "ana.realtime@cliente.test",
      password: USER_PASSWORD,
    },
  });
  assert.equal(loginDeviceB.statusCode, 200);
  assert.equal(loginDeviceB.jsonBody?.ok, true);

  const baselineStatus = await callApi(userAuthHandler, {
    method: "GET",
    query: { action: "status" },
    cookieJar: deviceA,
  });
  assert.equal(baselineStatus.statusCode, 200);
  const baselineStateVersion = Number(baselineStatus.jsonBody?.user?.stateVersion || 0);

  const syncA = await callApi(userAuthHandler, {
    method: "POST",
    query: { action: "sync-state" },
    cookieJar: deviceA,
    csrfToken: csrfA,
    json: {
      baseStateVersion: baselineStateVersion,
      cart: [
        { key: "line-a-1", id: "prod-rt-1", color: "Negro", size: "M", quantity: 2 },
      ],
      favorites: ["prod-rt-1"],
    },
  });
  assert.equal(syncA.statusCode, 200);
  assert.equal(syncA.jsonBody?.ok, true);
  assert.equal(syncA.jsonBody?.user?.cart?.length, 1);

  const statusDeviceB = await callApi(userAuthHandler, {
    method: "GET",
    query: { action: "status" },
    cookieJar: deviceB,
  });
  assert.equal(statusDeviceB.statusCode, 200);
  assert.equal(statusDeviceB.jsonBody?.authenticated, true);
  assert.equal(Array.isArray(statusDeviceB.jsonBody?.user?.cart), true);
  assert.equal(statusDeviceB.jsonBody.user.cart.length, 1);
  assert.equal(statusDeviceB.jsonBody.user.favorites?.includes("prod-rt-1"), true);

  const staleBaseVersion = baselineStateVersion;
  const syncBWithStaleBase = await callApi(userAuthHandler, {
    method: "POST",
    query: { action: "sync-state" },
    cookieJar: deviceB,
    csrfToken: csrfB,
    json: {
      baseStateVersion: staleBaseVersion,
      cart: [
        { key: "line-b-1", id: "prod-rt-1", color: "Negro", size: "L", quantity: 1 },
      ],
      favorites: ["prod-rt-1", "prod-rt-extra"],
    },
  });
  assert.equal(syncBWithStaleBase.statusCode, 200);
  assert.equal(syncBWithStaleBase.jsonBody?.ok, true);
  const mergedCartKeys = new Set((syncBWithStaleBase.jsonBody?.user?.cart || []).map((entry) => String(entry.key)));
  assert.equal(mergedCartKeys.has("line-a-1"), true, "Stale sync must preserve existing cart line");
  assert.equal(mergedCartKeys.has("line-b-1"), true, "Stale sync must merge incoming cart line");
  assert.equal(syncBWithStaleBase.jsonBody?.user?.favorites?.includes("prod-rt-extra"), true);

  const realtimeSnapshot = await callApi(realtimeSyncHandler, {
    method: "GET",
    query: { action: "status" },
    cookieJar: deviceA,
  });
  assert.equal(realtimeSnapshot.statusCode, 200);
  assert.equal(realtimeSnapshot.jsonBody?.ok, true);
  assert.ok(Number(realtimeSnapshot.jsonBody?.versions?.userState || 0) >= 1);
  assert.ok(Number(realtimeSnapshot.jsonBody?.currentUser?.stateVersion || 0) >= 2);

  const adminLoginResponse = await callApi(adminSessionHandler, {
    method: "POST",
    query: { action: "login" },
    cookieJar: adminCookies,
    csrfToken: csrfAdmin,
    json: {
      identifier: ADMIN_IDENTIFIER,
      password: ADMIN_PASSWORD,
    },
  });
  assert.equal(adminLoginResponse.statusCode, 200);
  assert.equal(adminLoginResponse.jsonBody?.isAdmin, true);

  const versionsBeforeCatalog = await callApi(realtimeSyncHandler, {
    method: "GET",
    query: { action: "status" },
    cookieJar: adminCookies,
  });
  const catalogVersionBefore = Number(versionsBeforeCatalog.jsonBody?.versions?.catalog || 0);

  const adminCatalogSync = await callApi(catalogStateHandler, {
    method: "POST",
    query: { action: "sync" },
    cookieJar: adminCookies,
    csrfToken: csrfAdmin,
    json: {
      baseCatalogVersion: catalogVersionBefore,
      data: {
        products: [
          {
            id: "prod-rt-1",
            name: "Vestido Realtime",
            price: 61.99,
            colors: ["Negro"],
            sizes: ["M", "L"],
            imagesByColor: {
              Negro: ["https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=1200&q=80"],
            },
            variants: [
              { uid: "rt-var-1", color: "Negro", size: "M", stock: 10 },
              { uid: "rt-var-2", color: "Negro", size: "L", stock: 10 },
            ],
            stockBySize: { M: 10, L: 10 },
          },
        ],
        coupons: [],
        contactSettings: {
          address: "Centro Comercial Local 2",
          locationNote: "Frente al parque principal",
          whatsappNumber: "593999999999",
          whatsappLink: "",
          phone: "",
          email: "ventas@atelier.test",
          mapsLink: MAPS_TEST_URL,
          instagram: "https://instagram.com/atelierstudio",
          facebook: "https://facebook.com/atelierstudio",
          tiktok: "https://www.tiktok.com/@atelierstudio",
        },
        storeSettings: null,
        productTypeRecords: [],
        filterTagRecords: [],
      },
    },
  });
  assert.equal(adminCatalogSync.statusCode, 200);
  assert.equal(adminCatalogSync.jsonBody?.ok, true);

  const versionsAfterCatalog = await callApi(realtimeSyncHandler, {
    method: "GET",
    query: { action: "status" },
    cookieJar: adminCookies,
  });
  assert.ok(Number(versionsAfterCatalog.jsonBody?.versions?.catalog || 0) > catalogVersionBefore);

  const checkoutResponse = await callApi(checkoutOrderHandler, {
    method: "POST",
    cookieJar: deviceA,
    csrfToken: csrfA,
    json: {
      idempotencyKey: crypto.randomUUID(),
      couponCode: "",
      cart: [
        { id: "prod-rt-1", color: "Negro", size: "M", quantity: 1 },
      ],
    },
  });
  assert.equal(checkoutResponse.statusCode, 200);
  assert.equal(checkoutResponse.jsonBody?.ok, true);
  const orderId = String(checkoutResponse.jsonBody?.order?.id || "");
  assert.ok(orderId);

  const secondCheckoutResponse = await callApi(checkoutOrderHandler, {
    method: "POST",
    cookieJar: deviceB,
    csrfToken: csrfB,
    json: {
      idempotencyKey: crypto.randomUUID(),
      couponCode: "",
      cart: [
        { id: "prod-rt-1", color: "Negro", size: "L", quantity: 1 },
      ],
    },
  });
  assert.equal(secondCheckoutResponse.statusCode, 200);
  assert.equal(secondCheckoutResponse.jsonBody?.ok, true);
  const secondOrderId = String(secondCheckoutResponse.jsonBody?.order?.id || "");
  assert.ok(secondOrderId);
  assert.notEqual(secondOrderId, orderId, "Each checkout should create a distinct order id");

  const statusAfterCheckout = await callApi(userAuthHandler, {
    method: "GET",
    query: { action: "status" },
    cookieJar: deviceA,
  });
  assert.equal(statusAfterCheckout.statusCode, 200);
  assert.equal(Array.isArray(statusAfterCheckout.jsonBody?.user?.cart), true);
  assert.equal(statusAfterCheckout.jsonBody.user.cart.length, 0, "Checkout should clear persisted cart state");

  const versionsBeforeOrderUpdate = await callApi(realtimeSyncHandler, {
    method: "GET",
    query: { action: "status" },
    cookieJar: adminCookies,
  });
  const ordersVersionBefore = Number(versionsBeforeOrderUpdate.jsonBody?.versions?.orders || 0);

  const updateOrderResponse = await callApi(ordersHandler, {
    method: "POST",
    query: { action: "update" },
    cookieJar: adminCookies,
    csrfToken: csrfAdmin,
    json: {
      orderId,
      status: "Confirmado",
    },
  });
  assert.equal(updateOrderResponse.statusCode, 200);
  assert.equal(updateOrderResponse.jsonBody?.ok, true);

  const versionsAfterOrderUpdate = await callApi(realtimeSyncHandler, {
    method: "GET",
    query: { action: "status" },
    cookieJar: adminCookies,
  });
  assert.ok(Number(versionsAfterOrderUpdate.jsonBody?.versions?.orders || 0) > ordersVersionBefore);

  const cancelOrderResponse = await callApi(ordersHandler, {
    method: "POST",
    query: { action: "update" },
    cookieJar: adminCookies,
    csrfToken: csrfAdmin,
    json: {
      orderId,
      status: "Cancelado",
    },
  });
  assert.equal(cancelOrderResponse.statusCode, 200);
  assert.equal(cancelOrderResponse.jsonBody?.ok, true);

  const catalogAfterCancel = await callApi(catalogStateHandler, {
    method: "GET",
    query: { action: "get" },
    cookieJar: adminCookies,
  });
  assert.equal(catalogAfterCancel.statusCode, 200);
  assert.equal(catalogAfterCancel.jsonBody?.data?.products?.[0]?.variants?.[0]?.stock, 10);
  assert.equal(catalogAfterCancel.jsonBody?.data?.products?.[0]?.variants?.[1]?.stock, 9);

  const cancelAgainResponse = await callApi(ordersHandler, {
    method: "POST",
    query: { action: "update" },
    cookieJar: adminCookies,
    csrfToken: csrfAdmin,
    json: {
      orderId,
      status: "Cancelado",
    },
  });
  assert.equal(cancelAgainResponse.statusCode, 200);
  assert.equal(cancelAgainResponse.jsonBody?.ok, true);

  const reactivateOrderResponse = await callApi(ordersHandler, {
    method: "POST",
    query: { action: "update" },
    cookieJar: adminCookies,
    csrfToken: csrfAdmin,
    json: {
      orderId,
      status: "Confirmado",
    },
  });
  assert.equal(reactivateOrderResponse.statusCode, 200);
  assert.equal(reactivateOrderResponse.jsonBody?.ok, true);

  const catalogAfterReactivation = await callApi(catalogStateHandler, {
    method: "GET",
    query: { action: "get" },
    cookieJar: adminCookies,
  });
  assert.equal(catalogAfterReactivation.statusCode, 200);
  assert.equal(catalogAfterReactivation.jsonBody?.data?.products?.[0]?.variants?.[0]?.stock, 9);
  assert.equal(catalogAfterReactivation.jsonBody?.data?.products?.[0]?.variants?.[1]?.stock, 9);

  const adminOrdersAfterMultipleCheckouts = await callApi(ordersHandler, {
    method: "GET",
    query: { action: "list" },
    cookieJar: adminCookies,
  });
  assert.equal(adminOrdersAfterMultipleCheckouts.statusCode, 200);
  assert.ok(Array.isArray(adminOrdersAfterMultipleCheckouts.jsonBody?.orderHistory));
  assert.ok(adminOrdersAfterMultipleCheckouts.jsonBody.orderHistory.length >= 2, "Admin should see multiple sequential orders");

  const hideProductSync = await callApi(catalogStateHandler, {
    method: "POST",
    query: { action: "sync" },
    cookieJar: adminCookies,
    csrfToken: csrfAdmin,
    json: {
      baseCatalogVersion: Number(catalogAfterReactivation.jsonBody?.data?.catalogVersion || 0),
      data: {
        products: [
          {
            id: "prod-rt-1",
            name: "Vestido Realtime",
            isPublic: false,
            price: 61.99,
            colors: ["Negro"],
            sizes: ["M", "L"],
            imagesByColor: {
              Negro: ["https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=1200&q=80"],
            },
            variants: [
              { uid: "rt-var-1", color: "Negro", size: "M", stock: 9 },
              { uid: "rt-var-2", color: "Negro", size: "L", stock: 9 },
            ],
            stockBySize: { M: 9, L: 9 },
          },
        ],
        coupons: [],
        contactSettings: {
          address: "Centro Comercial Local 2",
          locationNote: "Frente al parque principal",
          whatsappNumber: "593999999999",
          whatsappLink: "",
          phone: "",
          email: "ventas@atelier.test",
          mapsLink: MAPS_TEST_URL,
          instagram: "https://instagram.com/atelierstudio",
          facebook: "https://facebook.com/atelierstudio",
          tiktok: "https://www.tiktok.com/@atelierstudio",
        },
        storeSettings: null,
        productTypeRecords: [],
        filterTagRecords: [],
      },
    },
  });
  assert.equal(hideProductSync.statusCode, 200);
  assert.equal(hideProductSync.jsonBody?.ok, true);
  assert.equal(hideProductSync.jsonBody?.data?.products?.[0]?.isPublic, false);

  const catalogAfterHide = await callApi(catalogStateHandler, {
    method: "GET",
    query: { action: "get" },
    cookieJar: adminCookies,
  });
  assert.equal(catalogAfterHide.statusCode, 200);
  assert.equal(catalogAfterHide.jsonBody?.ok, true);
  assert.equal(catalogAfterHide.jsonBody?.data?.products?.[0]?.isPublic, false, "Hidden visibility must persist after a fresh read");
});

after(async () => {
  process.chdir(originalCwd);
  await fs.rm(sandboxCwd, { recursive: true, force: true });
});
