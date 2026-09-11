import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import {
  buildProductImagePathname,
  dataUrlToBlob,
  normalizeImageKitUrl,
  uploadPreparedCatalogImage,
} from "../../src/services/blobImageService.js";

test("ImageKit image service", async (t) => {
  await t.test("allows the direct ImageKit upload endpoint in the page CSP", async () => {
    const html = await fs.readFile(new URL("../../index.html", import.meta.url), "utf8");
    assert.match(html, /connect-src[^;]*https:\/\/upload\.imagekit\.io/);
    assert.doesNotMatch(html, /connect-src[^;]*public\.blob\.vercel-storage\.com/);
  });
  await t.test("converts an optimized data URL into a small image Blob", () => {
    const imageBlob = dataUrlToBlob("data:image/png;base64,iVBORw0KGgo=");
    assert.equal(imageBlob.type, "image/png");
    assert.equal(imageBlob.size, 8);
  });

  await t.test("generates private-to-admin catalog paths without using the original filename", () => {
    const pathname = buildProductImagePathname("image/webp");
    assert.match(pathname, /^catalog\/products\/\d{4}-\d{2}\/[a-f0-9-]{20,}\.webp$/i);
    assert.equal(pathname.includes("user-file"), false);
  });

  await t.test("accepts only HTTPS URLs belonging to the configured ImageKit endpoint", () => {
    const endpoint = "https://ik.imagekit.io/adriego";
    const safeUrl = `${endpoint}/catalog/products/photo.webp`;
    assert.equal(normalizeImageKitUrl(safeUrl, endpoint), safeUrl);
    assert.equal(normalizeImageKitUrl("https://ik.imagekit.io/another-store/photo.webp", endpoint), "");
    assert.equal(normalizeImageKitUrl("javascript:alert(1)", endpoint), "");
  });

  await t.test("authorizes and uploads the compressed image without exposing a private key", async () => {
    const imageBlob = new Blob([new Uint8Array([1, 2, 3])], { type: "image/webp" });
    let capturedAuth = null;
    let capturedUpload = null;
    const endpoint = "https://ik.imagekit.io/adriego";
    const expectedUrl = `${endpoint}/catalog/products/photo-random.webp`;
    const result = await uploadPreparedCatalogImage(imageBlob, {
      pathname: "catalog/products/2026-08/test-image-1234567890.webp",
      authorizeFn: async (payload) => {
        capturedAuth = payload;
        return {
          ok: true,
          type: "imagekit.upload-auth",
          publicKey: "public_key",
          token: "one-time-token",
          signature: "signed-token",
          expire: 2_000_000_000,
          urlEndpoint: endpoint,
        };
      },
      uploadFn: async (blob, options) => {
        capturedUpload = { blob, options };
        return { url: expectedUrl };
      },
    });

    assert.equal(result, expectedUrl);
    assert.equal(capturedAuth.contentType, "image/webp");
    assert.equal(capturedAuth.size, imageBlob.size);
    assert.equal(capturedAuth.fileName, "test-image-1234567890.webp");
    assert.equal(capturedUpload.blob, imageBlob);
    assert.equal(capturedUpload.options.token, "one-time-token");
    assert.equal(capturedUpload.options.privateKey, undefined);
  });

  await t.test("reports a failed upload without replacing any existing image", async () => {
    const imageBlob = new Blob([new Uint8Array([1])], { type: "image/jpeg" });
    await assert.rejects(
      uploadPreparedCatalogImage(imageBlob, {
        authorizeFn: async () => ({
          ok: true,
          publicKey: "public_key",
          token: "token",
          signature: "signature",
          expire: 2_000_000_000,
          urlEndpoint: "https://ik.imagekit.io/adriego",
        }),
        uploadFn: async () => {
          throw new Error("network down");
        },
      }),
      /imagen anterior no fue modificada/i,
    );
  });

  await t.test("reports a rejected authorization without attempting the external upload", async () => {
    const imageBlob = new Blob([new Uint8Array([1, 2])], { type: "image/jpeg" });
    let uploadCalled = false;
    await assert.rejects(uploadPreparedCatalogImage(imageBlob, {
      authorizeFn: async () => ({ ok: false, status: 503, message: "ImageKit no configurado" }),
      uploadFn: async () => {
        uploadCalled = true;
      },
    }), /ImageKit no configurado/i);
    assert.equal(uploadCalled, false);
  });
});
