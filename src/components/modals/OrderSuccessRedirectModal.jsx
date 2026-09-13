import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  MessageCircle,
  CheckCircle2,
  ArrowRight,
  Copy,
  Check,
  X,
  Send,
  RefreshCw,
} from "lucide-react";
import { motion as Motion, AnimatePresence } from "framer-motion";
import { currency } from "../../utils/currency";
import { copyTextToClipboard } from "../../utils/clipboard";
import { useModalA11y } from "../../hooks/useModalA11y";
import { PAYMENT_METHODS } from "../../domain/orders/payment";

/**
 * Transfers finish on the web; only card-link requests require a persistent
 * two-step WhatsApp handoff. Opening WhatsApp never confirms a payment.
 *
 * Key rules:
 *   - NEVER auto-launches WhatsApp on any device
 *   - Mobile: native <a href> — browser opens WA without about:blank
 *   - Desktop: onLaunchWhatsApp → window.open with named target (reuses same tab)
 *   - "No" stays on step 2 — never loops back to step 1
 *   - The pending confirmation survives reloads and only "Yes" dismisses it
 *   - Anti-double-click guard prevents opening WA twice on desktop
 */
export function OrderSuccessRedirectModal({
  open,
  order,
  whatsappUrl,
  whatsappOpened = false,
  isMobile,
  onConfirmSent,
  onDismiss,
  onWhatsAppOpened,
  onLaunchWhatsApp,
}) {
  const requiresWhatsApp = order?.paymentMethod === PAYMENT_METHODS.cardLink;
  const [copiedCode, setCopiedCode] = useState(false);
  const [step, setStep] = useState(whatsappOpened ? "confirm" : "initial");
  const launchGuardRef = useRef(false);
  const primaryActionRef = useRef(null);
  const confirmActionRef = useRef(null);
  const copiedTimerRef = useRef(null);
  const transitionTimerRef = useRef(null);
  const guardTimerRef = useRef(null);
  const dialogRef = useModalA11y(open, requiresWhatsApp ? undefined : onDismiss, {
    initialFocusRef: requiresWhatsApp && whatsappOpened ? confirmActionRef : primaryActionRef,
    disableEscape: requiresWhatsApp,
  });
  const canOpenWhatsApp = Boolean(whatsappUrl);

  useEffect(() => () => {
    [copiedTimerRef, transitionTimerRef, guardTimerRef].forEach((timerRef) => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    });
  }, []);

  const handleCopyCode = useCallback(async () => {
    const orderCode = order?.code;
    if (!orderCode) return;
    const ok = await copyTextToClipboard(orderCode);
    if (ok) {
      setCopiedCode(true);
      if (copiedTimerRef.current) window.clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = window.setTimeout(() => setCopiedCode(false), 2200);
    }
  }, [order]);

  // Step 1 → open WA once, then transition to step 2
  const handleOpenWhatsApp = useCallback(() => {
    if (!canOpenWhatsApp || launchGuardRef.current) return;
    launchGuardRef.current = true;
    if (requiresWhatsApp) onWhatsAppOpened?.();

    if (!isMobile) {
      onLaunchWhatsApp?.();
    }

    transitionTimerRef.current = window.setTimeout(() => {
      if (requiresWhatsApp) setStep("confirm");
      guardTimerRef.current = window.setTimeout(() => { launchGuardRef.current = false; }, 300);
    }, isMobile ? 400 : 600);
  }, [canOpenWhatsApp, isMobile, onLaunchWhatsApp, onWhatsAppOpened, requiresWhatsApp]);

  // Step 2 "No" → re-open WA on desktop, stay on step 2
  const handleReopenWhatsApp = useCallback(() => {
    if (!canOpenWhatsApp || launchGuardRef.current) return;
    launchGuardRef.current = true;
    onWhatsAppOpened?.();

    if (!isMobile) {
      onLaunchWhatsApp?.();
    }
    guardTimerRef.current = window.setTimeout(() => { launchGuardRef.current = false; }, 1000);
  }, [canOpenWhatsApp, isMobile, onLaunchWhatsApp, onWhatsAppOpened]);

  // Step 2 "Yes" → done
  const handleConfirmSent = useCallback(() => {
    onConfirmSent?.();
  }, [onConfirmSent]);

  if (!open || !order) return null;

  return (
    <AnimatePresence>
      <Motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="modal-backdrop modal-backdrop-priority order-success-backdrop"
        onClick={requiresWhatsApp ? undefined : onDismiss}
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
          ref={dialogRef}
        >
          {!requiresWhatsApp && (
            <button type="button" className="btn btn-outline order-success-close" onClick={onDismiss} aria-label="Cerrar">
              <X size={18} />
            </button>
          )}
          <AnimatePresence mode="wait">
            {!requiresWhatsApp || step === "initial" ? (
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
                    {requiresWhatsApp ? <MessageCircle size={30} /> : <CheckCircle2 size={30} />}
                    <span className="order-success-badge-check">
                      <Check size={11} />
                    </span>
                  </div>
                </div>

                <div className="order-success-head">
                  <h3 className="order-success-title">{requiresWhatsApp ? "Solicita tu enlace de pago" : "Pedido recibido"}</h3>
                  <p className="order-success-subtitle">
                    {!requiresWhatsApp
                      ? "Recibimos tu pedido y tu comprobante. Tu transferencia está pendiente de revisión."
                      : canOpenWhatsApp
                        ? "Tu pedido está registrado. Envía el mensaje por WhatsApp para recibir el enlace seguro de pago con tarjeta."
                        : "Tu pedido está registrado. WhatsApp no está disponible; conserva tu código para solicitar el enlace de pago."}
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
                      {currency(order.total ?? order.subtotal)}
                    </strong>
                  </div>
                </div>

                {/* Instruction */}
                <div className="order-success-instruction-card">
                  {requiresWhatsApp ? <Send size={14} className="order-success-instruction-icon-svg" /> : <CheckCircle2 size={14} className="order-success-instruction-icon-svg" />}
                  <p>{requiresWhatsApp
                    ? <>Al abrir WhatsApp, presiona <u>Enviar</u>. El mensaje ya está listo.</>
                    : "No necesitas enviar otro mensaje. Revisaremos el comprobante antes de confirmar el pago."}</p>
                </div>

                {/* CTA */}
                <div className="order-success-actions">
                  {!requiresWhatsApp && (
                    <button type="button" className="btn btn-primary order-success-wa-btn" onClick={onDismiss} ref={primaryActionRef}>
                      <span>Ver mi pedido</span><ArrowRight size={15} />
                    </button>
                  )}
                  {isMobile && canOpenWhatsApp ? (
                    <a
                      href={whatsappUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`btn ${requiresWhatsApp ? "btn-primary order-success-wa-btn" : "btn-outline order-success-confirm-no-btn"}`}
                      onClick={handleOpenWhatsApp}
                      ref={requiresWhatsApp ? primaryActionRef : undefined}
                    >
                      <MessageCircle size={17} />
                      <span>{requiresWhatsApp ? "Solicitar enlace por WhatsApp" : "Consultar por WhatsApp (opcional)"}</span>
                      <ArrowRight size={15} />
                    </a>
                  ) : requiresWhatsApp || canOpenWhatsApp ? (
                    <button
                      type="button"
                      className={`btn ${requiresWhatsApp ? "btn-primary order-success-wa-btn" : "btn-outline order-success-confirm-no-btn"}`}
                      onClick={handleOpenWhatsApp}
                      disabled={!canOpenWhatsApp}
                      ref={requiresWhatsApp ? primaryActionRef : undefined}
                    >
                      <MessageCircle size={17} />
                      <span>{requiresWhatsApp ? "Solicitar enlace por WhatsApp" : "Consultar por WhatsApp (opcional)"}</span>
                      <ArrowRight size={15} />
                    </button>
                  ) : null}
                  {requiresWhatsApp && <p className="order-success-persistence-note">
                    Este recordatorio seguirá aquí aunque cierres o actualices la página.
                  </p>}
                  {requiresWhatsApp && !canOpenWhatsApp && (
                    <button type="button" className="btn btn-outline order-success-confirm-no-btn" onClick={() => setStep("confirm")}>
                      Ya envié la solicitud por WhatsApp
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
                onAnimationComplete={() => confirmActionRef.current?.focus()}
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
                    Confirma que presionaste <strong>Enviar</strong> para solicitar el enlace de tu pedido <strong>{order.code}</strong>. El pago seguirá pendiente hasta validarlo.
                  </p>
                </div>

                {/* Confirm Actions */}
                <div className="order-success-confirm-actions">
                  <button
                    type="button"
                    className="btn btn-primary order-success-confirm-yes-btn"
                    onClick={handleConfirmSent}
                    ref={confirmActionRef}
                  >
                    <CheckCircle2 size={17} />
                    <span>Sí, ya lo envié</span>
                  </button>

                  {isMobile && canOpenWhatsApp ? (
                    <a
                      href={whatsappUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-outline order-success-confirm-no-btn"
                      onClick={handleReopenWhatsApp}
                    >
                      <RefreshCw size={14} />
                      <span>No, abrir WhatsApp de nuevo</span>
                    </a>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-outline order-success-confirm-no-btn"
                      onClick={handleReopenWhatsApp}
                      disabled={!canOpenWhatsApp}
                    >
                      <RefreshCw size={14} />
                      <span>No, abrir WhatsApp de nuevo</span>
                    </button>
                  )}
                  <p className="order-success-persistence-note">
                    El aviso desaparecerá únicamente cuando confirmes el envío.
                  </p>
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
