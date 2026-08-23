import { sanitizeLine, sanitizeParagraph } from "../../utils/sanitizers.js";
import { normalizeSafeUrl } from "../../utils/url.js";

export function resolvePublicLocation(contactSettings = {}, legacyPlaceholderAddress = "") {
  const address = sanitizeLine(contactSettings.address || "");
  const placeholderAddress = sanitizeLine(legacyPlaceholderAddress).toLowerCase();
  const hasPublicAddress = Boolean(address && address.toLowerCase() !== placeholderAddress);
  const normalizedMapsLink = normalizeSafeUrl(contactSettings.mapsLink || "");
  const mapsLink = /^https?:\/\//i.test(normalizedMapsLink) ? normalizedMapsLink : "";
  const hasLocation = hasPublicAddress || Boolean(mapsLink);

  return {
    address: hasPublicAddress ? address : "",
    locationNote: hasLocation ? sanitizeParagraph(contactSettings.locationNote || "") : "",
    mapsLink,
  };
}
