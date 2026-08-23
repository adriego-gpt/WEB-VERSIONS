import React from "react";

export function AdminSectionHeader({ title, description, actions, meta, titleId }) {
  return (
    <header className="admin-workspace-header">
      <div className="admin-workspace-heading">
        <div className="admin-workspace-title-row">
          <h4 id={titleId}>{title}</h4>
          {meta}
        </div>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="admin-workspace-actions">{actions}</div>}
    </header>
  );
}

