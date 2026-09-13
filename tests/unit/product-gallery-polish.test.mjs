import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const componentPath = new URL("../../src/components/products/ProductModal.jsx", import.meta.url);
const cssPath = new URL("../../src/App.css", import.meta.url);

test("gallery line controls keep individual photo selection and announce the active photo", async () => {
  const source = await fs.readFile(componentPath, "utf8");
  assert.match(source, /className="product-gallery-pagination" role="group"/);
  assert.match(source, /onClick=\{\(\) => setImageIndex\(index\)\}/);
  assert.match(source, /aria-pressed=\{safeImageIndex === index\}/);
  assert.match(source, /aria-label=\{`Ver imagen \$\{index \+ 1\}`\}/);
  assert.match(source, /track\.scrollLeft = selected\.offsetLeft/);
  assert.doesNotMatch(source, /className="thumb-row"|className=\{`dot/);
});

test("gallery controls have real non-overlapping touch targets and visible focus", async () => {
  const css = await fs.readFile(cssPath, "utf8");
  assert.match(css, /\.product-gallery-page\s*\{[^}]*flex: 0 0 44px;[^}]*width: 44px;[^}]*height: 44px;/);
  assert.match(css, /\.product-gallery-page:focus-visible\s*\{[^}]*outline: 2px/);
  assert.doesNotMatch(css, /\.dot::after/);
});

test("recommended photos use a portrait frame and never crop or enlarge on hover", async () => {
  const css = await fs.readFile(cssPath, "utf8");
  assert.match(css, /\.product-modal-recommend-image-wrap\s*\{[^}]*aspect-ratio: 3 \/ 4;/);
  assert.match(css, /\.product-modal-recommend-image-wrap img\s*\{[^}]*object-fit: contain;[^}]*object-position: center;/);
  assert.doesNotMatch(css, /\.product-modal-recommend-card:hover img/);
  assert.match(css, /\.product-modal-recommend-grid\s*\{[^}]*margin: 0;[^}]*scroll-padding-inline: 2px;/);
});
