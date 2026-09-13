import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test, { after } from "node:test";

const root = process.cwd();
const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), "adriego-telegram-types-"));
const originalFetch = globalThis.fetch;
const environmentNames = ["NODE_ENV", "VERCEL_ENV", "KV_REST_API_URL", "KV_REST_API_TOKEN", "TELEGRAM_BOT_TOKEN", "TELEGRAM_ADMIN_CHAT_ID", "TELEGRAM_WEBHOOK_SECRET", "SECURITY_LOG_ENABLED"];
const originalEnvironment = Object.fromEntries(environmentNames.map((name) => [name, process.env[name]]));
process.chdir(sandbox);
Object.assign(process.env, {
  NODE_ENV: "test", VERCEL_ENV: "test", KV_REST_API_URL: "", KV_REST_API_TOKEN: "",
  TELEGRAM_BOT_TOKEN: "test-token", TELEGRAM_ADMIN_CHAT_ID: "123", TELEGRAM_WEBHOOK_SECRET: "test-secret", SECURITY_LOG_ENABLED: "false",
});
const calls = [];
globalThis.fetch = async (url, options = {}) => {
  calls.push({ endpoint: String(url).split("/").pop(), body: JSON.parse(options.body) });
  return { ok: true, json: async () => ({ ok: true, result: { message_id: 900 } }) };
};
const { default: handler, buildInventoryTypesView, buildInventoryProductsByTypeView, getAvailableProductTypes } = await import(pathToFileURL(path.join(root, "api/telegram-webhook.js")).href);
const { readStore, updateStore } = await import(pathToFileURL(path.join(root, "api/_lib/store.js")).href);
after(async () => {
  globalThis.fetch = originalFetch;
  for (const name of environmentNames) {
    if (originalEnvironment[name] === undefined) delete process.env[name];
    else process.env[name] = originalEnvironment[name];
  }
  process.chdir(root);
  await fs.rm(sandbox, { recursive: true, force: true });
});

const model = (id, name, productType, stock = 3) => ({ id, name, productType, variants: [{ color: "Azul", size: "M", stock }] });
const seed = async (products) => updateStore((draft) => {
  draft.products = products;
  draft.productTypes = [{ name: "Cortas" }, { name: "Largas" }, { name: "Tipo sin modelos" }];
  draft.physicalStockEvents = [];
  return draft;
});
const buttons = (view) => view.reply_markup.inline_keyboard.flat();
const lastView = () => calls.findLast((call) => ["editMessageText", "sendMessage"].includes(call.endpoint)).body;
const button = (text) => buttons(lastView()).find((entry) => entry.text.includes(text));
async function callback(data, id, messageId = 800) {
  const response = { statusCode: 200, setHeader() {}, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; } };
  const start = calls.length;
  await handler({ method: "POST", headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": "test-secret" }, body: {
    callback_query: { id, from: { id: 123 }, message: { message_id: messageId, chat: { id: 123 } }, data },
  } }, response);
  assert.equal(response.statusCode, 200);
  const navigationCalls = calls.slice(start);
  if (data !== "inv:nostock") {
    assert.equal(navigationCalls.filter((call) => call.endpoint === "editMessageText").length, 1);
    assert.equal(navigationCalls.filter((call) => call.endpoint === "sendMessage").length, 0, "navigation edits the same message instead of sending another");
  }
  for (const call of navigationCalls.filter((entry) => entry.endpoint === "editMessageText")) {
    for (const entry of buttons(call.body)) {
      assert.ok(Buffer.byteLength(entry.callback_data || "", "utf8") <= 64);
    }
  }
}

