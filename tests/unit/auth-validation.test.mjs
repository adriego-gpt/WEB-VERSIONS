import assert from "node:assert/strict";
import test from "node:test";

import { buildAuthValidation } from "../../src/utils/auth.js";
import adminSessionHandler from "../../api/admin-session.js";

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

test("admin session remains configured when email is the only identifier", async () => {
  const previous = {
    ADMIN_USERNAME: process.env.ADMIN_USERNAME,
    ADMIN_EMAIL: process.env.ADMIN_EMAIL,
    ADMIN_PASSWORD_SALT: process.env.ADMIN_PASSWORD_SALT,
    ADMIN_PASSWORD_HASH: process.env.ADMIN_PASSWORD_HASH,
    ADMIN_SESSION_SECRET: process.env.ADMIN_SESSION_SECRET,
  };
  delete process.env.ADMIN_USERNAME;
  process.env.ADMIN_EMAIL = "admin@example.test";
  process.env.ADMIN_PASSWORD_SALT = "test-salt";
  process.env.ADMIN_PASSWORD_HASH = "test-hash";
  process.env.ADMIN_SESSION_SECRET = "test-session-secret-long-enough";

  let statusCode = 0;
  let payload = null;
  const responseHeaders = new Map();
  const req = { method: "GET", query: { action: "status" }, headers: { host: "localhost:5173" }, socket: { remoteAddress: "127.0.0.1" } };
  const res = {
    setHeader(name, value) { responseHeaders.set(String(name).toLowerCase(), value); },
    getHeader(name) { return responseHeaders.get(String(name).toLowerCase()); },
    status(code) { statusCode = code; return this; },
    json(value) { payload = value; return this; },
    end() { return this; },
  };

  try {
    await adminSessionHandler(req, res);
    assert.equal(statusCode, 200);
    assert.equal(payload?.ok, true);
    assert.equal(payload?.isAdmin, false);
  } finally {
    Object.entries(previous).forEach(([key, value]) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
  }
});
