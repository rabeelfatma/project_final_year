/**
 * Isolated Cloudflare R2 / local-disk storage adapter tests.
 * Mocks the S3 SDK — never connects to R2, MongoDB, or production files.
 */
const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const fs = require("fs");
const os = require("os");
const Module = require("module");
const http = require("http");
const express = require("express");

const objectStoragePath = path.resolve(__dirname, "../utils/objectStorage.js");
const storedFilesPath = path.resolve(__dirname, "../utils/storedFiles.js");
const uploadsPathUtil = path.resolve(__dirname, "../utils/uploadsPath.js");
const fileControllerPath = path.resolve(__dirname, "../controllers/fileController.js");
const fileRoutesPath = path.resolve(__dirname, "../routes/fileRoutes.js");
const authMiddlewarePath = path.resolve(__dirname, "../middleware/authMiddleware.js");
const assignmentModelPath = path.resolve(__dirname, "../models/Assignment.js");
const submissionModelPath = path.resolve(__dirname, "../models/Submission.js");
const messageModelPath = path.resolve(__dirname, "../models/Message.js");

function clear(...paths) {
  for (const p of paths) delete require.cache[p];
}

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

describe("R2 configuration validation", () => {
  beforeEach(() => {
    clear(objectStoragePath);
  });

  it("assertR2Ready throws a clear error listing missing vars", async () => {
    await withEnv(
      {
        R2_ACCOUNT_ID: undefined,
        R2_ACCESS_KEY_ID: undefined,
        R2_SECRET_ACCESS_KEY: undefined,
        R2_BUCKET_NAME: undefined,
        R2_ENDPOINT: undefined,
      },
      () => {
        const { assertR2Ready } = require(objectStoragePath);
        assert.throws(() => assertR2Ready(), (err) => {
          assert.equal(err.code, "R2_NOT_CONFIGURED");
          assert.equal(err.statusCode, 503);
          assert.match(err.message, /R2_ACCOUNT_ID/);
          assert.match(err.message, /R2_ACCESS_KEY_ID/);
          assert.doesNotMatch(err.message, /secret-value/i);
          return true;
        });
      }
    );
  });

  it("isR2Configured is true when all required names are set", async () => {
    await withEnv(
      {
        R2_ACCOUNT_ID: "acc123",
        R2_ACCESS_KEY_ID: "key",
        R2_SECRET_ACCESS_KEY: "secret",
        R2_BUCKET_NAME: "quickcheck-hub-files",
        R2_ENDPOINT: "https://acc123.r2.cloudflarestorage.com",
      },
      () => {
        const { isR2Configured, getR2Config } = require(objectStoragePath);
        assert.equal(isR2Configured(), true);
        assert.equal(getR2Config().bucket, "quickcheck-hub-files");
      }
    );
  });
});

