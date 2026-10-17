/**
 * Isolated Vercel serverless compatibility checks.
 * Uses mocks only — never connects to MongoDB or writes production data.
 */
const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const fs = require("fs");
const os = require("os");
const Module = require("module");

const dbPath = path.resolve(__dirname, "../config/db.js");
const pushPath = path.resolve(__dirname, "../config/push.js");
const uploadsPathUtil = path.resolve(__dirname, "../utils/uploadsPath.js");

function clearModule(absPath) {
  delete require.cache[absPath];
}

describe("Vercel MongoDB connectDB", () => {
  const prev = {};

  beforeEach(() => {
    prev.VERCEL = process.env.VERCEL;
    prev.MONGO_URI = process.env.MONGO_URI;
    clearModule(dbPath);
    clearModule(path.resolve(__dirname, "../config/mongoDns.js"));
    delete global.__quickcheck_mongoose__;
  });

  afterEach(() => {
    if (prev.VERCEL === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = prev.VERCEL;
    if (prev.MONGO_URI === undefined) delete process.env.MONGO_URI;
    else process.env.MONGO_URI = prev.MONGO_URI;
    clearModule(dbPath);
    delete global.__quickcheck_mongoose__;
  });

  it("throws instead of process.exit when VERCEL=1 and MONGO_URI is missing", async () => {
    process.env.VERCEL = "1";
    delete process.env.MONGO_URI;

    const originalLoad = Module._load;
    Module._load = function (request, parent, isMain) {
      if (request === "mongoose") {
        return {
          connect: async () => {
            throw new Error("should not connect");
          },
        };
      }
      return originalLoad(request, parent, isMain);
    };

    try {
      const connectDB = require(dbPath);
      await assert.rejects(() => connectDB(), /MONGO_URI/);
    } finally {
      Module._load = originalLoad;
    }
  });

  it("reuses a cached connection across awaits", async () => {
    process.env.VERCEL = "1";
    process.env.MONGO_URI = "mongodb://127.0.0.1:27017/quickcheck_vercel_mock";

    let connectCalls = 0;
    const fakeConn = { fake: true };
    const originalLoad = Module._load;
    Module._load = function (request, parent, isMain) {
      if (request === "mongoose") {
        return {
          connect: async () => {
            connectCalls += 1;
            return fakeConn;
          },
        };
      }
      return originalLoad(request, parent, isMain);
    };

    try {
      const connectDB = require(dbPath);
      const a = await connectDB();
      const b = await connectDB();
      assert.equal(a, fakeConn);
      assert.equal(b, fakeConn);
      assert.equal(connectCalls, 1);
    } finally {
      Module._load = originalLoad;
    }
  });
});

describe("Vercel VAPID push config", () => {
  const prev = {};
  let tempDir = "";

  beforeEach(() => {
    prev.VERCEL = process.env.VERCEL;
    prev.VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
    prev.VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
    prev.cwd = process.cwd();
    clearModule(pushPath);
  });

  afterEach(() => {
    if (prev.VERCEL === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = prev.VERCEL;
    if (prev.VAPID_PUBLIC_KEY === undefined) delete process.env.VAPID_PUBLIC_KEY;
    else process.env.VAPID_PUBLIC_KEY = prev.VAPID_PUBLIC_KEY;
    if (prev.VAPID_PRIVATE_KEY === undefined) delete process.env.VAPID_PRIVATE_KEY;
    else process.env.VAPID_PRIVATE_KEY = prev.VAPID_PRIVATE_KEY;
    clearModule(pushPath);
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("loads keys from env without writing .vapid.json on Vercel", () => {
    process.env.VERCEL = "1";
    const webpush = require("web-push");
    // Real ECDH P-256 keys only — placeholders decode to the wrong length and
    // make setVapidDetails throw: "Vapid public key should be 65 bytes long...".
    const generated = webpush.generateVAPIDKeys();
    assert.equal(Buffer.from(generated.publicKey, "base64url").length, 65);
    assert.equal(Buffer.from(generated.privateKey, "base64url").length, 32);
    process.env.VAPID_PUBLIC_KEY = generated.publicKey;
    process.env.VAPID_PRIVATE_KEY = generated.privateKey;
    clearModule(pushPath);

    let writeCalls = 0;
    const originalWrite = fs.writeFileSync;
    fs.writeFileSync = function (...args) {
      writeCalls += 1;
      return originalWrite.apply(this, args);
    };

    try {
      const push = require(pushPath);
      assert.equal(push.publicKey, generated.publicKey);
      assert.equal(push.vapidConfigured, true);
      assert.equal(writeCalls, 0);
    } finally {
      fs.writeFileSync = originalWrite;
    }
  });

  it("does not write .vapid.json when Vercel env keys are missing", () => {
    process.env.VERCEL = "1";
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;

    let writeCalls = 0;
    const originalWrite = fs.writeFileSync;
    const originalRead = fs.readFileSync;
    fs.readFileSync = function (...args) {
      const target = String(args[0] || "");
      if (target.endsWith(".vapid.json")) {
        const err = new Error("ENOENT");
        err.code = "ENOENT";
        throw err;
      }
      return originalRead.apply(this, args);
    };
    fs.writeFileSync = function (...args) {
      writeCalls += 1;
      return originalWrite.apply(this, args);
    };

    try {
      const push = require(pushPath);
      assert.equal(push.vapidConfigured, false);
      assert.equal(push.publicKey, "");
      assert.equal(writeCalls, 0);
    } finally {
      fs.writeFileSync = originalWrite;
      fs.readFileSync = originalRead;
    }
  });
});

describe("upload path soft-fail on read-only root", () => {
  const prevUploads = process.env.UPLOADS_DIR;

  afterEach(() => {
    if (prevUploads === undefined) delete process.env.UPLOADS_DIR;
    else process.env.UPLOADS_DIR = prevUploads;
    clearModule(uploadsPathUtil);
  });

  it("ensureUploadSubdirs returns root without throwing when mkdir fails", () => {
    const blocked = path.join(os.tmpdir(), `qc-vercel-ro-${Date.now()}`, "nested");
    // Point at a path under a file (not a directory) so mkdir fails.
    const blockerFile = path.join(os.tmpdir(), `qc-vercel-blocker-${Date.now()}.txt`);
    fs.writeFileSync(blockerFile, "x");
    process.env.UPLOADS_DIR = path.join(blockerFile, "uploads-should-fail");
    clearModule(uploadsPathUtil);

    const { ensureUploadSubdirs, getUploadsRoot } = require(uploadsPathUtil);
    const root = ensureUploadSubdirs();
    assert.equal(root, getUploadsRoot());
    fs.unlinkSync(blockerFile);
    void blocked;
  });
});
