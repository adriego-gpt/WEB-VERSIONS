import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { computePollingDelay } from "../../src/domain/sync/syncCalculations.js";

// Execute the real hook effect with controlled browser and service boundaries.
// This does not reproduce its scheduling algorithm in a second implementation.
const source = (await fs.readFile(new URL("../../src/hooks/useRealtimeSync.js", import.meta.url), "utf8"))
  .replace(/^import .*;\r?$/gm, "");
const moduleSource = "const { useEffect, getUserSessionStatus, getCatalogState, getRealtimeSyncStatus, computePollingDelay, refreshSyncPartitions } = globalThis.realtimeHookTestDependencies;\n" + source;
const flush = () => new Promise(resolve => setImmediate(resolve));

test("sincronización: ahorro en navegación sin debilitar compras ni recuperación", async t => {
  let effect;
  let requests = [];
  let resolveRequest;
  let defer = false;
  const timers = new Map(), windowEvents = new Map(), documentEvents = new Map();
  let sequence = 0;
  const descriptors = new Map(["window", "document", "navigator", "realtimeHookTestDependencies"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const browserDocument = { hidden: false, visibilityState: "visible", addEventListener: (key, fn) => documentEvents.set(key, fn), removeEventListener: key => documentEvents.delete(key) };
  const browserWindow = { setTimeout: (fn, delay) => { const id = ++sequence; timers.set(id, { fn, delay }); return id; }, clearTimeout: id => timers.delete(id), addEventListener: (key, fn) => windowEvents.set(key, fn), removeEventListener: key => windowEvents.delete(key) };
  for (const [key, value] of Object.entries({ window: browserWindow, document: browserDocument, navigator: { onLine: true }, realtimeHookTestDependencies: {
    useEffect: fn => { effect = fn; }, computePollingDelay,
    getRealtimeSyncStatus: options => { requests.push(options); return defer ? new Promise(resolve => { resolveRequest = resolve; }) : Promise.resolve({ ok: true, versions: {} }); },
    refreshSyncPartitions: async () => ({ deferredCatalog: false }),
    getUserSessionStatus: async () => ({}), getCatalogState: async () => ({}),
  } })) Object.defineProperty(globalThis, key, { configurable: true, value });
  let cleanup;
  try {
    const { useRealtimeSync: runSyncEffect } = await import(`data:text/javascript;base64,${Buffer.from(moduleSource).toString("base64")}`);
    const start = async options => {
      cleanup?.(); requests = []; timers.clear(); defer = false;
      browserDocument.hidden = false; browserDocument.visibilityState = "visible"; navigator.onLine = true;
      runSyncEffect({ catalogReady: true, realtimeVersionsRef: { current: {} }, ...options });
      cleanup = effect(); await flush();
    };
    const tick = async () => { const [id, timer] = [...timers][0]; timers.delete(id); timer.fn(); await flush(); };
    await t.test("navegar usa comprobación fresca inicial y luego caché pública cada minuto", async () => {
      await start({}); assert.equal(requests[0].force, true);
      assert.equal([...timers.values()][0].delay, 60000);
      await tick(); assert.equal(requests[1].force, false); assert.equal(requests[1].preferCache, false);
    });
    await t.test("una compra conserva comprobaciones forzadas cada cinco segundos", async () => {
      await start({ shoppingActive: true }); assert.equal([...timers.values()][0].delay, 5000);
      await tick(); assert.equal(requests[1].force, true);
    });
    await t.test("admin nunca utiliza una respuesta pública cacheada", async () => {
      await start({ isAdmin: true }); assert.equal([...timers.values()][0].delay, 10000);
      await tick(); assert.equal(requests[1].privateStatus, true); assert.equal(requests[1].force, true);
    });
    await t.test("ocultar la pestaña detiene consultas y volver verifica inmediatamente", async () => {
      await start({ shoppingActive: true }); browserDocument.hidden = true; browserDocument.visibilityState = "hidden";
      documentEvents.get("visibilitychange")(); assert.equal(timers.size, 0);
      windowEvents.get("focus")(); await flush(); assert.equal(requests.length, 1);
      browserDocument.hidden = false; browserDocument.visibilityState = "visible";
      documentEvents.get("visibilitychange")(); await flush(); assert.equal(requests.length, 2); assert.equal(requests[1].force, true);
    });
    await t.test("focus y visibilidad no duplican una comprobación fresca en curso", async () => {
      await start({}); defer = true; windowEvents.get("focus")(); documentEvents.get("visibilitychange")();
      assert.equal(requests.length, 2); defer = false; resolveRequest({ ok: true, versions: {} }); await flush();
      assert.equal(requests.length, 2);
    });
    await t.test("sin conexión no consulta y al recuperarla vuelve a comprobar", async () => {
      await start({}); navigator.onLine = false; await tick(); assert.equal(requests.length, 1); assert.equal(timers.size, 0);
      navigator.onLine = true; windowEvents.get("online")(); await flush(); assert.equal(requests.length, 2);
    });
  } finally {
    cleanup?.();
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});
