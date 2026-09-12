import {
  consumeRateLimit,
  getClientIp,
  logSecurityEvent,
  monitorApiRequest,
  requireJsonBody,
  setCommonSecurityHeaders,
} from "./_lib/security.js";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { bumpRealtimeMeta, readStore, updateStore } from "./_lib/store.js";
import {
  escapeTelegramMarkdown,
  isAuthorizedAdminChatId,
  buildTelegramOrderKeyboard,
  formatTelegramOrderMessage,
  TELEGRAM_BOT_COMMANDS,
  registerTelegramBotCommands,
} from "./_lib/notifications.js";

const ENDPOINT_NAME = "telegram-webhook";

function currency(value) {
  return new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" }).format(Number(value) || 0);
}

const ADMIN_KEYBOARD_MARKUP = {
  keyboard: [
    [{ text: "📦 Pedidos" }, { text: "🔍 Buscar" }],
    [{ text: "🛍️ Inventario" }, { text: "📊 Resumen" }],
  ],
  resize_keyboard: true,
  is_persistent: true,
  input_field_placeholder: "Elige una acción",
};

async function answerCallbackQuery(token, callbackQueryId, text = "") {
  try {
    await fetch("https://api.telegram.org/bot" + token + "/answerCallbackQuery", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        text,
        show_alert: false,
      }),
    });
  } catch (err) {
    console.error("[answerCallbackQuery-error]", err?.message || err);
  }
}

async function sendTelegramMessage(token, chatId, text, options = {}) {
  try {
    const payload = {
      chat_id: chatId,
      text,
      parse_mode: "Markdown",
      disable_web_page_preview: true,
      reply_markup: ADMIN_KEYBOARD_MARKUP,
      ...options,
    };
    const response = await fetch("https://api.telegram.org/bot" + token + "/sendMessage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return await response.json();
  } catch (err) {
    console.error("[sendTelegramMessage-error]", err?.message || err);
    return { ok: false, error: err?.message || "Send message error" };
  }
}

async function editTelegramMessage(token, chatId, messageId, text, options = {}) {
  if (!Number.isSafeInteger(messageId) || messageId <= 0) {
    return sendTelegramMessage(token, chatId, text, options);
  }

  try {
    const response = await fetch("https://api.telegram.org/bot" + token + "/editMessageText", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        text,
        parse_mode: "Markdown",
        disable_web_page_preview: true,
        ...options,
      }),
    });
    const result = await response.json();
    if (result?.ok || String(result?.description || "").includes("message is not modified")) return result;
    console.error("[editTelegramMessage-error]", result?.description || "Telegram rejected edit");
  } catch (err) {
    console.error("[editTelegramMessage-error]", err?.message || err);
  }

  return sendTelegramMessage(token, chatId, text, options);
}

async function deleteTelegramMessage(token, chatId, messageId) {
  if (!Number.isSafeInteger(messageId) || messageId <= 0) {
    return { ok: false, error: "Invalid messageId" };
  }
  try {
    const response = await fetch("https://api.telegram.org/bot" + token + "/deleteMessage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
      }),
    });
    return await response.json();
  } catch (err) {
    console.error("[deleteTelegramMessage-error]", err?.message || err);
    return { ok: false, error: err?.message || "Delete message error" };
  }
}

async function sendTelegramPhoto(token, chatId, photoSource, caption = "", options = {}) {
  const url = String(photoSource || "").trim();
  if (!url) return { ok: false, error: "Empty photo" };

  try {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      const response = await fetch("https://api.telegram.org/bot" + token + "/sendPhoto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          photo: url,
          caption: caption || undefined,
          parse_mode: "Markdown",
          ...options,
        }),
      });
      return await response.json();
    }

    if (url.startsWith("data:image/")) {
      const commaIdx = url.indexOf(",");
      if (commaIdx > 0) {
        const meta = url.slice(0, commaIdx);
        const mimeMatch = meta.match(/data:([^;]+);base64/);
        const mimeType = mimeMatch ? mimeMatch[1] : "image/jpeg";
        const base64Data = url.slice(commaIdx + 1);
        const buffer = Buffer.from(base64Data, "base64");
        const extension = mimeType.split("/")[1] || "jpg";

        const formData = new FormData();
        formData.append("chat_id", String(chatId));
        formData.append("photo", new Blob([buffer], { type: mimeType }), "comprobante." + extension);
        if (caption) {
          formData.append("caption", caption);
          formData.append("parse_mode", "Markdown");
        }
        if (options?.reply_markup) {
          formData.append(
            "reply_markup",
            typeof options.reply_markup === "string" ? options.reply_markup : JSON.stringify(options.reply_markup)
          );
        }

        const response = await fetch("https://api.telegram.org/bot" + token + "/sendPhoto", {
          method: "POST",
          body: formData,
        });
        return await response.json();
      }
    }

    return { ok: false, error: "Unsupported photo format" };
  } catch (err) {
    console.error("[sendTelegramPhoto-error]", err?.message || err);
    return { ok: false, error: err?.message || "Send photo error" };
  }
}

const PENDING_GUIDE_PROMPTS = new Map();

function claimInventoryMessage(draft, chatId, messageId) {
  if (!Number.isSafeInteger(messageId) || messageId <= 0) return false;
  const key = `chat:${chatId}`;
  const cursors = draft.meta.inventoryMessageCursors || {};
  if (messageId <= Number(cursors[key] || 0)) return false;
  draft.meta.inventoryMessageCursors = { ...cursors, [key]: messageId };
  return true;
}

function claimInventoryCallback(draft, callbackId) {
  const id = String(callbackId || "").trim();
  if (!id) return false;
  const handled = Array.isArray(draft.meta.inventoryCallbackIds) ? draft.meta.inventoryCallbackIds : [];
  if (handled.includes(id)) return false;
  draft.meta.inventoryCallbackIds = [...handled, id].slice(-100);
  return true;
}

function getProductToken(productId) {
  return createHash("sha256").update(String(productId || "")).digest("base64url").slice(0, 12);
}

function findProductByToken(products, token) {
  return (Array.isArray(products) ? products : []).find((product) => getProductToken(product.id) === token) || null;
}

function getProductOptions(product) {
  const variants = Array.isArray(product?.variants) ? product.variants : [];
  const colors = [...new Set(variants.map((variant) => String(variant.color || "").trim()).filter(Boolean))];
  return { variants, colors };
}

async function sendInventorySearchResults(token, chatId, query, messageId = null) {
  const normalizedQuery = String(query || "").trim().toLocaleLowerCase("es");
  const store = await readStore();
  const products = Array.isArray(store?.products) ? store.products : [];
  const matches = products.filter((product) => String(product.name || "").toLocaleLowerCase("es").includes(normalizedQuery)).slice(0, 8);
  if (!matches.length) {
    await editTelegramMessage(token, chatId, messageId, `🔍 *Sin resultados*\n\nNo encontré prendas para “${escapeTelegramMarkdown(query)}”.`, {
      reply_markup: { inline_keyboard: [[{ text: "🔎 Buscar otra", callback_data: "inv:search" }], [{ text: "↩️ Inventario", callback_data: "inv:menu" }]] },
    });
    return;
  }
  await editTelegramMessage(token, chatId, messageId, `👗 *Resultados · ${matches.length}*\n\nElige una prenda para registrar la venta.`, {
    reply_markup: {
      inline_keyboard: [
        ...matches.map((product) => [{ text: String(product.name || "Producto").slice(0, 48), callback_data: `inv:product:${getProductToken(product.id)}` }]),
        [{ text: "🔎 Buscar otra", callback_data: "inv:search" }],
        [{ text: "↩️ Inventario", callback_data: "inv:menu" }],
      ],
    },
  });
}

function buildInventoryMenu() {
  return {
    text: "🛍️ *Inventario físico*\n\nRegistra una venta o revisa lo que necesita reposición.",
    reply_markup: { inline_keyboard: [
      [{ text: "➖ Registrar venta", callback_data: "inv:search" }],
      [{ text: "📋 Revisar reposición", callback_data: "inv:restock" }],
      [{ text: "↩️ Deshacer última venta", callback_data: "inv:undo-last" }],
      [{ text: "⌂ Inicio", callback_data: "home" }],
    ] },
  };
}

