
import {
  buildClearSessionCookie,
  buildSessionCookie,
  consumeRateLimit,
  ensureCsrfCookie,
  getAllowedOrigins,
  getClientIp,
  isOriginAllowed,
  monitorApiRequest,
  normalizeEmail,
  normalizeLine,
  parseCookies,
  requireJsonBody,
  requireCsrf,
  setCommonSecurityHeaders,
  signPayload,
  verifyPassword,
  verifySignedToken,
} from "./_lib/security.js";

const COOKIE_NAME = "adriego_admin_session";
const LOCK_STATE = new Map();
const SESSION_HOURS = Math.max(1, Number(process.env.ADMIN_SESSION_HOURS) || 6);
const MAX_ATTEMPTS = Math.max(3, Number(process.env.ADMIN_MAX_ATTEMPTS) || 5);
const LOCK_MINUTES = Math.max(1, Number(process.env.ADMIN_LOCK_MINUTES) || 15);
const SESSION_TTL_MS = SESSION_HOURS * 60 * 60 * 1000;
const LOCK_TTL_MS = LOCK_MINUTES * 60 * 1000;
const LOCK_RETENTION_MS = Math.max(LOCK_TTL_MS * 2, 30 * 60 * 1000);
const ENDPOINT_NAME = "admin-session";
let lastLockPruneAt = 0;

function buildSession(username, secret) {
  const now = Date.now();
  const payload = {
    sub: normalizeLine(username || "admin"),
    iat: now,
    exp: now + SESSION_TTL_MS,
  };
  return {
    token: signPayload(payload, secret),
    payload,
  };
}

function getLockState(ip) {
  const now = Date.now();
  if (now - lastLockPruneAt > 5 * 60 * 1000) {
    LOCK_STATE.forEach((entry, key) => {
      const lockUntil = Number(entry?.lockUntil) || 0;
      const lastSeenAt = Number(entry?.lastSeenAt) || 0;
      if (lockUntil > now) return;
      if (now - lastSeenAt > LOCK_RETENTION_MS) {
        LOCK_STATE.delete(key);
      }
    });
    lastLockPruneAt = now;
  }

  const current = LOCK_STATE.get(ip);
  if (!current) return { attempts: 0, lockUntil: 0, lastSeenAt: now };
  if (current.lockUntil > 0 && current.lockUntil <= now) {
    LOCK_STATE.delete(ip);
    return { attempts: 0, lockUntil: 0, lastSeenAt: now };
  }
  return { ...current, lastSeenAt: now };
}

function registerFailure(ip) {
  const now = Date.now();
  const current = getLockState(ip);
  const nextAttempts = (current.attempts || 0) + 1;
  const shouldLock = nextAttempts >= MAX_ATTEMPTS;
  const next = {
    attempts: shouldLock ? 0 : nextAttempts,
    lockUntil: shouldLock ? now + LOCK_TTL_MS : 0,
    lastSeenAt: now,
  };
  LOCK_STATE.set(ip, next);
  return next;
}

function clearFailures(ip) {
  LOCK_STATE.delete(ip);
}

function readEnvConfig() {
  return {
    username: normalizeLine(process.env.ADMIN_USERNAME || "adriego-admin"),
    email: normalizeEmail(process.env.ADMIN_EMAIL || "soporte@adriego.store"),
    passwordAlgorithm: normalizeLine(process.env.ADMIN_PASSWORD_ALGORITHM || "sha256"),
    passwordSalt: String(process.env.ADMIN_PASSWORD_SALT || "").trim(),
    passwordHash: String(process.env.ADMIN_PASSWORD_HASH || "").trim(),
    sessionSecret: String(process.env.ADMIN_SESSION_SECRET || "").trim(),
  };
}

function sendUnauthorized(res) {
  res.status(401).json({ ok: false, message: "No autorizado" });
}

