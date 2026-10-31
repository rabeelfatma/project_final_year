/**
 * Phase 1 — Teacher Archive/Restore (isolated mocks only).
 * No MongoDB Atlas / Cloudflare R2 / production writes.
 */
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const Module = require("module");
const path = require("path");
const fs = require("fs");
const http = require("http");
const express = require("express");
const { pathToFileURL } = require("node:url");

const teacherRoutesPath = path.resolve(__dirname, "../routes/teacherRoutes.js");
const studentRoutesPath = path.resolve(__dirname, "../routes/studentRoutes.js");
const authMiddlewarePath = path.resolve(__dirname, "../middleware/authMiddleware.js");
const multerPath = path.resolve(__dirname, "../middleware/multerMiddleware.js");
const teacherControllerPath = path.resolve(
  __dirname,
  "../controllers/teacherController.js"
);
const assignmentModelPath = path.resolve(__dirname, "../models/Assignment.js");
const submissionModelPath = path.resolve(__dirname, "../models/Submission.js");
const userModelPath = path.resolve(__dirname, "../models/User.js");
const geminiPath = path.resolve(__dirname, "../services/geminiService.js");
const plagiarismPath = path.resolve(__dirname, "../services/plagiarismService.js");
const notifyPath = path.resolve(
  __dirname,
  "../controllers/notificationController.js"
);
const uploadsPathUtil = path.resolve(__dirname, "../utils/uploadsPath.js");
const storedFilesPath = path.resolve(__dirname, "../utils/storedFiles.js");
const assignmentSrcPath = path.resolve(__dirname, "../models/Assignment.js");
const teacherDashPath = path.resolve(
  __dirname,
  "../../frontend/src/pages/dashboards/TeacherDashboard.jsx"
);
const assignmentShelfUtilPath = path.resolve(
  __dirname,
  "../../frontend/src/utils/assignmentShelf.js"
);

const teacherId = "teacher-owner";
const otherTeacherId = "teacher-other";
const studentId = "student-1";

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
            ? {
                "Content-Length": payload.length,
                "Content-Type": "application/json",
              }
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
          try {
            json = JSON.parse(text);
          } catch (_) {}
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

