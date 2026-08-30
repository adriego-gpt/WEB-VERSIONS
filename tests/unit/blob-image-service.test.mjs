import assert from "node:assert/strict";
import test from "node:test";
import {
  buildProductImagePathname,
  dataUrlToBlob,
  normalizePublicBlobUrl,
  uploadPreparedCatalogImage,
} from "../../src/services/blobImageService.js";

test("Blob image service", async (t) => {
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

  await t.test("accepts only HTTPS URLs from a public Vercel Blob store", () => {
    const safeUrl = "https://store-id.public.blob.vercel-storage.com/catalog/products/photo.webp";
    assert.equal(normalizePublicBlobUrl(safeUrl), safeUrl);
    assert.equal(normalizePublicBlobUrl("https://example.com/photo.webp"), "");
    assert.equal(normalizePublicBlobUrl("javascript:alert(1)"), "");
  });

  await t.test("uploads the compressed Blob with CSRF headers and returns only the safe URL", async () => {
    const imageBlob = new Blob([new Uint8Array([1, 2, 3])], { type: "image/webp" });
    let captured = null;
    const expectedUrl = "https://store-id.public.blob.vercel-storage.com/catalog/products/photo-random.webp";
    const result = await uploadPreparedCatalogImage(imageBlob, {
      csrfToken: "csrf-token-for-test",
      pathname: "catalog/products/2026-08/test-image-1234567890.webp",
      uploadFn: async (...args) => {
        captured = args;
        return { url: expectedUrl };
      },
    });

    assert.equal(result, expectedUrl);
    assert.equal(captured[0], "catalog/products/2026-08/test-image-1234567890.webp");
    assert.equal(captured[1], imageBlob);
    assert.equal(captured[2].access, "public");
    assert.equal(captured[2].handleUploadUrl, "/api/catalog-image-upload");
    assert.equal(captured[2].headers["X-CSRF-Token"], "csrf-token-for-test");
    assert.equal(captured[2].headers["X-Requested-With"], "XMLHttpRequest");
  });

  await t.test("reports a failed upload without replacing any existing image", async () => {
    const imageBlob = new Blob([new Uint8Array([1])], { type: "image/jpeg" });
    await assert.rejects(
      uploadPreparedCatalogImage(imageBlob, {
        csrfToken: "csrf-token-for-test",
        uploadFn: async () => {
          throw new Error("network down");
        },
      }),
      /imagen anterior no fue modificada/i,
    );
  });
});
