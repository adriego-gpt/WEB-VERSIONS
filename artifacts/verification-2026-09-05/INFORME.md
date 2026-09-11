# Verificación de pedidos, administración, móvil e ImageKit

Fecha: 5 de septiembre de 2026. Versión revisada: árbol de trabajo local con cambios sin confirmar, sobre `05da1a0`.

La compilación y las pruebas existentes pasan, pero la revisión adicional encontró fallos que impiden considerar cerrada la verificación. No se modificó el código de aplicación ni se publicaron cambios.

## Alcance y resultados

| Comprobación | Resultado y alcance |
|---|---|
| Compilación de producción | `npm run build`: correcta. |
| Pruebas unitarias | 184 aprobadas, 0 fallidas. |
| Integración | `npm run test:e2e`: los tres grupos aprobados, 12 pruebas contabilizadas. Ejecutan handlers y almacenamiento temporal; no equivalen a pruebas contra producción. |
| Lint | 0 errores, 200 advertencias. Las advertencias no se contabilizan como vulnerabilidades confirmadas. |
| Navegador | Microsoft Edge sin interfaz, compilación real, sesiones y respuestas API simuladas, pedidos ficticios. Vistas de 320, 390, 768 y 1440 píxeles. |
| ImageKit real | Consulta autenticada de archivos HTTP 200; lectura HEAD de una imagen existente HTTP 200, `image/jpeg`, URL compatible con el endpoint configurado. |

Las primeras ejecuciones restringidas de pruebas y build fallaron por `spawn EPERM`; al ejecutarlas con permiso para crear procesos, completaron correctamente. Esto fue una limitación del entorno de verificación, no un error de la aplicación.

## Hallazgos confirmados

### 1. Alta: la nota «solo admin» se entrega al cliente

Ubicación: `api/orders.js:248–262`; campo administrativo en `src/components/admin/AdminPanelModal.jsx:2211`.

El listado filtra qué pedidos pertenecen al usuario, pero devuelve los objetos completos, incluido `internalNote`. La etiqueta «solo admin» únicamente describe la interfaz: no hay exclusión de ese campo en la respuesta para clientes.

Reproducción: se creó un usuario y un pedido ficticios en almacenamiento temporal y se consultó el handler con una sesión de cliente firmada. La respuesta fue HTTP 200 y contenía `PRIVATE_TEST_NOTE`. El usuario puede leerla inspeccionando la respuesta de red aunque no se muestre en pantalla. Esto no demuestra acceso a pedidos de otros clientes.

Corrección recomendada: definir la representación pública del pedido en el servidor y excluir expresamente los campos administrativos; añadir una prueba de contrato de privacidad.

### 2. Alta: una actualización del catálogo fallida deja de reintentarse

Ubicación: `src/hooks/useRealtimeSync.js:58–80` y `src/domain/sync/syncCalculations.js:84`.

El hook adopta la nueva versión antes de descargar y aplicar los datos. Si la descarga falla, la siguiente consulta ve la misma versión y no vuelve a descargarla. Esto también puede impedir que aparezcan fotografías nuevas de ImageKit en otros dispositivos, aunque la subida haya funcionado.

Reproducción con el código real del hook y dependencias simuladas: versión local 1, remota 2, descarga del catálogo fallida. En dos ciclos hubo una sola descarga; los estados fueron `checking → error → checking → synced`, sin haber aplicado los datos de la versión 2. El botón de reintento tampoco invalida esa versión ya adoptada.

Corrección recomendada: confirmar cada versión solo después de aplicar los datos correctamente y conservar pendientes para reintentar. Revisar también las actualizaciones aplazadas mientras se edita un producto.

### 3. Media: «Sincronizado» no garantiza que los pedidos estén actualizados

Ubicación: `src/hooks/useRealtimeSync.js:85–101`; gestión del resultado en `src/App.jsx:2778`.

`refreshOrders` y `refreshAdminUsers` se invocan con `void`; el hook no espera su resultado. La actualización de pedidos devuelve `false` cuando falla, pero ese resultado se ignora.

Reproducción: dejando la promesa de pedidos pendiente, el indicador pasó de `checking` a `synced`. El panel puede mostrar información antigua como si estuviera actualizada. La actualización periódica adicional del panel administrativo puede recuperar pedidos posteriormente, pero no valida el indicador en ese momento.

Corrección recomendada: esperar las operaciones necesarias, comprobar sus resultados y comunicar estado parcial/error cuando corresponda.

### 4. Media: filas de pedidos recortadas en administración móvil

Ubicación: `src/App.css:17221` y regla móvil anterior en `src/App.css:15650`.

La regla posterior `.admin-orders-workspace .admin-order-disclosure` impone tres columnas con mínimos de 140 y 180 píxeles, además del indicador SLA. Tiene más especificidad que la regla móvil de una columna. La tarjeta usa `overflow: hidden`.

