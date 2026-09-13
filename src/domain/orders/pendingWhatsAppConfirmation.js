const ALLOWED_WHATSAPP_HOSTS = new Set([
  "wa.me",
  "api.whatsapp.com",
  "web.whatsapp.com",
]);

function normalizeText(value, maxLength) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function normalizeMoney(value) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : 0;
}

function normalizeWhatsAppUrl(value) {
  const rawUrl = String(value || "").trim();
  if (!rawUrl) return "";

  try {
    const parsedUrl = new URL(rawUrl);
    if (parsedUrl.protocol !== "https:" || !ALLOWED_WHATSAPP_HOSTS.has(parsedUrl.hostname.toLowerCase())) {
      return "";
    }
    return parsedUrl.toString();
  } catch {
    return "";
  }
}

export function createEmptyPendingWhatsAppConfirmation() {
  return {
    open: false,
    order: null,
    whatsappUrl: "",
    whatsappOpened: false,
  };
}

export function createOrderSuccessModalState(value) {
  if (!value || typeof value !== "object" || !value.order || typeof value.order !== "object") {
    return null;
  }

  const code = normalizeText(value.order.code, 80);
  const rawWhatsAppUrl = String(value.whatsappUrl || "").trim();
  const whatsappUrl = normalizeWhatsAppUrl(rawWhatsAppUrl);
  if (!code || (rawWhatsAppUrl && !whatsappUrl)) return null;

  return {
    open: true,
    order: {
      id: normalizeText(value.order.id, 120),
      code,
      paymentMethod: normalizePaymentMethod(value.order.paymentMethod),
      total: normalizeMoney(value.order.total ?? value.order.subtotal),
      subtotal: normalizeMoney(value.order.subtotal),
    },
    whatsappUrl,
    whatsappOpened: value.whatsappOpened === true,
  };
}

export function normalizePendingWhatsAppConfirmation(value) {
  const normalized = createOrderSuccessModalState(value);
  return normalized?.order.paymentMethod === PAYMENT_METHODS.cardLink ? normalized : null;
}

export function createPendingWhatsAppConfirmation({ order, whatsappUrl }) {
  return normalizePendingWhatsAppConfirmation({
    order,
    whatsappUrl,
    whatsappOpened: false,
  });
}

export function markPendingWhatsAppAsOpened(value) {
  const normalized = normalizePendingWhatsAppConfirmation(value);
  return normalized ? { ...normalized, whatsappOpened: true } : null;
}
import { PAYMENT_METHODS, normalizePaymentMethod } from "./payment.js";
