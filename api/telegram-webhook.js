import {
  consumeRateLimit,
  getClientIp,
  monitorApiRequest,
  requireJsonBody,
  setCommonSecurityHeaders,
} from "./_lib/security.js";
import { bumpRealtimeMeta, readStore, updateStore } from "./_lib/store.js";
import {
  escapeTelegramMarkdown,
  isAuthorizedAdminChatId,
  buildTelegramOrderKeyboard,
  formatTelegramOrderMessage,
} from "./_lib/notifications.js";

const DEFAULT_TELEGRAM_BOT_TOKEN = "8838650681:AAHQigrGo6TcX4VrFkGqtZ7P_HUlV6aOhJA";
const ENDPOINT_NAME = "telegram-webhook";

function currency(value) {
  return new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" }).format(Number(value) || 0);
}

const ADMIN_KEYBOARD_MARKUP = {
  keyboard: [
    [{ text: "📊 Ventas de Hoy" }, { text: "📦 Pedidos Pendientes" }],
    [{ text: "⚠️ Stock Bajo" }, { text: "🔍 Buscar Pedido" }],
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

export default async function handler(req, res) {
  setCommonSecurityHeaders(res);
  const clientIp = getClientIp(req);

  const rateCheck = await consumeRateLimit("telegram-webhook", clientIp, 1200, 60 * 1000, {
    endpoint: ENDPOINT_NAME,
    ip: clientIp,
  });

  if (!rateCheck.ok) {
    res.status(429).json({ ok: false, message: "Demasiadas solicitudes." });
    return;
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ ok: false, message: "Método no permitido." });
    return;
  }

  const update = requireJsonBody(req, res, { endpoint: ENDPOINT_NAME });
  if (!update) {
    // requireJsonBody already sent the error response
    return;
  }

  const token = process.env.TELEGRAM_BOT_TOKEN || DEFAULT_TELEGRAM_BOT_TOKEN;

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

    if (data.startsWith("status:")) {
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
          const caption = "📸 *Comprobante de Pago*\n━━━━━━━━━━━━━━━━━━━━\n📦 *Pedido:* `" + found.code + "`\n👤 *Cliente:* " + escapeTelegramMarkdown(found.customerName || "Cliente") + "\n💰 *Monto:* *" + currency(found.total || found.subtotal) + "*" + (bankName ? "\n🏦 *Banco:* " + escapeTelegramMarkdown(bankName) : "") + "\n━━━━━━━━━━━━━━━━━━━━\n⚡ [Ver en Panel Admin](https://adriego.vercel.app/admin)";

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
            "*VALOR DECLARADO:* *" + currency(found.total || found.subtotal) + "*",
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
              return (idx + 1) + ". `" + o.code + "` " + typeIcon + " · " + escapeTelegramMarkdown(o.customerName || "Cliente") + " · *" + currency(o.total || o.subtotal) + "* (" + o.status + ")";
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

      const promptMsg = "📦 *Registrar Guía de Envío*\n━━━━━━━━━━━━━━━━━━━━\nPedido: `" + orderCode + "`\n\n👇 _Elige el courier o escribe directamente el comando:_";
      const courierButtons = [
        [
          { text: "🚚 Servientrega", callback_data: "quick_guia:" + orderCode + ":Servientrega" },
          { text: "📦 LaarCourier", callback_data: "quick_guia:" + orderCode + ":LaarCourier" },
        ],
        [
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

      const instructMsg = "🚚 Courier seleccionado: *" + courierName + "*\n📦 Pedido: `" + orderCode + "`\n━━━━━━━━━━━━━━━━━━━━\nEscribe el comando con el número de guía para registrarlo y marcar el pedido como Enviado:\n\n`/guia " + orderCode + " " + courierName + " <NUMERO>`\n\n_Ejemplo:_ `/guia " + orderCode + " " + courierName + " 1759283940`";
      await sendTelegramMessage(token, senderChatId, instructMsg);
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
    monitorApiRequest(ENDPOINT_NAME, {
      status: "unauthorized_telegram_access_blocked",
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

  // Command Handlers for Admin
  if (lowerText === "/start" || lowerText === "hola" || lowerText === "/menu" || lowerText === "menu") {
    const welcome = "👑 *Panel Administrativo · Adriego Store*\n\n¡Hola " + senderName + "! Tu sesión está protegida y lista.\n\n⚡ *Toca cualquiera de los botones de abajo:*";
    await sendTelegramMessage(token, senderChatId, welcome);
  } else if (lowerText.includes("ventas") || lowerText === "/ventas") {
    const store = await readStore();
    const orders = Array.isArray(store?.orders) ? store.orders : [];
    const todayIso = new Date().toISOString().slice(0, 10);
    const todayOrders = orders.filter((o) => String(o.createdAt || "").startsWith(todayIso));
    const todayTotal = todayOrders.reduce((sum, o) => sum + (Number(o.total || o.subtotal) || 0), 0);
    const allTotal = orders.reduce((sum, o) => sum + (Number(o.total || o.subtotal) || 0), 0);

    const report = "📊 *Resumen de Ventas · Adriego Store*\n━━━━━━━━━━━━━━━━━━━━\n📅 *Ventas de Hoy (" + todayIso + "):*\n• *Pedidos:* " + todayOrders.length + "\n• *Total Facturado:* *" + currency(todayTotal) + "*\n\n📈 *Ventas Totales Registradas:*\n• *Total Pedidos:* " + orders.length + "\n• *Monto Acumulado:* *" + currency(allTotal) + "*\n━━━━━━━━━━━━━━━━━━━━\n⚡ [Ver Historial en Panel Admin](https://adriego.vercel.app/admin)";
    await sendTelegramMessage(token, senderChatId, report);
  } else if (lowerText.includes("pendientes") || lowerText === "/pendientes") {
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
          return (idx + 1) + ". `" + o.code + "` " + typeIcon + " · " + escapeTelegramMarkdown(o.customerName || "Cliente") + " · *" + currency(o.total || o.subtotal) + "* (" + o.status + ")";
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
  } else if (lowerText.includes("stock") || lowerText === "/stock_bajo") {
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
  } else if (lowerText.startsWith("/guia") || lowerText.startsWith("guia ")) {
    const rawArgs = text.replace(/^[/]?guia\s*/i, "").trim().split(/\s+/);
    if (rawArgs.length < 2) {
      const usageMsg = "⚠️ *Uso correcto del comando /guia:*\n\n`/guia <CÓDIGO> <COURIER> <NÚMERO_DE_GUIA>`\n\n*Ejemplos:*\n• `/guia ORDER-10099 Servientrega 1234567890`\n• `/guia ORDER-10099 LaarCourier 98765432`\n• `/guia ORDER-10099 1234567890`";
      await sendTelegramMessage(token, senderChatId, usageMsg);
      res.status(200).json({ ok: true });
      return;
    }

    const orderQuery = rawArgs[0].toUpperCase();
    let courierName = "Servientrega";
    let trackingNumber = "";

    if (rawArgs.length === 2) {
      trackingNumber = rawArgs[1];
    } else {
      courierName = rawArgs[1];
      trackingNumber = rawArgs.slice(2).join(" ");
    }

    const fullGuideDisplay = courierName + ": " + trackingNumber;

    let updatedOrder = null;
    try {
      await updateStore((draft) => {
        const orders = Array.isArray(draft.orders) ? draft.orders : [];
        const targetIndex = orders.findIndex((o) =>
          String(o.code).toUpperCase().includes(orderQuery)
        );

        if (targetIndex >= 0) {
          orders[targetIndex] = {
            ...orders[targetIndex],
            guideNumber: fullGuideDisplay,
            courier: courierName,
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
      const waGuiaText = "¡Hola " + customerName + "! ✨ Te saludamos de Adriego Store. Tu pedido " + updatedOrder.code + " ya fue ENVIADO" + destCity + " 🚚📦 por " + courierName + ".\n\n🔢 Número de Guía: " + trackingNumber + "\n\n¡Muchas gracias por tu compra!";
      const waUrl = intlPhone ? "https://wa.me/" + intlPhone + "?text=" + encodeURIComponent(waGuiaText) : null;

      const guiaButtons = [];
      const row1 = [];
      if (waUrl) {
        row1.push({ text: "💬 Enviar Guía por WhatsApp", url: waUrl });
      }
      guiaButtons.push(row1);
      guiaButtons.push([{ text: "📦 Ver Siguiente Pendiente", callback_data: "quick_pendientes" }]);

      const successMsg = "✅ *Guía Registrada y Pedido Marcado como Enviado*\n━━━━━━━━━━━━━━━━━━━━\n📦 *Pedido:* `" + updatedOrder.code + "`\n🚚 *Courier:* *" + courierName + "*\n🔢 *No. Guía:* `" + trackingNumber + "`\n🏷️ *Estado:* *Enviado*\n👤 *Cliente:* " + escapeTelegramMarkdown(customerName) + " (" + (updatedOrder.customerPhone || "N/A") + ")\n━━━━━━━━━━━━━━━━━━━━\n👇 _Toca abajo para enviar la guía y datos de rastreo al cliente por WhatsApp:_";

      await sendTelegramMessage(token, senderChatId, successMsg, {
        reply_markup: {
          inline_keyboard: guiaButtons,
        },
      });
    } else {
      await sendTelegramMessage(token, senderChatId, "⚠️ No se encontró ningún pedido que coincida con `" + orderQuery + "`.");
    }
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
