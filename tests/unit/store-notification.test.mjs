import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { getNotificationPresentation } from "../../src/domain/notifications/presentation.js";

test("routine notices omit redundant headings without hiding their message", () => {
  for (const title of ["Listo", "Te acompanamos", "Información"]) {
    assert.equal(getNotificationPresentation({ title, message: "Cantidad actualizada." }).title, "");
    assert.equal(getNotificationPresentation({ title }).title, title);
  }
});

test("specific cart and error headings are preserved", () => {
  for (const title of ["Añadido al carrito", "Carrito actualizado", "No se pudo guardar"]) {
    assert.equal(getNotificationPresentation({ title, message: "Prenda" }).title, title);
  }
});

test("cart action only appears outside the cart and only when explicitly requested", () => {
  assert.equal(getNotificationPresentation({ action: "cart" }).hasAction, true);
  assert.equal(getNotificationPresentation({ action: "cart" }, { cartOpen: true }).hasAction, false);
  assert.equal(getNotificationPresentation({ message: "Cantidad actualizada." }).hasAction, false);
  assert.equal(getNotificationPresentation(null).hasAction, false);
});

test("warnings and errors provide at least seven seconds to read", () => {
  for (const tone of ["warning", "error"]) {
    assert.equal(getNotificationPresentation({ tone }).duration, 7000);
    assert.equal(getNotificationPresentation({ tone }, { durationMs: 9000 }).duration, 9000);
  }
  assert.equal(getNotificationPresentation({ tone: "success" }).duration, 3600);
  assert.equal(getNotificationPresentation({ tone: "info" }).duration, 3600);
});

test("notification interaction pauses only its own timer and cleans it up", async () => {
  const component = await fs.readFile(new URL("../../src/components/common/StoreNotification.jsx", import.meta.url), "utf8");
  assert.match(component, /hoveredNotification === notification \|\| focusedNotification === notification/);
  assert.match(component, /window\.clearTimeout\(timer\)/);
  assert.match(component, /aria-live=/);
  assert.match(component, /reducedMotion \? 0 : 0\.18/);
  assert.match(component, /onDismiss\(\); onOpenCart\(\)/);
});

test("global notices are top-aligned with accessible controls, not a bottom overlay", async () => {
  const css = await fs.readFile(new URL("../../src/App.css", import.meta.url), "utf8");
  const region = css.match(/\.notification-region \{([^}]+)\}/)[1];
  assert.match(region, /inset: calc\(16px \+ env\(safe-area-inset-top, 0px\)\) 16px auto/);
  assert.match(region, /pointer-events: none/);
  assert.match(css, /\.toast-close,\s*\.toast-action\s*\{[^}]*min-height: 44px/);
  assert.doesNotMatch(css, /order-toast-pulse/);
});

test("product detail uses the same top notice without a second inline confirmation", async () => {
  const [modal, app, css] = await Promise.all([
    fs.readFile(new URL("../../src/components/products/ProductModal.jsx", import.meta.url), "utf8"),
    fs.readFile(new URL("../../src/App.jsx", import.meta.url), "utf8"),
    fs.readFile(new URL("../../src/App.css", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(modal, /cartFeedback|inlineFeedback|product-modal-cart-feedback/);
  assert.doesNotMatch(app, /inlineFeedback/);
  assert.doesNotMatch(css, /product-modal-cart-feedback/);
  assert.match(modal, /onAddToCart\(product, \{ sourceElement: event\.currentTarget, image: activeImage \}\)/);
  assert.match(app, /if \(selectedProduct\) closeProductModal\(\);\s*openCartPage\(\)/);
  assert.match(modal, /Guardar cambios/);
  assert.match(modal, /notificationActions = imagePreviewOpen \? \[\] : document\.querySelectorAll\("\.notification-region button"\)/);
  assert.match(css, /width: min\(460px, calc\(100% - 32px\)\)/);
});
