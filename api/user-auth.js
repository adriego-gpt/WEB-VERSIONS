
import crypto from "node:crypto";
import { Buffer } from "node:buffer";
import { bumpRealtimeMeta, readStore, updateStore } from "./_lib/store.js";
import {
  buildClearSessionCookie,
  buildSessionCookie,
  consumeRateLimit,
  createPasswordRecord,
  ensureCsrfCookie,
  getAllowedOrigins,
  getClientIp,
  hasStrongPassword,
  isOriginAllowed,
  isValidEmail,
  monitorApiRequest,
  normalizeEmail,
  normalizeLine,
  normalizePhone,
  parseCookies,
  requireJsonBody,
  requireCsrf,
  sanitizeParagraph,
  setCommonSecurityHeaders,
  signPayload,
  verifyPassword,
  verifySignedToken,
} from "./_lib/security.js";

const COOKIE_NAME = "adriego_user_session";
const SESSION_HOURS = Math.max(1, Number(process.env.USER_SESSION_HOURS) || 72);
const SESSION_TTL_MS = SESSION_HOURS * 60 * 60 * 1000;
const PASSWORD_MIN_LENGTH = 8;
const ENDPOINT_NAME = "user-auth";
const USERNAME_MIN_LENGTH = 3;
const USERNAME_MAX_LENGTH = 40;
const NAME_MAX_LENGTH = 90;
const IDENTIFIER_MAX_LENGTH = 120;
const USER_PHONE_LENGTH = 10;
const USER_ADDRESS_BOOK_MAX_ITEMS = 8;
const USER_ADDRESS_LABEL_MAX_LENGTH = 48;
const USER_ADDRESS_MAX_LENGTH = 320;
const USER_ADDRESS_CITY_MAX_LENGTH = 80;
const USER_ADDRESS_REFERENCE_MAX_LENGTH = 260;
const USER_CART_MAX_ITEMS = 60;
const USER_FAVORITES_MAX_ITEMS = 140;
const USER_STATE_VERSION_MIN = 0;
const RESET_TOKEN_BYTES = 32;
const RESET_TOKEN_TTL_MS = Math.max(10 * 60 * 1000, (Number(process.env.USER_PASSWORD_RESET_TTL_MINUTES) || 30) * 60 * 1000);
const RESET_EMAIL_TIMEOUT_MS = Math.max(3000, Number(process.env.PASSWORD_RESET_EMAIL_TIMEOUT_MS) || 10000);

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

function resolvePreferredUsername(rawUsername = "", email = "") {
  const candidate = normalizeUsername(rawUsername);
  if (candidate) return candidate;
  return normalizeUsername(normalizeEmail(email).split("@")[0] || "");
}

function sanitizeAddressBookEntry(rawEntry = {}, fallbackId = "") {
  const address = sanitizeParagraph(rawEntry?.address || "").slice(0, USER_ADDRESS_MAX_LENGTH);
  if (!address) return null;
  const normalizedPhone = normalizeUserPhone(rawEntry?.phone || "");
  return {
    id: normalizeLine(rawEntry?.id || fallbackId || crypto.randomUUID()).slice(0, 80),
    label: normalizeLine(rawEntry?.label || "Direccion guardada").slice(0, USER_ADDRESS_LABEL_MAX_LENGTH),
    fullName: normalizeLine(rawEntry?.fullName || rawEntry?.recipientName || "").slice(0, 80),
    idNumber: normalizeLine(rawEntry?.idNumber || "").slice(0, 30),
    address,
    city: normalizeLine(rawEntry?.city || "").slice(0, USER_ADDRESS_CITY_MAX_LENGTH),
    reference: sanitizeParagraph(rawEntry?.reference || "").slice(0, USER_ADDRESS_REFERENCE_MAX_LENGTH),
    phone: normalizedPhone,
    isDefault: Boolean(rawEntry?.isDefault),
    updatedAt: normalizeLine(rawEntry?.updatedAt || new Date().toISOString()).slice(0, 60),
  };
}

