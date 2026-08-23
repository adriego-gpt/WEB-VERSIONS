/**
 * Zero-PII Analytics Service for Adriego Store.
 * 
 * Enforces strict allowlist of event names and parameters.
 * Guarantees zero capture of personal information (names, emails, phones, addresses, passwords, tokens).
 */

export const ALLOWED_EVENTS = Object.freeze({
  catalog_search: Object.freeze([
    'query_term',
    'category',
    'results_count',
    'has_discount_filter'
  ]),
  product_opened: Object.freeze([
    'product_id',
    'slug',
    'category',
    'price',
    'has_offer',
    'discount_percentage',
    'source'
  ]),
  cart_item_added: Object.freeze([
    'product_id',
    'variant_size',
    'variant_color',
    'unit_price',
    'quantity'
  ]),
  checkout_started: Object.freeze([
    'subtotal',
    'item_count',
    'unique_products',
    'coupon_applied',
    'delivery_type_selected'
  ]),
  order_created: Object.freeze([
    'order_id',
    'total',
    'discount_amount',
    'item_count',
    'delivery_type',
    'coupon_used'
  ]),
  whatsapp_opened: Object.freeze([
    'order_id',
    'total',
    'device_type',
    'is_reopen'
  ])
});

// Explicit list of known sensitive field patterns to proactively reject
const SENSITIVE_KEY_PATTERNS = [
  /name/i,
  /email/i,
  /phone/i,
  /address/i,
  /pass/i,
  /token/i,
  /secret/i,
  /auth/i,
  /cookie/i,
  /session/i,
  /credit/i,
  /card/i,
  /ip/i,
  /item[s]?$/i,
  /product[s]?$/i
];

function containsSensitiveString(value) {
  const normalized = value.trim();
  const emailLike = normalized.includes('@') && normalized.includes('.');
  const digitCount = (normalized.match(/\d/g) || []).length;
  const phoneLike = digitCount >= 8;
  return emailLike || phoneLike;
}

/**
 * Sanitizes and validates an event payload according to the strict Zero-PII allowlist.
 * 
 * @param {string} eventName 
 * @param {Record<string, unknown>} rawPayload 
 * @returns {Record<string, unknown> | null} Sanitized payload or null if event is invalid.
 */
export function sanitizeEventPayload(eventName, rawPayload = {}) {
  if (!eventName || typeof eventName !== 'string') {
    return null;
  }

  const normalizedEvent = eventName.trim();
  const allowedFields = ALLOWED_EVENTS[normalizedEvent];

  if (!allowedFields) {
    return null;
  }

  if (!rawPayload || typeof rawPayload !== 'object' || Array.isArray(rawPayload)) {
    return {};
  }

  const sanitized = {};

  for (const field of allowedFields) {
    if (Object.prototype.hasOwnProperty.call(rawPayload, field)) {
      const value = rawPayload[field];

      // Double-check field against sensitive key patterns (defense-in-depth)
      const isSensitive = SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(field));
      if (isSensitive) {
        continue;
      }

      // Only allow primitive types (string, number, boolean)
      if (typeof value === 'string') {
        // Disallow values that look like email addresses or tokens
        if (containsSensitiveString(value)) {
          continue;
        }
        sanitized[field] = value.slice(0, 100); // Safe length clamp
      } else if (typeof value === 'number' && Number.isFinite(value)) {
        sanitized[field] = value;
      } else if (typeof value === 'boolean') {
        sanitized[field] = value;
      }
    }
  }

  return sanitized;
}

/**
 * Tracks an analytics event to window.dataLayer if available.
 * Fails silently under all circumstances without throwing errors.
 * 
 * @param {string} name - Event name from the allowed events list.
 * @param {Record<string, unknown>} payload - Event parameters.
 * @returns {boolean} True if event was valid and dispatched, false otherwise.
 */
export function trackAnalyticsEvent(name, payload = {}) {
  try {
    const sanitized = sanitizeEventPayload(name, payload);
    if (!sanitized) {
      return false;
    }

    const eventRecord = {
      event: name.trim(),
      ...sanitized,
      timestamp: Date.now()
    };

    if (typeof window !== 'undefined' && Array.isArray(window.dataLayer)) {
      window.dataLayer.push(eventRecord);
      return true;
    }

    return true;
  } catch {
    // Fail silently without interrupting UI or application state
    return false;
  }
}
