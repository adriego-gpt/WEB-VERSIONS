import { sanitizeLine, sanitizeParagraph } from "../../utils/sanitizers.js";
import { normalizeSafeUrl } from "../../utils/url.js";

export function normalizePickupEmbedUrl(value = "") {
  const candidate = String(value || "").trim();
  try {
    const url = new URL(candidate);
    if (url.protocol === "https:" && ["www.google.com", "maps.google.com"].includes(url.hostname)
      && url.pathname.startsWith("/maps") && !url.username && !url.password) return url.toString().slice(0, 1000);
  } catch { /* An invalid map never blocks the order details. */ }
  return "";
}

export function resolvePickupLocation({ address = "", locationNote = "", mapsLink = "", mapsEmbedUrl = "" } = {}) {
  const safeAddress = sanitizeLine(address);
  const candidate = normalizeSafeUrl(mapsLink);
  const safeLink = /^https?:\/\//i.test(candidate) && !candidate.startsWith("//") ? candidate : "";
  return {
    address: safeAddress,
    locationNote: sanitizeParagraph(locationNote),
    mapsLink: safeLink || (safeAddress ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(safeAddress)}` : ""),
    mapsEmbedUrl: normalizePickupEmbedUrl(mapsEmbedUrl),
  };
}
