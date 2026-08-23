/**
 * Pure domain calculations and version comparison logic for realtime synchronization.
 */

export const SYNC_INTERVALS = Object.freeze({
  VISIBLE_MS: 3500,
  BACKGROUND_MS: 10000,
});

/**
 * Determines the polling interval based on current tab visibility state.
 * 
 * @param {string | undefined} visibilityState - Document visibilityState ('visible' | 'hidden')
 * @returns {number} Delay in milliseconds
 */
export function computePollingDelay(visibilityState = 'visible') {
  return visibilityState === 'visible' || !visibilityState
    ? SYNC_INTERVALS.VISIBLE_MS
    : SYNC_INTERVALS.BACKGROUND_MS;
}

/**
 * Normalizes version numbers from the server to non-negative integers.
 * 
 * @param {Record<string, unknown>} rawVersions 
 * @param {Record<string, unknown>} currentUser 
 * @returns {Record<string, number>}
 */
export function normalizeSyncVersions(rawVersions = {}, currentUser = {}) {
  return {
    global: Math.max(0, Number(rawVersions?.global) || 0),
    catalog: Math.max(0, Number(rawVersions?.catalog) || 0),
    orders: Math.max(0, Number(rawVersions?.orders) || 0),
    users: Math.max(0, Number(rawVersions?.users) || 0),
    userState: Math.max(0, Number(rawVersions?.userState) || 0),
    currentUserStateVersion: Math.max(0, Number(currentUser?.stateVersion) || 0),
  };
}

/**
 * Evaluates whether state partitions have updated and determines which refresh actions to trigger.
 * 
 * @param {Record<string, number>} previousVersions 
 * @param {Record<string, number>} nextVersions 
 * @param {{
 *   currentUserId?: string | null,
 *   isAdmin?: boolean,
 *   showAdminPanel?: boolean,
 *   adminTab?: string
 * }} context 
 * @returns {{
 *   catalogChanged: boolean,
 *   ordersChanged: boolean,
 *   usersChanged: boolean,
 *   userStateChanged: boolean,
 *   shouldRefreshCatalog: boolean,
 *   shouldRefreshOrders: boolean,
 *   shouldRefreshUsers: boolean,
 *   shouldRefreshUserState: boolean
 * }}
 */
export function calculateSyncTriggers(previousVersions = {}, nextVersions = {}, context = {}) {
  const prev = {
    catalog: Math.max(0, Number(previousVersions?.catalog) || 0),
    orders: Math.max(0, Number(previousVersions?.orders) || 0),
    users: Math.max(0, Number(previousVersions?.users) || 0),
    currentUserStateVersion: Math.max(0, Number(previousVersions?.currentUserStateVersion) || 0),
  };

  const next = {
    catalog: Math.max(0, Number(nextVersions?.catalog) || 0),
    orders: Math.max(0, Number(nextVersions?.orders) || 0),
    users: Math.max(0, Number(nextVersions?.users) || 0),
    currentUserStateVersion: Math.max(0, Number(nextVersions?.currentUserStateVersion) || 0),
  };

  const {
    currentUserId = null,
    isAdmin = false,
    showAdminPanel = false,
    adminTab = '',
  } = context;

  const catalogChanged = next.catalog > prev.catalog;
  const ordersChanged = next.orders > prev.orders;
  const usersChanged = next.users > prev.users;
  const userStateChanged = Boolean(currentUserId) && next.currentUserStateVersion > prev.currentUserStateVersion;

  // Catalog shouldn't update if admin is actively editing a product draft
  const isEditingProductInAdmin = Boolean(showAdminPanel && isAdmin && adminTab === 'producto');
  const shouldRefreshCatalog = catalogChanged && !isEditingProductInAdmin;

  // Orders should update if current user is logged in or is an admin
  const shouldRefreshOrders = ordersChanged && Boolean(currentUserId || isAdmin);

  // Admin users table should update if admin is viewing the users/summary tab
  const isViewingAdminUsers = Boolean(isAdmin && showAdminPanel && (adminTab === 'usuarios' || adminTab === 'resumen'));
  const shouldRefreshUsers = usersChanged && isViewingAdminUsers;

  // User state updates when authenticated session version increments
  const shouldRefreshUserState = userStateChanged;

  return {
    catalogChanged,
    ordersChanged,
    usersChanged,
    userStateChanged,
    shouldRefreshCatalog,
    shouldRefreshOrders,
    shouldRefreshUsers,
    shouldRefreshUserState,
  };
}

/**
 * Checks whether an initial catalog load came from cache and requires background revalidation.
 * 
 * @param {{ ok: boolean, data?: unknown, cache?: { hit?: boolean } }} loadResult 
 * @returns {boolean}
 */
export function shouldRevalidateCatalogCache(loadResult) {
  return Boolean(loadResult?.ok && loadResult?.data && loadResult?.cache?.hit);
}
