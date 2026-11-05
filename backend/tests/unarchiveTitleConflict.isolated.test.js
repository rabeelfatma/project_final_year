/**
 * Rule 2 — block unarchive when another Active assignment shares the title.
 * Isolated mocks only; no production DB writes.
 */
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const Module = require("module");
const path = require("path");
const http = require("http");
const express = require("express");

const teacherRoutesPath = path.resolve(__dirname, "../routes/teacherRoutes.js");
const authMiddlewarePath = path.resolve(__dirname, "../middleware/authMiddleware.js");
const multerPath = path.resolve(__dirname, "../middleware/multerMiddleware.js");
const teacherControllerPath = path.resolve(__dirname, "../controllers/teacherController.js");
const assignmentModelPath = path.resolve(__dirname, "../models/Assignment.js");
const submissionModelPath = path.resolve(__dirname, "../models/Submission.js");
const userModelPath = path.resolve(__dirname, "../models/User.js");
const geminiPath = path.resolve(__dirname, "../services/geminiService.js");
const plagiarismPath = path.resolve(__dirname, "../services/plagiarismService.js");
const notifyPath = path.resolve(__dirname, "../controllers/notificationController.js");
const uploadsPathUtil = path.resolve(__dirname, "../utils/uploadsPath.js");
const storedFilesPath = path.resolve(__dirname, "../utils/storedFiles.js");
const duplicateUtilPath = path.resolve(__dirname, "../utils/assignmentDuplicate.js");

const teacherId = "teacher-owner";
const otherTeacherId = "teacher-other";

const {
  findActiveDuplicateTitleForUnarchive,
  unarchiveTitleConflictPayload,
  UNARCHIVE_TITLE_CONFLICT_CODE,
  UNARCHIVE_TITLE_CONFLICT_MESSAGE,
} = require("../utils/assignmentDuplicate");

