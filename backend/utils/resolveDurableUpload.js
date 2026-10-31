/**
 * Resolve a durable upload from either:
 *  - classic multer `req.file` (proxied, already persisted to R2/disk by middleware), or
 *  - a client-completed presigned object (`storedFileKey` + size/name/mime in body).
 */
const {
  verifyPresignedUpload,
} = require("../services/presignedUploadService");

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
