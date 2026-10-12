/**
 * QC-10E — Isolated academic file access tests.
 * Uses a temporary uploads root; never touches real backend/uploads academic files.
 */
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const Module = require("module");
const path = require("path");
const fs = require("fs");
const os = require("os");
const http = require("http");
const express = require("express");

const uploadsPathUtil = path.resolve(__dirname, "../utils/uploadsPath.js");
const fileRoutesPath = path.resolve(__dirname, "../routes/fileRoutes.js");
const fileControllerPath = path.resolve(__dirname, "../controllers/fileController.js");
const authMiddlewarePath = path.resolve(__dirname, "../middleware/authMiddleware.js");
const assignmentModelPath = path.resolve(__dirname, "../models/Assignment.js");
const submissionModelPath = path.resolve(__dirname, "../models/Submission.js");
const messageModelPath = path.resolve(__dirname, "../models/Message.js");
const plagiarismServicePath = path.resolve(__dirname, "../services/plagiarismService.js");

let tempRoot;
let prevUploadsDir;

function resetModules() {
  [
    uploadsPathUtil,
    fileRoutesPath,
    fileControllerPath,
    authMiddlewarePath,
    assignmentModelPath,
    submissionModelPath,
    messageModelPath,
  ].forEach((p) => delete require.cache[p]);
}

function withServer(mount, run) {
  return new Promise((resolve, reject) => {
    const app = express();
    mount(app);
    const server = http.createServer(app);
    server.listen(0, "127.0.0.1", async () => {
      const { port } = server.address();
      try {
        await run(port);
        server.close(() => resolve());
      } catch (err) {
        server.close(() => reject(err));
      }
    });
  });
}

function request(port, method, urlPath, { headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const data = body != null ? Buffer.from(body) : null;
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: urlPath,
        method,
        headers: {
          ...(data ? { "Content-Length": data.length, "Content-Type": "application/json" } : {}),
          ...headers,
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const buf = Buffer.concat(chunks);
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: buf,
            text: buf.toString("utf8"),
          });
        });
      }
    );
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

function loadFileRouter({
  authedUser = null,
  assignment = null,
  submission = null,
  message = null,
} = {}) {
  resetModules();
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (
      request === "../middleware/authMiddleware" ||
      request.endsWith(`${path.sep}middleware${path.sep}authMiddleware.js`)
    ) {
      return {
        protect: (req, res, next) => {
          if (!authedUser) {
            return res.status(401).json({ message: "No token provided (Access Denied)" });
          }
          req.user = authedUser;
          return next();
        },
        authorize: () => (req, res, next) => next(),
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
      return {
        findById: async () => submission,
      };
    }
    if (
      request === "../models/Message" ||
      request.endsWith(`${path.sep}models${path.sep}Message.js`)
    ) {
      return {
        findById: async () => message,
      };
    }
    if (
      request === "../services/plagiarismService" ||
      request.endsWith(`${path.sep}services${path.sep}plagiarismService.js`)
    ) {
      return { extractText: async () => "preview text" };
    }
    return originalLoad(request, parent, isMain);
  };
  try {
    return require(fileRoutesPath);
  } finally {
    Module._load = originalLoad;
  }
}

before(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "qc10e-uploads-"));
  for (const name of ["assignments", "submissions", "profilePictures", "messages"]) {
    fs.mkdirSync(path.join(tempRoot, name), { recursive: true });
  }
  fs.writeFileSync(path.join(tempRoot, "assignments", "a1.txt"), "assignment-body");
  fs.writeFileSync(path.join(tempRoot, "submissions", "s1.txt"), "submission-body");
  fs.writeFileSync(path.join(tempRoot, "profilePictures", "avatar.png"), "fake-png");
  prevUploadsDir = process.env.UPLOADS_DIR;
  process.env.UPLOADS_DIR = tempRoot;
  resetModules();
});

after(() => {
  if (prevUploadsDir === undefined) delete process.env.UPLOADS_DIR;
  else process.env.UPLOADS_DIR = prevUploadsDir;
  resetModules();
  try {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  } catch (_) {}
});

describe("uploadsPath path confinement", () => {
  it("resolves stored relative upload paths under UPLOADS_DIR", () => {
    resetModules();
    const { resolveStoredUploadPath, getUploadsRoot } = require(uploadsPathUtil);
    assert.equal(getUploadsRoot(), path.resolve(tempRoot));
    const target = resolveStoredUploadPath("uploads/assignments/a1.txt");
    assert.equal(target, path.join(path.resolve(tempRoot), "assignments", "a1.txt"));
    assert.equal(fs.readFileSync(target, "utf8"), "assignment-body");
  });

  it("rejects path traversal and absolute escapes", () => {
    resetModules();
    const { resolveStoredUploadPath } = require(uploadsPathUtil);
    assert.throws(() => resolveStoredUploadPath("uploads/../package.json"));
    assert.throws(() => resolveStoredUploadPath("uploads/assignments/../../package.json"));
    assert.throws(() => resolveStoredUploadPath("uploads/assignments/../../../etc/passwd"));
    assert.throws(() => resolveStoredUploadPath("/etc/passwd"));
  });
});

