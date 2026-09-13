import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test, { after } from "node:test";

const root = process.cwd();
const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), "adriego-telegram-order-actions-"));
const originalFetch = globalThis.fetch;
const names = ["NODE_ENV", "VERCEL_ENV", "KV_REST_API_URL", "KV_REST_API_TOKEN", "TELEGRAM_BOT_TOKEN", "TELEGRAM_ADMIN_CHAT_ID", "TELEGRAM_WEBHOOK_SECRET", "SECURITY_LOG_ENABLED"];
const originalEnv = Object.fromEntries(names.map((name) => [name, process.env[name]]));
process.chdir(sandbox);
Object.assign(process.env, { NODE_ENV: "test", VERCEL_ENV: "test", KV_REST_API_URL: "", KV_REST_API_TOKEN: "", TELEGRAM_BOT_TOKEN: "test-token", TELEGRAM_ADMIN_CHAT_ID: "123,124", TELEGRAM_WEBHOOK_SECRET: "test-secret", SECURITY_LOG_ENABLED: "false" });
const calls = [];
globalThis.fetch = async (url, options) => {
  assert.ok(String(url).startsWith("https://api.telegram.org/bottest-token/"), "tests never contact real services");
  calls.push({ endpoint: String(url).split("/").pop(), body: JSON.parse(options.body) });
  return { ok: true, json: async () => ({ ok: true, result: { message_id: 800 } }) };
};
const webhookUrl = pathToFileURL(path.join(root, "api/telegram-webhook.js")).href;
const { default: handler, buildPendingOrdersView } = await import(webhookUrl);
const { readStore, updateStore } = await import(pathToFileURL(path.join(root, "api/_lib/store.js")).href);
const { buildTelegramOrderKeyboard } = await import(pathToFileURL(path.join(root, "api/_lib/notifications.js")).href);
after(async () => {
  globalThis.fetch = originalFetch;
  for (const name of names) {
    if (originalEnv[name] === undefined) delete process.env[name];
    else process.env[name] = originalEnv[name];
  }
  process.chdir(root);
  await fs.rm(sandbox, { recursive: true, force: true });
});
const order = (status = "Pendiente", reservation = "reserved") => ({ id: "test-order", code: "ORDER-TEST", status, customerName: "Solo prueba", paymentProof: "data:image/png;base64,dGVzdA==", items: [{ id: "p1", color: "Azul", size: "M", quantity: 3 }], stockReservation: { state: reservation }, createdAt: "2026-09-13T00:00:00.000Z" });
async function seed(status, reservation) {
  calls.length = 0;
  await updateStore((draft) => {
    draft.products = [{ id: "p1", name: "Prueba", sizes: ["M"], variants: [{ color: "Azul", size: "M", stock: 2 }] }];
    draft.orders = [order(status, reservation), { ...order(), id: "keep-order", code: "ORDER-KEEP" }];
    draft.meta.telegramOrderDeletions = {};
    return draft;
  });
}
async function callback(data, { admin = 123, chat = admin, message = 800, secret = "test-secret", overrideHandler = handler } = {}) {
  const response = { setHeader() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
  const start = calls.length;
  await overrideHandler({ method: "POST", headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": secret }, body: { callback_query: { id: `callback-${calls.length}`, from: { id: admin }, message: { message_id: message, chat: { id: chat } }, data } } }, response);
  if (response.code === 200 && admin !== 999 && admin === chat) {
    const updates = calls.slice(start);
    assert.equal(updates.filter((call) => call.endpoint === "sendMessage").length, 0);
    for (const call of updates.filter((entry) => entry.endpoint === "editMessageText")) {
      for (const button of call.body.reply_markup.inline_keyboard.flat()) assert.ok(Buffer.byteLength(button.callback_data || "", "utf8") <= 64);
    }
  }
  return response;
}
const lastView = () => calls.findLast((call) => call.endpoint === "editMessageText")?.body;
const button = (prefix) => lastView().reply_markup.inline_keyboard.flat().find((entry) => entry.callback_data?.startsWith(prefix)).callback_data;
const stock = async () => (await readStore()).products[0].variants[0].stock;

test("order cards offer confirmation only while pending and deletion for every state", () => {
  for (const status of ["Pendiente", "Confirmado", "Preparando", "Enviado", "Listo para retiro", "Entregado", "Cancelado"]) {
    const actions = buildTelegramOrderKeyboard(order(status)).inline_keyboard.flat();
    assert.equal(actions.some((entry) => entry.callback_data === "status:confirmed:ORDER-TEST"), status === "Pendiente");
    assert.ok(actions.some((entry) => entry.callback_data === "order-delete:request:ORDER-TEST"));
  }
});

test("confirmation persists, remains in pending work, preserves stock and is idempotent", async () => {
  await seed();
  await callback("status:confirmed:ORDER-TEST");
  const store = await readStore();
  assert.equal(store.orders[0].status, "Confirmado");
  assert.equal(store.orders[0].stockReservation.state, "reserved");
  assert.equal(await stock(), 2);
  assert.ok(buildPendingOrdersView(store.orders).reply_markup.inline_keyboard.flat().some((entry) => entry.callback_data === "view:ORDER-TEST"));
  await callback("status:confirmed:ORDER-TEST");
  assert.equal((await readStore()).meta.realtime.ordersVersion, store.meta.realtime.ordersVersion);
  assert.equal(await stock(), 2);
});

test("old confirmation buttons cannot reactivate canceled or regress advanced orders", async () => {
  for (const [status, reservation] of [["Cancelado", "released"], ["Pendiente", "released"], ["Enviado", "reserved"], ["Entregado", "reserved"]]) {
    await seed(status, reservation);
    await callback("status:confirmed:ORDER-TEST");
    assert.equal((await readStore()).orders[0].status, status);
    assert.equal(await stock(), 2);
    assert.match(lastView().text, /No se cambió su estado/);
  }
});

test("requesting deletion does not delete anything and cancellation keeps the order", async () => {
  await seed();
  await callback("order-delete:request:ORDER-TEST");
  assert.equal((await readStore()).orders.length, 2);
  assert.equal(await stock(), 2);
  assert.match(lastView().text, /no se puede deshacer/);
  await callback(button("order-delete:cancel:"));
  assert.equal((await readStore()).orders.length, 2);
  assert.equal(await stock(), 2);
  assert.equal(Object.keys((await readStore()).meta.telegramOrderDeletions).length, 0);
});

test("confirmation is bound to administrator, message, nonce and expiry", async () => {
  await seed();
  await callback("order-delete:request:ORDER-TEST");
  const confirm = button("order-delete:confirm:");
  for (const options of [{ admin: 124 }, { message: 801 }, { admin: 999 }, { secret: "wrong" }, { chat: 456 }]) {
    await callback(confirm, options);
    assert.equal((await readStore()).orders.length, 2);
    assert.equal(await stock(), 2);
  }
  await callback("order-delete:confirm:forged");
  await updateStore((draft) => { draft.meta.telegramOrderDeletions["123"].expiresAt = 1; return draft; });
  await callback(confirm);
  assert.equal((await readStore()).orders.length, 2);
  assert.match(lastView().text, /vencida/);
});

test("changed orders require a fresh deletion decision", async () => {
  await seed();
  await callback("order-delete:request:ORDER-TEST");
  const confirm = button("order-delete:confirm:");
  await updateStore((draft) => { draft.orders[0].status = "Confirmado"; return draft; });
  await callback(confirm);
  assert.equal((await readStore()).orders.length, 2);
  assert.equal(await stock(), 2);
  assert.match(lastView().text, /cambió/);
});

test("deletion survives a cold webhook import, cleans its order and restores stock once", async () => {
  await seed();
  await callback("order-delete:request:ORDER-TEST");
  const confirm = button("order-delete:confirm:");
  const { default: coldHandler } = await import(`${webhookUrl}?cold-order-action`);
  await callback(confirm, { overrideHandler: coldHandler });
  const store = await readStore();
  assert.deepEqual(store.orders.map((entry) => entry.id), ["keep-order"]);
  assert.equal(store.orders[0].paymentProof, order().paymentProof, "another order's proof stays intact");
  assert.equal(await stock(), 5);
  assert.equal(store.products[0].stockBySize.M, 5);
  assert.match(lastView().text, /eliminado/);
  await callback(confirm);
  assert.equal(await stock(), 5);
});

test("concurrent deletion confirmations never restore inventory twice", async () => {
  await seed();
  await callback("order-delete:request:ORDER-TEST");
  const confirm = button("order-delete:confirm:");
  await Promise.all([callback(confirm), callback(confirm)]);
  assert.equal(await stock(), 5);
  assert.equal((await readStore()).orders.length, 1);
});

test("deleting an already released order does not add its inventory again", async () => {
  await seed("Cancelado", "released");
  await callback("order-delete:request:ORDER-TEST");
  await callback(button("order-delete:confirm:"));
  assert.equal(await stock(), 2);
  assert.equal((await readStore()).orders.length, 1);
});

test("persistence failures never display a successful confirmation or deletion", async () => {
  await seed();
  await callback("order-delete:request:ORDER-TEST");
  const confirm = button("order-delete:confirm:");
  process.env.NODE_ENV = "production";
  try {
    await callback("status:confirmed:ORDER-TEST");
    assert.match(lastView().text, /No pudimos guardar/);
    await callback(confirm);
    assert.match(lastView().text, /No pudimos completar/);
  } finally {
    process.env.NODE_ENV = "test";
  }
  assert.equal((await readStore()).orders[0].status, "Pendiente");
  assert.equal((await readStore()).orders.length, 2);
  assert.equal(await stock(), 2);
});
