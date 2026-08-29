import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
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

  // Observer to pause auto-scroll only when far off-screen
  useEffect(() => {
    const section = sectionRef.current;
    if (!section || typeof IntersectionObserver === "undefined") return undefined;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsInView(entry ? entry.isIntersecting : true);
      },
      { rootMargin: "600px 0px", threshold: 0 },
    );
    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  // Pause when browser tab is hidden
  useEffect(() => {
    const handleVisibilityChange = () => setIsDocumentVisible(!document.hidden);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  const hasProducts = displayItems.length > 0;

  // Initialize scroll position to the middle group once products load or change
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !hasProducts) return;

    const alignMiddleGroup = () => {
      const singleWidth = el.scrollWidth / 3;
      if (singleWidth > 0 && (el.scrollLeft === 0 || el.scrollLeft < 10)) {
        el.scrollLeft = singleWidth;
      }
    };

    alignMiddleGroup();
    const timerId = setTimeout(alignMiddleGroup, 120);
    return () => clearTimeout(timerId);
  }, [hasProducts, displayItems.length]);

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

    const speed = 1.15; // Pixels per frame at 60fps (smooth, dynamic movement)

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
      setIsDragging(false);
    }, 1100);
  }, []);

  // Pointer / Mouse / Touch drag handlers with Pointer Capture
  const onPointerDown = (event) => {
    const el = scrollRef.current;
    if (!el) return;
    if (event.button !== 0 && event.pointerType === "mouse") return;

    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    setIsHovered(false);
    setIsInteracting(true);
    setIsDragging(true);

    dragStartRef.current = {
      x: event.clientX,
      scrollLeft: el.scrollLeft,
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
          onMouseEnter={onMouseEnter}
          onMouseLeave={onMouseLeave}
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
                  {displayItems.map((product, itemIndex) => (
                    <MemoShowcaseProductCard
                      key={`grp-${groupIndex}-item-${itemIndex}-${product.id}`}
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


