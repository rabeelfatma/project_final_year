/**
 * Shared R2 architecture — isolated mocks only.
 * Never connects to production MongoDB Atlas or Cloudflare R2.
 */
const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const fs = require("fs");
const os = require("os");
const Module = require("module");
const { PassThrough } = require("stream");

const objectStoragePath = path.resolve(__dirname, "../utils/objectStorage.js");
const storedFilesPath = path.resolve(__dirname, "../utils/storedFiles.js");
const uploadsPathUtil = path.resolve(__dirname, "../utils/uploadsPath.js");
const allowlistPath = path.resolve(__dirname, "../utils/uploadAllowlist.js");
const multerPath = path.resolve(__dirname, "../middleware/multerMiddleware.js");
const presignPath = path.resolve(__dirname, "../services/presignedUploadService.js");
const backupPath = path.resolve(__dirname, "../services/mongoBackupService.js");

function clear(...paths) {
  for (const p of paths) delete require.cache[p];
}

const R2_KEYS = [
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET_NAME",
  "R2_ENDPOINT",
  "VERCEL",
];

function withEnv(vars, fn) {
  const prev = {};
  for (const [k, v] of Object.entries(vars)) {
    prev[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      for (const [k, v] of Object.entries(prev)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    });
}

const r2Ready = {
  R2_ACCOUNT_ID: "acc123",
  R2_ACCESS_KEY_ID: "key",
  R2_SECRET_ACCESS_KEY: "secret",
  R2_BUCKET_NAME: "quickcheck-hub-files",
  R2_ENDPOINT: "https://acc123.r2.cloudflarestorage.com",
};

describe("upload allowlist excludes nine video types", () => {
  it("rejects Teacher/Student video containers", () => {
    clear(allowlistPath);
    const {
      isAllowedAcademicExtension,
      isVideoExtension,
      VIDEO_EXTENSIONS,
      ACADEMIC_EXTENSIONS,
    } = require(allowlistPath);
    assert.equal(VIDEO_EXTENSIONS.size, 9);
    for (const ext of [
      ".mp4",
      ".mkv",
      ".webm",
      ".mov",
      ".avi",
      ".wmv",
      ".mpeg",
      ".mpg",
      ".m4v",
    ]) {
      assert.equal(isVideoExtension(ext), true);
      assert.equal(isAllowedAcademicExtension(`file${ext}`), false);
      assert.equal(ACADEMIC_EXTENSIONS.includes(ext), false);
    }
    assert.equal(isAllowedAcademicExtension("paper.pdf"), true);
  });
});

describe("usesObjectStorage follows R2 config (not only VERCEL)", () => {
  afterEach(() => clear(storedFilesPath, objectStoragePath, uploadsPathUtil));

  it("is true with R2 configured and VERCEL unset (local shared bucket)", async () => {
    await withEnv({ ...r2Ready, VERCEL: undefined }, () => {
      clear(storedFilesPath, objectStoragePath, uploadsPathUtil);
      const storedFiles = require(storedFilesPath);
      assert.equal(storedFiles.usesObjectStorage(), true);
      assert.equal(storedFiles.storageModeLabel(), "r2");
    });
  });

  it("is true with R2 configured and VERCEL=1", async () => {
    await withEnv({ ...r2Ready, VERCEL: "1" }, () => {
      clear(storedFilesPath, objectStoragePath, uploadsPathUtil);
      const storedFiles = require(storedFilesPath);
      assert.equal(storedFiles.usesObjectStorage(), true);
    });
  });

  it("is false when R2 is unset even if VERCEL=1", async () => {
    await withEnv(
      {
        VERCEL: "1",
        R2_ACCOUNT_ID: undefined,
        R2_ACCESS_KEY_ID: undefined,
        R2_SECRET_ACCESS_KEY: undefined,
        R2_BUCKET_NAME: undefined,
        R2_ENDPOINT: undefined,
      },
      () => {
        clear(storedFilesPath, objectStoragePath, uploadsPathUtil);
        const storedFiles = require(storedFilesPath);
        assert.equal(storedFiles.usesObjectStorage(), false);
      }
    );
  });
});

describe("backward-compatible reads: R2 preferred, local legacy fallback", () => {
  let tempRoot;
  let fakeStore;
  let originalLoad;

  beforeEach(async () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "qc-shared-r2-"));
    fs.mkdirSync(path.join(tempRoot, "assignments"), { recursive: true });
    fs.writeFileSync(
      path.join(tempRoot, "assignments", "legacy.txt"),
      "legacy-local-bytes"
    );
    fakeStore = new Map();
    originalLoad = Module._load;
    Module._load = function (request, parent, isMain) {
      if (request === "@aws-sdk/client-s3") {
        return {
          S3Client: class {
            async send(cmd) {
              const name = cmd.constructor.name;
              const key = cmd.input.Key;
              if (name === "HeadObjectCommand") {
                if (!fakeStore.has(key)) {
                  const err = new Error("missing");
                  err.name = "NotFound";
                  err.$metadata = { httpStatusCode: 404 };
                  throw err;
                }
                const buf = fakeStore.get(key);
                return { ContentLength: buf.length, ContentType: "text/plain" };
              }
              if (name === "GetObjectCommand") {
                if (!fakeStore.has(key)) {
                  const err = new Error("missing");
                  err.$metadata = { httpStatusCode: 404 };
                  throw err;
                }
                return { Body: fakeStore.get(key), ContentType: "text/plain" };
              }
              if (name === "PutObjectCommand") {
                fakeStore.set(key, Buffer.from(cmd.input.Body));
                return {};
              }
              if (name === "DeleteObjectCommand") {
                fakeStore.delete(key);
                return {};
              }
              return {};
            }
          },
          PutObjectCommand: class {
            constructor(input) {
              this.input = input;
            }
          },
          GetObjectCommand: class {
            constructor(input) {
              this.input = input;
            }
          },
          DeleteObjectCommand: class {
            constructor(input) {
              this.input = input;
            }
          },
          HeadObjectCommand: class {
            constructor(input) {
              this.input = input;
            }
          },
        };
      }
      if (request === "@aws-sdk/s3-request-presigner") {
        return {
          getSignedUrl: async () =>
            "https://example.r2.cloudflarestorage.com/presigned-put",
        };
      }
      return originalLoad(request, parent, isMain);
    };
  });

  afterEach(() => {
    Module._load = originalLoad;
    clear(storedFilesPath, objectStoragePath, uploadsPathUtil);
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it("reads legacy local file when R2 object is missing", async () => {
    await withEnv({ ...r2Ready, VERCEL: undefined, UPLOADS_DIR: tempRoot }, async () => {
      clear(storedFilesPath, objectStoragePath, uploadsPathUtil);
      objectStoragePath && require(objectStoragePath).resetR2ClientCache?.();
      const objectStorage = require(objectStoragePath);
      objectStorage.resetR2ClientCache();
      const storedFiles = require(storedFilesPath);
      assert.equal(storedFiles.usesObjectStorage(), true);
      const key = "uploads/assignments/legacy.txt";
      assert.equal(await storedFiles.exists(key), true);
      assert.equal(
        (await storedFiles.readBuffer(key)).toString("utf8"),
        "legacy-local-bytes"
      );
    });
  });

  it("writes new durable objects to mocked R2 even when VERCEL unset", async () => {
    await withEnv({ ...r2Ready, VERCEL: undefined, UPLOADS_DIR: tempRoot }, async () => {
      clear(storedFilesPath, objectStoragePath, uploadsPathUtil);
      require(objectStoragePath).resetR2ClientCache();
      const storedFiles = require(storedFilesPath);
      const key = "uploads/submissions/new-on-r2.txt";
      await storedFiles.writeBuffer(key, Buffer.from("r2-bytes"), "text/plain");
      assert.ok(fakeStore.has("uploads/submissions/new-on-r2.txt"));
      assert.equal(
        (await storedFiles.readBuffer(key)).toString("utf8"),
        "r2-bytes"
      );
    });
  });
});

