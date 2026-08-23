import React, { useEffect } from "react";
import { Heart, X } from "lucide-react";
import { motion as Motion, AnimatePresence } from "framer-motion";
import { currency } from "../../utils/currency";
import { getCurrentImageForProduct } from "../../domain/products/variants";
import { EmotionalEmptyState } from "../ui/EmotionalEmptyState";

export function FavoritesModal({
  open,
  onClose,
  favorites,
  products,
  onOpenProduct,
  onToggleFavorite,
  onBrowseCatalog,
}) {
  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose?.();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const favoriteProducts = favorites
    .map((favoriteId) => products.find((product) => product.id === favoriteId))
    .filter(Boolean);

  return (
    <AnimatePresence>
      <Motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="modal-backdrop" onClick={onClose}>
        <Motion.div
          initial={{ opacity: 0, y: 24, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 18, scale: 0.97 }}
          transition={{ duration: 0.22 }}
          className="sheet"
          role="dialog"
          aria-modal="true"
          aria-label="Tus prendas favoritas"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="sheet-header">
            <div>
              <p className="muted" style={{ margin: 0, textTransform: "uppercase", letterSpacing: ".25em", fontSize: 13 }}>Favoritos</p>
              <h3 style={{ margin: "8px 0 0", fontSize: 32 }}>Tus prendas guardadas</h3>
            </div>
            <button type="button" onClick={onClose} className="icon-btn" aria-label="Cerrar favoritos">
              <X size={18} />
            </button>
          </div>

          <div className="sheet-body">
            {favoriteProducts.length === 0 ? (
              <EmotionalEmptyState
                icon={Heart}
                title="Aún no guardas favoritos"
                description="Marca prendas con el corazón y aquí tendrás tu selección para volver a ellas cuando quieras."
                actionLabel="Explorar colección"
                onAction={onBrowseCatalog}
              />
            ) : (
              favoriteProducts.map((product) => (
                <Motion.div key={product.id} layout className="cart-item sheet-product-card">
                  <div className="sheet-product-layout">
                    <button onClick={() => onOpenProduct(product)} className="sheet-thumb-button">
                      <img src={getCurrentImageForProduct(product, product.colors[0])} alt={product.name} className="sheet-product-thumb" loading="lazy" decoding="async" />
                    </button>

                    <div className="sheet-product-main">
                      <div className="sheet-product-top">
                        <button onClick={() => onOpenProduct(product)} className="sheet-product-title-button">
                          <p className="sheet-product-title">{product.name}</p>
                          <p className="muted sheet-product-meta-text">{product.category}</p>
                        </button>

                        <button onClick={() => onToggleFavorite(product.id)} className="sheet-remove-btn" aria-label="Quitar de favoritos">
                          <Heart size={16} fill="currentColor" />
                        </button>
                      </div>

                      <div className="sheet-product-bottom sheet-product-bottom-favorites">
                        <p className="sheet-product-price">{currency(product.price)}</p>
                        <button className="btn btn-outline sheet-detail-btn" onClick={() => onOpenProduct(product)}>Ver detalle</button>
                      </div>
                    </div>
                  </div>
                </Motion.div>
              ))
            )}
          </div>
        </Motion.div>
      </Motion.div>
    </AnimatePresence>
  );
}

export default FavoritesModal;
