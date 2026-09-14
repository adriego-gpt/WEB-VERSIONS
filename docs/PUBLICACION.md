# Preparación de publicación — Adriego

## Estado

Última corrección del acceso al teclado (13 de septiembre de 2026): producción confirmada en `dpl_AXEpLddCgJJbqWKNUPmT5NZ7Ye83`. Las nuevas tarjetas inline se acompañan de un aviso silencioso «⌂ Menú de acciones» con el teclado inferior. Su ID se conserva por administrador en `meta.telegramMenuAnchors`; solo se elimina el aviso anterior después de enviar y recordar correctamente el nuevo, también tras un arranque en frío. Los callbacks siguen editando la tarjeta, sin nuevos avisos por cada toque. Las búsquedas y guías combinan el teclado con `force_reply` conforme a Bot API 10.3; no se intenta instalarlo mediante `editMessageText`. Se mantienen `one_time_keyboard: false`, `is_persistent: false` y un solo comando visible `/start`. Compilación correcta y 358 pruebas sin fallos en 60 archivos. Análisis de los cuatro archivos de servidor/pruebas revisados: cero errores y 33 advertencias existentes. No hubo cambios en pedidos o stock reales ni comprobación visual de este ajuste en un cliente Telegram real; la posición/visibilidad final del icono pertenece a la aplicación de Telegram.

Actualización posterior del menú Telegram: producción apunta ahora a `dpl_3xDDmNB9BCakSnwgdKjvf1wVcayi` (confirmado mediante `vercel inspect adriego.vercel.app`). El listado nativo muestra únicamente `/start` con la descripción «Abrir menú». Los doce comandos del manejador siguen disponibles en la ayuda y las acciones del teclado siguen funcionando. `is_persistent: false` permite ocultar y abrir el teclado con el icono nativo; `one_time_keyboard: false` evita perderlo al usar una acción. Enviar `/start` actualiza la configuración del chat existente. Telegram controla la posición y el aspecto del icono. La compilación y las 355 pruebas pasaron; no se inspeccionó visualmente este ajuste en un cliente Telegram real.

