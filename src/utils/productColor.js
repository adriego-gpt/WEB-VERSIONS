const PRODUCT_COLOR_SWATCHES = {
  amarillo: "#e4c84d",
  azul: "#315b86",
  beige: "#d8c5a9",
  beuige: "#d8c5a9",
  blanco: "#f8f7f3",
  camel: "#a97850",
  celeste: "#9bc8df",
  champagne: "#d8c39c",
  crema: "#eee3cb",
  gris: "#888985",
  marron: "#744d38",
  morado: "#76517f",
  negro: "#171717",
  nude: "#c9a18d",
  naranja: "#d97742",
  rojo: "#ad3835",
  rosa: "#d59aa8",
  rosado: "#d59aa8",
  verde: "#55705b",
  vino: "#6f2638",
};

function normalizeProductColorName(color = "") {
  return String(color)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

export function getProductColorSwatch(color) {
  const normalized = normalizeProductColorName(color);
  const directMatch = PRODUCT_COLOR_SWATCHES[normalized];
  if (directMatch) return directMatch;
  const partialMatch = Object.entries(PRODUCT_COLOR_SWATCHES).find(([name]) => normalized.includes(name));
  return partialMatch?.[1] || "#c8c4bc";
}
