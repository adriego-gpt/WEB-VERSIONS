import assert from "node:assert/strict";
import test from "node:test";

import { initializeUmamiAnalytics, normalizeUmamiWebsiteId } from "../../src/services/umamiAnalytics.js";

const websiteId = "94db1cb1-74f4-4a40-ad6c-962362670409";

test("Umami website IDs are validated before a remote script is created", () => {
  assert.equal(normalizeUmamiWebsiteId(` ${websiteId.toUpperCase()} `), websiteId);
  for (const value of ["", "not-a-uuid", "javascript:alert(1)", "94db1cb1-74f4-0a40-ad6c-962362670409"]) {
    assert.equal(normalizeUmamiWebsiteId(value), "");
  }
});

test("Umami loads once with privacy-preserving tracker settings", () => {
  let appended;
  const script = {
    dataset: {},
    addEventListener() {},
    remove() {},
  };
  const browserDocument = {
    head: { append(node) { appended = node; } },
    querySelector() { return null; },
    createElement(tag) { assert.equal(tag, "script"); return script; },
  };
  const browserWindow = {};

  assert.equal(initializeUmamiAnalytics({ websiteId, browserWindow, browserDocument }), true);
  assert.equal(appended.src, "https://cloud.umami.is/script.js");
  assert.equal(appended.defer, true);
  assert.equal(appended.dataset.websiteId, websiteId);
  assert.equal(appended.dataset.domains, "adriego.shop,www.adriego.shop");
  assert.equal(appended.dataset.excludeSearch, "true");
  assert.equal(appended.dataset.excludeHash, "true");
  assert.equal(appended.dataset.doNotTrack, "true");
  assert.equal(appended.dataset.performance, "true");
  assert.equal(appended.referrerPolicy, "strict-origin-when-cross-origin");
});

test("Umami remains disabled when its public website ID is missing", () => {
  let created = false;
  const browserDocument = {
    head: {},
    querySelector() { return null; },
    createElement() { created = true; return {}; },
  };
  assert.equal(initializeUmamiAnalytics({ websiteId: "", browserWindow: {}, browserDocument }), false);
  assert.equal(created, false);
});
