/**
 * QuickCheck Hub entry point.
 *
 * Locked staging/maintenance is the DEFAULT for `npm start` / Hostinger.
 * Full academic application loads ONLY when APP_RUNTIME_MODE=full (exact).
 * Local development: use `npm run dev` (via dev-start.js) which sets full mode.
 */
const path = require("path");
// Prefer backend/.env when started from repo root (Hostinger single-app layout).
require("dotenv").config({ path: path.join(__dirname, ".env") });
require("dotenv").config();

const RUNTIME_MODE = String(process.env.APP_RUNTIME_MODE || "")
  .trim()
  .toLowerCase();
const isFullMode = RUNTIME_MODE === "full";

if (isFullMode) {
  module.exports = require("./appFull");
} else {
  const express = require("express");
  const fs = require("fs");

  const app = express();
  const PORT = Number(process.env.PORT) || 5000;

  const maintenanceHtmlPath = path.join(__dirname, "public", "maintenance.html");
  let maintenanceHtml =
    "<!doctype html><html><head><meta charset='utf-8'><title>QuickCheck Hub</title></head>" +
    "<body style='font-family:system-ui;padding:2rem'><h1>QuickCheck Hub</h1>" +
    "<p>Staging maintenance mode. The application is not publicly available.</p></body></html>";

  try {
    if (fs.existsSync(maintenanceHtmlPath)) {
      maintenanceHtml = fs.readFileSync(maintenanceHtmlPath, "utf8");
    }
  } catch (_) {
    /* keep inline fallback */
  }

  app.get("/health", (_req, res) => {
    res.status(200).json({
      status: "ok",
      service: "QuickCheck Hub",
      mode: "maintenance",
    });
  });

  app.use((req, res) => {
    if (req.path.startsWith("/api") || req.path.startsWith("/uploads")) {
      return res.status(503).json({
        message: "QuickCheck Hub is in staging maintenance mode.",
        mode: "maintenance",
      });
    }

    res.status(503).type("html").send(maintenanceHtml);
  });

  const shouldListen = process.env.VERCEL !== "1";
  if (shouldListen) {
    app.listen(PORT, () => {
      console.log(`🔒 QuickCheck Hub staging maintenance listening on port ${PORT}`);
      console.log("APP_RUNTIME_MODE is not 'full' — APIs, uploads, MongoDB and SPA are locked.");
    });
  }

  module.exports = app;
}
