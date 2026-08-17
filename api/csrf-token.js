/* global process */

import {
  ensureCsrfCookie,
  getAllowedOrigins,
  isOriginAllowed,
  monitorApiRequest,
  setCommonSecurityHeaders,
} from "./_lib/security.js";

export default async function handler(req, res) {
  monitorApiRequest(req, res, "csrf-token");
  setCommonSecurityHeaders(res);

  if (!["GET", "HEAD", "OPTIONS"].includes(String(req.method || "GET").toUpperCase())) {
    res.status(405).json({ ok: false, message: "Method not allowed" });
    return;
  }

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  const allowedOrigins = getAllowedOrigins(
    process.env.USER_ALLOWED_ORIGIN,
    process.env.ADMIN_ALLOWED_ORIGIN,
  );

  if (!isOriginAllowed(req, allowedOrigins)) {
    res.status(403).json({ ok: false, message: "Origen no permitido" });
    return;
  }

  const token = ensureCsrfCookie(req, res);
  res.status(200).json({ ok: true, token });
}
