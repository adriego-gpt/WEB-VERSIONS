/* global process */

import crypto from "node:crypto";
import { Buffer } from "node:buffer";
import fs from "node:fs";
import path from "node:path";
import { isKvConfigured, runKvCommand } from "./store.js";

const CSRF_COOKIE_NAME = "atelier_csrf_token";
const RATE_LIMIT_STORE_KEY = "__ATELIER_RATE_LIMIT_STORE__";
const SECURITY_METRICS_STORE_KEY = "__ATELIER_SECURITY_METRICS_STORE__";
const SECURITY_METRICS_INDEX_KEY = "atelier:security-metrics:endpoints";
const PASSWORD_HASH_KEY_LENGTH = 64;
const MAX_JSON_BODY_BYTES = Math.max(64 * 1024, Number(process.env.MAX_JSON_BODY_BYTES) || (4 * 1024 * 1024));
const MAX_INLINE_IMAGE_BYTES = Math.max(48 * 1024, Number(process.env.MAX_INLINE_IMAGE_BYTES) || (380 * 1024));
const BODY_PARSE_ERROR_KEY = "__atelierBodyParseError";

function loadLocalEnvFile() {
  const nodeEnv = String(process.env.NODE_ENV || "").toLowerCase();
  const isProductionLike = nodeEnv === "production" || String(process.env.VERCEL || "").trim() === "1";
  if (isProductionLike) return;

  const envPath = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;

  const content = fs.readFileSync(envPath, "utf8");
  content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .forEach((line) => {
      const separatorIndex = line.indexOf("=");
      if (separatorIndex <= 0) return;
      const key = line.slice(0, separatorIndex).trim();
      const rawValue = line.slice(separatorIndex + 1).trim();
      const value = (
        (rawValue.startsWith("\"") && rawValue.endsWith("\""))
        || (rawValue.startsWith("'") && rawValue.endsWith("'"))
      )
        ? rawValue.slice(1, -1)
        : rawValue;
      if (!key || process.env[key]) return;
      process.env[key] = value;
    });
}

loadLocalEnvFile();

function normalizeLine(value = "") {
  return String(value || "").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
}

function sanitizeParagraph(value = "") {
  return String(value || "").replace(/\r/g, "").replace(/\t/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function normalizeOptionLabel(value = "") {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function normalizeEmail(value = "") {
  return normalizeLine(value).toLowerCase();
}

function normalizePhone(value = "") {
  return String(value || "").replace(/\D/g, "").slice(0, 20);
}

function normalizeSafeUrl(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const hasScheme = /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(raw);
  if (!hasScheme && !raw.includes(".")) return "";
  const candidate = hasScheme ? raw : `https://${raw}`;
  try {
    const parsed = new URL(candidate);
    if (!["https:", "http:"].includes(parsed.protocol)) return "";
    return parsed.toString();
  } catch {
    return "";
  }
}

function normalizeImageSource(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.startsWith("data:image/")) {
    if (estimateDataUrlBytes(raw) > MAX_INLINE_IMAGE_BYTES) return "";
    return raw;
  }
  return normalizeSafeUrl(raw);
}

function estimateDataUrlBytes(value = "") {
  const raw = String(value || "").trim();
  const separatorIndex = raw.indexOf(",");
  if (separatorIndex <= 0) return 0;
  const metadata = raw.slice(0, separatorIndex).toLowerCase();
  if (!metadata.startsWith("data:image/") || !metadata.includes(";base64")) return 0;
  const base64Payload = raw.slice(separatorIndex + 1).replace(/\s+/g, "");
  if (!base64Payload) return 0;
  const padding = base64Payload.endsWith("==")
    ? 2
    : base64Payload.endsWith("=")
      ? 1
      : 0;
  return Math.floor((base64Payload.length * 3) / 4) - padding;
}

function isValidEmail(value = "") {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));
}

