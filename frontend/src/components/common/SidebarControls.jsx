import React from "react";
import { Bot, MessageCircle } from "lucide-react";

/**
 * Sidebar utility actions shared by Admin / Teacher / Student.
 * Profile, Settings, Notifications, and Logout live in the top bar.
 */
export default function SidebarControls() {
  return (
    <div
      className="mt-auto pt-5 border-t"
      style={{ borderColor: "var(--border)" }}
    >
      <p className="qc-section-title px-1 mb-2">Workspace</p>
      <div className="flex flex-col gap-1">
        <button
          type="button"
          onClick={() =>
            window.dispatchEvent(new CustomEvent("quickcheck:open-messages"))
          }
          className="qc-nav-item"
        >
          <span className="qc-nav-item__icon">
            <MessageCircle size={18} aria-hidden="true" />
          </span>
          <span className="qc-nav-item__label">Messages</span>
        </button>

        <button
          type="button"
          onClick={() =>
            window.dispatchEvent(new CustomEvent("quickcheck:open-ai"))
          }
          className="qc-nav-item"
        >
          <span className="qc-nav-item__icon">
            <Bot size={18} aria-hidden="true" />
          </span>
          <span className="qc-nav-item__label">AI Assistant</span>
        </button>
      </div>
    </div>
  );
}
