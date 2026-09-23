# Adriego Store

Tienda online de ropa con:

- frontend `React + Vite`
- funciones serverless en `api/`
- autenticacion por cookies seguras para cliente y admin
- despliegue recomendado en `Vercel`

## Desarrollo

```bash
npm install
npm run dev
```

## Variables de entorno

Crea `.env` a partir de `.env.example` y define al menos:

- `USER_ALLOWED_ORIGIN`
- `USER_SESSION_SECRET`
- `ADMIN_ALLOWED_ORIGIN`
- `ADMIN_USERNAME`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD_ALGORITHM`
- `ADMIN_PASSWORD_SALT`
- `ADMIN_PASSWORD_HASH`
- `ADMIN_SESSION_SECRET`
- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`
- `PASSWORD_RESET_EMAIL_PROVIDER`

Puedes generar las credenciales del admin con:

```bash
node scripts/generate-admin-hash.mjs "TuPasswordSegura123" scrypt
```

## Persistencia de datos

En produccion (Vercel), configura `KV_REST_API_URL` y `KV_REST_API_TOKEN` para persistencia compartida.

- Con KV: productos, cupones, pedidos y usuarios se sincronizan entre dispositivos.
- Sin KV: se usa `.data/store.json` solo para desarrollo local.
- El backend aplica limites de payload e imagen inline para evitar errores de sincronizacion por `data:image` demasiado pesadas:
  - `MAX_JSON_BODY_BYTES` (default `4194304`)
  - `MAX_INLINE_IMAGE_BYTES` (default `389120`)

## Recuperacion de contrasena por correo

Puedes enviar el enlace de recuperacion con:

- `Resend`: `PASSWORD_RESET_EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`.
- `Gmail SMTP`: `PASSWORD_RESET_EMAIL_PROVIDER=smtp` (o `gmail-smtp`), `SMTP_USER`, `SMTP_PASS` (App Password), `SMTP_FROM_EMAIL`.

Para Gmail SMTP usa:

- `SMTP_HOST=smtp.gmail.com`
- `SMTP_PORT=465`
- `SMTP_SECURE=true`

## Build

Preparación de dominio, importación local y verificaciones de publicación: [guía de publicación](docs/PUBLICACION.md). Prioridades para buscadores e IA: [posicionamiento](docs/POSICIONAMIENTO.md).

```bash
npm run check:release
```

```bash
npm run build
```

## Auditoría del sitio

El proyecto incluye Squirrelscan para revisar rastreo, sitemap, SEO, rendimiento, accesibilidad, seguridad, contenido y datos estructurados. La revisión rápida analiza la portada y sus señales globales:

```bash
npm run audit:site
```

Para recorrer hasta 100 páginas del sitio:

```bash
npm run audit:site:full
```

Ejecuta la auditoría completa después de cada despliegue importante. Ambos comandos son de diagnóstico y no modifican el sitio.

## Analítica con Umami

La tienda integra Umami Cloud de forma diferida para no bloquear el render inicial. El tracker permanece desactivado si no existe un identificador válido.

1. Crea el sitio `www.adriego.shop` en Umami y copia su **Website ID**.
2. Configura `VITE_UMAMI_WEBSITE_ID` en Vercel para Production y, si deseas medir pruebas, también para Preview.
3. Vuelve a desplegar la aplicación.

La integración respeta `Do Not Track`, no usa cookies analíticas y elimina parámetros y fragmentos de las URL. Los eventos comerciales excluyen el texto de búsqueda y los códigos de pedido antes de enviarse a Umami.

## Despliegue en Vercel

1. Importa el proyecto en Vercel.
2. Usa `npm run build` como comando de build.
3. Configura todas las variables de entorno del `.env.example`.
4. Define `USER_ALLOWED_ORIGIN` y `ADMIN_ALLOWED_ORIGIN` con tu dominio real.
5. Configura `KV_REST_API_URL` y `KV_REST_API_TOKEN` en Production/Preview.
6. Despliega.

## Seguridad

- El login y las APIs mutables requieren cookie + cabecera CSRF.
- Las sesiones usan cookies `HttpOnly` y `SameSite=Strict`.
- El catalogo publico no expone pedidos ni cupones internos.
