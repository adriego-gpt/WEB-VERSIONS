import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMailtoLink,
  buildWhatsAppApiSendLink,
  buildWhatsAppLink,
  buildWhatsAppLinkFromBase,
  launchWhatsAppUrl,
  normalizeSafeUrl,
} from "../../src/utils/url.js";
import { resolvePublicLocation } from "../../src/domain/contact/publicLocation.js";

test("Google Maps links without protocol are normalized to HTTPS", () => {
  assert.equal(
    normalizeSafeUrl("maps.app.goo.gl/abc123"),
    "https://maps.app.goo.gl/abc123",
  );
});

test("unsafe URL protocols remain blocked", () => {
  assert.equal(normalizeSafeUrl("javascript:alert(1)"), "");
  assert.equal(normalizeSafeUrl("data:text/html,test"), "");
});

test("contact link builders remain compatible with positional app calls", () => {
  const message = "Pedido listo para retirar";
  assert.equal(buildMailtoLink("ventas@adriegostore.com"), "mailto:ventas@adriegostore.com");
  assert.match(buildWhatsAppLink("0999999999", message), /^https:\/\/wa\.me\/593999999999\?text=/);
  assert.match(buildWhatsAppApiSendLink("0999999999", message), /^https:\/\/api\.whatsapp\.com\/send\?/);
  assert.match(
    buildWhatsAppLinkFromBase("https://wa.me/593999999999", message),
    /^https:\/\/wa\.me\/593999999999\?text=/,
  );
});

test("a configured map remains visible even without a public street address", () => {
  assert.deepEqual(
    resolvePublicLocation({
      address: "Av. Principal 123, Quito, Ecuador",
      mapsLink: "maps.app.goo.gl/abc123",
      locationNote: "Atención con cita.",
    }, "Av. Principal 123, Quito, Ecuador"),
    {
      address: "",
      mapsLink: "https://maps.app.goo.gl/abc123",
      mapsEmbedUrl: "",
      locationNote: "Atención con cita.",
    },
  );
});

test("WhatsApp checkout navigates a pre-opened mobile window", () => {
  const originalWindow = globalThis.window;
  const popup = { closed: false, location: { href: "" }, close() { this.closed = true; } };
  globalThis.window = {
    location: { assign() { throw new Error("same-window should not be used"); } },
    open() { return null; },
  };

  try {
    const result = launchWhatsAppUrl("https://wa.me/593999999999?text=Pedido", {
      preferredWindow: popup,
      isMobile: true,
    });
    assert.equal(result.launched, true);
    assert.equal(result.mode, "deep-link-window");
    assert.match(popup.location.href, /^https:\/\/wa\.me\/593999999999/);
  } finally {
    globalThis.window = originalWindow;
  }
});

test("WhatsApp checkout falls back to same-window navigation on mobile", () => {
  const originalWindow = globalThis.window;
  let assignedUrl = "";
  globalThis.window = {
    location: { assign(url) { assignedUrl = url; } },
    open() { return null; },
  };

  try {
    const result = launchWhatsAppUrl("https://wa.me/593999999999?text=Retiro", { isMobile: true });
    assert.equal(result.launched, true);
    assert.equal(result.mode, "deep-link");
    assert.match(assignedUrl, /^https:\/\/wa\.me\/593999999999/);
  } finally {
    globalThis.window = originalWindow;
  }
});