export default async function handler(req, res) {
  monitorApiRequest(req, res, ENDPOINT_NAME);
  setCommonSecurityHeaders(res);
  ensureCsrfCookie(req, res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  const allowedOrigins = getAllowedOrigins(process.env.ADMIN_ALLOWED_ORIGIN);
  if (!isOriginAllowed(req, allowedOrigins)) {
    res.status(403).json({ ok: false, message: "Origen no permitido" });
    return;
  }

  const { username, email, passwordAlgorithm, passwordSalt, passwordHash, sessionSecret } = readEnvConfig();
  if (!passwordSalt || !passwordHash || !sessionSecret) {
    res.status(500).json({ ok: false, message: "Admin auth no configurado" });
    return;
  }

  const action = normalizeLine(req.query?.action || "status").toLowerCase();
  const ip = getClientIp(req);
  const cookies = parseCookies(req.headers?.cookie || "");
  const sessionPayload = verifySignedToken(cookies[COOKIE_NAME] || cookies.atelier_admin_session || "", sessionSecret);

  if (action === "status") {
    const rateLimit = await consumeRateLimit("admin-status-ip", ip, 100, 10 * 60 * 1000, {
      endpoint: ENDPOINT_NAME,
      ip,
    });
    if (!rateLimit.ok) {
      res.setHeader("Retry-After", String(Math.ceil(rateLimit.retryAfterMs / 1000)));
      res.status(429).json({ ok: false, message: "Too many requests" });
      return;
    }

    if (!sessionPayload) {
      res.status(200).json({ ok: true, isAdmin: false, session: null });
      return;
    }
    res.status(200).json({
      ok: true,
      isAdmin: true,
      session: {
        username: sessionPayload.sub,
        expiresAt: sessionPayload.exp,
        issuedAt: sessionPayload.iat,
      },
    });
    return;
  }

  if (action === "logout") {
    if (req.method !== "POST") {
      res.status(405).json({ ok: false, message: "Method not allowed" });
      return;
    }
    if (!requireCsrf(req, res, { endpoint: ENDPOINT_NAME })) return;

    const rateLimit = await consumeRateLimit("admin-logout-ip", ip, 30, 10 * 60 * 1000, {
      endpoint: ENDPOINT_NAME,
      ip,
    });
    if (!rateLimit.ok) {
      res.setHeader("Retry-After", String(Math.ceil(rateLimit.retryAfterMs / 1000)));
      res.status(429).json({ ok: false, message: "Too many requests" });
      return;
    }

    res.setHeader("Set-Cookie", buildClearSessionCookie(COOKIE_NAME));
    res.status(200).json({ ok: true, isAdmin: false });
    return;
  }

  if (action === "touch") {
    if (req.method !== "POST") {
      res.status(405).json({ ok: false, message: "Method not allowed" });
      return;
    }
    if (!requireCsrf(req, res, { endpoint: ENDPOINT_NAME })) return;
    if (!sessionPayload) {
      sendUnauthorized(res);
      return;
    }

    const rateLimit = await consumeRateLimit("admin-touch-ip", ip, 60, 10 * 60 * 1000, {
      endpoint: ENDPOINT_NAME,
      ip,
    });
    if (!rateLimit.ok) {
      res.setHeader("Retry-After", String(Math.ceil(rateLimit.retryAfterMs / 1000)));
      res.status(429).json({ ok: false, message: "Too many requests" });
      return;
    }

    const refreshed = buildSession(sessionPayload.sub, sessionSecret);
    res.setHeader("Set-Cookie", buildSessionCookie(COOKIE_NAME, refreshed.token, SESSION_TTL_MS / 1000));
    res.status(200).json({
      ok: true,
      isAdmin: true,
      session: {
        username: refreshed.payload.sub,
        expiresAt: refreshed.payload.exp,
        issuedAt: refreshed.payload.iat,
      },
    });
    return;
  }

  if (action !== "login") {
    res.status(400).json({ ok: false, message: "Accion no valida" });
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ ok: false, message: "Method not allowed" });
    return;
  }

  if (!requireCsrf(req, res, { endpoint: ENDPOINT_NAME })) return;

  const lockState = getLockState(ip);
  if (lockState.lockUntil > Date.now()) {
    res.setHeader("Retry-After", String(Math.ceil((lockState.lockUntil - Date.now()) / 1000)));
    res.status(429).json({
      ok: false,
      message: "Acceso temporalmente bloqueado",
      lockUntil: lockState.lockUntil,
    });
    return;
  }

  const body = requireJsonBody(req, res, { endpoint: ENDPOINT_NAME });
  if (!body) return;
  const identifier = normalizeLine(body.identifier || "").toLowerCase();
  const password = String(body.password || "");

  const ipLimit = await consumeRateLimit("admin-login-ip", ip, 20, 10 * 60 * 1000, {
    endpoint: ENDPOINT_NAME,
    ip,
  });
  const identifierLimit = identifier
    ? await consumeRateLimit("admin-login-identifier", identifier, 12, 10 * 60 * 1000, {
        endpoint: ENDPOINT_NAME,
        ip,
      })
    : { ok: true };

  if (!ipLimit.ok || !identifierLimit.ok) {
    const retryAfterMs = Math.max(ipLimit.retryAfterMs || 0, identifierLimit.retryAfterMs || 0);
    res.setHeader("Retry-After", String(Math.ceil(retryAfterMs / 1000)));
    res.status(429).json({ ok: false, message: "Too many requests" });
    return;
  }

  if (!identifier || !password) {
    res.status(400).json({ ok: false, message: "Credenciales incompletas" });
    return;
  }

  const matchesAdmin = identifier === username.toLowerCase() || identifier === email;
  const passwordOk = matchesAdmin && verifyPassword(password, {
    passwordAlgorithm,
    passwordSalt,
    passwordHash,
  });

  if (!passwordOk) {
    const nextLock = registerFailure(ip);
    res.status(401).json({
      ok: false,
      message: "Credenciales invalidas",
      lockUntil: nextLock.lockUntil || 0,
      attemptsRemaining: nextLock.lockUntil ? 0 : Math.max(0, MAX_ATTEMPTS - (nextLock.attempts || 0)),
    });
    return;
  }

  clearFailures(ip);
  const session = buildSession(username, sessionSecret);
  res.setHeader("Set-Cookie", buildSessionCookie(COOKIE_NAME, session.token, SESSION_TTL_MS / 1000));
  res.status(200).json({
    ok: true,
    isAdmin: true,
    session: {
      username: session.payload.sub,
      expiresAt: session.payload.exp,
      issuedAt: session.payload.iat,
    },
  });
}
