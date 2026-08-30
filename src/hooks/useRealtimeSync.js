import { useEffect } from "react";
import { getUserSessionStatus } from "../services/userAccountService.js";
import { getCatalogState, getRealtimeSyncStatus } from "../services/serverStateService.js";
import {
  computePollingDelay,
  normalizeSyncVersions,
  calculateSyncTriggers
} from "../domain/sync/syncCalculations.js";

/** Keeps cross-device catalog, order, admin, and authenticated-user state fresh. */
export function useRealtimeSync({
  adminTab,
  applyCatalogState,
  catalogReady,
  currentUserId,
  isAdmin,
  realtimeVersionsRef,
  refreshAdminUsers,
  refreshOrders,
  setCurrentUser,
  showAdminPanel,
}) {
  useEffect(() => {
    if (!catalogReady) return undefined;
    let cancelled = false;
    let timerId = null;

    const scheduleNext = () => {
      if (cancelled) return;
      const isVisible = typeof document === "undefined" || document.visibilityState === "visible";
      const delayMs = computePollingDelay(isVisible ? "visible" : "hidden");
      timerId = window.setTimeout(() => {
        void pollRealtimeSync();
      }, delayMs);
    };

    const pollRealtimeSync = async (force = false) => {
      try {
        const privateStatus = Boolean(currentUserId || isAdmin);
        const result = await getRealtimeSyncStatus({
          privateStatus,
          force,
          preferCache: !force,
          maxAgeMs: force ? 0 : (privateStatus ? 5000 : 30000),
        });
        if (cancelled || !result?.ok || !result.versions) {
          scheduleNext();
          return;
        }

        const previousVersions = realtimeVersionsRef.current;
        const nextVersions = normalizeSyncVersions(result.versions, result.currentUser);
        realtimeVersionsRef.current = nextVersions;

        const triggers = calculateSyncTriggers(previousVersions, nextVersions, {
          currentUserId,
          isAdmin,
          showAdminPanel,
          adminTab,
        });

        if (triggers.shouldRefreshCatalog) {
          const catalogResult = await getCatalogState({
            admin: Boolean(isAdmin),
            catalogVersion: nextVersions.catalog,
            preferCache: false,
            force: true,
          });
          if (!cancelled && catalogResult?.ok && catalogResult?.data) {
            applyCatalogState(catalogResult.data);
          }
        }

        if (triggers.shouldRefreshOrders) {
          void refreshOrders({ silent: true, force: true, preferCache: false, notifyAdminOnNew: Boolean(isAdmin) });
        }

        if (triggers.shouldRefreshUsers) {
          void refreshAdminUsers({ silent: true, force: true, preferCache: false });
        }

        if (triggers.shouldRefreshUserState) {
          const sessionResult = await getUserSessionStatus();
          if (!cancelled) {
            setCurrentUser(sessionResult?.ok && sessionResult?.authenticated && sessionResult?.user ? sessionResult.user : null);
          }
        }
      } catch {
        // Silent error tolerance
      }

      scheduleNext();
    };

    const refreshOnFocus = () => { void pollRealtimeSync(true); };
    const refreshOnVisibility = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") void pollRealtimeSync(true);
    };

    window.addEventListener("focus", refreshOnFocus);
    window.addEventListener("online", refreshOnFocus);
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", refreshOnVisibility);
    void pollRealtimeSync(true);

    return () => {
      cancelled = true;
      if (timerId) window.clearTimeout(timerId);
      window.removeEventListener("focus", refreshOnFocus);
      window.removeEventListener("online", refreshOnFocus);
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", refreshOnVisibility);
    };
  }, [adminTab, applyCatalogState, catalogReady, currentUserId, isAdmin, realtimeVersionsRef, refreshAdminUsers, refreshOrders, setCurrentUser, showAdminPanel]);
}
