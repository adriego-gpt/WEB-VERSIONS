# Contrato de Eventos Analíticos y Telemetría — Adriego Store

Este documento define el catálogo de eventos de negocio para medir la conversión, interacción con el catálogo y cierre de pedidos en **Adriego Store**, bajo una estricta política de **Cero Datos Personales (Zero-PII)**.

---

## 1. Principios de Privacidad y Gobernanza

1. **Zero-PII (Sin Información de Identificación Personal):**
   - **Prohibido:** Nombres, apellidos, direcciones físicas, números de teléfono, correos electrónicos, identificaciones fiscales o números de guía.
   - **Permitido:** IDs anónimos o públicos (ID de producto, ID de orden alfanumérico, slug, código de cupón genérico, categorías, métricas numéricas y timestamps).
2. **Nomenclatura Estándar:** Formato `snake_case` para nombres de eventos y propiedades.
3. **Manejo de Errores Silencioso:** El fallo en el envío de un evento de telemetría nunca debe interrumpir el flujo de compra del usuario.

---

## 2. Catálogo de Eventos

### 2.1. `catalog_search`
Se dispara cuando el usuario ejecuta una búsqueda en el catálogo o aplica filtros de exploración.

- **Trigger:** Escritura con debounce (>400ms) en la barra de búsqueda o cambio en selector de categoría / filtros.
- **Payload Schema:**
  ```json
  {
    "event": "catalog_search",
    "query_term": "lino",
    "category": "Hombre",
    "results_count": 4,
    "has_discount_filter": false
  }
  ```

---

### 2.2. `product_opened`
Se dispara cuando el usuario abre la vista de detalle de un producto (sea mediante modal o navegación a `/producto/:slug`).

- **Trigger:** Clic en tarjeta de producto o carga de página de detalle.
- **Payload Schema:**
  ```json
  {
    "event": "product_opened",
    "product_id": "prod_101",
    "slug": "camisa-lino-oversize",
    "category": "Camisas",
    "price": 45.00,
    "has_offer": true,
    "discount_percentage": 15,
    "source": "catalog_grid" // Valores: "showcase", "catalog_grid", "recommendations", "favorites", "direct_url"
  }
  ```

---

### 2.3. `cart_item_added`
Se dispara cuando el usuario agrega una prenda al carrito tras seleccionar talla y color.

- **Trigger:** Clic en "Añadir al carrito" con variantes válidas.
- **Payload Schema:**
  ```json
  {
    "event": "cart_item_added",
    "product_id": "prod_101",
    "variant_size": "M",
    "variant_color": "Blanco",
    "unit_price": 45.00,
    "quantity": 1
  }
  ```

---

### 2.4. `checkout_started`
Se dispara cuando el usuario abre el resumen del carrito e inicia el formulario de confirmación.

- **Trigger:** Clic en "Continuar pedido" o "Iniciar compra" en el modal de carrito.
- **Payload Schema:**
  ```json
  {
    "event": "checkout_started",
    "subtotal": 90.00,
    "item_count": 2,
    "unique_products": 2,
    "coupon_applied": "PROMO10",
    "delivery_type_selected": "delivery" // Valores: "delivery", "pickup"
  }
  ```

---

### 2.5. `order_created`
Se dispara cuando el backend confirma con éxito la creación de la orden en el servidor y retorna el registro con ID.

- **Trigger:** Respuesta `200 OK` del endpoint `/api/checkout-order`.
- **Payload Schema:**
  ```json
  {
    "event": "order_created",
    "order_id": "ORDER-10001",
    "total": 81.00,
    "discount_amount": 9.00,
    "item_count": 2,
    "delivery_type": "delivery",
    "coupon_used": true
  }
  ```

---

### 2.6. `whatsapp_opened`
Se dispara cuando el usuario hace clic en el botón principal para abrir WhatsApp (`wa.me`) con el mensaje preformateado de su orden.

- **Trigger:** Clic en el botón verde "Enviar pedido por WhatsApp" o botón de reapertura.
- **Payload Schema:**
  ```json
  {
    "event": "whatsapp_opened",
    "order_id": "ORDER-10001",
    "total": 81.00,
    "device_type": "mobile", // Valores: "mobile", "desktop"
    "is_reopen": false
  }
  ```

---

## 3. Matriz de Propiedades

| Evento | Propiedades Obligatorias | Propiedades Opcionales |
|---|---|---|
| `catalog_search` | `results_count` | `query_term`, `category`, `has_discount_filter` |
| `product_opened` | `product_id`, `price`, `source` | `slug`, `category`, `has_offer`, `discount_percentage` |
| `cart_item_added` | `product_id`, `unit_price`, `quantity` | `variant_size`, `variant_color` |
| `checkout_started` | `subtotal`, `item_count` | `coupon_applied`, `delivery_type_selected` |
| `order_created` | `order_id`, `total`, `item_count`, `delivery_type` | `discount_amount`, `coupon_used` |
| `whatsapp_opened` | `order_id`, `total`, `device_type` | `is_reopen` |

---

## 4. Implementación Técnica Sugerida

Para mantener desacoplada la analítica de la UI, se recomienda implementar un hook o helper ligero (`src/utils/analytics.js`):

```javascript
export function trackEvent(eventName, payload = {}) {
  try {
    // 1. Envío a dataLayer (GTM / GA4) si existe
    if (typeof window !== 'undefined' && Array.isArray(window.dataLayer)) {
      window.dataLayer.push({ event: eventName, ...payload });
    }
    // 2. Logging en desarrollo
    if (import.meta.env.DEV) {
      console.log(`[Analytics] ${eventName}:`, payload);
    }
  } catch (err) {
    // Fallo silencioso garantizado
  }
}
```
