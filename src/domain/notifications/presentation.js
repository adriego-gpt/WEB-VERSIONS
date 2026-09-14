export function getNotificationPresentation(notification, { cartOpen = false, durationMs = 3600 } = {}) {
  const tone = notification?.tone || "success";
  const genericTitle = ["Listo", "Te acompanamos", "Información"].includes(notification?.title);
  return {
    tone,
    duration: tone === "error" || tone === "warning" ? Math.max(durationMs, 7000) : durationMs,
    title: genericTitle && notification?.message ? "" : notification?.title,
    hasAction: notification?.action === "cart" && !cartOpen,
  };
}
