import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function mountHistoryHook() {
  const effects = [];
  const calls = [];
  let sequence = 0;
  const entries = [{}];
  const listeners = new Map();
  const browser = {
    location: { pathname: "/producto/prenda", href: "http://localhost/producto/prenda" },
    history: {
      get state() { return entries.at(-1); },
      pushState(state) { entries.push(state); calls.push("push"); },
      go(amount) { entries.splice(entries.length + amount); calls.push(["go", amount]); },
    },
    addEventListener(name, fn) { listeners.set(name, fn); },
    removeEventListener(name, fn) { if (listeners.get(name) === fn) listeners.delete(name); },
  };
  const source = readFileSync(new URL("../../src/hooks/useOverlayHistory.js", import.meta.url), "utf8")
    .replace(/^import .*;\r?\n/gm, "").replace("export function", "function");
  const hook = new Function("useEffect", "useLayoutEffect", "useRef", "createUuid", "window", "document",
    `${source}; return useOverlayHistory;`)(
    callback => effects.push(callback), callback => callback(), value => ({ current: value }),
    () => `overlay-${++sequence}`, browser, { title: "Test" },
  );
  let closed = 0;
  hook({ open: true, onClose: () => closed++, step: "login" });
  return { setup: effects[0], browser, calls, listeners, get closed() { return closed; } };
}

test("StrictMode setup/cleanup replay keeps one history entry and does not close the overlay", async () => {
  const fixture = mountHistoryHook();
  const cleanup = fixture.setup();
  cleanup();
  const finalCleanup = fixture.setup();
  await Promise.resolve();
  assert.deepEqual(fixture.calls, ["push"]);
  assert.equal(fixture.closed, 0);
  finalCleanup();
  await Promise.resolve();
  assert.deepEqual(fixture.calls, ["push", ["go", -1]]);
});

test("browser Back closes only the overlay when its entry is left", async () => {
  const fixture = mountHistoryHook();
  const cleanup = fixture.setup();
  fixture.browser.history.go(-1);
  fixture.listeners.get("popstate")();
  assert.equal(fixture.closed, 1);
  cleanup();
  await Promise.resolve();
  assert.deepEqual(fixture.calls, ["push", ["go", -1]], "Cleanup must not go back a second time");
});

test("leaving the product URL prevents late overlay cleanup from navigating elsewhere", async () => {
  const fixture = mountHistoryHook();
  const cleanup = fixture.setup();
  fixture.browser.location.pathname = "/carrito";
  cleanup();
  await Promise.resolve();
  assert.deepEqual(fixture.calls, ["push"]);
});
