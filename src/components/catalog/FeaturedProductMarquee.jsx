import React, { useEffect, useRef, useState } from "react";
import { MemoShowcaseProductCard } from "./ShowcaseProductCard";
import { CatalogSkeletonCard } from "./CatalogSkeletonCard";

export function FeaturedProductMarquee({ products = [], catalogReady, onOpenDetail }) {
  const sectionRef = useRef(null);
  const [isInView, setIsInView] = useState(true);
  const [touchPaused, setTouchPaused] = useState(false);
  const [isDocumentVisible, setIsDocumentVisible] = useState(() => (
    typeof document === "undefined" || !document.hidden
  ));

  useEffect(() => {
    const section = sectionRef.current;
    if (!section || typeof IntersectionObserver === "undefined") return undefined;

    const observer = new IntersectionObserver(
      ([entry]) => setIsInView(entry.isIntersecting),
      { rootMargin: "120px 0px", threshold: 0.01 },
    );
    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const handleVisibilityChange = () => setIsDocumentVisible(!document.hidden);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  const animationPaused = touchPaused || !isInView || !isDocumentVisible;
  const hasProducts = products.length > 0;

  const handlePointerDown = (event) => {
    if (event.pointerType !== "pen") return;
    setTouchPaused(true);
  };

  const handlePointerEnd = (event) => {
    if (event.pointerType !== "pen") return;
    setTouchPaused(false);
  };

  return (
    <section id="destacados" ref={sectionRef} className="section-shell featured-runway-section" aria-labelledby="featured-runway-title">
      <div className="container featured-runway-header">
        <div>
          <h3 id="featured-runway-title">Productos destacados</h3>
          <p>Explora la selección de la tienda.</p>
        </div>
      </div>

      {!catalogReady ? (
        <div className="container featured-grid featured-loading-grid" aria-label="Cargando productos destacados">
          {Array.from({ length: 4 }, (_, index) => <CatalogSkeletonCard key={`featured-skeleton-${index}`} />)}
        </div>
      ) : hasProducts ? (
        <div
          className="featured-marquee"
          data-paused={animationPaused ? "true" : "false"}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
          onTouchStart={() => setTouchPaused(true)}
          onTouchEnd={() => setTouchPaused(false)}
          onTouchCancel={() => setTouchPaused(false)}
        >
          <div className="featured-marquee-track">
            {[false, true].map((isDuplicate) => (
              <div key={isDuplicate ? "duplicate" : "primary"} className="featured-marquee-group" aria-hidden={isDuplicate ? "true" : undefined}>
                {products.map((product) => (
                  <MemoShowcaseProductCard
                    key={`${isDuplicate ? "duplicate" : "primary"}-${product.id}`}
                    product={product}
                    onOpenDetail={onOpenDetail}
                    isDuplicate={isDuplicate}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="container featured-runway-empty">No hay productos destacados disponibles por el momento.</p>
      )}
    </section>
  );
}

export const MemoFeaturedProductMarquee = React.memo(FeaturedProductMarquee);

export default MemoFeaturedProductMarquee;
