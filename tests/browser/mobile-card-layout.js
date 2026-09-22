// Run with the isolated `node scripts/serve-audit.mjs --mobile-catalog` fixture:
// Get-Content tests/browser/mobile-card-layout.js -Raw | npx agent-browser --session mobile-fixes eval --stdin
(async () => {
  const frame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const card = document.querySelector(".catalog-products-grid .product-card");
  if (!card || innerWidth > 760) throw new Error("Open the mobile catalog fixture first");
  card.querySelector(".quick-size-close-btn")?.click();
  await frame(); // Let closing commit before positioning the fresh scenario.
  card.scrollIntoView({ block: "center", behavior: "instant" });
  await frame();
  const image = card.querySelector(".product-img-wrap");
  const before = image.getBoundingClientRect();
  card.querySelector(".product-card-actions button").click();
  await frame();
  const after = image.getBoundingClientRect();
  const picker = card.querySelector(".quick-size-picker");
  if (!picker) throw new Error("The size picker did not open");
  for (const axis of ["width", "height", "top", "left"]) {
    if (Math.abs(before[axis] - after[axis]) > 1) throw new Error(`Image moved/resized on ${axis}`);
  }
  for (const chip of picker.querySelectorAll(".quick-size-chip")) {
    const bounds = chip.getBoundingClientRect();
    if (bounds.right > card.getBoundingClientRect().right || bounds.width < 43 || bounds.height < 43) {
      throw new Error("A size is clipped or too small to tap");
    }
  }
  if (document.documentElement.scrollWidth > innerWidth) throw new Error("Horizontal page overflow");
  return { passed: true, imageWidth: after.width, sizes: picker.querySelectorAll(".quick-size-chip").length };
})()
