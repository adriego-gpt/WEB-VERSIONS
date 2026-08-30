import assert from "node:assert/strict";
import test from "node:test";
import { signPayload } from "../../api/_lib/security.js";
import catalogImageUploadHandler, {
  MAX_PRODUCT_IMAGE_BYTES,
  getCatalogImageUploadPolicy,
} from "../../api/catalog-state.js";

const APP_ORIGIN = "http://localhost:5173";
const SESSION_SECRET = "blob-upload-session-secret";
const CSRF_TOKEN = "csrf-token-long-enough-for-blob-test";

function createResponse() {
  const headers = new Map();
  return {
    statusCode: 200,
    body: "",
    jsonBody: undefined,
    setHeader(name, value) {
      headers.set(String(name).toLowerCase(), value);
    },
    getHeader(name) {
      return headers.get(String(name).toLowerCase());
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.jsonBody = payload;
      this.end(JSON.stringify(payload));
    },
    end(payload = "") {
      this.body = String(payload || "");
    },
  };
}

function createRequest({ admin = false, csrf = true, pathname = "catalog/products/2026-08/12345678-1234-1234-1234-123456789abc.webp" } = {}) {
  const cookies = [`adriego_csrf_token=${encodeURIComponent(CSRF_TOKEN)}`];
  if (admin) {
    cookies.push(`adriego_admin_session=${encodeURIComponent(signPayload({
      sub: "admin@test.local",
      iat: Date.now(),
      exp: Date.now() + 60_000,
    }, SESSION_SECRET))}`);
  }
  return {
    method: "POST",
    url: "/api/catalog-state?action=image-upload",
    query: { action: "image-upload" },
    headers: {
      origin: APP_ORIGIN,
      host: "localhost:5173",
      cookie: cookies.join("; "),
      "content-type": "application/json",
      "x-requested-with": "XMLHttpRequest",
      ...(csrf ? { "x-csrf-token": CSRF_TOKEN } : {}),
    },
    body: JSON.stringify({
      type: "blob.generate-client-token",
      payload: { pathname, clientPayload: null, multipart: false },
    }),
    socket: { remoteAddress: "127.0.0.1" },
  };
}

async function callHandler(options) {
  const response = createResponse();
  await catalogImageUploadHandler(createRequest(options), response);
  return response;
}

test("Catalog image upload API", async (t) => {
  const previousEnv = {
    NODE_ENV: process.env.NODE_ENV,
    ADMIN_ALLOWED_ORIGIN: process.env.ADMIN_ALLOWED_ORIGIN,
    ADMIN_SESSION_SECRET: process.env.ADMIN_SESSION_SECRET,
    BLOB_READ_WRITE_TOKEN: process.env.BLOB_READ_WRITE_TOKEN,
  };
  process.env.NODE_ENV = "test";
  process.env.ADMIN_ALLOWED_ORIGIN = APP_ORIGIN;
  process.env.ADMIN_SESSION_SECRET = SESSION_SECRET;
  delete process.env.BLOB_READ_WRITE_TOKEN;

  t.after(() => {
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  await t.test("rejects token generation without CSRF", async () => {
    const response = await callHandler({ admin: true, csrf: false });
    assert.equal(response.statusCode, 403);
  });

  await t.test("rejects token generation without an admin session", async () => {
    const response = await callHandler({ admin: false });
    assert.equal(response.statusCode, 401);
  });

  await t.test("does not expose a client token when Blob is not configured", async () => {
    const response = await callHandler({ admin: true });
    assert.equal(response.statusCode, 503);
    assert.equal(response.jsonBody?.clientToken, undefined);
  });

  await t.test("restricts type, size, cache and path before issuing a token", () => {
    const policy = getCatalogImageUploadPolicy(
      "catalog/products/2026-08/12345678-1234-1234-1234-123456789abc.webp",
      false,
    );
    assert.deepEqual(policy.allowedContentTypes, ["image/jpeg", "image/png", "image/webp"]);
    assert.equal(policy.maximumSizeInBytes, MAX_PRODUCT_IMAGE_BYTES);
    assert.equal(policy.allowOverwrite, false);
    assert.equal(policy.addRandomSuffix, true);
    assert.equal(policy.cacheControlMaxAge, 31_536_000);
    assert.throws(() => getCatalogImageUploadPolicy("users/private-data.png", false), /no permitida/i);
    assert.throws(() => getCatalogImageUploadPolicy("catalog/products/2026-08/good-name.webp", true), /no permitida/i);
  });

  await t.test("issues a short-lived constrained token only to the authenticated admin", async () => {
    process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_teststore_super-secret-token";
    const response = await callHandler({ admin: true });
    assert.equal(response.statusCode, 200);
    assert.equal(response.jsonBody?.type, "blob.generate-client-token");
    assert.match(String(response.jsonBody?.clientToken || ""), /^vercel_blob_client_teststore_/);
  });
});
