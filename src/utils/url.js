/**
 * URL normalization, WhatsApp link building, and external URL launching.
 */
import { normalizeWhatsAppInternationalNumber } from "./phone";
import { sanitizeParagraph, normalizeOptionLabel } from "./sanitizers";
import { normalizeEmail } from "./sanitizers";

export function normalizeSafeUrl(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const hasScheme = /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(raw);
  if (!hasScheme && !raw.includes(".")) return "";
  const candidate = hasScheme ? raw : `https://${raw}`;
  try {
    const url = new URL(candidate);
    if (!["https:", "http:"].includes(url.protocol)) return "";
    return url.toString();
  } catch {
    return "";
  }
}

export function isValidEmail(value = "") {
  const email = normalizeEmail(value);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function normalizeContactEmail(value = "", fallback = "") {
  const normalized = normalizeEmail(value || fallback);
  return isValidEmail(normalized) ? normalized : "";
}

export function buildMailtoLink(email = "") {
  const normalized = normalizeContactEmail(email);
  return normalized ? `mailto:${normalized}` : "";
}

export function buildWhatsAppLink(number, text = "") {
  const digits = normalizeWhatsAppInternationalNumber(number);
  if (!digits) return "";
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

export function buildWhatsAppApiSendLink(number, text = "") {
  const digits = normalizeWhatsAppInternationalNumber(number);
  if (!digits) return "";
  const params = new URLSearchParams({ phone: digits });
  if (text) params.set("text", text);
  return `https://api.whatsapp.com/send?${params.toString()}`;
}

export function buildWhatsAppWebSendLink(number, text = "") {
  const digits = normalizeWhatsAppInternationalNumber(number);
  if (!digits) return "";
  const params = new URLSearchParams({ phone: digits });
  if (text) params.set("text", text);
  return `https://web.whatsapp.com/send?${params.toString()}`;
}

export function parseWhatsAppTargetFromUrl(url = "") {
  const safeUrl = normalizeSafeUrl(url);
  if (!safeUrl) {
    return {
      safeUrl: "",
      isWhatsApp: false,
      phone: "",
      text: "",
    };
  }
  try {
    const parsed = new URL(safeUrl);
    const hostname = parsed.hostname.toLowerCase();
    const isWaMe = hostname === "wa.me" || hostname.endsWith(".wa.me");
    const isWhatsAppDomain = hostname.endsWith("whatsapp.com");
    if (!isWaMe && !isWhatsAppDomain) {
      return {
        safeUrl,
        isWhatsApp: false,
        phone: "",
        text: "",
      };
    }

    let phone = "";
    if (isWaMe) {
      phone = normalizeWhatsAppInternationalNumber(parsed.pathname.replace(/\//g, ""));
      if (!phone) phone = normalizeWhatsAppInternationalNumber(parsed.searchParams.get("phone") || "");
    } else {
      phone = normalizeWhatsAppInternationalNumber(parsed.searchParams.get("phone") || "");
      if (!phone && parsed.pathname.toLowerCase().startsWith("/send/")) {
        phone = normalizeWhatsAppInternationalNumber(parsed.pathname.slice("/send/".length));
      }
    }

    const text = sanitizeParagraph(parsed.searchParams.get("text") || "");
    return {
      safeUrl,
      isWhatsApp: true,
      phone,
      text,
    };
  } catch {
    return {
      safeUrl,
      isWhatsApp: false,
      phone: "",
      text: "",
    };
  }
}

export function buildWhatsAppLinkFromBase(link, text = "") {
  const safeLink = normalizeSafeUrl(link);
  if (!safeLink) return "";
  try {
    const parsed = new URL(safeLink);
    const hostname = parsed.hostname.toLowerCase();
    const isWaMe = hostname === "wa.me" || hostname.endsWith(".wa.me");
    const isWhatsAppDomain = hostname.endsWith("whatsapp.com");
    if (!isWaMe && !isWhatsAppDomain) return "";

    const phoneFromPath = normalizeWhatsAppInternationalNumber(parsed.pathname.replace(/\//g, ""));
    const phoneFromQuery = normalizeWhatsAppInternationalNumber(parsed.searchParams.get("phone") || "");
    const resolvedPhone = phoneFromPath || phoneFromQuery;

    if (isWaMe) {
      if (resolvedPhone) parsed.pathname = `/${resolvedPhone}`;
      parsed.searchParams.delete("phone");
    } else if (!parsed.pathname || parsed.pathname === "/") {
      parsed.pathname = "/send";
    }
    if (!isWaMe && resolvedPhone) parsed.searchParams.set("phone", resolvedPhone);
    parsed.searchParams.delete("type");
    parsed.searchParams.delete("app_absent");

    const resolvedText = sanitizeParagraph(text || parsed.searchParams.get("text") || "");
    const canAttachText = isWaMe || parsed.pathname.toLowerCase().startsWith("/send");
    if (canAttachText) {
      if (resolvedText) parsed.searchParams.set("text", resolvedText);
      else parsed.searchParams.delete("text");
    }

    return parsed.toString();
  } catch {
    return "";
  }
}

export function resolveWhatsAppLaunchUrls(url = "") {
  const safeUrl = normalizeSafeUrl(url);
  if (!safeUrl) return { deepLink: "", webFallback: "", desktopWeb: "" };

  const target = parseWhatsAppTargetFromUrl(safeUrl);
  if (!target.isWhatsApp) {
    return { deepLink: "", webFallback: safeUrl, desktopWeb: safeUrl };
  }

  const deepParams = new URLSearchParams();
  if (target.phone) deepParams.set("phone", target.phone);
  if (target.text) deepParams.set("text", target.text);
  const deepLink = `whatsapp://send${deepParams.toString() ? `?${deepParams.toString()}` : ""}`;

  const mobileFallback = target.phone
    ? (buildWhatsAppLink(target.phone, target.text) || buildWhatsAppApiSendLink(target.phone, target.text))
    : (buildWhatsAppLinkFromBase(safeUrl, target.text) || safeUrl);

  const desktopWeb = target.phone
    ? (
      buildWhatsAppApiSendLink(target.phone, target.text)
      || buildWhatsAppLink(target.phone, target.text)
      || buildWhatsAppWebSendLink(target.phone, target.text)
    )
    : (buildWhatsAppLinkFromBase(safeUrl, target.text) || safeUrl);

  return {
    deepLink,
    webFallback: normalizeSafeUrl(mobileFallback) || safeUrl,
    desktopWeb: normalizeSafeUrl(desktopWeb) || safeUrl,
  };
}

export function launchExternalUrl(url, options = {}) {
  if (!url || typeof window === "undefined") return false;
  const safeUrl = normalizeSafeUrl(url);
  if (!safeUrl) return false;
  const preferredWindow = options?.preferredWindow || null;

  if (preferredWindow && !preferredWindow.closed) {
    try {
      preferredWindow.location.href = safeUrl;
      preferredWindow.opener = null;
      return true;
    } catch {
      // Continue with default fallbacks below.
    }
  }

  const popup = window.open(safeUrl, "_blank", "noopener,noreferrer");
  if (popup) return true;

  try {
    const anchor = document.createElement("a");
    anchor.href = safeUrl;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    anchor.click();
    return true;
  } catch {
    try {
      window.location.href = safeUrl;
      return true;
    } catch {
      return false;
    }
  }
}

export function launchWhatsAppUrl(url, options = {}) {
  if (!url || typeof window === "undefined") return { launched: false, mode: "invalid" };

  const safeUrl = normalizeSafeUrl(url);
  if (!safeUrl) return { launched: false, mode: "invalid" };

  const isMobile = Boolean(options?.isMobile);
  const preferredWindow = options?.preferredWindow || null;
  const { deepLink, webFallback, desktopWeb } = resolveWhatsAppLaunchUrls(safeUrl);
  const fallbackUrl = webFallback || safeUrl;
  const desktopUrl = desktopWeb || fallbackUrl || safeUrl;

  if (!isMobile) {
    const launched = launchExternalUrl(desktopUrl, { preferredWindow });
    return { launched, mode: launched ? "web" : "failed" };
  }

  if (!deepLink) {
    const launched = launchExternalUrl(fallbackUrl, { preferredWindow });
    return { launched, mode: launched ? "web-fallback" : "failed" };
  }

  let deepLinkTriggered = false;
  try {
    if (preferredWindow && !preferredWindow.closed) {
      preferredWindow.location.href = deepLink;
      preferredWindow.opener = null;
      deepLinkTriggered = true;
    }
  } catch {
    deepLinkTriggered = false;
  }

  if (!deepLinkTriggered) {
    try {
      window.location.href = deepLink;
      deepLinkTriggered = true;
    } catch {
      const launched = launchExternalUrl(fallbackUrl, { preferredWindow });
      return { launched, mode: launched ? "web-fallback" : "failed" };
    }
  }

  const fallbackDelayMs = Math.max(700, Number(options?.fallbackDelayMs) || 1200);
  let timeoutId = null;
  const cleanup = () => {
    if (timeoutId) window.clearTimeout(timeoutId);
    timeoutId = null;
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    }
    window.removeEventListener("pagehide", handlePageHide);
  };
  const handleVisibilityChange = () => {
    if (typeof document !== "undefined" && document.hidden) {
      cleanup();
    }
  };
  const handlePageHide = () => {
    cleanup();
  };

  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", handleVisibilityChange, { passive: true });
  }
  window.addEventListener("pagehide", handlePageHide, { passive: true });
  timeoutId = window.setTimeout(() => {
    if (typeof document !== "undefined" && document.hidden) {
      cleanup();
      return;
    }
    launchExternalUrl(fallbackUrl, { preferredWindow });
    cleanup();
  }, fallbackDelayMs);

  return { launched: true, mode: preferredWindow && !preferredWindow.closed ? "deep-link-window" : "deep-link" };
}

/** No-op stub. Kept for API compatibility; original window.open pre-open was removed to prevent popup blockers. */
export function preOpenExternalWindow() {
  return null;
}

/** Close a pre-opened external window, if any. Safe to call with null. */
export function closeExternalWindow(targetWindow) {
  if (!targetWindow || typeof targetWindow.close !== "function") return;
  try {
    if (!targetWindow.closed) targetWindow.close();
  } catch {
    // No-op if browser blocks close.
  }
}
