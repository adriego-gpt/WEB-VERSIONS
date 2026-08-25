import React, { useEffect, useState, useRef } from "react";
import {
  X,
  MessageCircle,
  CheckCircle2,
  ArrowRight,
  Copy,
  Check,
  Sparkles,
  ExternalLink,
  Send,
} from "lucide-react";
import { motion as Motion, AnimatePresence } from "framer-motion";
import { currency } from "../../utils/currency";
import { copyTextToClipboard } from "../../utils/clipboard";

export function OrderSuccessRedirectModal({
  open,
  order,
  whatsappUrl,
  isMobile,
  onClose,
  onOpenOrders,
  onLaunchWhatsApp,
}) {
  const [copiedCode, setCopiedCode] = useState(false);
  const hasAutoLaunchedRef = useRef(false);

  useEffect(() => {
    if (!open) {
      setCopiedCode(false);
      hasAutoLaunchedRef.current = false;
      return undefined;
    }

    // On DESKTOP only: auto-launch WhatsApp via window.open (works without blank pages on desktop).
    // On MOBILE: do NOT auto-launch. The user taps the native <a href> button instead,
    // which the browser handles natively without creating about:blank tabs.
    if (!isMobile && !hasAutoLaunchedRef.current) {
      const launchTimer = window.setTimeout(() => {
        if (!hasAutoLaunchedRef.current) {
          hasAutoLaunchedRef.current = true;
          onLaunchWhatsApp?.();
        }
      }, 600);
      return () => window.clearTimeout(launchTimer);
    }

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose?.();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, isMobile, onLaunchWhatsApp, onClose]);

  if (!open || !order) return null;

  const handleCopyCode = async () => {
    if (!order.code) return;
    const ok = await copyTextToClipboard(order.code);
    if (ok) {
      setCopiedCode(true);
      window.setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  const handleDesktopRelaunch = () => {
    hasAutoLaunchedRef.current = true;
    onLaunchWhatsApp?.();
  };

  return (
    <AnimatePresence>
      <Motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="modal-backdrop modal-backdrop-priority order-success-backdrop"
        onClick={onClose}
      >
        <Motion.div
          initial={{ opacity: 0, scale: 0.92, y: 24 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 16 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          className="sheet order-success-card"
          role="dialog"
          aria-modal="true"
          aria-label="Pedido registrado con éxito"
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            onClick={onClose}
            className="icon-btn order-success-close-btn"
            aria-label="Cerrar ventana de confirmación"
          >
            <X size={18} />
          </button>

          {/* Animated WhatsApp / Success Header Icon */}
          <div className="order-success-icon-wrap">
            <div className="order-success-icon-pulse" />
            <div className="order-success-icon-circle">
              <MessageCircle size={36} className="order-success-wa-icon" />
              <span className="order-success-badge-check">
                <Check size={14} />
              </span>
            </div>
          </div>

          <div className="order-success-head">
            <div className="order-success-kicker-row">
              <span className="order-success-kicker">
                <Sparkles size={13} />
                ¡ORDEN REGISTRADA!
              </span>
            </div>
            <h3 className="order-success-title">¡Pedido confirmado!</h3>
            <p className="order-success-subtitle">
              Tu pedido fue registrado exitosamente. Solo falta enviar el mensaje en WhatsApp para coordinarlo.
            </p>
          </div>

          {/* Order Summary Pill */}
          <div className="order-success-summary-box">
            <div className="order-success-summary-item">
              <span className="muted">Código de pedido</span>
              <div className="order-success-code-row">
                <strong>{order.code}</strong>
                <button
                  type="button"
                  className="btn btn-outline order-success-copy-btn"
                  onClick={handleCopyCode}
                  aria-label="Copiar código de pedido"
                >
                  {copiedCode ? <Check size={13} /> : <Copy size={13} />}
                  <span>{copiedCode ? "Copiado" : "Copiar"}</span>
                </button>
              </div>
            </div>
            <div className="order-success-summary-item" style={{ textAlign: "right" }}>
              <span className="muted">Total a pagar</span>
              <strong className="order-success-total-value">
                {currency(order.total || order.subtotal)}
              </strong>
            </div>
          </div>

          {/* Instruction Callout */}
          <div className="order-success-instruction-card">
            <div className="order-success-instruction-icon">
              <Send size={18} />
            </div>
            <div className="order-success-instruction-content">
              <strong>Último paso:</strong>
              <p>
                Al abrir WhatsApp verás un mensaje listo. Solo presiona <u>Enviar</u> y listo, ¡nosotros nos encargamos del resto!
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="order-success-actions">
            {isMobile ? (
              /* MOBILE: Native <a> link — the browser opens WhatsApp natively 
                 without creating a blank tab. The store tab stays intact. */
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary order-success-wa-btn"
              >
                <CheckCircle2 size={18} />
                <span>Entendido, ir a WhatsApp</span>
                <ArrowRight size={16} />
              </a>
            ) : (
              /* DESKTOP: Button that triggers window.open (works fine on desktop) */
              <button
                type="button"
                className="btn btn-primary order-success-wa-btn"
                onClick={handleDesktopRelaunch}
              >
                <CheckCircle2 size={18} />
                <span>Abrir WhatsApp</span>
                <ArrowRight size={16} />
              </button>
            )}

            <button
              type="button"
              className="btn btn-outline order-success-orders-btn"
              onClick={() => {
                onClose?.();
                onOpenOrders?.();
              }}
            >
              <ExternalLink size={15} />
              <span>Ver seguimiento de mi pedido</span>
            </button>
          </div>
        </Motion.div>
      </Motion.div>
    </AnimatePresence>
  );
}

export default OrderSuccessRedirectModal;
