import React, { useMemo, useState } from "react";
import {
  ChevronDown,
  ImagePlus,
  PackagePlus,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { splitFilterTagsText } from "../../utils";
import { AdminSectionHeader } from "./AdminSectionHeader";

const EDITOR_SECTIONS = [
  { id: "datos", label: "Datos y precio" },
  { id: "organizacion", label: "Organización" },
  { id: "variantes", label: "Variantes y stock" },
  { id: "publicacion", label: "Publicación y oferta" },
];

export function ProductEditorPanel({
  form,
  draftRecovery,
  draftSavedAt,
  draftSaveError,
  hasUnsavedChanges,
  onRestoreDraft,
  onDiscardDraft,
  productTypeOptions,
  filterTagOptions,
  customProductTypeInput,
  setCustomProductTypeInput,
  customFilterTagInput,
  setCustomFilterTagInput,
  onAddProductType,
  onAddFilterTag,
  onAppendFilterTag,
  onRemoveFilterTag,
  onFieldChange,
  onAddColor,
  onColorFieldChange,
  onRemoveColor,
  onColorFilesUpload,
  onAddImageField,
  onColorImageChange,
  onRemoveImageField,
  onAddSize,
  onSizeChange,
  onRemoveSize,
  onSave,
  onReset,
}) {
  const [activeSection, setActiveSection] = useState("datos");
  const [expandedColorId, setExpandedColorId] = useState(form.colorsData?.[0]?.uid || "");
  const formTags = useMemo(() => splitFilterTagsText(form.filterTagsText), [form.filterTagsText]);
  const colors = useMemo(() => (Array.isArray(form.colorsData) ? form.colorsData : []), [form.colorsData]);
  const activeColorId = colors.some((color) => color.uid === expandedColorId)
    ? expandedColorId
    : (colors[0]?.uid || "");
  const photoCount = colors.reduce((total, color) => total + (color.images || []).filter(Boolean).length, 0);
  const stockCount = colors.reduce(
    (total, color) => total + (color.sizes || []).reduce((subtotal, entry) => subtotal + Math.max(0, Number(entry.stock) || 0), 0),
    0,
  );
  const draftTimeLabel = draftSavedAt
    ? new Intl.DateTimeFormat("es-EC", { hour: "2-digit", minute: "2-digit" }).format(new Date(draftSavedAt))
    : "";

  return (
    <section className="admin-workspace product-editor-workspace" aria-labelledby="product-editor-title">
      <AdminSectionHeader
        title={form.id ? "Editar producto" : "Nuevo producto"}
        titleId="product-editor-title"
        description={form.id ? "Actualiza la información y guarda cuando todo esté listo." : "Completa cada bloque sin perder de vista el resultado final."}
        meta={<span className={`admin-status-label${form.isPublic === false ? " is-muted" : " is-success"}`}>{form.isPublic === false ? "Oculto" : "Público"}</span>}
        actions={form.id ? (
          <button className="btn btn-outline" type="button" onClick={onReset}><X size={16} />Cancelar edición</button>
        ) : null}
      />

      {draftRecovery && (
        <div className="product-draft-recovery" role="status">
          <div>
            <strong>Hay un borrador recuperable</strong>
            <span>
              Guardado {new Intl.DateTimeFormat("es-EC", { dateStyle: "medium", timeStyle: "short" }).format(new Date(draftRecovery.savedAt))}.
            </span>
          </div>
          <div className="admin-actions">
            <button className="btn btn-outline" type="button" onClick={onDiscardDraft}>Descartar</button>
            <button className="btn btn-primary" type="button" onClick={onRestoreDraft}>Recuperar borrador</button>
          </div>
        </div>
      )}

      <div className="product-editor-overview">
        <span><strong>{colors.length}</strong> colores</span>
        <span><strong>{photoCount}</strong> fotos</span>
        <span><strong>{stockCount}</strong> unidades</span>
        <span><strong>{formTags.length}</strong> tags</span>
        <span className={`product-draft-indicator${draftSaveError ? " is-error" : (hasUnsavedChanges ? " is-pending" : " is-saved")}`} role={draftSaveError ? "alert" : "status"}>
          {draftSaveError || (hasUnsavedChanges
            ? (draftTimeLabel ? `Borrador guardado ${draftTimeLabel}` : "Guardando borrador...")
            : "Sin cambios pendientes")}
        </span>
      </div>

      <nav className="product-editor-nav" aria-label="Secciones del producto">
        {EDITOR_SECTIONS.map((section) => (
          <button
            key={section.id}
            className={activeSection === section.id ? "active" : ""}
            type="button"
            onClick={() => setActiveSection(section.id)}
            aria-current={activeSection === section.id ? "step" : undefined}
          >
            {section.label}
          </button>
        ))}
      </nav>

      <div className="product-editor-body">
        {activeSection === "datos" && (
          <section className="product-editor-pane" aria-labelledby="product-data-heading">
            <div className="product-editor-section-head">
              <h5 id="product-data-heading">Información principal</h5>
              <p>Nombre, categoría, precio y descripción que verá el cliente.</p>
            </div>
            <div className="product-editor-grid admin-grid">
              <label className="product-editor-field admin-full">
                <span className="product-editor-field-label">Nombre del producto</span>
                <input className="input" value={form.name} onChange={(event) => onFieldChange("name", event.target.value)} placeholder="Ej. Vestido lino natural" />
              </label>
              <label className="product-editor-field">
                <span className="product-editor-field-label">Categoría</span>
                <input className="input" value={form.category} onChange={(event) => onFieldChange("category", event.target.value)} placeholder="Ej. Mujer" />
              </label>
              <label className="product-editor-field">
                <span className="product-editor-field-label">Calificación</span>
                <input className="input" type="number" min="0" max="5" step="0.1" value={form.rating} onChange={(event) => onFieldChange("rating", event.target.value)} placeholder="0 a 5" />
              </label>
              <label className="product-editor-field">
                <span className="product-editor-field-label">Precio actual</span>
                <input className="input" type="number" min="0" value={form.price} onChange={(event) => onFieldChange("price", event.target.value)} placeholder="0.00" />
              </label>
              <label className="product-editor-field">
                <span className="product-editor-field-label">Precio anterior <small>opcional</small></span>
                <input className="input" type="number" min="0" value={form.oldPrice} onChange={(event) => onFieldChange("oldPrice", event.target.value)} placeholder="0.00" />
              </label>
              <label className="product-editor-field admin-full">
                <span className="product-editor-field-label">Descripción</span>
                <textarea className="textarea" value={form.description} onChange={(event) => onFieldChange("description", event.target.value)} placeholder="Describe materiales, corte y detalles útiles para comprar." />
              </label>
            </div>
          </section>
        )}

        {activeSection === "organizacion" && (
          <section className="product-editor-pane" aria-labelledby="product-organization-heading">
            <div className="product-editor-section-head">
              <h5 id="product-organization-heading">Organización del catálogo</h5>
              <p>Define el tipo principal y los tags que facilitan encontrar el producto.</p>
            </div>
            <div className="product-editor-subgrid">
              <div className="product-editor-subcard">
                <label className="product-editor-field">
                  <span className="product-editor-field-label">Tipo de producto</span>
                  <select className="select" value={form.productType} onChange={(event) => onFieldChange("productType", event.target.value)}>
                    {productTypeOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </label>
                <div className="product-editor-inline-input">
                  <input className="input" placeholder="Crear nuevo tipo" value={customProductTypeInput} onChange={(event) => setCustomProductTypeInput(event.target.value)} />
                  <button type="button" className="btn btn-outline" onClick={onAddProductType}><Plus size={16} />Crear</button>
                </div>
              </div>

              <div className="product-editor-subcard">
                <label className="product-editor-field">
                  <span className="product-editor-field-label">Agregar tag existente</span>
                  <select
                    className="select"
                    value=""
                    onChange={(event) => {
                      if (event.target.value) onAppendFilterTag(event.target.value);
                    }}
                  >
                    <option value="">Selecciona un tag</option>
                    {filterTagOptions.filter((tag) => !formTags.includes(tag)).map((tag) => <option key={tag} value={tag}>{tag}</option>)}
                  </select>
                </label>
                <div className="product-editor-inline-input">
                  <input className="input" placeholder="Crear nuevo tag" value={customFilterTagInput} onChange={(event) => setCustomFilterTagInput(event.target.value)} />
                  <button type="button" className="btn btn-outline" onClick={onAddFilterTag}><Plus size={16} />Crear</button>
                </div>
              </div>
            </div>
            <div className="product-editor-selected-tags">
              <span className="product-editor-field-label">Tags seleccionados</span>
              {formTags.length ? (
                <div className="chip-row">
                  {formTags.map((tag) => (
                    <button key={tag} type="button" className="chip active" onClick={() => onRemoveFilterTag(tag)}>
                      {tag}<X size={13} />
                    </button>
                  ))}
                </div>
              ) : <p className="helper-text">Este producto todavía no tiene tags.</p>}
            </div>
          </section>
        )}

        {activeSection === "variantes" && (
          <section className="product-editor-pane" aria-labelledby="product-variants-heading">
            <div className="product-editor-pane-toolbar">
              <div className="product-editor-section-head">
                <h5 id="product-variants-heading">Colores, fotos y stock</h5>
                <p>Abre solo el color que necesitas editar.</p>
              </div>
              <button className="btn btn-primary" type="button" onClick={onAddColor}><Plus size={16} />Agregar color</button>
            </div>

            <div className="product-variant-list">
              {colors.map((color, colorIndex) => {
                const isExpanded = activeColorId === color.uid;
                const colorStock = (color.sizes || []).reduce((total, entry) => total + Math.max(0, Number(entry.stock) || 0), 0);
                const detailsId = `product-color-${color.uid}-details`;
                return (
                  <article key={color.uid} className={`product-variant-row${isExpanded ? " is-expanded" : ""}`}>
                    <div className="product-variant-summary">
                      <button
                        className="product-variant-disclosure"
                        type="button"
                        onClick={() => setExpandedColorId(isExpanded ? "" : color.uid)}
                        aria-expanded={isExpanded}
                        aria-controls={detailsId}
                      >
                        <span className="product-variant-index">{colorIndex + 1}</span>
                        <span className="product-variant-name">
                          <strong>{color.name || "Color sin nombre"}</strong>
                          <small>{(color.images || []).filter(Boolean).length} fotos · {(color.sizes || []).length} tallas · {colorStock} unidades</small>
                        </span>
                        <ChevronDown size={18} aria-hidden="true" />
                      </button>
                      <button className="icon-btn admin-danger-icon" type="button" onClick={() => onRemoveColor(color.uid)} disabled={colors.length === 1} aria-label={`Quitar ${color.name || "color"}`}>
                        <Trash2 size={16} />
                      </button>
                    </div>

                    {isExpanded && (
                      <div id={detailsId} className="product-variant-details">
                        <label className="product-editor-field">
                          <span className="product-editor-field-label">Nombre del color</span>
                          <input className="input" value={color.name} onChange={(event) => onColorFieldChange(color.uid, "name", event.target.value)} placeholder="Ej. Negro" />
                        </label>

                        <div className="product-variant-block">
                          <div className="product-variant-block-head">
                            <div>
                              <strong>Fotografías</strong>
                              <p>Pega enlaces o sube varias imágenes.</p>
                            </div>
                            <div className="admin-actions">
                              <button className="btn btn-outline" type="button" onClick={() => onAddImageField(color.uid)}><Plus size={15} />Agregar URL</button>
                              <label className="btn btn-soft admin-file-btn">
                                <ImagePlus size={15} />Subir fotos
                                <input type="file" accept="image/*" multiple onChange={(event) => onColorFilesUpload(color.uid, event)} />
                              </label>
                            </div>
                          </div>
                          <div className="product-image-editor-list">
                            {(color.images || []).map((image, imageIndex) => (
                              <div key={`${color.uid}-${imageIndex}`} className="product-image-editor-row">
                                {image ? <img src={image} alt="" loading="lazy" decoding="async" /> : <span className="product-image-placeholder"><ImagePlus size={16} /></span>}
                                <input className="input" value={image} onChange={(event) => onColorImageChange(color.uid, imageIndex, event.target.value)} placeholder={`URL de imagen ${imageIndex + 1}`} />
                                <button className="icon-btn" type="button" onClick={() => onRemoveImageField(color.uid, imageIndex)} aria-label={`Quitar imagen ${imageIndex + 1}`}><Trash2 size={15} /></button>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="product-variant-block">
                          <div className="product-variant-block-head">
                            <div>
                              <strong>Tallas y existencias</strong>
                              <p>Registra el stock exacto de este color.</p>
                            </div>
                            <button type="button" className="btn btn-outline" onClick={() => onAddSize(color.uid)}><PackagePlus size={15} />Agregar talla</button>
                          </div>
                          <div className="product-size-table">
                            <div className="product-size-table-head"><span>Talla</span><span>Stock</span><span /></div>
                            {(color.sizes || []).map((sizeRow) => (
                              <div key={sizeRow.uid} className="product-size-row">
                                <input className="input" value={sizeRow.size} onChange={(event) => onSizeChange(color.uid, sizeRow.uid, "size", event.target.value)} placeholder="Ej. M" />
                                <input className="input" type="number" min="0" value={sizeRow.stock} onChange={(event) => onSizeChange(color.uid, sizeRow.uid, "stock", event.target.value)} placeholder="0" />
                                <button type="button" className="icon-btn" onClick={() => onRemoveSize(color.uid, sizeRow.uid)} aria-label={`Quitar talla ${sizeRow.size || "sin nombre"}`}><Trash2 size={15} /></button>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {activeSection === "publicacion" && (
          <section className="product-editor-pane" aria-labelledby="product-publish-heading">
            <div className="product-editor-section-head">
              <h5 id="product-publish-heading">Visibilidad y promoción</h5>
              <p>Controla dónde aparece el producto y si tendrá un descuento adicional.</p>
            </div>
            <div className="product-editor-toggle-grid">
              <label className="product-editor-toggle-card">
                <input className="checkbox" type="checkbox" checked={Boolean(form.isPublic)} onChange={(event) => onFieldChange("isPublic", event.target.checked)} />
                <span><strong>Visible al público</strong><small>Permite comprarlo en la tienda.</small></span>
              </label>
              <label className="product-editor-toggle-card">
                <input className="checkbox" type="checkbox" checked={Boolean(form.featured)} onChange={(event) => onFieldChange("featured", event.target.checked)} />
                <span><strong>Producto destacado</strong><small>Aparece en espacios prioritarios.</small></span>
              </label>
              <label className="product-editor-toggle-card">
                <input className="checkbox" type="checkbox" checked={Boolean(form.newArrival)} onChange={(event) => onFieldChange("newArrival", event.target.checked)} />
                <span><strong>Mostrar como nuevo</strong><small>Activa la señal de novedad.</small></span>
              </label>
              <label className="product-editor-toggle-card">
                <input className="checkbox" type="checkbox" checked={Boolean(form.offerEnabled)} onChange={(event) => onFieldChange("offerEnabled", event.target.checked)} />
                <span><strong>Incluir en ofertas</strong><small>Aplica un descuento adicional.</small></span>
              </label>
            </div>

            {form.offerEnabled && (
              <div className="product-editor-offer-panel">
                <label className="product-editor-field">
                  <span className="product-editor-field-label">Tipo de descuento</span>
                  <select className="select" value={form.offerDiscountMode || "percent"} onChange={(event) => onFieldChange("offerDiscountMode", event.target.value)}>
                    <option value="percent">Porcentaje</option>
                    <option value="amount">Monto fijo</option>
                  </select>
                </label>
                <label className="product-editor-field">
                  <span className="product-editor-field-label">{form.offerDiscountMode === "amount" ? "Monto de descuento" : "Porcentaje de descuento"}</span>
                  <input className="input" type="text" inputMode="decimal" value={form.offerDiscountValue} onChange={(event) => onFieldChange("offerDiscountValue", event.target.value)} placeholder={form.offerDiscountMode === "amount" ? "0.00" : "0"} />
                </label>
              </div>
            )}
          </section>
        )}
      </div>

      <footer className="product-editor-footer">
        <div className="product-editor-footer-copy">
          <strong>{form.id ? "Editando producto" : "Nuevo producto"}</strong>
          <span>Los cambios se publican al guardar.</span>
        </div>
        <div className="product-editor-footer-actions">
          <button className="btn btn-outline" type="button" onClick={onReset}>{form.id ? "Cancelar" : "Limpiar"}</button>
          <button className="btn btn-primary" type="button" onClick={onSave}><Save size={16} />Guardar producto</button>
        </div>
      </footer>
    </section>
  );
}
