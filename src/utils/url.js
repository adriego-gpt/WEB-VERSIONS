/**
 * URL and deep-link formatting utilities.
 */
import { normalizeWhatsAppInternationalNumber } from "./phone.js";
import { sanitizeParagraph, normalizeEmail } from "./sanitizers.js";

export function normalizeSafeUrl(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.startsWith("/") || raw.startsWith("#")) return raw;
  const hasScheme = /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(raw);
  if (!hasScheme && !raw.includes(".")) return "";
  const candidate = hasScheme ? raw : `https://${raw}`;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.toString();
    }
  } catch {
    // invalid URL format, ignore
  }
  return "";
}

export function normalizeMapsEmbedUrl(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const srcMatch = raw.match(/src=["']([^"']+)["']/i);
  const candidate = srcMatch ? srcMatch[1].trim() : raw;
  try {
    const parsed = new URL(candidate);
    const isGoogleEmbed = (
      (parsed.hostname === "www.google.com" || parsed.hostname === "google.com" || parsed.hostname === "maps.google.com")
      && (parsed.pathname.startsWith("/maps/embed") || parsed.pathname.startsWith("/maps"))
    );
    if (isGoogleEmbed && (parsed.protocol === "https:" || parsed.protocol === "http:")) {
      return parsed.toString();
    }
  } catch {
    // invalid URL
  }
  return "";
}

