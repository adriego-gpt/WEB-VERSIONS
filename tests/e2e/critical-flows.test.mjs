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
const USER_PASSWORD = "User12345";
const USER_PASSWORD_RESET = "User98765";
const USER_PASSWORD_RESET_BY_ADMIN = "User65432";
const MAPS_TEST_URL = "https://maps.app.goo.gl/gc5qGjhA4xoQyzr68";
const HUGE_INLINE_IMAGE = `data:image/jpeg;base64,${"A".repeat(800000)}`;

const sandboxCwd = await fs.mkdtemp(path.join(os.tmpdir(), "atelier-e2e-"));
const originalCwd = process.cwd();
process.chdir(sandboxCwd);

process.env.NODE_ENV = "test";
process.env.SECURITY_LOG_ENABLED = "false";
process.env.USER_ALLOWED_ORIGIN = APP_ORIGIN;
process.env.ADMIN_ALLOWED_ORIGIN = APP_ORIGIN;
process.env.USER_SESSION_SECRET = "user-secret-for-e2e";
process.env.ADMIN_SESSION_SECRET = "admin-secret-for-e2e";
process.env.ADMIN_EMAIL = ADMIN_IDENTIFIER;
process.env.ADMIN_USERNAME = ADMIN_IDENTIFIER;
process.env.ADMIN_PASSWORD_ALGORITHM = "scrypt";

const adminSalt = crypto.randomBytes(16).toString("base64url");
process.env.ADMIN_PASSWORD_SALT = adminSalt;
process.env.ADMIN_PASSWORD_HASH = crypto.scryptSync(ADMIN_PASSWORD, adminSalt, 64).toString("hex");

const importFromProject = (relativePath) => import(pathToFileURL(path.join(PROJECT_ROOT, relativePath)).href);

