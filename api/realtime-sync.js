
import { readStore } from "./_lib/store.js";
import {
  consumeRateLimit,
  ensureCsrfCookie,
  getAllowedOrigins,
  getClientIp,
  isOriginAllowed,
  monitorApiRequest,
  normalizeLine,
  parseCookies,
  resolveVersionedUserSession,
  setCommonSecurityHeaders,
  verifySignedToken,
} from "./_lib/security.js";

const USER_COOKIE_NAME = "adriego_user_session";
const ADMIN_COOKIE_NAME = "adriego_admin_session";
const ENDPOINT_NAME = "realtime-sync";

function normalizeVersion(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return 0;
  return Math.floor(numeric);
}

function resolveUserSession(req) {
  const sessionSecret = String(process.env.USER_SESSION_SECRET || "").trim();
  if (!sessionSecret) return null;
  const cookies = parseCookies(req.headers?.cookie || "");
  return verifySignedToken(cookies[USER_COOKIE_NAME] || cookies.atelier_user_session || "", sessionSecret);
}

function resolveAdminSession(req) {
  const sessionSecret = String(process.env.ADMIN_SESSION_SECRET || "").trim();
  if (!sessionSecret) return null;
  const cookies = parseCookies(req.headers?.cookie || "");
  return verifySignedToken(cookies[ADMIN_COOKIE_NAME] || cookies.atelier_admin_session || "", sessionSecret);
}

export default async function handler(req, res) {
  monitorApiRequest(req, res, ENDPOINT_NAME);
  setCommonSecurityHeaders(res);
  ensureCsrfCookie(req, res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "GET") {
    res.status(405).json({ ok: false, message: "Method not allowed" });
    return;
  }

  const allowedOrigins = getAllowedOrigins(
    process.env.USER_ALLOWED_ORIGIN,
    process.env.ADMIN_ALLOWED_ORIGIN,
  );
  if (!isOriginAllowed(req, allowedOrigins)) {
    res.status(403).json({ ok: false, message: "Origin not allowed" });
    return;
  }

  const clientIp = getClientIp(req);
  const rateLimit = await consumeRateLimit("realtime-sync-ip", clientIp, 240, 10 * 60 * 1000, {
    endpoint: ENDPOINT_NAME,
    ip: clientIp,
  });
  if (!rateLimit.ok) {
    res.setHeader("Retry-After", String(Math.ceil(rateLimit.retryAfterMs / 1000)));
    res.status(429).json({ ok: false, message: "Too many requests" });
    return;
  }

  const store = await readStore();
  const realtime = store?.meta?.realtime && typeof store.meta.realtime === "object"
    ? store.meta.realtime
    : {};
  const userSession = resolveUserSession(req);
  const adminSession = resolveAdminSession(req);
  const userRecord = resolveVersionedUserSession(store?.users, userSession);

  res.status(200).json({
    ok: true,
    versions: {
      global: normalizeVersion(realtime.globalVersion),
      catalog: normalizeVersion(realtime.catalogVersion),
      orders: normalizeVersion(realtime.ordersVersion),
      users: normalizeVersion(realtime.usersVersion),
      userState: normalizeVersion(realtime.userStateVersion),
      updatedAt: normalizeLine(realtime.updatedAt || "").slice(0, 60),
    },
    authenticated: Boolean(userRecord),
    isAdmin: Boolean(adminSession),
    currentUser: userRecord
      ? {
          id: String(userRecord.id || ""),
          stateVersion: normalizeVersion(userRecord.stateVersion),
          stateUpdatedAt: normalizeLine(userRecord.stateUpdatedAt || userRecord.updatedAt || "").slice(0, 60),
        }
      : null,
  });
}

