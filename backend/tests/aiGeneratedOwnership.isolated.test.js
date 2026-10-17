/**
 * Isolated tests for AI-generated artifact ownership on download.
 * Never connects to MongoDB, R2, or production storage.
 */
const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const fs = require("fs");
const os = require("os");
const Module = require("module");
const { PassThrough } = require("stream");

const aiControllerPath = path.resolve(__dirname, "../controllers/aiController.js");
const storedFilesPath = path.resolve(__dirname, "../utils/storedFiles.js");
const uploadsPathUtil = path.resolve(__dirname, "../utils/uploadsPath.js");
const objectStoragePath = path.resolve(__dirname, "../utils/objectStorage.js");

function clear(...paths) {
  for (const p of paths) delete require.cache[p];
}

function clearAiStack() {
  clear(aiControllerPath, storedFilesPath, uploadsPathUtil, objectStoragePath);
}

function stubModelsAndGemini(originalLoad, geminiImpl) {
  return function patchedLoad(request, parent, isMain) {
    if (request === "../services/geminiService" || request.includes("geminiService")) {
      return {
        askQuickCheckAI:
          geminiImpl ||
          (async () => ({ answer: "ok", artifacts: [] })),
      };
    }
    if (request === "../models/Assignment" || request.includes(`${path.sep}models${path.sep}Assignment`)) {
      return { find: () => ({ select: () => Promise.resolve([]) }) };
    }
    if (request === "../models/Submission" || request.includes(`${path.sep}models${path.sep}Submission`)) {
      return {
        find: () => ({
          select: () => ({ populate: () => Promise.resolve([]) }),
          populate: () => Promise.resolve([]),
        }),
      };
    }
    if (request === "../models/User" || request.includes(`${path.sep}models${path.sep}User`)) {
      return { find: () => ({ select: () => Promise.resolve([]) }) };
    }
    if (request === "../services/plagiarismService" || request.includes("plagiarismService")) {
      return { extractText: async () => "" };
    }
    return originalLoad(request, parent, isMain);
  };
}

function loadAiController(geminiImpl, extraStub) {
  clearAiStack();
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (extraStub) {
      const hit = extraStub(request);
      if (hit !== undefined) return hit;
    }
    return stubModelsAndGemini(originalLoad, geminiImpl)(request, parent, isMain);
  };
  try {
    return {
      controller: require(aiControllerPath),
      restore() {
        Module._load = originalLoad;
        clearAiStack();
      },
    };
  } catch (error) {
    Module._load = originalLoad;
    throw error;
  }
}

function mockRes() {
  let statusCode = 200;
  let body = null;
  let downloadArgs = null;
  const headers = {};
  return {
    status(code) {
      statusCode = code;
      return this;
    },
    json(payload) {
      body = payload;
      return this;
    },
    setHeader(k, v) {
      headers[k] = v;
    },
    download(localPath, name) {
      downloadArgs = { localPath, name };
      return this;
    },
    end() {},
    get statusCode() {
      return statusCode;
    },
    get body() {
      return body;
    },
    get headers() {
      return headers;
    },
    get downloadArgs() {
      return downloadArgs;
    },
  };
}

