import { sanitizeLine, sanitizeParagraph } from "../../utils/sanitizers.js";

export const DEFAULT_MAINTENANCE_SETTINGS = Object.freeze({
  enabled: false,
  title: "Volvemos pronto",
  message: "Estamos realizando ajustes para cuidar cada detalle de tu experiencia. Gracias por tu paciencia.",
  returnMessage: "",
});

export function normalizeMaintenanceSettings(raw = {}) {
  const source = raw && typeof raw === "object" ? raw : {};
  return {
    enabled: source.enabled === true,
    title: sanitizeLine(source.title || "").slice(0, 100) || DEFAULT_MAINTENANCE_SETTINGS.title,
    message: sanitizeParagraph(source.message || "").slice(0, 500) || DEFAULT_MAINTENANCE_SETTINGS.message,
    returnMessage: sanitizeLine(source.returnMessage || "").slice(0, 120),
  };
}

export function readMaintenanceBootstrap() {
  if (typeof document === "undefined") return {};
  try {
    const raw = JSON.parse(document.getElementById("store-maintenance-state")?.textContent || "{}");
    return raw.maintenanceSettings?.enabled === true
      ? { brandName: sanitizeLine(raw.brandName), maintenanceSettings: normalizeMaintenanceSettings(raw.maintenanceSettings) }
      : {};
  } catch { return {}; }
}
