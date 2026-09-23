import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { getProductSeo } from "../../src/domain/products/seo.js";
import { renderPublicDocument } from "../../api/_lib/seoDocument.js";
import { tryReloadStaleChunk } from "../../src/utils/chunkRecovery.js";

const product = { id: "test", name: "Chompa Azul", description: "Tejido suave.", sku: "CHO-001", price: 20, basePrice: 25, offerEnabled: true, offerDiscountMode: "percent", offerDiscountValue: 20, colors: ["Azul"], sizes: ["M"], catalogColor: "Azul", imagesByColor: { Azul: ["https://images.example/azul.png"] }, variants: [{ color: "Azul", size: "M", stock: 1 }] };
const origin = "https://adriego.shop";

test("public price, variants and structured data match active discounts", () => {
  const data = getProductSeo(product, origin);
  assert.equal(data.price, 20);
  assert.equal(data.schema.offers.price, "20");
  assert.equal(data.schema.sku, "CHO-001");
  assert.equal(data.schema.offers.availability, "https://schema.org/InStock");
  assert.deepEqual(data.colors, ["Azul"]);
  assert.deepEqual(data.sizes, ["M"]);
  assert.equal(getProductSeo({ ...product, basePrice: undefined }, origin).price, 20);
  assert.equal(getProductSeo({ ...product, price: 18, offerDiscountMode: "amount", offerDiscountValue: 7 }, origin).price, 18);
  assert.equal(getProductSeo({ ...product, offerEnabled: false }, origin).price, 25);
  assert.equal(getProductSeo({ ...product, variants: [{ stock: 0 }] }, origin).inStock, false);
});

test("public HTML includes useful content, links, schema and compiled application without duplicate metadata", () => {
  const template = '<!DOCTYPE html><html lang="es"><head><title>Anterior</title><meta name="description" content="Anterior"><link rel="canonical" href="https://old.example"><meta property="og:title" content="Anterior"><script type="application/ld+json">{"old":true}</script><script type="module" src="/assets/app-123.js"></script><link rel="stylesheet" href="/assets/app-123.css"></head><body><div id="root"></div><noscript>Anterior</noscript></body></html>';
  const html = renderPublicDocument({ template, product, origin });
  assert.match(html, /src="\/assets\/app-123.js"/);
  assert.match(html, /href="\/assets\/app-123.css"/);
  assert.match(html, /<h1>Chompa Azul<\/h1>/);
  assert.match(html, /<link rel="preload" as="image" fetchpriority="high" href="https:\/\/images\.example\/azul\.png"/);
  assert.match(html, /<img[^>]+fetchpriority="high"/);
  assert.match(html, /<p>Tejido suave\.<\/p>/);
  assert.match(html, /Colores: Azul\. Tallas: M\./);
  assert.match(html, /Disponible/);
  assert.match(html, /"price":"20"/);
  for (const selector of [/<title>/g, /rel="canonical"/g, /name="description"/g, /type="application\/ld\+json"/g]) assert.equal([...html.matchAll(selector)].length, 1);
  assert.doesNotMatch(html, /Anterior|old.example/);
  const home = renderPublicDocument({ template, products: [product, { ...product, name: "Borrador secreto", isPublic: false }], origin });
  assert.match(home, /href="https:\/\/adriego.shop\/producto\/chompa-azul"/);
  assert.doesNotMatch(home, /Borrador secreto/);
});

test("untrusted product content cannot break out of HTML or JSON-LD", () => {
  const html = renderPublicDocument({ product: { ...product, name: '</script><script>alert(1)</script>', description: '<img src=x onerror="alert(1)">', imagesByColor: { Azul: ["javascript:alert(1)"] } }, origin });
  assert.doesNotMatch(html, /<script>alert|<img src=x|javascript:alert/);
  assert.match(html, /\\u003c\/script/);
});