El 13 de septiembre de 2026 se activó en [producción](https://adriego.vercel.app) la versión `dpl_AP3HixTBVZaqqhZrFrE9UyjGCd4F`, después de verificar su compilación, 355 pruebas y las rutas remotas mediante `vercel curl`. `vercel inspect adriego.vercel.app` confirmó que la dirección pública resuelve a esta versión. Incluye las mejoras existentes y la restauración del teclado inferior de Telegram tanto desde `/start` y `/menu` como desde los botones «Inicio» de tarjetas antiguas. El catálogo remoto respondió correctamente con seis productos en `kv-rest`; el webhook rechazó GET con 405. No se modificaron pedidos ni stock de producción. No se compró ningún dominio ni se cambiaron permisos de Drive. La comprobación visual del menú en el chat real sigue pendiente: no había una sesión de Telegram accesible y Vercel no permite descargar los valores de sus variables sensibles. No se cambió el webhook real ni se enviaron mensajes de prueba a clientes.

## Comprobaciones de esta revisión

- 60 archivos de pruebas: 49 unitarios y 11 de integración; 355 pruebas correctas tras los ajustes de galería, recomendaciones, paginación, rendimiento, eliminación múltiple de pedidos y menús de Telegram. Compilación correcta. La nueva regresión comprueba que «Inicio» envía un teclado persistente en un solo mensaje, sin intentar instalarlo con `editMessageText`.
- Compilación de producción correcta.
- Análisis estático general de la pasada responsive: 0 errores y 272 advertencias que requieren interpretación, principalmente accesos dinámicos a objetos y rutas de archivos en pruebas. La revisión posterior de los tres archivos de servidor y la nueva prueba de pedidos Telegram pasa con 0 errores y 39 advertencias. No se ocultaron advertencias mediante desactivación global de reglas; no se certifica que todas sean falsos positivos.
- `npm audit fix --ignore-scripts`: actualizó Nodemailer a 9.1.1 y js-yaml a 4.3.2. El resultado posterior informa cero vulnerabilidades conocidas. Esto no garantiza ausencia de vulnerabilidades desconocidas. Referencias: [Nodemailer](https://github.com/advisories/GHSA-8m3c-c648-2xjj), [js-yaml](https://github.com/advisories/GHSA-2883-xcg3-v3hh).
- Revisión manual de patrones de secretos en código y configuración pública: no se encontraron coincidencias de alta confianza. No equivale a un escaneo exhaustivo del historial; no hay escáner de secretos dedicado instalado. Los archivos `.env`, `.env.local` y `.env.vercel` no están versionados.
- Navegador: catálogo de producción inspeccionado sin errores de consola ni imágenes rotas en la muestra revisada. Compra y administración verificadas en entorno local aislado, escritorio de 1280 px y móvil de 390 px, sin desbordamiento horizontal en las superficies comprobadas.
- Compra local sin cuenta, reserva de última unidad, comisión de tarjeta, código y total del pedido; aviso de WhatsApp restaurado al actualizar.
- Administración accesible con un aviso de compra pendiente; el aviso se conserva sin tapar la administración.
- Importación local de fotos y carpetas, con conservación de la selección y opción CSV secundaria. La integración de Drive se retiró a petición del propietario.
- No se midió Lighthouse ni squirrelscan: las herramientas no están disponibles. No se atribuye una puntuación ni certificación WCAG/ASVS. La revisión `impeccable` detectó un borde lateral existente en el estado de pedido: es una recomendación estética, no un fallo funcional, y se conservó.
- Verificación responsive de la compilación local con productos ficticios: PC 1280×900, tablet 820×1180 y móvil 390×844 y 320×740. Flechas estables, zoom al punto señalado, arrastre y reinicio; líneas de galería seleccionables; límite real de última unidad sin éxito falso; paginación conservada al recargar y recuperación del estado sin resultados. Se corrigieron textos de ventajas superpuestos en tablet y un exceso de anchura del bloque de compra en móvil. El detalle final mide 305/305 px (ancho/scrollWidth) a 320 px y 375/375 px a 390 px. Sin errores ni advertencias de consola en la muestra local revisada. Son tamaños de navegador, no pruebas en todos los dispositivos físicos.
- `npm audit --json`: cero vulnerabilidades conocidas en 186 dependencias informadas, incluidas herramientas de desarrollo. La guía `sca-audit` tiene una referencia local faltante; se utilizó el escáner de npm como alternativa, sin atribuir una revisión completa de salud/licencias de dependencias.

### Medición de carga local

Se detectó `NODE_ENV=development` en la configuración local: el comando anterior `vite build` producía bibliotecas de desarrollo. El nuevo comando establece `NODE_ENV=production` antes de resolver Vite, sin modificar los `.env` ni el servidor de desarrollo. [Comportamiento documentado por Vite](https://vite.dev/guide/env-and-mode).

Comparación de la compilación local, en kB informados por Vite:

| Archivo | Antes | Después | Gzip antes | Gzip después |
| --- | ---: | ---: | ---: | ---: |
| React | 366,54 | 181,75 | 110,81 | 57,15 |
| Aplicación principal | 317,28 | 276,10 | 86,10 | 81,43 |
| Movimiento | 132,48 | 125,10 | 43,95 | 40,85 |
| Iconos | 36,05 | 23,33 | 13,06 | 8,57 |

Esos cuatro archivos suman 253,92→188,00 kB gzip, aproximadamente 26 % menos. No es una medición del tiempo de carga ni de Core Web Vitals; Vercel ya compilaba con condiciones de producción y no se promete ese ahorro adicional respecto a la web publicada.

Las imágenes públicas originales de ImageKit ahora ofrecen tamaños responsive sin alterar URLs firmadas ni recortes existentes. Se comprobó en navegador una imagen real pública transformada: 640×800 px frente al original de 768 px de ancho. [Transformaciones oficiales de ImageKit](https://imagekit.io/docs/image-transformation). El zoom conserva la imagen original para ampliar. La reserva de proporciones y carga diferida de recomendaciones se mantienen; el fallback retira `srcset` fallido para poder mostrarse. Los eventos de zoom actualizan la visualización como máximo una vez por fotograma; una prueba aislada confirma que 100 actualizaciones consecutivas producen un único compromiso con la posición final. No se atribuye una tasa de FPS medida.

## Cambios principales

Los ajustes de galería, paginación, rendimiento y pedidos están incluidos en el despliegue protegido actual mencionado arriba. Falta completar el acceso y comprobar la ejecución remota antes de activar la versión definitiva en el dominio público. Esta pasada creó la candidata, pero no ejecutó su promoción al dominio público.

La candidata también incluye las siguientes acciones de pedidos y menús Telegram, pendientes de activación en el bot de producción:

- `/start` y `/menu` instalan el teclado inferior persistente con pedidos, resumen, venta, reposición, inventario, stock bajo, búsqueda, ayuda y regreso al menú. Los demás mensajes conservan los botones internos para elegir variantes y confirmar operaciones. Cada acción de navegación responde una sola vez.
- La lista nativa de comandos incluye `/start` y se configura con `setMyCommands` y `setChatMenuButton`, únicamente en el chat privado autorizado que abre el menú. El teclado inferior se puede ocultar y volver a desplegar desde Telegram; la apariencia de los iconos depende del dispositivo. [Documentación oficial del teclado](https://core.telegram.org/bots/api#replykeyboardmarkup).
- Siete pruebas aisladas cubren registro de ambos menús, reapertura, todas las rutas de los botones, respuestas a avisos antiguos, usuarios no autorizados, registro concurrente y reintento si Telegram rechaza la configuración. Los mensajes de usuarios ajenos no muestran el teclado administrativo.
- Administración → Pedidos permite eliminar hasta 25 seleccionados mediante una sola confirmación y petición. El servidor valida todo el lote, borra únicamente sus registros y adjuntos de las copias internas y reintegra las reservas una sola vez. Cancelar o fallar conserva la selección; la barra móvil separa la acción de borrado. Se verificaron navegación y cancelación en navegador local; el borrado se probó con datos ficticios aislados.

- Confirmar un pedido pendiente cambia su estado a `Confirmado`, sin cobrar, enviar mensajes al cliente ni volver a descontar stock. Sigue apareciendo en el trabajo pendiente. Los botones antiguos no confirman pedidos cancelados, con reserva liberada ni avanzados; repetir la confirmación no cambia nuevamente la versión.
- Eliminar exige un segundo botón explícito, con confirmación guardada en el servidor, válida por cinco minutos y vinculada al administrador, al mensaje privado y a la versión del pedido. Cancelar conserva el pedido; cambios posteriores invalidan el consentimiento. Se edita la misma tarjeta, sin mensajes adicionales salvo que Telegram rechace la edición.
- La web y Telegram comparten la mutación de eliminación: borrado de la tienda y sus copias de comprobantes administradas por `updateStore`, sincronización del stock reservado una sola vez y actualización en tiempo real. No borra conversaciones o fotos ya copiadas por terceros en Telegram ni archivos descargados fuera de la tienda. Se mantiene el criterio existente de la web de reintegrar reservas al borrar un pedido.
- Diez pruebas aisladas verifican estados, cancelación, permisos, nonce manipulado, mensaje incorrecto, caducidad, pedido modificado, arranque nuevo del webhook, duplicados, concurrencia y fallos de persistencia. No se ejecutaron estas acciones sobre pedidos reales.
- La guía `security-guidance` tiene sus referencias ASVS locales ausentes. Se conservan controles existentes y se usa como alternativa la [guía oficial de autorización de OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html) y el [Bot API oficial de Telegram](https://core.telegram.org/bots/api), sin atribuir cumplimiento completo de ASVS.

- Las cantidades de compra deben ser enteros de 1 a 10 y no se truncan silenciosamente carritos de más de 25 líneas.
- Crear un pedido nuevo ya no descarta pedidos históricos al superar 400.
- Repetir una solicitud con la misma clave no reserva stock ni vuelve a disparar sus notificaciones.
- Pago por enlace rechazado antes de reservar stock si no hay un WhatsApp válido configurado.
- Respuestas HTML, JSON malformado o errores HTTP no se interpretan como guardados correctos.
- Tiempos de espera para HTTP, CSRF, Redis y Telegram. La limpieza de ImageKit tiene presupuesto de tiempo y conserva elementos pendientes para reintentar.
- Las solicitudes antiguas no recuperan cachés invalidadas; los fallos de actualización se muestran sin inventar un catálogo de ejemplo.
- SEO de productos ocultos no expone borradores por su enlace conocido.
- Canonical, sitemap, robots y enlaces administrativos de Telegram siguen una URL pública configurable.
- Jerarquía de títulos corregida en el catálogo y proceso de compra; candidatos responsive de imágenes con descriptores reales de ancho.
- Movimiento de destacados y presentación de portada/anuncios con controles de pausa y respeto de movimiento reducido.
- Importación de fotos integrada con el reconocimiento existente de nombres, colores y vistas. Sin publicación automática.
- Lectura e importación CSV protegidas contra estados de carga obsoletos y acciones simultáneas.
- Portada y fichas públicas entregan HTML con contenido y la aplicación compilada a visitantes y rastreadores, sin selección por user-agent. La compra interactiva sigue necesitando JavaScript.
- Descripciones, colores, tallas, precio de oferta y disponibilidad en HTML y JSON-LD comparten la misma lógica de SEO. No se inventan reseñas, fabricante ni políticas de entrega.
- Sitemap sin fechas de modificación inventadas y sin duplicación con archivos estáticos. Administración y rutas privadas llevan cabecera de no indexación.
- Recuperación de archivos antiguos de la web limitada a una recarga automática por sesión, también cuando falla el acceso al almacenamiento del navegador.
- Flechas de galería con posición fija y sin desplazamiento al pasar el mouse. Zoom anclado al punto señalado, arrastre con mouse y gesto táctil, límites de imagen y botón de restablecimiento; la ampliación se reinicia al cambiar de foto.
- Bloque “Galería del producto” retirado en todos los dispositivos. Barras del detalle y colores en escritorio con línea visible de 2 px dentro de una pista arrastrable de 10 px; Firefox conserva su barra nativa fina.
- Indicador de fotos con líneas discretas, selección activa anunciada y botones de 44×44 px sin superposición. Se conservan selección directa, deslizamiento y contador; el indicador mantiene visible la selección cuando no cabe entero.
- Fotos recomendadas en marco vertical 3:4 con ajuste completo, sin recorte cuadrado ni ampliación por hover. La primera tarjeta queda alineada con el contenido y se mantienen la navegación horizontal y la apertura del producto. Comprobación local en 390 y 1280 px sin errores de consola en el recorrido revisado.
- Catálogo limitado a 12 prendas por página en escritorio y 8 en móvil. Indicador explícito, navegación accesible a primera/última página y regreso al inicio de resultados al cambiar de página. Los filtros siguen reiniciando la página y la URL conserva la navegación.

## Ejecutar las comprobaciones

```sh
npm ci
npm run check:release
```

Para revisar visualmente sin usar credenciales de producción:

```sh
npm run dev:audit
```

Usa `http://localhost:5179`. La cuenta ficticia local es `audit@localhost.test`, contraseña `AuditSoloLocal2026!`. Solo existe en datos temporales y no es una cuenta de producción. El servidor aislado no carga los `.env` de la tienda, no usa Redis ni envía mensajes reales. Detén el servidor con Ctrl+C al terminar.

## Dominio previsto: adriego.shop

No se comprobó su disponibilidad ni se compró. Hasta tenerlo, conserva `PUBLIC_SITE_URL=https://adriego.vercel.app`.

Cuando esté comprado y autorizado el cambio:

1. Añade `adriego.shop` y, si corresponde, `www.adriego.shop` al proyecto actual de Vercel, en Settings → Domains.
2. Copia únicamente los registros DNS que Vercel muestre para ese proyecto. No inventes IPs ni cambies nameservers sin preservar correo y registros existentes. [Guía oficial](https://vercel.com/docs/domains/working-with-domains/add-a-domain).
3. Espera validación del dominio y certificado HTTPS.
4. Actualiza en Production:

```env
PUBLIC_SITE_URL=https://adriego.shop
USER_ALLOWED_ORIGIN=https://adriego.shop
ADMIN_ALLOWED_ORIGIN=https://adriego.shop
USER_PASSWORD_RESET_BASE_URL=https://adriego.shop
```

`PUBLIC_SITE_URL` se aplica al frontend durante la compilación y a las APIs en ejecución. No lo cambies solo en una de las dos superficies. No cambies `STORE_STATE_KEY`, tokens de Redis ni identidades de almacenamiento: eso podría apuntar a una tienda vacía en lugar de migrar el dominio.

5. Despliega nuevamente. Comprueba canonical, `/robots.txt`, `/sitemap.xml`, recuperación de contraseña, acceso, enlaces de Telegram y compras de prueba autorizadas.
6. Decide un dominio principal y configura redirecciones para sus variantes. Las sesiones, carritos locales y avisos de WhatsApp del antiguo dominio no se trasladan automáticamente al nuevo: dependen del origen del navegador. Los pedidos persistidos en Redis no se pierden.

## Importación de fotos sin API de Drive

La integración de Drive, sus acciones de servidor y las variables de cuenta de servicio se retiraron. No se modificaron ni borraron archivos en Google Drive.

1. Si tus fotos están en Drive, descarga la carpeta y descomprime el ZIP en tu dispositivo.
2. En Administración → Importar, usa **Añadir fotos** o **Elegir carpeta**. La carpeta puede contener subcarpetas; se agrupa por el nombre de cada imagen, no por el nombre de la carpeta.
3. Usa nombres como `chompa-estrella-3-4-sin-peluche-rojo-frontal.png` o `clasica__azul-marino__frontal.png`. Se reconocen modelo, color y vista; no se generan precios ni stock inventados.
4. Añadir otra selección conserva las fotos anteriores y evita duplicar la misma foto. Se respetan los límites existentes del lote: 96 fotos, 120 MB en total y 15 MB por fuente JPG, PNG o WebP.
5. Pulsa **Completar producto** para preparar el editor. Comprueba precio, tipo, tallas, stock y visibilidad antes de guardar. Las fuentes se conservan al cambiar de sección, no al recargar ni cerrar el navegador.

La selección de carpetas depende del soporte del navegador. **Añadir fotos** sigue disponible como alternativa. La carga y compresión existente de ImageKit se mantiene; quitar Drive no elimina esa integración de almacenamiento.

Para revisar el HTML y la aplicación compilada en el entorno aislado:

```sh
npm run build
npm run dev:audit -- --production
```

La función pública incluye `dist/index.html` mediante la configuración de Vercel. Comprueba en el despliegue autorizado que las fichas, sus archivos compilados, sitemap y robots responden correctamente; la prueba local no sustituye el empaquetado remoto.

Prioridades de posicionamiento: [SEO y descubrimiento en IA](POSICIONAMIENTO.md).

## Límites y pendientes externos antes del lanzamiento

- Enviar `/start` al bot real y comprobar el teclado inferior y el listado nativo de comandos. Si todavía responde la versión anterior, verificar a qué URL apunta el webhook, conservando su secreto y las actualizaciones pendientes.
- Revisar la prioridad de rutas de la portada para SEO: en la candidata anterior `/api/seo?action=page&path=/` entregó el catálogo en HTML, pero `/` sirvió la plantilla estática. Las fichas y la aplicación cliente requieren comprobaciones separadas; no se certifica el SEO remoto completo.
- Comprar y validar el dominio; no se asegura disponibilidad ni precio.
- Probar entrega de correo y revisar cuentas bancarias, WhatsApp, dirección, tarifas y políticas con tus datos reales. No se hizo una transferencia ni un pago real.
- Revisar almacenamiento y recuperación de copias con datos reales autorizados. La tienda sigue usando un documento JSON compartido; su crecimiento requiere vigilancia. Los pedidos ya no se eliminan automáticamente para ocultar ese crecimiento.
- Una carga de fotos de producto interrumpida o un borrador descartado puede dejar archivos huérfanos en ImageKit; no se ejecutó una purga general, porque podría borrar imágenes válidas. La eliminación de pedidos y comprobantes cubre los registros y respaldos relacionados, no todos los archivos ajenos del proveedor.
- No se probaron dispositivos iOS/Android físicos, todos los navegadores ni todos los fallos de proveedores externos. Las pruebas automatizadas y visuales reducen el riesgo, pero no permiten garantizar “cero bugs”.