export function isValidEmail(value = "") {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

export function normalizeContactEmail(value = "", fallback = "soporte@adriego.com") {
  const clean = normalizeEmail(value);
  return isValidEmail(clean) ? clean : fallback;
}

export function buildMailtoLink(options = {}) {
  const { to = "", subject = "", body = "" } = typeof options === "string"
    ? { to: options }
    : (options || {});
  const email = normalizeContactEmail(to);
  const params = new URLSearchParams();
  if (subject) params.set("subject", sanitizeParagraph(subject));
  if (body) params.set("body", String(body || "").trim());
  const query = params.toString();
  return query ? `mailto:${email}?${query}` : `mailto:${email}`;
}

function normalizeWhatsAppArguments(phoneOrOptions = "", positionalText = "") {
  if (phoneOrOptions && typeof phoneOrOptions === "object") {
    return {
      phone: phoneOrOptions.phone || "",
      text: phoneOrOptions.text ?? positionalText,
    };
  }
  return { phone: phoneOrOptions || "", text: positionalText };
}

export function buildWhatsAppLink(phoneOrOptions = "", positionalText = "") {
  const { phone, text } = normalizeWhatsAppArguments(phoneOrOptions, positionalText);
  const cleanPhone = normalizeWhatsAppInternationalNumber(phone);
  if (!cleanPhone) return "";
  const encodedText = encodeURIComponent(String(text || "").trim());
  return encodedText ? `https://wa.me/${cleanPhone}?text=${encodedText}` : `https://wa.me/${cleanPhone}`;
}

export function buildWhatsAppApiSendLink(phoneOrOptions = "", positionalText = "") {
  const { phone, text } = normalizeWhatsAppArguments(phoneOrOptions, positionalText);
  const cleanPhone = normalizeWhatsAppInternationalNumber(phone);
  if (!cleanPhone) return "";
  const params = new URLSearchParams({ phone: cleanPhone });
  if (text) params.set("text", String(text || "").trim());
  return `https://api.whatsapp.com/send?${params.toString()}`;
}

export function buildWhatsAppWebSendLink(phoneOrOptions = "", positionalText = "") {
  const { phone, text } = normalizeWhatsAppArguments(phoneOrOptions, positionalText);
  const cleanPhone = normalizeWhatsAppInternationalNumber(phone);
  if (!cleanPhone) return "";
  const params = new URLSearchParams({ phone: cleanPhone });
  if (text) params.set("text", String(text || "").trim());
  return `https://web.whatsapp.com/send?${params.toString()}`;
}

export function parseWhatsAppTargetFromUrl(url = "") {
  const clean = String(url || "").trim();
  if (!clean) return { phone: "", text: "" };
  try {
    const parsed = new URL(clean);
    if (parsed.hostname.includes("wa.me")) {
      const phone = parsed.pathname.replace(/^\/+/, "").split("/")[0] || "";
      const text = parsed.searchParams.get("text") || "";
      return { phone: normalizeWhatsAppInternationalNumber(phone), text };
    }
    if (parsed.hostname.includes("whatsapp.com")) {
      const phone = parsed.searchParams.get("phone") || "";
      const text = parsed.searchParams.get("text") || "";
      return { phone: normalizeWhatsAppInternationalNumber(phone), text };
    }
  } catch {
    // ignore
  }
  return { phone: "", text: "" };
}

export function buildWhatsAppLinkFromBase(baseUrl = "", options = {}) {
  const isPositionalText = typeof options === "string";
  const { phone = "", text = "" } = isPositionalText ? { text: options } : (options || {});
  const fromBase = parseWhatsAppTargetFromUrl(baseUrl);
  const targetPhone = phone || fromBase.phone;
  const hasExplicitText = isPositionalText || Object.prototype.hasOwnProperty.call(options || {}, "text");
  const targetText = hasExplicitText ? text : fromBase.text;
  return buildWhatsAppLink({ phone: targetPhone, text: targetText });
}

export function resolveWhatsAppLaunchUrls({ phone = "", text = "", preferredUrl = "" } = {}) {
  const target = preferredUrl ? parseWhatsAppTargetFromUrl(preferredUrl) : { phone, text };
  const finalPhone = target.phone || phone;
  const finalText = target.text !== undefined ? target.text : text;

  const shortLink = buildWhatsAppLink({ phone: finalPhone, text: finalText });
  const apiLink = buildWhatsAppApiSendLink({ phone: finalPhone, text: finalText });
  const webLink = buildWhatsAppWebSendLink({ phone: finalPhone, text: finalText });

  return {
    primary: shortLink || apiLink || webLink || "",
    fallback: apiLink || shortLink || "",
    web: webLink || "",
  };
}

export function preOpenExternalWindow() {
  if (typeof window === "undefined" || typeof window.open !== "function") return null;
  try {
    const popup = window.open("", "_blank");
    if (popup) {
      popup.opener = null;
    }
    return popup;
  } catch {
    return null;
  }
}

export function closeExternalWindow(popupWindow = null) {
  if (!popupWindow) return;
  try {
    if (typeof popupWindow.close === "function" && !popupWindow.closed) {
      popupWindow.close();
    }
  } catch {
    // ignore
  }
}

export function launchExternalUrl(url = "", { target = "_blank", popupWindow = null } = {}) {
  const safeUrl = normalizeSafeUrl(url);
  if (!safeUrl || typeof window === "undefined") {
    closeExternalWindow(popupWindow);
    return false;
  }

  if (popupWindow && !popupWindow.closed) {
    try {
      popupWindow.location.href = safeUrl;
      return true;
    } catch {
      // fallback to normal window.open
    }
  }

  try {
    const opened = window.open(safeUrl, target, "noopener,noreferrer");
    if (opened) {
      opened.opener = null;
      return true;
    }
  } catch {
    // ignore
  }

  try {
    window.location.assign(safeUrl);
    return true;
  } catch {
    return false;
  }
}

export function launchWhatsAppUrl(urlOrOptions = {}, launchOptions = {}) {
  const directUrl = typeof urlOrOptions === "string" ? normalizeSafeUrl(urlOrOptions) : "";
  const resolvedUrls = directUrl ? null : resolveWhatsAppLaunchUrls(urlOrOptions);
  const targetUrl = directUrl || resolvedUrls?.primary || resolvedUrls?.fallback || "";
  const safeUrl = normalizeSafeUrl(targetUrl);
  const preferredWindow = launchOptions?.preferredWindow || launchOptions?.popupWindow || null;
  const isMobile = Boolean(launchOptions?.isMobile);

  if (!safeUrl || typeof window === "undefined") {
    closeExternalWindow(preferredWindow);
    return { launched: false, mode: "none", url: "" };
  }

  if (preferredWindow && !preferredWindow.closed) {
    try {
      preferredWindow.location.href = safeUrl;
      return { launched: true, mode: "deep-link-window", url: safeUrl };
    } catch {
      closeExternalWindow(preferredWindow);
    }
  }

  if (isMobile) {
    try {
      window.location.assign(safeUrl);
      return { launched: true, mode: "deep-link", url: safeUrl };
    } catch {
      return { launched: false, mode: "none", url: safeUrl };
    }
  }

  // Desktop: open in a named tab so repeated calls reuse the same tab.
  // IMPORTANT: Do NOT pass "noopener" in the features string — many browsers
  // return null when noopener is set, which would trigger the fallback path
  // below and open the URL TWICE (once via window.open, once via location.assign).
  try {
    const opened = window.open(safeUrl, "adriego_whatsapp");
    if (opened) {
      try { opened.opener = null; } catch { /* cross-origin safe */ }
      return { launched: true, mode: "web-window", url: safeUrl };
    }
    // window.open returned null but the tab was likely still created.
    // Return success — do NOT fall through to location.assign.
    return { launched: true, mode: "web-window", url: safeUrl };
  } catch {
    // window.open was blocked entirely (e.g. popup blocker).
    // Only now fall back to same-window navigation.
  }

  try {
    window.location.assign(safeUrl);
    return { launched: true, mode: "same-window", url: safeUrl };
  } catch {
    return { launched: false, mode: "none", url: safeUrl };
  }
}
