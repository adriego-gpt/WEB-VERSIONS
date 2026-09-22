// Verify the requested mobile-only product header, without changing the store header.
(async () => {
  const frame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  if (innerWidth > 760) throw new Error("Run at a mobile viewport");
  if (document.querySelector(".topbar .mobile-store-header")) throw new Error("Product header leaked into homepage");
  if (getComputedStyle(document.querySelector(".topbar .container.nav")).display === "none") throw new Error("Original header hidden");
  document.querySelector(".catalog-products-grid .product-card a").click();
  const started = performance.now();
  while (!document.querySelector(".modal .mobile-store-header")) {
    if (performance.now() - started > 3000) throw new Error("Product header missing");
    await new Promise(resolve => setTimeout(resolve, 16));
  }
  await frame();
  const modal = document.querySelector(".modal");
  modal.scrollTo({ top: 0, behavior: "instant" });
  const header = modal.querySelector(".mobile-store-header");
  await waitForStableTargets(header);
  if (header.querySelector("input, .mobile-store-search") || /buscar/i.test(header.textContent)) throw new Error("Unrequested search bar");
  if (header.querySelectorAll("button").length !== 4) throw new Error("Wrong header controls");
  if (!header.querySelector('.mobile-store-header-back[aria-label="Regresar al catálogo"]')) throw new Error("Product header has no back control");
  if (header.querySelector('[aria-label*="menú"]')) throw new Error("Product header still exposes the global menu");
  for (const button of header.querySelectorAll("button")) {
    if (button.getBoundingClientRect().height < 43) throw new Error("Header tap target too small");
  }
  if (modal.querySelector(".product-mobile-toolbar, .product-mobile-dismiss")) throw new Error("Duplicate product back bar remains");
  if (modal.scrollWidth > innerWidth) throw new Error("Product overflows viewport");
  header.querySelector(".mobile-store-header-back").click();
  await frame();
  return { passed: true, searchBar: false, controls: 4, productMenu: false };

  async function waitForStableTargets(container) {
    const started = performance.now();
    while ([...container.querySelectorAll("button")].some((button) => button.getBoundingClientRect().height < 43)) {
      if (performance.now() - started > 1000) throw new Error("Header tap target too small");
      await new Promise((resolve) => setTimeout(resolve, 16));
    }
  }
})()
