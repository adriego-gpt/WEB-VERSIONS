
import crypto from "node:crypto";
import { bumpRealtimeMeta, readStore, updateStore } from "./_lib/store.js";
import {
  consumeRateLimit,
  ensureCsrfCookie,
  getAllowedOrigins,
  getClientIp,
  isOriginAllowed,
  isValidEmail,
  monitorApiRequest,
  normalizeEmail,
  normalizeLine,
  normalizePhone,
  parseCookies,
  requireCsrf,
  requireJsonBody,
  sanitizeParagraph,
  setCommonSecurityHeaders,
  verifySignedToken,
} from "./_lib/security.js";

const ADMIN_COOKIE_NAME = "adriego_admin_session";
const ENDPOINT_NAME = "admin-users";
const USERNAME_MIN_LENGTH = 3;
const USERNAME_MAX_LENGTH = 40;
const USER_PHONE_LENGTH = 10;
const NAME_MAX_LENGTH = 90;
const IDENTIFIER_MAX_LENGTH = 120;
const SHIPPING_ADDRESS_MAX_LENGTH = 320;
const RESET_TOKEN_BYTES = 32;
const RESET_TOKEN_TTL_MS = Math.max(10 * 60 * 1000, (Number(process.env.USER_PASSWORD_RESET_TTL_MINUTES) || 30) * 60 * 1000);
const RESET_EMAIL_TIMEOUT_MS = Math.max(3000, Number(process.env.PASSWORD_RESET_EMAIL_TIMEOUT_MS) || 10000);
const RATE_KEY_MAX_LENGTH = 140;

function buildRateLimitKey(value = "", fallback = "unknown") {
  const normalized = normalizeLine(value).toLowerCase().slice(0, RATE_KEY_MAX_LENGTH);
  return normalized || fallback;
}

async function applyRateLimit(res, namespace, key, limit, windowMs, context = {}) {
  const result = await consumeRateLimit(namespace, key, limit, windowMs, context);
  if (result.ok) return true;
  res.setHeader("Retry-After", String(Math.ceil(result.retryAfterMs / 1000)));
  res.status(429).json({ ok: false, message: "Too many requests" });
  return false;
}

function normalizeUsername(value = "") {
  return normalizeLine(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9._-]/g, "")
    .slice(0, USERNAME_MAX_LENGTH);
}

function normalizeUserPhone(value = "") {
  return normalizePhone(value).slice(0, USER_PHONE_LENGTH);
}

function sanitizeAdminUser(user = {}) {
  return {
    id: String(user.id || ""),
    name: normalizeLine(user.name || ""),
    lastName: normalizeLine(user.lastName || ""),
    email: normalizeEmail(user.email || ""),
    username: normalizeUsername(user.username || normalizeEmail(user.email || "").split("@")[0] || ""),
    phone: normalizeUserPhone(user.phone || ""),
    shippingAddress: sanitizeParagraph(user.shippingAddress || "").slice(0, SHIPPING_ADDRESS_MAX_LENGTH),
    createdAt: String(user.createdAt || ""),
    updatedAt: String(user.updatedAt || ""),
  };
}

function sortUsersByRecent(users = []) {
  return [...users].sort((left, right) => {
    const leftTime = new Date(left.updatedAt || left.createdAt || 0).getTime() || 0;
    const rightTime = new Date(right.updatedAt || right.createdAt || 0).getTime() || 0;
    return rightTime - leftTime;
  });
}

function resolveAdminSession(req) {
  const sessionSecret = String(process.env.ADMIN_SESSION_SECRET || "").trim();
  if (!sessionSecret) return null;
  const cookies = parseCookies(req.headers?.cookie || "");
  return verifySignedToken(cookies[ADMIN_COOKIE_NAME] || cookies.atelier_admin_session || "", sessionSecret);
}

function createPasswordResetToken() {
  return crypto.randomBytes(RESET_TOKEN_BYTES).toString("base64url");
}

function hashPasswordResetToken(token = "", secret = "") {
  return crypto
    .createHash("sha256")
    .update(`${secret}::password-reset::${String(token || "")}`)
    .digest("hex");
}

