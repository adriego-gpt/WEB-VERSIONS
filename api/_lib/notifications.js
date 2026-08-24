import crypto from "node:crypto";

const DEFAULT_TELEGRAM_BOT_TOKEN = "8838650681:AAHQigrGo6TcX4VrFkGqtZ7P_HUlV6aOhJA";
const DEFAULT_TELEGRAM_CHAT_ID = "1037173906";
const DEFAULT_WEBHOOK_SECRET = "adriego_secure_n8n_secret_key_1969";

export const ALLOWED_ADMIN_CHAT_IDS = new Set([
  String(process.env.TELEGRAM_ADMIN_CHAT_ID || DEFAULT_TELEGRAM_CHAT_ID).trim(),
]);

export function isAuthorizedAdminChatId(chatId) {
  if (!chatId) return false;
  return ALLOWED_ADMIN_CHAT_IDS.has(String(chatId).trim());
}

export function escapeTelegramMarkdown(text = "") {
  return String(text || "")
    .replace(/[_*[\]()~>#+=|{}.!-]/g, "\\$&");
}

function currency(value) {
  return new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" }).format(Number(value) || 0);
}

export function formatTelegramOrderMessage(order = {}) {
  const isDelivery = order.deliveryType === "delivery";
  const items = Array.isArray(order.items) ? order.items : [];
  const bankName = escapeTelegramMarkdown(order.paymentBankAccount?.bankName || "");
  const customerName = escapeTelegramMarkdown(order.customerName || "Cliente");
  const customerPhone = escapeTelegramMarkdown(order.customerPhone || "No especificado");
  const customerEmail = escapeTelegramMarkdown(order.customerEmail || "");
  const deliveryCity = escapeTelegramMarkdown(order.deliveryCity || "");
  const deliveryAddress = escapeTelegramMarkdown(order.deliveryAddress || "");
  const deliveryReference = escapeTelegramMarkdown(order.deliveryReference || "");
  const pickupAddress = escapeTelegramMarkdown(order.pickupAddress || "");
  const pickupNote = escapeTelegramMarkdown(order.pickupNote || "");
  const paymentLabel = escapeTelegramMarkdown(
    order.paymentMethodLabel
    || (order.paymentMethod === "card_link" ? "Tarjeta mediante enlace de pago" : "Transferencia bancaria"),
  );

  const itemsList = items
    .map((item, idx) => {
      const name = escapeTelegramMarkdown(item.name || "Prenda");
      const color = escapeTelegramMarkdown(item.color || "N/A");
      const size = escapeTelegramMarkdown(item.size || "N/A");
      return `  ${idx + 1}. *${name}*\n     Color: ${color} | Talla: ${size} | Cant: ${item.quantity} ➔ ${currency(item.price * item.quantity)}`;
    })
    .join("\n\n");

  const lines = [
    "🛍️ *¡NUEVO PEDIDO RECIBIDO!*",
    "━━━━━━━━━━━━━━━━━━━━",
    `📦 *Código:* \`${order.code}\``,
    `👤 *Cliente:* ${customerName}`,
    `📞 *Teléfono:* \`${customerPhone}\``,
    customerEmail ? `📧 *Correo:* ${customerEmail}` : "",
    "",
    `📍 *Modalidad de Entrega:* ${isDelivery ? "🚚 Envío a Domicilio" : "🏬 Retiro en Local (El Tejar)"}`,
  ];

  if (isDelivery) {
    if (order.deliveryIdNumber) lines.push(`🪪 *Cédula/RUC:* \`${escapeTelegramMarkdown(order.deliveryIdNumber)}\``);
    if (deliveryCity) lines.push(`🏙️ *Ciudad:* ${deliveryCity}`);
    if (deliveryAddress) lines.push(`🏠 *Dirección:* ${deliveryAddress}`);
    if (deliveryReference) lines.push(`🧭 *Referencia:* ${deliveryReference}`);
  } else if (pickupAddress) {
    lines.push(`🏢 *Lugar:* ${pickupAddress}`);
    if (pickupNote) lines.push(`🧭 *Referencia Local:* ${pickupNote}`);
  }

  lines.push(
    "",
    `💳 *Forma de Pago:* ${paymentLabel}`,
    bankName ? `🏦 *Banco Seleccionado:* ${bankName}` : "",
    "",
    `👗 *Prendas del Pedido (${order.itemCount || items.length}):*`,
    itemsList || "  (Sin detalles de prendas)",
    "",
    `💰 *Subtotal:* ${currency(order.subtotal)}`,
  );

  if (Number(order.discountAmount || 0) > 0) {
    lines.push(`🎟️ *Descuento Aplicado:* -${currency(order.discountAmount)}${order.couponCode ? ` (Cupón: \`${escapeTelegramMarkdown(order.couponCode)}\`)` : ""}`);
  }
  if (Number(order.paymentFeeAmount || 0) > 0) {
    lines.push(`💳 *Comisión Tarjeta (${order.paymentFeePercent || 6}%):* +${currency(order.paymentFeeAmount)}`);
  }

  lines.push(
    `💵 *TOTAL A PAGAR:* *${currency(order.total || order.subtotal)}*`,
    "━━━━━━━━━━━━━━━━━━━━",
    order.paymentProof ? "📸 *Comprobante de pago:* Adjunto en el pedido" : "⏳ *Comprobante:* Pendiente",
    "🔒 *Canal Seguro:* Solo para el Administrador de Adriego Store",
    "⚡ [Abrir Panel de Administración](https://adriego.vercel.app/admin)",
  );

  return lines.filter((line) => line !== null && line !== undefined && line !== false).join("\n");
}

export async function sendTelegramNotification(order = {}, options = {}) {
  const token = options.token || process.env.TELEGRAM_BOT_TOKEN || DEFAULT_TELEGRAM_BOT_TOKEN;
  const chatId = options.chatId || process.env.TELEGRAM_ADMIN_CHAT_ID || DEFAULT_TELEGRAM_CHAT_ID;

  // Strict authorization check: Only allowed Admin Chat ID receives notifications
  if (!isAuthorizedAdminChatId(chatId)) {
    console.warn(`[security-alert] Unauthorized Telegram notification attempt blocked for Chat ID: ${chatId}`);
    return { ok: false, message: "Unauthorized recipient" };
  }

  if (!token) {
    return { ok: false, message: "Missing Telegram credentials" };
  }

  const messageText = formatTelegramOrderMessage(order);

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: messageText,
        parse_mode: "Markdown",
        disable_web_page_preview: true,
      }),
    });

    const result = await response.json();
    return { ok: Boolean(result?.ok), result };
  } catch (error) {
    console.error("[telegram-notification-error]", error?.message || error);
    return { ok: false, error: error?.message || "Telegram network error" };
  }
}

export async function sendN8nWebhook(order = {}) {
  const webhookUrl = process.env.N8N_ORDER_WEBHOOK_URL;
  if (!webhookUrl) return { ok: false, skipped: true };

  const secret = process.env.N8N_WEBHOOK_SECRET || DEFAULT_WEBHOOK_SECRET;
  const timestamp = new Date().toISOString();
  const payloadString = JSON.stringify({
    event: "order.created",
    timestamp,
    order,
  });

  const signature = crypto
    .createHmac("sha256", secret)
    .update(payloadString)
    .digest("hex");

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Adriego-Signature": `sha256=${signature}`,
        "X-Adriego-Timestamp": timestamp,
      },
      body: payloadString,
    });
    return { ok: response.ok, status: response.status };
  } catch (error) {
    console.error("[n8n-webhook-error]", error?.message || error);
    return { ok: false, error: error?.message || "Webhook delivery error" };
  }
}

export async function dispatchOrderNotifications(order = {}) {
  const telegramPromise = sendTelegramNotification(order);
  const n8nPromise = sendN8nWebhook(order);
  const [telegramResult, n8nResult] = await Promise.allSettled([telegramPromise, n8nPromise]);
  return {
    telegram: telegramResult.status === "fulfilled" ? telegramResult.value : { ok: false, error: telegramResult.reason },
    n8n: n8nResult.status === "fulfilled" ? n8nResult.value : { ok: false, error: n8nResult.reason },
  };
}
