function cleanStockMessage(message) {
  return String(message || "").replace(/\s+/g, " ").trim();
}

export function getStockNotificationPresentation(result = {}) {
  const code = String(result.code || "").toUpperCase();
  const message = cleanStockMessage(result.message);

  if (code === "RESERVATION_EXPIRED") {
    return {
      title: "Reserva finalizada",
      message: "Tu reserva venció. Revisa el carrito antes de realizar el pago.",
      key: code,
    };
  }

  if (code === "OFFLINE" || /no pudimos verificar|sin conexión/i.test(message)) {
    return {
      title: "No pudimos verificar el stock",
      message: "Revisa tu conexión antes de realizar el pago.",
      key: code,
    };
  }

  const stockLine = message
    .replace(/\s*No realices el pago[^.]*\.?/i, "")
    .replace(/\s*Elige otra variante[^.]*\.?/i, "")
    .replace(/\s*Retírala del carrito[^.]*\.?/i, "")
    .trim();

  if (/precio|cantidad|carrito cambió|comprobación cambió/i.test(message)) {
    return {
      title: "Revisa el carrito",
      message: stockLine || "Hay información del carrito que debes actualizar antes de pagar.",
      key: `${code || "CART_REVIEW"}:${stockLine || "review"}`,
    };
  }

  return {
    title: code === "INSUFFICIENT_STOCK" || /solo quedan|solo queda/i.test(message)
      ? "Stock actualizado"
      : "Esta talla se agotó",
    message: stockLine || "La talla seleccionada ya no está disponible. Revisa el carrito antes de realizar el pago.",
    key: `${code || "OUT_OF_STOCK"}:${stockLine || "unavailable"}`,
  };
}

export function isMaintenanceAvailability(result = {}) {
  return String(result.code || "").toUpperCase().includes("MAINTENANCE")
    || /tienda está en mantenimiento/i.test(String(result.message || ""));
}
