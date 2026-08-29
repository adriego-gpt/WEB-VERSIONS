import test from "node:test";
import assert from "node:assert/strict";
import {
  createProductDraftPayload,
  getProductFormSignature,
  parseProductDraftPayload,
} from "../../src/domain/admin/productDraft.js";

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
