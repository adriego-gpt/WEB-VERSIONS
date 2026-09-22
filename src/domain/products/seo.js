import { computeOfferPrice, normalizeOfferDiscountMode, parseLoosePositiveNumber, resolveOfferDiscount } from "../../utils/currency.js";

export const SITE_TITLE = "Adriego Store | Ropa, colores y tallas";
export const SITE_DESCRIPTION = "Explora la ropa de Adriego Store, compara colores y tallas y consulta disponibilidad. Compra desde la web con transferencia o solicita un enlace de pago.";

export function getProductSlug(product = {}) {
  return String(product.slug || product.name || product.id || "").trim().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function safeImage(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" && !url.username && !url.password ? url.href : "";
  } catch { return ""; }
}

export function getProductSeo(product = {}, origin, brandName = "Adriego Store") {
  const mode = normalizeOfferDiscountMode(product.offerDiscountMode);
  const rawPrice = Math.max(0, Number(product.price) || 0);
  const explicitBase = Math.max(0, Number(product.basePrice) || 0);
  const value = parseLoosePositiveNumber(product.offerDiscountValue ?? (mode === "amount" ? product.offerExtraAmount : product.offerExtraDiscount));
  const inferredBase = !explicitBase && product.offerEnabled
    ? (mode === "amount" ? rawPrice + value : rawPrice / Math.max(0.01, 1 - Math.min(99, value) / 100)) : 0;
  const base = Math.max(explicitBase, rawPrice, inferredBase);
  const price = product.offerEnabled ? computeOfferPrice(base, resolveOfferDiscount(base, mode, value).percent) : base;
  const imageMap = product.imagesByColor || {};
  const colorImage = imageMap[product.catalogColor]?.[0];
  const images = [...new Set([colorImage, ...Object.values(imageMap).flat(), product.image, ...(Array.isArray(product.images) ? product.images : [])].map(safeImage).filter(Boolean))];
  const variants = Array.isArray(product.variants) ? product.variants : [];
  const inStock = variants.length ? variants.some((v) => Number(v.stock) > 0) : Object.values(product.stockBySize || {}).some((stock) => Number(stock) > 0);
  const colors = [...new Set(variants.length ? variants.map((v) => String(v.color || "")) : (Array.isArray(product.colors) ? product.colors : []))].filter(Boolean);
  const sizes = [...new Set(variants.length ? variants.map((v) => String(v.size || "")) : (Array.isArray(product.sizes) ? product.sizes : []))].filter(Boolean);
  const name = String(product.name || "Producto");
  const description = String(product.description || `Consulta los colores, tallas y disponibilidad de ${name} en ${brandName}. Compra desde la web.`);
  const url = `${origin}/producto/${getProductSlug(product)}`;
  const schema = {
    "@context": "https://schema.org", "@type": "Product", name, description,
    sku: String(product.sku || product.id || ""), url,
    ...(images.length ? { image: images } : {}),
    ...(colors.length ? { color: colors.join(", ") } : {}),
    ...(sizes.length ? { size: sizes.join(", ") } : {}),
    offers: { "@type": "Offer", priceCurrency: "USD", price: String(price),
      availability: `https://schema.org/${inStock ? "InStock" : "OutOfStock"}`,
      itemCondition: "https://schema.org/NewCondition", url,
      seller: { "@type": "Organization", name: brandName } },
  };
  return { name, description, price, images, colors, sizes, inStock, url, schema };
}
