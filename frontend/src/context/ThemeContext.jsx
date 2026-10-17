import { createContext, useContext, useEffect, useMemo, useState } from "react";

const ThemeContext = createContext(null);

// Blue-family accents only. value and valueDark are identical so the shared
// primary blue never drifts between Light and Dark themes.
export const ACCENTS = {
  blue: {
    name: "Blue",
    value: "#1683F8",
    valueDark: "#1683F8",
    soft: "rgba(22, 131, 248, 0.14)",
    softDark: "rgba(22, 131, 248, 0.18)",
  },
  sky: {
    name: "Sky",
    value: "#60B5FF",
    valueDark: "#60B5FF",
    soft: "rgba(96, 181, 255, 0.14)",
    softDark: "rgba(96, 181, 255, 0.18)",
  },
  deep: {
    name: "Deep",
    value: "#0969DA",
    valueDark: "#0969DA",
    soft: "rgba(9, 105, 218, 0.14)",
    softDark: "rgba(9, 105, 218, 0.18)",
  },
};

const LEGACY_ACCENT_MAP = {
  cyan: "sky",
  green: "deep",
  red: "blue",
  purple: "blue",
  orange: "blue",
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
    root.style.setProperty("--qc-primary", "#1683F8");
    root.style.setProperty("--qc-primary-deep", "#0969DA");
    root.style.setProperty("--qc-primary-light", "#60B5FF");
    root.style.setProperty("--chart-primary", accentValue);
    root.style.setProperty("--chart-secondary", "#60B5FF");
    root.style.setProperty("--chart-tertiary", "#0969DA");
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
