# Revisión de Adriego Store — 5 de septiembre de 2026

## Resultado y alcance

Se revisaron las incorporaciones de importación de fotos, vistas del producto, borradores, CSV y ventas físicas mediante Telegram. Se encontraron fallos reales y se corrigieron en el proyecto local. Los controles ejecutados no detectaron regresiones en los flujos cubiertos. Esto no equivale a certificar toda la tienda ni todos los dispositivos.

Se abrió https://adriego.vercel.app y se comprobó la carga del catálogo y su estructura accesible. La tienda publicada y el código local son versiones distintas. No se realizó una compra real, una carga real a ImageKit, un envío real por Telegram ni una sesión manual autenticada de administración. La evaluación visual móvil utiliza las capturas aportadas y la revisión del código; no es una prueba nueva en un teléfono físico.

## Fallos corregidos

| Prioridad | Hallazgo | Corrección |
|---|---|---|
| Crítica | El webhook comprobaba el ID del administrador recibido en el cuerpo, pero no autenticaba el origen de la petición. | Exige `TELEGRAM_WEBHOOK_SECRET` mediante la cabecera de Telegram y comparación segura. Rechaza peticiones sin autenticación. |
| Alta | La repetición de una entrega de Telegram podía descontar otra vez la misma venta. Repetir el comando de deshacer podía alcanzar una venta anterior. | Control persistente por chat y número de mensaje, dentro de la actualización del almacén. Las ediciones de mensajes no ejecutan ventas. |
| Alta | El servidor omitía `imageViewsByColor`; las vistas podían desaparecer al guardar o volver a descargar el catálogo. | El saneamiento del servidor conserva únicamente vistas reconocidas, asociadas a sus imágenes. |
| Media | Quitar imágenes vacías, añadir fotos o migrarlas podía desalinear o borrar etiquetas. | Se conservan las asociaciones de imagen/vista y se limpian etiquetas cuando se reemplaza una URL. |
| Media | Exportar/importar CSV no transportaba explícitamente las vistas. | Nueva columna `imagenes_vistas`; los CSV antiguos conservan etiquetas existentes cuando coinciden las URLs. |
| Media | Una excepción durante la importación podía dejar el botón bloqueado. | Liberación del estado de carga con `finally` y mensaje recuperable. |
| Media | Se recortaban fotos excedentes sin advertencia antes de importarlas. | Validación de límites antes de comenzar la subida. |
| Media | El stock por talla podía quedar desactualizado después de una venta física. | Recalcular el resumen al vender y deshacer. |
| Media | Búsquedas o ventas con palabras como “stock” o “ventas” podían entrar en otra opción del menú. | Coincidencias explícitas para las opciones generales. |
| Media | La detección de cambios del borrador omitía SKU y vistas. | Incluidos ambos datos en su firma. |

También se evita descontar una venta por nombre cuando existen varios productos con ese mismo nombre. El mensaje de error todavía puede mejorarse para explicar esa ambigüedad al administrador.

### Requisito antes del próximo despliegue

Configurar el mismo secreto en `TELEGRAM_WEBHOOK_SECRET` de Vercel y en `secret_token` de la configuración `setWebhook` de Telegram. Mientras falte esa configuración coordinada, el webhook conserva compatibilidad con el bot actual; cuando el secreto exista, rechazará las peticiones que no lo presenten. La protección no debe considerarse activa en producción todavía.

## Validaciones

- Suite unitaria existente: 192 pruebas aprobadas.
- Suite E2E/API ampliada: 18 pruebas aprobadas, incluidos tres escenarios de regresión del inventario.
- Casos nuevos: petición no autenticada, venta repetida en paralelo, mensaje editado, stock insuficiente, búsqueda por nombre, botón de deshacer repetido, comando de deshacer repetido, versiones de sincronización, persistencia de vistas y recorrido CSV.
- Compilación de producción: correcta.
- ESLint general: cero errores y 218 advertencias en esa ejecución. Comprobación adicional de los últimos archivos modificados: cero errores. Las advertencias son señales para revisar, no 218 vulnerabilidades confirmadas.
- Las pruebas denominadas E2E del proyecto invocan APIs con datos y servicios simulados; no sustituyen recorridos visuales completos de navegador.

## Calificación orientativa

Valoración profesional basada en lo observado, sin analítica de conversión ni sesiones con clientes. El margen representa puntos de una rúbrica de experiencia, no un porcentaje prometido de aumento de ventas.

| Área | Nota actual orientativa | Objetivo razonable | Margen |
|---|---:|---:|---:|
| Experiencia del cliente | 7,5/10 | 8,5–9/10 | +1 a +1,5 puntos |
| Experiencia de administración | 6,5/10 | 8–8,5/10 | +1,5 a +2 puntos |

No asigno una nota de seguridad global: una revisión acotada y pruebas aprobadas no justifican esa certificación.

## Clientes: fortalezas

