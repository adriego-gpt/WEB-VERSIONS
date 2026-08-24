const CSRF_COOKIE_NAME = "adriego_csrf_token";
const LEGACY_CSRF_COOKIE_NAME = "atelier_csrf_token";
const DEFAULT_REQUEST_TIMEOUT_MS = 15000;

let csrfBootstrapPromise = null;
let inMemoryCsrfToken = "";

function readCookie(name) {
  if (typeof document === "undefined") return "";
  const entry = document.cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${name}=`));
  if (!entry) return "";
  const rawValue = entry.slice(name.length + 1);
  try {
    return decodeURIComponent(rawValue);
  } catch {
    return rawValue;
  }
}

function getClientCsrfToken() {
  return readCookie(CSRF_COOKIE_NAME) || readCookie(LEGACY_CSRF_COOKIE_NAME) || inMemoryCsrfToken || "";
}

async function parseResponse(response) {
  const contentType = String(response?.headers?.get?.("content-type") || "").toLowerCase();
  if (!contentType.includes("application/json")) {
    const text = await response.text().catch(() => "");
    return text ? { message: text } : {};
  }

  try {
    return await response.json();
  } catch {
    return {};
  }
}

async function ensureCsrfToken(forceRefresh = false) {
  if (!forceRefresh) {
    const existing = getClientCsrfToken();
    if (existing) return existing;
  }

  if (!csrfBootstrapPromise) {
    csrfBootstrapPromise = fetch("/api/csrf-token", {
      method: "GET",
      credentials: "include",
      headers: {
        "X-Requested-With": "XMLHttpRequest",
      },
    })
      .then(async (res) => {
        try {
          const payload = await res.json();
          if (payload?.token) {
            inMemoryCsrfToken = String(payload.token);
            return inMemoryCsrfToken;
          }
        } catch {
          // ignore
        }
        return getClientCsrfToken();
      })
      .catch(() => getClientCsrfToken())
      .finally(() => {
        csrfBootstrapPromise = null;
      });
  }

  const fetchedToken = await csrfBootstrapPromise;
  return fetchedToken || getClientCsrfToken();
}

async function requestJson(endpoint, options = {}) {
  const method = String(options.method || "GET").toUpperCase();
  const isMutation = !["GET", "HEAD", "OPTIONS"].includes(method);
  const timeoutMs = Number.isFinite(Number(options.timeoutMs))
    ? Math.max(1000, Number(options.timeoutMs))
    : DEFAULT_REQUEST_TIMEOUT_MS;
  const headers = {
    "X-Requested-With": "XMLHttpRequest",
    ...(options.headers || {}),
  };
  const headerHasContentType = Object.keys(headers).some((name) => name.toLowerCase() === "content-type");
  const hasBody = options.body !== undefined && options.body !== null;
  const isFormDataBody = typeof FormData !== "undefined" && options.body instanceof FormData;
  if (hasBody && !headerHasContentType && !isFormDataBody) {
    headers["Content-Type"] = "application/json";
  }

  if (isMutation) {
    const csrfToken = await ensureCsrfToken(options._forceRefreshCsrf);
    if (csrfToken) {
      headers["X-CSRF-Token"] = csrfToken;
    }
  }

  const hasCustomSignal = Boolean(options.signal);
  const controller = typeof AbortController !== "undefined" && !hasCustomSignal
    ? new AbortController()
    : null;
  let timeoutId = null;
  if (controller && typeof globalThis.setTimeout === "function") {
    timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  }

  try {
    const response = await fetch(endpoint, {
      credentials: "include",
      ...options,
      method,
      headers,
      signal: options.signal || controller?.signal,
    });
    const payload = await parseResponse(response);
    if (!response.ok) {
      // Auto-retry once on 403 CSRF mismatch
      if (
        response.status === 403
        && String(payload?.message || "").toLowerCase().includes("csrf")
        && !options._retriedCsrf
      ) {
        return requestJson(endpoint, {
          ...options,
          _forceRefreshCsrf: true,
          _retriedCsrf: true,
        });
      }

      return {
        ok: false,
        status: response.status,
        ...payload,
      };
    }
    return {
      ok: true,
      ...payload,
    };
  } catch (error) {
    if (error?.name === "AbortError") {
      return {
        ok: false,
        status: 0,
        message: "request-timeout",
      };
    }
    return {
      ok: false,
      status: 0,
      message: "network-error",
    };
  } finally {
    if (timeoutId) {
      globalThis.clearTimeout?.(timeoutId);
    }
  }
}

export {
  ensureCsrfToken,
  requestJson,
};