function hasStrongPassword(value = "", minLength = 8) {
  const candidate = String(value || "");
  if (candidate.length < minLength) return false;
  return /[A-Za-z]/.test(candidate) && /\d/.test(candidate);
}

function parseJsonBody(rawBody, options = {}) {
  const maxBytes = Number.isFinite(Number(options.maxBytes))
    ? Math.max(1024, Number(options.maxBytes))
    : MAX_JSON_BODY_BYTES;

  if (!rawBody) return {};
  if (typeof rawBody === "object") return rawBody;
  if (typeof rawBody !== "string") return {};

  if (Buffer.byteLength(rawBody, "utf8") > maxBytes) {
    return {
      [BODY_PARSE_ERROR_KEY]: "payload-too-large",
    };
  }

  try {
    return JSON.parse(rawBody);
  } catch {
    return {
      [BODY_PARSE_ERROR_KEY]: "invalid-json",
    };
  }
}

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function parseCookies(cookieHeader = "") {
  return String(cookieHeader || "")
    .split(";")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .reduce((acc, part) => {
      const index = part.indexOf("=");
      if (index <= 0) return acc;
      const key = part.slice(0, index).trim();
      const value = part.slice(index + 1).trim();
      if (!key) return acc;
      try {
        acc[key] = decodeURIComponent(value);
      } catch {
        // Avoid crashing the request on malformed cookie encoding.
        acc[key] = value;
      }
      return acc;
    }, {});
}

function appendSetCookie(res, cookieValue) {
  const previous = res.getHeader("Set-Cookie");
  if (!previous) {
    res.setHeader("Set-Cookie", cookieValue);
    return;
  }
  if (Array.isArray(previous)) {
    res.setHeader("Set-Cookie", [...previous, cookieValue]);
    return;
  }
  res.setHeader("Set-Cookie", [previous, cookieValue]);
}

function buildCookie(name, value, options = {}) {
  const {
    maxAgeSec = null,
    httpOnly = true,
    sameSite = "Strict",
  } = options;

  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    `SameSite=${sameSite}`,
  ];

  if (httpOnly) {
    parts.push("HttpOnly");
  }
  if (Number.isFinite(Number(maxAgeSec)) && Number(maxAgeSec) >= 0) {
    parts.push(`Max-Age=${Math.max(0, Math.floor(Number(maxAgeSec)))}`);
  }
  if (process.env.NODE_ENV === "production") {
    parts.push("Secure");
  }
  return parts.join("; ");
}

function clearCookie(name, options = {}) {
  return buildCookie(name, "", {
    ...options,
    maxAgeSec: 0,
  });
}

