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
} from "./_lib/notifications.js";

const ENDPOINT_NAME = "telegram-webhook";

function currency(value) {
  return new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" }).format(Number(value) || 0);
}

const ADMIN_KEYBOARD_MARKUP = {
  keyboard: [
    [{ text: "📊 Ventas de Hoy" }, { text: "📦 Pedidos Pendientes" }],
    [{ text: "⚠️ Stock Bajo" }, { text: "🔍 Buscar Pedido" }],
    [{ text: "🛍️ Inventario físico" }],
  ],
  resize_keyboard: true,
  is_persistent: true,
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
    await fetch("https://api.telegram.org/bot" + token + "/sendMessage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error("[sendTelegramMessage-error]", err?.message || err);
  }
}

async function sendTelegramPhoto(token, chatId, photoSource, caption = "") {
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

async function sendInventorySearchResults(token, chatId, query) {
  const normalizedQuery = String(query || "").trim().toLocaleLowerCase("es");
  const store = await readStore();
  const products = Array.isArray(store?.products) ? store.products : [];
  const matches = products.filter((product) => String(product.name || "").toLocaleLowerCase("es").includes(normalizedQuery)).slice(0, 8);
  if (!matches.length) {
    await sendTelegramMessage(token, chatId, `🔍 No encontré prendas que coincidan con *${escapeTelegramMarkdown(query)}*.`, {
      reply_markup: { inline_keyboard: [[{ text: "🔎 Buscar otra", callback_data: "inv:search" }], [{ text: "↩️ Inventario", callback_data: "inv:menu" }]] },
    });
    return;
  }
  await sendTelegramMessage(token, chatId, `👗 *Selecciona el producto*\n\nEncontré ${matches.length} coincidencia${matches.length === 1 ? "" : "s"} para “${escapeTelegramMarkdown(query)}”.`, {
    reply_markup: {
      inline_keyboard: [
        ...matches.map((product) => [{ text: String(product.name || "Producto").slice(0, 48), callback_data: `inv:product:${getProductToken(product.id)}` }]),
        [{ text: "🔎 Buscar otra", callback_data: "inv:search" }],
        [{ text: "↩️ Inventario", callback_data: "inv:menu" }],
      ],
    },
  });
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

async function applyOrderGuideRegistration(token, senderChatId, orderQuery, courierName, trackingNumber) {
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
      return draft;
    });
  } catch (storeErr) {
    console.error("[update-guia-error]", storeErr?.message || storeErr);
  }

  if (updatedOrder) {
    const rawPhone = String(updatedOrder.customerPhone || "").replace(/\D/g, "");
    let intlPhone = rawPhone;
    if (rawPhone.startsWith("0") && rawPhone.length === 10) {
      intlPhone = "593" + rawPhone.slice(1);
    } else if (rawPhone.length === 9) {
      intlPhone = "593" + rawPhone;
    }

    const customerName = updatedOrder.customerName || "Cliente";
    const destCity = updatedOrder.deliveryCity ? " a " + updatedOrder.deliveryCity : "";
    const waGuiaText = "¡Hola " + customerName + "! ✨ Te saludamos de Adriego Store. Tu pedido " + updatedOrder.code + " ya fue ENVIADO" + destCity + " 🚚📦 por " + cleanCourier + ".\n\n🔢 Número de Guía: " + cleanNumber + "\n\n¡Muchas gracias por tu compra!";
    const waUrl = intlPhone ? "https://wa.me/" + intlPhone + "?text=" + encodeURIComponent(waGuiaText) : null;

    const guiaButtons = [];
    const row1 = [];
    if (waUrl) {
      row1.push({ text: "💬 Enviar Guía por WhatsApp", url: waUrl });
    }
    guiaButtons.push(row1);
    guiaButtons.push([{ text: "📦 Ver Siguiente Pendiente", callback_data: "quick_pendientes" }]);

    const successMsg = "✅ *Guía Registrada y Pedido Marcado como Enviado*\n━━━━━━━━━━━━━━━━━━━━\n📦 *Pedido:* `" + updatedOrder.code + "`\n🚚 *Courier:* *" + cleanCourier + "*\n🔢 *No. Guía:* `" + cleanNumber + "`\n🏷️ *Estado:* *Enviado*\n👤 *Cliente:* " + escapeTelegramMarkdown(customerName) + " (" + (updatedOrder.customerPhone || "N/A") + ")\n━━━━━━━━━━━━━━━━━━━━\n👇 _Toca abajo para enviar la guía y datos de rastreo al cliente por WhatsApp:_";

    await sendTelegramMessage(token, senderChatId, successMsg, {
      reply_markup: {
        inline_keyboard: guiaButtons,
      },
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

    if (!isAuthorizedAdminChatId(senderChatId)) {
      await answerCallbackQuery(token, cb.id, "🔒 Acción no autorizada.");
      res.status(200).json({ ok: true, authorized: false });
      return;
    }

    if (data === "inv:menu") {
      await answerCallbackQuery(token, cb.id);
      await sendTelegramMessage(token, senderChatId, "🛍️ *Inventario físico*\n\nElige qué necesitas hacer:", {
        reply_markup: { inline_keyboard: [
          [{ text: "➖ Registrar venta", callback_data: "inv:search" }],
          [{ text: "📋 Lista para proveedor", callback_data: "inv:restock" }],
          [{ text: "↩️ Deshacer última venta", callback_data: "inv:undo-last" }],
        ] },
      });
    } else if (data === "inv:search") {
      await answerCallbackQuery(token, cb.id);
      await sendTelegramMessage(token, senderChatId, "🔎 *Buscar producto para venta física*\n\nEscribe el nombre completo o una parte del nombre de la prenda.", {
        reply_markup: { force_reply: true, selective: true },
      });
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
      await sendTelegramMessage(token, senderChatId, lines.length
        ? `📋 *Lista para revisar con el proveedor*\n\n${lines.join("\n")}${items.length > 30 ? `\n\n_Mostrando 30 de ${items.length} variantes._` : ""}`
        : "✅ *No hay variantes agotadas o con stock bajo.*", {
        reply_markup: { inline_keyboard: [[{ text: "🔄 Actualizar lista", callback_data: "inv:restock" }], [{ text: "↩️ Inventario", callback_data: "inv:menu" }]] },
      });
    } else if (data === "inv:undo-last") {
      await answerCallbackQuery(token, cb.id, "Revirtiendo última venta...");
      const result = await undoPhysicalStockSale(senderChatId, "", null, cb.id);
      await sendTelegramMessage(token, senderChatId, result?.ok
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
        await sendTelegramMessage(token, senderChatId, "⚠️ El producto ya no está disponible. Inicia otra búsqueda.", { reply_markup: { inline_keyboard: [[{ text: "🔎 Buscar otra", callback_data: "inv:search" }]] } });
      } else {
        await sendTelegramMessage(token, senderChatId, `🎨 *${escapeTelegramMarkdown(product.name)}*\n\nSelecciona el color:`, {
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
        await sendTelegramMessage(token, senderChatId, "⚠️ La variante cambió. Vuelve a buscar el producto.", { reply_markup: { inline_keyboard: [[{ text: "🔎 Buscar", callback_data: "inv:search" }]] } });
      } else {
        await sendTelegramMessage(token, senderChatId, `📏 *${escapeTelegramMarkdown(product.name)} · ${escapeTelegramMarkdown(color)}*\n\nSelecciona la talla:`, {
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
        await sendTelegramMessage(token, senderChatId, "⚠️ Esta variante está agotada o cambió. Elige otra.", { reply_markup: { inline_keyboard: [[{ text: "↩️ Volver a tallas", callback_data: `inv:color:${productToken}:${colorIndex}` }]] } });
      } else {
        const quantities = Array.from({ length: Math.min(5, stock) }, (_, index) => index + 1);
        await sendTelegramMessage(token, senderChatId, `🔢 *Cantidad vendida*\n\n${escapeTelegramMarkdown(product.name)} · ${escapeTelegramMarkdown(color)} · ${escapeTelegramMarkdown(size)}\nStock actual: *${stock}*`, {
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
        await sendTelegramMessage(token, senderChatId, "⚠️ El stock cambió. Revisa de nuevo la variante.", { reply_markup: { inline_keyboard: [[{ text: "🔄 Revisar", callback_data: `inv:color:${productToken}:${colorIndex}` }]] } });
      } else {
        await sendTelegramMessage(token, senderChatId, `🧾 *Confirma la venta física*\n\nPrenda: *${escapeTelegramMarkdown(product.name)}*\nColor: ${escapeTelegramMarkdown(color)}\nTalla: ${escapeTelegramMarkdown(size)}\nCantidad: *${quantity}*\nQuedarán: *${stock - quantity}*`, {
          reply_markup: { inline_keyboard: [
            [{ text: "✅ Confirmar descuento", callback_data: `inv:sell:${productToken}:${colorIndex}:${sizeIndex}:${quantity}` }],
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
        await sendTelegramMessage(token, senderChatId, "ℹ️ Esta venta ya había sido procesada.");
      } else if (result?.ok) {
        await sendTelegramMessage(token, senderChatId, `✅ *Venta física registrada*\n\n${escapeTelegramMarkdown(result.event.productName)} · ${escapeTelegramMarkdown(result.event.color)} · ${escapeTelegramMarkdown(result.event.size)}\nDescontadas: *${result.event.quantity}*\nStock restante: *${result.stock}*`, {
          reply_markup: { inline_keyboard: [[{ text: "↩️ Deshacer venta", callback_data: `undo-stock:${result.event.id}` }], [{ text: "➕ Registrar otra", callback_data: "inv:search" }], [{ text: "📋 Ver reposición", callback_data: "inv:restock" }]] },
        });
      } else {
        await sendTelegramMessage(token, senderChatId, `⚠️ El stock cambió y no se descontó. Disponible ahora: *${result?.stock || 0}*.`, { reply_markup: { inline_keyboard: [[{ text: "🔄 Volver a buscar", callback_data: "inv:search" }]] } });
      }
    } else if (data.startsWith("undo-stock:")) {
      const eventId = data.slice("undo-stock:".length);
      await answerCallbackQuery(token, cb.id, "Revirtiendo salida de stock...");
      const result = await undoPhysicalStockSale(senderChatId, eventId);
      if (result?.ok) {
        const event = result.event;
        await sendTelegramMessage(token, senderChatId, `↩️ *Venta física deshecha*\n\nSe devolvió *${event.quantity}* unidad(es) de *${escapeTelegramMarkdown(event.productName)}* (${escapeTelegramMarkdown(event.color)} / ${escapeTelegramMarkdown(event.size)}).\nStock actual: *${result.stock}*.`);
      } else {
        await sendTelegramMessage(token, senderChatId, "⚠️ Esta salida ya fue deshecha o no se pudo encontrar la variante.");
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
        const rawPhone = String(updatedOrder.customerPhone || "").replace(/\D/g, "");
        let intlPhone = rawPhone;
        if (rawPhone.startsWith("0") && rawPhone.length === 10) {
          intlPhone = "593" + rawPhone.slice(1);
        } else if (rawPhone.length === 9) {
          intlPhone = "593" + rawPhone;
        }

        const customerName = updatedOrder.customerName || "Cliente";
        let waText = "";
        if (targetAction === "ready") {
          waText = "¡Hola " + customerName + "! ✨ Te saludamos de Adriego Store. Tu pedido " + orderCode + " ya está LISTO PARA RETIRO en nuestro local de El Tejar. 🏬👗 ¡Te esperamos!";
        } else if (targetAction === "shipped") {
          const destCity = updatedOrder.deliveryCity ? " a " + updatedOrder.deliveryCity : "";
          waText = "¡Hola " + customerName + "! ✨ Te saludamos de Adriego Store. Tu pedido " + orderCode + " ya va EN CAMINO" + destCity + " 🚚📦. ¡Muchas gracias por tu compra!";
        } else if (targetAction === "completed") {
          waText = "¡Hola " + customerName + "! ✨ Te saludamos de Adriego Store. Confirmamos que tu pedido " + orderCode + " fue ENTREGADO con éxito. 🥰👗 ¡Que disfrutes tus prendas!";
        } else {
          waText = "¡Hola " + customerName + "! ✨ Te saludamos de Adriego Store respecto a tu pedido " + orderCode + ".";
        }

        const waUrl = intlPhone ? "https://wa.me/" + intlPhone + "?text=" + encodeURIComponent(waText) : null;

        const actionButtons = [];
        const topRow = [];
        if (waUrl) {
          topRow.push({ text: "💬 Avisar Cliente por WhatsApp", url: waUrl });
        }
        if (updatedOrder.deliveryType === "delivery") {
          topRow.push({ text: "📦 Asignar Guía", callback_data: "setguia:" + orderCode });
        }
        if (topRow.length > 0) {
          actionButtons.push(topRow);
        }

        const bottomRow = [];
        bottomRow.push({ text: "📦 Ver Pendientes", callback_data: "quick_pendientes" });
        if (updatedOrder.deliveryType === "delivery") {
          bottomRow.push({ text: "📋 Formato Courier", callback_data: "courier:" + orderCode });
        }
        actionButtons.push(bottomRow);

        const deliveryInfo = updatedOrder.deliveryType === "delivery"
          ? "\n📍 *Envío a:* " + escapeTelegramMarkdown(updatedOrder.deliveryCity || "") + " — " + escapeTelegramMarkdown(updatedOrder.deliveryAddress || "")
          : "\n🏬 *Retiro en local*";

        await sendTelegramMessage(
          token,
          senderChatId,
          "✅ *Estado Actualizado con Éxito*\n━━━━━━━━━━━━━━━━━━━━\n📦 *Pedido:* `" + orderCode + "`\n🏷️ *Nuevo Estado:* *" + newStatus + "*" + deliveryInfo + "\n⏰ *Hora:* " + new Date().toLocaleTimeString("es-EC") + "\n👤 *Cliente:* " + escapeTelegramMarkdown(updatedOrder.customerName || "Cliente") + "\n━━━━━━━━━━━━━━━━━━━━\n👇 _Toca abajo para avisar al cliente por WhatsApp con el mensaje ya redactado:_ ",
          {
            reply_markup: {
              inline_keyboard: actionButtons,
            },
          },
        );
      } else {
        await sendTelegramMessage(token, senderChatId, "⚠️ Pedido `" + orderCode + "` no encontrado en la base de datos.");
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
          addressLines.push("━━━━━━━━━━━━━━━━━━━━");

          await sendTelegramMessage(token, senderChatId, addressLines.join("\n"));
        } else {
          await sendTelegramMessage(token, senderChatId, "⚠️ Pedido `" + orderCode + "` no encontrado.");
        }
      } catch (err) {
        console.error("[address-lookup-error]", err?.message || err);
        await sendTelegramMessage(token, senderChatId, "⚠️ Error al consultar la dirección.");
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
          await sendTelegramMessage(token, senderChatId, "⚠️ Pedido `" + orderCode + "` no encontrado.");
        } else if (!found.paymentProof) {
          await sendTelegramMessage(
            token,
            senderChatId,
            "ℹ️ El pedido `" + orderCode + "` no tiene comprobante de pago adjunto (posiblemente pagó con tarjeta o aún no ha subido el comprobante).",
          );
        } else {
          const bankName = found.paymentBankAccount?.bankName || "";
          const caption = "📸 *Comprobante de Pago*\n━━━━━━━━━━━━━━━━━━━━\n📦 *Pedido:* `" + found.code + "`\n👤 *Cliente:* " + escapeTelegramMarkdown(found.customerName || "Cliente") + "\n💰 *Monto:* *" + currency(found.total ?? found.subtotal) + "*" + (bankName ? "\n🏦 *Banco:* " + escapeTelegramMarkdown(bankName) : "") + "\n━━━━━━━━━━━━━━━━━━━━\n⚡ [Ver en Panel Admin](https://adriego.vercel.app/admin)";

          const photoResult = await sendTelegramPhoto(token, senderChatId, found.paymentProof, caption);
          if (!photoResult?.ok) {
            await sendTelegramMessage(
              token,
              senderChatId,
              "⚠️ No pudimos enviar la foto directamente por Telegram. Puedes revisarlo en el [Panel Admin](https://adriego.vercel.app/admin).",
            );
          }
        }
      } catch (err) {
        console.error("[proof-lookup-error]", err?.message || err);
        await sendTelegramMessage(token, senderChatId, "⚠️ Error al consultar el comprobante de pago.");
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
          await sendTelegramMessage(token, senderChatId, cardText, { reply_markup: keyboard });
        } else {
          await sendTelegramMessage(token, senderChatId, "⚠️ Pedido `" + orderCode + "` no encontrado.");
        }
      } catch (err) {
        console.error("[view-order-error]", err?.message || err);
        await sendTelegramMessage(token, senderChatId, "⚠️ Error al abrir el pedido.");
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

          await sendTelegramMessage(token, senderChatId, courierLines.join("\n"));
        } else {
          await sendTelegramMessage(token, senderChatId, "⚠️ Pedido `" + orderCode + "` no encontrado.");
        }
      } catch (err) {
        console.error("[courier-format-error]", err?.message || err);
        await sendTelegramMessage(token, senderChatId, "⚠️ Error al generar formato courier.");
      }
    } else if (data === "quick_pendientes") {
      // Handle "Ver Siguiente Pendiente" button
      await answerCallbackQuery(token, cb.id, "Consultando pendientes...");

      try {
        const store = await readStore();
        const orders = Array.isArray(store?.orders) ? store.orders : [];
        const pendingOrders = orders.filter((o) => {
          const s = String(o.status || "").toLowerCase();
          return s === "pendiente" || s === "en preparación" || s === "listo para retiro" || s === "enviado";
        });

        if (pendingOrders.length === 0) {
          await sendTelegramMessage(token, senderChatId, "✅ *¡Al día!* No hay más pedidos pendientes por despachar en este momento.");
        } else {
          const list = pendingOrders
            .slice(0, 8)
            .map((o, idx) => {
              const typeIcon = o.deliveryType === "delivery" ? "🚚" : "🏬";
              return (idx + 1) + ". `" + o.code + "` " + typeIcon + " · " + escapeTelegramMarkdown(o.customerName || "Cliente") + " · *" + currency(o.total ?? o.subtotal) + "* (" + o.status + ")";
            })
            .join("\n");

          const sliceOrders = pendingOrders.slice(0, 8);
          const orderButtons = [];
          for (let i = 0; i < sliceOrders.length; i += 2) {
            const row = [];
            row.push({ text: "🔍 Ver " + sliceOrders[i].code, callback_data: "view:" + sliceOrders[i].code });
            if (sliceOrders[i + 1]) {
              row.push({ text: "🔍 Ver " + sliceOrders[i + 1].code, callback_data: "view:" + sliceOrders[i + 1].code });
            }
            orderButtons.push(row);
          }

          const msg = "📦 *Pedidos Pendientes (" + pendingOrders.length + "):*\n━━━━━━━━━━━━━━━━━━━━\n" + list + "\n━━━━━━━━━━━━━━━━━━━━\n👇 _Toca un botón para abrir la ficha del pedido:_";
          await sendTelegramMessage(token, senderChatId, msg, {
            reply_markup: {
              inline_keyboard: orderButtons,
            },
          });
        }
      } catch (err) {
        console.error("[quick-pendientes-error]", err?.message || err);
        await sendTelegramMessage(token, senderChatId, "⚠️ Error al consultar pendientes.");
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

      await sendTelegramMessage(token, senderChatId, promptMsg, {
        reply_markup: {
          inline_keyboard: courierButtons,
        },
      });
    } else if (data.startsWith("quick_guia:")) {
      const parts = data.split(":");
      const orderCode = parts[1];
      const courierName = parts[2];
      await answerCallbackQuery(token, cb.id, courierName + " seleccionado");

      PENDING_GUIDE_PROMPTS.set(senderChatId, {
        orderCode,
        courierName,
        expiresAt: Date.now() + 15 * 60 * 1000,
      });

      const instructMsg = "🚚 *Courier seleccionado:* " + courierName + "\n📦 *Pedido:* `" + orderCode + "`\n━━━━━━━━━━━━━━━━━━━━\n✍️ _Escribe aquí abajo ÚNICAMENTE el número de guía:_";
      await sendTelegramMessage(token, senderChatId, instructMsg, {
        reply_markup: {
          force_reply: true,
          selective: true,
        },
      });
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
    await sendInventorySearchResults(token, senderChatId, text);
    res.status(200).json({ ok: true, authorized: true });
    return;
  }
  const replyMatch = replyText.match(/Pedido:\s*`?([A-Za-z0-9-]+)`?.*Courier:\s*\*?([A-Za-z0-9\s]+)\*?/is);
  if (replyMatch && text && !text.startsWith("/")) {
    const orderCode = replyMatch[1];
    const courierName = replyMatch[2].trim();
    const trackingNumber = text.trim();
    PENDING_GUIDE_PROMPTS.delete(senderChatId);
    await applyOrderGuideRegistration(token, senderChatId, orderCode, courierName, trackingNumber);
    res.status(200).json({ ok: true, authorized: true });
    return;
  }

  const pendingPrompt = PENDING_GUIDE_PROMPTS.get(senderChatId);
  if (
    pendingPrompt
    && pendingPrompt.expiresAt > Date.now()
    && text
    && !text.startsWith("/")
    && !lowerText.includes("ventas")
    && !lowerText.includes("pendientes")
    && !lowerText.includes("stock")
    && !lowerText.includes("buscar")
    && !lowerText.includes("inventario")
    && lowerText !== "deshacer venta"
  ) {
    PENDING_GUIDE_PROMPTS.delete(senderChatId);
    const trackingNumber = text.trim();
    await applyOrderGuideRegistration(token, senderChatId, pendingPrompt.orderCode, pendingPrompt.courierName, trackingNumber);
    res.status(200).json({ ok: true, authorized: true });
    return;
  }

  // Command Handlers for Admin
  if (lowerText === "/start" || lowerText === "hola" || lowerText === "/menu" || lowerText === "menu") {
    const welcome = "👑 *Panel Administrativo · Adriego Store*\n\n¡Hola " + senderName + "! Tu sesión está protegida y lista.\n\n⚡ *Toca cualquiera de los botones de abajo:*";
    await sendTelegramMessage(token, senderChatId, welcome);
  } else if (lowerText === "📊 ventas de hoy" || lowerText === "/ventas" || lowerText === "ventas") {
    const store = await readStore();
    const orders = Array.isArray(store?.orders) ? store.orders : [];
    const todayIso = new Date().toISOString().slice(0, 10);
    const todayOrders = orders.filter((o) => String(o.createdAt || "").startsWith(todayIso));
    const todayTotal = todayOrders.reduce((sum, o) => sum + (Number(o.total ?? o.subtotal) || 0), 0);
    const allTotal = orders.reduce((sum, o) => sum + (Number(o.total ?? o.subtotal) || 0), 0);

    const report = "📊 *Resumen de Ventas · Adriego Store*\n━━━━━━━━━━━━━━━━━━━━\n📅 *Ventas de Hoy (" + todayIso + "):*\n• *Pedidos:* " + todayOrders.length + "\n• *Total Facturado:* *" + currency(todayTotal) + "*\n\n📈 *Ventas Totales Registradas:*\n• *Total Pedidos:* " + orders.length + "\n• *Monto Acumulado:* *" + currency(allTotal) + "*\n━━━━━━━━━━━━━━━━━━━━\n⚡ [Ver Historial en Panel Admin](https://adriego.vercel.app/admin)";
    await sendTelegramMessage(token, senderChatId, report);
  } else if (lowerText === "📦 pedidos pendientes" || lowerText === "/pendientes" || lowerText === "pendientes") {
    const store = await readStore();
    const orders = Array.isArray(store?.orders) ? store.orders : [];
    const pendingOrders = orders.filter((o) => {
      const s = String(o.status || "").toLowerCase();
      return s === "pendiente" || s === "en preparación" || s === "listo para retiro" || s === "enviado";
    });

    if (pendingOrders.length === 0) {
      await sendTelegramMessage(token, senderChatId, "✅ *¡Al día!* No hay pedidos pendientes por despachar en este momento.");
    } else {
      const list = pendingOrders
        .slice(0, 8)
        .map((o, idx) => {
          const typeIcon = o.deliveryType === "delivery" ? "🚚" : "🏬";
          return (idx + 1) + ". `" + o.code + "` " + typeIcon + " · " + escapeTelegramMarkdown(o.customerName || "Cliente") + " · *" + currency(o.total ?? o.subtotal) + "* (" + o.status + ")";
        })
        .join("\n");

      const sliceOrders = pendingOrders.slice(0, 8);
      const orderButtons = [];
      for (let i = 0; i < sliceOrders.length; i += 2) {
        const row = [];
        row.push({ text: "🔍 Ver " + sliceOrders[i].code, callback_data: "view:" + sliceOrders[i].code });
        if (sliceOrders[i + 1]) {
          row.push({ text: "🔍 Ver " + sliceOrders[i + 1].code, callback_data: "view:" + sliceOrders[i + 1].code });
        }
        orderButtons.push(row);
      }

      const msg = "📦 *Pedidos Pendientes (" + pendingOrders.length + "):*\n━━━━━━━━━━━━━━━━━━━━\n" + list + "\n━━━━━━━━━━━━━━━━━━━━\n👇 _Toca un botón abajo para abrir la ficha del pedido:_";
      await sendTelegramMessage(token, senderChatId, msg, {
        reply_markup: {
          inline_keyboard: orderButtons,
        },
      });
    }
  } else if (lowerText === "⚠️ stock bajo" || lowerText === "/stock_bajo" || lowerText === "stock bajo") {
    const store = await readStore();
    const products = Array.isArray(store?.products) ? store.products : [];
    const lowList = [];

    products.forEach((product) => {
      const variants = Array.isArray(product.variants) ? product.variants : [];
      variants.forEach((variant) => {
        const stock = Number(variant.stock) || 0;
        if (stock <= 2) {
          lowList.push({
            name: product.name,
            color: variant.color,
            size: variant.size,
            stock,
          });
        }
      });
    });

    if (lowList.length === 0) {
      await sendTelegramMessage(token, senderChatId, "✅ *Inventario Saludable:* Todas las prendas tienen buen nivel de stock.");
    } else {
      const list = lowList
        .slice(0, 12)
        .map((item) => "• *" + escapeTelegramMarkdown(item.name) + "* (" + item.color + " | " + item.size + ") ➔ *" + (item.stock === 0 ? "🛑 AGOTADO" : "⚠️ " + item.stock + " unid.") + "*")
        .join("\n");
      const msg = "⚠️ *Prendas con Stock Bajo / Agotadas (" + lowList.length + "):*\n━━━━━━━━━━━━━━━━━━━━\n" + list + "\n━━━━━━━━━━━━━━━━━━━━\n⚡ [Reponer en Panel Admin](https://adriego.vercel.app/admin)";
      await sendTelegramMessage(token, senderChatId, msg);
    }
  } else if (lowerText.includes("inventario físico") || lowerText.includes("inventario fisico")) {
    await sendTelegramMessage(token, senderChatId, "🛍️ *Inventario físico*\n\nElige una acción. También puedes usar `/stock nombre`, `/venta nombre | color | talla | cantidad` o `/deshacer venta`.", {
      reply_markup: { inline_keyboard: [
        [{ text: "➖ Registrar venta", callback_data: "inv:search" }],
        [{ text: "📋 Lista para proveedor", callback_data: "inv:restock" }],
        [{ text: "↩️ Deshacer última venta", callback_data: "inv:undo-last" }],
      ] },
    });
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
  } else if (lowerText.includes("buscar pedido") || lowerText === "🔍 buscar pedido") {
    const msg = "🔍 *Buscar Pedido*\n━━━━━━━━━━━━━━━━━━━━\nEscribe el código del pedido o nombre del cliente:\n\n*Ejemplo:* `/buscar ORDER-10099` o `/buscar Maria`";
    await sendTelegramMessage(token, senderChatId, msg);
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
