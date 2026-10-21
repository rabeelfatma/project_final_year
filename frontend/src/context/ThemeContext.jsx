import { createContext, useContext, useEffect, useMemo, useState } from "react";

const ThemeContext = createContext(null);

// Accent palette: first three preserve the existing blue-family look.
// Red, purple, and teal are additional professional options.
export const ACCENTS = {
  blue: {
    name: "Blue",
    value: "#1683F8",
    valueDark: "#1683F8",
    soft: "rgba(22, 131, 248, 0.14)",
    softDark: "rgba(22, 131, 248, 0.18)",
    secondary: "#60B5FF",
    tertiary: "#0969DA",
  },
  sky: {
    name: "Sky",
    value: "#60B5FF",
    valueDark: "#60B5FF",
    soft: "rgba(96, 181, 255, 0.14)",
    softDark: "rgba(96, 181, 255, 0.18)",
    secondary: "#93C5FD",
    tertiary: "#1683F8",
  },
  deep: {
    name: "Deep",
    value: "#0969DA",
    valueDark: "#0969DA",
    soft: "rgba(9, 105, 218, 0.14)",
    softDark: "rgba(9, 105, 218, 0.18)",
    secondary: "#1683F8",
    tertiary: "#0550AE",
  },
  red: {
    name: "Red",
    value: "#DC2626",
    valueDark: "#DC2626",
    soft: "rgba(220, 38, 38, 0.12)",
    softDark: "rgba(220, 38, 38, 0.18)",
    secondary: "#F87171",
    tertiary: "#B91C1C",
  },
  purple: {
    name: "Purple",
    value: "#7C3AED",
    valueDark: "#7C3AED",
    soft: "rgba(124, 58, 237, 0.12)",
    softDark: "rgba(124, 58, 237, 0.18)",
    secondary: "#A78BFA",
    tertiary: "#5B21B6",
  },
  teal: {
    name: "Teal",
    value: "#0D9488",
    valueDark: "#0D9488",
    soft: "rgba(13, 148, 136, 0.12)",
    softDark: "rgba(13, 148, 136, 0.18)",
    secondary: "#2DD4BF",
    tertiary: "#0F766E",
  },
};

const LEGACY_ACCENT_MAP = {
  cyan: "sky",
  green: "teal",
  orange: "blue",
  emerald: "teal",
};

function resolveAccentKey(stored) {
  if (ACCENTS[stored]) return stored;
  if (LEGACY_ACCENT_MAP[stored]) return LEGACY_ACCENT_MAP[stored];
  return "blue";
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => localStorage.getItem("theme") || "dark");
  const [accent, setAccentState] = useState(() =>
    resolveAccentKey(localStorage.getItem("accent") || "blue")
  );

  const setAccent = (key) => {
    setAccentState(resolveAccentKey(key));
  };

  useEffect(() => {
    const selected = ACCENTS[accent] || ACCENTS.blue;
    const isDark = theme === "dark";
    // Shared accent: same hex in Light and Dark (no valueDark drift).
    const accentValue = selected.value;
    const accentSoft = isDark ? selected.softDark : selected.soft;
    const mixBase = isDark ? "#0B1118" : "#FFFFFF";

    document.documentElement.setAttribute("data-theme", theme);
    const root = document.documentElement;
    root.style.setProperty("--accent", accentValue);
    root.style.setProperty("--accent-soft", accentSoft);
    root.style.setProperty("--accent-bg", accentSoft);
    root.style.setProperty("--sidebar-active-bg", accentValue);
    root.style.setProperty("--sidebar-active-indicator", accentValue);
    root.style.setProperty("--sidebar-hover-bg", accentSoft);
    // Brand blue tokens stay stable; charts/nav follow the selected accent.
    root.style.setProperty("--qc-primary", "#1683F8");
    root.style.setProperty("--qc-primary-deep", "#0969DA");
    root.style.setProperty("--qc-primary-light", "#60B5FF");
    root.style.setProperty("--chart-primary", accentValue);
    root.style.setProperty("--chart-secondary", selected.secondary || "#60B5FF");
    root.style.setProperty("--chart-tertiary", selected.tertiary || "#0969DA");
    root.style.setProperty("--chart-quaternary", `color-mix(in srgb, ${accentValue} 28%, ${mixBase})`);
    root.style.setProperty("--chart-grid", isDark ? "#263849" : "#DCE6F0");
    root.style.setProperty("--chart-axis", isDark ? "#A8B8C9" : "#52657A");
    root.style.setProperty("--chart-tooltip-bg", isDark ? "#111C27" : "#FFFFFF");
    localStorage.setItem("theme", theme);
    localStorage.setItem("accent", accent);
  }, [theme, accent]);

  const value = useMemo(() => ({
    theme,
    accent,
    accents: ACCENTS,
    setTheme,
    setAccent,
    toggleTheme: () => setTheme((prev) => (prev === "dark" ? "light" : "dark")),
  }), [theme, accent]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used inside ThemeProvider");
  return value;
}
