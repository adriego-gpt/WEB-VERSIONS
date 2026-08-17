import { requestJson } from "./httpClient";

const ADMIN_SESSION_ENDPOINT = "/api/admin-session";

function requestAdminSession(action, options = {}) {
  return requestJson(`${ADMIN_SESSION_ENDPOINT}?action=${action}`, options);
}

function postAdminSession(action, payload = {}) {
  return requestAdminSession(action, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

function getAdminSessionStatus() {
  return requestAdminSession("status", {
    method: "GET",
  });
}

function loginAdminSession(identifier, password) {
  return postAdminSession("login", {
    identifier,
    password,
  });
}

function touchAdminSession() {
  return postAdminSession("touch");
}

function logoutAdminSession() {
  return postAdminSession("logout");
}

export {
  getAdminSessionStatus,
  loginAdminSession,
  touchAdminSession,
  logoutAdminSession,
};
