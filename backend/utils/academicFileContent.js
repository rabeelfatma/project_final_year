/**
 * Content checks for academic uploads that already have a reliable signature.
 * Does not add file extensions. Text and code types have no positive magic
 * number; those are rejected only when the header is a known binary/executable.
 */
const { extensionOf } = require("./uploadAllowlist");

function startsWith(buffer, bytes) {
  if (!buffer || buffer.length < bytes.length) return false;
  for (let i = 0; i < bytes.length; i += 1) {
    if (buffer[i] !== bytes[i]) return false;
  }
  return true;
}

function startsAscii(buffer, text) {
  return startsWith(buffer, Buffer.from(text, "ascii"));
}

function asciiAt(buffer, offset, text) {
  if (!buffer || buffer.length < offset + text.length) return false;
  return buffer.subarray(offset, offset + text.length).toString("ascii") === text;
}

const BINARY_SIGNATURES = [
  { id: "pdf", test: (b) => startsAscii(b, "%PDF") },
  { id: "png", test: (b) => startsWith(b, Buffer.from([0x89, 0x50, 0x4e, 0x47])) },
  { id: "jpeg", test: (b) => startsWith(b, Buffer.from([0xff, 0xd8, 0xff])) },
  { id: "gif", test: (b) => startsAscii(b, "GIF87a") || startsAscii(b, "GIF89a") },
  { id: "zip", test: (b) => startsWith(b, Buffer.from([0x50, 0x4b, 0x03, 0x04])) || startsWith(b, Buffer.from([0x50, 0x4b, 0x05, 0x06])) || startsWith(b, Buffer.from([0x50, 0x4b, 0x07, 0x08])) },
  { id: "ole", test: (b) => startsWith(b, Buffer.from([0xd0, 0xcf, 0x11, 0xe0])) },
  { id: "rar", test: (b) => startsAscii(b, "Rar!") },
  { id: "7z", test: (b) => startsWith(b, Buffer.from([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c])) },
  { id: "gz", test: (b) => startsWith(b, Buffer.from([0x1f, 0x8b])) },
  { id: "webp", test: (b) => startsAscii(b, "RIFF") && asciiAt(b, 8, "WEBP") },
  { id: "wav", test: (b) => startsAscii(b, "RIFF") && asciiAt(b, 8, "WAVE") },
  { id: "bmp", test: (b) => startsAscii(b, "BM") },
  { id: "tiff", test: (b) => startsWith(b, Buffer.from([0x49, 0x49, 0x2a, 0x00])) || startsWith(b, Buffer.from([0x4d, 0x4d, 0x00, 0x2a])) },
  { id: "flac", test: (b) => startsAscii(b, "fLaC") },
  { id: "ogg", test: (b) => startsAscii(b, "OggS") },
  { id: "mp3", test: (b) => startsAscii(b, "ID3") || (b.length >= 2 && b[0] === 0xff && (b[1] & 0xe0) === 0xe0) },
  { id: "ftyp", test: (b) => asciiAt(b, 4, "ftyp") },
  { id: "mz", test: (b) => startsWith(b, Buffer.from([0x4d, 0x5a])) },
  { id: "elf", test: (b) => startsWith(b, Buffer.from([0x7f, 0x45, 0x4c, 0x46])) },
  { id: "tar", test: (b) => asciiAt(b, 257, "ustar") },
];

/** Extensions whose header must match one of these signature ids. */
const REQUIRED_SIGNATURE = {
  ".pdf": ["pdf"],
  ".png": ["png"],
  ".jpg": ["jpeg"],
  ".jpeg": ["jpeg"],
  ".gif": ["gif"],
  ".zip": ["zip"],
  ".docx": ["zip"],
  ".xlsx": ["zip"],
  ".pptx": ["zip"],
  ".ods": ["zip"],
  ".odp": ["zip"],
  ".doc": ["ole"],
  ".xls": ["ole"],
  ".ppt": ["ole"],
  ".rar": ["rar"],
  ".7z": ["7z"],
  ".gz": ["gz"],
  ".webp": ["webp"],
  ".wav": ["wav"],
  ".bmp": ["bmp"],
  ".tif": ["tiff"],
  ".tiff": ["tiff"],
  ".flac": ["flac"],
  ".ogg": ["ogg"],
  ".mp3": ["mp3"],
  ".heic": ["ftyp"],
  ".heif": ["ftyp"],
  ".m4a": ["ftyp"],
  ".tar": ["tar"],
};

const DANGEROUS_IN_TEXT = new Set([
  "pdf",
  "png",
  "jpeg",
  "gif",
  "zip",
  "ole",
  "rar",
  "7z",
  "gz",
  "webp",
  "wav",
  "bmp",
  "tiff",
  "flac",
  "ogg",
  "mp3",
  "ftyp",
  "mz",
  "elf",
]);

const CONTENT_MISMATCH = "File content is not valid.";

function matchingSignatureIds(buffer) {
  return BINARY_SIGNATURES.filter((entry) => entry.test(buffer)).map((entry) => entry.id);
}

/**
 * @param {string} filename
 * @param {Buffer|Uint8Array} bytes header or full body
 * @returns {{ ok: true } | { ok: false, code: string, message: string }}
 */
function validateAcademicContent(filename, bytes) {
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes || []);
  if (!buffer.length) {
    return {
      ok: false,
      code: "UPLOAD_EMPTY",
      message: "File is empty.",
    };
  }

  const ext = extensionOf(filename);
  const found = matchingSignatureIds(buffer);
  const required = REQUIRED_SIGNATURE[ext];

  if (required) {
    if (!required.some((id) => found.includes(id))) {
      return {
        ok: false,
        code: "UPLOAD_CONTENT_MISMATCH",
        message: CONTENT_MISMATCH,
      };
    }
    return { ok: true };
  }

  if (found.some((id) => DANGEROUS_IN_TEXT.has(id))) {
    return {
      ok: false,
      code: "UPLOAD_CONTENT_MISMATCH",
      message: CONTENT_MISMATCH,
    };
  }

  return { ok: true };
}

module.exports = {
  CONTENT_MISMATCH,
  REQUIRED_SIGNATURE,
  validateAcademicContent,
};
