import React, { useEffect, useRef, useState } from "react";
import { normalizePickupEmbedUrl } from "../../domain/contact/pickupLocation.js";

export function GoogleMapPreview({ src, title = "Ubicación de la tienda", enabled = true }) {
  const url = normalizePickupEmbedUrl(src);
  const containerRef = useRef(null);
  const [shouldLoad, setShouldLoad] = useState(false);

  useEffect(() => {
    if (!url || !enabled) return undefined;

    const node = containerRef.current;
    if (!node || typeof IntersectionObserver !== "function") {
      const timerId = window.setTimeout(() => setShouldLoad(true), 0);
      return () => window.clearTimeout(timerId);
    }

    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return;
      setShouldLoad(true);
      observer.disconnect();
    }, { rootMargin: "320px 0px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [enabled, url]);

  if (!url) return null;
  return (
    <div ref={containerRef} className="google-map-preview">
      {enabled && shouldLoad ? (
        <iframe className="pickup-location-map" title={title} src={url} loading="lazy" referrerPolicy="no-referrer" allowFullScreen />
      ) : (
        <div className="google-map-preview-loading" role="status" aria-live="polite">
          <span aria-hidden="true" />
          <small>Preparando ubicación…</small>
        </div>
      )}
    </div>
  );
}
