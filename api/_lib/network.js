// OWASP REST Security: bound upstream calls, including response body reads.
export function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  const timeout = AbortSignal.timeout(Math.max(1, Math.min(30000, Number(timeoutMs) || 8000)));
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  return fetch(url, { ...options, signal });
}
