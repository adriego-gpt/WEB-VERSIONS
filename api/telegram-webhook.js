import {
  consumeRateLimit,
  getClientIp,
  monitorApiRequest,
  normalizeLine,
  requireJsonBody,
  setCommonSecurityHeaders,
} from "./_lib/security.js";
import { bumpRealtimeMeta, readStore, updateStore } from "./_lib/store.js";
import { escapeTelegramMarkdown, isAuthorizedAdminChatId } from "./_lib/notifications.js";

const DEFAULT_TELEGRAM_BOT_TOKEN = "8838650681:AAHQigrGo6TcX4VrFkGqtZ7P_HUlV6aOhJA";
const ENDPOINT_NAME = "telegram-webhook";

function currency(value) {
  return new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" }).format(Number(value) || 0);
}

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
        const deliveryInfo = updatedOrder.deliveryType === "delivery"
          ? "\n📍 *Envío a:* " + escapeTelegramMarkdown(updatedOrder.deliveryCity || "") + " — " + escapeTelegramMarkdown(updatedOrder.deliveryAddress || "")
          : "\n🏬 *Retiro en local*";
        await sendTelegramMessage(
          token,
          senderChatId,
          "✅ *Estado Actualizado con Éxito*\n━━━━━━━━━━━━━━━━━━━━\n📦 *Pedido:* `" + orderCode + "`\n🏷️ *Nuevo Estado:* *" + newStatus + "*" + deliveryInfo + "\n⏰ *Hora:* " + new Date().toLocaleTimeString("es-EC") + "\n👤 *Cliente:* " + escapeTelegramMarkdown(updatedOrder.customerName || "Cliente"),
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
  if (lowerText === "/start" || lowerText === "hola" || lowerText === "/menu") {
    const welcome = "👑 *Panel Administrativo · Adriego Store*\n\n¡Hola " + senderName + "! Tu sesión está autenticada y protegida con máxima seguridad.\n\n⚡ *Comandos disponibles:*\n• `/ventas` - Ver resumen de ventas y pedidos de hoy\n• `/pendientes` - Ver pedidos por preparar o despachar\n• `/stock_bajo` - Ver prendas con poco inventario\n• `/buscar <código>` - Consultar un pedido específico\n\n🔗 [Abrir Panel Web](https://adriego.vercel.app/admin)";
    await sendTelegramMessage(token, senderChatId, welcome);
  } else if (lowerText === "/ventas" || lowerText === "ventas") {
    const store = await readStore();
    const orders = Array.isArray(store?.orders) ? store.orders : [];
    const todayIso = new Date().toISOString().slice(0, 10);
    const todayOrders = orders.filter((o) => String(o.createdAt || "").startsWith(todayIso));
    const todayTotal = todayOrders.reduce((sum, o) => sum + (Number(o.total || o.subtotal) || 0), 0);
    const allTotal = orders.reduce((sum, o) => sum + (Number(o.total || o.subtotal) || 0), 0);

    const report = "📊 *Resumen de Ventas · Adriego Store*\n━━━━━━━━━━━━━━━━━━━━\n📅 *Ventas de Hoy (" + todayIso + "):*\n• *Pedidos:* " + todayOrders.length + "\n• *Total Facturado:* *" + currency(todayTotal) + "*\n\n📈 *Ventas Totales Registradas:*\n• *Total Pedidos:* " + orders.length + "\n• *Monto Acumulado:* *" + currency(allTotal) + "*\n━━━━━━━━━━━━━━━━━━━━\n⚡ [Ver Historial en Panel Admin](https://adriego.vercel.app/admin)";
    await sendTelegramMessage(token, senderChatId, report);
  } else if (lowerText === "/pendientes" || lowerText === "pendientes") {
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
      const msg = "📦 *Pedidos Pendientes (" + pendingOrders.length + "):*\n━━━━━━━━━━━━━━━━━━━━\n" + list + "\n━━━━━━━━━━━━━━━━━━━━\n⚡ [Gestionar en Panel Admin](https://adriego.vercel.app/admin)";
      await sendTelegramMessage(token, senderChatId, msg);
    }
  } else if (lowerText === "/stock_bajo" || lowerText === "stock" || lowerText === "/stock") {
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
  } else if (lowerText.startsWith("/buscar") || lowerText.startsWith("buscar")) {
    const query = text.replace(/^[/]?buscar\s*/i, "").trim().toUpperCase();
    const store = await readStore();
    const orders = Array.isArray(store?.orders) ? store.orders : [];
    const found = orders.find((o) => String(o.code).toUpperCase().includes(query) || String(o.customerName || "").toUpperCase().includes(query));

    if (!found) {
      await sendTelegramMessage(token, senderChatId, "🔍 No se encontró ningún pedido que coincida con \"" + query + "\".");
    } else {
      const deliveryDetail = found.deliveryType === "delivery"
        ? "🚚 Envío a Domicilio\n🏙️ *Ciudad:* " + escapeTelegramMarkdown(found.deliveryCity || "N/A") + "\n🏠 *Dirección:* " + escapeTelegramMarkdown(found.deliveryAddress || "N/A") + (found.deliveryReference ? "\n🧭 *Referencia:* " + escapeTelegramMarkdown(found.deliveryReference) : "")
        : "🏬 Retiro en Local";
      const msg = "🔍 *Detalle del Pedido*\n━━━━━━━━━━━━━━━━━━━━\n📦 *Código:* `" + found.code + "`\n👤 *Cliente:* " + escapeTelegramMarkdown(found.customerName || "Cliente") + "\n📞 *Teléfono:* `" + (found.customerPhone || "N/A") + "`\n🏷️ *Estado:* *" + found.status + "*\n💰 *Total:* *" + currency(found.total || found.subtotal) + "*\n📍 *Entrega:* " + deliveryDetail + "\n━━━━━━━━━━━━━━━━━━━━\n⚡ [Ver en Panel Admin](https://adriego.vercel.app/admin)";
      await sendTelegramMessage(token, senderChatId, msg);
    }
  } else {
    await sendTelegramMessage(
      token,
      senderChatId,
      "🤖 *Comando no reconocido.*\n\nEscribe `/ventas`, `/pendientes`, `/stock_bajo` o `/start` para ver las opciones disponibles.",
    );
  }

  res.status(200).json({ ok: true, authorized: true });
}
