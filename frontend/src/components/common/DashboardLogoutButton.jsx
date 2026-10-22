import React from "react";
import { LogOut } from "lucide-react";

/**
 * Shared top-right logout control for Admin / Teacher / Student dashboards.
 * Callers supply the existing auth cleanup + navigation handler.
 */
export default function DashboardLogoutButton({
  onClick,
  label = "Logout",
  compact = false,
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={
        compact
          ? "qc-btn qc-btn-secondary !min-h-9 !h-9 !px-2.5 sm:!px-3 !text-xs !gap-1.5 shrink-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          : "qc-btn qc-btn-secondary qc-btn-block !min-h-9 !px-3 sm:!px-3.5 !text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
      }
    >
      <LogOut size={15} aria-hidden="true" />
      <span className={compact ? "hidden sm:inline" : undefined}>{label}</span>
    </button>
  );
}
