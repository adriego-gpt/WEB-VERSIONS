import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'adriego-stress-'));
process.chdir(sandbox);
process.env.NODE_ENV = 'test';
process.env.VERCEL_ENV = 'test';
process.env.KV_REST_API_URL = '';
process.env.KV_REST_API_TOKEN = '';
process.env.TELEGRAM_BOT_TOKEN = 'stress-test-token';
process.env.TELEGRAM_ADMIN_CHAT_ID = '1037173906';
process.env.TELEGRAM_WEBHOOK_SECRET = 'stress-secret';
process.env.SECURITY_LOG_ENABLED = 'false';

const fromRoot = (file) => import(pathToFileURL(path.join(root, file)).href);
const { default: webhookHandler } = await fromRoot('api/telegram-webhook.js');
const { readStore, updateStore } = await fromRoot('api/_lib/store.js');
const { escapeTelegramMarkdown } = await fromRoot('api/_lib/notifications.js');
const { catalogToCsv, parseCatalogCsv } = await fromRoot('src/domain/admin/catalogCsv.js');

const recordedFetches = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options = {}) => {
  const endpoint = String(url).split('/').pop();
  let body = null;
  if (typeof options.body === 'string') {
    try { body = JSON.parse(options.body); } catch { body = options.body; }
  } else if (options.body) {
    body = options.body;
  }
  recordedFetches.push({ endpoint, url: String(url), body, options });
  return {
    ok: true,
    json: async () => ({ ok: true, result: { message_id: Math.floor(Math.random() * 100000) + 1 } }),
  };
};

async function postWebhook(body, secret = 'stress-secret') {
  const res = {
    statusCode: 200,
    headers: {},
    setHeader(name, val) { this.headers[name] = val; },
    status(code) { this.statusCode = code; return this; },
    json(data) { this.data = data; return this; },
  };
  await webhookHandler({
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-telegram-bot-api-secret-token': secret,
    },
    body,
  }, res);
  return res;
}

