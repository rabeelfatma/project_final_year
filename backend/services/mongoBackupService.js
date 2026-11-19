/**
 * Encrypted MongoDB → private R2 backup design (isolated / offline safe).
 *
 * Does NOT connect to production Atlas or R2 unless explicitly invoked with
 * real drivers. Unit tests inject mocks only.
 *
 * Retention: keep the newest `retentionCount` backup objects under
 * uploads/backups/mongo/.
 *
 * Restore: download object → decrypt → mongorestore / insertMany from JSON
 * dump (see scripts/mongoBackupToR2.js --help).
 */
const crypto = require("crypto");

const BACKUP_PREFIX = "uploads/backups/mongo/";
const DEFAULT_RETENTION = 14;
const ALGO = "aes-256-gcm";

function deriveKey(secret) {
  return crypto.createHash("sha256").update(String(secret || ""), "utf8").digest();
}

function encryptBuffer(plain, secret) {
  const key = deriveKey(secret);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]);
}

function decryptBuffer(blob, secret) {
  const key = deriveKey(secret);
  const iv = blob.subarray(0, 12);
  const tag = blob.subarray(12, 28);
  const data = blob.subarray(28);
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]);
}

/**
 * @param {object} deps
 * @param {() => Promise<Record<string, object[]>>} deps.exportCollections
 * @param {(key: string, body: Buffer, contentType: string) => Promise<void>} deps.putObject
 * @param {() => Promise<string[]>} deps.listBackupKeys
 * @param {(key: string) => Promise<void>} deps.deleteObject
 * @param {(event: object) => void} [deps.onEvent] monitoring hook
 * @param {string} deps.encryptionSecret
 * @param {number} [deps.retentionCount]
 */
async function runEncryptedBackup(deps) {
  const {
    exportCollections,
    putObject,
    listBackupKeys,
    deleteObject,
    onEvent,
    encryptionSecret,
    retentionCount = DEFAULT_RETENTION,
  } = deps;

  if (!encryptionSecret) {
    const err = new Error("BACKUP_ENCRYPTION_SECRET is required.");
    err.code = "BACKUP_SECRET_MISSING";
    throw err;
  }

  const started = Date.now();
  onEvent?.({ type: "backup_start", at: new Date().toISOString() });

  try {
    const collections = await exportCollections();
    const payload = Buffer.from(
      JSON.stringify({
        version: 1,
        createdAt: new Date().toISOString(),
        collections,
      }),
      "utf8"
    );
    const encrypted = encryptBuffer(payload, encryptionSecret);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const key = `${BACKUP_PREFIX}qc-mongo-${stamp}.json.enc`;
    await putObject(key, encrypted, "application/octet-stream");

    const keys = (await listBackupKeys()).filter((k) =>
      String(k).startsWith(BACKUP_PREFIX)
    );
    keys.sort(); // oldest first
    const overflow = keys.length - Number(retentionCount);
    const deleted = [];
    if (overflow > 0) {
      for (const old of keys.slice(0, overflow)) {
        await deleteObject(old);
        deleted.push(old);
      }
    }

    const result = {
      ok: true,
      key,
      bytes: encrypted.length,
      deleted,
      durationMs: Date.now() - started,
    };
    onEvent?.({ type: "backup_success", ...result });
    return result;
  } catch (error) {
    onEvent?.({
      type: "backup_failure",
      message: error.message,
      code: error.code,
      at: new Date().toISOString(),
    });
    throw error;
  }
}

async function restoreEncryptedBackup(deps) {
  const { getObjectBuffer, encryptionSecret, key, importCollections } = deps;
  if (!encryptionSecret) {
    const err = new Error("BACKUP_ENCRYPTION_SECRET is required.");
    err.code = "BACKUP_SECRET_MISSING";
    throw err;
  }
  const blob = await getObjectBuffer(key);
  const plain = decryptBuffer(blob, encryptionSecret);
  const parsed = JSON.parse(plain.toString("utf8"));
  if (!parsed?.collections || typeof parsed.collections !== "object") {
    const err = new Error("Backup payload is invalid.");
    err.code = "BACKUP_INVALID";
    throw err;
  }
  await importCollections(parsed.collections);
  return {
    ok: true,
    key,
    collectionNames: Object.keys(parsed.collections),
    createdAt: parsed.createdAt || null,
  };
}

module.exports = {
  BACKUP_PREFIX,
  DEFAULT_RETENTION,
  encryptBuffer,
  decryptBuffer,
  runEncryptedBackup,
  restoreEncryptedBackup,
};
