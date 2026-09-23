import fs from "node:fs/promises";
import { getStoreSeo } from "../../src/domain/store/seoSettings.js";
import { normalizeMaintenanceSettings } from "../../src/domain/store/maintenance.js";

export function renderMaintenanceDocument({ template, storeSettings = {}, origin }) {
  const settings = normalizeMaintenanceSettings(storeSettings.maintenanceSettings);
  const brand = storeSettings.brandName || "Adriego Store";
  const favicon = getStoreSeo(storeSettings, origin || "https://www.adriego.shop").faviconUrl;
  const shell = template || '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div></body></html>';
  const body = `<div class="maintenance-page"><header class="maintenance-header"><span class="brand-wordmark">${escapeHtml(brand)}</span></header><main id="main-content" class="maintenance-content"><div class="maintenance-status">Tienda en mantenimiento</div><h1>${escapeHtml(settings.title)}</h1><p>${escapeHtml(settings.message)}</p>${settings.returnMessage ? `<p class="maintenance-return">${escapeHtml(settings.returnMessage)}</p>` : ""}<a href="/pedidos" class="btn btn-outline">Consultar mis pedidos</a></main></div>`;
  return shell.replace(/<title>[\s\S]*?<\/title>/g, "")
    .replace(/<meta\b[^>]*(?:name="(?:description|robots|twitter:[^"]+)"|property="og:[^"]+")[^>]*>/g, "")
    .replace(/<script\b[^>]*type="application\/ld\+json"[^>]*>[\s\S]*?<\/script>/g, "")
    .replace(/<noscript>[\s\S]*?<\/noscript>/g, "")
    .replace(/<link\b[^>]*rel="(?:icon|shortcut icon|apple-touch-icon|apple-touch-icon-precomposed)"[^>]*>/g, "")
    .replace("</head>", `<title>${escapeHtml(settings.title)} | ${escapeHtml(brand)}</title><link rel="icon" href="${escapeHtml(favicon)}"><link rel="apple-touch-icon" href="${escapeHtml(favicon)}"><script type="application/json" id="store-maintenance-state">${json({ brandName: brand, maintenanceSettings: settings })}</script></head>`)
    .replace('<div id="root"></div>', `<div id="root">${body}</div>`);
}
import { getProductSeo, getProductSlug } from "../../src/domain/products/seo.js";
import { getResponsiveImageSources } from "../../src/domain/products/imageSources.js";
import { DEFAULT_HERO_IMAGE } from "../../src/domain/store/defaultHero.js";