test('Exhaustive Telegram Bot & Inventory Stress Testing', async (t) => {
  test.after(async () => {
    globalThis.fetch = originalFetch;
    process.chdir(root);
    await fs.rm(sandbox, { recursive: true, force: true });
  });

  await t.test('1. Security: Tampered secrets, strangers, and invalid methods', async () => {
    // Wrong secret token
    const r1 = await postWebhook({ message: { chat: { id: 1037173906 }, text: '/menu' } }, 'wrong-secret');
    assert.equal(r1.statusCode, 401);

    // Empty secret
    const r2 = await postWebhook({ message: { chat: { id: 1037173906 }, text: '/menu' } }, '');
    assert.equal(r2.statusCode, 401);

    // Stranger Chat ID blocked
    recordedFetches.length = 0;
    const r3 = await postWebhook({ message: { chat: { id: 999999 }, text: '/menu' } });
    assert.equal(r3.statusCode, 200);
    assert.equal(r3.data.authorized, false);
    assert.match(recordedFetches[0].body.text, /Acceso Restringido/);

    // Callback query from unauthorized user rejected
    recordedFetches.length = 0;
    const r4 = await postWebhook({ callback_query: { id: 'cb-stranger', from: { id: 999999 }, data: 'home' } });
    assert.equal(r4.statusCode, 200);
    assert.equal(r4.data.authorized, false);
    assert.equal(recordedFetches[0].endpoint, 'answerCallbackQuery');
    assert.match(recordedFetches[0].body.text, /Acci[oó]n no autorizada/);
  });

  await t.test('2. Boundary: Malformed, partial, and empty Telegram updates', async () => {
    // Empty body or null: acknowledged as skipped 200 to prevent Telegram retry loop
    const rNull = await postWebhook(null);
    assert.equal(rNull.statusCode, 200);
    assert.equal(rNull.data.skipped, true);

    // Update without message or callback_query
    const rEmpty = await postWebhook({});
    assert.equal(rEmpty.statusCode, 200);
    assert.equal(rEmpty.data.skipped, true);

    // Message without text
    const rNoText = await postWebhook({ message: { chat: { id: 1037173906 } } });
    assert.equal(rNoText.statusCode, 200);

    // Message with only whitespace
    const rSpaces = await postWebhook({ message: { chat: { id: 1037173906 }, text: '     ' } });
    assert.equal(rSpaces.statusCode, 200);
  });

  await t.test('3. Markdown Escaping Stress: Extreme hostile characters in all fields', () => {
    const hostileInputs = [
      'Vestido *Super* _Elegante_ [Link](http://bad) `Code` ~Strike~ @user #tag | Pipe || Spoilers',
      '\\\\\\***[[[(((123)))***]]]',
      '<script>alert(1)</script> ${process.env} `${injection}`',
      'Prenda con _ y * y ` y [ y ] y \\ al azar',
    ];

    for (const input of hostileInputs) {
      const escaped = escapeTelegramMarkdown(input);
      assert.doesNotMatch(escaped, /(?<!\\)\*/, `Unescaped asterisk in: ${input}`);
      assert.doesNotMatch(escaped, /(?<!\\)_/, `Unescaped underscore in: ${input}`);
      assert.doesNotMatch(escaped, /(?<!\\)`/, `Unescaped backtick in: ${input}`);
      assert.doesNotMatch(escaped, /(?<!\\)\[/, `Unescaped opening bracket in: ${input}`);
    }
  });

  await t.test('4. Physical Sales & Inventory Concurrency: Zero oversell under rapid load', async () => {
    await updateStore((draft) => {
      draft.products = [
        {
          id: 'prod-stress',
          name: 'Jean Skinny',
          variants: [
            { color: 'Negro', size: '30', stock: 5 },
            { color: 'Negro', size: '32', stock: 2 },
          ],
        },
      ];
      draft.physicalStockEvents = [];
      return draft;
    });

    // 10 concurrent requests trying to buy 1 unit of stock 5
    const requests = Array.from({ length: 10 }, (_, i) => (
      postWebhook({
        message: {
          message_id: 1000 + i,
          chat: { id: 1037173906 },
          text: '/venta Jean Skinny | Negro | 30 | 1',
        },
      })
    ));

    await Promise.all(requests);

    const store = await readStore();
    const product = store.products.find((p) => p.id === 'prod-stress');
    const variant30 = product.variants.find((v) => v.size === '30');

    // Exactly 5 purchases must succeed, stock must not drop below 0
    assert.equal(variant30.stock, 0, 'Stock must not drop below 0');
    assert.equal(store.physicalStockEvents.length, 5, 'Exactly 5 sales events must be recorded');

    // Try selling when stock is 0
    const failSale = await postWebhook({
      message: {
        message_id: 2000,
        chat: { id: 1037173906 },
        text: '/venta Jean Skinny | Negro | 30 | 1',
      },
    });
    assert.equal(failSale.statusCode, 200);

    const storeAfter = await readStore();
    const vAfter = storeAfter.products[0].variants.find((v) => v.size === '30');
    assert.equal(vAfter.stock, 0);
  });

  await t.test('5. Undo Sales Idempotency: Prevent duplicate rollbacks under concurrent replays', async () => {
    const store = await readStore();
    const eventToUndo = store.physicalStockEvents[0];
    assert.ok(eventToUndo);

    recordedFetches.length = 0;
    // 5 concurrent attempts to undo the exact same event
    const undoAttempts = Array.from({ length: 5 }, (_, i) => (
      postWebhook({
        callback_query: {
          id: `cb-undo-${i}`,
          from: { id: 1037173906 },
          message: { message_id: 3000, chat: { id: 1037173906 } },
          data: `undo-stock:${eventToUndo.id}`,
        },
      })
    ));

    await Promise.all(undoAttempts);

    const storeAfterUndo = await readStore();
    const product = storeAfterUndo.products.find((p) => p.id === 'prod-stress');
    const variant30 = product.variants.find((v) => v.size === '30');

    // Exactly 1 unit must have been restored (0 -> 1), NOT 5 units!
    assert.equal(variant30.stock, 1, 'Stock must only increment once despite 5 concurrent undo clicks');
  });

  await t.test('6. Guided Flow: Out-of-bounds tokens, tampered callback parameters', async () => {
    // Non-existent product token
    const rBadToken = await postWebhook({
      callback_query: {
        id: 'cb-bad-token',
        from: { id: 1037173906 },
        message: { message_id: 4001, chat: { id: 1037173906 } },
        data: 'inv:product:TOKENINEXISTENTE',
      },
    });
    assert.equal(rBadToken.statusCode, 200);

    // Invalid color index
    const rBadColor = await postWebhook({
      callback_query: {
        id: 'cb-bad-color',
        from: { id: 1037173906 },
        message: { message_id: 4002, chat: { id: 1037173906 } },
        data: 'inv:color:FAKE:999',
      },
    });
    assert.equal(rBadColor.statusCode, 200);

    // Invalid size index
    const rBadSize = await postWebhook({
      callback_query: {
        id: 'cb-bad-size',
        from: { id: 1037173906 },
        message: { message_id: 4003, chat: { id: 1037173906 } },
        data: 'inv:size:FAKE:999:999',
      },
    });
    assert.equal(rBadSize.statusCode, 200);

    // Invalid quantity
    const rBadQty = await postWebhook({
      callback_query: {
        id: 'cb-bad-qty',
        from: { id: 1037173906 },
        message: { message_id: 4004, chat: { id: 1037173906 } },
        data: 'inv:qty:FAKE:0:0:-5',
      },
    });
    assert.equal(rBadQty.statusCode, 200);
  });

  await t.test('7. Guide Assignment: Complex multi-word couriers, colons in tracking, and edge cases', async () => {
    await updateStore((draft) => {
      draft.orders = [
        {
          code: 'ORDER-SPECIAL-1',
          customerName: 'Cliente Especial',
          deliveryType: 'delivery',
          status: 'Pendiente',
          guideNumber: '',
        },
      ];
      return draft;
    });

    // Case 1: `/guia ORDER-SPECIAL-1 Servientrega 1792837465`
    await postWebhook({
      message: {
        message_id: 5001,
        chat: { id: 1037173906 },
        text: '/guia ORDER-SPECIAL-1 Servientrega 1792837465',
      },
    });
    let s = await readStore();
    let o = s.orders.find((x) => x.code === 'ORDER-SPECIAL-1');
    assert.equal(o.status, 'Enviado');
    assert.equal(o.courierName, 'Servientrega');
    assert.equal(o.guideNumber, '1792837465');

    // Case 2: Tracking number formatted as "Tramaco:998877"
    await postWebhook({
      message: {
        message_id: 5002,
        chat: { id: 1037173906 },
        text: '/guia ORDER-SPECIAL-1 Tramaco:998877',
      },
    });
    s = await readStore();
    o = s.orders.find((x) => x.code === 'ORDER-SPECIAL-1');
    assert.equal(o.courierName, 'Tramaco');
    assert.equal(o.guideNumber, '998877');

    // Case 3: Incomplete command returns helpful usage prompt
    recordedFetches.length = 0;
    await postWebhook({
      message: {
        message_id: 5003,
        chat: { id: 1037173906 },
        text: '/guia',
      },
    });
    assert.match(recordedFetches[0].body.text, /Uso del comando \/guia/);
  });

  await t.test('8. Catalog Domain: CSV Round-trip with exotic UTF-8 names, commas and quotes', () => {
    const complexProducts = [
      {
        id: 'p-utf8',
        name: 'Vestido "Bordado" con Flores, Seda & Algodón - Edición Ñandú',
        price: 89.99,
        originalPrice: 110.0,
        category: 'Vestidos de Fiesta',
        published: true,
        variants: [
          { color: 'Rojo Carmesí', size: 'M', stock: 10 },
          { color: 'Verde Esmeralda', size: 'L', stock: 5 },
        ],
        imagesByColor: {
          'Rojo Carmesí': ['https://example.com/rojo.jpg'],
          'Verde Esmeralda': ['https://example.com/verde.jpg'],
        },
      },
    ];

    const csvOutput = catalogToCsv(complexProducts);
    assert.ok(csvOutput.includes('""Bordado""'));
    assert.ok(csvOutput.includes('Edición Ñandú'));

    const parsed = parseCatalogCsv(csvOutput);
    assert.equal(parsed.errors.length, 0);
    assert.equal(parsed.products.length, 1);
    assert.equal(parsed.products[0].name, 'Vestido "Bordado" con Flores, Seda & Algodón - Edición Ñandú');
    assert.equal(parsed.products[0].variants.length, 2);
    assert.equal(parsed.products[0].isPublic, true);
  });
});
