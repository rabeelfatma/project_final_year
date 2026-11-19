/**
 * Backend-authorized direct-to-R2 uploads (presigned PUT).
 * Used so durable academic files can reach 200 MB without crossing
 * Vercel's ~4.5 MB serverless request-body limit.
 */
const path = require("path");
const {
  isAllowedAcademicExtension,
  isAllowedProfileExtension,
  isAllowedMessageExtension,
  isDurableFolder,
  MAX_DURABLE_FILE_BYTES,
  extensionOf,
  evaluateOriginalFilename,
  evaluateDurableFileSize,
} = require("../utils/uploadAllowlist");
const { validateAcademicContent } = require("../utils/academicFileContent");
const {
  usesObjectStorage,
  relativeStoredPath,
  toObjectKey,
  assertUploadedObject,
} = require("../utils/storedFiles");
const objectStorage = require("../utils/objectStorage");
const { makeSafeFilename } = require("../utils/uploadAllowlist");

const CATEGORY_FOLDERS = {
  assignment: "assignments",
  assignments: "assignments",
  submission: "submissions",
  submissions: "submissions",
  profile: "profilePictures",
  profilePicture: "profilePictures",
  profilePictures: "profilePictures",
  message: "messages",
  messages: "messages",
  generated: "generated",
  other: "others",
  others: "others",
};

function resolveFolder(category) {
  const folder = CATEGORY_FOLDERS[String(category || "").trim()] || "";
  if (!folder || !isDurableFolder(folder)) {
    const err = new Error("Unsupported upload category.");
    err.code = "UPLOAD_CATEGORY_INVALID";
    err.statusCode = 400;
    throw err;
  }
  return folder;
}

function assertExtensionForFolder(folder, originalFileName) {
  const named = evaluateOriginalFilename(originalFileName);
  if (!named.ok) {
    const err = new Error(named.message);
    err.code = named.code;
    err.statusCode = 400;
    throw err;
  }
  const name = named.basename;
  if (folder === "profilePictures") {
    if (!isAllowedProfileExtension(name)) {
      const err = new Error(
        `File type ${extensionOf(name) || "unknown"} is not supported for profile pictures.`
      );
      err.code = "UPLOAD_TYPE_REJECTED";
      err.statusCode = 400;
      throw err;
    }
    return;
  }
  if (folder === "messages") {
    if (!isAllowedMessageExtension(name)) {
      const err = new Error(
        `File type ${extensionOf(name) || "unknown"} is not supported for messages.`
      );
      err.code = "UPLOAD_TYPE_REJECTED";
      err.statusCode = 400;
      throw err;
    }
    return;
  }
  // assignments, submissions, generated, others — academic allowlist (no videos)
  if (!isAllowedAcademicExtension(name)) {
    const err = new Error(
      `File type ${extensionOf(name) || "unknown"} is not supported.`
    );
    err.code = "UPLOAD_TYPE_REJECTED";
    err.statusCode = 400;
    throw err;
  }
}

function assertSize(size) {
  const result = evaluateDurableFileSize(size, MAX_DURABLE_FILE_BYTES);
  if (!result.ok) {
    const err = new Error(result.message);
    err.code = result.code;
    err.statusCode = 400;
    throw err;
  }
  return result.size;
}

/**
 * Create a short-lived PUT URL for a durable object key the caller may upload to.
 */
async function createPresignedUpload({
  category,
  originalFileName,
  contentType,
  size,
  userId,
}) {
  if (!usesObjectStorage()) {
    objectStorage.assertR2Ready();
  }
  const folder = resolveFolder(category);
  assertExtensionForFolder(folder, originalFileName);
  const bytes = assertSize(size);

  const safe = makeSafeFilename(originalFileName);
  // Embed uploader id in the object name for auditability (still under uploads/<folder>/).
  const ownerPrefix = String(userId || "anon").replace(/[^a-zA-Z0-9]/g, "").slice(-8);
  const filename = ownerPrefix ? `${ownerPrefix}-${safe}` : safe;
  const stored = relativeStoredPath(folder, filename);
  const key = toObjectKey(stored);
  const mime =
    String(contentType || "").trim() || "application/octet-stream";

  const uploadUrl = await objectStorage.getPresignedPutUrl(key, mime, 900);

  return {
    uploadUrl,
    objectKey: stored,
    requiredHeaders: {
      "Content-Type": mime,
    },
    expiresInSeconds: 900,
    maxBytes: MAX_DURABLE_FILE_BYTES,
    declaredSize: bytes,
    folder,
  };
}

/**
 * Verify the object landed in R2 before Mongo metadata is written.
 */
async function verifyPresignedUpload({
  objectKey,
  expectedSize,
  category,
  originalFileName,
}) {
  const folder = resolveFolder(category);
  assertExtensionForFolder(folder, originalFileName || path.basename(String(objectKey || "")));

  const key = toObjectKey(objectKey);
  if (!key.startsWith(`uploads/${folder}/`)) {
    const err = new Error("Object key does not match the upload category.");
    err.code = "UPLOAD_KEY_MISMATCH";
    err.statusCode = 400;
    throw err;
  }

  const meta = await assertUploadedObject(objectKey, {
    expectedSize,
    maxBytes: MAX_DURABLE_FILE_BYTES,
  });

  if (folder === "assignments" || folder === "submissions") {
    const header = await objectStorage.getObjectRange(key, 0, 511);
    const content = validateAcademicContent(
      originalFileName || path.basename(String(objectKey || "")),
      header
    );
    if (!content.ok) {
      const err = new Error(content.message);
      err.code = content.code || "UPLOAD_CONTENT_MISMATCH";
      err.statusCode = 400;
      throw err;
    }
  }

  return {
    objectKey: key.startsWith("uploads/") ? key : `uploads/${key}`,
    size: meta.size,
    contentType: meta.contentType,
    folder,
  };
}

module.exports = {
  CATEGORY_FOLDERS,
  createPresignedUpload,
  verifyPresignedUpload,
  resolveFolder,
  MAX_DURABLE_FILE_BYTES,
};
