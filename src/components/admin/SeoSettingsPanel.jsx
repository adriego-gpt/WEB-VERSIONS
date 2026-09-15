import React, { useEffect, useRef, useState } from "react";
import { Globe, Upload, RotateCcw, Save } from "lucide-react";
import { getStoreSeo, normalizeSeoImageUrl, normalizeSeoSettings } from "../../domain/store/seoSettings.js";
import { getPublicSiteOrigin } from "../../constants/site.js";
import { FILE_SECURITY } from "../../constants/product.js";
import { uploadCatalogProductImage, uploadPreparedCatalogImage } from "../../services/blobImageService.js";
import "./SeoSettingsPanel.css";

const ICON_MAX_KB = Math.floor(FILE_SECURITY.maxInlineImageBytes / 1024);
const assets = [
  { key: "faviconUrl", title: "Icono del sitio", help: `El icono pequeño del navegador y de Google. Sube un PNG o JPG cuadrado, preferiblemente de 96 × 96 px o más, de hasta ${ICON_MAX_KB} KB.`, icon: true },
  { key: "logoUrl", title: "Logo de la marca", help: "Identifica tu negocio en los datos enviados a los buscadores. No sustituye el nombre escrito de la cabecera." },
  { key: "imageUrl", title: "Imagen al compartir", help: "Para enlaces de la tienda en WhatsApp y redes. Recomendado: 1200 × 630 px. Google puede elegir otra miniatura." },
];

function createDraft(settings = {}) {
  return { brandName: settings.brandName || "Adriego Store", brandLabel: settings.brandLabel || "Luxury Fashion", seoSettings: normalizeSeoSettings(settings.seoSettings) };
}

async function validateIcon(file) {
  if (!["image/png", "image/jpeg"].includes(file.type)) throw new Error("Para el icono elige un archivo PNG o JPG.");
  if (!file.size || file.size > FILE_SECURITY.maxInlineImageBytes) throw new Error(`El icono debe pesar como máximo ${ICON_MAX_KB} KB.`);
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("No se pudo abrir el icono. Elige otra imagen."));
      img.src = url;
    });
    if (image.naturalWidth !== image.naturalHeight || image.naturalWidth < 8) throw new Error("El icono debe ser cuadrado y medir al menos 8 × 8 px. Recomendamos 96 × 96 px o más.");
  } finally { URL.revokeObjectURL(url); }
}

