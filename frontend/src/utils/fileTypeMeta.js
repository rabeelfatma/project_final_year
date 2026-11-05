/**
 * File-type metadata aligned with backend/utils/uploadAllowlist.js ACADEMIC_EXTENSIONS.
 * Authoritative allowlist remains on the server — this map is for UI/preview routing only.
 */

const TYPE_MAP = {
  // Documents
  pdf: { label: "PDF", kind: "pdf", icon: "pdf" },
  doc: { label: "Word document", kind: "document", icon: "doc" },
  docx: { label: "Word document", kind: "document", icon: "doc" },
  txt: { label: "Text", kind: "text", icon: "text" },
  md: { label: "Markdown", kind: "markdown", icon: "text" },
  rtf: { label: "Rich text", kind: "text", icon: "doc" },

  // Tables / structured
  csv: { label: "CSV table", kind: "table", icon: "sheet" },
  tsv: { label: "TSV table", kind: "table", icon: "sheet" },
  json: { label: "JSON", kind: "json", icon: "code" },
  xml: { label: "XML", kind: "xml", icon: "code" },
  yaml: { label: "YAML", kind: "yaml", icon: "code" },
  yml: { label: "YAML", kind: "yaml", icon: "code" },

  // Spreadsheets / presentations
  xlsx: { label: "Excel spreadsheet", kind: "spreadsheet", icon: "sheet" },
  xls: { label: "Excel spreadsheet", kind: "spreadsheet", icon: "sheet" },
  ods: { label: "Spreadsheet", kind: "spreadsheet", icon: "sheet" },
  pptx: { label: "PowerPoint presentation", kind: "presentation", icon: "slides" },
  ppt: { label: "PowerPoint presentation", kind: "presentation", icon: "slides" },
  odp: { label: "Presentation", kind: "presentation", icon: "slides" },

  // Archives
  zip: { label: "ZIP archive", kind: "archive", icon: "archive" },
  rar: { label: "RAR archive", kind: "archive", icon: "archive" },
  "7z": { label: "7Z archive", kind: "archive", icon: "archive" },
  tar: { label: "TAR archive", kind: "archive", icon: "archive" },
  gz: { label: "GZIP archive", kind: "archive", icon: "archive" },

  // Images
  png: { label: "Image", kind: "image", icon: "image" },
  jpg: { label: "Image", kind: "image", icon: "image" },
  jpeg: { label: "Image", kind: "image", icon: "image" },
  gif: { label: "Image", kind: "image", icon: "image" },
  webp: { label: "Image", kind: "image", icon: "image" },
  bmp: { label: "Image", kind: "image", icon: "image" },
  svg: { label: "Image", kind: "image", icon: "image" },
  heic: { label: "Image (HEIC)", kind: "image", icon: "image" },
  heif: { label: "Image (HEIF)", kind: "image", icon: "image" },
  tif: { label: "Image (TIFF)", kind: "image", icon: "image" },
  tiff: { label: "Image (TIFF)", kind: "image", icon: "image" },

  // Audio
  mp3: { label: "Audio", kind: "audio", icon: "audio" },
  wav: { label: "Audio", kind: "audio", icon: "audio" },
  ogg: { label: "Audio", kind: "audio", icon: "audio" },
  aac: { label: "Audio", kind: "audio", icon: "audio" },
  flac: { label: "Audio", kind: "audio", icon: "audio" },
  m4a: { label: "Audio", kind: "audio", icon: "audio" },

  // Notebook
  ipynb: { label: "Jupyter notebook", kind: "notebook", icon: "code" },

  // Code / text (academic allowlist)
  py: { label: "Python", kind: "code", icon: "code", language: "python" },
  js: { label: "JavaScript", kind: "code", icon: "code", language: "javascript" },
  jsx: { label: "JavaScript (JSX)", kind: "code", icon: "code", language: "javascript" },
  ts: { label: "TypeScript", kind: "code", icon: "code", language: "typescript" },
  tsx: { label: "TypeScript (TSX)", kind: "code", icon: "code", language: "typescript" },
  cpp: { label: "C++", kind: "code", icon: "code", language: "cpp" },
  c: { label: "C", kind: "code", icon: "code", language: "c" },
  h: { label: "C/C++ header", kind: "code", icon: "code", language: "cpp" },
  hpp: { label: "C++ header", kind: "code", icon: "code", language: "cpp" },
  java: { label: "Java", kind: "code", icon: "code", language: "java" },
  php: { label: "PHP", kind: "code", icon: "code", language: "php" },
  cs: { label: "C#", kind: "code", icon: "code", language: "csharp" },
  swift: { label: "Swift", kind: "code", icon: "code", language: "swift" },
  go: { label: "Go", kind: "code", icon: "code", language: "go" },
  rs: { label: "Rust", kind: "code", icon: "code", language: "rust" },
  kt: { label: "Kotlin", kind: "code", icon: "code", language: "kotlin" },
  kts: { label: "Kotlin script", kind: "code", icon: "code", language: "kotlin" },
  sql: { label: "SQL", kind: "code", icon: "code", language: "sql" },
  html: { label: "HTML", kind: "code", icon: "code", language: "html" },
  htm: { label: "HTML", kind: "code", icon: "code", language: "html" },
  css: { label: "CSS", kind: "code", icon: "code", language: "css" },
  scss: { label: "SCSS", kind: "code", icon: "code", language: "css" },
  sass: { label: "Sass", kind: "code", icon: "code", language: "css" },
  less: { label: "Less", kind: "code", icon: "code", language: "css" },
  vue: { label: "Vue", kind: "code", icon: "code", language: "html" },
  svelte: { label: "Svelte", kind: "code", icon: "code", language: "html" },
  sh: { label: "Shell script", kind: "code", icon: "code", language: "shell" },
  bat: { label: "Batch script", kind: "code", icon: "code", language: "shell" },
  ps1: { label: "PowerShell", kind: "code", icon: "code", language: "shell" },
  rb: { label: "Ruby", kind: "code", icon: "code", language: "ruby" },
  r: { label: "R", kind: "code", icon: "code", language: "r" },
  m: { label: "Objective-C / MATLAB", kind: "code", icon: "code", language: "c" },
  mm: { label: "Objective-C++", kind: "code", icon: "code", language: "cpp" },
  dart: { label: "Dart", kind: "code", icon: "code", language: "dart" },
  lua: { label: "Lua", kind: "code", icon: "code", language: "lua" },
  pl: { label: "Perl", kind: "code", icon: "code", language: "perl" },
};

