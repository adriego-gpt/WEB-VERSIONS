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

test("a realtime stock change never silently swaps the shopper's chosen size", () => {
  const updated = { ...product, variants: [{ color: "Negro", size: "S", stock: 0 }, { color: "Negro", size: "M", stock: 3 }] };
  const selections = syncProductSelections([updated], { [product.id]: { color: "Negro", size: "S", source: "user" } });
  assert.equal(selections[product.id].size, "S");
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

test("admin, offers and favorites consistently preview the saved principal color", async () => {
  const files = [
    "../../src/components/admin/ProductCatalogPanel.jsx",
    "../../src/components/admin/OfferManagerPanel.jsx",
    "../../src/components/cart/FavoritesModal.jsx",
  ];
  const sources = await Promise.all(files.map((file) => readFile(new URL(file, import.meta.url), "utf8")));
  for (const source of sources) {
    assert.match(source, /product\.catalogColor \|\| product\.colors\?*\.?\[0\]|product\.catalogColor \|\| colors\[0\]/);
  }
});

test("product editor and inventory make the principal catalog color explicit", async () => {
  const editor = await readFile(new URL("../../src/components/admin/ProductEditorPanel.jsx", import.meta.url), "utf8");
  const inventory = await readFile(new URL("../../src/components/admin/InventoryMatrixPanel.jsx", import.meta.url), "utf8");

  assert.match(editor, /onFieldChange\("catalogColor", color\.name\)/);
  assert.match(editor, /role="radiogroup"/);
  assert.match(editor, /aria-checked=\{selected\}/);
  assert.match(inventory, /color === principalColor/);
  assert.match(inventory, />Principal</);
});

test("product editor can reorder each color gallery and exposes its cover image", async () => {
  const [app, admin, editor] = await Promise.all([
    readFile(new URL("../../src/App.jsx", import.meta.url), "utf8"),
    readFile(new URL("../../src/components/admin/AdminPanelModal.jsx", import.meta.url), "utf8"),
    readFile(new URL("../../src/components/admin/ProductEditorPanel.jsx", import.meta.url), "utf8"),
  ]);

  assert.match(app, /const moveImageField = \(uid, fromIndex, toIndex\) =>/);
  assert.match(app, /moveImageField=\{moveImageField\}/);
  assert.match(admin, /onMoveImageField=\{moveImageField\}/);
  assert.match(editor, /La primera foto será la portada de este color/);
  assert.match(editor, /onClick=\{\(\) => moveImage\(color, imageIndex, 0\)\}/);
  assert.match(editor, /Mover imagen \$\{imageIndex \+ 1\} una posición arriba/);
  assert.match(editor, /Mover imagen \$\{imageIndex \+ 1\} una posición abajo/);
  assert.match(editor, /role="status" aria-live="polite"/);
});

test("featured marquee hides repeated filler cards from assistive technology", async () => {
  const source = await readFile(new URL("../../src/components/catalog/FeaturedProductMarquee.jsx", import.meta.url), "utf8");

  assert.match(source, /const isRepeatedItem = itemIndex >= products\.length;/);
  assert.match(source, /isDuplicate=\{isDuplicate \|\| isRepeatedItem\}/);
});

test("catalog reconciliation preserves an explicitly empty server catalog", async () => {
  const source = await readFile(new URL("../../src/App.jsx", import.meta.url), "utf8");

  assert.match(
    source,
    /const resolvedProducts = Array\.isArray\(data\.products\) \? incomingProducts : fallbackProducts;/,
  );
  assert.doesNotMatch(
    source,
    /const resolvedProducts = incomingProducts\.length \? incomingProducts : fallbackProducts;/,
  );
});

test("catalog conflicts require an explicit administrator decision", async () => {
  const source = await readFile(new URL("../../src/App.jsx", import.meta.url), "utf8");

  assert.match(source, /result\.status === 409 && result\.code === "CATALOG_VERSION_CONFLICT"/);
  assert.match(source, /title="Hay una versión más reciente del catálogo"/);
  assert.match(source, /resolveCatalogConflict\("server"\)/);
  assert.match(source, /resolveCatalogConflict\("local"\)/);
  assert.match(source, /baseCatalogVersion: conflict\.currentVersion/);
  assert.match(source, /adoptCatalogVersion\(conflict\.currentVersion\)/);
});

test("realtime synchronization failures are visible to the administrator", async () => {
  const hookSource = await readFile(new URL("../../src/hooks/useRealtimeSync.js", import.meta.url), "utf8");
  const panelSource = await readFile(new URL("../../src/components/admin/AdminPanelModal.jsx", import.meta.url), "utf8");

  assert.match(hookSource, /state: deferredCatalog \? "deferred" : "synced"/);
  assert.match(hookSource, /state: result\?\.status === 0 \? "offline" : "error"/);
  assert.doesNotMatch(hookSource, /Silent error tolerance/);
  assert.match(panelSource, /className={`admin-sync-status is-\$\{realtimeSyncStatus\?\.state/);
  assert.match(panelSource, /Error de sincronización/);
  assert.match(panelSource, /className="admin-sync-retry"/);
  assert.match(panelSource, /onClick={retryRealtimeSync}/);
});
