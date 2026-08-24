import { lazy } from "react";

/**
 * Wraps dynamic component imports to gracefully handle Vite/Webpack
 * ChunkLoadErrors when new deployments invalidate previous asset hashes.
 */
export function lazyWithRetry(componentImport, maxRetries = 2) {
  return lazy(async () => {
    let attempts = 0;
    while (attempts < maxRetries) {
      try {
        return await componentImport();
      } catch (error) {
        attempts += 1;
        const isChunkError = (
          error?.name === "ChunkLoadError"
          || /loading chunk|failed to fetch dynamically imported module|error loading dynamic module|importing a module script failed/i.test(
            error?.message || "",
          )
        );

        if (!isChunkError || attempts >= maxRetries) {
          // If we haven't reloaded the page in this session yet for a chunk error, do one full reload to fetch new HTML & assets
          if (typeof window !== "undefined" && isChunkError) {
            const hasReloaded = window.sessionStorage.getItem("adriego_chunk_reload") === "true";
            if (!hasReloaded) {
              window.sessionStorage.setItem("adriego_chunk_reload", "true");
              window.location.reload();
              return new Promise(() => {}); // Hold until reload
            }
            window.sessionStorage.removeItem("adriego_chunk_reload");
          }
          throw error;
        }

        // Short wait before retry attempt
        await new Promise((resolve) => setTimeout(resolve, 300 * attempts));
      }
    }
    return componentImport();
  });
}
