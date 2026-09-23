import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

test("admin exposes every editable outerwear finder field and saves it with store settings", async () => {
  const [app, admin] = await Promise.all([
    fs.readFile(new URL("../../src/App.jsx", import.meta.url), "utf8"),
    fs.readFile(new URL("../../src/components/admin/AdminPanelModal.jsx", import.meta.url), "utf8"),
  ]);

  assert.match(app, /outerwearFinder: normalizeOuterwearFinder\(rawSettings\.outerwearFinder\)/);
  assert.match(app, /handleOuterwearFinderImageUpload[\s\S]*fileToDataUrl\(file\)/);
  assert.match(app, /syncCatalogSnapshot\(\{[\s\S]*storeSettings: nextStoreSettings/);
  assert.match(admin, /Selector de abrigos/);
  for (const field of ["title", "description", "imageAlt", "primaryCta", "secondaryCta", "label", "query"]) {
    assert.match(admin, new RegExp(`outerwearFinder[\\s\\S]*${field}`));
  }
  assert.match(admin, /accept="image\/\*" onChange=\{handleOuterwearFinderImageUpload\}/);
  assert.match(admin, /type="url" maxLength=\{2048\}/);
  assert.match(admin, /Búsqueda aplicada/);
});

test("hero and finder uploads retain validated inline images through normalization", async () => {
  const app = await fs.readFile(new URL("../../src/App.jsx", import.meta.url), "utf8");
  assert.match(app, /function normalizeStoreImageSource[\s\S]*normalizeImageSource\(raw\)/);
  assert.match(app, /image: normalizeStoreImageSource\(slide\.image/);
  assert.match(app, /image: normalizeStoreImageSource\(source\.image/);
});
