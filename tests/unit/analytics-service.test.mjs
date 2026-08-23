import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  ALLOWED_EVENTS,
  sanitizeEventPayload,
  trackAnalyticsEvent
} from '../../src/services/analyticsService.js';

describe('Zero-PII Analytics Service', () => {
  let originalWindow;

  beforeEach(() => {
    originalWindow = globalThis.window;
  });

  afterEach(() => {
    if (originalWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = originalWindow;
    }
  });

  test('1. Valid event structure and allowlist adherence', () => {
    const validEvents = [
      'catalog_search',
      'product_opened',
      'cart_item_added',
      'checkout_started',
      'order_created',
      'whatsapp_opened'
    ];

    assert.deepEqual(Object.keys(ALLOWED_EVENTS), validEvents);

    const payload = {
      product_id: 'prod_123',
      slug: 'camisa-lino',
      category: 'Camisas',
      price: 45.5,
      has_offer: true,
      discount_percentage: 10,
      source: 'showcase'
    };

    const sanitized = sanitizeEventPayload('product_opened', payload);
    assert.deepEqual(sanitized, payload);
  });

  test('2. Rejects invalid or unsupported event names', () => {
    assert.equal(sanitizeEventPayload('invalid_event', { key: 'val' }), null);
    assert.equal(sanitizeEventPayload('user_login', { user_id: '123' }), null);
    assert.equal(sanitizeEventPayload('', {}), null);
    assert.equal(sanitizeEventPayload(null, {}), null);
    assert.equal(sanitizeEventPayload(123, {}), null);

    assert.equal(trackAnalyticsEvent('unauthorized_event', {}), false);
  });

  test('3. Filters out unallowed properties and extra fields', () => {
    const rawPayload = {
      order_id: 'ORDER-100',
      total: 80,
      discount_amount: 10,
      item_count: 2,
      delivery_type: 'delivery',
      coupon_used: true,
      // Extra fields not in allowlist:
      random_field: 'should_be_stripped',
      debug_info: { nested: true },
      session_id: 'sess_123'
    };

    const sanitized = sanitizeEventPayload('order_created', rawPayload);
    assert.deepEqual(sanitized, {
      order_id: 'ORDER-100',
      total: 80,
      discount_amount: 10,
      item_count: 2,
      delivery_type: 'delivery',
      coupon_used: true
    });
    assert.equal(sanitized.random_field, undefined);
    assert.equal(sanitized.debug_info, undefined);
    assert.equal(sanitized.session_id, undefined);
  });

  test('4. Strict blocking of PII (names, emails, phones, addresses, passwords)', () => {
    const piiAttempt = {
      product_id: 'prod_1',
      price: 25,
      source: 'catalog_grid',
      // Injected sensitive data:
      name: 'Juan Perez',
      email: 'juan@example.com',
      phone: '0999999999',
      address: 'Av Principal 123',
      password: 'secretPassword123',
      token: 'jwt_token_here',
      ip: '192.168.1.1',
      items: [{ name: 'Prenda íntima', size: 'M' }]
    };

    const sanitized = sanitizeEventPayload('product_opened', piiAttempt);
    assert.deepEqual(sanitized, {
      product_id: 'prod_1',
      price: 25,
      source: 'catalog_grid'
    });

    // Verification of zero PII leakage
    assert.equal('name' in sanitized, false);
    assert.equal('email' in sanitized, false);
    assert.equal('phone' in sanitized, false);
    assert.equal('address' in sanitized, false);
    assert.equal('password' in sanitized, false);
    assert.equal('token' in sanitized, false);
    assert.equal('ip' in sanitized, false);
    assert.equal('items' in sanitized, false);
  });

  test('5. Rejects email-like strings even if placed inside allowed string fields', () => {
    const sneakyPayload = {
      query_term: 'juan@example.com', // Attempting to leak email in search query
      results_count: 0
    };

    const sanitized = sanitizeEventPayload('catalog_search', sneakyPayload);
    assert.deepEqual(sanitized, {
      results_count: 0
    });
    assert.equal(sanitized.query_term, undefined);
  });

  test('5b. Rejects phone-like strings inside allowed fields', () => {
    const sanitized = sanitizeEventPayload('catalog_search', {
      query_term: '+593 99 999 9999',
      results_count: 0,
    });

    assert.deepEqual(sanitized, { results_count: 0 });
  });

  test('6. Graceful behavior in absence of window or dataLayer', () => {
    delete globalThis.window;

    // Must return true without throwing when payload is valid
    const dispatched = trackAnalyticsEvent('catalog_search', {
      query_term: 'vestido',
      results_count: 5
    });

    assert.equal(dispatched, true);
  });

  test('7. Correctly pushes sanitized event to window.dataLayer when available', () => {
    const mockDataLayer = [];
    globalThis.window = {
      dataLayer: mockDataLayer
    };

    const dispatched = trackAnalyticsEvent('whatsapp_opened', {
      order_id: 'ORDER-555',
      total: 120,
      device_type: 'mobile',
      is_reopen: false,
      customer_name: 'Ana' // should be stripped
    });

    assert.equal(dispatched, true);
    assert.equal(mockDataLayer.length, 1);
    assert.equal(mockDataLayer[0].event, 'whatsapp_opened');
    assert.equal(mockDataLayer[0].order_id, 'ORDER-555');
    assert.equal(mockDataLayer[0].total, 120);
    assert.equal(mockDataLayer[0].device_type, 'mobile');
    assert.equal(mockDataLayer[0].is_reopen, false);
    assert.equal(mockDataLayer[0].customer_name, undefined);
    assert.equal(typeof mockDataLayer[0].timestamp, 'number');
  });

  test('8. Handles non-object and null rawPayload inputs cleanly', () => {
    assert.deepEqual(sanitizeEventPayload('cart_item_added', null), {});
    assert.deepEqual(sanitizeEventPayload('cart_item_added', undefined), {});
    assert.deepEqual(sanitizeEventPayload('cart_item_added', 'string_payload'), {});
    assert.deepEqual(sanitizeEventPayload('cart_item_added', 42), {});
    assert.deepEqual(sanitizeEventPayload('cart_item_added', [1, 2, 3]), {});
  });
});
