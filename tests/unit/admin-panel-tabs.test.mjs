import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("Admin Panel Integrity and Tab Completeness", async (t) => {
  const content = fs.readFileSync("src/components/admin/AdminPanelModal.jsx", "utf8");

  await t.test("1. All lucide-react icons used in JSX are explicitly imported", () => {
    // Extract JSX tag names starting with uppercase
    const tags = [...new Set([...content.matchAll(/<([A-Z][a-zA-Z0-9]+)/g)].map((m) => m[1]))];
    const importBlock = content.slice(0, content.indexOf("function getOrderAgeMinutes"));

    for (const tag of tags) {
      if (tag === "Motion" || tag === "AnimatePresence") {
        assert.ok(importBlock.includes("framer-motion"), `framer-motion import missing for ${tag}`);
        continue;
      }
      const isImported = new RegExp(`\\b${tag}\\b`).test(importBlock);
      assert.ok(isImported, `Icon or component <${tag}> is used in JSX but missing from imports in AdminPanelModal.jsx`);
    }
  });

  await t.test("2. Tab 'portada' is present in tabGroups and labeled clearly", () => {
    assert.ok(content.includes('id: "portada"'), "Tab ID 'portada' must exist");
    assert.ok(content.includes('label: "Portada y Envíos"'), "Tab label must mention Portada y Envíos");
  });

  await t.test("3. Shipping settings section is present and includes all required fields", () => {
    assert.ok(content.includes("Tarifas de Envío y Despacho"), "Shipping rates title must exist");
    assert.ok(content.includes("shippingEnabled"), "Shipping enabled toggle must exist");
    assert.ok(content.includes("localShippingCity"), "Local shipping city field must exist");
    assert.ok(content.includes("localShippingCost"), "Local shipping cost field must exist");
    assert.ok(content.includes("nationalShippingCost"), "National shipping cost field must exist");
    assert.ok(content.includes("freeShippingThreshold"), "Free shipping threshold field must exist");
  });

  await t.test("4. Every tab has balanced open and closing div wrappers", () => {
    const requiredTabs = ["resumen", "usuarios", "catalogo", "ofertas", "producto", "taxonomias", "cupones", "cuentas", "contacto", "portada", "pedidos", "seguridad"];
    for (const tab of requiredTabs) {
      assert.ok(content.includes(`adminTab === "${tab}"`), `Tab '${tab}' must be handled`);
    }
  });
});
