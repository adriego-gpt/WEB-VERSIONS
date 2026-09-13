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
  assert.equal(config.functions["api/seo.js"].includeFiles, "dist/index.html");
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
