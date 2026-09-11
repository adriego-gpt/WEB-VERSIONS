import test from "node:test";
import assert from "node:assert/strict";
import { refreshSyncPartitions } from "../../src/domain/sync/refreshSyncPartitions.js";

function scenario(overrides = {}) {
  return {
    result: { versions: { catalog: 2, orders: 2, users: 2 }, currentUser: { stateVersion: 1 } },
    versionsRef: { current: { catalog: 1, orders: 1, users: 1, currentUserStateVersion: 1 } },
    context: { isAdmin: true, currentUserId: "u", showAdminPanel: true, adminTab: "usuarios" },
    getCatalogState: async () => ({ ok: true, data: { catalogVersion: 2 } }),
    applyCatalogState: () => {}, refreshOrders: async () => true,
    refreshAdminUsers: async () => true, getUserSessionStatus: async () => ({ ok: true }),
    setCurrentUser: () => {}, ...overrides,
  };
}

test("failed catalog downloads retry the same version while successful partitions advance", async () => {
  let attempts = 0;
  const applied = [];
  const input = scenario({
    getCatalogState: async () => ++attempts === 1
      ? { ok: false, message: "HTTP 503" } : { ok: true, data: { catalogVersion: 2 } },
    applyCatalogState: (data) => applied.push(data),
  });
  await assert.rejects(refreshSyncPartitions(input), /503/);
  assert.equal(input.versionsRef.current.catalog, 1);
  assert.equal(input.versionsRef.current.orders, 2);
  await refreshSyncPartitions(input);
  assert.equal(attempts, 2);
  assert.equal(applied.length, 1);
  assert.equal(input.versionsRef.current.catalog, 2);
});

test("synchronization waits for orders and retries false results", async () => {
  let completeOrders;
  let completed = false;
  const input = scenario({ refreshOrders: () => new Promise((resolve) => { completeOrders = resolve; }) });
  const task = refreshSyncPartitions(input).finally(() => { completed = true; });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(completed, false);
  assert.equal(input.versionsRef.current.orders, 1);
  completeOrders(false);
  await assert.rejects(task, /pedidos/);
  assert.equal(input.versionsRef.current.orders, 1);
  input.refreshOrders = async () => true;
  await refreshSyncPartitions(input);
  assert.equal(input.versionsRef.current.orders, 2);
});

test("editing defers catalog changes until leaving the editor without losing the version", async () => {
  let applied = 0;
  const input = scenario({ applyCatalogState: () => { applied++; } });
  input.context.adminTab = "producto";
  assert.equal((await refreshSyncPartitions(input)).deferredCatalog, true);
  assert.equal(applied, 0);
  assert.equal(input.versionsRef.current.catalog, 1);
  input.context.adminTab = "catalogo";
  assert.equal((await refreshSyncPartitions(input)).deferredCatalog, false);
  assert.equal(applied, 1);
});

test("stale catalog data cannot acknowledge a newer version", async () => {
  const input = scenario({
    getCatalogState: async () => ({ ok: true, data: { catalogVersion: 1 }, cache: { fallback: true } }),
    applyCatalogState: () => assert.fail("Stale catalog must not be applied"),
  });
  await assert.rejects(refreshSyncPartitions(input), /catálogo/);
  assert.equal(input.versionsRef.current.catalog, 1);
});

test("failed user refresh remains pending and a failed session check does not log out the user", async () => {
  const input = scenario({
    refreshAdminUsers: async () => false,
    getUserSessionStatus: async () => ({ ok: false, message: "Session unavailable" }),
    setCurrentUser: () => assert.fail("Network errors must not clear the session"),
  });
  input.result.currentUser.stateVersion = 2;
  await assert.rejects(refreshSyncPartitions(input), /clientes.*Session unavailable/);
  assert.equal(input.versionsRef.current.users, 1);
  assert.equal(input.versionsRef.current.currentUserStateVersion, 1);
});

test("cancelled effects do not apply a late catalog response", async () => {
  let cancelled = false;
  const input = scenario({
    getCatalogState: async () => { cancelled = true; return { ok: true, data: { catalogVersion: 2 } }; },
    isCancelled: () => cancelled,
    applyCatalogState: () => assert.fail("Cancelled effects must not apply data"),
  });
  await refreshSyncPartitions(input);
  assert.equal(input.versionsRef.current.catalog, 1);
});

test("acknowledging a poll preserves newer versions written during the request", async () => {
  const input = scenario();
  input.applyCatalogState = () => { input.versionsRef.current.catalog = 3; };
  await refreshSyncPartitions(input);
  assert.equal(input.versionsRef.current.catalog, 3);
});
