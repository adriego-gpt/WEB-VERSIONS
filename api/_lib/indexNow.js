import { getPublicSiteOrigin } from "../../src/constants/site.js";
import { getProductSlug } from "../../src/domain/products/seo.js";

export const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";
export const INDEXNOW_KEY = "762a2b370a8eaa34badf3cf58c7e7d37";
export const INDEXNOW_KEY_PATH = `/${INDEXNOW_KEY}.txt`;
const MAX_INDEXNOW_URLS = 100;
const INDEXNOW_TIMEOUT_MS = 1800;

export function buildIndexNowUrls(products = [], configuredOrigin = "") {
  const origin = getPublicSiteOrigin(configuredOrigin);
  const paths = [
    "/",
    ...(Array.isArray(products) ? products : [])
      .filter((product) => product?.isPublic !== false)
      .map((product) => getProductSlug(product))
      .filter(Boolean)
      .map((slug) => `/producto/${encodeURIComponent(slug)}`),
  ];

  // ASVS V5.3: submit only bounded, canonical URLs on the fixed public origin.
  return [...new Set(paths)].slice(0, MAX_INDEXNOW_URLS).map((path) => `${origin}${path}`);
}

export async function notifyIndexNow(products = [], options = {}) {
  const origin = getPublicSiteOrigin(options.origin || process.env.PUBLIC_SITE_URL || process.env.VITE_PUBLIC_SITE_URL);
  const urlList = buildIndexNowUrls(products, origin);
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function" || !urlList.length) return { ok: false, status: 0 };

  try {
    // ASVS V13.2: fixed HTTPS destination, short timeout, no redirects, and no user-controlled host.
    const response = await fetchImpl(INDEXNOW_ENDPOINT, {
      method: "POST",
      redirect: "error",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        host: new URL(origin).host,
        key: INDEXNOW_KEY,
        keyLocation: `${origin}${INDEXNOW_KEY_PATH}`,
        urlList,
      }),
      signal: AbortSignal.timeout(INDEXNOW_TIMEOUT_MS),
    });
    return { ok: response.ok || response.status === 202, status: response.status };
  } catch (error) {
    console.warn("IndexNow notification failed:", error?.name || "request-failed");
    return { ok: false, status: 0 };
  }
}

export async function notifyIndexNowInProduction(products = []) {
  if (process.env.VERCEL_ENV !== "production") return { ok: false, skipped: true, status: 0 };
  return notifyIndexNow(products);
}
