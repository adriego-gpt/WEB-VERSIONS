import { SITE_DESCRIPTION } from "../products/seo.js";

const text = (value, limit) => typeof value === "string"
  ? value.replace(/\p{Cc}/gu, " ").replace(/\s+/g, " ").trim().slice(0, limit) : "";

export function normalizeSeoImageUrl(value) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw || raw.length > 2048) return "";
  if (/^\/(?!\/)/.test(raw) && !/[\\\s\p{Cc}]/u.test(raw)) return raw;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : "";
  } catch { return ""; }
}

export function normalizeSeoSettings(raw = {}) {
  const source = raw && typeof raw === "object" ? raw : {};
  return {
    title: text(source.title, 100), description: text(source.description, 320),
    alternateName: text(source.alternateName, 80),
    faviconUrl: normalizeSeoImageUrl(source.faviconUrl),
    logoUrl: normalizeSeoImageUrl(source.logoUrl),
    imageUrl: normalizeSeoImageUrl(source.imageUrl),
  };
}

export function getStoreSeo(store = {}, origin) {
  const source = store && typeof store === "object" ? store : {};
  const settings = normalizeSeoSettings(source.seoSettings);
  const brandName = text(source.brandName, 80) || "Adriego Store";
  const absolute = (url, fallback) => new URL(url || fallback, `${origin}/`).href;
  const faviconUrl = absolute(settings.faviconUrl, "/adriego-icon.png");
  const logoUrl = absolute(settings.logoUrl, "/adriego-logo.png");
  const imageUrl = absolute(settings.imageUrl, "/adriego-share.png");
  return {
    brandName, title: settings.title || `${brandName} | Ropa, colores y tallas`,
    description: settings.description || SITE_DESCRIPTION.replaceAll("Adriego Store", () => brandName),
    faviconUrl, logoUrl, imageUrl,
    schema: {
      "@context": "https://schema.org", "@graph": [
        { "@type": "WebSite", "@id": `${origin}/#website`, url: `${origin}/`, name: brandName,
          ...(settings.alternateName ? { alternateName: settings.alternateName } : {}),
          publisher: { "@id": `${origin}/#organization` } },
        { "@type": "Organization", "@id": `${origin}/#organization`, name: brandName,
          url: `${origin}/`, logo: logoUrl },
      ],
    },
  };
}
