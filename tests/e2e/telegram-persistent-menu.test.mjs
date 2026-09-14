import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test, { after } from "node:test";

const root = process.cwd();
const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), "adriego-telegram-menu-test-"));
const originalFetch = globalThis.fetch;
const values = { NODE_ENV: "test", VERCEL_ENV: "test", KV_REST_API_URL: "", KV_REST_API_TOKEN: "", TELEGRAM_BOT_TOKEN: "local-menu-test", TELEGRAM_ADMIN_CHAT_ID: "123,124,125,126", TELEGRAM_WEBHOOK_SECRET: "local-test-secret", SECURITY_LOG_ENABLED: "false" };
const originalEnv = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
process.chdir(sandbox);
Object.assign(process.env, values);
const calls = [];
let failMenu = false;
let nextMessageId = 700;
let failAnchor = false;
globalThis.fetch = async (url, options) => {
  assert.ok(String(url).startsWith("https://api.telegram.org/botlocal-menu-test/"), "No real service is contacted");
  const endpoint = String(url).split("/").at(-1);
  calls.push({ endpoint, body: JSON.parse(options.body) });
  const messageId = endpoint === "sendMessage" ? ++nextMessageId : 700;
  const ok = (!failMenu || endpoint !== "setChatMenuButton") && (!failAnchor || JSON.parse(options.body).text !== "⌂ Menú de acciones");
  return { ok, json: async () => ({ ok, result: { message_id: messageId } }) };
};
const load = (file) => import(pathToFileURL(path.join(root, file)).href);
const { default: handler, ADMIN_KEYBOARD_MARKUP } = await load("api/telegram-webhook.js");
const { TELEGRAM_MENU_COMMANDS, ensureTelegramBotCommandsRegistered } = await load("api/_lib/notifications.js");
const { readStore, updateStore } = await load("api/_lib/store.js");
after(async () => {
  globalThis.fetch = originalFetch;
  for (const key of Object.keys(values)) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
  process.chdir(root);
  await fs.rm(sandbox, { recursive: true, force: true });
});
async function seed() {
  calls.length = 0;
  await updateStore((draft) => {
    draft.orders = [];
    draft.products = [{ id: "local-model", name: "Modelo ficticio", productType: "Cortas", variants: [{ color: "Azul", size: "M", stock: 3 }] }];
    draft.meta.pendingGuidePrompts = {};
    return draft;
  });
}
async function message(text, { admin = 123, secret = "local-test-secret", reply, edited = false } = {}) {
  const response = { setHeader() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
  const before = calls.length;
  await handler({ method: "POST", headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": secret }, body: { [edited ? "edited_message" : "message"]: { message_id: 700, chat: { id: admin, type: "private" }, from: { id: admin, first_name: "Prueba" }, text, ...(reply ? { reply_to_message: { message_id: 600, text: reply } } : {}) } } }, response);
  return { ...response, calls: calls.slice(before) };
}

test("start installs only one native command and a retained toggleable keyboard with one chat message", async () => {
  await seed();
  const response = await message("/start");
  assert.equal(response.code, 200);
  assert.deepEqual(response.calls.map(({ endpoint }) => endpoint), ["setMyCommands", "setChatMenuButton", "sendMessage"]);
  assert.deepEqual(response.calls[0].body.scope, { type: "chat", chat_id: 123 });
  assert.deepEqual(response.calls[0].body.commands, TELEGRAM_MENU_COMMANDS);
  assert.deepEqual(response.calls[0].body.commands, [{ command: "start", description: "Abrir menú" }]);
  assert.deepEqual(response.calls[1].body, { chat_id: 123, menu_button: { type: "commands" } });
  const home = response.calls[2].body;
  assert.deepEqual(home.reply_markup, ADMIN_KEYBOARD_MARKUP);
  assert.equal(home.reply_markup.is_persistent, false, "Telegram should allow toggling the keyboard using its native icon");
  assert.equal(home.reply_markup.one_time_keyboard, false);
  assert.ok(!home.reply_markup.inline_keyboard);
});

test("opening the menu again reuses registration and restores keyboard in one response", async () => {
  await seed();
  for (const command of ["/menu", "⌂ Menú principal", "/start@local_bot example"]) {
    const response = await message(command);
    assert.deepEqual(response.calls.map(({ endpoint }) => endpoint), ["sendMessage"]);
    assert.deepEqual(response.calls[0].body.reply_markup, ADMIN_KEYBOARD_MARKUP);
  }
});

test("home on an older inline card restores the bottom keyboard instead of editing plain text", async () => {
  await seed();
  const response = { setHeader() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
  await handler({ method: "POST", headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": "local-test-secret" }, body: { callback_query: { id: "local-home", from: { id: 123, first_name: "Prueba" }, data: "home", message: { message_id: 600, chat: { id: 123, type: "private" } } } } }, response);
  assert.equal(response.code, 200);
  assert.equal(calls.filter(({ endpoint }) => endpoint === "sendMessage").length, 1);
  assert.equal(calls.filter(({ endpoint }) => endpoint === "editMessageText").length, 0);
  assert.deepEqual(calls.find(({ endpoint }) => endpoint === "sendMessage").body.reply_markup, ADMIN_KEYBOARD_MARKUP);
  assert.equal((await readStore()).products[0].variants[0].stock, 3);
});

test("all keyboard actions resolve to their actual feature without changing inventory", async () => {
  await seed();
  const expected = new Map([
    ["📦 Pedidos", /Pedidos/i], ["📊 Resumen", /Resumen/],
    ["🛍️ Registrar venta", /tipo/i], ["➕ Reponer stock", /tipo/i],
    ["🗂️ Inventario", /Inventario/i], ["⚠️ Stock bajo", /Stock/i],
    ["🔍 Buscar pedido", /Buscar pedido/], ["❓ Ayuda", /Comandos oficiales/],
  ]);
  for (const [label, pattern] of expected) {
    const response = await message(label);
    const sent = response.calls.filter(({ endpoint }) => endpoint === "sendMessage");
    assert.equal(sent.length, label === "🔍 Buscar pedido" ? 1 : 2, label);
    assert.deepEqual(sent.at(-1).body.reply_markup.keyboard, ADMIN_KEYBOARD_MARKUP.keyboard, "Every section leaves the lower menu available");
    assert.equal(sent.at(-1).body.reply_markup.one_time_keyboard, false);
    const view = response.calls.find(({ endpoint }) => endpoint === "sendMessage").body;
    assert.match(view.text, pattern, label);
    assert.equal((await readStore()).products[0].variants[0].stock, 3);
    if (label === "🛍️ Registrar venta" || label === "➕ Reponer stock") {
      const prefix = label === "➕ Reponer stock" ? "inv:add:type:" : "inv:type:";
      assert.ok(view.reply_markup.inline_keyboard.flat().some(({ callback_data }) => callback_data?.startsWith(prefix)));
    }
  }
});

test("menu anchors replace only the previous anchor across sections and a cold import", async () => {
  await seed();
  await message("📦 Pedidos");
  const before = await readStore();
  const oldAnchor = before.meta.telegramMenuAnchors["123"];
  const { default: coldHandler } = await import(pathToFileURL(path.join(root, "api/telegram-webhook.js")).href + "?cold-menu");
  calls.length = 0;
  const response = { setHeader() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
  await coldHandler({ method: "POST", headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": "local-test-secret" }, body: { message: { message_id: 800, chat: { id: 123, type: "private" }, from: { id: 123 }, text: "📊 Resumen" } } }, response);
  assert.equal(response.code, 200);
  const after = await readStore();
  assert.notEqual(after.meta.telegramMenuAnchors["123"], oldAnchor);
  assert.deepEqual(calls.filter(({ endpoint }) => endpoint === "deleteMessage").map(({ body }) => body.message_id), [oldAnchor]);
  assert.deepEqual(after.orders, before.orders);
  assert.deepEqual(after.products, before.products);
  const anchor = calls.filter(({ endpoint }) => endpoint === "sendMessage").at(-1).body;
  assert.deepEqual(anchor.reply_markup, ADMIN_KEYBOARD_MARKUP);
  assert.equal(anchor.disable_notification, true);
});

test("a failed menu restoration never erases the existing usable anchor", async () => {
  await seed();
  await message("📦 Pedidos");
  const oldAnchor = (await readStore()).meta.telegramMenuAnchors["123"];
  failAnchor = true;
  try {
    const response = await message("📊 Resumen");
    assert.equal(response.code, 200);
    assert.equal(response.calls.filter(({ endpoint }) => endpoint === "deleteMessage").length, 0);
    assert.equal((await readStore()).meta.telegramMenuAnchors["123"], oldAnchor);
  } finally { failAnchor = false; }
});

test("guided searches and tracking prompts retain keyboard controls while requesting a reply", async () => {
  await seed();
  for (const data of ["search-order", "inv:search", "inv:add:search", "quick_guia:ORDER-TEST:Servientrega"]) {
    calls.length = 0;
    const response = { setHeader() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
    await handler({ method: "POST", headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": "local-test-secret" }, body: { callback_query: { id: `prompt-${data}`, from: { id: 123 }, data, message: { message_id: 600, chat: { id: 123, type: "private" } } } } }, response);
    assert.equal(response.code, 200);
    const prompt = calls.find(({ endpoint }) => endpoint === "sendMessage").body;
    assert.equal(prompt.reply_markup.force_reply, true);
    assert.deepEqual(prompt.reply_markup.keyboard, ADMIN_KEYBOARD_MARKUP.keyboard);
    assert.equal(prompt.reply_markup.one_time_keyboard, false);
  }
});

test("navigation labels cannot become tracking numbers or search terms in stale replies", async () => {
  await seed();
  for (const reply of ["Buscar producto para venta física", "Buscar producto para reponer stock", "Buscar pedido", "Pedido: `ORDER-TEST` Courier: *LAAR*"]) {
    const response = await message("➕ Reponer stock", { reply });
    assert.equal(response.calls.filter(({ endpoint }) => endpoint === "editMessageText").length, 0);
    const view = response.calls.find(({ endpoint }) => endpoint === "sendMessage").body;
    assert.ok(view.reply_markup.inline_keyboard.flat().some(({ callback_data }) => callback_data?.startsWith("inv:add:type:")));
  }
});

test("unauthorized users and incorrect webhook secrets never receive admin menus", async () => {
  await seed();
  const unauthorized = await message("/start", { admin: 999 });
  assert.equal(unauthorized.body.authorized, false);
  assert.deepEqual(unauthorized.calls[0].body.reply_markup, { remove_keyboard: true });
  assert.equal(unauthorized.calls.length, 1);
  const invalidSecret = await message("/start", { secret: "wrong" });
  assert.equal(invalidSecret.code, 401);
  assert.equal(invalidSecret.calls.length, 0);
  assert.equal((await ensureTelegramBotCommandsRegistered("local-menu-test", { chatId: "999" })).ok, false);
  assert.equal((await ensureTelegramBotCommandsRegistered("local-menu-test", { chatId: "-123" })).ok, false);
});

test("parallel registrations share requests, while separate admins get their own native menu", async () => {
  await seed();
  await Promise.all([ensureTelegramBotCommandsRegistered("local-menu-test", { chatId: "124" }), ensureTelegramBotCommandsRegistered("local-menu-test", { chatId: "124" })]);
  assert.deepEqual(calls.map(({ endpoint }) => endpoint), ["setMyCommands", "setChatMenuButton"]);
  assert.equal(calls[1].body.chat_id, 124);
});

test("menu registration failure still shows keyboard and can retry instead of caching failure", async () => {
  await seed();
  failMenu = true;
  try {
    const first = await message("/start", { admin: 125 });
    assert.equal(first.calls.at(-1).endpoint, "sendMessage");
    assert.deepEqual(first.calls.at(-1).body.reply_markup, ADMIN_KEYBOARD_MARKUP);
  } finally { failMenu = false; }
  const retry = await message("/start", { admin: 125 });
  assert.deepEqual(retry.calls.map(({ endpoint }) => endpoint), ["setMyCommands", "setChatMenuButton", "sendMessage"]);
});