test("public page routes are identical for browsers and search crawlers", async () => {
  const config = JSON.parse(await fs.readFile(new URL("../../vercel.json", import.meta.url), "utf8"));
  for (const route of ["/", "/producto/:slug"]) {
    const rewrite = config.rewrites.find((entry) => entry.source === route);
    assert.ok(rewrite.destination.includes("action=page"));
    assert.equal(rewrite.has, undefined);
  }
  assert.equal(config.functions["api/seo.js"].includeFiles, "dist/app.html");
  // ASVS V14.2.5: unknown XML files must not receive the 200 SPA shell.
  const xmlRoute = config.rewrites.find((entry) => entry.source === "/:name.xml");
  assert.ok(xmlRoute.destination.includes("action=page&path=/"));
  assert.ok(config.rewrites.find((entry) => entry.source === "/sitemap.xml")?.destination.includes("action=sitemap-index"));
  assert.ok(config.rewrites.find((entry) => entry.source === "/sitemap-pages.xml")?.destination.includes("action=sitemap-pages"));
  assert.ok(config.rewrites.find((entry) => entry.source === "/sitemap-products.xml")?.destination.includes("action=sitemap-products"));
  assert.equal(config.rewrites.at(-1).destination, "/app.html");
});

test("agent discovery file is useful Markdown with canonical public links", async () => {
  const contents = await fs.readFile(new URL("../../public/llms.txt", import.meta.url), "utf8");
  assert.match(contents, /^# Adriego Store/m);
  assert.match(contents, /\[Tienda y catálogo\]\(https:\/\/www\.adriego\.shop\/\)/);
  assert.match(contents, /\[Mapa del sitio\]\(https:\/\/www\.adriego\.shop\/sitemap\.xml\)/);
});

test("brand fonts are stable from first paint and never injected after load", async () => {
  const template = await fs.readFile(new URL("../../index.html", import.meta.url), "utf8");
  const entry = await fs.readFile(new URL("../../src/main.jsx", import.meta.url), "utf8");
  const fonts = await fs.readFile(new URL("../../src/fonts.css", import.meta.url), "utf8");
  assert.doesNotMatch(template + entry, /fonts\.(?:googleapis|gstatic)\.com|loadDeferredFonts|requestIdleCallback/);
  assert.match(entry, /import ['"]\.\/fonts\.css['"]/);
  assert.match(fonts, /@font-face[\s\S]*font-family: "Manrope"[\s\S]*font-display: optional/);
  assert.match(fonts, /@font-face[\s\S]*font-family: "Cormorant Garamond"[\s\S]*font-display: optional/);
  assert.match(fonts, /\.woff2/);
});

test("catalog color controls keep a compact visual inside an accessible touch target", async () => {
  const css = await fs.readFile(new URL("../../src/App.css", import.meta.url), "utf8");
  assert.match(css, /\.product-card-color-swatch::after,[\s\S]*?width: 44px;[\s\S]*?height: 44px;/);
  assert.match(css, /\.product-card-color-swatch,[\s\S]*?width: 34px;[\s\S]*?height: 34px;/);
  assert.match(css, /\.product-card-color-swatch\.active \{[^}]*border-color: var\(--text-strong\);/);
});

test("outerwear finder replaces repeated purchase steps with responsive catalog discovery", async () => {
  const [app, component, css] = await Promise.all([
    fs.readFile(new URL("../../src/App.jsx", import.meta.url), "utf8"),
    fs.readFile(new URL("../../src/components/catalog/OuterwearFinder.jsx", import.meta.url), "utf8"),
    fs.readFile(new URL("../../src/App.css", import.meta.url), "utf8"),
  ]);

  assert.match(app, /<OuterwearFinder[\s\S]*settings=\{storeSettings\.outerwearFinder\}[\s\S]*onApplySelection=\{handleOuterwearFinderSelection\}/);
  assert.doesNotMatch(app, /purchase-process-section|EXPERIENCIA ADRIEGO · EN 3 PASOS/);
  assert.match(component, /Acolchado con peluche[\s\S]*query: "peluche"/);
  assert.match(component, /Gabardina reversible[\s\S]*query: "reversible gabardina"/);
  assert.match(component, /Chompa ligera[\s\S]*query: "chompa"/);
  assert.match(component, /role="radiogroup"[\s\S]*role="radio"[\s\S]*aria-checked=\{isSelected\}/);
  assert.match(component, /loading="lazy"/);
  assert.match(component, /settings\.image[\s\S]*settings\.title[\s\S]*settings\.primaryCta/);
  assert.match(css, /--finder-accent: #111214;/);
  assert.match(css, /\.outerwear-finder-option \{[\s\S]*?min-height: 72px;/);
  assert.match(css, /@media \(min-width: 900px\)[\s\S]*?\.outerwear-finder-layout \{[\s\S]*?grid-template-columns:/);
  assert.match(css, /@media \(min-width: 900px\)[\s\S]*?\.outerwear-finder-media \{[\s\S]*?aspect-ratio: 4 \/ 3;[\s\S]*?align-self: center;/);
  assert.match(css, /@media \(min-width: 1120px\)[\s\S]*?\.outerwear-finder-options \{[\s\S]*?repeat\(3,/);
});

test("mobile landscape is guarded with a portrait-only recovery screen", async () => {
  const [app, css] = await Promise.all([
    fs.readFile(new URL("../../src/App.jsx", import.meta.url), "utf8"),
    fs.readFile(new URL("../../src/App.css", import.meta.url), "utf8"),
  ]);
  assert.match(app, /function PortraitOrientationGuard/);
  assert.match(app, /className="portrait-orientation-guard" role="dialog" aria-modal="true"/);
  assert.match(app, /Gira tu teléfono/);
  assert.match(css, /@media \(orientation: landscape\) and \(max-height: 600px\) and \(max-width: 1000px\) and \(pointer: coarse\)/);
  assert.match(css, /\.portrait-orientation-guard \{[^}]*display: none;/);
  assert.match(css, /\.portrait-orientation-guard \{[^}]*display: grid;[^}]*position: fixed;[^}]*inset: 0;/);
});

test("mobile drawer keeps one clear navigation path without cart or favorites duplicates", async () => {
  const [app, css] = await Promise.all([
    fs.readFile(new URL("../../src/App.jsx", import.meta.url), "utf8"),
    fs.readFile(new URL("../../src/App.css", import.meta.url), "utf8"),
  ]);
  const start = app.indexOf("{showMobileNav && (");
  const drawer = app.slice(start, app.indexOf("</Motion.nav>", start));
  assert.match(drawer, /Explorar/);
  assert.match(drawer, /Ayuda y cuenta/);
  assert.match(drawer, /Colección/);
  assert.match(drawer, /Destacados/);
  assert.match(drawer, /Ofertas/);
  assert.match(drawer, /Contacto/);
  assert.match(drawer, /Mis pedidos/);
  assert.match(drawer, /Ingresar \/ crear cuenta/);
  assert.doesNotMatch(drawer, /mobile-quick-icons|mobile-nav-primary-grid|Favoritos \(|Carrito \(/);
  assert.match(css, /\.mobile-nav-links a,\s*\.mobile-nav-links button \{[^}]*border-bottom: 1px solid var\(--line-soft\);[^}]*background: transparent;/);
  assert.match(css, /\.mobile-nav-actions \{[^}]*margin-top: auto;/);
  assert.match(css, /\.mobile-nav-panel \{[^}]*width: min\(356px, 90vw\);/);
  assert.match(css, /\.mobile-nav-head \.mobile-nav-close-btn \{[^}]*border: 1px solid var\(--line-soft\);[^}]*box-shadow: none;/);
  assert.doesNotMatch(css, /\.mobile-nav-links a:hover,\s*\.mobile-nav-links button:hover \{[^}]*padding-left:/);
});

test("product detail places one accessible social signature below recommendations while home footer stays unchanged", async () => {
  const [app, css, productModal] = await Promise.all([
    fs.readFile(new URL("../../src/App.jsx", import.meta.url), "utf8"),
    fs.readFile(new URL("../../src/App.css", import.meta.url), "utf8"),
    fs.readFile(new URL("../../src/components/products/ProductModal.jsx", import.meta.url), "utf8"),
  ]);
  const footerStart = app.indexOf("<Motion.footer");
  const footer = app.slice(footerStart, app.indexOf("</Motion.footer>", footerStart));
  assert.match(footer, /className="social-row"/);
  assert.match(footer, /className="social-link"/);
  assert.doesNotMatch(footer, /footer-social-signature|product-modal-social-signature/);
  assert.match(productModal, /contactSettings = \{\}/);
  assert.match(productModal, /className="product-modal-related"[\s\S]*?className="product-modal-social-signature"/);
  assert.match(productModal, /className="product-modal-social-brand"[\s\S]*?ADRIEGO[\s\S]*?STORE/);
  assert.match(productModal, /aria-labelledby="product-social-title"/);
  assert.equal((productModal.match(/className="product-modal-social-icon"/g) || []).length, 4);
  assert.doesNotMatch(productModal, /Correo electrónico|contactSettings\.emailLink/);
  assert.match(productModal, /icon="whatsapp"[\s\S]*?icon="facebook"[\s\S]*?icon="instagram"[\s\S]*?icon="tiktok"/);
  assert.match(css, /\.product-modal-social-icon \{[\s\S]*?min-width: 44px;[\s\S]*?min-height: 44px;/);
  assert.match(css, /\.product-modal-social-icon:focus-visible \{[\s\S]*?outline: 2px solid var\(--brand-accent\);/);
});

test("route panels preserve the catalog position and product context they were opened from", async () => {
  const app = await fs.readFile(new URL("../../src/App.jsx", import.meta.url), "utf8");
  const cartStart = app.indexOf("const openCartPage = useCallback");
  const cartFlow = app.slice(cartStart, app.indexOf("const closeCartPage", cartStart));
  const ordersStart = app.indexOf("const openOrdersPage = useCallback");
  const ordersFlow = app.slice(ordersStart, app.indexOf("const closeOrdersPage", ordersStart));
  const favoritesStart = app.indexOf("const openFavoritesPage = useCallback");
  const favoritesFlow = app.slice(favoritesStart, app.indexOf("const closeFavoritesPage", favoritesStart));
  const mobileHeaderStart = app.indexOf("const mobileStoreHeader = (");
  const mobileHeader = app.slice(mobileHeaderStart, app.indexOf("const maintenanceActive", mobileHeaderStart));
  const toastStart = app.indexOf("<StoreNotification");
  const toast = app.slice(toastStart, app.indexOf("/>", toastStart));

  assert.match(app, /const rememberCatalogReturnPoint = useCallback\(\(\) => \{/);
  assert.match(app, /\[CATALOG_SCROLL_HISTORY_KEY\]: Math\.max\(0, window\.scrollY \|\| 0\)/);
  assert.match(cartFlow, /rememberCatalogReturnPoint\(\);/);
  assert.match(ordersFlow, /rememberCatalogReturnPoint\(\);/);
  assert.match(favoritesFlow, /rememberCatalogReturnPoint\(\);/);
  assert.doesNotMatch(mobileHeader, /else \{ if \(selectedProduct\) closeProductModal\(\); openCartPage\(\); \}/);
  assert.doesNotMatch(toast, /if \(selectedProduct\) closeProductModal\(\);/);
});

test("stale chunks refresh once per session and tolerate blocked storage", () => {
  const values = new Map();
  let reloads = 0;
  const browser = { sessionStorage: { getItem: (key) => values.get(key), setItem: (key, value) => values.set(key, value) }, location: { reload() { reloads++; } } };
  assert.equal(tryReloadStaleChunk(browser), true);
  assert.equal(tryReloadStaleChunk(browser), false);
  assert.equal(reloads, 1);
  assert.equal(tryReloadStaleChunk({ sessionStorage: { getItem() { throw new Error("storage blocked"); } }, location: { reload() { throw new Error("must not reload"); } } }), false);
});