const LEGAL_DOCUMENTS = Object.freeze({
  "/legal/privacidad": {
    title: "Política de privacidad",
    description: "Cómo Adriego Store utiliza, protege y conserva los datos necesarios para gestionar cuentas, compras, entregas y atención al cliente.",
    paragraphs: [
      "Adriego Store trata los datos que entregas al crear una cuenta, realizar un pedido o solicitar ayuda. Esto puede incluir nombre, correo electrónico, teléfono, identificación cuando sea necesaria para el envío, dirección, artículos comprados y comprobantes de transferencia. Solo solicitamos información relacionada con la operación de la tienda.",
      "Usamos esos datos para autenticar tu cuenta, preparar y entregar pedidos, validar pagos, comunicar cambios de estado, responder consultas, prevenir abusos y cumplir obligaciones aplicables. No solicitamos datos de tarjeta dentro de esta web. Evita adjuntar información que no sea necesaria para comprobar tu pago.",
      "Proveedores y encargados del tratamiento (subprocesadores): según las funciones activas, la operación puede apoyarse en Vercel para alojamiento, almacenamiento persistente compatible con Redis, ImageKit para imágenes, Umami para analítica respetuosa de la privacidad y proveedores configurados de correo o mensajería para avisos de pedidos. Cada servicio recibe únicamente la información necesaria para su función y aplica sus propias condiciones de tratamiento.",
      "Las cuentas se conservan mientras permanezcan activas y los pedidos durante el tiempo necesario para entrega, soporte, reclamos y obligaciones legales. Aplicamos sesiones firmadas, contraseñas derivadas criptográficamente, controles de acceso y límites de solicitudes. Ningún sistema elimina por completo el riesgo, por lo que revisamos estas medidas de forma periódica.",
      "Puedes solicitar acceso, actualización, rectificación, eliminación, oposición, limitación o portabilidad cuando corresponda. También puedes retirar un consentimiento sin afectar el tratamiento previo legítimo. Para ejercer tus derechos utiliza los canales de contacto publicados en la tienda; podremos verificar tu identidad de manera proporcional antes de atender la solicitud.",
    ],
  },
  "/legal/terminos": {
    title: "Términos de compra",
    description: "Consulta las condiciones del catálogo, disponibilidad, precios, pagos, confirmación de pedidos, entregas y atención posterior a la compra en Adriego Store.",
    paragraphs: [
      "Los precios se muestran en dólares de los Estados Unidos e incluyen la información disponible al momento de la consulta. La existencia se confirma por color y talla durante el proceso de compra. Añadir una prenda al carrito no garantiza su reserva permanente; una reserva temporal puede caducar si el pedido no se completa dentro del plazo indicado.",
      "Antes de confirmar revisa prendas, variantes, cantidades, entrega y total. Un pedido se identifica con un código único. Los reintentos seguros no crean cobros ni descuentos de inventario duplicados. La tienda puede cancelar operaciones evidentemente fraudulentas, imposibles de cumplir o realizadas durante mantenimiento, informando al cliente por los canales disponibles.",
      "El pago puede realizarse mediante los métodos habilitados en la tienda. Cuando uses transferencia, el comprobante se revisa antes de confirmar el pago. No ingreses números completos de tarjeta, claves bancarias ni otra información sensible en notas o imágenes. Los plazos de entrega dependen del destino y del método elegido.",
      "La información del producto busca representar con fidelidad colores, medidas y acabados, aunque la pantalla y la iluminación pueden producir diferencias razonables. Si recibes un artículo equivocado, con defecto o distinto de la descripción, contáctanos con el código del pedido y evidencia suficiente para revisar el caso.",
      "La confirmación del pedido conserva el precio y las condiciones mostradas en ese momento, salvo un error evidente que deba comunicarse antes del cobro o despacho. Los cupones se validan en el servidor y están sujetos a vigencia, límites de uso, productos participantes y demás condiciones anunciadas. No pueden canjearse por dinero ni combinarse cuando la promoción indique lo contrario.",
      "Estas condiciones se complementan con la política de cambios y no reducen los derechos reconocidos por la legislación ecuatoriana. Si una cláusula comercial no pudiera aplicarse a un caso concreto, las demás continúan vigentes. Para resolver dudas utiliza los canales de contacto publicados antes de finalizar la compra.",
    ],
  },
  "/legal/cambios": {
    title: "Política de cambios",
    description: "Conoce los requisitos, plazos, coordinación, disponibilidad y excepciones para solicitar cambios de talla o de prenda comprada en Adriego Store.",
    paragraphs: [
      "Las prendas a precio regular pueden solicitar cambio de talla o por otra prenda cuando se encuentren sin uso, limpias, con etiquetas, accesorios y empaque original. Conserva el código del pedido y comunícate por los canales publicados para confirmar disponibilidad antes de enviar o acercar el artículo.",
      "Las ofertas, liquidaciones, remates y prendas identificadas como venta final no participan en cambios comerciales voluntarios. Esta condición no elimina las soluciones exigidas por ley cuando existe un defecto, un error de despacho o una falta de conformidad atribuible a la tienda.",
      "Cuando la ley lo permita y corresponda, la solicitud debe realizarse dentro de los quince días posteriores a la recepción. Los costos y la modalidad se informarán según el caso, el lugar de entrega y la causa del cambio. No envíes una prenda sin coordinación previa porque necesitamos asociarla correctamente con su pedido.",
      "Al recibir la solicitud revisaremos el estado de la prenda y la información del pedido. La aprobación queda sujeta al cumplimiento de las condiciones y a la existencia de la variante elegida. Si la nueva prenda tiene un precio diferente, antes de completar el cambio se informará el valor adicional o la solución aplicable.",
      "No se aceptan prendas usadas, lavadas, perfumadas, alteradas, manchadas o incompletas por razones de higiene y trazabilidad. Cuando el inconveniente sea imputable a la tienda, coordinaremos la alternativa correspondiente sin trasladar al cliente costos que legalmente no le correspondan.",
    ],
  },
  "/legal/cookies": {
    title: "Uso de cookies",
    description: "Revisa cómo Adriego Store utiliza cookies técnicas, de seguridad, sesión y analítica, cuánto duran y cómo puedes administrarlas desde tu navegador.",
    paragraphs: [
      "La tienda utiliza cookies técnicas para mantener sesiones, proteger formularios contra solicitudes falsificadas y permitir que un comprador sin cuenta consulte sus pedidos desde el mismo navegador. Estas cookies son necesarias para las funciones solicitadas y no contienen tu contraseña.",
      "La sesión de cliente dura el periodo configurado por la tienda; la sesión administrativa tiene una duración menor. El acceso a pedidos sin cuenta puede mantenerse durante treinta días desde su creación o renovación. Borrar las cookies cierra sesiones y puede eliminar el acceso local a pedidos de invitado, aunque no borra registros necesarios del servidor.",
      "Cuando la analítica Umami está habilitada, se utiliza para conocer visitas y uso general del sitio sin crear perfiles publicitarios. Puedes limitar cookies desde tu navegador, teniendo en cuenta que bloquear las necesarias puede impedir iniciar sesión, proteger formularios o completar una compra.",
      "El navegador también puede conservar preferencias no sensibles, como el carrito o productos favoritos, para restaurar tu experiencia. Estos datos permanecen en tu dispositivo y pueden sincronizarse con tu cuenta cuando inicias sesión. Puedes eliminarlos usando las opciones del navegador, cerrando la sesión o solicitando ayuda si necesitas borrar información almacenada en el servidor.",
      "No utilizamos cookies para vender perfiles ni para mostrar publicidad conductual de terceros. Si incorporamos una finalidad opcional que requiera consentimiento, se informará antes de activarla. Esta página se actualizará cuando cambien las tecnologías, sus plazos o la forma de administrar las preferencias.",
    ],
  },
});

