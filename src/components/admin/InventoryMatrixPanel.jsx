import React, { memo, useMemo, useState } from "react";
import { ChevronDown, PackageOpen, Search, Star } from "lucide-react";
import { getImagesForColor } from "../../domain/products/variants.js";
import { getProductColorSwatch } from "../../utils/productColor.js";

function safeStock(value) {
  return Math.max(0, Math.floor(Number(value) || 0));
}

function stockTone(stock) {
  if (stock <= 0) return "danger";
  if (stock <= 3) return "warning";
  return "success";
}

function stockLabel(stock) {
  if (stock <= 0) return "Agotado";
  if (stock === 1) return "Última unidad";
  if (stock <= 3) return "Stock bajo";
  return "Disponible";
}

function getProductInventory(product = {}) {
  const variants = Array.isArray(product.variants) ? product.variants : [];
  const colors = [...new Set([
    ...(Array.isArray(product.colors) ? product.colors : []),
    ...variants.map((variant) => variant.color),
  ].filter(Boolean))];
  const sizes = [...new Set([
    ...(Array.isArray(product.sizes) ? product.sizes : []),
    ...variants.map((variant) => variant.size),
  ].filter(Boolean))];
  const byVariant = new Map(variants.map((variant) => [
    `${variant.color}\u0000${variant.size}`,
    { ...variant, stock: safeStock(variant.stock) },
  ]));
  const total = variants.reduce((sum, variant) => sum + safeStock(variant.stock), 0);
  const outCount = variants.filter((variant) => safeStock(variant.stock) === 0).length;
  const lowCount = variants.filter((variant) => {
    const stock = safeStock(variant.stock);
    return stock > 0 && stock <= 3;
  }).length;
  const colorTotals = new Map(colors.map((color) => [
    color,
    variants
      .filter((variant) => variant.color === color)
      .reduce((sum, variant) => sum + safeStock(variant.stock), 0),
  ]));
  return { variants, colors, sizes, byVariant, total, outCount, lowCount, colorTotals };
}

