import crypto from "node:crypto";
import { fetchWithTimeout } from "./network.js";
import { getPublicSiteOrigin } from "../../src/constants/site.js";

export function getAdminPanelUrl() {
  return `${getPublicSiteOrigin(process.env.PUBLIC_SITE_URL || process.env.VITE_PUBLIC_SITE_URL)}/admin`;
}

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
    .replace(/[`_*[\]()~>#+=|{}.!-]/g, "\\$&");
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
  const normalizedStatus = String(order.status || "Pendiente").toLowerCase();
  let customerMessage = `¡Hola ${customerName}! ✨ Te contactamos de Adriego Store por tu pedido ${code}.`;
  if (normalizedStatus === "listo para retiro") {
    customerMessage = `¡Hola ${customerName}! ✨ Tu pedido ${code} ya está listo para retirar en nuestro local de El Tejar. ¡Te esperamos!`;
  } else if (normalizedStatus === "enviado") {
    const destination = order.deliveryCity ? ` a ${order.deliveryCity}` : "";
    const guide = order.guideNumber ? ` Guía: ${order.guideNumber}.` : "";
    customerMessage = `¡Hola ${customerName}! ✨ Tu pedido ${code} ya fue enviado${destination} por ${order.courierName || order.courier || "courier"}.${guide} ¡Gracias por tu compra!`;
  } else if (normalizedStatus === "entregado") {
    customerMessage = `¡Hola ${customerName}! ✨ Confirmamos la entrega de tu pedido ${code}. ¡Esperamos que disfrutes tus prendas!`;
  }
  const waText = encodeURIComponent(customerMessage);
  const waUrl = intlPhone ? `https://wa.me/${intlPhone}?text=${waText}` : null;

  const rows = [];
  const actionRow = [];
  if (waUrl) actionRow.push({ text: "💬 Avisar por WhatsApp", url: waUrl });
  if (order.deliveryType === "delivery" && normalizedStatus !== "entregado") {
    actionRow.push({ text: order.guideNumber ? "✏️ Cambiar guía" : "📦 Asignar guía", callback_data: `setguia:${code}` });
  }
  if (actionRow.length > 0) {
    rows.push(actionRow);
  }

  const detailRow = [];
  if (order.paymentProof || order.paymentMethod === "bank_transfer" || order.paymentMethod === "transfer") {
    detailRow.push({ text: "📸 Comprobante", callback_data: `proof:${code}` });
  }
  if (order.deliveryType === "delivery") {
    detailRow.push({ text: "📍 Dirección", callback_data: `address:${code}` });
    detailRow.push({ text: "📋 Courier", callback_data: `courier:${code}` });
  }
  if (detailRow.length > 0) {
    rows.push(detailRow);
  }

  const statusRow = [];
  if (normalizedStatus === "pendiente") {
    statusRow.push({ text: "✅ Confirmar pedido", callback_data: `status:confirmed:${code}` });
  }
  if (normalizedStatus !== "entregado") {
    if (order.deliveryType === "pickup" && normalizedStatus !== "listo para retiro") {
      statusRow.push({ text: "🏬 Listo para retirar", callback_data: `status:ready:${code}` });
    }
    if (normalizedStatus === "enviado" || normalizedStatus === "listo para retiro") {
      statusRow.push({ text: "✅ Marcar entregado", callback_data: `status:completed:${code}` });
    }
  }
  if (statusRow.length > 0) rows.push(statusRow);
  rows.push([{ text: "🗑️ Eliminar pedido", callback_data: `order-delete:request:${code}` }]);
  rows.push([{ text: "↩️ Pedidos pendientes", callback_data: "pending:0" }]);

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
  const pickupAddress = escapeTelegramMarkdown(order.pickupAddress || "");
  const paymentLabel = escapeTelegramMarkdown(
    order.paymentMethodLabel
    || (order.paymentMethod === "card_link" ? "Tarjeta mediante enlace de pago" : "Transferencia bancaria"),
  );

  const itemsList = items
    .map((item, idx) => {
      const name = escapeTelegramMarkdown(item.name || "Prenda");
      const color = escapeTelegramMarkdown(item.color || "N/A");
      const size = escapeTelegramMarkdown(item.size || "N/A");
      return `${idx + 1}. ${item.quantity || 1}× *${name}* · ${color} · ${size} — ${currency(item.price * item.quantity)}`;
    })
    .join("\n");

  const itemCount = order.itemCount || items.reduce((sum, item) => sum + (Number(item.quantity) || 1), 0);
  const lines = [
    `🛍️ *Pedido ${escapeTelegramMarkdown(order.code || "sin código")}*`,
    `🏷️ ${escapeTelegramMarkdown(order.status || "Pendiente")}`,
    "",
    `💵 *${currency(order.total ?? order.subtotal)}* · ${itemCount} prenda(s)`,
    `👤 ${customerName} · \`${customerPhone}\``,
    customerEmail ? `📧 ${customerEmail}` : "",
    isDelivery
      ? `🚚 Envío${deliveryCity ? ` · ${deliveryCity}` : ""}`
      : `🏬 Retiro${pickupAddress ? ` · ${pickupAddress}` : " en local"}`,
    `💳 ${paymentLabel}${bankName ? ` · ${bankName}` : ""}`,
    order.paymentProof ? "📸 Comprobante adjunto" : "⏳ Comprobante pendiente",
  ];

  if (isDelivery && order.guideNumber) {
    lines.push(`📦 ${escapeTelegramMarkdown(order.courierName || order.courier || "Courier")} · guía \`${escapeTelegramMarkdown(order.guideNumber)}\``);
  }

  lines.push(
    "",
    "*Prendas*",
    itemsList || "Sin detalles de prendas",
  );

  if (Number(order.discountAmount || 0) > 0) {
    lines.push(`🎟️ Descuento -${currency(order.discountAmount)}${order.couponCode ? ` · \`${escapeTelegramMarkdown(order.couponCode)}\`` : ""}`);
  }
  if (Number(order.shippingCost || 0) > 0) {
    lines.push(`🚚 Envío +${currency(order.shippingCost)}`);
  }
  if (Number(order.paymentFeeAmount || 0) > 0) {
    lines.push(`💳 Comisión +${currency(order.paymentFeeAmount)}`);
  }

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
    const response = await fetchWithTimeout(`https://api.telegram.org/bot${token}/sendMessage`, {
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
    const response = await fetchWithTimeout(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "Markdown",
        disable_web_page_preview: true,
        reply_markup: {
          inline_keyboard: [
            [{ text: "📦 Gestionar en Panel Admin", url: getAdminPanelUrl() }]
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

export async function sendTelegramStockDigest(alerts = [], options = {}) {
  const token = String(options.token || process.env.TELEGRAM_BOT_TOKEN || "").trim();
  const chatId = String(options.chatId || process.env.TELEGRAM_ADMIN_CHAT_ID || "").trim();
  if (!token || !chatId || !isAuthorizedAdminChatId(chatId)) {
    return { ok: false, skipped: true, message: "Unauthorized or unconfigured" };
  }

  const uniqueAlerts = [...new Map((Array.isArray(alerts) ? alerts : []).map((alert) => [
    [alert.productName, alert.color, alert.size].join("|"),
    alert,
  ])).values()];
  if (uniqueAlerts.length === 0) return { ok: true, skipped: true };

  const visible = uniqueAlerts.slice(0, 12);
  const lines = visible.map((alert) => {
    const stock = Math.max(0, Number(alert.remainingStock) || 0);
    return `${stock === 0 ? "🛑" : "⚠️"} *${escapeTelegramMarkdown(alert.productName || "Producto")}* · ${escapeTelegramMarkdown(alert.color || "N/A")} · ${escapeTelegramMarkdown(alert.size || "N/A")} · *${stock}*`;
  });
  const remainder = uniqueAlerts.length - visible.length;
  const text = [
    `📦 *Stock por revisar · ${uniqueAlerts.length} variante${uniqueAlerts.length === 1 ? "" : "s"}*`,
    "",
    ...lines,
    remainder > 0 ? `\n…y ${remainder} más en el panel.` : "",
  ].filter(Boolean).join("\n");

  try {
    const response = await fetchWithTimeout(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "Markdown",
        disable_web_page_preview: true,
        reply_markup: { inline_keyboard: [[{ text: "Abrir inventario", url: getAdminPanelUrl() }]] },
      }),
    });
    const result = await response.json();
    return { ok: Boolean(result?.ok), result };
  } catch (error) {
    console.error("[telegram-stock-digest-error]", error?.message || error);
    return { ok: false, error: error?.message || "Telegram network error" };
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
    const response = await fetchWithTimeout(webhookUrl, {
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
  const stockPromise = sendTelegramStockDigest(Array.isArray(lowStockAlerts) ? lowStockAlerts : []);

  const [telegramResult, n8nResult, stockResult] = await Promise.allSettled([telegramPromise, n8nPromise, stockPromise]);
  return {
    telegram: telegramResult.status === "fulfilled" ? telegramResult.value : { ok: false, error: telegramResult.reason },
    n8n: n8nResult.status === "fulfilled" ? n8nResult.value : { ok: false, error: n8nResult.reason },
    stock: stockResult.status === "fulfilled" ? stockResult.value : { ok: false, error: stockResult.reason },
  };
}

export const TELEGRAM_BOT_COMMANDS = [
  { command: "start", description: "Iniciar bot y mostrar el teclado de acciones" },
  { command: "menu", description: "Menú principal y accesos directos" },
  { command: "pedidos", description: "Ver y gestionar pedidos pendientes" },
  { command: "ventas", description: "Resumen de ventas de hoy e histórico" },
  { command: "stock_bajo", description: "Prendas con stock bajo o agotadas" },
  { command: "buscar", description: "Buscar pedidos por código o cliente" },
  { command: "guia", description: "Registrar guía de envío de un pedido" },
  { command: "stock", description: "Consultar stock disponible de una prenda" },
  { command: "venta", description: "Registrar venta por tipo y modelo" },
  { command: "reponer", description: "Reponer stock por tipo y modelo" },
  { command: "deshacer", description: "Deshacer la última venta física" },
  { command: "ayuda", description: "Guía de comandos oficiales y ayuda" },
];

const registeredCommandsSignatures = new Set();
const pendingCommandsRegistrations = new Map();

function isValidMenuChat(chatId) {
  return !chatId || (Number.isSafeInteger(Number(chatId)) && Number(chatId) > 0 && isAuthorizedAdminChatId(chatId));
}

export async function registerTelegramBotCommands(token = "", { chatId = "" } = {}) {
  const botToken = String(token || process.env.TELEGRAM_BOT_TOKEN || "").trim();
  if (!botToken) return { ok: false, message: "Missing Telegram bot token" };
  if (!isValidMenuChat(chatId)) return { ok: false, message: "Unauthorized private menu chat" };

  try {
    const response = await fetchWithTimeout(`https://api.telegram.org/bot${botToken}/setMyCommands`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commands: TELEGRAM_BOT_COMMANDS, ...(chatId ? { scope: { type: "chat", chat_id: Number(chatId) } } : {}) }),
    });
    const result = await response.json();
    if (response.ok === false || !result?.ok) return { ok: false, result };
    // Telegram owns the command-menu UI; explicitly select it so a previous
    // Web App button does not hide /start and the registered command list.
    const menuResponse = await fetchWithTimeout(`https://api.telegram.org/bot${botToken}/setChatMenuButton`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ menu_button: { type: "commands" }, ...(chatId ? { chat_id: Number(chatId) } : {}) }),
    });
    const menuResult = await menuResponse.json();
    return { ok: Boolean(menuResult?.ok) && menuResponse.ok !== false, result, menuResult };
  } catch (err) {
    console.error("[registerTelegramBotCommands-error]", err?.message || err);
    return { ok: false, error: err?.message || "Telegram network error" };
  }
}

export async function ensureTelegramBotCommandsRegistered(token = "", { chatId = "" } = {}) {
  const botToken = String(token || process.env.TELEGRAM_BOT_TOKEN || "").trim();
  if (!botToken) return { ok: false, message: "Missing Telegram bot token" };
  if (!isValidMenuChat(chatId)) return { ok: false, message: "Unauthorized private menu chat" };

  const signature = crypto
    .createHash("sha256")
    .update(`${botToken}:${chatId}:commands:${JSON.stringify(TELEGRAM_BOT_COMMANDS)}`)
    .digest("hex");
  if (registeredCommandsSignatures.has(signature)) {
    return { ok: true, skipped: true, message: "Telegram bot commands already registered" };
  }
  if (pendingCommandsRegistrations.has(signature)) {
    return pendingCommandsRegistrations.get(signature);
  }

  const promise = registerTelegramBotCommands(botToken, { chatId })
    .then((result) => {
      if (result?.ok) registeredCommandsSignatures.add(signature);
      return result;
    })
    .finally(() => {
      pendingCommandsRegistrations.delete(signature);
    });
  pendingCommandsRegistrations.set(signature, promise);
  return promise;
}
