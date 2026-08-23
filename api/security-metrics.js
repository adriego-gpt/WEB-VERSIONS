/* global process */

import {
  ensureCsrfCookie,
  getAllowedOrigins,
  getSecurityMetricsSnapshot,
  isOriginAllowed,
  monitorApiRequest,
  normalizeLine,
  parseCookies,
  requireCsrf,
  resetSecurityMetrics,
  setCommonSecurityHeaders,
  verifySignedToken,
} from "./_lib/security.js";

const ADMIN_COOKIE_NAME = "atelier_admin_session";
const ENDPOINT_NAME = "security-metrics";

function resolveAdminSession(req) {
  const sessionSecret = String(process.env.ADMIN_SESSION_SECRET || "").trim();
  if (!sessionSecret) return null;
  const cookies = parseCookies(req.headers?.cookie || "");
  return verifySignedToken(cookies[ADMIN_COOKIE_NAME] || "", sessionSecret);
}

export default async function handler(req, res) {
  monitorApiRequest(req, res, ENDPOINT_NAME);
  setCommonSecurityHeaders(res);
  ensureCsrfCookie(req, res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  const allowedOrigins = getAllowedOrigins(
    process.env.ADMIN_ALLOWED_ORIGIN,
    process.env.USER_ALLOWED_ORIGIN,
  );
  if (!isOriginAllowed(req, allowedOrigins)) {
    res.status(403).json({ ok: false, message: "Origen no permitido" });
    return;
  }

  const adminSession = resolveAdminSession(req);
  if (!adminSession) {
    res.status(401).json({ ok: false, message: "No autorizado" });
    return;
  }

  const action = normalizeLine(req.query?.action || "snapshot").toLowerCase();

  if (action === "snapshot") {
    if (req.method !== "GET") {
      res.status(405).json({ ok: false, message: "Method not allowed" });
      return;
    }
    res.status(200).json({
      ok: true,
      metrics: await getSecurityMetricsSnapshot(),
    });
    return;
  }

  if (action === "reset") {
    if (req.method !== "POST") {
      res.status(405).json({ ok: false, message: "Method not allowed" });
      return;
    }
    if (!requireCsrf(req, res, { endpoint: ENDPOINT_NAME })) return;
    await resetSecurityMetrics();
    res.status(200).json({ ok: true, message: "Metricas reiniciadas." });
    return;
  }

  res.status(400).json({ ok: false, message: "Accion no valida" });
}
