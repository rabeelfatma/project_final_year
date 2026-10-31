
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { getUploadsRoot, ensureUploadSubdirs } = require("../utils/uploadsPath");
const {
  usesObjectStorage,
  persistMulterFile,
  relativeStoredPath,
} = require("../utils/storedFiles");
const { assertR2Ready } = require("../utils/objectStorage");
const {
  ACADEMIC_EXTENSIONS,
  MESSAGE_EXTENSIONS,
  PROFILE_EXTENSIONS,
  isVideoExtension,
  makeSafeFilename,
  MAX_PROXIED_UPLOAD_BYTES_VERCEL,
  MAX_PROXIED_UPLOAD_BYTES_LOCAL,
} = require("../utils/uploadAllowlist");

// Soft-init: must not throw on Vercel read-only filesystem at module load.
try {
  ensureUploadSubdirs();
} catch (_) {
  /* ensureUploadSubdirs already swallows FS errors; keep load resilient */
}

const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

const getUploadFolder = (req) => {
  const route = String(req.originalUrl || "").toLowerCase();
  if (route.includes("submit") || route.includes("submission")) return "submissions";
  if (route.includes("assignment")) return "assignments";
  if (route.includes("profile")) return "profilePictures";
  if (route.includes("message")) return "messages";
  if (route.includes("/ai/") || route.includes("evaluate-ai")) return "others";
  return "others";
};

const getUploadPath = (req) => {
  return path.join(getUploadsRoot(), getUploadFolder(req));
};

/** Ephemeral uploads stay in memory and are not written to R2. */
function isEphemeralUpload(req) {
  const route = String(req.originalUrl || "").toLowerCase();
  return (
    route.includes("/evaluate-ai") ||
    route.includes("/api/ai/chat") ||
    route.includes("/ai/chat")
  );
}

const diskStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    try {
      const uploadPath = getUploadPath(req);
      ensureDir(uploadPath);
      cb(null, uploadPath);
    } catch (error) {
      cb(error);
    }
  },

  filename: function (req, file, cb) {
    try {
      const finalName = makeSafeFilename(file.originalname);
      const uploadPath = getUploadPath(req);
      ensureDir(uploadPath);
      cb(null, finalName);
    } catch (error) {
      cb(error);
    }
  },
});

/**
 * Memory + R2 put for durable routes when object storage is configured.
 * Ephemeral AI/reference uploads keep the buffer only (no R2 write).
 */
const r2AwareStorage = {
  _handleFile(req, file, cb) {
    const ephemeral = isEphemeralUpload(req);
    if (!ephemeral) {
      try {
        assertR2Ready();
      } catch (error) {
        return cb(error);
      }
    }

    const chunks = [];
    let size = 0;
    let settled = false;
    const isVercel = process.env.VERCEL === "1";
    const limit = ephemeral
      ? isVercel
        ? MAX_PROXIED_UPLOAD_BYTES_VERCEL
        : MAX_PROXIED_UPLOAD_BYTES_LOCAL
      : isVercel
        ? MAX_PROXIED_UPLOAD_BYTES_VERCEL
        : MAX_PROXIED_UPLOAD_BYTES_LOCAL;

    const settle = (err, info) => {
      if (settled) return;
      settled = true;
      if (err) return cb(err);
      return cb(null, info);
    };

    file.stream.on("data", (chunk) => {
      if (settled) return;
      size += chunk.length;
      if (size > limit) {
        file.stream.destroy();
        settle(
          new Error(
            `File too large for proxied upload (max ${Math.floor(
              limit / (1024 * 1024)
            )} MB). Use direct upload for larger files.`
          )
        );
        return;
      }
      chunks.push(chunk);
    });
    file.stream.on("error", (err) => settle(err));
    file.stream.on("end", async () => {
      if (settled) return;
      try {
        const buffer = Buffer.concat(chunks);
        const filename = makeSafeFilename(file.originalname);
        const folder = getUploadFolder(req);

        if (ephemeral) {
          return settle(null, {
            destination: "",
            filename,
            path: "",
            buffer,
            size: buffer.length,
            storage: "memory",
          });
        }

        const stored = relativeStoredPath(folder, filename);
        await persistMulterFile(
          { filename, buffer, mimetype: file.mimetype },
          folder
        );
        return settle(null, {
          destination: "r2",
          filename,
          path: stored,
          size: buffer.length,
          storage: "r2",
          storedPath: stored,
        });
      } catch (error) {
        return settle(error);
      }
    });
  },

  _removeFile(req, file, cb) {
    cb(null);
  },
};

const isVercel = process.env.VERCEL === "1";

/** Pick R2 or disk per request so tests can toggle env without stale module state. */
const adaptiveStorage = {
  _handleFile(req, file, cb) {
    // Vercel always uses r2AwareStorage (ephemeral=memory; durable requires R2).
    // Local uses R2 when configured, otherwise classic disk under backend/uploads.
    if (process.env.VERCEL === "1" || usesObjectStorage()) {
      return r2AwareStorage._handleFile(req, file, cb);
    }
    return diskStorage._handleFile(req, file, cb);
  },
  _removeFile(req, file, cb) {
    if (process.env.VERCEL === "1" || usesObjectStorage()) {
      return r2AwareStorage._removeFile(req, file, cb);
    }
    return diskStorage._removeFile(req, file, cb);
  },
};

const upload = multer({
  // When R2 is configured (local or Vercel), durable proxied uploads go through R2.
  // Without R2, fall back to local disk (legacy / offline).
  storage: adaptiveStorage,

  limits: {
    // Proxied multipart only. 200 MB durable files use backend-authorized
    // presigned direct-to-R2 uploads (see /api/files/presign).
    fileSize: isVercel
      ? MAX_PROXIED_UPLOAD_BYTES_VERCEL
      : MAX_PROXIED_UPLOAD_BYTES_LOCAL,
  },

  fileFilter: (req, file, cb) => {
    const folder = getUploadFolder(req);
    const ext = path.extname(file.originalname || "").toLowerCase();
    const route = String(req.originalUrl || "").toLowerCase();

    if (folder === "profilePictures") {
      if (PROFILE_EXTENSIONS.includes(ext)) return cb(null, true);
      return cb(new Error(`File type ${ext || "unknown"} is not supported for profile pictures.`));
    }

    if (folder === "messages" || route.includes("/voice")) {
      if (MESSAGE_EXTENSIONS.includes(ext)) return cb(null, true);
      return cb(new Error(`File type ${ext || "unknown"} is not supported for messages.`));
    }

    // Academic + AI ephemeral: shared allowlist without the nine video containers.
    if (isVideoExtension(ext)) {
      return cb(
        new Error(
          `Video file type ${ext} is not supported for Teacher/Student uploads.`
        )
      );
    }

    if (ACADEMIC_EXTENSIONS.includes(ext) || MESSAGE_EXTENSIONS.includes(ext)) {
      return cb(null, true);
    }

    return cb(new Error(`File type ${ext || "unknown"} is not supported.`));
  },
});

module.exports = upload;
module.exports.isEphemeralUpload = isEphemeralUpload;
module.exports.r2AwareStorage = r2AwareStorage;
module.exports.makeSafeFilename = makeSafeFilename;
module.exports.getUploadFolder = getUploadFolder;
module.exports.adaptiveStorage = adaptiveStorage;