La identidad visual, las fotografías grandes y la jerarquía de precio/producto forman una base atractiva. Los colores incluyen nombres y muestras, y las tallas muestran selección y agotados. Existen búsqueda, filtros, favoritos, carrito y consulta de pedidos: son capacidades ya presentes, no propuestas nuevas.

La confirmación de añadido al carrito está dentro del detalle y ofrece acceso al carrito. El proyecto contempla reducción de movimiento, foco en modales y navegación de imágenes. La coordinación por WhatsApp encaja con la operación física del negocio.

## Clientes: mejoras por prioridad

1. **Alta — Confianza en la información.** La estrella admite una calificación escrita en administración y valores de respaldo. Sin reseñas verificables no debería parecer una puntuación de compradores. Ocultarla hasta tener reseñas reales es preferible a mostrar una valoración sin contexto.
2. **Alta — Promesas de entrega coherentes.** La página publicada habla de “despacho inmediato”, mientras la operación necesita coordinar horario. Unificar textos y explicar cuándo se confirma envío, horario y coste. “Garantía oficial” también necesita una política concreta que la respalde.
3. **Media — Ficha útil y breve.** Priorizar materiales, corte, abrigo, forro, bolsillos y cuidados cuando se conozcan. Para las fotos generadas, conservar fidelidad de color y forma y considerar una foto de detalle real. No añadir una guía de tallas, conforme a tu preferencia.
4. **Media — Menos información sobre la foto.** Mantener una sola etiqueta relevante en las tarjetas móviles. Evitar que descuento, Nuevo, Destacado y favoritos compitan con la prenda. Las capturas anteriores mostraban este problema; hay que confirmar el resultado final en un móvil real.
5. **Media — Llegar rápido a la compra.** Reducir texto auxiliar repetitivo antes de elegir variantes y agregar. La nota de galería actual informa sobre las vistas, pero puede situarse junto a la galería si las pruebas con clientes muestran que alarga demasiado la ficha.
6. **Media — Movimiento discreto.** Usar transiciones cortas para selección y confirmación, sin bloquear botones. Sonidos desactivados por defecto y opcionales; reservar sonidos para eventos útiles, especialmente en administración.

## Administración: fortalezas

Ya hay edición por secciones, borradores recuperables, variantes, importación/exportación CSV, ofertas, pedidos, avisos de stock bajo y sincronización por versiones. La organización desde nombres de fotos reduce tareas repetitivas y coincide con tu forma de trabajar.

## Administración: mejoras por prioridad

1. **Completado localmente — Flujo guiado de Telegram.** La venta física ya permite buscar una prenda y elegir producto, color, talla, cantidad y confirmación mediante botones. Conserva los comandos como respaldo, ofrece deshacer y evita procesar dos veces la misma confirmación.
2. **Parcialmente completado — Historial visible de movimientos.** Inventario ya muestra hasta 12 movimientos recientes sincronizados, incluidas las ventas físicas de Telegram, ajustes manuales y ventas deshechas. El servidor conserva los últimos 80. Aún falta un historial completo con filtros, responsable identificable y exportación.
3. **Parcialmente completado — Reposición para comprar al proveedor.** El bot ya genera una lista actualizable de variantes agotadas o con dos unidades o menos. Aún falta marcar artículos, introducir la cantidad a comprar y exportar o compartir la lista.
4. **Media — Corregir fotos antes de publicar.** La importación agrupa y ordena, pero faltan controles cómodos para corregir vista, renombrar grupos y mover fotos. Los nombres con colores compuestos separados por guiones pueden resultar ambiguos; la revisión debe dejar corregirlos.
5. **Media — Checklist de publicación completo.** El indicador del editor comprueba nombre, precio, fotografía y variante. Debería reflejar los campos acordados, incluidas descripción y categoría, y avisar de colores incompletos. Un producto agotado debe poder mantenerse en catálogo según la política elegida; stock cero no siempre es un error.
6. **Media — Delegación y recuperación.** Permisos por tarea, registro de responsable y copias con restauración comprobada antes de incorporar más personas.
7. **Media — Mantenimiento y rendimiento.** El código central y los estilos siguen siendo grandes. Separar responsabilidades y medir carga en una red móvil lenta antes de añadir más animaciones. No se midieron Core Web Vitals en esta revisión.

## Cómo medir la mejora

Con cinco personas del público objetivo, comprobar si pueden encontrar una prenda, elegir color/talla, agregarla y entender cómo finalizar. Registrar tiempo, errores y dudas. Como administrador, medir cuánto tardas en subir un producto y registrar una venta física. Comparar esos resultados después de cada cambio, junto con abandonos del carrito y consultas repetidas por WhatsApp.

Orden recomendado: configurar y verificar el webhook al publicar; hacer visible el historial y completar la reposición; perfeccionar información y confianza de la ficha; después pulir animaciones. Criterios de interfaz consultados: https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md.
