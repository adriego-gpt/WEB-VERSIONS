import { calculateSyncTriggers, normalizeSyncVersions } from "./syncCalculations.js";

/** A version acknowledges applied data, never just a successful status request. */
export async function refreshSyncPartitions({
  result, versionsRef, context, getCatalogState, applyCatalogState,
  refreshOrders, refreshAdminUsers, getUserSessionStatus, setCurrentUser,
  isCancelled = () => false,
}) {
  const next = normalizeSyncVersions(result.versions, result.currentUser);
  const triggers = calculateSyncTriggers(versionsRef.current, next, context);
  const errors = [];
  const acknowledge = (key, version = next[key]) => {
    if (!isCancelled()) {
      versionsRef.current = {
        ...versionsRef.current,
        [key]: Math.max(Number(versionsRef.current[key]) || 0, version),
      };
    }
  };
  const attempt = async (task) => {
    if (isCancelled()) return;
    try { await task(); } catch (error) { errors.push(error); }
  };

  if (triggers.shouldRefreshCatalog) {
    await attempt(async () => {
      const catalog = await getCatalogState({
        admin: Boolean(context.isAdmin), catalogVersion: next.catalog,
        preferCache: false, force: true,
      });
      if (isCancelled()) return;
      if (!catalog?.ok || !catalog.data || Number(catalog.data.catalogVersion) < next.catalog
        || !Number.isFinite(Number(catalog.data.catalogVersion))) {
        throw new Error(catalog?.message || "No se pudo actualizar el catálogo.");
      }
      await applyCatalogState(catalog.data);
      acknowledge("catalog", Number(catalog.data.catalogVersion));
    });
  }
  if (triggers.shouldRefreshOrders) {
    await attempt(async () => {
      const ok = await refreshOrders({ silent: true, force: true, preferCache: false, notifyAdminOnNew: Boolean(context.isAdmin) });
      if (ok !== true) throw new Error("No se pudieron actualizar los pedidos.");
      acknowledge("orders");
    });
  }
  if (triggers.shouldRefreshUsers) {
    await attempt(async () => {
      const ok = await refreshAdminUsers({ silent: true, force: true, preferCache: false });
      if (ok !== true) throw new Error("No se pudieron actualizar los clientes.");
      acknowledge("users");
    });
  }
  if (triggers.shouldRefreshUserState) {
    await attempt(async () => {
      const session = await getUserSessionStatus();
      if (isCancelled()) return;
      if (!session?.ok) throw new Error(session?.message || "No se pudo actualizar la sesión.");
      setCurrentUser(session.authenticated && session.user ? session.user : null);
      acknowledge("currentUserStateVersion");
      acknowledge("userState");
    });
  }
  if (errors.length) throw new Error(errors.map((error) => error.message).join(" "));
  return { deferredCatalog: triggers.catalogChanged && !triggers.shouldRefreshCatalog };
}
