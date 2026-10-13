import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Home, Star, Users, BookOpen, Palette, X, LogIn, Menu } from "lucide-react";
import { useTheme } from "../../context/ThemeContext";

export default function Navbar() {
  const [active, setActive] = useState("home");
  const { theme, toggleTheme, accent, accents, setAccent } = useTheme();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const links = [
    { id: "home", label: "Home", icon: Home },
    { id: "features", label: "Features", icon: Star },
    { id: "about", label: "About", icon: Users },
    { id: "learn-more", label: "Learn More", icon: BookOpen },
  ];

  const handleClick = (id) => (e) => {
    e.preventDefault();
    setActive(id);
    setMobileOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  const getLinkClass = (id) =>
    active === id
      ? "flex items-center gap-2 text-sky-400 font-semibold border-b-2 border-sky-400 pb-0.5"
      : "flex items-center gap-2 text-[var(--muted)] hover:text-sky-400 transition duration-300 pb-0.5 border-b-2 border-transparent";

  return (
    <nav className="sticky top-0 z-50 bg-[var(--bg)] border-b-2 border-sky-400 shadow-[0_2px_12px_rgba(56,189,248,0.4)] transition-colors duration-300">
      <div className="flex justify-between items-center px-4 sm:px-8 py-3 gap-3">
        <a
          href="#home"
          onClick={handleClick("home")}
          className="flex items-center gap-2 sm:gap-3 min-w-0"
        >
          <img
            src="/logo.png"
            alt="QuickCheck Hub Logo"
            className="w-10 h-10 sm:w-11 sm:h-11 md:w-12 md:h-12 object-contain shrink-0"
          />
          <h1 className="text-base sm:text-lg md:text-xl font-bold text-sky-400 truncate">
            QuickCheck Hub
          </h1>
        </a>

        <div className="hidden lg:flex gap-5 xl:gap-6 text-sm md:text-base font-medium items-center">
          {links.map(({ id, label, icon: Icon }) => (
            <a
              key={id}
              href={`#${id}`}
              onClick={handleClick(id)}
              className={getLinkClass(id)}
            >
              <Icon size={16} />
              {label}
            </a>
          ))}

          <div className="relative flex items-center gap-1">
            <button
              type="button"
              onClick={toggleTheme}
              className="flex items-center justify-center w-9 h-9 rounded-full border border-sky-400/50 text-sky-400 hover:bg-sky-400/10 hover:scale-105 transition-all duration-300"
              aria-label="Toggle theme"
              title={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
            >
              {theme === "dark" ? "☀️" : "🌙"}
            </button>
            <button
              type="button"
              onClick={() => setPaletteOpen((v) => !v)}
              className="flex items-center justify-center w-9 h-9 rounded-full border border-sky-400/50 text-sky-400 hover:bg-sky-400/10 hover:scale-105 transition-all duration-300"
              title="Accent colors"
              aria-label="Accent colors"
            >
              <Palette size={16} />
            </button>
            {paletteOpen && (
              <div className="absolute right-0 top-11 w-64 p-3 rounded-2xl shadow-2xl portal-control-panel">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold">Accent color</span>
                  <button type="button" onClick={() => setPaletteOpen(false)} aria-label="Close accent picker">
                    <X size={15} />
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {Object.entries(accents).map(([key, item]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setAccent(key)}
                      className={`rounded-xl border p-2 text-[10px] font-bold ${accent === key ? "ring-2" : ""}`}
                      style={{ borderColor: "var(--border)", "--tw-ring-color": item.value }}
                    >
                      <span className="block h-4 rounded mb-1" style={{ background: item.value }} />
                      {item.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <Link
            to="/login"
            className="inline-flex items-center gap-2 bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold px-4 py-2 rounded-xl transition-all"
            aria-label="Login"
          >
            <LogIn size={16} aria-hidden="true" />
            Login
          </Link>
        </div>

        <div className="flex lg:hidden items-center gap-2 shrink-0">
          <Link
            to="/login"
            className="inline-flex items-center gap-1.5 bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold px-3 py-2 rounded-xl text-sm"
            aria-label="Login"
          >
            <LogIn size={15} aria-hidden="true" />
            Login
          </Link>
          <button
            type="button"
            className="inline-flex items-center justify-center w-10 h-10 rounded-xl border border-sky-400/50 text-sky-400"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((v) => !v)}
          >
            {mobileOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="lg:hidden border-t border-sky-400/30 px-4 py-3 space-y-3 bg-[var(--bg)]">
          {links.map(({ id, label, icon: Icon }) => (
            <a
              key={id}
              href={`#${id}`}
              onClick={handleClick(id)}
              className={`${getLinkClass(id)} py-2`}
            >
              <Icon size={16} />
              {label}
            </a>
          ))}
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={toggleTheme}
              className="flex items-center justify-center w-9 h-9 rounded-full border border-sky-400/50 text-sky-400"
              aria-label="Toggle theme"
            >
              {theme === "dark" ? "☀️" : "🌙"}
            </button>
            <button
              type="button"
              onClick={() => setPaletteOpen((v) => !v)}
              className="flex items-center justify-center w-9 h-9 rounded-full border border-sky-400/50 text-sky-400"
              aria-label="Accent colors"
            >
              <Palette size={16} />
            </button>
          </div>
        </div>
      )}
    </nav>
  );
}
