import {
  consumeRateLimit,
  getClientIp,
  logSecurityEvent,
  monitorApiRequest,
  requireJsonBody,
  setCommonSecurityHeaders,
} from "./_lib/security.js";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { fetchWithTimeout } from "./_lib/network.js";
import { bumpRealtimeMeta, readStore, updateStore } from "./_lib/store.js";
import { deleteOrderFromDraft } from "./orders.js";
import {
  escapeTelegramMarkdown,
  isAuthorizedAdminChatId,
  buildTelegramOrderKeyboard,
  formatTelegramOrderMessage,
  TELEGRAM_BOT_COMMANDS,
  registerTelegramBotCommands,
  ensureTelegramBotCommandsRegistered,
  getAdminPanelUrl,
} from "./_lib/notifications.js";

const ENDPOINT_NAME = "telegram-webhook";

function currency(value) {
  return new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" }).format(Number(value) || 0);
}

export const ADMIN_KEYBOARD_MARKUP = {
  keyboard: [
    [{ text: "📦 Pedidos" }, { text: "📊 Resumen" }],
    [{ text: "🛍️ Registrar venta" }, { text: "➕ Reponer stock" }],
    [{ text: "🗂️ Inventario" }, { text: "⚠️ Stock bajo" }],
    [{ text: "🔍 Buscar pedido" }, { text: "❓ Ayuda" }],
    [{ text: "⌂ Menú principal" }],
  ],
  resize_keyboard: true,
  is_persistent: true,
  one_time_keyboard: false,
  input_field_placeholder: "Elige una acción",
};

const ADMIN_KEYBOARD_COMMANDS = new Map([
  ["📦 pedidos", "/pedidos"], ["📊 resumen", "/ventas"],
  ["🛍️ registrar venta", "/venta"], ["➕ reponer stock", "/reponer"],
  ["🗂️ inventario", "/stock"], ["⚠️ stock bajo", "/stock_bajo"],
  ["🔍 buscar pedido", "/buscar"], ["❓ ayuda", "/ayuda"],
  ["⌂ menú principal", "/menu"],
]);

