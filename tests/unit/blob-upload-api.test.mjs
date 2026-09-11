import assert from "node:assert/strict";
import test from "node:test";
import { createHmac } from "node:crypto";
import { signPayload } from "../../api/_lib/security.js";
import catalogImageUploadHandler, {
  collectCatalogImagePaths,
  deleteImageKitCatalogAssets,
  getCatalogImagePathFromUrl,
  MAX_PRODUCT_IMAGE_BYTES,
} from "../../api/catalog-state.js";

const APP_ORIGIN = "http://localhost:5173";
const SESSION_SECRET = "image-upload-session-secret";
const CSRF_TOKEN = "csrf-token-long-enough-for-imagekit-test";

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

function createRequest({ admin = false, csrf = true, size = 1024, contentType = "image/webp" } = {}) {
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
      type: "imagekit.generate-upload-auth",
      payload: { fileName: "catalog-photo.webp", contentType, size },
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
    IMAGEKIT_PUBLIC_KEY: process.env.IMAGEKIT_PUBLIC_KEY,
    IMAGEKIT_PRIVATE_KEY: process.env.IMAGEKIT_PRIVATE_KEY,
    IMAGEKIT_URL_ENDPOINT: process.env.IMAGEKIT_URL_ENDPOINT,
  };
  process.env.NODE_ENV = "test";
  process.env.ADMIN_ALLOWED_ORIGIN = APP_ORIGIN;
  process.env.ADMIN_SESSION_SECRET = SESSION_SECRET;
  delete process.env.IMAGEKIT_PUBLIC_KEY;
  delete process.env.IMAGEKIT_PRIVATE_KEY;
  delete process.env.IMAGEKIT_URL_ENDPOINT;

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

  await t.test("does not expose secrets when ImageKit is not configured", async () => {
    const response = await callHandler({ admin: true });
    assert.equal(response.statusCode, 503);
    assert.equal(response.jsonBody?.privateKey, undefined);
  });

  await t.test("rejects unsupported types and oversized images before signing", async () => {
    let response = await callHandler({ admin: true, contentType: "image/svg+xml" });
    assert.equal(response.statusCode, 400);
    response = await callHandler({ admin: true, size: MAX_PRODUCT_IMAGE_BYTES + 1 });
    assert.equal(response.statusCode, 400);
  });

  await t.test("issues short-lived ImageKit authentication only to the administrator", async () => {
    process.env.IMAGEKIT_PUBLIC_KEY = "public_test_key";
    process.env.IMAGEKIT_PRIVATE_KEY = "private_test_key";
    process.env.IMAGEKIT_URL_ENDPOINT = "https://ik.imagekit.io/adriego";
    const response = await callHandler({ admin: true });
    assert.equal(response.statusCode, 200);
    assert.equal(response.jsonBody?.type, "imagekit.upload-auth");
    assert.equal(response.jsonBody?.publicKey, "public_test_key");
    assert.equal(response.jsonBody?.urlEndpoint, "https://ik.imagekit.io/adriego");
    assert.match(response.jsonBody?.token || "", /^[a-f0-9-]{20,}$/i);
    assert.ok(Number(response.jsonBody?.expire) > Math.floor(Date.now() / 1000));
    const expectedSignature = createHmac("sha1", "private_test_key")
      .update(`${response.jsonBody.token}${response.jsonBody.expire}`)
      .digest("hex");
    assert.equal(response.jsonBody?.signature, expectedSignature);
    assert.equal(response.jsonBody?.privateKey, undefined);
  });
});

test("ImageKit catalog cleanup", async (t) => {
  const endpoint = "https://ik.imagekit.io/adriego";
  const imageUrl = `${endpoint}/catalog/products/2026-09/4ba7cd1c-8b6c-4b70-8a51-ea241a1d14bd.webp`;

  await t.test("only marks configured catalog product paths for cleanup", () => {
    assert.equal(
      getCatalogImagePathFromUrl(imageUrl, endpoint),
      "/catalog/products/2026-09/4ba7cd1c-8b6c-4b70-8a51-ea241a1d14bd.webp",
    );
    assert.equal(getCatalogImagePathFromUrl("https://ik.imagekit.io/other/catalog/products/a.webp", endpoint), "");
    assert.equal(getCatalogImagePathFromUrl(`${endpoint}/catalog/other/a.webp`, endpoint), "");
  });

  await t.test("keeps an image that is still used outside the removed product", () => {
    const paths = collectCatalogImagePaths({
      products: [{ imagesByColor: { Negro: [imageUrl] } }],
      storeSettings: { heroSlides: [{ image: imageUrl }] },
    }, endpoint);
    assert.deepEqual([...paths], ["/catalog/products/2026-09/4ba7cd1c-8b6c-4b70-8a51-ea241a1d14bd.webp"]);
  });

  await t.test("looks up the exact file and deletes it with the private key", async () => {
    const requests = [];
    const mockFetch = async (url, options = {}) => {
      requests.push({ url: String(url), options });
      if (String(url).includes("?")) {
        return { ok: true, json: async () => [{
          name: "4ba7cd1c-8b6c-4b70-8a51-ea241a1d14bd.webp",
          path: "/catalog/products/2026-09",
          fileId: "imagekit-file-id",
        }] };
      }
      return { ok: true, status: 204 };
    };
    const result = await deleteImageKitCatalogAssets([
      "/catalog/products/2026-09/4ba7cd1c-8b6c-4b70-8a51-ea241a1d14bd.webp",
    ], "private-key", mockFetch);
    assert.equal(result.deletedPaths.length, 1);
    assert.equal(result.retryPaths.length, 0);
    assert.equal(requests.length, 2);
    assert.match(requests[0].options.headers.Authorization, /^Basic /);
    assert.equal(requests[1].options.method, "DELETE");
  });

  await t.test("retains a path for retry when ImageKit is unavailable", async () => {
    const result = await deleteImageKitCatalogAssets([
      "/catalog/products/2026-09/4ba7cd1c-8b6c-4b70-8a51-ea241a1d14bd.webp",
    ], "private-key", async () => ({ ok: false, status: 503 }));
    assert.equal(result.deletedPaths.length, 0);
    assert.equal(result.retryPaths.length, 1);
  });
});
