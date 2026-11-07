import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  Bell,
  KeyRound,
  Moon,
  Palette,
  Sun,
} from "lucide-react";
import { useTheme } from "../../context/ThemeContext";
import {
  getInAppNotificationsEnabled,
  setInAppNotificationsEnabled,
} from "../../utils/notificationPrefs";

const TABS = [
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "account", label: "Account & Security", icon: KeyRound },
];

/**
 * Shared Settings for Admin, Teacher, and Student.
 * Vertical left nav + content panel on the right (stacks on small screens).
 */
export default function SettingsPage({ onBack, role = "user" }) {
  const { theme, setTheme, accent, accents, setAccent } = useTheme();
  const [activeTab, setActiveTab] = useState("appearance");
  const [notificationsEnabled, setNotificationsEnabled] = useState(() =>
    getInAppNotificationsEnabled()
  );

  useEffect(() => {
    setNotificationsEnabled(getInAppNotificationsEnabled());
  }, []);

  const toggleNotifications = () => {
    const next = !notificationsEnabled;
    setInAppNotificationsEnabled(next);
    setNotificationsEnabled(next);
  };

  return (
    <div className="qc-settings-shell">
      <div className="qc-page-header qc-settings-header">
        <div>
          <h2 className="qc-page-title">Settings</h2>
          <p className="qc-page-subtitle">
            Appearance, notifications, and security for your {role} account.
          </p>
        </div>
        {typeof onBack === "function" && (
          <button type="button" onClick={onBack} className="qc-btn qc-btn-secondary">
            <ArrowLeft size={16} aria-hidden="true" />
            Back
          </button>
        )}
      </div>

      <div className="qc-settings-layout">
        <nav className="qc-settings-sidenav" aria-label="Settings sections">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={activeTab === id}
              onClick={() => setActiveTab(id)}
              className={`qc-settings-sidenav__item ${activeTab === id ? "is-active" : ""}`}
            >
              <Icon size={15} aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="qc-settings-content" role="tabpanel">
          {activeTab === "appearance" && (
            <section className="qc-card qc-settings-card">
              <div className="qc-settings-row">
                <div className="qc-settings-row__copy">
                  <p className="qc-settings-row__title">Theme mode</p>
                  <p className="qc-settings-row__hint">Saved on this device.</p>
                </div>
                <div className="qc-theme-pills" role="group" aria-label="Theme mode">
                  <button
                    type="button"
                    className={`qc-theme-pill ${theme === "light" ? "is-selected" : ""}`}
                    onClick={() => setTheme("light")}
                    aria-pressed={theme === "light"}
                  >
                    <Sun size={14} aria-hidden="true" />
                    Light
                  </button>
                  <button
                    type="button"
                    className={`qc-theme-pill ${theme === "dark" ? "is-selected" : ""}`}
                    onClick={() => setTheme("dark")}
                    aria-pressed={theme === "dark"}
                  >
                    <Moon size={14} aria-hidden="true" />
                    Dark
                  </button>
                </div>
              </div>

              <div className="qc-settings-divider" />

              <div className="qc-settings-row qc-settings-row--stack">
                <div className="qc-settings-row__copy">
                  <p className="qc-settings-row__title">Accent colour</p>
                  <p className="qc-settings-row__hint">Used for actions, charts, and highlights.</p>
                </div>
                <div className="qc-swatch-grid" role="group" aria-label="Accent colour">
                  {Object.entries(accents).map(([key, item]) => (
                    <button
                      type="button"
                      key={key}
                      className={`qc-swatch ${accent === key ? "is-selected" : ""}`}
                      onClick={() => setAccent(key)}
                      aria-pressed={accent === key}
                      title={item.name}
                    >
                      <span
                        className="qc-swatch__tone"
                        style={{ background: theme === "dark" ? item.valueDark : item.value }}
                      />
                      <span className="qc-swatch__label">{item.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            </section>
          )}

          {activeTab === "notifications" && (
            <section className="qc-card qc-settings-card">
              <button
                type="button"
                role="switch"
                aria-checked={notificationsEnabled}
                aria-label="In-app notification centre"
                onClick={toggleNotifications}
                className="qc-settings-row qc-settings-row--button"
              >
                <div className="qc-settings-row__copy">
                  <p className="qc-settings-row__title">
                    <Bell size={14} aria-hidden="true" />
                    In-app notification centre
                  </p>
                  <p className="qc-settings-row__hint">
                    {notificationsEnabled
                      ? "On — open the bell in the top bar to review alerts."
                      : "Off — history is kept and returns when you enable this again."}
                  </p>
                </div>
                <span className={`toggle ${notificationsEnabled ? "on" : ""}`} aria-hidden="true" />
              </button>
            </section>
          )}

          {activeTab === "account" && (
            <section className="qc-card qc-settings-card">
              <div className="qc-settings-row qc-settings-row--stack">
                <div className="qc-settings-row__copy">
                  <p className="qc-settings-row__title">Password</p>
                  <p className="qc-settings-row__hint">
                    Reset via email using the existing recovery flow. Profile data stays in your account when the database is connected.
                  </p>
                </div>
                <Link to="/forgot-password" className="qc-btn qc-btn-secondary inline-flex self-start">
                  <KeyRound size={15} aria-hidden="true" />
                  Change or reset password
                </Link>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
