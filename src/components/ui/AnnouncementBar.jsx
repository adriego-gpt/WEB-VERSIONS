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

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentIndex((index) => (index + 1) % ANNOUNCEMENTS.length);
    }, 4500);
    return () => clearInterval(timer);
  }, []);

  const currentItem = ANNOUNCEMENTS[currentIndex];
  const CurrentIcon = currentItem.icon;

  return (
    <div
      className="announcement-bar"
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
