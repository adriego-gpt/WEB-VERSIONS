import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { MemoShowcaseProductCard } from "./ShowcaseProductCard";
import { CatalogSkeletonCard } from "./CatalogSkeletonCard";

export function FeaturedProductMarquee({ products = [], catalogReady, onOpenDetail }) {
  const sectionRef = useRef(null);
  const trackRef = useRef(null);
  const firstGroupRef = useRef(null);
  const groupWidthRef = useRef(0);

  const [isInView, setIsInView] = useState(() => (
    typeof window !== "undefined" && typeof window.IntersectionObserver === "undefined"
  ));
  const [isHovered, setIsHovered] = useState(false);
  const [isInteracting, setIsInteracting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [hasFocus, setHasFocus] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(() => (
    typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ));
  const [isDocumentVisible, setIsDocumentVisible] = useState(() => (
    typeof document === "undefined" || !document.hidden
  ));

  const offsetRef = useRef(0);
  const dragStartRef = useRef({ startX: 0, startOffset: 0, hasMoved: false });
  const resumeTimerRef = useRef(null);
  const rafRef = useRef(null);
  const lastTimeRef = useRef(0);
  const suppressClickRef = useRef(false);

  // Repeat items so that each group has at least 6 items.
  // This guarantees that 1 group exceeds any normal viewport width (even on 4K screens)
  // and the browser's scrollWidth will ALWAYS overflow clientWidth to allow continuous scrolling.
  const displayItems = useMemo(() => {
    if (!products.length) return [];
    const minItemsPerGroup = 6;
    const repeatCount = Math.max(1, Math.ceil(minItemsPerGroup / products.length));
    const list = [];
    for (let i = 0; i < repeatCount; i++) {
      list.push(...products);
    }
    return list;
  }, [products]);

  // Start only when the runway is close to the viewport.
  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return undefined;
    if (typeof IntersectionObserver === "undefined") return undefined;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsInView(entry ? entry.isIntersecting : true);
      },
      { rootMargin: "160px 0px", threshold: 0 },
    );
    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncPreference = () => setPrefersReducedMotion(mediaQuery.matches);
    mediaQuery.addEventListener?.("change", syncPreference);
    return () => mediaQuery.removeEventListener?.("change", syncPreference);
  }, []);

  // Pause when browser tab is hidden
  useEffect(() => {
    const handleVisibilityChange = () => setIsDocumentVisible(!document.hidden);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  const hasProducts = displayItems.length > 0;

  // Measure only when content or its responsive width changes, never on every frame.
  useEffect(() => {
    const group = firstGroupRef.current;
    const track = trackRef.current;
    if (!catalogReady || !group || !track || !hasProducts) {
      groupWidthRef.current = 0;
      return undefined;
    }

    const syncGroupWidth = () => {
      const nextWidth = group.getBoundingClientRect().width;
      groupWidthRef.current = Number.isFinite(nextWidth) ? nextWidth : 0;
      if (groupWidthRef.current > 0 && offsetRef.current >= groupWidthRef.current) {
        offsetRef.current %= groupWidthRef.current;
        track.style.transform = `translate3d(${-offsetRef.current}px, 0, 0)`;
      }
    };

    syncGroupWidth();
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(syncGroupWidth);
      observer.observe(group);
      return () => observer.disconnect();
    }

    window.addEventListener("resize", syncGroupWidth, { passive: true });
    return () => window.removeEventListener("resize", syncGroupWidth);
  }, [catalogReady, hasProducts, displayItems.length]);

  const shouldAutoAnimate = (
    catalogReady
    && hasProducts
    && isInView
    && isDocumentVisible
    && !prefersReducedMotion
    && !isHovered
    && !isInteracting
    && !isDragging
    && !hasFocus
  );

  // GPU transform loop with no layout reads in the hot path.
  useEffect(() => {
    const track = trackRef.current;
    if (!track || !hasProducts) return undefined;

    if (!shouldAutoAnimate) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      lastTimeRef.current = 0;
      return undefined;
    }

    // 0.95px per frame at 60fps (~57px/sec) — fluid, buttery smooth GPU motion
    const speed = 0.95;

    const tick = (time) => {
      if (!lastTimeRef.current) lastTimeRef.current = time;
      const delta = Math.min((time - lastTimeRef.current) / 16.667, 2.0);
      lastTimeRef.current = time;

      const groupWidth = groupWidthRef.current;
      if (groupWidth > 0) {
        let nextOffset = offsetRef.current + speed * delta;
        if (nextOffset >= groupWidth) {
          nextOffset %= groupWidth;
        }
        offsetRef.current = nextOffset;
        track.style.transform = `translate3d(${-nextOffset}px, 0, 0)`;
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      lastTimeRef.current = 0;
    };
  }, [hasProducts, shouldAutoAnimate]);

  const scheduleResume = useCallback(() => {
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = setTimeout(() => {
      setIsInteracting(false);
      setIsDragging(false);
    }, 1100);
  }, []);

  // Pointer / Mouse / Touch drag handlers with subpixel GPU transform
  const onPointerDown = (event) => {
    const track = trackRef.current;
    if (!track) return;
    if (event.button !== 0 && event.pointerType === "mouse") return;

    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    setIsHovered(false);
    setIsInteracting(true);
    setIsDragging(true);

    dragStartRef.current = {
      startX: event.clientX,
      startOffset: offsetRef.current,
      hasMoved: false,
    };

    try {
      event.target.setPointerCapture?.(event.pointerId);
    } catch {
      // Fallback
    }
  };

  const onPointerMove = (event) => {
    if (!isDragging) return;
    const track = trackRef.current;
    if (!track) return;

    const dx = event.clientX - dragStartRef.current.startX;
    if (Math.abs(dx) > 4) {
      dragStartRef.current.hasMoved = true;
      suppressClickRef.current = true;
    }

    const groupWidth = groupWidthRef.current;
    if (groupWidth > 0) {
      let newOffset = dragStartRef.current.startOffset - dx;
      while (newOffset < 0) newOffset += groupWidth;
      newOffset %= groupWidth;
      offsetRef.current = newOffset;
      track.style.transform = `translate3d(${-newOffset}px, 0, 0)`;
    }
  };

  const onPointerUp = (event) => {
    if (isDragging) {
      try {
        event.target.releasePointerCapture?.(event.pointerId);
      } catch {
        // Fallback
      }
      setIsDragging(false);
      setIsHovered(false);
      scheduleResume();
      setTimeout(() => {
        suppressClickRef.current = false;
      }, 80);
    }
  };

  const onPointerCancel = (event) => {
    if (isDragging) {
      try {
        event.target.releasePointerCapture?.(event.pointerId);
      } catch {
        // Fallback
      }
      setIsDragging(false);
      setIsHovered(false);
      scheduleResume();
      suppressClickRef.current = false;
    }
  };

  // Hover handlers: only apply to genuine mouse pointers with hover capability
  const onMouseEnter = (event) => {
    if (event.pointerType === "touch" || event.pointerType === "pen") return;
    if (typeof window !== "undefined" && window.matchMedia && !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    setIsHovered(true);
  };

  const onMouseLeave = () => {
    setIsHovered(false);
  };

  const handleCardClick = useCallback((product, selection) => {
    if (suppressClickRef.current) return;
    onOpenDetail(product, selection);
  }, [onOpenDetail]);

  return (
    <section id="destacados" ref={sectionRef} className="section-shell featured-runway-section" aria-labelledby="featured-runway-title">
      <div className="container featured-runway-header">
        <h2 id="featured-runway-title">Productos destacados</h2>
        <p>Explora la selección de la tienda.</p>
      </div>

      {!catalogReady ? (
        <div className="container featured-grid featured-loading-grid" aria-label="Cargando productos destacados">
          {Array.from({ length: 4 }, (_, index) => <CatalogSkeletonCard key={`featured-skeleton-${index}`} />)}
        </div>
      ) : hasProducts ? (
        <div
          className={`featured-marquee${isDragging ? " is-dragging" : ""}${shouldAutoAnimate ? " is-animating" : ""}`}
          onMouseEnter={onMouseEnter}
          onMouseLeave={onMouseLeave}
          onFocusCapture={() => setHasFocus(true)}
          onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setHasFocus(false); }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
        >
          <div ref={trackRef} className="featured-marquee-track">
            {[0, 1].map((groupIndex) => {
              const isDuplicate = groupIndex !== 0;
              return (
                <div
                  key={`group-${groupIndex}`}
                  ref={groupIndex === 0 ? firstGroupRef : undefined}
                  className="featured-marquee-group"
                  aria-hidden={isDuplicate ? "true" : undefined}
                >
                  {displayItems.map((product, itemIndex) => {
                    const isRepeatedItem = itemIndex >= products.length;
                    return (
                      <MemoShowcaseProductCard
                        key={`grp-${groupIndex}-item-${itemIndex}-${product.id}`}
                        product={product}
                        onOpenDetail={handleCardClick}
                        isDuplicate={isDuplicate || isRepeatedItem}
                      />
                    );
                  })}
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
