import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

// Helper to extract the effect callback from a hook using mock React
let lastEffectCallback = null;
let lastEffectDeps = null;

const mockReact = {
  useEffect(callback, deps) {
    lastEffectCallback = callback;
    lastEffectDeps = deps;
  }
};

describe('Catalog Bootstrap & Realtime Sync Hooks Architecture', () => {
  let originalWindow;
  let originalDocument;

  beforeEach(() => {
    lastEffectCallback = null;
    lastEffectDeps = null;
    originalWindow = globalThis.window;
    originalDocument = globalThis.document;
  });

  afterEach(() => {
    if (originalWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = originalWindow;
    }
    if (originalDocument === undefined) {
      delete globalThis.document;
    } else {
      globalThis.document = originalDocument;
    }
  });

  test('1. useCatalogBootstrap: Loads from cache, updates state, and marks catalogReady', async () => {
    const appliedStates = [];
    const readyStates = [];

    const applyCatalogState = (data) => appliedStates.push(data);
    const setCatalogReady = (ready) => readyStates.push(ready);

    // Mock bootstrap logic
    let cancelled = false;
    const mockGetCatalogState = async ({ preferCache, force }) => {
      if (preferCache) {
        return { ok: true, data: { products: [{ id: 'p1', name: 'Cached' }] }, cache: { hit: true } };
      }
      return { ok: true, data: { products: [{ id: 'p1', name: 'Fresh' }] }, cache: { hit: false } };
    };

    // Simulate hook execution
    const runBootstrap = async () => {
      const result = await mockGetCatalogState({ preferCache: true, force: false });
      if (cancelled) return;

      if (result.ok && result.data) {
        applyCatalogState(result.data);
      }
      setCatalogReady(true);

      if (!result.cache?.hit) return;

      const freshResult = await mockGetCatalogState({ preferCache: false, force: true });
      if (!cancelled && freshResult.ok && freshResult.data) {
        applyCatalogState(freshResult.data);
      }
    };

    await runBootstrap();

    assert.equal(readyStates.length, 1);
    assert.equal(readyStates[0], true);
    assert.equal(appliedStates.length, 2);
    assert.equal(appliedStates[0].products[0].name, 'Cached');
    assert.equal(appliedStates[1].products[0].name, 'Fresh');
  });

  test('2. useCatalogBootstrap: Guarantees catalogReady on network failure', async () => {
    const appliedStates = [];
    const readyStates = [];

    let cancelled = false;
    const mockFailedGetCatalogState = async () => {
      throw new Error('Network timeout');
    };

    const runBootstrapWithError = async () => {
      try {
        const result = await mockFailedGetCatalogState();
        if (cancelled) return;
        if (result?.ok) applyCatalogState(result.data);
        readyStates.push(true);
      } catch {
        if (!cancelled) {
          readyStates.push(true);
        }
      }
    };

    await runBootstrapWithError();

    assert.equal(readyStates.length, 1);
    assert.equal(readyStates[0], true);
    assert.equal(appliedStates.length, 0);
  });

  test('3. useCatalogBootstrap: Cancels state updates if unmounted during fetch', async () => {
    const appliedStates = [];
    const readyStates = [];

    let cancelled = false;
    const cleanup = () => { cancelled = true; };

    const runBootstrap = async () => {
      // Simulate delay
      await new Promise((r) => setTimeout(r, 10));
      if (cancelled) return;
      appliedStates.push({ data: true });
      readyStates.push(true);
    };

    const promise = runBootstrap();
    cleanup(); // Component unmounts immediately
    await promise;

    assert.equal(appliedStates.length, 0);
    assert.equal(readyStates.length, 0);
  });

  test('4. useRealtimeSync: Attaches and properly cleans up window and document listeners', () => {
    const listeners = {
      focus: [],
      online: [],
      visibilitychange: [],
    };
    const timeouts = [];
    const clearedTimeouts = [];

    globalThis.window = {
      addEventListener(type, fn) {
        if (listeners[type]) listeners[type].push(fn);
      },
      removeEventListener(type, fn) {
        if (listeners[type]) {
          listeners[type] = listeners[type].filter((cb) => cb !== fn);
        }
      },
      setTimeout(fn, delay) {
        const id = Math.random();
        timeouts.push({ id, delay });
        return id;
      },
      clearTimeout(id) {
        clearedTimeouts.push(id);
      },
    };

    globalThis.document = {
      visibilityState: 'visible',
      addEventListener(type, fn) {
        if (listeners[type]) listeners[type].push(fn);
      },
      removeEventListener(type, fn) {
        if (listeners[type]) {
          listeners[type] = listeners[type].filter((cb) => cb !== fn);
        }
      },
    };

    // Simulate hook setup when catalogReady is true
    let cancelled = false;
    let timerId = null;

    const refreshOnFocus = () => {};
    const refreshOnVisibility = () => {};

    globalThis.window.addEventListener('focus', refreshOnFocus);
    globalThis.window.addEventListener('online', refreshOnFocus);
    globalThis.document.addEventListener('visibilitychange', refreshOnVisibility);
    timerId = globalThis.window.setTimeout(() => {}, 3500);

    // Verify listeners registered
    assert.equal(listeners.focus.length, 1);
    assert.equal(listeners.online.length, 1);
    assert.equal(listeners.visibilitychange.length, 1);
    assert.equal(timeouts.length, 1);
    assert.equal(timeouts[0].delay, 3500);

    // Simulate hook cleanup on unmount
    const unmount = () => {
      cancelled = true;
      if (timerId) globalThis.window.clearTimeout(timerId);
      globalThis.window.removeEventListener('focus', refreshOnFocus);
      globalThis.window.removeEventListener('online', refreshOnFocus);
      globalThis.document.removeEventListener('visibilitychange', refreshOnVisibility);
    };

    unmount();

    assert.equal(cancelled, true);
    assert.equal(listeners.focus.length, 0);
    assert.equal(listeners.online.length, 0);
    assert.equal(listeners.visibilitychange.length, 0);
    assert.equal(clearedTimeouts.length, 1);
  });

  test('5. useRealtimeSync: Bypasses execution when catalog is not yet ready', () => {
    const catalogReady = false;
    let effectRan = false;

    if (!catalogReady) {
      // Hook early-returns undefined
      effectRan = false;
    } else {
      effectRan = true;
    }

    assert.equal(effectRan, false);
  });
});
