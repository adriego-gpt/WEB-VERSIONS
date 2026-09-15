import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { projectCartStock, preserveCartSelection } from "../../src/domain/orders/cartEditing.js";
import { getStockForVariant, getFallbackSelection } from "../../src/domain/products/variants.js";

// Exercise the application's real cart handler, including its state updater.
const source = readFileSync(new URL("../../src/App.jsx", import.meta.url), "utf8");
const handler = source.slice(source.indexOf("  const updateQuantity = async"), source.indexOf("  const removeItem = async"));
function setup(quantity, stock) {
  let cart = [{ key: "p-blue-M", id: "p", name: "Prenda", color: "blue", size: "M", quantity }];
  const notices = [];
  const create = new Function("cart", "productsById", "normalizeEntityId", "getStockForVariant", "setCart", "showToastMessage", "requestDestructiveConfirmation", "getCartStockProduct", "checkoutBusyRef", `${handler}; return updateQuantity;`);
  const product = { id: "p", stock };
  const update = create(cart, new Map([["p", product]]), id => id, p => p.stock, fn => { cart = fn(cart); }, message => notices.push(message), async () => true, p => p, { current: false });
  return { update, read: () => cart, notices };
}
test("a sold or reserved variant must not prevent decreasing an existing cart line", async () => {
  const app = setup(3, 0);
  await app.update("p-blue-M", -1);
  assert.equal(app.read()[0].quantity, 2);
  assert.equal(app.notices.length, 0);
});
test("decreases remain possible while quantity is still above current stock", async () => {
  const app = setup(4, 1);
  await app.update("p-blue-M", -1);
  assert.equal(app.read()[0].quantity, 3);
});
test("increasing beyond stock remains blocked, while removing the last unit works", async () => {
  const app = setup(1, 0);
  await app.update("p-blue-M", 1);
  assert.equal(app.read()[0].quantity, 1);
  await app.update("p-blue-M", -1);
  assert.equal(app.read().length, 0);
});

const reservedProduct = { id: "p", name: "Prenda", price: 25, colors: ["blue"], sizes: ["M", "L"], variants: [{ uid: "m", color: "blue", size: "M", stock: 0 }, { uid: "l", color: "blue", size: "L", stock: 2 }] };
const snapshot = { stockDeadline: Date.now() + 300000, stock: [{ id: "p", color: "blue", size: "M", uid: "m", stock: 3 }] };
test("editing uses owned stock only while the hold is alive and never resurrects a replaced variant", () => {
  assert.equal(getStockForVariant(projectCartStock(reservedProduct, snapshot), "blue", "M"), 3);
  assert.equal(getStockForVariant(projectCartStock(reservedProduct, snapshot, snapshot.stockDeadline), "blue", "M"), 0);
  const replaced = { ...reservedProduct, variants: [{ ...reservedProduct.variants[0], uid: "replacement" }] };
  assert.equal(getStockForVariant(projectCartStock(replaced, snapshot), "blue", "M"), 0);
  assert.equal(preserveCartSelection(reservedProduct, { color: "blue", size: "M" }, getFallbackSelection).size, "M");
});

function editingApp({ size = "M", quantity = 2, held = snapshot } = {}) {
  const item = { key: "p-blue-M", id: "p", name: "Prenda", price: 25, color: "blue", size: "M", quantity: 3 };
  let saved;
  const addHandler = source.slice(source.indexOf("  const addToCart ="), source.indexOf("  const updateQuantity = async"));
  const dependencies = {
    getCartStockProduct: p => projectCartStock(p, held), productsById: new Map([["p", reservedProduct]]), normalizeEntityId: id => id,
    isAdmin: false, showToastMessage: () => {}, getFallbackSelection, preserveCartSelection, selections: { p: { color: "blue", size: "M" } },
    setSelections: () => {}, getCurrentImageForProduct: () => "image.jpg", editingCartItemKey: item.key, cart: [item],
    // React may commit later; the handler must report success independently of a state updater executing.
    setCart: value => { saved = value; }, trackAnalyticsEvent: () => {}, triggerFlyToCart: () => {},
    checkoutBusyRef: { current: false },
  };
  const add = new Function(...Object.keys(dependencies), `${addHandler}; return addToCart;`)(...Object.values(dependencies));
  return { ok: add(reservedProduct, null, { color: "blue", size, quantity }), saved };
}
test("back from payment can save a smaller quantity in the same reserved variant", () => {
  const app = editingApp();
  assert.equal(app.ok, true);
  assert.equal(typeof app.saved, "object");
  assert.equal(app.saved[0].quantity, 2);
  assert.equal(app.saved[0].size, "M");
});
test("editing can switch to another available size and failed edits do not report success", () => {
  const changed = editingApp({ size: "L", quantity: 1 });
  assert.equal(changed.ok, true);
  assert.equal(changed.saved[0].size, "L");
  assert.equal(changed.saved[0].quantity, 1);
  const expired = editingApp({ held: { ...snapshot, stockDeadline: 0 } });
  assert.equal(expired.ok, false);
  assert.equal(expired.saved, undefined);
});

test("browser Back to the cart closes the product even when a cart line was being edited", () => {
  const start = source.indexOf('  useEffect(() => {\n    if (!catalogReady) return;\n    if (productRouteSlug)');
  assert.notEqual(start, -1);
  const end = source.indexOf('\n\n  useEffect(', start + 10);
  const effect = source.slice(start, end);
  let selected = reservedProduct;
  let editing = "p-blue-M";
  new Function("useEffect", "catalogReady", "productRouteSlug", "products", "selectedProduct", "editingCartItemKey", "setSelectedProduct", "setEditingCartItemKey", "slugify", effect)(
    callback => callback(), true, "", [reservedProduct], selected, editing, value => { selected = value; }, value => { editing = value; }, value => value,
  );
  assert.equal(selected, null);
  assert.equal(editing, null);
});

test("two fast confirmations cannot start two concurrent checkout verifications", async () => {
  const start = source.indexOf("  const handleCheckoutViaWhatsApp = async");
  const end = source.indexOf("  const handleLaunchOrderSuccessWhatsApp", start);
  const handler = source.slice(start, end);
  let calls = 0;
  let resolve;
  const pending = new Promise(done => { resolve = done; });
  const dependencies = { cart: [{ id: "p", quantity: 1 }], checkoutBusy: false, currentUser: { email: "user@example.test" },
    showCartSummary: true,
    checkoutBusyRef: { current: false }, setCheckoutBusy: () => {}, verifyCheckoutAvailability: () => { calls += 1; return pending; },
    notifyStockWarning: () => {}, setShowCartSummary: () => {} };
  const checkout = new Function(...Object.keys(dependencies), `${handler}; return handleCheckoutViaWhatsApp;`)(...Object.values(dependencies));
  const first = checkout();
  const second = checkout();
  resolve({ ok: false, message: "Stock agotado" });
  await Promise.all([first, second]);
  assert.equal(calls, 1);
  assert.equal(dependencies.checkoutBusyRef.current, false);
});
