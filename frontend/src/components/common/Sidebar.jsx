import React, { useEffect, useRef, useState } from "react";
import { Bell, CheckCheck, Moon, Palette, Settings, Sun, UserCircle, X, Monitor, MessageCircle, Bot, Trash2 } from "lucide-react";
import { useTheme } from "../../context/ThemeContext";
import api from "../../utils/api";
import ProfileModal from "../profile/ProfileModal";
import { getApiOrigin } from "../../utils/apiBase";

const API_ORIGIN = getApiOrigin();

export default function SidebarControls({ role }) {
  const { theme, toggleTheme, accent, accents, setAccent } = useTheme();
  const [notifications, setNotifications] = useState([]);
  const [profile, setProfile] = useState({
    name: localStorage.getItem("userName") || "User",
    email: localStorage.getItem("userEmail") || "",
    profilePicture: localStorage.getItem("userProfilePicture") || "",
  });
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const notificationPanelRef = useRef(null);
  const token = localStorage.getItem("token");

  const loadProfile = async () => {
    try {
      const { data } = await api.get("/user/profile");
      if (!data) return;
      setProfile({ name: data.name || "User", email: data.email || "", profilePicture: data.profilePicture || "" });
      localStorage.setItem("userName", data.name || "User");
      localStorage.setItem("userEmail", data.email || "");
      if (data.registrationNumber) localStorage.setItem("userRegNo", data.registrationNumber);
      if (data.profilePicture) localStorage.setItem("userProfilePicture", data.profilePicture);
    } catch (_) {}
  };

  const loadNotifications = async () => {
    if (!token) return;
    try {
      const { data } = await api.get("/notifications");
      setNotifications(Array.isArray(data) ? data : []);
    } catch (_) {}
  };

  useEffect(() => {
    loadProfile();
    loadNotifications();
    const timer = setInterval(loadNotifications, 5000);
    return () => clearInterval(timer);
  }, [token]);

  useEffect(() => {
    const closeNotifications = () => setNotificationsOpen(false);
    const handleOutside = (event) => {
      if (!notificationPanelRef.current?.contains(event.target)) setNotificationsOpen(false);
    };
    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setNotificationsOpen(false);
        setSettingsOpen(false);
      }
    };
    window.addEventListener("quickcheck:close-notifications", closeNotifications);
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("quickcheck:close-notifications", closeNotifications);
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  const markAllRead = async () => {
    try { await api.put("/notifications/read-all"); } catch (_) {}
    setNotifications((items) => items.map((n) => ({ ...n, read: true })));
  };

  const deleteNotification = async (id) => {
    try {
      await api.delete(`/notifications/${id}`);
      setNotifications((items) => items.filter((n) => n._id !== id));
    } catch (error) {
      alert(error.response?.data?.message || "Notification could not be deleted.");
    }
  };

  const clearNotifications = async () => {
    if (!notifications.length || !window.confirm("Clear all notifications?")) return;
    try {
      await api.delete("/notifications");
      setNotifications([]);
    } catch (error) {
      alert(error.response?.data?.message || "Notifications could not be cleared.");
    }
  };

  const handleProfileSaved = (data) => {
    setProfile({ name: data?.name || "User", email: data?.email || "", profilePicture: data?.profilePicture || "" });
    localStorage.setItem("userName", data?.name || "User");
    localStorage.setItem("userEmail", data?.email || "");
    if (data?.registrationNumber) localStorage.setItem("userRegNo", data.registrationNumber);
    if (data?.profilePicture) localStorage.setItem("userProfilePicture", data.profilePicture);
  };

  const unread = notifications.filter((n) => !n.read).length;
  const picture = profile.profilePicture ? `${API_ORIGIN}/${String(profile.profilePicture).replace(/^\/+/, "")}?v=${encodeURIComponent(profile.profilePicture)}` : "";

  return (
    <>
      <div className="mt-auto pt-5 border-t" style={{ borderColor: "var(--border)" }}>
        <button type="button" onClick={() => setProfileOpen(true)} className="w-full flex items-center gap-3 p-3 rounded-2xl theme-surface border hover:border-[var(--accent)] transition-all text-left">
          <div className="w-10 h-10 rounded-xl overflow-hidden border flex items-center justify-center accent-soft shrink-0" style={{ borderColor: "var(--border)" }}>
            {picture ? <img src={picture} alt="Profile" className="w-full h-full object-cover" /> : <UserCircle size={23} className="accent-text" />}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-black truncate">{profile.name}</p>
            <p className="theme-muted text-[9px] truncate">{profile.email || `${role} account`}</p>
          </div>
        </button>

        <div className="flex flex-col gap-2 mt-3">
          <button onClick={() => {
            const next = !notificationsOpen;
            setNotificationsOpen(next);
            setSettingsOpen(false);
            if (next) window.dispatchEvent(new CustomEvent("quickcheck:close-messages"));
          }} className="sidebar-tool">
            <span className="relative"><Bell size={17}/>{unread > 0 && <span className="notification-badge">{unread > 9 ? "9+" : unread}</span>}</span>
            <span>Notifications</span>
          </button>
          <button type="button" onClick={() => window.dispatchEvent(new CustomEvent("quickcheck:open-messages"))} className="sidebar-tool">
            <MessageCircle size={17}/><span>Messages</span>
          </button>
          <button type="button" onClick={() => window.dispatchEvent(new CustomEvent("quickcheck:open-ai"))} className="sidebar-tool">
            <Bot size={17}/><span>AI Assistant</span>
          </button>
          <button onClick={() => { setSettingsOpen(v => !v); setNotificationsOpen(false); }} className="sidebar-tool"><Settings size={17}/><span>Settings</span></button>
        </div>
      </div>

      {notificationsOpen && (
        <div ref={notificationPanelRef} className="sidebar-popover">
          <div className="flex items-center justify-between border-b pb-3 mb-2" style={{borderColor:"var(--border)"}}>
            <div><b className="text-sm">Notifications</b></div>
            <div className="flex items-center gap-3">
              <button className="accent-text text-[10px] flex items-center gap-1" onClick={markAllRead}><CheckCheck size={13}/> Read all</button>
              <button className="text-red-400 text-[10px] font-bold" onClick={clearNotifications} disabled={!notifications.length}>Clear all</button>
              <button className="icon-btn !p-1.5" onClick={() => setNotificationsOpen(false)} title="Close notifications" aria-label="Close notifications"><X size={14}/></button>
            </div>
          </div>
          <div className="max-h-72 overflow-y-auto space-y-1">
            {!notifications.length ? <p className="theme-muted text-sm py-8 text-center">No notifications yet.</p> : notifications.map(n => (
              <div key={n._id} className={`p-3 rounded-xl border flex gap-2 items-start ${n.read ? "" : "accent-soft"}`} style={{borderColor:"var(--border)"}}>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-xs">{n.title}</p>
                  <p className="theme-muted text-[11px] mt-1">{n.message}</p>
                  <p className="theme-muted text-[9px] mt-2">{new Date(n.createdAt).toLocaleString()}</p>
                </div>
                <button className="text-red-400 hover:text-red-300 shrink-0" onClick={() => deleteNotification(n._id)} title="Delete notification" aria-label="Delete notification"><Trash2 size={14}/></button>
              </div>
            ))}
          </div>
        </div>
      )}

      {settingsOpen && (
        <div className="sidebar-popover">
          <div className="flex justify-between items-center mb-4"><div><b>Settings</b><p className="theme-muted text-[10px] uppercase">{role} preferences</p></div><button onClick={() => setSettingsOpen(false)}><X size={16}/></button></div>
          <div className="space-y-2">
            <button className="settings-row" onClick={toggleTheme}><span>{theme === "dark" ? <Moon size={15}/> : <Sun size={15}/>} {theme === "dark" ? "Dark theme" : "Light theme"}</span><Monitor size={15}/></button>
          </div>
          <div className="mt-5">
            <div className="flex items-center gap-2 text-xs font-bold mb-2"><Palette size={14}/> Accent</div>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(accents).map(([key,item]) => <button key={key} onClick={() => setAccent(key)} className={`accent-option ${accent === key ? "selected" : ""}`}><span style={{background: theme === "dark" ? item.valueDark : item.value}}/>{item.name}</button>)}
            </div>
          </div>
          <p className="theme-muted text-[9px] mt-4 leading-relaxed">In-app notifications stay enabled. Browser push notification and notification sound settings have been removed.</p>
        </div>
      )}

      {profileOpen && <ProfileModal onClose={() => setProfileOpen(false)} onSaved={handleProfileSaved} />}
    </>
  );
}
