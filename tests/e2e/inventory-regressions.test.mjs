import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test, { after } from "node:test";

const root = process.cwd();
const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), "adriego-inventory-"));
process.chdir(sandbox);
process.env.NODE_ENV = "test";
process.env.VERCEL_ENV = "test";
process.env.KV_REST_API_URL = "";
process.env.KV_REST_API_TOKEN = "";
process.env.TELEGRAM_BOT_TOKEN = "test-token";
process.env.TELEGRAM_ADMIN_CHAT_ID = "123";
process.env.TELEGRAM_WEBHOOK_SECRET = "test-webhook-secret";
process.env.SECURITY_LOG_ENABLED = "false";
const originalFetch = globalThis.fetch;
const messages = [];
globalThis.fetch = async (_url, options) => {
  messages.push(JSON.parse(options.body));
  return { ok: true, json: async () => ({ ok: true }) };
};
const fromRoot = (file) => import(pathToFileURL(path.join(root, file)).href);
const { default: handler } = await fromRoot("api/telegram-webhook.js");
const { readStore, updateStore } = await fromRoot("api/_lib/store.js");
const { sanitizeProducts } = await fromRoot("api/_lib/storeSanitizers.js");
const { catalogToCsv, parseCatalogCsv } = await fromRoot("src/domain/admin/catalogCsv.js");
after(async () => {
  globalThis.fetch = originalFetch;
  process.chdir(root);
  await fs.rm(sandbox, { recursive: true, force: true });
});
async function call(body, secret = "test-webhook-secret") {
  const res = { code: 200, setHeader() {}, status(code) { this.code = code; return this; }, json(payload) { this.payload = payload; return this; } };
  await handler({ method: "POST", headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": secret }, body }, res);
  return res;
}
const message = (id, text) => ({ message: { message_id: id, chat: { id: 123 }, text } });
const callback = (id, data) => ({ callback_query: { id, from: { id: 123 }, message: { chat: { id: 123 } }, data } });
const lastBotMessage = () => messages.slice().reverse().find((entry) => entry.chat_id && entry.text && entry.text !== "⌂ Menú de acciones");

test("physical sale and undo are persisted, idempotent and reject forged requests", async () => {
  await updateStore((draft) => {
    draft.products = [{ id: "p1", name: "Clasica", variants: [{ color: "Azul", size: "M", stock: 5 }] }];
    return draft;
  });
  const sale = message(1, "/venta Clasica | Azul | M | 1");
  assert.equal((await call(sale, "wrong")).code, 401);
  delete process.env.TELEGRAM_WEBHOOK_SECRET;
  assert.equal((await call(message(90, "/stock Clasica"), "")).code, 503);
  process.env.TELEGRAM_WEBHOOK_SECRET = "test-webhook-secret";
  assert.equal((await readStore()).products[0].variants[0].stock, 5);
  await Promise.all([call(sale), call(sale)]);
  let store = await readStore();
  assert.equal(store.products[0].variants[0].stock, 4);
  assert.equal(store.products[0].stockBySize.M, 4);
  assert.equal(store.physicalStockEvents.length, 1);
  assert.equal(store.meta.realtime.catalogVersion, 1);
  await call({ edited_message: sale.message });
  assert.equal((await readStore()).products[0].variants[0].stock, 4);
  await call(message(2, "/venta Clasica | Azul | M | 20"));
  assert.equal((await readStore()).products[0].variants[0].stock, 4);
  await call(message(3, "/stock Clasica"));
  assert.match(lastBotMessage().text, /Stock disponible/);
  const eventId = store.physicalStockEvents[0].id;
  const undo = { callback_query: { id: "cb1", from: { id: 123 }, data: `undo-stock:${eventId}` } };
  await call(undo);
  await call(undo);
  store = await readStore();
  assert.equal(store.products[0].variants[0].stock, 5);
  assert.equal(store.meta.realtime.catalogVersion, 2);
  await call(message(4, "/venta Clasica | Azul | M | 1"));
  await call(message(5, "/venta Clasica | Azul | M | 1"));
  await call(message(6, "/deshacer venta"));
  await call(message(6, "/deshacer venta"));
  assert.equal((await readStore()).products[0].variants[0].stock, 4);
});

test("photo views survive server sanitation and stay aligned after empty images", () => {
  const product = { name: "Clasica", price: 35, variants: [{ color: "Azul", size: "M", stock: 2 }],
    imagesByColor: { Azul: ["", "https://example.com/front.jpg", "https://example.com/back.jpg"] },
    imageViewsByColor: { Azul: ["", "Frontal", "Posterior"] } };
  const saved = sanitizeProducts([product])[0];
  assert.deepEqual(saved.imageViewsByColor.Azul, ["Frontal", "Posterior"]);
  assert.deepEqual(sanitizeProducts([saved])[0].imageViewsByColor, saved.imageViewsByColor);
  const imported = parseCatalogCsv(catalogToCsv([saved]));
  assert.deepEqual(imported.errors, []);
  assert.deepEqual(imported.products[0].imageViewsByColor, saved.imageViewsByColor);
  product.imageViewsByColor.Azul[1] = "<script>bad</script>";
  assert.equal(sanitizeProducts([product])[0].imageViewsByColor.Azul[0], "");
});

test("guided Telegram inventory selects product, variant and quantity without duplicate sales", async () => {
  await updateStore((draft) => {
    draft.products = [{
      id: "guided-product",
      name: "Chompa Clasica",
      variants: [
        { color: "Azul", size: "S", stock: 3 },
        { color: "Azul", size: "M", stock: 2 },
        { color: "Rojo", size: "S", stock: 0 },
      ],
    }];
    draft.physicalStockEvents = [];
    return draft;
  });

  await call(message(20, "🛍️ Inventario físico"));
  assert.equal(lastBotMessage().reply_markup.inline_keyboard[0][0].callback_data, "inv:types");
  await call(callback("guided-search", "inv:search"));
  const prompt = lastBotMessage().text;
  await call({ message: { message_id: 21, chat: { id: 123 }, text: "Clasica", reply_to_message: { text: prompt } } });
  const productAction = lastBotMessage().reply_markup.inline_keyboard[0][0].callback_data;
  assert.match(productAction, /^inv:product:/);
  await call(callback("guided-product", productAction));
  const colorAction = lastBotMessage().reply_markup.inline_keyboard[0][0].callback_data;
  assert.match(colorAction, /^inv:color:/);
  await call(callback("guided-color", colorAction));
  const sizeAction = lastBotMessage().reply_markup.inline_keyboard[0][0].callback_data;
  assert.match(sizeAction, /^inv:size:/);
  await call(callback("guided-size", sizeAction));
  const quantityAction = lastBotMessage().reply_markup.inline_keyboard[0][1].callback_data;
  assert.match(quantityAction, /:2$/);
  await call(callback("guided-quantity", quantityAction));
  const confirmAction = lastBotMessage().reply_markup.inline_keyboard[0][0].callback_data;
  assert.match(confirmAction, /^inv:sell:/);
  await call(callback("guided-confirm", confirmAction));
  await call(callback("guided-confirm", confirmAction));
  let store = await readStore();
  assert.equal(store.products[0].variants[0].stock, 1);
  assert.equal(store.physicalStockEvents.length, 1);

  await call(callback("guided-restock", "inv:restock"));
  assert.match(lastBotMessage().text, /Reponer stock/);
  await call(callback("guided-undo", "inv:undo-last"));
  await call(callback("guided-undo", "inv:undo-last"));
  store = await readStore();
  assert.equal(store.products[0].variants[0].stock, 3);
});
