/**
 * Phone number normalization utilities.
 */
import { AUTH_FIELD_LIMITS, DEFAULT_WHATSAPP_COUNTRY_CODE } from "../constants";

export function normalizePhoneNumber(value = "") {
  return String(value).replace(/\D/g, "").slice(0, 20);
}

export function normalizeUserPhoneNumber(value = "") {
  return String(value).replace(/\D/g, "").slice(0, AUTH_FIELD_LIMITS.phone);
}

export function normalizeWhatsAppInternationalNumber(value = "", options = {}) {
  const digits = normalizePhoneNumber(value);
  if (!digits) return "";

  const defaultCountryCode = normalizePhoneNumber(options.defaultCountryCode || DEFAULT_WHATSAPP_COUNTRY_CODE).slice(0, 4);
  const withoutDialPrefix = digits.startsWith("00") ? digits.slice(2) : digits;

  let normalized = withoutDialPrefix;
  if (defaultCountryCode) {
    if (withoutDialPrefix.startsWith("0") && withoutDialPrefix.length >= 9 && withoutDialPrefix.length <= 11) {
      normalized = `${defaultCountryCode}${withoutDialPrefix.slice(1)}`;
    } else if (!withoutDialPrefix.startsWith(defaultCountryCode) && withoutDialPrefix.length <= 9) {
      normalized = `${defaultCountryCode}${withoutDialPrefix}`;
    }
  }

  const clipped = normalizePhoneNumber(normalized).slice(0, 15);
  if (clipped.length < 8) return "";
  return clipped;
}
