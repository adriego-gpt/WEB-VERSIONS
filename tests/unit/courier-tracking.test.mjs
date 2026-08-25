import test from "node:test";
import assert from "node:assert/strict";
import { getCourierTrackingUrl } from "../../src/utils/courierTracking.js";

test("Courier Tracking URL Generator", async (t) => {
  await t.test("1. Returns empty string when guide number is missing", () => {
    assert.equal(getCourierTrackingUrl("Servientrega", ""), "");
    assert.equal(getCourierTrackingUrl("", null), "");
  });

  await t.test("2. Generates direct Servientrega tracking URL", () => {
    const url = getCourierTrackingUrl("Servientrega", "22073638393");
    assert.ok(url.includes("servientrega.com.ec"));
    assert.ok(url.includes("22073638393"));
  });

  await t.test("3. Generates direct LaarCourier tracking URL", () => {
    const url = getCourierTrackingUrl("Laar Courier", "LAAR-998877");
    assert.ok(url.includes("laarcourier.com"));
    assert.ok(url.includes("LAAR-998877"));
  });

  await t.test("4. Generates direct Tramaco URL", () => {
    const url = getCourierTrackingUrl("TramacoExpress", "TR-12345");
    assert.ok(url.includes("tramaco.com.ec"));
  });

  await t.test("5. Generates DHL tracking URL", () => {
    const url = getCourierTrackingUrl("DHL Express", "DHL123456789");
    assert.ok(url.includes("dhl.com"));
    assert.ok(url.includes("DHL123456789"));
  });

  await t.test("6. Fallback generates Google search query for unknown couriers", () => {
    const url = getCourierTrackingUrl("Cooperativa Loja", "GUIA-5544");
    assert.ok(url.includes("google.com/search"));
    assert.ok(url.includes("GUIA-5544"));
  });
});
