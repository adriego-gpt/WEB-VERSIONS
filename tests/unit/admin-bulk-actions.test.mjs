import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(currentDirectory, "../..");

test("tipos y tags exponen selección y acciones masivas seguras", async () => {
  const source = await fs.readFile(path.join(root, "src/components/admin/ManagedEntitiesEditor.jsx"), "utf8");
  assert.match(source, /selectedRecordIds/);
  assert.match(source, /onBulkSetActive/);
  assert.match(source, /onBulkDelete/);
  assert.match(source, /Seleccionar todos/);
});

test("inventario y pedidos permiten seleccionar visibles y operar por lote", async () => {
  const source = await fs.readFile(path.join(root, "src/components/admin/AdminPanelModal.jsx"), "utf8");
  assert.match(source, /selectedInventoryProductIds/);
  assert.match(source, /bulkSetCatalogVisibility/);
  assert.match(source, /selectedOrderIds/);
  assert.match(source, /Seleccionamos los primeros 25 pedidos visibles/);
  assert.match(source, /applyBulkOrderStatus/);
});

test("las operaciones masivas persisten en bloques pequeños", async () => {
  const source = await fs.readFile(path.join(root, "src/App.jsx"), "utf8");
  assert.match(source, /bulkDeleteManagedProductTypes/);
  assert.match(source, /bulkDeleteManagedFilterTags/);
  assert.match(source, /bulkSetCatalogVisibility/);
  assert.match(source, /if \(idSet\.size > 25\)/);
  assert.match(source, /for \(const order of selectedOrders\)/);
});
