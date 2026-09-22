import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const componentPath = new URL("../../src/components/products/ProductModal.jsx", import.meta.url);
const cssPath = new URL("../../src/App.css", import.meta.url);

test("purchase quantity controls precede the central action in keyboard and visual order", async () => {
  const [source, css] = await Promise.all([fs.readFile(componentPath, "utf8"), fs.readFile(cssPath, "utf8")]);
  const purchaseStart = source.indexOf('<div className={`product-modal-buy-composer');
  const purchase = source.slice(purchaseStart, source.indexOf("{isAdmin && (", purchaseStart));
  assert.ok(purchase.indexOf('is-decrease') < purchase.indexOf('is-increase'));
  assert.ok(purchase.indexOf('is-increase') < purchase.indexOf('product-modal-buy-btn'));
  assert.match(purchase, /className="product-modal-quantity-stepper" role="group" aria-label="Unidades"/);
  assert.match(purchase, /<output className="product-modal-buy-quantity" aria-live="polite"/);
  assert.match(purchase, /currency\(product\.price \* requestedQuantity\)/);
  assert.match(purchase, /disabled=\{requestedQuantity <= 1\}/);
  assert.match(purchase, /disabled=\{requestedQuantity >= quantityLimit\}/);
  assert.match(css, /\.product-modal-buy-control \{[^}]*width: 44px;[^}]*height: 44px;/);
  assert.match(css, /\.product-modal-buy-composer \{[^}]*grid-template-columns: 132px minmax\(0, 1fr\);[^}]*min-height: 58px;/);
  assert.match(css, /\.product-modal-quantity-stepper \{[^}]*background: #fff;/);
  assert.match(css, /\.product-modal-buy-control:active:not\(:disabled\) \{/);
});

test("product detail keeps one clear exit and does not repeat a continue-shopping action", async () => {
  const [source, css] = await Promise.all([fs.readFile(componentPath, "utf8"), fs.readFile(cssPath, "utf8")]);
  assert.doesNotMatch(source, /Seguir viendo|product-modal-dismiss-btn/);
  assert.doesNotMatch(css, /\.product-modal-dismiss-btn/);
});

test("cart purchase and footer contain no audio control or playback", async () => {
  const [app, storage] = await Promise.all([
    fs.readFile(new URL("../../src/App.jsx", import.meta.url), "utf8"),
    fs.readFile(new URL("../../src/constants/storage.js", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(app, /playCartSound|cartSoundEnabled|Sonido del carrito/);
  assert.doesNotMatch(storage, /cartSound/);
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

test("mobile product detail moves back navigation into the main header and removes duplicate chrome", async () => {
  const [source, css, header, app] = await Promise.all([
    fs.readFile(componentPath, "utf8"),
    fs.readFile(cssPath, "utf8"),
    fs.readFile(new URL("../../src/components/common/MobileStoreHeader.jsx", import.meta.url), "utf8"),
    fs.readFile(new URL("../../src/App.jsx", import.meta.url), "utf8"),
  ]);
  assert.match(source, /<div className="product-mobile-chrome">\s*\{mobileHeader\}/);
  assert.doesNotMatch(source, /product-mobile-toolbar|product-mobile-dismiss|product-mobile-image-count|product-modal-mobile-close/);
  assert.doesNotMatch(source, /Toca para ampliar|Haz clic para ampliar|product-modal-zoom-wrap|modal-zoom-toggle/);
  assert.match(header, /const showsBack = typeof onBack === "function"/);
  assert.match(header, /aria-label=\{showsBack \? "Regresar al catálogo"/);
  assert.match(header, /mobile-store-header-back/);
  assert.match(app, /onBack=\{\(\) => \{\s*if \(typeof window !== "undefined" && window\.history\.state\?\.\[PRODUCT_PAGE_HISTORY_KEY\]\)/);
  assert.match(css, /\.modal\.product-modal-has-mobile-header \{[^}]*grid-template-rows: auto auto auto;/);
  assert.match(css, /\.modal\.product-modal-has-mobile-header > \.modal-left \{[^}]*grid-column: 1;[^}]*grid-row: 2;/);
  assert.match(css, /\.modal\.product-modal-has-mobile-header > \.modal-right \{[^}]*grid-column: 1;[^}]*grid-row: 3;/);
  assert.match(css, /\.modal\.product-modal-has-mobile-header \.modal-left > \.thumb-counter \{[^}]*top: 16px;[^}]*right: 16px;/);
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

test("expanded gallery hides image navigation while zoom is active", async () => {
  const source = await fs.readFile(componentPath, "utf8");
  assert.match(source, /\{hasMultipleImages && !previewZoomed && \(\s*<div className="image-preview-side-navigation"/);
  assert.match(source, /event\.key === "ArrowLeft" && hasMultipleImages && !\(imagePreviewOpen && previewZoomed\)/);
  assert.match(source, /event\.key === "ArrowRight" && hasMultipleImages && !\(imagePreviewOpen && previewZoomed\)/);
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

test("mobile detail makes the product image editorial and keeps gallery controls unobtrusive", async () => {
  const css = await fs.readFile(cssPath, "utf8");
  assert.match(css, /\.modal-left \{[^}]*height: clamp\(420px, 72svh, 820px\);[^}]*max-height: calc\(100svh - 68px\);/);
  assert.match(css, /\.modal-img \{[^}]*object-fit: cover;[^}]*object-position: center 10%;/);
  assert.match(css, /\.modal-left > \.thumb-counter \{[^}]*top: 16px;[^}]*right: max\(16px, env\(safe-area-inset-right, 0px\)\);[^}]*box-shadow: none;/);
  assert.match(css, /\.product-gallery-pagination \{[^}]*left: max\(16px, env\(safe-area-inset-left, 0px\)\);[^}]*bottom: 16px;[^}]*transform: none;/);
  assert.match(css, /\.image-preview-media \{[^}]*object-fit: contain;/);
});
