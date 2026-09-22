import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import {
  buildIndexNowUrls,
  INDEXNOW_ENDPOINT,
  INDEXNOW_KEY,
  INDEXNOW_KEY_PATH,
  notifyIndexNow,
  notifyIndexNowInProduction,
} from "../../api/_lib/indexNow.js";

test("IndexNow key is publicly verifiable and URLs are canonical", async () => {
  const publicKey = await fs.readFile(new URL(`../../public/${INDEXNOW_KEY}.txt`, import.meta.url), "utf8");
  assert.equal(publicKey.trim(), INDEXNOW_KEY);
  assert.equal(INDEXNOW_KEY_PATH, `/${INDEXNOW_KEY}.txt`);

  const urls = buildIndexNowUrls([
    { name: "Vestido Lino", isPublic: true },
    { name: "Oculto", isPublic: false },
    { name: "Vestido Lino", isPublic: true },
    { name: "", isPublic: true },
  ]);
  assert.deepEqual(urls, [
    "https://www.adriego.shop/",
    "https://www.adriego.shop/producto/vestido-lino",
  ]);
});

test("IndexNow uses its fixed HTTPS endpoint and a bounded canonical payload", async () => {
  let captured;
  const result = await notifyIndexNow([{ name: "Abrigo Azul", isPublic: true }], {
    origin: "https://www.adriego.shop",
    fetchImpl: async (url, init) => {
      captured = { url, init, payload: JSON.parse(init.body) };
      return new Response(null, { status: 202 });
    },
  });

  assert.deepEqual(result, { ok: true, status: 202 });
  assert.equal(captured.url, INDEXNOW_ENDPOINT);
  assert.equal(captured.init.method, "POST");
  assert.equal(captured.init.redirect, "error");
  assert.equal(captured.payload.host, "www.adriego.shop");
  assert.equal(captured.payload.keyLocation, `https://www.adriego.shop${INDEXNOW_KEY_PATH}`);
  assert.deepEqual(captured.payload.urlList, [
    "https://www.adriego.shop/",
    "https://www.adriego.shop/producto/abrigo-azul",
  ]);
});

test("IndexNow never breaks catalog saves outside production or on network failure", async () => {
  const previousEnvironment = process.env.VERCEL_ENV;
  delete process.env.VERCEL_ENV;
  try {
    assert.deepEqual(await notifyIndexNowInProduction([{ name: "Producto" }]), {
      ok: false,
      skipped: true,
      status: 0,
    });
    const result = await notifyIndexNow([], {
      fetchImpl: async () => { throw new TypeError("offline"); },
    });
    assert.deepEqual(result, { ok: false, status: 0 });
  } finally {
    if (previousEnvironment === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previousEnvironment;
  }
});

test("static metadata no longer references the legacy Vercel hostname", async () => {
  const source = await fs.readFile(new URL("../../index.html", import.meta.url), "utf8");
  assert.doesNotMatch(source, /adriego\.vercel\.app/);
  assert.match(source, /<link rel="canonical" href="https:\/\/www\.adriego\.shop\/"/);
});
