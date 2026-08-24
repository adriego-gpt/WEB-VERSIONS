
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const DATA_DIR = path.join(process.cwd(), ".data");
const DATA_FILE = path.join(DATA_DIR, "store.json");
const STORE_KEY = String(process.env.STORE_STATE_KEY || "adriego:store:v1").trim();
const STORE_LOCK_KEY = `${STORE_KEY}:lock`;
const STORE_LOCK_TTL_SECONDS = Math.max(4, Number(process.env.STORE_LOCK_TTL_SECONDS) || 8);
const STORE_LOCK_MAX_WAIT_MS = Math.max(400, Number(process.env.STORE_LOCK_MAX_WAIT_MS) || 2600);
const STORE_LOCK_RETRY_MS = Math.max(40, Number(process.env.STORE_LOCK_RETRY_MS) || 110);

const DEFAULT_STORE = {
  users: [],
  products: [],
  coupons: [],
  orders: [],
  contactSettings: null,
  storeSettings: null,
  productTypes: [],
  filterTags: [],
  meta: {
    orderSequence: 10000,
    realtime: {
      globalVersion: 0,
      catalogVersion: 0,
      ordersVersion: 0,
      usersVersion: 0,
      userStateVersion: 0,
      updatedAt: "",
    },
  },
};

const REALTIME_SCOPE_TO_KEY = {
  catalog: "catalogVersion",
  orders: "ordersVersion",
  users: "usersVersion",
  "user-state": "userStateVersion",
};

let writeQueue = Promise.resolve();

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isKvConfigured() {
  return Boolean(
    String(process.env.KV_REST_API_URL || "").trim()
      && String(process.env.KV_REST_API_TOKEN || "").trim(),
  );
}

function requiresPersistentStore() {
  return String(process.env.NODE_ENV || "").trim().toLowerCase() === "production"
    || String(process.env.VERCEL_ENV || "").trim().toLowerCase() === "production";
}

function assertStoreConfigured() {
  if (!requiresPersistentStore() || isKvConfigured()) return;
  const error = new Error("persistent-store-required");
  error.code = "PERSISTENT_STORE_REQUIRED";
  throw error;
}

function getStoreBackend() {
  if (isKvConfigured()) return "kv-rest";
  return requiresPersistentStore() ? "unconfigured" : "local-file";
}

async function wait(ms = 0) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

async function runKvCommand(command, ...args) {
  const baseUrl = String(process.env.KV_REST_API_URL || "").trim().replace(/\/+$/, "");
  const token = String(process.env.KV_REST_API_TOKEN || "").trim();
  if (!baseUrl || !token) {
    throw new Error("kv-not-configured");
  }

  const response = await fetch(baseUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([String(command || "").toUpperCase(), ...args.map((item) => String(item))]),
  });

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(`kv-http-${response.status}${details ? `:${details.slice(0, 200)}` : ""}`);
  }

  const payload = await response.json().catch(() => null);
  if (payload && typeof payload === "object" && payload.error) {
    throw new Error(`kv-error:${String(payload.error)}`);
  }
  return payload?.result;
}

async function readKvStore() {
  const serialized = await runKvCommand("GET", STORE_KEY);
  if (!serialized) return clone(DEFAULT_STORE);
  if (typeof serialized !== "string") {
    return normalizeStore(serialized);
  }
  try {
    return normalizeStore(JSON.parse(serialized));
  } catch {
    return clone(DEFAULT_STORE);
  }
}

async function writeKvStore(store) {
  await runKvCommand("SET", STORE_KEY, JSON.stringify(store));
}

async function acquireKvLock() {
  const startedAt = Date.now();
  const lockToken = crypto.randomUUID();

  while (Date.now() - startedAt < STORE_LOCK_MAX_WAIT_MS) {
    const lockResult = await runKvCommand(
      "SET",
      STORE_LOCK_KEY,
      lockToken,
      "NX",
      "EX",
      String(STORE_LOCK_TTL_SECONDS),
    );

    if (lockResult === "OK") {
      return lockToken;
    }
    await wait(STORE_LOCK_RETRY_MS);
  }

  throw new Error("kv-lock-timeout");
}

async function releaseKvLock(lockToken = "") {
  if (!lockToken) return;
  const currentLockValue = await runKvCommand("GET", STORE_LOCK_KEY).catch(() => "");
  if (String(currentLockValue || "") !== String(lockToken)) return;
  await runKvCommand("DEL", STORE_LOCK_KEY).catch(() => null);
}

function getMemoryStore() {
  if (!globalThis.__ADRIEGO_MEMORY_STORE__) {
    globalThis.__ADRIEGO_MEMORY_STORE__ = globalThis.__ATELIER_MEMORY_STORE__ || clone(DEFAULT_STORE);
  }
  return globalThis.__ADRIEGO_MEMORY_STORE__;
}

