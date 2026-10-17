/**
 * Unified academic file access: local disk (Hostinger/local) or private R2 (Vercel).
 * MongoDB continues to store relative paths like uploads/submissions/<file>.
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

/** Durable uploads use R2 only on Vercel — Hostinger keeps local disk. */
function usesObjectStorage() {
  return process.env.VERCEL === "1";
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

async function exists(stored) {
  if (!stored) return false;
  if (!usesObjectStorage()) {
    try {
      return fs.existsSync(resolveStoredUploadPath(stored));
    } catch (_) {
      return false;
    }
  }
  try {
    objectStorage.assertR2Ready();
    return objectStorage.objectExists(toObjectKey(stored));
  } catch (error) {
    if (error.code === "R2_NOT_CONFIGURED") throw error;
    return false;
  }
}

async function readBuffer(stored) {
  if (!usesObjectStorage()) {
    const filePath = resolveStoredUploadPath(stored);
    return fs.readFileSync(filePath);
  }
  objectStorage.assertR2Ready();
  return objectStorage.getObjectBuffer(toObjectKey(stored));
}

async function openDownloadStream(stored) {
  if (!usesObjectStorage()) {
    const filePath = resolveStoredUploadPath(stored);
    if (!fs.existsSync(filePath)) {
      const err = new Error("File not found on server.");
      err.code = "ENOENT";
      throw err;
    }
    // Callers that honor localPath (sendFile/res.download) must not leave an
    // orphaned ReadStream open against the file.
    return {
      stream: null,
      contentType: "",
      contentLength: undefined,
      localPath: filePath,
    };
  }
  objectStorage.assertR2Ready();
  const key = toObjectKey(stored);
  const { body, contentType, contentLength } = await objectStorage.getObjectStream(key);
  return { stream: body, contentType, contentLength, localPath: null };
}

async function remove(stored) {
  if (!stored) return;
  if (!usesObjectStorage()) {
    try {
      const filePath = resolveStoredUploadPath(stored);
      if (fs.existsSync(filePath)) await fs.promises.unlink(filePath);
    } catch (error) {
      if (error.message === "Invalid file path.") {
        console.warn("Skipped file outside uploads directory.");
        return;
      }
      console.warn("Could not remove stored file:", error.message);
    }
    return;
  }
  try {
    objectStorage.assertR2Ready();
    await objectStorage.deleteObject(toObjectKey(stored));
  } catch (error) {
    if (error.code === "R2_NOT_CONFIGURED") throw error;
    console.warn("Could not remove R2 object:", error.message);
  }
}

async function writeBuffer(storedRelative, buffer, contentType) {
  const key = toObjectKey(storedRelative);
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
 * Returns the Mongo-compatible relative path.
 */
async function persistMulterFile(file, folder) {
  if (!file) throw new Error("No file uploaded");
  const filename = path.basename(String(file.filename || file.originalname || "upload"));
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
 * (mammoth, xlsx, adm-zip). On Hostinger returns the real path; on R2 uses /tmp.
 */
async function materialize(stored) {
  if (!usesObjectStorage()) {
    const filePath = resolveStoredUploadPath(stored);
    if (!fs.existsSync(filePath)) {
      const err = new Error("File not found on server.");
      err.code = "ENOENT";
      throw err;
    }
    return { path: filePath, cleanup: async () => {} };
  }

  const buf = await readBuffer(stored);
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

async function readUtf8(stored) {
  const buf = await readBuffer(stored);
  return buf.toString("utf8");
}

function storageModeLabel() {
  if (!usesObjectStorage()) return "local-disk";
  return objectStorage.isR2Configured() ? "r2" : "r2-unconfigured";
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
  storageModeLabel,
  getUploadsRoot,
};
