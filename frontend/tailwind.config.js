/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        qc: {
          bg: "var(--qc-page-bg, var(--bg))",
          "bg-alt": "var(--bg-alt)",
          surface: "var(--qc-card-bg, var(--surface))",
          "surface-2": "var(--surface-2)",
          elevated: "var(--elevated)",
          text: "var(--qc-text, var(--text))",
          muted: "var(--muted)",
          accent: "var(--accent)",
          primary: "var(--qc-primary)",
          "primary-deep": "var(--qc-primary-deep)",
          "primary-light": "var(--qc-primary-light)",
          violet: "var(--qc-primary-light)",
          border: "var(--qc-border, var(--border))",
          input: "var(--input-bg)",
          success: "var(--success)",
          warning: "var(--warning)",
          danger: "var(--danger)",
          sidebar: "var(--sidebar-bg)",
        },
      },
      fontFamily: {
        sans: [
          '"Plus Jakarta Sans"',
          "Inter",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "sans-serif",
        ],
      },
      borderRadius: {
        qc: "var(--radius)",
        "qc-lg": "var(--radius-lg)",
        "qc-xl": "var(--radius-xl)",
      },
      boxShadow: {
        qc: "var(--shadow)",
        "qc-md": "var(--shadow-md)",
        "qc-lg": "var(--shadow-lg)",
      },
      maxWidth: {
        content: "var(--content-max)",
      },
      spacing: {
        sidebar: "var(--sidebar-width)",
        header: "var(--header-height)",
      },
    },
  },
  plugins: [],
};
