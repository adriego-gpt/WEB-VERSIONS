import { useCallback, useEffect, useRef } from "react";
import { syncUserAccountState } from "../services/userAccountService";

/** Queues authenticated cart/favorite writes without allowing duplicate writes. */
export function useUserStateSync({
  currentUserId,
  currentUserStateVersion,
  cartRef,
  favoritesRef,
  realtimeVersionsRef,
  normalizeCart,
  normalizeFavorites,
  getSignature,
  setCurrentUser,
}) {
  const timerRef = useRef(null);
  const activeSyncPromiseRef = useRef(Promise.resolve({ ok: true, skipped: true }));
  const syncGenerationRef = useRef(0);
  const lastSignatureRef = useRef("");
  const applyingRemoteStateRef = useRef(false);

  const resetUserStateSync = useCallback(() => {
    syncGenerationRef.current += 1;
    lastSignatureRef.current = "";
    applyingRemoteStateRef.current = false;
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const syncUserStateNow = useCallback(() => {
    if (!currentUserId) return Promise.resolve({ ok: true, skipped: true });
    const requestedUserId = String(currentUserId);
    const requestedGeneration = syncGenerationRef.current;
    const runSync = async () => {
      if (requestedGeneration !== syncGenerationRef.current) {
        return { ok: true, skipped: true, ignored: true };
      }
      const cart = normalizeCart(cartRef.current);
      const favorites = normalizeFavorites(favoritesRef.current);
      const signature = getSignature(cart, favorites);
      if (!signature || signature === lastSignatureRef.current) {
        return { ok: true, skipped: true };
      }

      const baseStateVersion = Math.max(
        Number(realtimeVersionsRef.current.currentUserStateVersion || 0),
        Number(currentUserStateVersion || 0),
      );
      const result = await syncUserAccountState({ cart, favorites, baseStateVersion });
      if (!result?.ok || !result.user) return result || { ok: false };

      if (
        requestedGeneration !== syncGenerationRef.current
        || requestedUserId !== String(result.user.id || "")
      ) {
        return { ...result, ignored: true };
      }

      lastSignatureRef.current = signature;
      realtimeVersionsRef.current.currentUserStateVersion = Math.max(
        Number(realtimeVersionsRef.current.currentUserStateVersion || 0),
        Number(result.user.stateVersion || 0),
      );
      setCurrentUser(result.user);
      return result;
    };

    // ASVS V15.4: serialize writes so concurrent cart changes cannot corrupt shared user state.
    const queuedSync = activeSyncPromiseRef.current
      .catch(() => undefined)
      .then(runSync);
    activeSyncPromiseRef.current = queuedSync;
    return queuedSync;
  }, [
    cartRef,
    currentUserId,
    currentUserStateVersion,
    favoritesRef,
    getSignature,
    normalizeCart,
    normalizeFavorites,
    realtimeVersionsRef,
    setCurrentUser,
  ]);

  const queueUserStateSync = useCallback((delayMs = 480) => {
    if (!currentUserId) return;
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      void syncUserStateNow();
    }, Math.max(120, Number(delayMs) || 480));
  }, [currentUserId, syncUserStateNow]);

  const flushUserStateSync = useCallback(async () => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    return syncUserStateNow();
  }, [syncUserStateNow]);

  useEffect(() => () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
  }, []);

  return {
    applyingRemoteStateRef,
    flushUserStateSync,
    lastSignatureRef,
    queueUserStateSync,
    resetUserStateSync,
  };
}
