import {
  consumeRateLimit,
  getClientIp,
  monitorApiRequest,
  requireJsonBody,
  setCommonSecurityHeaders,
} from "./_lib/security.js";
import { isAuthorizedAdminChatId } from "./_lib/notifications.js";

const DEFAULT_TELEGRAM_BOT_TOKEN = "8838650681:AAHQigrGo6TcX4VrFkGqtZ7P_HUlV6aOhJA";
const ENDPOINT_NAME = "telegram-webhook";

export default async function handler(req, res) {
  setCommonSecurityHeaders(res);
  const clientIp = getClientIp(req);

  const rateCheck = consumeRateLimit(`telegram-webhook:${clientIp}`, {
    limit: 60,
    windowMs: 60 * 1000,
  });

  if (!rateCheck.allowed) {
    res.status(429).json({ ok: false, message: "Demasiadas solicitudes." });
    return;
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ ok: false, message: "Método no permitido." });
    return;
  }

  const { ok, data: update } = requireJsonBody(req);
  if (!ok || !update) {
    res.status(400).json({ ok: false, message: "Cuerpo inválido." });
    return;
  }

  const message = update.message || update.edited_message || update.channel_post;
  if (!message || !message.chat) {
    res.status(200).json({ ok: true, skipped: true });
    return;
  }

  const senderChatId = String(message.chat.id).trim();
  const senderName = message.from?.first_name || message.chat.first_name || "Usuario";
  const token = process.env.TELEGRAM_BOT_TOKEN || DEFAULT_TELEGRAM_BOT_TOKEN;

  // 1. Strict Security Guard: Only the authorized Admin can interact with this bot
  if (!isAuthorizedAdminChatId(senderChatId)) {
    monitorApiRequest(ENDPOINT_NAME, {
      status: "unauthorized_telegram_access_blocked",
      senderChatId,
      senderUsername: message.from?.username || "unknown",
      ip: clientIp,
    });

    try {
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: senderChatId,
          text: "🔒 *Acceso Restringido*\n\nEste bot es de uso privado y exclusivo de administración para *Adriego Store*.",
          parse_mode: "Markdown",
        }),
      });
    } catch {
      // Ignore delivery errors to unauthorized users
    }

    res.status(200).json({ ok: true, authorized: false });
    return;
  }

  // 2. Authorized Admin Response
  const commandText = String(message.text || "").trim().toLowerCase();
  let replyText = "";

  if (commandText === "/start" || commandText === "hola" || commandText === "/menu") {
    replyText = `👑 *Panel Administrativo · Adriego Store*\n\n¡Hola ${senderName}! Tu sesión está autenticada y protegida con máxima seguridad.\n\nAquí recibirás las alertas instantáneas de cada pedido con desglose de prendas, datos del cliente y comprobante bancario.\n\n🔗 *Acceso Web Seguro:* [Abrir Panel Admin](https://adriego.vercel.app/admin)`;
  } else if (commandText === "/ayuda" || commandText === "/help") {
    replyText = "💡 *Comandos disponibles:*\n• `/start` - Verificar estado de conexión y seguridad\n• `/admin` - Abrir enlace al panel administrativo\n\n⚡ Las notificaciones de nuevos pedidos se enviarán aquí en tiempo real.";
  } else {
    replyText = `✅ *Comando recibido.*\n\nPuedes gestionar todos los pedidos y catálogo desde tu panel: https://adriego.vercel.app/admin`;
  }

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: senderChatId,
        text: replyText,
        parse_mode: "Markdown",
        disable_web_page_preview: true,
      }),
    });
  } catch (error) {
    console.error("[telegram-reply-error]", error?.message || error);
  }

  res.status(200).json({ ok: true, authorized: true });
}
