
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Base upload directory
const uploadDir = path.join(__dirname, "..", "uploads");

// Ensure base folder exists
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Ensure subfolders exist
const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

// Determine upload folder from the complete request URL
const getUploadPath = (req) => {
  const route = String(req.originalUrl || "").toLowerCase();

  if (route.includes("submit") || route.includes("submission")) {
    return path.join(uploadDir, "submissions");
  }

  if (route.includes("assignment")) {
    return path.join(uploadDir, "assignments");
  }

  if (route.includes("profile")) {
    return path.join(uploadDir, "profilePictures");
  }

  if (route.includes("message")) {
    return path.join(uploadDir, "messages");
  }

  return path.join(uploadDir, "others");
};

const storage = multer.diskStorage({
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
      // Keep the original filename readable and sanitize unsafe characters.
      const rawName = path.basename(String(file.originalname || "upload"));

      const safeName = rawName
        .normalize("NFKC")
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
        .replace(/\s+/g, " ")
        .replace(/[. ]+$/g, "")
        .trim() || "upload";

      const uploadPath = getUploadPath(req);
      ensureDir(uploadPath);

      let finalName = safeName;

      // Avoid overwriting an existing file with the same name.
      if (fs.existsSync(path.join(uploadPath, finalName))) {
        const ext = path.extname(safeName);
        const stem = path.basename(safeName, ext);
        finalName = `${stem}-${Date.now()}${ext}`;
      }

      cb(null, finalName);
    } catch (error) {
      cb(error);
    }
  },
});

const upload = multer({
  storage,

  limits: {
    fileSize: 200 * 1024 * 1024, // 200 MB
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
