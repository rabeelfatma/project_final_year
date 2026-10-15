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
      className="inline-flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl border text-red-500 font-bold text-[10px] sm:text-xs uppercase tracking-widest hover:bg-red-500/10 hover:border-red-500/40 transition-all shrink-0"
      style={{ borderColor: "var(--border)" }}
    >
      <LogOut size={16} aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}
