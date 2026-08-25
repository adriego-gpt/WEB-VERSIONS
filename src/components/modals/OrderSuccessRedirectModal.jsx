import React, { useState, useRef, useCallback } from "react";
import {
  X,
  MessageCircle,
  CheckCircle2,
  ArrowRight,
  Copy,
  Check,
  Sparkles,
  Send,
  RefreshCw,
} from "lucide-react";
import { motion as Motion, AnimatePresence } from "framer-motion";
import { currency } from "../../utils/currency";
import { copyTextToClipboard } from "../../utils/clipboard";

/**
 * Two-step order success modal:
 *   Step 1 → "Your order is confirmed" + button to open WhatsApp
 *   Step 2 → "Did you send the message?" (Yes → orders, No → re-open WA staying on step 2)
 *
 * Key rules:
 *   - NEVER auto-launches WhatsApp on any device
 *   - Mobile: native <a href> — browser opens WA without about:blank
 *   - Desktop: onLaunchWhatsApp → window.open with named target (reuses same tab)
 *   - "No" stays on step 2 — never loops back to step 1
 *   - Anti-double-click guard prevents opening WA twice on desktop
 */
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
  const [step, setStep] = useState("initial"); // "initial" | "confirm"
  const launchGuardRef = useRef(false);

  // Reset state when modal opens/closes
  const prevOpenRef = useRef(open);
  if (open !== prevOpenRef.current) {
    prevOpenRef.current = open;
    if (open) {
      setStep("initial");
      setCopiedCode(false);
      launchGuardRef.current = false;
    }
  }

  const handleCopyCode = useCallback(async () => {
    if (!order?.code) return;
    const ok = await copyTextToClipboard(order.code);
    if (ok) {
      setCopiedCode(true);
      window.setTimeout(() => setCopiedCode(false), 2200);
    }
  }, [order?.code]);

  // Step 1 → open WA once, then transition to step 2
  const handleOpenWhatsApp = useCallback(() => {
    if (launchGuardRef.current) return; // prevent double-click
    launchGuardRef.current = true;

    if (!isMobile) {
      onLaunchWhatsApp?.();
    }

    window.setTimeout(() => {
      setStep("confirm");
      // Reset guard after transition so "No" button works
      window.setTimeout(() => { launchGuardRef.current = false; }, 300);
    }, isMobile ? 400 : 600);
  }, [isMobile, onLaunchWhatsApp]);

  // Step 2 "No" → re-open WA on desktop, stay on step 2
  const handleReopenWhatsApp = useCallback(() => {
    if (launchGuardRef.current) return;
    launchGuardRef.current = true;

    if (!isMobile) {
      onLaunchWhatsApp?.();
    }
    // Reset guard after a moment
    window.setTimeout(() => { launchGuardRef.current = false; }, 1000);
    // Stay on step "confirm" — no loop
  }, [isMobile, onLaunchWhatsApp]);

  // Step 2 "Yes" → done
  const handleConfirmSent = useCallback(() => {
    onClose?.();
    onOpenOrders?.();
  }, [onClose, onOpenOrders]);

  if (!open || !order) return null;

  return (
    <AnimatePresence>
      <Motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="modal-backdrop modal-backdrop-priority order-success-backdrop"
      >
        <Motion.div
          initial={{ opacity: 0, scale: 0.9, y: 24 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 12 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="sheet order-success-card"
          role="dialog"
          aria-modal="true"
          aria-label="Pedido registrado con éxito"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={onClose}
            className="icon-btn order-success-close-btn"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>

          <AnimatePresence mode="wait">
            {step === "initial" ? (
              <Motion.div
                key="step-initial"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.18 }}
                className="order-success-step"
              >
                {/* Icon */}
                <div className="order-success-icon-wrap">
                  <div className="order-success-icon-pulse" />
                  <div className="order-success-icon-circle">
                    <MessageCircle size={30} />
                    <span className="order-success-badge-check">
                      <Check size={11} />
                    </span>
                  </div>
                </div>

                <div className="order-success-head">
                  <div className="order-success-kicker-row">
                    <span className="order-success-kicker">
                      <Sparkles size={11} />
                      ¡ORDEN REGISTRADA!
                    </span>
                  </div>
                  <h3 className="order-success-title">¡Pedido confirmado!</h3>
                  <p className="order-success-subtitle">
                    Abre WhatsApp y envía el mensaje que preparamos para coordinar tu pedido.
                  </p>
                </div>

                {/* Order Summary */}
                <div className="order-success-summary-box">
                  <div className="order-success-summary-item">
                    <span className="muted">Código</span>
                    <div className="order-success-code-row">
                      <strong>{order.code}</strong>
                      <button
                        type="button"
                        className="btn btn-outline order-success-copy-btn"
                        onClick={handleCopyCode}
                        aria-label="Copiar código"
                      >
                        {copiedCode ? <Check size={11} /> : <Copy size={11} />}
                        <span>{copiedCode ? "✓" : "Copiar"}</span>
                      </button>
                    </div>
                  </div>
                  <div className="order-success-summary-item" style={{ textAlign: "right" }}>
                    <span className="muted">Total</span>
                    <strong className="order-success-total-value">
                      {currency(order.total || order.subtotal)}
                    </strong>
                  </div>
                </div>

                {/* Instruction */}
                <div className="order-success-instruction-card">
                  <Send size={14} className="order-success-instruction-icon-svg" />
                  <p>Al abrir WhatsApp, presiona <u>Enviar</u>. ¡El mensaje ya está listo!</p>
                </div>

                {/* CTA */}
                <div className="order-success-actions">
                  {isMobile ? (
                    <a
                      href={whatsappUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-primary order-success-wa-btn"
                      onClick={handleOpenWhatsApp}
                    >
                      <MessageCircle size={17} />
                      <span>Abrir WhatsApp y enviar</span>
                      <ArrowRight size={15} />
                    </a>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-primary order-success-wa-btn"
                      onClick={handleOpenWhatsApp}
                    >
                      <MessageCircle size={17} />
                      <span>Abrir WhatsApp y enviar</span>
                      <ArrowRight size={15} />
                    </button>
                  )}
                </div>
              </Motion.div>
            ) : (
              <Motion.div
                key="step-confirm"
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="order-success-step"
              >
                {/* Confirm Icon */}
                <div className="order-success-icon-wrap">
                  <div className="order-success-icon-circle order-success-icon-circle-confirm">
                    <CheckCircle2 size={32} />
                  </div>
                </div>

                <div className="order-success-head">
                  <h3 className="order-success-title">¿Enviaste el mensaje?</h3>
                  <p className="order-success-subtitle">
                    Confirma que presionaste <strong>Enviar</strong> en WhatsApp para procesar tu pedido <strong>{order.code}</strong>.
                  </p>
                </div>

                {/* Confirm Actions */}
                <div className="order-success-confirm-actions">
                  <button
                    type="button"
                    className="btn btn-primary order-success-confirm-yes-btn"
                    onClick={handleConfirmSent}
                  >
                    <CheckCircle2 size={17} />
                    <span>Sí, ya lo envié</span>
                  </button>

                  {isMobile ? (
                    <a
                      href={whatsappUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-outline order-success-confirm-no-btn"
                    >
                      <RefreshCw size={14} />
                      <span>No, abrir WhatsApp de nuevo</span>
                    </a>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-outline order-success-confirm-no-btn"
                      onClick={handleReopenWhatsApp}
                    >
                      <RefreshCw size={14} />
                      <span>No, abrir WhatsApp de nuevo</span>
                    </button>
                  )}
                </div>
              </Motion.div>
            )}
          </AnimatePresence>
        </Motion.div>
      </Motion.div>
    </AnimatePresence>
  );
}

export default OrderSuccessRedirectModal;
