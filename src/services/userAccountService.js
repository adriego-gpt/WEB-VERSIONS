import { requestJson } from "./httpClient";

const USER_AUTH_ENDPOINT = "/api/user-auth";

function requestUserAuth(action, options = {}) {
  return requestJson(`${USER_AUTH_ENDPOINT}?action=${action}`, options);
}

function postUserAuth(action, payload = {}) {
  return requestUserAuth(action, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

function getUserSessionStatus() {
  return requestUserAuth("status", {
    method: "GET",
  });
}

function registerUserAccount(payload) {
  return postUserAuth("register", payload);
}

function loginUserAccount(payload) {
  return postUserAuth("login", payload);
}

function logoutUserAccount() {
  return postUserAuth("logout");
}

function updateUserProfile(payload) {
  return postUserAuth("update-profile", payload);
}

function syncUserAccountState(payload) {
  return postUserAuth("sync-state", payload);
}

function changeUserPassword(payload) {
  return postUserAuth("change-password", payload);
}

function requestUserPasswordReset(payload) {
  return postUserAuth("request-password-reset", payload);
}

function confirmUserPasswordReset(payload) {
  return postUserAuth("confirm-password-reset", payload);
}

export {
  getUserSessionStatus,
  registerUserAccount,
  loginUserAccount,
  logoutUserAccount,
  updateUserProfile,
  syncUserAccountState,
  changeUserPassword,
  requestUserPasswordReset,
  confirmUserPasswordReset,
};
