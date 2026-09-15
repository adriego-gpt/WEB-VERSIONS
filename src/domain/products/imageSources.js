export function getResponsiveImageSources(src = "", widths = [320, 480, 640, 960]) {
  try {
    const url = new URL(src);
    if (url.protocol !== "https:" || url.username || url.password) return undefined;
    const isUnsplash = url.hostname === "images.unsplash.com";
    const isImageKit = url.hostname === "ik.imagekit.io";
    if (!isUnsplash && !isImageKit) return undefined;
    // Never invalidate signed URLs or overwrite an authored crop/transformation.
    if (isImageKit && (url.searchParams.has("ik-s") || url.searchParams.has("ik-t") || url.searchParams.has("tr") || /\/tr[:%]/i.test(url.pathname))) return undefined;
    const candidates = [...new Set(widths)].filter((width) => Number.isInteger(width) && width > 0 && width <= 2560);
    if (!candidates.length) return undefined;
    return candidates.map((width) => {
      const sized = new URL(url);
      sized.searchParams.set(isUnsplash ? "w" : "tr", isUnsplash ? String(width) : `w-${width}`);
      return `${sized.href} ${width}w`;
    }).join(", ");
  } catch {
    return undefined;
  }
}

export function applyImageFallback(image, fallback) {
  // srcset takes precedence over src. Clear failed candidates before falling back.
  if (image.getAttribute("src") === fallback) return;
  image.removeAttribute("srcset");
  image.removeAttribute("sizes");
  image.src = fallback;
}
