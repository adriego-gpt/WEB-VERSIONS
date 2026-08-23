import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const componentPath = path.resolve(currentDirectory, "../../src/components/orders/OrderReferenceModal.jsx");

test("la referencia visual cumple el contrato de React.lazy y tolera pedidos antiguos", async () => {
  const source = await fs.readFile(componentPath, "utf8");
  assert.match(source, /export default OrderReferenceModal;/);
  assert.match(source, /Array\.isArray\(order\.items\)/);
  assert.match(source, /normalizeImageSource\(item\.image\) \|\| FALLBACK_IMAGE/);
  assert.match(source, /event\.stopImmediatePropagation\(\)/);
  assert.match(source, /returnFocusTo instanceof HTMLElement/);
  assert.match(source, /closeButtonRef\.current\?\.focus\(\)/);
});
