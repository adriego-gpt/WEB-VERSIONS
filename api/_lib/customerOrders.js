/** Customer receipts exclude administrative notes, including checkout replays. */
export function toCustomerOrder(order) {
  if (!order || typeof order !== "object") return order;
  const receipt = { ...order };
  delete receipt.internalNote;
  return receipt;
}

export function toCustomerOrderResponse(payload) {
  return {
    ...payload,
    ...(payload.order ? { order: toCustomerOrder(payload.order) } : {}),
    ...(Array.isArray(payload.orderHistory)
      ? { orderHistory: payload.orderHistory.map(toCustomerOrder) }
      : {}),
  };
}
