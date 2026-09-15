import React from "react";
import { MessageCircle } from "lucide-react";
import { normalizeMaintenanceSettings } from "../../domain/store/maintenance.js";

export function MaintenancePage({ settings, brandName, whatsappUrl, onOpenOrders, onOpenLegal }) {
  const maintenance = normalizeMaintenanceSettings(settings);
  return (
    <div className="maintenance-page">
      <header className="maintenance-header"><span className="brand-wordmark">{brandName}</span></header>
      <main id="main-content" className="maintenance-content">
        <div className="maintenance-status"><span aria-hidden="true" />Tienda en mantenimiento</div>
        <h1>{maintenance.title}</h1>
        <p>{maintenance.message}</p>
        {maintenance.returnMessage && <p className="maintenance-return">{maintenance.returnMessage}</p>}
        <div className="maintenance-actions">
          {whatsappUrl && <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="btn btn-primary"><MessageCircle size={17} aria-hidden="true" />Contactar por WhatsApp</a>}
          <button type="button" className="btn btn-outline" onClick={onOpenOrders}>Consultar mis pedidos</button>
        </div>
        <p className="maintenance-order-note">Tus pedidos siguen registrados. Puedes consultar su estado o escribirnos para recibir ayuda.</p>
      </main>
      <footer className="maintenance-footer"><span>© {new Date().getFullYear()} {brandName}</span><nav aria-label="Políticas de la tienda">{[["exchanges", "Cambios"], ["privacy", "Privacidad"], ["terms", "Términos"], ["cookies", "Cookies"]].map(([tab, label]) => <button key={tab} type="button" onClick={() => onOpenLegal(tab)}>{label}</button>)}</nav></footer>
    </div>
  );
}
