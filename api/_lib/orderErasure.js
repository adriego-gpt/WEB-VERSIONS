// Proofs are inline images owned by an order, not catalog media. Erase only
// that order's records from app-managed snapshots, even if an image is shared.
export function getOrderErasureChanges(previousStore, nextStore) {
  const nextOrders = new Map((nextStore?.orders || []).map((order) => [String(order.id), order]));
  const deletedOrderIds = new Set();
  const clearedProofOrderIds = new Set();
  for (const order of previousStore?.orders || []) {
    const id = String(order.id);
    const nextOrder = nextOrders.get(id);
    if (!nextOrder) deletedOrderIds.add(id);
    else if (order.paymentProof && order.paymentProof !== nextOrder.paymentProof) clearedProofOrderIds.add(id);
  }
  return { deletedOrderIds, clearedProofOrderIds };
}

export function sanitizeOrderBackup(snapshot, { deletedOrderIds, clearedProofOrderIds }) {
  if (!Array.isArray(snapshot?.orders)) return snapshot;
  return {
    ...snapshot,
    orders: snapshot.orders
      .filter((order) => !deletedOrderIds.has(String(order.id)))
      .map((order) => clearedProofOrderIds.has(String(order.id)) ? { ...order, paymentProof: "" } : order),
  };
}
