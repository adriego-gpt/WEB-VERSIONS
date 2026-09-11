const VIEWS = new Set(["Frontal", "Perfil", "Posterior"]);

export function normalizeImageView(value) {
  return VIEWS.has(value) ? value : "";
}

// Keep labels attached to their source image when invalid/empty URLs are removed.
export function alignImageViews(rawImages, rawViews, safeImages, normalizeImage) {
  const rows = (Array.isArray(rawImages) ? rawImages : []).map((image, index) => ({
    image: normalizeImage(image),
    view: normalizeImageView(rawViews?.[index]),
  })).filter((row) => row.image);
  return safeImages.map((image) => {
    const index = rows.findIndex((row) => row.image === image);
    return index < 0 ? "" : rows.splice(index, 1)[0].view;
  });
}
