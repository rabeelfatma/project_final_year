import React, { useEffect, useRef, useState } from "react";
import { Bell, CheckCheck, Moon, Palette, Settings, Sun, Volume2, VolumeX, X } from "lucide-react";
import { useTheme } from "../../context/ThemeContext";
import api from "../../utils/api";

function base64ToUint8Array(base64) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(normalized);
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}

function playBell() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    const gain = ctx.createGain();
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    osc1.type = "sine";
    osc2.type = "sine";
    osc1.frequency.setValueAtTime(880, now);
    osc2.frequency.setValueAtTime(1320, now + 0.04);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.16, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);
    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);
    osc1.start(now);
    osc2.start(now + 0.04);
    osc1.stop(now + 0.43);
    osc2.stop(now + 0.43);
    setTimeout(() => ctx.close().catch(() => {}), 600);
  } catch (_) {
    // Browsers can block programmatic audio until the user has interacted with the page.
  }
}

export default function PortalControls({ role }) {
  const { theme, toggleTheme, accent, accents, setAccent } = useTheme();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem("notificationSound") !== "false");
  const previousUnread = useRef(null);
  const token = localStorage.getItem("token");

  const loadNotifications = async (playSound = true) => {
    if (!token) return;
    try {
      const { data } = await api.get("/notifications");
      const next = Array.isArray(data) ? data : [];
      const unread = next.filter((item) => !item.read).length;

      if (playSound && previousUnread.current !== null && unread > previousUnread.current && soundEnabled) {
        playBell();
      }
      previousUnread.current = unread;
      setNotifications(next);
    } catch (error) {
      console.warn("Notification sync unavailable:", error?.message);
    }
  };

  useEffect(() => {
    loadNotifications(false);
    const timer = setInterval(() => loadNotifications(true), 10000);
    return () => clearInterval(timer);
  }, [token, soundEnabled]);

  useEffect(() => {
    if (!token || !("serviceWorker" in navigator) || !("PushManager" in window)) return;

    const registerExistingPermission = async () => {
      try {
        if (!("Notification" in window) || Notification.permission !== "granted") return;
        const registration = await navigator.serviceWorker.register("/sw.js");
        const { data } = await api.get("/notifications/public-key");
        const existing = await registration.pushManager.getSubscription();
        const subscription = existing || await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: base64ToUint8Array(data.publicKey),
        });
        await api.post("/notifications/subscribe", subscription.toJSON());
      } catch (error) {
        console.warn("Push setup unavailable:", error?.message);
      }
    };

    registerExistingPermission();
  }, [token]);

  const enablePush = async () => {
    if (!("Notification" in window)) {
      alert("This browser does not support notifications.");
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        alert("Notification permission was not granted. Please allow notifications in your browser settings.");
        return;
      }

      const registration = await navigator.serviceWorker.register("/sw.js");
      const { data } = await api.get("/notifications/public-key");
      const existing = await registration.pushManager.getSubscription();
      const subscription = existing || await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64ToUint8Array(data.publicKey),
      });
      await api.post("/notifications/subscribe", subscription.toJSON());
      alert("Browser notifications enabled successfully.");
    } catch (error) {
      console.error(error);
      alert("Browser push could not be enabled. Make sure the site is opened on localhost/HTTPS and the backend is running.");
    }
  };

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    localStorage.setItem("notificationSound", String(next));
    if (next) playBell();
  };

  const unread = notifications.filter((item) => !item.read).length;

  const markAllRead = async () => {
    try { await api.put("/notifications/read-all"); } catch (_) {}
    setNotifications((items) => items.map((item) => ({ ...item, read: true })));
    previousUnread.current = 0;
  };

  return (
    <div className="relative flex items-center gap-2">
      <button
        type="button"
        onClick={() => setNotificationsOpen((v) => !v)}
        className="relative p-2.5 rounded-xl border border-slate-700 hover:bg-slate-800/50 transition-all"
        style={{ borderColor: "var(--border)" }}
        title="Notifications"
      >
        <Bell size={18} className="accent-text" />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 min-w-5 h-5 px-1 rounded-full bg-red-500 text-white text-[9px] font-black flex items-center justify-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      <button
        type="button"
        onClick={() => setSettingsOpen((v) => !v)}
        className="p-2.5 rounded-xl border hover:bg-slate-800/50 transition-all"
        style={{ borderColor: "var(--border)" }}
        title="Settings"
      >
        <Settings size={18} className="accent-text" />
      </button>

      {notificationsOpen && (
        <div className="portal-control-panel absolute right-0 top-12 z-[100] w-[min(390px,calc(100vw-24px))] rounded-2xl shadow-2xl p-3">
          <div className="flex items-center justify-between px-2 pb-3 border-b" style={{ borderColor: "var(--border)" }}>
            <div>
              <p className="font-black text-sm">Notifications</p>
              <p className="text-[10px] theme-muted">{role} account updates</p>
            </div>
            <button type="button" onClick={markAllRead} className="text-xs accent-text flex items-center gap-1">
              <CheckCheck size={14} /> Mark all read
            </button>
          </div>
          <div className="max-h-80 overflow-y-auto py-2 space-y-1">
            {notifications.length === 0 ? (
              <p className="text-center theme-muted text-sm py-10">No notifications yet.</p>
            ) : notifications.map((item) => (
              <div key={item._id} className={`rounded-xl p-3 ${item.read ? "" : "accent-soft"}`}>
                <p className="text-sm font-bold">{item.title}</p>
                <p className="text-xs theme-muted mt-1">{item.message}</p>
                <p className="text-[9px] theme-muted mt-2">{new Date(item.createdAt).toLocaleString()}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {settingsOpen && (
        <div className="portal-control-panel absolute right-0 top-12 z-[100] w-80 rounded-2xl shadow-2xl p-5">
          <div className="flex items-center justify-between mb-5">
            <div>
              <p className="font-black">Settings</p>
              <p className="text-[10px] theme-muted uppercase tracking-widest">{role} preferences</p>
            </div>
            <button type="button" onClick={() => setSettingsOpen(false)}><X size={18} /></button>
          </div>

          <div className="space-y-3 mb-6">
            <button type="button" onClick={enablePush} className="w-full flex items-center justify-between rounded-xl border p-3 hover:bg-slate-800/40" style={{ borderColor: "var(--border)" }}>
              <span className="text-sm font-semibold">Browser notifications</span>
              <Bell size={17} className="accent-text" />
            </button>
            <button type="button" onClick={toggleSound} className="w-full flex items-center justify-between rounded-xl border p-3 hover:bg-slate-800/40" style={{ borderColor: "var(--border)" }}>
              <span className="text-sm font-semibold">Sharp bell sound</span>
              {soundEnabled ? <Volume2 size={17} className="accent-text" /> : <VolumeX size={17} className="theme-muted" />}
            </button>
            <button type="button" onClick={toggleTheme} className="w-full flex items-center justify-between rounded-xl border p-3 hover:bg-slate-800/40" style={{ borderColor: "var(--border)" }}>
              <span className="text-sm font-semibold">{theme === "dark" ? "Dark theme" : "Light theme"}</span>
              {theme === "dark" ? <Moon size={17} className="accent-text" /> : <Sun size={17} className="accent-text" />}
            </button>
          </div>

          <div className="flex items-center gap-2 mb-3 text-sm font-bold"><Palette size={16} className="accent-text" /> Accent color</div>
          <div className="grid grid-cols-3 gap-2">
            {Object.entries(accents).map(([key, item]) => (
              <button
                key={key}
                type="button"
                onClick={() => setAccent(key)}
                className={`rounded-xl border p-2 text-[10px] font-bold transition-all ${accent === key ? "ring-2" : ""}`}
                style={{ borderColor: "var(--border)", "--tw-ring-color": item.value }}
              >
                <span className="block h-5 rounded-lg mb-1" style={{ background: item.value }} />
                {item.name}
              </button>
            ))}
          </div>
          <p className="text-[9px] theme-muted mt-4 leading-relaxed">
            Push notifications can arrive while this site is closed when browser permission is allowed. Notification sound while the site is closed is controlled by the browser/OS.
          </p>
        </div>
      )}
    </div>
  );
}
