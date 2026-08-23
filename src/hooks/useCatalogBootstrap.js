import { useEffect } from "react";
import { getCatalogState } from "../services/serverStateService.js";
import { shouldRevalidateCatalogCache } from "../domain/sync/syncCalculations.js";

/**
 * Loads cached catalog state first and then revalidates it when needed.
 * The caller owns state normalization so this hook stays transport-focused.
 */
export function useCatalogBootstrap({ applyCatalogState, setCatalogReady }) {
  useEffect(() => {
    let cancelled = false;

    const loadCatalog = async () => {
      try {
        const result = await getCatalogState({ preferCache: true, force: false });
        if (cancelled) return;

        if (result?.ok && result?.data) {
          applyCatalogState(result.data);
        }
        setCatalogReady(true);

        if (!shouldRevalidateCatalogCache(result)) return;

        const freshResult = await getCatalogState({ preferCache: false, force: true });
        if (!cancelled && freshResult?.ok && freshResult?.data) {
          applyCatalogState(freshResult.data);
        }
      } catch {
        // Guarantee catalog is marked ready even on network/fetch errors
        if (!cancelled) {
          setCatalogReady(true);
        }
      }
    };

    void loadCatalog();
    return () => {
      cancelled = true;
    };
  }, [applyCatalogState, setCatalogReady]);
}
