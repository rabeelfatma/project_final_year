/**
 * Unified academic file access: private Cloudflare R2 when configured,
 * otherwise local disk under the uploads root.
 *
 * Local laptop and Vercel share the same R2 bucket when R2_* env vars are set.
 * MongoDB continues to store relative keys like uploads/submissions/<file>.
 *
 * Reads are backward-compatible: prefer R2, then fall back to legacy local disk
 * so pre-migration files under backend/uploads remain downloadable.
 */
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const {
  resolveStoredUploadPath,
  getUploadsRoot,
} = require("./uploadsPath");
const objectStorage = require("./objectStorage");

/** Durable writes use R2 whenever credentials are configured (local + Vercel). */
function usesObjectStorage() {
  return objectStorage.isR2Configured();
}

function toObjectKey(stored) {
  const raw = String(stored || "").replace(/\\/g, "/");
  if (!raw || raw.includes("\0")) {
    throw new Error("Invalid file path.");
  }
  if (
    path.posix.isAbsolute(raw) ||
    path.win32.isAbsolute(raw) ||
    raw.startsWith("//") ||
    /^[a-zA-Z]:/.test(raw)
  ) {
    throw new Error("Invalid file path.");
  }

  let rel = raw.replace(/^[/\\]+/, "");
  if (!rel.startsWith("uploads/")) {
    rel = `uploads/${rel}`;
  }

  const segments = rel.split("/").filter(Boolean);
  if (!segments.length || segments.some((s) => s === ".." || s === ".")) {
    throw new Error("Invalid file path.");
  }
  return segments.join("/");
}

function relativeStoredPath(folder, filename) {
  const safeFolder = String(folder || "others").replace(/[^a-zA-Z0-9_-]/g, "");
  const safeName = path.basename(String(filename || "upload"));
  return `uploads/${safeFolder}/${safeName}`;
}

function localPathIfExists(stored) {
  // resolveStoredUploadPath throws "Invalid file path." for traversal — do not swallow.
  const filePath = resolveStoredUploadPath(stored);
  if (fs.existsSync(filePath)) return filePath;
  return null;
}

async function exists(stored) {
  if (!stored) return false;
  // Validate key shape up front (same rules as R2 object keys).
  let key;
  try {
    key = toObjectKey(stored);
  } catch (error) {
    if (error.message === "Invalid file path.") return false;
    throw error;
  }
  if (usesObjectStorage()) {
    try {
      objectStorage.assertR2Ready();
      if (await objectStorage.objectExists(key)) return true;
    } catch (error) {
      if (error.code === "R2_NOT_CONFIGURED") throw error;
      /* fall through to local legacy */
    }
  }
  try {
    return Boolean(localPathIfExists(stored));
  } catch (error) {
    if (error.message === "Invalid file path.") return false;
    throw error;
  }
}

async function readBuffer(stored) {
  const key = toObjectKey(stored);
  if (usesObjectStorage()) {
    try {
      objectStorage.assertR2Ready();
      if (await objectStorage.objectExists(key)) {
        return objectStorage.getObjectBuffer(key);
      }
    } catch (error) {
      if (error.code === "R2_NOT_CONFIGURED") throw error;
      /* fall through */
    }
  }
  const filePath = localPathIfExists(stored);
  if (!filePath) {
    const err = new Error("File not found on server.");
    err.code = "ENOENT";
    throw err;
  }
  return fs.readFileSync(filePath);
}

async function openDownloadStream(stored) {
  const key = toObjectKey(stored);
  if (usesObjectStorage()) {
    try {
      objectStorage.assertR2Ready();
      if (await objectStorage.objectExists(key)) {
        const { body, contentType, contentLength } =
          await objectStorage.getObjectStream(key);
        return { stream: body, contentType, contentLength, localPath: null };
      }
    } catch (error) {
      if (error.code === "R2_NOT_CONFIGURED") throw error;
      /* fall through to local legacy */
    }
  }

  const filePath = localPathIfExists(stored);
  if (!filePath) {
    const err = new Error("File not found on server.");
    err.code = "ENOENT";
    throw err;
  }
  return {
    stream: null,
    contentType: "",
    contentLength: undefined,
    localPath: filePath,
  };
}

async function remove(stored) {
  if (!stored) return;

  if (usesObjectStorage()) {
    try {
      objectStorage.assertR2Ready();
      await objectStorage.deleteObject(toObjectKey(stored));
    } catch (error) {
      if (error.code === "R2_NOT_CONFIGURED") throw error;
      console.warn("Could not remove R2 object:", error.message);
    }
  }

  // Also clear a legacy local copy if present (does not delete unrelated files).
  try {
    const filePath = localPathIfExists(stored);
    if (filePath) await fs.promises.unlink(filePath);
  } catch (error) {
    if (error.message === "Invalid file path.") {
      console.warn("Skipped file outside uploads directory.");
      return;
    }
    console.warn("Could not remove local stored file:", error.message);
  }
}

