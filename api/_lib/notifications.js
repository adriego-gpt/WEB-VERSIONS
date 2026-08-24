const DEFAULT_TELEGRAM_BOT_TOKEN = "8838650681:AAHQigrGo6TcX4VrFkGqtZ7P_HUlV6aOhJA";
const DEFAULT_TELEGRAM_CHAT_ID = "1037173906";

function currency(value) {
  return new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" }).format(Number(value) || 0);
}

export function formatTelegramOrderMessage(order = {}) {
  const isDelivery = order.deliveryType === "delivery";
  const items = Array.isArray(order.items) ? order.items : [];
  const bankName = order.paymentBankAccount?.bankName || "";
  const paymentLabel = order.paymentMethodLabel
    || (order.paymentMethod === "card_link" ? "Tarjeta mediante enlace de pago" : "Transferencia bancaria");

  const itemsList = items
    .map((item, idx) => `  ${idx + 1}. *${item.name || "Prenda"}*\n     Color: ${item.color || "N/A"} | Talla: ${item.size || "N/A"} | Cant: ${item.quantity} ➔ ${currency(item.price * item.quantity)}`)
    .join("\n\n");

  const lines = [
    "🛍️ *¡NUEVO PEDIDO RECIBIDO!*",
    "━━━━━━━━━━━━━━━━━━━━",
    `📦 *Código:* \`${order.code}\``,
    `👤 *Cliente:* ${order.customerName || "Cliente"}`,
    `📞 *Teléfono:* \`${order.customerPhone || "No especificado"}\``,
    order.customerEmail ? `📧 *Correo:* ${order.customerEmail}` : "",
    "",
    `📍 *Modalidad de Entrega:* ${isDelivery ? "🚚 Envío a Domicilio" : "🏬 Retiro en Local (El Tejar)"}`,
  ];

  if (isDelivery) {
    if (order.deliveryIdNumber) lines.push(`🪪 *Cédula/RUC:* \`${order.deliveryIdNumber}\``);
    if (order.deliveryCity) lines.push(`🏙️ *Ciudad:* ${order.deliveryCity}`);
    if (order.deliveryAddress) lines.push(`🏠 *Dirección:* ${order.deliveryAddress}`);
    if (order.deliveryReference) lines.push(`🧭 *Referencia:* ${order.deliveryReference}`);
  } else if (order.pickupAddress) {
    lines.push(`🏢 *Lugar:* ${order.pickupAddress}`);
    if (order.pickupNote) lines.push(`🧭 *Referencia Local:* ${order.pickupNote}`);
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
    lines.push(`🎟️ *Descuento Aplicado:* -${currency(order.discountAmount)}${order.couponCode ? ` (Cupón: \`${order.couponCode}\`)` : ""}`);
  }
  if (Number(order.paymentFeeAmount || 0) > 0) {
    lines.push(`💳 *Comisión Tarjeta (${order.paymentFeePercent || 6}%):* +${currency(order.paymentFeeAmount)}`);
  }

  lines.push(
    `💵 *TOTAL A PAGAR:* *${currency(order.total || order.subtotal)}*`,
    "━━━━━━━━━━━━━━━━━━━━",
    order.paymentProof ? "📸 *Comprobante de pago:* Adjunto en el pedido" : "⏳ *Comprobante:* Pendiente",
    "⚡ [Abrir Panel de Administración](https://adriego.vercel.app/admin)",
  );

  return lines.filter((line) => line !== null && line !== undefined && line !== false).join("\n");
}

export async function sendTelegramNotification(order = {}, options = {}) {
  const token = options.token || process.env.TELEGRAM_BOT_TOKEN || DEFAULT_TELEGRAM_BOT_TOKEN;
  const chatId = options.chatId || process.env.TELEGRAM_ADMIN_CHAT_ID || DEFAULT_TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
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

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "order.created",
        timestamp: new Date().toISOString(),
        order,
      }),
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
