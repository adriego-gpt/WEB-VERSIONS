import { useEffect } from "react";

export function useMobileNavGuards({
  setShowMobileNav,
  selectedProduct,
  showCartSummary,
  showFavoritesPanel,
  showOrdersModal,
  showUserAuth,
  showProfileModal,
  showAdminPanel,
}) {
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const closeOnEscape = (event) => {
      if (event.key !== "Escape") return;
      setShowMobileNav(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [setShowMobileNav]);

  useEffect(() => {
    if (
      selectedProduct
      || showCartSummary
      || showFavoritesPanel
      || showOrdersModal
      || showUserAuth
      || showProfileModal
      || showAdminPanel
    ) {
      setShowMobileNav(false);
    }
  }, [
    setShowMobileNav,
    selectedProduct,
    showCartSummary,
    showFavoritesPanel,
    showOrdersModal,
    showUserAuth,
    showProfileModal,
    showAdminPanel,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const closeOnDesktop = () => {
      if (window.matchMedia("(min-width: 761px)").matches) {
        setShowMobileNav(false);
      }
    };
    closeOnDesktop();
    window.addEventListener("resize", closeOnDesktop);
    return () => window.removeEventListener("resize", closeOnDesktop);
  }, [setShowMobileNav]);
}
