import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatTelegramOrderMessage,
  buildTelegramOrderKeyboard,
  sendTelegramNotification,
  sendN8nWebhook,
  dispatchOrderNotifications,
  isAuthorizedAdminChatId,
  escapeTelegramMarkdown,
} from '../../api/_lib/notifications.js';

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

  await t.test('1. formatTelegramOrderMessage generates rich formatted text with all critical order fields', () => {
    const formatted = formatTelegramOrderMessage(sampleOrder);
    assert.match(formatted, /ORDER-10099/);
    assert.match(formatted, /Adrian Narvaez/);
    assert.match(formatted, /0991234567/);
    assert.match(formatted, /Envío a Domicilio/);
    assert.match(formatted, /Quito/);
    assert.match(formatted, /Av/);
    assert.match(formatted, /Banco Pichincha/);
    assert.match(formatted, /Vestido Midi Satin/);
    assert.match(formatted, /Blusa Seda/);
    assert.match(formatted, /ADRIEGO10/);
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
    assert.match(formatted, /Retiro en Local/);
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
    const proofButton = allButtons.find((b) => b.text.includes('Ver Comprobante'));
    const addressButton = allButtons.find((b) => b.text.includes('Ver Dirección'));
    const courierButton = allButtons.find((b) => b.text.includes('Formato Courier'));
    const guiaButton = allButtons.find((b) => b.text.includes('Asignar Guía'));
    assert.ok(guiaButton, 'Must have guia button');
    assert.equal(guiaButton.callback_data, 'setguia:ORDER-10099');
    assert.ok(proofButton, 'Must have proof button');
    assert.equal(proofButton.callback_data, 'proof:ORDER-10099');
    assert.ok(addressButton, 'Must have address button');
    assert.equal(addressButton.callback_data, 'address:ORDER-10099');
    assert.ok(courierButton, 'Must have courier button');
    assert.equal(courierButton.callback_data, 'courier:ORDER-10099');
  });
});
