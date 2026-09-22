import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { randomBytes, scryptSync } from "node:crypto";
import { createServer } from "vite";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const auditDir = await fs.mkdtemp(path.join(os.tmpdir(), "adriego-browser-audit-"));
process.chdir(auditDir);
for (const key of Object.keys(process.env)) {
  if (/^(KV_|ADMIN_|USER_|GOOGLE_|IMAGEKIT_|TELEGRAM_|N8N_|SMTP_|RESEND_|PASSWORD_RESET_|PUBLIC_SITE_URL$|VITE_PUBLIC_SITE_URL$|VERCEL_ENV$|VERCEL$)/.test(key)) process.env[key] = "";
}
const salt = randomBytes(16).toString("base64url");
Object.assign(process.env, {
  NODE_ENV: "development", VERCEL_ENV: "", SECURITY_LOG_ENABLED: "false",
  USER_ALLOWED_ORIGIN: "http://localhost:5179", ADMIN_ALLOWED_ORIGIN: "http://localhost:5179",
  ADMIN_EMAIL: "audit@localhost.test", ADMIN_USERNAME: "audit@localhost.test",
  ADMIN_PASSWORD_ALGORITHM: "scrypt", ADMIN_PASSWORD_SALT: salt,
  ADMIN_PASSWORD_HASH: scryptSync("AuditSoloLocal2026!", salt, 64).toString("hex"),
  ADMIN_SESSION_SECRET: randomBytes(32).toString("hex"), USER_SESSION_SECRET: randomBytes(32).toString("hex"),
});
const { updateStore } = await import(pathToFileURL(path.join(projectRoot, "api/_lib/store.js")));
await updateStore((draft) => {
  draft.products = [{ id: "audit-product", sku: "TEST-001", name: "Prenda de prueba", category: "Mujer", productType: "Cortas", price: 25, basePrice: 25, isPublic: true, isFeatured: true, colors: ["Rojo"], sizes: ["M"], catalogColor: "Rojo", description: "Producto ficticio, solo para verificación local.", imagesByColor: { Rojo: ["https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=640&q=70"] }, variants: [{ uid: "audit-variant", color: "Rojo", size: "M", stock: 1 }] }];
  draft.contactSettings = { whatsappNumber: "593999999999", paymentSettings: { accountNumber: "0000000000", accountHolder: "PRUEBA LOCAL", bankName: "Banco de prueba", accountType: "Ahorros", bankAccounts: [{ id: "audit-bank", bankName: "Banco de prueba", accountNumber: "0000000000", accountHolder: "PRUEBA LOCAL", accountType: "Ahorros", enabled: true }] } };
  if (process.argv.includes("--orders")) {
    // A non-payment test image lets the UI exercise transfer controls too.
    const qrFixture = draft.products[0].imagesByColor.Rojo[0];
    draft.contactSettings.paymentSettings.bankQrImage = qrFixture;
    draft.contactSettings.paymentSettings.bankAccounts[0].bankQrImage = qrFixture;
    draft.orders = Array.from({ length: 3 }, (_, index) => ({
      id: `audit-order-${index + 1}`, code: `TEST-ORDER-${index + 1}`, customerName: "Cliente ficticio de prueba",
      status: "Pendiente", deliveryType: "pickup", paymentMethod: "transfer", total: 25, createdAt: new Date().toISOString(),
      items: [{ id: "audit-product", name: "Prenda de prueba", color: "Rojo", size: "M", quantity: 1, price: 25 }],
      paymentProof: "data:image/png;base64,dGVzdA==", stockReservation: { state: "reserved" },
    }));
  }
  if (process.argv.includes("--maintenance")) {
    draft.storeSettings = { ...(draft.storeSettings || {}), brandName: "Adriego Store", maintenanceSettings: { enabled: true, title: "Volvemos pronto", message: "Estamos realizando ajustes para cuidar cada detalle de tu experiencia. Gracias por tu paciencia.", returnMessage: "" } };
    draft.contactSettings = { ...draft.contactSettings, address: "Punto de retiro ficticio de prueba", mapsLink: "https://www.google.com/maps/search/?api=1&query=Quito", mapsEmbedUrl: "https://www.google.com/maps?q=Quito&output=embed", email: "audit@localhost.test", legalBusinessName: "Responsable ficticio de prueba", legalAddress: "Domicilio ficticio de prueba" };
  }
  if (process.argv.includes("--gallery")) {
    const source = draft.products[0];
    const colors = ["Rojo", "Negro", "Azul Marino", "Menta", "Blanca", "Lila", "Beige", "Verde"];
    const image = source.imagesByColor.Rojo[0];
    draft.products = Array.from({ length: 25 }, (_, index) => ({
      ...source, id: `audit-product-${index + 1}`, sku: `TEST-${index + 1}`, name: `Prenda de prueba ${String(index + 1).padStart(2, "0")}`,
      colors,
      imagesByColor: Object.fromEntries(colors.map((color) => [color, [image, `${image}&sat=-70`, `${image}&sat=30`]])),
      variants: colors.map((color) => ({ uid: `audit-variant-${index}-${color}`, color, size: "M", stock: 1 })),
    }));
  }
  if (process.argv.includes("--mobile-catalog")) {
    const source = draft.products[0];
    const colors = ["Palo de Rosa", "Negro", "Azul Marino"];
    const sizes = ["S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL"];
    draft.products = Array.from({ length: 4 }, (_, index) => ({
      ...source, id: `mobile-fixture-${index}`, name: `Prenda de prueba ${index + 1}`,
      colors, sizes, catalogColor: colors[0],
      imagesByColor: Object.fromEntries(colors.map(color => [color, source.imagesByColor.Rojo])),
      variants: colors.flatMap(color => sizes.map(size => ({ uid: `mobile-${index}-${color}-${size}`, color, size, stock: size === "5XL" ? 0 : 4 }))),
    }));
  }
  return draft;
});
const productionPreview = process.argv.includes("--production");
const previewPlugins = productionPreview ? [{
  name: "isolated-production-preview",
  configureServer(viteServer) {
    viteServer.middlewares.use(async (req, res, next) => {
      const pathname = new URL(req.url || "/", "http://localhost").pathname;
      if (pathname.startsWith("/assets/")) {
        // Only build-generated flat asset names, never arbitrary filesystem paths.
        if (!/^\/assets\/[a-zA-Z0-9._-]+\.(?:js|css|woff2?|png|svg)$/.test(pathname)) { res.statusCode = 404; res.end(); return; }
        try {
          const bytes = await fs.readFile(path.join(projectRoot, "dist", pathname.slice(1)));
          res.setHeader("Content-Type", pathname.endsWith(".css") ? "text/css" : pathname.endsWith(".js") ? "application/javascript" : "application/octet-stream");
          res.end(bytes);
        } catch { res.statusCode = 404; res.end(); }
        return;
      }
      const isNestedSpaRoute = ["/admin", "/cuenta"].some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
      const isFlatSpaRoute = ["/carrito", "/favoritos", "/pedidos", "/buscar"].includes(pathname);
      if (isNestedSpaRoute || isFlatSpaRoute) {
        // Match Vercel's SPA rewrites so these checks use the compiled app too.
        try {
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          res.setHeader("Cache-Control", "no-store");
          res.end(await fs.readFile(path.join(projectRoot, "dist", "index.html")));
        } catch { res.statusCode = 500; res.end("Compilación local no disponible."); }
        return;
      }
      if (pathname !== "/" && !pathname.startsWith("/producto/") && pathname !== "/robots.txt" && pathname !== "/sitemap.xml") { next(); return; }
      try {
        const { default: handler } = await import(pathToFileURL(path.join(projectRoot, "api/seo.js")));
        req.query = { action: pathname === "/robots.txt" ? "robots" : pathname === "/sitemap.xml" ? "sitemap" : "page", path: pathname };
        res.status = (code) => { res.statusCode = code; return res; };
        res.send = (body) => { res.end(body); return res; };
        await handler(req, res);
      } catch { res.statusCode = 500; res.end("Error de vista previa local."); }
    });
  },
}] : [];
const server = await createServer({ root: projectRoot, configFile: path.join(projectRoot, "vite.config.js"), envDir: auditDir, plugins: previewPlugins, server: { host: "127.0.0.1", port: 5179, strictPort: true } });
await server.listen();
console.log(`Auditoría aislada${productionPreview ? " (compilación de producción)" : ""}: http://localhost:5179 — datos temporales, sin KV ni notificaciones reales.`);
let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  await server.close();
  if (path.dirname(auditDir) === os.tmpdir() && path.basename(auditDir).startsWith("adriego-browser-audit-")) await fs.rm(auditDir, { recursive: true, force: true });
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
