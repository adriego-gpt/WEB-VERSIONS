/**
 * File upload utilities — image validation and data-URL conversion.
 */
import { FILE_SECURITY } from "../constants";
import { normalizeSafeUrl } from "./url";

export function estimateDataUrlBytes(value = "") {
  const raw = String(value || "").trim();
  const separatorIndex = raw.indexOf(",");
  if (separatorIndex <= 0) return 0;
  const metadata = raw.slice(0, separatorIndex).toLowerCase();
  if (!metadata.startsWith("data:image/") || !metadata.includes(";base64")) return 0;
  const base64Payload = raw.slice(separatorIndex + 1).replace(/\s+/g, "");
  if (!base64Payload) return 0;
  const padding = base64Payload.endsWith("==")
    ? 2
    : base64Payload.endsWith("=")
      ? 1
      : 0;
  return Math.floor((base64Payload.length * 3) / 4) - padding;
}

export function normalizeImageSource(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.startsWith("data:image/")) {
    if (estimateDataUrlBytes(raw) > FILE_SECURITY.maxInlineImageBytes) return "";
    return raw;
  }
  return normalizeSafeUrl(raw);
}

export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file || !String(file.type || "").startsWith("image/")) {
      reject(new Error("Solo se permiten archivos de imagen."));
      return;
    }
    const maxSizeBytes = FILE_SECURITY.maxImageSizeMb * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      reject(new Error(`La imagen excede ${FILE_SECURITY.maxImageSizeMb}MB.`));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      if (!dataUrl.startsWith("data:image/")) {
        reject(new Error("No pudimos procesar la imagen seleccionada."));
        return;
      }
      if (estimateDataUrlBytes(dataUrl) > FILE_SECURITY.maxInlineImageBytes) {
        reject(new Error("La imagen es demasiado pesada para sincronizar. Usa un archivo mas liviano o pega una URL externa."));
        return;
      }
      resolve(dataUrl);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