async function answerCallbackQuery(token, callbackQueryId, text = "", options = {}) {
  try {
    await fetchWithTimeout("https://api.telegram.org/bot" + token + "/answerCallbackQuery", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        text,
        show_alert: Boolean(options?.show_alert),
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
    const response = await fetchWithTimeout("https://api.telegram.org/bot" + token + "/sendMessage", {
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
    const response = await fetchWithTimeout("https://api.telegram.org/bot" + token + "/editMessageText", {
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
    const response = await fetchWithTimeout("https://api.telegram.org/bot" + token + "/deleteMessage", {
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
      const response = await fetchWithTimeout("https://api.telegram.org/bot" + token + "/sendPhoto", {
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

        const response = await fetchWithTimeout("https://api.telegram.org/bot" + token + "/sendPhoto", {
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

function getProductTotalStock(product) {
  const variants = Array.isArray(product?.variants) ? product.variants : [];
  return variants.reduce((sum, variant) => sum + Math.max(0, Number(variant.stock) || 0), 0);
}

function normalizeTypeName(name = "") {
  return String(name || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function getAvailableProductTypes(products = [], declaredTypes = []) {
  const DEFAULT_TYPES = [
    "Cortas", "Largas", "3/4", "Pao", "Licras", "Blazers", "Vestidos", "Camisas", "Pantalones", "Tops", "Chaquetas",
  ];
  const declaredList = Array.isArray(declaredTypes) && declaredTypes.length
    ? declaredTypes.map((t) => (typeof t === "string" ? t : t?.name || "")).filter(Boolean)
    : DEFAULT_TYPES;

  const typesMap = new Map();
  declaredList.forEach((typeName) => {
    const key = normalizeTypeName(typeName);
    if (key && !typesMap.has(key)) {
      typesMap.set(key, { name: typeName.trim(), count: 0, totalStock: 0, products: [] });
    }
  });

  (Array.isArray(products) ? products : []).forEach((product) => {
    const productType = String(product?.productType || "").trim();
    const productName = String(product?.name || "").trim();
    const productCategory = String(product?.category || "").trim();
    const tags = Array.isArray(product?.filterTags) ? product.filterTags : [];
    const stock = getProductTotalStock(product);

    let matched = false;
    if (productType) {
      const typeKey = normalizeTypeName(productType);
      if (typesMap.has(typeKey)) {
        const entry = typesMap.get(typeKey);
        entry.count += 1;
        entry.totalStock += stock;
        entry.products.push(product);
        matched = true;
      } else {
        typesMap.set(typeKey, { name: productType, count: 1, totalStock: stock, products: [product] });
        matched = true;
      }
    }

    if (!matched) {
      for (const entry of typesMap.values()) {
        const needle = normalizeTypeName(entry.name);
        if (
          normalizeTypeName(productName).includes(needle)
          || normalizeTypeName(productCategory).includes(needle)
          || tags.some((tag) => normalizeTypeName(tag).includes(needle))
        ) {
          entry.count += 1;
          entry.totalStock += stock;
          entry.products.push(product);
          matched = true;
          break;
        }
      }
    }

    if (!matched) {
      const generalKey = normalizeTypeName("Otras prendas");
      if (!typesMap.has(generalKey)) {
        typesMap.set(generalKey, { name: "Otras prendas", count: 0, totalStock: 0, products: [] });
      }
      const entry = typesMap.get(generalKey);
      entry.count += 1;
      entry.totalStock += stock;
      entry.products.push(product);
    }
  });

  return Array.from(typesMap.values()).filter((entry) => entry.count > 0 || declaredList.includes(entry.name));
}

function getInventoryBrowseTypes(store = {}) {
  return getAvailableProductTypes(store.products, store.productTypes)
    .map((entry) => {
      const products = entry.products.filter((product) => getProductOptions(product).colors.length > 0);
      return { ...entry, products, count: products.length };
    })
    .filter((entry) => entry.count > 0)
    .sort((left, right) => left.name.localeCompare(right.name, "es"));
}

function getInventoryTypeToken(typeName) {
  return createHash("sha256").update(normalizeTypeName(typeName)).digest("base64url").slice(0, 12);
}

function getInventoryModeNavigation(mode) {
  return mode === "restock"
    ? { title: "➕ Reponer stock", types: "inv:add:types", type: "inv:add:type", search: "inv:add:search" }
    : { title: "➖ Registrar venta", types: "inv:types", type: "inv:type", search: "inv:search" };
}

function getInventoryPage(requestedPage, itemCount, pageSize) {
  const totalPages = Math.max(1, Math.ceil(itemCount / pageSize));
  const rawPage = Number(requestedPage);
  const currentPage = Math.min(Number.isSafeInteger(rawPage) ? Math.max(0, rawPage) : 0, totalPages - 1);
  return { totalPages, currentPage, start: currentPage * pageSize };
}

function sortInventoryModels(products, mode) {
  return products.slice().sort((left, right) => {
    if (mode !== "restock") {
      const availableLeft = getProductTotalStock(left) > 0;
      const availableRight = getProductTotalStock(right) > 0;
      if (availableLeft !== availableRight) return availableLeft ? -1 : 1;
    }
    return String(left.name || "").localeCompare(String(right.name || ""), "es")
      || String(left.id).localeCompare(String(right.id));
  });
}

function buildInventoryTypesView(store = {}, { mode = "sale", page = 0 } = {}) {
  const types = getInventoryBrowseTypes(store);
  const navigation = getInventoryModeNavigation(mode);
  const pageSize = 8;
  const { totalPages, currentPage, start } = getInventoryPage(page, types.length, pageSize);
  const keyboard = types.slice(start, start + pageSize).map((entry) => [{
    text: `${entry.name.slice(0, 36)} · ${entry.count} modelo${entry.count === 1 ? "" : "s"}`,
    callback_data: `${navigation.type}:${getInventoryTypeToken(entry.name)}:0`,
  }]);
  const pageButtons = [];
  if (currentPage > 0) pageButtons.push({ text: "← Anterior", callback_data: `${navigation.types}:${currentPage - 1}` });
  if (currentPage < totalPages - 1) pageButtons.push({ text: "Siguiente →", callback_data: `${navigation.types}:${currentPage + 1}` });
  if (pageButtons.length) keyboard.push(pageButtons);
  keyboard.push([{ text: "🔎 Buscar modelo por nombre", callback_data: navigation.search }]);
  if (mode === "restock") keyboard.push([{ text: "⚠️ Solo stock bajo", callback_data: "inv:restock:0" }]);
  else keyboard.push([{ text: "🔥 Todos con stock", callback_data: "inv:instock:0" }]);
  keyboard.push([{ text: "↩️ Inventario", callback_data: "inv:menu" }]);
  return {
    text: `*${navigation.title}*\n\n${types.length ? "Elige el tipo de prenda." : "No hay modelos con variantes registrados. Añádelos al catálogo de la tienda."}${totalPages > 1 ? `\nPágina ${currentPage + 1} de ${totalPages}.` : ""}`,
    reply_markup: { inline_keyboard: keyboard },
  };
}

function buildInventoryProductsByTypeView(store = {}, typeToken = "", page = 0, { mode = "sale" } = {}) {
  const navigation = getInventoryModeNavigation(mode);
  const targetType = getInventoryBrowseTypes(store).find((entry) => getInventoryTypeToken(entry.name) === typeToken);
  if (!targetType) {
    // Old numeric callbacks cannot safely identify a type after catalog edits.
    const view = buildInventoryTypesView(store, { mode });
    return { ...view, text: `*${navigation.title}*\n\nEl tipo cambió o este menú es anterior. Vuelve a elegir el tipo de prenda.` };
  }
  const models = sortInventoryModels(targetType.products, mode);
  const pageSize = 6;
  const { totalPages, currentPage, start } = getInventoryPage(page, models.length, pageSize);
  const keyboard = models.slice(start, start + pageSize).map((product) => {
    const stock = getProductTotalStock(product);
    return [{
      text: `${String(product.name || "Modelo").slice(0, 44)} · ${stock > 0 ? `${stock} disp.` : "Agotado"}`,
      callback_data: mode === "restock"
        ? `inv:add:product:${getProductToken(product.id)}`
        : stock > 0 ? `inv:product:${getProductToken(product.id)}` : "inv:nostock",
    }];
  });
  const pageButtons = [];
  if (currentPage > 0) pageButtons.push({ text: "← Anterior", callback_data: `${navigation.type}:${typeToken}:${currentPage - 1}` });
  if (currentPage < totalPages - 1) pageButtons.push({ text: "Siguiente →", callback_data: `${navigation.type}:${typeToken}:${currentPage + 1}` });
  if (pageButtons.length) keyboard.push(pageButtons);
  if (mode !== "restock" && !targetType.products.some((product) => getProductTotalStock(product) > 0)) {
    keyboard.push([{ text: "➕ Reponer este tipo", callback_data: `inv:add:type:${typeToken}:0` }]);
  }
  keyboard.push([{ text: "↩️ Cambiar tipo", callback_data: navigation.types }]);
  keyboard.push([{ text: "⌂ Inventario", callback_data: "inv:menu" }]);
  return {
    text: `*${navigation.title} · ${escapeTelegramMarkdown(targetType.name)}*\n\nElige el modelo${mode === "restock" ? ", incluso si está agotado" : " que vendiste"}.${totalPages > 1 ? `\nPágina ${currentPage + 1} de ${totalPages}.` : ""}`,
    reply_markup: { inline_keyboard: keyboard },
  };
}

function buildInventoryModelsBackButton(store, product, mode = "sale") {
  const navigation = getInventoryModeNavigation(mode);
  const type = getInventoryBrowseTypes(store).find((entry) => entry.products.some((model) => String(model.id) === String(product?.id)));
  if (!type) return { text: "↩️ Elegir tipo", callback_data: navigation.types };
  const index = sortInventoryModels(type.products, mode).findIndex((model) => String(model.id) === String(product.id));
  return {
    text: `↩️ Modelos de ${type.name.slice(0, 28)}`,
    callback_data: `${navigation.type}:${getInventoryTypeToken(type.name)}:${Math.floor(index / 6)}`,
  };
}

function buildInventoryInStockView(store = {}, page = 0) {
  const products = (Array.isArray(store?.products) ? store.products : [])
    .filter((p) => getProductTotalStock(p) > 0)
    .sort((a, b) => getProductTotalStock(b) - getProductTotalStock(a) || String(a.name || "").localeCompare(String(b.name || ""), "es"));

  const PAGE_SIZE = 6;
  const safePage = Math.max(0, Math.floor(Number(page) || 0));
  const totalPages = Math.max(1, Math.ceil(products.length / PAGE_SIZE));
  const currentPage = Math.min(safePage, totalPages - 1);
  const startIndex = currentPage * PAGE_SIZE;
  const paginated = products.slice(startIndex, startIndex + PAGE_SIZE);

  if (!paginated.length) {
    return {
      text: "🔥 *Prendas con stock disponible*\n━━━━━━━━━━━━━━━━━━━━\n⚠️ No hay prendas con stock disponible en este momento.",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🗂️ Ver por tipo", callback_data: "inv:types" }],
          [{ text: "↩️ Menú inventario", callback_data: "inv:menu" }],
        ],
      },
    };
  }

  const keyboard = [];
  paginated.forEach((product) => {
    const stock = getProductTotalStock(product);
    const label = `${String(product.name || "Producto").slice(0, 32)} · ${stock} disp.`;
    keyboard.push([{
      text: label,
      callback_data: `inv:product:${getProductToken(product.id)}`,
    }]);
  });

  const navRow = [];
  if (currentPage > 0) {
    navRow.push({ text: "⬅️ Anterior", callback_data: `inv:instock:${currentPage - 1}` });
  }
  if (currentPage < totalPages - 1) {
    navRow.push({ text: "Siguiente ➡️", callback_data: `inv:instock:${currentPage + 1}` });
  }
  if (navRow.length) keyboard.push(navRow);

  keyboard.push([
    { text: "🗂️ Filtrar por tipo", callback_data: "inv:types" },
    { text: "↩️ Inventario", callback_data: "inv:menu" },
  ]);

  const pageBadge = totalPages > 1 ? ` · Pág. ${currentPage + 1}/${totalPages}` : "";
  return {
    text: `🔥 *Prendas con stock disponible* (${products.length} modelos${pageBadge})\n━━━━━━━━━━━━━━━━━━━━\nSelecciona una prenda para registrar la venta:`,
    reply_markup: { inline_keyboard: keyboard },
  };
}

function findInventoryMatches(products = [], query = "") {
  const normalizedQuery = String(query || "").trim().toLocaleLowerCase("es");
  const cleanNeedle = normalizedQuery.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (!cleanNeedle) return [];

  const matches = products.filter((product) => {
    const name = String(product.name || "").toLocaleLowerCase("es").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const type = String(product.productType || "").toLocaleLowerCase("es").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const cat = String(product.category || "").toLocaleLowerCase("es").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const tags = (Array.isArray(product.filterTags) ? product.filterTags : []).join(" ").toLocaleLowerCase("es").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const colors = (Array.isArray(product.variants) ? product.variants : []).map((v) => String(v.color || "")).join(" ").toLocaleLowerCase("es").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return name.includes(cleanNeedle) || type.includes(cleanNeedle) || cat.includes(cleanNeedle) || tags.includes(cleanNeedle) || colors.includes(cleanNeedle);
  });

  matches.sort((a, b) => {
    const stockA = getProductTotalStock(a);
    const stockB = getProductTotalStock(b);
    if ((stockA > 0) !== (stockB > 0)) return stockB - stockA;
    return stockB - stockA || String(a.name || "").localeCompare(String(b.name || ""), "es");
  });
  return matches;
}

async function sendInventorySearchResults(token, chatId, query, messageId = null, options = {}) {
  const mode = options?.mode === "restock" ? "restock" : "sale";
  const store = await readStore();
  const products = Array.isArray(store?.products) ? store.products : [];
  const matches = findInventoryMatches(products, query);

  if (!matches.length) {
    const text = `🔍 *Sin resultados*\n\nNo encontré prendas para “${escapeTelegramMarkdown(query)}”.\n\nPrueba con otro nombre o tipo de prenda.`;
    const markup = {
      reply_markup: {
        inline_keyboard: [
          [{ text: "🔎 Buscar otra vez", callback_data: mode === "restock" ? "inv:add:search" : "inv:search" }],
          [{ text: "🗂️ Elegir tipo de prenda", callback_data: getInventoryModeNavigation(mode).types }],
          [{ text: "↩️ Menú inventario", callback_data: "inv:menu" }],
        ],
      },
    };
    if (messageId) {
      const edited = await editTelegramMessage(token, chatId, messageId, text, markup);
      if (!edited) await sendTelegramMessage(token, chatId, text, markup);
    } else {
      await sendTelegramMessage(token, chatId, text, markup);
    }
    return;
  }

  const actionLabel = mode === "restock" ? "aumentar su stock" : "registrar la venta";
  const text = `👗 *Resultados para “${escapeTelegramMarkdown(query)}” · ${matches.length} prenda${matches.length === 1 ? "" : "s"}*\n\nElige una prenda para ${actionLabel}:`;
  const markup = {
    reply_markup: {
      inline_keyboard: [
        ...matches.slice(0, 8).map((product) => {
          const stock = getProductTotalStock(product);
          const badge = stock > 0 ? `· ${stock} disp.` : "· ❌ Agotado";
          const label = `${String(product.name || "Producto").slice(0, 32)} ${badge}`;
          return [{
            text: label,
            callback_data: mode === "restock"
              ? `inv:add:product:${getProductToken(product.id)}`
              : (stock > 0 ? `inv:product:${getProductToken(product.id)}` : "inv:nostock"),
          }];
        }),
        [{ text: "🔎 Buscar otra", callback_data: mode === "restock" ? "inv:add:search" : "inv:search" }],
        [{ text: "🗂️ Elegir tipo de prenda", callback_data: getInventoryModeNavigation(mode).types }],
        [{ text: "↩️ Menú inventario", callback_data: "inv:menu" }],
      ],
    },
  };

  if (messageId) {
    const edited = await editTelegramMessage(token, chatId, messageId, text, markup);
    if (!edited) await sendTelegramMessage(token, chatId, text, markup);
  } else {
    await sendTelegramMessage(token, chatId, text, markup);
  }
}

function buildInventoryMenu() {
  return {
    text: "🛍️ *Inventario*\n\n¿Qué necesitas hacer?",
    reply_markup: { inline_keyboard: [
      [
        { text: "➖ Registrar venta", callback_data: "inv:types" },
        { text: "➕ Reponer stock", callback_data: "inv:add:types" },
      ],
      [
        { text: "⚠️ Stock bajo", callback_data: "inv:restock:0" },
        { text: "🔥 Con stock", callback_data: "inv:instock:0" },
      ],
      [{ text: "↩️ Deshacer última venta", callback_data: "inv:undo-last" }],
      [{ text: "⌂ Inicio", callback_data: "home" }],
    ] },
  };
}

function buildInventoryRestockView(store = {}, requestedPage = 0) {
  const products = (Array.isArray(store?.products) ? store.products : [])
    .map((product) => {
      const lowVariants = (Array.isArray(product?.variants) ? product.variants : [])
        .filter((variant) => Math.max(0, Number(variant.stock) || 0) <= 2);
      return {
        product,
        lowVariants,
        minimumStock: lowVariants.length
          ? Math.min(...lowVariants.map((variant) => Math.max(0, Number(variant.stock) || 0)))
          : Number.POSITIVE_INFINITY,
      };
    })
    .filter((entry) => entry.lowVariants.length > 0)
    .sort((left, right) => (
      left.minimumStock - right.minimumStock
      || String(left.product?.name || "").localeCompare(String(right.product?.name || ""), "es")
    ));

  if (!products.length) {
    return {
      text: "✅ *Inventario saludable*\n\nNo hay variantes agotadas o con stock bajo. También puedes buscar cualquier prenda para agregar unidades.",
      reply_markup: { inline_keyboard: [
        [{ text: "🗂️ Reponer por tipo", callback_data: "inv:add:types" }],
        [{ text: "🔎 Buscar un modelo", callback_data: "inv:add:search" }],
        [{ text: "↩️ Menú inventario", callback_data: "inv:menu" }],
      ] },
    };
  }

  const pageSize = 6;
  const pageCount = Math.max(1, Math.ceil(products.length / pageSize));
  const page = Math.min(Math.max(0, Math.floor(Number(requestedPage) || 0)), pageCount - 1);
  const visible = products.slice(page * pageSize, (page + 1) * pageSize);
  const keyboard = visible.map(({ product, lowVariants, minimumStock }) => [{
    text: `${String(product?.name || "Producto").slice(0, 28)} · ${minimumStock === 0 ? "agotado" : `${minimumStock} mín.`} · ${lowVariants.length} variante${lowVariants.length === 1 ? "" : "s"}`,
    callback_data: `inv:add:product:${getProductToken(product?.id)}`,
  }]);
  const navigation = [];
  if (page > 0) navigation.push({ text: "← Anterior", callback_data: `inv:restock:${page - 1}` });
  if (page < pageCount - 1) navigation.push({ text: "Siguiente →", callback_data: `inv:restock:${page + 1}` });
  if (navigation.length) keyboard.push(navigation);
  keyboard.push([{ text: "🔎 Buscar otra prenda", callback_data: "inv:add:search" }]);
  keyboard.push([{ text: "🗂️ Todos los tipos", callback_data: "inv:add:types" }]);
  keyboard.push([{ text: "↩️ Menú inventario", callback_data: "inv:menu" }]);

  return {
    text: `➕ *Reponer stock · Solo stock bajo*\n\n${products.length} modelo${products.length === 1 ? "" : "s"} por revisar. Elige uno para agregar unidades.${pageCount > 1 ? `\nPágina ${page + 1} de ${pageCount}.` : ""}`,
    reply_markup: { inline_keyboard: keyboard },
  };
}

function getPendingOrders(orders = []) {
  return (Array.isArray(orders) ? orders : [])
    .filter((order) => {
      const status = String(order?.status || "").toLowerCase();
      return ["pendiente", "confirmado", "preparando", "en preparación", "listo para retiro", "enviado"].includes(status);
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
    `⚡ [Ver en Panel Admin](${getAdminPanelUrl()})`,
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

async function registerGuidedPhysicalSale({ chatId, callbackId, operationId = "", productToken, colorIndex, sizeIndex, quantity }) {
  let result = null;
  await updateStore((draft) => {
    if (!claimInventoryCallback(draft, operationId || callbackId)) {
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
    if (!product || !variant || !Number.isSafeInteger(stock) || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 100 || stock < quantity) {
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
      delta: -quantity,
      previousStock: stock,
      nextStock: variant.stock,
      reason: "Venta física por Telegram",
      source: "telegram",
      status: "active",
      createdAt: new Date().toISOString(),
    };
    draft.physicalStockEvents = [...(Array.isArray(draft.physicalStockEvents) ? draft.physicalStockEvents : []), event].slice(-80);
    bumpRealtimeMeta(draft, ["catalog"]);
    result = { ok: true, stock: variant.stock, event, modelsBackButton: buildInventoryModelsBackButton(draft, product) };
    return draft;
  });
  return result;
}

function resolveProductVariant(products, productToken, colorIndex, sizeIndex) {
  const product = findProductByToken(products, productToken);
  const { colors, variants } = getProductOptions(product);
  const color = colors[Number(colorIndex)];
  const colorVariants = variants.filter((variant) => variant.color === color);
  const sizes = [...new Set(colorVariants.map((variant) => String(variant.size || "").trim()).filter(Boolean))];
  const size = sizes[Number(sizeIndex)];
  const variant = colorVariants.find((entry) => entry.size === size);
  return { product, color, size, variant };
}

async function registerGuidedStockRestock({ chatId, callbackId, operationId = "", productToken, colorIndex, sizeIndex, quantity }) {
  let result = null;
  await updateStore((draft) => {
    if (!claimInventoryCallback(draft, operationId || callbackId)) {
      result = { duplicate: true };
      return draft;
    }

    const { product, color, size, variant } = resolveProductVariant(
      draft.products,
      productToken,
      colorIndex,
      sizeIndex,
    );
    const stock = Number(variant?.stock);
    const safeQuantity = Number(quantity);
    if (
      !product
      || !variant
      || !Number.isSafeInteger(stock)
      || stock < 0
      || !Number.isSafeInteger(safeQuantity)
      || safeQuantity < 1
      || safeQuantity > 100
    ) {
      result = { ok: false, reason: "invalid", stock: Math.max(0, Number.isFinite(stock) ? stock : 0) };
      return draft;
    }
    if (stock + safeQuantity > 999) {
      result = { ok: false, reason: "limit", stock, maxQuantity: Math.max(0, 999 - stock) };
      return draft;
    }

    variant.stock = stock + safeQuantity;
    refreshProductStock(product);
    const event = {
      id: `restock-${randomUUID()}`,
      chatId,
      productId: String(product.id || ""),
      productName: String(product.name || "Producto"),
      color,
      size,
      quantity: safeQuantity,
      delta: safeQuantity,
      previousStock: stock,
      nextStock: variant.stock,
      reason: "Reposición por Telegram",
      source: "telegram",
      status: "active",
      createdAt: new Date().toISOString(),
    };
    draft.physicalStockEvents = [
      ...(Array.isArray(draft.physicalStockEvents) ? draft.physicalStockEvents : []),
      event,
    ].slice(-80);
    bumpRealtimeMeta(draft, ["catalog"]);
    result = { ok: true, previousStock: stock, stock: variant.stock, event, modelsBackButton: buildInventoryModelsBackButton(draft, product, "restock") };
    return draft;
  });
  return result;
}

async function undoStockRestock(chatId, eventId, callbackId = "") {
  let result = null;
  await updateStore((draft) => {
    if (callbackId && !claimInventoryCallback(draft, callbackId)) {
      result = { ok: false, reason: "duplicate" };
      return draft;
    }
    const events = Array.isArray(draft.physicalStockEvents) ? draft.physicalStockEvents : [];
    const event = events.find((item) => (
      item?.status === "active"
      && String(item.id || "") === String(eventId || "")
      && String(item.chatId || "") === String(chatId || "")
      && Number(item.delta) > 0
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
    const quantity = Math.max(1, Number(event.delta) || Number(event.quantity) || 1);
    const stock = Number(variant?.stock);
    if (!variant || !Number.isSafeInteger(stock) || stock < quantity) {
      result = { ok: false, reason: "stock-changed", stock: Math.max(0, Number.isFinite(stock) ? stock : 0) };
      return draft;
    }

    variant.stock = stock - quantity;
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
      && Number(item.delta ?? -Math.max(1, Number(item.quantity) || 1)) < 0
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

function normalizeGuideRegistrationInput(courierName, trackingNumber) {
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
  cleanCourier = cleanCourier.slice(0, 80);
  cleanNumber = cleanNumber.slice(0, 80);
  const valid = /^(?=.{4,80}$)(?=.*\d)[\p{L}\p{N}][\p{L}\p{N}._/-]*$/u.test(cleanNumber);
  return { cleanCourier, cleanNumber, valid };
}

function formatGuidePrompt(orderCode, courierName, errorMessage = "") {
  const lines = [
    `📦 Pedido: \`${escapeTelegramMarkdown(orderCode)}\``,
    `🚚 Courier: *${escapeTelegramMarkdown(courierName)}*`,
    "",
  ];
  if (errorMessage) lines.push(`⚠️ ${escapeTelegramMarkdown(errorMessage)}`, "");
  lines.push("Responde únicamente con el número de guía. Debe contener al menos un número y no llevar espacios.", "Escribe /cancelar para salir.");
  return lines.join("\n");
}

async function readPendingGuidePrompt(chatId) {
  const memoryPrompt = PENDING_GUIDE_PROMPTS.get(chatId);
  if (memoryPrompt?.expiresAt > Date.now()) return memoryPrompt;
  if (memoryPrompt) PENDING_GUIDE_PROMPTS.delete(chatId);
  try {
    const store = await readStore();
    const persisted = store?.meta?.pendingGuidePrompts?.[chatId];
    if (persisted?.expiresAt > Date.now()) {
      PENDING_GUIDE_PROMPTS.set(chatId, persisted);
      return persisted;
    }
  } catch (err) {
    console.error("[read-persisted-guide-prompt-error]", err?.message || err);
  }
  return null;
}

async function clearPendingGuidePrompt(chatId) {
  const hadMemoryPrompt = PENDING_GUIDE_PROMPTS.delete(chatId);
  let hadPersistedPrompt = false;
  try {
    await updateStore((draft) => {
      if (!draft.meta?.pendingGuidePrompts?.[chatId]) return draft;
      hadPersistedPrompt = true;
      const pending = { ...draft.meta.pendingGuidePrompts };
      delete pending[chatId];
      draft.meta.pendingGuidePrompts = pending;
      return draft;
    });
  } catch (err) {
    console.error("[clear-persisted-guide-prompt-error]", err?.message || err);
  }
  return hadMemoryPrompt || hadPersistedPrompt;
}

async function applyOrderGuideRegistration(token, senderChatId, orderQuery, courierName, trackingNumber, promptMessageId = null) {
  const { cleanCourier, cleanNumber, valid } = normalizeGuideRegistrationInput(courierName, trackingNumber);
  if (!valid) {
    await editTelegramMessage(
      token,
      senderChatId,
      promptMessageId,
      formatGuidePrompt(orderQuery, cleanCourier, "El número ingresado no parece una guía válida."),
      { reply_markup: { force_reply: true, selective: true, input_field_placeholder: "Ej. LAAR-99887766" } },
    );
    return false;
  }

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
    await sendTelegramMessage(token, senderChatId, "⚠️ No se encontró ningún pedido que coincida con `" + escapeTelegramMarkdown(orderQuery) + "`.");
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
    } else if (data === "inv:types" || data.startsWith("inv:types:") || data === "inv:add:types" || data.startsWith("inv:add:types:")) {
      await answerCallbackQuery(token, cb.id, "Cargando tipos de prenda...");
      const store = await readStore();
      const mode = data.startsWith("inv:add:") ? "restock" : "sale";
      const prefix = getInventoryModeNavigation(mode).types;
      const page = data === prefix ? 0 : Number(data.slice(prefix.length + 1));
      const view = buildInventoryTypesView(store, { mode, page });
      await editTelegramMessage(token, senderChatId, sourceMessageId, view.text, { reply_markup: view.reply_markup });
    } else if (data.startsWith("inv:type:") || data.startsWith("inv:add:type:")) {
      await answerCallbackQuery(token, cb.id);
      const mode = data.startsWith("inv:add:") ? "restock" : "sale";
      const prefix = getInventoryModeNavigation(mode).type;
      const [typeToken, rawPage] = data.slice(prefix.length + 1).split(":");
      const store = await readStore();
      const view = buildInventoryProductsByTypeView(store, typeToken, Number(rawPage || 0), { mode });
      await editTelegramMessage(token, senderChatId, sourceMessageId, view.text, { reply_markup: view.reply_markup });
    } else if (data.startsWith("inv:instock:")) {
      await answerCallbackQuery(token, cb.id);
      const rawPage = data.slice("inv:instock:".length);
      const store = await readStore();
      const view = buildInventoryInStockView(store, Number(rawPage || 0));
      await editTelegramMessage(token, senderChatId, sourceMessageId, view.text, { reply_markup: view.reply_markup });
    } else if (data === "inv:search") {
      await answerCallbackQuery(token, cb.id);
      await sendTelegramMessage(token, senderChatId, "🔎 *Buscar producto para venta física*\n\nEscribe el nombre o tipo de prenda (ej: _Cortas_, _Largas_, _Vestido_):", {
        reply_markup: { force_reply: true, selective: true },
      });
      if (Number.isSafeInteger(sourceMessageId) && sourceMessageId > 0) {
        await deleteTelegramMessage(token, senderChatId, sourceMessageId);
      }
    } else if (data === "inv:add:search") {
      await answerCallbackQuery(token, cb.id);
      await sendTelegramMessage(token, senderChatId, "➕ *Buscar producto para reponer stock*\n\nEscribe el nombre o tipo de prenda:", {
        reply_markup: { force_reply: true, selective: true, input_field_placeholder: "Ej. Vestido o Cortas" },
      });
      if (Number.isSafeInteger(sourceMessageId) && sourceMessageId > 0) {
        await deleteTelegramMessage(token, senderChatId, sourceMessageId);
      }
    } else if (data === "inv:restock" || data.startsWith("inv:restock:")) {
      await answerCallbackQuery(token, cb.id, "Revisando reposición...");
      const store = await readStore();
      const page = data.startsWith("inv:restock:") ? Number(data.slice("inv:restock:".length)) : 0;
      const view = buildInventoryRestockView(store, page);
      await editTelegramMessage(token, senderChatId, sourceMessageId, view.text, { reply_markup: view.reply_markup });
    } else if (data === "inv:undo-last") {
      await answerCallbackQuery(token, cb.id, "Revirtiendo última venta...");
      const result = await undoPhysicalStockSale(senderChatId, "", null, cb.id);
      await editTelegramMessage(token, senderChatId, sourceMessageId, result?.ok
        ? `↩️ *Venta física deshecha*\n\nSe devolvió *${result.event.quantity}* unidad(es) de *${escapeTelegramMarkdown(result.event.productName)}* (${escapeTelegramMarkdown(result.event.color)} / ${escapeTelegramMarkdown(result.event.size)}).\nStock actual: *${result.stock}*.`
        : "⚠️ No hay una venta física reciente para deshacer.", {
        reply_markup: { inline_keyboard: [[{ text: "↩️ Inventario", callback_data: "inv:menu" }]] },
      });
    } else if (data === "inv:nostock") {
      await answerCallbackQuery(token, cb.id, "⚠️ Esta opción no tiene stock disponible.", { show_alert: true });
    } else if (data.startsWith("inv:add:product:")) {
      await answerCallbackQuery(token, cb.id);
      const productToken = data.slice("inv:add:product:".length);
      const store = await readStore();
      const product = findProductByToken(store.products, productToken);
      const { colors, variants } = getProductOptions(product);
      if (!product || !colors.length) {
        await editTelegramMessage(token, senderChatId, sourceMessageId, "⚠️ La prenda ya no está disponible. Busca otra.", {
          reply_markup: { inline_keyboard: [[{ text: "↩️ Elegir tipo", callback_data: "inv:add:types" }], [{ text: "🔎 Buscar", callback_data: "inv:add:search" }]] },
        });
      } else {
        const colorButtons = colors.map((color, index) => {
          const colorStock = variants
            .filter((variant) => variant.color === color)
            .reduce((sum, variant) => sum + Math.max(0, Number(variant.stock) || 0), 0);
          return [{
            text: `${String(color).slice(0, 36)} · ${colorStock} disp.`,
            callback_data: `inv:add:color:${productToken}:${index}`,
          }];
        });
        await editTelegramMessage(token, senderChatId, sourceMessageId, `➕ *Reponer stock*\n*${escapeTelegramMarkdown(product.name)}*\n\nElige el color:`, {
          reply_markup: { inline_keyboard: [
            ...colorButtons,
            [buildInventoryModelsBackButton(store, product, "restock")],
            [{ text: "⌂ Inventario", callback_data: "inv:menu" }],
          ] },
        });
      }
    } else if (data.startsWith("inv:add:color:")) {
      await answerCallbackQuery(token, cb.id);
      const [, , , productToken, rawColorIndex] = data.split(":");
      const colorIndex = Number(rawColorIndex);
      const store = await readStore();
      const product = findProductByToken(store.products, productToken);
      const { colors, variants } = getProductOptions(product);
      const color = colors[colorIndex];
      const colorVariants = variants.filter((variant) => variant.color === color);
      const sizes = [...new Set(colorVariants.map((variant) => String(variant.size || "").trim()).filter(Boolean))];
      if (!product || !color || !sizes.length) {
        await editTelegramMessage(token, senderChatId, sourceMessageId, "⚠️ La variante cambió. Vuelve a elegir la prenda.", {
          reply_markup: { inline_keyboard: [[{ text: "🔎 Buscar", callback_data: "inv:add:search" }]] },
        });
      } else {
        const sizeButtons = sizes.map((size, index) => {
          const stock = Math.max(0, Number(colorVariants.find((variant) => variant.size === size)?.stock) || 0);
          return [{
            text: `${String(size).slice(0, 20)} · stock actual ${stock}`,
            callback_data: `inv:add:size:${productToken}:${colorIndex}:${index}`,
          }];
        });
        await editTelegramMessage(token, senderChatId, sourceMessageId, `📏 *${escapeTelegramMarkdown(product.name)} · ${escapeTelegramMarkdown(color)}*\n\nSelecciona la talla que recibiste:`, {
          reply_markup: { inline_keyboard: [
            ...sizeButtons,
            [{ text: "↩️ Cambiar color", callback_data: `inv:add:product:${productToken}` }],
          ] },
        });
      }
    } else if (data.startsWith("inv:add:size:")) {
      await answerCallbackQuery(token, cb.id);
      const [, , , productToken, rawColorIndex, rawSizeIndex] = data.split(":");
      const colorIndex = Number(rawColorIndex);
      const sizeIndex = Number(rawSizeIndex);
      const store = await readStore();
      const { product, color, size, variant } = resolveProductVariant(store.products, productToken, colorIndex, sizeIndex);
      const stock = Math.max(0, Number(variant?.stock) || 0);
      if (!product || !variant) {
        await editTelegramMessage(token, senderChatId, sourceMessageId, "⚠️ La variante cambió. Vuelve a buscar la prenda.", {
          reply_markup: { inline_keyboard: [[{ text: "🔎 Buscar", callback_data: "inv:add:search" }]] },
        });
      } else {
        const quantities = [1, 2, 3, 5, 10, 20].filter((quantity) => stock + quantity <= 999);
        if (!quantities.length) {
          await editTelegramMessage(token, senderChatId, sourceMessageId, `ℹ️ *Stock máximo alcanzado*\n\n${escapeTelegramMarkdown(product.name)} · ${escapeTelegramMarkdown(color)} · ${escapeTelegramMarkdown(size)} ya tiene *${stock}* unidades.`, {
            reply_markup: { inline_keyboard: [[{ text: "↩️ Elegir otra talla", callback_data: `inv:add:color:${productToken}:${colorIndex}` }]] },
          });
        } else {
          await editTelegramMessage(token, senderChatId, sourceMessageId, `🔢 *Unidades recibidas*\n\n${escapeTelegramMarkdown(product.name)} · ${escapeTelegramMarkdown(color)} · ${escapeTelegramMarkdown(size)}\nStock actual: *${stock}*`, {
            reply_markup: { inline_keyboard: [
              quantities.slice(0, 4).map((quantity) => ({ text: `+${quantity}`, callback_data: `inv:add:qty:${productToken}:${colorIndex}:${sizeIndex}:${quantity}` })),
              quantities.slice(4).map((quantity) => ({ text: `+${quantity}`, callback_data: `inv:add:qty:${productToken}:${colorIndex}:${sizeIndex}:${quantity}` })),
              [{ text: "↩️ Cambiar talla", callback_data: `inv:add:color:${productToken}:${colorIndex}` }],
            ].filter((row) => row.length) },
          });
        }
      }
    } else if (data.startsWith("inv:add:qty:")) {
      await answerCallbackQuery(token, cb.id);
      const [, , , productToken, rawColorIndex, rawSizeIndex, rawQuantity] = data.split(":");
      const colorIndex = Number(rawColorIndex);
      const sizeIndex = Number(rawSizeIndex);
      const quantity = Number(rawQuantity);
      const store = await readStore();
      const { product, color, size, variant } = resolveProductVariant(store.products, productToken, colorIndex, sizeIndex);
      const stock = Math.max(0, Number(variant?.stock) || 0);
      if (!product || !variant || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 100 || stock + quantity > 999) {
        await editTelegramMessage(token, senderChatId, sourceMessageId, "⚠️ La cantidad o la variante ya no es válida. Revísala nuevamente.", {
          reply_markup: { inline_keyboard: [[{ text: "🔄 Revisar", callback_data: `inv:add:size:${productToken}:${colorIndex}:${sizeIndex}` }]] },
        });
      } else {
        await editTelegramMessage(token, senderChatId, sourceMessageId, `🧾 *Confirmar reposición*\n\n*${escapeTelegramMarkdown(product.name)}* · ${escapeTelegramMarkdown(color)} · ${escapeTelegramMarkdown(size)}\nAgregar: *${quantity}* · Stock: *${stock} → ${stock + quantity}*`, {
          reply_markup: { inline_keyboard: [
            [{ text: `✅ Agregar ${quantity} al stock`, callback_data: `inv:add:confirm:${productToken}:${colorIndex}:${sizeIndex}:${quantity}` }],
            [{ text: "↩️ Cambiar cantidad", callback_data: `inv:add:size:${productToken}:${colorIndex}:${sizeIndex}` }],
          ] },
        });
      }
    } else if (data.startsWith("inv:add:confirm:")) {
      await answerCallbackQuery(token, cb.id, "Actualizando stock...");
      const [, , , productToken, rawColorIndex, rawSizeIndex, rawQuantity] = data.split(":");
      const result = await registerGuidedStockRestock({
        chatId: senderChatId,
        callbackId: cb.id,
        operationId: `restock:${senderChatId}:${sourceMessageId}:${data}`,
        productToken,
        colorIndex: Number(rawColorIndex),
        sizeIndex: Number(rawSizeIndex),
        quantity: Number(rawQuantity),
      });
      if (result?.duplicate) {
        await editTelegramMessage(token, senderChatId, sourceMessageId, "ℹ️ Esta reposición ya fue procesada.", {
          reply_markup: buildInventoryMenu().reply_markup,
        });
      } else if (result?.ok) {
        await editTelegramMessage(token, senderChatId, sourceMessageId, `✅ *Stock actualizado*\n\n${escapeTelegramMarkdown(result.event.productName)} · ${escapeTelegramMarkdown(result.event.color)} · ${escapeTelegramMarkdown(result.event.size)}\nAgregadas: *${result.event.quantity}* · Stock: *${result.previousStock} → ${result.stock}*`, {
          reply_markup: { inline_keyboard: [
            [{ text: "↩️ Deshacer reposición", callback_data: `undo-restock:${result.event.id}` }],
            [{ ...result.modelsBackButton, text: "➕ Otro modelo del mismo tipo" }],
            [{ text: "🗂️ Cambiar tipo", callback_data: "inv:add:types" }],
            [{ text: "⌂ Inventario", callback_data: "inv:menu" }],
          ] },
        });
      } else {
        const message = result?.reason === "limit"
          ? `⚠️ El stock máximo permitido es 999. Stock actual: *${result.stock}*; puedes agregar hasta *${result.maxQuantity}*.`
          : "⚠️ La variante cambió y no se modificó el stock. Vuelve a revisarla.";
        await editTelegramMessage(token, senderChatId, sourceMessageId, message, {
          reply_markup: { inline_keyboard: [[{ text: "🔄 Revisar", callback_data: `inv:add:size:${productToken}:${rawColorIndex}:${rawSizeIndex}` }]] },
        });
      }
    } else if (data.startsWith("inv:product:")) {
      await answerCallbackQuery(token, cb.id);
      const productToken = data.slice("inv:product:".length);
      const store = await readStore();
      const product = findProductByToken(store.products, productToken);
      const { colors, variants } = getProductOptions(product);
      if (!product || !colors.length) {
        await editTelegramMessage(token, senderChatId, sourceMessageId, "⚠️ El producto ya no está disponible. Inicia otra búsqueda.", { reply_markup: { inline_keyboard: [[{ text: "🔎 Buscar otra", callback_data: "inv:search" }], [{ text: "🗂️ Ver por tipo", callback_data: "inv:types" }]] } });
      } else {
        const colorButtons = colors.map((color, index) => {
          const colorVariants = variants.filter((variant) => variant.color === color);
          const colorStock = colorVariants.reduce((sum, variant) => sum + Math.max(0, Number(variant.stock) || 0), 0);
          const badge = colorStock > 0 ? `· ${colorStock} disp.` : "· Agotado";
          return [{
            text: `${color.slice(0, 36)} ${badge}`,
            callback_data: colorStock > 0 ? `inv:color:${productToken}:${index}` : "inv:nostock",
          }];
        });
        await editTelegramMessage(token, senderChatId, sourceMessageId, `➖ *Registrar venta*\n*${escapeTelegramMarkdown(product.name)}*\n\nElige el color:`, {
          reply_markup: { inline_keyboard: [
            ...colorButtons,
            [buildInventoryModelsBackButton(store, product)],
            [{ text: "↩️ Menú inventario", callback_data: "inv:menu" }],
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
        operationId: `sale:${senderChatId}:${sourceMessageId}:${data}`,
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
          reply_markup: { inline_keyboard: [
            [{ text: "↩️ Deshacer venta", callback_data: `undo-stock:${result.event.id}` }],
            [{ ...result.modelsBackButton, text: "➖ Otro modelo del mismo tipo" }],
            [{ text: "🗂️ Cambiar tipo", callback_data: "inv:types" }],
            [{ text: "⌂ Inventario", callback_data: "inv:menu" }],
          ] },
        });
      } else {
        await editTelegramMessage(token, senderChatId, sourceMessageId, `⚠️ El stock cambió y no se descontó. Disponible ahora: *${result?.stock || 0}*.`, { reply_markup: { inline_keyboard: [[{ text: "🔄 Volver a buscar", callback_data: "inv:search" }]] } });
      }
    } else if (data.startsWith("undo-restock:")) {
      const eventId = data.slice("undo-restock:".length);
      const result = await undoStockRestock(senderChatId, eventId, cb.id);
      if (result?.ok) {
        await answerCallbackQuery(token, cb.id, "Reposición deshecha.");
        const event = result.event;
        await editTelegramMessage(token, senderChatId, sourceMessageId, `↩️ *Reposición deshecha*\n\n${escapeTelegramMarkdown(event.productName)} · ${escapeTelegramMarkdown(event.color)} · ${escapeTelegramMarkdown(event.size)}\nRetiradas: *${event.quantity}* · Stock: *${result.stock}*`, {
          reply_markup: buildInventoryMenu().reply_markup,
        });
      } else if (result?.reason === "stock-changed") {
        await answerCallbackQuery(token, cb.id, "El stock cambió; no se puede deshacer.", { show_alert: true });
        await editTelegramMessage(token, senderChatId, sourceMessageId, `⚠️ No se puede deshacer: el stock actual es *${result.stock}* y parte de la reposición ya pudo haberse vendido.`, {
          reply_markup: buildInventoryMenu().reply_markup,
        });
      } else {
        await answerCallbackQuery(token, cb.id, "Esta reposición ya fue deshecha.", { show_alert: true });
      }
    } else if (data.startsWith("undo-stock:")) {
      const eventId = data.slice("undo-stock:".length);
      const result = await undoPhysicalStockSale(senderChatId, eventId);
      if (result?.ok) {
        await answerCallbackQuery(token, cb.id, "Venta deshecha.");
        const event = result.event;
        await editTelegramMessage(token, senderChatId, sourceMessageId, `↩️ *Venta deshecha*\n\n${escapeTelegramMarkdown(event.productName)} · ${escapeTelegramMarkdown(event.color)} · ${escapeTelegramMarkdown(event.size)}\nDevueltas: *${event.quantity}* · Stock: *${result.stock}*`, { reply_markup: buildInventoryMenu().reply_markup });
      } else {
        await answerCallbackQuery(token, cb.id, "Esta venta ya fue deshecha.", { show_alert: true });
      }
    } else if (data.startsWith("order-delete:")) {
      // OWASP Authorization Cheat Sheet: validate permissions on every request.
      // The admin allowlist above is rechecked even for confirmation callbacks.
      const [, operation, ...reference] = data.split(":");
      const value = reference.join(":");
      if (String(cb.from?.id || "") !== senderChatId || String(cb.message?.chat?.id || "") !== senderChatId) {
        await answerCallbackQuery(token, cb.id, "Abre el pedido en tu chat privado con el bot para eliminarlo.", { show_alert: true });
        res.status(200).json({ ok: true });
        return;
      }
      await answerCallbackQuery(token, cb.id);
      const back = { inline_keyboard: [[{ text: "↩️ Pedidos pendientes", callback_data: "pending:0" }]] };
      try {
        let view = null;
        await updateStore((draft) => {
          const orders = Array.isArray(draft.orders) ? draft.orders : [];
          draft.meta ||= {};
          const pending = draft.meta.telegramOrderDeletions ||= {};
          const fingerprint = (order) => createHash("sha256").update(JSON.stringify(order)).digest("hex");
          const showOrder = (order, text = "") => ({ text: text || formatTelegramOrderMessage(order), reply_markup: buildTelegramOrderKeyboard(order) });
          if (operation === "request") {
            const found = orders.find((order) => String(order.code).toUpperCase() === value.toUpperCase());
            if (!found || !Number.isSafeInteger(sourceMessageId) || sourceMessageId <= 0) {
              view = { text: "⚠️ Pedido no encontrado. No se eliminó nada.", reply_markup: back };
              return draft;
            }
            const nonce = randomUUID();
            // One expiring prompt per administrator; no proof or customer data copied.
            pending[senderChatId] = { nonce, orderId: String(found.id), code: String(found.code), messageId: sourceMessageId, fingerprint: fingerprint(found), expiresAt: Date.now() + 5 * 60 * 1000 };
            view = {
              text: `🗑️ *Eliminar pedido ${escapeTelegramMarkdown(found.code)}*\n\nSe borrará de la tienda junto con sus adjuntos y copias administradas. El stock reservado se reintegrará según las reglas de la web.\n\nEsta acción no se puede deshacer. ¿Confirmas?`,
              reply_markup: { inline_keyboard: [
                [{ text: "🗑️ Sí, eliminar definitivamente", callback_data: `order-delete:confirm:${nonce}` }],
                [{ text: "↩️ No, conservar pedido", callback_data: `order-delete:cancel:${nonce}` }],
              ] },
            };
          } else if (operation === "confirm" || operation === "cancel") {
            const prompt = pending[senderChatId];
            // Server-held nonce binds consent to admin, message, order and expiry.
            if (!prompt || prompt.nonce !== value || prompt.messageId !== sourceMessageId || prompt.expiresAt <= Date.now()) {
              view = { text: "⚠️ Confirmación vencida o ya utilizada. No se eliminó nada. Abre el pedido nuevamente.", reply_markup: back };
              return draft;
            }
            const found = orders.find((order) => String(order.id) === prompt.orderId);
            delete pending[senderChatId];
            if (!found) {
              view = { text: "ℹ️ Este pedido ya no existe. No se realizaron ajustes adicionales de stock.", reply_markup: back };
            } else if (operation === "cancel") {
              view = showOrder(found);
            } else if (fingerprint(found) !== prompt.fingerprint) {
              view = showOrder(found, `⚠️ El pedido cambió desde que pediste eliminarlo. No se eliminó nada.\n\n${formatTelegramOrderMessage(found)}`);
            } else {
              const result = deleteOrderFromDraft(draft, prompt.orderId);
              view = { text: `🗑️ Pedido *${escapeTelegramMarkdown(found.code)}* eliminado de la tienda junto con sus adjuntos.\n${result.warning ? `⚠️ ${escapeTelegramMarkdown(result.warning)}` : "Stock sincronizado según las reglas de la web."}`, reply_markup: back };
            }
          } else {
            view = { text: "⚠️ Acción no válida. No se eliminó nada.", reply_markup: back };
          }
          return draft;
        });
        await editTelegramMessage(token, senderChatId, sourceMessageId, view.text, { reply_markup: view.reply_markup });
      } catch (error) {
        console.error("[telegram-order-delete-error]", error?.code || "store-write-failed");
        await editTelegramMessage(token, senderChatId, sourceMessageId, "⚠️ No pudimos completar la eliminación y limpieza del pedido. Abre el pedido y vuelve a intentarlo.", { reply_markup: back });
      }
    } else if (data.startsWith("status:")) {
      const parts = data.split(":");
      const targetAction = parts[1];
      const orderCode = parts.slice(2).join(":");
      if (targetAction === "confirmed" && String(cb.from?.id || "") !== senderChatId) {
        await answerCallbackQuery(token, cb.id, "Acción no autorizada.", { show_alert: true });
        res.status(200).json({ ok: true });
        return;
      }

      const statusMap = {
        confirmed: "Confirmado",
        ready: "Listo para retiro",
        shipped: "Enviado",
        completed: "Entregado",
        preparing: "Preparando",
      };

      const newStatus = Object.hasOwn(statusMap, targetAction) ? statusMap[targetAction] : null;
      if (!newStatus) {
        await answerCallbackQuery(token, cb.id, "Estado no válido.", { show_alert: true });
        res.status(200).json({ ok: true });
        return;
      }
      let updatedOrder = null;
      let statusWarning = "";
      let statusSaveFailed = false;

      // Answer Telegram UI immediately so button stops spinning
      await answerCallbackQuery(token, cb.id, "Actualizando pedido " + orderCode + "...");

      try {
        await updateStore((draft) => {
          const orders = Array.isArray(draft.orders) ? draft.orders : [];
          const targetIndex = orders.findIndex((order) => String(order.code).toUpperCase() === String(orderCode).toUpperCase());
          if (targetIndex >= 0) {
            const current = orders[targetIndex];
            if (targetAction === "confirmed") {
              updatedOrder = current;
              if (current.status === "Confirmado") return draft;
              if ((current.status || "Pendiente") !== "Pendiente" || current.stockReservation?.state === "released") {
                statusWarning = "El pedido cambió o fue cancelado. No se cambió su estado.";
                return draft;
              }
            }
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
        statusSaveFailed = true;
        updatedOrder = null;
        console.error("[store-update-error]", storeError?.message || storeError);
      }

      if (updatedOrder) {
        await editTelegramMessage(token, senderChatId, sourceMessageId, `${statusWarning ? `⚠️ ${statusWarning}\n\n` : ""}${formatTelegramOrderMessage(updatedOrder)}`, {
          reply_markup: buildTelegramOrderKeyboard(updatedOrder),
        });
      } else {
        await editTelegramMessage(token, senderChatId, sourceMessageId, statusSaveFailed ? "⚠️ No pudimos guardar el estado del pedido. Abre el pedido para comprobarlo y vuelve a intentarlo." : "⚠️ No encontré el pedido `" + escapeTelegramMarkdown(orderCode) + "`.", {
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
    } else if (data === "proof-close") {
      await answerCallbackQuery(token, cb.id);
      await deleteTelegramMessage(token, senderChatId, sourceMessageId);
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
          const caption = "📸 *Comprobante de Pago*\n━━━━━━━━━━━━━━━━━━━━\n📦 *Pedido:* `" + found.code + "`\n👤 *Cliente:* " + escapeTelegramMarkdown(found.customerName || "Cliente") + "\n💰 *Monto:* *" + currency(found.total ?? found.subtotal) + "*" + (bankName ? "\n🏦 *Banco:* " + escapeTelegramMarkdown(bankName) : "") + `\n━━━━━━━━━━━━━━━━━━━━\n⚡ [Ver en Panel Admin](${getAdminPanelUrl()})`;

          const photoResult = await sendTelegramPhoto(token, senderChatId, found.paymentProof, caption, {
            reply_markup: {
              inline_keyboard: [[{ text: "↩️ Volver al pedido", callback_data: "proof-close" }]],
            },
          });
          if (!photoResult?.ok) {
            await editTelegramMessage(
              token,
              senderChatId,
              sourceMessageId,
              `⚠️ No pudimos enviar la foto directamente por Telegram. Puedes revisarlo en el [Panel Admin](${getAdminPanelUrl()}).`,
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

      const instructMsg = formatGuidePrompt(orderCode, courierName);
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
      { reply_markup: { remove_keyboard: true } },
    );

    res.status(200).json({ ok: true, authorized: false });
    return;
  }

  const rawText = String(message.text || "").trim();
  // Keyboard shortcuts are commands, even while Telegram still replies to an
  // old search/guide prompt. Never interpret a navigation label as order data.
  const text = ADMIN_KEYBOARD_COMMANDS.get(rawText.toLowerCase())
    || rawText.replace(/^\/(start|menu)@[a-zA-Z0-9_]+(?=\s|$)/i, "/$1");
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
  if (replyText.includes("Buscar producto para reponer stock") && text && !text.startsWith("/")) {
    await sendInventorySearchResults(token, senderChatId, text, message.reply_to_message?.message_id, { mode: "restock" });
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
    if (lowerText === "cancelar") {
      await clearPendingGuidePrompt(senderChatId);
      await editTelegramMessage(token, senderChatId, message.reply_to_message?.message_id, "✅ *Registro de guía cancelado.*", {
        reply_markup: { inline_keyboard: [[{ text: "↩️ Volver al pedido", callback_data: `view:${orderCode}` }]] },
      });
      res.status(200).json({ ok: true, authorized: true, cancelled: true });
      return;
    }
    const trackingNumber = text.trim();
    await applyOrderGuideRegistration(token, senderChatId, orderCode, courierName, trackingNumber, message.reply_to_message?.message_id);
    res.status(200).json({ ok: true, authorized: true });
    return;
  }

  const pendingPrompt = await readPendingGuidePrompt(senderChatId);

  if (pendingPrompt && (lowerText === "cancelar" || lowerText === "/cancelar")) {
    await clearPendingGuidePrompt(senderChatId);
    await editTelegramMessage(token, senderChatId, pendingPrompt.promptMessageId, "✅ *Registro de guía cancelado.*", {
      reply_markup: { inline_keyboard: [[{ text: "↩️ Volver al pedido", callback_data: `view:${pendingPrompt.orderCode}` }]] },
    });
    res.status(200).json({ ok: true, authorized: true, cancelled: true });
    return;
  }

  if (pendingPrompt && !text.startsWith("/") && normalizeGuideRegistrationInput(pendingPrompt.courierName, text).valid) {
    const trackingNumber = text.trim();
    await applyOrderGuideRegistration(token, senderChatId, pendingPrompt.orderCode, pendingPrompt.courierName, trackingNumber, pendingPrompt.promptMessageId);
    res.status(200).json({ ok: true, authorized: true });
    return;
  }

  if (pendingPrompt && text) {
    await clearPendingGuidePrompt(senderChatId);
  }

  // Command Handlers for Admin
  if (/^\/start(?:\s.*)?$/.test(lowerText) || lowerText === "hola" || lowerText === "/menu" || lowerText === "menu") {
    if (message.chat.type === "private" || (!message.chat.type && Number(senderChatId) > 0)) {
      await ensureTelegramBotCommandsRegistered(token, { chatId: senderChatId });
    }
    const store = await readStore();
    const home = buildAdminHome(store, senderName);
    await sendTelegramMessage(token, senderChatId, `${home.text}\n\nElige una acción en el teclado de abajo.\n[Ver panel admin](${getAdminPanelUrl()})`, { reply_markup: ADMIN_KEYBOARD_MARKUP });
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
  } else if (lowerText === "/reponer" || lowerText === "reponer" || lowerText === "reponer stock") {
    const store = await readStore();
    const view = buildInventoryTypesView(store, { mode: "restock" });
    await sendTelegramMessage(token, senderChatId, view.text, { reply_markup: view.reply_markup });
  } else if (lowerText === "/venta" || lowerText === "venta") {
    const store = await readStore();
    const view = buildInventoryTypesView(store);
    await sendTelegramMessage(token, senderChatId, view.text, { reply_markup: view.reply_markup });
  } else if (lowerText === "🛍️ inventario" || lowerText.includes("inventario físico") || lowerText.includes("inventario fisico") || lowerText === "/stock" || lowerText === "stock") {
    const menu = buildInventoryMenu();
    await sendTelegramMessage(token, senderChatId, menu.text, { reply_markup: menu.reply_markup });
  } else if (lowerText.startsWith("/stock ") || lowerText.startsWith("stock ")) {
    const query = text.replace(/^[/]?stock\s+/i, "").trim();
    const cleanNeedle = normalizeTypeName(query);
    const store = await readStore();
    const products = Array.isArray(store?.products) ? store.products : [];
    const matches = products.filter((product) => {
      const name = normalizeTypeName(product.name);
      const type = normalizeTypeName(product.productType);
      const cat = normalizeTypeName(product.category);
      const tags = (Array.isArray(product.filterTags) ? product.filterTags : []).map(normalizeTypeName).join(" ");
      return name.includes(cleanNeedle) || type.includes(cleanNeedle) || cat.includes(cleanNeedle) || tags.includes(cleanNeedle);
    }).slice(0, 6);

    if (!matches.length) {
      await sendTelegramMessage(token, senderChatId, "🔍 No encontré prendas que coincidan con *" + escapeTelegramMarkdown(query) + "*.", {
        reply_markup: {
          inline_keyboard: [
            [{ text: "🗂️ Ver por tipo de prenda", callback_data: "inv:types" }],
            [{ text: "🛍️ Menú inventario", callback_data: "inv:menu" }],
          ],
        },
      });
    } else {
      const lines = matches.map((product) => {
        const totalStock = getProductTotalStock(product);
        const variants = (product.variants || []).map((variant) => "• " + escapeTelegramMarkdown(variant.color) + " / " + escapeTelegramMarkdown(variant.size) + ": *" + Math.max(0, Number(variant.stock) || 0) + "*").join("\n");
        return "👗 *" + escapeTelegramMarkdown(product.name) + "* (Total: *" + totalStock + "* disp.)\n" + variants;
      });
      const sellButtons = matches.filter((p) => getProductTotalStock(p) > 0).slice(0, 3).map((p) => ([{
        text: `➖ Vender ${String(p.name).slice(0, 24)} (${getProductTotalStock(p)} disp)`,
        callback_data: `inv:product:${getProductToken(p.id)}`,
      }]));
      await sendTelegramMessage(token, senderChatId, "🔎 *Stock disponible para “" + escapeTelegramMarkdown(query) + "”*\n━━━━━━━━━━━━━━━━━━━━\n" + lines.join("\n\n"), {
        reply_markup: {
          inline_keyboard: [
            ...sellButtons,
            [{ text: "🗂️ Ver por tipos", callback_data: "inv:types" }],
            [{ text: "🛍️ Menú inventario", callback_data: "inv:menu" }],
          ],
        },
      });
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
        const previousStock = Number(variant.stock);
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
          delta: -quantity,
          previousStock,
          nextStock: variant.stock,
          reason: "Venta física por Telegram",
          source: "telegram",
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

    await applyOrderGuideRegistration(token, senderChatId, orderQuery, courierName, trackingNumber);
    res.status(200).json({ ok: true, authorized: true });
    return;
  } else if (lowerText === "🔍 buscar" || lowerText === "/buscar" || lowerText === "buscar" || lowerText.includes("buscar pedido") || lowerText === "🔍 buscar pedido") {
    const msg = "🔍 *Buscar pedido*\n\nResponde con el código o el nombre del cliente.";
    await sendTelegramMessage(token, senderChatId, msg, {
      reply_markup: { force_reply: true, selective: true, input_field_placeholder: "Ej. ORDER-10099 o María" },
    });
  } else if (lowerText.startsWith("/buscar ") || lowerText.startsWith("buscar ")) {
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
  } else if (lowerText === "/cancelar" || lowerText === "cancelar") {
    await sendTelegramMessage(token, senderChatId, "ℹ️ No hay ninguna operación pendiente para cancelar.");
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
  buildInventoryTypesView,
  buildInventoryProductsByTypeView,
  buildInventoryInStockView,
  buildInventoryRestockView,
  getAvailableProductTypes,
  getProductTotalStock,
  sendInventorySearchResults,
  formatHelpMessage,
  TELEGRAM_BOT_COMMANDS,
  registerTelegramBotCommands,
  PENDING_GUIDE_PROMPTS,
};