function buildPasswordResetLink(req, email = "", token = "") {
  const baseFromEnv = String(process.env.USER_PASSWORD_RESET_BASE_URL || "").trim().replace(/\/+$/, "");
  const originFromRequest = String(req.headers?.origin || "").trim().replace(/\/+$/, "");
  let baseUrl = baseFromEnv || originFromRequest;

  if (!baseUrl) {
    const forwardedProto = String(req.headers?.["x-forwarded-proto"] || "").split(",")[0].trim();
    const forwardedHost = String(req.headers?.["x-forwarded-host"] || req.headers?.host || "").split(",")[0].trim();
    const protocol = forwardedProto || (String(process.env.NODE_ENV || "").toLowerCase() === "production" ? "https" : "http");
    if (forwardedHost) {
      baseUrl = `${protocol}://${forwardedHost}`;
    }
  }

  if (!baseUrl || !token) return "";
  const search = new URLSearchParams({
    email: normalizeEmail(email),
    resetToken: token,
  });
  return `${baseUrl}/cuenta/restablecer?${search.toString()}`;
}

function maskEmailForLog(email = "") {
  const normalized = normalizeEmail(email);
  const [localPart = "", domainPart = ""] = normalized.split("@");
  if (!localPart || !domainPart) return "invalid-email";
  if (localPart.length <= 2) {
    return `**@${domainPart}`;
  }
  return `${localPart.slice(0, 2)}***@${domainPart}`;
}

