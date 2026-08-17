/**
 * Date/time and number formatting utilities.
 */

export function formatMinutesRemaining(lockUntil) {
  if (!lockUntil) return "";
  const minutes = Math.max(1, Math.ceil((lockUntil - Date.now()) / 60000));
  return `${minutes} min`;
}

export function formatAdminTimestamp(value) {
  if (!value) return "Sin datos recientes";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Sin datos recientes";
  return parsed.toLocaleString("es-EC", {
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