function normalizeStore(raw = {}) {
  const safe = raw && typeof raw === "object" ? raw : {};
  const safeMeta = safe.meta && typeof safe.meta === "object" ? safe.meta : {};
  const safeRealtime = safeMeta.realtime && typeof safeMeta.realtime === "object"
    ? safeMeta.realtime
    : {};

  const normalizeVersion = (value, fallback = 0) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric < 0) return fallback;
    return Math.floor(numeric);
  };

  return {
    users: Array.isArray(safe.users) ? safe.users : [],
    products: Array.isArray(safe.products) ? safe.products : [],
    coupons: Array.isArray(safe.coupons) ? safe.coupons : [],
    orders: Array.isArray(safe.orders) ? safe.orders : [],
    contactSettings: safe.contactSettings ?? DEFAULT_STORE.contactSettings,
    storeSettings: safe.storeSettings ?? DEFAULT_STORE.storeSettings,
    productTypes: Array.isArray(safe.productTypes) ? safe.productTypes : [],
    filterTags: Array.isArray(safe.filterTags) ? safe.filterTags : [],
    meta: {
      ...DEFAULT_STORE.meta,
      ...safeMeta,
      realtime: {
        ...DEFAULT_STORE.meta.realtime,
        ...safeRealtime,
        globalVersion: normalizeVersion(safeRealtime.globalVersion, DEFAULT_STORE.meta.realtime.globalVersion),
        catalogVersion: normalizeVersion(safeRealtime.catalogVersion, DEFAULT_STORE.meta.realtime.catalogVersion),
        ordersVersion: normalizeVersion(safeRealtime.ordersVersion, DEFAULT_STORE.meta.realtime.ordersVersion),
        usersVersion: normalizeVersion(safeRealtime.usersVersion, DEFAULT_STORE.meta.realtime.usersVersion),
        userStateVersion: normalizeVersion(safeRealtime.userStateVersion, DEFAULT_STORE.meta.realtime.userStateVersion),
        updatedAt: String(safeRealtime.updatedAt || ""),
      },
    },
  };
}

function bumpRealtimeMeta(draft = {}, scopes = []) {
  if (!draft || typeof draft !== "object") return draft;
  const normalizedScopes = (Array.isArray(scopes) ? scopes : [scopes])
    .map((scope) => String(scope || "").trim().toLowerCase())
    .filter(Boolean);
  if (!normalizedScopes.length) return draft;

  const currentMeta = draft.meta && typeof draft.meta === "object" ? draft.meta : {};
  const currentRealtime = currentMeta.realtime && typeof currentMeta.realtime === "object"
    ? currentMeta.realtime
    : {};
  const nextRealtime = {
    ...DEFAULT_STORE.meta.realtime,
    ...currentRealtime,
    globalVersion: Math.max(0, Number(currentRealtime.globalVersion) || 0) + 1,
    catalogVersion: Math.max(0, Number(currentRealtime.catalogVersion) || 0),
    ordersVersion: Math.max(0, Number(currentRealtime.ordersVersion) || 0),
    usersVersion: Math.max(0, Number(currentRealtime.usersVersion) || 0),
    userStateVersion: Math.max(0, Number(currentRealtime.userStateVersion) || 0),
    updatedAt: new Date().toISOString(),
  };

  normalizedScopes.forEach((scope) => {
    const key = REALTIME_SCOPE_TO_KEY[scope];
    if (!key) return;
    nextRealtime[key] += 1;
  });

  draft.meta = {
    ...DEFAULT_STORE.meta,
    ...currentMeta,
    realtime: nextRealtime,
  };
  return draft;
}

async function readFileStore() {
  const content = await fs.readFile(DATA_FILE, "utf8");
  const parsed = JSON.parse(content);
  return normalizeStore(parsed);
}

async function writeFileStore(store) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(store, null, 2), "utf8");
}

async function readStore() {
  assertStoreConfigured();
  if (isKvConfigured()) {
    return readKvStore();
  }

  try {
    return await readFileStore();
  } catch {
    return clone(getMemoryStore());
  }
}

async function persistStore(nextStore) {
  assertStoreConfigured();
  const normalized = normalizeStore(nextStore);
  if (isKvConfigured()) {
    await writeKvStore(normalized);
    return normalized;
  }

  try {
    await writeFileStore(normalized);
  } catch {
    globalThis.__ADRIEGO_MEMORY_STORE__ = clone(normalized);
  }
  return normalized;
}

async function updateStore(mutator) {
  assertStoreConfigured();
  if (isKvConfigured()) {
    const lockToken = await acquireKvLock();
    try {
      const current = await readKvStore();
      const draft = clone(current);
      const mutated = await mutator(draft);
      const next = normalizeStore(mutated ?? draft);
      await writeKvStore(next);
      return next;
    } finally {
      await releaseKvLock(lockToken);
    }
  }

  writeQueue = writeQueue
    .catch(() => undefined)
    .then(async () => {
      const current = await readStore();
      const draft = clone(current);
      const mutated = await mutator(draft);
      const next = normalizeStore(mutated ?? draft);
      return persistStore(next);
    });
  return writeQueue;
}

export {
  bumpRealtimeMeta,
  getStoreBackend,
  isKvConfigured,
  requiresPersistentStore,
  readStore,
  runKvCommand,
  updateStore,
};
