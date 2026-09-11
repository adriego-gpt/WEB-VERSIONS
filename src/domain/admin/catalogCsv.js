const MAX_IMPORT_PRODUCTS = 100;
const MAX_IMPORT_VARIANTS = 500;
const MAX_TOTAL_PRODUCTS = 250;
const MAX_VARIANTS_PER_PRODUCT = 120;

function parseCsvRows(text = "") {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  const source = String(text || "").replace(/^\uFEFF/, "");

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === '"') {
      if (quoted && source[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && source[index + 1] === "\n") index += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function normalizeHeader(value = "") {
  return String(value || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function parseBoolean(value, fallback = false) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["1", "true", "si", "sí", "yes", "publico", "publicado"].includes(normalized)) return true;
  if (["0", "false", "no", "oculto", "borrador"].includes(normalized)) return false;
  return fallback;
}

function safeId(value = "") {
  return String(value || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70);
}

function escapeCsv(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function parseCatalogCsv(text = "", existingProducts = []) {
  const rows = parseCsvRows(text);
  if (rows.length < 2) return { products: [], errors: ["El archivo debe incluir encabezados y al menos una fila."], summary: null };
  const headers = rows[0].map(normalizeHeader);
  const required = ["nombre", "precio", "color", "talla", "stock"];
  const missing = required.filter((header) => !headers.includes(header));
  if (missing.length) return { products: [], errors: [`Faltan columnas obligatorias: ${missing.join(", ")}.`], summary: null };

  const records = rows.slice(1).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] || ""]))).slice(0, MAX_IMPORT_VARIANTS + 1);
  const errors = [];
  if (records.length > MAX_IMPORT_VARIANTS) errors.push(`El archivo supera el máximo de ${MAX_IMPORT_VARIANTS} variantes.`);
  const grouped = new Map();
  const variantKeys = new Set();

  records.slice(0, MAX_IMPORT_VARIANTS).forEach((record, index) => {
    const line = index + 2;
    const name = String(record.nombre || "").trim();
    const sku = String(record.sku || "").trim().toUpperCase().slice(0, 60);
    const price = Number(String(record.precio || "").replace(",", "."));
    const color = String(record.color || "").trim();
    const size = String(record.talla || "").trim();
    const stock = Number(record.stock);
    if (!name || !Number.isFinite(price) || price <= 0 || !color || !size || !String(record.stock).trim() || !Number.isSafeInteger(stock) || stock < 0) {
      errors.push(`Fila ${line}: revisa nombre, precio, color, talla y stock.`);
      return;
    }
    if (Object.hasOwn(Object.prototype, color)) {
      errors.push(`Fila ${line}: usa un nombre de color válido.`);
      return;
    }
    const key = sku ? `sku:${sku}` : `name:${name.toLowerCase()}`;
    const variantKey = `${key}:${color.toLowerCase()}:${size.toLowerCase()}`;
    if (variantKeys.has(variantKey)) {
      errors.push(`Fila ${line}: la variante ${color} / ${size} está repetida.`);
      return;
    }
    variantKeys.add(variantKey);
    const previousRow = grouped.get(key);
    if (previousRow && (previousRow.name !== name || previousRow.basePrice !== price)) {
      errors.push(`Fila ${line}: el mismo producto tiene nombres o precios diferentes. Unifica sus filas.`);
      return;
    }
    const current = grouped.get(key) || {
      sku, name, basePrice: price, price, oldPrice: Math.max(price, Number(record.precio_anterior) || price),
      category: String(record.categoria || "General").trim() || "General",
      productType: String(record.tipo || "General").trim() || "General",
      description: String(record.descripcion || "").trim(),
      filterTags: String(record.tags || "").split(/[|;]/).map((tag) => tag.trim()).filter(Boolean).slice(0, 12),
      featured: parseBoolean(record.destacado), newArrival: parseBoolean(record.nuevo), isPublic: parseBoolean(record.publico),
      rating: headers.includes("calificacion") ? Math.min(5, Math.max(0, Number(record.calificacion) || 5)) : undefined,
      offerEnabled: headers.includes("oferta_activa") ? parseBoolean(record.oferta_activa) : undefined,
      offerDiscountMode: headers.includes("oferta_modo") ? (String(record.oferta_modo || "percent").toLowerCase() === "amount" ? "amount" : "percent") : undefined,
      offerDiscountValue: headers.includes("oferta_valor") ? Math.max(0, Number(record.oferta_valor) || 0) : undefined,
      imagesByColor: {}, imageViewsByColor: {}, colorSwatches: {}, variants: [], colors: [], sizes: [],
    };
    if (!current.colors.includes(color)) current.colors.push(color);
    if (!current.sizes.includes(size)) current.sizes.push(size);
    const imageUrls = String(record.imagenes_urls || record.imagen_url || "").split("|").map((value) => value.trim()).filter(Boolean);
    if (imageUrls.some((imageUrl) => !/^https:\/\//i.test(imageUrl))) {
      errors.push(`Fila ${line}: todas las imágenes deben comenzar con https://.`);
      return;
    }
    if (!current.imagesByColor[color]) current.imagesByColor[color] = [];
    if (!current.imageViewsByColor[color]) current.imageViewsByColor[color] = [];
    const views = String(record.imagenes_vistas || "").split("|");
    imageUrls.slice(0, 8).forEach((imageUrl, index) => {
      if (!current.imagesByColor[color].includes(imageUrl)) {
        current.imagesByColor[color].push(imageUrl);
        current.imageViewsByColor[color].push(normalizeImageView(views[index]));
      }
    });
    if (record.color_hex) current.colorSwatches[color] = String(record.color_hex).trim();
    if (current.variants.length >= MAX_VARIANTS_PER_PRODUCT) {
      errors.push(`Fila ${line}: ${name} supera ${MAX_VARIANTS_PER_PRODUCT} variantes.`);
      return;
    }
    current.variants.push({ uid: `csv-${safeId(`${sku || name}-${color}-${size}`)}`, color, size, stock: Math.floor(stock) });
    grouped.set(key, current);
  });

  const imported = [...grouped.values()];
  if (imported.length > MAX_IMPORT_PRODUCTS) errors.push(`El archivo supera el máximo de ${MAX_IMPORT_PRODUCTS} productos.`);
  const existingBySku = new Map(existingProducts.filter((item) => item.sku).map((item) => [String(item.sku).toUpperCase(), item]));
  const existingByName = new Map(existingProducts.map((item) => [String(item.name || "").trim().toLowerCase(), item]));
  const products = imported.slice(0, MAX_IMPORT_PRODUCTS).map((product, index) => {
    const sameName = existingByName.get(product.name.toLowerCase());
    const skuMatch = product.sku && existingBySku.get(product.sku);
    if (!skuMatch && product.sku && sameName?.sku && String(sameName.sku).toUpperCase() !== product.sku) {
      errors.push(`El producto ${product.name} ya tiene otro SKU. Revisa el SKU o diferencia el nombre antes de importar.`);
    }
    const existing = skuMatch || sameName;
    const stockBySize = Object.fromEntries(product.sizes.map((size) => [size, product.variants.filter((variant) => variant.size === size).reduce((total, variant) => total + variant.stock, 0)]));
    const importedFields = Object.fromEntries(Object.entries(product).filter(([, value]) => value !== undefined));
    if (existing) {
      const optionalColumns = { sku: "sku", oldPrice: "precio_anterior", category: "categoria", productType: "tipo", description: "descripcion", filterTags: "tags", featured: "destacado", newArrival: "nuevo", isPublic: "publico" };
      for (const [field, column] of Object.entries(optionalColumns)) {
        if (!headers.includes(column)) delete importedFields[field];
      }
      if (!headers.includes("imagenes_urls") && !headers.includes("imagen_url")) {
        importedFields.imagesByColor = Object.fromEntries(product.colors.map(color => [color, existing.imagesByColor?.[color] || []]));
      }
    }
    if (!headers.includes("imagenes_vistas")) {
      importedFields.imageViewsByColor = Object.fromEntries(Object.entries(importedFields.imagesByColor).map(([color, images]) => [
        color, alignImageViews(existing?.imagesByColor?.[color], existing?.imageViewsByColor?.[color], images, (value) => String(value || "").trim()),
      ]));
    }
    const colorSwatches = Object.keys(product.colorSwatches || {}).length ? product.colorSwatches : (existing?.colorSwatches || {});
    return { ...existing, ...importedFields, colorSwatches, id: existing?.id || `csv-${safeId(product.sku || product.name)}-${index + 1}`, catalogColor: product.colors[0], stockBySize };
  });
  const creates = products.filter((item) => !existingProducts.some((current) => String(current.id) === String(item.id))).length;
  if (existingProducts.length + creates > MAX_TOTAL_PRODUCTS) {
    errors.push(`La importación dejaría ${existingProducts.length + creates} productos; el catálogo admite máximo ${MAX_TOTAL_PRODUCTS}.`);
  }
  return {
    products,
    errors: errors.slice(0, 80),
    summary: { products: products.length, variants: products.reduce((total, product) => total + product.variants.length, 0), creates },
  };
}

