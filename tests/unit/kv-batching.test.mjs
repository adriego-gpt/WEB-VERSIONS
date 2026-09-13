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
  if (normalizedName === "EVAL") {
    const script = String(key || "").toLowerCase();
    const lockKey = String(args[0] || "");
    const lockToken = String(args[1] || "");
    if (String(values.get(lockKey) || "") !== lockToken) return 0;
    if (script.includes("pexpire")) return 1;
    if (script.includes("del")) return values.delete(lockKey) ? 1 : 0;
    return 0;
  }
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
  assert.equal(transactionCall.body.length, 3);
  const backupCommand = transactionCall.body.find(command => String(command[1]).includes(":backup:"));
  assert.ok(backupCommand, "catalog changes must back up the previous state in the same transaction");
  assert.deepEqual(JSON.parse(backupCommand[2]).products, []);
  const storedState = JSON.parse(values.get("adriego:store:v1"));
  const storedRealtime = JSON.parse(values.get("adriego:store:v1:realtime"));
  assert.deepEqual(storedState.products[0].colors, ["Verde oliva"]);
  assert.equal(storedState.products[0].variants[0].stock, 2);
  assert.ok(Number(storedRealtime.catalogVersion) > 0);

  const realtime = await storeModule.readRealtimeMeta();
  assert.equal(realtime.catalogVersion, storedRealtime.catalogVersion);

  const lockCalls = calls.filter((call) => String(call.body?.[0] || "").toUpperCase() === "EVAL");
  assert.ok(lockCalls.some((call) => String(call.body?.[1] || "").includes("pexpire")));
  assert.ok(lockCalls.some((call) => String(call.body?.[1] || "").includes("del")));
});

test("corrupt persisted state aborts updates without replacing it with an empty store", async () => {
  const key = "adriego:store:v1";
  const original = values.get(key);
  values.set(key, "{broken-json");
  const transactionCount = calls.filter(call => call.url.endsWith("/multi-exec")).length;
  try {
    await assert.rejects(storeModule.updateStore(draft => draft), /store-corrupt-refusing-empty-fallback/);
    assert.equal(values.get(key), "{broken-json");
    assert.equal(calls.filter(call => call.url.endsWith("/multi-exec")).length, transactionCount);
  } finally {
    values.set(key, original);
  }
});

test("order erasure cleans all existing backups and the newly created backup atomically", async () => {
  const key = "adriego:store:v1";
  await storeModule.updateStore((draft) => {
    draft.orders = [
      { id: "test-delete", paymentProof: "data:image/png;base64,dGVzdA==" },
      { id: "real-keep", paymentProof: "data:image/png;base64,dGVzdA==" },
    ];
    return draft;
  });
  const before = JSON.parse(values.get(key));
  for (let index = 0; index < 3; index += 1) values.set(`${key}:backup:${index}`, JSON.stringify(before));
  await storeModule.updateStore((draft) => {
    draft.orders = draft.orders.filter((order) => order.id !== "test-delete");
    storeModule.bumpRealtimeMeta(draft, ["orders", "catalog"]);
    return draft;
  });
  for (const snapshotKey of [key, ...[0, 1, 2].map((index) => `${key}:backup:${index}`)]) {
    const snapshot = JSON.parse(values.get(snapshotKey));
    assert.equal(snapshot.orders.some((order) => order.id === "test-delete"), false);
    assert.equal(snapshot.orders[0].paymentProof, "data:image/png;base64,dGVzdA==");
    assert.deepEqual(snapshot.products, before.products);
  }
  const transaction = calls.findLast((call) => call.url.endsWith("/multi-exec"));
  assert.ok(transaction.body.some((command) => command[1] === key));
  assert.ok(transaction.body.some((command) => command[1] === `${key}:realtime`));
  assert.equal(transaction.body.filter((command) => command[1].includes(":backup:")).length, 4);
});

test("proof replacement erases old backup images but preserves the replacement", async () => {
  const key = "adriego:store:v1";
  await storeModule.updateStore((draft) => {
    draft.orders[0].paymentProof = "data:image/png;base64,bmV3";
    storeModule.bumpRealtimeMeta(draft, ["orders"]);
    return draft;
  });
  assert.equal(JSON.parse(values.get(key)).orders[0].paymentProof, "data:image/png;base64,bmV3");
  for (let index = 0; index < 3; index += 1) {
    assert.equal(JSON.parse(values.get(`${key}:backup:${index}`)).orders[0].paymentProof, "");
  }
});

test("a corrupt backup blocks erasure without deleting live data or catalog backups", async () => {
  const key = "adriego:store:v1";
  const before = values.get(key);
  const backup = values.get(`${key}:backup:0`);
  values.set(`${key}:backup:0`, "{corrupt");
  const count = calls.filter((call) => call.url.endsWith("/multi-exec")).length;
  try {
    await assert.rejects(storeModule.updateStore((draft) => { draft.orders = []; return draft; }), /order-backup-corrupt-refusing-erasure/);
    assert.equal(values.get(key), before);
    assert.equal(values.get(`${key}:backup:0`), "{corrupt");
    assert.equal(calls.filter((call) => call.url.endsWith("/multi-exec")).length, count);
  } finally {
    values.set(`${key}:backup:0`, backup);
  }
});
