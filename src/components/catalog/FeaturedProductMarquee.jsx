import React, { useEffect, useRef, useState, useCallback } from "react";
import { MemoShowcaseProductCard } from "./ShowcaseProductCard";
import { CatalogSkeletonCard } from "./CatalogSkeletonCard";

export function FeaturedProductMarquee({ products = [], catalogReady, onOpenDetail }) {
  const sectionRef = useRef(null);
  const scrollRef = useRef(null);
  const [isInView, setIsInView] = useState(true);
  const [isHovered, setIsHovered] = useState(false);
  const [isInteracting, setIsInteracting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isDocumentVisible, setIsDocumentVisible] = useState(() => (
    typeof document === "undefined" || !document.hidden
  ));

  const dragStartRef = useRef({ x: 0, scrollLeft: 0, hasMoved: false });
  const resumeTimerRef = useRef(null);
  const rafRef = useRef(null);
  const lastTimeRef = useRef(0);
  const suppressClickRef = useRef(false);

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

  const hasProducts = products.length > 0;

  // Initialize scroll position to the middle group once products load
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !hasProducts) return;
    const singleWidth = el.scrollWidth / 3;
    if (singleWidth > 0 && el.scrollLeft === 0) {
      el.scrollLeft = singleWidth;
    }
  }, [hasProducts, products.length]);

  // Infinite seamless wrap calculation
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const singleWidth = el.scrollWidth / 3;
    if (singleWidth <= 0) return;

    if (el.scrollLeft >= singleWidth * 2) {
      el.scrollLeft -= singleWidth;
    } else if (el.scrollLeft <= 5) {
      el.scrollLeft += singleWidth;
    }
  }, []);

  // Continuous auto-scroll animation loop (RAF)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !hasProducts) return undefined;

    const shouldAnimate = isInView && isDocumentVisible && !isHovered && !isInteracting && !isDragging;
    if (!shouldAnimate) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      lastTimeRef.current = 0;
      return undefined;
    }

    const speed = 1.05; // Pixels per frame at 60fps (livelier and smooth motion)

    const tick = (time) => {
      if (!lastTimeRef.current) lastTimeRef.current = time;
      const delta = Math.min((time - lastTimeRef.current) / 16.67, 2.5);
      lastTimeRef.current = time;

      const singleWidth = el.scrollWidth / 3;
      if (singleWidth > 0) {
        el.scrollLeft += speed * delta;
        if (el.scrollLeft >= singleWidth * 2) {
          el.scrollLeft -= singleWidth;
        } else if (el.scrollLeft <= 5) {
          el.scrollLeft += singleWidth;
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      lastTimeRef.current = 0;
    };
  }, [hasProducts, isInView, isDocumentVisible, isHovered, isInteracting, isDragging]);

  const scheduleResume = useCallback(() => {
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = setTimeout(() => {
      setIsInteracting(false);
    }, 1400);
  }, []);

  // Touch handlers
  const onTouchStart = () => {
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    setIsInteracting(true);
  };

  const onTouchEnd = () => {
    scheduleResume();
  };

  // Pointer / Mouse drag handlers
  const onPointerDown = (event) => {
    const el = scrollRef.current;
    if (!el) return;
    if (event.button !== 0) return;
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    setIsInteracting(true);
    setIsDragging(true);
    dragStartRef.current = {
      x: event.clientX,
      scrollLeft: el.scrollLeft,
      hasMoved: false,
    };
  };

  const onPointerMove = (event) => {
    if (!isDragging) return;
    const el = scrollRef.current;
    if (!el) return;
    const dx = event.clientX - dragStartRef.current.x;
    if (Math.abs(dx) > 4) {
      dragStartRef.current.hasMoved = true;
      suppressClickRef.current = true;
    }
    el.scrollLeft = dragStartRef.current.scrollLeft - dx;
    handleScroll();
  };

  const onPointerUp = () => {
    if (isDragging) {
      setIsDragging(false);
      scheduleResume();
      setTimeout(() => {
        suppressClickRef.current = false;
      }, 60);
    }
  };

  const onPointerCancel = () => {
    if (isDragging) {
      setIsDragging(false);
      scheduleResume();
      suppressClickRef.current = false;
    }
  };

  const handleCardClick = useCallback((product, selection) => {
    if (suppressClickRef.current) return;
    onOpenDetail(product, selection);
  }, [onOpenDetail]);

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
          ref={scrollRef}
          className={`featured-marquee ${isDragging ? "is-dragging" : ""}`}
          onScroll={handleScroll}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          onTouchCancel={onTouchEnd}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
        >
          <div className="featured-marquee-track">
            {[0, 1, 2].map((groupIndex) => {
              const isDuplicate = groupIndex !== 1;
              return (
                <div
                  key={`group-${groupIndex}`}
                  className="featured-marquee-group"
                  aria-hidden={isDuplicate ? "true" : undefined}
                >
                  {products.map((product) => (
                    <MemoShowcaseProductCard
                      key={`grp-${groupIndex}-${product.id}`}
                      product={product}
                      onOpenDetail={handleCardClick}
                      isDuplicate={isDuplicate}
                    />
                  ))}
                </div>
              );
            })}
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