function normalizeAddressBook(rawAddressBook = []) {
  const source = Array.isArray(rawAddressBook) ? rawAddressBook : [];
  const normalizedEntries = source
    .slice(0, USER_ADDRESS_BOOK_MAX_ITEMS)
    .map((entry, index) => sanitizeAddressBookEntry(entry, `addr-${index + 1}`))
    .filter(Boolean);
  if (!normalizedEntries.length) return [];
  const explicitDefaultIndex = normalizedEntries.findIndex((entry) => entry.isDefault);
  return normalizedEntries.map((entry, index) => ({
    ...entry,
    isDefault: explicitDefaultIndex >= 0 ? explicitDefaultIndex === index : index === 0,
  }));
}

function normalizeFavoriteIds(rawFavorites = []) {
  const source = Array.isArray(rawFavorites) ? rawFavorites : [];
  const unique = new Set();
  const normalized = [];
  source.forEach((entry) => {
    const id = normalizeLine(entry || "").slice(0, 120);
    if (!id || unique.has(id)) return;
    unique.add(id);
    normalized.push(id);
  });
  return normalized.slice(0, USER_FAVORITES_MAX_ITEMS);
}

function sanitizeCartEntry(rawEntry = {}, fallbackId = "") {
  const productId = normalizeLine(rawEntry?.id || fallbackId || "").slice(0, 120);
  const color = normalizeLine(rawEntry?.color || "").slice(0, 80);
  const size = normalizeLine(rawEntry?.size || "").slice(0, 40);
  if (!productId || !color || !size) return null;
  const quantity = Math.max(1, Math.min(10, Math.floor(Number(rawEntry?.quantity) || 1)));
  const key = normalizeLine(rawEntry?.key || `${productId}-${color}-${size}`).slice(0, 220) || `${productId}-${color}-${size}`;
  return {
    key,
    id: productId,
    color,
    size,
    quantity,
  };
}

function normalizeUserCartState(rawCart = []) {
  const source = Array.isArray(rawCart) ? rawCart : [];
  const normalizedEntries = source
    .slice(0, USER_CART_MAX_ITEMS)
    .map((entry, index) => sanitizeCartEntry(entry, `line-${index + 1}`))
    .filter(Boolean);
  if (!normalizedEntries.length) return [];

  const mergedByKey = new Map();
  normalizedEntries.forEach((entry) => {
    const previous = mergedByKey.get(entry.key);
    if (!previous) {
      mergedByKey.set(entry.key, { ...entry });
      return;
    }
    mergedByKey.set(entry.key, {
      ...previous,
      quantity: Math.max(1, Math.min(10, Number(previous.quantity || 0) + Number(entry.quantity || 0))),
    });
  });
  return [...mergedByKey.values()].slice(0, USER_CART_MAX_ITEMS);
}

function normalizeUserStateVersion(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return USER_STATE_VERSION_MIN;
  return Math.max(USER_STATE_VERSION_MIN, Math.floor(numeric));
}

function normalizeSessionVersion(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 1) return 1;
  return Math.floor(numeric);
}

function resolveUserForLogin(users = [], identifier = "", password = "") {
  const normalizedIdentifier = normalizeLine(identifier).toLowerCase().slice(0, IDENTIFIER_MAX_LENGTH);
  if (!normalizedIdentifier) return null;

  const emailMatch = users.find((entry) => normalizeEmail(entry.email) === normalizedIdentifier);
  if (emailMatch) return emailMatch;

  const usernameIdentifier = normalizeUsername(normalizedIdentifier);
  if (!usernameIdentifier) return null;

  const usernameCandidates = users.filter((entry) => (
    normalizeUsername(entry.username || normalizeEmail(entry.email || "").split("@")[0] || "") === usernameIdentifier
  ));
  if (usernameCandidates.length <= 1) {
    return usernameCandidates[0] || null;
  }
  return usernameCandidates.find((entry) => verifyPassword(password, entry)) || null;
}

function buildSession(user, secret) {
  const now = Date.now();
  const payload = {
    sub: String(user.id),
    email: normalizeEmail(user.email),
    sessionVersion: normalizeSessionVersion(user.sessionVersion),
    iat: now,
    exp: now + SESSION_TTL_MS,
  };
  return {
    token: signPayload(payload, secret),
    payload,
  };
}