test("types contain actual models, not empty configured categories, and use stable identifiers", () => {
  const store = { products: [model("c", "Modelo corto", "Cortas"), model("l", "Modelo largo", "Largas", 0)], productTypes: ["Cortas", "Largas", "Vacío"] };
  const view = buildInventoryTypesView(store);
  const typeButtons = buttons(view).filter((entry) => entry.callback_data.startsWith("inv:type:"));
  assert.equal(typeButtons.length, 2);
  assert.match(typeButtons[0].text, /Cortas · 1 modelo/);
  assert.equal(buttons(view).some((entry) => entry.text.includes("Vacío")), false);
  const token = typeButtons[0].callback_data.split(":")[2];
  const changed = { ...store, productTypes: ["Nuevo", ...store.productTypes].reverse(), products: [model("new", "A modelo", "Abrigos"), ...store.products].reverse() };
  assert.match(buildInventoryProductsByTypeView(changed, token).text, /Registrar venta · Cortas/);
  assert.equal(buttons(buildInventoryProductsByTypeView(changed, token)).filter((entry) => entry.callback_data.startsWith("inv:product:")).length, 1);
});

test("restocking by type includes both sold-out and healthy models with the correct action", () => {
  const store = { products: [model("full", "Zeta", "Cortas", 20), model("zero", "Alfa", "Cortas", 0)] };
  const types = buildInventoryTypesView(store, { mode: "restock" });
  const action = buttons(types).find((entry) => entry.callback_data.startsWith("inv:add:type:"));
  const token = action.callback_data.split(":")[3];
  const restockView = buildInventoryProductsByTypeView(store, token, 0, { mode: "restock" });
  const models = buttons(restockView).filter((entry) => entry.callback_data.startsWith("inv:add:product:"));
  assert.equal(models.length, 2);
  assert.match(models[0].text, /Alfa · Agotado/);
  assert.match(models[1].text, /Zeta · 20 disp./);
  const saleView = buildInventoryProductsByTypeView(store, token);
  assert.match(buttons(saleView)[0].text, /Zeta/);
  assert.equal(buttons(saleView)[1].callback_data, "inv:nostock");
});

test("type and model pagination preserve the selected operation", () => {
  const store = { products: Array.from({ length: 10 }, (_, index) => model(`t${index}`, `Modelo ${index}`, `Tipo ${index}`)) };
  for (const mode of ["sale", "restock"]) {
    const prefix = mode === "restock" ? "inv:add:type:" : "inv:type:";
    const page = buildInventoryTypesView(store, { mode });
    assert.equal(buttons(page).filter((entry) => entry.callback_data.startsWith(prefix)).length, 8);
    assert.ok(buttons(page).some((entry) => entry.callback_data === (mode === "restock" ? "inv:add:types:1" : "inv:types:1")));
    assert.equal(buttons(buildInventoryTypesView(store, { mode, page: 1 })).filter((entry) => entry.callback_data.startsWith(prefix)).length, 2);
    const manyModels = { products: Array.from({ length: 9 }, (_, index) => model(`m${index}`, `Modelo ${index}`, "Cortas")) };
    const token = buttons(buildInventoryTypesView(manyModels, { mode })).find((entry) => entry.callback_data.startsWith(prefix)).callback_data.split(":").at(-2);
    const firstPage = buildInventoryProductsByTypeView(manyModels, token, 0, { mode });
    const next = buttons(firstPage).find((entry) => entry.text.includes("Siguiente"));
    assert.equal(next.callback_data, `${prefix}${token}:1`);
    const secondPage = buildInventoryProductsByTypeView(manyModels, token, 1, { mode });
    assert.match(secondPage.text, /Página 2 de 2/);
    assert.equal(buttons(secondPage).filter((entry) => entry.callback_data.startsWith(mode === "restock" ? "inv:add:product:" : "inv:product:")).length, 3);
  }
});

test("empty catalogs and obsolete or tampered type choices recover without silently choosing another type", () => {
  assert.match(buildInventoryTypesView({}).text, /No hay modelos con variantes/);
  const store = { products: [model("one", "Único", "Cortas")] };
  for (const mode of ["sale", "restock"]) {
    for (const token of [0, "-1", "missing", ""]) {
      const view = buildInventoryProductsByTypeView(store, token, 0, { mode });
      assert.match(view.text, /Vuelve a elegir/);
      assert.equal(buttons(view).some((entry) => entry.callback_data.startsWith("inv:product:") || entry.callback_data.startsWith("inv:add:product:")), false);
    }
  }
  const groups = getAvailableProductTypes([model("one", "Primero", "Otras prendas"), model("two", "Sin clasificación", "")]);
  assert.equal(groups.filter((entry) => entry.name === "Otras prendas").length, 1);
  assert.equal(groups.find((entry) => entry.name === "Otras prendas").count, 2);
});

