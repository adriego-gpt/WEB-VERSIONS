/**
 * Courier Tracking Utility for Adriego Store.
 * Generates direct tracking URLs for major couriers in Ecuador and international carriers.
 */

export function getCourierTrackingUrl(courier = "", guideNumber = "") {
  const cleanCourier = String(courier || "").trim().toLowerCase();
  const cleanGuide = String(guideNumber || "").trim();

  if (!cleanGuide) return "";

  // 1. Servientrega Ecuador
  if (cleanCourier.includes("servientrega")) {
    return `https://www.servientrega.com.ec/rastreo/multiple?guia=${encodeURIComponent(cleanGuide)}`;
  }

  // 2. LaarCourier
  if (cleanCourier.includes("laar") || cleanCourier.includes("laarcourier")) {
    return `https://laarcourier.com/rastreo?guia=${encodeURIComponent(cleanGuide)}`;
  }

  // 3. Tramaco / Tramaco Express
  if (cleanCourier.includes("tramaco")) {
    return `https://www.tramaco.com.ec/`;
  }

  // 4. Urbano Express
  if (cleanCourier.includes("urbano")) {
    return `https://www.urbano.com.ec/`;
  }

  // 5. DHL
  if (cleanCourier.includes("dhl")) {
    return `https://www.dhl.com/ec-es/home/rastreo.html?tracking-id=${encodeURIComponent(cleanGuide)}`;
  }

  // 6. FedEx
  if (cleanCourier.includes("fedex")) {
    return `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(cleanGuide)}`;
  }

  // Fallback: Google Search with courier and tracking number
  const searchQuery = cleanCourier ? `${cleanCourier} rastreo guia ${cleanGuide}` : `rastreo guia ${cleanGuide}`;
  return `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`;
}