function request(port, method, urlPath, { headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body != null ? Buffer.from(JSON.stringify(body)) : null;
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: urlPath,
        method,
        headers: {
          ...(payload
            ? { "Content-Length": payload.length, "Content-Type": "application/json" }
            : {}),
          ...headers,
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try { json = JSON.parse(text); } catch (_) {}
          resolve({ status: res.statusCode, text, json });
        });
      }
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function withServer(mount, run) {
  return new Promise((resolve, reject) => {
    const app = express();
    app.use(express.json());
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

function mockAuth(authedUser) {
  return {
    protect: (req, res, next) => {
      if (!authedUser) return res.status(401).json({ message: "No token" });
      req.user = authedUser;
      return next();
    },
    authorize:
      (...roles) =>
      (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
          return res.status(403).json({
            message: `Access denied for role: ${req.user?.role}`,
          });
        }
        return next();
      },
  };
}

function buildAssignmentStore(rows) {
  return {
    find: (q = {}) => {
      let list = rows.slice();
      if (q.teacher) list = list.filter((a) => String(a.teacher) === String(q.teacher));
      if (q.status?.$ne) list = list.filter((a) => a.status !== q.status.$ne);
      if (typeof q.status === "string") list = list.filter((a) => a.status === q.status);
      if (q._id != null && typeof q._id !== "object") {
        list = list.filter((a) => String(a._id) === String(q._id));
      }
      if (q._id?.$ne) list = list.filter((a) => String(a._id) !== String(q._id.$ne));
      if (q._id?.$in) {
        const set = new Set(q._id.$in.map(String));
        list = list.filter((a) => set.has(String(a._id)));
      }
      const api = {
        select() { return api; },
        sort() { return api; },
        lean: async () => list.map((r) => ({ ...r })),
        then(resolve, reject) { return Promise.resolve(list.map((r) => ({ ...r }))).then(resolve, reject); },
      };
      return api;
    },
    findOne: async (q) => {
      const row = rows.find((a) => {
        if (q._id && String(a._id) !== String(q._id)) return false;
        if (q.teacher && String(a.teacher) !== String(q.teacher)) return false;
        if (typeof q.status === "string" && a.status !== q.status) return false;
        return true;
      });
      return row ? { ...row } : null;
    },
    findOneAndUpdate: async (q, update, opts = {}) => {
      const row = rows.find((a) => {
        if (q._id && String(a._id) !== String(q._id)) return false;
        if (q.teacher && String(a.teacher) !== String(q.teacher)) return false;
        if (typeof q.status === "string" && a.status !== q.status) return false;
        return true;
      });
      if (!row) return null;
      Object.assign(row, update.$set || update);
      return opts.new === false ? null : { ...row };
    },
    updateOne: async (q, update) => {
      const row = rows.find((a) => {
        if (q._id && String(a._id) !== String(q._id)) return false;
        if (q.teacher && String(a.teacher) !== String(q.teacher)) return false;
        if (typeof q.status === "string" && a.status !== q.status) return false;
        return true;
      });
      if (!row) return { modifiedCount: 0 };
      Object.assign(row, update.$set || update);
      return { modifiedCount: 1 };
    },
    updateMany: async () => ({ modifiedCount: 0 }),
  };
}

function loadTeacherRouter(authedUser, Assignment) {
  [
    teacherRoutesPath,
    authMiddlewarePath,
    multerPath,
    teacherControllerPath,
    assignmentModelPath,
    submissionModelPath,
    userModelPath,
    geminiPath,
    plagiarismPath,
    notifyPath,
    uploadsPathUtil,
    storedFilesPath,
    duplicateUtilPath,
  ].forEach((p) => delete require.cache[p]);

  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (
      request === "../middleware/authMiddleware" ||
      request.endsWith(`${path.sep}middleware${path.sep}authMiddleware.js`)
    ) {
      return mockAuth(authedUser);
    }
    if (
      request === "../middleware/multerMiddleware" ||
      request.endsWith(`${path.sep}middleware${path.sep}multerMiddleware.js`)
    ) {
      const passthrough = (req, res, next) => next();
      return { single: () => passthrough, array: () => passthrough };
    }
    if (
      request === "../models/Assignment" ||
      request.endsWith(`${path.sep}models${path.sep}Assignment.js`)
    ) {
      return Assignment;
    }
    if (
      request === "../models/Submission" ||
      request.endsWith(`${path.sep}models${path.sep}Submission.js`)
    ) {
      return {
        find: () => ({ populate() { return this; }, sort() { return this; }, lean: async () => [] }),
        findOne: () => ({ lean: async () => null }),
        create: async () => { throw new Error("no create"); },
        deleteMany: async () => { throw new Error("no deleteMany"); },
      };
    }
    if (
      request === "../models/User" ||
      request.endsWith(`${path.sep}models${path.sep}User.js`)
    ) {
      return { find: () => ({ select: async () => [] }) };
    }
    if (
      request === "../services/geminiService" ||
      request.endsWith(`${path.sep}services${path.sep}geminiService.js`)
    ) {
      return { checkAssignment: async () => ({}) };
    }
    if (
      request === "../services/plagiarismService" ||
      request.endsWith(`${path.sep}services${path.sep}plagiarismService.js`)
    ) {
      return { extractText: async () => "" };
    }
    if (
      request === "./notificationController" ||
      request === "../controllers/notificationController" ||
      request.endsWith(`${path.sep}controllers${path.sep}notificationController.js`)
    ) {
      return { create: async () => null };
    }
    if (
      request === "../utils/storedFiles" ||
      request.endsWith(`${path.sep}utils${path.sep}storedFiles.js`)
    ) {
      return {
        remove: async () => {},
        exists: async () => true,
        materialize: async () => Buffer.from("x"),
        writeBuffer: async () => {},
        usesObjectStorage: () => false,
      };
    }
    if (
      request === "../utils/uploadsPath" ||
      request.endsWith(`${path.sep}utils${path.sep}uploadsPath.js`)
    ) {
      return {
        resolveStoredUploadPath: (s) => s,
        getUploadsRoot: () => path.join(__dirname, "../uploads"),
      };
    }
    return originalLoad(request, parent, isMain);
  };
  try {
    return require(teacherRoutesPath);
  } finally {
    Module._load = originalLoad;
  }
}

describe("Rule 2 unarchive title conflict helpers", () => {
  it("payload uses the required teacher-facing message and code", () => {
    const payload = unarchiveTitleConflictPayload();
    assert.equal(payload.code, UNARCHIVE_TITLE_CONFLICT_CODE);
    assert.equal(payload.message, UNARCHIVE_TITLE_CONFLICT_MESSAGE);
    assert.match(payload.message, /active assignment with this title already exists/i);
  });

  it("normalized title matches ignore case and spacing", async () => {
    const rows = [
      { _id: "active-1", teacher: teacherId, status: "active", title: "Assignment No 1" },
      { _id: "arch-1", teacher: teacherId, status: "archived", title: "assignment no 1" },
    ];
    const Assignment = buildAssignmentStore(rows);
    const found = await findActiveDuplicateTitleForUnarchive({
      AssignmentModel: Assignment,
      teacherId,
      title: "  Assignment   No 1  ",
      excludeId: "arch-1",
    });
    assert.equal(String(found._id), "active-1");
  });

  it("different teacher with same title is not a conflict", async () => {
    const rows = [
      { _id: "other-active", teacher: otherTeacherId, status: "active", title: "Lab 1" },
    ];
    const Assignment = buildAssignmentStore(rows);
    const found = await findActiveDuplicateTitleForUnarchive({
      AssignmentModel: Assignment,
      teacherId,
      title: "Lab 1",
      excludeId: "mine-arch",
    });
    assert.equal(found, null);
  });
});

describe("Rule 2 unarchive API", () => {
  it("blocks unarchive when same teacher already has Active title (case/space variants)", async () => {
    const rows = [
      {
        _id: "active-1",
        teacher: teacherId,
        status: "active",
        title: "Assignment No 1",
        startDate: new Date("2026-01-01"),
        deadline: new Date("2026-01-10"),
      },
      {
        _id: "arch-1",
        teacher: teacherId,
        status: "archived",
        title: "  assignment   no 1 ",
        startDate: new Date("2026-02-01"),
        deadline: new Date("2026-02-10"),
        file: "uploads/assignments/a.pdf",
      },
    ];
    const Assignment = buildAssignmentStore(rows);
    const router = loadTeacherRouter({ _id: teacherId, role: "teacher" }, Assignment);
    await withServer(
      (app) => app.use("/api/teacher", router),
      async (port) => {
        const r = await request(port, "PATCH", "/api/teacher/assignments/arch-1/status", {
          body: { status: "active" },
        });
        assert.equal(r.status, 409);
        assert.equal(r.json.code, UNARCHIVE_TITLE_CONFLICT_CODE);
        assert.equal(r.json.message, UNARCHIVE_TITLE_CONFLICT_MESSAGE);
      }
    );
    assert.equal(rows.find((r) => r._id === "arch-1").status, "archived");
    assert.equal(rows.find((r) => r._id === "active-1").status, "active");
  });

  it("allows unarchive when titles differ for the same teacher", async () => {
    const rows = [
      { _id: "active-1", teacher: teacherId, status: "active", title: "Lab A" },
      {
        _id: "arch-1",
        teacher: teacherId,
        status: "archived",
        title: "Lab B",
        startDate: new Date("2026-02-01"),
        deadline: new Date("2026-02-10"),
      },
    ];
    const Assignment = buildAssignmentStore(rows);
    const router = loadTeacherRouter({ _id: teacherId, role: "teacher" }, Assignment);
    await withServer(
      (app) => app.use("/api/teacher", router),
      async (port) => {
        const r = await request(port, "PATCH", "/api/teacher/assignments/arch-1/status", {
          body: { status: "active" },
        });
        assert.equal(r.status, 200);
        assert.equal(r.json.status, "active");
        assert.equal(r.json._id, "arch-1");
        assert.equal(new Date(r.json.deadline).toISOString(), new Date("2026-02-10").toISOString());
      }
    );
    assert.equal(rows.find((r) => r._id === "arch-1").status, "active");
  });

  it("allows unarchive when a different teacher already uses the same title", async () => {
    const rows = [
      { _id: "other-active", teacher: otherTeacherId, status: "active", title: "Shared Title" },
      { _id: "mine-arch", teacher: teacherId, status: "archived", title: "Shared Title" },
    ];
    const Assignment = buildAssignmentStore(rows);
    const router = loadTeacherRouter({ _id: teacherId, role: "teacher" }, Assignment);
    await withServer(
      (app) => app.use("/api/teacher", router),
      async (port) => {
        const r = await request(port, "PATCH", "/api/teacher/assignments/mine-arch/status", {
          body: { status: "active" },
        });
        assert.equal(r.status, 200);
        assert.equal(r.json.status, "active");
      }
    );
  });

  it("after renaming the active assignment, unarchive is allowed", async () => {
    const rows = [
      { _id: "active-1", teacher: teacherId, status: "active", title: "Old Title" },
      { _id: "arch-1", teacher: teacherId, status: "archived", title: "Old Title" },
    ];
    const Assignment = buildAssignmentStore(rows);
    // Rename active first (simulate teacher edit).
    rows[0].title = "Renamed Active";
    const router = loadTeacherRouter({ _id: teacherId, role: "teacher" }, Assignment);
    await withServer(
      (app) => app.use("/api/teacher", router),
      async (port) => {
        const r = await request(port, "PATCH", "/api/teacher/assignments/arch-1/status", {
          body: { status: "active" },
        });
        assert.equal(r.status, 200);
        assert.equal(r.json.status, "active");
      }
    );
    assert.equal(rows.find((r) => r._id === "arch-1").status, "active");
  });

  it("rejects unauthorized teacher and leaves archived row unchanged", async () => {
    const rows = [
      { _id: "arch-1", teacher: teacherId, status: "archived", title: "Owned" },
    ];
    const Assignment = buildAssignmentStore(rows);
    const router = loadTeacherRouter({ _id: otherTeacherId, role: "teacher" }, Assignment);
    await withServer(
      (app) => app.use("/api/teacher", router),
      async (port) => {
        const r = await request(port, "PATCH", "/api/teacher/assignments/arch-1/status", {
          body: { status: "active" },
        });
        assert.equal(r.status, 404);
      }
    );
    assert.equal(rows[0].status, "archived");
  });

  it("bulk unarchive fails title conflicts without promoting those rows", async () => {
    const rows = [
      { _id: "active-1", teacher: teacherId, status: "active", title: "Midterm" },
      { _id: "arch-conflict", teacher: teacherId, status: "archived", title: "midterm" },
      { _id: "arch-ok", teacher: teacherId, status: "archived", title: "Final" },
    ];
    const Assignment = buildAssignmentStore(rows);
    const router = loadTeacherRouter({ _id: teacherId, role: "teacher" }, Assignment);
    await withServer(
      (app) => app.use("/api/teacher", router),
      async (port) => {
        const r = await request(port, "POST", "/api/teacher/assignments/bulk-unarchive", {
          body: { ids: ["arch-conflict", "arch-ok"] },
        });
        assert.equal(r.status, 200);
        assert.equal(r.json.unarchived, 1);
        assert.deepEqual(r.json.unarchivedIds, ["arch-ok"]);
        assert.equal(r.json.failed.length, 1);
        assert.equal(r.json.failed[0].id, "arch-conflict");
        assert.equal(r.json.failed[0].message, UNARCHIVE_TITLE_CONFLICT_MESSAGE);
      }
    );
    assert.equal(rows.find((r) => r._id === "arch-conflict").status, "archived");
    assert.equal(rows.find((r) => r._id === "arch-ok").status, "active");
  });

  it("Teacher dashboard surfaces the Rule 2 conflict message path", () => {
    const dash = require("fs").readFileSync(
      path.resolve(__dirname, "../../frontend/src/pages/dashboards/TeacherDashboard.jsx"),
      "utf8"
    );
    assert.match(dash, /handleUnarchiveAssignment/);
    assert.match(dash, /error\.response\?\.data\?\.message/);
    assert.match(dash, /ConfirmDialog/);
  });
});
