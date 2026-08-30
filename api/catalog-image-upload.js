import { handleUpload } from "@vercel/blob/client";
import {
  consumeRateLimit,
  getAllowedOrigins,
  getClientIp,
  isOriginAllowed,
  monitorApiRequest,
  normalizeLine,
  parseCookies,
  requireCsrf,
  requireJsonBody,
  setCommonSecurityHeaders,
  verifySignedToken,
} from "./_lib/security.js";

const ADMIN_COOKIE_NAME = "adriego_admin_session";
const ENDPOINT_NAME = "catalog-image-upload";
const MAX_PRODUCT_IMAGE_BYTES = 150 * 1024;
const ALLOWED_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp"];
const PRODUCT_IMAGE_PATH_PATTERN = /^catalog\/products\/\d{4}-\d{2}\/[a-f0-9-]{20,}\.(?:jpe?g|png|webp)$/i;

function resolveAdminSession(req) {
  const sessionSecret = String(process.env.ADMIN_SESSION_SECRET || "").trim();
  if (!sessionSecret) return null;
  const cookies = parseCookies(req.headers?.cookie || "");
  return verifySignedToken(cookies[ADMIN_COOKIE_NAME] || cookies.atelier_admin_session || "", sessionSecret);
}

function getCatalogImageUploadPolicy(pathname, multipart = false) {
  const safePathname = normalizeLine(pathname || "");
  if (multipart || !PRODUCT_IMAGE_PATH_PATTERN.test(safePathname)) {
    throw new Error("Ruta de imagen no permitida");
  }
  return {
    allowedContentTypes: ALLOWED_CONTENT_TYPES,
    maximumSizeInBytes: MAX_PRODUCT_IMAGE_BYTES,
    addRandomSuffix: true,
    allowOverwrite: false,
    cacheControlMaxAge: 60 * 60 * 24 * 365,
    validUntil: Date.now() + (5 * 60 * 1000),
  };
}

export default async function handler(req, res) {
  monitorApiRequest(req, res, ENDPOINT_NAME);
  setCommonSecurityHeaders(res);
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  const allowedOrigins = getAllowedOrigins(process.env.ADMIN_ALLOWED_ORIGIN);
  if (!isOriginAllowed(req, allowedOrigins)) {
    res.status(403).json({ ok: false, message: "Origen no permitido" });
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ ok: false, message: "Method not allowed" });
    return;
  }
  if (!requireCsrf(req, res, { endpoint: ENDPOINT_NAME })) return;
  if (!resolveAdminSession(req)) {
    res.status(401).json({ ok: false, message: "No autorizado" });
    return;
  }

  const clientIp = getClientIp(req);
  const rateLimit = await consumeRateLimit("catalog-image-upload-admin-ip", clientIp, 120, 10 * 60 * 1000, {
    endpoint: ENDPOINT_NAME,
    ip: clientIp,
  });
  if (!rateLimit.ok) {
    res.setHeader("Retry-After", String(Math.ceil(rateLimit.retryAfterMs / 1000)));
    res.status(429).json({ ok: false, message: "Too many requests" });
    return;
  }

  const body = requireJsonBody(req, res, { endpoint: ENDPOINT_NAME });
  if (!body) return;
  if (body.type !== "blob.generate-client-token") {
    res.status(400).json({ ok: false, message: "Solicitud de carga no válida" });
    return;
  }

  const blobToken = String(process.env.BLOB_READ_WRITE_TOKEN || "").trim();
  if (!blobToken) {
    res.status(503).json({ ok: false, message: "Almacenamiento de imágenes no configurado" });
    return;
  }

  try {
    const response = await handleUpload({
      token: blobToken,
      request: req,
      body,
      onBeforeGenerateToken: async (pathname, _clientPayload, multipart) => (
        getCatalogImageUploadPolicy(pathname, multipart)
      ),
    });
    res.status(200).json(response);
  } catch {
    res.status(400).json({ ok: false, message: "No se pudo autorizar la carga de la imagen" });
  }
}

export {
  ALLOWED_CONTENT_TYPES,
  MAX_PRODUCT_IMAGE_BYTES,
  getCatalogImageUploadPolicy,
};
