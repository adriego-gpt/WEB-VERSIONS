import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test, { after, before } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const THIS_FILE = fileURLToPath(import.meta.url);
const PROJECT_ROOT = path.resolve(path.dirname(THIS_FILE), "..", "..");
const APP_ORIGIN = "http://localhost:5173";
const sandboxCwd = await fs.mkdtemp(path.join(os.tmpdir(), "adriego-public-cache-"));
const originalCwd = process.cwd();

process.chdir(sandboxCwd);
process.env.NODE_ENV = "test";
process.env.SECURITY_LOG_ENABLED = "false";
process.env.USER_ALLOWED_ORIGIN = APP_ORIGIN;
process.env.ADMIN_ALLOWED_ORIGIN = APP_ORIGIN;
process.env.USER_SESSION_SECRET = "user-secret-public-cache";
process.env.ADMIN_SESSION_SECRET = "admin-secret-public-cache";

const importFromProject = (relativePath) => import(pathToFileURL(path.join(PROJECT_ROOT, relativePath)).href);

const [
  { bumpRealtimeMeta, updateStore },
  { default: catalogStateHandler },
  { default: realtimeSyncHandler },
] = await Promise.all([
  importFromProject("api/_lib/store.js"),
  importFromProject("api/catalog-state.js"),
  importFromProject("api/realtime-sync.js"),
]);

function createMockResponse() {
  const headers = new Map();
  return {
    statusCode: 200,
    ended: false,
    body: "",
    jsonBody: undefined,
    setHeader(name, value) {
      headers.set(String(name).toLowerCase(), value);
    },
    getHeader(name) {
      return headers.get(String(name).toLowerCase());
    },
    status(code) {
      this.statusCode = Number(code) || 200;
      return this;
    },
    json(payload) {
      this.setHeader("content-type", "application/json; charset=utf-8");
      this.jsonBody = payload;
      this.end(JSON.stringify(payload));
    },
    end(payload = "") {
      if (this.ended) return;
      this.ended = true;
      this.body = typeof payload === "string" ? payload : String(payload || "");
    },
  };
}

async function callApi(handler, query = {}) {
  const req = {
    method: "GET",
    query,
    headers: { origin: APP_ORIGIN },
    socket: { remoteAddress: "127.0.0.1" },
  };
  const res = createMockResponse();
  await handler(req, res);
  if (!res.ended) res.end();
  return res;
}

before(async () => {
  await updateStore((draft) => {
    draft.products = [{
      id: "product-cache-1",
      name: "Vestido Cache",
      price: 55,
      colors: ["Azul petróleo"],
      sizes: ["M"],
      imagesByColor: {
        "Azul petróleo": ["https://images.example.test/vestido-cache.webp"],
      },
      variants: [{ uid: "variant-cache-1", color: "Azul petróleo", size: "M", stock: 4 }],
      stockBySize: { M: 4 },
    }];
    draft.coupons = [{ id: "private-coupon", code: "PRIVATE10", discount: 10 }];
    draft.orders = [{ id: "private-order", total: 55 }];
    bumpRealtimeMeta(draft, ["catalog"]);
    return draft;
  });
});

after(async () => {
  process.chdir(originalCwd);
  await fs.rm(sandboxCwd, { recursive: true, force: true });
});

test("public catalog response is cacheable, cookie-free, and preserves product colors", async () => {
  const response = await callApi(catalogStateHandler, {
    action: "get-public",
    v: "1",
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.jsonBody?.ok, true);
  assert.equal(response.getHeader("set-cookie"), undefined);
  assert.match(String(response.getHeader("vercel-cdn-cache-control") || ""), /s-maxage=/i);
  assert.deepEqual(response.jsonBody?.data?.products?.[0]?.colors, ["Azul petróleo"]);
  assert.equal("coupons" in response.jsonBody.data, false);
  assert.equal("orderHistory" in response.jsonBody.data, false);
});

test("public realtime status is small, cacheable, and does not create cookies", async () => {
  const response = await callApi(realtimeSyncHandler, { action: "public-status" });

  assert.equal(response.statusCode, 200);
  assert.equal(response.jsonBody?.ok, true);
  assert.ok(Number(response.jsonBody?.versions?.catalog) > 0);
  assert.equal(response.jsonBody?.currentUser, null);
  assert.equal(response.getHeader("set-cookie"), undefined);
  assert.match(String(response.getHeader("vercel-cdn-cache-control") || ""), /s-maxage=/i);
  assert.ok(Buffer.byteLength(response.body, "utf8") < 1000);
});
