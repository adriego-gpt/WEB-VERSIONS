import React from "react";

export function EmotionalEmptyState({
  icon,
  title,
  description,
  actionLabel = "",
  onAction,
}) {
  return (
    <div className="empty-emotional-state">
      <div className="empty-emotional-icon">
        {icon ? React.createElement(icon, { size: 22 }) : null}
      </div>
      <h4>{title}</h4>
      <p>{description}</p>
      {actionLabel && onAction && (
        <button type="button" className="btn btn-primary empty-emotional-cta" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}

export default EmotionalEmptyState;
