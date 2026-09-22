import fs from "node:fs/promises";
import { getStoreSeo } from "../../src/domain/store/seoSettings.js";
import { normalizeMaintenanceSettings } from "../../src/domain/store/maintenance.js";

export function renderMaintenanceDocument({ template, storeSettings = {}, origin }) {
  const settings = normalizeMaintenanceSettings(storeSettings.maintenanceSettings);
  const brand = storeSettings.brandName || "Adriego Store";
  const favicon = getStoreSeo(storeSettings, origin || "https://www.adriego.shop").faviconUrl;
  const shell = template || '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div></body></html>';
  const body = `<div class="maintenance-page"><header class="maintenance-header"><span class="brand-wordmark">${escapeHtml(brand)}</span></header><main id="main-content" class="maintenance-content"><div class="maintenance-status">Tienda en mantenimiento</div><h1>${escapeHtml(settings.title)}</h1><p>${escapeHtml(settings.message)}</p>${settings.returnMessage ? `<p class="maintenance-return">${escapeHtml(settings.returnMessage)}</p>` : ""}<a href="/pedidos" class="btn btn-outline">Consultar mis pedidos</a></main></div>`;
  return shell.replace(/<title>[\s\S]*?<\/title>/g, "")
    .replace(/<meta\b[^>]*(?:name="(?:description|robots|twitter:[^"]+)"|property="og:[^"]+")[^>]*>/g, "")
    .replace(/<script\b[^>]*type="application\/ld\+json"[^>]*>[\s\S]*?<\/script>/g, "")
    .replace(/<noscript>[\s\S]*?<\/noscript>/g, "")
    .replace(/<link\b[^>]*rel="(?:icon|shortcut icon|apple-touch-icon|apple-touch-icon-precomposed)"[^>]*>/g, "")
    .replace("</head>", `<title>${escapeHtml(settings.title)} | ${escapeHtml(brand)}</title><link rel="icon" href="${escapeHtml(favicon)}"><link rel="apple-touch-icon" href="${escapeHtml(favicon)}"><script type="application/json" id="store-maintenance-state">${json({ brandName: brand, maintenanceSettings: settings })}</script></head>`)
    .replace('<div id="root"></div>', `<div id="root">${body}</div>`);
}
import { getProductSeo, getProductSlug } from "../../src/domain/products/seo.js";
import { getResponsiveImageSources } from "../../src/domain/products/imageSources.js";
import { DEFAULT_HERO_IMAGE } from "../../src/domain/store/defaultHero.js";

let builtTemplate;
export async function readPublicTemplate() {
  // Fixed build artifact, explicitly included in the Vercel function bundle.
  builtTemplate ||= fs.readFile(new URL("../../dist/index.html", import.meta.url), "utf8").catch((error) => { builtTemplate = null; throw error; });
  return builtTemplate;
}

