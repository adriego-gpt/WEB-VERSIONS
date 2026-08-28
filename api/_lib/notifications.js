import crypto from "node:crypto";

export function getAllowedAdminChatIds() {
  const configured = String(process.env.TELEGRAM_ADMIN_CHAT_ID || "").trim();
  if (!configured) return new Set();
  return new Set(configured.split(",").map((s) => s.trim()).filter(Boolean));
}

export function isAuthorizedAdminChatId(chatId) {
  if (!chatId) return false;
  const allowed = getAllowedAdminChatIds();
  return allowed.size > 0 && allowed.has(String(chatId).trim());
}

export function escapeTelegramMarkdown(text = "") {
  return String(text || "")
    .replace(/[_*[\]()~>#+=|{}.!-]/g, "\\$&");
}

function currency(value) {
  return new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" }).format(Number(value) || 0);
}

export function buildTelegramOrderKeyboard(order = {}) {
  const code = order.code || "";
  const rawPhone = String(order.customerPhone || "").replace(/\D/g, "");
  let intlPhone = rawPhone;
  if (rawPhone.startsWith("0") && rawPhone.length === 10) {
    intlPhone = `593${rawPhone.slice(1)}`;
  } else if (rawPhone.length === 9) {
    intlPhone = `593${rawPhone}`;
  }

  const customerName = order.customerName || "Cliente";
  const waText = encodeURIComponent(`¡Hola ${customerName}! ✨ Te saludamos de Adriego Store respecto a tu pedido ${code}.`);
  const waUrl = intlPhone ? `https://wa.me/${intlPhone}?text=${waText}` : null;

  const rows = [];
  const actionRow = [];
  if (waUrl) {
    actionRow.push({ text: "💬 WhatsApp Cliente", url: waUrl });
  }
  if (order.deliveryType === "delivery") {
    actionRow.push({ text: "📦 Asignar Guía", callback_data: `setguia:${code}` });
  }
  if (actionRow.length > 0) {
    rows.push(actionRow);
  }

  // Middle detail row: View Proof, Address, Courier Format
  const detailRow = [];
  if (order.paymentProof || order.paymentMethod === "bank_transfer" || order.paymentMethod === "transfer") {
    detailRow.push({ text: "📸 Ver Comprobante", callback_data: `proof:${code}` });
  }
  if (order.deliveryType === "delivery") {
    detailRow.push({ text: "📍 Ver Dirección", callback_data: `address:${code}` });
    detailRow.push({ text: "📋 Formato Courier", callback_data: `courier:${code}` });
  }
  if (detailRow.length > 0) {
    rows.push(detailRow);
  }

  const statusRow = [];
  if (order.deliveryType === "pickup") {
    statusRow.push({ text: "🏬 Listo para Retiro", callback_data: `status:ready:${code}` });
    statusRow.push({ text: "✅ Entregado", callback_data: `status:completed:${code}` });
  } else {
    statusRow.push({ text: "🚚 Marcar Enviado", callback_data: `status:shipped:${code}` });
    statusRow.push({ text: "✅ Entregado", callback_data: `status:completed:${code}` });
  }
  rows.push(statusRow);

  return { inline_keyboard: rows };
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
  if (Number(order.shippingCost || 0) > 0) {
    lines.push(`🚚 *Costo de Envío (${escapeTelegramMarkdown(order.shippingLabel || "Envío")}):* +${currency(order.shippingCost)}`);
  } else if (order.deliveryType === "delivery") {
    lines.push(`🚚 *Envío:* GRATIS`);
  }
  if (Number(order.paymentFeeAmount || 0) > 0) {
    lines.push(`💳 *Comisión Tarjeta (${order.paymentFeePercent || 6}%):* +${currency(order.paymentFeeAmount)}`);
  }

  lines.push(
    `💵 *TOTAL A PAGAR:* *${currency(order.total || order.subtotal)}*`,
    "━━━━━━━━━━━━━━━━━━━━",
    order.paymentProof ? "📸 *Comprobante de pago:* Adjunto en el pedido" : "⏳ *Comprobante:* Pendiente",
  );

  if (order.guideNumber) {
    lines.push(`🚚 *Guía Registrada:* \`${escapeTelegramMarkdown(order.guideNumber)}\``);
  }

  lines.push("⚡ _Usa los botones directos abajo para gestionar el pedido:_");

  return lines.filter((line) => line !== null && line !== undefined && line !== false).join("\n");
}

export function formatTelegramStockAlert(alert = {}) {
  const { productName, color, size, remainingStock } = alert;
  const isOutOfStock = Number(remainingStock) <= 0;
  const statusEmoji = isOutOfStock ? "🛑" : "⚠️";
  const statusTitle = isOutOfStock ? "¡PRODUCTO AGOTADO!" : "¡STOCK CRÍTICO!";

  const lines = [
    `${statusEmoji} *${statusTitle}*`,
    "━━━━━━━━━━━━━━━━━━━━",
    `👗 *Prenda:* ${escapeTelegramMarkdown(productName || "Producto")}`,
    `🎨 *Color:* ${escapeTelegramMarkdown(color || "N/A")} | 📏 *Talla:* ${escapeTelegramMarkdown(size || "N/A")}`,
    `📦 *Unidades Disponibles:* *${remainingStock}*`,
    "",
    isOutOfStock
      ? "🔴 _Esta talla/color ya no tiene unidades disponibles en el catálogo._"
      : "🟡 _Quedan muy pocas unidades. Te recomendamos reponer inventario._",
    "━━━━━━━━━━━━━━━━━━━━",
  ];

  return lines.join("\n");
}

export async function sendTelegramNotification(order = {}, options = {}) {
  const token = String(options.token || process.env.TELEGRAM_BOT_TOKEN || "").trim();
  const chatId = String(options.chatId || process.env.TELEGRAM_ADMIN_CHAT_ID || "").trim();

  if (!token || !chatId) {
    return { ok: false, skipped: true, message: "Missing Telegram credentials" };
  }

  if (!isAuthorizedAdminChatId(chatId)) {
    console.warn(`[security-alert] Unauthorized Telegram notification attempt blocked for Chat ID: ${chatId}`);
    return { ok: false, message: "Unauthorized recipient" };
  }

  const messageText = formatTelegramOrderMessage(order);
  const replyMarkup = buildTelegramOrderKeyboard(order);

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: messageText,
        parse_mode: "Markdown",
        disable_web_page_preview: true,
        reply_markup: replyMarkup,
      }),
    });

    const result = await response.json();
    return { ok: Boolean(result?.ok), result };
  } catch (error) {
    console.error("[telegram-notification-error]", error?.message || error);
    return { ok: false, error: error?.message || "Telegram network error" };
  }
}

