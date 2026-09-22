import { ChevronLeft, Menu, ShoppingBag, UserRound, X } from "lucide-react";

export function MobileStoreHeader({ brandName, count, menuOpen, onMenu, onBack, onHome, onAccount, onCart }) {
  const wordmark = String(brandName || "Adriego").replace(/\s+store$/i, "");
  const showsBack = typeof onBack === "function";
  return (
    <div className="mobile-store-header">
      <div className="mobile-store-header-row">
        <div className="mobile-store-header-start">
          <button
            type="button"
            className={`mobile-store-header-icon${showsBack ? " mobile-store-header-back" : ""}`}
            onClick={showsBack ? onBack : onMenu}
            aria-label={showsBack ? "Regresar al catálogo" : (menuOpen ? "Cerrar menú" : "Abrir menú")}
            aria-expanded={showsBack ? undefined : menuOpen}
          >
            {showsBack ? <ChevronLeft size={25} /> : (menuOpen ? <X size={23} /> : <Menu size={23} />)}
          </button>
        </div>
        <button type="button" className="mobile-store-wordmark" onClick={onHome} aria-label={`Inicio — ${wordmark}`}>
          {wordmark}
        </button>
        <div className="mobile-store-header-end">
          <button type="button" className="mobile-store-header-icon" onClick={onAccount} aria-label="Mi cuenta">
            <UserRound size={23} />
          </button>
          <button type="button" className="mobile-store-header-icon" onClick={onCart} aria-label={`Ver carrito, ${count} ${count === 1 ? "prenda" : "prendas"}`}>
            <ShoppingBag size={23} />
            {count > 0 && <span className="mobile-store-cart-count" aria-hidden="true">{count > 99 ? "99+" : count}</span>}
          </button>
        </div>
      </div>
    </div>
  );
}