describe("AI generated artifact ownership", () => {
  let tempRoot;
  const prev = {};

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "qc-ai-own-"));
    fs.mkdirSync(path.join(tempRoot, "generated"), { recursive: true });
    prev.VERCEL = process.env.VERCEL;
    prev.UPLOADS_DIR = process.env.UPLOADS_DIR;
    delete process.env.VERCEL;
    process.env.UPLOADS_DIR = tempRoot;
    clearAiStack();
  });

  afterEach(() => {
    if (prev.VERCEL === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = prev.VERCEL;
    if (prev.UPLOADS_DIR === undefined) delete process.env.UPLOADS_DIR;
    else process.env.UPLOADS_DIR = prev.UPLOADS_DIR;
    clearAiStack();
    try {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    } catch (_) {}
  });

  it("creator can download their own generated artifact", async () => {
    const ownerId = "aaaaaaaaaaaaaaaaaaaaaaaa";
    const { controller, restore } = loadAiController(async () => ({
      answer: "Here is your note.",
      artifacts: [{ type: "text", name: "note.txt", content: "owner-secret" }],
    }));
    try {
      const { chat, downloadGenerated } = controller;
      let chatBody = null;
      await chat(
        { user: { _id: ownerId, role: "teacher", name: "T" }, body: { question: "make a note" }, files: [] },
        {
          status(code) {
            this._status = code;
            return this;
          },
          json(payload) {
            chatBody = payload;
            return this;
          },
        }
      );
      assert.ok(chatBody?.artifacts?.length >= 1);
      const downloadUrl = chatBody.artifacts[0].downloadUrl;
      assert.match(downloadUrl, /^\/api\/ai\/generated\//);
      const fileName = decodeURIComponent(downloadUrl.split("/").pop());
      assert.ok(fs.existsSync(path.join(tempRoot, "generated", fileName)));
      assert.ok(fs.existsSync(path.join(tempRoot, "generated", `${fileName}.owner.json`)));
      const meta = JSON.parse(
        fs.readFileSync(path.join(tempRoot, "generated", `${fileName}.owner.json`), "utf8")
      );
      assert.equal(meta.ownerId, ownerId);

      const res = mockRes();
      await downloadGenerated(
        { params: { name: fileName }, user: { _id: ownerId, role: "teacher" } },
        res
      );
      assert.equal(res.statusCode, 200);
      assert.equal(res.body, null);
      assert.ok(res.downloadArgs?.localPath);
      assert.match(fs.readFileSync(res.downloadArgs.localPath, "utf8"), /owner-secret/);
    } finally {
      restore();
    }
  });

  it("a different authenticated user cannot download it", async () => {
    const ownerId = "bbbbbbbbbbbbbbbbbbbbbbbb";
    const otherId = "cccccccccccccccccccccccc";
    const fileName = `${Date.now()}-abc123-secret.txt`;
    fs.writeFileSync(path.join(tempRoot, "generated", fileName), "private-for-owner");
    fs.writeFileSync(
      path.join(tempRoot, "generated", `${fileName}.owner.json`),
      JSON.stringify({ ownerId })
    );

    const { controller, restore } = loadAiController();
    try {
      const res = mockRes();
      await controller.downloadGenerated(
        { params: { name: fileName }, user: { _id: otherId, role: "teacher" } },
        res
      );
      assert.equal(res.statusCode, 404);
      assert.equal(res.body?.message, "Generated file not found.");
      assert.equal(res.downloadArgs, null);
    } finally {
      restore();
    }
  });

  it("client-written downloadUrl or filename metadata cannot bypass ownership", async () => {
    const realOwner = "dddddddddddddddddddddddd";
    const attacker = "eeeeeeeeeeeeeeeeeeeeeeee";
    const fileName = `${Date.now()}-xyz789-leaked.txt`;
    fs.writeFileSync(path.join(tempRoot, "generated", fileName), "should-not-leak");
    fs.writeFileSync(
      path.join(tempRoot, "generated", `${fileName}.owner.json`),
      JSON.stringify({ ownerId: realOwner })
    );

    // Simulate AIChat upsert / client crafting a downloadUrl pointing at another's file,
    // and even forging a client-side "ownerId" field — server must ignore both.
    const forgedClientArtifact = {
      name: "leaked.txt",
      downloadUrl: `/api/ai/generated/${fileName}`,
      ownerId: attacker,
    };
    assert.equal(forgedClientArtifact.ownerId, attacker);

    const { controller, restore } = loadAiController();
    try {
      const res = mockRes();
      const nameFromClientUrl = path.basename(forgedClientArtifact.downloadUrl);
      await controller.downloadGenerated(
        { params: { name: nameFromClientUrl }, user: { _id: attacker, role: "teacher" } },
        res
      );
      assert.equal(res.statusCode, 404);
      assert.equal(res.body?.message, "Generated file not found.");

      const metaRes = mockRes();
      await controller.downloadGenerated(
        { params: { name: `${fileName}.owner.json` }, user: { _id: realOwner, role: "teacher" } },
        metaRes
      );
      assert.equal(metaRes.statusCode, 404);
    } finally {
      restore();
    }
  });

  it("legacy artifacts without trusted ownership are denied safely", async () => {
    const legacyName = `${Date.now()}-legacy1-old.txt`;
    fs.writeFileSync(path.join(tempRoot, "generated", legacyName), "legacy-bytes");

    const { controller, restore } = loadAiController();
    try {
      const res = mockRes();
      await controller.downloadGenerated(
        { params: { name: legacyName }, user: { _id: "ffffffffffffffffffffffff", role: "admin" } },
        res
      );
      assert.equal(res.statusCode, 404);
      assert.equal(res.body?.message, "Generated file not found.");
      assert.equal(res.downloadArgs, null);
    } finally {
      restore();
    }
  });

  it("existing AI artifact generation still works and records trusted owner", async () => {
    const ownerId = "111111111111111111111111";
    const { controller, restore } = loadAiController(async () => ({
      answer: "Done.",
      artifacts: [
        { type: "text", name: "a.txt", content: "one" },
        { type: "text", name: "b.txt", content: "two" },
      ],
    }));
    try {
      let body = null;
      await controller.chat(
        { user: { _id: ownerId, role: "teacher", name: "T" }, body: { question: "files please" }, files: [] },
        { json(payload) { body = payload; } }
      );
      assert.equal(body.answer, "Done.");
      assert.equal(body.artifacts.length, 2);
      for (const art of body.artifacts) {
        assert.match(art.downloadUrl, /^\/api\/ai\/generated\//);
        const name = decodeURIComponent(art.downloadUrl.split("/").pop());
        const metaPath = path.join(tempRoot, "generated", `${name}.owner.json`);
        assert.ok(fs.existsSync(metaPath));
        assert.equal(JSON.parse(fs.readFileSync(metaPath, "utf8")).ownerId, ownerId);
      }
    } finally {
      restore();
    }
  });

  it("R2 object-storage mode writes owner sidecar via storedFiles (Vercel-compatible)", async () => {
    const ownerId = "222222222222222222222222";
    const objects = new Map();
    process.env.VERCEL = "1";

    const { controller, restore } = loadAiController(
      async () => ({
        answer: "ok",
        artifacts: [{ type: "text", name: "r2.txt", content: "r2-bytes" }],
      }),
      (request) => {
        if (request === "../utils/storedFiles" || request.includes(`${path.sep}utils${path.sep}storedFiles`)) {
          return {
            usesObjectStorage: () => true,
            writeBuffer: async (stored, buf) => {
              objects.set(String(stored).replace(/\\/g, "/"), Buffer.from(buf));
              return stored;
            },
            exists: async (stored) => objects.has(String(stored).replace(/\\/g, "/")),
            readUtf8: async (stored) => {
              const b = objects.get(String(stored).replace(/\\/g, "/"));
              if (!b) throw new Error("missing");
              return b.toString("utf8");
            },
            openDownloadStream: async (stored) => {
              const b = objects.get(String(stored).replace(/\\/g, "/"));
              if (!b) {
                const err = new Error("ENOENT");
                err.code = "ENOENT";
                throw err;
              }
              const stream = new PassThrough();
              stream.end(b);
              return { stream, localPath: null, contentType: "application/octet-stream" };
            },
            getUploadsRoot: () => tempRoot,
          };
        }
        return undefined;
      }
    );

    try {
      let body = null;
      await controller.chat(
        { user: { _id: ownerId, role: "teacher", name: "T" }, body: { question: "r2 note" }, files: [] },
        { json(payload) { body = payload; } }
      );
      assert.ok(body.artifacts?.[0]?.downloadUrl);
      const fileName = decodeURIComponent(body.artifacts[0].downloadUrl.split("/").pop());
      assert.ok(objects.has(`uploads/generated/${fileName}`));
      assert.ok(objects.has(`uploads/generated/${fileName}.owner.json`));
      assert.equal(
        JSON.parse(objects.get(`uploads/generated/${fileName}.owner.json`).toString("utf8")).ownerId,
        ownerId
      );

      const collected = [];
      const pipeRes = new PassThrough();
      pipeRes.headersSent = false;
      pipeRes.setHeader = () => {};
      pipeRes.status = function status(code) {
        this._status = code;
        return this;
      };
      pipeRes.json = function json(payload) {
        this._body = payload;
        return this;
      };
      pipeRes.on("data", (c) => collected.push(c));
      const done = new Promise((resolve, reject) => {
        pipeRes.on("finish", resolve);
        pipeRes.on("error", reject);
      });

      await controller.downloadGenerated(
        { params: { name: fileName }, user: { _id: ownerId } },
        pipeRes
      );
      await done;
      assert.equal(pipeRes._status || 200, 200);
      assert.match(Buffer.concat(collected).toString("utf8"), /r2-bytes/);

      const denied = mockRes();
      await controller.downloadGenerated(
        { params: { name: fileName }, user: { _id: "333333333333333333333333" } },
        denied
      );
      assert.equal(denied.statusCode, 404);
    } finally {
      restore();
    }
  });

  it("Hostinger local-disk mode keeps artifact + owner sidecar under uploads/generated", async () => {
    const ownerId = "444444444444444444444444";
    const { controller, restore } = loadAiController(async () => ({
      answer: "disk",
      artifacts: [{ type: "text", name: "disk.txt", content: "disk-bytes" }],
    }));
    try {
      assert.equal(process.env.VERCEL, undefined);
      const storedFiles = require(storedFilesPath);
      assert.equal(storedFiles.usesObjectStorage(), false);

      let body = null;
      await controller.chat(
        { user: { _id: ownerId, role: "teacher", name: "T" }, body: { question: "disk" }, files: [] },
        { json(payload) { body = payload; } }
      );
      const fileName = decodeURIComponent(body.artifacts[0].downloadUrl.split("/").pop());
      const artifactPath = path.join(tempRoot, "generated", fileName);
      const metaPath = path.join(tempRoot, "generated", `${fileName}.owner.json`);
      assert.ok(fs.existsSync(artifactPath));
      assert.ok(fs.existsSync(metaPath));

      const res = mockRes();
      await controller.downloadGenerated(
        { params: { name: fileName }, user: { _id: ownerId } },
        res
      );
      assert.equal(res.statusCode, 200);
      assert.ok(res.downloadArgs?.localPath);
      assert.equal(
        path.normalize(res.downloadArgs.localPath),
        path.normalize(artifactPath)
      );
    } finally {
      restore();
    }
  });
});
