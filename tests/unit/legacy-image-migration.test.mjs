import assert from "node:assert/strict";
import test from "node:test";
import { isLegacyInlineCatalogImage, migrateLegacyCatalogImages } from "../../src/domain/admin/legacyImageMigration.js";

const inlineImage = "data:image/webp;base64,UklGRg==";

test("legacy catalog migration replaces only successfully uploaded inline catalog images", async () => {
  const result = await migrateLegacyCatalogImages([
    "https://ik.imagekit.io/adriegostore/catalog/existing.webp",
    inlineImage,
    "data:image/png;base64,AA==",
  ], {
    uploadOne: async (source) => {
      if (source.includes("png")) throw new Error("network");
      return "https://ik.imagekit.io/adriegostore/catalog/migrated.webp";
    },
  });

  assert.equal(result.total, 2);
  assert.equal(result.migrated, 1);
  assert.equal(result.failures.length, 1);
  assert.equal(result.images[0], "https://ik.imagekit.io/adriegostore/catalog/existing.webp");
  assert.equal(result.images[1], "https://ik.imagekit.io/adriegostore/catalog/migrated.webp");
  assert.equal(result.images[2], "data:image/png;base64,AA==");
});

test("legacy catalog migration recognizes only supported Base64 image types", () => {
  assert.equal(isLegacyInlineCatalogImage(inlineImage), true);
  assert.equal(isLegacyInlineCatalogImage("data:image/jpeg;base64,/9j/4AAQSkZJRg=="), true);
  assert.equal(isLegacyInlineCatalogImage("data:image/jpg;base64,/9j/4AAQSkZJRg=="), true);
  assert.equal(isLegacyInlineCatalogImage("data:image/gif;base64,R0lGODlh"), false);
  assert.equal(isLegacyInlineCatalogImage("data:image/svg+xml;base64,PHN2Zz4="), false);
  assert.equal(isLegacyInlineCatalogImage("https://example.com/photo.webp"), false);
});