export function escapeHtml(value = "") {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function json(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}

export function renderPublicDocument({ template, products = [], product, origin, storeSettings = {} }) {
  const safeStoreSettings = storeSettings && typeof storeSettings === "object" ? storeSettings : {};
  const site = getStoreSeo(safeStoreSettings, origin);
  const publicProducts = products.filter((p) => p.isPublic !== false && getProductSlug(p));
  const data = product ? getProductSeo(product, origin, site.brandName) : null;
  const title = data ? `${data.name} | ${site.brandName}` : site.title;
  const description = data ? data.description.slice(0, 160) : site.description;
  const url = data ? data.url : `${origin}/`;
  const image = data?.images[0] || site.imageUrl;
  const defaultShareImage = new URL("/adriego-share.png", `${origin}/`).href;
  const defaultShareDimensions = !data && image === defaultShareImage
    ? '<meta property="og:image:type" content="image/png">\n<meta property="og:image:width" content="1731">\n<meta property="og:image:height" content="909">'
    : "";
  const schema = data ? data.schema : site.schema;
  const heroImage = !data
    ? (Array.isArray(safeStoreSettings.heroSlides) && safeStoreSettings.heroSlides.length
      ? safeStoreSettings.heroSlides[0]?.image
      : "") || DEFAULT_HERO_IMAGE
    : "";
  let heroPreload = "";
  try {
    const imageUrl = new URL(String(heroImage || ""));
    if (!data && imageUrl.protocol === "https:" && !imageUrl.username && !imageUrl.password) {
      const srcSet = getResponsiveImageSources(imageUrl.href, [480, 768, 960, 1280]);
      // ASVS V1.2: encode administrator-controlled URLs for their HTML attribute context.
      heroPreload = `<link rel="preload" as="image" fetchpriority="high" href="${escapeHtml(imageUrl.href)}"${srcSet ? ` imagesrcset="${escapeHtml(srcSet)}" imagesizes="(max-width: 900px) 100vw, 54vw"` : ""}>`;
    }
  } catch {
    // Invalid or non-HTTPS image URLs do not become browser preloads.
  }
  const head = `<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<meta name="robots" content="index, follow">
<link rel="canonical" href="${escapeHtml(url)}">
<link rel="icon" href="${escapeHtml(site.faviconUrl)}">
<link rel="apple-touch-icon" href="${escapeHtml(site.faviconUrl)}">
<meta property="og:site_name" content="${escapeHtml(site.brandName)}">
<meta property="og:type" content="${data ? "product" : "website"}">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${escapeHtml(url)}">
<meta property="og:image" content="${escapeHtml(image)}">
<meta property="og:image:secure_url" content="${escapeHtml(image)}">
<meta property="og:image:alt" content="${escapeHtml(title)}">
${defaultShareDimensions}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
<meta name="twitter:image" content="${escapeHtml(image)}">
<meta name="twitter:image:alt" content="${escapeHtml(title)}">
${heroPreload}
<script id="${data ? "route-product-jsonld" : "site-jsonld"}" type="application/ld+json">${json(schema)}</script>`;
  const details = (p) => `<p>Colores: ${escapeHtml(p.colors.join(", ") || "Consulta el producto")}. Tallas: ${escapeHtml(p.sizes.join(", ") || "Consulta el producto")}.</p><p>${escapeHtml(new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" }).format(p.price))} · ${p.inStock ? "Disponible" : "Agotado"}</p>`;
  const body = data
    ? `<main id="main-content" class="container public-product-preview"><nav aria-label="Navegación"><a href="/">${escapeHtml(site.brandName)} · Volver al catálogo</a></nav><h1>${escapeHtml(data.name)}</h1>${data.images[0] ? `<img src="${escapeHtml(data.images[0])}" alt="${escapeHtml(data.name)}" width="480" height="600">` : ""}<p>${escapeHtml(data.description)}</p>${details(data)}<p>Activa JavaScript para elegir una variante y comprar desde la web.</p><a href="/">Ver más productos</a></main>`
    : `<main id="main-content" class="container public-product-preview"><h1>${escapeHtml(site.brandName)}</h1><p>${escapeHtml(site.description)}</p><h2>Catálogo de ropa</h2>${publicProducts.length ? `<ul>${publicProducts.map((p) => { const item = getProductSeo(p, origin, site.brandName); return `<li><h3><a href="${escapeHtml(item.url)}">${escapeHtml(item.name)}</a></h3>${details(item)}</li>`; }).join("")}</ul>` : "<p>No hay productos publicados por el momento.</p>"}<p>Activa JavaScript para filtrar el catálogo, elegir variantes y comprar.</p></main>`;
  const shell = template || '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"></head><body><div id="root"></div></body></html>';
  // Only process our bounded build template, never arbitrary user HTML.
  return shell.replace(/<title>[\s\S]*?<\/title>/g, "")
    .replace(/<meta\b[^>]*(?:name="(?:description|robots|twitter:[^"]+)"|property="og:[^"]+")[^>]*>/g, "")
    .replace(/<link\b[^>]*rel="canonical"[^>]*>/g, "")
    .replace(/<link\b[^>]*rel="(?:icon|shortcut icon|apple-touch-icon|apple-touch-icon-precomposed)"[^>]*>/g, "")
    .replace(/<script\b[^>]*type="application\/ld\+json"[^>]*>[\s\S]*?<\/script>/g, "")
    .replace(/<noscript>[\s\S]*?<\/noscript>/g, "")
    .replace("</head>", `${head}</head>`)
    .replace('<div id="root"></div>', `<div id="root">${body}</div>`);
}
