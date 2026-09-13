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
  const contentType = String(response?.headers?.get?.("content-type") || "").toLowerCase().split(";")[0].trim();
  if (contentType !== "application/json" && !(contentType.startsWith("application/") && contentType.endsWith("+json"))) return { ok: false, message: "invalid-response" };
  try {
    const payload = await response.json();
    return payload && typeof payload === "object" && !Array.isArray(payload)
      ? payload : { ok: false, message: "invalid-response" };
  } catch {
    return { ok: false, message: "invalid-response" };
  }
}

async function ensureCsrfToken(forceRefresh = false) {
  if (!forceRefresh) {
    const existing = getClientCsrfToken();
    if (existing) return existing;
  }

  if (!csrfBootstrapPromise) {
    csrfBootstrapPromise = (async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000);
      try {
        const res = await fetch("/api/csrf-token", {
          method: "GET", credentials: "include", signal: controller.signal,
          headers: { "X-Requested-With": "XMLHttpRequest" },
        });
        if (!res.ok) return getClientCsrfToken();
        try {
          const payload = await res.json();
          if (typeof payload?.token === "string" && payload.token) {
            inMemoryCsrfToken = payload.token;
            return inMemoryCsrfToken;
          }
        } catch {
          // ignore
        }
        return getClientCsrfToken();
      } finally {
        clearTimeout(timer);
      }
    })()
      .catch(() => getClientCsrfToken())
      .finally(() => {
        csrfBootstrapPromise = null;
      });
  }

  const fetchedToken = await csrfBootstrapPromise;
  return fetchedToken || getClientCsrfToken();
}

function waitForBootstrap(promise, signal) {
  if (!signal) return promise;
  return new Promise((resolve, reject) => {
    const abort = () => { signal.removeEventListener("abort", abort); reject(new DOMException("Aborted", "AbortError")); };
    if (signal.aborted) { abort(); return; }
    signal.addEventListener("abort", abort, { once: true });
    promise.then((value) => { signal.removeEventListener("abort", abort); resolve(value); }, (error) => { signal.removeEventListener("abort", abort); reject(error); });
  });
}

async function requestJson(endpoint, options = {}) {
  const method = String(options.method || "GET").toUpperCase();
  const isMutation = !["GET", "HEAD", "OPTIONS"].includes(method);
  const timeoutMs = Number.isFinite(Number(options.timeoutMs))
    ? Math.max(1000, Number(options.timeoutMs))
    : DEFAULT_REQUEST_TIMEOUT_MS;
  const deadlineMs = options._deadlineMs || Date.now() + timeoutMs;
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

  const controller = typeof AbortController !== "undefined"
    ? new AbortController()
    : null;
  const abortFromCaller = () => controller?.abort();
  options.signal?.addEventListener?.("abort", abortFromCaller, { once: true });
  if (options.signal?.aborted) abortFromCaller();
  let timeoutId = null;
  if (controller && typeof globalThis.setTimeout === "function") {
    timeoutId = globalThis.setTimeout(() => controller.abort(), Math.max(0, deadlineMs - Date.now()));
  }

  try {
    if (isMutation) {
      const csrfToken = await waitForBootstrap(ensureCsrfToken(options._forceRefreshCsrf), controller?.signal || options.signal);
      if (csrfToken) headers["X-CSRF-Token"] = csrfToken;
    }
    if (controller?.signal.aborted) {
      return { ok: false, status: 0, message: options.signal?.aborted ? "request-cancelled" : "request-timeout" };
    }
    const response = await fetch(endpoint, {
      credentials: "include",
      ...options,
      method,
      headers,
      signal: controller?.signal || options.signal,
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
          _deadlineMs: deadlineMs,
        });
      }

      return {
        ...payload,
        ok: false,
        status: response.status,
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
        message: options.signal?.aborted ? "request-cancelled" : "request-timeout",
      };
    }
    return {
      ok: false,
      status: 0,
      message: "network-error",
    };
  } finally {
    options.signal?.removeEventListener?.("abort", abortFromCaller);
    if (timeoutId) {
      globalThis.clearTimeout?.(timeoutId);
    }
  }
}

export {
  ensureCsrfToken,
  requestJson,
};
