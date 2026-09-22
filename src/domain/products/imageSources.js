function getSafeQuality(value) {
  const quality = Math.round(Number(value));
  return Number.isFinite(quality) && quality >= 1 && quality <= 95 ? quality : 0;
}

function hasAuthoredImageKitTransformation(url) {
  return url.searchParams.has("ik-s") || url.searchParams.has("ik-t") || url.searchParams.has("tr") || /\/tr[:%]/i.test(url.pathname);
}

export function getResponsiveImageSources(src = "", widths = [320, 480, 640, 960], options = {}) {
  try {
    const url = new URL(src);
    if (url.protocol !== "https:" || url.username || url.password) return undefined;
    const isUnsplash = url.hostname === "images.unsplash.com";
    const isImageKit = url.hostname === "ik.imagekit.io";
    if (!isUnsplash && !isImageKit) return undefined;
    // Never invalidate signed URLs or overwrite an authored crop/transformation.
    if (isImageKit && hasAuthoredImageKitTransformation(url)) return undefined;
    const quality = getSafeQuality(options?.quality);
    const candidates = [...new Set(widths)].filter((width) => Number.isInteger(width) && width > 0 && width <= 2560);
    if (!candidates.length) return undefined;
    return candidates.map((width) => {
      const sized = new URL(url);
      if (isUnsplash) {
        sized.searchParams.set("w", String(width));
        if (quality) sized.searchParams.set("q", String(quality));
      } else {
        sized.searchParams.set("tr", quality ? `w-${width},q-${quality},f-auto` : `w-${width}`);
      }
      return `${sized.href} ${width}w`;
    }).join(", ");
  } catch {
    return undefined;
  }
}

export function getOptimizedImageSource(src = "", options = {}) {
  try {
    const url = new URL(src);
    if (url.protocol !== "https:" || url.username || url.password) return src;
    const quality = getSafeQuality(options?.quality) || 90;
    if (url.hostname === "ik.imagekit.io") {
      if (hasAuthoredImageKitTransformation(url)) return src;
      url.searchParams.set("tr", `q-${quality},f-auto`);
      return url.href;
    }
    if (url.hostname === "images.unsplash.com") {
      url.searchParams.set("q", String(quality));
      return url.href;
    }
    return src;
  } catch {
    return src;
  }
}

export function applyImageFallback(image, fallback) {
  // srcset takes precedence over src. Clear failed candidates before falling back.
  if (image.getAttribute("src") === fallback) return;
  image.removeAttribute("srcset");
  image.removeAttribute("sizes");
  image.src = fallback;
}
