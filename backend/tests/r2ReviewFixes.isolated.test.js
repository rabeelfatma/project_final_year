/**
 * Focused isolated tests for R2/Vercel review fixes.
 * Never connects to MongoDB, R2, or production storage.
 */
const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const Module = require("module");
const http = require("http");
const express = require("express");
const { PassThrough } = require("stream");

const objectStoragePath = path.resolve(__dirname, "../utils/objectStorage.js");
const storedFilesPath = path.resolve(__dirname, "../utils/storedFiles.js");
const uploadsPathUtil = path.resolve(__dirname, "../utils/uploadsPath.js");
const multerPath = path.resolve(__dirname, "../middleware/multerMiddleware.js");
const evaluationControllerPath = path.resolve(
  __dirname,
  "../controllers/evaluationController.js"
);
const teacherControllerPath = path.resolve(
  __dirname,
  "../controllers/teacherController.js"
);
const submissionModelPath = path.resolve(__dirname, "../models/Submission.js");
const aiControllerPath = path.resolve(__dirname, "../controllers/aiController.js");

function clear(...paths) {
  for (const p of paths) delete require.cache[p];
}

function request(port, method, urlPath, { headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: "127.0.0.1", port, path: urlPath, method, headers },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try {
            json = JSON.parse(text);
          } catch (_) {}
          resolve({ status: res.statusCode, text, json });
        });
      }
    );
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

