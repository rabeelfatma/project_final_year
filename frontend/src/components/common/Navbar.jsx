import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Home, Star, Users, BookOpen, Palette, X, LogIn, Menu, Moon, Sun } from "lucide-react";
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
      ? "flex items-center gap-2 text-[var(--accent)] font-semibold border-b-2 border-[var(--accent)] pb-0.5"
      : "flex items-center gap-2 text-[var(--muted)] hover:text-[var(--accent)] transition duration-200 pb-0.5 border-b-2 border-transparent";

  return (
    <nav className="qc-public-nav">
      <div className="max-w-content mx-auto flex justify-between items-center px-4 sm:px-6 lg:px-8 py-3 gap-3">
        <a
          href="#home"
          onClick={handleClick("home")}
          className="flex items-center gap-2 sm:gap-3 min-w-0"
        >
          <img
            src="/logo.png"
            alt="QuickCheck Hub Logo"
            className="w-9 h-9 sm:w-10 sm:h-10 object-contain shrink-0"
          />
          <h1 className="text-base sm:text-lg font-bold accent-text truncate">
            QuickCheck Hub
          </h1>
        </a>

        <div className="hidden lg:flex gap-5 xl:gap-6 text-sm font-medium items-center">
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

          <div className="relative flex items-center gap-1.5">
            <button
              type="button"
              onClick={toggleTheme}
              className="inline-flex items-center justify-center w-9 h-9 rounded-qc border theme-muted hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
              style={{ borderColor: "var(--border)" }}
              aria-label="Toggle theme"
              title={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
            >
              {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <button
              type="button"
              onClick={() => setPaletteOpen((v) => !v)}
              className="inline-flex items-center justify-center w-9 h-9 rounded-qc border theme-muted hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
              style={{ borderColor: "var(--border)" }}
              title="Accent colors"
              aria-label="Accent colors"
            >
              <Palette size={16} />
            </button>
            {paletteOpen && (
              <div className="absolute right-0 top-11 w-64 p-3 rounded-qc-lg shadow-qc-lg portal-control-panel">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold">Accent color</span>
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
                      className={`rounded-qc border p-2 text-[10px] font-semibold ${accent === key ? "ring-2" : ""}`}
                      style={{ borderColor: "var(--border)", "--tw-ring-color": theme === "dark" ? item.valueDark : item.value }}
                    >
                      <span className="block h-4 rounded mb-1" style={{ background: theme === "dark" ? item.valueDark : item.value }} />
                      {item.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <Link
            to="/login"
            className="qc-btn qc-btn-primary !min-h-9 !px-4"
            aria-label="Login"
          >
            <LogIn size={16} aria-hidden="true" />
            Login
          </Link>
        </div>

        <div className="flex lg:hidden items-center gap-2 shrink-0">
          <Link
            to="/login"
            className="qc-btn qc-btn-primary !min-h-9 !px-3 !text-sm"
            aria-label="Login"
          >
            <LogIn size={15} aria-hidden="true" />
            Login
          </Link>
          <button
            type="button"
            className="inline-flex items-center justify-center w-10 h-10 rounded-qc border theme-muted"
            style={{ borderColor: "var(--border)" }}
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((v) => !v)}
          >
            {mobileOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="lg:hidden border-t px-4 py-3 space-y-2" style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
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
              className="inline-flex items-center justify-center w-9 h-9 rounded-qc border"
              style={{ borderColor: "var(--border)", color: "var(--accent)" }}
              aria-label="Toggle theme"
            >
              {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <button
              type="button"
              onClick={() => setPaletteOpen((v) => !v)}
              className="inline-flex items-center justify-center w-9 h-9 rounded-qc border"
              style={{ borderColor: "var(--border)", color: "var(--accent)" }}
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
