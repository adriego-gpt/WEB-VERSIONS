import React, { useMemo, useRef, useState } from "react";
import { Download, FileSpreadsheet, Images, PencilLine, ShieldCheck, Upload, X } from "lucide-react";
import { catalogToCsv, downloadCsv, MAX_IMPORT_PRODUCTS, MAX_IMPORT_VARIANTS, parseCatalogCsv } from "../../domain/admin/catalogCsv";
import { groupCatalogPhotoFiles, validateCatalogPhotoFiles } from "../../domain/admin/catalogPhotoNames";
import { AdminSectionHeader } from "./AdminSectionHeader";

export function CatalogImportPanel({ products = [], onImport, onCreatePhotoDraft, photoFiles = [], onPhotoFilesChange }) {
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [reading, setReading] = useState(false);
  const readSequence = useRef(0);
  const validatedCatalog = useRef("");
  const photoPreview = useMemo(() => groupCatalogPhotoFiles(photoFiles), [photoFiles]);
  const setPhotoFiles = (nextValue) => {
    if (typeof onPhotoFilesChange !== "function") return;
    onPhotoFilesChange(typeof nextValue === "function" ? nextValue(photoFiles) : nextValue);
  };

  const readFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const sequence = ++readSequence.current;
    setActionError("");
    setSourceText("");
    if (file.size > 2 * 1024 * 1024) {
      setFileName(file.name);
      setPreview({ products: [], errors: ["El CSV supera 2 MB. Divídelo en archivos más pequeños."], summary: null });
      return;
    }
    setFileName(file.name);
    setReading(true);
    try {
      const text = await file.text();
      if (sequence !== readSequence.current) return;
      setSourceText(text);
      validatedCatalog.current = JSON.stringify(products);
      setPreview(parseCatalogCsv(text, products));
    } catch {
      if (sequence === readSequence.current) setActionError("No se pudo leer el archivo. Selecciónalo nuevamente.");
    } finally {
      if (sequence === readSequence.current) setReading(false);
    }
  };

  const importProducts = async () => {
    if (!preview?.products?.length || preview.errors?.length || busy || reading) return;
    const refreshed = parseCatalogCsv(sourceText, products);
    const currentCatalog = JSON.stringify(products);
    if (validatedCatalog.current !== currentCatalog || JSON.stringify(refreshed) !== JSON.stringify(preview)) {
      validatedCatalog.current = currentCatalog;
      setPreview(refreshed);
      setActionError("El catálogo cambió desde que seleccionaste el archivo. Revisa la vista previa actualizada antes de confirmar otra vez.");
      return;
    }
    setBusy(true);
    setActionError("");
    try {
      const result = await onImport(preview.products);
      if (result?.ok) setPreview(null);
      else setActionError(result?.message || "La importación no se guardó. Revisa la conexión y vuelve a intentarlo.");
    } catch {
      setActionError("No se pudo importar. Revisa la conexión y vuelve a intentarlo.");
    } finally {
      setBusy(false);
    }
  };

  const preparePhotoDraft = async (product) => {
    if (busy) return;
    setBusy(true);
    setActionError("");
    try {
      const result = await onCreatePhotoDraft?.(product);
      if (result?.ok) {
        const preparedFiles = new Set(product.colors.flatMap((color) => color.photos.map((photo) => photo.file)));
        setPhotoFiles((current) => current.filter((file) => !preparedFiles.has(file)));
      } else setActionError(result?.message || "No se pudo preparar el producto. Tus fotos siguen seleccionadas.");
    } catch {
      setActionError("No se pudieron preparar las fotos. Revisa la conexión y vuelve a intentarlo.");
    } finally {
      setBusy(false);
    }
  };

  const template = "sku,nombre,precio,precio_anterior,categoria,tipo,descripcion,tags,publico,destacado,nuevo,calificacion,oferta_activa,oferta_modo,oferta_valor,color,color_hex,talla,stock,imagenes_urls\r\nVES-001,Vestido lino,39.90,49.90,Mujer,Vestidos,Lino ligero,verano;casual,si,no,si,5,no,percent,0,Negro,#171717,M,0,";

  const selectPhotos = (event) => {
    const result = validateCatalogPhotoFiles(event.target.files);
    setPhotoFiles(result.files);
    setActionError(result.errors.join(" "));
    event.target.value = "";
  };

  return (
    <section className="admin-workspace catalog-import-workspace" aria-labelledby="catalog-import-title">
      {actionError && <p role="alert" className="catalog-import-errors">{actionError}</p>}
      <AdminSectionHeader title="Importar catálogo" titleId="catalog-import-title" description="Carga o actualiza productos desde un CSV compatible con Excel. Nada se guarda hasta que confirmes la vista previa." actions={<button className="btn btn-outline" type="button" onClick={() => downloadCsv("plantilla-catalogo.csv", template)}><Download size={16} />Descargar plantilla</button>} />
      <div className="catalog-import-limit-note"><FileSpreadsheet size={20} /><div><strong>Procesamiento local y ligero</strong><span>Máximo {MAX_IMPORT_PRODUCTS} productos y {MAX_IMPORT_VARIANTS} variantes. Las imágenes deben ser URLs HTTPS; no se incluyen archivos ni Base64.</span></div></div>
      <section className="catalog-photo-import" aria-labelledby="catalog-photo-import-title">
        <div className="catalog-photo-import-head">
          <div>
            <span className="catalog-photo-import-kicker">Desde fotos profesionales</span>
            <h5 id="catalog-photo-import-title">Crear productos desde nombres de imagen</h5>
            <p>Usa <code>clasica-azul-frontal.png</code>. Para colores de varias palabras, usa <code>clasica__azul-marino__frontal.png</code>. La selección se conserva al cambiar de sección.</p>
          </div>
          <label className="btn btn-primary catalog-photo-import-picker">
            <Images size={16} />Seleccionar fotos
            <input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={selectPhotos} />
          </label>
        </div>
        {photoFiles.length > 0 && (
          <div className="catalog-photo-import-preview">
            <div className="catalog-photo-import-summary"><strong>{photoPreview.products.length} producto{photoPreview.products.length === 1 ? "" : "s"} detectado{photoPreview.products.length === 1 ? "" : "s"}</strong><span>{photoFiles.length} foto{photoFiles.length === 1 ? "" : "s"} listas para revisar</span><button className="link-btn" type="button" onClick={() => setPhotoFiles([])}>Limpiar</button></div>
            {photoPreview.errors.length > 0 && <div className="catalog-import-errors" role="alert"><strong>Algunos archivos se omitieron</strong>{photoPreview.errors.slice(0, 6).map((error) => <span key={error}>{error}</span>)}</div>}
            <div className="catalog-photo-product-list">
              {photoPreview.products.map((product) => (
                <article key={product.name} className="catalog-photo-product-card">
                  <div><strong>{product.name}</strong><span>{product.colors.map((color) => `${color.name}: ${color.photos.map((photo) => photo.view.toLowerCase()).join(", ")}`).join(" · ")}</span></div>
                  <button className="btn btn-outline" type="button" disabled={busy} onClick={() => preparePhotoDraft(product)}><PencilLine size={15} />{busy ? "Preparando…" : "Completar producto"}</button>
                </article>
              ))}
            </div>
          </div>
        )}
      </section>
      {!preview ? (
        <label className="catalog-import-dropzone">
          <Upload size={30} />
          <strong>{reading ? "Leyendo archivo…" : "Selecciona tu archivo CSV"}</strong>
          <span>Primero validaremos columnas, precios, variantes y stock.</span>
          <input type="file" accept=".csv,text/csv" disabled={reading || busy} onChange={readFile} />
        </label>
      ) : (
        <div className="catalog-import-preview">
          <div className="catalog-import-preview-head"><div><strong>{fileName}</strong><span>{preview.summary ? `${preview.summary.products} productos · ${preview.summary.variants} variantes · ${preview.summary.creates} nuevos · ${preview.summary.products - preview.summary.creates} actualizaciones` : "No se pudo preparar"}</span></div><button className="icon-btn" type="button" disabled={busy} onClick={() => setPreview(null)} aria-label="Cerrar vista previa"><X size={17} /></button></div>
          {preview.summary?.products > preview.summary?.creates && <p>En los productos existentes, el CSV reemplaza la lista de colores, tallas y stock. Incluye todas las variantes que quieras conservar. Los campos opcionales sin columna se mantienen.</p>}
          {preview.errors?.length ? <div className="catalog-import-errors" role="alert"><strong>Corrige el archivo antes de importar</strong>{preview.errors.map((error) => <span key={error}>{error}</span>)}</div> : <div className="status-message status-success">Archivo válido. Revisa el resumen y confirma la importación.</div>}
          {!!preview.products?.length && <div className="catalog-import-table"><div className="catalog-import-row is-head"><span>Producto</span><span>SKU</span><span>Variantes</span><span>Estado</span></div>{preview.products.slice(0, 20).map((product) => <div className="catalog-import-row" key={product.id}><strong>{product.name}</strong><span>{product.sku || "Sin SKU"}</span><span>{product.variants.length}</span><span className={product.isPublic ? "is-success" : "is-muted"}>{product.isPublic ? "Publicado" : "Borrador (oculto)"}</span></div>)}</div>}
          <div className="catalog-import-actions"><button className="btn btn-outline" type="button" disabled={busy} onClick={() => setPreview(null)}>Elegir otro archivo</button><button className="btn btn-primary" type="button" disabled={busy || reading || preview.errors?.length || !preview.products?.length} onClick={importProducts}><ShieldCheck size={16} />{busy ? "Guardando…" : "Confirmar importación"}</button></div>
        </div>
      )}
      <div className="catalog-export-row"><div><strong>Exportar catálogo actual</strong><span>Descarga una copia editable sin consumir funciones de Vercel.</span></div><button className="btn btn-soft" type="button" onClick={() => downloadCsv("catalogo-adriego.csv", catalogToCsv(products))}><Download size={16} />Exportar CSV</button></div>
    </section>
  );
}

export default CatalogImportPanel;