describe("storedFiles local-disk mode (Hostinger compatible)", () => {
  let tempRoot;
  const prev = {};

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "qc-r2-disk-"));
    fs.mkdirSync(path.join(tempRoot, "submissions"), { recursive: true });
    prev.VERCEL = process.env.VERCEL;
    prev.UPLOADS_DIR = process.env.UPLOADS_DIR;
    delete process.env.VERCEL;
    process.env.UPLOADS_DIR = tempRoot;
    clear(storedFilesPath, uploadsPathUtil, objectStoragePath);
  });

  afterEach(() => {
    if (prev.VERCEL === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = prev.VERCEL;
    if (prev.UPLOADS_DIR === undefined) delete process.env.UPLOADS_DIR;
    else process.env.UPLOADS_DIR = prev.UPLOADS_DIR;
    clear(storedFilesPath, uploadsPathUtil, objectStoragePath);
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it("write/read/exists/delete on local disk without R2", async () => {
    const storedFiles = require(storedFilesPath);
    assert.equal(storedFiles.usesObjectStorage(), false);
    const key = "uploads/submissions/demo.txt";
    await storedFiles.writeBuffer(key, Buffer.from("hello-disk"), "text/plain");
    assert.equal(await storedFiles.exists(key), true);
    assert.equal((await storedFiles.readBuffer(key)).toString("utf8"), "hello-disk");
    const mat = await storedFiles.materialize(key);
    assert.equal(fs.readFileSync(mat.path, "utf8"), "hello-disk");
    await mat.cleanup();
    await storedFiles.remove(key);
    assert.equal(await storedFiles.exists(key), false);
  });
});

describe("storedFiles R2 mode with mocked SDK", () => {
  let fakeStore;
  let sendCalls;
  let originalLoad;
  const prev = {};

  beforeEach(() => {
    fakeStore = new Map();
    sendCalls = [];
    prev.VERCEL = process.env.VERCEL;
    prev.R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
    prev.R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
    prev.R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
    prev.R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;
    prev.R2_ENDPOINT = process.env.R2_ENDPOINT;
    process.env.VERCEL = "1";
    process.env.R2_ACCOUNT_ID = "acc";
    process.env.R2_ACCESS_KEY_ID = "ak";
    process.env.R2_SECRET_ACCESS_KEY = "sk";
    process.env.R2_BUCKET_NAME = "quickcheck-hub-files";
    process.env.R2_ENDPOINT = "https://acc.r2.cloudflarestorage.com";

    clear(storedFilesPath, uploadsPathUtil, objectStoragePath);

    originalLoad = Module._load;
    Module._load = function (request, parent, isMain) {
      if (request === "@aws-sdk/client-s3") {
        class FakeClient {
          constructor() {}
          async send(command) {
            sendCalls.push(command.constructor.name);
            const input = command.input || command;
            const name = command.constructor.name;
            if (name === "PutObjectCommand") {
              fakeStore.set(input.Key, Buffer.from(input.Body));
              return {};
            }
            if (name === "GetObjectCommand") {
              if (!fakeStore.has(input.Key)) {
                const err = new Error("NoSuchKey");
                err.name = "NoSuchKey";
                err.$metadata = { httpStatusCode: 404 };
                throw err;
              }
              return {
                Body: fakeStore.get(input.Key),
                ContentType: "application/octet-stream",
                ContentLength: fakeStore.get(input.Key).length,
              };
            }
            if (name === "HeadObjectCommand") {
              if (!fakeStore.has(input.Key)) {
                const err = new Error("NotFound");
                err.name = "NotFound";
                err.$metadata = { httpStatusCode: 404 };
                throw err;
              }
              return {};
            }
            if (name === "DeleteObjectCommand") {
              fakeStore.delete(input.Key);
              return {};
            }
            throw new Error("unexpected command " + name);
          }
        }
        return {
          S3Client: FakeClient,
          PutObjectCommand: class PutObjectCommand {
            constructor(input) {
              this.input = input;
            }
          },
          GetObjectCommand: class GetObjectCommand {
            constructor(input) {
              this.input = input;
            }
          },
          DeleteObjectCommand: class DeleteObjectCommand {
            constructor(input) {
              this.input = input;
            }
          },
          HeadObjectCommand: class HeadObjectCommand {
            constructor(input) {
              this.input = input;
            }
          },
        };
      }
      return originalLoad(request, parent, isMain);
    };
  });

  afterEach(() => {
    Module._load = originalLoad;
    if (prev.VERCEL === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = prev.VERCEL;
    for (const k of [
      "R2_ACCOUNT_ID",
      "R2_ACCESS_KEY_ID",
      "R2_SECRET_ACCESS_KEY",
      "R2_BUCKET_NAME",
      "R2_ENDPOINT",
    ]) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
    clear(storedFilesPath, uploadsPathUtil, objectStoragePath);
  });

  it("upload/read/delete via mocked R2 client", async () => {
    const storedFiles = require(storedFilesPath);
    assert.equal(storedFiles.usesObjectStorage(), true);
    const key = "uploads/submissions/r2-demo.txt";
    await storedFiles.writeBuffer(key, Buffer.from("hello-r2"), "text/plain");
    assert.ok(sendCalls.includes("PutObjectCommand"));
    assert.equal(await storedFiles.exists(key), true);
    assert.equal((await storedFiles.readBuffer(key)).toString("utf8"), "hello-r2");
    const mat = await storedFiles.materialize(key);
    assert.equal(fs.readFileSync(mat.path, "utf8"), "hello-r2");
    await mat.cleanup();
    assert.equal(fs.existsSync(mat.path), false);
    await storedFiles.remove(key);
    assert.equal(await storedFiles.exists(key), false);
  });

  it("fails clearly when Vercel needs R2 but config is missing", async () => {
    delete process.env.R2_ACCOUNT_ID;
    delete process.env.R2_ACCESS_KEY_ID;
    delete process.env.R2_SECRET_ACCESS_KEY;
    clear(storedFilesPath, objectStoragePath);
    // Re-install mock load for fresh require
    const storedFiles = require(storedFilesPath);
    await assert.rejects(
      () => storedFiles.writeBuffer("uploads/submissions/x.txt", Buffer.from("x")),
      (err) => {
        assert.equal(err.code, "R2_NOT_CONFIGURED");
        return true;
      }
    );
  });
});

describe("authenticated file download with storage adapter", () => {
  let tempRoot;
  const prev = {};

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "qc-r2-files-"));
    fs.mkdirSync(path.join(tempRoot, "assignments"), { recursive: true });
    fs.writeFileSync(path.join(tempRoot, "assignments", "a.txt"), "assignment-body");
    prev.VERCEL = process.env.VERCEL;
    prev.UPLOADS_DIR = process.env.UPLOADS_DIR;
    delete process.env.VERCEL;
    process.env.UPLOADS_DIR = tempRoot;
    clear(
      storedFilesPath,
      uploadsPathUtil,
      fileControllerPath,
      fileRoutesPath,
      authMiddlewarePath,
      assignmentModelPath,
      submissionModelPath,
      messageModelPath
    );
  });

  afterEach(() => {
    if (prev.VERCEL === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = prev.VERCEL;
    if (prev.UPLOADS_DIR === undefined) delete process.env.UPLOADS_DIR;
    else process.env.UPLOADS_DIR = prev.UPLOADS_DIR;
    clear(
      storedFilesPath,
      uploadsPathUtil,
      fileControllerPath,
      fileRoutesPath,
      authMiddlewarePath,
      assignmentModelPath,
      submissionModelPath,
      messageModelPath
    );
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  function request(port, method, urlPath, headers = {}) {
    return new Promise((resolve, reject) => {
      const req = http.request(
        { hostname: "127.0.0.1", port, path: urlPath, method, headers },
        (res) => {
          const chunks = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () =>
            resolve({
              status: res.statusCode,
              text: Buffer.concat(chunks).toString("utf8"),
            })
          );
        }
      );
      req.on("error", reject);
      req.end();
    });
  }

  it("serves assignment file for owner teacher and denies other teacher", async () => {
    const teacherId = "teacher-1";
    const assignment = {
      _id: "asn-1",
      teacher: teacherId,
      status: "active",
      file: "uploads/assignments/a.txt",
      originalFileName: "a.txt",
      fileMimeType: "text/plain",
    };

    const originalLoad = Module._load;
    Module._load = function (request, parent, isMain) {
      if (
        request === "../middleware/authMiddleware" ||
        request.endsWith(`${path.sep}middleware${path.sep}authMiddleware.js`)
      ) {
        return {
          protect: (req, _res, next) => {
            req.user = req.headers["x-role"]
              ? { _id: req.headers["x-user"], role: req.headers["x-role"] }
              : null;
            if (!req.user) return _res.status(401).json({ message: "Unauthorized" });
            next();
          },
        };
      }
      if (
        request === "../models/Assignment" ||
        request.endsWith(`${path.sep}models${path.sep}Assignment.js`)
      ) {
        return {
          findById: async () => assignment,
        };
      }
      if (
        request === "../models/Submission" ||
        request.endsWith(`${path.sep}models${path.sep}Submission.js`)
      ) {
        return { findById: async () => null };
      }
      if (
        request === "../models/Message" ||
        request.endsWith(`${path.sep}models${path.sep}Message.js`)
      ) {
        return { findById: async () => null };
      }
      return originalLoad(request, parent, isMain);
    };

    try {
      const router = require(fileRoutesPath);
      await new Promise((resolve, reject) => {
        const app = express();
        app.use("/api/files", router);
        const server = http.createServer(app);
        server.listen(0, "127.0.0.1", async () => {
          try {
            const { port } = server.address();
            const ok = await request(port, "GET", "/api/files/assignment/asn-1", {
              "x-role": "teacher",
              "x-user": teacherId,
            });
            assert.equal(ok.status, 200);
            assert.match(ok.text, /assignment-body/);

            const denied = await request(port, "GET", "/api/files/assignment/asn-1", {
              "x-role": "teacher",
              "x-user": "other-teacher",
            });
            assert.equal(denied.status, 403);
            server.close(() => resolve());
          } catch (err) {
            server.close(() => reject(err));
          }
        });
      });
    } finally {
      Module._load = originalLoad;
    }
  });
});

