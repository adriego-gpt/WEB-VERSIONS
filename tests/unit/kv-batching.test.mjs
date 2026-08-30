import assert from "node:assert/strict";
import path from "node:path";
import test, { after, before } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const originalFetch = globalThis.fetch;
const originalEnvironment = {
  NODE_ENV: process.env.NODE_ENV,
  KV_REST_API_URL: process.env.KV_REST_API_URL,
  KV_REST_API_TOKEN: process.env.KV_REST_API_TOKEN,
};
const calls = [];
const values = new Map();

function restoreEnvironmentValue(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function executeCommand(command = []) {
  const [name, key, value, ...args] = command;
  const normalizedName = String(name || "").toUpperCase();
  if (normalizedName === "GET") return values.get(String(key)) ?? null;
  if (normalizedName === "SET") {
    const wantsNx = args.map(String).some((item) => item.toUpperCase() === "NX");
    if (wantsNx && values.has(String(key))) return null;
    values.set(String(key), String(value));
    return "OK";
  }
  if (normalizedName === "DEL") return values.delete(String(key)) ? 1 : 0;
  return "OK";
}

let storeModule;

before(async () => {
  process.env.NODE_ENV = "test";
  process.env.KV_REST_API_URL = "https://redis.example.test";
  process.env.KV_REST_API_TOKEN = "test-token";
  globalThis.fetch = async (url, options = {}) => {
    const body = JSON.parse(String(options.body || "[]"));
    calls.push({ url: String(url), body });
    const commands = Array.isArray(body?.[0]) ? body : [body];
    const results = commands.map((command) => ({ result: executeCommand(command) }));
    return {
      ok: true,
      status: 200,
      json: async () => (Array.isArray(body?.[0]) ? results : results[0]),
      text: async () => "",
    };
  };

  const storeUrl = pathToFileURL(path.join(PROJECT_ROOT, "api", "_lib", "store.js"));
  storeUrl.searchParams.set("kv-batching-test", String(Date.now()));
  storeModule = await import(storeUrl.href);
});

after(() => {
  globalThis.fetch = originalFetch;
  restoreEnvironmentValue("NODE_ENV", originalEnvironment.NODE_ENV);
  restoreEnvironmentValue("KV_REST_API_URL", originalEnvironment.KV_REST_API_URL);
  restoreEnvironmentValue("KV_REST_API_TOKEN", originalEnvironment.KV_REST_API_TOKEN);
});

test("KV pipeline batches independent commands into one HTTP request", async () => {
  const beforeCalls = calls.length;
  await storeModule.runKvPipeline([
    ["SET", "metric:a", "1"],
    ["SET", "metric:b", "2"],
    ["GET", "metric:a"],
  ]);

  assert.equal(calls.length - beforeCalls, 1);
  assert.match(calls.at(-1).url, /\/pipeline$/);
  assert.equal(calls.at(-1).body.length, 3);
});

test("store updates preserve catalog data and write state plus realtime metadata atomically", async () => {
  await storeModule.updateStore((draft) => {
    draft.products = [{
      id: "product-atomic-1",
      colors: ["Verde oliva"],
      variants: [{ color: "Verde oliva", size: "S", stock: 2 }],
    }];
    storeModule.bumpRealtimeMeta(draft, ["catalog"]);
    return draft;
  });

  const transactionCall = calls.findLast((call) => call.url.endsWith("/multi-exec"));
  assert.ok(transactionCall);
  assert.equal(transactionCall.body.length, 2);
  const storedState = JSON.parse(values.get("adriego:store:v1"));
  const storedRealtime = JSON.parse(values.get("adriego:store:v1:realtime"));
  assert.deepEqual(storedState.products[0].colors, ["Verde oliva"]);
  assert.equal(storedState.products[0].variants[0].stock, 2);
  assert.ok(Number(storedRealtime.catalogVersion) > 0);

  const realtime = await storeModule.readRealtimeMeta();
  assert.equal(realtime.catalogVersion, storedRealtime.catalogVersion);
});