/** Exact academic extensions from backend allowlist (without leading dots). */
export const ACADEMIC_EXTENSION_LIST = [
  "pdf", "doc", "docx", "txt", "md", "rtf", "csv", "tsv", "json", "xml", "yaml", "yml",
  "xlsx", "xls", "ods", "pptx", "ppt", "odp", "zip", "rar", "7z", "tar", "gz",
  "png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "heic", "heif", "tif", "tiff",
  "mp3", "wav", "ogg", "aac", "flac", "m4a",
  "py", "ipynb", "js", "jsx", "ts", "tsx", "cpp", "c", "h", "hpp", "java", "php", "cs",
  "swift", "go", "rs", "kt", "kts", "sql", "html", "htm", "css", "scss", "sass", "less",
  "vue", "svelte", "sh", "bat", "ps1", "rb", "r", "m", "mm", "dart", "lua", "pl",
];

export function getFileExtension(fileName = "") {
  const base = String(fileName).split(/[\\/]/).pop() || "";
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return "";
  return base.slice(dot + 1).toLowerCase();
}

export function describeFile(fileName = "file") {
  const name = String(fileName).split(/[\\/]/).pop() || "file";
  const ext = getFileExtension(name);
  const meta = TYPE_MAP[ext] || {
    label: ext ? `${ext.toUpperCase()} file` : "File",
    kind: "unknown",
    icon: "file",
    language: "plaintext",
  };
  return {
    name,
    ext,
    label: meta.label,
    kind: meta.kind,
    icon: meta.icon,
    language: meta.language || "plaintext",
    displayType: ext ? ext.toUpperCase() : "FILE",
  };
}

export function previewStrategyForExtension(ext) {
  const meta = TYPE_MAP[String(ext || "").toLowerCase()];
  if (!meta) return "unavailable";
  return meta.kind;
}
