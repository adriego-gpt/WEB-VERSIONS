import React, { useState } from "react";
import { ChevronDown, Eye, EyeOff, Plus, Save, Trash2 } from "lucide-react";
import { normalizeOptionLabel, slugify } from "../../utils";

export function ManagedEntitiesEditor(props) {
  const {
    title,
    description,
    icon,
    records,
    products,
    entityType,
    addInput,
    setAddInput,
    onAdd,
    onDraftChange,
    onSave,
    onDelete,
    onToggleActive,
  } = props;
  const Icon = icon;
  const [replacementMap, setReplacementMap] = useState({});
  const [expandedRecordId, setExpandedRecordId] = useState("");
  const isType = entityType === "productType";

  const getAssociationCount = (record) => products.filter((product) => (
    isType
      ? normalizeOptionLabel(product.productType || "").toLowerCase() === record.name.toLowerCase()
      : (product.filterTags || []).some((tag) => normalizeOptionLabel(tag).toLowerCase() === record.name.toLowerCase())
  )).length;

  const alternativesFor = (record) => records
    .filter((other) => other.id !== record.id)
    .sort((left, right) => {
      if (left.active === right.active) return left.name.localeCompare(right.name, "es", { sensitivity: "base" });
      return left.active ? -1 : 1;
    });

  const toggleExpandedRecord = (recordId) => {
    setExpandedRecordId((current) => (current === recordId ? "" : recordId));
  };

  return (
    <section className="entity-manager" aria-label={title}>
      <header className="entity-manager-header">
        <div className="entity-manager-heading">
          <span className="entity-manager-icon" aria-hidden="true"><Icon size={18} /></span>
          <div>
            <h4>{title}</h4>
            <p>{description}</p>
          </div>
        </div>
        <span className="entity-manager-count">{records.length} {records.length === 1 ? "elemento" : "elementos"}</span>
      </header>

      <div className="entity-create-row">
        <input className="input" placeholder={isType ? "Agregar tipo de producto" : "Agregar filtro/tag"} value={addInput} onChange={(event) => setAddInput(event.target.value)} />
        <button className="btn btn-primary" type="button" onClick={onAdd}><Plus size={16} />Agregar</button>
      </div>

      <div className="entity-list">
        {records.length === 0 ? (
          <div className="empty-admin-note">Todavía no hay elementos registrados en esta sección.</div>
        ) : records.map((record) => {
          const associationCount = getAssociationCount(record);
          const replacement = replacementMap[record.id] || (associationCount > 0 ? alternativesFor(record)[0]?.name || "" : "");
          const isExpanded = expandedRecordId === record.id;
          const detailsId = `${entityType}-${record.id}-details`;
          return (
            <article key={record.id} className={`entity-row${isExpanded ? " is-expanded" : ""}`}>
              <div className="entity-row-summary">
                <button
                  className="entity-row-disclosure"
                  type="button"
                  onClick={() => toggleExpandedRecord(record.id)}
                  aria-expanded={isExpanded}
                  aria-controls={detailsId}
                >
                  <span className={`entity-status-dot${record.active ? " is-active" : ""}`} aria-hidden="true" />
                  <span className="entity-row-identity">
                    <strong>{record.name}</strong>
                    <span>/{record.slug || slugify(record.name)}</span>
                  </span>
                  <span className="entity-row-associations">
                    {associationCount} {isType ? (associationCount === 1 ? "producto" : "productos") : (associationCount === 1 ? "asociación" : "asociaciones")}
                  </span>
                  <ChevronDown className="entity-row-chevron" size={18} aria-hidden="true" />
                </button>
                <div className="entity-row-quick-actions">
                  <span className={`entity-visibility-label${record.active ? " is-active" : ""}`}>{record.active ? "Visible" : "Oculto"}</span>
                  <button className="btn btn-outline entity-visibility-btn" type="button" onClick={() => onToggleActive(record.id)}>
                    {record.active ? <EyeOff size={15} /> : <Eye size={15} />}
                    {record.active ? "Ocultar" : "Activar"}
                  </button>
                </div>
              </div>

              {isExpanded && (
                <div id={detailsId} className="entity-row-details">
                  <div className="entity-edit-fields">
                    <label className="entity-field">
                      <span>Nombre visible</span>
                      <input className="input" value={record.draftName ?? record.name} onChange={(event) => onDraftChange(record.id, "draftName", event.target.value)} />
                    </label>
                    <label className="entity-field">
                      <span>Slug</span>
                      <input className="input" value={record.draftSlug ?? record.slug} onChange={(event) => onDraftChange(record.id, "draftSlug", event.target.value)} />
                    </label>
                    <button className="btn btn-primary entity-save-btn" type="button" onClick={() => onSave(record.id)}><Save size={16} />Guardar cambios</button>
                  </div>

                  <div className="entity-danger-zone">
                    <div className="entity-delete-copy">
                      <strong>Eliminar {isType ? "tipo" : "filtro"}</strong>
                      <p>
                        {associationCount > 0
                          ? (isType
                            ? `Reasigna primero sus ${associationCount} ${associationCount === 1 ? "producto" : "productos"}.`
                            : `Puedes reemplazarlo o quitarlo de sus ${associationCount} ${associationCount === 1 ? "asociación" : "asociaciones"}.`)
                          : "No está asociado a productos y puede eliminarse directamente."}
                      </p>
                    </div>
                    {associationCount > 0 && (
                      <select className="select entity-replacement-select" value={replacement} onChange={(event) => setReplacementMap((previous) => ({ ...previous, [record.id]: event.target.value }))}>
                        <option value="">{isType ? "Selecciona una reasignación" : "Eliminar sin reemplazo"}</option>
                        {alternativesFor(record).map((item) => <option key={item.id} value={item.name}>{item.name}{item.active ? "" : " (oculto)"}</option>)}
                      </select>
                    )}
                    <button className="btn btn-danger entity-delete-btn" type="button" onClick={() => onDelete(record.id, replacement)}>
                      <Trash2 size={16} />Eliminar
                    </button>
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