async function writeBuffer(storedRelative, buffer, contentType) {
  const key = toObjectKey(storedRelative);
  // Vercel has no durable local disk — R2 is mandatory there for durable writes.
  if (process.env.VERCEL === "1") {
    objectStorage.assertR2Ready();
  }
  if (!usesObjectStorage()) {
    const filePath = resolveStoredUploadPath(key);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, buffer);
    return key.startsWith("uploads/") ? key : `uploads/${key}`;
  }
  objectStorage.assertR2Ready();
  await objectStorage.putObject(key, buffer, contentType);
  return key;
}

/**
 * Persist a multer file (disk path or memory buffer) under uploads/<folder>/<filename>.
 * Returns the Mongo-compatible relative path / R2 object key.
 */
async function persistMulterFile(file, folder) {
  if (!file) throw new Error("No file uploaded");
  const filename = path.basename(
    String(file.filename || file.originalname || "upload")
  );
  const stored = relativeStoredPath(folder, filename);
  const contentType = file.mimetype || "application/octet-stream";

  if (file.buffer && Buffer.isBuffer(file.buffer)) {
    await writeBuffer(stored, file.buffer, contentType);
    return stored;
  }

  if (file.path && fs.existsSync(file.path)) {
    if (!usesObjectStorage()) {
      // Disk storage already wrote under the uploads root.
      return stored;
    }
    const buf = fs.readFileSync(file.path);
    await writeBuffer(stored, buf, contentType);
    try {
      fs.unlinkSync(file.path);
    } catch (_) {
      /* temp cleanup best-effort */
    }
    return stored;
  }

  throw new Error("Uploaded file payload is missing.");
}

/**
 * Materialize a stored file to a local path for libraries that require paths
 * (mammoth, xlsx, adm-zip). On local disk returns the real path; on R2 uses /tmp.
 */
async function materialize(stored) {
  if (usesObjectStorage()) {
    try {
      objectStorage.assertR2Ready();
      const key = toObjectKey(stored);
      if (await objectStorage.objectExists(key)) {
        const buf = await objectStorage.getObjectBuffer(key);
        const ext = path.extname(String(stored));
        const tmp = path.join(
          os.tmpdir(),
          `qc-r2-${Date.now()}-${crypto.randomBytes(6).toString("hex")}${ext}`
        );
        fs.writeFileSync(tmp, buf);
        return {
          path: tmp,
          cleanup: async () => {
            try {
              if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
            } catch (_) {
              /* ignore */
            }
          },
        };
      }
    } catch (error) {
      if (error.code === "R2_NOT_CONFIGURED") throw error;
      /* fall through */
    }
  }

  const filePath = localPathIfExists(stored);
  if (!filePath) {
    const err = new Error("File not found on server.");
    err.code = "ENOENT";
    throw err;
  }
  return { path: filePath, cleanup: async () => {} };
}

async function readUtf8(stored) {
  const buf = await readBuffer(stored);
  return buf.toString("utf8");
}

/**
 * Confirm a client-completed presigned upload before Mongo metadata commit.
 */
async function assertUploadedObject(stored, { expectedSize, maxBytes } = {}) {
  if (!usesObjectStorage()) {
    const err = new Error(
      "Cloudflare R2 is required for direct uploads but is not configured."
    );
    err.code = "R2_NOT_CONFIGURED";
    err.statusCode = 503;
    throw err;
  }
  objectStorage.assertR2Ready();
  const key = toObjectKey(stored);
  const meta = await objectStorage.headObject(key);
  if (!meta) {
    const err = new Error("Uploaded file was not found in object storage.");
    err.code = "UPLOAD_OBJECT_MISSING";
    err.statusCode = 400;
    throw err;
  }
  const size = Number(meta.contentLength || 0);
  if (maxBytes != null && size > Number(maxBytes)) {
    const err = new Error(
      `Uploaded file exceeds the maximum allowed size (${Math.floor(
        Number(maxBytes) / (1024 * 1024)
      )} MB).`
    );
    err.code = "UPLOAD_TOO_LARGE";
    err.statusCode = 400;
    throw err;
  }
  if (
    expectedSize != null &&
    Number.isFinite(Number(expectedSize)) &&
    size !== Number(expectedSize)
  ) {
    const err = new Error("Uploaded file size does not match the declared size.");
    err.code = "UPLOAD_SIZE_MISMATCH";
    err.statusCode = 400;
    throw err;
  }
  return { key, size, contentType: meta.contentType || "" };
}

function storageModeLabel() {
  if (!usesObjectStorage()) return "local-disk";
  return "r2";
}

module.exports = {
  usesObjectStorage,
  toObjectKey,
  relativeStoredPath,
  exists,
  readBuffer,
  readUtf8,
  openDownloadStream,
  remove,
  writeBuffer,
  persistMulterFile,
  materialize,
  assertUploadedObject,
  storageModeLabel,
  getUploadsRoot,
};
