/**
 * Resolve a durable upload from either:
 *  - classic multer `req.file` (proxied, already persisted to R2/disk by middleware), or
 *  - a client-completed presigned object (`storedFileKey` + size/name/mime in body).
 */
const fs = require("fs");
const {
  verifyPresignedUpload,
} = require("../services/presignedUploadService");
const { validateAcademicContent } = require("./academicFileContent");
const { evaluateDurableFileSize } = require("./uploadAllowlist");

function readLocalHeader(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  const fd = fs.openSync(filePath, "r");
  try {
    const buf = Buffer.alloc(512);
    const n = fs.readSync(fd, buf, 0, 512, 0);
    return buf.subarray(0, n);
  } finally {
    fs.closeSync(fd);
  }
}

function rejectUpload(message, code) {
  const err = new Error(message);
  err.code = code;
  err.statusCode = 400;
  throw err;
}

async function resolveDurableUpload(req, {
  category,
  folder,
  fieldPrefix = "",
} = {}) {
  const body = req.body || {};
  const keyField = fieldPrefix ? `${fieldPrefix}StoredFileKey` : "storedFileKey";
  const sizeField = fieldPrefix ? `${fieldPrefix}FileSize` : "fileSize";
  const nameField = fieldPrefix ? `${fieldPrefix}OriginalFileName` : "originalFileName";
  const mimeField = fieldPrefix ? `${fieldPrefix}FileMimeType` : "fileMimeType";

  const storedFileKey = String(body[keyField] || body.objectKey || "").trim();

  if (req.file?.filename) {
    const sizeCheck = evaluateDurableFileSize(req.file.size);
    if (!sizeCheck.ok) {
      rejectUpload(sizeCheck.message, sizeCheck.code);
    }
    let header = null;
    if (Buffer.isBuffer(req.file.buffer) && req.file.buffer.length) {
      header = req.file.buffer.subarray(0, 512);
    } else if (req.file.path) {
      header = readLocalHeader(req.file.path);
    }
    if (header) {
      const content = validateAcademicContent(
        req.file.originalname || req.file.filename,
        header
      );
      if (!content.ok) rejectUpload(content.message, content.code);
    }
    return {
      storedPath: `uploads/${folder}/${req.file.filename}`,
      originalFileName: req.file.originalname || req.file.filename,
      fileMimeType: req.file.mimetype || "",
      source: "multipart",
    };
  }

  if (!storedFileKey) return null;

  const verified = await verifyPresignedUpload({
    objectKey: storedFileKey,
    expectedSize: body[sizeField] != null ? Number(body[sizeField]) : undefined,
    category,
    originalFileName: body[nameField] || undefined,
  });

  return {
    storedPath: verified.objectKey,
    originalFileName:
      String(body[nameField] || "").trim() ||
      storedFileKey.split("/").pop() ||
      "upload",
    fileMimeType:
      String(body[mimeField] || "").trim() || verified.contentType || "",
    source: "presigned",
    size: verified.size,
  };
}

module.exports = { resolveDurableUpload };
