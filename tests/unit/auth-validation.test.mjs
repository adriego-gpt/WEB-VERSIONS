import assert from "node:assert/strict";
import test from "node:test";

import { buildAuthValidation } from "../../src/utils/auth.js";

test("login accepts an administrator username as the identifier", () => {
  const validation = buildAuthValidation("login", {
    email: "Adriego-admin@1969",
    password: "ValidLoginPassword123",
  });

  assert.equal(validation.canSubmit, true);
  assert.equal(validation.firstError, "");
  assert.deepEqual(validation.loginPayload, {
    identifier: "Adriego-admin@1969",
    password: "ValidLoginPassword123",
  });
});

test("login reports the missing credentials before submitting", () => {
  const validation = buildAuthValidation("login", {
    email: "",
    password: "",
  });

  assert.equal(validation.canSubmit, false);
  assert.equal(validation.firstError, "Ingresa tu correo o usuario.");
  assert.equal(validation.fieldErrors.password, "Ingresa tu contrasena.");
});
