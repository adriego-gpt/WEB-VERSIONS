import React, { useState } from "react";
import { MapPin, ArrowUpRight } from "lucide-react";
import { resolvePickupLocation } from "../../domain/contact/pickupLocation.js";

export function PickupLocation({ address, locationNote, mapsLink, mapsEmbedUrl, hideAddress = false }) {
  const [mapVisible, setMapVisible] = useState(false);
  const location = resolvePickupLocation({ address, locationNote, mapsLink, mapsEmbedUrl });
  return (
    <div className="pickup-location">
      {!hideAddress && <p className="pickup-location-address">{location.address || "La dirección de retiro se confirmará contigo."}</p>}
      {location.locationNote && <p className="order-detail-muted">{location.locationNote}</p>}
      <div className="pickup-location-actions">
        {location.mapsEmbedUrl && <button type="button" className="btn btn-outline" onClick={() => setMapVisible((visible) => !visible)} aria-expanded={mapVisible}><MapPin size={16} aria-hidden="true" />{mapVisible ? "Ocultar mapa" : "Ver ubicación"}</button>}
        {location.mapsLink && <a href={location.mapsLink} target="_blank" rel="noopener noreferrer" className="btn btn-soft"><ArrowUpRight size={16} aria-hidden="true" />Abrir en Google Maps</a>}
      </div>
      {mapVisible && location.mapsEmbedUrl && <iframe title="Ubicación del punto de retiro" className="pickup-location-map" src={location.mapsEmbedUrl} loading="lazy" referrerPolicy="no-referrer" allowFullScreen />}
      {location.mapsEmbedUrl && !mapVisible && <small className="pickup-map-privacy">El mapa de Google se carga solo si eliges ver la ubicación.</small>}
    </div>
  );
}
