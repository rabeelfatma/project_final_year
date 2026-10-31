/**
 * Shared upload extension policy for durable Teacher/Student academic files
 * and for other categories that reuse the same gate.
 *
 * The nine video container extensions are intentionally excluded from
 * Teacher assignment and Student submission uploads.
 */
const path = require("path");

const VIDEO_EXTENSIONS = new Set([
  ".mp4",
  ".mkv",
  ".webm",
  ".mov",
  ".avi",
  ".wmv",
  ".mpeg",
  ".mpg",
  ".m4v",
]);

const ACADEMIC_EXTENSIONS = [
  ".pdf",
  ".doc",
  ".docx",
  ".txt",
  ".md",
  ".rtf",
  ".csv",
  ".tsv",
  ".json",
  ".xml",
  ".yaml",
  ".yml",
  ".xlsx",
  ".xls",
  ".ods",
  ".pptx",
  ".ppt",
  ".odp",
  ".zip",
  ".rar",
  ".7z",
  ".tar",
  ".gz",

  // Images
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".bmp",
  ".svg",
  ".heic",
  ".heif",
  ".tif",
  ".tiff",

  // Audio (voice / clips — not the excluded video containers)
  ".mp3",
  ".wav",
  ".ogg",
  ".aac",
  ".flac",
  ".m4a",

  // Code / text
  ".py",
  ".ipynb",
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".cpp",
  ".c",
  ".h",
  ".hpp",
  ".java",
  ".php",
  ".cs",
  ".swift",
  ".go",
  ".rs",
  ".kt",
  ".kts",
  ".sql",
  ".html",
  ".htm",
  ".css",
  ".scss",
  ".sass",
  ".less",
  ".vue",
  ".svelte",
  ".sh",
  ".bat",
  ".ps1",
  ".rb",
  ".r",
  ".m",
  ".mm",
  ".dart",
  ".lua",
  ".pl",
];

/** Profile avatars — images only. */
const PROFILE_EXTENSIONS = [
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".heic",
  ".heif",
];

/** Voice / message attachments (includes webm audio containers used by MediaRecorder). */
const MESSAGE_EXTENSIONS = [
  ".webm",
  ".ogg",
  ".oga",
  ".mp3",
  ".wav",
  ".m4a",
  ".aac",
  ".flac",
];

const DURABLE_FOLDERS = new Set([
  "assignments",
  "submissions",
  "profilePictures",
  "messages",
  "generated",
  "others",
]);

/** Max durable object size (presigned and verified) — both local and Vercel. */
const MAX_DURABLE_FILE_BYTES = 200 * 1024 * 1024;

/**
 * Server-proxied multipart ceiling on Vercel Hobby (~4.5MB body).
 * Larger durable files must use presigned direct-to-R2 uploads.
 */
const MAX_PROXIED_UPLOAD_BYTES_VERCEL = 4 * 1024 * 1024;

/** Local proxied multipart (multer) when not using presign — still prefer R2 write. */
const MAX_PROXIED_UPLOAD_BYTES_LOCAL = 200 * 1024 * 1024;

function normalizeExt(nameOrExt) {
  const raw = String(nameOrExt || "").trim().toLowerCase();
  if (!raw) return "";
  return raw.startsWith(".") ? raw : `.${raw}`;
}

function extensionOf(filename) {
  return path.extname(String(filename || "")).toLowerCase();
}

function isVideoExtension(ext) {
  return VIDEO_EXTENSIONS.has(normalizeExt(ext));
}

function academicExtensions() {
  return ACADEMIC_EXTENSIONS.slice();
}

function isAllowedAcademicExtension(filename) {
  const ext = extensionOf(filename);
  if (!ext || isVideoExtension(ext)) return false;
  return ACADEMIC_EXTENSIONS.includes(ext);
}

function isAllowedProfileExtension(filename) {
  return PROFILE_EXTENSIONS.includes(extensionOf(filename));
}

function isAllowedMessageExtension(filename) {
  return MESSAGE_EXTENSIONS.includes(extensionOf(filename));
}

function isDurableFolder(folder) {
  return DURABLE_FOLDERS.has(String(folder || "").replace(/[^a-zA-Z0-9_-]/g, ""));
}

function acceptAttributeFromExtensions(exts) {
  return exts.map((e) => (e.startsWith(".") ? e : `.${e}`)).join(",");
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

module.exports = {
  VIDEO_EXTENSIONS,
  ACADEMIC_EXTENSIONS,
  PROFILE_EXTENSIONS,
  MESSAGE_EXTENSIONS,
  DURABLE_FOLDERS,
  MAX_DURABLE_FILE_BYTES,
  MAX_PROXIED_UPLOAD_BYTES_VERCEL,
  MAX_PROXIED_UPLOAD_BYTES_LOCAL,
  normalizeExt,
  extensionOf,
  isVideoExtension,
  academicExtensions,
  isAllowedAcademicExtension,
  isAllowedProfileExtension,
  isAllowedMessageExtension,
  isDurableFolder,
  acceptAttributeFromExtensions,
  makeSafeFilename,
};
