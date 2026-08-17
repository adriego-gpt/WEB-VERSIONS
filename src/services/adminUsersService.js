import { requestJson } from "./httpClient";
import { cachedRequest, invalidateCachedRequest } from "./smartCache";

const ADMIN_USERS_ENDPOINT = "/api/admin-users";
const ADMIN_USERS_CACHE_KEY = "admin:users:list";

function requestAdminUsers(action, options = {}) {
  return requestJson(`${ADMIN_USERS_ENDPOINT}?action=${action}`, options);
}

function postAdminUsers(action, payload = {}) {
  return requestAdminUsers(action, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

function listAdminUsers(options = {}) {
  const {
    force = false,
    preferCache = true,
    maxAgeMs = 25000,
  } = options;
  return cachedRequest(
    ADMIN_USERS_CACHE_KEY,
    () => requestAdminUsers("list", {
      method: "GET",
    }),
    {
      force,
      preferCache,
      maxAgeMs,
      persist: true,
    },
  );
}

function updateAdminUserRecord(payload = {}) {
  return postAdminUsers("update", payload).then((response) => {
    if (response?.ok) {
      invalidateCachedRequest(ADMIN_USERS_CACHE_KEY);
    }
    return response;
  });
}

function deleteAdminUserRecord(payload = {}) {
  return postAdminUsers("delete", payload).then((response) => {
    if (response?.ok) {
      invalidateCachedRequest(ADMIN_USERS_CACHE_KEY);
    }
    return response;
  });
}

function sendAdminUserPasswordResetLink(payload = {}) {
  return postAdminUsers("send-reset-link", payload);
}

function generateAdminUserPasswordResetLink(payload = {}) {
  return postAdminUsers("generate-reset-link", payload);
}

export {
  listAdminUsers,
  updateAdminUserRecord,
  deleteAdminUserRecord,
  sendAdminUserPasswordResetLink,
  generateAdminUserPasswordResetLink,
};
