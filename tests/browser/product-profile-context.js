// Profile must be an overlay over the product, never an implicit trip to home.
(async () => {
  const waitFor = async predicate => {
    const start = performance.now();
    while (!predicate()) {
      if (performance.now() - start > 3000) throw new Error("Profile UI timeout");
      await new Promise(resolve => setTimeout(resolve, 16));
    }
  };
  // Open a product in a separate browser action: lazy chunk navigation can
  // replace the active evaluation context while the browser tool awaits it.
  if (!document.querySelector(".modal .mobile-store-header")) throw new Error("Open a mobile product before running this browser regression");
  const path = location.pathname;
  const selection = () => [...document.querySelectorAll('.modal .product-modal-color-option[aria-pressed="true"], .modal .product-modal-size-option[aria-pressed="true"]')].map(button => button.textContent).join("|");
  const before = selection();
  if (!before) throw new Error("The test product has no selected color or size");
  for (const mode of ["close", "escape", "back"]) {
    const accountButton = document.querySelector(".modal .mobile-store-header-end button");
    accountButton.focus();
    accountButton.click();
    await waitFor(() => document.querySelector(".auth-backdrop [role=dialog], .profile-sheet"));
    if (location.pathname !== path || !document.querySelector(".modal .mobile-store-header")) {
      throw new Error("Profile sent the user home and lost the product");
    }
    const overlay = document.querySelector(".auth-backdrop [role=dialog], .profile-sheet");
    await waitFor(() => overlay.contains(document.activeElement));
    if (mode === "close") overlay.querySelector("button[aria-label^=Cerrar]").click();
    else if (mode === "escape") document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    else history.back();
    await waitFor(() => !document.querySelector(".auth-backdrop, .profile-sheet"));
    await waitFor(() => document.activeElement === accountButton);
    // Allow the asynchronous history cleanup to finish before the next opening.
    await new Promise(resolve => setTimeout(resolve, 60));
    if (location.pathname !== path || selection() !== before || document.querySelector(".modal-backdrop").inert) {
      throw new Error(`Closing account via ${mode} lost the product or its selection`);
    }
  }
  document.querySelector(".mobile-store-header-back").click();
  await waitFor(() => !document.querySelector(".modal .mobile-store-header"));
  if (document.querySelector(".mobile-store-header") || !document.querySelector(".topbar") || location.pathname !== "/") {
    throw new Error("Closing the product did not restore the original storefront header");
  }
  return { passed: true, productPath: path, closingModes: 3 };
})()
