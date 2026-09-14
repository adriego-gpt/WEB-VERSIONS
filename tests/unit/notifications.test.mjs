import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const originalCwd = process.cwd();
const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'adriego-notifications-'));
process.chdir(sandbox);
process.env.NODE_ENV = 'test';
process.env.VERCEL_ENV = 'test';
process.env.KV_REST_API_URL = '';
process.env.KV_REST_API_TOKEN = '';
after(async () => { process.chdir(originalCwd); await fs.rm(sandbox, { recursive: true, force: true }); });
const {
  formatTelegramOrderMessage,
  buildTelegramOrderKeyboard,
  sendTelegramStockDigest,
  sendTelegramNotification,
  sendN8nWebhook,
  dispatchOrderNotifications,
  isAuthorizedAdminChatId,
  escapeTelegramMarkdown,
  TELEGRAM_BOT_COMMANDS,
  registerTelegramBotCommands,
} = await import('../../api/_lib/notifications.js');
const { default: webhookHandler,
  deleteTelegramMessage,
  sendTelegramMessage,
  editTelegramMessage,
  sendTelegramPhoto,
  buildSummaryView,
  buildLowStockView,
  buildPendingOrdersView,
  buildAdminHome,
  buildInventoryMenu,
  buildInventoryTypesView,
  buildInventoryProductsByTypeView,
  buildInventoryInStockView,
  buildInventoryRestockView,
  getAvailableProductTypes,
  getProductTotalStock,
  formatHelpMessage,
  PENDING_GUIDE_PROMPTS,
} = await import('../../api/telegram-webhook.js');
const { updateStore, readStore } = await import('../../api/_lib/store.js');

