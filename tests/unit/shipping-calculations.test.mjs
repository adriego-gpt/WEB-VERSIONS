import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateFreeShippingProgress,
  calculateShippingFee,
  normalizeShippingSettings,
} from "../../src/domain/orders/shippingSettings.js";

test("Shipping Calculations & Free Shipping Progress", async (t) => {
  const customSettings = {
    shippingEnabled: true,
    freeShippingThreshold: 50,
    localShippingCost: 3.5,
    nationalShippingCost: 5.5,
    localShippingCity: "Quito",
  };

  await t.test("1. Pickup is always 0 shipping cost", () => {
    const result = calculateShippingFee({
      subtotal: 20,
      deliveryType: "pickup",
      deliveryCity: "Quito",
      shippingSettings: customSettings,
    });
    assert.equal(result.shippingCost, 0);
    assert.equal(result.isFree, true);
    assert.equal(result.reason, "pickup");
  });

  await t.test("2. Local delivery charges local rate when under threshold", () => {
    const result = calculateShippingFee({
      subtotal: 30,
      deliveryType: "delivery",
      deliveryCity: "Quito Norte",
      shippingSettings: customSettings,
    });
    assert.equal(result.shippingCost, 3.5);
    assert.equal(result.isFree, false);
    assert.equal(result.reason, "local");
  });

  await t.test("3. National delivery charges national rate when under threshold", () => {
    const result = calculateShippingFee({
      subtotal: 30,
      deliveryType: "delivery",
      deliveryCity: "Guayaquil",
      shippingSettings: customSettings,
    });
    assert.equal(result.shippingCost, 5.5);
    assert.equal(result.isFree, false);
    assert.equal(result.reason, "national");
  });

  await t.test("4. Free shipping applies when subtotal reaches threshold", () => {
    const result = calculateShippingFee({
      subtotal: 55,
      deliveryType: "delivery",
      deliveryCity: "Cuenca",
      shippingSettings: customSettings,
    });
    assert.equal(result.shippingCost, 0);
    assert.equal(result.isFree, true);
    assert.equal(result.reason, "threshold_reached");
  });

  await t.test("5. Free shipping progress calculates remaining and percentage", () => {
    const progress1 = calculateFreeShippingProgress({
      subtotal: 25,
      shippingSettings: customSettings,
    });
    assert.equal(progress1.eligible, true);
    assert.equal(progress1.remaining, 25);
    assert.equal(progress1.progressPercent, 50);
    assert.equal(progress1.isFree, false);

    const progress2 = calculateFreeShippingProgress({
      subtotal: 50,
      shippingSettings: customSettings,
    });
    assert.equal(progress2.remaining, 0);
    assert.equal(progress2.progressPercent, 100);
    assert.equal(progress2.isFree, true);
  });

  await t.test("6. normalizeShippingSettings falls back to safe defaults on invalid payload", () => {
    const normalized = normalizeShippingSettings(null);
    assert.equal(typeof normalized.shippingEnabled, "boolean");
    assert.equal(typeof normalized.freeShippingThreshold, "number");
    assert.equal(typeof normalized.localShippingCost, "number");
    assert.equal(typeof normalized.nationalShippingCost, "number");
  });
});
