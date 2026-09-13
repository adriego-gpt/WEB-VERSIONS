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
  assert.match(source, /deleteSelectedOrders/);
  assert.match(source, /Eliminar seleccionados/);
  assert.match(source, /orderBulkActionRef/);
});

test("las operaciones masivas persisten en bloques pequeños", async () => {
  const source = await fs.readFile(path.join(root, "src/App.jsx"), "utf8");
  assert.match(source, /bulkDeleteManagedProductTypes/);
  assert.match(source, /bulkDeleteManagedFilterTags/);
  assert.match(source, /bulkSetCatalogVisibility/);
  assert.match(source, /if \(idSet\.size > 25\)/);
  assert.match(source, /for \(const order of selectedOrders\)/);
  const batchDeletion = source.slice(source.indexOf("const bulkDeleteOrders ="), source.indexOf("const deleteOrder ="));
  assert.match(batchDeletion, /await deleteServerOrders\(\{ orderIds: ids \}\)/);
  assert.match(batchDeletion, /await Promise\.all\(pendingSaves\)/);
  assert.match(batchDeletion, /cancelled: true/);
  assert.equal((batchDeletion.match(/requestDestructiveConfirmation\(/g) || []).length, 1);
});

test("eliminación de tipos y tags en panel admin es atómica y no resucita entidades", async () => {
  const source = await fs.readFile(path.join(root, "src/App.jsx"), "utf8");

  // 1. buildManagedEntities treats rawEntries as authoritative when Array is provided
  assert.match(
    source,
    /const sourceEntries = Array\.isArray\(rawEntries\)[\s\S]*?\? rawEntries[\s\S]*?: \[\.\.\.\(fallbackNames \|\| \[\]\), \.\.\.\(discoveredNames \|\| \[\]\)\]/,
    "buildManagedEntities debe tratar rawEntries como autoritativo sin re-inyectar fallbacks si ya es Array"
  );

  // 2. Initial state does not inject dummy demo product tags
  assert.doesNotMatch(
    source,
    /initialProducts\.flatMap\(\(product\) => product\.filterTags/,
    "El estado inicial de filterTagRecords no debe inyectar tags demo de initialProducts"
  );

  // 3. No poisonous useEffect resurrecting entities on products changes
  assert.doesNotMatch(
    source,
    /setProductTypeRecords\(\(previous\) => products\.reduce\(.+productType/,
    "No debe existir useEffect que auto-cree tipos cada vez que cambia products"
  );
  assert.doesNotMatch(
    source,
    /setFilterTagRecords\(\(previous\) => products\.flatMap\(.+filterTags/,
    "No debe existir useEffect que auto-cree tags cada vez que cambia products"
  );

  // 4. deleteManagedProductType and deleteManagedFilterTag update refs and sync immediately
  const deleteTypeFn = source.slice(source.indexOf("const deleteManagedProductType ="), source.indexOf("const bulkSetManagedProductTypesActive ="));
  assert.match(deleteTypeFn, /productTypeRecordsRef\.current = nextRecords;/, "deleteManagedProductType debe actualizar el ref de records");
  assert.match(deleteTypeFn, /productsRef\.current = nextProducts;/, "deleteManagedProductType debe actualizar el ref de products");
  assert.match(deleteTypeFn, /await syncCatalogSnapshot\(/, "deleteManagedProductType debe sincronizar inmediatamente con await");

  const deleteTagFn = source.slice(source.indexOf("const deleteManagedFilterTag ="), source.indexOf("const bulkSetManagedFilterTagsActive ="));
  assert.match(deleteTagFn, /filterTagRecordsRef\.current = nextRecords;/, "deleteManagedFilterTag debe actualizar el ref de records");
  assert.match(deleteTagFn, /productsRef\.current = nextProducts;/, "deleteManagedFilterTag debe actualizar el ref de products");
  assert.match(deleteTagFn, /await syncCatalogSnapshot\(/, "deleteManagedFilterTag debe sincronizar inmediatamente con await");

  // 5. applyCatalogStateFromServer does not inject discoveredNames or PRODUCT_TYPE_OPTIONS into authoritative server arrays
  const serverApply = source.slice(source.indexOf("const applyCatalogStateFromServer ="), source.indexOf("const syncCatalogSnapshot ="));
  assert.match(serverApply, /nextProductTypeRecords/, "applyCatalogStateFromServer debe calcular nextProductTypeRecords y guardarlo en ref");
  assert.match(serverApply, /productTypeRecordsRef\.current = nextProductTypeRecords;/, "applyCatalogStateFromServer debe actualizar el ref");
  assert.match(serverApply, /filterTagRecordsRef\.current = nextFilterTagRecords;/, "applyCatalogStateFromServer debe actualizar el ref de tags");
});

