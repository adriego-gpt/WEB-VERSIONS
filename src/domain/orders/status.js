import { Clock3, BadgeCheck, Package, Truck, Store, CheckCircle2, CircleX } from "lucide-react";
import { normalizeOptionLabel } from "../../utils/sanitizers";

export function normalizeOrderStatus(value = "Pendiente") {
  const normalized = normalizeOptionLabel(value).toLowerCase();
  const legacyMap = {
    "pendiente de pago": "Pendiente",
    pagado: "Confirmado",
    pendiente: "Pendiente",
    confirmado: "Confirmado",
    preparando: "Preparando",
    enviado: "Enviado",
    "listo para retiro": "Listo para retiro",
    "listo para recoger": "Listo para retiro",
    "listo para entrega": "Listo para retiro",
    "listo en local": "Listo para retiro",
    "retiro listo": "Listo para retiro",
    recibido: "Entregado",
    finalizado: "Entregado",
    entregado: "Entregado",
    cancelado: "Cancelado",
  };
  return legacyMap[normalized] || "Pendiente";
}

export function getOrderStatusOptions(deliveryType = "delivery") {
  if (deliveryType === "pickup") {
    return ["Pendiente", "Confirmado", "Preparando", "Listo para retiro", "Entregado", "Cancelado"];
  }
  return ["Pendiente", "Confirmado", "Preparando", "Enviado", "Entregado", "Cancelado"];
}

export function normalizeOrderStatusForOrder(status, deliveryType = "delivery") {
  const normalizedStatus = normalizeOrderStatus(status);
  if (deliveryType === "pickup" && normalizedStatus === "Enviado") return "Listo para retiro";
  if (deliveryType !== "pickup" && normalizedStatus === "Listo para retiro") return "Preparando";
  return normalizedStatus;
}

export function formatOrderDate(value) {
  if (!value) return "Sin fecha";
  try {
    return new Intl.DateTimeFormat("es-EC", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  } catch {
    return value;
  }
}

export const ORDER_STATUS_META = {
  Pendiente: { tone: "pending", icon: Clock3, description: "Recibimos tu solicitud y está pendiente de revisión." },
  Confirmado: { tone: "confirmed", icon: BadgeCheck, description: "El pedido fue validado y está confirmado." },
  Preparando: { tone: "preparing", icon: Package, description: "Estamos organizando y preparando tus prendas." },
  Enviado: { tone: "shipped", icon: Truck, description: "Tu pedido salió y va en camino." },
  "Listo para retiro": { tone: "pickup-ready", icon: Store, description: "Tu pedido está listo para retiro en local." },
  Entregado: { tone: "delivered", icon: CheckCircle2, description: "El pedido fue entregado correctamente." },
  Cancelado: { tone: "cancelled", icon: CircleX, description: "El pedido fue cancelado y ya no continúa en proceso." },
};

export function getOrderStatusMeta(status) {
  return ORDER_STATUS_META[normalizeOrderStatus(status)] || ORDER_STATUS_META.Pendiente;
}

