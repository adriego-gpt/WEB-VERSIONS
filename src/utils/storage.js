/**
 * localStorage/sessionStorage read/write/remove helpers.
 */

export function readStorage(key, fallback) {
  if (typeof window === "undefined") return fallback;
  try {
    const stored = window.localStorage.getItem(key);
    return stored ? JSON.parse(stored) : fallback;
  } catch {
    return fallback;
  }
}

export function saveStorage(key, value) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // noop
  }
}

export function removeStorage(key) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
    window.sessionStorage.removeItem(key);
  } catch {
    // noop
  }
}
