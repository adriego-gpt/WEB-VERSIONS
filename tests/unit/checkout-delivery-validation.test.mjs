import assert from "node:assert/strict";
import test from "node:test";
import { validateCheckoutDelivery } from "../../src/domain/orders/deliveryValidation.js";

const recipient = { fullName: "María Pérez", phone: "099 123 4567", idNumber: "1234567890", city: "Quito", address: "Av. Principal 123" };

test("el retiro con cuenta no solicita una dirección ni datos adicionales", () => {
  assert.deepEqual(validateCheckoutDelivery({}), {});
});
test("el retiro sin cuenta exige contacto pero no cédula ni dirección", () => {
  assert.deepEqual(Object.keys(validateCheckoutDelivery({}, { guestCheckout: true })).sort(), ["fullName", "phone"]);
  assert.deepEqual(validateCheckoutDelivery(recipient, { guestCheckout: true }), {});
});
test("la entrega identifica cada campo vacío para enfocar y explicar el error", () => {
  assert.deepEqual(Object.keys(validateCheckoutDelivery({}, { deliveryType: "delivery" })).sort(), ["address", "city", "fullName", "idNumber", "phone"]);
  assert.deepEqual(validateCheckoutDelivery(recipient, { deliveryType: "delivery" }), {});
});
test("los espacios y un contacto incompleto no permiten continuar", () => {
  const errors = validateCheckoutDelivery({ ...recipient, fullName: " \n ", phone: "099", city: " \t ", address: " \n " }, { deliveryType: "delivery" });
  assert.deepEqual(Object.keys(errors).sort(), ["address", "city", "fullName", "phone"]);
});
test("RUC válido y referencia opcional no bloquean una dirección completa", () => {
  assert.deepEqual(validateCheckoutDelivery({ ...recipient, idNumber: "1234567890001", reference: "" }, { deliveryType: "delivery" }), {});
  assert.ok(validateCheckoutDelivery({ ...recipient, idNumber: "123" }, { deliveryType: "delivery" }).idNumber);
});
