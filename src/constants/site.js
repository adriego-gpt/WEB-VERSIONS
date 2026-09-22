export const DEFAULT_PUBLIC_SITE_ORIGIN = "https://www.adriego.shop";

export function normalizePublicSiteOrigin(value = "") {
  try {
    const url = new URL(String(value || "").trim());
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    // OWASP Input Validation: accept an origin, never credentials, paths or redirects.
    if ((url.protocol !== "https:" && !(local && url.protocol === "http:"))
      || url.username || url.password || url.search || url.hash || url.pathname !== "/") return "";
    return url.origin;
  } catch {
    return "";
  }
}

export function getPublicSiteOrigin(value = "") {
  return normalizePublicSiteOrigin(value) || DEFAULT_PUBLIC_SITE_ORIGIN;
}
