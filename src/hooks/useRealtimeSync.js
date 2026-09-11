import { useEffect } from "react";
import { getUserSessionStatus } from "../services/userAccountService.js";
import { getCatalogState, getRealtimeSyncStatus } from "../services/serverStateService.js";
import { computePollingDelay } from "../domain/sync/syncCalculations.js";
import { refreshSyncPartitions } from "../domain/sync/refreshSyncPartitions.js";

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
  onStatusChange,
  retryKey,
}) {
  useEffect(() => {
    if (!catalogReady) return undefined;
    let cancelled = false;
    let timerId = null;
    let inFlight = false;
    let forceQueued = false;

    const scheduleNext = () => {
      if (cancelled) return;
      if (timerId) window.clearTimeout(timerId);
      const isVisible = typeof document === "undefined" || document.visibilityState === "visible";
      const delayMs = computePollingDelay(isVisible ? "visible" : "hidden");
      timerId = window.setTimeout(() => {
        void pollRealtimeSync();
      }, delayMs);
    };

    const pollRealtimeSync = async (force = false) => {
      if (cancelled) return;
      if (inFlight) {
        forceQueued ||= force;
        return;
      }
      inFlight = true;
      if (timerId) window.clearTimeout(timerId);
      onStatusChange?.({ state: "checking", updatedAt: "" });
      try {
        const privateStatus = Boolean(currentUserId || isAdmin);
        const result = await getRealtimeSyncStatus({
          privateStatus,
          force,
          preferCache: !force,
          maxAgeMs: force ? 0 : (privateStatus ? 5000 : 30000),
        });
        if (cancelled) return;
        if (!result?.ok || !result.versions) {
          onStatusChange?.({
            state: result?.status === 0 ? "offline" : "error",
            updatedAt: new Date().toISOString(),
            message: result?.message || "No se pudo comprobar la sincronización.",
          });
          return;
        }

        const { deferredCatalog } = await refreshSyncPartitions({
          result,
          versionsRef: realtimeVersionsRef,
          context: { currentUserId, isAdmin, showAdminPanel, adminTab },
          getCatalogState,
          applyCatalogState,
          refreshOrders,
          refreshAdminUsers,
          getUserSessionStatus,
          setCurrentUser,
          isCancelled: () => cancelled,
        });
        if (!cancelled) {
          onStatusChange?.({
            state: deferredCatalog ? "deferred" : "synced",
            updatedAt: new Date().toISOString(),
            message: deferredCatalog ? "Hay cambios del catálogo pendientes. Se cargarán al salir del editor." : "",
          });
        }
      } catch (error) {
        if (!cancelled) {
          onStatusChange?.({
            state: typeof navigator !== "undefined" && navigator.onLine === false ? "offline" : "error",
            updatedAt: new Date().toISOString(),
            message: error?.message || "No se pudo completar la sincronización.",
          });
        }
      } finally {
        inFlight = false;
        if (!cancelled && forceQueued) {
          forceQueued = false;
          void pollRealtimeSync(true);
        } else {
          scheduleNext();
        }
      }
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
  }, [adminTab, applyCatalogState, catalogReady, currentUserId, isAdmin, onStatusChange, realtimeVersionsRef, refreshAdminUsers, refreshOrders, retryKey, setCurrentUser, showAdminPanel]);
}
