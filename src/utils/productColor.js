const PRODUCT_COLOR_SWATCHES = {
  amarillo: "#e4c84d",
  azul: "#315b86",
  beige: "#d8c5a9",
  beuige: "#d8c5a9",
  blanco: "#f8f7f3",
  blanca: "#f8f7f3",
  camel: "#a97850",
  celeste: "#9bc8df",
  champagne: "#d8c39c",
  crema: "#eee3cb",
  gris: "#888985",
  marron: "#744d38",
  menta: "#8fcbb2",
  morado: "#76517f",
  lila: "#b8a2d5",
  negro: "#171717",
  nude: "#c9a18d",
  naranja: "#d97742",
  rojo: "#ad3835",
  rosa: "#d59aa8",
  rosado: "#d59aa8",
  verde: "#55705b",
  "verde menta": "#8fcbb2",
  vino: "#6f2638",
};

const LEGACY_COLOR_FALLBACK = "#c8c4bc";

function normalizeProductColorName(color = "") {
  return String(color)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

export function getProductColorSwatch(color, customColor = "") {
  const normalizedCustomColor = normalizeProductColorHex(customColor);
  const normalized = normalizeProductColorName(color);
  const directMatch = PRODUCT_COLOR_SWATCHES[normalized];
  const partialMatch = Object.entries(PRODUCT_COLOR_SWATCHES).find(([name]) => normalized.includes(name));
  const inferredColor = directMatch || partialMatch?.[1] || LEGACY_COLOR_FALLBACK;

  // A previous release wrote this fallback into every legacy product. Treat it
  // as "missing" whenever the color name gives us a more accurate value.
  if (normalizedCustomColor && !(normalizedCustomColor === LEGACY_COLOR_FALLBACK && inferredColor !== LEGACY_COLOR_FALLBACK)) {
    return normalizedCustomColor;
  }
  return inferredColor;
}

export function normalizeProductColorHex(color = "") {
  const value = String(color).trim();
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value.toLowerCase() : "";
}
