import assert from "node:assert/strict";
import test from "node:test";
import { getNextOrderAction, getOrderSlaMeta } from "../../src/domain/orders/orderAttention.js";

const now = Date.parse("2026-09-21T18:00:00.000Z");
const orderAt = (status, minutesAgo, deliveryType = "delivery") => ({
  status,
  deliveryType,
  createdAt: new Date(now - minutesAgo * 60000).toISOString(),
});

test("la vista en riesgo no incluye pedidos confirmados recientes", () => {
  assert.equal(getOrderSlaMeta(orderAt("Confirmado", 60), now).tone, "success");
  assert.equal(getOrderSlaMeta(orderAt("Preparando", 60), now).tone, "success");
  assert.equal(getOrderSlaMeta(orderAt("Preparando", 24 * 60), now).tone, "danger");
  assert.equal(getOrderSlaMeta(orderAt("Entregado", 24 * 60), now).tone, "neutral");
});

test("los pendientes urgentes siguen visibles y la siguiente acción respeta retiro y entrega", () => {
  assert.equal(getOrderSlaMeta(orderAt("Pendiente", 29), now).tone, "success");
  assert.equal(getOrderSlaMeta(orderAt("Pendiente", 30), now).tone, "warning");
  assert.equal(getOrderSlaMeta(orderAt("Pendiente", 90), now).tone, "danger");
  assert.deepEqual(getNextOrderAction("Preparando", "pickup"), { label: "Marcar listo para retiro", status: "Listo para retiro" });
  assert.deepEqual(getNextOrderAction("Preparando", "delivery"), { label: "Registrar envío", status: "Enviado" });
  assert.equal(getNextOrderAction("Cancelado"), null);
});

test("un pedido sin fecha no se muestra como reciente", () => {
  assert.equal(getOrderSlaMeta({ status: "Pendiente" }, now).tone, "warning");
});
