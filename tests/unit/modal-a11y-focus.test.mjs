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

test("admin panel locks document body scroll preventing double scrollbars", () => {
  const appContent = fs.readFileSync("src/App.jsx", "utf8");
  assert.match(
    appContent,
    /showAdminPanel && isAdmin/,
    "App.jsx must lock body when admin panel is open",
  );

  const adminContent = fs.readFileSync("src/components/admin/AdminPanelModal.jsx", "utf8");
  assert.match(
    adminContent,
    /useBodyScrollLock\(open !== false\)/,
    "AdminPanelModal must lock body scroll when open",
  );

  const cssContent = fs.readFileSync("src/App.css", "utf8");
  assert.match(
    cssContent,
    /html:has\(\.admin-workspace-root\),\s*body:has\(\.admin-workspace-root\)\s*\{[\s\S]*?overflow:\s*hidden\s*!important/i,
    "CSS must isolate root scrollbar when admin workspace is active",
  );
});

test("closeAdminPanel navigates directly to storefront without back history traps", () => {
  const appContent = fs.readFileSync("src/App.jsx", "utf8");
  const startIndex = appContent.indexOf("const closeAdminPanel = useCallback");
  const endIndex = appContent.indexOf("const requestDestructiveConfirmation", startIndex);
  const closeAdminBody = appContent.slice(startIndex, endIndex);

  assert.match(
    closeAdminBody,
    /setShowAdminPanel\(false\);[\s\S]*?setPathname\("\/"\);/,
    "closeAdminPanel must synchronously reset pathname to '/' and close panel in 1 click",
  );
  assert.doesNotMatch(
    closeAdminBody,
    /window\.history\.back\(\)/,
    "closeAdminPanel must not rely on history.back() which creates double-click loops",
  );
});

