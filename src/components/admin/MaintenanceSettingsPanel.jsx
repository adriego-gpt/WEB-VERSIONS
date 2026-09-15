import React from "react";
import { normalizeMaintenanceSettings } from "../../domain/store/maintenance.js";

export function MaintenanceSettingsPanel({ settings, onChange, enabled, busy, onSave }) {
  const draft = normalizeMaintenanceSettings(settings);
  const update = (key, value) => onChange({ ...settings, [key]: value });
  return (
    <section className="admin-maintenance-settings" aria-labelledby="maintenance-settings-title">
      <div className="admin-maintenance-heading"><div><h3 id="maintenance-settings-title">Modo mantenimiento</h3><p>Publica un aviso mientras realizas ajustes. Podrás seguir administrando la tienda y los clientes podrán consultar sus pedidos.</p></div><span className={`maintenance-state${enabled ? " is-active" : ""}`}>{enabled ? "Mantenimiento activo" : "Tienda abierta"}</span></div>
      <fieldset disabled={busy}>
        <label className="admin-live-toggle"><input type="checkbox" className="checkbox" checked={draft.enabled} onChange={(event) => update("enabled", event.target.checked)} /><span>Activar mantenimiento para los clientes</span></label>
        <div className="settings-grid">
          <label className="entity-field"><span>Título del aviso</span><input className="input" value={settings?.title ?? draft.title} maxLength={100} onChange={(event) => update("title", event.target.value)} /></label>
          <label className="entity-field"><span>Información de regreso (opcional)</span><input className="input" value={settings?.returnMessage ?? draft.returnMessage} maxLength={120} placeholder="Por ejemplo: Regresamos hoy a las 18:00" onChange={(event) => update("returnMessage", event.target.value)} /></label>
          <label className="entity-field admin-full"><span>Mensaje para tus clientes</span><textarea className="textarea" value={settings?.message ?? draft.message} maxLength={500} rows={3} onChange={(event) => update("message", event.target.value)} /></label>
        </div>
        <div className="maintenance-copy-preview" aria-label="Vista previa del aviso"><strong>{draft.title}</strong><p>{draft.message}</p>{draft.returnMessage && <small>{draft.returnMessage}</small>}</div>
        <button type="button" className="btn btn-primary" onClick={() => onSave(draft)} aria-busy={busy}>{busy ? "Guardando…" : "Guardar mantenimiento"}</button>
        <p className="helper-text">El cambio se aplica al guardar y se mantiene aunque cierres o actualices la página.</p>
      </fieldset>
    </section>
  );
}
