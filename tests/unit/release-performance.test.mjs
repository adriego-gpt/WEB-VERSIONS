import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getOptimizedImageSource, getResponsiveImageSources, applyImageFallback } from "../../src/domain/products/imageSources.js";
import { createFrameQueue } from "../../src/utils/frameQueue.js";

test("release builds set production before resolving Vite, independent of local developer env", () => {
  const script = readFileSync(new URL("../../scripts/build-production.mjs", import.meta.url), "utf8");
  const manifest = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
  assert.equal(manifest.scripts.build, "node scripts/build-production.mjs");
  assert.ok(script.indexOf('process.env.NODE_ENV = "production"') < script.indexOf('import("vite")'));
});

test("ImageKit responsive candidates preserve paths and do not crop", () => {
  const result = getResponsiveImageSources("https://ik.imagekit.io/shop/ropa/azul.jpg?v=2", [320, 640]);
  const candidates = result.split(", ");
  assert.equal(candidates.length, 2);
  for (const [index, candidate] of candidates.entries()) {
    const [src, descriptor] = candidate.split(" ");
    const url = new URL(src);
    assert.equal(url.pathname, "/shop/ropa/azul.jpg");
    assert.equal(url.searchParams.get("v"), "2");
    assert.equal(url.searchParams.get("tr"), `w-${[320, 640][index]}`);
    assert.equal(descriptor, `${[320, 640][index]}w`);
  }
});

test("default responsive candidates include an intermediate card width", () => {
  const result = getResponsiveImageSources("https://ik.imagekit.io/shop/ropa/azul.jpg");
  assert.match(result, /tr=w-320[^,]* 320w/);
  assert.match(result, /tr=w-480[^,]* 480w/);
  assert.match(result, /tr=w-640[^,]* 640w/);
});

test("product detail and zoom can request premium ImageKit quality without changing the stored source", () => {
  const source = "https://ik.imagekit.io/shop/ropa/azul.jpg?v=2";
  const srcSet = getResponsiveImageSources(source, [640, 1280], { quality: 88 });
  for (const candidate of srcSet.split(", ")) {
    const url = new URL(candidate.split(" ")[0]);
    assert.match(url.searchParams.get("tr"), /^w-(?:640|1280),q-88,f-auto$/);
    assert.equal(url.searchParams.get("v"), "2");
  }
  const zoom = new URL(getOptimizedImageSource(source, { quality: 90 }));
  assert.equal(zoom.searchParams.get("tr"), "q-90,f-auto");
  assert.equal(zoom.searchParams.get("v"), "2");
});

test("the public map waits until it is near the viewport without requiring a click", () => {
  const source = readFileSync(new URL("../../src/components/common/GoogleMapPreview.jsx", import.meta.url), "utf8");
  assert.match(source, /IntersectionObserver/);
  assert.match(source, /rootMargin: "320px 0px"/);
  assert.doesNotMatch(source, /onClick/);
});

test("signed, transformed, unknown and unsafe image URLs are never rewritten", () => {
  for (const src of [
    "https://ik.imagekit.io/shop/p.jpg?ik-s=signature", "https://ik.imagekit.io/shop/p.jpg?ik-t=123",
    "https://ik.imagekit.io/shop/p.jpg?tr=w-200,h-300", "https://ik.imagekit.io/shop/tr:w-200/p.jpg",
    "https://ik.imagekit.io/shop/tr%3Aw-200/p.jpg", "https://ik.imagekit.io.evil.test/p.jpg",
    "http://ik.imagekit.io/shop/p.jpg", "https://user:pass@ik.imagekit.io/shop/p.jpg", "not-a-url",
  ]) assert.equal(getResponsiveImageSources(src), undefined);
  assert.equal(getResponsiveImageSources("https://ik.imagekit.io/shop/p.jpg", [0, NaN, 99999]), undefined);
});

test("failed responsive images clear srcset before fallback and stop retry loops", () => {
  const attributes = new Map([["src", "broken.jpg"], ["srcset", "broken-320.jpg 320w"], ["sizes", "50vw"]]);
  const image = {
    getAttribute: (key) => attributes.get(key),
    removeAttribute: (key) => attributes.delete(key),
    set src(value) { attributes.set("src", value); },
  };
  applyImageFallback(image, "fallback.jpg");
  assert.equal(attributes.get("src"), "fallback.jpg");
  assert.equal(attributes.has("srcset"), false);
  assert.equal(attributes.has("sizes"), false);
  applyImageFallback(image, "fallback.jpg");
  assert.equal(attributes.size, 1);
});

test("pointer bursts render once per frame using the final position", () => {
  const callbacks = new Map();
  const updates = [];
  let sequence = 0;
  const queue = createFrameQueue((value) => updates.push(value), (callback) => { callbacks.set(++sequence, callback); return sequence; }, (id) => callbacks.delete(id));
  for (let x = 0; x < 100; x++) queue.push({ x });
  assert.equal(callbacks.size, 1);
  callbacks.get(1)(); callbacks.delete(1);
  assert.deepEqual(updates, [{ x: 99 }]);
  queue.push({ x: 200 });
  queue.cancel();
  assert.equal(callbacks.size, 0);
  queue.push({ x: 300 });
  callbacks.get(3)();
  assert.deepEqual(updates, [{ x: 99 }, { x: 300 }]);
});

test("catalog memoization does not retain old action callbacks", () => {
  const source = readFileSync(new URL("../../src/components/catalog/CatalogProductCard.jsx", import.meta.url), "utf8");
  assert.match(source, /React\.memo\(CatalogProductCard\)/);
  assert.equal((source.match(/if \(added === false\) return;/g) || []).length, 1);
  assert.match(source, /useEffect\(\(\) => \(\) => clearTimeout\(feedbackTimerRef\.current\)/);
});

test("product assurances can wrap inside narrow mobile and tablet columns", () => {
  const css = readFileSync(new URL("../../src/App.css", import.meta.url), "utf8");
  const subtitle = css.match(/\.trust-subtitle\s*\{([^}]+)\}/)?.[1];
  assert.match(subtitle, /white-space:\s*normal/);
  assert.match(subtitle, /max-width:\s*100%/);
});
