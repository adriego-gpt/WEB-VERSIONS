import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const appSource = await readFile(new URL("../../src/App.jsx", import.meta.url), "utf8");
const adminPanelSource = await readFile(new URL("../../src/components/admin/AdminPanelModal.jsx", import.meta.url), "utf8");
const productEditorSource = await readFile(new URL("../../src/components/admin/ProductEditorPanel.jsx", import.meta.url), "utf8");
const couponPanelSource = await readFile(new URL("../../src/components/admin/CouponManagerPanel.jsx", import.meta.url), "utf8");
const inventoryPanelSource = await readFile(new URL("../../src/components/admin/InventoryMatrixPanel.jsx", import.meta.url), "utf8");

function sourceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(start, -1, `No se encontró ${startMarker}`);
  assert.notEqual(end, -1, `No se encontró ${endMarker}`);
  return source.slice(start, end);
}

test("failed offer persistence restores the committed products and open editor", () => {
  const source = sourceBetween(appSource, "const saveOffersFromAdmin", "const saveProduct");
  assert.match(source, /const previousProducts = productsRef\.current/);
  assert.match(source, /const previousProductForm = productForm/);
  assert.match(source, /setProducts\(previousProducts\)/);
  assert.match(source, /productsRef\.current = previousProducts/);
  assert.match(source, /setProductForm\(previousProductForm\)/);
});

test("coupon mutations preserve the draft and roll back when persistence fails", () => {
  const saveSource = sourceBetween(appSource, "const saveCoupon", "const toggleCouponActive");
  assert.match(saveSource, /const previousCoupons = couponsRef\.current/);
  assert.match(saveSource, /const previousCouponDraft = couponDraft/);
  assert.match(saveSource, /setCoupons\(previousCoupons\)/);
  assert.match(saveSource, /setCouponDraft\(previousCouponDraft\)/);

  const deleteSource = sourceBetween(appSource, "const deleteCoupon", "const applyCouponFromInput");
  assert.match(deleteSource, /const previousCoupons = couponsRef\.current/);
  assert.match(deleteSource, /setCoupons\(previousCoupons\)/);
  assert.ok(
    deleteSource.indexOf("clearActiveCoupon()") > deleteSource.indexOf("if (!syncResult.ok)"),
    "el cupón activo solo debe limpiarse después de confirmar el guardado",
  );
});

test("store settings are committed only after the server accepts them", () => {
  const source = sourceBetween(appSource, "const saveStoreConfiguration", "const saveMaintenanceConfiguration");
  const syncCall = source.indexOf("await syncCatalogSnapshot");
  const commitCall = source.indexOf("setStoreSettings(");
  assert.ok(syncCall >= 0 && commitCall > syncCall, "la configuración visible no debe adelantarse al servidor");
  assert.match(source, /setStoreDraft/);
});

test("admin save controls expose and honor busy states", () => {
  assert.match(appSource, /const \[productSaveBusy, setProductSaveBusy\] = useState\(false\)/);
  assert.match(appSource, /const productSaveBusyRef = useRef\(false\)/);
  assert.match(appSource, /const \[couponSaveBusy, setCouponSaveBusy\] = useState\(false\)/);
  assert.match(appSource, /const couponSaveBusyRef = useRef\(false\)/);
  assert.match(appSource, /const \[storeSaveBusy, setStoreSaveBusy\] = useState\(false\)/);
  assert.match(productEditorSource, /saveBusy/);
  assert.match(productEditorSource, /disabled=\{saveBusy/);
  assert.match(couponPanelSource, /saveBusy/);
  assert.match(couponPanelSource, /disabled=\{saveBusy\}/);
  assert.match(adminPanelSource, /storeSaveBusy/);
  assert.match(adminPanelSource, /disabled=\{storeSaveBusy\}/);
});

test("inventory disclosures use the native open contract without leaking React props", () => {
  assert.doesNotMatch(inventoryPanelSource, /defaultOpen=/);
  assert.match(inventoryPanelSource, /open=\{isOpen\}/);
  assert.match(inventoryPanelSource, /onToggle=/);
});
