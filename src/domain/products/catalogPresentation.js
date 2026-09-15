import { getSelectionForColor } from "./variants.js";

export function syncProductSelections(products = [], previousSelections = {}) {
  return Object.fromEntries(products.map((product) => {
    const previous = previousSelections[product.id] || {};
    const wasChosenByUser = previous.source === "user";
    const preferredSelection = wasChosenByUser
      ? previous
      : { color: product.catalogColor || product.colors?.[0] };
    const chosenVariant = wasChosenByUser && product.variants?.find(variant => variant.color === previous.color && variant.size === previous.size);
    const fallback = chosenVariant || getSelectionForColor(product, preferredSelection);
    return [product.id, {
      color: fallback.color,
      size: fallback.size,
      ...(wasChosenByUser ? { source: "user" } : {}),
    }];
  }));
}

export function getProductBadgeKinds(product = {}, discount = 0) {
  const badges = [];
  if (product.offerEnabled && discount > 0) badges.push("offer");
  if (product.featured) badges.push("featured");
  if (product.newArrival) badges.push("new");
  return badges;
}
