const UMAMI_SCRIPT_URL = "https://cloud.umami.is/script.js";
const UMAMI_SCRIPT_SELECTOR = "script[data-adriego-umami]";
const UMAMI_QUEUE_KEY = "__adriegoUmamiQueue";
const UMAMI_WEBSITE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_QUEUED_EVENTS = 20;

function configuredWebsiteId() {
  return String(import.meta.env?.VITE_UMAMI_WEBSITE_ID || "").trim();
}

export function normalizeUmamiWebsiteId(value) {
  const candidate = String(value || "").trim();
  return UMAMI_WEBSITE_ID_PATTERN.test(candidate) ? candidate.toLowerCase() : "";
}

function sendToUmami(name, data, browserWindow = typeof window !== "undefined" ? window : undefined) {
  if (typeof browserWindow?.umami?.track !== "function") return false;
  try {
    const result = browserWindow.umami.track(name, data);
    if (result && typeof result.catch === "function") result.catch(() => {});
    return true;
  } catch {
    return false;
  }
}

function flushQueuedEvents(browserWindow = typeof window !== "undefined" ? window : undefined) {
  const queued = Array.isArray(browserWindow?.[UMAMI_QUEUE_KEY]) ? browserWindow[UMAMI_QUEUE_KEY] : [];
  browserWindow[UMAMI_QUEUE_KEY] = [];
  for (const event of queued) sendToUmami(event.name, event.data, browserWindow);
}

export function dispatchUmamiEvent(name, data = {}, browserWindow = typeof window !== "undefined" ? window : undefined) {
  if (!browserWindow) return false;
  if (sendToUmami(name, data, browserWindow)) return true;
  if (!normalizeUmamiWebsiteId(configuredWebsiteId())) return false;
  const queue = Array.isArray(browserWindow[UMAMI_QUEUE_KEY]) ? browserWindow[UMAMI_QUEUE_KEY] : [];
  queue.push({ name, data });
  browserWindow[UMAMI_QUEUE_KEY] = queue.slice(-MAX_QUEUED_EVENTS);
  return false;
}

export function initializeUmamiAnalytics({
  websiteId = configuredWebsiteId(),
  browserWindow = typeof window !== "undefined" ? window : undefined,
  browserDocument = typeof document !== "undefined" ? document : undefined,
} = {}) {
  const normalizedId = normalizeUmamiWebsiteId(websiteId);
  if (!normalizedId || !browserWindow || !browserDocument?.head) return false;
  const existing = browserDocument.querySelector?.(UMAMI_SCRIPT_SELECTOR);
  if (existing) return existing.dataset?.websiteId === normalizedId;

  const script = browserDocument.createElement("script");
  script.src = UMAMI_SCRIPT_URL;
  script.defer = true;
  script.dataset.adriegoUmami = "true";
  script.dataset.websiteId = normalizedId;
  script.dataset.domains = "adriego.shop,www.adriego.shop";
  script.dataset.excludeSearch = "true";
  script.dataset.excludeHash = "true";
  script.dataset.doNotTrack = "true";
  script.dataset.performance = "true";
  script.referrerPolicy = "strict-origin-when-cross-origin";
  script.addEventListener("load", () => flushQueuedEvents(browserWindow), { once: true });
  script.addEventListener("error", () => script.remove(), { once: true });
  browserDocument.head.append(script);
  return true;
}

export function scheduleUmamiAnalytics(options = {}) {
  const browserWindow = options.browserWindow || (typeof window !== "undefined" ? window : undefined);
  if (!browserWindow || !normalizeUmamiWebsiteId(options.websiteId || configuredWebsiteId())) return () => {};
  const start = () => initializeUmamiAnalytics({ ...options, browserWindow });
  if (typeof browserWindow.requestIdleCallback === "function") {
    const id = browserWindow.requestIdleCallback(start, { timeout: 2500 });
    return () => browserWindow.cancelIdleCallback?.(id);
  }
  const id = browserWindow.setTimeout(start, 0);
  return () => browserWindow.clearTimeout(id);
}
