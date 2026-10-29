import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Bell,
  CheckCheck,
  ChevronDown,
  Settings,
  Trash2,
  User,
  UserCircle,
  X,
} from "lucide-react";
import api from "../../utils/api";
import { getApiOrigin } from "../../utils/apiBase";
import {
  getInAppNotificationsEnabled,
  IN_APP_NOTIFICATIONS_EVENT,
} from "../../utils/notificationPrefs";
import OverflowMenu from "../ui/OverflowMenu";
import DashboardLogoutButton from "./DashboardLogoutButton";

const API_ORIGIN = getApiOrigin();

const NOTIFICATION_TYPE_LABELS = {
  system: "System",
  message: "Message",
  submission: "Submission",
  assignment: "Assignment",
  grade: "Grade",
  registration_pending: "Registration",
};

function NotificationsPanel({
  role,
  status,
  enabled,
  notifications,
  onClose,
  onMarkAllRead,
  onClearAll,
  onDelete,
  onItemClick,
  panelRef,
}) {
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [typeFilter, setTypeFilter] = useState("all");

  const availableTypes = useMemo(() => {
    const found = new Set();
    for (const item of notifications) {
      const type = String(item.type || "system").toLowerCase();
      if (type) found.add(type);
    }
    return Array.from(found).sort();
  }, [notifications]);

  const visibleNotifications = useMemo(() => {
    return notifications.filter((item) => {
      if (unreadOnly && item.read) return false;
      if (typeFilter !== "all") {
        return String(item.type || "system").toLowerCase() === typeFilter;
      }
      return true;
    });
  }, [notifications, unreadOnly, typeFilter]);

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
        aria-label="Notifications"
        data-testid="qc-notifications-panel"
        id="qc-notifications-panel"
      >
        <div
          className="flex items-center justify-between border-b pb-3 mb-3 gap-2"
          style={{ borderColor: "var(--border)" }}
        >
          <div>
            <b className="text-sm">Notifications</b>
            <p className="text-[10px] theme-muted uppercase tracking-wide mt-0.5">
              {role} account updates
            </p>
          </div>
          <button
            type="button"
            className="icon-btn !p-1.5"
            onClick={onClose}
            title="Close Notifications"
            aria-label="Close Notifications"
          >
            <X size={14} />
          </button>
        </div>

        {enabled && (
          <div className="space-y-2 mb-3">
            <div className="qc-list-toolbar">
              <button
                type="button"
                className={`qc-filter-chip ${unreadOnly ? "is-active" : ""}`}
                onClick={() => setUnreadOnly((value) => !value)}
                aria-pressed={unreadOnly}
              >
                Unread
              </button>
              <select
                className="qc-input !min-h-9 !py-1 !text-[11px] !w-auto"
                value={typeFilter}
                onChange={(event) => setTypeFilter(event.target.value)}
                aria-label="Filter by notification type"
              >
                <option value="all">All types</option>
                {availableTypes.map((type) => (
                  <option key={type} value={type}>
                    {NOTIFICATION_TYPE_LABELS[type] || type}
                  </option>
                ))}
              </select>
              <div className="ml-auto qc-list-toolbar">
                <button
                  type="button"
                  className="qc-chat-toolbar-btn accent"
                  onClick={onMarkAllRead}
                  disabled={status !== "ready"}
                >
                  <CheckCheck size={13} aria-hidden="true" />
                  Mark all read
                </button>
                <OverflowMenu
                  label="Notification actions"
                  disabled={!notifications.length}
                  items={[
                    {
                      id: "clear-all",
                      label: "Clear all",
                      danger: true,
                      icon: <Trash2 size={14} />,
                      disabled: !notifications.length,
                      onSelect: onClearAll,
                    },
                  ]}
                />
              </div>
            </div>
          </div>
        )}

        <div className="max-h-[min(24rem,55vh)] overflow-y-auto space-y-2">
          {!enabled && (
            <p className="qc-empty-panel px-2">
              The notification centre is turned off in Settings. Turn it on to
              review account updates. Existing history is preserved.
            </p>
          )}
          {enabled && status === "loading" && (
            <p className="qc-empty-panel">Loading notifications…</p>
          )}
          {enabled && status === "unavailable" && (
            <p className="qc-empty-panel px-2">
              Notifications are unavailable until the server and database are
              connected. No messages were fabricated.
            </p>
          )}
          {enabled && status === "ready" && !notifications.length && (
            <p className="qc-empty-panel">No notifications yet.</p>
          )}
          {enabled &&
            status === "ready" &&
            notifications.length > 0 &&
            !visibleNotifications.length && (
              <p className="qc-empty-panel">No notifications match your filters.</p>
            )}
          {enabled &&
            status === "ready" &&
            visibleNotifications.map((item) => (
              <div
                key={item._id}
                className={`qc-notification-card ${item.read ? "" : "is-unread"}`}
              >
                <button
                  type="button"
                  className="qc-notification-card__body"
                  onClick={() => onItemClick(item)}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-bold text-xs">{item.title}</p>
                    <span className="qc-type-badge">
                      {NOTIFICATION_TYPE_LABELS[String(item.type || "system").toLowerCase()] ||
                        item.type ||
                        "System"}
                    </span>
                  </div>
                  <p className="theme-muted text-[11px] mt-1 leading-relaxed">
                    {item.message}
                  </p>
                  <p className="theme-muted text-[9px] mt-2">
                    {item.createdAt
                      ? new Date(item.createdAt).toLocaleString()
                      : ""}
                  </p>
                </button>
                <OverflowMenu
                  label={`Actions for ${item.title || "notification"}`}
                  items={[
                    {
                      id: `delete-${item._id}`,
                      label: "Delete",
                      danger: true,
                      icon: <Trash2 size={14} />,
                      onSelect: () => onDelete(item._id),
                    },
                  ]}
                />
              </div>
            ))}
        </div>
      </div>
    </div>,
    document.body
  );
}