function getPendingOrders(orders = []) {
  return (Array.isArray(orders) ? orders : [])
    .filter((order) => {
      const status = String(order?.status || "").toLowerCase();
      return status === "pendiente" || status === "en preparación" || status === "listo para retiro" || status === "enviado";
    })
    .sort((left, right) => String(left.createdAt || "").localeCompare(String(right.createdAt || "")));
}

function buildPendingOrdersView(orders = [], requestedPage = 0) {
  const pendingOrders = getPendingOrders(orders);
  if (pendingOrders.length === 0) {
    return {
      text: "✅ *Pedidos al día*\n\nNo hay pedidos pendientes en este momento.",
      reply_markup: { inline_keyboard: [[{ text: "⌂ Inicio", callback_data: "home" }]] },
    };
  }

  const pageSize = 6;
  const pageCount = Math.ceil(pendingOrders.length / pageSize);
  const page = Math.min(Math.max(0, Number(requestedPage) || 0), pageCount - 1);
  const pageOrders = pendingOrders.slice(page * pageSize, (page + 1) * pageSize);
  const lines = pageOrders.map((order, index) => {
    const icon = order.deliveryType === "delivery" ? "🚚" : "🏬";
    return `${page * pageSize + index + 1}. \`${order.code}\` ${icon} ${escapeTelegramMarkdown(order.customerName || "Cliente")}\n   ${currency(order.total ?? order.subtotal)} · ${escapeTelegramMarkdown(order.status || "Pendiente")}`;
  });

  const buttons = pageOrders.map((order) => [
    { text: `Abrir ${String(order.code || "pedido").slice(0, 24)}`, callback_data: `view:${order.code}` },
  ]);
  const navigation = [];
  if (page > 0) navigation.push({ text: "← Anterior", callback_data: `pending:${page - 1}` });
  if (page < pageCount - 1) navigation.push({ text: "Siguiente →", callback_data: `pending:${page + 1}` });
  if (navigation.length > 0) buttons.push(navigation);
  buttons.push([{ text: "↻ Actualizar", callback_data: `pending:${page}` }, { text: "⌂ Inicio", callback_data: "home" }]);

  return {
    text: `📦 *Pedidos pendientes · ${pendingOrders.length}*\nPágina ${page + 1} de ${pageCount}\n\n${lines.join("\n\n")}`,
    reply_markup: { inline_keyboard: buttons },
  };
}

function buildSummaryView(orders = []) {
  const safeOrders = Array.isArray(orders) ? orders : [];
  const todayIso = new Date().toISOString().slice(0, 10);
  const todayOrders = safeOrders.filter((order) => String(order.createdAt || "").startsWith(todayIso));
  const todayTotal = todayOrders.reduce((sum, order) => sum + (Number(order.total ?? order.subtotal) || 0), 0);
  const allTotal = safeOrders.reduce((sum, order) => sum + (Number(order.total ?? order.subtotal) || 0), 0);

  const text = [
    "📊 *Resumen de ventas*",
    "━━━━━━━━━━━━━━━━━━━━",
    `📅 *Hoy (${todayIso})*:`,
    `• *Pedidos:* ${todayOrders.length}`,
    `• *Total facturado:* *${currency(todayTotal)}*`,
    "",
    "📈 *Histórico:*",
    `• *Total pedidos:* ${safeOrders.length}`,
    `• *Total acumulado:* *${currency(allTotal)}*`,
    "━━━━━━━━━━━━━━━━━━━━",
    "⚡ [Ver en Panel Admin](https://adriego.vercel.app/admin)",
  ].join("\n");

  const reply_markup = {
    inline_keyboard: [
      [{ text: "↻ Actualizar", callback_data: "summary" }, { text: "⌂ Inicio", callback_data: "home" }],
    ],
  };

  return { text, reply_markup };
}

function buildLowStockView(products = []) {
  const safeProducts = Array.isArray(products) ? products : [];
  const items = safeProducts.flatMap((product) => (product?.variants || []).map((variant) => ({
    name: product.name,
    color: variant.color,
    size: variant.size,
    stock: Math.max(0, Number(variant.stock) || 0),
  }))).filter((item) => item.stock <= 2).sort((left, right) => left.stock - right.stock);

  if (items.length === 0) {
    return {
      text: "✅ *Inventario saludable*\n\nNo hay variantes con stock bajo o agotadas.",
      reply_markup: {
        inline_keyboard: [
          [{ text: "↻ Actualizar", callback_data: "low-stock" }, { text: "⌂ Inicio", callback_data: "home" }],
        ],
      },
    };
  }

  const visible = items.slice(0, 20);
  const lines = visible.map((item) => `${item.stock === 0 ? "🛑" : "⚠️"} *${escapeTelegramMarkdown(item.name)}* · ${escapeTelegramMarkdown(item.color)} · ${escapeTelegramMarkdown(item.size)} · *${item.stock}*`);
  const text = `⚠️ *Stock por revisar · ${items.length}*\n\n${lines.join("\n")}${items.length > visible.length ? `\n\n…y ${items.length - visible.length} más.` : ""}`;

  return {
    text,
    reply_markup: {
      inline_keyboard: [
        [{ text: "↻ Actualizar", callback_data: "low-stock" }, { text: "⌂ Inicio", callback_data: "home" }],
      ],
    },
  };
}

function formatHelpMessage() {
  const commandLines = TELEGRAM_BOT_COMMANDS.map((c) => `• /${c.command} — ${escapeTelegramMarkdown(c.description)}`);
  return [
    "📖 *Comandos oficiales · Adriego Bot*",
    "━━━━━━━━━━━━━━━━━━━━",
    ...commandLines,
    "━━━━━━━━━━━━━━━━━━━━",
    "💡 _Tip: También puedes usar el teclado táctil para navegar con un toque._",
  ].join("\n");
}

function buildAdminHome(store = {}, senderName = "") {
  const orders = Array.isArray(store.orders) ? store.orders : [];
  const products = Array.isArray(store.products) ? store.products : [];
  const pendingCount = getPendingOrders(orders).length;
  const lowStockCount = products.reduce((count, product) => (
    count + (product.variants || []).filter((variant) => (Number(variant.stock) || 0) <= 2).length
  ), 0);
  const greeting = senderName ? `Hola, ${escapeTelegramMarkdown(senderName)}. ` : "";
  return {
    text: `👑 *Adriego Store*\n\n${greeting}Tienes *${pendingCount}* pedido(s) pendiente(s) y *${lowStockCount}* variante(s) por revisar.`,
    reply_markup: { inline_keyboard: [
      [{ text: `📦 Pedidos · ${pendingCount}`, callback_data: "pending:0" }],
      [{ text: "🛍️ Inventario físico", callback_data: "inv:menu" }],
      [{ text: "📊 Resumen de ventas", callback_data: "summary" }, { text: `⚠️ Stock · ${lowStockCount}`, callback_data: "low-stock" }],
      [{ text: "🔍 Buscar pedido", callback_data: "search-order" }],
    ] },
  };
}

async function registerGuidedPhysicalSale({ chatId, callbackId, productToken, colorIndex, sizeIndex, quantity }) {
  let result = null;
  await updateStore((draft) => {
    if (!claimInventoryCallback(draft, callbackId)) {
      result = { duplicate: true };
      return draft;
    }
    const product = findProductByToken(draft.products, productToken);
    const { colors } = getProductOptions(product);
    const color = colors[colorIndex];
    const variants = (product?.variants || []).filter((variant) => variant.color === color);
    const sizes = [...new Set(variants.map((variant) => String(variant.size || "").trim()).filter(Boolean))];
    const size = sizes[sizeIndex];
    const variant = variants.find((entry) => entry.size === size);
    const stock = Number(variant?.stock);
    if (!product || !variant || !Number.isSafeInteger(stock) || stock < quantity) {
      result = { ok: false, stock: Math.max(0, Number.isFinite(stock) ? stock : 0) };
      return draft;
    }
    variant.stock = stock - quantity;
    refreshProductStock(product);
    const event = {
      id: `physical-${randomUUID()}`,
      chatId,
      productId: String(product.id || ""),
      productName: String(product.name || "Producto"),
      color,
      size,
      quantity,
      status: "active",
      createdAt: new Date().toISOString(),
    };
    draft.physicalStockEvents = [...(Array.isArray(draft.physicalStockEvents) ? draft.physicalStockEvents : []), event].slice(-80);
    bumpRealtimeMeta(draft, ["catalog"]);
    result = { ok: true, stock: variant.stock, event };
    return draft;
  });
  return result;
}

