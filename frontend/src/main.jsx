import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "./context/ThemeContext";
import "./index.css";
import AppRoutes from "./routes/AppRoutes";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ThemeProvider>
      <AppRoutes />
    </ThemeProvider>
  </StrictMode>
);