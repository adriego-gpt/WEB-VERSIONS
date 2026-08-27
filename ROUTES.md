# Especificación de Rutas, Navegación y SEO — Adriego Store

Este documento define la arquitectura técnica de rutas, metadatos SEO, datos estructurados (JSON-LD), gestión de errores, navegación de historial (`popstate`) y compatibilidad para **Adriego Store**.

---

## 1. Mapa de Rutas Objetivo

| Ruta | Tipo | Propósito | Indexabilidad | Canonical |
|---|---|---|:---:|---|
| `/` | Estática | Portada, Showcase destacado y Catálogo interactivo con filtros | `index, follow` | `https://adriego.com/` |
| `/producto/:slug` | Dinámica | Ficha dedicada de producto con selección de variantes y compra | `index, follow` | `https://adriego.com/producto/:slug` |
| `/cuenta/restablecer` | Funcional | Formulario seguro para restablecimiento de contraseña de cliente/admin | `noindex, nofollow` | Auto-referencia / Ninguno |
| `/*` (404) | Catch-all | Vista de error amigable cuando la URL o producto no existe | `noindex, nofollow` | Ninguno |

---

## 2. Especificación Técnica por Ruta

### 2.1. Portada y Catálogo (`/`)
- **Propósito:** Descubrimiento de prendas, banners de colección, filtros facetados y acceso a carrito/favoritos.
- **Metadatos SEO:**
  - **Title:** `Adriego Store | Moda y ropa exclusiva`
  - **Meta Description:** `Descubre Adriego Store. Tienda web moderna de moda y ropa con atención personalizada.`
  - **Open Graph:** `og:type=website`, `og:image=/favicon.svg`, `og:site_name=Adriego Store`.
  - **Twitter Card:** `twitter:card=summary`, `twitter:image=/favicon.svg`.
- **Datos Estructurados (JSON-LD):**
  ```json
  {
    "@context": "https://schema.org",
    "@type": "ClothingStore",
    "name": "Adriego Store",
    "url": "https://adriego.com/",
    "logo": "https://adriego.com/favicon.svg",
    "description": "Descubre Adriego Store. Tienda web moderna de moda y ropa con atención personalizada.",
    "priceRange": "$$",
    "currenciesAccepted": "USD"
  }
  ```

---

### 2.2. Ficha de Producto (`/producto/:slug`)
- **Propósito:** Detalle del producto indexable, optimizado para indexación en Google y previsualización al compartir en WhatsApp / redes.
- **Resolución de Datos:** Identificación del producto en el catálogo por `slug` (kebab-case del nombre o ID).
- **Metadatos SEO (Dinámicos por Producto):**
  - **Title:** `[Nombre del Producto] | Adriego Store`
  - **Meta Description:** `Compra [Nombre] en Adriego Store por $[Precio]. [Descripción corta]. Pedidos directos por WhatsApp.`
  - **Canonical:** `https://adriego.com/producto/:slug`
  - **Open Graph:**
    - `og:type=product`
    - `og:title=[Nombre del Producto] | Adriego Store`
    - `og:description=[Descripción del producto]`
    - `og:image=[URL de la imagen principal en alta resolución]`
    - `product:price:amount=[precio]`
    - `product:price:currency=USD`
    - `product:availability=[in stock | out of stock]`
  - **Twitter Card:**
    - `twitter:card=summary_large_image`
    - `twitter:title=[Nombre del Producto]`
    - `twitter:image=[URL de la imagen]`
- **Datos Estructurados JSON-LD (`schema.org/Product`):**
  ```json
  {
    "@context": "https://schema.org/",
    "@type": "Product",
    "name": "Camisa Lino Premium",
    "image": [
      "https://images.unsplash.com/photo-camisa-1"
    ],
    "description": "Camisa de lino corte moderno para clima cálido.",
    "sku": "prod_101",
    "offers": {
      "@type": "Offer",
      "url": "https://adriego.com/producto/camisa-lino-premium",
      "priceCurrency": "USD",
      "price": "45.00",
      "availability": "https://schema.org/InStock",
      "itemCondition": "https://schema.org/NewCondition"
    }
  }
  ```
- **Comportamiento ante Producto Inexistente:**
  - Si `:slug` no coincide con ningún producto activo/público, se renderiza la vista 404 de producto con CTA "Explorar colección" y sugerencia de productos destacados.

---

### 2.3. Restablecimiento de Contraseña (`/cuenta/restablecer`)
- **Propósito:** Flujo de cambio de contraseña cuando el usuario abre el enlace de recuperación.
- **Parámetros Requeridos:** `?email=...&resetToken=...` (o `?token=...`).
- **Metadatos:** `noindex, nofollow`, Title: `Restablecer Contraseña | Adriego Store`.
- **Validaciones:**
  - Si faltan parámetros: Muestra alerta amigable "Enlace incompleto" con botón para volver a solicitarlo.
  - Si el token expiró o ya fue utilizado: Mensaje de error descriptivo con opción de reintento.

---

### 2.4. Redirección Temporal de Compatibilidad (Legacy Reset Links)
- **Contexto:** Enlaces emitidos con anterioridad usan el formato `/?email=usuario%40test.local&resetToken=TOKEN123`.
- **Regla de Enrutamiento:**
  - Al montar la aplicación en `/`, si la URL contiene `resetToken` en los query params, el enrutador la normaliza mediante `history.replaceState` a `/cuenta/restablecer`, conserva el token solo en memoria para completar el cambio y lo elimina de la barra de direcciones.
  - Los enlaces de recuperación emitidos actualmente por la API ya usan `/cuenta/restablecer?email=...&resetToken=...`; los enlaces históricos de la raíz siguen siendo válidos.

---

### 2.5. Página 404 (Recurso No Encontrado)
- **Propósito:** Manejo visual de rutas inexistentes.
- **Diseño:** Mensaje amigable "Página no encontrada", barra de búsqueda de catálogo y acceso rápido a la portada.
- **Metadatos:** `noindex, nofollow`, Title: `Página no encontrada | Adriego Store`.

---

## 3. Jerarquía y Flujo de Navegación del Historial (Botón Atrás)

Para una experiencia nativa en móviles y desktop:

1. **Visor de Zoom de Imagen:**
   - Al abrir el zoom de imagen a pantalla completa dentro del modal de producto, se agrega un estado al historial (`#zoom`).
   - Pulsar el botón Atrás del navegador/móvil cierra únicamente el zoom y regresa a la ficha de producto.
2. **Ficha de Producto (Modal / Ruta `/producto/:slug`):**
   - Pulsar el botón Atrás desde la ficha de producto cierra el modal y regresa al catálogo general `/`.
3. **Flujo Completo de Navegación:**
   ```
   [Catálogo / Portada]  <── (Atrás) ──  [Ficha Producto]  <── (Atrás) ──  [Zoom Imagen Completo]
   ```

---

## 4. Riesgos Técnicos y Consideraciones Vercel / SPA

1. **Configuración de `rewrites` en `vercel.json`:**
   Obligatorio para que rutas como `/producto/:slug` y `/cuenta/restablecer` no retornen error 404 estático al refrescar la página en producción.
2. **Crawlers de Redes Sociales (WhatsApp, Facebook, Twitter):**
   Los crawlers no ejecutan JavaScript del cliente; para que las previsualizaciones de productos en WhatsApp muestren la imagen y título dinámicos correspondientes, se recomienda una Serverless Edge Function que intercepte el `User-Agent` de los bots y sirva las etiquetas Open Graph pre-renderizadas.
