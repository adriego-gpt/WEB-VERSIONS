import { readStore } from './_lib/store.js';
import {
  consumeRateLimit,
  getClientIp,
  monitorApiRequest,
  normalizeLine,
  setCommonSecurityHeaders,
} from './_lib/security.js';

const PUBLIC_SITE_ORIGIN = 'https://adriego.vercel.app';
const ENDPOINT_NAME = 'seo';

function slugify(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function getProductSlug(product = {}) {
  return slugify(product.slug || product.name || product.id || '');
}

function escapeJson(value = '') {
  return JSON.stringify(String(value || ''))
    .slice(1, -1)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

function escapeHtml(value = '') {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export default async function handler(req, res) {
  monitorApiRequest(req, res, ENDPOINT_NAME);
  setCommonSecurityHeaders(res);

  const method = String(req.method || 'GET').toUpperCase();
  if (!['GET', 'HEAD'].includes(method)) {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).send('Method not allowed');
  }

  const clientIp = getClientIp(req);
  const rateLimit = await consumeRateLimit('seo-ip', clientIp, 240, 10 * 60 * 1000, {
    endpoint: ENDPOINT_NAME,
    ip: clientIp,
  });
  if (!rateLimit.ok) {
    res.setHeader('Retry-After', String(Math.ceil(rateLimit.retryAfterMs / 1000)));
    return res.status(429).send('Too many requests');
  }

  const action = normalizeLine(req.query?.action || '').toLowerCase();
  const path = normalizeLine(req.query?.path || '/').slice(0, 240);

  if (action === 'sitemap') {
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');

    const today = new Date().toISOString().split('T')[0];
    let sitemapContent = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${PUBLIC_SITE_ORIGIN}/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>`;

    try {
      const storeData = await readStore();
      const products = storeData?.products || [];

      for (const p of products) {
        if (p.name && p.isPublic !== false) {
          const slug = getProductSlug(p);
          sitemapContent += `
  <url>
    <loc>${PUBLIC_SITE_ORIGIN}/producto/${slug}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`;
        }
      }
    } catch (error) {
      console.error('Error generating sitemap:', error);
    }

    sitemapContent += `\n</urlset>`;
    return res.status(200).send(sitemapContent);
  }

  // Handle Prerender Actions
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');

  if (path === '/') {
    // Default OG tags for home page
    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>Adriego Store</title>
  <meta name="description" content="Bienvenido a Adriego Store.">
  <meta property="og:type" content="website">
  <meta property="og:title" content="Adriego Store">
  <meta property="og:description" content="Bienvenido a Adriego Store.">
  <meta property="og:site_name" content="Adriego Store">
  <meta property="og:locale" content="es_EC">
  <meta name="robots" content="index, follow">
</head>
<body>
  <h1>Adriego Store</h1>
</body>
</html>`;
    return res.status(200).send(html);
  }

  if (path.startsWith('/producto/')) {
    const slugParts = path.split('/');
    const productSlug = slugParts[slugParts.length - 1];

    try {
      const storeData = await readStore();
      const products = storeData.products || [];
      const product = products.find(p => getProductSlug(p) === productSlug);

      if (!product) {
        return res.status(404).send(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>Página no encontrada | Adriego Store</title>
  <meta property="og:title" content="Página no encontrada | Adriego Store">
</head>
<body>
  <h1>404 - Página no encontrada</h1>
</body>
</html>`);
      }

      // Determine product stock
      let hasStock = false;
      if (Array.isArray(product.variants) && product.variants.length > 0) {
        hasStock = product.variants.some((v) => Number(v?.stock) > 0);
      } else if (product.stockBySize && typeof product.stockBySize === 'object') {
        hasStock = Object.values(product.stockBySize).some((st) => Number(st) > 0);
      }
      const availability = hasStock ? 'InStock' : 'OutOfStock';

      // Get first image
      let firstImage = '';
      const catalogColor = product.catalogColor || (Array.isArray(product.colors) ? product.colors[0] : '');
      if (product.imagesByColor && typeof product.imagesByColor === 'object') {
        firstImage = (catalogColor && product.imagesByColor[catalogColor]?.[0])
          || Object.values(product.imagesByColor).flat().find(Boolean)
          || '';
      }
      if (!firstImage && product.image) {
        firstImage = product.image;
      }

      const currentPrice = Number(product.price != null ? product.price : product.basePrice) || 0;
      const cleanDesc = escapeHtml(product.description || '');
      const cleanName = escapeHtml(product.name || '');
      const cleanImage = escapeHtml(firstImage);
      const jsonName = escapeJson(product.name || '');
      const jsonDesc = escapeJson(product.description || '');
      const jsonImage = escapeJson(firstImage);
      const jsonSku = escapeJson(product.sku || product.id || '');

      const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>${cleanName} | Adriego Store</title>
  <meta name="description" content="Compra ${cleanName} en Adriego Store por $${currentPrice}. ${cleanDesc}. Pedidos directos por WhatsApp.">
  <link rel="canonical" href="${PUBLIC_SITE_ORIGIN}/producto/${productSlug}">
  <meta name="robots" content="index, follow">
  
  <meta property="og:type" content="product">
  <meta property="og:title" content="${cleanName} | Adriego Store">
  <meta property="og:description" content="Compra ${cleanName} en Adriego Store por $${currentPrice}. ${cleanDesc}. Pedidos directos por WhatsApp.">
  ${firstImage ? `<meta property="og:image" content="${cleanImage}">` : ''}
  <meta property="og:url" content="${PUBLIC_SITE_ORIGIN}/producto/${productSlug}">
  <meta property="og:site_name" content="Adriego Store">
  <meta property="og:locale" content="es_EC">
  <meta property="product:price:amount" content="${currentPrice}">
  <meta property="product:price:currency" content="USD">
  
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${cleanName} | Adriego Store">
  <meta name="twitter:description" content="Compra ${cleanName} en Adriego Store por $${currentPrice}. ${cleanDesc}. Pedidos directos por WhatsApp.">
  ${firstImage ? `<meta name="twitter:image" content="${cleanImage}">` : ''}
  
  <script type="application/ld+json">
  {
    "@context": "https://schema.org/",
    "@type": "Product",
    "name": "${jsonName}",
    ${firstImage ? `"image": "${jsonImage}",` : ''}
    "description": "${jsonDesc}",
    "sku": "${jsonSku}",
    "offers": {
      "@type": "Offer",
      "priceCurrency": "USD",
      "price": "${currentPrice}",
      "availability": "https://schema.org/${availability}"
    }
  }
  </script>
</head>
<body>
  <h1>${cleanName}</h1>
</body>
</html>`;

      return res.status(200).send(html);
    } catch (error) {
      console.error(error);
      return res.status(500).send('Error Interno');
    }
  }

  // Unknown paths
  return res.status(404).send(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>Página no encontrada | Adriego Store</title>
  <meta property="og:title" content="Página no encontrada | Adriego Store">
</head>
<body>
  <h1>404 - Página no encontrada</h1>
</body>
</html>`);
}
