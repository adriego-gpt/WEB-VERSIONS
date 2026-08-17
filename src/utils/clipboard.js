/**
 * Clipboard utility with legacy fallback for older browsers.
 */

export async function copyTextToClipboard(text = "") {
  const safeText = String(text || "").trim();
  if (!safeText) return false;
  try {
    if (globalThis.navigator?.clipboard?.writeText) {
      await globalThis.navigator.clipboard.writeText(safeText);
      return true;
    }
  } catch {
    // Continue to legacy fallback.
  }
  try {
    if (typeof document !== "undefined") {
      const textarea = document.createElement("textarea");
      textarea.value = safeText;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "absolute";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      const copied = document.execCommand("copy");
      document.body.removeChild(textarea);
      return copied;
    }
  } catch {
    return false;
  }
  return false;
}