describe("Phase 1 assignment archive / restore", () => {
  it("Assignment schema enum includes archived alongside active/deactive", () => {
    const src = fs.readFileSync(assignmentSrcPath, "utf8");
    assert.match(src, /enum:\s*\[\s*"active"\s*,\s*"deactive"\s*,\s*"archived"\s*\]/);
  });

  it("Teacher dashboard: menu-only Archive/Restore, Archive All/Selected, Delete unchanged", () => {
    const src = fs.readFileSync(teacherDashPath, "utf8");
    assert.match(src, /assignmentShelf/);
    assert.match(src, /handleArchiveAssignment/);
    assert.match(src, /handleRestoreAssignment/);
    assert.match(src, /handleArchiveAllAssignments/);
    assert.match(src, /handleArchiveSelectedAssignments/);
    assert.match(src, /label:\s*['"]Archive Assignment['"]/);
    assert.match(src, /label:\s*['"]Restore Assignment['"]/);
    assert.match(src, /label:\s*['"]Delete Assignment['"]/);
    assert.match(src, /Archive All/);
    assert.match(src, /Archive Selected/);
    assert.match(src, /handleDeleteAssignment/);
    assert.match(src, /shelfAfterRestore/);
    assert.match(src, /shelfAfterArchive/);
    assert.match(src, /fetchAllData\(\{\s*silent:\s*true\s*\}\)/);
    // No separate visible Archive/Restore card buttons (menu-only).
    assert.doesNotMatch(
      src,
      /onClick=\{\(\) => handleArchiveAssignment[\s\S]{0,120}Archive\s*<\/button>/
    );
    assert.doesNotMatch(
      src,
      /onClick=\{\(\) => handleRestoreAssignment[\s\S]{0,120}Restore\s*<\/button>/
    );
    // Overdue must not auto-archive.
    assert.match(src, /Never auto-archive|never auto-archive/i);
  });

  it("Student dashboard has no submission delete controls", () => {
    const studentDash = fs.readFileSync(
      path.resolve(__dirname, "../../frontend/src/pages/dashboards/StudentDashboard.jsx"),
      "utf8"
    );
    assert.doesNotMatch(studentDash, /Delete my submission/i);
    assert.doesNotMatch(studentDash, /Delete selected/i);
    assert.doesNotMatch(studentDash, /Delete all/i);
    assert.doesNotMatch(studentDash, /deleteMySubmission/);
    assert.doesNotMatch(studentDash, /onDeleteSubmission/);
    assert.doesNotMatch(studentDash, /handleDeleteSelected/);
  });

  it("regression: restore switches shelf to Active so the row is not filtered away", async () => {
    const {
      filterAssignmentsByShelf,
      shelfAfterRestore,
      shelfAfterArchive,
    } = await import(pathToFileURL(assignmentShelfUtilPath).href);

    const rows = [
      { _id: "a1", title: "Restored", status: "active" },
      { _id: "a2", title: "Still archived", status: "archived" },
      { _id: "a3", title: "Legacy closed", status: "deactive" },
    ];

    // Bug reproduction: after API restore, status is active but shelf stayed "archived".
    const stuckOnArchived = filterAssignmentsByShelf(rows, "archived");
    assert.equal(
      stuckOnArchived.some((r) => r._id === "a1"),
      false,
      "active row must disappear from Archived shelf (this looked like restore failure)"
    );

    assert.equal(shelfAfterRestore(), "active");
    assert.equal(shelfAfterArchive(), "archived");

    const afterRestoreFix = filterAssignmentsByShelf(rows, shelfAfterRestore());
    assert.equal(afterRestoreFix.some((r) => r._id === "a1"), true);
    assert.equal(afterRestoreFix.some((r) => r._id === "a3"), true);
    assert.equal(afterRestoreFix.some((r) => r._id === "a2"), false);
  });

  it("archive → restore → active round-trip keeps academic fields and rejects non-owner", async () => {
    const assignments = [
      {
        _id: "asn-roundtrip-1",
        title: "Round Trip",
        status: "active",
        points: 25,
        subject: "Math",
        teacher: teacherId,
        file: "uploads/assignments/keep-me.txt",
        originalFileName: "prompt.txt",
        fileMimeType: "text/plain",
        startDate: new Date(Date.now() - 3600000),
        deadline: new Date(Date.now() + 86400000),
        createdAt: new Date(),
      },
    ];
    const submissions = [
      {
        _id: "sub-rt-1",
        assignment: "asn-roundtrip-1",
        student: studentId,
        teacherId,
        status: "PUBLISHED",
        marks: 20,
        aiScore: 20,
        feedback: "Nice",
        aiFeedback: "Nice",
        originalFileName: "answer.pdf",
        file: "uploads/submissions/keep-sub.pdf",
      },
    ];
    const removeCalls = [];
    let authedUser = { _id: teacherId, role: "teacher" };

    const clearCaches = () => {
      [
        teacherRoutesPath,
        studentRoutesPath,
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
      ].forEach((p) => delete require.cache[p]);
    };

    const Assignment = {
      find: (q = {}) => {
        let rows = assignments.slice();
        if (q.teacher) rows = rows.filter((a) => String(a.teacher) === String(q.teacher));
        if (q.status) rows = rows.filter((a) => a.status === q.status);
        const api = {
          select() { return api; },
          sort() { return api; },
          lean: async () => rows.map((r) => ({ ...r })),
          then(resolve, reject) { return Promise.resolve(rows).then(resolve, reject); },
        };
        return api;
      },
      findById: async (id) =>
        assignments.find((a) => String(a._id) === String(id)) || null,
      findOneAndUpdate: async (q, update) => {
        const row = assignments.find((a) => {
          if (q._id && String(a._id) !== String(q._id)) return false;
          if (q.teacher && String(a.teacher) !== String(q.teacher)) return false;
          return true;
        });
        if (!row) return null;
        Object.assign(row, update.$set || update);
        return { ...row };
      },
    };

    const Submission = {
      findOne: (q) => {
        const row =
          submissions.find(
            (s) =>
              String(s.assignment) === String(q.assignment?._id || q.assignment) &&
              String(s.student) === String(q.student)
          ) || null;
        const promise = Promise.resolve(row);
        promise.lean = async () => (row ? { ...row } : null);
        return promise;
      },
      find: () => ({
        populate: () => ({
          sort: () => ({
            lean: async () => submissions.map((s) => ({ ...s })),
          }),
        }),
      }),
      create: async () => {
        throw new Error("create must not run");
      },
      deleteMany: async () => {
        throw new Error("deleteMany must not run");
      },
    };

    const loadTeacherRouter = () => {
      clearCaches();
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
          return Submission;
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
          request.endsWith(
            `${path.sep}controllers${path.sep}notificationController.js`
          )
        ) {
          return { create: async () => null };
        }
        if (
          request === "../utils/storedFiles" ||
          request.endsWith(`${path.sep}utils${path.sep}storedFiles.js`)
        ) {
          return {
            remove: async (key) => { removeCalls.push(key); },
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
    };

    const loadStudentRouter = () => {
      clearCaches();
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
          return Submission;
        }
        if (
          request === "../controllers/notificationController" ||
          request.endsWith(
            `${path.sep}controllers${path.sep}notificationController.js`
          )
        ) {
          return { create: async () => null };
        }
        if (
          request === "../utils/storedFiles" ||
          request.endsWith(`${path.sep}utils${path.sep}storedFiles.js`)
        ) {
          return {
            remove: async (key) => { removeCalls.push(key); },
            writeBuffer: async () => {},
            usesObjectStorage: () => false,
          };
        }
        return originalLoad(request, parent, isMain);
      };
      try {
        return require(studentRoutesPath);
      } finally {
        Module._load = originalLoad;
      }
    };

    // Archive
    authedUser = { _id: teacherId, role: "teacher" };
    let teacherRouter = loadTeacherRouter();
    await withServer(
      (app) => app.use("/api/teacher", teacherRouter),
      async (port) => {
        const archived = await request(
          port,
          "PATCH",
          "/api/teacher/assignments/asn-roundtrip-1/status",
          { body: { status: "archived" } }
        );
        assert.equal(archived.status, 200);
        assert.equal(archived.json.status, "archived");
      }
    );

    // Hidden from students while archived
    authedUser = { _id: studentId, role: "student" };
    let studentRouter = loadStudentRouter();
    await withServer(
      (app) => app.use("/api/student", studentRouter),
      async (port) => {
        const list = await request(port, "GET", "/api/student/assignments");
        assert.equal(list.status, 200);
        assert.equal(list.json.length, 0);
      }
    );

    // Restore → active
    authedUser = { _id: teacherId, role: "teacher" };
    teacherRouter = loadTeacherRouter();
    await withServer(
      (app) => app.use("/api/teacher", teacherRouter),
      async (port) => {
        const restored = await request(
          port,
          "PATCH",
          "/api/teacher/assignments/asn-roundtrip-1/status",
          { body: { status: "active" } }
        );
        assert.equal(restored.status, 200);
        assert.equal(restored.json.status, "active");

        const mine = await request(port, "GET", "/api/teacher/my-assignments");
        assert.equal(mine.status, 200);
        assert.equal(mine.json[0].status, "active");
        assert.equal(mine.json[0].originalFileName, "prompt.txt");
        assert.equal(mine.json[0].file, "uploads/assignments/keep-me.txt");
      }
    );

    // Visible again to students
    authedUser = { _id: studentId, role: "student" };
    studentRouter = loadStudentRouter();
    await withServer(
      (app) => app.use("/api/student", studentRouter),
      async (port) => {
        const list = await request(port, "GET", "/api/student/assignments");
        assert.equal(list.status, 200);
        assert.equal(list.json.length, 1);
        assert.equal(list.json[0]._id, "asn-roundtrip-1");
      }
    );

    assert.equal(assignments[0].status, "active");
    assert.equal(submissions[0].marks, 20);
    assert.equal(submissions[0].originalFileName, "answer.pdf");
    assert.equal(submissions[0].file, "uploads/submissions/keep-sub.pdf");
    assert.equal(removeCalls.length, 0);
  });

  it("archive hides from students, teacher retains, restore reactivates, data + R2 intact, ownership enforced", async () => {
    const assignments = [
      {
        _id: "asn-archive-1",
        title: "Archive Me",
        status: "active",
        points: 50,
        subject: "CS",
        teacher: teacherId,
        file: "uploads/assignments/ref-keep.txt",
        originalFileName: "brief.txt",
        fileMimeType: "text/plain",
        startDate: new Date(Date.now() - 86400000),
        deadline: new Date(Date.now() + 86400000),
        createdAt: new Date(),
      },
    ];
    const submissions = [
      {
        _id: "sub-1",
        assignment: "asn-archive-1",
        student: studentId,
        teacherId,
        status: "PUBLISHED",
        marks: 42,
        aiScore: 42,
        feedback: "Solid work",
        aiFeedback: "Solid work",
        aiStrengths: ["clarity"],
        aiImprovements: [],
        totalMarks: 50,
        file: "uploads/submissions/stu-keep.pdf",
        originalFileName: "student-essay.pdf",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    const removeCalls = [];
    let authedUser = { _id: teacherId, role: "teacher", name: "Owner" };

    const clearCaches = () => {
      [
        teacherRoutesPath,
        studentRoutesPath,
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
      ].forEach((p) => delete require.cache[p]);
    };

    const Assignment = {
      find: (q = {}) => {
        let rows = assignments.slice();
        if (q.teacher) {
          rows = rows.filter((a) => String(a.teacher) === String(q.teacher));
        }
        if (q.status) {
          rows = rows.filter((a) => a.status === q.status);
        }
        const api = {
          select() {
            return api;
          },
          sort() {
            return api;
          },
          lean: async () => rows.map((r) => ({ ...r })),
          then(resolve, reject) {
            return Promise.resolve(rows).then(resolve, reject);
          },
        };
        return api;
      },
      findById: async (id) =>
        assignments.find((a) => String(a._id) === String(id)) || null,
      findOneAndUpdate: async (q, update) => {
        const row = assignments.find((a) => {
          if (q._id && String(a._id) !== String(q._id)) return false;
          if (q.teacher && String(a.teacher) !== String(q.teacher)) return false;
          return true;
        });
        if (!row) return null;
        Object.assign(row, update.$set || update);
        return { ...row };
      },
    };

    const Submission = {
      findOne: (q) => {
        const row =
          submissions.find((s) => {
            if (q._id && String(s._id) !== String(q._id)) return false;
            if (
              q.assignment &&
              String(s.assignment) !== String(q.assignment?._id || q.assignment)
            )
              return false;
            if (q.student && String(s.student) !== String(q.student)) return false;
            return true;
          }) || null;
        const promise = Promise.resolve(row);
        promise.lean = async () => (row ? { ...row } : null);
        return promise;
      },
      find: () => ({
        populate: () => ({
          sort: () => ({
            lean: async () =>
              submissions
                .filter((s) => String(s.student) === String(studentId))
                .map((s) => ({
                  ...s,
                  assignment: {
                    _id: s.assignment,
                    title: "Archive Me",
                    points: 50,
                    subject: "CS",
                  },
                })),
          }),
        }),
      }),
      create: async () => {
        throw new Error("Submission.create must not run for archived assignments");
      },
      deleteMany: async () => {
        throw new Error("Submission.deleteMany must not run during archive/restore");
      },
    };

    const loadTeacherRouter = () => {
      clearCaches();
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
          return Submission;
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
          request.endsWith(
            `${path.sep}controllers${path.sep}notificationController.js`
          )
        ) {
          return { create: async () => null };
        }
        if (
          request === "../utils/storedFiles" ||
          request.endsWith(`${path.sep}utils${path.sep}storedFiles.js`)
        ) {
          return {
            remove: async (key) => {
              removeCalls.push(key);
            },
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
    };

    const loadStudentRouter = () => {
      clearCaches();
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
          return Submission;
        }
        if (
          request === "../controllers/notificationController" ||
          request.endsWith(
            `${path.sep}controllers${path.sep}notificationController.js`
          )
        ) {
          return { create: async () => null };
        }
        if (
          request === "../utils/storedFiles" ||
          request.endsWith(`${path.sep}utils${path.sep}storedFiles.js`)
        ) {
          return {
            remove: async (key) => {
              removeCalls.push(key);
            },
            writeBuffer: async () => {},
            usesObjectStorage: () => false,
          };
        }
        return originalLoad(request, parent, isMain);
      };
      try {
        return require(studentRoutesPath);
      } finally {
        Module._load = originalLoad;
      }
    };

    const snapshotBefore = () => ({
      assignment: { ...assignments[0] },
      submission: { ...submissions[0] },
    });

    // 1) Student sees active assignment before archive
    authedUser = { _id: studentId, role: "student", name: "Student" };
    let studentRouter = loadStudentRouter();
    await withServer(
      (app) => app.use("/api/student", studentRouter),
      async (port) => {
        const r = await request(port, "GET", "/api/student/assignments");
        assert.equal(r.status, 200);
        assert.equal(r.json.length, 1);
        assert.equal(r.json[0]._id, "asn-archive-1");
      }
    );

    // 2) Owner archives — no file deletion
    const beforeArchive = snapshotBefore();
    authedUser = { _id: teacherId, role: "teacher", name: "Owner" };
    let teacherRouter = loadTeacherRouter();
    await withServer(
      (app) => app.use("/api/teacher", teacherRouter),
      async (port) => {
        const r = await request(port, "PATCH", "/api/teacher/assignments/asn-archive-1/status", {
          body: { status: "archived" },
        });
        assert.equal(r.status, 200);
        assert.equal(r.json.status, "archived");
      }
    );
    assert.equal(assignments[0].status, "archived");
    assert.equal(removeCalls.length, 0);
    assert.equal(assignments[0].file, beforeArchive.assignment.file);
    assert.equal(assignments[0].originalFileName, beforeArchive.assignment.originalFileName);
    assert.equal(submissions[0].file, beforeArchive.submission.file);
    assert.equal(submissions[0].marks, beforeArchive.submission.marks);
    assert.equal(submissions[0].aiFeedback, beforeArchive.submission.aiFeedback);
    assert.equal(submissions[0].originalFileName, beforeArchive.submission.originalFileName);
    assert.equal(submissions.length, 1);

    // 3) Archived hidden from student active list
    authedUser = { _id: studentId, role: "student", name: "Student" };
    studentRouter = loadStudentRouter();
    await withServer(
      (app) => app.use("/api/student", studentRouter),
      async (port) => {
        const list = await request(port, "GET", "/api/student/assignments");
        assert.equal(list.status, 200);
        assert.equal(list.json.length, 0);

        const submit = await request(
          port,
          "POST",
          "/api/student/assignments/asn-archive-1/submit",
          { body: {} }
        );
        assert.equal(submit.status, 400);
        assert.match(String(submit.json?.message || ""), /not active/i);

        // Historical submissions remain readable
        const mine = await request(port, "GET", "/api/student/my-submissions");
        assert.equal(mine.status, 200);
        assert.equal(mine.json.length, 1);
        assert.equal(mine.json[0].marks, 42);
        assert.equal(mine.json[0].originalFileName, "student-essay.pdf");
      }
    );
    assert.equal(removeCalls.length, 0);

    // 4) Owning teacher still sees archived assignment
    authedUser = { _id: teacherId, role: "teacher", name: "Owner" };
    teacherRouter = loadTeacherRouter();
    await withServer(
      (app) => app.use("/api/teacher", teacherRouter),
      async (port) => {
        const mine = await request(port, "GET", "/api/teacher/my-assignments");
        assert.equal(mine.status, 200);
        assert.equal(mine.json.length, 1);
        assert.equal(mine.json[0].status, "archived");
      }
    );

    // 5) Non-owner cannot archive/restore
    authedUser = { _id: otherTeacherId, role: "teacher", name: "Other" };
    teacherRouter = loadTeacherRouter();
    await withServer(
      (app) => app.use("/api/teacher", teacherRouter),
      async (port) => {
        const denyArchive = await request(
          port,
          "PATCH",
          "/api/teacher/assignments/asn-archive-1/status",
          { body: { status: "archived" } }
        );
        assert.equal(denyArchive.status, 404);

        const denyRestore = await request(
          port,
          "PATCH",
          "/api/teacher/assignments/asn-archive-1/status",
          { body: { status: "active" } }
        );
        assert.equal(denyRestore.status, 404);
      }
    );
    assert.equal(assignments[0].status, "archived");

    // 6) Owner restores → active again; still no deletions
    const beforeRestore = snapshotBefore();
    authedUser = { _id: teacherId, role: "teacher", name: "Owner" };
    teacherRouter = loadTeacherRouter();
    await withServer(
      (app) => app.use("/api/teacher", teacherRouter),
      async (port) => {
        const r = await request(port, "PATCH", "/api/teacher/assignments/asn-archive-1/status", {
          body: { status: "active" },
        });
        assert.equal(r.status, 200);
        assert.equal(r.json.status, "active");
      }
    );
    assert.equal(assignments[0].status, "active");
    assert.equal(removeCalls.length, 0);
    assert.equal(assignments[0].file, beforeRestore.assignment.file);
    assert.equal(submissions[0].marks, beforeRestore.submission.marks);
    assert.equal(submissions[0].aiFeedback, beforeRestore.submission.aiFeedback);

    authedUser = { _id: studentId, role: "student", name: "Student" };
    studentRouter = loadStudentRouter();
    await withServer(
      (app) => app.use("/api/student", studentRouter),
      async (port) => {
        const list = await request(port, "GET", "/api/student/assignments");
        assert.equal(list.status, 200);
        assert.equal(list.json.length, 1);
        assert.equal(list.json[0]._id, "asn-archive-1");
      }
    );

    assert.equal(removeCalls.length, 0, "storedFiles.remove must never run on archive/restore");
  });
});

describe("bulk archive ownership + student delete policy", () => {
  function buildAssignmentStore(rows) {
    return {
      find: (q = {}) => {
        let list = rows.slice();
        if (q.teacher) list = list.filter((a) => String(a.teacher) === String(q.teacher));
        if (q.status?.$ne) list = list.filter((a) => a.status !== q.status.$ne);
        if (q.status && !q.status.$ne) list = list.filter((a) => a.status === q.status);
        if (q._id?.$in) {
          const set = new Set(q._id.$in.map(String));
          list = list.filter((a) => set.has(String(a._id)));
        }
        const api = {
          select() { return api; },
          sort() { return api; },
          lean: async () => list.map((r) => ({ ...r })),
          then(resolve, reject) { return Promise.resolve(list).then(resolve, reject); },
        };
        return api;
      },
      findById: async (id) => rows.find((a) => String(a._id) === String(id)) || null,
      findOneAndUpdate: async (q, update) => {
        const row = rows.find((a) => {
          if (q._id && String(a._id) !== String(q._id)) return false;
          if (q.teacher && String(a.teacher) !== String(q.teacher)) return false;
          return true;
        });
        if (!row) return null;
        const patch = update.$set || update;
        Object.assign(row, patch);
        return { ...row };
      },
      updateMany: async (q, update) => {
        const patch = update.$set || update;
        let modified = 0;
        for (const row of rows) {
          if (q.teacher && String(row.teacher) !== String(q.teacher)) continue;
          if (q.status?.$ne && row.status === q.status.$ne) continue;
          if (q._id?.$in && !q._id.$in.map(String).includes(String(row._id))) continue;
          Object.assign(row, patch);
          modified += 1;
        }
        return { modifiedCount: modified, matchedCount: modified };
      },
    };
  }

  function loadTeacherWithAssignments(authedUser, Assignment, removeCalls) {
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
          findOne: () => ({ lean: async () => null, then: (r) => Promise.resolve(null).then(r) }),
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
          remove: async (key) => { removeCalls.push(key); },
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

  function loadStudentRouter(authedUser) {
    [studentRoutesPath, authMiddlewarePath, multerPath, assignmentModelPath, submissionModelPath]
      .forEach((p) => delete require.cache[p]);
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
        return { find: () => ({ sort: () => ({ lean: async () => [] }), select: async () => [] }), findById: async () => null };
      }
      if (
        request === "../models/Submission" ||
        request.endsWith(`${path.sep}models${path.sep}Submission.js`)
      ) {
        return {
          findOne: () => ({ lean: async () => ({ _id: "sub1", student: studentId }) }),
          find: () => ({ populate() { return this; }, sort() { return this; }, lean: async () => [] }),
        };
      }
      if (
        request === "../controllers/notificationController" ||
        request.endsWith(`${path.sep}controllers${path.sep}notificationController.js`)
      ) {
        return { create: async () => null };
      }
      if (
        request === "../utils/storedFiles" ||
        request.endsWith(`${path.sep}utils${path.sep}storedFiles.js`)
      ) {
        return { remove: async () => { throw new Error("remove must not run"); }, writeBuffer: async () => {}, usesObjectStorage: () => false };
      }
      return originalLoad(request, parent, isMain);
    };
    try {
      return require(studentRoutesPath);
    } finally {
      Module._load = originalLoad;
    }
  }

  it("Archive All archives only the logged-in teacher's non-archived assignments", async () => {
    const rows = [
      { _id: "mine-1", teacher: teacherId, status: "active", file: "uploads/assignments/a.txt", originalFileName: "a.txt" },
      { _id: "mine-2", teacher: teacherId, status: "deactive", file: "uploads/assignments/b.txt", originalFileName: "b.txt" },
      { _id: "mine-archived", teacher: teacherId, status: "archived", file: "uploads/assignments/c.txt", originalFileName: "c.txt" },
      { _id: "theirs-1", teacher: otherTeacherId, status: "active", file: "uploads/assignments/d.txt", originalFileName: "d.txt" },
    ];
    const removeCalls = [];
    const Assignment = buildAssignmentStore(rows);
    const router = loadTeacherWithAssignments(
      { _id: teacherId, role: "teacher" },
      Assignment,
      removeCalls
    );
    await withServer(
      (app) => app.use("/api/teacher", router),
      async (port) => {
        const r = await request(port, "POST", "/api/teacher/assignments/bulk-archive", {
          body: { scope: "all" },
        });
        assert.equal(r.status, 200);
        assert.equal(r.json.archived, 2);
        assert.deepEqual(r.json.archivedIds.sort(), ["mine-1", "mine-2"]);
      }
    );
    assert.equal(rows.find((r) => r._id === "mine-1").status, "archived");
    assert.equal(rows.find((r) => r._id === "mine-2").status, "archived");
    assert.equal(rows.find((r) => r._id === "mine-archived").status, "archived");
    assert.equal(rows.find((r) => r._id === "theirs-1").status, "active");
    assert.equal(rows.find((r) => r._id === "mine-1").originalFileName, "a.txt");
    assert.equal(removeCalls.length, 0);
  });

  it("Archive Selected archives only owned IDs and reports foreign IDs as failed", async () => {
    const rows = [
      { _id: "mine-1", teacher: teacherId, status: "active", file: "f1", originalFileName: "one.txt" },
      { _id: "theirs-1", teacher: otherTeacherId, status: "active", file: "f2", originalFileName: "two.txt" },
    ];
    const removeCalls = [];
    const Assignment = buildAssignmentStore(rows);
    const router = loadTeacherWithAssignments(
      { _id: teacherId, role: "teacher" },
      Assignment,
      removeCalls
    );
    await withServer(
      (app) => app.use("/api/teacher", router),
      async (port) => {
        const r = await request(port, "POST", "/api/teacher/assignments/bulk-archive", {
          body: { ids: ["mine-1", "theirs-1", "missing-id"] },
        });
        assert.equal(r.status, 200);
        assert.equal(r.json.archived, 1);
        assert.deepEqual(r.json.archivedIds, ["mine-1"]);
        assert.equal(r.json.failed.length, 2);
        assert.ok(r.json.failed.some((f) => f.id === "theirs-1"));
        assert.ok(r.json.failed.some((f) => f.id === "missing-id"));
      }
    );
    assert.equal(rows.find((r) => r._id === "mine-1").status, "archived");
    assert.equal(rows.find((r) => r._id === "theirs-1").status, "active");
    assert.equal(removeCalls.length, 0);
  });

  it("unauthorized teacher cannot archive another teacher's assignment via status or bulk", async () => {
    const rows = [
      { _id: "owned-by-t1", teacher: teacherId, status: "active", file: "f", originalFileName: "x.txt" },
    ];
    const removeCalls = [];
    const Assignment = buildAssignmentStore(rows);
    const router = loadTeacherWithAssignments(
      { _id: otherTeacherId, role: "teacher" },
      Assignment,
      removeCalls
    );
    await withServer(
      (app) => app.use("/api/teacher", router),
      async (port) => {
        const single = await request(
          port,
          "PATCH",
          "/api/teacher/assignments/owned-by-t1/status",
          { body: { status: "archived" } }
        );
        assert.equal(single.status, 404);

        const bulk = await request(port, "POST", "/api/teacher/assignments/bulk-archive", {
          body: { ids: ["owned-by-t1"] },
        });
        assert.equal(bulk.status, 200);
        assert.equal(bulk.json.archived, 0);
        assert.equal(bulk.json.failed.length, 1);
      }
    );
    assert.equal(rows[0].status, "active");
    assert.equal(removeCalls.length, 0);
  });

  it("student DELETE submission APIs return 403 and do not delete files", async () => {
    const router = loadStudentRouter({ _id: studentId, role: "student" });
    await withServer(
      (app) => app.use("/api/student", router),
      async (port) => {
        const one = await request(port, "DELETE", "/api/student/submissions/sub1");
        assert.equal(one.status, 403);
        assert.match(String(one.json?.message || ""), /cannot delete submissions/i);

        const bulk = await request(port, "POST", "/api/student/submissions/bulk-delete", {
          body: { ids: ["sub1"] },
        });
        assert.equal(bulk.status, 403);
        assert.match(String(bulk.json?.message || ""), /cannot delete submissions/i);
      }
    );
  });

  it("OverflowMenu defers onSelect so Archive confirm is reliable", () => {
    const menuSrc = fs.readFileSync(
      path.resolve(__dirname, "../../frontend/src/components/ui/OverflowMenu.jsx"),
      "utf8"
    );
    assert.match(menuSrc, /setTimeout\(\(\) => select\(\),\s*0\)/);
  });

  it("teacher permanent delete route remains available and distinct from archive", () => {
    const routes = fs.readFileSync(teacherRoutesPath, "utf8");
    assert.match(routes, /bulk-archive/);
    assert.match(routes, /bulk-delete/);
    assert.match(routes, /deleteAssignment/);
    const dash = fs.readFileSync(teacherDashPath, "utf8");
    assert.match(dash, /handleDeleteAssignment/);
    assert.match(dash, /Delete Assignment/);
  });
});
