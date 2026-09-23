import assert from "node:assert/strict";
import test, { after } from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
const originalCwd = process.cwd();
const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), "adriego-seo-"));
process.chdir(sandbox);
process.env.NODE_ENV = "test";
process.env.KV_REST_API_URL = "";
process.env.KV_REST_API_TOKEN = "";
const { default: seoHandler } = await import("../../api/seo.js");
const { updateStore } = await import("../../api/_lib/store.js");
after(async () => { process.chdir(originalCwd); await fs.rm(sandbox, { recursive: true, force: true }); });

function createMockResponse() {
  const headers = new Map();
  let responseData = "";
  let statusCode = 200;

  return {
    setHeader(name, value) {
      headers.set(String(name).toLowerCase(), value);
    },
    getHeader(name) {
      return headers.get(String(name).toLowerCase());
    },
    status(code) {
      statusCode = code;
      return this;
    },
    send(data) {
      responseData = String(data || "");
      return this;
    },
    get statusCode() {
      return statusCode;
    },
    get data() {
      return responseData;
    },
  };
}

test("SEO endpoint tests", async (t) => {
  await updateStore((draft) => {
    draft.products = [
      {
        id: "prod-1",
        sku: "VES-001",
        name: "Vestido Lino Natural",
        price: 45,
        basePrice: 45,
        isPublic: true,
        catalogColor: "Beige",
        colors: ["Beige", "Negro"],
        imagesByColor: {
          Beige: ["https://ik.imagekit.io/adriego/catalog/vestido-beige.webp"],
          Negro: ["https://ik.imagekit.io/adriego/catalog/vestido-negro.webp"],
        },
        variants: [
          { color: "Beige", size: "M", stock: 3 },
          { color: "Negro", size: "S", stock: 0 },
        ],
        description: "Vestido de lino fresco para toda ocasión.",
        updatedAt: "2026-09-20T12:30:00.000Z",
      },
      {
        id: "prod-2",
        sku: "CHA-002",
        name: "Chaqueta Oculta",
        price: 80,
        isPublic: false,
        catalogColor: "Negro",
        colors: ["Negro"],
        imagesByColor: { Negro: ["https://ik.imagekit.io/adriego/catalog/chaqueta.webp"] },
        variants: [{ color: "Negro", size: "M", stock: 1 }],
      },
      {
        id: "prod-3",
        name: "Vestido Lino Natural",
        price: 45,
        isPublic: true,
        variants: [{ color: "Beige", size: "M", stock: 1 }],
      },
    ];
    return draft;
  });

  await t.test("generates a sitemap index with separate page and product maps", async () => {
    const res = createMockResponse();
    await seoHandler({ query: { action: "sitemap" } }, res);

    assert.equal(res.statusCode, 200);
    assert.match(res.data, /<sitemapindex/);
    assert.match(res.data, /https:\/\/www\.adriego\.shop\/sitemap-pages\.xml/);
    assert.match(res.data, /https:\/\/www\.adriego\.shop\/sitemap-products\.xml/);
  });

  await t.test("product sitemap includes only canonical public products, images and real update dates", async () => {
    const res = createMockResponse();
    await seoHandler({ query: { action: "sitemap-products" } }, res);

    assert.equal(res.statusCode, 200);
    assert.match(res.data, /https:\/\/www\.adriego\.shop\/producto\/vestido-lino-natural/);
    assert.doesNotMatch(res.data, /chaqueta-oculta/);
    assert.match(res.data, /<urlset/);
    assert.match(res.data, /xmlns:image="http:\/\/www\.google\.com\/schemas\/sitemap-image\/1\.1"/);
    assert.match(res.data, /<image:loc>https:\/\/ik\.imagekit\.io\/adriego\/catalog\/vestido-beige\.webp<\/image:loc>/);
    assert.match(res.data, /<image:title>Vestido Lino Natural<\/image:title>/);
    assert.match(res.data, /<lastmod>2026-09-20T12:30:00\.000Z<\/lastmod>/);
    assert.equal((res.data.match(/<loc>https:\/\/www\.adriego\.shop\/producto\/vestido-lino-natural<\/loc>/g) || []).length, 1);
  });

  await t.test("page sitemap contains the homepage and stable public legal routes", async () => {
    const res = createMockResponse();
    await seoHandler({ query: { action: "sitemap-pages" } }, res);
    assert.equal(res.statusCode, 200);
    assert.match(res.data, /<loc>https:\/\/www\.adriego\.shop\/<\/loc>/);
    assert.match(res.data, /<loc>https:\/\/www\.adriego\.shop\/legal\/privacidad<\/loc>/);
    assert.match(res.data, /<loc>https:\/\/www\.adriego\.shop\/legal\/terminos<\/loc>/);
    assert.match(res.data, /<loc>https:\/\/www\.adriego\.shop\/legal\/cambios<\/loc>/);
    assert.match(res.data, /<loc>https:\/\/www\.adriego\.shop\/legal\/cookies<\/loc>/);
    assert.doesNotMatch(res.data, /producto\//);
  });

  await t.test("homepage fallback exposes crawlable contact and legal navigation", async () => {
    const res = createMockResponse();
    await seoHandler({ query: { action: "page", path: "/" } }, res);
    assert.equal(res.statusCode, 200);
    assert.match(res.data, /href="\/legal\/privacidad"/);
    assert.match(res.data, /href="\/legal\/terminos"/);
    assert.match(res.data, /href="\/#contacto"/);
    assert.match(res.data, /Política de privacidad/);
  });

  await t.test("legal routes have canonical server-rendered documents and reject unknown names", async () => {
    const privacy = createMockResponse();
    await seoHandler({ query: { action: "page", path: "/legal/privacidad" } }, privacy);
    assert.equal(privacy.statusCode, 200);
    assert.match(privacy.data, /<h1>Política de privacidad<\/h1>/);
    assert.match(privacy.data, /<link rel="canonical" href="https:\/\/www\.adriego\.shop\/legal\/privacidad">/);
    assert.match(privacy.data, /Vercel/);
    assert.match(privacy.data, /Umami/);

    const unknown = createMockResponse();
    await seoHandler({ query: { action: "page", path: "/legal/desconocido" } }, unknown);
    assert.equal(unknown.statusCode, 404);
    assert.match(unknown.data, /Página no encontrada/);
  });

  await t.test("unknown XML routes stay 404 while maintenance mode is enabled", async () => {
    await updateStore((draft) => {
      draft.storeSettings = {
        ...draft.storeSettings,
        maintenanceSettings: { enabled: true },
      };
      return draft;
    });
    try {
      const res = createMockResponse();
      await seoHandler({ query: { action: "page", path: "/sitemap-news.xml" } }, res);
      assert.equal(res.statusCode, 404);
      assert.equal(res.getHeader("content-type"), "text/plain; charset=utf-8");
      assert.equal(res.getHeader("x-robots-tag"), "noindex");
      assert.equal(res.data, "Not found");
    } finally {
      await updateStore((draft) => {
        draft.storeSettings = {
          ...draft.storeSettings,
          maintenanceSettings: { enabled: false },
        };
        return draft;
      });
    }
  });

  await t.test("prerenders product with image from imagesByColor and stock from variants", async () => {
    const res = createMockResponse();
    await seoHandler({ query: { path: "/producto/vestido-lino-natural" } }, res);

    assert.equal(res.statusCode, 200);
    assert.match(res.data, /https:\/\/ik\.imagekit\.io\/adriego\/catalog\/vestido-beige\.webp/);
    assert.match(res.data, /InStock/);
    const schema = JSON.parse(res.data.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/)[1]);
    assert.equal(schema.offers.price, "45");
    assert.equal(schema.sku, "VES-001");
    assert.equal(schema.url, "https://www.adriego.shop/producto/vestido-lino-natural");
    assert.match(res.data, /<p>Vestido de lino fresco para toda ocasión\.<\/p>/);
    assert.match(res.data, /Colores: Beige, Negro\. Tallas: M, S\./);
    assert.match(res.data, /Vestido Lino Natural \| Adriego Store/);
    assert.match(res.data, /<link rel="canonical" href="https:\/\/www\.adriego\.shop\/producto\/vestido-lino-natural">/);
  });

  await t.test("returns 404 for unknown product slug", async () => {
    const res = createMockResponse();
    await seoHandler({ query: { path: "/producto/producto-inexistente" } }, res);

    assert.equal(res.statusCode, 404);
    assert.match(res.data, /Página no encontrada/);
  });

  await t.test("private drafts are not exposed by known SEO slugs", async () => {
    const res = createMockResponse();
    await seoHandler({ query: { path: "/producto/chaqueta-oculta" } }, res);
    assert.equal(res.statusCode, 404);
    assert.doesNotMatch(res.data, /Chaqueta Oculta/);
  });

  await t.test("homepage remains available when optional store settings are null", async () => {
    await updateStore(draft => { draft.storeSettings = null; return draft; });
    const res = createMockResponse();
    await seoHandler({ query: { path: "/" } }, res);
    assert.equal(res.statusCode, 200);
    assert.match(res.data, /Vestido Lino Natural/);
    assert.doesNotMatch(res.data, /catálogo no está disponible temporalmente/i);
  });

  await t.test("robots and sitemap follow the configured domain", async () => {
    const previous = process.env.PUBLIC_SITE_URL;
    process.env.PUBLIC_SITE_URL = "https://adriego.shop";
    try {
      for (const action of ["robots", "sitemap", "sitemap-pages", "sitemap-products"]) {
        const res = createMockResponse();
        await seoHandler({ query: { action } }, res);
        assert.match(res.data, /https:\/\/adriego\.shop/);
        assert.doesNotMatch(res.data, /adriego\.vercel\.app/);
      }
    } finally { if (previous === undefined) delete process.env.PUBLIC_SITE_URL; else process.env.PUBLIC_SITE_URL = previous; }
  });

  await t.test("renders persisted custom search identity on the homepage and product", async () => {
    await updateStore(draft => { draft.storeSettings = { ...draft.storeSettings, brandName: "Adriego Boutique", seoSettings: { title: "Adriego | Moda", description: "Nuestra colección", faviconUrl: "https://images.example.com/icon.png", logoUrl: "https://images.example.com/logo.png", imageUrl: "https://images.example.com/share.jpg" } }; return draft; });
    const home = createMockResponse();
    await seoHandler({ query: { path: "/" } }, home);
    assert.equal(home.statusCode, 200);
    assert.match(home.data, /<title>Adriego \| Moda<\/title>/);
    assert.match(home.data, /rel="icon" href="https:\/\/images\.example\.com\/icon\.png"/);
    const product = createMockResponse();
    await seoHandler({ query: { path: "/producto/vestido-lino-natural" } }, product);
    assert.match(product.data, /Vestido Lino Natural \| Adriego Boutique/);
    assert.doesNotMatch(product.data, /<title>Adriego \| Moda/);
  });

  await t.test("exposes the first homepage slide to the HTML preload scanner", async () => {
    const heroImage = "https://images.unsplash.com/photo-1445205170230-053b83016050?auto=format&fit=crop&w=1400&q=80";
    await updateStore(draft => {
      draft.storeSettings = {
        ...draft.storeSettings,
        heroSlides: [{ id: "slide-1", title: "Nueva colección", image: heroImage }],
      };
      return draft;
    });
    const home = createMockResponse();
    await seoHandler({ query: { path: "/" } }, home);
    assert.match(home.data, /<link rel="preload" as="image" fetchpriority="high"/);
    assert.match(home.data, /imagesrcset="[^"]*images\.unsplash\.com[^"]*480w/);
    assert.match(home.data, /imagesizes="\(max-width: 900px\) 100vw, 54vw"/);
    const product = createMockResponse();
    await seoHandler({ query: { path: "/producto/vestido-lino-natural" } }, product);
    assert.doesNotMatch(product.data, /imagesizes="\(max-width: 900px\) 100vw, 54vw"/);
    await updateStore(draft => {
      draft.storeSettings = { ...draft.storeSettings, heroSlides: [] };
      return draft;
    });
    const fallbackHome = createMockResponse();
    await seoHandler({ query: { path: "/" } }, fallbackHome);
    assert.match(fallbackHome.data, /<link rel="preload" as="image" fetchpriority="high"/);
    assert.match(fallbackHome.data, /photo-1445205170230-053b83016050/);
  });

  await t.test("rejects write methods and sends restrictive security headers", async () => {
    const res = createMockResponse();
    await seoHandler({ method: "POST", query: {}, headers: {} }, res);

    assert.equal(res.statusCode, 405);
    assert.equal(res.getHeader("allow"), "GET, HEAD");
    assert.match(res.getHeader("content-security-policy"), /default-src 'none'/);
  });
});
