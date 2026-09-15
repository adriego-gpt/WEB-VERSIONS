import { sanitizeLine, sanitizeParagraph } from "../../utils/sanitizers.js";
import { normalizeUserPhoneNumber } from "../../utils/phone.js";

export function validateCheckoutDelivery(draft = {}, { deliveryType = "pickup", guestCheckout = false } = {}) {
  const errors = {};
  if (deliveryType !== "delivery" && !guestCheckout) return errors;
  if (!sanitizeLine(draft.fullName || "")) errors.fullName = "Ingresa el nombre completo de quien recibe.";
  if (normalizeUserPhoneNumber(draft.phone || "").length !== 10) errors.phone = "Ingresa un teléfono móvil de 10 dígitos.";
  if (deliveryType === "delivery") {
    const id = String(draft.idNumber || "").replace(/\D/g, "");
    if (id.length < 10 || id.length > 13) errors.idNumber = "Ingresa tu cédula o RUC de 10 a 13 dígitos.";
    if (!sanitizeLine(draft.city || "")) errors.city = "Indica la ciudad o cantón de entrega.";
    if (!sanitizeParagraph(draft.address || "")) errors.address = "Completa la dirección exacta de entrega.";
  }
  return errors;
}
