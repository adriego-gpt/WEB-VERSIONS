import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const THIS_FILE = fileURLToPath(import.meta.url);
const PROJECT_ROOT = path.resolve(path.dirname(THIS_FILE), "..", "..");

async function readProjectFile(relativePath) {
  return fs.readFile(path.join(PROJECT_ROOT, relativePath), "utf8");
}

test("featured marquee keeps layout reads outside the animation frame loop", async () => {
  const source = await readProjectFile("src/components/catalog/FeaturedProductMarquee.jsx");

  assert.match(source, /const groupWidthRef = useRef\(0\)/);
  assert.match(source, /ResizeObserver/);
  assert.doesNotMatch(source, /firstGroupRef\.current\?\.offsetWidth/);
  assert.match(source, /const groupWidth = groupWidthRef\.current/);
  assert.match(source, /\[catalogReady, hasProducts, displayItems\.length\]/);
});

test("continuous animation sleeps off-screen and honors reduced motion", async () => {
  const source = await readProjectFile("src/components/catalog/FeaturedProductMarquee.jsx");

  assert.match(source, /const \[isInView, setIsInView\] = useState\(\(\) => \(/);
  assert.match(source, /rootMargin: "160px 0px"/);
  assert.match(source, /prefersReducedMotion/);
  assert.match(source, /!prefersReducedMotion/);
});

test("scroll tracking and expensive blur are limited on constrained devices", async () => {
  const [appSource, css] = await Promise.all([
    readProjectFile("src/App.jsx"),
    readProjectFile("src/App.css"),
  ]);

  assert.match(appSource, /if \(!isMobileViewport\) return undefined;/);
  assert.match(css, /\/\* Rendering performance guards \*\//);
  assert.match(css, /\.admin-order-row,[\s\S]*content-visibility: auto;/);
  assert.match(css, /@media \(max-width: 1023px\), \(pointer: coarse\)/);
  assert.match(css, /backdrop-filter: none(?: !important)?;/);
});
