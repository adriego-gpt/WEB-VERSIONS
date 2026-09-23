# Posicionamiento de Adriego en buscadores e IA

## Base técnica aplicada, pendiente de publicación

- La portada y cada producto publicado entregan HTML legible con enlaces reales y la aplicación compilada. Visitantes y rastreadores reciben el mismo contenido público; no se depende de una lista de bots reconocidos.
- Las fichas incluyen descripción, colores, tallas, precio y disponibilidad. La oferta activa se calcula con la misma lógica para HTML y JSON-LD; el frontend reutiliza esos datos de SEO.
- Canonical y sitemap siguen `PUBLIC_SITE_URL`. `/sitemap.xml` es un índice que separa `/sitemap-pages.xml` y `/sitemap-products.xml`, lo que permite revisar cada grupo por separado en Search Console. Solo contiene la portada y productos públicos.
- Cada producto nuevo o editado conserva `createdAt` y actualiza `updatedAt`. El sitemap de productos publica `lastmod` únicamente cuando existe una fecha real, además de las imágenes y su título; no inventa fechas para productos antiguos.
- Las áreas privadas no se promueven en buscadores. Robots no reemplaza autenticación: las APIs administrativas mantienen su control de acceso.
- No se añadieron puntuaciones de reseñas, GTIN, fabricante, tiempos de entrega ni políticas inventadas para obtener resultados enriquecidos.

Esto facilita el descubrimiento, pero no garantiza indexación, posición ni aparición en respuestas de IA. Google recomienda los fundamentos habituales de SEO y no requiere archivos especiales para AI Overviews o AI Mode. [Google Search Central](https://developers.google.com/search/docs/appearance/ai-features).

## Orden recomendado

1. **Publicar y fijar un dominio principal.** Cuando compres y valides `adriego.shop`, actualiza la URL pública y redirige las variantes al mismo origen. No cambiar el dominio repetidamente. Seguir la guía de publicación sin modificar claves de almacenamiento.
2. **Verificar Google Search Console y Bing Webmaster Tools.** Enviar una sola vez `https://www.adriego.shop/sitemap.xml`; Google descubrirá desde ese índice los mapas de páginas y productos. Inspeccionar la portada y una ficha pública, probar la URL publicada y solicitar indexación solo después de confirmar estado `200`, canonical propio y contenido visible. Revisar por separado los dos mapas en el informe de indexación. No se crearon cuentas ni se enviaron URLs en esta revisión. [Crear y enviar sitemaps](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap), [Inspección de URLs](https://support.google.com/webmasters/answer/9012289?hl=es), [Bing y sitemaps](https://blogs.bing.com/webmaster/July-2025/Keeping-Content-Discoverable-with-Sitemaps-in-AI-Powered-Search).
3. **Mejorar el contenido real de las fichas.** Nombre de prenda y modelo; tipo de tejido y composición confirmados, medidas en centímetros, ajuste, cuidado, colores, tallas y fotos frontal/perfil/posterior. Evitar descripciones repetidas, texto generado sin verificar y listas de palabras clave. No editar el slug de un producto ya indexado sin conservar su URL o redirigirla.
4. **Publicar información de confianza fácil de encontrar.** Guía de tallas, entregas, retiro, cambios y devoluciones, identidad y contacto reales. Como próxima mejora, convertir la información importante de los modales legales en páginas públicas enlazables; revisar primero el texto y las condiciones reales del negocio.
5. **Configurar Google Merchant Center.** Evaluar fichas gratuitas según elegibilidad del negocio y país, comprobar y reclamar el dominio y aportar productos con fotos, precios y disponibilidad coherentes. Después preparar un feed mantenido o una integración, sin prometer aceptación automática. [Fichas gratuitas](https://support.google.com/merchants/answer/13889434?hl=en), [datos de Product](https://developers.google.com/search/docs/appearance/structured-data/product).
6. **Medir experiencia y resultados después de publicar.** PageSpeed Insights/Core Web Vitals con datos reales y Search Console para saber qué consultas llevan clientes y qué fichas se indexan. No atribuir puntuaciones Lighthouse a esta revisión: no se ejecutó esa herramienta.

## Auditoría técnica repetible

Squirrelscan está instalado como dependencia de desarrollo. Después de publicar, ejecutar:

```bash
npm run audit:site
npm run audit:site:full
```

El primer comando revisa rápidamente la portada y las señales globales; el segundo recorre el sitio. El auditor comprueba SEO, sitemap, accesibilidad, rendimiento, seguridad, contenido y datos estructurados. Es una ayuda de control de calidad; Search Console sigue siendo la fuente para saber qué URLs conoce o indexa Google.

## Aparición en asistentes de IA

- Mantener accesibles las páginas públicas, su contenido textual y las fichas coherentes; no hacer públicas cuentas, pedidos, fotos privadas ni datos administrativos.
- Para ChatGPT Search, no bloquear `OAI-SearchBot` en robots ni en la infraestructura. Su función es distinta de `GPTBot`, asociado al entrenamiento; permitir búsqueda no obliga a permitir entrenamiento. El wildcard actual permite rastrear las páginas públicas. No se cambiaron las preferencias de entrenamiento ni reglas de firewall externas. [Documentación oficial de los rastreadores de OpenAI](https://developers.openai.com/api/docs/bots).
- No empezar pagando por un supuesto “SEO para IA” ni tratar `llms.txt` como garantía de visibilidad. Para las funciones de IA de Google no es obligatorio ningún archivo de ese tipo. La prioridad es que la tienda sea indexable, útil y fiable.
- Una mención o cita depende de cada sistema y consulta. Medir visitas y ventas, no prometer “primer lugar en todas las IA”.
