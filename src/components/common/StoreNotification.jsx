import { useEffect, useState } from "react";
import { AnimatePresence, motion as Motion } from "framer-motion";
import { Check, CircleAlert, Info, X } from "lucide-react";
import { getNotificationPresentation } from "../../domain/notifications/presentation.js";

export function StoreNotification({ notification, onDismiss, onOpenCart, cartOpen, durationMs, reducedMotion }) {
  const [hoveredNotification, setHoveredNotification] = useState(null);
  const [focusedNotification, setFocusedNotification] = useState(null);
  const { tone, duration, title, hasAction } = getNotificationPresentation(notification, { cartOpen, durationMs });

  useEffect(() => {
    if (!notification || hoveredNotification === notification || focusedNotification === notification) return undefined;
    const timer = window.setTimeout(onDismiss, duration);
    return () => window.clearTimeout(timer);
  }, [notification, hoveredNotification, focusedNotification, duration, onDismiss]);

  const Icon = tone === "success" ? Check : tone === "info" ? Info : CircleAlert;

  return (
    <div className="notification-region" aria-live={tone === "error" ? "assertive" : "polite"} aria-atomic="true">
      <AnimatePresence>
        {notification && (
          <Motion.div
            key={notification.id}
            className={`toast-stack ${tone}${notification.kind ? ` toast-kind-${notification.kind}` : ""}${hasAction ? " has-action" : ""}`}
            initial={{ opacity: 0, y: reducedMotion ? 0 : -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reducedMotion ? 0 : -4 }}
            transition={{ duration: reducedMotion ? 0 : 0.18, ease: [0.22, 1, 0.36, 1] }}
            onMouseEnter={() => setHoveredNotification(notification)}
            onMouseLeave={() => setHoveredNotification(null)}
            onFocusCapture={() => setFocusedNotification(notification)}
            onBlurCapture={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) setFocusedNotification(null);
            }}
          >
            <span className="toast-icon" aria-hidden="true"><Icon size={17} strokeWidth={1.8} /></span>
            <span className="toast-copy">
              {title && <strong className="toast-title">{title}</strong>}
              {notification.message && <span className="toast-message">{notification.message}</span>}
            </span>
            {hasAction && <button type="button" className="toast-action" onClick={() => { onDismiss(); onOpenCart(); }}>Ver carrito</button>}
            <button type="button" className="toast-close" aria-label="Cerrar notificación" onClick={onDismiss}><X size={17} /></button>
          </Motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
