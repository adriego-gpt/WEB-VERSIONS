import assert from "node:assert/strict";
import test from "node:test";
import { getOrderErasureChanges, sanitizeOrderBackup } from "../../api/_lib/orderErasure.js";

test("eliminar un pedido borra solo su registro y adjuntos, no imágenes compartidas ni catálogo", () => {
  const image = "data:image/png;base64,dGVzdA==";
  const before = {
    products: [{ id: "product", image }],
    orders: [{ id: "test", paymentProof: image }, { id: "real", paymentProof: image }],
  };
  const next = { ...before, orders: [before.orders[1]] };
  const cleaned = sanitizeOrderBackup(before, getOrderErasureChanges(before, next));
  assert.deepEqual(cleaned.orders, [before.orders[1]]);
  assert.deepEqual(cleaned.products, before.products);
  assert.equal(before.orders.length, 2, "el saneamiento no muta el respaldo original");
});

test("quitar o sustituir un comprobante también limpia sus copias anteriores", () => {
  for (const replacement of ["", "data:image/png;base64,bmV3"]) {
    const before = { orders: [{ id: "test", paymentProof: "data:image/png;base64,b2xk", internalNote: "Conservar" }] };
    const next = { orders: [{ ...before.orders[0], paymentProof: replacement }] };
    const cleaned = sanitizeOrderBackup(before, getOrderErasureChanges(before, next));
    assert.equal(cleaned.orders[0].paymentProof, "");
    assert.equal(cleaned.orders[0].internalNote, "Conservar");
    assert.equal(next.orders[0].paymentProof, replacement);
  }
});

test("cambios ajenos a los pedidos no requieren limpiar respaldos", () => {
  const changes = getOrderErasureChanges({ orders: [{ id: "same", paymentProof: "image" }] }, { orders: [{ id: "same", paymentProof: "image", status: "Confirmado" }] });
  assert.equal(changes.deletedOrderIds.size, 0);
  assert.equal(changes.clearedProofOrderIds.size, 0);
  assert.deepEqual(sanitizeOrderBackup({ products: ["keep"] }, changes), { products: ["keep"] });
});
