/**
 * Shared text sanitization and normalization functions.
 * Used across the entire application for input cleaning.
 */

// ── Anti-injection: strip dangerous patterns from user text ──────────
const RE_NULL_BYTES = /\0/g;
const RE_DANGEROUS_UNICODE = /[\u200B-\u200F\u2028\u2029\u202A-\u202E\u2066-\u2069\uFEFF]/g;
const RE_SCRIPT_BLOCKS = /<script\b[\s\S]*?<\/script>/gi;
const RE_STYLE_BLOCKS = /<style\b[\s\S]*?<\/style>/gi;
const RE_HTML_TAGS = /<\/?[a-zA-Z][^>]*>/g;
const RE_EVENT_HANDLERS = /\bon\w+\s*=\s*(?:'[^']*'|"[^"]*"|[^\s>]+)/gi;
const RE_SCRIPT_SCHEMES = /\b(javascript|vbscript|data\s*:\s*text\/html)\s*:[^\s]*/gi;
const RE_TEMPLATE_INJECTION = /(\{\{|\}\}|<%|%>)/g;
const RE_COMMAND_INJECTION = /`[^`]*`|\$\([^)]*\)/g;

export function stripDangerousContent(value = "") {
  return String(value || "")
    .replace(RE_NULL_BYTES, "")
    .replace(RE_DANGEROUS_UNICODE, "")
    .replace(RE_SCRIPT_BLOCKS, " ")
    .replace(RE_STYLE_BLOCKS, " ")
    .replace(RE_HTML_TAGS, " ")
    .replace(RE_EVENT_HANDLERS, " ")
    .replace(RE_SCRIPT_SCHEMES, " ")
    .replace(RE_TEMPLATE_INJECTION, "")
    .replace(RE_COMMAND_INJECTION, " ");
}

export function normalizeEntityId(value = "") {
  if (value == null) return "";
  return String(value).trim();
}

export function normalizeOptionLabel(value = "") {
  return stripDangerousContent(value).trim().replace(/\s+/g, " ");
}

export function sanitizeLine(value = "") {
  return stripDangerousContent(value).replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
}

export function sanitizeParagraph(value = "") {
  return stripDangerousContent(value)
    .replace(/\r/g, "")
    .replace(/\t/g, " ")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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
