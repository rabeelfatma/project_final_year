import React from "react";
import { LogOut } from "lucide-react";

/**
 * Shared top-right logout control for Admin / Teacher / Student dashboards.
 * Callers supply the existing auth cleanup + navigation handler.
 */
export default function DashboardLogoutButton({ onClick, label = "Logout" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="qc-btn qc-btn-danger qc-btn-block !min-h-9 !px-3 sm:!px-3.5 !text-xs"
    >
      <LogOut size={15} aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}