export const PUBLIC_LEGAL_PATHS = Object.freeze(Object.keys(LEGAL_DOCUMENTS));

export function getPublicLegalDocument(path = "") {
  const normalizedPath = String(path || "").toLowerCase();
  const document = LEGAL_DOCUMENTS[normalizedPath];
  return document ? { ...document, path: normalizedPath } : null;
}

let builtTemplate;
export async function readPublicTemplate() {
  // Fixed build artifact, explicitly included in the Vercel function bundle.
  builtTemplate ||= fs.readFile(new URL("../../dist/app.html", import.meta.url), "utf8").catch((error) => { builtTemplate = null; throw error; });
  return builtTemplate;
}

export function escapeHtml(value = "") {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function json(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}

export function renderPublicDocument({ template, products = [], product, legalDocument = null, origin, storeSettings = {} }) {
  const safeStoreSettings = storeSettings && typeof storeSettings === "object" ? storeSettings : {};
  const site = getStoreSeo(safeStoreSettings, origin);
  const publicProducts = products.filter((p) => p.isPublic !== false && getProductSlug(p));
  const data = product ? getProductSeo(product, origin, site.brandName) : null;
  const productSummary = String(product?.description || "").trim() || (data ? `Descubre ${data.name} y consulta sus variantes disponibles.` : "");
  const title = legalDocument ? `${legalDocument.title} | ${site.brandName}` : data ? `${data.name} | ${site.brandName}` : site.title;
  const description = legalDocument ? legalDocument.description.slice(0, 160) : data ? data.description.slice(0, 160) : site.description;
  const url = legalDocument ? `${origin}${legalDocument.path}` : data ? data.url : `${origin}/`;
  const image = data?.images[0] || site.imageUrl;
  const defaultShareImage = new URL("/adriego-share.png", `${origin}/`).href;
  const defaultShareDimensions = !data && image === defaultShareImage
    ? '<meta property="og:image:type" content="image/png">\n<meta property="og:image:width" content="1731">\n<meta property="og:image:height" content="909">'
    : "";
  const schema = legalDocument ? {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": `${url}#webpage`,
    url,
    name: legalDocument.title,
    description: legalDocument.description,
    isPartOf: { "@id": `${origin}/#website` },
  } : data ? data.schema : site.schema;
  const heroImage = !data && !legalDocument
    ? (Array.isArray(safeStoreSettings.heroSlides) && safeStoreSettings.heroSlides.length
      ? safeStoreSettings.heroSlides[0]?.image
      : "") || DEFAULT_HERO_IMAGE
    : "";
  const lcpImage = data?.images[0] || heroImage;
  const lcpWidths = data ? [320, 640, 960, 1280] : [480, 768, 960, 1280];
  const lcpSizes = data ? "(max-width: 760px) 100vw, 50vw" : "(max-width: 900px) 100vw, 54vw";
  let imagePreload = "";
  let lcpSrcSet = "";
  try {
    const imageUrl = new URL(String(lcpImage || ""));
    if (imageUrl.protocol === "https:" && !imageUrl.username && !imageUrl.password) {
      lcpSrcSet = getResponsiveImageSources(imageUrl.href, lcpWidths, data ? { quality: 88 } : undefined);
      // ASVS V1.2: encode administrator-controlled URLs for their HTML attribute context.
      imagePreload = `<link rel="preload" as="image" fetchpriority="high" href="${escapeHtml(imageUrl.href)}"${lcpSrcSet ? ` imagesrcset="${escapeHtml(lcpSrcSet)}" imagesizes="${lcpSizes}"` : ""}>`;
    }
  } catch {
    // Invalid or non-HTTPS image URLs do not become browser preloads.
  }
  const head = `<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<meta name="robots" content="index, follow">
<link rel="canonical" href="${escapeHtml(url)}">
<link rel="icon" href="${escapeHtml(site.faviconUrl)}">
<link rel="apple-touch-icon" href="${escapeHtml(site.faviconUrl)}">
<meta property="og:site_name" content="${escapeHtml(site.brandName)}">
<meta property="og:type" content="${data ? "product" : "website"}">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${escapeHtml(url)}">
<meta property="og:image" content="${escapeHtml(image)}">
<meta property="og:image:secure_url" content="${escapeHtml(image)}">
<meta property="og:image:alt" content="${escapeHtml(title)}">
${defaultShareDimensions}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
<meta name="twitter:image" content="${escapeHtml(image)}">
<meta name="twitter:image:alt" content="${escapeHtml(title)}">
${imagePreload}
<script id="${data ? "route-product-jsonld" : "site-jsonld"}" type="application/ld+json">${json(schema)}</script>`;
  const details = (p) => `<p>Colores: ${escapeHtml(p.colors.join(", ") || "Consulta el producto")}. Tallas: ${escapeHtml(p.sizes.join(", ") || "Consulta el producto")}.</p><p>${escapeHtml(new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" }).format(p.price))} · ${p.inStock ? "Disponible" : "Agotado"}</p>`;
  const relatedProducts = data ? [...new Map(publicProducts
    .map((entry) => getProductSeo(entry, origin, site.brandName))
    .filter((entry) => entry.url !== data.url)
    .map((entry) => [entry.url, entry])).values()].slice(0, 4) : [];
  const relatedProductsMarkup = relatedProducts.length
    ? `<section aria-labelledby="productos-relacionados"><h2 id="productos-relacionados">También puedes explorar</h2><ul>${relatedProducts.map((entry) => `<li><a href="${escapeHtml(entry.url)}">${escapeHtml(entry.name)}</a></li>`).join("")}</ul></section>`
    : "";
  const publicFooter = `<footer><h2>Ayuda y contacto</h2><p>Consulta tallas, colores, disponibilidad, entrega o el estado de tu pedido mediante los canales publicados en la tienda.</p><nav aria-label="Información de la tienda"><a href="/#contacto">Contacto</a> · <a href="/legal/cambios">Política de cambios</a> · <a href="/legal/privacidad">Política de privacidad</a> · <a href="/legal/terminos">Términos de compra</a> · <a href="/legal/cookies">Uso de cookies</a></nav></footer>`;
  const legalBody = legalDocument
    ? `<main id="main-content" class="container public-product-preview"><nav aria-label="Navegación"><a href="/">${escapeHtml(site.brandName)} · Volver al catálogo</a></nav><article><h1>${escapeHtml(legalDocument.title)}</h1><p>${escapeHtml(legalDocument.description)}</p>${legalDocument.paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("")}<p>Última actualización: 23 de septiembre de 2026.</p></article>${publicFooter}</main>`
    : "";
  const body = legalBody || (data
    ? `<main id="main-content" class="container public-product-preview"><nav aria-label="Navegación"><a href="/">${escapeHtml(site.brandName)} · Volver al catálogo</a></nav><h1>${escapeHtml(data.name)}</h1>${data.images[0] ? `<img src="${escapeHtml(data.images[0])}"${lcpSrcSet ? ` srcset="${escapeHtml(lcpSrcSet)}" sizes="${lcpSizes}"` : ""} alt="${escapeHtml(data.name)}" width="480" height="600" fetchpriority="high" decoding="async">` : ""}<p>${escapeHtml(productSummary)}</p>${details(data)}<p>Activa JavaScript para elegir una variante y comprar desde la web.</p><a href="/">Ver más productos</a>${relatedProductsMarkup}${publicFooter}</main>`
    : `<main id="main-content" class="container public-product-preview"><h1>${escapeHtml(site.brandName)}</h1><p>${escapeHtml(site.description)}</p><section aria-labelledby="catalogo-seo"><h2 id="catalogo-seo">Catálogo de ropa</h2>${publicProducts.length ? `<ul>${publicProducts.map((p) => { const item = getProductSeo(p, origin, site.brandName); return `<li><h3><a href="${escapeHtml(item.url)}">${escapeHtml(item.name)}</a></h3>${details(item)}</li>`; }).join("")}</ul>` : "<p>No hay productos publicados por el momento.</p>"}</section><section><h2>Compra con información clara</h2><p>Explora cada modelo, revisa las fotografías disponibles y compara colores, tallas y existencias antes de elegir. El inventario se valida por variante durante el proceso de compra para evitar confirmar prendas que ya no están disponibles.</p><p>Puedes seleccionar retiro o entrega según las opciones activas. Antes de enviar el pedido verás las prendas, cantidades y total. Si pagas por transferencia, adjunta únicamente el comprobante necesario; la tienda no solicita claves bancarias ni datos completos de tarjeta.</p><p>Los pedidos reciben un código único para consultar su estado. Si necesitas ayuda para elegir, confirmar medidas o conocer la entrega, utiliza los canales de contacto publicados. También puedes revisar las políticas de cambios, privacidad, términos y cookies antes de comprar.</p></section><p>Activa JavaScript para filtrar el catálogo, elegir variantes y comprar.</p>${publicFooter}</main>`);
  const shell = template || '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"></head><body><div id="root"></div></body></html>';
  // Only process our bounded build template, never arbitrary user HTML.
  return shell.replace(/<title>[\s\S]*?<\/title>/g, "")
    .replace(/<meta\b[^>]*(?:name="(?:description|robots|twitter:[^"]+)"|property="og:[^"]+")[^>]*>/g, "")
    .replace(/<link\b[^>]*rel="canonical"[^>]*>/g, "")
    .replace(/<link\b[^>]*rel="(?:icon|shortcut icon|apple-touch-icon|apple-touch-icon-precomposed)"[^>]*>/g, "")
    .replace(/<script\b[^>]*type="application\/ld\+json"[^>]*>[\s\S]*?<\/script>/g, "")
    .replace(/<noscript>[\s\S]*?<\/noscript>/g, "")
    .replace("</head>", `${head}</head>`)
    .replace('<div id="root"></div>', `<div id="root">${body}</div>`);
}
