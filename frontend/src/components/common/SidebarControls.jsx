import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Bell,
  CheckCheck,
  Moon,
  Palette,
  Settings,
  Sun,
  UserCircle,
  X,
  Monitor,
  MessageCircle,
  Bot,
  Trash2,
} from "lucide-react";
import { useTheme } from "../../context/ThemeContext";
import api from "../../utils/api";
import ProfileModal from "../profile/ProfileModal";
import { getApiOrigin } from "../../utils/apiBase";

const API_ORIGIN = getApiOrigin();

function UtilityPanel({ title, subtitle, onClose, children, panelRef, testId }) {
  return createPortal(
    <div
      className="qc-utility-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        className="qc-utility-panel"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-testid={testId}
      >
        <div
          className="flex items-center justify-between border-b pb-3 mb-3 gap-2"
          style={{ borderColor: "var(--border)" }}
        >
          <div>
            <b className="text-sm">{title}</b>
            {subtitle ? (
              <p className="text-[10px] theme-muted uppercase tracking-wide mt-0.5">
                {subtitle}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            className="icon-btn !p-1.5"
            onClick={onClose}
            title={`Close ${title}`}
            aria-label={`Close ${title}`}
          >
            <X size={14} />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}

export default function SidebarControls({ role, onRegistrationNotificationClick }) {
  const { theme, toggleTheme, accent, accents, setAccent } = useTheme();

  const [notifications, setNotifications] = useState([]);
  const [notificationsStatus, setNotificationsStatus] = useState("idle");
  const [profile, setProfile] = useState({
    name: localStorage.getItem("userName") || "User",
    email: localStorage.getItem("userEmail") || "",
    profilePicture: localStorage.getItem("userProfilePicture") || "",
  });

  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const previousUnread = useRef(null);
  const notificationPanelRef = useRef(null);
  const settingsPanelRef = useRef(null);
  const token = localStorage.getItem("token");

  const closeUtilities = () => {
    setNotificationsOpen(false);
    setSettingsOpen(false);
  };

  const openUtility = (kind) => {
    window.dispatchEvent(new CustomEvent("quickcheck:close-drawer"));
    window.dispatchEvent(new CustomEvent("quickcheck:close-messages"));
    if (kind === "notifications") {
      setNotificationsOpen(true);
      setSettingsOpen(false);
      loadNotifications();
    } else if (kind === "settings") {
      setSettingsOpen(true);
      setNotificationsOpen(false);
    }
  };

  const loadProfile = async () => {
    try {
      const { data } = await api.get("/user/profile");
      if (!data) return;

      setProfile({
        name: data.name || "User",
        email: data.email || "",
        profilePicture: data.profilePicture || "",
      });

      localStorage.setItem("userName", data.name || "User");
      localStorage.setItem("userEmail", data.email || "");

      if (data.profilePicture) {
        localStorage.setItem("userProfilePicture", data.profilePicture);
      }
    } catch (error) {
      console.error("Could not load profile:", error);
    }
  };

  const loadNotifications = async () => {
    if (!token) {
      setNotifications([]);
      setNotificationsStatus("unavailable");
      return;
    }

    setNotificationsStatus("loading");
    try {
      const { data } = await api.get("/notifications");
      const next = Array.isArray(data) ? data : [];
      previousUnread.current = next.filter((item) => !item.read).length;
      setNotifications(next);
      setNotificationsStatus("ready");
    } catch (error) {
      console.error("Could not load notifications:", error);
      setNotifications([]);
      setNotificationsStatus("unavailable");
    }
  };

  useEffect(() => {
    if (!token) return undefined;

    loadProfile();
    loadNotifications();

    const timer = setInterval(() => {
      loadNotifications();
    }, 10000);

    return () => clearInterval(timer);
  }, [token]);

  useEffect(() => {
    const closeNotifications = () => setNotificationsOpen(false);

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        closeUtilities();
        setProfileOpen(false);
      }
    };

    window.addEventListener("quickcheck:close-notifications", closeNotifications);
    document.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener(
        "quickcheck:close-notifications",
        closeNotifications
      );
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  const markAllRead = async () => {
    try {
      await api.put("/notifications/read-all");
      setNotifications((items) =>
        items.map((item) => ({ ...item, read: true }))
      );
      previousUnread.current = 0;
    } catch (error) {
      alert(
        error.response?.data?.message ||
          "Notifications could not be marked as read."
      );
    }
  };

  const deleteNotification = async (id) => {
    try {
      await api.delete(`/notifications/${id}`);
      setNotifications((items) => items.filter((item) => item._id !== id));
    } catch (error) {
      alert(
        error.response?.data?.message || "Notification could not be deleted."
      );
    }
  };

  const clearNotifications = async () => {
    if (!notifications.length) return;
    if (!window.confirm("Clear all notifications?")) return;

    try {
      await api.delete("/notifications");
      setNotifications([]);
      previousUnread.current = 0;
    } catch (error) {
      alert(
        error.response?.data?.message || "Notifications could not be cleared."
      );
    }
  };

  const handleProfileSaved = (data) => {
    setProfile({
      name: data?.name || "User",
      email: data?.email || "",
      profilePicture: data?.profilePicture || "",
    });

    localStorage.setItem("userName", data?.name || "User");
    localStorage.setItem("userEmail", data?.email || "");

    if (data?.profilePicture) {
      localStorage.setItem("userProfilePicture", data.profilePicture);
    }
  };

  const unread = notifications.filter((item) => !item.read).length;

  const picture = profile.profilePicture
    ? `${API_ORIGIN}/${String(profile.profilePicture).replace(/^\/+/, "")}?v=${encodeURIComponent(profile.profilePicture)}`
    : "";

  return (
    <>
      <div
        className="mt-auto pt-5 border-t"
        style={{ borderColor: "var(--border)" }}
      >
        <button
          type="button"
          onClick={() => setProfileOpen(true)}
          className="w-full flex items-center gap-3 p-3 rounded-2xl theme-surface border hover:border-[var(--accent)] transition-all text-left"
        >
          <div
            className="w-10 h-10 rounded-xl overflow-hidden border flex items-center justify-center accent-soft shrink-0"
            style={{ borderColor: "var(--border)" }}
          >
            {picture ? (
              <img
                src={picture}
                alt="Profile"
                className="w-full h-full object-cover"
              />
            ) : (
              <UserCircle size={23} className="accent-text" />
            )}
          </div>

          <div className="min-w-0">
            <p className="text-xs font-black truncate">{profile.name}</p>
            <p className="theme-muted text-[9px] truncate">
              {profile.email || `${role} account`}
            </p>
          </div>
        </button>

        <div className="flex flex-col gap-2 mt-3">
          <button
            type="button"
            aria-expanded={notificationsOpen}
            aria-controls="qc-notifications-panel"
            onClick={() =>
              notificationsOpen
                ? setNotificationsOpen(false)
                : openUtility("notifications")
            }
            className={`sidebar-tool ${notificationsOpen ? "is-active" : ""}`}
          >
            <span className="relative">
              <Bell size={17} />
              {unread > 0 && (
                <span className="notification-badge">
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </span>
            <span>Notifications</span>
          </button>

          <button
            type="button"
            onClick={() =>
              window.dispatchEvent(new CustomEvent("quickcheck:open-messages"))
            }
            className="sidebar-tool"
          >
            <MessageCircle size={17} />
            <span>Messages</span>
          </button>

          <button
            type="button"
            onClick={() =>
              window.dispatchEvent(new CustomEvent("quickcheck:open-ai"))
            }
            className="sidebar-tool"
          >
            <Bot size={17} />
            <span>AI Assistant</span>
          </button>

          <button
            type="button"
            aria-expanded={settingsOpen}
            aria-controls="qc-settings-panel"
            onClick={() =>
              settingsOpen ? setSettingsOpen(false) : openUtility("settings")
            }
            className={`sidebar-tool ${settingsOpen ? "is-active" : ""}`}
          >
            <Settings size={17} />
            <span>Settings</span>
          </button>
        </div>
      </div>

      {notificationsOpen && (
        <UtilityPanel
          title="Notifications"
          subtitle={`${role} account updates`}
          onClose={() => setNotificationsOpen(false)}
          panelRef={notificationPanelRef}
          testId="qc-notifications-panel"
        >
          <div className="flex items-center justify-end gap-3 mb-3">
            <button
              type="button"
              className="accent-text text-[10px] flex items-center gap-1"
              onClick={markAllRead}
              disabled={notificationsStatus !== "ready"}
            >
              <CheckCheck size={13} />
              Read all
            </button>
            <button
              type="button"
              className="text-red-400 text-[10px] font-bold disabled:opacity-40"
              onClick={clearNotifications}
              disabled={!notifications.length}
            >
              Clear all
            </button>
          </div>

          <div className="max-h-[min(24rem,55vh)] overflow-y-auto space-y-1">
            {notificationsStatus === "loading" && (
              <p className="theme-muted text-sm py-8 text-center">
                Loading notifications…
              </p>
            )}
            {notificationsStatus === "unavailable" && (
              <p className="theme-muted text-sm py-8 text-center px-2">
                Notifications are unavailable until the server and database are
                connected. No messages were fabricated.
              </p>
            )}
            {notificationsStatus === "ready" && !notifications.length && (
              <p className="theme-muted text-sm py-8 text-center">
                No notifications yet.
              </p>
            )}
            {notificationsStatus === "ready" &&
              notifications.map((item) => (
                <div
                  key={item._id}
                  className={`p-3 rounded-xl border flex gap-2 items-start ${
                    item.read ? "" : "accent-soft"
                  }`}
                  style={{ borderColor: "var(--border)" }}
                >
                  <button
                    type="button"
                    className="flex-1 min-w-0 text-left"
                    onClick={() => {
                      if (
                        item.type === "registration_pending" &&
                        typeof onRegistrationNotificationClick === "function"
                      ) {
                        onRegistrationNotificationClick(item);
                        setNotificationsOpen(false);
                      }
                    }}
                  >
                    <p className="font-bold text-xs">{item.title}</p>
                    <p className="theme-muted text-[11px] mt-1">{item.message}</p>
                    <p className="theme-muted text-[9px] mt-2">
                      {item.createdAt
                        ? new Date(item.createdAt).toLocaleString()
                        : ""}
                    </p>
                  </button>
                  <button
                    type="button"
                    className="text-red-400 hover:text-red-300 shrink-0"
                    onClick={() => deleteNotification(item._id)}
                    title="Delete notification"
                    aria-label="Delete notification"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
          </div>
        </UtilityPanel>
      )}

      {settingsOpen && (
        <UtilityPanel
          title="Settings"
          subtitle={`${role} preferences`}
          onClose={() => setSettingsOpen(false)}
          panelRef={settingsPanelRef}
          testId="qc-settings-panel"
        >
          <div className="space-y-2">
            <button
              type="button"
              className="settings-row"
              onClick={toggleTheme}
            >
              <span>
                {theme === "dark" ? <Moon size={15} /> : <Sun size={15} />}
                {theme === "dark" ? "Dark theme" : "Light theme"}
              </span>
              <Monitor size={15} />
            </button>
          </div>

          <div className="mt-5">
            <div className="flex items-center gap-2 text-xs font-bold mb-2">
              <Palette size={14} />
              Accent colour
            </div>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(accents).map(([key, item]) => (
                <button
                  type="button"
                  key={key}
                  onClick={() => setAccent(key)}
                  className={`accent-option ${
                    accent === key ? "selected" : ""
                  }`}
                >
                  <span style={{ background: item.value }} />
                  {item.name}
                </button>
              ))}
            </div>
          </div>

          <p className="theme-muted text-[10px] mt-4 leading-relaxed">
            Theme preferences are stored on this device. Account and academic
            data settings require a connected database.
          </p>
        </UtilityPanel>
      )}

      {profileOpen && (
        <ProfileModal
          onClose={() => setProfileOpen(false)}
          onSaved={handleProfileSaved}
        />
      )}
    </>
  );
}
