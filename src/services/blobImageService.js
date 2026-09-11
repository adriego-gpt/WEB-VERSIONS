import { FILE_SECURITY } from "../constants/product.js";
import { createUuid } from "../utils/uid.js";
import { fileToDataUrl } from "../utils/fileUpload.js";
import { requestJson } from "./httpClient.js";

const PRODUCT_IMAGE_UPLOAD_ENDPOINT = "/api/catalog-state?action=image-upload";
const IMAGEKIT_UPLOAD_URL = "https://upload.imagekit.io/api/v1/files/upload";
const DEFAULT_EXTERNAL_UPLOAD_TIMEOUT_MS = 30_000;
const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function dataUrlToBlob(dataUrl = "") {
  const match = String(dataUrl || "").match(/^data:(image\/(?:jpe?g|png|webp));base64,([A-Za-z0-9+/=\s]+)$/i);
  if (!match) throw new Error("La imagen optimizada no tiene un formato compatible.");
  const rawMime = match[1].toLowerCase();
  const mimeType = rawMime === "image/jpg" ? "image/jpeg" : rawMime;
  const binary = globalThis.atob(match[2].replace(/\s+/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
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

function normalizeImageKitUrl(value = "", urlEndpoint = "") {
  try {
    const parsed = new URL(String(value || "").trim());
    const endpoint = new URL(String(urlEndpoint || "").trim());
    if (parsed.protocol !== "https:" || endpoint.protocol !== "https:") return "";
    if (parsed.origin !== endpoint.origin || parsed.username || parsed.password) return "";
    const endpointPath = endpoint.pathname.replace(/\/$/, "");
    if (endpointPath && parsed.pathname !== endpointPath && !parsed.pathname.startsWith(`${endpointPath}/`)) return "";
    return parsed.toString();
  } catch {
    return "";
  }
}

async function requestImageKitUploadAuthorization(payload = {}) {
  return requestJson(PRODUCT_IMAGE_UPLOAD_ENDPOINT, {
    method: "POST",
    timeoutMs: 10_000,
    body: JSON.stringify({ type: "imagekit.generate-upload-auth", payload }),
  });
}

function uploadImageKitBlob(imageBlob, options = {}) {
  if (typeof XMLHttpRequest === "undefined" || typeof FormData === "undefined") {
    return Promise.reject(new Error("Este navegador no permite subir imágenes directamente."));
  }

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const timeoutMs = Number.isFinite(Number(options.timeoutMs))
      ? Math.max(5_000, Number(options.timeoutMs))
      : DEFAULT_EXTERNAL_UPLOAD_TIMEOUT_MS;
    let settled = false;

    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      options.signal?.removeEventListener?.("abort", abortUpload);
      callback(value);
    };
    const fail = (message) => finish(reject, new Error(message));
    const abortUpload = () => {
      xhr.abort();
      fail("La subida fue cancelada.");
    };

    xhr.open("POST", IMAGEKIT_UPLOAD_URL, true);
    xhr.timeout = timeoutMs;
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      options.onProgress?.({
        loaded: event.loaded,
        total: event.total,
        percent: Math.min(100, Math.round((event.loaded / event.total) * 100)),
      });
    };
    xhr.onerror = () => fail("No se pudo conectar con ImageKit. Revisa tu conexión.");
    xhr.ontimeout = () => fail("ImageKit superó el tiempo de espera. Inténtalo nuevamente.");
    xhr.onabort = () => fail("La subida fue cancelada.");
    xhr.onload = () => {
      let payload = {};
      try {
        payload = JSON.parse(xhr.responseText || "{}");
      } catch {
        // The status below still produces a useful generic error.
      }
      if (xhr.status < 200 || xhr.status >= 300) {
        fail(String(payload?.message || payload?.help || "ImageKit rechazó la fotografía."));
        return;
      }
      finish(resolve, payload);
    };

    const formData = new FormData();
    formData.append("file", imageBlob, options.fileName || "catalog-image.webp");
    formData.append("fileName", options.fileName || "catalog-image.webp");
    formData.append("publicKey", String(options.publicKey || ""));
    formData.append("token", String(options.token || ""));
    formData.append("signature", String(options.signature || ""));
    formData.append("expire", String(options.expire || ""));
    formData.append("folder", String(options.folder || "/catalog/products"));
    formData.append("useUniqueFileName", "true");

    options.signal?.addEventListener?.("abort", abortUpload, { once: true });
    if (options.signal?.aborted) {
      abortUpload();
      return;
    }
    xhr.send(formData);
  });
}

async function uploadPreparedCatalogImage(imageBlob, options = {}) {
  if (!(imageBlob instanceof Blob) || !SUPPORTED_IMAGE_TYPES.has(String(imageBlob.type || "").toLowerCase())) {
    throw new Error("Solo se permiten imágenes JPG, PNG o WebP.");
  }
  if (imageBlob.size <= 0 || imageBlob.size > FILE_SECURITY.maxInlineImageBytes) {
    throw new Error("La imagen optimizada excede el tamaño permitido.");
  }

  const pathname = options.pathname || buildProductImagePathname(imageBlob.type);
  const pathParts = pathname.split("/").filter(Boolean);
  const fileName = pathParts.pop() || `catalog-image.${getImageExtension(imageBlob.type)}`;
  const folder = `/${pathParts.join("/")}`;
  const authorizeFn = options.authorizeFn || requestImageKitUploadAuthorization;
  const authorization = await authorizeFn({ fileName, contentType: imageBlob.type, size: imageBlob.size });

  if (!authorization?.ok) {
    throw new Error(String(authorization?.message || "No se pudo autorizar la fotografía en ImageKit."));
  }
  if (authorization.type && authorization.type !== "imagekit.upload-auth") {
    throw new Error("ImageKit devolvió una autorización no válida.");
  }

  const uploadFn = options.uploadFn || uploadImageKitBlob;
  let result;
  try {
    result = await uploadFn(imageBlob, {
      fileName,
      folder,
      publicKey: authorization.publicKey,
      token: authorization.token,
      signature: authorization.signature,
      expire: authorization.expire,
      urlEndpoint: authorization.urlEndpoint,
      onProgress: options.onProgress,
      signal: options.signal,
      timeoutMs: options.timeoutMs,
    });
  } catch (error) {
    const message = String(error?.message || "").trim();
    throw new Error(message
      ? `${message} La imagen anterior no fue modificada.`
      : "No se pudo subir la foto a ImageKit. La imagen anterior no fue modificada.");
  }

  const safeUrl = normalizeImageKitUrl(result?.url, authorization.urlEndpoint);
  if (!safeUrl) throw new Error("ImageKit no devolvió una URL válida para la imagen.");
  return safeUrl;
}

async function uploadCatalogProductImage(file, options = {}) {
  const optimizedDataUrl = await fileToDataUrl(file);
  return uploadPreparedCatalogImage(dataUrlToBlob(optimizedDataUrl), options);
}

export {
  DEFAULT_EXTERNAL_UPLOAD_TIMEOUT_MS,
  IMAGEKIT_UPLOAD_URL,
  PRODUCT_IMAGE_UPLOAD_ENDPOINT,
  buildProductImagePathname,
  dataUrlToBlob,
  normalizeImageKitUrl,
  requestImageKitUploadAuthorization,
  uploadCatalogProductImage,
  uploadImageKitBlob,
  uploadPreparedCatalogImage,
};