const [{ updateStore }, { default: csrfTokenHandler }, { default: userAuthHandler }, { default: adminSessionHandler }, { default: catalogStateHandler }, { default: checkoutOrderHandler }, { default: ordersHandler }, { default: couponPreviewHandler }, { default: securityMetricsHandler }, { default: adminUsersHandler }] = await Promise.all([
  importFromProject("api/_lib/store.js"),
  importFromProject("api/csrf-token.js"),
  importFromProject("api/user-auth.js"),
  importFromProject("api/admin-session.js"),
  importFromProject("api/catalog-state.js"),
  importFromProject("api/checkout-order.js"),
  importFromProject("api/orders.js"),
  importFromProject("api/coupon-preview.js"),
  importFromProject("api/security-metrics.js"),
  importFromProject("api/admin-users.js"),
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

async function seedCatalogBaseData() {
  await updateStore((draft) => {
    draft.products = [
      {
        id: "prod-1",
        name: "Vestido Alba",
        price: 59.99,
        colors: ["Negro"],
        sizes: ["M"],
        imagesByColor: {
          Negro: ["https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=1200&q=80"],
        },
        variants: [
          {
            uid: "var-1",
            color: "Negro",
            size: "M",
            stock: 8,
          },
        ],
        stockBySize: {
          M: 8,
        },
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

test("critical user/admin flows and security monitoring", async () => {
  await seedCatalogBaseData();

  const userCookies = {};
  const userCsrf = await getCsrfToken(userCookies);

  const registerResponse = await callApi(userAuthHandler, {
    method: "POST",
    query: { action: "register" },
    cookieJar: userCookies,
    csrfToken: userCsrf,
    json: {
      name: "Ana",
      email: "ana@cliente.test",
      username: "ana",
      password: USER_PASSWORD,
      phone: "0999000111",
    },
  });
  assert.equal(registerResponse.statusCode, 200);
  assert.equal(registerResponse.jsonBody?.ok, true);

  const duplicateUsernameRegisterResponse = await callApi(userAuthHandler, {
    method: "POST",
    query: { action: "register" },
    cookieJar: userCookies,
    csrfToken: userCsrf,
    json: {
      name: "Ana Segunda",
      email: "ana.segunda@cliente.test",
      username: "ana",
      password: USER_PASSWORD,
      confirmPassword: USER_PASSWORD,
      phone: "0999000222",
    },
  });
  assert.equal(duplicateUsernameRegisterResponse.statusCode, 409);
  assert.equal(duplicateUsernameRegisterResponse.jsonBody?.ok, false);

  const userStatusAfterRegister = await callApi(userAuthHandler, {
    method: "GET",
    query: { action: "status" },
    cookieJar: userCookies,
  });
  assert.equal(userStatusAfterRegister.statusCode, 200);
  assert.equal(userStatusAfterRegister.jsonBody?.authenticated, true);

  const logoutResponse = await callApi(userAuthHandler, {
    method: "POST",
    query: { action: "logout" },
    cookieJar: userCookies,
    csrfToken: userCsrf,
    json: {},
  });
  assert.equal(logoutResponse.statusCode, 200);
  assert.equal(logoutResponse.jsonBody?.authenticated, false);

  const loginResponse = await callApi(userAuthHandler, {
    method: "POST",
    query: { action: "login" },
    cookieJar: userCookies,
    csrfToken: userCsrf,
    json: {
      identifier: "ana@cliente.test",
      password: USER_PASSWORD,
    },
  });
  assert.equal(loginResponse.statusCode, 200);
  assert.equal(loginResponse.jsonBody?.ok, true);

  const resetRequestResponse = await callApi(userAuthHandler, {
    method: "POST",
    query: { action: "request-password-reset" },
    cookieJar: userCookies,
    csrfToken: userCsrf,
    json: {
      email: "ana@cliente.test",
    },
  });
  assert.equal(resetRequestResponse.statusCode, 200);
  assert.equal(resetRequestResponse.jsonBody?.ok, true);
  assert.ok(resetRequestResponse.jsonBody?.resetToken, "Password reset token should be available in test mode");

  const resetConfirmResponse = await callApi(userAuthHandler, {
    method: "POST",
    query: { action: "confirm-password-reset" },
    cookieJar: userCookies,
    csrfToken: userCsrf,
    json: {
      email: "ana@cliente.test",
      token: resetRequestResponse.jsonBody.resetToken,
      newPassword: USER_PASSWORD_RESET,
      confirmPassword: USER_PASSWORD_RESET,
    },
  });
  assert.equal(resetConfirmResponse.statusCode, 200);
  assert.equal(resetConfirmResponse.jsonBody?.ok, true);

  const logoutAfterResetResponse = await callApi(userAuthHandler, {
    method: "POST",
    query: { action: "logout" },
    cookieJar: userCookies,
    csrfToken: userCsrf,
    json: {},
  });
  assert.equal(logoutAfterResetResponse.statusCode, 200);

  const loginWithOldPasswordResponse = await callApi(userAuthHandler, {
    method: "POST",
    query: { action: "login" },
    cookieJar: userCookies,
    csrfToken: userCsrf,
    json: {
      identifier: "ana@cliente.test",
      password: USER_PASSWORD,
    },
  });
  assert.equal(loginWithOldPasswordResponse.statusCode, 401);

  const loginWithResetPasswordResponse = await callApi(userAuthHandler, {
    method: "POST",
    query: { action: "login" },
    cookieJar: userCookies,
    csrfToken: userCsrf,
    json: {
      identifier: "ana@cliente.test",
      password: USER_PASSWORD_RESET,
    },
  });
  assert.equal(loginWithResetPasswordResponse.statusCode, 200);
  assert.equal(loginWithResetPasswordResponse.jsonBody?.ok, true);

  const checkoutResponse = await callApi(checkoutOrderHandler, {
    method: "POST",
    cookieJar: userCookies,
    csrfToken: userCsrf,
    json: {
      couponCode: "",
      cart: [
        {
          id: "prod-1",
          color: "Negro",
          size: "M",
          quantity: 1,
        },
      ],
    },
  });
  assert.equal(checkoutResponse.statusCode, 200);
  assert.equal(checkoutResponse.jsonBody?.ok, true);
  assert.ok(checkoutResponse.jsonBody?.order?.id, "Checkout should return the created order");
  const pickupOrderId = String(checkoutResponse.jsonBody?.order?.id || "");

  const invalidDeliveryCheckoutResponse = await callApi(checkoutOrderHandler, {
    method: "POST",
    cookieJar: userCookies,
    csrfToken: userCsrf,
    json: {
      couponCode: "",
      cart: [
        {
          id: "prod-1",
          color: "Negro",
          size: "M",
          quantity: 1,
        },
      ],
      delivery: {
        type: "delivery",
        fullName: "Ana Cliente",
        idNumber: "",
        city: "Quito",
        address: "",
        reference: "",
        phone: "0999000111",
      },
    },
  });
  assert.equal(invalidDeliveryCheckoutResponse.statusCode, 400);
  assert.match(
    String(invalidDeliveryCheckoutResponse.jsonBody?.message || ""),
    /Completa nombre, cedula, ciudad, direccion, referencia y telefono/i,
    "Delivery checkout should require all delivery fields",
  );

  const userOrdersResponse = await callApi(ordersHandler, {
    method: "GET",
    query: { action: "list" },
    cookieJar: userCookies,
  });
  assert.equal(userOrdersResponse.statusCode, 200);
  assert.ok(Array.isArray(userOrdersResponse.jsonBody?.orderHistory));
  assert.ok(userOrdersResponse.jsonBody.orderHistory.length >= 1, "User order history should include checkout order");

  await updateStore((draft) => {
    draft.products = [
      {
        id: "prod-dup",
        name: "Camisa Duplicada",
        price: 39.99,
        colors: ["Negro"],
        sizes: ["M"],
        imagesByColor: {
          Negro: ["https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=1200&q=80"],
        },
        variants: [
          {
            uid: "var-dup-1",
            color: "Negro",
            size: "M",
            stock: 1,
          },
        ],
        stockBySize: {
          M: 1,
        },
      },
    ];
    return draft;
  });

  const duplicatedVariantCart = [
    { id: "prod-dup", color: "Negro", size: "M", quantity: 1, key: "dup-line-1" },
    { id: "prod-dup", color: "Negro", size: "M", quantity: 1, key: "dup-line-2" },
  ];

  const duplicatedVariantPreviewResponse = await callApi(couponPreviewHandler, {
    method: "POST",
    cookieJar: userCookies,
    csrfToken: userCsrf,
    json: {
      couponCode: "",
      cart: duplicatedVariantCart,
    },
  });
  assert.equal(duplicatedVariantPreviewResponse.statusCode, 400);
  assert.match(
    String(duplicatedVariantPreviewResponse.jsonBody?.message || ""),
    /Stock insuficiente/i,
    "Coupon preview should reject duplicated variant lines when total quantity exceeds stock",
  );

  const duplicatedVariantCheckoutResponse = await callApi(checkoutOrderHandler, {
    method: "POST",
    cookieJar: userCookies,
    csrfToken: userCsrf,
    json: {
      couponCode: "",
      cart: duplicatedVariantCart,
    },
  });
  assert.equal(duplicatedVariantCheckoutResponse.statusCode, 400);
  assert.match(
    String(duplicatedVariantCheckoutResponse.jsonBody?.message || ""),
    /Stock insuficiente/i,
    "Checkout should reject duplicated variant lines when total quantity exceeds stock",
  );

  await updateStore((draft) => {
    draft.products = [
      {
        id: "prod-hidden",
        name: "Producto Oculto",
        isPublic: false,
        price: 29.99,
        colors: ["Negro"],
        sizes: ["M"],
        imagesByColor: {
          Negro: ["https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=1200&q=80"],
        },
        variants: [
          {
            uid: "var-hidden-1",
            color: "Negro",
            size: "M",
            stock: 4,
          },
        ],
        stockBySize: {
          M: 4,
        },
      },
    ];
    return draft;
  });

  const hiddenProductPreviewResponse = await callApi(couponPreviewHandler, {
    method: "POST",
    cookieJar: userCookies,
    csrfToken: userCsrf,
    json: {
      couponCode: "",
      cart: [
        {
          id: "prod-hidden",
          color: "Negro",
          size: "M",
          quantity: 1,
        },
      ],
    },
  });
  assert.equal(hiddenProductPreviewResponse.statusCode, 400);
  assert.match(
    String(hiddenProductPreviewResponse.jsonBody?.message || ""),
    /ya no esta disponible para compra/i,
    "Coupon preview should reject hidden products",
  );

  const hiddenProductCheckoutResponse = await callApi(checkoutOrderHandler, {
    method: "POST",
    cookieJar: userCookies,
    csrfToken: userCsrf,
    json: {
      couponCode: "",
      cart: [
        {
          id: "prod-hidden",
          color: "Negro",
          size: "M",
          quantity: 1,
        },
      ],
    },
  });
  assert.equal(hiddenProductCheckoutResponse.statusCode, 400);
  assert.match(
    String(hiddenProductCheckoutResponse.jsonBody?.message || ""),
    /ya no esta disponible para compra/i,
    "Checkout should reject hidden products",
  );

  await updateStore((draft) => {
    draft.products = [
      {
        id: "prod-1",
        name: "Vestido Alba",
        price: 59.99,
        colors: ["Negro"],
        sizes: ["M"],
        imagesByColor: {
          Negro: ["https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=1200&q=80"],
        },
        variants: [
          {
            uid: "var-1",
            color: "Negro",
            size: "M",
            stock: 7,
          },
        ],
        stockBySize: {
          M: 7,
        },
      },
    ];
    return draft;
  });

  const adminCookies = {};
  const adminCsrf = await getCsrfToken(adminCookies);

  const adminLoginResponse = await callApi(adminSessionHandler, {
    method: "POST",
    query: { action: "login" },
    cookieJar: adminCookies,
    csrfToken: adminCsrf,
    json: {
      identifier: ADMIN_IDENTIFIER,
      password: ADMIN_PASSWORD,
    },
  });
  assert.equal(adminLoginResponse.statusCode, 200);
  assert.equal(adminLoginResponse.jsonBody?.isAdmin, true);

  const catalogBeforeCancel = await callApi(catalogStateHandler, {
    method: "GET",
    query: { action: "get" },
    cookieJar: adminCookies,
  });
  assert.equal(catalogBeforeCancel.statusCode, 200);
  assert.equal(catalogBeforeCancel.jsonBody?.data?.products?.[0]?.variants?.[0]?.stock, 7);

  const cancelOrderResponse = await callApi(ordersHandler, {
    method: "POST",
    query: { action: "update" },
    cookieJar: adminCookies,
    csrfToken: adminCsrf,
    json: {
      orderId: pickupOrderId,
      status: "Cancelado",
    },
  });
  assert.equal(cancelOrderResponse.statusCode, 200);
  assert.equal(cancelOrderResponse.jsonBody?.ok, true);
  const cancelledRecord = (cancelOrderResponse.jsonBody?.orderHistory || []).find((order) => String(order.id) === pickupOrderId);
  assert.equal(cancelledRecord?.status, "Cancelado");
  assert.equal(cancelledRecord?.stockReservation?.state, "released");

  const catalogAfterCancel = await callApi(catalogStateHandler, {
    method: "GET",
    query: { action: "get" },
    cookieJar: adminCookies,
  });
  assert.equal(catalogAfterCancel.statusCode, 200);
  assert.equal(catalogAfterCancel.jsonBody?.data?.products?.[0]?.variants?.[0]?.stock, 8);

  const cancelOrderSecondAttemptResponse = await callApi(ordersHandler, {
    method: "POST",
    query: { action: "update" },
    cookieJar: adminCookies,
    csrfToken: adminCsrf,
    json: {
      orderId: pickupOrderId,
      status: "Cancelado",
    },
  });
  assert.equal(cancelOrderSecondAttemptResponse.statusCode, 200);
  assert.equal(cancelOrderSecondAttemptResponse.jsonBody?.ok, true);

  const catalogAfterSecondCancel = await callApi(catalogStateHandler, {
    method: "GET",
    query: { action: "get" },
    cookieJar: adminCookies,
  });
  assert.equal(catalogAfterSecondCancel.statusCode, 200);
  assert.equal(catalogAfterSecondCancel.jsonBody?.data?.products?.[0]?.variants?.[0]?.stock, 8);

  await updateStore((draft) => {
    const nextProducts = Array.isArray(draft.products) ? draft.products : [];
    const prodIndex = nextProducts.findIndex((entry) => String(entry.id) === "prod-1");
    if (prodIndex < 0) return draft;
    const product = nextProducts[prodIndex];
    const variants = Array.isArray(product.variants) ? product.variants : [];
    if (!variants.length) return draft;
    const nextVariant = {
      ...variants[0],
      stock: 0,
    };
    nextProducts[prodIndex] = {
      ...product,
      variants: [nextVariant],
      stockBySize: { M: 0 },
    };
    draft.products = nextProducts;
    return draft;
  });

  const reactivateWithoutStockResponse = await callApi(ordersHandler, {
    method: "POST",
    query: { action: "update" },
    cookieJar: adminCookies,
    csrfToken: adminCsrf,
    json: {
      orderId: pickupOrderId,
      status: "Confirmado",
    },
  });
  assert.equal(reactivateWithoutStockResponse.statusCode, 409);
  assert.equal(reactivateWithoutStockResponse.jsonBody?.ok, false);
  assert.match(
    String(reactivateWithoutStockResponse.jsonBody?.message || ""),
    /Stock insuficiente/i,
    "Reactivating a canceled order should fail when stock is unavailable",
  );

  await updateStore((draft) => {
    const nextProducts = Array.isArray(draft.products) ? draft.products : [];
    const prodIndex = nextProducts.findIndex((entry) => String(entry.id) === "prod-1");
    if (prodIndex < 0) return draft;
    const product = nextProducts[prodIndex];
    const variants = Array.isArray(product.variants) ? product.variants : [];
    if (!variants.length) return draft;
    const nextVariant = {
      ...variants[0],
      stock: 8,
    };
    nextProducts[prodIndex] = {
      ...product,
      variants: [nextVariant],
      stockBySize: { M: 8 },
    };
    draft.products = nextProducts;
    return draft;
  });

  const reactivateOrderResponse = await callApi(ordersHandler, {
    method: "POST",
    query: { action: "update" },
    cookieJar: adminCookies,
    csrfToken: adminCsrf,
    json: {
      orderId: pickupOrderId,
      status: "Confirmado",
    },
  });
  assert.equal(reactivateOrderResponse.statusCode, 200);
  assert.equal(reactivateOrderResponse.jsonBody?.ok, true);
  const reactivatedRecord = (reactivateOrderResponse.jsonBody?.orderHistory || []).find((order) => String(order.id) === pickupOrderId);
  assert.equal(reactivatedRecord?.status, "Confirmado");
  assert.equal(reactivatedRecord?.stockReservation?.state, "reserved");

  const catalogAfterReactivation = await callApi(catalogStateHandler, {
    method: "GET",
    query: { action: "get" },
    cookieJar: adminCookies,
  });
  assert.equal(catalogAfterReactivation.statusCode, 200);
  assert.equal(catalogAfterReactivation.jsonBody?.data?.products?.[0]?.variants?.[0]?.stock, 7);

  const markPickupReadyResponse = await callApi(ordersHandler, {
    method: "POST",
    query: { action: "update" },
    cookieJar: adminCookies,
    csrfToken: adminCsrf,
    json: {
      orderId: pickupOrderId,
      status: "Listo para retiro",
    },
  });
  assert.equal(markPickupReadyResponse.statusCode, 200);
  assert.equal(markPickupReadyResponse.jsonBody?.ok, true);
  const pickupReadyRecord = (markPickupReadyResponse.jsonBody?.orderHistory || []).find((order) => String(order.id) === pickupOrderId);
  assert.equal(pickupReadyRecord?.status, "Listo para retiro");

  const userOrdersAfterPickupReady = await callApi(ordersHandler, {
    method: "GET",
    query: { action: "list" },
    cookieJar: userCookies,
  });
  assert.equal(userOrdersAfterPickupReady.statusCode, 200);
  const pickupReadyForUser = (userOrdersAfterPickupReady.jsonBody?.orderHistory || []).find((order) => String(order.id) === pickupOrderId);
  assert.equal(pickupReadyForUser?.status, "Listo para retiro");

  const adminSyncResponse = await callApi(catalogStateHandler, {
    method: "POST",
    query: { action: "sync" },
    cookieJar: adminCookies,
    csrfToken: adminCsrf,
    json: {
      data: {
        products: [
          {
            id: "prod-1",
            name: "Vestido Alba",
            isPublic: false,
            price: 59.99,
            colors: ["Negro"],
            sizes: ["M"],
            imagesByColor: {
              Negro: [HUGE_INLINE_IMAGE],
            },
            variants: [{ uid: "var-1", color: "Negro", size: "M", stock: 7 }],
            stockBySize: { M: 7 },
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
  assert.equal(adminSyncResponse.statusCode, 200);
  assert.equal(adminSyncResponse.jsonBody?.ok, true);
  const syncedImage = adminSyncResponse.jsonBody?.data?.products?.[0]?.imagesByColor?.Negro?.[0] || "";
  assert.equal(typeof syncedImage, "string");
  assert.equal(syncedImage.startsWith("data:image/"), false, "Oversized inline images should be sanitized");
  assert.ok(syncedImage.startsWith("https://"), "Sanitized image should fallback to a safe URL");
  assert.equal(adminSyncResponse.jsonBody?.data?.products?.[0]?.isPublic, false, "Catalog sync should persist isPublic visibility");

  const adminGetResponse = await callApi(catalogStateHandler, {
    method: "GET",
    query: { action: "get" },
    cookieJar: adminCookies,
  });
  assert.equal(adminGetResponse.statusCode, 200);
  assert.ok(Array.isArray(adminGetResponse.jsonBody?.data?.orderHistory));
  assert.ok(Array.isArray(adminGetResponse.jsonBody?.data?.coupons));
  assert.equal(adminGetResponse.jsonBody?.data?.contactSettings?.mapsLink, MAPS_TEST_URL);
  assert.equal(adminGetResponse.jsonBody?.data?.products?.[0]?.isPublic, false);

  const adminUsersListResponse = await callApi(adminUsersHandler, {
    method: "GET",
    query: { action: "list" },
    cookieJar: adminCookies,
  });
  assert.equal(adminUsersListResponse.statusCode, 200);
  assert.equal(adminUsersListResponse.jsonBody?.ok, true);
  assert.ok(Array.isArray(adminUsersListResponse.jsonBody?.users));
  assert.ok(adminUsersListResponse.jsonBody.users.length >= 1);
  const firstUser = adminUsersListResponse.jsonBody.users[0];
  assert.equal(Boolean(firstUser.passwordHash), false, "Admin users API should not expose password hashes");

  const adminUserUpdateResponse = await callApi(adminUsersHandler, {
    method: "POST",
    query: { action: "update" },
    cookieJar: adminCookies,
    csrfToken: adminCsrf,
    json: {
      userId: firstUser.id,
      name: "Ana Editada",
      lastName: "Cliente",
      email: "ana@cliente.test",
      username: "ana",
      phone: "0999000111",
      shippingAddress: "Direccion actualizada",
    },
  });
  assert.equal(adminUserUpdateResponse.statusCode, 200);
  assert.equal(adminUserUpdateResponse.jsonBody?.ok, true);
  assert.equal(adminUserUpdateResponse.jsonBody?.user?.name, "Ana Editada");

  const adminGenerateResetLinkResponse = await callApi(adminUsersHandler, {
    method: "POST",
    query: { action: "generate-reset-link" },
    cookieJar: adminCookies,
    csrfToken: adminCsrf,
    json: {
      userId: firstUser.id,
    },
  });
  assert.equal(adminGenerateResetLinkResponse.statusCode, 200);
  assert.equal(adminGenerateResetLinkResponse.jsonBody?.ok, true);
  assert.ok(adminGenerateResetLinkResponse.jsonBody?.resetLink, "Admin reset link generation should return a link");

  const generatedResetUrl = new URL(adminGenerateResetLinkResponse.jsonBody.resetLink);
  const generatedResetToken = generatedResetUrl.searchParams.get("resetToken");
  assert.ok(generatedResetToken, "Generated reset link must include resetToken");

  const adminSendResetLinkResponse = await callApi(adminUsersHandler, {
    method: "POST",
    query: { action: "send-reset-link" },
    cookieJar: adminCookies,
    csrfToken: adminCsrf,
    json: {
      userId: firstUser.id,
    },
  });
  assert.equal(adminSendResetLinkResponse.statusCode, 200);
  assert.equal(adminSendResetLinkResponse.jsonBody?.ok, true);
  assert.equal(typeof adminSendResetLinkResponse.jsonBody?.sent, "boolean");
  assert.equal(typeof adminSendResetLinkResponse.jsonBody?.skipped, "boolean");

  const latestResetLink = adminSendResetLinkResponse.jsonBody?.resetLink || adminGenerateResetLinkResponse.jsonBody?.resetLink;
  assert.ok(latestResetLink, "Admin reset flow should expose reset link in test mode");
  const latestResetToken = new URL(latestResetLink).searchParams.get("resetToken");
  assert.ok(latestResetToken, "Latest admin reset link must include resetToken");

  const adminResetConfirmResponse = await callApi(userAuthHandler, {
    method: "POST",
    query: { action: "confirm-password-reset" },
    cookieJar: userCookies,
    csrfToken: userCsrf,
    json: {
      email: firstUser.email,
      token: latestResetToken,
      newPassword: USER_PASSWORD_RESET_BY_ADMIN,
      confirmPassword: USER_PASSWORD_RESET_BY_ADMIN,
    },
  });
  assert.equal(adminResetConfirmResponse.statusCode, 200);
  assert.equal(adminResetConfirmResponse.jsonBody?.ok, true);

  const loginAfterAdminResetResponse = await callApi(userAuthHandler, {
    method: "POST",
    query: { action: "login" },
    cookieJar: userCookies,
    csrfToken: userCsrf,
    json: {
      identifier: firstUser.email,
      password: USER_PASSWORD_RESET_BY_ADMIN,
    },
  });
  assert.equal(loginAfterAdminResetResponse.statusCode, 200);
  assert.equal(loginAfterAdminResetResponse.jsonBody?.ok, true);

  const previewCookies = {};
  const previewCsrf = await getCsrfToken(previewCookies);
  let lastPreviewStatus = 0;
  for (let attempt = 0; attempt < 31; attempt += 1) {
    const previewResponse = await callApi(couponPreviewHandler, {
      method: "POST",
      cookieJar: previewCookies,
      csrfToken: previewCsrf,
      json: {
        couponCode: "",
        cart: [{ id: "prod-1", color: "Negro", size: "M", quantity: 1 }],
      },
    });
    lastPreviewStatus = previewResponse.statusCode;
  }
  assert.equal(lastPreviewStatus, 429, "Coupon preview endpoint should be rate-limited after repeated calls");

  const metricsSnapshotResponse = await callApi(securityMetricsHandler, {
    method: "GET",
    query: { action: "snapshot" },
    cookieJar: adminCookies,
  });
  assert.equal(metricsSnapshotResponse.statusCode, 200);
  assert.equal(metricsSnapshotResponse.jsonBody?.ok, true);
  assert.ok(metricsSnapshotResponse.jsonBody?.metrics?.endpoints?.["coupon-preview"], "Metrics should include coupon-preview endpoint");
  assert.ok(
    Number(metricsSnapshotResponse.jsonBody.metrics.endpoints["coupon-preview"].rateLimited || 0) >= 1,
    "Metrics should register at least one rate-limited coupon-preview request",
  );

  const metricsResetResponse = await callApi(securityMetricsHandler, {
    method: "POST",
    query: { action: "reset" },
    cookieJar: adminCookies,
    csrfToken: adminCsrf,
    json: {},
  });
  assert.equal(metricsResetResponse.statusCode, 200);
  assert.equal(metricsResetResponse.jsonBody?.ok, true);

  const metricsAfterResetResponse = await callApi(securityMetricsHandler, {
    method: "GET",
    query: { action: "snapshot" },
    cookieJar: adminCookies,
  });
  assert.equal(metricsAfterResetResponse.statusCode, 200);
  const endpointsAfterReset = metricsAfterResetResponse.jsonBody?.metrics?.endpoints || {};
  assert.equal(endpointsAfterReset["coupon-preview"], undefined);
  const endpointsWithoutSelf = Object.keys(endpointsAfterReset).filter((name) => name !== "security-metrics");
  assert.deepEqual(endpointsWithoutSelf, []);

  const adminLogoutResponse = await callApi(adminSessionHandler, {
    method: "POST",
    query: { action: "logout" },
    cookieJar: adminCookies,
    csrfToken: adminCsrf,
    json: {},
  });
  assert.equal(adminLogoutResponse.statusCode, 200);
  assert.equal(adminLogoutResponse.jsonBody?.isAdmin, false);
});

after(async () => {
  process.chdir(originalCwd);
  await fs.rm(sandboxCwd, { recursive: true, force: true });
});
