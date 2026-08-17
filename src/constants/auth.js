export const PASSWORD_SECURITY = {
  minLength: 8,
};

export const AUTH_FORM_DEFAULTS = Object.freeze({
  name: "",
  email: "",
  phone: "",
  username: "",
  password: "",
  confirmPassword: "",
  resetToken: "",
});

export const AUTH_FIELD_LIMITS = Object.freeze({
  name: 90,
  email: 120,
  username: 40,
  phone: 10,
  password: 96,
  resetToken: 220,
});
