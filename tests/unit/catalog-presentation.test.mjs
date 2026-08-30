import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  getProductBadgeKinds,
  syncProductSelections,
} from "../../src/domain/products/catalogPresentation.js";

const product = {
  id: "dress-1",
  colors: ["Negro", "Rojo"],
  catalogColor: "Rojo",
  sizes: ["S", "M"],
  variants: [
    { color: "Negro", size: "S", stock: 3 },
    { color: "Rojo", size: "M", stock: 2 },
  ],
};

test("catalog synchronization applies the saved principal color over a stale automatic selection", () => {
  const selections = syncProductSelections([product], {
    [product.id]: { color: "Negro", size: "S" },
  });
  assert.equal(selections[product.id].color, "Rojo");
  assert.equal(selections[product.id].size, "M");
});

test("catalog synchronization preserves a color the shopper explicitly selected", () => {
  const selections = syncProductSelections([product], {
    [product.id]: { color: "Negro", size: "S", source: "user" },
  });
  assert.deepEqual(selections[product.id], { color: "Negro", size: "S", source: "user" });
});

test("principal color remains visible even when its variant is out of stock", () => {
  const soldOutPrincipal = {
    ...product,
    variants: [
      { color: "Negro", size: "S", stock: 3 },
      { color: "Rojo", size: "M", stock: 0 },
    ],
  };
  const selections = syncProductSelections([soldOutPrincipal], {});
  assert.equal(selections[product.id].color, "Rojo");
  assert.equal(selections[product.id].size, "M");
});

test("featured remains visible when a product is also new and on offer", () => {
  assert.deepEqual(
    getProductBadgeKinds({ featured: true, newArrival: true, offerEnabled: true }, 20),
    ["offer", "featured", "new"],
  );
});

test("featured product card does not nest color buttons inside its main action", async () => {
  const source = await readFile(new URL("../../src/components/catalog/ShowcaseProductCard.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /<button[\s\S]{0,180}className="featured-product-link"/);
  assert.match(source, /<div className="featured-product-link">/);
});

test("featured cards use the principal catalog color without showing color selectors", async () => {
  const source = await readFile(new URL("../../src/components/catalog/ShowcaseProductCard.jsx", import.meta.url), "utf8");
  assert.match(source, /getSelectionForColor\(product, \{ color: product\.catalogColor \}\)/);
  assert.doesNotMatch(source, /featured-product-swatches|featured-swatch/);
});