const InventoryProductMatrix = memo(function InventoryProductMatrix({
  product,
  selectedProductId,
  selectedColor,
  selectedSize,
  onSelectVariant,
}) {
  const inventory = useMemo(() => getProductInventory(product), [product]);
  const colorSwatches = useMemo(() => new Map(Object.entries(product.colorSwatches || {})), [product.colorSwatches]);
  const principalColor = inventory.colors.includes(product.catalogColor)
    ? product.catalogColor
    : inventory.colors[0];
  const previewImage = getImagesForColor(product, principalColor)[0];
  const needsAttention = inventory.outCount > 0 || inventory.lowCount > 0;
  const [isOpen, setIsOpen] = useState(() => (
    String(selectedProductId) === String(product.id) || needsAttention
  ));

  return (
    <details
      className="inventory-matrix-product"
      open={isOpen}
      onToggle={(event) => setIsOpen(event.currentTarget.open)}
    >
      <summary>
        <span className="inventory-product-identity">
          {previewImage ? <img src={previewImage} alt="" width="48" height="54" loading="lazy" decoding="async" /> : null}
          <span>
            <strong>{product.name}</strong>
            <small>{product.sku || "Sin SKU"} · {inventory.variants.length} variante{inventory.variants.length === 1 ? "" : "s"}</small>
          </span>
        </span>
        <span className="inventory-color-overview" aria-label={`Colores de ${product.name}`}>
          {inventory.colors.map((color) => (
            <span key={color} className="inventory-color-summary">
              <i style={{ backgroundColor: getProductColorSwatch(color, colorSwatches.get(color)) }} aria-hidden="true" />
              <span>{color}</span>
              <b>{inventory.colorTotals.get(color) || 0}</b>
              {color === principalColor ? <Star size={12} fill="currentColor" aria-label="Color principal" /> : null}
            </span>
          ))}
        </span>
        <span className={`inventory-product-total is-${stockTone(inventory.total)}`}>
          <strong>{inventory.total}</strong>
          <small>unidades</small>
        </span>
        <span className={`inventory-attention-count${needsAttention ? " is-visible" : ""}`}>
          {inventory.outCount > 0 ? `${inventory.outCount} agotada${inventory.outCount === 1 ? "" : "s"}` : ""}
          {inventory.outCount > 0 && inventory.lowCount > 0 ? " · " : ""}
          {inventory.lowCount > 0 ? `${inventory.lowCount} baja${inventory.lowCount === 1 ? "" : "s"}` : ""}
        </span>
        <ChevronDown className="inventory-matrix-chevron" size={18} aria-hidden="true" />
      </summary>

      {inventory.variants.length && inventory.sizes.length ? (
        <div className="inventory-matrix-table-scroll" tabIndex="0">
          <table className="inventory-matrix-table">
            <caption className="visually-hidden">Stock de {product.name} por color y talla</caption>
            <thead>
              <tr>
                <th scope="col">Color</th>
                {inventory.sizes.map((size) => <th key={size} scope="col">{size}</th>)}
                <th scope="col">Total</th>
              </tr>
            </thead>
            <tbody>
              {inventory.colors.map((color) => (
                <tr key={color}>
                  <th scope="row">
                    <span className="inventory-matrix-color-name">
                      <i style={{ backgroundColor: getProductColorSwatch(color, colorSwatches.get(color)) }} aria-hidden="true" />
                      <span>{color}</span>
                      {color === principalColor ? <span className="inventory-principal-label"><Star size={11} fill="currentColor" />Principal</span> : null}
                    </span>
                  </th>
                  {inventory.sizes.map((size) => {
                    const variant = inventory.byVariant.get(`${color}\u0000${size}`);
                    if (!variant) return <td key={size} className="is-unavailable" aria-label={`${color}, talla ${size}: no configurada`}>—</td>;
                    const tone = stockTone(variant.stock);
                    const selected = String(selectedProductId) === String(product.id)
                      && selectedColor === color
                      && selectedSize === size;
                    return (
                      <td key={size}>
                        <button
                          className={`inventory-stock-cell is-${tone}${selected ? " is-selected" : ""}`}
                          type="button"
                          onClick={() => onSelectVariant(product.id, color, size)}
                          aria-label={`${product.name}, ${color}, talla ${size}: ${variant.stock} unidades. ${selected ? "Variante seleccionada" : "Seleccionar para registrar un movimiento"}`}
                          title={`${stockLabel(variant.stock)} · Seleccionar para ajustar`}
                        >
                          <strong>{variant.stock}</strong>
                          <small>{stockLabel(variant.stock)}</small>
                        </button>
                      </td>
                    );
                  })}
                  <td className="inventory-color-total">{inventory.colorTotals.get(color) || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="inventory-matrix-empty-product">Este producto todavía no tiene variantes configuradas.</div>
      )}
    </details>
  );
});

export function InventoryMatrixPanel({
  products = [],
  selectedProductId = "",
  selectedVariant = [],
  onSelectVariant,
}) {
  const [query, setQuery] = useState("");
  const [view, setView] = useState("attention");
  const inventoryByProduct = useMemo(() => new Map(products.map((product) => [product.id, getProductInventory(product)])), [products]);
  const totals = useMemo(() => {
    let units = 0;
    let out = 0;
    let low = 0;
    inventoryByProduct.forEach((inventory) => {
      units += inventory.total;
      out += inventory.outCount;
      low += inventory.lowCount;
    });
    return { units, out, low };
  }, [inventoryByProduct]);
  const visibleProducts = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("es");
    return products.filter((product) => {
      const inventory = inventoryByProduct.get(product.id);
      if (view === "out" && !inventory?.outCount) return false;
      if (view === "low" && !inventory?.lowCount) return false;
      if (view === "attention" && !(inventory?.outCount || inventory?.lowCount)) return false;
      if (!normalizedQuery) return true;
      const haystack = [product.name, product.sku, ...(inventory?.colors || []), ...(inventory?.sizes || [])]
        .join(" ")
        .toLocaleLowerCase("es");
      return haystack.includes(normalizedQuery);
    });
  }, [inventoryByProduct, products, query, view]);

  const selectedColor = selectedVariant[0] || "";
  const selectedSize = selectedVariant[1] || "";

  return (
    <section className="inventory-matrix-section" aria-labelledby="inventory-matrix-heading">
      <div className="inventory-matrix-toolbar">
        <div>
          <h3 id="inventory-matrix-heading">Existencias por color y talla</h3>
          <p>Abre un producto y pulsa una cantidad para registrar una entrada o salida sin abandonar Inventario.</p>
        </div>
        <label className="inventory-matrix-search">
          <Search size={17} aria-hidden="true" />
          <span className="visually-hidden">Buscar en inventario</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar producto, SKU, color o talla" />
        </label>
      </div>

      <div className="inventory-view-switcher" aria-label="Filtrar inventario">
        {[
          ["attention", "Por revisar", totals.out + totals.low],
          ["all", "Todo", products.length],
          ["low", "Stock bajo", totals.low],
          ["out", "Agotado", totals.out],
        ].map(([value, label, count]) => (
          <button key={value} type="button" className={view === value ? "active" : ""} onClick={() => setView(value)}>
            {label}<span>{count}</span>
          </button>
        ))}
      </div>

      <div className="inventory-matrix-list">
        {visibleProducts.length ? visibleProducts.map((product) => (
          <InventoryProductMatrix
            key={product.id}
            product={product}
            selectedProductId={selectedProductId}
            selectedColor={selectedColor}
            selectedSize={selectedSize}
            onSelectVariant={onSelectVariant}
          />
        )) : (
          <div className="inventory-matrix-empty">
            <PackageOpen size={23} aria-hidden="true" />
            <strong>{products.length ? "No hay coincidencias" : "Aún no hay productos"}</strong>
            <span>{products.length ? "Prueba otra búsqueda o cambia el filtro." : "Agrega productos al catálogo para controlar sus existencias aquí."}</span>
          </div>
        )}
      </div>
    </section>
  );
}

export default InventoryMatrixPanel;
