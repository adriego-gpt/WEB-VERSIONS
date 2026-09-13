// Set this BEFORE Vite resolves .env files or imports React's build conditions.
// A developer's NODE_ENV=development must never leak into a release bundle.
process.env.NODE_ENV = "production";
const { build } = await import("vite");
await build();
