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
globalThis.fetch = async (url, options) => {
  assert.ok(String(url).startsWith("https://api.telegram.org/botlocal-menu-test/"), "No real service is contacted");
  const endpoint = String(url).split("/").at(-1);
  calls.push({ endpoint, body: JSON.parse(options.body) });
  return { ok: !failMenu || endpoint !== "setChatMenuButton", json: async () => ({ ok: !failMenu || endpoint !== "setChatMenuButton", result: { message_id: 700 } }) };
};
const load = (file) => import(pathToFileURL(path.join(root, file)).href);
const { default: handler, ADMIN_KEYBOARD_MARKUP } = await load("api/telegram-webhook.js");
const { TELEGRAM_BOT_COMMANDS, ensureTelegramBotCommandsRegistered } = await load("api/_lib/notifications.js");
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

test("start installs both the native command menu and persistent keyboard with one chat message", async () => {
  await seed();
  const response = await message("/start");
  assert.equal(response.code, 200);
  assert.deepEqual(response.calls.map(({ endpoint }) => endpoint), ["setMyCommands", "setChatMenuButton", "sendMessage"]);
  assert.deepEqual(response.calls[0].body.scope, { type: "chat", chat_id: 123 });
  assert.deepEqual(response.calls[0].body.commands, TELEGRAM_BOT_COMMANDS);
  assert.equal(TELEGRAM_BOT_COMMANDS[0].command, "start");
  assert.deepEqual(response.calls[1].body, { chat_id: 123, menu_button: { type: "commands" } });
  const home = response.calls[2].body;
  assert.deepEqual(home.reply_markup, ADMIN_KEYBOARD_MARKUP);
  assert.equal(home.reply_markup.is_persistent, true);
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
    assert.equal(response.calls.filter(({ endpoint }) => endpoint === "sendMessage").length, 1, label);
    const view = response.calls.find(({ endpoint }) => endpoint === "sendMessage").body;
    assert.match(view.text, pattern, label);
    assert.equal((await readStore()).products[0].variants[0].stock, 3);
    if (label === "🛍️ Registrar venta" || label === "➕ Reponer stock") {
      const prefix = label === "➕ Reponer stock" ? "inv:add:type:" : "inv:type:";
      assert.ok(view.reply_markup.inline_keyboard.flat().some(({ callback_data }) => callback_data?.startsWith(prefix)));
    }
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