function stripUserSensitiveData(user) {
  if (!user) return null;
  return {
    id: String(user.id || normalizeEmail(user.email || "")),
    name: normalizeLine(user.name || ""),
    lastName: normalizeLine(user.lastName || ""),
    email: normalizeEmail(user.email || ""),
    username: normalizeUsername(user.username || normalizeEmail(user.email || "").split("@")[0] || ""),
    idNumber: normalizeLine(user.idNumber || "").slice(0, 30),
    phone: normalizeUserPhone(user.phone || ""),
    shippingAddress: sanitizeParagraph(user.shippingAddress || ""),
    addressBook: normalizeAddressBook(user.addressBook),
    cart: normalizeUserCartState(user.cartState),
    favorites: normalizeFavoriteIds(user.favorites),
    stateUpdatedAt: normalizeLine(user.stateUpdatedAt || user.updatedAt || "").slice(0, 60),
    stateVersion: normalizeUserStateVersion(user.stateVersion),
  };
}

async function resolveSessionUser(req, sessionSecret) {
  const cookies = parseCookies(req.headers?.cookie || "");
  const session = verifySignedToken(cookies[COOKIE_NAME] || cookies.atelier_user_session || "", sessionSecret);
  if (!session) return null;
  const store = await readStore();
  const user = (store.users || []).find((entry) => String(entry.id) === String(session.sub)) || null;
  if (!user) return null;
  if (normalizeSessionVersion(session.sessionVersion) !== normalizeSessionVersion(user.sessionVersion)) {
    return null;
  }
  return user;
}

function rejectUnauthorized(res) {
  res.status(401).json({ ok: false, message: "No autorizado" });
}

