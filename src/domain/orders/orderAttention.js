import { normalizeOrderStatusForOrder } from "./status.js";

function formatOrderAge(minutes) {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours ? `${days}d ${remainingHours}h` : `${days}d`;
}

export function getOrderSlaMeta(order = {}, nowMs = Date.now()) {
  const status = normalizeOrderStatusForOrder(order.status, order.deliveryType);
  const createdMs = new Date(order.createdAt || "").getTime();
  const ageMinutes = Number.isFinite(createdMs)
    ? Math.max(0, Math.round((nowMs - createdMs) / 60000))
    : 0;
  const formattedAge = formatOrderAge(ageMinutes);

  if (!Number.isFinite(createdMs)) {
    return { tone: "warning", label: "Fecha pendiente de revisión", ageMinutes, formattedAge: "" };
  }

  if (status === "Pendiente") {
    if (ageMinutes >= 90) return { tone: "danger", label: "Revisión urgente", ageMinutes, formattedAge };
    if (ageMinutes >= 30) return { tone: "warning", label: "Revisar pronto", ageMinutes, formattedAge };
    return { tone: "success", label: "Pendiente reciente", ageMinutes, formattedAge };
  }
  if (status === "Confirmado" || status === "Preparando") {
    if (ageMinutes >= 24 * 60) return { tone: "danger", label: "Revisar demora", ageMinutes, formattedAge };
    return { tone: "success", label: "En preparación", ageMinutes, formattedAge };
  }
  return { tone: "neutral", label: "Sin alerta", ageMinutes, formattedAge };
}

export function getNextOrderAction(status, deliveryType = "delivery") {
  const normalized = normalizeOrderStatusForOrder(status, deliveryType);
  if (normalized === "Pendiente") return { label: "Confirmar pedido", status: "Confirmado" };
  if (normalized === "Confirmado") return { label: "Empezar preparación", status: "Preparando" };
  if (normalized === "Preparando") return deliveryType === "pickup"
    ? { label: "Marcar listo para retiro", status: "Listo para retiro" }
    : { label: "Registrar envío", status: "Enviado" };
  if (normalized === "Listo para retiro" || normalized === "Enviado") {
    return { label: "Marcar entregado", status: "Entregado" };
  }
  return null;
}
