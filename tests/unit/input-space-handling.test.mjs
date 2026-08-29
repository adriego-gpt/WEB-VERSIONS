import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { stripDangerousContent } from "../../src/utils/sanitizers.js";

test("stripDangerousContent preserves single and consecutive spaces for natural typing", () => {
  assert.equal(stripDangerousContent("Azul Marino"), "Azul Marino");
  assert.equal(stripDangerousContent("Vestido de lino "), "Vestido de lino ");
  assert.equal(stripDangerousContent("  Espacio inicial"), "  Espacio inicial");
  assert.equal(stripDangerousContent("Talla   32"), "Talla   32");
});

test("App.jsx does not trim spaces during live typing in color name and size row handlers", () => {
  const appCode = fs.readFileSync("src/App.jsx", "utf8");

  // handleColorFieldChange must NOT use normalizeOptionLabel for live typing
  assert.doesNotMatch(
    appCode,
    /handleColorFieldChange\s*=\s*[\s\S]*?normalizeOptionLabel\(value\)/,
    "handleColorFieldChange must not trim trailing spaces on live input",
  );

  // handleSizeRowChange must NOT use normalizeOptionLabel for live typing
  assert.doesNotMatch(
    appCode,
    /handleSizeRowChange\s*=\s*[\s\S]*?normalizeOptionLabel\(value\)/,
    "handleSizeRowChange must not trim trailing spaces on live input",
  );

  // handleManagedProductTypeDraftChange must NOT use normalizeOptionLabel for live typing
  assert.doesNotMatch(
    appCode,
    /handleManagedProductTypeDraftChange\s*=\s*[\s\S]*?normalizeOptionLabel\(value\)/,
    "handleManagedProductTypeDraftChange must not trim spaces while editing draft name",
  );

  // handleManagedFilterTagDraftChange must NOT use normalizeOptionLabel for live typing
  assert.doesNotMatch(
    appCode,
    /handleManagedFilterTagDraftChange\s*=\s*[\s\S]*?normalizeOptionLabel\(value\)/,
    "handleManagedFilterTagDraftChange must not trim spaces while editing draft name",
  );

  // handleProfileDraftFieldChange must preserve spaces
  assert.doesNotMatch(
    appCode,
    /handleProfileFieldChange\s*=\s*[\s\S]*?normalizeOptionLabel\(value\)/,
    "handleProfileFieldChange must preserve spaces while typing profile info",
  );

  // handleAddressBookDraftFieldChange must preserve spaces
  assert.doesNotMatch(
    appCode,
    /handleAddressBookDraftFieldChange\s*=\s*[\s\S]*?normalizeOptionLabel\(value\)/,
    "handleAddressBookDraftFieldChange must preserve spaces while typing address info",
  );
});

test("CartSummaryModal.jsx preserves spaces in deliveryDraft inputs", () => {
  const cartCode = fs.readFileSync("src/components/cart/CartSummaryModal.jsx", "utf8");
  assert.doesNotMatch(
    cartCode,
    /handleDeliveryDraftChange\s*=\s*[\s\S]*?normalizeOptionLabel\(value\)/,
    "handleDeliveryDraftChange must preserve spaces while typing address",
  );
});

test("CustomDropdown.jsx does not intercept Space when focus is inside a text input or textarea", () => {
  const dropdownCode = fs.readFileSync("src/components/ui/CustomDropdown.jsx", "utf8");

  assert.match(
    dropdownCode,
    /isTyping/,
    "CustomDropdown must detect if the user is typing in an input/textarea",
  );
  assert.match(
    dropdownCode,
    /if\s*\(\s*isTyping\s*\)\s*return/,
    "CustomDropdown must allow Space to pass through when typing in text fields",
  );
});

test("useModalA11y.js does not intercept Space key events", () => {
  const modalA11yCode = fs.readFileSync("src/hooks/useModalA11y.js", "utf8");

  assert.doesNotMatch(
    modalA11yCode,
    /event\.key\s*===\s*["']\s*["']/,
    "useModalA11y must never intercept or prevent the Space key",
  );
});

