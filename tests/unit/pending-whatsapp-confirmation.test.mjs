import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createEmptyPendingWhatsAppConfirmation,
  createOrderSuccessModalState,
  createPendingWhatsAppConfirmation,
  markPendingWhatsAppAsOpened,
  normalizePendingWhatsAppConfirmation,
} from "../../src/domain/orders/pendingWhatsAppConfirmation.js";

test("la confirmación pendiente conserva solo el resumen necesario del pedido", () => {
  const pending = createPendingWhatsAppConfirmation({
    order: {
      id: "order-1",
      code: " ADR-1001 ",
      paymentMethod: "card_link",
      total: 25,
      subtotal: 25,
      customerName: "Dato que no debe persistirse",
      deliveryAddress: "Dirección que no debe persistirse",
    },
    whatsappUrl: "https://wa.me/593999999999?text=Pedido%20ADR-1001",
  });

  assert.deepEqual(pending, {
    open: true,
    order: {
      id: "order-1",
      code: "ADR-1001",
      paymentMethod: "card_link",
      total: 25,
      subtotal: 25,
    },
    whatsappUrl: "https://wa.me/593999999999?text=Pedido%20ADR-1001",
    whatsappOpened: false,
  });
  assert.equal("customerName" in pending.order, false);
  assert.equal("deliveryAddress" in pending.order, false);
});

test("el aviso restaurado vuelve abierto y recuerda si WhatsApp ya se abrió", () => {
  const restored = normalizePendingWhatsAppConfirmation({
    open: false,
    order: { id: "order-2", code: "ADR-1002", paymentMethod: "card_link", total: "31.50", subtotal: 30 },
    whatsappUrl: "https://api.whatsapp.com/send?phone=593999999999&text=Pedido",
    whatsappOpened: true,
  });

  assert.equal(restored.open, true);
  assert.equal(restored.whatsappOpened, true);
  assert.equal(restored.order.total, 31.5);
  assert.equal(markPendingWhatsAppAsOpened({ ...restored, whatsappOpened: false }).whatsappOpened, true);
});

test("la confirmación pendiente rechaza destinos que no pertenecen a WhatsApp", () => {
  assert.equal(normalizePendingWhatsAppConfirmation({
    order: { code: "ADR-1003", paymentMethod: "card_link" },
    whatsappUrl: "https://wa.me.ejemplo.com/593999999999",
  }), null);
  assert.equal(normalizePendingWhatsAppConfirmation({
    order: { code: "ADR-1003", paymentMethod: "card_link" },
    whatsappUrl: "javascript:alert(1)",
  }), null);
  assert.equal(normalizePendingWhatsAppConfirmation({
    order: { code: "", paymentMethod: "card_link" },
    whatsappUrl: "https://wa.me/593999999999",
  }), null);
});

test("las transferencias muestran un éxito normal sin crear ni restaurar un aviso obligatorio", () => {
  const value = {
    order: { id: "transfer-1", code: "ADR-1004", paymentMethod: "transfer", subtotal: 25 },
    whatsappUrl: "https://wa.me/593999999999",
  };
  assert.equal(createOrderSuccessModalState(value).order.paymentMethod, "transfer");
  assert.equal(createOrderSuccessModalState(value).order.total, 25);
  assert.equal(createPendingWhatsAppConfirmation(value), null);
  assert.equal(normalizePendingWhatsAppConfirmation(value), null);
  assert.equal(markPendingWhatsAppAsOpened(value), null);
  assert.equal(normalizePendingWhatsAppConfirmation({ ...value, order: { code: "ADR-legacy" } }), null);
});

test("el estado vacío no deja un aviso fantasma", () => {
  assert.deepEqual(createEmptyPendingWhatsAppConfirmation(), {
    open: false,
    order: null,
    whatsappUrl: "",
    whatsappOpened: false,
  });
});

test("el carrito mantiene la etiqueta de stock ajustada a su contenido en todos los breakpoints", async () => {
  const [css, cartModal] = await Promise.all([
    readFile("src/App.css", "utf8"),
    readFile("src/components/cart/CartSummaryModal.jsx", "utf8"),
  ]);

  assert.match(css, /\.cart-line-stock-badge\s*\{[^}]*width:\s*fit-content;[^}]*max-width:\s*100%;[^}]*align-self:\s*start;[^}]*justify-self:\s*start;/s);
  assert.equal((cartModal.match(/cart-line-stock-badge/g) || []).length, 3);
});

test("el aviso de WhatsApp solo se descarta desde la confirmación explícita", async () => {
  const [app, modal] = await Promise.all([
    readFile("src/App.jsx", "utf8"),
    readFile("src/components/modals/OrderSuccessRedirectModal.jsx", "utf8"),
  ]);

  assert.match(app, /readStorage\(STORAGE_KEYS\.pendingWhatsAppConfirmation, null\)/);
  assert.match(app, /saveStorage\(STORAGE_KEYS\.pendingWhatsAppConfirmation, pendingWhatsAppConfirmation\)/);
  // Maintenance hides the reminder without deleting the saved confirmation.
  assert.match(app, /!adminRouteActive && !maintenanceActive && orderSuccessModal\.open && orderSuccessModal\.order/);
  assert.equal((app.match(/removeStorage\(STORAGE_KEYS\.pendingWhatsAppConfirmation\)/g) || []).length, 1);
  assert.match(modal, /onConfirmSent\?\.\(\)/);
  assert.match(modal, /disableEscape:\s*requiresWhatsApp/);
  assert.match(modal, /!requiresWhatsApp && \(/);
  assert.match(modal, /paymentMethod === PAYMENT_METHODS\.cardLink/);
  assert.doesNotMatch(modal, /¡Pedido confirmado!/);
  // Legacy wording is retained only to migrate saved settings to the current
  // transfer/card flow. Inspect rendered markup rather than rejecting migration strings.
  const renderedStart = app.indexOf("<section id=\"inicio\"");
  assert.ok(renderedStart >= 0);
  assert.doesNotMatch(app.slice(renderedStart), /Ordena por WhatsApp|escríbenos por WhatsApp para completar la compra/);
  assert.match(app, /updateOrderPaymentProof\(orderId, "", \{ immediate: true \}\)/);
});