export function SeoSettingsPanel({ settings, onSave }) {
  const [draft, setDraft] = useState(() => createDraft(settings));
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState("");
  const [feedback, setFeedback] = useState(null);
  const operationRef = useRef(false);
  const mountedRef = useRef(true);
  const dirtyRef = useRef(false);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);
  useEffect(() => {
    if (!dirtyRef.current && !operationRef.current) setDraft(createDraft(settings));
  }, [settings]);
  const origin = getPublicSiteOrigin(import.meta.env.VITE_PUBLIC_SITE_URL);
  const preview = getStoreSeo(draft, origin);
  const previewAssets = {
    faviconUrl: draft.seoSettings.faviconUrl ? preview.faviconUrl : "/favicon.svg",
    logoUrl: draft.seoSettings.logoUrl || draft.seoSettings.faviconUrl ? preview.logoUrl : "/favicon.svg",
    imageUrl: draft.seoSettings.imageUrl ? preview.imageUrl : "/og-cover.jpg",
  };
  const markChanged = () => { dirtyRef.current = true; setDirty(true); setFeedback(null); };
  const update = (key, value) => { markChanged(); setDraft(previous => ({ ...previous, [key]: value })); };
  const updateSeo = (key, value) => { markChanged(); setDraft(previous => ({ ...previous, seoSettings: { ...previous.seoSettings, [key]: value } })); };
  const reset = () => {
    if (operationRef.current) return;
    dirtyRef.current = false;
    setDirty(false);
    setFeedback(null);
    setDraft(createDraft(settings));
  };
  const upload = async (asset, file) => {
    if (!file || operationRef.current) return;
    operationRef.current = true;
    setBusy(asset.key);
    setFeedback(null);
    try {
      if (asset.icon) await validateIcon(file);
      const url = asset.icon ? await uploadPreparedCatalogImage(file) : await uploadCatalogProductImage(file);
      if (!mountedRef.current) return;
      updateSeo(asset.key, url);
      setFeedback({ tone: "success", message: "Imagen subida. Guarda los cambios para aplicarla a la tienda." });
    } catch (error) {
      if (mountedRef.current) setFeedback({ tone: "error", message: error.message || "No se pudo subir la imagen. Reintenta." });
    } finally {
      operationRef.current = false;
      if (mountedRef.current) setBusy("");
    }
  };
  const save = async (event) => {
    event.preventDefault();
    if (operationRef.current) return;
    if (!draft.brandName.trim()) { setFeedback({ tone: "error", message: "Escribe el nombre de la marca antes de guardar." }); return; }
    const invalidAsset = assets.find(asset => draft.seoSettings[asset.key] && !normalizeSeoImageUrl(draft.seoSettings[asset.key]));
    if (invalidAsset) { setFeedback({ tone: "error", message: `${invalidAsset.title}: usa una URL pública HTTPS válida o sube una imagen.` }); return; }
    operationRef.current = true;
    setBusy("save");
    setFeedback(null);
    try {
      const result = await onSave(draft);
      if (!mountedRef.current) return;
      if (!result?.ok) { setFeedback({ tone: "error", message: result?.message || "No se guardaron los cambios. Reintenta." }); return; }
      dirtyRef.current = false;
      setDirty(false);
      setDraft(createDraft(result.data || draft));
      setFeedback({ tone: "success", message: "Cambios guardados. Google los podrá recoger cuando vuelva a visitar la tienda." });
    } catch {
      if (mountedRef.current) setFeedback({ tone: "error", message: "No se pudo guardar. Tus cambios siguen aquí; vuelve a intentarlo." });
    } finally {
      operationRef.current = false;
      if (mountedRef.current) setBusy("");
    }
  };
  return <form className="admin-seo" onSubmit={save}>
    <div className="seo-editor-layout">
      <fieldset disabled={Boolean(busy)} className="seo-fields">
        <legend>Marca y resultado de búsqueda</legend>
        <p className="seo-intro">Personaliza cómo se identifica tu tienda. El nombre también cambia en la cabecera de la web.</p>
        <label className="entity-field"><span>Nombre de la marca</span><input className="input" value={draft.brandName} maxLength={80} required onChange={event => update("brandName", event.target.value)} /></label>
        <label className="entity-field"><span>Texto sobre el nombre en la cabecera</span><input className="input" value={draft.brandLabel} maxLength={80} onChange={event => update("brandLabel", event.target.value)} /><small>Vacío usa el texto predeterminado: Luxury Fashion.</small></label>
        <label className="entity-field"><span>Nombre alternativo (opcional)</span><input className="input" value={draft.seoSettings.alternateName} maxLength={80} placeholder="Por ejemplo: Adriego" onChange={event => updateSeo("alternateName", event.target.value)} /></label>
        <label className="entity-field"><span>Título de la página principal</span><input className="input" value={draft.seoSettings.title} maxLength={100} placeholder={getStoreSeo({ brandName: draft.brandName }, origin).title} onChange={event => updateSeo("title", event.target.value)} /><small>Déjalo vacío para usar el título automático. Como guía, procura unas 50–60 letras.</small></label>
        <label className="entity-field"><span>Descripción para buscadores</span><textarea className="textarea" rows={4} maxLength={320} value={draft.seoSettings.description} placeholder={getStoreSeo({ brandName: draft.brandName }, origin).description} onChange={event => updateSeo("description", event.target.value)} /><small>{draft.seoSettings.description.length}/320 caracteres · Como guía, unas 150–160 letras. Vacío usa la descripción automática.</small></label>
      </fieldset>
      <aside className="seo-preview" aria-labelledby="seo-preview-title">
        <h3 id="seo-preview-title">Vista previa orientativa</h3>
        <div className="seo-search-result">
          <div className="seo-result-site"><div className="seo-result-icon"><Globe size={18} aria-hidden="true" /><img key={previewAssets.faviconUrl} src={previewAssets.faviconUrl} alt="" referrerPolicy="no-referrer" onError={event => { event.currentTarget.hidden = true; }} /></div><div><span>{preview.brandName}</span><small>{origin}</small></div></div>
          <div className="seo-result-copy"><div><p className="seo-result-title">{preview.title}</p><p className="seo-result-description">{preview.description}</p></div><img key={previewAssets.imageUrl} className="seo-result-thumbnail" src={previewAssets.imageUrl} alt="" referrerPolicy="no-referrer" onError={event => { event.currentTarget.hidden = true; }} /></div>
        </div>
        <p>Google decide el título, la descripción y la miniatura finales; pueden diferir de esta vista. No cambia tu dominio ni garantiza una posición en los resultados.</p>
        <p>Después de publicar, puedes solicitar la indexación de la página principal en Google Search Console. La actualización no es inmediata.</p>
      </aside>
    </div>
    <fieldset className="seo-assets" disabled={Boolean(busy)}>
      <legend>Imágenes de identidad</legend>
      {assets.map(asset => <div className="seo-asset" key={asset.key}>
        <div className={`seo-asset-preview${asset.icon ? " is-icon" : ""}`}><Globe size={24} aria-hidden="true" /><img key={previewAssets[asset.key]} src={previewAssets[asset.key]} alt={`Vista previa: ${asset.title.toLowerCase()}`} referrerPolicy="no-referrer" onError={event => { event.currentTarget.hidden = true; }} /></div>
        <div className="seo-asset-content"><h3>{asset.title}</h3><p>{asset.help}</p>
          <label className="seo-upload-control"><Upload size={16} aria-hidden="true" /><span>{busy === asset.key ? "Subiendo…" : "Subir imagen"}</span><input type="file" aria-label={`Subir ${asset.title.toLowerCase()}`} accept={asset.icon ? "image/png,image/jpeg" : "image/png,image/jpeg,image/webp"} onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; void upload(asset, file); }} /></label>
          {draft.seoSettings[asset.key] && <button type="button" className="btn btn-outline seo-reset-image" onClick={() => updateSeo(asset.key, "")}>Usar imagen predeterminada</button>}
          <details><summary>Usar una URL de imagen</summary><label className="entity-field"><span>URL pública de {asset.title.toLowerCase()}</span><input className="input" type="url" value={draft.seoSettings[asset.key]} placeholder="https://…" maxLength={2048} onChange={event => updateSeo(asset.key, event.target.value)} /></label><small>No uses enlaces de Drive privados. La imagen debe abrirse sin iniciar sesión.</small></details>
        </div>
      </div>)}
    </fieldset>
    <div className="seo-save-area">
      {feedback && <p className={`seo-feedback is-${feedback.tone}`} role={feedback.tone === "error" ? "alert" : "status"}>{feedback.message}</p>}
      <div className="seo-actions"><button type="submit" className="btn btn-primary" disabled={Boolean(busy) || !dirty} aria-busy={busy === "save"}><Save size={16} aria-hidden="true" />{busy === "save" ? "Guardando…" : "Guardar identidad y buscadores"}</button><button type="button" className="btn btn-outline" disabled={Boolean(busy) || !dirty} onClick={reset}><RotateCcw size={16} aria-hidden="true" />Descartar cambios</button></div>
      <p className="helper-text">Se mantiene al cerrar o actualizar la página una vez guardado. Las fichas de producto conservan su propio título e imagen.</p>
    </div>
  </form>;
}