/**
 * Top-right dashboard chrome: notifications, profile menu (Profile, Settings), and Logout.
 */
export default function DashboardTopBar({
  role = "user",
  onLogout,
  onOpenProfile,
  onOpenSettings,
  onRegistrationNotificationClick,
}) {
  const [profile, setProfile] = useState({
    name: localStorage.getItem("userName") || "User",
    email: localStorage.getItem("userEmail") || "",
    profilePicture: localStorage.getItem("userProfilePicture") || "",
  });
  const [notifications, setNotifications] = useState([]);
  const [notificationsStatus, setNotificationsStatus] = useState("idle");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(() =>
    getInAppNotificationsEnabled()
  );

  const menuRef = useRef(null);
  const notificationPanelRef = useRef(null);
  const previousUnread = useRef(null);
  const token = localStorage.getItem("token");

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
    if (!getInAppNotificationsEnabled()) {
      setNotifications([]);
      setNotificationsStatus("disabled");
      return;
    }
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
    if (notificationsEnabled) {
      loadNotifications();
      const timer = setInterval(loadNotifications, 10000);
      return () => clearInterval(timer);
    }
    setNotifications([]);
    setNotificationsStatus("disabled");
    return undefined;
  }, [token, notificationsEnabled]);

  useEffect(() => {
    const onProfileSaved = (event) => {
      const data = event.detail;
      if (!data) return;
      setProfile({
        name: data.name || "User",
        email: data.email || "",
        profilePicture: data.profilePicture || "",
      });
    };
    const closeNotifications = () => setNotificationsOpen(false);
    const onPrefChange = (event) => {
      const enabled = event?.detail?.enabled ?? getInAppNotificationsEnabled();
      setNotificationsEnabled(Boolean(enabled));
      if (!enabled) setNotificationsOpen(false);
    };
    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setNotificationsOpen(false);
        setMenuOpen(false);
      }
    };
    window.addEventListener("quickcheck:profile-saved", onProfileSaved);
    window.addEventListener("quickcheck:close-notifications", closeNotifications);
    window.addEventListener(IN_APP_NOTIFICATIONS_EVENT, onPrefChange);
    document.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("quickcheck:profile-saved", onProfileSaved);
      window.removeEventListener("quickcheck:close-notifications", closeNotifications);
      window.removeEventListener(IN_APP_NOTIFICATIONS_EVENT, onPrefChange);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onPointerDown = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [menuOpen]);

  const openNotifications = () => {
    window.dispatchEvent(new CustomEvent("quickcheck:close-drawer"));
    window.dispatchEvent(new CustomEvent("quickcheck:close-messages"));
    setMenuOpen(false);
    setNotificationsOpen(true);
    if (notificationsEnabled) loadNotifications();
  };

  const markAllRead = async () => {
    try {
      await api.put("/notifications/read-all");
      setNotifications((items) => items.map((item) => ({ ...item, read: true })));
      previousUnread.current = 0;
    } catch (error) {
      alert(
        error.response?.data?.message ||
          "Notifications could not be marked as read."
      );
    }
  };

  const deleteNotification = async (id) => {
    if (!window.confirm("Delete this notification?")) return;
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

  const handleNotificationClick = async (item) => {
    if (!item.read) {
      try {
        await api.put(`/notifications/${item._id}/read`);
        setNotifications((items) =>
          items.map((row) =>
            row._id === item._id ? { ...row, read: true } : row
          )
        );
      } catch {
        /* non-blocking */
      }
    }
    if (
      item.type === "registration_pending" &&
      typeof onRegistrationNotificationClick === "function"
    ) {
      onRegistrationNotificationClick(item);
      setNotificationsOpen(false);
    }
  };

  const unread = notificationsEnabled
    ? notifications.filter((item) => !item.read).length
    : 0;
  const picture = profile.profilePicture
    ? `${API_ORIGIN}/${String(profile.profilePicture).replace(/^\/+/, "")}?v=${encodeURIComponent(profile.profilePicture)}`
    : "";

  return (
    <>
      <button
        type="button"
        aria-expanded={notificationsOpen}
        aria-controls="qc-notifications-panel"
        aria-label={
          notificationsEnabled
            ? "Notifications"
            : "Notifications (disabled in Settings)"
        }
        title={
          notificationsEnabled
            ? "Notifications"
            : "Notification centre is off — enable in Settings"
        }
        onClick={() =>
          notificationsOpen ? setNotificationsOpen(false) : openNotifications()
        }
        className={`relative inline-flex items-center justify-center w-9 h-9 rounded-qc border theme-surface hover:border-[var(--accent)] transition-colors ${
          notificationsEnabled ? "" : "opacity-60"
        }`}
        style={{ borderColor: "var(--border)" }}
      >
        <Bell size={17} />
        {unread > 0 && (
          <span className="notification-badge !right-0 !top-0 translate-x-1/4 -translate-y-1/4">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      <div className="relative" ref={menuRef}>
        <button
          type="button"
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          aria-label="Account menu"
          onClick={() => {
            setMenuOpen((open) => !open);
            setNotificationsOpen(false);
          }}
          className="inline-flex items-center gap-2 rounded-qc border theme-surface pl-1.5 pr-2 py-1 hover:border-[var(--accent)] transition-colors max-w-[14rem]"
          style={{ borderColor: "var(--border)" }}
        >
          <span
            className="w-8 h-8 rounded-qc overflow-hidden border flex items-center justify-center accent-soft shrink-0"
            style={{ borderColor: "var(--border)" }}
          >
            {picture ? (
              <img
                src={picture}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              <UserCircle size={20} className="accent-text" />
            )}
          </span>
          <span className="hidden sm:block min-w-0 text-left">
            <span className="block text-xs font-semibold truncate leading-tight">
              {profile.name}
            </span>
          </span>
          <ChevronDown size={14} className="theme-muted shrink-0" aria-hidden="true" />
        </button>

        {menuOpen && (
          <div
            role="menu"
            className="qc-topbar-menu"
          >
            <div className="px-4 py-3 border-b" style={{ borderColor: "var(--border)" }}>
              <p className="text-sm font-semibold truncate">{profile.name}</p>
              <p className="text-xs theme-muted truncate mt-0.5">
                {profile.email || `${role} account`}
              </p>
            </div>
            <div className="p-1.5">
              <button
                type="button"
                role="menuitem"
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-qc text-sm font-medium theme-muted hover:bg-[var(--accent-soft)] hover:text-[var(--accent)] text-left"
                onClick={() => {
                  setMenuOpen(false);
                  onOpenProfile?.();
                }}
              >
                <User size={16} aria-hidden="true" />
                My Profile
              </button>
              <button
                type="button"
                role="menuitem"
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-qc text-sm font-medium theme-muted hover:bg-[var(--accent-soft)] hover:text-[var(--accent)] text-left"
                onClick={() => {
                  setMenuOpen(false);
                  onOpenSettings?.();
                }}
              >
                <Settings size={16} aria-hidden="true" />
                Settings
              </button>
            </div>
          </div>
        )}
      </div>

      <DashboardLogoutButton
        compact
        onClick={() => {
          setMenuOpen(false);
          setNotificationsOpen(false);
          onLogout?.();
        }}
      />

      {notificationsOpen && (
        <NotificationsPanel
          role={role}
          status={notificationsStatus}
          enabled={notificationsEnabled}
          notifications={notifications}
          onClose={() => setNotificationsOpen(false)}
          onMarkAllRead={markAllRead}
          onClearAll={clearNotifications}
          onDelete={deleteNotification}
          onItemClick={handleNotificationClick}
          panelRef={notificationPanelRef}
        />
      )}
    </>
  );
}
