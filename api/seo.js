import { readStore } from "./_lib/store.js";
import { getPublicSiteOrigin } from "../src/constants/site.js";
import { getProductSeo, getProductSlug } from "../src/domain/products/seo.js";
import {
  PUBLIC_LEGAL_PATHS,
  escapeHtml,
  getPublicLegalDocument,
  readPublicTemplate,
  renderPublicDocument,
  renderMaintenanceDocument,
} from "./_lib/seoDocument.js";
import { consumeRateLimit, getClientIp, monitorApiRequest, normalizeLine, setCommonSecurityHeaders } from "./_lib/security.js";

const PUBLIC_HTML_CSP = "default-src 'self'; script-src 'self' https://cloud.umami.is; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https://upload.imagekit.io https://cloud.umami.is; frame-src 'self' https://www.google.com https://maps.google.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; manifest-src 'self'";

function normalizeLastModified(value) {
  const timestamp = Date.parse(String(value || ""));
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : "";
}

function renderLastModified(value) {
  const normalized = normalizeLastModified(value);
  return normalized ? `<lastmod>${normalized}</lastmod>` : "";
}

function renderSitemapIndex(origin) {
  const children = ["sitemap-pages.xml", "sitemap-products.xml"]
    .map((name) => `<sitemap><loc>${escapeHtml(`${origin}/${name}`)}</loc></sitemap>`)
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${children}</sitemapindex>`;
}

function renderPagesSitemap(origin) {
  const paths = ["/", ...PUBLIC_LEGAL_PATHS];
  const entries = paths.map((path) => `<url><loc>${escapeHtml(`${origin}${path}`)}</loc></url>`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries}</urlset>`;
}

function renderProductsSitemap(products, origin, brandName) {
  const entriesByUrl = new Map();
  for (const product of products) {
    const seo = getProductSeo(product, origin, brandName);
    if (seo.url && !entriesByUrl.has(seo.url)) entriesByUrl.set(seo.url, { product, seo });
  }
  const entries = [...entriesByUrl.values()].map(({ product, seo }) => {
    const images = seo.images.map((image) => (
      `<image:image><image:loc>${escapeHtml(image)}</image:loc><image:title>${escapeHtml(seo.name)}</image:title></image:image>`
    )).join("");
    return `<url><loc>${escapeHtml(seo.url)}</loc>${renderLastModified(product.updatedAt || product.createdAt)}${images}</url>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">${entries.join("")}</urlset>`;
}

export default async function handler(req, res) {
  monitorApiRequest(req, res, "seo");
  setCommonSecurityHeaders(res);
  if (!["GET", "HEAD"].includes(String(req.method || "GET").toUpperCase())) {
    res.setHeader("Allow", "GET, HEAD");
    return res.status(405).send("Method not allowed");
  }
  const limit = await consumeRateLimit("seo-ip", getClientIp(req), 240, 10 * 60 * 1000, { endpoint: "seo", ip: getClientIp(req) });
  if (!limit.ok) { res.setHeader("Retry-After", String(Math.ceil(limit.retryAfterMs / 1000))); return res.status(429).send("Too many requests"); }
  const origin = getPublicSiteOrigin(process.env.PUBLIC_SITE_URL || process.env.VITE_PUBLIC_SITE_URL);
  const action = normalizeLine(req.query?.action || "").toLowerCase();
  const path = normalizeLine(req.query?.path || "/").slice(0, 240);
  if (action === "robots") {
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "public, s-maxage=3600");
    return res.status(200).send(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\nDisallow: /cuenta/\nDisallow: /carrito\nDisallow: /favoritos\nDisallow: /pedidos\nDisallow: /buscar\nDisallow: /*?*\n\nSitemap: ${origin}/sitemap.xml\n`);
  }
  // Vercel routes every other top-level XML request here. Reject those paths
  // before reading maintenance state so crawlers never mistake an outage page
  // for another sitemap.
  if (action === "page" && path.toLowerCase().endsWith(".xml")) {
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=0, s-maxage=300");
    res.setHeader("X-Robots-Tag", "noindex");
    return res.status(404).send("Not found");
  }
  try {
    const store = await readStore();
    const products = (Array.isArray(store.products) ? store.products : []).filter((p) => p.name && p.isPublic !== false);
    if (["sitemap", "sitemap-index", "sitemap-pages", "sitemap-products"].includes(action)) {
      res.setHeader("Content-Type", "application/xml; charset=utf-8");
      res.setHeader("Cache-Control", "public, s-maxage=60");
      if (action === "sitemap-pages") return res.status(200).send(renderPagesSitemap(origin));
      if (action === "sitemap-products") return res.status(200).send(renderProductsSitemap(products, origin, store.storeSettings?.brandName));
      return res.status(200).send(renderSitemapIndex(origin));
    }
    if (store.storeSettings?.maintenanceSettings?.enabled === true) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Content-Security-Policy", PUBLIC_HTML_CSP);
      res.setHeader("Cache-Control", "no-store, max-age=0");
      res.setHeader("Retry-After", "300");
      const template = action === "page" ? await readPublicTemplate() : undefined;
      return res.status(503).send(renderMaintenanceDocument({ template, storeSettings: store.storeSettings, origin }));
    }
    const slug = path.startsWith("/producto/") && path.split("/").length === 3 ? path.slice(10) : "";
    const product = slug ? products.find((p) => getProductSlug(p) === slug) : null;
    const legalDocument = getPublicLegalDocument(path);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    if (path !== "/" && !product && !legalDocument) {
      res.setHeader("X-Robots-Tag", "noindex");
      return res.status(404).send('<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Página no encontrada | Adriego Store</title><meta name="robots" content="noindex"></head><body><h1>Página no encontrada</h1><a href="/">Volver al catálogo</a></body></html>');
    }
    const template = action === "page" ? await readPublicTemplate() : undefined;
    if (template) {
      // Same compiled app and public content for visitors and crawlers.
      res.setHeader("Content-Security-Policy", PUBLIC_HTML_CSP);
    }
    res.setHeader("Cache-Control", "public, max-age=0, s-maxage=60, must-revalidate");
    return res.status(200).send(renderPublicDocument({ template, products, product, legalDocument, origin, storeSettings: store.storeSettings }));
  } catch (error) {
    console.error("Public page unavailable:", error?.code || error?.name || "upstream-error");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Robots-Tag", "noindex");
    res.setHeader("Retry-After", "60");
    return res.status(503).send("El catálogo no está disponible temporalmente. Vuelve a intentarlo en unos momentos.");
  }
}
