import React, { useState, useEffect } from "react";
import { Truck, ShieldCheck, Sparkles } from "lucide-react";
import { motion as Motion, AnimatePresence } from "framer-motion";

const ANNOUNCEMENTS = [
  {
    id: "shipping",
    icon: Truck,
    text: "Envíos nacionales · Pagos 100% seguros",
  },
  {
    id: "guarantee",
    icon: ShieldCheck,
    text: "Garantía de cambio en 7 días",
  },
  {
    id: "collection",
    icon: Sparkles,
    text: "Colección 2026 · Ya disponible",
  },
];

export function AnnouncementBar() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    if (isPaused) return undefined;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % ANNOUNCEMENTS.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [isPaused]);

  const currentItem = ANNOUNCEMENTS[currentIndex];
  const CurrentIcon = currentItem.icon;

  return (
    <div
      className="announcement-bar"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      role="region"
      aria-label="Anuncios de la tienda"
    >
      <div className="container announcement-bar-container">
        <div className="announcement-content">
          <AnimatePresence mode="wait">
            <Motion.div
              key={currentItem.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="announcement-message"
            >
              <CurrentIcon size={13} className="announcement-icon" />
              <span>{currentItem.text}</span>
            </Motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

export default AnnouncementBar;
