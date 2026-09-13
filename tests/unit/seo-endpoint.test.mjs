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
    ];
    return draft;
  });

  await t.test("generates XML sitemap including only public products", async () => {
    const res = createMockResponse();
    await seoHandler({ query: { action: "sitemap" } }, res);

    assert.equal(res.statusCode, 200);
    assert.match(res.data, /https:\/\/adriego\.vercel\.app\/producto\/vestido-lino-natural/);
    assert.doesNotMatch(res.data, /chaqueta-oculta/);
    assert.match(res.data, /<urlset/);
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
    assert.match(res.data, /<p>Vestido de lino fresco para toda ocasión\.<\/p>/);
    assert.match(res.data, /Colores: Beige, Negro\. Tallas: M, S\./);
    assert.match(res.data, /Vestido Lino Natural \| Adriego Store/);
    assert.match(res.data, /<link rel="canonical" href="https:\/\/adriego\.vercel\.app\/producto\/vestido-lino-natural">/);
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

  await t.test("robots and sitemap follow the configured domain", async () => {
    const previous = process.env.PUBLIC_SITE_URL;
    process.env.PUBLIC_SITE_URL = "https://adriego.shop";
    try {
      for (const action of ["robots", "sitemap"]) {
        const res = createMockResponse();
        await seoHandler({ query: { action } }, res);
        assert.match(res.data, /https:\/\/adriego\.shop/);
        assert.doesNotMatch(res.data, /adriego\.vercel\.app/);
      }
    } finally { if (previous === undefined) delete process.env.PUBLIC_SITE_URL; else process.env.PUBLIC_SITE_URL = previous; }
  });

  await t.test("rejects write methods and sends restrictive security headers", async () => {
    const res = createMockResponse();
    await seoHandler({ method: "POST", query: {}, headers: {} }, res);

    assert.equal(res.statusCode, 405);
    assert.equal(res.getHeader("allow"), "GET, HEAD");
    assert.match(res.getHeader("content-security-policy"), /default-src 'none'/);
  });
});