function refreshProductStock(product) {
  product.stockBySize = Object.fromEntries((product.variants || []).map((variant) => variant.size).map((size) => [
    size, product.variants.filter((variant) => variant.size === size).reduce((sum, variant) => sum + (Number(variant.stock) || 0), 0),
  ]));
}

async function undoPhysicalStockSale(chatId, eventId = "", messageId = null, callbackId = "") {
  let result = null;
  await updateStore((draft) => {
    if (messageId !== null && !claimInventoryMessage(draft, chatId, messageId)) {
      result = { ok: false, reason: "duplicate" };
      return draft;
    }
    if (callbackId && !claimInventoryCallback(draft, callbackId)) {
      result = { ok: false, reason: "duplicate" };
      return draft;
    }
    const events = Array.isArray(draft.physicalStockEvents) ? draft.physicalStockEvents : [];
    const event = events.slice().reverse().find((item) => (
      item?.status === "active"
      && String(item.chatId || "") === String(chatId)
      && (!eventId || String(item.id) === String(eventId))
    ));
    if (!event) {
      result = { ok: false, reason: "missing" };
      return draft;
    }
    const product = (draft.products || []).find((item) => String(item.id || "") === String(event.productId || ""));
    const variant = product?.variants?.find((item) => (
      String(item.color || "").toLowerCase() === String(event.color || "").toLowerCase()
      && String(item.size || "").toLowerCase() === String(event.size || "").toLowerCase()
    ));
    if (!variant) {
      result = { ok: false, reason: "variant" };
      return draft;
    }
    variant.stock = Math.max(0, Number(variant.stock) || 0) + Math.max(1, Number(event.quantity) || 1);
    refreshProductStock(product);
    event.status = "reverted";
    event.revertedAt = new Date().toISOString();
    draft.physicalStockEvents = events;
    bumpRealtimeMeta(draft, ["catalog"]);
    result = { ok: true, event, stock: variant.stock };
    return draft;
  });
  return result;
}

async function applyOrderGuideRegistration(token, senderChatId, orderQuery, courierName, trackingNumber, promptMessageId = null) {
  let cleanNumber = String(trackingNumber || "").trim();
  let cleanCourier = String(courierName || "").trim();

  if (cleanNumber.includes(":")) {
    const parts = cleanNumber.split(":");
    const extractedCourier = parts[0].trim();
    const extractedNumber = parts.slice(1).join(":").trim();
    if (extractedNumber) {
      cleanNumber = extractedNumber;
      if (!cleanCourier || cleanCourier === "Servientrega") {
        cleanCourier = extractedCourier;
      }
    }
  }

  if (!cleanCourier) cleanCourier = "Servientrega";
  let updatedOrder = null;

  try {
    await updateStore((draft) => {
      const orders = Array.isArray(draft.orders) ? draft.orders : [];
      const targetIndex = orders.findIndex((o) =>
        String(o.code).toUpperCase().includes(String(orderQuery).toUpperCase())
      );

      if (targetIndex >= 0) {
        orders[targetIndex] = {
          ...orders[targetIndex],
          guideNumber: cleanNumber,
          courierName: cleanCourier,
          courier: cleanCourier,
          status: "Enviado",
          updatedAt: new Date().toISOString(),
        };
        updatedOrder = orders[targetIndex];
        draft.orders = [...orders];
        bumpRealtimeMeta(draft, ["orders"]);
      }

      if (draft.meta?.pendingGuidePrompts?.[senderChatId]) {
        const pending = { ...draft.meta.pendingGuidePrompts };
        delete pending[senderChatId];
        draft.meta.pendingGuidePrompts = pending;
      }
      return draft;
    });
  } catch (storeErr) {
    console.error("[update-guia-error]", storeErr?.message || storeErr);
  }

  PENDING_GUIDE_PROMPTS.delete(senderChatId);

  if (updatedOrder) {
    await editTelegramMessage(token, senderChatId, promptMessageId, `✅ *Guía registrada*\n\n${formatTelegramOrderMessage(updatedOrder)}`, {
      reply_markup: buildTelegramOrderKeyboard(updatedOrder),
    });
    return true;
  } else {
    await sendTelegramMessage(token, senderChatId, "⚠️ No se encontró ningún pedido que coincida con `" + orderQuery + "`.");
    return false;
  }
}