describe("R2 missing-config HTTP 503 via Express error middleware", () => {
  it("appFull.js registers R2_NOT_CONFIGURED → 503 middleware after routes", () => {
    const appFull = require("fs").readFileSync(
      path.resolve(__dirname, "../appFull.js"),
      "utf8"
    );
    assert.match(appFull, /err\.code === ["']R2_NOT_CONFIGURED["']/);
    assert.match(appFull, /status\(503\)/);
    const routesIdx = appFull.indexOf('app.use("/api/ai"');
    const errIdx = appFull.indexOf('err.code === "R2_NOT_CONFIGURED"');
    assert.ok(routesIdx >= 0 && errIdx > routesIdx);
  });

  it("returns 503 JSON for Multer errors with R2_NOT_CONFIGURED", async () => {
    const app = express();
    app.post("/api/teacher/assignments", (req, res, next) => {
      const err = new Error(
        "Cloudflare R2 is required on Vercel but is not configured. Missing: R2_ACCOUNT_ID."
      );
      err.code = "R2_NOT_CONFIGURED";
      err.statusCode = 503;
      next(err);
    });
    app.use((err, req, res, next) => {
      if (err && err.code === "R2_NOT_CONFIGURED") {
        return res.status(503).json({
          message:
            err.message ||
            "Cloudflare R2 is required on Vercel but is not configured.",
        });
      }
      return next(err);
    });

    const server = app.listen(0);
    const port = server.address().port;
    try {
      const res = await request(port, "POST", "/api/teacher/assignments");
      assert.equal(res.status, 503);
      assert.match(res.json.message, /R2/i);
      assert.doesNotMatch(res.json.message, /secret/i);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

describe("Ephemeral AI uploads without R2", () => {
  const prev = {};

  beforeEach(() => {
    prev.VERCEL = process.env.VERCEL;
    for (const k of [
      "R2_ACCOUNT_ID",
      "R2_ACCESS_KEY_ID",
      "R2_SECRET_ACCESS_KEY",
      "R2_BUCKET_NAME",
      "R2_ENDPOINT",
    ]) {
      prev[k] = process.env[k];
      delete process.env[k];
    }
    process.env.VERCEL = "1";
    clear(multerPath, storedFilesPath, objectStoragePath, uploadsPathUtil);
  });

  afterEach(() => {
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
    clear(multerPath, storedFilesPath, objectStoragePath, uploadsPathUtil);
  });

  it("isEphemeralUpload detects AI chat and evaluate-ai routes", () => {
    const upload = require(multerPath);
    assert.equal(upload.isEphemeralUpload({ originalUrl: "/api/ai/chat" }), true);
    assert.equal(
      upload.isEphemeralUpload({ originalUrl: "/api/teacher/evaluate-ai" }),
      true
    );
    assert.equal(
      upload.isEphemeralUpload({ originalUrl: "/api/teacher/assignments" }),
      false
    );
  });

  it("ephemeral /api/ai/chat upload succeeds in memory without R2", async () => {
    const upload = require(multerPath);
    const storage = upload.r2AwareStorage;
    await new Promise((resolve, reject) => {
      const stream = new PassThrough();
      storage._handleFile(
        { originalUrl: "/api/ai/chat" },
        { stream, originalname: "notes.txt", mimetype: "text/plain" },
        (err, info) => {
          try {
            assert.ifError(err);
            assert.equal(info.storage, "memory");
            assert.ok(Buffer.isBuffer(info.buffer));
            assert.equal(info.buffer.toString("utf8"), "ephemeral-ok");
            resolve();
          } catch (e) {
            reject(e);
          }
        }
      );
      stream.end(Buffer.from("ephemeral-ok"));
    });
  });

  it("durable upload still fails with R2_NOT_CONFIGURED", async () => {
    const upload = require(multerPath);
    const storage = upload.r2AwareStorage;
    await new Promise((resolve, reject) => {
      const stream = new PassThrough();
      storage._handleFile(
        { originalUrl: "/api/teacher/assignments" },
        { stream, originalname: "a.txt", mimetype: "text/plain" },
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
      stream.end(Buffer.from("x"));
    });
  });
});

describe("Multer oversized upload settles callback once", () => {
  const prev = {};

  beforeEach(() => {
    prev.VERCEL = process.env.VERCEL;
    process.env.VERCEL = "1";
    process.env.R2_ACCOUNT_ID = "acc";
    process.env.R2_ACCESS_KEY_ID = "key";
    process.env.R2_SECRET_ACCESS_KEY = "secret";
    process.env.R2_BUCKET_NAME = "quickcheck-hub-files";
    process.env.R2_ENDPOINT = "https://acc.r2.cloudflarestorage.com";
    clear(multerPath, storedFilesPath, objectStoragePath, uploadsPathUtil);
  });

  afterEach(() => {
    if (prev.VERCEL === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = prev.VERCEL;
    for (const k of [
      "R2_ACCOUNT_ID",
      "R2_ACCESS_KEY_ID",
      "R2_SECRET_ACCESS_KEY",
      "R2_BUCKET_NAME",
      "R2_ENDPOINT",
    ]) {
      delete process.env[k];
    }
    clear(multerPath, storedFilesPath, objectStoragePath, uploadsPathUtil);
  });

  it("oversized stream aborts and invokes callback once with error", async () => {
    const upload = require(multerPath);
    const storage = upload.r2AwareStorage;
    let calls = 0;
    let lastErr = null;
    let lastInfo = null;

    await new Promise((resolve, reject) => {
      const stream = new PassThrough();
      storage._handleFile(
        { originalUrl: "/api/ai/chat" },
        { stream, originalname: "big.txt", mimetype: "text/plain" },
        (err, info) => {
          calls += 1;
          lastErr = err;
          lastInfo = info;
          // Allow a short window for a duplicate callback / end race.
          setTimeout(() => {
            try {
              assert.equal(calls, 1);
              assert.ok(lastErr);
              assert.match(String(lastErr.message), /too large/i);
              assert.equal(lastInfo, undefined);
              resolve();
            } catch (e) {
              reject(e);
            }
          }, 50);
        }
      );
      // Push more than the 4MB Vercel limit in two chunks so "end" could race.
      const chunk = Buffer.alloc(3 * 1024 * 1024, 0x61);
      stream.write(chunk);
      stream.write(chunk);
      stream.end(Buffer.alloc(1024, 0x62));
    });
  });
});

describe("Submission content and evaluation R2_NOT_CONFIGURED → 503", () => {
  it("getSubmissionContent propagates R2_NOT_CONFIGURED as HTTP 503", () => {
    const src = require("fs").readFileSync(teacherControllerPath, "utf8");
    const fnStart = src.indexOf("exports.getSubmissionContent");
    assert.ok(fnStart >= 0);
    const fnBody = src.slice(fnStart, fnStart + 2500);
    assert.match(fnBody, /R2_NOT_CONFIGURED/);
    assert.match(fnBody, /status\(503\)/);
    assert.doesNotMatch(
      fnBody,
      /catch\s*\(\s*_\s*\)\s*\{\s*\/\*\s*keep answerText only\s*\*\//
    );
  });

  it("evaluateWithGemini returns 503 for missing R2 instead of 200 Failed rows", () => {
    const src = require("fs").readFileSync(teacherControllerPath, "utf8");
    const fnStart = src.indexOf("exports.evaluateWithGemini");
    assert.ok(fnStart >= 0);
    const fnBody = src.slice(fnStart, src.indexOf("exports.evaluateAssignment", fnStart));
    assert.match(fnBody, /R2_NOT_CONFIGURED/);
    assert.match(fnBody, /status\(503\)/);
    assert.doesNotMatch(
      fnBody,
      /results\.push\(\s*\{\s*id,\s*status:\s*"Failed",\s*error:\s*matErr\.message/
    );
  });

  it("evaluationController.evaluateAssignment returns 503 when R2 missing", async () => {
    clear(evaluationControllerPath, submissionModelPath, storedFilesPath);
    const originalLoad = Module._load;
    Module._load = function (request, parent, isMain) {
      const normalized = String(request).replace(/\\/g, "/");
      if (normalized.endsWith("models/Submission") || normalized === "../models/Submission") {
        return {
          findOne: () => ({
            populate: async () => ({
              _id: "s1",
              file: "uploads/submissions/f.txt",
              assignment: { points: 10, title: "T" },
              totalMarks: 10,
            }),
          }),
          findOneAndUpdate: async () => ({}),
        };
      }
      if (normalized.endsWith("utils/storedFiles") || normalized === "../utils/storedFiles") {
        return {
          exists: async () => true,
          materialize: async () => {
            const err = new Error(
              "Cloudflare R2 is required on Vercel but is not configured."
            );
            err.code = "R2_NOT_CONFIGURED";
            throw err;
          },
        };
      }
      if (
        normalized.endsWith("services/geminiService") ||
        normalized === "../services/geminiService"
      ) {
        return { checkAssignment: async () => ({ score: 1, feedback: "ok" }) };
      }
      return originalLoad(request, parent, isMain);
    };

    try {
      const { evaluateAssignment } = require(evaluationControllerPath);
      const req = {
        body: { submissionIds: ["s1"], teacherInstructions: "Grade carefully." },
        user: { _id: "t1" },
      };
      let statusCode = 200;
      let body = null;
      const res = {
        status(code) {
          statusCode = code;
          return this;
        },
        json(payload) {
          body = payload;
          return this;
        },
      };
      await evaluateAssignment(req, res);
      assert.equal(statusCode, 503);
      assert.match(String(body?.message || ""), /R2/i);
    } finally {
      Module._load = originalLoad;
      clear(evaluationControllerPath, submissionModelPath, storedFilesPath);
    }
  });
});

describe("Generated artifact download authorization", () => {
  it("downloadGenerated enforces server-side owner sidecar (not AIChat client metadata)", () => {
    const src = require("fs").readFileSync(aiControllerPath, "utf8");
    const routes = require("fs").readFileSync(
      path.resolve(__dirname, "../routes/aiRoutes.js"),
      "utf8"
    );
    const dlStart = src.indexOf("exports.downloadGenerated");
    assert.ok(dlStart >= 0);
    const dlBody = src.slice(dlStart);
    assert.match(routes, /protect,\s*downloadGenerated/);
    assert.doesNotMatch(dlBody, /AIChat/);
    assert.match(src, /writeOwnerMeta/);
    assert.match(src, /\.owner\.json/);
    assert.match(dlBody, /readTrustedOwnerId/);
    assert.match(dlBody, /String\(req\.user\._id\) !== ownerId/);
    assert.match(src, /buildArtifacts\(result\.artifacts \|\| \[\], req\.user\._id\)/);
  });
});
