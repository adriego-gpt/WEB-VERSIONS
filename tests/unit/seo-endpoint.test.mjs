import assert from "node:assert/strict";
import test from "node:test";
import seoHandler from "../../api/seo.js";
import { updateStore } from "../../api/_lib/store.js";

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
    assert.match(res.data, /"price": "45"/);
    assert.match(res.data, /"sku": "VES-001"/);
    assert.match(res.data, /Vestido Lino Natural \| Adriego Store/);
    assert.match(res.data, /<link rel="canonical" href="https:\/\/adriego\.vercel\.app\/producto\/vestido-lino-natural">/);
  });

  await t.test("returns 404 for unknown product slug", async () => {
    const res = createMockResponse();
    await seoHandler({ query: { path: "/producto/producto-inexistente" } }, res);

    assert.equal(res.statusCode, 404);
    assert.match(res.data, /Página no encontrada/);
  });

  await t.test("rejects write methods and sends restrictive security headers", async () => {
    const res = createMockResponse();
    await seoHandler({ method: "POST", query: {}, headers: {} }, res);

    assert.equal(res.statusCode, 405);
    assert.equal(res.getHeader("allow"), "GET, HEAD");
    assert.match(res.getHeader("content-security-policy"), /default-src 'none'/);
  });
});