function timingSafeEqualsString(a = "", b = "") {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function createEmptyEndpointMetrics() {
  return {
    requests: 0,
    responses: 0,
    errors: 0,
    csrfRejected: 0,
    invalidJson: 0,
    invalidContentType: 0,
    payloadTooLarge: 0,
    rateLimited: 0,
    totalDurationMs: 0,
    methods: {},
    statusCodes: {},
    lastEventAt: "",
  };
}

function getSecurityMetricsStore() {
  if (!globalThis[SECURITY_METRICS_STORE_KEY]) {
    globalThis[SECURITY_METRICS_STORE_KEY] = new Map();
  }
  return globalThis[SECURITY_METRICS_STORE_KEY];
}

function getEndpointMetrics(endpoint = "") {
  const normalizedEndpoint = normalizeLine(endpoint);
  if (!normalizedEndpoint) return null;
  const store = getSecurityMetricsStore();
  if (!store.has(normalizedEndpoint)) {
    store.set(normalizedEndpoint, createEmptyEndpointMetrics());
  }
  return store.get(normalizedEndpoint);
}

function logSecurityEvent(endpoint = "", event = "", details = {}) {
  if (process.env.SECURITY_LOG_ENABLED === "false") return;
  const normalizedEndpoint = normalizeLine(endpoint);
  const normalizedEvent = normalizeLine(event);
  if (!normalizedEndpoint || !normalizedEvent) return;

  const payload = {
    endpoint: normalizedEndpoint,
    event: normalizedEvent,
    at: new Date().toISOString(),
    ...details,
  };
  // JSON logs are easy to ingest by external providers if needed.
  console.warn(`[security-monitor] ${JSON.stringify(payload)}`);
}

function getSecurityMetricRedisKey(endpoint = "") {
  const endpointHash = crypto.createHash("sha256").update(String(endpoint || "")).digest("hex").slice(0, 24);
  return `atelier:security-metrics:${endpointHash}`;
}

async function persistApiMetricEvent(endpoint = "", event = "request", payload = {}) {
  if (!isKvConfigured()) return;
  const normalizedEndpoint = normalizeLine(endpoint);
  if (!normalizedEndpoint) return;
  const metricKey = getSecurityMetricRedisKey(normalizedEndpoint);
  const increments = [];

  if (event === "request") {
    const method = normalizeLine(payload.method || "").toUpperCase() || "UNKNOWN";
    increments.push(["requests", 1], [`method:${method}`, 1]);
  } else if (event === "response") {
    const status = Math.max(100, Math.min(599, Number(payload.status) || 200));
    increments.push(["responses", 1], [`status:${status}`, 1]);
    if (status >= 400) increments.push(["errors", 1]);
    if (Number.isFinite(Number(payload.durationMs))) {
      increments.push(["totalDurationMs", Math.max(0, Math.round(Number(payload.durationMs)))]);
    }
  } else {
    const field = {
      "csrf-rejected": "csrfRejected",
      "invalid-json": "invalidJson",
      "invalid-content-type": "invalidContentType",
      "payload-too-large": "payloadTooLarge",
      "rate-limited": "rateLimited",
    }[event];
    if (field) increments.push([field, 1]);
  }

  await runKvCommand("SADD", SECURITY_METRICS_INDEX_KEY, metricKey);
  await runKvCommand("HSET", metricKey, "endpoint", normalizedEndpoint, "lastEventAt", new Date().toISOString());
  await Promise.all(increments.map(([field, amount]) => runKvCommand("HINCRBY", metricKey, field, String(amount))));
}

function recordApiMetric(endpoint = "", event = "request", payload = {}) {
  const metrics = getEndpointMetrics(endpoint);
  if (!metrics) return;

  const nowIso = new Date().toISOString();
  metrics.lastEventAt = nowIso;

  switch (event) {
    case "request": {
      metrics.requests += 1;
      const method = normalizeLine(payload.method || "").toUpperCase() || "UNKNOWN";
      metrics.methods[method] = (metrics.methods[method] || 0) + 1;
      break;
    }
    case "response": {
      metrics.responses += 1;
      const status = Math.max(100, Math.min(599, Number(payload.status) || 200));
      const statusLabel = String(status);
      metrics.statusCodes[statusLabel] = (metrics.statusCodes[statusLabel] || 0) + 1;
      if (status >= 400) metrics.errors += 1;
      if (Number.isFinite(Number(payload.durationMs))) {
        metrics.totalDurationMs += Math.max(0, Number(payload.durationMs));
      }
      break;
    }
    case "csrf-rejected":
      metrics.csrfRejected += 1;
      break;
    case "invalid-json":
      metrics.invalidJson += 1;
      break;
    case "invalid-content-type":
      metrics.invalidContentType += 1;
      break;
    case "payload-too-large":
      metrics.payloadTooLarge += 1;
      break;
    case "rate-limited":
      metrics.rateLimited += 1;
      break;
    default:
      break;
  }

  if (isKvConfigured()) {
    void persistApiMetricEvent(endpoint, event, payload).catch((error) => {
      logSecurityEvent(endpoint, "metrics-persistence-failed", {
        message: normalizeLine(error?.message || "unknown-error").slice(0, 160),
      });
    });
  }
}

function monitorApiRequest(req, res, endpoint = "") {
  const normalizedEndpoint = normalizeLine(endpoint);
  if (!normalizedEndpoint || typeof res?.end !== "function") return () => {};

  recordApiMetric(normalizedEndpoint, "request", {
    method: String(req?.method || "GET"),
  });

  const startedAt = Date.now();
  const originalEnd = res.end.bind(res);
  let finished = false;

  const finalize = () => {
    if (finished) return;
    finished = true;
    recordApiMetric(normalizedEndpoint, "response", {
      status: Number(res.statusCode) || 200,
      durationMs: Date.now() - startedAt,
    });
  };

  res.end = (...args) => {
    finalize();
    return originalEnd(...args);
  };

  return finalize;
}

function parseRedisHash(rawValue) {
  if (rawValue && typeof rawValue === "object" && !Array.isArray(rawValue)) return rawValue;
  if (!Array.isArray(rawValue)) return {};
  const parsed = {};
  for (let index = 0; index < rawValue.length; index += 2) {
    parsed[String(rawValue[index] || "")] = rawValue[index + 1];
  }
  return parsed;
}

function buildEndpointMetricsFromRedis(rawValue) {
  const raw = parseRedisHash(rawValue);
  const metrics = createEmptyEndpointMetrics();
  Object.keys(metrics).forEach((field) => {
    if (["methods", "statusCodes", "lastEventAt"].includes(field)) return;
    metrics[field] = Math.max(0, Number(raw[field]) || 0);
  });
  metrics.lastEventAt = normalizeLine(raw.lastEventAt || "");
  Object.entries(raw).forEach(([field, value]) => {
    if (field.startsWith("method:")) metrics.methods[field.slice(7)] = Math.max(0, Number(value) || 0);
    if (field.startsWith("status:")) metrics.statusCodes[field.slice(7)] = Math.max(0, Number(value) || 0);
  });
  return { endpoint: normalizeLine(raw.endpoint || ""), metrics };
}

async function getSecurityMetricsSnapshot() {
  if (isKvConfigured()) {
    const metricKeys = await runKvCommand("SMEMBERS", SECURITY_METRICS_INDEX_KEY);
    const keys = Array.isArray(metricKeys) ? metricKeys : [];
    const records = await Promise.all(keys.map((key) => runKvCommand("HGETALL", key)));
    const endpoints = {};
    records.map(buildEndpointMetricsFromRedis).forEach((record) => {
      if (record.endpoint) endpoints[record.endpoint] = record.metrics;
    });
    return { generatedAt: new Date().toISOString(), endpoints };
  }

  const store = getSecurityMetricsStore();
  const endpoints = {};
  store.forEach((metrics, endpoint) => {
    endpoints[endpoint] = JSON.parse(JSON.stringify(metrics));
  });
  return {
    generatedAt: new Date().toISOString(),
    endpoints,
  };
}

async function resetSecurityMetrics() {
  const store = getSecurityMetricsStore();
  store.clear();
  if (!isKvConfigured()) return;
  const metricKeys = await runKvCommand("SMEMBERS", SECURITY_METRICS_INDEX_KEY);
  const keys = Array.isArray(metricKeys) ? metricKeys : [];
  await Promise.all(keys.map((key) => runKvCommand("DEL", key)));
  await runKvCommand("DEL", SECURITY_METRICS_INDEX_KEY);
}

function setCommonSecurityHeaders(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Permissions-Policy", "camera=(), geolocation=(), microphone=()");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Resource-Policy", "same-site");
  res.setHeader("X-Permitted-Cross-Domain-Policies", "none");
  res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  if (process.env.NODE_ENV === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
}

function getAllowedOrigins(...sources) {
  return sources
    .flatMap((source) => String(source || "").split(/[,\s]+/))
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function getRequestHosts(req) {
  const rawHost = String(req.headers?.host || "");
  const rawForwardedHost = String(req.headers?.["x-forwarded-host"] || "");
  const hosts = [rawHost, rawForwardedHost]
    .flatMap((value) => value.split(","))
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return [...new Set(hosts)];
}

function extractHostFromUrl(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    return new URL(raw).host.toLowerCase();
  } catch {
    return "";
  }
}

function extractHostnameFromUrl(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    return new URL(raw).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function extractPortFromUrl(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    if (parsed.port) return parsed.port;
    return parsed.protocol === "https:" ? "443" : "80";
  } catch {
    return "";
  }
}

function parseHostPort(rawHost = "") {
  const host = String(rawHost || "").trim().toLowerCase();
  if (!host) return { host: "", hostname: "", port: "" };

  if (host.startsWith("[") && host.includes("]")) {
    const endIndex = host.indexOf("]");
    const hostname = host.slice(1, endIndex);
    const suffix = host.slice(endIndex + 1);
    const port = suffix.startsWith(":") ? suffix.slice(1) : "";
    return { host, hostname, port };
  }

  const lastColonIndex = host.lastIndexOf(":");
  if (lastColonIndex > 0 && host.indexOf(":") === lastColonIndex) {
    return {
      host,
      hostname: host.slice(0, lastColonIndex),
      port: host.slice(lastColonIndex + 1),
    };
  }

  return { host, hostname: host, port: "" };
}

function isPrivateIpv4(hostname = "") {
  const match = String(hostname || "").match(/^(\d{1,3})(?:\.(\d{1,3})){3}$/);
  if (!match) return false;
  const parts = String(hostname).split(".").map((item) => Number(item));
  if (parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  if (parts[0] === 10) return true;
  if (parts[0] === 127) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  return false;
}

function isLocalHostLike(hostname = "") {
  const normalized = String(hostname || "").trim().toLowerCase();
  if (!normalized) return false;
  if (normalized === "localhost" || normalized === "0.0.0.0" || normalized === "::1") return true;
  if (normalized.endsWith(".local")) return true;
  if (isPrivateIpv4(normalized)) return true;
  if (/^(fc|fd)[0-9a-f]{2}:/i.test(normalized)) return true;
  return false;
}

function normalizeAllowedOrigin(value = "") {
  return String(value || "").trim().replace(/\/+$/, "").toLowerCase();
}

function isAllowedOriginMatch(allowed = "", candidate = "") {
  const normalizedAllowed = normalizeAllowedOrigin(allowed);
  const normalizedCandidate = String(candidate || "").trim().toLowerCase();
  if (!normalizedAllowed || !normalizedCandidate) return false;

  if (normalizedCandidate === normalizedAllowed || normalizedCandidate.startsWith(`${normalizedAllowed}/`)) {
    return true;
  }

  try {
    const parsedCandidate = new URL(normalizedCandidate);
    const candidateOrigin = parsedCandidate.origin.toLowerCase();
    if (candidateOrigin === normalizedAllowed) return true;

    if (normalizedAllowed.includes("://*.")) {
      const [rawProtocol, wildcardHost] = normalizedAllowed.split("://*.");
      const candidateProtocol = String(parsedCandidate.protocol || "").replace(":", "").toLowerCase();
      if (rawProtocol && wildcardHost && rawProtocol === candidateProtocol) {
        return parsedCandidate.hostname.toLowerCase().endsWith(`.${wildcardHost}`);
      }
    }

    if (normalizedAllowed.startsWith("*.")) {
      const wildcardHost = normalizedAllowed.slice(2);
      return parsedCandidate.hostname.toLowerCase().endsWith(`.${wildcardHost}`);
    }

    if (!normalizedAllowed.includes("://")) {
      return parsedCandidate.host.toLowerCase() === normalizedAllowed
        || parsedCandidate.hostname.toLowerCase() === normalizedAllowed;
    }
  } catch {
    return false;
  }

  return false;
}

function isDevelopmentEnvironment() {
  return String(process.env.NODE_ENV || "").toLowerCase() !== "production";
}

function isDevelopmentLocalOriginAllowed(req, candidate = "") {
  if (!isDevelopmentEnvironment()) return false;
  const candidateHostname = extractHostnameFromUrl(candidate);
  if (!isLocalHostLike(candidateHostname)) return false;

  const candidatePort = extractPortFromUrl(candidate);
  const requestHosts = getRequestHosts(req);
  if (!requestHosts.length) return true;

  return requestHosts.some((requestHost) => {
    const parsed = parseHostPort(requestHost);
    if (!parsed.hostname || !isLocalHostLike(parsed.hostname)) return false;
    if (!candidatePort || !parsed.port) return true;
    return parsed.port === candidatePort;
  });
}

function isSameHostRequest(req, value = "") {
  const candidateHost = extractHostFromUrl(value);
  if (!candidateHost) return false;
  const requestHosts = getRequestHosts(req);
  if (!requestHosts.length) return false;
  return requestHosts.includes(candidateHost);
}

function isOriginAllowed(req, allowedOrigins) {
  if (!allowedOrigins.length) return true;
  const origin = String(req.headers?.origin || "").trim();
  const referer = String(req.headers?.referer || "").trim();
  const candidates = [origin, referer].filter(Boolean);
  if (!origin && !referer) return true;
  if (isSameHostRequest(req, origin) || isSameHostRequest(req, referer)) return true;

  if (candidates.some((candidate) => isDevelopmentLocalOriginAllowed(req, candidate))) {
    return true;
  }

  return allowedOrigins.some((allowed) => candidates.some((candidate) => isAllowedOriginMatch(allowed, candidate)));
}

function base64UrlEncode(value) {
  return Buffer.from(value).toString("base64url");
}

function base64UrlDecode(value) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signPayload(payload, secret) {
  const body = base64UrlEncode(JSON.stringify(payload));
  const signature = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${signature}`;
}

function verifySignedToken(token, secret) {
  if (!token || typeof token !== "string" || !secret) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  const expected = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  if (!timingSafeEqualsString(signature, expected)) return null;
  const parsed = safeJsonParse(base64UrlDecode(body));
  if (!parsed || typeof parsed !== "object") return null;
  const expiresAt = Number(parsed.exp);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;
  return parsed;
}

function normalizeSessionVersion(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 1) return 1;
  return Math.floor(numeric);
}

function resolveVersionedUserSession(users = [], session = null) {
  if (!session?.sub) return null;
  const user = (Array.isArray(users) ? users : []).find((entry) => String(entry?.id || "") === String(session.sub));
  if (!user) return null;
  if (normalizeSessionVersion(session.sessionVersion) !== normalizeSessionVersion(user.sessionVersion)) {
    return null;
  }
  return user;
}

function buildSessionCookie(name, token, maxAgeSec) {
  return buildCookie(name, token, {
    maxAgeSec,
    httpOnly: true,
    sameSite: "Strict",
  });
}

function buildClearSessionCookie(name) {
  return clearCookie(name, {
    httpOnly: true,
    sameSite: "Strict",
  });
}

function createCsrfToken() {
  return crypto.randomBytes(24).toString("base64url");
}

function ensureCsrfCookie(req, res) {
  const cookies = parseCookies(req.headers?.cookie || "");
  const current = cookies[CSRF_COOKIE_NAME] || "";
  const safeToken = /^[A-Za-z0-9_-]{24,}$/.test(current) ? current : createCsrfToken();
  if (safeToken !== current) {
    appendSetCookie(res, buildCookie(CSRF_COOKIE_NAME, safeToken, {
      maxAgeSec: 60 * 60 * 12,
      httpOnly: false,
      sameSite: "Lax",
    }));
  }
  return safeToken;
}

function requireCsrf(req, res, context = {}) {
  if (["GET", "HEAD", "OPTIONS"].includes(String(req.method || "GET").toUpperCase())) {
    ensureCsrfCookie(req, res);
    return true;
  }

  const cookies = parseCookies(req.headers?.cookie || "");
  const cookieToken = String(cookies[CSRF_COOKIE_NAME] || "");
  const headerToken = normalizeLine(req.headers?.["x-csrf-token"] || "");
  const requestHeader = normalizeLine(req.headers?.["x-requested-with"] || "");

  if (
    !cookieToken
    || !headerToken
    || requestHeader !== "XMLHttpRequest"
    || !timingSafeEqualsString(cookieToken, headerToken)
  ) {
    const endpoint = normalizeLine(context?.endpoint || "");
    recordApiMetric(endpoint, "csrf-rejected");
    logSecurityEvent(endpoint, "csrf-rejected", {
      method: String(req.method || "GET").toUpperCase(),
      ip: getClientIp(req),
    });
    res.status(403).json({ ok: false, message: "CSRF token invalido" });
    return false;
  }

  return true;
}

function requireJsonBody(req, res, options = {}) {
  const method = String(req.method || "GET").toUpperCase();
  if (["GET", "HEAD", "OPTIONS"].includes(method)) return {};
  const endpoint = normalizeLine(options?.endpoint || "");

  const contentType = normalizeLine(req.headers?.["content-type"] || "").toLowerCase();
  if (contentType && !contentType.includes("application/json")) {
    recordApiMetric(endpoint, "invalid-content-type");
    logSecurityEvent(endpoint, "invalid-content-type", {
      method,
      contentType,
    });
    res.status(415).json({ ok: false, message: "Content-Type invalido. Usa application/json." });
    return null;
  }

  const parsedBody = parseJsonBody(req.body, options);
  const parseError = parsedBody?.[BODY_PARSE_ERROR_KEY];
  if (!parseError) return parsedBody;

  if (parseError === "payload-too-large") {
    recordApiMetric(endpoint, "payload-too-large");
    logSecurityEvent(endpoint, "payload-too-large", {
      method,
      ip: getClientIp(req),
    });
    res.status(413).json({ ok: false, message: "Payload demasiado grande." });
    return null;
  }

  recordApiMetric(endpoint, "invalid-json");
  logSecurityEvent(endpoint, "invalid-json", {
    method,
    ip: getClientIp(req),
  });
  res.status(400).json({ ok: false, message: "JSON invalido." });
  return null;
}

function getClientIp(req) {
  const forwarded = String(req.headers?.["x-forwarded-for"] || "").split(",")[0].trim();
  if (forwarded) return forwarded;
  return String(req.socket?.remoteAddress || req.connection?.remoteAddress || "unknown");
}

function getRateLimitStore() {
  if (!globalThis[RATE_LIMIT_STORE_KEY]) {
    globalThis[RATE_LIMIT_STORE_KEY] = new Map();
  }
  return globalThis[RATE_LIMIT_STORE_KEY];
}

function consumeMemoryRateLimit(namespace, key, limit, windowMs, context = {}) {
  const store = getRateLimitStore();
  const now = Date.now();
  const bucketKey = `${namespace}:${key}`;
  const previous = store.get(bucketKey) || [];
  const fresh = previous.filter((entry) => now - entry < windowMs);
  if (fresh.length >= limit) {
    const oldest = fresh[0];
    const retryAfterMs = Math.max(1000, windowMs - (now - oldest));
    store.set(bucketKey, fresh);
    const endpoint = normalizeLine(context?.endpoint || "");
    recordApiMetric(endpoint, "rate-limited");
    logSecurityEvent(endpoint, "rate-limited", {
      namespace: normalizeLine(namespace),
      retryAfterMs,
      ip: normalizeLine(context?.ip || ""),
    });
    return {
      ok: false,
      retryAfterMs,
    };
  }
  const next = [...fresh, now];
  store.set(bucketKey, next);
  return {
    ok: true,
    retryAfterMs: 0,
  };
}

async function consumeRateLimit(namespace, key, limit, windowMs, context = {}) {
  if (!isKvConfigured()) {
    return consumeMemoryRateLimit(namespace, key, limit, windowMs, context);
  }

  const safeNamespace = normalizeLine(namespace).toLowerCase().replace(/[^a-z0-9:_-]/g, "-").slice(0, 80);
  const keyHash = crypto.createHash("sha256").update(String(key || "unknown")).digest("hex").slice(0, 32);
  const bucketKey = `atelier:rate-limit:${safeNamespace || "default"}:${keyHash}`;

  try {
    const count = Math.max(0, Number(await runKvCommand("INCR", bucketKey)) || 0);
    if (count === 1) {
      await runKvCommand("PEXPIRE", bucketKey, String(Math.max(1000, Math.floor(windowMs))));
    }
    const ttl = Number(await runKvCommand("PTTL", bucketKey));
    const retryAfterMs = Number.isFinite(ttl) && ttl > 0 ? ttl : Math.max(1000, windowMs);
    if (count <= limit) {
      return { ok: true, retryAfterMs: 0 };
    }

    const endpoint = normalizeLine(context?.endpoint || "");
    recordApiMetric(endpoint, "rate-limited");
    logSecurityEvent(endpoint, "rate-limited", {
      namespace: safeNamespace,
      retryAfterMs,
      ip: normalizeLine(context?.ip || ""),
    });
    return { ok: false, retryAfterMs };
  } catch (error) {
    if (String(process.env.NODE_ENV || "").toLowerCase() === "production") {
      throw error;
    }
    return consumeMemoryRateLimit(namespace, key, limit, windowMs, context);
  }
}

function hashLegacyPassword(secret = "", salt = "") {
  return crypto.createHash("sha256").update(`${salt}::${secret}`).digest("hex");
}

function createPasswordRecord(password = "") {
  const salt = crypto.randomBytes(16).toString("base64url");
  const hash = crypto.scryptSync(password, salt, PASSWORD_HASH_KEY_LENGTH).toString("hex");
  return {
    passwordAlgorithm: "scrypt",
    passwordSalt: salt,
    passwordHash: hash,
  };
}

function verifyPassword(password = "", record = {}) {
  const algorithm = normalizeOptionLabel(record.passwordAlgorithm || "sha256").toLowerCase();
  const salt = String(record.passwordSalt || "");
  const expectedHash = String(record.passwordHash || "");
  if (!salt || !expectedHash) return false;

  if (algorithm === "scrypt") {
    const computed = crypto.scryptSync(password, salt, PASSWORD_HASH_KEY_LENGTH).toString("hex");
    return timingSafeEqualsString(computed, expectedHash);
  }

  const computed = hashLegacyPassword(password, salt);
  return timingSafeEqualsString(computed, expectedHash);
}

export {
  CSRF_COOKIE_NAME,
  appendSetCookie,
  buildClearSessionCookie,
  buildCookie,
  buildSessionCookie,
  consumeRateLimit,
  createCsrfToken,
  createPasswordRecord,
  ensureCsrfCookie,
  getSecurityMetricsSnapshot,
  getAllowedOrigins,
  getClientIp,
  hasStrongPassword,
  isOriginAllowed,
  isValidEmail,
  logSecurityEvent,
  monitorApiRequest,
  normalizeEmail,
  normalizeImageSource,
  normalizeLine,
  normalizeOptionLabel,
  normalizePhone,
  normalizeSafeUrl,
  parseCookies,
  parseJsonBody,
  recordApiMetric,
  resetSecurityMetrics,
  requireJsonBody,
  resolveVersionedUserSession,
  requireCsrf,
  sanitizeParagraph,
  setCommonSecurityHeaders,
  signPayload,
  verifyPassword,
  verifySignedToken,
};

