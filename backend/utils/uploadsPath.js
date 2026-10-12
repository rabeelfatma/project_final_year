/**
 * Shared academic upload storage paths.
 *
 * Default: backend/uploads (existing layout and DB relative paths).
 * Optional: UPLOADS_DIR — absolute or relative directory used as the uploads root.
 * Stored Mongo paths remain `uploads/<folder>/<filename>` for compatibility.
 */
const path = require("path");
const fs = require("fs");
const express = require("express");

const BACKEND_ROOT = path.resolve(__dirname, "..");

function getUploadsRoot() {
  const configured = String(process.env.UPLOADS_DIR || "").trim();
  if (configured) {
    return path.resolve(configured);
  }
  return path.join(BACKEND_ROOT, "uploads");
}

function ensureUploadSubdirs() {
  const root = getUploadsRoot();
  for (const name of [
    "assignments",
    "submissions",
    "profilePictures",
    "messages",
    "generated",
    "others",
  ]) {
    const dir = path.join(root, name);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
  return root;
}

/**
 * Resolve a stored relative path (e.g. uploads/submissions/a.pdf) under the uploads root.
 * Rejects path traversal and any target outside the uploads directory.
 */
function resolveStoredUploadPath(stored) {
  const root = path.resolve(getUploadsRoot());
  const raw = String(stored || "").replace(/\\/g, "/");

  if (!raw || raw.includes("\0")) {
    throw new Error("Invalid file path.");
  }

  // Reject absolute / UNC / drive-letter forms on both Windows and POSIX.
  if (
    path.posix.isAbsolute(raw) ||
    path.win32.isAbsolute(raw) ||
    raw.startsWith("//") ||
    /^[a-zA-Z]:/.test(raw)
  ) {
    throw new Error("Invalid file path.");
  }

  let rel = raw.replace(/^[/\\]+/, "");
  if (rel.startsWith("uploads/")) {
    rel = rel.slice("uploads/".length);
  }

  const segments = rel.split("/").filter(Boolean);
  if (!segments.length || segments.some((s) => s === ".." || s === ".")) {
    throw new Error("Invalid file path.");
  }

  const target = path.resolve(root, ...segments);
  if (target !== root && !target.startsWith(root + path.sep)) {
    throw new Error("Invalid file path.");
  }
  return target;
}

/**
 * Mount profile-picture static hosting only. Academic trees require /api/files/*.
 */
function configureUploadStatic(app, { setHeaders } = {}) {
  const root = ensureUploadSubdirs();
  const profileDir = path.join(root, "profilePictures");
  const staticOpts = setHeaders ? { setHeaders } : undefined;
  app.use("/uploads/profilePictures", express.static(profileDir, staticOpts));
  app.use("/uploads", (_req, res) => {
    res.status(401).json({
      message: "Authentication required. Use authorized file download routes.",
    });
  });
  return root;
}

module.exports = {
  BACKEND_ROOT,
  getUploadsRoot,
  ensureUploadSubdirs,
  resolveStoredUploadPath,
  configureUploadStatic,
};
