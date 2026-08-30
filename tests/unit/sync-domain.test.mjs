import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  computePollingDelay,
  normalizeSyncVersions,
  calculateSyncTriggers,
  shouldRevalidateCatalogCache,
  SYNC_INTERVALS,
} from '../../src/domain/sync/syncCalculations.js';

describe('Realtime Sync Domain Calculations (src/domain/sync/syncCalculations.js)', () => {
  test('1. computePollingDelay: selects VISIBLE_MS for visible tab and BACKGROUND_MS for hidden tab', () => {
    assert.equal(SYNC_INTERVALS.VISIBLE_MS, 60000);
    assert.equal(SYNC_INTERVALS.BACKGROUND_MS, 300000);
    assert.equal(computePollingDelay('visible'), SYNC_INTERVALS.VISIBLE_MS);
    assert.equal(computePollingDelay(''), SYNC_INTERVALS.VISIBLE_MS);
    assert.equal(computePollingDelay(undefined), SYNC_INTERVALS.VISIBLE_MS);
    assert.equal(computePollingDelay('hidden'), SYNC_INTERVALS.BACKGROUND_MS);
    assert.equal(computePollingDelay('prerender'), SYNC_INTERVALS.BACKGROUND_MS);
  });

  test('2. normalizeSyncVersions: sanitizes version payloads to non-negative integers', () => {
    const rawVersions = {
      global: '12',
      catalog: 5,
      orders: -3,
      users: 'invalid_num',
      userState: 8,
    };
    const currentUser = {
      stateVersion: '4',
    };

    const normalized = normalizeSyncVersions(rawVersions, currentUser);
    assert.deepEqual(normalized, {
      global: 12,
      catalog: 5,
      orders: 0,
      users: 0,
      userState: 8,
      currentUserStateVersion: 4,
    });
  });

  test('3. calculateSyncTriggers: catalog update triggers only when catalog version increments', () => {
    const prev = { catalog: 1, orders: 1, users: 1, currentUserStateVersion: 1 };
    const next = { catalog: 2, orders: 1, users: 1, currentUserStateVersion: 1 };

    const triggers = calculateSyncTriggers(prev, next, {});
    assert.equal(triggers.catalogChanged, true);
    assert.equal(triggers.shouldRefreshCatalog, true);
    assert.equal(triggers.shouldRefreshOrders, false);
    assert.equal(triggers.shouldRefreshUsers, false);
    assert.equal(triggers.shouldRefreshUserState, false);
  });

  test('4. calculateSyncTriggers: catalog update is paused while admin is editing product', () => {
    const prev = { catalog: 1, orders: 1, users: 1, currentUserStateVersion: 1 };
    const next = { catalog: 2, orders: 1, users: 1, currentUserStateVersion: 1 };

    // Admin actively editing a product draft
    const context = {
      isAdmin: true,
      showAdminPanel: true,
      adminTab: 'producto',
    };

    const triggers = calculateSyncTriggers(prev, next, context);
    assert.equal(triggers.catalogChanged, true);
    assert.equal(triggers.shouldRefreshCatalog, false); // Paused to prevent overwriting admin draft!
  });

  test('5. calculateSyncTriggers: orders refresh triggers for authenticated customer or admin', () => {
    const prev = { catalog: 1, orders: 1, users: 1, currentUserStateVersion: 1 };
    const next = { catalog: 1, orders: 2, users: 1, currentUserStateVersion: 1 };

    // Anonymous visitor: does not trigger orders refresh
    const anonTriggers = calculateSyncTriggers(prev, next, { currentUserId: null, isAdmin: false });
    assert.equal(anonTriggers.ordersChanged, true);
    assert.equal(anonTriggers.shouldRefreshOrders, false);

    // Logged in customer: triggers orders refresh
    const customerTriggers = calculateSyncTriggers(prev, next, { currentUserId: 'usr_123', isAdmin: false });
    assert.equal(customerTriggers.shouldRefreshOrders, true);

    // Admin: triggers orders refresh
    const adminTriggers = calculateSyncTriggers(prev, next, { currentUserId: null, isAdmin: true });
    assert.equal(adminTriggers.shouldRefreshOrders, true);
  });

  test('6. calculateSyncTriggers: users list refresh triggers only when admin is viewing users/resumen tab', () => {
    const prev = { catalog: 1, orders: 1, users: 1, currentUserStateVersion: 1 };
    const next = { catalog: 1, orders: 1, users: 2, currentUserStateVersion: 1 };

    // Admin viewing pedidos tab: users refresh is not needed
    const nonUserTabTriggers = calculateSyncTriggers(prev, next, {
      isAdmin: true,
      showAdminPanel: true,
      adminTab: 'pedidos',
    });
    assert.equal(nonUserTabTriggers.usersChanged, true);
    assert.equal(nonUserTabTriggers.shouldRefreshUsers, false);

    // Admin viewing usuarios tab: users refresh triggers
    const usersTabTriggers = calculateSyncTriggers(prev, next, {
      isAdmin: true,
      showAdminPanel: true,
      adminTab: 'usuarios',
    });
    assert.equal(usersTabTriggers.shouldRefreshUsers, true);

    // Admin viewing resumen tab: users refresh triggers
    const resumenTabTriggers = calculateSyncTriggers(prev, next, {
      isAdmin: true,
      showAdminPanel: true,
      adminTab: 'resumen',
    });
    assert.equal(resumenTabTriggers.shouldRefreshUsers, true);
  });

  test('7. calculateSyncTriggers: user session state refresh triggers when currentUserStateVersion increases', () => {
    const prev = { catalog: 1, orders: 1, users: 1, currentUserStateVersion: 1 };
    const next = { catalog: 1, orders: 1, users: 1, currentUserStateVersion: 2 };

    // Logged in user receives remote userState bump
    const triggers = calculateSyncTriggers(prev, next, { currentUserId: 'usr_456' });
    assert.equal(triggers.userStateChanged, true);
    assert.equal(triggers.shouldRefreshUserState, true);

    // Anonymous visitor ignored
    const anonTriggers = calculateSyncTriggers(prev, next, { currentUserId: null });
    assert.equal(anonTriggers.userStateChanged, false);
    assert.equal(anonTriggers.shouldRefreshUserState, false);
  });

  test('8. shouldRevalidateCatalogCache: returns true only if result has data and hit cache', () => {
    assert.equal(shouldRevalidateCatalogCache({ ok: true, data: { products: [] }, cache: { hit: true } }), true);
    assert.equal(shouldRevalidateCatalogCache({ ok: true, data: { products: [] }, cache: { hit: false } }), false);
    assert.equal(shouldRevalidateCatalogCache({ ok: false, cache: { hit: true } }), false);
    assert.equal(shouldRevalidateCatalogCache(null), false);
    assert.equal(shouldRevalidateCatalogCache(undefined), false);
  });
});
