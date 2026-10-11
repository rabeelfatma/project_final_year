import { createContext, useContext, useEffect, useMemo, useState } from "react";

const ThemeContext = createContext(null);

// Default remains the original QuickCheck Hub blue. Only the accent can be changed.
export const ACCENTS = {
  blue: { name: "Blue", value: "#38bdf8", soft: "rgba(56,189,248,.14)" },
  cyan: { name: "Cyan", value: "#06b6d4", soft: "rgba(6,182,212,.14)" },
  green: { name: "Green", value: "#10b981", soft: "rgba(16,185,129,.14)" },
  red: { name: "Red", value: "#ef4444", soft: "rgba(239,68,68,.14)" },
  purple: { name: "Purple", value: "#8b5cf6", soft: "rgba(139,92,246,.14)" },
  orange: { name: "Orange", value: "#f97316", soft: "rgba(249,115,22,.14)" },
};

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => localStorage.getItem("theme") || "dark");
  const [accent, setAccent] = useState(() => localStorage.getItem("accent") || "blue");

  useEffect(() => {
    const selected = ACCENTS[accent] || ACCENTS.blue;
    document.documentElement.setAttribute("data-theme", theme);
    const root = document.documentElement;
    root.style.setProperty("--accent", selected.value);
    root.style.setProperty("--accent-soft", selected.soft);
    root.style.setProperty("--chart-primary", selected.value);
    root.style.setProperty("--chart-secondary", `color-mix(in srgb, ${selected.value} 68%, ${theme === "dark" ? "#0f172a" : "#ffffff"})`);
    root.style.setProperty("--chart-tertiary", `color-mix(in srgb, ${selected.value} 42%, ${theme === "dark" ? "#0f172a" : "#ffffff"})`);
    root.style.setProperty("--chart-quaternary", `color-mix(in srgb, ${selected.value} 24%, ${theme === "dark" ? "#0f172a" : "#ffffff"})`);
    root.style.setProperty("--chart-grid", theme === "dark" ? "#1e293b" : "#d7dee8");
    root.style.setProperty("--chart-axis", theme === "dark" ? "#64748b" : "#64748b");
    root.style.setProperty("--chart-tooltip-bg", theme === "dark" ? "#0f172a" : "#ffffff");
    localStorage.setItem("theme", theme);
    localStorage.setItem("accent", accent);
  }, [theme, accent]);

  const value = useMemo(() => ({
    theme,
    accent,
    accents: ACCENTS,
    setTheme,
    setAccent,
    toggleTheme: () => setTheme((prev) => prev === "dark" ? "light" : "dark"),
  }), [theme, accent]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used inside ThemeProvider");
  return value;
}
