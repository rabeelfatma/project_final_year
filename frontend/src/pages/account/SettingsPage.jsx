import React, { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  Bell,
  KeyRound,
  Monitor,
  Moon,
  Palette,
  Sun,
} from "lucide-react";
import { useTheme } from "../../context/ThemeContext";

const TABS = [
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "account", label: "Account & Security", icon: KeyRound },
];

/**
 * Dedicated settings page wired only to real, existing preferences:
 * theme mode, accent colour, and password-reset link.
 * Does not add browser push notifications.
 */
export default function SettingsPage({ onBack, role = "user" }) {
  const { theme, setTheme, accent, accents, setAccent } = useTheme();
  const [activeTab, setActiveTab] = useState("appearance");

  return (
    <div className="max-w-3xl">
      <div className="qc-page-header">
        <div>
          <h2 className="qc-page-title">Settings</h2>
          <p className="qc-page-subtitle">
            Appearance, in-app notifications, and account security for your{" "}
            {role} account.
          </p>
        </div>
        {typeof onBack === "function" && (
          <button type="button" onClick={onBack} className="qc-btn qc-btn-secondary">
            <ArrowLeft size={16} aria-hidden="true" />
            Back
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2 mb-5">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={`qc-filter-chip !normal-case !tracking-normal !font-semibold inline-flex gap-2 ${
              activeTab === id ? "is-active" : ""
            }`}
          >
            <Icon size={14} aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      {activeTab === "appearance" && (
        <div className="space-y-4">
          <section className="qc-card">
            <h3 className="qc-section-title mb-3">Theme mode</h3>
            <p className="text-sm theme-muted mb-4">
              Choose light or dark mode. Your preference is saved on this device.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setTheme("light")}
                className={`settings-row ${theme === "light" ? "ring-2 ring-[var(--accent)]" : ""}`}
              >
                <span>
                  <Sun size={15} />
                  Light mode
                </span>
                <Monitor size={15} />
              </button>
              <button
                type="button"
                onClick={() => setTheme("dark")}
                className={`settings-row ${theme === "dark" ? "ring-2 ring-[var(--accent)]" : ""}`}
              >
                <span>
                  <Moon size={15} />
                  Dark mode
                </span>
                <Monitor size={15} />
              </button>
            </div>
          </section>

          <section className="qc-card">
            <h3 className="qc-section-title mb-3">Accent colour</h3>
            <p className="text-sm theme-muted mb-4">
              Applies across dashboards, charts, and interactive controls.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {Object.entries(accents).map(([key, item]) => (
                <button
                  type="button"
                  key={key}
                  onClick={() => setAccent(key)}
                  className={`accent-option ${accent === key ? "selected" : ""}`}
                >
                  <span style={{ background: theme === "dark" ? item.valueDark : item.value }} />
                  {item.name}
                </button>
              ))}
            </div>
          </section>
        </div>
      )}

      {activeTab === "notifications" && (
        <section className="qc-card space-y-4">
          <h3 className="qc-section-title">In-website notifications</h3>
          <p className="text-sm theme-muted leading-relaxed">
            QuickCheck Hub delivers account updates through the notification
            bell in the top bar. Open the bell to review, mark as read, or clear
            messages. Browser push notifications are not used.
          </p>
          <div className="settings-row pointer-events-none opacity-90">
            <span>
              <Bell size={15} />
              In-app notification centre
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wide accent-text">
              Always on
            </span>
          </div>
          <p className="theme-muted text-xs leading-relaxed">
            Notification history requires a connected server and database. When
            unavailable, the centre shows a clear status instead of fabricated
            messages.
          </p>
        </section>
      )}

      {activeTab === "account" && (
        <section className="qc-card space-y-4">
          <h3 className="qc-section-title">Password</h3>
          <p className="text-sm theme-muted leading-relaxed">
            Use the existing password recovery flow to reset your password via
            email. You will be signed out of this session only after you choose
            Logout from the account menu.
          </p>
          <Link to="/forgot-password" className="qc-btn qc-btn-secondary inline-flex">
            <KeyRound size={16} aria-hidden="true" />
            Change or reset password
          </Link>
          <p className="theme-muted text-xs leading-relaxed">
            Theme preferences stay on this device. Profile name, email, and
            academic data are stored in your QuickCheck Hub account when the
            database is connected.
          </p>
        </section>
      )}
    </div>
  );
}
