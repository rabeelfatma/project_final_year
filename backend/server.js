/**
 * QuickCheck Hub entry point.
 *
 * Locked staging/maintenance is the DEFAULT for `npm start` / Hostinger.
 * Full academic application loads ONLY when APP_RUNTIME_MODE=full (exact).
 * Optional APP_RUNTIME_MODE=preview serves the built frontend SPA (or fallback preview page)
 * with APIs/uploads locked and no MongoDB — never enables full academic mode.
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
const isPreviewMode = RUNTIME_MODE === "preview";

if (isFullMode) {
  module.exports = require("./appFull");
} else {
  const express = require("express");
  const fs = require("fs");

  const app = express();
  const PORT = Number(process.env.PORT) || 5000;

  const maintenanceHtmlPath = path.join(__dirname, "public", "maintenance.html");
  const previewHtmlPath = path.join(__dirname, "public", "preview.html");
  const frontendDist = path.join(__dirname, "..", "frontend", "dist");
  const hasFrontendDist = fs.existsSync(frontendDist);

  let maintenanceHtml =
    "<!doctype html><html><head><meta charset='utf-8'><title>QuickCheck Hub</title></head>" +
    "<body style='font-family:system-ui;padding:2rem'><h1>QuickCheck Hub</h1>" +
    "<p>Staging maintenance mode. The application is not publicly available.</p></body></html>";

  let previewHtml =
    "<!doctype html><html><head><meta charset='utf-8'><title>QuickCheck Hub Preview</title></head>" +
    "<body style='font-family:system-ui;padding:2rem'><h1>QuickCheck Hub</h1>" +
    "<p>Frontend preview mode. Academic APIs and uploads are disabled.</p></body></html>";

  try {
    if (fs.existsSync(maintenanceHtmlPath)) {
      maintenanceHtml = fs.readFileSync(maintenanceHtmlPath, "utf8");
    }
  } catch (_) {
    /* keep inline fallback */
  }

  try {
    if (fs.existsSync(previewHtmlPath)) {
      previewHtml = fs.readFileSync(previewHtmlPath, "utf8");
    }
  } catch (_) {
    /* keep inline fallback */
  }

  app.get("/health", (_req, res) => {
    res.status(200).json({
      status: "ok",
      service: "QuickCheck Hub",
      mode: isPreviewMode ? "preview" : "maintenance",
    });
  });

  // Fail-closed: APIs and private uploads never load in non-full modes.
  app.use((req, res, next) => {
    if (req.path.startsWith("/api") || req.path.startsWith("/uploads")) {
      return res.status(503).json({
        message: isPreviewMode
          ? "QuickCheck Hub preview mode does not expose APIs or uploads."
          : "QuickCheck Hub is in staging maintenance mode.",
        mode: isPreviewMode ? "preview" : "maintenance",
      });
    }
    return next();
  });

  if (isPreviewMode && hasFrontendDist) {
    // Public UI shell only — login forms may render; auth/API calls stay 503.
    app.use(express.static(frontendDist));
    app.use((req, res) => {
      if (req.method !== "GET" && req.method !== "HEAD") {
        return res.status(405).json({
          message: "Method not allowed in preview mode.",
          mode: "preview",
        });
      }
      return res.sendFile(path.join(frontendDist, "index.html"));
    });
  } else {
    app.use((req, res) => {
      if (isPreviewMode) {
        return res.status(200).type("html").send(previewHtml);
      }
      res.status(503).type("html").send(maintenanceHtml);
    });
  }

  const shouldListen = process.env.VERCEL !== "1";
  if (shouldListen) {
    app.listen(PORT, () => {
      if (isPreviewMode) {
        console.log(`👀 QuickCheck Hub frontend preview listening on port ${PORT}`);
        console.log(
          hasFrontendDist
            ? "APP_RUNTIME_MODE=preview — serving frontend/dist; no MongoDB, APIs or uploads."
            : "APP_RUNTIME_MODE=preview — fallback preview.html; no MongoDB, APIs or uploads."
        );
      } else {
        console.log(`🔒 QuickCheck Hub staging maintenance listening on port ${PORT}`);
        console.log("APP_RUNTIME_MODE is not 'full' — APIs, uploads, MongoDB and SPA are locked.");
      }
    });
  }

  module.exports = app;
}
