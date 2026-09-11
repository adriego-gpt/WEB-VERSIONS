import test from "node:test";
import assert from "node:assert/strict";
import { pruneSelection } from "../../src/domain/admin/selection.js";

test("selection pruning preserves identity when no item changed", () => {
  const previous = ["one", "two"];
  const next = pruneSelection(previous, new Set(["one", "two", "three"]));
  assert.equal(next, previous);
});

test("selection pruning removes records no longer visible", () => {
  const previous = ["one", "two", "three"];
  assert.deepEqual(pruneSelection(previous, ["one", "three"]), ["one", "three"]);
});