export function catalogToCsv(products = []) {
  const headers = ["sku", "nombre", "precio", "precio_anterior", "categoria", "tipo", "descripcion", "tags", "publico", "destacado", "nuevo", "calificacion", "oferta_activa", "oferta_modo", "oferta_valor", "color", "color_hex", "talla", "stock", "imagenes_urls", "imagenes_vistas"];
  const rows = [headers];
  products.forEach((product) => {
    (product.variants || []).forEach((variant) => {
      rows.push([
        product.sku || "", product.name || "", product.basePrice ?? product.price ?? 0, product.oldPrice ?? "",
        product.category || "", product.productType || "", product.description || "", (product.filterTags || []).join(";"),
        product.isPublic !== false ? "si" : "no", product.featured ? "si" : "no", product.newArrival ? "si" : "no",
        product.rating ?? 5, product.offerEnabled ? "si" : "no", product.offerDiscountMode || "percent", product.offerDiscountValue || 0,
        variant.color || "", product.colorSwatches?.[variant.color] || "", variant.size || "", variant.stock ?? 0,
        (product.imagesByColor?.[variant.color] || []).join("|"),
        (product.imageViewsByColor?.[variant.color] || []).map(normalizeImageView).join("|"),
      ]);
    });
  });
  return rows.map((row) => row.map(escapeCsv).join(",")).join("\r\n");
}

export function downloadCsv(filename, content) {
  const blob = new Blob(["\uFEFF", content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export { MAX_IMPORT_PRODUCTS, MAX_IMPORT_VARIANTS, MAX_TOTAL_PRODUCTS, MAX_VARIANTS_PER_PRODUCT };
import { alignImageViews, normalizeImageView } from "../products/imageViews.js";