test("sale uses type → model → variant → quantity → confirmation and returns to the same type", async () => {
  await seed([model("sale", "Modelo corto", "Cortas", 3), model("other", "Modelo largo", "Largas", 8)]);
  await callback("inv:menu", "sale-menu");
  assert.equal(button("Registrar venta").callback_data, "inv:types");
  await callback(button("Registrar venta").callback_data, "sale-types");
  const typeAction = button("Cortas").callback_data;
  await callback(typeAction, "sale-models");
  await callback(button("Modelo corto").callback_data, "sale-product");
  assert.equal(button("Modelos de Cortas").callback_data, typeAction);
  await callback(button("Azul").callback_data, "sale-color");
  await callback(button("M ·").callback_data, "sale-size");
  await callback(buttons(lastView()).find((entry) => entry.text === "2").callback_data, "sale-qty");
  assert.match(lastView().text, /Quedarán: \*1\*/);
  const confirmation = button("Registrar venta").callback_data;
  await callback(confirmation, "sale-confirm");
  assert.match(lastView().text, /Venta registrada/);
  assert.equal(button("Otro modelo del mismo tipo").callback_data, typeAction);
  await callback(confirmation, "sale-confirm-retry");
  const store = await readStore();
  assert.equal(store.products[0].variants[0].stock, 1);
  assert.equal(store.products[1].variants[0].stock, 8);
  assert.equal(store.physicalStockEvents.length, 1);
});

test("restocking reaches zero-stock models by type and never duplicates received units", async () => {
  await seed([model("zero", "Modelo agotado", "Cortas", 0), model("healthy", "Modelo saludable", "Cortas", 20)]);
  await callback("inv:menu", "add-menu", 801);
  assert.equal(button("Reponer stock").callback_data, "inv:add:types");
  await callback(button("Reponer stock").callback_data, "add-types", 801);
  const typeAction = button("Cortas").callback_data;
  await callback(typeAction, "add-models", 801);
  assert.ok(button("Modelo saludable"));
  await callback(button("Modelo agotado").callback_data, "add-product", 801);
  assert.equal(button("Modelos de Cortas").callback_data, typeAction);
  await callback(button("Azul").callback_data, "add-color", 801);
  await callback(button("M ·").callback_data, "add-size", 801);
  await callback(buttons(lastView()).find((entry) => entry.text === "+5").callback_data, "add-qty", 801);
  assert.match(lastView().text, /Stock: \*0 → 5\*/);
  const confirmation = button("Agregar 5").callback_data;
  await callback(confirmation, "add-confirm", 801);
  assert.equal(button("Otro modelo del mismo tipo").callback_data, typeAction);
  await callback(confirmation, "add-confirm-retry", 801);
  const store = await readStore();
  assert.equal(store.products[0].variants[0].stock, 5);
  assert.equal(store.products[1].variants[0].stock, 20);
  assert.equal(store.physicalStockEvents.length, 1);
});

test("the sale confirmation independently rejects zero, negative and fractional quantities", async () => {
  await seed([model("validation", "Validación", "Cortas", 3)]);
  const store = await readStore();
  const typeAction = buttons(buildInventoryTypesView(store)).find((entry) => entry.callback_data.startsWith("inv:type:"));
  const typeToken = typeAction.callback_data.split(":")[2];
  const productToken = buttons(buildInventoryProductsByTypeView(store, typeToken)).find((entry) => entry.callback_data.startsWith("inv:product:")).callback_data.split(":")[2];
  for (const quantity of [0, -2, 0.5, 101]) {
    await callback(`inv:sell:${productToken}:0:0:${quantity}`, `invalid-sale-${quantity}`, 802);
  }
  const after = await readStore();
  assert.equal(after.products[0].variants[0].stock, 3);
  assert.equal(after.physicalStockEvents.length, 0);
});
