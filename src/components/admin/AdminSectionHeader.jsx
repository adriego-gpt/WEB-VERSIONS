import React from "react";

export function AdminSectionHeader({ title, description, actions, meta, titleId, headingLevel = 4 }) {
  const Heading = headingLevel === 2 ? "h2" : "h4";
  return (
    <header className="admin-workspace-header">
      <div className="admin-workspace-heading">
        <div className="admin-workspace-title-row">
          <Heading id={titleId}>{title}</Heading>
          {meta}
        </div>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="admin-workspace-actions">{actions}</div>}
    </header>
  );
}
