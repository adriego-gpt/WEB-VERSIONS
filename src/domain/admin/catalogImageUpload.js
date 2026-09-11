function getUploadFailure(file, error) {
  return {
    fileName: String(file?.name || "imagen"),
    message: error instanceof Error ? error.message : "No se pudo subir la imagen.",
  };
}

const DEFAULT_IMAGE_UPLOAD_TIMEOUT_MS = 45_000;

function withUploadTimeout(task, timeoutMs) {
  const safeTimeoutMs = Number.isFinite(Number(timeoutMs))
    ? Math.max(1, Number(timeoutMs))
    : DEFAULT_IMAGE_UPLOAD_TIMEOUT_MS;

  return new Promise((resolve, reject) => {
    const timerId = setTimeout(() => {
      reject(new Error("La foto superó el tiempo de espera. Revisa tu conexión e inténtalo nuevamente."));
    }, safeTimeoutMs);

    Promise.resolve(task).then(
      (value) => {
        clearTimeout(timerId);
        resolve(value);
      },
      (error) => {
        clearTimeout(timerId);
        reject(error);
      },
    );
  });
}

export async function uploadCatalogImageFiles(files = [], options = {}) {
  const selectedFiles = Array.from(files || []);
  const uploadOne = options.uploadOne;
  if (!selectedFiles.length) return { urls: [], failures: [] };
  if (typeof uploadOne !== "function") throw new TypeError("uploadOne es requerido");

  const urls = [];
  const failures = [];
  for (let index = 0; index < selectedFiles.length; index += 1) {
    const file = selectedFiles[index];
    try {
      const url = await withUploadTimeout(
        Promise.resolve().then(() => uploadOne(file, { index, total: selectedFiles.length })),
        options.timeoutMs,
      );
      if (url) urls.push(url);
      else failures.push(getUploadFailure(file, new Error("El almacenamiento no devolvió una URL.")));
    } catch (error) {
      failures.push(getUploadFailure(file, error));
    }
    options.onProgress?.({
      completed: index + 1,
      total: selectedFiles.length,
      succeeded: urls.length,
      failed: failures.length,
    });
  }

  return { urls, failures };
}

export { DEFAULT_IMAGE_UPLOAD_TIMEOUT_MS };