export default async function handler(req, res) {
  monitorApiRequest(req, res, ENDPOINT_NAME);
  setCommonSecurityHeaders(res);

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ ok: false, message: "Método no permitido." });
    return;
  }

  const webhookSecret = String(process.env.TELEGRAM_WEBHOOK_SECRET || "").trim();
  const adminChatIds = String(process.env.TELEGRAM_ADMIN_CHAT_ID || "").trim();
  const token = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
  if (!webhookSecret || !adminChatIds || !token) {
    res.status(503).json({ ok: false, message: "Webhook no configurado de forma segura." });
    return;
  }

  const clientIp = getClientIp(req);
  const rateCheck = await consumeRateLimit("telegram-webhook", clientIp, 180, 60 * 1000, {
    endpoint: ENDPOINT_NAME,
    ip: clientIp,
  });
  if (!rateCheck.ok) {
    res.setHeader("Retry-After", String(Math.ceil(rateCheck.retryAfterMs / 1000)));
    res.status(429).json({ ok: false, message: "Demasiadas solicitudes." });
    return;
  }

  const suppliedSecret = String(req.headers?.["x-telegram-bot-api-secret-token"] || "");
  const expected = Buffer.from(webhookSecret);
  const supplied = Buffer.from(suppliedSecret);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
    res.status(401).json({ ok: false, message: "Webhook no autorizado." });
    return;
  }

  const update = requireJsonBody(req, res, { endpoint: ENDPOINT_NAME });
  if (!update) {
    // requireJsonBody already sent the error response
    return;
  }

  // 1. Handle Callback Query (Buttons clicked in Telegram messages)
  if (update.callback_query) {
    const cb = update.callback_query;
    const senderChatId = String(cb.from?.id || cb.message?.chat?.id || "").trim();
    const data = String(cb.data || "").trim();
    const sourceMessageId = Number(cb.message?.message_id);

    if (!isAuthorizedAdminChatId(senderChatId)) {
      await answerCallbackQuery(token, cb.id, "🔒 Acción no autorizada.");
      res.status(200).json({ ok: true, authorized: false });
      return;
    }

    if (data === "home") {
      await answerCallbackQuery(token, cb.id);
      const store = await readStore();
      const home = buildAdminHome(store, cb.from?.first_name || "");
      await editTelegramMessage(token, senderChatId, sourceMessageId, home.text, { reply_markup: home.reply_markup });
    } else if (data === "summary") {
      await answerCallbackQuery(token, cb.id, "Actualizando resumen...");
      const store = await readStore();
      const view = buildSummaryView(store.orders);
      await editTelegramMessage(token, senderChatId, sourceMessageId, view.text, {
        reply_markup: view.reply_markup,
      });
    } else if (data === "low-stock") {
      await answerCallbackQuery(token, cb.id, "Revisando stock...");
      const store = await readStore();
      const view = buildLowStockView(store.products);
      await editTelegramMessage(token, senderChatId, sourceMessageId, view.text, {
        reply_markup: view.reply_markup,
      });
    } else if (data === "search-order") {
      await answerCallbackQuery(token, cb.id);
      await sendTelegramMessage(token, senderChatId, "🔍 *Buscar pedido*\n\nResponde con el código o el nombre del cliente.", {
        reply_markup: { force_reply: true, selective: true, input_field_placeholder: "Ej. ORDER-10099 o María" },
      });
      if (Number.isSafeInteger(sourceMessageId) && sourceMessageId > 0) {
        await deleteTelegramMessage(token, senderChatId, sourceMessageId);
      }
    } else if (data === "quick_pendientes" || data.startsWith("pending:")) {
      await answerCallbackQuery(token, cb.id, "Actualizando pedidos...");
      const store = await readStore();
      const page = data.startsWith("pending:") ? Number(data.slice("pending:".length)) : 0;
      const view = buildPendingOrdersView(store.orders, page);
      await editTelegramMessage(token, senderChatId, sourceMessageId, view.text, { reply_markup: view.reply_markup });
    } else if (data === "inv:menu") {
      await answerCallbackQuery(token, cb.id);
      const menu = buildInventoryMenu();
      await editTelegramMessage(token, senderChatId, sourceMessageId, menu.text, { reply_markup: menu.reply_markup });
    } else if (data === "inv:search") {
      await answerCallbackQuery(token, cb.id);
      await sendTelegramMessage(token, senderChatId, "🔎 *Buscar producto para venta física*\n\nEscribe el nombre completo o una parte del nombre de la prenda.", {
        reply_markup: { force_reply: true, selective: true },
      });
      if (Number.isSafeInteger(sourceMessageId) && sourceMessageId > 0) {
        await deleteTelegramMessage(token, senderChatId, sourceMessageId);
      }
    } else if (data === "inv:restock") {
      await answerCallbackQuery(token, cb.id, "Preparando lista...");
      const store = await readStore();
      const items = (store.products || []).flatMap((product) => (product.variants || []).map((variant) => ({
        name: product.name,
        color: variant.color,
        size: variant.size,
        stock: Math.max(0, Number(variant.stock) || 0),
      }))).filter((item) => item.stock <= 2).sort((left, right) => left.stock - right.stock || String(left.name).localeCompare(String(right.name), "es"));
      const lines = items.slice(0, 30).map((item) => `• ${item.stock === 0 ? "🛑" : "⚠️"} *${escapeTelegramMarkdown(item.name)}* · ${escapeTelegramMarkdown(item.color)} · ${escapeTelegramMarkdown(item.size)} · ${item.stock}`);
      await editTelegramMessage(token, senderChatId, sourceMessageId, lines.length
        ? `📋 *Lista para revisar con el proveedor*\n\n${lines.join("\n")}${items.length > 30 ? `\n\n_Mostrando 30 de ${items.length} variantes._` : ""}`
        : "✅ *No hay variantes agotadas o con stock bajo.*", {
        reply_markup: { inline_keyboard: [[{ text: "🔄 Actualizar lista", callback_data: "inv:restock" }], [{ text: "↩️ Inventario", callback_data: "inv:menu" }]] },
      });
    } else if (data === "inv:undo-last") {
      await answerCallbackQuery(token, cb.id, "Revirtiendo última venta...");
      const result = await undoPhysicalStockSale(senderChatId, "", null, cb.id);
      await editTelegramMessage(token, senderChatId, sourceMessageId, result?.ok
        ? `↩️ *Venta física deshecha*\n\nSe devolvió *${result.event.quantity}* unidad(es) de *${escapeTelegramMarkdown(result.event.productName)}* (${escapeTelegramMarkdown(result.event.color)} / ${escapeTelegramMarkdown(result.event.size)}).\nStock actual: *${result.stock}*.`
        : "⚠️ No hay una venta física reciente para deshacer.", {
        reply_markup: { inline_keyboard: [[{ text: "↩️ Inventario", callback_data: "inv:menu" }]] },
      });
    } else if (data === "inv:nostock") {
      await answerCallbackQuery(token, cb.id, "Esta talla está agotada.");
    } else if (data.startsWith("inv:product:")) {
      await answerCallbackQuery(token, cb.id);
      const productToken = data.slice("inv:product:".length);
      const store = await readStore();
      const product = findProductByToken(store.products, productToken);
      const { colors } = getProductOptions(product);
      if (!product || !colors.length) {
        await editTelegramMessage(token, senderChatId, sourceMessageId, "⚠️ El producto ya no está disponible. Inicia otra búsqueda.", { reply_markup: { inline_keyboard: [[{ text: "🔎 Buscar otra", callback_data: "inv:search" }]] } });
      } else {
        await editTelegramMessage(token, senderChatId, sourceMessageId, `🎨 *${escapeTelegramMarkdown(product.name)}*\n\nSelecciona el color:`, {
          reply_markup: { inline_keyboard: [
            ...colors.map((color, index) => [{ text: color.slice(0, 48), callback_data: `inv:color:${productToken}:${index}` }]),
            [{ text: "↩️ Buscar otra", callback_data: "inv:search" }],
          ] },
        });
      }
    } else if (data.startsWith("inv:color:")) {
      await answerCallbackQuery(token, cb.id);
      const [, , productToken, rawColorIndex] = data.split(":");
      const colorIndex = Number(rawColorIndex);
      const store = await readStore();
      const product = findProductByToken(store.products, productToken);
      const { colors, variants } = getProductOptions(product);
      const color = colors[colorIndex];
      const colorVariants = variants.filter((variant) => variant.color === color);
      const sizes = [...new Set(colorVariants.map((variant) => String(variant.size || "").trim()).filter(Boolean))];
      if (!product || !color || !sizes.length) {
        await editTelegramMessage(token, senderChatId, sourceMessageId, "⚠️ La variante cambió. Vuelve a buscar el producto.", { reply_markup: { inline_keyboard: [[{ text: "🔎 Buscar", callback_data: "inv:search" }]] } });
      } else {
        await editTelegramMessage(token, senderChatId, sourceMessageId, `📏 *${escapeTelegramMarkdown(product.name)} · ${escapeTelegramMarkdown(color)}*\n\nSelecciona la talla:`, {
          reply_markup: { inline_keyboard: [
            ...sizes.map((size, index) => {
              const stock = Math.max(0, Number(colorVariants.find((variant) => variant.size === size)?.stock) || 0);
              return [{ text: `${size} · ${stock ? `${stock} disponibles` : "Agotada"}`, callback_data: stock ? `inv:size:${productToken}:${colorIndex}:${index}` : "inv:nostock" }];
            }),
            [{ text: "↩️ Cambiar color", callback_data: `inv:product:${productToken}` }],
          ] },
        });
      }
    } else if (data.startsWith("inv:size:")) {
      await answerCallbackQuery(token, cb.id);
      const [, , productToken, rawColorIndex, rawSizeIndex] = data.split(":");
      const colorIndex = Number(rawColorIndex);
      const sizeIndex = Number(rawSizeIndex);
      const store = await readStore();
      const product = findProductByToken(store.products, productToken);
      const { colors, variants } = getProductOptions(product);
      const color = colors[colorIndex];
      const colorVariants = variants.filter((variant) => variant.color === color);
      const sizes = [...new Set(colorVariants.map((variant) => String(variant.size || "").trim()).filter(Boolean))];
      const size = sizes[sizeIndex];
      const stock = Math.max(0, Number(colorVariants.find((variant) => variant.size === size)?.stock) || 0);
      if (!product || !color || !size || stock <= 0) {
        await editTelegramMessage(token, senderChatId, sourceMessageId, "⚠️ Esta variante está agotada o cambió. Elige otra.", { reply_markup: { inline_keyboard: [[{ text: "↩️ Volver a tallas", callback_data: `inv:color:${productToken}:${colorIndex}` }]] } });
      } else {
        const quantities = Array.from({ length: Math.min(5, stock) }, (_, index) => index + 1);
        await editTelegramMessage(token, senderChatId, sourceMessageId, `🔢 *Cantidad vendida*\n\n${escapeTelegramMarkdown(product.name)} · ${escapeTelegramMarkdown(color)} · ${escapeTelegramMarkdown(size)}\nStock actual: *${stock}*`, {
          reply_markup: { inline_keyboard: [
            quantities.map((quantity) => ({ text: String(quantity), callback_data: `inv:qty:${productToken}:${colorIndex}:${sizeIndex}:${quantity}` })),
            [{ text: "↩️ Cambiar talla", callback_data: `inv:color:${productToken}:${colorIndex}` }],
          ] },
        });
      }
    } else if (data.startsWith("inv:qty:")) {
      await answerCallbackQuery(token, cb.id);
      const [, , productToken, rawColorIndex, rawSizeIndex, rawQuantity] = data.split(":");
      const colorIndex = Number(rawColorIndex);
      const sizeIndex = Number(rawSizeIndex);
      const quantity = Number(rawQuantity);
      const store = await readStore();
      const product = findProductByToken(store.products, productToken);
      const { colors, variants } = getProductOptions(product);
      const color = colors[colorIndex];
      const colorVariants = variants.filter((variant) => variant.color === color);
      const sizes = [...new Set(colorVariants.map((variant) => String(variant.size || "").trim()).filter(Boolean))];
      const size = sizes[sizeIndex];
      const stock = Math.max(0, Number(colorVariants.find((variant) => variant.size === size)?.stock) || 0);
      if (!product || !color || !size || !Number.isInteger(quantity) || quantity < 1 || quantity > stock) {
        await editTelegramMessage(token, senderChatId, sourceMessageId, "⚠️ El stock cambió. Revisa de nuevo la variante.", { reply_markup: { inline_keyboard: [[{ text: "🔄 Revisar", callback_data: `inv:color:${productToken}:${colorIndex}` }]] } });
      } else {
        await editTelegramMessage(token, senderChatId, sourceMessageId, `🧾 *Confirma la venta física*\n\n*${escapeTelegramMarkdown(product.name)}* · ${escapeTelegramMarkdown(color)} · ${escapeTelegramMarkdown(size)}\nCantidad: *${quantity}* · Quedarán: *${stock - quantity}*`, {
          reply_markup: { inline_keyboard: [
            [{ text: "✅ Registrar venta", callback_data: `inv:sell:${productToken}:${colorIndex}:${sizeIndex}:${quantity}` }],
            [{ text: "↩️ Cambiar cantidad", callback_data: `inv:size:${productToken}:${colorIndex}:${sizeIndex}` }],
          ] },
        });
      }
    } else if (data.startsWith("inv:sell:")) {
      await answerCallbackQuery(token, cb.id, "Registrando venta...");
      const [, , productToken, rawColorIndex, rawSizeIndex, rawQuantity] = data.split(":");
      const result = await registerGuidedPhysicalSale({
        chatId: senderChatId,
        callbackId: cb.id,
        productToken,
        colorIndex: Number(rawColorIndex),
        sizeIndex: Number(rawSizeIndex),
        quantity: Number(rawQuantity),
      });
      if (result?.duplicate) {
        await editTelegramMessage(token, senderChatId, sourceMessageId, "ℹ️ Esta venta ya fue procesada.", {
          reply_markup: buildInventoryMenu().reply_markup,
        });
      } else if (result?.ok) {
        await editTelegramMessage(token, senderChatId, sourceMessageId, `✅ *Venta registrada*\n\n${escapeTelegramMarkdown(result.event.productName)} · ${escapeTelegramMarkdown(result.event.color)} · ${escapeTelegramMarkdown(result.event.size)}\nVendidas: *${result.event.quantity}* · Stock: *${result.stock}*`, {
          reply_markup: { inline_keyboard: [[{ text: "↩️ Deshacer venta", callback_data: `undo-stock:${result.event.id}` }], [{ text: "➕ Registrar otra", callback_data: "inv:search" }], [{ text: "📋 Ver reposición", callback_data: "inv:restock" }]] },
        });
      } else {
        await editTelegramMessage(token, senderChatId, sourceMessageId, `⚠️ El stock cambió y no se descontó. Disponible ahora: *${result?.stock || 0}*.`, { reply_markup: { inline_keyboard: [[{ text: "🔄 Volver a buscar", callback_data: "inv:search" }]] } });
      }
    } else if (data.startsWith("undo-stock:")) {
      const eventId = data.slice("undo-stock:".length);
      await answerCallbackQuery(token, cb.id, "Revirtiendo salida de stock...");
      const result = await undoPhysicalStockSale(senderChatId, eventId);
      if (result?.ok) {
        const event = result.event;
        await editTelegramMessage(token, senderChatId, sourceMessageId, `↩️ *Venta deshecha*\n\n${escapeTelegramMarkdown(event.productName)} · ${escapeTelegramMarkdown(event.color)} · ${escapeTelegramMarkdown(event.size)}\nDevueltas: *${event.quantity}* · Stock: *${result.stock}*`, { reply_markup: buildInventoryMenu().reply_markup });
      } else {
        await answerCallbackQuery(token, cb.id, "Esta venta ya fue deshecha.");
      }
    } else if (data.startsWith("status:")) {
      const parts = data.split(":");
      const targetAction = parts[1];
      const orderCode = parts.slice(2).join(":");

      const statusMap = {
        ready: "Listo para retiro",
        shipped: "Enviado",
        completed: "Entregado",
      };

      const newStatus = statusMap[targetAction] || "En preparación";
      let updatedOrder = null;

      // Answer Telegram UI immediately so button stops spinning
      await answerCallbackQuery(token, cb.id, "Actualizando pedido " + orderCode + "...");

      try {
        await updateStore((draft) => {
          const orders = Array.isArray(draft.orders) ? draft.orders : [];
          const targetIndex = orders.findIndex((order) => String(order.code).toUpperCase() === String(orderCode).toUpperCase());
          if (targetIndex >= 0) {
            orders[targetIndex] = {
              ...orders[targetIndex],
              status: newStatus,
              updatedAt: new Date().toISOString(),
            };
            updatedOrder = orders[targetIndex];
            draft.orders = [...orders];
            bumpRealtimeMeta(draft, ["orders"]);
          }
          return draft;
        });
      } catch (storeError) {
        console.error("[store-update-error]", storeError?.message || storeError);
      }

      if (updatedOrder) {
        await editTelegramMessage(token, senderChatId, sourceMessageId, formatTelegramOrderMessage(updatedOrder), {
          reply_markup: buildTelegramOrderKeyboard(updatedOrder),
        });
      } else {
        await editTelegramMessage(token, senderChatId, sourceMessageId, "⚠️ No encontré el pedido `" + orderCode + "`.", {
          reply_markup: { inline_keyboard: [[{ text: "↩️ Pedidos pendientes", callback_data: "pending:0" }]] },
        });
      }
    } else if (data.startsWith("address:")) {
      // Handle "Ver Dirección de Envío" button
      const orderCode = data.slice("address:".length);

      await answerCallbackQuery(token, cb.id, "Consultando dirección...");

      try {
        const store = await readStore();
        const orders = Array.isArray(store?.orders) ? store.orders : [];
        const found = orders.find((o) => String(o.code).toUpperCase() === String(orderCode).toUpperCase());

        if (found) {
          const addressLines = [
            "📍 *Dirección de Envío*",
            "━━━━━━━━━━━━━━━━━━━━",
            "📦 *Pedido:* `" + found.code + "`",
            "👤 *Destinatario:* " + escapeTelegramMarkdown(found.deliveryFullName || found.customerName || "Cliente"),
          ];
          if (found.deliveryIdNumber) addressLines.push("🪪 *Cédula/RUC:* `" + escapeTelegramMarkdown(found.deliveryIdNumber) + "`");
          if (found.deliveryPhone || found.customerPhone) addressLines.push("📞 *Teléfono:* `" + escapeTelegramMarkdown(found.deliveryPhone || found.customerPhone) + "`");
          if (found.deliveryCity) addressLines.push("🏙️ *Ciudad:* " + escapeTelegramMarkdown(found.deliveryCity));
          if (found.deliveryAddress) addressLines.push("🏠 *Dirección:* " + escapeTelegramMarkdown(found.deliveryAddress));
          if (found.deliveryReference) addressLines.push("🧭 *Referencia:* " + escapeTelegramMarkdown(found.deliveryReference));
          await editTelegramMessage(token, senderChatId, sourceMessageId, addressLines.filter((line) => line !== "━━━━━━━━━━━━━━━━━━━━").join("\n"), {
            reply_markup: { inline_keyboard: [[{ text: "↩️ Volver al pedido", callback_data: `view:${orderCode}` }]] },
          });
        } else {
          await editTelegramMessage(token, senderChatId, sourceMessageId, "⚠️ No encontré el pedido `" + orderCode + "`.", {
            reply_markup: { inline_keyboard: [[{ text: "↩️ Pedidos pendientes", callback_data: "pending:0" }]] },
          });
        }
      } catch (err) {
        console.error("[address-lookup-error]", err?.message || err);
        await answerCallbackQuery(token, cb.id, "No pude consultar la dirección.");
      }
    } else if (data.startsWith("proof:")) {
      // Handle "Ver Comprobante" button
      const orderCode = data.slice("proof:".length);

      await answerCallbackQuery(token, cb.id, "Buscando comprobante...");

      try {
        const store = await readStore();
        const orders = Array.isArray(store?.orders) ? store.orders : [];
        const found = orders.find((o) => String(o.code).toUpperCase() === String(orderCode).toUpperCase());

        if (!found) {
          await editTelegramMessage(token, senderChatId, sourceMessageId, "⚠️ Pedido `" + orderCode + "` no encontrado.", {
            reply_markup: { inline_keyboard: [[{ text: "↩️ Pedidos pendientes", callback_data: "pending:0" }]] },
          });
        } else if (!found.paymentProof) {
          await editTelegramMessage(
            token,
            senderChatId,
            sourceMessageId,
            "ℹ️ El pedido `" + orderCode + "` no tiene comprobante de pago adjunto (posiblemente pagó con tarjeta o aún no ha subido el comprobante).",
            {
              reply_markup: { inline_keyboard: [[{ text: "↩️ Volver al pedido", callback_data: `view:${orderCode}` }]] },
            }
          );
        } else {
          const bankName = found.paymentBankAccount?.bankName || "";
          const caption = "📸 *Comprobante de Pago*\n━━━━━━━━━━━━━━━━━━━━\n📦 *Pedido:* `" + found.code + "`\n👤 *Cliente:* " + escapeTelegramMarkdown(found.customerName || "Cliente") + "\n💰 *Monto:* *" + currency(found.total ?? found.subtotal) + "*" + (bankName ? "\n🏦 *Banco:* " + escapeTelegramMarkdown(bankName) : "") + "\n━━━━━━━━━━━━━━━━━━━━\n⚡ [Ver en Panel Admin](https://adriego.vercel.app/admin)";

          const photoResult = await sendTelegramPhoto(token, senderChatId, found.paymentProof, caption, {
            reply_markup: {
              inline_keyboard: [[{ text: "↩️ Volver al pedido", callback_data: `view:${orderCode}` }]],
            },
          });
          if (!photoResult?.ok) {
            await editTelegramMessage(
              token,
              senderChatId,
              sourceMessageId,
              "⚠️ No pudimos enviar la foto directamente por Telegram. Puedes revisarlo en el [Panel Admin](https://adriego.vercel.app/admin).",
              {
                reply_markup: { inline_keyboard: [[{ text: "↩️ Volver al pedido", callback_data: `view:${orderCode}` }]] },
              }
            );
          }
        }
      } catch (err) {
        console.error("[proof-lookup-error]", err?.message || err);
        await editTelegramMessage(token, senderChatId, sourceMessageId, "⚠️ Error al consultar el comprobante de pago.", {
          reply_markup: { inline_keyboard: [[{ text: "↩️ Volver al pedido", callback_data: `view:${orderCode}` }]] },
        });
      }
    } else if (data.startsWith("view:")) {
      // Handle "Ver ORDER-XXXX" button
      const orderCode = data.slice("view:".length);

      await answerCallbackQuery(token, cb.id, "Abriendo " + orderCode + "...");

      try {
        const store = await readStore();
        const orders = Array.isArray(store?.orders) ? store.orders : [];
        const found = orders.find((o) => String(o.code).toUpperCase() === String(orderCode).toUpperCase());

        if (found) {
          const cardText = formatTelegramOrderMessage(found);
          const keyboard = buildTelegramOrderKeyboard(found);
          await editTelegramMessage(token, senderChatId, sourceMessageId, cardText, { reply_markup: keyboard });
        } else {
          await editTelegramMessage(token, senderChatId, sourceMessageId, "⚠️ Pedido `" + orderCode + "` no encontrado.", {
            reply_markup: { inline_keyboard: [[{ text: "↩️ Pedidos pendientes", callback_data: "pending:0" }]] },
          });
        }
      } catch (err) {
        console.error("[view-order-error]", err?.message || err);
        await editTelegramMessage(token, senderChatId, sourceMessageId, "⚠️ Error al abrir el pedido.", {
          reply_markup: { inline_keyboard: [[{ text: "↩️ Pedidos pendientes", callback_data: "pending:0" }]] },
        });
      }
    } else if (data.startsWith("courier:")) {
      // Handle "Formato Courier" button
      const orderCode = data.slice("courier:".length);
      await answerCallbackQuery(token, cb.id, "Generando formato courier...");

      try {
        const store = await readStore();
        const orders = Array.isArray(store?.orders) ? store.orders : [];
        const found = orders.find((o) => String(o.code).toUpperCase() === String(orderCode).toUpperCase());

        if (found) {
          const courierLines = [
            "📋 *DATOS DE DESPACHO · COURIER*",
            "━━━━━━━━━━━━━━━━━━━━",
            "*DESTINATARIO:* " + escapeTelegramMarkdown(found.deliveryFullName || found.customerName || "Cliente"),
          ];
          if (found.deliveryIdNumber) courierLines.push("*CÉDULA/RUC:* `" + escapeTelegramMarkdown(found.deliveryIdNumber) + "`");
          if (found.deliveryPhone || found.customerPhone) courierLines.push("*TELÉFONO:* `" + escapeTelegramMarkdown(found.deliveryPhone || found.customerPhone) + "`");
          if (found.deliveryCity) courierLines.push("*CIUDAD:* " + escapeTelegramMarkdown(found.deliveryCity));
          if (found.deliveryAddress) courierLines.push("*DIRECCIÓN:* " + escapeTelegramMarkdown(found.deliveryAddress));
          if (found.deliveryReference) courierLines.push("*REFERENCIA:* " + escapeTelegramMarkdown(found.deliveryReference));
          courierLines.push(
            "*CONTENIDO:* Prendas de vestir / Ropa",
            "*VALOR DECLARADO:* *" + currency(found.total ?? found.subtotal) + "*",
            "━━━━━━━━━━━━━━━━━━━━",
            "✂️ _Copia este texto para la app o guía de Servientrega / Courier._",
          );

          await editTelegramMessage(token, senderChatId, sourceMessageId, courierLines.filter((line) => line !== "━━━━━━━━━━━━━━━━━━━━").join("\n"), {
            reply_markup: { inline_keyboard: [[{ text: "↩️ Volver al pedido", callback_data: `view:${orderCode}` }]] },
          });
        } else {
          await editTelegramMessage(token, senderChatId, sourceMessageId, "⚠️ Pedido `" + orderCode + "` no encontrado.", {
            reply_markup: { inline_keyboard: [[{ text: "↩️ Pedidos pendientes", callback_data: "pending:0" }]] },
          });
        }
      } catch (err) {
        console.error("[courier-format-error]", err?.message || err);
        await editTelegramMessage(token, senderChatId, sourceMessageId, "⚠️ Error al generar formato courier.", {
          reply_markup: { inline_keyboard: [[{ text: "↩️ Pedidos pendientes", callback_data: "pending:0" }]] },
        });
      }
    } else if (data.startsWith("setguia:")) {
      const orderCode = data.slice("setguia:".length);
      await answerCallbackQuery(token, cb.id, "Registrar guía...");

      const promptMsg = "📦 *Registrar Guía de Envío*\n━━━━━━━━━━━━━━━━━━━━\nPedido: `" + orderCode + "`\n\n👇 _Selecciona el courier con un toque:_";
      const courierButtons = [
        [
          { text: "🚚 Servientrega", callback_data: "quick_guia:" + orderCode + ":Servientrega" },
          { text: "📦 LaarCourier", callback_data: "quick_guia:" + orderCode + ":LaarCourier" },
        ],
        [
          { text: "🚛 Tramaco", callback_data: "quick_guia:" + orderCode + ":Tramaco" },
          { text: "🚌 Encomienda", callback_data: "quick_guia:" + orderCode + ":Encomienda" },
        ],
      ];

      await editTelegramMessage(token, senderChatId, sourceMessageId, promptMsg, {
        reply_markup: {
          inline_keyboard: [...courierButtons, [{ text: "↩️ Volver al pedido", callback_data: `view:${orderCode}` }]],
        },
      });
    } else if (data.startsWith("quick_guia:")) {
      const parts = data.split(":");
      const orderCode = parts[1];
      const courierName = parts[2];
      await answerCallbackQuery(token, cb.id, courierName + " seleccionado");

      const instructMsg = "📦 Pedido: `" + orderCode + "`\n🚚 Courier: *" + courierName + "*\n\nResponde únicamente con el número de guía.";
      const promptResult = await sendTelegramMessage(token, senderChatId, instructMsg, {
        reply_markup: {
          force_reply: true,
          selective: true,
          input_field_placeholder: "Número de guía",
        },
      });

      if (Number.isSafeInteger(sourceMessageId) && sourceMessageId > 0) {
        await deleteTelegramMessage(token, senderChatId, sourceMessageId);
      }

      const promptData = {
        orderCode,
        courierName,
        promptMessageId: Number(promptResult?.result?.message_id) || null,
        expiresAt: Date.now() + 15 * 60 * 1000,
      };

      PENDING_GUIDE_PROMPTS.set(senderChatId, promptData);

      try {
        await updateStore((draft) => {
          if (!draft.meta) draft.meta = {};
          const pending = { ...(draft.meta.pendingGuidePrompts || {}) };
          const now = Date.now();
          for (const [cid, data] of Object.entries(pending)) {
            if (!data?.expiresAt || data.expiresAt < now) delete pending[cid];
          }
          pending[senderChatId] = promptData;
          draft.meta.pendingGuidePrompts = pending;
          return draft;
        });
      } catch (persistErr) {
        console.error("[persist-guide-prompt-error]", persistErr?.message || persistErr);
      }
    }

    res.status(200).json({ ok: true, handledCallback: true });
    return;
  }

  // 2. Handle Direct Message
  const message = update.message || update.edited_message || update.channel_post;
  if (!message || !message.chat) {
    res.status(200).json({ ok: true, skipped: true });
    return;
  }

  const senderChatId = String(message.chat.id).trim();
  const senderName = message.from?.first_name || message.chat.first_name || "Usuario";

  // Strict Security Check: Whitelist only
  if (!isAuthorizedAdminChatId(senderChatId)) {
    logSecurityEvent(ENDPOINT_NAME, "unauthorized-telegram-access-blocked", {
      senderChatId,
      senderUsername: message.from?.username || "unknown",
      ip: clientIp,
    });

    await sendTelegramMessage(
      token,
      senderChatId,
      "🔒 *Acceso Restringido*\n\nEste bot es de uso privado y exclusivo de administración para *Adriego Store*.",
    );

    res.status(200).json({ ok: true, authorized: false });
    return;
  }

  const text = String(message.text || "").trim();
  const lowerText = text.toLowerCase();
  if (!update.message && (/^\/(venta|deshacer)(\s|$)/i.test(text) || lowerText === "deshacer venta")) {
    res.status(200).json({ ok: true, skipped: true });
    return;
  }

  // 1. Instant Guide Registration (Click Courier -> Type Number -> Done!)
  const replyText = String(message.reply_to_message?.text || "");
  if (replyText.includes("Buscar producto para venta física") && text && !text.startsWith("/")) {
    await sendInventorySearchResults(token, senderChatId, text, message.reply_to_message?.message_id);
    res.status(200).json({ ok: true, authorized: true });
    return;
  }
  if (replyText.includes("Buscar pedido") && text && !text.startsWith("/")) {
    const store = await readStore();
    const query = text.toUpperCase();
    const found = (store.orders || []).find((order) => (
      String(order.code || "").toUpperCase().includes(query)
      || String(order.customerName || "").toUpperCase().includes(query)
    ));
    if (found) {
      await editTelegramMessage(token, senderChatId, message.reply_to_message?.message_id, formatTelegramOrderMessage(found), {
        reply_markup: buildTelegramOrderKeyboard(found),
      });
    } else {
      await editTelegramMessage(token, senderChatId, message.reply_to_message?.message_id, `🔍 *Sin resultados*\n\nNo encontré un pedido para “${escapeTelegramMarkdown(text)}”.`, {
        reply_markup: { inline_keyboard: [[{ text: "🔎 Buscar otra vez", callback_data: "search-order" }], [{ text: "⌂ Inicio", callback_data: "home" }]] },
      });
    }
    res.status(200).json({ ok: true, authorized: true });
    return;
  }
  const replyMatch = replyText.match(/Pedido:\s*`?([A-Za-z0-9-]+)`?.*Courier:\s*\*?([A-Za-z0-9\s]+)\*?/is);
  if (replyMatch && text && !text.startsWith("/")) {
    const orderCode = replyMatch[1];
    const courierName = replyMatch[2].trim();
    const trackingNumber = text.trim();
    PENDING_GUIDE_PROMPTS.delete(senderChatId);
    await applyOrderGuideRegistration(token, senderChatId, orderCode, courierName, trackingNumber, message.reply_to_message?.message_id);
    res.status(200).json({ ok: true, authorized: true });
    return;
  }

  let pendingPrompt = PENDING_GUIDE_PROMPTS.get(senderChatId);
  if (!pendingPrompt || pendingPrompt.expiresAt <= Date.now()) {
    try {
      const store = await readStore();
      const persisted = store?.meta?.pendingGuidePrompts?.[senderChatId];
      if (persisted && persisted.expiresAt > Date.now()) {
        pendingPrompt = persisted;
      }
    } catch (err) {
      console.error("[read-persisted-guide-prompt-error]", err?.message || err);
    }
  }

  if (
    pendingPrompt
    && pendingPrompt.expiresAt > Date.now()
    && text
    && !text.startsWith("/")
    && !lowerText.includes("ventas")
    && !lowerText.includes("resumen")
    && !lowerText.includes("pendientes")
    && !lowerText.includes("pedidos")
    && !lowerText.includes("stock")
    && !lowerText.includes("buscar")
    && !lowerText.includes("inventario")
    && !lowerText.includes("ayuda")
    && !lowerText.includes("help")
    && lowerText !== "deshacer venta"
  ) {
    PENDING_GUIDE_PROMPTS.delete(senderChatId);
    const trackingNumber = text.trim();
    await applyOrderGuideRegistration(token, senderChatId, pendingPrompt.orderCode, pendingPrompt.courierName, trackingNumber, pendingPrompt.promptMessageId);
    res.status(200).json({ ok: true, authorized: true });
    return;
  }

  // Command Handlers for Admin
  if (lowerText === "/start" || lowerText === "hola" || lowerText === "/menu" || lowerText === "menu") {
    const store = await readStore();
    const home = buildAdminHome(store, senderName);
    await sendTelegramMessage(token, senderChatId, home.text, { reply_markup: home.reply_markup });
  } else if (lowerText === "📊 resumen" || lowerText === "📊 ventas de hoy" || lowerText === "/ventas" || lowerText === "ventas" || lowerText === "/resumen" || lowerText === "resumen") {
    const store = await readStore();
    const view = buildSummaryView(store.orders);
    await sendTelegramMessage(token, senderChatId, view.text, { reply_markup: view.reply_markup });
  } else if (lowerText === "📦 pedidos" || lowerText === "📦 pedidos pendientes" || lowerText === "/pendientes" || lowerText === "pendientes" || lowerText === "/pedidos" || lowerText === "pedidos") {
    const store = await readStore();
    const view = buildPendingOrdersView(store.orders, 0);
    await sendTelegramMessage(token, senderChatId, view.text, { reply_markup: view.reply_markup });
  } else if (lowerText === "⚠️ stock bajo" || lowerText === "/stock_bajo" || lowerText === "stock bajo") {
    const store = await readStore();
    const view = buildLowStockView(store.products);
    await sendTelegramMessage(token, senderChatId, view.text, { reply_markup: view.reply_markup });
  } else if (lowerText === "/ayuda" || lowerText === "/help" || lowerText === "/comandos" || lowerText === "ayuda") {
    await sendTelegramMessage(token, senderChatId, formatHelpMessage(), {
      reply_markup: {
        inline_keyboard: [
          [{ text: "📦 Pedidos pendientes", callback_data: "pending:0" }],
          [{ text: "⌂ Inicio", callback_data: "home" }],
        ],
      },
    });
  } else if (lowerText === "🛍️ inventario" || lowerText.includes("inventario físico") || lowerText.includes("inventario fisico")) {
    const menu = buildInventoryMenu();
    await sendTelegramMessage(token, senderChatId, menu.text, { reply_markup: menu.reply_markup });
  } else if (lowerText.startsWith("/stock ")) {
    const query = text.replace(/^\/stock\s+/i, "").trim().toLowerCase();
    const store = await readStore();
    const matches = (Array.isArray(store?.products) ? store.products : []).filter((product) => String(product.name || "").toLowerCase().includes(query)).slice(0, 8);
    if (!matches.length) {
      await sendTelegramMessage(token, senderChatId, "🔍 No encontré prendas que coincidan con *" + escapeTelegramMarkdown(query) + "*.");
    } else {
      const lines = matches.map((product) => {
        const variants = (product.variants || []).map((variant) => "• " + escapeTelegramMarkdown(variant.color) + " / " + escapeTelegramMarkdown(variant.size) + ": *" + Math.max(0, Number(variant.stock) || 0) + "*").join("\n");
        return "👗 *" + escapeTelegramMarkdown(product.name) + "*\n" + variants;
      });
      await sendTelegramMessage(token, senderChatId, "🔎 *Stock disponible*\n━━━━━━━━━━━━━━━━━━━━\n" + lines.join("\n\n"));
    }
  } else if (lowerText.startsWith("/venta ")) {
    const parts = text.replace(/^\/venta\s+/i, "").split("|").map((part) => part.trim());
    const quantity = Number(parts[3]);
    if (parts.length !== 4 || !parts[0] || !parts[1] || !parts[2] || !Number.isInteger(quantity) || quantity < 1) {
      await sendTelegramMessage(token, senderChatId, "⚠️ Usa: `/venta nombre | color | talla | cantidad`\nEjemplo: `/venta Clasica | Azul | M | 1`");
    } else {
      let result = null;
      await updateStore((draft) => {
        if (!claimInventoryMessage(draft, senderChatId, message.message_id)) { result = { duplicate: true }; return draft; }
        const matches = (draft.products || []).filter((item) => String(item.name || "").toLowerCase() === parts[0].toLowerCase());
        const product = matches.length === 1 ? matches[0] : null;
        const variant = product?.variants?.find((item) => String(item.color || "").toLowerCase() === parts[1].toLowerCase() && String(item.size || "").toLowerCase() === parts[2].toLowerCase());
        if (!variant || !Number.isSafeInteger(Number(variant.stock)) || Number(variant.stock) < quantity) { result = { ok: false, stock: Math.max(0, Number(variant?.stock) || 0) }; return draft; }
        variant.stock -= quantity;
        refreshProductStock(product);
        const event = {
          id: `physical-${randomUUID()}`,
          chatId: senderChatId,
          productId: String(product.id || ""),
          productName: String(product.name || parts[0]),
          color: String(variant.color || parts[1]),
          size: String(variant.size || parts[2]),
          quantity,
          status: "active",
          createdAt: new Date().toISOString(),
        };
        draft.physicalStockEvents = [...(Array.isArray(draft.physicalStockEvents) ? draft.physicalStockEvents : []), event].slice(-80);
        result = { ok: true, stock: variant.stock, event };
        bumpRealtimeMeta(draft, ["catalog"]);
        return draft;
      });
      if (result?.duplicate) { res.status(200).json({ ok: true, duplicate: true }); return; }
      await sendTelegramMessage(token, senderChatId, result?.ok ? `✅ Venta registrada. Quedan *${result.stock}* unidades de ${escapeTelegramMarkdown(parts[0])} (${escapeTelegramMarkdown(parts[1])} / ${escapeTelegramMarkdown(parts[2])}).` : `⚠️ No se pudo descontar. Stock disponible: *${result?.stock || 0}*.`, result?.ok ? {
        reply_markup: { inline_keyboard: [[{ text: "↩️ Deshacer venta", callback_data: `undo-stock:${result.event.id}` }]] },
      } : undefined);
    }
  } else if (lowerText === "/deshacer venta" || lowerText === "/deshacer" || lowerText === "deshacer venta") {
    const result = await undoPhysicalStockSale(senderChatId, "", message.message_id);
    if (result?.ok) {
      const event = result.event;
      await sendTelegramMessage(token, senderChatId, `↩️ *Venta física deshecha*\n\nSe devolvió *${event.quantity}* unidad(es) de *${escapeTelegramMarkdown(event.productName)}* (${escapeTelegramMarkdown(event.color)} / ${escapeTelegramMarkdown(event.size)}).\nStock actual: *${result.stock}*.`);
    } else {
      await sendTelegramMessage(token, senderChatId, "⚠️ No hay una venta física reciente para deshacer.");
    }
  } else if (lowerText.startsWith("/guia") || lowerText.startsWith("guia ")) {
    const rawArgs = text.replace(/^[/]?guia\s*/i, "").trim().split(/\s+/);
    if (rawArgs.length < 2) {
      const usageMsg = "⚠️ *Uso del comando /guia:*\n\n`/guia <CÓDIGO> <COURIER> <NÚMERO>`\n\n*Ejemplos:*\n• `/guia ORDER-10099 Tramaco 1234567890`\n• `/guia ORDER-10099 Servientrega 1234567890`\n• `/guia ORDER-10099 LaarCourier 98765432`\n• `/guia ORDER-10099 1234567890`\n\n💡 _Tip: También puedes tocar el botón [📦 Asignar Guía] en el pedido y solo escribir el número._";
      await sendTelegramMessage(token, senderChatId, usageMsg);
      res.status(200).json({ ok: true });
      return;
    }

    const orderQuery = rawArgs[0].toUpperCase();
    let courierName = "Tramaco";
    let trackingNumber = "";

    if (rawArgs.length === 2) {
      trackingNumber = rawArgs[1];
    } else {
      courierName = rawArgs[1];
      trackingNumber = rawArgs.slice(2).join(" ");
    }

    PENDING_GUIDE_PROMPTS.delete(senderChatId);
    await applyOrderGuideRegistration(token, senderChatId, orderQuery, courierName, trackingNumber);
    res.status(200).json({ ok: true, authorized: true });
    return;
  } else if (lowerText === "🔍 buscar" || lowerText.includes("buscar pedido") || lowerText === "🔍 buscar pedido") {
    const msg = "🔍 *Buscar pedido*\n\nResponde con el código o el nombre del cliente.";
    await sendTelegramMessage(token, senderChatId, msg, {
      reply_markup: { force_reply: true, selective: true, input_field_placeholder: "Ej. ORDER-10099 o María" },
    });
  } else if (lowerText.startsWith("/buscar") || lowerText.startsWith("buscar")) {
    const query = text.replace(/^[/]?buscar\s*/i, "").trim().toUpperCase();
    const store = await readStore();
    const orders = Array.isArray(store?.orders) ? store.orders : [];
    const found = orders.find((o) => String(o.code).toUpperCase().includes(query) || String(o.customerName || "").toUpperCase().includes(query));

    if (!found) {
      await sendTelegramMessage(token, senderChatId, "🔍 No se encontró ningún pedido que coincida con \"" + query + "\".");
    } else {
      const cardText = formatTelegramOrderMessage(found);
      const keyboard = buildTelegramOrderKeyboard(found);
      await sendTelegramMessage(token, senderChatId, cardText, { reply_markup: keyboard });
    }
  } else {
    await sendTelegramMessage(
      token,
      senderChatId,
      "🤖 *Comando no reconocido.*\n\nToca cualquiera de los botones de abajo para consultar:",
    );
  }

  res.status(200).json({ ok: true, authorized: true });
}

export {
  deleteTelegramMessage,
  sendTelegramMessage,
  editTelegramMessage,
  sendTelegramPhoto,
  buildSummaryView,
  buildLowStockView,
  buildPendingOrdersView,
  buildAdminHome,
  buildInventoryMenu,
  formatHelpMessage,
  TELEGRAM_BOT_COMMANDS,
  registerTelegramBotCommands,
  PENDING_GUIDE_PROMPTS,
};
