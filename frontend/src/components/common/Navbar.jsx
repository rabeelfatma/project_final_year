import React, { useState } from "react";
import { Home, Star, Users, BookOpen, Palette, X } from "lucide-react";
import { useTheme } from "../../context/ThemeContext";

export default function Navbar() {
  const [active, setActive] = useState("home");
  const { theme, toggleTheme, accent, accents, setAccent } = useTheme();
  const [paletteOpen, setPaletteOpen] = useState(false);

  const links = [
    { id: "home", label: "Home", icon: Home },
    { id: "features", label: "Features", icon: Star },
    { id: "about", label: "About", icon: Users },
    { id: "learn-more", label: "Learn More", icon: BookOpen },
  ];

  const handleClick = (id) => (e) => {
    e.preventDefault();
    setActive(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  const getLinkClass = (id) =>
    active === id
      ? "flex items-center gap-2 text-sky-400 font-semibold border-b-2 border-sky-400 pb-0.5"
      : "flex items-center gap-2 text-[var(--muted)] hover:text-sky-400 transition duration-300 pb-0.5 border-b-2 border-transparent";

  return (
    <nav className="flex justify-between items-center px-8 py-3 bg-[var(--bg)] border-b-2 border-sky-400 shadow-[0_2px_12px_rgba(56,189,248,0.4)] sticky top-0 z-50 transition-colors duration-300">

      {/* LEFT SIDE - LOGO */}

      <a
        href="#home"
        onClick={handleClick("home")}
        className="flex items-center gap-3"
      >
        <img
          src="/logo.png"
          alt="QuickCheck Hub Logo"
          className="w-11 h-11 md:w-12 md:h-12 object-contain"
        />

        <h1 className="text-lg md:text-xl font-bold text-sky-400">
          QuickCheck Hub
        </h1>
      </a>

      {/* RIGHT SIDE - LINKS */}
      <div className="flex gap-6 text-sm md:text-base font-medium items-center">

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

        {/* DARK / LIGHT + SIX-COLOR THEME SELECTOR */}
        <div className="relative flex items-center gap-1">
          <button
            onClick={toggleTheme}
            className="flex items-center justify-center w-9 h-9 rounded-full border border-sky-400/50 text-sky-400 hover:bg-sky-400/10 hover:scale-105 transition-all duration-300"
            aria-label="Toggle theme"
            title={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
          >
            {theme === "dark" ? "☀️" : "🌙"}
          </button>
          <button onClick={() => setPaletteOpen(v => !v)} className="flex items-center justify-center w-9 h-9 rounded-full border border-sky-400/50 text-sky-400 hover:bg-sky-400/10 hover:scale-105 transition-all duration-300" title="Accent colors">
            <Palette size={16} />
          </button>
          {paletteOpen && (
            <div className="absolute right-0 top-11 w-64 p-3 rounded-2xl shadow-2xl portal-control-panel">
              <div className="flex items-center justify-between mb-3"><span className="text-xs font-bold">Accent color</span><button onClick={() => setPaletteOpen(false)}><X size={15}/></button></div>
              <div className="grid grid-cols-3 gap-2">
                {Object.entries(accents).map(([key, item]) => (
                  <button key={key} onClick={() => setAccent(key)} className={`rounded-xl border p-2 text-[10px] font-bold ${accent === key ? "ring-2" : ""}`} style={{borderColor:"var(--border)", "--tw-ring-color":item.value}}>
                    <span className="block h-4 rounded mb-1" style={{background:item.value}} />{item.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

      </div>
    </nav>
  );
}