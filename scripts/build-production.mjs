// Set this BEFORE Vite resolves .env files or imports React's build conditions.
// A developer's NODE_ENV=development must never leak into a release bundle.
process.env.NODE_ENV = "production";
const { build } = await import("vite");
const { rename } = await import("node:fs/promises");
await build();

// ASVS V14.2.5: keep the SPA shell off / so the public page route can serve real HTML.
await rename(new URL("../dist/index.html", import.meta.url), new URL("../dist/app.html", import.meta.url));
