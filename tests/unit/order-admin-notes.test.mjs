import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeOrderPatch } from "../../api/_lib/storeSanitizers.js";

test("las notas internas de pedidos se aceptan, limpian y limitan", () => {
  const result = sanitizeOrderPatch({
    internalNote: `<script>alert("x")</script>${"a".repeat(700)}`,
    unknownAdministrativeField: "ignored",
  });

  assert.equal(typeof result.internalNote, "string");
  assert.ok(result.internalNote.length <= 600);
  assert.doesNotMatch(result.internalNote, /<script>/i);
  assert.equal("unknownAdministrativeField" in result, false);
});

test("una nota interna vacía permite limpiar el campo", () => {
  assert.deepEqual(sanitizeOrderPatch({ internalNote: "" }), { internalNote: "" });
});
