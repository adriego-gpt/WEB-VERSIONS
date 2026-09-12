import React, { useMemo, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  Circle,
  Eye,
  ImagePlus,
  PackagePlus,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { splitFilterTagsText } from "../../utils";
import { isLegacyInlineCatalogImage } from "../../domain/admin/legacyImageMigration.js";
import { AdminSectionHeader } from "./AdminSectionHeader";

const EDITOR_SECTIONS = [
  { id: "datos", label: "Datos y precio" },
  { id: "organizacion", label: "Organización" },
  { id: "variantes", label: "Variantes y stock" },
  { id: "publicacion", label: "Publicación y oferta" },
];

const COMMON_PRODUCT_SIZES = ["XS", "S", "M", "L", "XL", "2XL", "3XL", "Única"];

function normalizeSizeKey(value = "") {
  return String(value).trim().toLocaleLowerCase("es");
}

export function ProductEditorPanel({
  form = {},
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
  onMigrateLegacyImages,
  onMigrateAllLegacyImages,
  imageUploadStateByColor = {},
  onCancelImageUpload,
  onAddImageField,
  onColorImageChange,
  onRemoveImageField,
  onAddSize,
  onAddSizeToAll,
  onRemoveSizeFromAll,
  onSizeChange,
  onRemoveSize,
  onSave,
  onReset,
}) {
  const [activeSection, setActiveSection] = useState("datos");
  const [customSize, setCustomSize] = useState("");
  const colorsData = form?.colorsData;
  const [expandedColorId, setExpandedColorId] = useState(colorsData?.[0]?.uid || "");
  const formTags = useMemo(() => splitFilterTagsText(form?.filterTagsText), [form?.filterTagsText]);
  const colors = useMemo(() => (Array.isArray(colorsData) ? colorsData : []), [colorsData]);
  const activeColorId = colors.some((color) => color.uid === expandedColorId)
    ? expandedColorId
    : (colors[0]?.uid || "");
  const photoCount = colors.reduce((total, color) => total + (color.images || []).filter(Boolean).length, 0);
  const legacyPhotoCount = colors.reduce(
    (total, color) => total + (color.images || []).filter((image) => isLegacyInlineCatalogImage(image)).length,
    0,
  );
  const isAnyColorUploading = Object.values(imageUploadStateByColor).some((st) => st?.status === "uploading");
  const stockCount = colors.reduce(
    (total, color) => total + (color.sizes || []).reduce((subtotal, entry) => subtotal + Math.max(0, Number(entry.stock) || 0), 0),
    0,
  );
  const sizeColumns = useMemo(() => {
    const seen = new Set();
    return colors.flatMap((color) => color.sizes || []).reduce((result, entry) => {
      const label = String(entry?.size || "").trim();
      const key = normalizeSizeKey(label);
      if (!key || seen.has(key)) return result;
      seen.add(key);
      result.push(label);
      return result;
    }, []);
  }, [colors]);
  const sizeRowsByColor = useMemo(() => new Map(colors.map((color) => [
    color.uid,
    new Map((color.sizes || []).flatMap((entry) => {
      const key = normalizeSizeKey(entry?.size);
      return key ? [[key, entry]] : [];
    })),
  ])), [colors]);
  const addSharedSize = (rawSize) => {
    const nextSize = String(rawSize || "").trim();
    if (!nextSize) return;
    onAddSizeToAll?.(nextSize);
    setCustomSize("");
  };
  const publishChecks = [
    { label: "Nombre", complete: String(form.name || "").trim().length >= 2 },
    { label: "Precio", complete: Number(form.price) > 0 },
    { label: "Fotografía", complete: photoCount > 0 },
    { label: "Variante", complete: colors.some((color) => (color.sizes || []).some((size) => String(size.size || "").trim())) },
  ];
  const publishReady = publishChecks.every((check) => check.complete);
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
        actions={(
          <button className="btn btn-outline" type="button" onClick={() => onReset?.({ returnToCatalog: true })}>
            <X size={16} />{form.id ? "Cancelar edición" : "Volver al catálogo"}
          </button>
        )}
      />

      <datalist id="product-color-name-suggestions">
        <option value="Negro" />
        <option value="Blanco" />
        <option value="Beige" />
        <option value="Camel" />
        <option value="Gris" />
        <option value="Azul marino" />
        <option value="Celeste" />
        <option value="Verde oliva" />
        <option value="Rojo vino" />
        <option value="Rosa palo" />
        <option value="Lila" />
        <option value="Mostaza" />
      </datalist>
      <datalist id="product-size-suggestions">
        {COMMON_PRODUCT_SIZES.map((size) => <option key={size} value={size} />)}
      </datalist>

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
        {legacyPhotoCount > 0 && (
          <span className="product-editor-legacy-badge" title="Fotos guardadas como Base64 que deben migrarse a ImageKit">
            <strong>{legacyPhotoCount}</strong> por migrar
          </span>
        )}
        <span><strong>{stockCount}</strong> unidades</span>
        <span><strong>{formTags.length}</strong> tags</span>
        <span className={`product-draft-indicator${draftSaveError ? " is-error" : (hasUnsavedChanges ? " is-pending" : " is-saved")}`} role={draftSaveError ? "alert" : "status"}>
          {draftSaveError || (hasUnsavedChanges
            ? (draftTimeLabel ? `Borrador guardado ${draftTimeLabel}` : "Guardando borrador…")
            : "Sin cambios pendientes")}
        </span>
      </div>

      <div className={`product-publish-checklist${publishReady ? " is-ready" : ""}`} aria-label="Preparación para publicar">
        <strong>{publishReady ? "Listo para publicar" : "Completa la ficha"}</strong>
        <div>
          {publishChecks.map((check) => (
            <span key={check.label} className={check.complete ? "is-complete" : ""}>
              {check.complete ? <CheckCircle2 size={14} aria-hidden="true" /> : <Circle size={14} aria-hidden="true" />}
              {check.label}
            </span>
          ))}
        </div>
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
              <label className="product-editor-field">
                <span className="product-editor-field-label">SKU <small>opcional, útil para importar</small></span>
                <input className="input" value={form.sku || ""} onChange={(event) => onFieldChange("sku", event.target.value.toUpperCase())} placeholder="Ej. VES-LIN-001" />
              </label>
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
              <label className="product-editor-toggle-card admin-full">
                <input className="checkbox" type="checkbox" checked={Boolean(form.isPublic)} onChange={(event) => onFieldChange("isPublic", event.target.checked)} />
                <span><strong>Visible al público</strong><small>Permite que el producto aparezca en el catálogo público y esté disponible para compra.</small></span>
              </label>
              <label className="product-editor-toggle-card admin-full">
                <input className="checkbox" type="checkbox" checked={Boolean(form.featured)} onChange={(event) => onFieldChange("featured", event.target.checked)} />
                <span><strong>Producto destacado</strong><small>Muestra este producto en la sección de destacados y en los primeros lugares de la tienda.</small></span>
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
              <div className="admin-actions">
                {legacyPhotoCount > 0 && onMigrateAllLegacyImages && (
                  <button
                    className="btn btn-outline"
                    type="button"
                    onClick={onMigrateAllLegacyImages}
                    disabled={isAnyColorUploading}
                    title="Migra todas las fotos Base64 de este producto a ImageKit"
                  >
                    <ImagePlus size={16} />Migrar todas ({legacyPhotoCount})
                  </button>
                )}
                <button className="btn btn-primary" type="button" onClick={onAddColor}><Plus size={16} />Agregar color</button>
              </div>
            </div>

            {legacyPhotoCount > 0 && (
              <div className="product-legacy-migration-callout" role="status">
                <div>
                  <strong>Fotos antiguas detectadas ({legacyPhotoCount})</strong>
                  <p>Este producto contiene fotos en formato Base64. Puedes migrarlas todas a ImageKit con un clic para acelerar la carga del catálogo.</p>
                </div>
                {onMigrateAllLegacyImages && (
                  <button
                    className="btn btn-primary"
                    type="button"
                    onClick={onMigrateAllLegacyImages}
                    disabled={isAnyColorUploading}
                  >
                    <ImagePlus size={15} />Migrar todas a ImageKit
                  </button>
                )}
              </div>
            )}

            <section className="product-stock-matrix-card" aria-labelledby="product-stock-matrix-heading">
              <div className="product-stock-matrix-toolbar">
                <div>
                  <span className="product-editor-kicker">Inventario por combinación</span>
                  <h6 id="product-stock-matrix-heading">Color × talla</h6>
                  <p>Cambia el stock directamente. Puedes agregar cualquier talla y eliminar una columna completa de todos los colores.</p>
                </div>
                <div className="product-size-add-control">
                  <input
                    className="input"
                    list="product-size-suggestions"
                    value={customSize}
                    onChange={(event) => setCustomSize(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter") return;
                      event.preventDefault();
                      addSharedSize(customSize);
                    }}
                    placeholder="Nueva talla"
                    aria-label="Nueva talla para todos los colores"
                  />
                  <button className="btn btn-outline" type="button" onClick={() => addSharedSize(customSize)} disabled={!customSize.trim()}>
                    <Plus size={15} />Agregar a todos
                  </button>
                </div>
              </div>

              <div className="product-size-presets" aria-label="Tallas frecuentes">
                {COMMON_PRODUCT_SIZES.map((size) => {
                  const sizeKey = normalizeSizeKey(size);
                  const isPresentEverywhere = colors.length > 0 && colors.every((color) => sizeRowsByColor.get(color.uid)?.has(sizeKey));
                  return (
                    <button
                      key={size}
                      type="button"
                      className={`product-size-preset${isPresentEverywhere ? " is-complete" : ""}`}
                      onClick={() => addSharedSize(size)}
                      disabled={isPresentEverywhere}
                    >
                      {isPresentEverywhere && <CheckCircle2 size={13} aria-hidden="true" />}{size}
                    </button>
                  );
                })}
              </div>

              {sizeColumns.length ? (
                <div className="product-stock-matrix-scroll" tabIndex="0" aria-label="Tabla de existencias por color y talla">
                  <div className="product-stock-matrix" style={{ "--stock-column-count": sizeColumns.length }}>
                    <div className="product-stock-matrix-corner">Color</div>
                    {sizeColumns.map((size) => (
                      <div key={size} className="product-stock-matrix-heading is-size">
                        <span>{size}</span>
                        <button
                          type="button"
                          onClick={() => onRemoveSizeFromAll?.(size)}
                          aria-label={`Eliminar talla ${size} de todos los colores`}
                          title={`Eliminar talla ${size}`}
                        >
                          <X size={12} aria-hidden="true" />
                        </button>
                      </div>
                    ))}
                    <div className="product-stock-matrix-heading is-total">Total</div>

                    {colors.map((color) => {
                      const colorStock = (color.sizes || []).reduce((total, entry) => total + Math.max(0, Number(entry.stock) || 0), 0);
                      return (
                        <React.Fragment key={`matrix-${color.uid}`}>
                          <div className="product-stock-matrix-color">
                            <span style={{ backgroundColor: /^#[0-9a-fA-F]{6}$/.test(color.hex || "") ? color.hex : "#c8c4bc" }} aria-hidden="true" />
                            <strong>{color.name || "Sin nombre"}</strong>
                          </div>
                          {sizeColumns.map((size) => {
                            const sizeRow = sizeRowsByColor.get(color.uid)?.get(normalizeSizeKey(size));
                            return sizeRow ? (
                              <label key={`${color.uid}-${size}`} className="product-stock-matrix-cell">
                                <span className="visually-hidden">Stock de {color.name || "color sin nombre"}, talla {size}</span>
                                <input
                                  type="number"
                                  min="0"
                                  max="999"
                                  inputMode="numeric"
                                  value={sizeRow.stock}
                                  onChange={(event) => onSizeChange(color.uid, sizeRow.uid, "stock", event.target.value)}
                                />
                              </label>
                            ) : (
                              <button
                                key={`${color.uid}-${size}`}
                                className="product-stock-matrix-empty"
                                type="button"
                                onClick={() => onAddSize(color.uid, size)}
                                aria-label={`Agregar talla ${size} al color ${color.name || "sin nombre"}`}
                                title={`Agregar ${size} a ${color.name || "este color"}`}
                              >
                                <Plus size={14} aria-hidden="true" />
                              </button>
                            );
                          })}
                          <output className="product-stock-matrix-total" aria-label={`Total de ${color.name || "color sin nombre"}`}>{colorStock}</output>
                        </React.Fragment>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="product-stock-matrix-empty-state">
                  <PackagePlus size={18} aria-hidden="true" />
                  <span>Agrega una talla frecuente o escribe una personalizada para comenzar.</span>
                </div>
              )}
            </section>

            <div className="product-variant-details-heading">
              <strong>Detalles por color</strong>
              <span>Edita fotografías, tono y tallas especiales.</span>
            </div>

            <div className="product-variant-list">
              {colors.map((color, colorIndex) => {
                const isExpanded = activeColorId === color.uid;
                const imageUploadState = imageUploadStateByColor[color.uid];
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
                          <input className="input" list="product-color-name-suggestions" value={color.name} onChange={(event) => onColorFieldChange(color.uid, "name", event.target.value)} placeholder="Busca o escribe: ej. Verde oliva" />
                        </label>
                        <label className="product-editor-field product-color-tone-field">
                          <span className="product-editor-field-label">Tono que verá el cliente</span>
                          <span className="product-color-tone-control">
                            <input
                              type="color"
                              value={/^#[0-9a-fA-F]{6}$/.test(color.hex || "") ? color.hex : "#c8c4bc"}
                              onChange={(event) => onColorFieldChange(color.uid, "hex", event.target.value)}
                              aria-label={`Elegir tono para ${color.name || "este color"}`}
                            />
                            <output>{(/^#[0-9a-fA-F]{6}$/.test(color.hex || "") ? color.hex : "#c8c4bc").toUpperCase()}</output>
                          </span>
                          <small>Escoge cualquier tono; se usará en los puntos de color del catálogo.</small>
                        </label>

                        <div className="product-variant-block">
                          <div className="product-variant-block-head">
                            <div>
                              <strong>Fotografías</strong>
                              <p>Pega enlaces o sube varias imágenes.</p>
                            </div>
                            <div className="admin-actions">
                              {(color.images || []).filter((image) => isLegacyInlineCatalogImage(image)).length > 0 && (
                                <button className="btn btn-outline" type="button" onClick={() => onMigrateLegacyImages?.(color.uid)} disabled={imageUploadState?.status === "uploading"}>
                                  <ImagePlus size={15} />Migrar fotos antiguas
                                </button>
                              )}
                              <button className="btn btn-outline" type="button" onClick={() => onAddImageField(color.uid)}><Plus size={15} />Agregar URL</button>
                              <label className="btn btn-soft admin-file-btn" aria-disabled={imageUploadState?.status === "uploading"}>
                                <ImagePlus size={15} />
                                {imageUploadState?.status === "uploading"
                                  ? `Subiendo ${imageUploadState.completed}/${imageUploadState.total}${imageUploadState.percent ? ` · ${imageUploadState.percent}%` : ""}`
                                  : "Subir fotos"}
                                <input
                                  type="file"
                                  accept="image/jpeg,image/png,image/webp"
                                  multiple
                                  disabled={imageUploadState?.status === "uploading"}
                                  onChange={(event) => onColorFilesUpload(color.uid, event)}
                                />
                              </label>
                              {imageUploadState?.status === "uploading" && (
                                <button className="btn btn-outline" type="button" onClick={() => onCancelImageUpload?.(color.uid)}>
                                  <X size={15} />Cancelar
                                </button>
                              )}
                            </div>
                          </div>
                          <div className="product-image-editor-list">
                            {(color.images || []).map((image, imageIndex) => (
                              <div key={`${color.uid}-${imageIndex}`} className="product-image-editor-row">
                                {image ? <img src={image} alt="" width="40" height="40" loading="lazy" decoding="async" /> : <span className="product-image-placeholder"><ImagePlus size={16} /></span>}
                                <input className="input" value={image} onChange={(event) => onColorImageChange(color.uid, imageIndex, event.target.value)} placeholder={`URL de imagen ${imageIndex + 1}`} />
                                <button className="icon-btn" type="button" onClick={() => onRemoveImageField(color.uid, imageIndex)} aria-label={`Quitar imagen ${imageIndex + 1}`}><Trash2 size={15} /></button>
                              </div>
                            ))}
                          </div>
                          {imageUploadState && imageUploadState.status !== "uploading" && (
                            <p className={`product-image-upload-result is-${imageUploadState.status}`} role="status" aria-live="polite">
                              {imageUploadState.succeeded > 0 ? `${imageUploadState.succeeded} foto(s) listas.` : "No se guardó ninguna foto."}
                              {imageUploadState.failed > 0 ? ` ${imageUploadState.failed} fallaron; puedes volver a intentarlo.` : ""}
                            </p>
                          )}
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
                                <input className="input" list="product-size-suggestions" value={sizeRow.size} onChange={(event) => onSizeChange(color.uid, sizeRow.uid, "size", event.target.value)} placeholder="Ej. M" />
                                <input className="input" type="number" min="0" max="999" inputMode="numeric" value={sizeRow.stock} onChange={(event) => onSizeChange(color.uid, sizeRow.uid, "stock", event.target.value)} placeholder="0" />
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
              <label className="product-editor-field product-editor-catalog-color-field">
                <span className="product-editor-field-label">Color principal del catálogo</span>
                <select
                  className="select"
                  value={form.catalogColor || ""}
                  onChange={(event) => onFieldChange("catalogColor", event.target.value)}
                >
                  {colors.map((color) => (
                    <option key={color.uid} value={color.name}>{color.name || "Color sin nombre"}</option>
                  ))}
                </select>
                <small>Se mostrará primero en las tarjetas y en productos destacados.</small>
              </label>
              <label className="product-editor-toggle-card">
                <input className="checkbox" type="checkbox" checked={Boolean(form.isPublic)} onChange={(event) => onFieldChange("isPublic", event.target.checked)} />
                <span><strong>Visible al público</strong><small>Permite comprarlo en la tienda.</small></span>
              </label>
              <label className="product-editor-toggle-card">
                <input className="checkbox" type="checkbox" checked={Boolean(form.featured)} onChange={(event) => onFieldChange("featured", event.target.checked)} />
                <span><strong>Producto destacado</strong><small>Se promociona usando el color principal elegido.</small></span>
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
          <span>
            {form.isPublic
              ? "Visible al público en la tienda."
              : "Borrador guardado como oculto al público."}
          </span>
        </div>
        <div className="product-editor-footer-actions">
          <button className="btn btn-outline" type="button" onClick={onReset}>{form.id ? "Cancelar" : "Limpiar"}</button>
          {!form.isPublic && (
            <button
              className="btn btn-soft"
              type="button"
              onClick={() => {
                onFieldChange("isPublic", true);
                if (typeof onSave === "function") {
                  onSave({ isPublic: true });
                }
              }}
            >
              <Eye size={16} />Guardar y publicar
            </button>
          )}
          <button className="btn btn-primary" type="button" onClick={() => onSave()}>
            <Save size={16} />{form.isPublic ? "Guardar producto" : "Guardar borrador"}
          </button>
        </div>
      </footer>
    </section>
  );
}
