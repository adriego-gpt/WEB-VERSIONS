# PRODUCT.md — Adriego Store

## 1. Visión y Propósito del Producto
**Adriego Store** es una tienda web moderna de moda y ropa diseñada para ofrecer una experiencia de compra fluida, atractiva y confiable. El modelo comercial se basa en la selección y personalización de pedidos en la plataforma web, con un **cierre y confirmación final de la orden a través de WhatsApp**, eliminando la fricción de pasarelas de pago tradicionales y ofreciendo atención personalizada directa.

---

## 2. Modelo de Negocio y Flujo de Compra

### 2.1. Navegación y Catálogo
- **Exploración:** El usuario puede navegar por categorías, filtrar por talla, color, precio y ofertas, así como buscar prendas en tiempo real.
- **Detalle de Producto:** Selección de variantes (tallas, colores), visualización de stock disponible en tiempo real, descuentos aplicados y galería de imágenes.
- **Favoritos (Wishlist):** Posibilidad de guardar prendas favoritas localmente y asociadas a la cuenta del usuario.

### 2.2. Carrito y Cupones
- **Carrito de compras:** Gestión de cantidades con validación estricta de stock disponible.
- **Cupones de descuento:** Aplicación de códigos promocionales (porcentaje o monto fijo) con validación de vigencia, uso máximo y montos mínimos de compra.

### 2.3. Checkout y Cierre por WhatsApp (Sin Pasarela Online)
- **Datos de Entrega:** Captura de nombre, teléfono, dirección de entrega/retiro, notas especiales y método de entrega.
- **Creación de Orden:** El backend genera un registro de pedido persistente con estado inicial `Pendiente de confirmación`.
- **Generación de Mensaje WhatsApp:** Se estructura un mensaje preformateado con el detalle exacto del pedido, número de orden, resumen de costos, cupones y datos de envío.
- **Redirección y Resiliencia:** Redirección a WhatsApp (`wa.me`) con pantalla de confirmación local, botón de reapertura manual y función de "Copiar resumen al portapapeles" en caso de fallos de enlace o uso en computadoras sin la app instalada.

---

## 3. Panel de Administración
- **Acceso Seguro:** Autenticación de administradores con credenciales seguras, tokens firmados y control de sesiones.
- **Gestión de Catálogo:** Creación, edición y eliminación de productos, variantes, precios, imágenes y control de inventario/stock.
- **Gestión de Pedidos:** Visualización del historial de pedidos, cambio de estados (`Pendiente`, `Confirmado`, `Enviado`, `Entregado`, `Cancelado`).
- **Gestión de Cupones:** Creación de promociones, reglas de descuento y límites de uso.
- **Control de Concurrencia:** Protección contra sobreescrituras simultáneas de catálogo mediante control de versiones (`catalogVersion`).

---

## 4. Criterios y Reglas del Negocio
1. **Sin pago en línea:** No se procesan tarjetas de crédito ni transferencias automáticas dentro de la app; todo acuerdo de pago se concreta vía WhatsApp.
2. **Integridad de Stock:** El stock debe descontarse de manera atómica al generar la orden para evitar sobreventa.
3. **Idempotencia:** Un doble clic o reintento de envío en checkout nunca debe generar pedidos duplicados ni descontar stock dos veces.
4. **Preservación de Sesión:** El carrito y las preferencias del usuario deben persistir de manera confiable.