A 390 píxeles, la fecha/metadatos alcanzaron aproximadamente x=426 y el SLA x=570; ambos exceden el espacio visible. A 320 píxeles ocurre también. En escritorio, el resumen se muestra completo.

Evidencia visual: [administración a 390 px](admin-390.png), [administración a 1440 px](admin-1440.png). La navegación superior horizontal del administrador es desplazable y no se incluye por sí sola como error de desbordamiento.

Corrección recomendada: aplicar una regla móvil con la misma especificidad que restablezca una columna y permita acomodar metadatos y SLA.

### 5. Media: un total válido de cero se sustituye por el subtotal

Ubicaciones: `src/components/orders/OrdersModal.jsx:124`, `:149`, `:188`; `src/components/admin/AdminPanelModal.jsx:2000`, `:2064`.

Se utiliza `total || subtotal`. JavaScript interpreta cero como falso. Un pedido de prueba con subtotal 80, descuento 80, envío 0 y total 0 se mostró como **$80,00** en lugar de **$0,00**. Es un error de presentación; esta prueba no demuestra un cobro incorrecto en la pasarela.

Evidencia: pedido `ADR-GRATIS` en [vista de 768 px](customer-768.png).

Corrección recomendada: distinguir valores ausentes de cero, por ejemplo mediante `??`, y revisar el mismo patrón en normalización y resúmenes relacionados.

### 6. Media: el foco de teclado sale del diálogo móvil

Ubicación: `src/hooks/useModalA11y.js:56–75`, combinado con `src/App.css:613–620`.

El control del foco cuenta botones dentro del detalle oculto con `display: none`. En la lista móvil, al enfocar el último pedido y pulsar Tab, el foco pasó al enlace «Saltar al catálogo» de la tienda detrás del diálogo. Se comprobó que el elemento activo ya no pertenecía a `.orders-page`.

Corrección recomendada: calcular los elementos realmente visibles/enfocables y bloquear la interacción con el contenido de fondo mientras el diálogo está abierto.

### 7. Baja: la búsqueda sin coincidencias informa que no existen pedidos

Ubicación: `src/components/orders/OrdersModal.jsx:111–114`.

Con dos pedidos existentes, buscar `NINGUN-RESULTADO` mostró «Aún no tienes pedidos» y el texto de primera compra. Al limpiar la búsqueda reaparecen los pedidos: no es pérdida de datos, sino un mensaje incorrecto.

Corrección recomendada: diferenciar «sin pedidos» de «sin resultados para esta búsqueda» y ofrecer limpiar el filtro.

## ImageKit y sincronización entre dispositivos

Las tres variables de ImageKit están presentes en la configuración local, sin exponer sus valores en este informe. La clave privada permitió una consulta real y una imagen existente estuvo disponible. La firma HMAC-SHA1 del token y la expiración de diez minutos implementadas coinciden con la [API oficial de subida V1](https://imagekit.io/docs/api-reference/upload-file/upload-file). Las pruebas existentes cubren autorización administrativa, CSRF, formato/tamaño, respuestas de subida simuladas y migración de imágenes inline.

No se ejecutó una subida nueva seguida de guardado de producto y comprobación en un segundo dispositivo contra producción. Por ello, la lectura real de ImageKit no certifica todo ese recorrido. Las imágenes de las capturas son placeholders ficticios, no una comprobación visual de las fotografías del catálogo real.

En `.env` y `.env.local` no aparecen `KV_REST_API_URL` ni `KV_REST_API_TOKEN`, que son las variables de persistencia compartida que utiliza `api/_lib/store.js`. Eso limita la sincronización real de un servidor local configurado solo con esos archivos. No permite concluir que falten en Vercel: las variables publicadas no se inspeccionaron. ImageKit almacena fotografías; el estado de productos y pedidos necesita su propia persistencia compartida.

No se pudo conectar desde este entorno al dominio canónico `adriego.com`; las consultas devolvieron `fetch failed`. No se atribuye ese resultado a una caída del sitio sin diagnóstico adicional. Tampoco se certificaron Safari/iPhone físicos, pagos externos ni mensajería real.

## Evidencia y prioridad sugerida

Resultados de reproducciones: [evidence.json](evidence.json). Capturas adicionales: [cliente a 320 px](customer-320.png), [cliente a 390 px](customer-390.png), [cliente a 1440 px](customer-1440.png), [administración a 320 px](admin-320.png), [administración a 768 px](admin-768.png).

Atender primero la privacidad de las notas y la pérdida de reintentos de sincronización; después, el indicador, los recortes móviles, los totales cero y el foco. Las pruebas existentes aprobadas no cubren adecuadamente estos escenarios. Los hallazgos describen la versión local actual; no todos se atribuyen exclusivamente a los cambios más recientes.

