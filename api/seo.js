import { readStore } from './_lib/store.js';

function slugify(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export default async function handler(req, res) {
  const { action, path = '/' } = req.query;

  if (action === 'sitemap') {
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');

    const today = new Date().toISOString().split('T')[0];
    let sitemapContent = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://adriego.com/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>`;

    try {
      const storeData = await readStore();
      const products = storeData?.products || [];

      for (const p of products) {
        if (p.name && !p.hidden && !p.deleted) {
          const slug = slugify(p.name);
          sitemapContent += `
  <url>
    <loc>https://adriego.com/producto/${slug}</loc>
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
  <meta property="og:locale" content="es_CO">
  <meta name="robots" content="index, follow">
</head>
<body>
  <h1>Adriego Store</h1>
  <script>window.location.replace(window.location.href.replace('/api/seo?action=prerender&path=', '').replace('/api/seo?path=', ''));</script>
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
      const product = products.find(p => slugify(p.name) === productSlug);

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
  <script>window.location.replace(window.location.href.replace('/api/seo?action=prerender&path=', '').replace('/api/seo?path=', ''));</script>
</body>
</html>`);
      }

      // Determine product stock
      let hasStock = false;
      if (product.colors && Array.isArray(product.colors)) {
        for (const color of product.colors) {
          if (color.sizes && Array.isArray(color.sizes)) {
            for (const size of color.sizes) {
              if (size.stock > 0) {
                hasStock = true;
                break;
              }
            }
          }
          if (hasStock) break;
        }
      }
      const availability = hasStock ? 'InStock' : 'OutOfStock';

      // Get first image
      let firstImage = '';
      if (product.colors && Array.isArray(product.colors)) {
        for (const color of product.colors) {
          if (color.images && Array.isArray(color.images) && color.images.length > 0) {
            firstImage = color.images[0];
            break;
          }
        }
      }

      const currentPrice = (product.offerActive && product.discountPrice) ? product.discountPrice : product.price;
      const cleanDesc = (product.description || '').replace(/"/g, '&quot;');
      const cleanName = (product.name || '').replace(/"/g, '&quot;');

      const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>${cleanName} | Adriego Store</title>
  <meta name="description" content="Compra ${cleanName} en Adriego Store por $${currentPrice}. ${cleanDesc}. Pedidos directos por WhatsApp.">
  <link rel="canonical" href="https://adriego.com/producto/${productSlug}">
  <meta name="robots" content="index, follow">
  
  <meta property="og:type" content="product">
  <meta property="og:title" content="${cleanName} | Adriego Store">
  <meta property="og:description" content="Compra ${cleanName} en Adriego Store por $${currentPrice}. ${cleanDesc}. Pedidos directos por WhatsApp.">
  ${firstImage ? `<meta property="og:image" content="${firstImage}">` : ''}
  <meta property="og:url" content="https://adriego.com/producto/${productSlug}">
  <meta property="og:site_name" content="Adriego Store">
  <meta property="og:locale" content="es_CO">
  <meta property="product:price:amount" content="${currentPrice}">
  <meta property="product:price:currency" content="USD">
  
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${cleanName} | Adriego Store">
  <meta name="twitter:description" content="Compra ${cleanName} en Adriego Store por $${currentPrice}. ${cleanDesc}. Pedidos directos por WhatsApp.">
  ${firstImage ? `<meta name="twitter:image" content="${firstImage}">` : ''}
  
  <script type="application/ld+json">
  {
    "@context": "https://schema.org/",
    "@type": "Product",
    "name": "${cleanName}",
    ${firstImage ? `"image": "${firstImage}",` : ''}
    "description": "${cleanDesc}",
    "sku": "${product.id}",
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
  <script>window.location.replace(window.location.href.replace('/api/seo?action=prerender&path=', '').replace('/api/seo?path=', ''));</script>
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
  <script>window.location.replace(window.location.href.replace('/api/seo?action=prerender&path=', '').replace('/api/seo?path=', ''));</script>
</body>
</html>`);
}
