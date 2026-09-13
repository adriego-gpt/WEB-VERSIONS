import { useEffect } from "react";
import { getCatalogState } from "../services/serverStateService.js";
import { bootstrapCatalog } from "../domain/sync/bootstrapCatalog.js";

/**
 * Loads cached catalog state first and then revalidates it when needed.
 * The caller owns state normalization so this hook stays transport-focused.
 */
export function useCatalogBootstrap({ applyCatalogState, setCatalogReady, setCatalogError, admin = false }) {
  useEffect(() => {
    let cancelled = false;

    void bootstrapCatalog({ getCatalogState, applyCatalogState, setCatalogReady, setCatalogError, admin,
      isCancelled: () => cancelled });
    return () => {
      cancelled = true;
    };
  }, [admin, applyCatalogState, setCatalogReady, setCatalogError]);
}