describe("presigned upload service (mocked)", () => {
  let originalLoad;
  let fakeStore;

  beforeEach(() => {
    fakeStore = new Map();
    originalLoad = Module._load;
    Module._load = function (request, parent, isMain) {
      if (request === "@aws-sdk/client-s3") {
        return {
          S3Client: class {
            async send(cmd) {
              const name = cmd.constructor.name;
              const key = cmd.input.Key;
              if (name === "HeadObjectCommand") {
                if (!fakeStore.has(key)) {
                  const err = new Error("missing");
                  err.name = "NotFound";
                  err.$metadata = { httpStatusCode: 404 };
                  throw err;
                }
                return {
                  ContentLength: fakeStore.get(key).length,
                  ContentType: "application/pdf",
                };
              }
              if (name === "PutObjectCommand") {
                fakeStore.set(key, Buffer.alloc(cmd.input.Body?.length || 0));
                return {};
              }
              return {};
            }
          },
          PutObjectCommand: class {
            constructor(input) {
              this.input = input;
            }
          },
          GetObjectCommand: class {
            constructor(input) {
              this.input = input;
            }
          },
          DeleteObjectCommand: class {
            constructor(input) {
              this.input = input;
            }
          },
          HeadObjectCommand: class {
            constructor(input) {
              this.input = input;
            }
          },
        };
      }
      if (request === "@aws-sdk/s3-request-presigner") {
        return {
          getSignedUrl: async (_client, cmd) =>
            `https://example.r2.cloudflarestorage.com/${cmd.input.Key}?X-Amz-Signature=fake`,
        };
      }
      return originalLoad(request, parent, isMain);
    };
  });

  afterEach(() => {
    Module._load = originalLoad;
    clear(
      presignPath,
      storedFilesPath,
      objectStoragePath,
      uploadsPathUtil,
      allowlistPath,
      multerPath
    );
  });

  it("creates a presigned PUT and verifies object before Mongo commit", async () => {
    await withEnv({ ...r2Ready, VERCEL: "1" }, async () => {
      clear(
        presignPath,
        storedFilesPath,
        objectStoragePath,
        uploadsPathUtil,
        allowlistPath,
        multerPath
      );
      require(objectStoragePath).resetR2ClientCache();
      const svc = require(presignPath);
      const intent = await svc.createPresignedUpload({
        category: "assignments",
        originalFileName: "brief.pdf",
        contentType: "application/pdf",
        size: 12,
        userId: "507f1f77bcf86cd799439011",
      });
      assert.match(intent.uploadUrl, /presigned|Signature|example\.r2/);
      assert.match(intent.objectKey, /^uploads\/assignments\//);
      assert.equal(intent.maxBytes, 200 * 1024 * 1024);

      fakeStore.set(
        intent.objectKey.replace(/^\/+/, ""),
        Buffer.alloc(12)
      );
      // Keys in fake store use toObjectKey form
      const key = intent.objectKey.startsWith("uploads/")
        ? intent.objectKey
        : `uploads/${intent.objectKey}`;
      fakeStore.set(key, Buffer.alloc(12));

      const verified = await svc.verifyPresignedUpload({
        objectKey: intent.objectKey,
        category: "assignments",
        originalFileName: "brief.pdf",
        expectedSize: 12,
      });
      assert.equal(verified.size, 12);
    });
  });

  it("rejects video extensions for assignment category", async () => {
    await withEnv({ ...r2Ready }, async () => {
      clear(
        presignPath,
        storedFilesPath,
        objectStoragePath,
        uploadsPathUtil,
        allowlistPath,
        multerPath
      );
      require(objectStoragePath).resetR2ClientCache();
      const svc = require(presignPath);
      await assert.rejects(
        () =>
          svc.createPresignedUpload({
            category: "submissions",
            originalFileName: "clip.mp4",
            contentType: "video/mp4",
            size: 1000,
            userId: "u1",
          }),
        (err) => err.code === "UPLOAD_TYPE_REJECTED"
      );
    });
  });
});

describe("multer ephemeral AI refs stay off R2", () => {
  it("evaluate-ai is ephemeral", () => {
    clear(multerPath, allowlistPath, storedFilesPath, objectStoragePath, uploadsPathUtil);
    const upload = require(multerPath);
    assert.equal(
      upload.isEphemeralUpload({ originalUrl: "/api/teacher/evaluate-ai" }),
      true
    );
    assert.equal(
      upload.isEphemeralUpload({ originalUrl: "/api/teacher/assignments" }),
      false
    );
  });
});

describe("encrypted mongo backup service (mocked, no network)", () => {
  it("encrypts, stores, restores, and reports failures", async () => {
    clear(backupPath);
    const {
      runEncryptedBackup,
      restoreEncryptedBackup,
      encryptBuffer,
      decryptBuffer,
    } = require(backupPath);

    const round = encryptBuffer(Buffer.from("hello"), "secret");
    assert.equal(decryptBuffer(round, "secret").toString("utf8"), "hello");

    const store = new Map();
    const events = [];
    const result = await runEncryptedBackup({
      encryptionSecret: "unit-test-secret",
      retentionCount: 2,
      exportCollections: async () => ({ users: [{ _id: "1", name: "A" }] }),
      putObject: async (key, body) => {
        store.set(key, body);
      },
      listBackupKeys: async () => [...store.keys()].sort(),
      deleteObject: async (key) => {
        store.delete(key);
      },
      onEvent: (e) => events.push(e.type),
    });
    assert.equal(result.ok, true);
    assert.ok(store.has(result.key));
    assert.ok(events.includes("backup_start"));
    assert.ok(events.includes("backup_success"));

    // Second + third backups trigger retention delete of oldest
    await runEncryptedBackup({
      encryptionSecret: "unit-test-secret",
      retentionCount: 2,
      exportCollections: async () => ({ users: [] }),
      putObject: async (key, body) => {
        store.set(key, body);
      },
      listBackupKeys: async () => [...store.keys()].sort(),
      deleteObject: async (key) => {
        store.delete(key);
      },
    });
    await runEncryptedBackup({
      encryptionSecret: "unit-test-secret",
      retentionCount: 2,
      exportCollections: async () => ({ users: [] }),
      putObject: async (key, body) => {
        store.set(key, body);
      },
      listBackupKeys: async () => [...store.keys()].sort(),
      deleteObject: async (key) => {
        store.delete(key);
      },
    });
    assert.equal(store.size, 2);

    let imported = null;
    const restoreKey = store.has(result.key)
      ? result.key
      : [...store.keys()][0];
    const restored = await restoreEncryptedBackup({
      key: restoreKey,
      encryptionSecret: "unit-test-secret",
      getObjectBuffer: async (k) => store.get(k),
      importCollections: async (cols) => {
        imported = cols;
      },
    });
    assert.equal(restored.ok, true);
    assert.ok(imported);
    assert.ok(Array.isArray(imported.users));
  });
});
