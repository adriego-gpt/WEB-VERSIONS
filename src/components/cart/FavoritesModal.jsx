import React, { useEffect } from "react";
import { Heart, X, ArrowRight } from "lucide-react";
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
          className="sheet favorites-modal-sheet"
          role="dialog"
          aria-modal="true"
          aria-label="Tus prendas favoritas"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="sheet-header">
            <div>
              <p className="muted" style={{ margin: 0, textTransform: "uppercase", letterSpacing: ".25em", fontSize: 12 }}>Favoritos</p>
              <h3 style={{ margin: "4px 0 0", fontSize: 24 }}>Tus prendas guardadas ({favoriteProducts.length})</h3>
            </div>
            <button type="button" onClick={onClose} className="icon-btn" aria-label="Cerrar favoritos">
              <X size={18} />
            </button>
          </div>

          <div className="sheet-body favorites-modal-body">
            {favoriteProducts.length === 0 ? (
              <EmotionalEmptyState
                icon={Heart}
                title="Aún no guardas favoritos"
                description="Marca prendas con el corazón y aquí tendrás tu selección para volver a ellas cuando quieras."
                actionLabel="Explorar colección"
                onAction={onBrowseCatalog}
              />
            ) : (
              <div className="favorites-list">
                {favoriteProducts.map((product) => {
                  const thumb = getCurrentImageForProduct(product, product.colors?.[0]);
                  const hasDiscount = product.oldPrice && Number(product.oldPrice) > Number(product.price);
                  return (
                    <Motion.div
                      key={product.id}
                      layout
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ duration: 0.2 }}
                      className="favorite-item-card"
                    >
                      <button
                        type="button"
                        onClick={() => onOpenProduct(product)}
                        className="favorite-item-thumb-btn"
                        aria-label={`Ver detalle de ${product.name}`}
                      >
                        <img
                          src={thumb}
                          alt={product.name}
                          className="favorite-item-thumb"
                          loading="lazy"
                          decoding="async"
                        />
                      </button>

                      <div className="favorite-item-info">
                        <button
                          type="button"
                          onClick={() => onOpenProduct(product)}
                          className="favorite-item-title-btn"
                        >
                          <span className="favorite-item-category">{product.category || "Prenda"}</span>
                          <h4 className="favorite-item-title">{product.name}</h4>
                        </button>
                        <div className="favorite-item-pricing">
                          <span className="favorite-item-price">{currency(product.price)}</span>
                          {hasDiscount && (
                            <span className="favorite-item-old-price">{currency(product.oldPrice)}</span>
                          )}
                        </div>
                      </div>

                      <div className="favorite-item-actions">
                        <button
                          type="button"
                          onClick={() => onToggleFavorite(product.id)}
                          className="favorite-item-remove-btn"
                          aria-label="Quitar de favoritos"
                          title="Quitar de favoritos"
                        >
                          <Heart size={17} fill="#ef4444" color="#ef4444" />
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline favorite-item-view-btn"
                          onClick={() => onOpenProduct(product)}
                        >
                          <span>Ver</span>
                          <ArrowRight size={13} />
                        </button>
                      </div>
                    </Motion.div>
                  );
                })}
              </div>
            )}
          </div>
        </Motion.div>
      </Motion.div>
    </AnimatePresence>
  );
}

export default FavoritesModal;
