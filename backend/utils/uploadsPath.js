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
  try {
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
  } catch (error) {
    // Vercel / read-only FS: do not crash cold starts. Durable uploads need object storage.
    console.warn(
      "Upload directories unavailable (read-only or ephemeral FS):",
      error.message
    );
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
 * Mount profile-picture hosting only. Academic trees require /api/files/*.
 * On Vercel+R2, stream avatars from the private bucket (no public bucket ACL).
 */
function configureUploadStatic(app, { setHeaders } = {}) {
  const root = ensureUploadSubdirs();
  const profileDir = path.join(root, "profilePictures");
  const staticOpts = setHeaders ? { setHeaders } : undefined;

  const storedFiles = require("./storedFiles");
  // When R2 is configured (local + Vercel), stream avatars from the private bucket
  // with legacy local-disk fallback inside storedFiles.exists/openDownloadStream.
  if (storedFiles.usesObjectStorage()) {
    app.get("/uploads/profilePictures/:name", async (req, res) => {
      const name = path.basename(String(req.params.name || ""));
      if (!name) return res.status(404).end();
      const stored = `uploads/profilePictures/${name}`;
      try {
        if (!(await storedFiles.exists(stored))) return res.status(404).end();
        const download = await storedFiles.openDownloadStream(stored);
        if (setHeaders) setHeaders(res, name);
        if (download.contentType) res.setHeader("Content-Type", download.contentType);
        if (download.localPath) return res.sendFile(download.localPath);
        download.stream.on("error", () => {
          if (!res.headersSent) res.status(500).end();
          else res.end();
        });
        return download.stream.pipe(res);
      } catch (error) {
        if (error.code === "R2_NOT_CONFIGURED") {
          return res.status(503).json({ message: error.message });
        }
        return res.status(404).end();
      }
    });
  } else {
    app.use("/uploads/profilePictures", express.static(profileDir, staticOpts));
  }

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
