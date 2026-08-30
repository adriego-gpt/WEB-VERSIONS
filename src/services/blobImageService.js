import { upload } from "@vercel/blob/client";
import { FILE_SECURITY } from "../constants/product.js";
import { createUuid } from "../utils/uid.js";
import { fileToDataUrl } from "../utils/fileUpload.js";
import { ensureCsrfToken } from "./httpClient.js";

const PRODUCT_IMAGE_UPLOAD_ENDPOINT = "/api/catalog-state?action=image-upload";
const PUBLIC_BLOB_HOST_SUFFIX = ".public.blob.vercel-storage.com";
const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function dataUrlToBlob(dataUrl = "") {
  const match = String(dataUrl || "").match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/i);
  if (!match) {
    throw new Error("La imagen optimizada no tiene un formato compatible.");
  }

  const mimeType = match[1].toLowerCase();
  const binary = globalThis.atob(match[2].replace(/\s+/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeType });
}

function getImageExtension(contentType = "") {
  if (contentType === "image/webp") return "webp";
  if (contentType === "image/png") return "png";
  return "jpg";
}

function buildProductImagePathname(contentType = "image/jpeg") {
  const datePrefix = new Date().toISOString().slice(0, 7);
  return `catalog/products/${datePrefix}/${createUuid()}.${getImageExtension(contentType)}`;
}

function normalizePublicBlobUrl(value = "") {
  try {
    const parsed = new URL(String(value || "").trim());
    if (parsed.protocol !== "https:" || !parsed.hostname.endsWith(PUBLIC_BLOB_HOST_SUFFIX)) return "";
    return parsed.toString();
  } catch {
    return "";
  }
}

async function uploadPreparedCatalogImage(imageBlob, options = {}) {
  if (!(imageBlob instanceof Blob) || !SUPPORTED_IMAGE_TYPES.has(String(imageBlob.type || "").toLowerCase())) {
    throw new Error("Solo se permiten imágenes JPG, PNG o WebP.");
  }
  if (imageBlob.size <= 0 || imageBlob.size > FILE_SECURITY.maxInlineImageBytes) {
    throw new Error("La imagen optimizada excede el tamaño permitido.");
  }

  const csrfToken = String(options.csrfToken || await ensureCsrfToken()).trim();
  if (!csrfToken) {
    throw new Error("La sesión de seguridad expiró. Vuelve a iniciar sesión e inténtalo otra vez.");
  }

  const uploadFn = options.uploadFn || upload;
  const pathname = options.pathname || buildProductImagePathname(imageBlob.type);
  let result;
  try {
    result = await uploadFn(pathname, imageBlob, {
      access: "public",
      handleUploadUrl: PRODUCT_IMAGE_UPLOAD_ENDPOINT,
      contentType: imageBlob.type,
      headers: {
        "X-CSRF-Token": csrfToken,
        "X-Requested-With": "XMLHttpRequest",
      },
    });
  } catch {
    throw new Error("No se pudo subir la foto al almacenamiento. La imagen anterior no fue modificada.");
  }

  const safeUrl = normalizePublicBlobUrl(result?.url);
  if (!safeUrl) {
    throw new Error("Vercel no devolvió una URL válida para la imagen.");
  }
  return safeUrl;
}

async function uploadCatalogProductImage(file, options = {}) {
  const optimizedDataUrl = await fileToDataUrl(file);
  const imageBlob = dataUrlToBlob(optimizedDataUrl);
  return uploadPreparedCatalogImage(imageBlob, options);
}

export {
  PRODUCT_IMAGE_UPLOAD_ENDPOINT,
  buildProductImagePathname,
  dataUrlToBlob,
  normalizePublicBlobUrl,
  uploadCatalogProductImage,
  uploadPreparedCatalogImage,
};
