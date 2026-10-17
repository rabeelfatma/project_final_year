import React from "react";

/**
 * Shared sidebar nav control for Admin / Teacher / Student dashboards.
 */
export default function DashboardNavItem({
  icon,
  label,
  active = false,
  onClick,
  badge = null,
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`qc-nav-item ${active ? "is-active" : ""}`}
    >
      <span className="qc-nav-item__icon" aria-hidden="true">
        {icon}
      </span>
      <span className="qc-nav-item__label">{label}</span>
      {badge != null && badge !== "" ? (
        <span className="qc-nav-item__badge">{badge}</span>
      ) : null}
    </button>
  );
}
