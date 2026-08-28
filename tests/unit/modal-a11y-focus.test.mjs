import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("modal accessibility keeps the focused field mounted while callbacks change", () => {
  const content = fs.readFileSync("src/hooks/useModalA11y.js", "utf8");

  assert.match(
    content,
    /const onCloseRef = useRef\(onClose\);/,
    "The latest close callback must be stored without restarting the focus effect.",
  );
  assert.match(
    content,
    /onCloseRef\.current = onClose;/,
    "Escape must still invoke the latest close callback.",
  );
  assert.match(
    content,
    /\}, \[open\]\);/,
    "The focus effect must run only when the modal opens or closes, not on each field change.",
  );
  assert.doesNotMatch(
    content,
    /\}, \[open, onClose,/,
    "Changing a callback while typing must not restore focus to the trigger.",
  );
});
