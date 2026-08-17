/* global process */

import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Buffer } from "node:buffer";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const MAX_DEV_API_BODY_BYTES = Math.max(8 * 1024, Number(process.env.MAX_DEV_API_BODY_BYTES) || (256 * 1024));

function decorateResponse(res) {
  if (typeof res.status !== "function") {
    res.status = (code) => {
      res.statusCode = code;
      return res;
    };
  }

  if (typeof res.json !== "function") {
    res.json = (payload) => {
      if (!res.getHeader("Content-Type")) {
        res.setHeader("Content-Type", "application/json; charset=utf-8");
      }
      res.end(JSON.stringify(payload));
    };
  }

  return res;
}

async function readRawBody(req) {
  if (["GET", "HEAD"].includes(String(req.method || "GET").toUpperCase())) {
    return "";
  }

  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body, "utf8") > MAX_DEV_API_BODY_BYTES) {
        const payloadError = new Error("Payload demasiado grande");
        payloadError.code = "PAYLOAD_TOO_LARGE";
        reject(payloadError);
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function localApiPlugin() {
  const apiRoot = path.resolve(process.cwd(), "api");

  return {
    name: "local-api-plugin",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const requestUrl = new URL(req.url || "/", "http://localhost");
        if (!requestUrl.pathname.startsWith("/api/")) {
          next();
          return;
        }

        const routePath = requestUrl.pathname.replace(/^\/api\//, "");
        const filePath = path.join(apiRoot, `${routePath}.js`);

        try {
          await fs.access(filePath);
        } catch {
          next();
          return;
        }

        try {
          const rawBody = await readRawBody(req);
          req.query = Object.fromEntries(requestUrl.searchParams.entries());
          req.body = rawBody;

          const moduleUrl = `${pathToFileURL(filePath).href}?dev=${Date.now()}`;
          const routeModule = await import(moduleUrl);
          const handler = routeModule?.default;

          if (typeof handler !== "function") {
            res.statusCode = 500;
            res.end("API handler inválido");
            return;
          }

          decorateResponse(res);
          await handler(req, res);

          if (!res.writableEnded) {
            res.end();
          }
        } catch (error) {
          if (error?.code === "PAYLOAD_TOO_LARGE") {
            res.statusCode = 413;
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(JSON.stringify({
              ok: false,
              message: "Payload demasiado grande en API local",
            }));
            return;
          }
          server.ssrFixStacktrace(error);
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(JSON.stringify({
            ok: false,
            message: "Error interno en API local",
            details: error?.message || "unknown-error",
          }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), localApiPlugin()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/react") || id.includes("node_modules/react-dom")) {
            return "react-vendor";
          }
          if (id.includes("framer-motion")) {
            return "motion";
          }
          if (id.includes("lucide-react")) {
            return "icons";
          }
          return undefined;
        },
      },
    },
  },
});
