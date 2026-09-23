import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

const source = await fs.readFile(new URL("../../src/components/modals/LegalModal.jsx", import.meta.url), "utf8");
const exchanges = source.slice(source.indexOf('{currentTab === "exchanges"'), source.indexOf('{currentTab === "privacy"'));
const terms = source.slice(source.indexOf('{currentTab === "terms"'), source.indexOf('{currentTab === "cookies"'));
const cookies = source.slice(source.indexOf('{currentTab === "cookies"'));

test("restores direct commercial exchange policy without removing legal exceptions", () => {
  for (const label of ["POLÍTICA COMERCIAL: SOLO CAMBIOS", "7 días calendario", "1. Condiciones para solicitar un cambio", "2. Modalidad del cambio", "3. Gastos de transporte y envío"]) assert.ok(exchanges.includes(label));
  assert.match(exchanges, /VENTA FINAL/);
  assert.match(exchanges, /quince \(15\) días/);
  assert.match(exchanges, /defectos o errores del pedido/);
  assert.match(exchanges, /no limitan los cambios o devoluciones exigidos por ley/);
  assert.doesNotMatch(exchanges, /bajo ninguna circunstancia/);
});
test("numbered purchase terms accurately describe five-minute checkout holds", () => {
  for (const title of ["1. Aceptación de los términos", "2. Precios y disponibilidad", "3. Procesamiento y despacho de pedidos", "4. Reserva de stock"]) assert.ok(terms.includes(title));
  assert.match(terms, /5 minutos/);
  assert.match(terms, /Recargar la página no reinicia ese plazo/);
  assert.match(terms, /no vuelvas a pagar/);
});
test("updated cookies and privacy disclosures remain intact", () => {
  for (const text of ["30 días", "12 horas", "72 horas", "6 horas", "identificador de reserva de stock", "Google puede utilizar cookies", "Umami no utiliza cookies", "Do Not Track"]) assert.ok(cookies.includes(text));
  for (const text of ["avisos de pedidos por Telegram", "conservamos el comprobante", "Superintendencia de Protección de Datos Personales"]) assert.ok(source.includes(text));
  for (const text of ["texto de búsqueda", "códigos de pedido", "22 de septiembre de 2026"]) assert.ok(source.includes(text));
  assert.match(source, /useOverlayHistory\(/);
  assert.match(source, /useModalA11y\(/);
});
