import assert from "node:assert/strict";
import test from "node:test";
import { requestJson } from "../../src/services/httpClient.js";
import { cachedRequest, invalidateCachedRequest } from "../../src/services/smartCache.js";
import { bootstrapCatalog } from "../../src/domain/sync/bootstrapCatalog.js";
import { normalizePublicSiteOrigin, getPublicSiteOrigin } from "../../src/constants/site.js";
import { getResponsiveImageSources } from "../../src/domain/products/imageSources.js";

test("domain configuration only accepts safe origins", () => {
  assert.equal(getPublicSiteOrigin(), "https://www.adriego.shop");
  assert.equal(getPublicSiteOrigin("https://adriego.shop/"), "https://adriego.shop");
  for (const value of ["http://adriego.shop", "https://user:pass@adriego.shop", "https://adriego.shop/admin", "https://adriego.shop/?redirect=x", "javascript:alert(1)"]) assert.equal(normalizePublicSiteOrigin(value), "");
  assert.equal(normalizePublicSiteOrigin("http://localhost:5173"), "http://localhost:5173");
});

test("responsive image candidates have actual width descriptors", () => {
  const result = getResponsiveImageSources("https://images.unsplash.com/photo-1?auto=format");
  assert.match(result, /w=320[^,]* 320w/);
  assert.match(result, /w=640[^,]* 640w/);
  assert.match(result, /w=960[^,]* 960w/);
  assert.equal(getResponsiveImageSources("https://example.com/image.jpg"), undefined);
});

test("invalid and misleading HTTP responses never report successful saves", async () => {
  const original = globalThis.fetch;
  try {
    for (const response of [new Response("<html>upstream error</html>"), new Response("null", { headers: { "content-type": "application/json" } }), new Response("not json", { headers: { "content-type": "application/json" } }), new Response('{"ok":true,"status":200}', { status: 500, headers: { "content-type": "application/json" } })]) {
      globalThis.fetch = async () => response;
      assert.equal((await requestJson("/api/test")).ok, false);
    }
    globalThis.fetch = async () => new Response('{"ok":true}', { headers: { "content-type": "application/json" } });
    assert.equal((await requestJson("/api/test")).ok, true);
  } finally { globalThis.fetch = original; }
});

test("request timeout still applies when caller supplies an abort signal", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
  });
  try {
    const caller = new AbortController();
    const result = await requestJson("/api/test", { signal: caller.signal, timeoutMs: 1000 });
    assert.equal(result.message, "request-timeout");
    const cancelled = requestJson("/api/test", { signal: caller.signal });
    caller.abort();
    assert.equal((await cancelled).message, "request-cancelled");
  } finally { globalThis.fetch = original; }
});

test("mutation deadline includes stalled CSRF bootstrap and prevents sending a late save", async () => {
  const original = globalThis.fetch;
  const { requestJson: freshClient } = await import("../../src/services/httpClient.js?test=csrf-deadline");
  let finishBootstrap;
  let mutations = 0;
  globalThis.fetch = (url) => {
    if (url === "/api/csrf-token") return new Promise((resolve) => { finishBootstrap = resolve; });
    mutations += 1;
    return Promise.resolve(Response.json({ ok: true }));
  };
  try {
    const result = await freshClient("/api/save", { method: "POST", body: "{}", timeoutMs: 1000 });
    assert.equal(result.message, "request-timeout");
    assert.equal(mutations, 0);
  } finally {
    finishBootstrap?.(Response.json({ token: "mock-csrf-token" }));
    globalThis.fetch = original;
  }
});

test("CSRF mismatch retries at most once", async () => {
  const original = globalThis.fetch;
  const { requestJson: freshClient } = await import("../../src/services/httpClient.js?test=csrf-retry");
  let mutations = 0;
  globalThis.fetch = async (url) => {
    if (url === "/api/csrf-token") return Response.json({ token: "mock-token" });
    mutations += 1;
    return Response.json({ ok: false, message: "CSRF token invalido" }, { status: 403 });
  };
  try {
    assert.equal((await freshClient("/api/save", { method: "POST", body: "{}" })).ok, false);
    assert.equal(mutations, 2);
  } finally { globalThis.fetch = original; }
});

test("old requests cannot repopulate invalidated or superseded cache entries", async () => {
  const key = "test:launch:cache-race";
  let resolveOld;
  const old = cachedRequest(key, () => new Promise((resolve) => { resolveOld = resolve; }));
  await Promise.resolve();
  invalidateCachedRequest(key);
  await cachedRequest(key, async () => ({ ok: true, version: 2 }), { force: true });
  resolveOld({ ok: true, version: 1 });
  await old;
  assert.equal((await cachedRequest(key, async () => { throw new Error("cache should be used"); })).version, 2);
  invalidateCachedRequest(key);
});

test("failed initial catalog load is explicit and never fabricates products", async () => {
  const applied = [], errors = [], ready = [];
  await bootstrapCatalog({ getCatalogState: async () => ({ ok: false }), applyCatalogState: (value) => applied.push(value), setCatalogReady: (value) => ready.push(value), setCatalogError: (value) => errors.push(value) });
  assert.deepEqual(applied, []);
  assert.deepEqual(ready, [true]);
  assert.match(errors[0], /No pudimos cargar/);
});

test("catalog refresh failures preserve last loaded catalog with a warning", async () => {
  const applied = [], errors = [];
  let calls = 0;
  await bootstrapCatalog({ getCatalogState: async () => ++calls === 1 ? { ok: true, data: { products: [{ id: "p1" }] }, cache: { hit: true, stale: true } } : { ok: false }, applyCatalogState: (value) => applied.push(value), setCatalogReady() {}, setCatalogError: (value) => errors.push(value) });
  assert.equal(applied.length, 1);
  assert.match(errors.at(-1), /última versión/);
});
