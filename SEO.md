# Estrategia de SEO, Metadatos y Datos Estructurados — Adriego Store

Este documento describe la arquitectura de SEO estático y dinámico, metadatos sociales y microformatos JSON-LD para **Adriego Store**.

---

## 1. Capa de SEO Estático Base

Configurada en `index.html` para la indexación óptima de la portada y la marca:

- **Título:** `Adriego Store | Moda y ropa exclusiva`
- **Meta Descripción:** `Descubre Adriego Store. Tienda web moderna de moda y ropa con atención personalizada.`
- **Directiva de Rastreo:** `<meta name="robots" content="index, follow" />`
- **Etiquetas Open Graph (Facebook, WhatsApp, LinkedIn):**
  - `og:type`: `website`
  - `og:title`: `Adriego Store | Moda y ropa exclusiva`
  - `og:description`: `Descubre Adriego Store. Tienda web moderna de moda y ropa con atención personalizada.`
  - `og:url`: `https://www.adriegostore.com/` *(marcador configurable)*
  - `og:image`: `https://www.adriegostore.com/favicon.svg`
  - `og:site_name`: `Adriego Store`
- **Twitter Cards:**
  - `twitter:card`: `summary`
  - `twitter:title`: `Adriego Store | Moda y ropa exclusiva`
  - `twitter:description`: `Descubre Adriego Store. Tienda web moderna de moda y ropa con atención personalizada.`
  - `twitter:image`: `https://www.adriegostore.com/favicon.svg`
- **Canonical URL:** `https://www.adriegostore.com/`
- **Datos Estructurados JSON-LD:** Bloque `schema.org/ClothingStore` con nombre, logo, descripción y divisas aceptadas (USD).

---

## 2. Archivos de Control de Rastreo

1. **`public/robots.txt`**:
   - Permite el rastreo universal de todas las páginas principales.
   - Bloquea consultas internas con parámetros (`Disallow: /*?*`) para evitar contenido duplicado generado por filtros y búsquedas.
   - Vincula directamente al sitemap XML.
2. **`public/sitemap.xml`**:
   - Contiene la URL raíz con frecuencia de actualización diaria.
   - Preparado para la adición de URLs dinámicas de productos (`/producto/:slug`).

---

## 3. Hoja de Ruta para SEO Dinámico por Rutas

En consonancia con `ROUTES.md`:

### 3.1. Fichas de Producto (`/producto/:slug`)
- **JSON-LD `Product`:** Schema enriquecido con nombre, imágenes, descripción, SKU y `offers` (`price`, `priceCurrency`, `availability`).
- **Open Graph Dinámico:** Etiquetas `og:image`, `og:title`, `product:price:amount` específicas de cada prenda.

### 3.2. Crawlers Sociales en Vercel
- Se recomienda implementar una Edge Function o Middleware en Vercel que detecte User-Agents como `WhatsApp/`, `facebookexternalhit/`, `Twitterbot` y responda con el HTML pre-renderizado que contenga las etiquetas Open Graph del producto antes de redirigir al bundle SPA.

### 3.3. Configuración Final de Producción
- Actualizar `https://www.adriegostore.com` con el dominio personalizado definitivo en Vercel en `index.html`, `robots.txt`, `sitemap.xml` y variables de entorno.
