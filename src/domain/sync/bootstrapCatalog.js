import { shouldRevalidateCatalogCache } from "./syncCalculations.js";

const LOAD_ERROR = "No pudimos cargar el catálogo. Revisa tu conexión y vuelve a intentarlo.";
const REFRESH_ERROR = "No pudimos actualizar la disponibilidad. Mostramos la última versión cargada; vuelve a intentarlo antes de comprar.";

export async function bootstrapCatalog({ getCatalogState, applyCatalogState, setCatalogReady, setCatalogError, admin = false, isCancelled = () => false }) {
  let hasCatalog = false;
  const apply = (result) => {
    if (!result?.ok || !Array.isArray(result.data?.products)) return false;
    applyCatalogState(result.data);
    hasCatalog = true;
    setCatalogError?.(result.cache?.fallback ? REFRESH_ERROR : "");
    return true;
  };
  try {
    const result = await getCatalogState({ admin: Boolean(admin), preferCache: !admin, force: Boolean(admin) });
    if (isCancelled()) return;
    if (!apply(result)) setCatalogError?.(LOAD_ERROR);
    setCatalogReady(true);
    if (!shouldRevalidateCatalogCache(result)) return;
    const fresh = await getCatalogState({ admin: Boolean(admin), preferCache: false, force: true });
    if (!isCancelled() && !apply(fresh)) setCatalogError?.(hasCatalog ? REFRESH_ERROR : LOAD_ERROR);
  } catch {
    if (!isCancelled()) {
      setCatalogError?.(hasCatalog ? REFRESH_ERROR : LOAD_ERROR);
      setCatalogReady(true);
    }
  }
}