async function applyRateLimit(res, namespace, key, limit, windowMs, endpoint = "") {
  const result = await consumeRateLimit(namespace, key, limit, windowMs, {
    endpoint,
  });
  if (result.ok) return true;
  res.setHeader("Retry-After", String(Math.ceil(result.retryAfterMs / 1000)));
  res.status(429).json({ ok: false, message: "Too many requests" });
  return false;
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

function timingSafeEqualText(left = "", right = "") {
  const leftBuffer = Buffer.from(String(left || ""));
  const rightBuffer = Buffer.from(String(right || ""));
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
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
        console.info(`[password-reset-link] to=${to} link=${resetLink}`);
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
      console.warn(`[password-reset-email-smtp] ${error?.message || "send-failed"}`);
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
      console.info(`[password-reset-link] to=${to} link=${resetLink}`);
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
    console.warn(`[password-reset-email] ${error?.message || "send-failed"}`);
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

  const allowedOrigins = getAllowedOrigins(process.env.USER_ALLOWED_ORIGIN);
  if (!isOriginAllowed(req, allowedOrigins)) {
    res.status(403).json({ ok: false, message: "Origen no permitido" });
    return;
  }

  const sessionSecret = String(process.env.USER_SESSION_SECRET || "").trim();
  if (!sessionSecret) {
    res.status(500).json({ ok: false, message: "User auth no configurado" });
    return;
  }

  const action = normalizeLine(req.query?.action || "status").toLowerCase();

  if (action === "status") {
    const user = await resolveSessionUser(req, sessionSecret);
    res.status(200).json({
      ok: true,
      authenticated: Boolean(user),
      user: stripUserSensitiveData(user),
    });
    return;
  }

  if (action === "logout") {
    if (req.method !== "POST") {
      res.status(405).json({ ok: false, message: "Method not allowed" });
      return;
    }
    if (!requireCsrf(req, res, { endpoint: ENDPOINT_NAME })) return;
    res.setHeader("Set-Cookie", buildClearSessionCookie(COOKIE_NAME));
    res.status(200).json({ ok: true, authenticated: false });
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ ok: false, message: "Method not allowed" });
    return;
  }

  if (!requireCsrf(req, res, { endpoint: ENDPOINT_NAME })) return;

  const body = requireJsonBody(req, res, { endpoint: ENDPOINT_NAME });
  if (!body) return;
  const clientIp = getClientIp(req);

  if (action === "register") {
    const name = normalizeLine(body.name || "").slice(0, NAME_MAX_LENGTH);
    const email = normalizeEmail(body.email || "");
    const username = resolvePreferredUsername(body.username || "", email);
    const password = String(body.password || "").trim();
    const confirmPassword = String(body.confirmPassword || "").trim();
    const phone = normalizeUserPhone(body.phone || "");

    if (!await applyRateLimit(res, "user-register-ip", clientIp, 8, 20 * 60 * 1000, ENDPOINT_NAME)) return;
    if (email && !await applyRateLimit(res, "user-register-email", email, 4, 20 * 60 * 1000, ENDPOINT_NAME)) return;

    if (
      !name
      || name.length < 2
      || !isValidEmail(email)
      || username.length < USERNAME_MIN_LENGTH
      || !hasStrongPassword(password, PASSWORD_MIN_LENGTH)
      || (confirmPassword && confirmPassword !== password)
      || (phone && phone.length !== USER_PHONE_LENGTH)
    ) {
      res.status(400).json({ ok: false, message: "Datos invalidos" });
      return;
    }

    let createdUser = null;
    await updateStore((draft) => {
      const users = Array.isArray(draft.users) ? draft.users : [];
      const duplicated = users.some((entry) => (
        normalizeEmail(entry.email) === email
        || normalizeUsername(entry.username || normalizeEmail(entry.email || "").split("@")[0] || "") === username
      ));
      if (duplicated) {
        createdUser = null;
        return draft;
      }

      const passwordRecord = createPasswordRecord(password);
      const nowIso = new Date().toISOString();
      createdUser = {
        id: crypto.randomUUID(),
        name,
        lastName: "",
        email,
        username,
        phone,
        shippingAddress: "",
        addressBook: [],
        cartState: [],
        favorites: [],
        stateUpdatedAt: nowIso,
        stateVersion: 1,
        sessionVersion: 1,
        passwordResetTokenHash: "",
        passwordResetExpiresAt: 0,
        passwordResetRequestedAt: "",
        ...passwordRecord,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      draft.users = [createdUser, ...users];
      bumpRealtimeMeta(draft, ["users", "user-state"]);
      return draft;
    });

    if (!createdUser) {
      res.status(409).json({ ok: false, message: "Ya existe una cuenta con ese correo o usuario" });
      return;
    }

    const session = buildSession(createdUser, sessionSecret);
    res.setHeader("Set-Cookie", buildSessionCookie(COOKIE_NAME, session.token, SESSION_TTL_MS / 1000));
    res.status(200).json({ ok: true, user: stripUserSensitiveData(createdUser) });
    return;
  }

  if (action === "login") {
    const identifier = normalizeLine(body.identifier || "").slice(0, IDENTIFIER_MAX_LENGTH).toLowerCase();
    const password = String(body.password || "").trim();

    if (!await applyRateLimit(res, "user-login-ip", clientIp, 16, 10 * 60 * 1000, ENDPOINT_NAME)) return;
    if (identifier && !await applyRateLimit(res, "user-login-identifier", identifier, 10, 10 * 60 * 1000, ENDPOINT_NAME)) return;

    if (!identifier || !password) {
      res.status(400).json({ ok: false, message: "Credenciales incompletas" });
      return;
    }

    const store = await readStore();
    const users = Array.isArray(store.users) ? store.users : [];
    const user = resolveUserForLogin(users, identifier, password);

    if (!user || !verifyPassword(password, user)) {
      res.status(401).json({ ok: false, message: "Correo, usuario o contrasena incorrectos" });
      return;
    }

    let activeUser = user;
    if (String(user.passwordAlgorithm || "").toLowerCase() !== "scrypt") {
      const upgradedRecord = createPasswordRecord(password);
      await updateStore((draft) => {
        draft.users = (draft.users || []).map((entry) => {
          if (String(entry.id) !== String(user.id)) return entry;
          activeUser = {
            ...entry,
            ...upgradedRecord,
            updatedAt: new Date().toISOString(),
          };
          return activeUser;
        });
        bumpRealtimeMeta(draft, ["users"]);
        return draft;
      });
    }

    const session = buildSession(activeUser, sessionSecret);
    res.setHeader("Set-Cookie", buildSessionCookie(COOKIE_NAME, session.token, SESSION_TTL_MS / 1000));
    res.status(200).json({ ok: true, user: stripUserSensitiveData(activeUser) });
    return;
  }

  if (action === "request-password-reset") {
    const email = normalizeEmail(body.email || "");

    if (!await applyRateLimit(res, "user-reset-request-ip", clientIp, 8, 20 * 60 * 1000, ENDPOINT_NAME)) return;
    if (email && !await applyRateLimit(res, "user-reset-request-email", email, 4, 20 * 60 * 1000, ENDPOINT_NAME)) return;

    let issuedToken = "";
    let resetLink = "";
    let matchedUser = false;
    let emailDelivery = { ok: false, skipped: true };

    if (isValidEmail(email)) {
      const rawToken = createPasswordResetToken();
      const tokenHash = hashPasswordResetToken(rawToken, sessionSecret);
      const expiresAt = Date.now() + RESET_TOKEN_TTL_MS;
      const requestedAt = new Date().toISOString();

      await updateStore((draft) => {
        const users = Array.isArray(draft.users) ? draft.users : [];
        draft.users = users.map((entry) => {
          if (normalizeEmail(entry.email || "") !== email) return entry;
          matchedUser = true;
          issuedToken = rawToken;
          return {
            ...entry,
            passwordResetTokenHash: tokenHash,
            passwordResetExpiresAt: expiresAt,
            passwordResetRequestedAt: requestedAt,
            updatedAt: requestedAt,
          };
        });
        return draft;
      });

      if (matchedUser && issuedToken) {
        resetLink = buildPasswordResetLink(req, email, issuedToken);
        if (resetLink) {
          emailDelivery = await deliverPasswordResetEmail({
            to: email,
            resetLink,
          });
        }
      }
    }

    const payload = {
      ok: true,
      message: "Si existe una cuenta con ese correo, enviaremos un enlace de recuperacion.",
    };

    if (String(process.env.NODE_ENV || "").toLowerCase() === "test" && matchedUser) {
      payload.resetToken = issuedToken;
      payload.resetLink = resetLink;
    }

    if (isValidEmail(email)) {
      console.info(
        `[password-reset-request] email=${maskEmailForLog(email)} matchedUser=${matchedUser} sent=${Boolean(emailDelivery.ok)} skipped=${Boolean(emailDelivery.skipped)}`,
      );
    }

    res.status(200).json(payload);
    return;
  }

  if (action === "confirm-password-reset") {
    const email = normalizeEmail(body.email || "");
    const token = String(body.token || body.resetToken || "").trim();
    const newPassword = String(body.newPassword || body.password || "").trim();
    const confirmPassword = String(body.confirmPassword || "").trim();

    if (!await applyRateLimit(res, "user-reset-confirm-ip", clientIp, 10, 20 * 60 * 1000, ENDPOINT_NAME)) return;
    if (email && !await applyRateLimit(res, "user-reset-confirm-email", email, 6, 20 * 60 * 1000, ENDPOINT_NAME)) return;

    if (!isValidEmail(email) || !token || !newPassword || !confirmPassword) {
      res.status(400).json({ ok: false, message: "Datos invalidos" });
      return;
    }

    if (!hasStrongPassword(newPassword, PASSWORD_MIN_LENGTH) || newPassword !== confirmPassword) {
      res.status(400).json({ ok: false, message: "La nueva contrasena no cumple los requisitos" });
      return;
    }

    const store = await readStore();
    const users = Array.isArray(store.users) ? store.users : [];
    const user = users.find((entry) => normalizeEmail(entry.email || "") === email);

    const hashedToken = hashPasswordResetToken(token, sessionSecret);
    const storedHash = String(user?.passwordResetTokenHash || "");
    const expiresAt = Number(user?.passwordResetExpiresAt || 0);
    const validToken = Boolean(
      user
      && storedHash
      && expiresAt > Date.now()
      && timingSafeEqualText(storedHash, hashedToken),
    );

    if (!validToken) {
      res.status(400).json({ ok: false, message: "Token invalido o vencido" });
      return;
    }

    const passwordRecord = createPasswordRecord(newPassword);
    let updatedUser = null;
    await updateStore((draft) => {
      draft.users = (draft.users || []).map((entry) => {
        if (String(entry.id) !== String(user.id)) return entry;
        updatedUser = {
              ...entry,
              ...passwordRecord,
              sessionVersion: normalizeSessionVersion(entry.sessionVersion) + 1,
              passwordResetTokenHash: "",
              passwordResetExpiresAt: 0,
              passwordResetRequestedAt: "",
              updatedAt: new Date().toISOString(),
            };
        return updatedUser;
      });
      bumpRealtimeMeta(draft, ["users"]);
      return draft;
    });

    res.setHeader("Set-Cookie", buildClearSessionCookie(COOKIE_NAME));
    res.status(200).json({ ok: true, message: "Contrasena actualizada" });
    return;
  }

  if (action === "update-profile") {
    const sessionUser = await resolveSessionUser(req, sessionSecret);
    if (!sessionUser) {
      rejectUnauthorized(res);
      return;
    }
    if (!await applyRateLimit(res, "user-profile-ip", clientIp, 24, 10 * 60 * 1000, ENDPOINT_NAME)) return;
    if (!await applyRateLimit(res, "user-profile-user", String(sessionUser.id), 20, 10 * 60 * 1000, ENDPOINT_NAME)) return;

    const name = normalizeLine(body.name || "");
    const lastName = normalizeLine(body.lastName || "");
    const email = normalizeEmail(body.email || "");
    const idNumber = normalizeLine(body.idNumber || "").slice(0, 30);
    const phone = normalizeUserPhone(body.phone || "");
    const shippingAddress = sanitizeParagraph(body.shippingAddress || "");
    const hasAddressBookPayload = Array.isArray(body.addressBook);
    const addressBook = normalizeAddressBook(body.addressBook);

    if (!name || !isValidEmail(email) || (phone && phone.length !== USER_PHONE_LENGTH)) {
      res.status(400).json({ ok: false, message: "Datos invalidos" });
      return;
    }

    let updatedUser = null;
    await updateStore((draft) => {
      const duplicated = (draft.users || []).some((entry) => (
        String(entry.id) !== String(sessionUser.id) && normalizeEmail(entry.email) === email
      ));
      if (duplicated) {
        updatedUser = null;
        return draft;
      }

      const nowIso = new Date().toISOString();
      draft.users = (draft.users || []).map((entry) => {
        if (String(entry.id) !== String(sessionUser.id)) return entry;
        updatedUser = {
          ...entry,
          name,
          lastName,
          email,
          idNumber: idNumber || entry.idNumber || "",
          phone,
          shippingAddress,
          addressBook: hasAddressBookPayload ? addressBook : normalizeAddressBook(entry.addressBook),
          stateUpdatedAt: nowIso,
          stateVersion: normalizeUserStateVersion(entry.stateVersion) + 1,
          updatedAt: nowIso,
        };
        return updatedUser;
      });
      if (updatedUser) {
        bumpRealtimeMeta(draft, ["users", "user-state"]);
      }
      return draft;
    });

    if (!updatedUser) {
      res.status(409).json({ ok: false, message: "Ese correo ya esta en uso por otra cuenta" });
      return;
    }

    const session = buildSession(updatedUser, sessionSecret);
    res.setHeader("Set-Cookie", buildSessionCookie(COOKIE_NAME, session.token, SESSION_TTL_MS / 1000));
    res.status(200).json({ ok: true, user: stripUserSensitiveData(updatedUser) });
    return;
  }

  if (action === "sync-state") {
    const sessionUser = await resolveSessionUser(req, sessionSecret);
    if (!sessionUser) {
      rejectUnauthorized(res);
      return;
    }
    if (!await applyRateLimit(res, "user-state-ip", clientIp, 80, 10 * 60 * 1000, ENDPOINT_NAME)) return;
    if (!await applyRateLimit(res, "user-state-user", String(sessionUser.id), 120, 10 * 60 * 1000, ENDPOINT_NAME)) return;

    const hasCartPayload = Array.isArray(body.cart);
    const hasFavoritesPayload = Array.isArray(body.favorites);
    const requestedBaseStateVersion = normalizeUserStateVersion(body.baseStateVersion);
    if (!hasCartPayload && !hasFavoritesPayload) {
      res.status(400).json({ ok: false, message: "No recibimos cambios para sincronizar." });
      return;
    }

    const normalizedCart = hasCartPayload ? normalizeUserCartState(body.cart) : normalizeUserCartState(sessionUser.cartState);
    const normalizedFavorites = hasFavoritesPayload ? normalizeFavoriteIds(body.favorites) : normalizeFavoriteIds(sessionUser.favorites);

    let updatedUser = null;
    let mutatedState = false;
    await updateStore((draft) => {
      const nowIso = new Date().toISOString();
      draft.users = (draft.users || []).map((entry) => {
        if (String(entry.id) !== String(sessionUser.id)) return entry;
        const currentStateVersion = normalizeUserStateVersion(entry.stateVersion);
        const currentCartState = normalizeUserCartState(entry.cartState);
        const currentFavorites = normalizeFavoriteIds(entry.favorites);
        const isStaleClientWrite = requestedBaseStateVersion > 0 && currentStateVersion > requestedBaseStateVersion;

        let nextCartState = normalizedCart;
        let nextFavorites = normalizedFavorites;
        if (isStaleClientWrite) {
          const mergedCartMap = new Map(currentCartState.map((item) => [String(item.key || ""), item]));
          normalizedCart.forEach((item) => {
            const key = String(item.key || "");
            if (!key || mergedCartMap.has(key)) return;
            mergedCartMap.set(key, item);
          });
          nextCartState = [...mergedCartMap.values()].slice(0, USER_CART_MAX_ITEMS);
          nextFavorites = normalizeFavoriteIds([
            ...currentFavorites,
            ...normalizedFavorites,
          ]);
        }

        const currentStateSignature = JSON.stringify({
          cart: currentCartState,
          favorites: currentFavorites,
        });
        const nextStateSignature = JSON.stringify({
          cart: nextCartState,
          favorites: nextFavorites,
        });
        if (currentStateSignature === nextStateSignature) {
          updatedUser = entry;
          return entry;
        }
        mutatedState = true;
        updatedUser = {
          ...entry,
          cartState: nextCartState,
          favorites: nextFavorites,
          stateUpdatedAt: nowIso,
          stateVersion: currentStateVersion + 1,
          updatedAt: nowIso,
        };
        return updatedUser;
      });
      if (mutatedState) {
        bumpRealtimeMeta(draft, ["user-state"]);
      }
      return draft;
    });

    if (!updatedUser) {
      rejectUnauthorized(res);
      return;
    }

    res.status(200).json({ ok: true, user: stripUserSensitiveData(updatedUser) });
    return;
  }

  if (action === "change-password") {
    const sessionUser = await resolveSessionUser(req, sessionSecret);
    if (!sessionUser) {
      rejectUnauthorized(res);
      return;
    }
    if (!await applyRateLimit(res, "user-password-ip", clientIp, 12, 10 * 60 * 1000, ENDPOINT_NAME)) return;
    if (!await applyRateLimit(res, "user-password-user", String(sessionUser.id), 8, 10 * 60 * 1000, ENDPOINT_NAME)) return;

    const currentPassword = String(body.currentPassword || "").trim();
    const newPassword = String(body.newPassword || "").trim();
    const confirmPassword = String(body.confirmPassword || "").trim();

    if (!currentPassword || !newPassword || !confirmPassword) {
      res.status(400).json({ ok: false, message: "Completa todos los campos" });
      return;
    }
    if (!hasStrongPassword(newPassword, PASSWORD_MIN_LENGTH)) {
      res.status(400).json({ ok: false, message: "La nueva contrasena no cumple requisitos" });
      return;
    }
    if (newPassword !== confirmPassword) {
      res.status(400).json({ ok: false, message: "La confirmacion no coincide" });
      return;
    }
    if (!verifyPassword(currentPassword, sessionUser)) {
      res.status(401).json({ ok: false, message: "La contrasena actual no es correcta" });
      return;
    }

    const passwordRecord = createPasswordRecord(newPassword);
    let updatedUser = null;
    await updateStore((draft) => {
      draft.users = (draft.users || []).map((entry) => {
        if (String(entry.id) !== String(sessionUser.id)) return entry;
        updatedUser = {
              ...entry,
              ...passwordRecord,
              sessionVersion: normalizeSessionVersion(entry.sessionVersion) + 1,
              passwordResetTokenHash: "",
              passwordResetExpiresAt: 0,
              passwordResetRequestedAt: "",
              updatedAt: new Date().toISOString(),
            };
        return updatedUser;
      });
      bumpRealtimeMeta(draft, ["users"]);
      return draft;
    });

    if (!updatedUser) {
      rejectUnauthorized(res);
      return;
    }

    const nextSession = buildSession(updatedUser, sessionSecret);
    res.setHeader("Set-Cookie", buildSessionCookie(COOKIE_NAME, nextSession.token, SESSION_TTL_MS / 1000));
    res.status(200).json({ ok: true });
    return;
  }

  res.status(400).json({ ok: false, message: "Accion no valida" });
}
