const INLINE_CATALOG_IMAGE_PATTERN = /^data:image\/(?:jpe?g|png|webp);base64,[a-z0-9+/=\s]+$/i;

export function isLegacyInlineCatalogImage(value = "") {
  return INLINE_CATALOG_IMAGE_PATTERN.test(String(value || "").trim());
}

export async function migrateLegacyCatalogImages(images = [], options = {}) {
  const sourceImages = Array.isArray(images) ? images : [];
  const uploadOne = options.uploadOne;
  if (typeof uploadOne !== "function") throw new TypeError("uploadOne es requerido");

  const pending = sourceImages
    .map((source, index) => ({ index, source: String(source || "") }))
    .filter(({ source }) => isLegacyInlineCatalogImage(source));
  const replacements = new Map();
  const failures = [];

  for (let current = 0; current < pending.length; current += 1) {
    const entry = pending[current];
    try {
      const url = await uploadOne(entry.source, { index: current, total: pending.length });
      if (!url) throw new Error("ImageKit no devolvió una URL.");
      replacements.set(entry.index, url);
    } catch (error) {
      failures.push({
        index: entry.index,
        message: error instanceof Error ? error.message : "No se pudo migrar la fotografía.",
      });
    }
    options.onProgress?.({
      completed: current + 1,
      total: pending.length,
      succeeded: replacements.size,
      failed: failures.length,
    });
  }

  return {
    images: sourceImages.map((source, index) => replacements.get(index) || source),
    migrated: replacements.size,
    failures,
    total: pending.length,
  };
}
