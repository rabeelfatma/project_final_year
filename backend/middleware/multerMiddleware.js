
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

// Determine upload folder from the complete request URL
const getUploadPath = (req) => {
  return path.join(getUploadsRoot(), getUploadFolder(req));
};

/** Ephemeral uploads stay in memory on Vercel and are not written to R2. */
function isEphemeralUpload(req) {
  const route = String(req.originalUrl || "").toLowerCase();
  return (
    route.includes("/evaluate-ai") ||
    route.includes("/api/ai/chat") ||
    route.includes("/ai/chat")
  );
}

function makeSafeFilename(originalname) {
  const rawName = path.basename(String(originalname || "upload"));
  const safeName =
    rawName
      .normalize("NFKC")
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
      .replace(/\s+/g, " ")
      .replace(/[. ]+$/g, "")
      .trim() || "upload";
  const ext = path.extname(safeName);
  const stem = path.basename(safeName, ext);
  return `${stem}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
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
 * Vercel: memory storage + R2 put for durable routes.
 * Ephemeral AI/reference uploads keep the buffer only (no R2 write).
 */
const r2AwareStorage = {
  _handleFile(req, file, cb) {
    const ephemeral = isEphemeralUpload(req);
    // Durable uploads need R2; ephemeral AI evaluate/chat stay in memory only.
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
    const limit = usesObjectStorage() ? 4 * 1024 * 1024 : 200 * 1024 * 1024;

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
            `File too large for this platform (max ${Math.floor(limit / (1024 * 1024))} MB).`
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
    // Durable objects are removed by controllers when records are deleted.
    // Ephemeral buffers need no disk cleanup.
    cb(null);
  },
};

const isVercel = process.env.VERCEL === "1";

const upload = multer({
  storage: isVercel ? r2AwareStorage : diskStorage,

  limits: {
    // Vercel Hobby request body ~4.5MB; keep Hostinger at 200MB.
    fileSize: isVercel ? 4 * 1024 * 1024 : 200 * 1024 * 1024,
  },

  fileFilter: (req, file, cb) => {
    // Supported documents and archives
    const allowedExtensions = [
      ".pdf", ".doc", ".docx", ".txt", ".md", ".rtf",
      ".csv", ".tsv", ".json", ".xml", ".yaml", ".yml",
      ".xlsx", ".xls", ".ods", ".pptx", ".ppt", ".odp",
      ".zip", ".rar", ".7z", ".tar", ".gz",

      // Images
      ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp",
      ".svg", ".heic", ".heif", ".tif", ".tiff",

      // Video
      ".mp4", ".mkv", ".webm", ".mov", ".avi",
      ".wmv", ".mpeg", ".mpg", ".m4v",

      // Audio
      ".mp3", ".wav", ".ogg", ".aac", ".flac", ".m4a",

      // Code files
      ".py", ".ipynb", ".js", ".jsx", ".ts", ".tsx",
      ".cpp", ".c", ".h", ".hpp", ".java", ".php",
      ".cs", ".swift", ".go", ".rs", ".kt", ".kts",
      ".sql", ".html", ".htm", ".css", ".scss", ".sass",
      ".less", ".vue", ".svelte", ".sh", ".bat", ".ps1",
      ".rb", ".r", ".m", ".mm", ".dart", ".lua", ".pl",
    ];

    const ext = path.extname(file.originalname || "").toLowerCase();

    if (allowedExtensions.includes(ext)) {
      return cb(null, true);
    }

    return cb(
      new Error(`File type ${ext || "unknown"} is not supported.`)
    );
  },
});

module.exports = upload;
module.exports.isEphemeralUpload = isEphemeralUpload;
module.exports.r2AwareStorage = r2AwareStorage;
