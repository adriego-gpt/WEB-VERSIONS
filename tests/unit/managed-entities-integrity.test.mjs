import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeAdminCatalogPayload, sanitizeManagedEntities } from '../../api/_lib/storeSanitizers.js';

function normalizeOptionLabel(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function slugify(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeManagedEntity(entry, prefix = "item") {
  if (typeof entry === "string") {
    const name = normalizeOptionLabel(entry);
    const slug = slugify(name);
    return {
      id: `${prefix}-${slug || "item"}`,
      name,
      slug,
      active: true,
      draftName: name,
      draftSlug: slug,
    };
  }
  const name = normalizeOptionLabel(entry?.name || entry?.label || "");
  const slug = slugify(entry?.slug || name);
  return {
    id: String(entry?.id || `${prefix}-${slug || "item"}`),
    name,
    slug,
    active: entry?.active !== false,
    draftName: normalizeOptionLabel(entry?.draftName || name),
    draftSlug: slugify(entry?.draftSlug || slug),
  };
}

function buildManagedEntities(rawEntries = null, fallbackNames = [], discoveredNames = [], prefix = "item") {
  const sourceEntries = Array.isArray(rawEntries)
    ? rawEntries
    : [...(fallbackNames || []), ...(discoveredNames || [])];

  const map = new Map();
  sourceEntries.forEach((item) => {
    const entry = normalizeManagedEntity(item, prefix);
    if (!entry.name) return;
    const key = entry.name.toLowerCase();
    if (!map.has(key)) {
      map.set(key, entry);
      return;
    }
    const previous = map.get(key);
    map.set(key, {
      ...previous,
      id: previous.id || entry.id,
      active: previous.active ?? entry.active,
      slug: previous.slug || entry.slug,
      draftName: previous.draftName || previous.name || entry.name,
      draftSlug: previous.draftSlug || previous.slug || entry.slug,
    });
  });

  return Array.from(map.values());
}

describe('Managed Entities & Resurrection Prevention', () => {
  const DEFAULT_TYPES = ["Cortas", "Largas", "3/4", "Pao", "Licras", "Blazers", "Vestidos", "Camisas", "Pantalones", "Tops", "Chaquetas"];

  test('1. Cold start: when rawEntries is null, fallbackNames are populated', () => {
    const records = buildManagedEntities(null, DEFAULT_TYPES, [], "product-type");
    assert.equal(records.length, DEFAULT_TYPES.length);
    assert.equal(records[0].name, "Cortas");
    assert.ok(records.some((r) => r.name === "Blazers"));
  });

  test('2. Authoritative empty array: when admin deletes all types, [] remains empty and does NOT revive defaults', () => {
    const records = buildManagedEntities([], DEFAULT_TYPES, ["Cortas", "Largas"], "product-type");
    assert.deepEqual(records, [], "An empty array must remain empty without resurrecting defaults");
  });

  test('3. Deletion persistence: deleted type does NOT resurrect when server reconciles catalog', () => {
    const initialRecords = [
      { id: "product-type-camisas", name: "Camisas", slug: "camisas", active: true },
      { id: "product-type-blazers", name: "Blazers", slug: "blazers", active: true },
      { id: "product-type-pantalones", name: "Pantalones", slug: "pantalones", active: true },
    ];

    const remainingRecords = initialRecords.filter((r) => r.name !== "Blazers");
    assert.equal(remainingRecords.length, 2);

    const reconciled = buildManagedEntities(remainingRecords, DEFAULT_TYPES, ["Blazers", "Camisas"], "product-type");
    assert.equal(reconciled.length, 2);
    assert.ok(!reconciled.some((r) => r.name === "Blazers"), "Deleted 'Blazers' must not be resurrected");
    assert.ok(reconciled.some((r) => r.name === "Camisas"));
    assert.ok(reconciled.some((r) => r.name === "Pantalones"));
  });

  test('4. Filter tags: deleted tag does NOT resurrect on rehydration', () => {
    const initialTags = [
      { id: "filter-tag-algodon", name: "Algodón", slug: "algodon", active: true },
      { id: "filter-tag-verano", name: "Verano", slug: "verano", active: true },
    ];

    const afterDelete = initialTags.filter((t) => t.name !== "Verano");

    const reconciled = buildManagedEntities(afterDelete, [], ["Verano", "Casual"], "filter-tag");
    assert.equal(reconciled.length, 1);
    assert.equal(reconciled[0].name, "Algodón");
    assert.ok(!reconciled.some((t) => t.name === "Verano"), "Deleted tag 'Verano' must not resurrect");
  });

  test('5. Backend sanitizers: sanitizeAdminCatalogPayload preserves empty or pruned records', () => {
    const payload = sanitizeAdminCatalogPayload({
      productTypeRecords: [
        { id: "pt-1", name: "Vestidos", slug: "vestidos", active: true },
      ],
      filterTagRecords: [],
    });

    assert.equal(payload.productTypeRecords.length, 1);
    assert.equal(payload.productTypeRecords[0].name, "Vestidos");
    assert.deepEqual(payload.filterTagRecords, []);
  });
});
