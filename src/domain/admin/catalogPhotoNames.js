import { FILE_SECURITY, PRODUCT_FORM_LIMITS } from "../../constants/product.js";

const SUPPORTED_CATALOG_PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
export const MAX_CATALOG_PHOTO_FILES = PRODUCT_FORM_LIMITS.maxColors * PRODUCT_FORM_LIMITS.maxImagesPerColor;
export const MAX_CATALOG_PHOTO_SOURCE_BYTES = 120 * 1024 * 1024;

const VIEW_ALIASES = new Map([
  ["frontal", "Frontal"],
  ["frente", "Frontal"],
  ["perfil", "Perfil"],
  ["lateral", "Perfil"],
  ["posterior", "Posterior"],
  ["espalda", "Posterior"],
]);

const VIEW_ORDER = new Map([["Frontal", 0], ["Perfil", 1], ["Posterior", 2]]);

// Hyphenated filenames are convenient, but multi-word colors are ambiguous.
// Keep the common catalog colors backwards-compatible and also support the
// explicit `producto__color__vista` form for any free-form color.
const MULTI_WORD_COLOR_SUFFIXES = new Set([
  "azul cielo", "azul electrico", "azul marino", "beige celeste", "beige rosado",
  "blanco hueso", "cafe claro", "cafe oscuro", "gris claro", "gris oscuro",
  "palo de rosa", "rosa pastel", "rojo vino", "verde menta", "verde militar",
  "verde oliva", "vino tinto",
]);

function comparableLabel(value = "") {
  return String(value || "")
    .trim()
    .toLocaleLowerCase("es")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ");
}

function readableLabel(value = "") {
  return String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function getBaseName(fileName = "") {
  return String(fileName || "").replace(/\.[^.]+$/, "").trim();
}

export function getCatalogPhotoViewLabel(fileName = "") {
  const token = getBaseName(fileName)
    .split(/[-_]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .at(-1)
    ?.toLowerCase();
  return VIEW_ALIASES.get(token) || "";
}

export function parseCatalogPhotoName(fileName = "") {
  if (String(fileName || "").length > 180) {
    return { ok: false, error: "El nombre de una foto es demasiado largo. Usa un nombre de hasta 180 caracteres." };
  }
  const baseName = getBaseName(fileName);
  const explicitParts = baseName.split(/__+/).map((part) => part.trim()).filter(Boolean);
  if (explicitParts.length === 3) {
    const view = VIEW_ALIASES.get(comparableLabel(explicitParts[2]));
    const name = readableLabel(explicitParts[0].replace(/[-_]+/g, " "));
    const color = readableLabel(explicitParts[1].replace(/[-_]+/g, " "));
    if (!view) return { ok: false, error: `“${fileName}” debe terminar en frontal, perfil o posterior.` };
    if (!name || !color) return { ok: false, error: `No pudimos identificar producto y color en “${fileName}”.` };
    return { ok: true, name, color, view };
  }

  const tokens = baseName
    .split(/[-_]+/)
    .map((token) => token.trim())
    .filter(Boolean);
  if (tokens.length < 3) {
    return { ok: false, error: `“${fileName}” debe usar producto-color-vista.` };
  }
  const view = getCatalogPhotoViewLabel(fileName);
  if (!view) {
    return { ok: false, error: `“${fileName}” debe terminar en frontal, perfil o posterior.` };
  }
  const identityTokens = tokens.slice(0, -1);
  let colorTokenCount = 1;
  for (let count = Math.min(4, identityTokens.length - 1); count >= 2; count -= 1) {
    const candidate = comparableLabel(identityTokens.slice(-count).join(" "));
    if (MULTI_WORD_COLOR_SUFFIXES.has(candidate)) {
      colorTokenCount = count;
      break;
    }
  }
  const color = readableLabel(identityTokens.slice(-colorTokenCount).join(" "));
  const name = readableLabel(identityTokens.slice(0, -colorTokenCount).join(" "));
  if (!name || !color) return { ok: false, error: `No pudimos identificar producto y color en “${fileName}”.` };
  return { ok: true, name, color, view };
}

export function validateCatalogPhotoFiles(files = []) {
  const selected = Array.from(files || []);
  const errors = [];
  if (selected.length > MAX_CATALOG_PHOTO_FILES) {
    errors.push(`Seleccionaste ${selected.length} fotos. El máximo por lote es ${MAX_CATALOG_PHOTO_FILES}.`);
  }

  let totalBytes = 0;
  const accepted = selected.slice(0, MAX_CATALOG_PHOTO_FILES).filter((file) => {
    const type = String(file?.type || "").toLowerCase();
    const size = Math.max(0, Number(file?.size) || 0);
    if (!SUPPORTED_CATALOG_PHOTO_TYPES.has(type)) {
      errors.push(`“${String(file?.name || "Archivo").slice(0, 120)}” no es JPG, PNG o WebP.`);
      return false;
    }
    if (!size || size > FILE_SECURITY.maxImageSizeMb * 1024 * 1024) {
      errors.push(`“${String(file?.name || "Archivo").slice(0, 120)}” debe pesar entre 1 byte y ${FILE_SECURITY.maxImageSizeMb} MB.`);
      return false;
    }
    if (totalBytes + size > MAX_CATALOG_PHOTO_SOURCE_BYTES) {
      errors.push("El lote supera 120 MB. Divídelo para evitar que el navegador se quede sin memoria.");
      return false;
    }
    totalBytes += size;
    return true;
  });

  return { files: accepted, errors: [...new Set(errors)] };
}

export function groupCatalogPhotoFiles(files = []) {
  const groups = new Map();
  const errors = [];
  Array.from(files || []).forEach((file) => {
    const parsed = parseCatalogPhotoName(file?.name);
    if (!parsed.ok) {
      errors.push(parsed.error);
      return;
    }
    const productKey = parsed.name.toLocaleLowerCase("es");
    const current = groups.get(productKey) || { name: parsed.name, colors: new Map() };
    const colorKey = parsed.color.toLocaleLowerCase("es");
    const color = current.colors.get(colorKey) || { name: parsed.color, photos: [] };
    color.photos.push({ file, view: parsed.view, name: file.name });
    current.colors.set(colorKey, color);
    groups.set(productKey, current);
  });

  const products = [...groups.values()].map((group) => ({
    name: group.name,
    colors: [...group.colors.values()].map((color) => ({
      ...color,
      photos: [...color.photos].sort((left, right) => (
        (VIEW_ORDER.get(left.view) ?? 99) - (VIEW_ORDER.get(right.view) ?? 99)
        || left.name.localeCompare(right.name, "es")
      )),
    })),
  })).sort((left, right) => left.name.localeCompare(right.name, "es"));

  return { products, errors };
}
