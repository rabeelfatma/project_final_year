import React, { useState } from "react";
import { Moon, Palette, Sun, X } from "lucide-react";
import { useTheme } from "../../context/ThemeContext";
import { useLocation } from "react-router-dom";

export default function ThemeSwitcher() {
  const { theme, toggleTheme, accent, accents, setAccent } = useTheme();
  const [open, setOpen] = useState(false);
  const location = useLocation();

  // Portal pages have the full Settings control. Public/auth pages get this compact selector.
  if (location.pathname.startsWith("/dashboard") || ["/", "/home", "/features", "/about", "/learn-more"].includes(location.pathname)) return null;

  return (
    <div className="fixed top-4 right-4 z-[120]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="p-2.5 rounded-xl border backdrop-blur-xl shadow-lg hover:scale-105 transition-all"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
        title="Theme and accent settings"
      >
        <Palette size={18} className="accent-text" />
      </button>

      {open && (
        <div className="portal-control-panel mt-2 w-72 rounded-2xl shadow-2xl p-4">
          <div className="flex items-center justify-between mb-4">
            <div><b className="text-sm">Theme</b><p className="text-[10px] theme-muted">Dark / light + accent</p></div>
            <button type="button" onClick={() => setOpen(false)}><X size={16} /></button>
          </div>
          <button type="button" onClick={toggleTheme} className="w-full rounded-xl border p-3 flex items-center justify-between mb-4" style={{ borderColor: "var(--border)" }}>
            <span className="text-sm font-semibold">{theme === "dark" ? "Dark theme" : "Light theme"}</span>
            {theme === "dark" ? <Moon size={17} className="accent-text" /> : <Sun size={17} className="accent-text" />}
          </button>
          <div className="grid grid-cols-3 gap-2">
            {Object.entries(accents).map(([key, item]) => (
              <button key={key} type="button" onClick={() => setAccent(key)} className={`rounded-xl border p-2 text-[10px] font-bold ${accent === key ? "ring-2" : ""}`} style={{ borderColor: "var(--border)", "--tw-ring-color": item.value }}>
                <span className="block h-5 rounded-lg mb-1" style={{ background: item.value }} />
                {item.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