describe("public static academic uploads blocked", () => {
  it("denies unauthenticated /uploads/assignments and /uploads/submissions", async () => {
    resetModules();
    const { configureUploadStatic } = require(uploadsPathUtil);
    await withServer(
      (app) => {
        configureUploadStatic(app);
      },
      async (port) => {
        const a = await request(port, "GET", "/uploads/assignments/a1.txt");
        assert.equal(a.status, 401);
        const s = await request(port, "GET", "/uploads/submissions/s1.txt");
        assert.equal(s.status, 401);
      }
    );
  });

  it("still serves profile pictures from the narrow static mount", async () => {
    resetModules();
    const { configureUploadStatic } = require(uploadsPathUtil);
    await withServer(
      (app) => {
        configureUploadStatic(app);
      },
      async (port) => {
        const r = await request(port, "GET", "/uploads/profilePictures/avatar.png");
        assert.equal(r.status, 200);
        assert.equal(r.text, "fake-png");
      }
    );
  });
});

describe("authenticated file routes authorization", () => {
  const assignmentActive = {
    _id: "asn1",
    teacher: "teacher-owner",
    status: "active",
    file: "uploads/assignments/a1.txt",
    originalFileName: "a1.txt",
    fileMimeType: "text/plain",
  };
  const assignmentDeactive = { ...assignmentActive, status: "deactive" };
  const submissionRow = {
    _id: "sub1",
    student: "student-owner",
    teacherId: "teacher-owner",
    file: "uploads/submissions/s1.txt",
    originalFileName: "s1.txt",
    fileMimeType: "text/plain",
  };

  it("rejects file download without authentication middleware bypass", async () => {
    const router = loadFileRouter({ authedUser: null, assignment: assignmentActive });
    await withServer(
      (app) => app.use("/api/files", router),
      async (port) => {
        const r = await request(port, "GET", "/api/files/assignment/asn1");
        assert.equal(r.status, 401);
      }
    );
  });

  it("allows authorized student to download an active assignment file", async () => {
    const router = loadFileRouter({
      authedUser: { _id: "student-1", role: "student" },
      assignment: assignmentActive,
    });
    await withServer(
      (app) => app.use("/api/files", router),
      async (port) => {
        const r = await request(port, "GET", "/api/files/assignment/asn1");
        assert.equal(r.status, 200);
        assert.equal(r.text, "assignment-body");
      }
    );
  });

  it("denies student access to deactive assignment files", async () => {
    const router = loadFileRouter({
      authedUser: { _id: "student-1", role: "student" },
      assignment: assignmentDeactive,
    });
    await withServer(
      (app) => app.use("/api/files", router),
      async (port) => {
        const r = await request(port, "GET", "/api/files/assignment/asn1");
        assert.equal(r.status, 403);
      }
    );
  });

  it("denies unauthorized teacher access to another teacher's assignment", async () => {
    const router = loadFileRouter({
      authedUser: { _id: "other-teacher", role: "teacher" },
      assignment: assignmentActive,
    });
    await withServer(
      (app) => app.use("/api/files", router),
      async (port) => {
        const r = await request(port, "GET", "/api/files/assignment/asn1");
        assert.equal(r.status, 403);
      }
    );
  });

  it("allows owning teacher to download assignment and submission", async () => {
    const router = loadFileRouter({
      authedUser: { _id: "teacher-owner", role: "teacher" },
      assignment: assignmentActive,
      submission: submissionRow,
    });
    await withServer(
      (app) => app.use("/api/files", router),
      async (port) => {
        const a = await request(port, "GET", "/api/files/assignment/asn1");
        assert.equal(a.status, 200);
        const s = await request(port, "GET", "/api/files/submission/sub1");
        assert.equal(s.status, 200);
        assert.equal(s.text, "submission-body");
      }
    );
  });

  it("denies student access to another student's submission", async () => {
    const router = loadFileRouter({
      authedUser: { _id: "other-student", role: "student" },
      submission: submissionRow,
    });
    await withServer(
      (app) => app.use("/api/files", router),
      async (port) => {
        const r = await request(port, "GET", "/api/files/submission/sub1");
        assert.equal(r.status, 403);
      }
    );
  });

  it("allows owning student to download their submission", async () => {
    const router = loadFileRouter({
      authedUser: { _id: "student-owner", role: "student" },
      submission: submissionRow,
    });
    await withServer(
      (app) => app.use("/api/files", router),
      async (port) => {
        const r = await request(port, "GET", "/api/files/submission/sub1");
        assert.equal(r.status, 200);
        assert.equal(r.text, "submission-body");
      }
    );
  });

  it("allows admin download following existing admin policy", async () => {
    const router = loadFileRouter({
      authedUser: { _id: "admin-1", role: "admin" },
      assignment: assignmentActive,
      submission: submissionRow,
    });
    await withServer(
      (app) => app.use("/api/files", router),
      async (port) => {
        const a = await request(port, "GET", "/api/files/assignment/asn1");
        assert.equal(a.status, 200);
        const s = await request(port, "GET", "/api/files/submission/sub1");
        assert.equal(s.status, 200);
      }
    );
  });

  it("handles missing files safely without leaking filesystem paths", async () => {
    const router = loadFileRouter({
      authedUser: { _id: "teacher-owner", role: "teacher" },
      assignment: {
        ...assignmentActive,
        file: "uploads/assignments/does-not-exist.txt",
      },
    });
    await withServer(
      (app) => app.use("/api/files", router),
      async (port) => {
        const r = await request(port, "GET", "/api/files/assignment/asn1");
        assert.equal(r.status, 404);
        assert.match(r.text, /File not found/i);
        assert.doesNotMatch(r.text, /qc10e-uploads|C:\\\\|\/tmp\//i);
      }
    );
  });

  it("rejects stored path traversal via file API metadata", async () => {
    const router = loadFileRouter({
      authedUser: { _id: "teacher-owner", role: "teacher" },
      assignment: {
        ...assignmentActive,
        file: "uploads/assignments/../../package.json",
      },
    });
    await withServer(
      (app) => app.use("/api/files", router),
      async (port) => {
        const r = await request(port, "GET", "/api/files/assignment/asn1");
        assert.equal(r.status, 400);
        assert.match(r.text, /Invalid stored file path/i);
      }
    );
  });
});

describe("multer type/size policy (unit)", () => {
  it("loads with configurable UPLOADS_DIR and keeps 200MB limit", () => {
    resetModules();
    delete require.cache[path.resolve(__dirname, "../middleware/multerMiddleware.js")];
    const upload = require("../middleware/multerMiddleware");
    assert.ok(typeof upload.single === "function");
    assert.equal(upload.limits.fileSize, 200 * 1024 * 1024);
    assert.ok(fs.existsSync(path.join(tempRoot, "assignments")));
  });
});

describe("maintenance mode still blocks uploads and APIs", () => {
  it("returns 503 for /uploads and /api when APP_RUNTIME_MODE is not full", async () => {
    const prevMode = process.env.APP_RUNTIME_MODE;
    const prevVercel = process.env.VERCEL;
    process.env.APP_RUNTIME_MODE = "maintenance";
    process.env.VERCEL = "1"; // prevent server.js from binding a port during require
    delete require.cache[path.resolve(__dirname, "../server.js")];
    delete require.cache[path.resolve(__dirname, "../appFull.js")];
    const maintenanceApp = require("../server.js");

    await new Promise((resolve, reject) => {
      const server = http.createServer(maintenanceApp);
      server.listen(0, "127.0.0.1", async () => {
        const { port } = server.address();
        try {
          const u = await request(port, "GET", "/uploads/assignments/a1.txt");
          assert.equal(u.status, 503);
          const api = await request(port, "GET", "/api/files/assignment/asn1");
          assert.equal(api.status, 503);
          const health = await request(port, "GET", "/health");
          assert.equal(health.status, 200);
          server.close(() => {
            if (prevMode === undefined) delete process.env.APP_RUNTIME_MODE;
            else process.env.APP_RUNTIME_MODE = prevMode;
            if (prevVercel === undefined) delete process.env.VERCEL;
            else process.env.VERCEL = prevVercel;
            delete require.cache[path.resolve(__dirname, "../server.js")];
            resolve();
          });
        } catch (err) {
          server.close(() => {
            if (prevMode === undefined) delete process.env.APP_RUNTIME_MODE;
            else process.env.APP_RUNTIME_MODE = prevMode;
            if (prevVercel === undefined) delete process.env.VERCEL;
            else process.env.VERCEL = prevVercel;
            delete require.cache[path.resolve(__dirname, "../server.js")];
            reject(err);
          });
        }
      });
    });
  });
});

describe("existing upload path compatibility", () => {
  it("keeps uploads/<folder>/<file> relative path format resolvable", () => {
    resetModules();
    const { resolveStoredUploadPath } = require(uploadsPathUtil);
    const p1 = resolveStoredUploadPath("uploads/submissions/s1.txt");
    const p2 = resolveStoredUploadPath("submissions/s1.txt");
    assert.equal(p1, p2);
    assert.ok(fs.existsSync(p1));
  });
});
