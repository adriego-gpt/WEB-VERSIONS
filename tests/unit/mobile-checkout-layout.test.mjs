import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const cssUrl = new URL("../../src/App.css", import.meta.url);
const cartModalUrl = new URL("../../src/components/cart/CartSummaryModal.jsx", import.meta.url);

test("checkout confirmado fuerza una sola columna en mobile", async () => {
  const source = await readFile(cssUrl, "utf8");
  const mobileSection = source.slice(source.indexOf("@media (max-width: 760px)"));

  assert.match(
    mobileSection,
    /\.modal-backdrop:has\(> \.cart-fullscreen-sheet\)\s*\{[^}]*padding:\s*0;[^}]*overflow:\s*hidden;/s,
  );
  assert.match(mobileSection, /\.cart-fullscreen-content\.is-confirm-step\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s);
  assert.match(mobileSection, /\.cart-fullscreen-summary\.is-confirm-step\s*\{[^}]*width:\s*100%[^}]*min-width:\s*0/s);
  assert.match(mobileSection, /@media \(max-width:\s*420px\)[\s\S]*\.checkout-payment-options\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(mobileSection, /@media \(max-width:\s*420px\)[\s\S]*\.checkout-bank-details\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
});

test("transferencia permite elegir banco antes de mostrar los datos y conserva un solo resumen", async () => {
  const source = await readFile(cartModalUrl, "utf8");

  assert.match(source, /copyTextToClipboard\(accountNumber\)/);
  assert.match(source, />\s*Copiar cuenta\s*</);
  assert.match(source, /aria-label="Subir comprobante de transferencia"/);
  assert.match(source, /className="checkout-bank-selector"/);
  assert.match(source, /className=\{`checkout-bank-choice \$\{isSelected \? "active" : ""\}`\}/);
  assert.match(source, /className="checkout-bank-choice-logo"/);
  assert.match(source, /normalizeImageSource\(account\.bankLogoImage \|\| ""\)/);
  assert.match(source, /role="radiogroup" aria-label="Banco para la transferencia"/);
  assert.match(source, /selectedBankAccount \? \(/);
  assert.match(source, /Selecciona el banco al que realizarás la transferencia/);
  assert.doesNotMatch(source, /readyBankAccounts\.length === 1 \? readyBankAccounts\[0\]\.id : ""/);
  assert.doesNotMatch(source, /\|\| \(readyBankAccounts\.length === 1 \? readyBankAccounts\[0\] : null\)/);
  assert.doesNotMatch(source, /readyBankAccounts\.length === 1 && selectedBankAccountId/);
  assert.match(source, /bankAccountId:\s*selectedPaymentMethod === PAYMENT_METHODS\.transfer/);
  assert.match(source, /aria-label="Abrir comprobante de transferencia"/);
  assert.match(source, /paymentProof:\s*selectedPaymentMethod === PAYMENT_METHODS\.transfer/);
  assert.match(source, /className="checkout-amount-summary"/);
  assert.equal((source.match(/<span>Subtotal<\/span>/g) || []).length, 1);
  assert.equal((source.match(/<span>Total<\/span>/g) || []).length, 1);
});
