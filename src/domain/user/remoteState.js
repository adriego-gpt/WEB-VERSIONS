import { FALLBACK_IMAGE } from "../../constants/product.js";
import { normalizeEntityId, sanitizeLine } from "../../utils/sanitizers.js";
import { normalizeImageSource } from "../../utils/fileUpload.js";

export function buildUserStateSignature(cart = [], favorites = [], { normalizeCart, normalizeFavorites }) {
  return JSON.stringify({
    cart: normalizeCart(cart),
    favorites: normalizeFavorites(favorites),
  });
}

export function hydrateRemoteUserState({
  remoteCart,
  remoteFavorites,
  localCart,
  localFavorites = [],
  mergeLocalState = false,
  products,
  getImageForProduct,
  normalizeCart,
  normalizeFavorites,
}) {
  const normalizedLocalCart = normalizeCart(localCart);
  const normalizedRemoteCart = normalizeCart(remoteCart);
  const currentCartByKey = new Map(normalizedLocalCart.map((entry) => [String(entry.key || ""), entry]));
  const productsById = new Map((Array.isArray(products) ? products : []).map((product) => [normalizeEntityId(product?.id), product]));
  const cartSource = mergeLocalState
    ? (() => {
        const mergedByKey = new Map(normalizedRemoteCart.map((entry) => [String(entry.key || ""), entry]));
        normalizedLocalCart.forEach((localEntry) => {
          const key = String(localEntry.key || "");
          if (!key) return;
          const remoteEntry = mergedByKey.get(key);
          if (!remoteEntry) {
            mergedByKey.set(key, localEntry);
            return;
          }
          mergedByKey.set(key, {
            ...localEntry,
            ...remoteEntry,
            quantity: Math.max(Number(remoteEntry.quantity) || 1, Number(localEntry.quantity) || 1),
          });
        });
        return [...mergedByKey.values()];
      })()
    : normalizedRemoteCart;

  const hasProducts = productsById.size > 0;

  const cart = cartSource
    .filter((entry) => {
      if (!hasProducts) return true;
      const product = productsById.get(normalizeEntityId(entry.id));
      return Boolean(product) && product.isPublic !== false;
    })
    .map((entry) => {
      const previousLine = currentCartByKey.get(String(entry.key || ""));
      const product = productsById.get(normalizeEntityId(entry.id));
      return {
        ...entry,
        name: sanitizeLine(product?.name || previousLine?.name || entry?.name || "Producto"),
        price: Number(product?.price || previousLine?.price || entry?.price || 0) || 0,
        image: normalizeImageSource(getImageForProduct(product, entry.color) || previousLine?.image || entry?.image || FALLBACK_IMAGE) || FALLBACK_IMAGE,
      };
    });

  const favoriteSource = mergeLocalState
    ? normalizeFavorites([...normalizeFavorites(remoteFavorites), ...normalizeFavorites(localFavorites)])
    : normalizeFavorites(remoteFavorites);
  const favorites = favoriteSource.filter((favoriteId) => {
    if (!hasProducts) return true;
    const product = productsById.get(normalizeEntityId(favoriteId));
    return Boolean(product) && product.isPublic !== false;
  });

  return { cart, favorites };
}
