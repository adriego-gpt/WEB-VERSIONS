import { readStore } from "./_lib/store.js";
import { getPublicSiteOrigin } from "../src/constants/site.js";
import { getProductSlug } from "../src/domain/products/seo.js";
import { escapeHtml, readPublicTemplate, renderPublicDocument } from "./_lib/seoDocument.js";
import { consumeRateLimit, getClientIp, monitorApiRequest, normalizeLine, setCommonSecurityHeaders } from "./_lib/security.js";

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
  try {
    const store = await readStore();
    const products = (Array.isArray(store.products) ? store.products : []).filter((p) => p.name && p.isPublic !== false);
    if (action === "sitemap") {
      res.setHeader("Content-Type", "application/xml; charset=utf-8");
      res.setHeader("Cache-Control", "public, s-maxage=60");
      const paths = [...new Set(["/", ...products.map((p) => `/producto/${getProductSlug(p)}`).filter((p) => p !== "/producto/")])];
      // lastmod needs actual page dates; do not claim every page changed today.
      return res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map((p) => `<url><loc>${escapeHtml(origin + p)}</loc></url>`).join("")}</urlset>`);
    }
    const slug = path.startsWith("/producto/") && path.split("/").length === 3 ? path.slice(10) : "";
    const product = slug ? products.find((p) => getProductSlug(p) === slug) : null;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    if (path !== "/" && !product) {
      res.setHeader("X-Robots-Tag", "noindex");
      return res.status(404).send('<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Página no encontrada | Adriego Store</title><meta name="robots" content="noindex"></head><body><h1>Página no encontrada</h1><a href="/">Volver al catálogo</a></body></html>');
    }
    const template = action === "page" ? await readPublicTemplate() : undefined;
    if (template) {
      // Same compiled app and public content for visitors and crawlers.
      res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob: https:; font-src 'self' https://fonts.gstatic.com data:; connect-src 'self' https://upload.imagekit.io; frame-src 'self' https://www.google.com https://maps.google.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; manifest-src 'self'");
    }
    res.setHeader("Cache-Control", "public, max-age=0, s-maxage=60, must-revalidate");
    return res.status(200).send(renderPublicDocument({ template, products, product, origin }));
  } catch (error) {
    console.error("Public page unavailable:", error?.code || error?.name || "upstream-error");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Robots-Tag", "noindex");
    res.setHeader("Retry-After", "60");
    return res.status(503).send("El catálogo no está disponible temporalmente. Vuelve a intentarlo en unos momentos.");
  }
}