export async function sendTelegramStockAlert(alert = {}, options = {}) {
  const token = String(options.token || process.env.TELEGRAM_BOT_TOKEN || "").trim();
  const chatId = String(options.chatId || process.env.TELEGRAM_ADMIN_CHAT_ID || "").trim();

  if (!token || !chatId || !isAuthorizedAdminChatId(chatId)) {
    return { ok: false, skipped: true, message: "Unauthorized or unconfigured" };
  }

  const text = formatTelegramStockAlert(alert);

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "Markdown",
        disable_web_page_preview: true,
        reply_markup: {
          inline_keyboard: [
            [{ text: "📦 Gestionar en Panel Admin", url: "https://adriego.vercel.app/admin" }]
          ]
        }
      }),
    });
    const result = await response.json();
    return { ok: Boolean(result?.ok), result };
  } catch (error) {
    console.error("[telegram-stock-alert-error]", error?.message || error);
    return { ok: false, error: error?.message };
  }
}

export async function sendN8nWebhook(order = {}) {
  const webhookUrl = process.env.N8N_ORDER_WEBHOOK_URL;
  if (!webhookUrl) return { ok: false, skipped: true };

  const secret = String(process.env.N8N_WEBHOOK_SECRET || "").trim();
  if (!secret) {
    console.warn("[n8n-webhook-skipped] N8N_WEBHOOK_SECRET is not configured.");
    return { ok: false, skipped: true, message: "Missing webhook secret" };
  }

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

export async function dispatchOrderNotifications(order = {}, options = {}) {
  const { lowStockAlerts = [] } = options;
  const telegramPromise = sendTelegramNotification(order);
  const n8nPromise = sendN8nWebhook(order);
  const stockPromises = (Array.isArray(lowStockAlerts) ? lowStockAlerts : []).map((alert) => sendTelegramStockAlert(alert));

  const [telegramResult, n8nResult] = await Promise.allSettled([telegramPromise, n8nPromise, ...stockPromises]);
  return {
    telegram: telegramResult.status === "fulfilled" ? telegramResult.value : { ok: false, error: telegramResult.reason },
    n8n: n8nResult.status === "fulfilled" ? n8nResult.value : { ok: false, error: n8nResult.reason },
  };
}
