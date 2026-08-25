import React, { useEffect, useState, useRef } from "react";
import {
  X,
  MessageCircle,
  CheckCircle2,
  ArrowRight,
  Copy,
  Check,
  PackageCheck,
  Sparkles,
  ExternalLink,
} from "lucide-react";
import { motion as Motion, AnimatePresence } from "framer-motion";
import { currency } from "../../utils/currency";
import { copyTextToClipboard } from "../../utils/clipboard";

const COUNTDOWN_SECONDS = 3;

export function OrderSuccessRedirectModal({
  open,
  order,
  whatsappUrl,
  onClose,
  onOpenOrders,
  onLaunchWhatsApp,
}) {
  const [timeLeft, setTimeLeft] = useState(COUNTDOWN_SECONDS);
  const [isLaunched, setIsLaunched] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const timerRef = useRef(null);
  const hasAutoLaunchedRef = useRef(false);

  useEffect(() => {
    if (!open) {
      setTimeLeft(COUNTDOWN_SECONDS);
      setIsLaunched(false);
      setCopiedCode(false);
      hasAutoLaunchedRef.current = false;
      if (timerRef.current) clearInterval(timerRef.current);
      return undefined;
    }

    setTimeLeft(COUNTDOWN_SECONDS);
    setIsLaunched(false);
    hasAutoLaunchedRef.current = false;

    timerRef.current = window.setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          if (!hasAutoLaunchedRef.current) {
            hasAutoLaunchedRef.current = true;
            setIsLaunched(true);
            onLaunchWhatsApp?.();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose?.();
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onLaunchWhatsApp, onClose]);

  if (!open || !order) return null;

  const handleManualLaunch = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setTimeLeft(0);
    hasAutoLaunchedRef.current = true;
    setIsLaunched(true);
    onLaunchWhatsApp?.();
  };

  const handleCopyCode = async () => {
    if (!order.code) return;
    const ok = await copyTextToClipboard(order.code);
    if (ok) {
      setCopiedCode(true);
      window.setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  const progressPercent = Math.max(0, Math.min(100, ((COUNTDOWN_SECONDS - timeLeft) / COUNTDOWN_SECONDS) * 100));

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
            <h3 className="order-success-title">Te estamos redirigiendo a WhatsApp</h3>
            <p className="order-success-subtitle">
              Para coordinar el pago y despacho inmediato de tus prendas.
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

          {/* Countdown / Progress Section */}
          {!isLaunched ? (
            <div className="order-success-countdown-box">
              <div className="order-success-countdown-label">
                <span>Redirigiendo automáticamente en</span>
                <strong className="order-success-seconds">{timeLeft}s</strong>
              </div>
              <div className="order-success-progress-track">
                <div
                  className="order-success-progress-fill"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          ) : (
            <div className="order-success-launched-note">
              <CheckCircle2 size={16} />
              <span>WhatsApp abierto en una pestaña segura</span>
            </div>
          )}

          {/* Critical Tip Callout */}
          <div className="order-success-tip-card">
            <div className="order-success-tip-icon">
              <PackageCheck size={20} />
            </div>
            <div className="order-success-tip-content">
              <strong>Paso final en WhatsApp:</strong>
              <p>
                Al abrirse el chat, <u>presiona el botón de enviar (flecha verde)</u> con el mensaje que ya dejamos preparado para ti.
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="order-success-actions">
            <button
              type="button"
              className="btn btn-primary order-success-wa-btn"
              onClick={handleManualLaunch}
            >
              <MessageCircle size={18} />
              <span>{isLaunched ? "Volver a abrir WhatsApp" : "Abrir WhatsApp ahora"}</span>
              <ArrowRight size={16} />
            </button>

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
