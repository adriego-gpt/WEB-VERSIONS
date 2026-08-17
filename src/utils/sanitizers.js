/**
 * Shared text sanitization and normalization functions.
 * Used across the entire application for input cleaning.
 */

export function normalizeEntityId(value = "") {
  if (value == null) return "";
  return String(value).trim();
}

export function normalizeOptionLabel(value = "") {
  return String(value).trim().replace(/\s+/g, " ");
}

export function sanitizeLine(value = "") {
  return String(value).replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
}

export function sanitizeParagraph(value = "") {
  return String(value).replace(/\r/g, "").replace(/\t/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

export function normalizeEmail(value = "") {
  return sanitizeLine(value).toLowerCase();
}

export function slugify(value = "") {
  return normalizeOptionLabel(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function splitFilterTagsText(value = "") {
  const tags = String(value)
    .split(",")
    .map((item) => normalizeOptionLabel(item))
    .filter(Boolean);

  return [...new Set(tags.map((item) => item.toLowerCase()))].map((key) => {
    const match = tags.find((entry) => entry.toLowerCase() === key);
    return match || key;
  });
}
