import assert from "node:assert/strict";
import test from "node:test";

import { createServerCheckoutOrder, deleteServerOrder, deleteServerOrders, getCatalogState, listServerOrders, getRealtimeSyncStatus } from "../../src/services/serverStateService.js";

test("batch deletion uses one mutation request and invalidates catalog and orders", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    return new Response(JSON.stringify({ ok: true, token: "test-csrf", data: {}, orderHistory: [], deleted: 2 }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    await getCatalogState({ force: true });
    await listServerOrders({ force: true });
    await deleteServerOrders({ orderIds: ["one", "two"] });
    await getCatalogState({ preferCache: true });
    await listServerOrders({ preferCache: true });
    const mutations = calls.filter(({ url }) => url === "/api/orders?action=delete-many");
    assert.equal(mutations.length, 1);
    assert.deepEqual(JSON.parse(mutations[0].options.body), { orderIds: ["one", "two"] });
    assert.equal(calls.filter(({ url }) => String(url).startsWith("/api/catalog-state")).length, 2);
    assert.equal(calls.filter(({ url }) => String(url).startsWith("/api/orders?action=list")).length, 2);
  } finally { globalThis.fetch = originalFetch; }
});

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

test("forced synchronization reports network errors even when older data is cached", async () => {
  const originalFetch = globalThis.fetch;
  try {
    for (const request of [getCatalogState, listServerOrders, getRealtimeSyncStatus]) {
      globalThis.fetch = async () => new Response(JSON.stringify({
        ok: true, data: { catalogVersion: 1 }, orderHistory: [], versions: { catalog: 1 },
      }), { status: 200, headers: { "content-type": "application/json" } });
      assert.equal((await request({ force: true })).ok, true);
      globalThis.fetch = async () => new Response(JSON.stringify({ ok: false, message: "Unavailable" }), { status: 503, headers: { "content-type": "application/json" } });
      const result = await request({ force: true, preferCache: false });
      assert.equal(result.ok, false);
      assert.equal(result.cache?.fallback, undefined);
    }
  } finally { globalThis.fetch = originalFetch; }
});

test("checkout service always sends a valid idempotency UUID", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options = {}) => {
    requests.push({ url, options });
    return new Response(JSON.stringify({ ok: true, order: { id: "order-test" } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    await createServerCheckoutOrder({ cart: [{ id: "product-test" }] });
    const checkoutRequest = requests.find((entry) => entry.url === "/api/checkout-order");
    assert.ok(checkoutRequest, "checkout request should be sent");
    const body = JSON.parse(checkoutRequest.options.body);
    assert.match(body.idempotencyKey, UUID_PATTERN);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("checkout service preserves a supplied key for safe retries", async () => {
  const originalFetch = globalThis.fetch;
  const suppliedKey = "73d92f85-90cf-4d47-a3da-a9c0fc8241ad";
  let sentBody = null;
  globalThis.fetch = async (url, options = {}) => {
    if (url === "/api/checkout-order") sentBody = JSON.parse(options.body);
    return new Response(JSON.stringify({ ok: true, order: { id: "order-test" } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    await createServerCheckoutOrder({ cart: [], idempotencyKey: suppliedKey });
    assert.equal(sentBody.idempotencyKey, suppliedKey);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("deleting an order invalidates the catalog cache because reserved stock may be restored", async () => {
  const originalFetch = globalThis.fetch;
  let catalogCalls = 0;
  globalThis.fetch = async (url) => {
    if (String(url).includes("/api/catalog-state")) catalogCalls += 1;
    return new Response(JSON.stringify({ ok: true, data: { catalogVersion: 1 }, orderHistory: [], token: "test-csrf" }), {
      status: 200, headers: { "content-type": "application/json" },
    });
  };
  try {
    await getCatalogState({ force: true });
    await getCatalogState({ preferCache: true });
    assert.equal(catalogCalls, 1);
    assert.equal((await deleteServerOrder({ orderId: "test-delete" })).ok, true);
    await getCatalogState({ preferCache: true });
    assert.equal(catalogCalls, 2, "the next catalog read cannot reuse the pre-deletion stock snapshot");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
