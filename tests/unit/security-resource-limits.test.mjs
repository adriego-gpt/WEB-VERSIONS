import assert from "node:assert/strict";
import test from "node:test";
import {
  isOriginAllowed,
  normalizeImageSource,
  parseJsonBody,
} from "../../api/_lib/security.js";

test("resource limits reject malformed inline images and oversized parsed JSON", () => {
  assert.equal(normalizeImageSource(`data:image/png,${"A".repeat(2048)}`), "");
  assert.equal(normalizeImageSource("data:image/svg+xml;base64,PHN2Zz4="), "");
  assert.equal(normalizeImageSource("data:image/png;base64,%%%"), "");
  assert.equal(normalizeImageSource("data:image/png;base64,AA=="), "data:image/png;base64,AA==");

  const oversized = parseJsonBody({ payload: "x".repeat(2048) }, { maxBytes: 1024 });
  assert.equal(oversized.__adriegoBodyParseError, "payload-too-large");
});

test("production origin validation fails closed when no allowlist is configured", () => {
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    assert.equal(isOriginAllowed({ headers: { origin: "https://attacker.example" } }, []), false);
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }
});
