import React from "react";
import {
  normalizeOrderStatusForOrder,
  getOrderStatusOptions,
  getOrderStatusMeta,
} from "../../domain/orders/status";

export function OrderStatusProgress({ status, deliveryType = "delivery" }) {
  const normalizedStatus = normalizeOrderStatusForOrder(status, deliveryType);
  const currentMeta = getOrderStatusMeta(normalizedStatus);
  const steps = getOrderStatusOptions(deliveryType).filter((item) => item !== "Cancelado");
  const currentIndex = steps.indexOf(normalizedStatus);
  const progress = normalizedStatus === "Cancelado" ? 0 : ((currentIndex + 1) / steps.length) * 100;
  const Icon = currentMeta.icon;

  if (normalizedStatus === "Cancelado") {
    return (
      <div className="order-progress">
        <span className={`order-status-pill ${currentMeta.tone}`}><Icon size={16} /> {normalizedStatus}</span>
        <div className="order-progress-cancelled">
          <strong>Pedido cancelado</strong>
          <p style={{ margin: 0 }}>{currentMeta.description}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="order-progress">
      <span className={`order-status-pill ${currentMeta.tone}`}><Icon size={16} /> {normalizedStatus}</span>
      <p className="order-progress-current-copy">{currentMeta.description}</p>
      <div className="order-progress-bar" aria-hidden="true">
        <div className="order-progress-bar-fill" style={{ transform: `scaleX(${progress / 100})` }} />
      </div>
      <div className="order-progress-steps">
        {steps.map((step, index) => {
          const StepIcon = getOrderStatusMeta(step).icon;
          const stepState = index < currentIndex ? "done" : index === currentIndex ? "active" : "upcoming";
          return (
            <div key={step} className={`order-progress-step ${stepState}`} aria-current={stepState === "active" ? "step" : undefined}>
              <div className="order-progress-bullet"><StepIcon size={18} /></div>
              <p className="order-progress-label">{step}</p>
              <p className="order-progress-caption">{getOrderStatusMeta(step).description}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default React.memo(OrderStatusProgress);