describe("Vercel multer refuses durable upload without R2", () => {
  const prev = {};
  const multerPath = path.resolve(__dirname, "../middleware/multerMiddleware.js");

  beforeEach(() => {
    prev.VERCEL = process.env.VERCEL;
    prev.R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
    prev.R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
    prev.R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
    process.env.VERCEL = "1";
    delete process.env.R2_ACCOUNT_ID;
    delete process.env.R2_ACCESS_KEY_ID;
    delete process.env.R2_SECRET_ACCESS_KEY;
    clear(multerPath, storedFilesPath, objectStoragePath, uploadsPathUtil);
  });

  afterEach(() => {
    if (prev.VERCEL === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = prev.VERCEL;
    for (const k of ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"]) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
    clear(multerPath, storedFilesPath, objectStoragePath, uploadsPathUtil);
  });

  it("storage _handleFile callbacks with R2_NOT_CONFIGURED", async () => {
    const upload = require(multerPath);
    const storage = upload.storage;
    assert.ok(storage && typeof storage._handleFile === "function");

    await new Promise((resolve, reject) => {
      const { PassThrough } = require("stream");
      const stream = new PassThrough();
      storage._handleFile(
        { originalUrl: "/api/teacher/assignments" },
        { stream, originalname: "x.txt", mimetype: "text/plain" },
        (err) => {
          try {
            assert.ok(err);
            assert.equal(err.code, "R2_NOT_CONFIGURED");
            resolve();
          } catch (e) {
            reject(e);
          }
        }
      );
      stream.end(Buffer.from("payload"));
    });
  });
});
