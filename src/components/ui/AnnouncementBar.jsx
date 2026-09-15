import React, { useState, useEffect } from "react";
import { Truck, ShieldCheck, Sparkles } from "lucide-react";
import { motion as Motion, AnimatePresence, useReducedMotion } from "framer-motion";

const ANNOUNCEMENTS = [
  {
    id: "shipping",
    icon: Truck,
    text: "Envíos nacionales · Transferencia o tarjeta",
  },
  {
    id: "guarantee",
    icon: ShieldCheck,
    text: "Cambios y devoluciones · Consulta nuestras políticas",
  },
  {
    id: "collection",
    icon: Sparkles,
    text: "Explora la colección · Ya disponible",
  },
];

export function AnnouncementBar({ paused = false }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (paused || reduceMotion) return undefined;
    const timer = setInterval(() => {
      if (document.hidden) return;
      setCurrentIndex((index) => (index + 1) % ANNOUNCEMENTS.length);
    }, 4500);
    return () => clearInterval(timer);
  }, [paused, reduceMotion]);

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
              initial={{ y: 6 }}
              animate={{ y: 0 }}
              exit={{ y: -6 }}
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
