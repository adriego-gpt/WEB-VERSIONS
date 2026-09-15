/** An owner's server projection is usable for editing, never as permission to pay. */
export function projectCartStock(product, snapshot, now = Date.now()) {
  if (!product || !snapshot?.stock?.length || !(snapshot.stockDeadline > now)) return product;
  return { ...product, variants: (product.variants || []).map(variant => {
    const held = snapshot.stock.find(line => String(line.id) === String(product.id)
      && line.color === variant.color && line.size === variant.size
      && (!line.uid || line.uid === variant.uid));
    return held ? { ...variant, stock: Math.max(0, Number(held.stock) || 0) } : variant;
  }) };
}

export function preserveCartSelection(product, preferred, fallback) {
  const variant = product?.variants?.find(line => line.color === preferred?.color && line.size === preferred?.size);
  return variant ? { color: variant.color, size: variant.size, availableStock: Math.max(0, Number(variant.stock) || 0) } : fallback(product, preferred);
}
