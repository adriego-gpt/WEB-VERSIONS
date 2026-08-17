/**
 * Authentication form validation and helpers.
 */
import { PASSWORD_SECURITY, AUTH_FORM_DEFAULTS, AUTH_FIELD_LIMITS } from "../constants";
import { sanitizeLine, normalizeEmail } from "./sanitizers";
import { normalizeUserPhoneNumber } from "./phone";
import { isValidEmail } from "./url";

export function hasStrongPassword(value = "") {
  const candidate = String(value);
  if (candidate.length < PASSWORD_SECURITY.minLength) return false;
  const hasLetter = /[A-Za-z]/.test(candidate);
  const hasNumber = /\d/.test(candidate);
  return hasLetter && hasNumber;
}

export function normalizeUsername(value = "") {
  return sanitizeLine(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9._-]/g, "")
    .slice(0, AUTH_FIELD_LIMITS.username);
}

export function buildUsernameFromAuth({ email = "", name = "" } = {}) {
  const emailAlias = normalizeEmail(email).split("@")[0] || "";
  const nameAlias = sanitizeLine(name).replace(/\s+/g, "").toLowerCase();
  return normalizeUsername(emailAlias || nameAlias || "");
}

export function getPasswordChecks(value = "") {
  const candidate = String(value || "");
  const checks = {
    minLength: candidate.length >= PASSWORD_SECURITY.minLength,
    hasLetter: /[A-Za-z]/.test(candidate),
    hasNumber: /\d/.test(candidate),
  };
  return {
    ...checks,
    isStrong: checks.minLength && checks.hasLetter && checks.hasNumber,
    strengthScore: [checks.minLength, checks.hasLetter, checks.hasNumber].filter(Boolean).length,
  };
}

export function buildAuthValidation(mode = "login", form = AUTH_FORM_DEFAULTS) {
  const isRegister = mode === "register";
  const isForgot = mode === "forgot";
  const isReset = mode === "reset";
  const name = sanitizeLine(form.name || "").slice(0, AUTH_FIELD_LIMITS.name);
  const email = normalizeEmail(form.email || "").slice(0, AUTH_FIELD_LIMITS.email);
  const phone = normalizeUserPhoneNumber(form.phone || "");
  const username = normalizeUsername(form.username || buildUsernameFromAuth({ email, name }));
  const identifier = sanitizeLine(form.email || form.username || "").slice(0, AUTH_FIELD_LIMITS.email);
  const password = String(form.password || "").slice(0, AUTH_FIELD_LIMITS.password);
  const confirmPassword = String(form.confirmPassword || "").slice(0, AUTH_FIELD_LIMITS.password);
  const resetToken = sanitizeLine(form.resetToken || "").slice(0, AUTH_FIELD_LIMITS.resetToken);
  const passwordChecks = getPasswordChecks(password);
  const fieldErrors = {};

  if (isRegister) {
    if (!name || name.length < 2) fieldErrors.name = "Ingresa tu nombre completo.";
    if (!isValidEmail(email)) fieldErrors.email = "Ingresa un correo electronico valido.";
    if (phone && phone.length !== AUTH_FIELD_LIMITS.phone) fieldErrors.phone = "Ingresa 10 digitos de telefono.";
    if (!passwordChecks.isStrong) {
      fieldErrors.password = `La contrasena debe tener minimo ${PASSWORD_SECURITY.minLength} caracteres, letras y numeros.`;
    }
    if (!confirmPassword) {
      fieldErrors.confirmPassword = "Confirma tu contrasena.";
    } else if (confirmPassword !== password) {
      fieldErrors.confirmPassword = "Las contrasenas no coinciden.";
    }
  } else if (isForgot) {
    if (!isValidEmail(email)) fieldErrors.email = "Ingresa un correo electronico valido.";
  } else if (isReset) {
    if (!isValidEmail(email)) fieldErrors.email = "Ingresa un correo electronico valido.";
    if (resetToken.length < 20) fieldErrors.resetToken = "El enlace o token no es valido.";
    if (!passwordChecks.isStrong) {
      fieldErrors.password = `La nueva contrasena debe tener minimo ${PASSWORD_SECURITY.minLength} caracteres, letras y numeros.`;
    }
    if (!confirmPassword) {
      fieldErrors.confirmPassword = "Confirma tu nueva contrasena.";
    } else if (confirmPassword !== password) {
      fieldErrors.confirmPassword = "Las contrasenas no coinciden.";
    }
  } else {
    if (!identifier) fieldErrors.email = "Ingresa tu correo o usuario.";
    if (!password) fieldErrors.password = "Ingresa tu contrasena.";
  }

  const firstError = fieldErrors.name
    || fieldErrors.email
    || fieldErrors.phone
    || fieldErrors.resetToken
    || fieldErrors.password
    || fieldErrors.confirmPassword
    || "";
  const hasAnyFieldError = Object.keys(fieldErrors).length > 0;
  const hasBaseSubmitFields = isRegister
    ? Boolean(name && email && password && confirmPassword)
    : isForgot
      ? Boolean(email)
      : isReset
        ? Boolean(email && resetToken && password && confirmPassword)
        : Boolean(identifier && password);

  return {
    isRegister,
    isForgot,
    isReset,
    fieldErrors,
    firstError,
    hasAnyFieldError,
    canSubmit: !hasAnyFieldError && hasBaseSubmitFields,
    passwordChecks,
    passwordStrengthPercent: Math.round((passwordChecks.strengthScore / 3) * 100),
    registerPayload: {
      name,
      email,
      phone,
      username,
      password,
      confirmPassword,
    },
    forgotPayload: {
      email,
    },
    resetPayload: {
      email,
      token: resetToken,
      password,
      confirmPassword,
    },
    loginPayload: {
      identifier,
      password,
    },
  };
}
