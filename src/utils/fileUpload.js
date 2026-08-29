/**
 * File upload utilities — image validation and data-URL conversion.
 */
import { FILE_SECURITY } from "../constants/product.js";
import { normalizeSafeUrl } from "./url.js";

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

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("No pudimos leer la imagen seleccionada."));
    reader.readAsDataURL(file);
  });
}

function loadImageFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("No pudimos abrir la imagen seleccionada."));
    image.src = dataUrl;
  });
}

async function optimizeInlineImage(dataUrl, maxBytes) {
  if (typeof document === "undefined" || typeof Image === "undefined") return "";
  const image = await loadImageFromDataUrl(dataUrl);
  const sourceWidth = Math.max(1, Number(image.naturalWidth) || Number(image.width) || 1);
  const sourceHeight = Math.max(1, Number(image.naturalHeight) || Number(image.height) || 1);
  const initialScale = Math.min(1, 960 / Math.max(sourceWidth, sourceHeight));
  const outputFormats = [
    ["image/webp", 0.82],
    ["image/webp", 0.74],
    ["image/jpeg", 0.80],
    ["image/jpeg", 0.72],
    ["image/webp", 0.62],
  ];

  for (let sizeAttempt = 0; sizeAttempt < 5; sizeAttempt += 1) {
    const scale = initialScale * (0.85 ** sizeAttempt);
    const width = Math.max(64, Math.round(sourceWidth * scale));
    const height = Math.max(64, Math.round(sourceHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) return "";
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    for (const [mimeType, quality] of outputFormats) {
      const optimized = canvas.toDataURL(mimeType, quality);
      if (optimized.startsWith("data:image/") && estimateDataUrlBytes(optimized) <= maxBytes) {
        return optimized;
      }
    }
  }
  return "";
}

export async function fileToDataUrl(file) {
  if (!file || !String(file.type || "").startsWith("image/")) {
    throw new Error("Solo se permiten archivos de imagen.");
  }
  const maxSizeBytes = FILE_SECURITY.maxImageSizeMb * 1024 * 1024;
  if (file.size > maxSizeBytes) {
    throw new Error(`La imagen excede ${FILE_SECURITY.maxImageSizeMb}MB.`);
  }

  const dataUrl = await readFileAsDataUrl(file);
  if (!dataUrl.startsWith("data:image/")) {
    throw new Error("No pudimos procesar la imagen seleccionada.");
  }

  const optimized = await optimizeInlineImage(dataUrl, FILE_SECURITY.maxInlineImageBytes);
  if (optimized) return optimized;
  if (estimateDataUrlBytes(dataUrl) <= FILE_SECURITY.maxInlineImageBytes) {
    return dataUrl;
  }
  throw new Error("La imagen no pudo optimizarse para guardar. Elige una imagen más pequeña o con menor resolución.");
}
