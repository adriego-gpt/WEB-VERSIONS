import assert from "node:assert/strict";
import test from "node:test";
import { normalizeSeoImageUrl, normalizeSeoSettings, getStoreSeo } from "../../src/domain/store/seoSettings.js";
import { sanitizeStoreSettings } from "../../api/_lib/storeSanitizers.js";
import { renderPublicDocument } from "../../api/_lib/seoDocument.js";
import { collectCatalogImagePaths } from "../../api/catalog-state.js";

const origin = "https://www.adriego.shop";
const settings = { brandName: "Adriego Boutique", seoSettings: {
  title: "Adriego | Colección exclusiva", description: "Descubre nuestra nueva colección.",
  alternateName: "Adriego", faviconUrl: "https://images.example.com/icon.png",
  logoUrl: "https://images.example.com/logo.png", imageUrl: "https://images.example.com/share.jpg",
} };

test("legacy settings retain the current default search identity", () => {
  const result = getStoreSeo({}, origin);
  assert.equal(result.title, "Adriego Store | Ropa, colores y tallas");
  assert.equal(result.faviconUrl, `${origin}/adriego-icon.png`);
  assert.equal(result.logoUrl, `${origin}/adriego-logo.png`);
  assert.equal(result.imageUrl, `${origin}/adriego-share.png`);
  assert.equal(getStoreSeo(null, origin).title, result.title);
  assert.equal(getStoreSeo({ brandName: "Nueva Marca" }, origin).title, "Nueva Marca | Ropa, colores y tallas");
});

test("SEO normalization bounds text and rejects unsafe image URLs", () => {
  for (const value of ["javascript:alert(1)", "data:image/png;base64,aGVsbG8=", "blob:https://example.com/id", "http://example.com/a.png", "https://user:pass@example.com/a.png", "//example.com/a.png", "/\\example.com/a.png", {}]) assert.equal(normalizeSeoImageUrl(value), "");
  assert.equal(normalizeSeoImageUrl("/icon.png"), "/icon.png");
  assert.equal(getStoreSeo({ seoSettings: { faviconUrl: "/icon.png" } }, origin).faviconUrl, `${origin}/icon.png`);
  const result = normalizeSeoSettings({ title: "x".repeat(150), description: "y".repeat(500), alternateName: "  Adriego\n Store  ", extra: "discard" });
  assert.equal(result.title.length, 100);
  assert.equal(result.description.length, 320);
  assert.equal(result.alternateName, "Adriego Store");
  assert.equal(result.extra, undefined);
  assert.deepEqual(normalizeSeoSettings(null), normalizeSeoSettings({}));
});

test("server sanitizer persists all identity settings without arbitrary extra fields", () => {
  const sanitized = sanitizeStoreSettings(settings);
  assert.deepEqual(sanitized.seoSettings, settings.seoSettings);
  assert.equal(sanitized.brandName, settings.brandName);
});

test("catalog cleanup retains images used by search identity even after product deletion", () => {
  const endpoint = "https://ik.imagekit.io/adriego";
  const imagePath = "/catalog/products/2026-09/4ba7cd1c-8b6c-4b70-8a51-ea241a1d14bd.png";
  const url = `${endpoint}${imagePath}`;
  const retained = collectCatalogImagePaths({ products: [], storeSettings: { seoSettings: { faviconUrl: url, logoUrl: url, imageUrl: url } } }, endpoint);
  assert.equal(retained.size, 1);
  assert.ok(retained.has(imagePath));
  assert.equal(collectCatalogImagePaths({ products: [], storeSettings: { seoSettings: {} } }, endpoint).size, 0);
});

test("SSR delivers editable metadata and WebSite/Organization schema without duplicate icons", () => {
  const template = '<html><head><title>Old</title><link rel="icon" type="image/svg+xml" href="/old.svg"><link rel="apple-touch-icon" href="/old.png"><meta property="og:site_name" content="Old"><script type="application/ld+json">{}</script></head><body><div id="root"></div></body></html>';
  const html = renderPublicDocument({ template, origin, storeSettings: settings });
  assert.match(html, /<title>Adriego \| Colección exclusiva<\/title>/);
  assert.match(html, /name="description" content="Descubre nuestra nueva colección\."/);
  assert.match(html, /property="og:image" content="https:\/\/images\.example\.com\/share\.jpg"/);
  assert.equal((html.match(/rel="icon"/g) || []).length, 1);
  assert.equal((html.match(/rel="apple-touch-icon"/g) || []).length, 1);
  assert.doesNotMatch(html, /old\.svg|old\.png|content="Old"/);
  const schema = JSON.parse(html.match(/id="site-jsonld"[^>]*>([\s\S]*?)<\/script>/)[1]);
  assert.equal(schema["@graph"][0]["@type"], "WebSite");
  assert.equal(schema["@graph"][0].name, settings.brandName);
  assert.equal(schema["@graph"][0].alternateName, "Adriego");
  assert.equal(schema["@graph"][1].logo, settings.seoSettings.logoUrl);
});

test("product pages retain their own metadata and use the configured seller name", () => {
  const product = { name: "Prenda especial", price: 25, image: "https://images.example.com/product.jpg", variants: [{ color: "Rojo", size: "S", stock: 1 }] };
  const html = renderPublicDocument({ origin, product, storeSettings: settings });
  assert.match(html, /<title>Prenda especial \| Adriego Boutique<\/title>/);
  assert.match(html, /property="og:image" content="https:\/\/images\.example\.com\/product\.jpg"/);
  const schema = JSON.parse(html.match(/id="route-product-jsonld"[^>]*>([\s\S]*?)<\/script>/)[1]);
  assert.equal(schema.offers.seller.name, "Adriego Boutique");
  assert.equal(schema.offers.price, "25");
});

test("edited text cannot break HTML attributes or inject a script from structured data", () => {
  const html = renderPublicDocument({ origin, storeSettings: { brandName: '</script><script>alert(1)</script>', seoSettings: { title: '"><script>alert(2)</script>', description: 'a" onload="alert(3)' } } });
  assert.doesNotMatch(html, /<script>alert\(/);
  assert.match(html, /&lt;script&gt;/);
  const schema = JSON.parse(html.match(/id="site-jsonld"[^>]*>([\s\S]*?)<\/script>/)[1]);
  assert.equal(schema["@graph"][0].name, '</script><script>alert(1)</script>');
});
