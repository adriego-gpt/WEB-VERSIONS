import React from "react";
import {
  currency,
  discountPercent,
  computeOfferPrice,
  resolveOfferDiscount,
} from "../../utils/currency";

export function ProductDraftPreview({
  form,
  activeColor,
  setActiveColor,
  imageIndex,
  setImageIndex,
}) {
  const cleanColors = (form.colorsData || [])
    .map((color) => ({
      name: color.name.trim(),
      images: (color.images || []).map((image) => image.trim()).filter(Boolean),
      sizes: Array.isArray(color.sizes) ? color.sizes : [],
    }))
    .filter((color) => color.name);

  const selectedColor = cleanColors.find((color) => color.name === activeColor) || cleanColors[0];
  const previewImages = selectedColor?.images || [];
  const previewImage = previewImages[imageIndex] || previewImages[0] || "";
  const previewSizes = selectedColor?.sizes || [];
  const previewBasePrice = Number(form.price || 0);
  const previewOfferConfig = resolveOfferDiscount(previewBasePrice, form.offerDiscountMode, form.offerDiscountValue);
  const previewOfferExtra = form.offerEnabled ? previewOfferConfig.percent : 0;
  const previewFinalPrice = form.offerEnabled ? computeOfferPrice(previewBasePrice, previewOfferExtra) : previewBasePrice;
  const previewOldPrice = Number(form.oldPrice || previewBasePrice || 0);
  const previewDiscount = discountPercent(previewFinalPrice, Math.max(previewOldPrice, previewBasePrice));

  return (
    <div className="card preview-panel">
      {previewImage ? (
        <img src={previewImage} alt={form.name || "Vista previa"} className="preview-panel-img" loading="lazy" decoding="async" />
      ) : (
        <div className="preview-placeholder">
          <div style={{ textAlign: "center", padding: 18 }}>
            <p style={{ fontWeight: 600, margin: 0 }}>Vista previa en tiempo real</p>
            <p className="muted" style={{ marginBottom: 0 }}>Sube una foto o pega una URL para ver el producto.</p>
          </div>
        </div>
      )}

      <div style={{ padding: 22, display: "grid", gap: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <div>
            <p className="muted" style={{ margin: 0, fontSize: 14 }}>{form.category || "Categoria"}</p>
            <h4 style={{ margin: "6px 0 0", fontSize: 24 }}>{form.name || "Nombre del producto"}</h4>
            <p className="muted" style={{ margin: "6px 0 0", fontSize: 13 }}>Tipo: {form.productType || "General"}</p>
          </div>
          <div style={{ textAlign: "right" }}>
            <p style={{ margin: 0, fontWeight: 600 }}>{currency(previewFinalPrice)}</p>
            {Math.max(previewOldPrice, previewBasePrice) > previewFinalPrice && (
              <p className="muted" style={{ margin: "4px 0 0", fontSize: 13, textDecoration: "line-through" }}>{currency(Math.max(previewOldPrice, previewBasePrice))}</p>
            )}
          </div>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {previewDiscount > 0 && <span className="badge badge-dark">-{previewDiscount}%</span>}
          {form.offerEnabled && previewOfferExtra > 0 && (
            <span className="badge badge-warning">
              {form.offerDiscountMode === "amount"
                ? `Oferta extra -${currency(previewOfferConfig.amount)} (${Math.round(previewOfferExtra)}%)`
                : `Oferta extra -${Math.round(previewOfferExtra)}%`}
            </span>
          )}
          {form.newArrival && <span className="badge badge-light">Nuevo</span>}
          {form.featured && <span className="badge badge-success">Destacado</span>}
          {form.isPublic === false && <span className="badge badge-warning">Oculto del publico</span>}
        </div>

        <p className="muted" style={{ margin: 0, lineHeight: 1.8 }}>{form.description || "La descripcion del producto se reflejara aqui conforme escribes."}</p>

        <div>
          <p style={{ fontWeight: 600, marginBottom: 10 }}>Colores</p>
          <div className="chip-row">
            {cleanColors.length ? (
              cleanColors.map((color) => (
                <button
                  key={color.name}
                  type="button"
                  className={`chip ${selectedColor?.name === color.name ? "active" : ""}`}
                  onClick={() => { setActiveColor(color.name); setImageIndex(0); }}
                >
                  {color.name}
                </button>
              ))
            ) : (
              <span className="muted">Agrega variantes de color para verlas aqui.</span>
            )}
          </div>
        </div>

        <div>
          <p style={{ fontWeight: 600, marginBottom: 10 }}>Tallas</p>
          <div className="chip-row">
            {previewSizes.length ? previewSizes.map((entry) => (
              <span key={entry.uid} className="chip">{entry.size || "Talla"} - {Math.max(0, Number(entry.stock) || 0)}</span>
            )) : <span className="muted">Sin tallas todavia.</span>}
          </div>
        </div>

        {previewImages.length > 1 && (
          <div>
            <p style={{ fontWeight: 600, marginBottom: 10 }}>Galeria de {selectedColor?.name}</p>
            <div className="mini-thumb-row">
              {previewImages.map((image, index) => (
                <button
                  key={`${selectedColor?.name}-${index}`}
                  type="button"
                  className="icon-btn"
                  style={{
                    width: 72,
                    height: 72,
                    padding: 0,
                    overflow: "hidden",
                    border: imageIndex === index ? "2px solid #111" : "1px solid rgba(0,0,0,.08)",
                  }}
                  onClick={() => setImageIndex(index)}
                  aria-label={`Ver imagen ${index + 1} de ${selectedColor?.name}`}
                >
                  <img src={image} alt={`${selectedColor?.name} ${index + 1}`} className="mini-thumb" style={{ width: "100%", height: "100%", border: 0 }} loading="lazy" decoding="async" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default React.memo(ProductDraftPreview);
