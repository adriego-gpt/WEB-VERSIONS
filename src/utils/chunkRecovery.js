export function tryReloadStaleChunk(browser = globalThis.window) {
  if (!browser) return false;
  try {
    if (browser.sessionStorage.getItem("adriego_chunk_reload") === "true") return false;
    browser.sessionStorage.setItem("adriego_chunk_reload", "true");
    browser.location.reload();
    return true;
  } catch {
    // Restricted storage must not cause an automatic refresh loop.
    return false;
  }
}
