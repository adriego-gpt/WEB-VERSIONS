import test from "node:test";
import assert from "node:assert/strict";
import {
  addSizeToColorDrafts,
  createProductDraftPayload,
  getProductFormSignature,
  parseProductDraftPayload,
  removeSizeFromColorDrafts,
} from "../../src/domain/admin/productDraft.js";

test("shared sizes fill empty rows and preserve existing stock without duplicates", () => {
  const colors = [
    { uid: "black", sizes: [{ uid: "empty", size: "", stock: "0" }] },
    { uid: "white", sizes: [{ uid: "medium", size: "m", stock: "7" }] },
  ];
  const withMedium = addSizeToColorDrafts(colors, "M", { createUid: () => "new-size", maxSizes: 8 });
  assert.deepEqual(withMedium[0].sizes, [{ uid: "empty", size: "M", stock: "0" }]);
  assert.strictEqual(withMedium[1], colors[1]);
  assert.equal(withMedium[1].sizes[0].stock, "7");
  assert.strictEqual(addSizeToColorDrafts(withMedium, "m", { createUid: () => "unused", maxSizes: 8 }), withMedium);
});

test("a matrix cell can add a missing size to only one color", () => {
  const colors = [
    { uid: "black", sizes: [{ uid: "small", size: "S", stock: "2" }] },
    { uid: "white", sizes: [{ uid: "small-white", size: "S", stock: "3" }] },
  ];
  const result = addSizeToColorDrafts(colors, "L", { colorUid: "white", createUid: () => "large-white", maxSizes: 8 });
  assert.strictEqual(result[0], colors[0]);
  assert.deepEqual(result[1].sizes[1], { uid: "large-white", size: "L", stock: "0" });
});

test("removing a matrix size keeps every color synchronized", () => {
  const colors = [
    { uid: "black", sizes: [{ uid: "small-black", size: "S", stock: "2" }, { uid: "large-black", size: "L", stock: "1" }] },
    { uid: "white", sizes: [{ uid: "small-white", size: "s", stock: "3" }] },
  ];
  const result = removeSizeFromColorDrafts(colors, "S", { createUid: () => "empty-white" });
  assert.deepEqual(result[0].sizes, [{ uid: "large-black", size: "L", stock: "1" }]);
  assert.deepEqual(result[1].sizes, [{ uid: "empty-white", size: "", stock: "0" }]);
  assert.strictEqual(removeSizeFromColorDrafts(result, "XL"), result);
});

const sampleForm = {
  id: null,
  name: "Vestido",
  price: "40",
  category: "Mujer",
  productType: "Vestidos",
  isPublic: false,
  colorsData: [{
    uid: "color-a",
    name: "Negro",
    images: ["image.jpg"],
    sizes: [{ uid: "size-a", size: "M", stock: "4" }],
  }],
};

test("product draft signature ignores generated row identifiers", () => {
  const alternateIds = {
    ...sampleForm,
    colorsData: [{
      ...sampleForm.colorsData[0],
      uid: "color-b",
      sizes: [{ ...sampleForm.colorsData[0].sizes[0], uid: "size-b" }],
    }],
  };
  assert.equal(getProductFormSignature(sampleForm), getProductFormSignature(alternateIds));
});

test("product draft signature includes the catalog color", () => {
  assert.notEqual(
    getProductFormSignature({ ...sampleForm, catalogColor: "Negro" }),
    getProductFormSignature({ ...sampleForm, catalogColor: "Beige" }),
  );
});

test("product draft parser restores a valid recent payload", () => {
  const savedAt = "2026-08-21T12:00:00.000Z";
  const payload = createProductDraftPayload(sampleForm, "baseline", savedAt);
  const restored = parseProductDraftPayload(JSON.stringify(payload), {
    now: new Date("2026-08-21T13:00:00.000Z").getTime(),
  });
  assert.equal(restored.form.name, "Vestido");
  assert.equal(restored.baselineSignature, "baseline");
});

test("product draft parser rejects expired or malformed content", () => {
  const payload = createProductDraftPayload(sampleForm, "baseline", "2026-07-01T12:00:00.000Z");
  assert.equal(parseProductDraftPayload(JSON.stringify(payload), {
    now: new Date("2026-08-21T12:00:00.000Z").getTime(),
  }), null);
  assert.equal(parseProductDraftPayload("not-json"), null);
});
