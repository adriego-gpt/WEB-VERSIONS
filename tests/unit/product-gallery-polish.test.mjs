import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const componentPath = new URL("../../src/components/products/ProductModal.jsx", import.meta.url);
const cssPath = new URL("../../src/App.css", import.meta.url);

test("purchase quantity controls flank the central action in keyboard and visual order", async () => {
  const [source, css] = await Promise.all([fs.readFile(componentPath, "utf8"), fs.readFile(cssPath, "utf8")]);
  const purchase = source.slice(source.indexOf('<div className={`product-modal-buy-composer'), source.indexOf('<button className="btn btn-outline product-modal-dismiss-btn"'));
  assert.ok(purchase.indexOf('is-decrease') < purchase.indexOf('product-modal-buy-btn'));
  assert.ok(purchase.indexOf('product-modal-buy-btn') < purchase.indexOf('is-increase'));
  assert.match(purchase, /<output className="product-modal-buy-quantity" aria-live="polite"/);
  assert.match(purchase, /currency\(product\.price \* requestedQuantity\)/);
  assert.match(purchase, /disabled=\{requestedQuantity <= 1\}/);
  assert.match(purchase, /disabled=\{requestedQuantity >= quantityLimit\}/);
  assert.match(css, /\.product-modal-buy-control \{[^}]*flex: 0 0 44px;[^}]*width: 44px;[^}]*min-height: 52px;/);
});

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
  assert.match(css, /\.product-gallery-page\s*\{[^}]*flex: 0 0 28px;[^}]*width: 28px;[^}]*height: 22px;/);
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

test("expanded mobile gallery groups its controls and preserves accessible zoom and image count", async () => {
  const source = await fs.readFile(componentPath, "utf8");
  assert.match(source, /className="image-preview-toolbar"/);
  assert.match(source, /className="image-preview-side-navigation"/);
  assert.match(source, /<ZoomIn size=\{18\} aria-hidden="true"/);
  assert.match(source, /<ZoomOut size=\{18\} aria-hidden="true"/);
  assert.match(source, /aria-pressed=\{previewZoomed\} aria-label=\{previewZoomed \? "Restablecer zoom" : "Ampliar imagen"\}/);
  assert.match(source, /thumb-counter image-preview-counter" role="status" aria-label=/);
  assert.match(source, /onPointerDown=\{handlePreviewPointerDown\}/);
  assert.match(source, /onPointerMove=\{handlePreviewPointerMove\}/);
});

test("image controls use side touch targets and leave the photograph unobstructed", async () => {
  const css = await fs.readFile(cssPath, "utf8");
  assert.match(css, /\.image-preview-side-navigation \{[^}]*position: absolute;[^}]*top: 50%;[^}]*justify-content: space-between;[^}]*pointer-events: none;/);
  assert.match(css, /\.image-preview-side-navigation \.carousel-arrow \{[^}]*width: 44px;[^}]*height: 44px;[^}]*pointer-events: auto;/);
  assert.match(css, /\.image-preview-side-navigation \.carousel-arrow \{[^}]*box-shadow: 0 8px 22px/);
  assert.match(css, /\.image-preview-toolbar \{[^}]*grid-template-columns: 44px minmax\(0, 1fr\) 44px;/);
  assert.match(css, /\.image-preview-shell button:focus-visible \{[^}]*outline: 2px/);
  assert.match(css, /max-height: calc\(100dvh - 148px - env\(safe-area-inset-top, 0px\) - env\(safe-area-inset-bottom, 0px\)\)/);
});

test("mobile detail counter aligns beside the close control without heavy decoration", async () => {
  const css = await fs.readFile(cssPath, "utf8");
  assert.match(css, /\.modal-left > \.thumb-counter \{[^}]*top: calc\(20px \+ env\(safe-area-inset-top, 0px\)\);[^}]*right: calc\(68px \+ env\(safe-area-inset-right, 0px\)\);[^}]*box-shadow: none;/);
});