test('Order Notifications Engine (Telegram & n8n)', async (t) => {
  const sampleOrder = {
    code: 'ORDER-10099',
    customerName: 'Adrian Narvaez',
    customerPhone: '0991234567',
    customerEmail: 'adrian@test.local',
    deliveryType: 'delivery',
    deliveryIdNumber: '1723456789',
    deliveryCity: 'Quito',
    deliveryAddress: 'Av. Amazonas y Naciones Unidas',
    deliveryReference: 'Frente al parque La Carolina',
    paymentMethod: 'bank_transfer',
    paymentMethodLabel: 'Transferencia bancaria',
    paymentBankAccount: { bankName: 'Banco Pichincha' },
    items: [
      { name: 'Vestido Midi Satin', color: 'Rojo', size: 'S', quantity: 1, price: 79.99 },
      { name: 'Blusa Seda', color: 'Blanco', size: 'M', quantity: 2, price: 35.00 },
    ],
    itemCount: 3,
    subtotal: 149.99,
    discountAmount: 15.00,
    couponCode: 'ADRIEGO10',
    paymentFeeAmount: 0,
    total: 134.99,
    paymentProof: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  };

  await t.test('1. formatTelegramOrderMessage generates a compact operational card', () => {
    const formatted = formatTelegramOrderMessage(sampleOrder);
    assert.match(formatted, /ORDER\\-10099/);
    assert.match(formatted, /Adrian Narvaez/);
    assert.match(formatted, /0991234567/);
    assert.match(formatted, /Envío · Quito/);
    assert.match(formatted, /Quito/);
    assert.doesNotMatch(formatted, /Av\. Amazonas/);
    assert.match(formatted, /Banco Pichincha/);
    assert.match(formatted, /Vestido Midi Satin/);
    assert.match(formatted, /Blusa Seda/);
    assert.match(formatted, /ADRIEGO10/);
    assert.match(formatted, /Comprobante adjunto/);
    assert.match(formatted, /\$134,99|\$134\.99/);
  });

  await t.test('2. Handles pickup delivery orders without shipping address cleanly', () => {
    const pickupOrder = {
      code: 'ORDER-10100',
      customerName: 'Cliente Local',
      deliveryType: 'pickup',
      pickupAddress: 'Centro Comercial El Tejar',
      items: [{ name: 'Falda Plisada', color: 'Negro', size: 'M', quantity: 1, price: 45 }],
      subtotal: 45,
      total: 45,
    };
    const formatted = formatTelegramOrderMessage(pickupOrder);
    assert.match(formatted, /Retiro · Centro Comercial El Tejar/);
    assert.match(formatted, /Centro Comercial El Tejar/);
    assert.doesNotMatch(formatted, /Cédula\/RUC/);
  });

  await t.test('3. Strict Authorization: verifies admin Chat ID and rejects strangers', () => {
    const prev = process.env.TELEGRAM_ADMIN_CHAT_ID;
    process.env.TELEGRAM_ADMIN_CHAT_ID = '1037173906';
    try {
      assert.equal(isAuthorizedAdminChatId('1037173906'), true);
      assert.equal(isAuthorizedAdminChatId('9999999999'), false);
      assert.equal(isAuthorizedAdminChatId(''), false);
      assert.equal(isAuthorizedAdminChatId(null), false);
    } finally {
      if (prev) process.env.TELEGRAM_ADMIN_CHAT_ID = prev;
      else delete process.env.TELEGRAM_ADMIN_CHAT_ID;
    }
  });

  await t.test('4. Markdown escaping safely neutralizes special characters', () => {
    const dangerous = 'Test *Bold* _Italic_ [Link](http)';
    const escaped = escapeTelegramMarkdown(dangerous);
    assert.doesNotMatch(escaped, /(?<!\\)\*/);
    assert.doesNotMatch(escaped, /(?<!\\)_/);
    assert.doesNotMatch(escaped, /(?<!\\)\[/);
  });

  await t.test('5. sendTelegramNotification strictly blocks sending to unauthorized chat IDs', async () => {
    const prevChat = process.env.TELEGRAM_ADMIN_CHAT_ID;
    const prevToken = process.env.TELEGRAM_BOT_TOKEN;
    process.env.TELEGRAM_ADMIN_CHAT_ID = '1037173906';
    process.env.TELEGRAM_BOT_TOKEN = 'test-token-123';
    try {
      const unauthorizedResult = await sendTelegramNotification(sampleOrder, { chatId: '9999999999' });
      assert.equal(unauthorizedResult.ok, false);
      assert.equal(unauthorizedResult.message, 'Unauthorized recipient');
    } finally {
      if (prevChat) process.env.TELEGRAM_ADMIN_CHAT_ID = prevChat;
      else delete process.env.TELEGRAM_ADMIN_CHAT_ID;
      if (prevToken) process.env.TELEGRAM_BOT_TOKEN = prevToken;
      else delete process.env.TELEGRAM_BOT_TOKEN;
    }
  });

  await t.test('6. sendN8nWebhook includes cryptographic HMAC signature header when dispatched', async () => {
    const originalUrl = process.env.N8N_ORDER_WEBHOOK_URL;
    const originalSecret = process.env.N8N_WEBHOOK_SECRET;
    process.env.N8N_ORDER_WEBHOOK_URL = 'http://127.0.0.1:59999/fake-n8n';
    process.env.N8N_WEBHOOK_SECRET = 'test-n8n-secret';
    try {
      const result = await sendN8nWebhook(sampleOrder);
      // Network error expected since port is closed, but logic executed
      assert.equal(result.ok, false);
    } finally {
      if (originalUrl) process.env.N8N_ORDER_WEBHOOK_URL = originalUrl;
      else delete process.env.N8N_ORDER_WEBHOOK_URL;
      if (originalSecret) process.env.N8N_WEBHOOK_SECRET = originalSecret;
      else delete process.env.N8N_WEBHOOK_SECRET;
    }
  });

  await t.test('7. dispatchOrderNotifications resolves safely with Promise.allSettled', async () => {
    const result = await dispatchOrderNotifications(sampleOrder);
    assert.ok(typeof result.telegram === 'object');
    assert.ok(typeof result.n8n === 'object');
  });

  await t.test('8. buildTelegramOrderKeyboard includes proof button and address button when applicable', () => {
    const keyboard = buildTelegramOrderKeyboard(sampleOrder);
    assert.ok(Array.isArray(keyboard.inline_keyboard));
    const allButtons = keyboard.inline_keyboard.flat();
    const proofButton = allButtons.find((b) => b.callback_data === 'proof:ORDER-10099');
    const addressButton = allButtons.find((b) => b.callback_data === 'address:ORDER-10099');
    const courierButton = allButtons.find((b) => b.callback_data === 'courier:ORDER-10099');
    const guiaButton = allButtons.find((b) => b.callback_data === 'setguia:ORDER-10099');
    assert.ok(guiaButton, 'Must have guia button');
    assert.equal(guiaButton.callback_data, 'setguia:ORDER-10099');
    assert.ok(proofButton, 'Must have proof button');
    assert.equal(proofButton.callback_data, 'proof:ORDER-10099');
    assert.ok(addressButton, 'Must have address button');
    assert.equal(addressButton.callback_data, 'address:ORDER-10099');
    assert.ok(courierButton, 'Must have courier button');
    assert.equal(courierButton.callback_data, 'courier:ORDER-10099');
  });

  await t.test('9. stock alerts are grouped into one Telegram message', async () => {
    const previousFetch = globalThis.fetch;
    const previousChat = process.env.TELEGRAM_ADMIN_CHAT_ID;
    process.env.TELEGRAM_ADMIN_CHAT_ID = '1037173906';
    const calls = [];
    globalThis.fetch = async (url, options) => {
      calls.push({ url, payload: JSON.parse(options.body) });
      return { json: async () => ({ ok: true }) };
    };
    try {
      const result = await sendTelegramStockDigest([
        { productName: 'Vestido', color: 'Rojo', size: 'S', remainingStock: 1 },
        { productName: 'Blusa', color: 'Negro', size: 'M', remainingStock: 0 },
      ], { token: 'test-token', chatId: '1037173906' });
      assert.equal(result.ok, true);
      assert.equal(calls.length, 1);
      assert.match(calls[0].payload.text, /2 variantes/);
    } finally {
      globalThis.fetch = previousFetch;
      if (previousChat) process.env.TELEGRAM_ADMIN_CHAT_ID = previousChat;
      else delete process.env.TELEGRAM_ADMIN_CHAT_ID;
    }
  });

  await t.test('10. editTelegramMessage and deleteTelegramMessage API contracts', async () => {
    const prevFetch = globalThis.fetch;
    const calls = [];
    globalThis.fetch = async (url, options) => {
      calls.push({ url, options: { ...options, body: options.body ? JSON.parse(options.body) : null } });
      return { json: async () => ({ ok: true }) };
    };
    try {
      // Valid messageId calls editMessageText
      await editTelegramMessage('token-123', 'chat-456', 99, 'Texto editado');
      assert.equal(calls.length, 1);
      assert.equal(calls[0].url, 'https://api.telegram.org/bottoken-123/editMessageText');
      assert.equal(calls[0].options.body.chat_id, 'chat-456');
      assert.equal(calls[0].options.body.message_id, 99);
      assert.equal(calls[0].options.body.text, 'Texto editado');

      // Invalid messageId falls back to sendMessage
      await editTelegramMessage('token-123', 'chat-456', 0, 'Texto nuevo');
      assert.equal(calls.length, 2);
      assert.equal(calls[1].url, 'https://api.telegram.org/bottoken-123/sendMessage');
      assert.equal(calls[1].options.body.text, 'Texto nuevo');

      // deleteTelegramMessage with valid ID
      await deleteTelegramMessage('token-123', 'chat-456', 88);
      assert.equal(calls.length, 3);
      assert.equal(calls[2].url, 'https://api.telegram.org/bottoken-123/deleteMessage');
      assert.equal(calls[2].options.body.message_id, 88);

      // deleteTelegramMessage with invalid ID does not fetch
      const invalidDel = await deleteTelegramMessage('token-123', 'chat-456', -1);
      assert.equal(calls.length, 3);
      assert.equal(invalidDel.ok, false);

      // Direct sendTelegramMessage
      const sendResult = await sendTelegramMessage('token-123', 'chat-456', 'Mensaje directo');
      assert.equal(sendResult.ok, true);
      assert.equal(calls.at(-1).url, 'https://api.telegram.org/bottoken-123/sendMessage');
    } finally {
      globalThis.fetch = prevFetch;
    }
  });

  await t.test('11. sendTelegramPhoto forwards reply_markup and captions in both URL and Blob modes', async () => {
    const prevFetch = globalThis.fetch;
    const calls = [];
    globalThis.fetch = async (url, options) => {
      calls.push({ url, options });
      return { json: async () => ({ ok: true }) };
    };
    try {
      const keyboard = { inline_keyboard: [[{ text: '↩️ Volver', callback_data: 'view:ORDER-10099' }]] };

      // URL photo
      await sendTelegramPhoto('token-123', 'chat-456', 'https://example.com/photo.jpg', 'Foto caption', { reply_markup: keyboard });
      assert.equal(calls.length, 1);
      const urlPayload = JSON.parse(calls[0].options.body);
      assert.equal(urlPayload.photo, 'https://example.com/photo.jpg');
      assert.equal(urlPayload.caption, 'Foto caption');
      assert.deepEqual(urlPayload.reply_markup, keyboard);

      // Base64 Data URL photo
      const base64Photo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      await sendTelegramPhoto('token-123', 'chat-456', base64Photo, 'Foto base64', { reply_markup: keyboard });
      assert.equal(calls.length, 2);
      assert.ok(calls[1].options.body instanceof FormData);
      assert.equal(calls[1].options.body.get('caption'), 'Foto base64');
      assert.equal(calls[1].options.body.get('reply_markup'), JSON.stringify(keyboard));
    } finally {
      globalThis.fetch = prevFetch;
    }
  });

  await t.test('12. Unified views for sales summary, low stock, pending orders, and help', () => {
    // Summary view
    const summary = buildSummaryView([
      { createdAt: new Date().toISOString(), total: 45.5 },
      { createdAt: '2020-01-01T00:00:00.000Z', total: 100 },
    ]);
    assert.match(summary.text, /Resumen de ventas/);
    assert.match(summary.text, /Total facturado/);
    assert.match(summary.text, /Total acumulado/);
    assert.equal(summary.reply_markup.inline_keyboard[0][0].callback_data, 'summary');
    assert.equal(summary.reply_markup.inline_keyboard[0][1].callback_data, 'home');

    // Low stock view (empty)
    const healthyStock = buildLowStockView([]);
    assert.match(healthyStock.text, /Inventario saludable/);

    // Low stock view (with items)
    const lowStock = buildLowStockView([
      { name: 'Pantalón', variants: [{ color: 'Negro', size: '32', stock: 1 }, { color: 'Azul', size: '30', stock: 0 }] },
    ]);
    assert.match(lowStock.text, /Stock por revisar/);
    assert.match(lowStock.text, /Pantalón/);
    assert.match(lowStock.text, /🛑/);
    assert.match(lowStock.text, /⚠️/);

    // Pending orders view (empty vs populated)
    const emptyOrders = buildPendingOrdersView([]);
    assert.match(emptyOrders.text, /Pedidos al día/);

    const populatedOrders = buildPendingOrdersView([
      { code: 'ORDER-1', customerName: 'Ana', status: 'Pendiente', total: 20 },
    ]);
    assert.match(populatedOrders.text, /Pedidos pendientes/);
    assert.equal(populatedOrders.reply_markup.inline_keyboard[0][0].callback_data, 'view:ORDER-1');

    // Admin home view
    const home = buildAdminHome({ orders: [{ status: 'Pendiente' }], products: [{ variants: [{ stock: 1 }] }] }, 'Admin');
    assert.match(home.text, /Adriego Store/);
    assert.match(home.text, /Admin/);
    assert.ok(home.reply_markup.inline_keyboard.length >= 3);

    // Inventory menu
    const menu = buildInventoryMenu();
    assert.match(menu.text, /Inventario/);
    assert.ok(menu.reply_markup.inline_keyboard.length >= 3);

    // Help message
    const help = formatHelpMessage();
    assert.match(help, /Comandos oficiales/);
    for (const cmd of TELEGRAM_BOT_COMMANDS) {
      assert.ok(help.includes('/' + cmd.command), `Help must include /${cmd.command}`);
    }
  });

  await t.test('13. Official bot commands catalog and registration endpoint', async () => {
    assert.equal(TELEGRAM_BOT_COMMANDS.length, 12);
    assert.ok(TELEGRAM_BOT_COMMANDS.some((item) => item.command === 'start'));
    assert.ok(TELEGRAM_BOT_COMMANDS.some((item) => item.command === 'reponer'));
    const prevFetch = globalThis.fetch;
    const calls = [];
    globalThis.fetch = async (url, options) => {
      calls.push({ url, body: JSON.parse(options.body) });
      return { json: async () => ({ ok: true, result: true }) };
    };
    try {
      const res = await registerTelegramBotCommands('test-token-commands');
      assert.equal(res.ok, true);
      assert.equal(calls.length, 2);
      assert.equal(calls[0].url, 'https://api.telegram.org/bottest-token-commands/setMyCommands');
      assert.deepEqual(calls[0].body.commands, [{ command: 'start', description: 'Abrir menú' }]);
      assert.equal(calls[1].url, 'https://api.telegram.org/bottest-token-commands/setChatMenuButton');
      assert.deepEqual(calls[1].body.menu_button, { type: 'commands' });
    } finally {
      globalThis.fetch = prevFetch;
    }
  });

  await t.test('14. Message counting contracts for bot callback queries', async () => {
    const prevFetch = globalThis.fetch;
    const prevSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
    const prevAdmin = process.env.TELEGRAM_ADMIN_CHAT_ID;
    const prevToken = process.env.TELEGRAM_BOT_TOKEN;

    process.env.TELEGRAM_WEBHOOK_SECRET = 'test-secret';
    process.env.TELEGRAM_ADMIN_CHAT_ID = '1037173906';
    process.env.TELEGRAM_BOT_TOKEN = 'test-bot-token';

    // Seed store with test orders
    await updateStore((draft) => {
      draft.orders = [
        { ...sampleOrder, status: 'Pendiente' },
        { code: 'ORDER-NOPROOF', customerName: 'Sin Comprobante', status: 'Pendiente', total: 60, paymentProof: null },
      ];
      return draft;
    });

    const calls = [];
    globalThis.fetch = async (url, options) => {
      const endpoint = url.split('/').pop();
      calls.push({ endpoint, url, options });
      return { ok: true, json: async () => ({ ok: true, result: { message_id: 555 } }) };
    };

    const callWebhook = async (body) => {
      const res = {
        code: 200,
        setHeader() {},
        status(code) { this.code = code; return this; },
        json(payload) { this.payload = payload; return this; },
      };
      await webhookHandler({
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': 'test-secret' },
        body,
      }, res);
      return res;
    };

    try {
      // Flow A: proof with existing proof sends exactly 1 photo with back button
      calls.length = 0;
      await callWebhook({
        callback_query: { id: 'cb-proof-1', from: { id: 1037173906 }, message: { message_id: 101, chat: { id: 1037173906 } }, data: 'proof:ORDER-10099' },
      });
      const photoCalls = calls.filter((c) => c.endpoint === 'sendPhoto');
      const editCalls = calls.filter((c) => c.endpoint === 'editMessageText');
      const sendCalls = calls.filter((c) => c.endpoint === 'sendMessage');
      const deleteCalls = calls.filter((c) => c.endpoint === 'deleteMessage');
      assert.equal(photoCalls.length, 1, 'Should send exactly 1 photo');
      assert.equal(editCalls.length, 0, 'Should not edit card when photo is sent');
      assert.equal(sendCalls.length, 0, 'Should not send extra text messages');
      assert.equal(deleteCalls.length, 0);
      assert.match(String(photoCalls[0].options.body.get('reply_markup')), /proof-close/);

      // Flow A2: closing the proof deletes only the photo and reveals the existing order card
      calls.length = 0;
      await callWebhook({
        callback_query: { id: 'cb-proof-close', from: { id: 1037173906 }, message: { message_id: 107, chat: { id: 1037173906 } }, data: 'proof-close' },
      });
      assert.equal(calls.filter((c) => c.endpoint === 'deleteMessage').length, 1);
      assert.equal(calls.filter((c) => c.endpoint === 'sendMessage').length, 0);
      assert.equal(calls.filter((c) => c.endpoint === 'editMessageText').length, 0);

      // Flow B: proof without proof edits the card and provides back button
      calls.length = 0;
      await callWebhook({
        callback_query: { id: 'cb-proof-2', from: { id: 1037173906 }, message: { message_id: 102, chat: { id: 1037173906 } }, data: 'proof:ORDER-NOPROOF' },
      });
      const bPhotoCalls = calls.filter((c) => c.endpoint === 'sendPhoto');
      const bEditCalls = calls.filter((c) => c.endpoint === 'editMessageText');
      const bSendCalls = calls.filter((c) => c.endpoint === 'sendMessage');
      assert.equal(bPhotoCalls.length, 0);
      assert.equal(bEditCalls.length, 1, 'Should edit card in place');
      assert.equal(bSendCalls.length, 0);
      const bBody = JSON.parse(bEditCalls[0].options.body);
      assert.match(bBody.text, /no tiene comprobante/);
      assert.equal(bBody.reply_markup.inline_keyboard[0][0].callback_data, 'view:ORDER-NOPROOF');

      // Flow C: search-order sends 1 ForceReply and deletes previous message
      calls.length = 0;
      await callWebhook({
        callback_query: { id: 'cb-search', from: { id: 1037173906 }, message: { message_id: 103, chat: { id: 1037173906 } }, data: 'search-order' },
      });
      const cSendCalls = calls.filter((c) => c.endpoint === 'sendMessage');
      const cDeleteCalls = calls.filter((c) => c.endpoint === 'deleteMessage');
      assert.equal(cSendCalls.length, 1, 'Should send 1 ForceReply message');
      assert.equal(cDeleteCalls.length, 1, 'Should delete previous message to avoid duplicates');
      const cDeleteBody = JSON.parse(cDeleteCalls[0].options.body);
      assert.equal(cDeleteBody.message_id, 103);

      // Flow D: quick_guia sends 1 ForceReply, deletes previous card, and persists prompt
      calls.length = 0;
      await callWebhook({
        callback_query: { id: 'cb-guia', from: { id: 1037173906 }, message: { message_id: 104, chat: { id: 1037173906 } }, data: 'quick_guia:ORDER-10099:Tramaco' },
      });
      const dSendCalls = calls.filter((c) => c.endpoint === 'sendMessage');
      const dDeleteCalls = calls.filter((c) => c.endpoint === 'deleteMessage');
      assert.equal(dSendCalls.length, 1, 'Should send 1 ForceReply prompt');
      assert.equal(dDeleteCalls.length, 1, 'Should delete previous courier selection card');
      const dDeleteBody = JSON.parse(dDeleteCalls[0].options.body);
      assert.equal(dDeleteBody.message_id, 104);

      // Verify serverless persistence in store draft
      const storeAfterPrompt = await readStore();
      assert.ok(storeAfterPrompt.meta?.pendingGuidePrompts?.['1037173906']);
      assert.equal(storeAfterPrompt.meta.pendingGuidePrompts['1037173906'].orderCode, 'ORDER-10099');
      assert.equal(storeAfterPrompt.meta.pendingGuidePrompts['1037173906'].courierName, 'Tramaco');

      // Flow E: view order edits message in place
      calls.length = 0;
      await callWebhook({
        callback_query: { id: 'cb-view', from: { id: 1037173906 }, message: { message_id: 105, chat: { id: 1037173906 } }, data: 'view:ORDER-10099' },
      });
      const eEditCalls = calls.filter((c) => c.endpoint === 'editMessageText');
      const eSendCalls = calls.filter((c) => c.endpoint === 'sendMessage');
      assert.equal(eEditCalls.length, 1, 'Should edit existing card');
      assert.equal(eSendCalls.length, 0, 'No extra message sent');

      // Flow F: courier data format edits message in place and provides back button
      calls.length = 0;
      await callWebhook({
        callback_query: { id: 'cb-courier', from: { id: 1037173906 }, message: { message_id: 106, chat: { id: 1037173906 } }, data: 'courier:ORDER-10099' },
      });
      const fEditCalls = calls.filter((c) => c.endpoint === 'editMessageText');
      assert.equal(fEditCalls.length, 1);
      const fBody = JSON.parse(fEditCalls[0].options.body);
      assert.match(fBody.text, /DATOS DE DESPACHO/);
      assert.equal(fBody.reply_markup.inline_keyboard[0][0].callback_data, 'view:ORDER-10099');
    } finally {
      globalThis.fetch = prevFetch;
      if (prevSecret) process.env.TELEGRAM_WEBHOOK_SECRET = prevSecret;
      else delete process.env.TELEGRAM_WEBHOOK_SECRET;
      if (prevAdmin) process.env.TELEGRAM_ADMIN_CHAT_ID = prevAdmin;
      else delete process.env.TELEGRAM_ADMIN_CHAT_ID;
      if (prevToken) process.env.TELEGRAM_BOT_TOKEN = prevToken;
      else delete process.env.TELEGRAM_BOT_TOKEN;
    }
  });

  await t.test('15. Serverless guide registration handles tracking number input and cleans prompt state', async () => {
    const prevFetch = globalThis.fetch;
    const prevSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
    const prevAdmin = process.env.TELEGRAM_ADMIN_CHAT_ID;
    const prevToken = process.env.TELEGRAM_BOT_TOKEN;

    process.env.TELEGRAM_WEBHOOK_SECRET = 'test-secret';
    process.env.TELEGRAM_ADMIN_CHAT_ID = '1037173906';
    process.env.TELEGRAM_BOT_TOKEN = 'test-bot-token';

    // Seed store with pending guide prompt in meta
    await updateStore((draft) => {
      draft.orders = [
        { ...sampleOrder, code: 'ORDER-SRVLESS', status: 'Pendiente', guideNumber: null },
      ];
      if (!draft.meta) draft.meta = {};
      draft.meta.pendingGuidePrompts = {
        '1037173906': {
          orderCode: 'ORDER-SRVLESS',
          courierName: 'LaarCourier',
          promptMessageId: 333,
          expiresAt: Date.now() + 10 * 60 * 1000,
        },
      };
      return draft;
    });

    // Clear in-memory prompts to simulate a cold start / new serverless lambda instance
    PENDING_GUIDE_PROMPTS.clear();

    const calls = [];
    globalThis.fetch = async (url, options) => {
      const endpoint = url.split('/').pop();
      calls.push({ endpoint, url, payload: options.body ? JSON.parse(options.body) : null });
      return { ok: true, json: async () => ({ ok: true }) };
    };

    try {
      const res = {
        code: 200,
        setHeader() {},
        status(code) { this.code = code; return this; },
        json(payload) { this.payload = payload; return this; },
      };
      // Admin types only tracking number in chat (no quoted reply, new lambda instance)
      await webhookHandler({
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': 'test-secret' },
        body: {
          message: {
            message_id: 400,
            chat: { id: 1037173906 },
            text: 'LAAR-99887766',
          },
        },
      }, res);

      assert.equal(res.code, 200);
      const store = await readStore();
      const order = store.orders.find((o) => o.code === 'ORDER-SRVLESS');
      assert.equal(order.guideNumber, 'LAAR-99887766');
      assert.equal(order.courierName, 'LaarCourier');
      assert.equal(order.status, 'Enviado');
      assert.equal(store.meta?.pendingGuidePrompts?.['1037173906'], undefined, 'Pending prompt must be removed');
    } finally {
      globalThis.fetch = prevFetch;
      if (prevSecret) process.env.TELEGRAM_WEBHOOK_SECRET = prevSecret;
      else delete process.env.TELEGRAM_WEBHOOK_SECRET;
      if (prevAdmin) process.env.TELEGRAM_ADMIN_CHAT_ID = prevAdmin;
      else delete process.env.TELEGRAM_ADMIN_CHAT_ID;
      if (prevToken) process.env.TELEGRAM_BOT_TOKEN = prevToken;
      else delete process.env.TELEGRAM_BOT_TOKEN;
    }
  });

  await t.test('16. Direct message commands and official Telegram menu registration', async () => {
    const prevFetch = globalThis.fetch;
    const prevSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
    const prevAdmin = process.env.TELEGRAM_ADMIN_CHAT_ID;
    const prevToken = process.env.TELEGRAM_BOT_TOKEN;

    process.env.TELEGRAM_WEBHOOK_SECRET = 'test-secret';
    process.env.TELEGRAM_ADMIN_CHAT_ID = '1037173906';
    process.env.TELEGRAM_BOT_TOKEN = 'test-bot-token';

    const calls = [];
    globalThis.fetch = async (url, options) => {
      calls.push(JSON.parse(options.body));
      return { ok: true, json: async () => ({ ok: true }) };
    };

    const sendCmd = async (text) => {
      calls.length = 0;
      const res = {
        code: 200,
        setHeader() {},
        status(code) { this.code = code; return this; },
        json(payload) { this.payload = payload; return this; },
      };
      await webhookHandler({
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': 'test-secret' },
        body: {
          message: {
            message_id: 501,
            chat: { id: 1037173906 },
            text,
          },
        },
      }, res);
    };

    try {
      // /ventas
      await sendCmd('/ventas');
      assert.equal(calls.length, 2);
      assert.match(calls[0].text, /Resumen de ventas/);
      assert.equal(calls[0].reply_markup.inline_keyboard[0][0].callback_data, 'summary');

      // /resumen
      await sendCmd('/resumen');
      assert.equal(calls.length, 2);
      assert.match(calls[0].text, /Resumen de ventas/);

      // /stock_bajo
      await sendCmd('/stock_bajo');
      assert.equal(calls.length, 2);
      assert.match(calls[0].text, /Stock por revisar|Inventario saludable/);

      // /pedidos
      await sendCmd('/pedidos');
      assert.equal(calls.length, 2);
      assert.match(calls[0].text, /Pedidos/);

      // /ayuda
      await sendCmd('/ayuda');
      assert.equal(calls.length, 2);
      assert.match(calls[0].text, /Comandos oficiales/);
      assert.match(calls[0].text, /\/pedidos/);
      assert.match(calls[0].text, /\/ventas/);

      // Bare /buscar opens the guided prompt instead of returning the first order
      await sendCmd('/buscar');
      assert.equal(calls.length, 1);
      assert.match(calls[0].text, /Buscar pedido/);
      assert.equal(calls[0].reply_markup.force_reply, true);
      assert.ok(Array.isArray(calls[0].reply_markup.keyboard));
      assert.equal(calls[0].reply_markup.one_time_keyboard, false);

      // Bare sale and restock commands start with types, not a mandatory search
      await sendCmd('/venta');
      assert.equal(calls.length, 2);
      assert.match(calls[0].text, /Registrar venta/);
      assert.match(calls[0].text, /Elige el tipo de prenda|No hay modelos con variantes/);
      assert.ok(calls[0].reply_markup.inline_keyboard.flat().some((item) => item.callback_data === 'inv:search'));

      await sendCmd('/reponer');
      assert.equal(calls.length, 2);
      assert.match(calls[0].text, /Reponer stock/);
      assert.match(calls[0].text, /Elige el tipo de prenda|No hay modelos con variantes/);
      assert.ok(calls[0].reply_markup.inline_keyboard.flat().some((item) => item.callback_data === 'inv:add:search'));

      // /menu registers official commands once per warm instance and then renders home
      await sendCmd('/menu');
      assert.equal(calls.length, 3);
      assert.deepEqual(calls.find((body) => Array.isArray(body.commands)).commands, [{ command: 'start', description: 'Abrir menú' }]);
      assert.ok(calls.some((body) => body.menu_button?.type === 'commands'));
      assert.ok(calls.some((body) => /Adriego Store/.test(body.text || '')));
    } finally {
      globalThis.fetch = prevFetch;
      if (prevSecret) process.env.TELEGRAM_WEBHOOK_SECRET = prevSecret;
      else delete process.env.TELEGRAM_WEBHOOK_SECRET;
      if (prevAdmin) process.env.TELEGRAM_ADMIN_CHAT_ID = prevAdmin;
      else delete process.env.TELEGRAM_ADMIN_CHAT_ID;
      if (prevToken) process.env.TELEGRAM_BOT_TOKEN = prevToken;
      else delete process.env.TELEGRAM_BOT_TOKEN;
    }
  });

  await t.test('17. Product type grouping and available stock calculation contracts', () => {
    const mockProducts = [
      { id: 'p-corta-1', name: 'Blusa Corta Satín', productType: 'Cortas', variants: [{ color: 'Negro', size: 'S', stock: 4 }, { color: 'Negro', size: 'M', stock: 2 }] },
      { id: 'p-larga-1', name: 'Camisa Manga Larga', productType: 'Largas', variants: [{ color: 'Blanco', size: 'M', stock: 5 }] },
      { id: 'p-larga-2', name: 'Blusa Larga Seda', productType: 'Largas', variants: [{ color: 'Rojo', size: 'U', stock: 0 }] },
      { id: 'p-vestido', name: 'Vestido Midi Fiesta', productType: 'Vestidos', variants: [{ color: 'Verde', size: 'M', stock: 3 }] },
      { id: 'p-infer-corta', name: 'Top Corto Rib', category: 'Cortas', variants: [{ color: 'Beige', size: 'S', stock: 7 }] },
    ];

    assert.equal(getProductTotalStock(mockProducts[0]), 6);
    assert.equal(getProductTotalStock(mockProducts[2]), 0);

    const types = getAvailableProductTypes(mockProducts);
    const cortas = types.find((t) => t.name.toLowerCase() === 'cortas');
    const largas = types.find((t) => t.name.toLowerCase() === 'largas');
    const vestidos = types.find((t) => t.name.toLowerCase() === 'vestidos');

    assert.ok(cortas, 'Must include Cortas');
    assert.equal(cortas.count, 2); // p-corta-1 and inferred p-infer-corta
    assert.equal(cortas.totalStock, 13);

    assert.ok(largas, 'Must include Largas');
    assert.equal(largas.count, 2);
    assert.equal(largas.totalStock, 5);

    assert.ok(vestidos, 'Must include Vestidos');
    assert.equal(vestidos.totalStock, 3);
  });

  await t.test('18. Physical sale interactive navigation by type and in-stock views', async () => {
    const prevFetch = globalThis.fetch;
    const prevSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
    const prevAdmin = process.env.TELEGRAM_ADMIN_CHAT_ID;
    const prevToken = process.env.TELEGRAM_BOT_TOKEN;

    process.env.TELEGRAM_WEBHOOK_SECRET = 'test-secret';
    process.env.TELEGRAM_ADMIN_CHAT_ID = '1037173906';
    process.env.TELEGRAM_BOT_TOKEN = 'test-bot-token';

    const testProducts = [
      { id: 'p-corta', name: 'Blusa Corta Elegante', productType: 'Cortas', variants: [{ color: 'Negro', size: 'S', stock: 4 }] },
      { id: 'p-larga', name: 'Camisa Larga Formal', productType: 'Largas', variants: [{ color: 'Azul', size: 'M', stock: 8 }] },
      { id: 'p-empty', name: 'Vestido Agotado', productType: 'Vestidos', variants: [{ color: 'Rojo', size: 'S', stock: 0 }] },
    ];

    await updateStore((draft) => {
      draft.products = testProducts;
      draft.productTypes = [{ name: 'Cortas' }, { name: 'Largas' }, { name: 'Vestidos' }];
      return draft;
    });

    const store = await readStore();

    // 1. Types view
    const typesView = buildInventoryTypesView(store);
    assert.match(typesView.text, /Registrar venta/);
    const hasCortasBtn = typesView.reply_markup.inline_keyboard.some((row) =>
      row.some((b) => b.text.includes('Cortas') && b.callback_data.startsWith('inv:type:'))
    );
    assert.ok(hasCortasBtn, 'Must render Cortas button with inv:type: callback');

    // 2. Products by type view
    const cortasAction = typesView.reply_markup.inline_keyboard.flat().find((button) => button.text.includes('Cortas')).callback_data;
    const cortasToken = cortasAction.split(':')[2];
    const productsView = buildInventoryProductsByTypeView(store, cortasToken, 0);
    assert.match(productsView.text, /Registrar venta · Cortas/);
    assert.ok(productsView.reply_markup.inline_keyboard[0][0].text.includes('4 disp.'));
    assert.match(productsView.reply_markup.inline_keyboard[0][0].callback_data, /^inv:product:/);

    // 3. In-stock view
    const inStockView = buildInventoryInStockView(store, 0);
    assert.match(inStockView.text, /Prendas con stock disponible/);
    assert.equal(inStockView.reply_markup.inline_keyboard.filter((r) => r[0].callback_data.startsWith('inv:product:')).length, 2);

    // 4. Restock view makes low-stock products actionable
    const restockView = buildInventoryRestockView(store, 0);
    assert.match(restockView.text, /Reponer stock/);
    assert.ok(restockView.reply_markup.inline_keyboard.some((row) => row[0].callback_data.startsWith('inv:add:product:')));

    // 5. Callback dispatch test via webhook
    const calls = [];
    globalThis.fetch = async (url, options) => {
      const endpoint = url.split('/').pop();
      calls.push({ endpoint, url, options, body: JSON.parse(options.body) });
      return { ok: true, json: async () => ({ ok: true, result: { message_id: 888 } }) };
    };

    const callWebhook = async (data) => {
      const res = { code: 200, setHeader() {}, status(c) { this.code = c; return this; }, json(p) { this.payload = p; return this; } };
      await webhookHandler({
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': 'test-secret' },
        body: { callback_query: { id: 'cb-test', from: { id: 1037173906 }, message: { message_id: 801, chat: { id: 1037173906 } }, data } },
      }, res);
      return res;
    };

    try {
      // Test callback inv:types
      await callWebhook('inv:types');
      assert.equal(calls.filter((c) => c.endpoint === 'editMessageText').length, 1);
      assert.match(calls.at(-1).body.text, /Registrar venta/);

      // Stable type tokens remain valid when the catalog order changes.
      calls.length = 0;
      await callWebhook(cortasAction);
      assert.equal(calls.filter((c) => c.endpoint === 'editMessageText').length, 1);
      assert.match(calls.at(-1).body.text, /Registrar venta · Cortas/);

      // Test callback inv:instock:0
      calls.length = 0;
      await callWebhook('inv:instock:0');
      assert.equal(calls.filter((c) => c.endpoint === 'editMessageText').length, 1);
      assert.match(calls.at(-1).body.text, /Prendas con stock disponible/);
    } finally {
      globalThis.fetch = prevFetch;
      if (prevSecret) process.env.TELEGRAM_WEBHOOK_SECRET = prevSecret;
      else delete process.env.TELEGRAM_WEBHOOK_SECRET;
      if (prevAdmin) process.env.TELEGRAM_ADMIN_CHAT_ID = prevAdmin;
      else delete process.env.TELEGRAM_ADMIN_CHAT_ID;
      if (prevToken) process.env.TELEGRAM_BOT_TOKEN = prevToken;
      else delete process.env.TELEGRAM_BOT_TOKEN;
    }
  });

  await t.test('19. Pending guide state rejects unrelated text and supports cancellation', async () => {
    const prevFetch = globalThis.fetch;
    const prevSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
    const prevAdmin = process.env.TELEGRAM_ADMIN_CHAT_ID;
    const prevToken = process.env.TELEGRAM_BOT_TOKEN;
    process.env.TELEGRAM_WEBHOOK_SECRET = 'test-secret';
    process.env.TELEGRAM_ADMIN_CHAT_ID = '1037173906';
    process.env.TELEGRAM_BOT_TOKEN = 'test-bot-token';

    const seedPrompt = async (promptMessageId) => updateStore((draft) => {
      draft.orders = [{ code: 'ORDER-SAFE-GUIDE', status: 'Pendiente', guideNumber: '' }];
      draft.meta = {
        ...(draft.meta || {}),
        pendingGuidePrompts: {
          '1037173906': {
            orderCode: 'ORDER-SAFE-GUIDE',
            courierName: 'Tramaco',
            promptMessageId,
            expiresAt: Date.now() + 10 * 60 * 1000,
          },
        },
      };
      return draft;
    });
    const calls = [];
    globalThis.fetch = async (url, options) => {
      calls.push({ endpoint: String(url).split('/').pop(), body: JSON.parse(options.body) });
      return { ok: true, json: async () => ({ ok: true }) };
    };
    const sendText = async (text, messageId) => {
      const res = { setHeader() {}, status() { return this; }, json(payload) { this.payload = payload; return this; } };
      await webhookHandler({
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': 'test-secret' },
        body: { message: { message_id: messageId, chat: { id: 1037173906 }, text } },
      }, res);
      return res;
    };

    try {
      await seedPrompt(910);
      PENDING_GUIDE_PROMPTS.clear();
      await sendText('hola', 911);
      let store = await readStore();
      let order = store.orders.find((item) => item.code === 'ORDER-SAFE-GUIDE');
      assert.equal(order.guideNumber, '');
      assert.equal(order.status, 'Pendiente');
      assert.equal(store.meta?.pendingGuidePrompts?.['1037173906'], undefined);
      assert.ok(calls.some((call) => /Adriego Store/.test(call.body.text || '')));

      await seedPrompt(912);
      PENDING_GUIDE_PROMPTS.clear();
      calls.length = 0;
      await sendText('/cancelar', 913);
      store = await readStore();
      order = store.orders.find((item) => item.code === 'ORDER-SAFE-GUIDE');
      assert.equal(order.guideNumber, '');
      assert.equal(store.meta?.pendingGuidePrompts?.['1037173906'], undefined);
      assert.ok(calls.some((call) => /cancelado/.test(call.body.text || '')));
    } finally {
      globalThis.fetch = prevFetch;
      if (prevSecret) process.env.TELEGRAM_WEBHOOK_SECRET = prevSecret;
      else delete process.env.TELEGRAM_WEBHOOK_SECRET;
      if (prevAdmin) process.env.TELEGRAM_ADMIN_CHAT_ID = prevAdmin;
      else delete process.env.TELEGRAM_ADMIN_CHAT_ID;
      if (prevToken) process.env.TELEGRAM_BOT_TOKEN = prevToken;
      else delete process.env.TELEGRAM_BOT_TOKEN;
    }
  });

  await t.test('20. Guided restock is atomic, idempotent, undoable, and shows stock alerts', async () => {
    const prevFetch = globalThis.fetch;
    const prevSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
    const prevAdmin = process.env.TELEGRAM_ADMIN_CHAT_ID;
    const prevToken = process.env.TELEGRAM_BOT_TOKEN;
    process.env.TELEGRAM_WEBHOOK_SECRET = 'test-secret';
    process.env.TELEGRAM_ADMIN_CHAT_ID = '1037173906';
    process.env.TELEGRAM_BOT_TOKEN = 'test-bot-token';

    await updateStore((draft) => {
      draft.products = [{
        id: 'p-restock-guided',
        name: 'Vestido Reposición',
        productType: 'Vestidos',
        variants: [{ color: 'Negro', size: 'M', stock: 1 }],
      }];
      draft.physicalStockEvents = [];
      draft.meta = { ...(draft.meta || {}), inventoryCallbackIds: [] };
      return draft;
    });

    const calls = [];
    globalThis.fetch = async (url, options) => {
      calls.push({ endpoint: String(url).split('/').pop(), body: JSON.parse(options.body) });
      return { ok: true, json: async () => ({ ok: true, result: { message_id: 920 } }) };
    };
    const callCallback = async (data, callbackId, messageId = 920) => {
      calls.length = 0;
      const res = { setHeader() {}, status() { return this; }, json(payload) { this.payload = payload; return this; } };
      await webhookHandler({
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': 'test-secret' },
        body: { callback_query: { id: callbackId, from: { id: 1037173906 }, message: { message_id: messageId, chat: { id: 1037173906 } }, data } },
      }, res);
      return calls.findLast((call) => call.endpoint === 'editMessageText')?.body;
    };

    try {
      const initialStore = await readStore();
      const restockView = buildInventoryRestockView(initialStore, 0);
      const productCallback = restockView.reply_markup.inline_keyboard.flat().find((button) => button.callback_data?.startsWith('inv:add:product:')).callback_data;
      let body = await callCallback(productCallback, 'cb-add-product');
      const colorCallback = body.reply_markup.inline_keyboard.flat().find((button) => button.callback_data?.startsWith('inv:add:color:')).callback_data;
      body = await callCallback(colorCallback, 'cb-add-color');
      const sizeCallback = body.reply_markup.inline_keyboard.flat().find((button) => button.callback_data?.startsWith('inv:add:size:')).callback_data;
      body = await callCallback(sizeCallback, 'cb-add-size');
      const quantityCallback = body.reply_markup.inline_keyboard.flat().find((button) => button.text === '+5').callback_data;
      body = await callCallback(quantityCallback, 'cb-add-qty');
      const confirmCallback = body.reply_markup.inline_keyboard.flat().find((button) => button.callback_data?.startsWith('inv:add:confirm:')).callback_data;

      await callCallback(confirmCallback, 'cb-add-confirm-1');
      let store = await readStore();
      assert.equal(store.products[0].variants[0].stock, 6);
      assert.equal(store.physicalStockEvents.length, 1);
      assert.equal(store.physicalStockEvents[0].delta, 5);

      // A second callback id from the same confirmation card must not add stock again.
      await callCallback(confirmCallback, 'cb-add-confirm-2');
      store = await readStore();
      assert.equal(store.products[0].variants[0].stock, 6);
      assert.equal(store.physicalStockEvents.length, 1);

      const restockEvent = store.physicalStockEvents[0];
      await callCallback(`undo-restock:${restockEvent.id}`, 'cb-undo-restock');
      store = await readStore();
      assert.equal(store.products[0].variants[0].stock, 1);
      assert.equal(store.physicalStockEvents[0].status, 'reverted');

      await callCallback('inv:nostock', 'cb-no-stock');
      const alertCall = calls.find((call) => call.endpoint === 'answerCallbackQuery');
      assert.equal(alertCall.body.show_alert, true);
    } finally {
      globalThis.fetch = prevFetch;
      if (prevSecret) process.env.TELEGRAM_WEBHOOK_SECRET = prevSecret;
      else delete process.env.TELEGRAM_WEBHOOK_SECRET;
      if (prevAdmin) process.env.TELEGRAM_ADMIN_CHAT_ID = prevAdmin;
      else delete process.env.TELEGRAM_ADMIN_CHAT_ID;
      if (prevToken) process.env.TELEGRAM_BOT_TOKEN = prevToken;
      else delete process.env.TELEGRAM_BOT_TOKEN;
    }
  });
});
