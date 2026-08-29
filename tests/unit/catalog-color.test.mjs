import test from "node:test";
import assert from "node:assert/strict";
import { getFallbackSelection, getSelectionForColor } from "../../src/domain/products/variants.js";
import { getProductColorSwatch, normalizeProductColorHex } from "../../src/utils/productColor.js";
import { sanitizeProducts } from "../../api/_lib/storeSanitizers.js";

const product = {
  colors: ["Negro", "Rojo"],
  catalogColor: "Rojo",
  sizes: ["S", "M"],
  variants: [
    { color: "Negro", size: "S", stock: 3 },
    { color: "Rojo", size: "M", stock: 2 },
  ],
  imagesByColor: { Negro: ["black.jpg"], Rojo: ["red.jpg"] },
};

test("catalog color is the default color for catalog selections", () => {
  assert.equal(getSelectionForColor(product).color, "Rojo");
  assert.equal(getFallbackSelection(product).color, "Rojo");
});

test("invalid catalog color keeps backwards-compatible first-color behavior", () => {
  const legacyProduct = { ...product, catalogColor: "No existe" };
  assert.equal(getSelectionForColor(legacyProduct).color, "Negro");
});

test("custom swatch tone takes priority over a color name", () => {
  assert.equal(getProductColorSwatch("Verde oliva", "#527a43"), "#527a43");
  assert.equal(normalizeProductColorHex("#A3CDEF"), "#a3cdef");
  assert.equal(normalizeProductColorHex("verde"), "");
});

test("catalog color tones survive server sanitization", () => {
  const [savedProduct] = sanitizeProducts([{
    id: "dress-1",
    name: "Vestido",
    price: 40,
    colors: ["Verde oliva"],
    sizes: ["M"],
    variants: [{ color: "Verde oliva", size: "M", stock: 2 }],
    imagesByColor: { "Verde oliva": ["https://example.com/dress.jpg"] },
    colorSwatches: { "Verde oliva": "#527A43" },
  }]);
  assert.equal(savedProduct.colorSwatches["Verde oliva"], "#527a43");
});
