export const PAYMENT_METHODS = Object.freeze({
  transfer: "transfer",
  cardLink: "card_link",
});

export const DEFAULT_CARD_FEE_PERCENT = 6;

export function normalizePaymentMethod(value = "") {
  return value === PAYMENT_METHODS.cardLink ? PAYMENT_METHODS.cardLink : PAYMENT_METHODS.transfer;
}

export function normalizeCardFeePercent() {
  return DEFAULT_CARD_FEE_PERCENT;
}

export function roundCurrencyAmount(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

export function calculatePaymentFee(baseTotal, paymentMethod, cardFeePercent = DEFAULT_CARD_FEE_PERCENT) {
  if (normalizePaymentMethod(paymentMethod) !== PAYMENT_METHODS.cardLink) return 0;
  const safeBaseTotal = Math.max(0, Number(baseTotal) || 0);
  const safePercent = normalizeCardFeePercent(cardFeePercent);
  return roundCurrencyAmount(safeBaseTotal * (safePercent / 100));
}

export function calculatePayableTotal(baseTotal, paymentMethod, cardFeePercent = DEFAULT_CARD_FEE_PERCENT) {
  const safeBaseTotal = roundCurrencyAmount(Math.max(0, Number(baseTotal) || 0));
  return roundCurrencyAmount(safeBaseTotal + calculatePaymentFee(safeBaseTotal, paymentMethod, cardFeePercent));
}

export function getPaymentMethodLabel(paymentMethod) {
  return normalizePaymentMethod(paymentMethod) === PAYMENT_METHODS.cardLink
    ? "Tarjeta mediante enlace de pago"
    : "Transferencia bancaria";
}