function escapeHtml(value = "") {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function deliverPasswordResetEmail({ to = "", resetLink = "" }) {
  const provider = normalizeLine(process.env.PASSWORD_RESET_EMAIL_PROVIDER || "resend").toLowerCase();
  const endpoint = String(process.env.PASSWORD_RESET_EMAIL_ENDPOINT || "").trim();
  const bearer = String(process.env.PASSWORD_RESET_EMAIL_BEARER || process.env.RESEND_API_KEY || "").trim();
  const apiKey = String(process.env.PASSWORD_RESET_EMAIL_API_KEY || "").trim();
  const from = String(process.env.PASSWORD_RESET_EMAIL_FROM || process.env.RESEND_FROM_EMAIL || "no-reply@adriego.store").trim();
  const smtpUser = String(process.env.SMTP_USER || "").trim();
  const smtpPass = String(process.env.SMTP_PASS || "").trim();
  const smtpHost = String(process.env.SMTP_HOST || (provider.includes("gmail") ? "smtp.gmail.com" : "")).trim();
  const smtpFrom = String(process.env.SMTP_FROM_EMAIL || from).trim();
  const smtpPort = Math.max(1, Number(process.env.SMTP_PORT) || (provider.includes("gmail") ? 465 : 587));
  const smtpSecureRaw = String(process.env.SMTP_SECURE || (provider.includes("gmail") ? "true" : "")).toLowerCase();
  const smtpSecure = smtpSecureRaw
    ? ["1", "true", "yes", "on"].includes(smtpSecureRaw)
    : smtpPort === 465;
  const brandName = normalizeLine(process.env.STORE_BRAND_NAME || "Adriego Store") || "Adriego Store";
  const expiresMinutes = Math.max(1, Math.round(RESET_TOKEN_TTL_MS / (60 * 1000)));
  const supportEmail = normalizeEmail(
    process.env.STORE_SUPPORT_EMAIL
    || process.env.PASSWORD_RESET_SUPPORT_EMAIL
    || "adriegostorerecovery@gmail.com",
  );
  const safeBrandName = escapeHtml(brandName);
  const safeResetLink = escapeHtml(resetLink);
  const safeSupportEmail = escapeHtml(supportEmail || "");
  const currentYear = new Date().getFullYear();

  const subject = `${brandName} | Solicitud para restablecer tu contraseña`;
  const text = [
    `Hola,`,
    "",
    `Recibimos una solicitud para restablecer la contraseña de tu cuenta en ${brandName}.`,
    "",
    "Para continuar de forma segura, usa este enlace:",
    `${resetLink}`,
    "",
    `Por motivos de seguridad, este enlace es temporal y caducará en ${expiresMinutes} minutos.`,
    "",
    "Recomendaciones de seguridad:",
    "- Crea una contraseña única que no utilices en otras plataformas.",
    "- No compartas este enlace con terceros.",
    "- Si no solicitaste este cambio, puedes desestimar este mensaje de inmediato.",
    "",
    "Tu cuenta no se modificará si no utilizas el enlace.",
    safeSupportEmail ? `Soporte oficial: ${supportEmail}` : "",
    "",
    `Atentamente,`,
    `Equipo de ${brandName}`,
  ].filter(Boolean).join("\n");

  const html = `
<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${safeBrandName} - Seguridad de cuenta</title>
    <style>
      @media only screen and (max-width: 600px) {
        .email-shell { padding: 16px 8px !important; }
        .email-card { border-radius: 12px !important; }
        .email-header { padding: 18px 20px !important; }
        .email-body { padding: 26px 20px 20px !important; }
        .email-title { font-size: 22px !important; line-height: 1.25 !important; }
        .email-btn { display: block !important; width: 100% !important; text-align: center !important; box-sizing: border-box !important; padding: 15px 16px !important; }
        .email-footer { padding: 18px 20px 22px !important; }
      }
    </style>
  </head>
  <body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;color:#18181b;">
    <div style="display:none;font-size:1px;color:#f4f4f5;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">
      Enlace seguro para restablecer la contraseña de tu cuenta en ${safeBrandName}. Válido por ${expiresMinutes} minutos.
    </div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f4f5;width:100%;margin:0;padding:0;">
      <tr>
        <td align="center" class="email-shell" style="padding:36px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;background-color:#ffffff;border:1px solid #e4e4e7;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.04);" class="email-card">
            
            <!-- Brand Header -->
            <tr>
              <td class="email-header" style="padding:22px 32px;background-color:#000000;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td align="left" style="vertical-align:middle;">
                      <span style="color:#ffffff;font-size:16px;font-weight:800;letter-spacing:0.2em;text-transform:uppercase;display:inline-block;">
                        ${safeBrandName}
                      </span>
                    </td>
                    <td align="right" style="vertical-align:middle;">
                      <span style="display:inline-block;padding:4px 10px;border-radius:999px;background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.22);color:#ffffff;font-size:10px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;">
                        Seguridad de cuenta
                      </span>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Body Content -->
            <tr>
              <td class="email-body" style="padding:36px 32px 28px;">
                
                <!-- Eyebrow -->
                <p style="margin:0 0 8px;font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#71717a;">
                  Recuperación de acceso
                </p>

                <!-- Title -->
                <h1 class="email-title" style="margin:0 0 16px;font-size:25px;font-weight:700;line-height:1.25;color:#09090b;letter-spacing:-0.02em;">
                  Restablece tu contraseña
                </h1>

                <!-- Message -->
                <p style="margin:0 0 14px;font-size:14px;line-height:1.65;color:#3f3f46;">
                  Hola,
                </p>
                <p style="margin:0 0 16px;font-size:14px;line-height:1.65;color:#3f3f46;">
                  Recibimos una solicitud para cambiar la contraseña de tu cuenta en <strong>${safeBrandName}</strong>.
                </p>
                <p style="margin:0 0 26px;font-size:14px;line-height:1.65;color:#3f3f46;">
                  Para definir una nueva contraseña y recuperar tu acceso de forma inmediata, haz clic en el botón de abajo. Por tu seguridad, este enlace es temporal y caducará en <strong>${expiresMinutes} minutos</strong>.
                </p>

                <!-- Action Button -->
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 28px;width:100%;">
                  <tr>
                    <td align="left">
                      <a href="${safeResetLink}" class="email-btn" style="display:inline-block;padding:14px 28px;background-color:#000000;color:#ffffff;font-size:13px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;text-decoration:none;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.12);">
                        Restablecer mi contraseña &rarr;
                      </a>
                    </td>
                  </tr>
                </table>

                <!-- Divider -->
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px;">
                  <tr>
                    <td style="border-top:1px solid #f4f4f5;height:1px;line-height:1px;font-size:1px;">&nbsp;</td>
                  </tr>
                </table>

                <!-- Fallback URL Section -->
                <p style="margin:0 0 8px;font-size:11px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:#71717a;">
                  ¿El botón no responde? Copia este enlace en tu navegador:
                </p>
                <div style="margin:0 0 22px;padding:12px 14px;background-color:#fafafa;border:1px solid #e4e4e7;border-radius:8px;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:11px;line-height:1.5;color:#18181b;word-break:break-all;">
                  ${safeResetLink}
                </div>

                <!-- Security Advisory Banner -->
                <div style="margin:0;padding:12px 16px;background-color:#fafafa;border-left:3px solid #000000;border-radius:0 8px 8px 0;">
                  <p style="margin:0;font-size:12px;line-height:1.6;color:#52525b;">
                    <strong>Nota de seguridad:</strong> Si tú no solicitaste este cambio, puedes desestimar este mensaje de inmediato. Tu contraseña y datos personales continúan totalmente seguros.
                  </p>
                </div>

              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td class="email-footer" style="padding:22px 32px 26px;background-color:#fafafa;border-top:1px solid #f4f4f5;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td>
                      <p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#71717a;">
                        ${safeBrandName} · TIENDA OFICIAL
                      </p>
                      ${safeSupportEmail ? `<p style="margin:0 0 10px;font-size:12px;line-height:1.5;color:#71717a;">Soporte oficial: <a href="mailto:${safeSupportEmail}" style="color:#000000;text-decoration:none;font-weight:600;">${safeSupportEmail}</a></p>` : ""}
                      <p style="margin:0;font-size:11px;line-height:1.5;color:#a1a1aa;">
                        &copy; ${currentYear} ${safeBrandName}. Todos los derechos reservados.<br />
                        Este es un correo transaccional generado automáticamente por seguridad.
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`.trim();

  if (provider === "smtp" || provider === "gmail" || provider === "gmail-smtp") {
    const hasSmtpConfig = Boolean(smtpUser && smtpPass && smtpHost && smtpFrom);
    if (!hasSmtpConfig) {
      if (String(process.env.NODE_ENV || "").toLowerCase() !== "production") {
        console.info(`[admin-password-reset-link] to=${to} link=${resetLink}`);
      }
      return { ok: false, skipped: true };
    }

    try {
      const nodemailerModule = await import("nodemailer");
      const nodemailer = nodemailerModule?.default || nodemailerModule;
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpSecure,
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
        connectionTimeout: RESET_EMAIL_TIMEOUT_MS,
        greetingTimeout: RESET_EMAIL_TIMEOUT_MS,
        socketTimeout: RESET_EMAIL_TIMEOUT_MS,
      });

      await transporter.sendMail({
        from: smtpFrom,
        to,
        subject,
        text,
        html,
      });
      return { ok: true, skipped: false };
    } catch (error) {
      console.warn(`[admin-password-reset-email-smtp] ${error?.message || "send-failed"}`);
      return { ok: false, skipped: false };
    }
  }

  if (provider === "brevo" || provider === "sendinblue") {
    const brevoApiKey = apiKey || bearer || process.env.PASSWORD_RESET_EMAIL_BEARER || process.env.RESEND_API_KEY || process.env.SMTP_PASS || "";
    if (!brevoApiKey) {
      if (String(process.env.NODE_ENV || "").toLowerCase() !== "production") {
        console.info('[password-reset-link] to=' + to + ' link=' + resetLink);
      }
      return { ok: false, skipped: true };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), RESET_EMAIL_TIMEOUT_MS);

    try {
      const response = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": brevoApiKey,
        },
        body: JSON.stringify({
          sender: { name: brandName, email: smtpFrom || from },
          to: [{ email: to }],
          subject,
          htmlContent: html,
          textContent: text,
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const details = await response.text().catch(() => "");
        throw new Error('brevo-api-' + response.status + (details ? ':' + details.slice(0, 200) : ''));
      }
      return { ok: true, skipped: false };
    } catch (error) {
      console.warn('[password-reset-email-brevo] ' + (error?.message || "send-failed"));
      return { ok: false, skipped: false };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  const resolvedEndpoint = endpoint || (provider === "resend" ? "https://api.resend.com/emails" : "");
  const canSendWithProvider = provider === "resend"
    ? Boolean(bearer && from)
    : Boolean(resolvedEndpoint);

  if (!canSendWithProvider) {
    if (String(process.env.NODE_ENV || "").toLowerCase() !== "production") {
      console.info(`[admin-password-reset-link] to=${to} link=${resetLink}`);
    }
    return { ok: false, skipped: true };
  }

  const headers = {
    "Content-Type": "application/json",
  };
  if (bearer) headers.Authorization = `Bearer ${bearer}`;
  if (apiKey) headers["X-API-Key"] = apiKey;

  const payload = provider === "resend"
    ? {
        from,
        to: [to],
        subject,
        html,
        text,
      }
    : {
        to,
        from,
        subject,
        text,
        html,
        resetLink,
        provider: "password-reset",
      };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), RESET_EMAIL_TIMEOUT_MS);

  try {
    const response = await fetch(resolvedEndpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!response.ok) {
      const details = await response.text().catch(() => "");
      throw new Error(`email-endpoint-${response.status}${details ? `:${details.slice(0, 200)}` : ""}`);
    }
    return { ok: true, skipped: false };
  } catch (error) {
    console.warn(`[admin-password-reset-email] ${error?.message || "send-failed"}`);
    return { ok: false, skipped: false };
  } finally {
    clearTimeout(timeoutId);
  }
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

  const action = normalizeLine(req.query?.action || "list").toLowerCase();
  const clientIp = getClientIp(req);
  const adminKey = buildRateLimitKey(adminSession?.sub || "admin");

  if (action === "list") {
    if (req.method !== "GET") {
      res.status(405).json({ ok: false, message: "Method not allowed" });
      return;
    }
    if (!await applyRateLimit(res, "admin-users-list-ip", buildRateLimitKey(clientIp, "unknown-ip"), 140, 10 * 60 * 1000, {
      endpoint: ENDPOINT_NAME,
      ip: clientIp,
    })) return;
    if (!await applyRateLimit(res, "admin-users-list-admin", adminKey, 200, 10 * 60 * 1000, {
      endpoint: ENDPOINT_NAME,
      ip: clientIp,
    })) return;
    const store = await readStore();
    const users = sortUsersByRecent(
      (Array.isArray(store.users) ? store.users : []).map(sanitizeAdminUser),
    );
    res.status(200).json({
      ok: true,
      users,
    });
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ ok: false, message: "Method not allowed" });
    return;
  }

  if (!await applyRateLimit(res, "admin-users-mutate-ip", buildRateLimitKey(clientIp, "unknown-ip"), 120, 10 * 60 * 1000, {
    endpoint: ENDPOINT_NAME,
    ip: clientIp,
  })) return;

  if (!requireCsrf(req, res, { endpoint: ENDPOINT_NAME })) return;

  const body = requireJsonBody(req, res, { endpoint: ENDPOINT_NAME });
  if (!body) return;

  if (action === "update") {
    const userId = String(body.userId || "").trim().slice(0, IDENTIFIER_MAX_LENGTH);
    const name = normalizeLine(body.name || "").slice(0, NAME_MAX_LENGTH);
    const lastName = normalizeLine(body.lastName || "").slice(0, NAME_MAX_LENGTH);
    const email = normalizeEmail(body.email || "").slice(0, IDENTIFIER_MAX_LENGTH);
    const username = normalizeUsername(body.username || email.split("@")[0] || "");
    const phone = normalizeUserPhone(body.phone || "");
    const shippingAddress = sanitizeParagraph(body.shippingAddress || "").slice(0, SHIPPING_ADDRESS_MAX_LENGTH);

    if (!userId) {
      res.status(400).json({ ok: false, message: "userId es requerido" });
      return;
    }
    if (!await applyRateLimit(res, "admin-users-update-ip", buildRateLimitKey(clientIp, "unknown-ip"), 80, 10 * 60 * 1000, {
      endpoint: ENDPOINT_NAME,
      ip: clientIp,
    })) return;
    if (!await applyRateLimit(res, "admin-users-update-user", buildRateLimitKey(userId), 40, 10 * 60 * 1000, {
      endpoint: ENDPOINT_NAME,
      ip: clientIp,
    })) return;
    if (!await applyRateLimit(res, "admin-users-update-admin", adminKey, 120, 10 * 60 * 1000, {
      endpoint: ENDPOINT_NAME,
      ip: clientIp,
    })) return;
    if (!name || name.length < 2 || !isValidEmail(email) || username.length < USERNAME_MIN_LENGTH) {
      res.status(400).json({ ok: false, message: "Datos de usuario invalidos" });
      return;
    }
    if (phone && phone.length !== USER_PHONE_LENGTH) {
      res.status(400).json({ ok: false, message: "Telefono invalido" });
      return;
    }

    let found = false;
    let duplicated = false;
    let updatedUser = null;
    let nextUsersSnapshot = [];

    await updateStore((draft) => {
      const users = Array.isArray(draft.users) ? draft.users : [];
      found = users.some((entry) => String(entry.id) === userId);
      if (!found) return draft;

      duplicated = users.some((entry) => (
        String(entry.id) !== userId
        && (
          normalizeEmail(entry.email || "") === email
          || normalizeUsername(entry.username || normalizeEmail(entry.email || "").split("@")[0] || "") === username
        )
      ));
      if (duplicated) return draft;

      const nowIso = new Date().toISOString();
      draft.users = users.map((entry) => {
        if (String(entry.id) !== userId) return entry;
        updatedUser = {
          ...entry,
          name,
          lastName,
          email,
          username,
          phone,
          shippingAddress,
          stateUpdatedAt: nowIso,
          stateVersion: Math.max(0, Number(entry.stateVersion) || 0) + 1,
          updatedAt: nowIso,
        };
        return updatedUser;
      });
      bumpRealtimeMeta(draft, ["users", "user-state"]);
      nextUsersSnapshot = draft.users.map(sanitizeAdminUser);
      return draft;
    });

    if (!found) {
      res.status(404).json({ ok: false, message: "Usuario no encontrado" });
      return;
    }
    if (duplicated) {
      res.status(409).json({ ok: false, message: "Correo o usuario ya en uso" });
      return;
    }

    res.status(200).json({
      ok: true,
      user: sanitizeAdminUser(updatedUser),
      users: sortUsersByRecent(nextUsersSnapshot),
    });
    return;
  }

  if (action === "delete") {
    const userId = String(body.userId || "").trim().slice(0, IDENTIFIER_MAX_LENGTH);
    if (!userId) {
      res.status(400).json({ ok: false, message: "userId es requerido" });
      return;
    }
    if (!await applyRateLimit(res, "admin-users-delete-ip", buildRateLimitKey(clientIp, "unknown-ip"), 50, 10 * 60 * 1000, {
      endpoint: ENDPOINT_NAME,
      ip: clientIp,
    })) return;
    if (!await applyRateLimit(res, "admin-users-delete-user", buildRateLimitKey(userId), 24, 10 * 60 * 1000, {
      endpoint: ENDPOINT_NAME,
      ip: clientIp,
    })) return;
    if (!await applyRateLimit(res, "admin-users-delete-admin", adminKey, 80, 10 * 60 * 1000, {
      endpoint: ENDPOINT_NAME,
      ip: clientIp,
    })) return;

    let found = false;
    let nextUsersSnapshot = [];

    await updateStore((draft) => {
      const users = Array.isArray(draft.users) ? draft.users : [];
      found = users.some((entry) => String(entry.id) === userId);
      if (!found) return draft;
      draft.users = users.filter((entry) => String(entry.id) !== userId);
      bumpRealtimeMeta(draft, ["users", "user-state"]);
      nextUsersSnapshot = draft.users.map(sanitizeAdminUser);
      return draft;
    });

    if (!found) {
      res.status(404).json({ ok: false, message: "Usuario no encontrado" });
      return;
    }

    res.status(200).json({
      ok: true,
      removedUserId: userId,
      users: sortUsersByRecent(nextUsersSnapshot),
    });
    return;
  }

  if (action === "generate-reset-link" || action === "send-reset-link") {
    const sessionSecret = String(process.env.USER_SESSION_SECRET || "").trim();
    if (!sessionSecret) {
      res.status(500).json({ ok: false, message: "User auth no configurado" });
      return;
    }

    const userId = String(body.userId || "").trim().slice(0, IDENTIFIER_MAX_LENGTH);
    const requestedEmail = normalizeEmail(body.email || "").slice(0, IDENTIFIER_MAX_LENGTH);
    if (!userId && !requestedEmail) {
      res.status(400).json({ ok: false, message: "userId o email es requerido" });
      return;
    }
    if (requestedEmail && !isValidEmail(requestedEmail)) {
      res.status(400).json({ ok: false, message: "El correo no es valido" });
      return;
    }
    const targetRateKey = buildRateLimitKey(userId || requestedEmail, "unknown-user");
    if (!await applyRateLimit(res, "admin-users-reset-ip", buildRateLimitKey(clientIp, "unknown-ip"), 30, 10 * 60 * 1000, {
      endpoint: ENDPOINT_NAME,
      ip: clientIp,
    })) return;
    if (!await applyRateLimit(res, "admin-users-reset-target", targetRateKey, 10, 10 * 60 * 1000, {
      endpoint: ENDPOINT_NAME,
      ip: clientIp,
    })) return;
    if (!await applyRateLimit(res, "admin-users-reset-admin", adminKey, 60, 10 * 60 * 1000, {
      endpoint: ENDPOINT_NAME,
      ip: clientIp,
    })) return;

    const token = createPasswordResetToken();
    const tokenHash = hashPasswordResetToken(token, sessionSecret);
    const expiresAt = Date.now() + RESET_TOKEN_TTL_MS;
    const requestedAt = new Date().toISOString();

    let targetUser = null;
    let resetLink = "";

    await updateStore((draft) => {
      const users = Array.isArray(draft.users) ? draft.users : [];
      draft.users = users.map((entry) => {
        if (targetUser?.id) return entry;
        const matchesId = userId && String(entry.id) === userId;
        const matchesEmail = requestedEmail && normalizeEmail(entry.email || "") === requestedEmail;
        if (!matchesId && !matchesEmail) return entry;

        const nextEmail = normalizeEmail(entry.email || "");
        if (!isValidEmail(nextEmail)) return entry;

        resetLink = buildPasswordResetLink(req, nextEmail, token);
        targetUser = sanitizeAdminUser({
          ...entry,
          passwordResetTokenHash: tokenHash,
          passwordResetExpiresAt: expiresAt,
          passwordResetRequestedAt: requestedAt,
          stateUpdatedAt: requestedAt,
          stateVersion: Math.max(0, Number(entry.stateVersion) || 0) + 1,
          updatedAt: requestedAt,
        });
        return {
          ...entry,
          passwordResetTokenHash: tokenHash,
          passwordResetExpiresAt: expiresAt,
          passwordResetRequestedAt: requestedAt,
          stateUpdatedAt: requestedAt,
          stateVersion: Math.max(0, Number(entry.stateVersion) || 0) + 1,
          updatedAt: requestedAt,
        };
      });
      if (targetUser?.id) {
        bumpRealtimeMeta(draft, ["users", "user-state"]);
      }
      return draft;
    });

    if (!targetUser || !targetUser.id) {
      res.status(404).json({ ok: false, message: "Usuario no encontrado o sin correo valido" });
      return;
    }

    if (!resetLink) {
      res.status(500).json({ ok: false, message: "No pudimos generar el enlace de recuperacion" });
      return;
    }

    if (action === "generate-reset-link") {
      res.status(200).json({
        ok: true,
        user: targetUser,
        resetLink,
      });
      return;
    }

    const delivery = await deliverPasswordResetEmail({
      to: targetUser.email,
      resetLink,
    });
    console.info(
      `[admin-password-reset] email=${maskEmailForLog(targetUser.email)} sent=${Boolean(delivery.ok)} skipped=${Boolean(delivery.skipped)}`,
    );

    if (!delivery.ok && !delivery.skipped) {
      res.status(502).json({ ok: false, message: "No pudimos enviar el correo de recuperacion en este momento" });
      return;
    }

    res.status(200).json({
      ok: true,
      user: targetUser,
      sent: Boolean(delivery.ok),
      skipped: Boolean(delivery.skipped),
      ...(String(process.env.NODE_ENV || "").toLowerCase() === "test" ? { resetLink } : {}),
    });
    return;
  }

  res.status(400).json({ ok: false, message: "Accion no valida" });
}
