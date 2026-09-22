# SEO e indexación — Adriego Store

La URL pública canónica es `https://www.adriego.shop`. El dominio raíz redirige a `www`, por lo que las etiquetas canonical, Open Graph, Twitter, JSON-LD, `robots.txt`, sitemap y enlaces de recuperación usan siempre ese origen.

## Páginas indexables

- `/`: portada y catálogo con HTML inicial rastreable, metadatos configurables desde el panel y datos estructurados de la tienda.
- `/producto/:slug`: ficha pública con título, descripción, imagen, canonical y JSON-LD `Product`/`Offer`, precio y disponibilidad reales.

Las áreas privadas o funcionales (`/admin`, `/cuenta`, `/carrito`, `/favoritos`, `/pedidos` y `/buscar`) responden con `X-Robots-Tag: noindex, nofollow`. Los productos ocultos y las rutas inexistentes no entran al sitemap y responden 404.

## Descubrimiento

- `/robots.txt` se genera desde el servidor y enlaza `https://www.adriego.shop/sitemap.xml`.
- `/sitemap.xml` se genera desde el catálogo publicado e incluye las imágenes HTTPS de cada producto. No inventa fechas `lastmod`.
- `llms.txt` identifica la tienda, el catálogo, el sitemap y las reglas de rastreo.
- IndexNow se notifica al guardar el catálogo en producción. La clave pública se valida mediante su archivo raíz y una caída del servicio nunca bloquea el guardado.

## Operación

Después de cambios importantes conviene inspeccionar la URL en Google Search Console y mantener enviado `https://www.adriego.shop/sitemap.xml`. Bing Webmaster Tools puede importar la propiedad de Search Console; IndexNow cubre las notificaciones posteriores compatibles.
