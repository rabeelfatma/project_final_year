/**
 * Regression: student /assignments keeps Teacher reference filename separate
 * from the student's submission filename. Isolated mocks only — no Mongo/R2.
 */
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const Module = require("module");
const path = require("path");
const fs = require("fs");
const http = require("http");
const express = require("express");

const studentRoutesPath = path.resolve(__dirname, "../routes/studentRoutes.js");
const authMiddlewarePath = path.resolve(__dirname, "../middleware/authMiddleware.js");
const multerPath = path.resolve(__dirname, "../middleware/multerMiddleware.js");
const assignmentModelPath = path.resolve(__dirname, "../models/Assignment.js");
const submissionModelPath = path.resolve(__dirname, "../models/Submission.js");
const fileControllerPath = path.resolve(__dirname, "../controllers/fileController.js");
const fileRoutesPath = path.resolve(__dirname, "../routes/fileRoutes.js");
const studentDashPath = path.resolve(
  __dirname,
  "../../frontend/src/pages/dashboards/StudentDashboard.jsx"
);

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

function request(port, method, urlPath, { headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: urlPath,
        method,
        headers,
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          resolve({
            status: res.statusCode,
            text: Buffer.concat(chunks).toString("utf8"),
          });
        });
      }
    );
    req.on("error", reject);
    req.end();
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

function loadStudentRouter(authedUser, { assignments = [], submissions = [] } = {}) {
  [
    studentRoutesPath,
    authMiddlewarePath,
    multerPath,
    assignmentModelPath,
    submissionModelPath,
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
      return {
        find: (q) => ({
          sort: () => ({
            lean: async () =>
              assignments.filter((a) =>
                q?.status ? a.status === q.status : true
              ),
          }),
          select: () => Promise.resolve(assignments),
        }),
        findById: async (id) =>
          assignments.find((a) => String(a._id) === String(id)) || null,
      };
    }
    if (
      request === "../models/Submission" ||
      request.endsWith(`${path.sep}models${path.sep}Submission.js`)
    ) {
      return {
        findOne: (q) => {
          const row =
            submissions.find(
              (s) =>
                String(s.assignment) === String(q.assignment) &&
                String(s.student) === String(q.student)
            ) || null;
          const promise = Promise.resolve(row);
          promise.lean = async () => row;
          return promise;
        },
        find: () => ({
          populate: () => ({
            sort: () => ({
              lean: async () =>
                submissions.filter(
                  (s) => String(s.student) === String(authedUser?._id)
                ),
            }),
          }),
        }),
        create: async (doc) => ({ ...doc, _id: "new-sub" }),
      };
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
        remove: async () => {},
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
}

describe("student assignment filename mapping", () => {
  const student = { _id: "stu1", role: "student", name: "Student One" };
  const assignmentBase = {
    _id: "asn1",
    title: "Week 3 Lab",
    status: "active",
    points: 20,
    subject: "CS",
    file: "uploads/assignments/ref-123.txt",
    originalFileName: "teacher-brief.txt",
    startDate: new Date(Date.now() - 86400000).toISOString(),
    deadline: new Date(Date.now() + 86400000).toISOString(),
  };

  it("keeps assignment reference filename when student has not submitted", async () => {
    const router = loadStudentRouter(student, {
      assignments: [assignmentBase],
      submissions: [],
    });
    await withServer(
      (app) => app.use("/api/student", router),
      async (port) => {
        const r = await request(port, "GET", "/api/student/assignments");
        assert.equal(r.status, 200);
        const rows = JSON.parse(r.text);
        assert.equal(rows.length, 1);
        assert.equal(rows[0].title, "Week 3 Lab");
        assert.equal(rows[0].originalFileName, "teacher-brief.txt");
        assert.equal(rows[0].submissionOriginalFileName, "");
        assert.equal(rows[0].isSubmitted, false);
        assert.equal(rows[0].submissionId, null);
      }
    );
  });

  it("returns submission filename separately without overwriting assignment reference name", async () => {
    const router = loadStudentRouter(student, {
      assignments: [assignmentBase],
      submissions: [
        {
          _id: "sub1",
          assignment: "asn1",
          student: "stu1",
          status: "submitted",
          originalFileName: "my-answer.pdf",
        },
      ],
    });
    await withServer(
      (app) => app.use("/api/student", router),
      async (port) => {
        const r = await request(port, "GET", "/api/student/assignments");
        assert.equal(r.status, 200);
        const rows = JSON.parse(r.text);
        assert.equal(rows[0].originalFileName, "teacher-brief.txt");
        assert.equal(rows[0].submissionOriginalFileName, "my-answer.pdf");
        assert.notEqual(
          rows[0].originalFileName,
          rows[0].submissionOriginalFileName
        );
        assert.equal(rows[0].isSubmitted, true);
        assert.equal(rows[0].submissionId, "sub1");
        assert.equal(rows[0].status, "submitted");
      }
    );
  });

  it("rejects non-students from student assignments API", async () => {
    const router = loadStudentRouter(
      { _id: "t1", role: "teacher", name: "Teacher" },
      { assignments: [assignmentBase], submissions: [] }
    );
    await withServer(
      (app) => app.use("/api/student", router),
      async (port) => {
        const r = await request(port, "GET", "/api/student/assignments");
        assert.equal(r.status, 403);
      }
    );
  });

  it("preserves download ownership checks in fileController / fileRoutes", () => {
    const ctrl = fs.readFileSync(fileControllerPath, "utf8");
    const routes = fs.readFileSync(fileRoutesPath, "utf8");
    assert.match(routes, /router\.use\(protect\)/);
    assert.match(ctrl, /isOwnerTeacher/);
    assert.match(ctrl, /isStudentActive/);
    assert.match(ctrl, /String\(s\.student\) === String\(req\.user\._id\)/);
    assert.match(ctrl, /String\(s\.teacherId\) === String\(req\.user\._id\)/);
    assert.match(ctrl, /originalFileName/);
  });

  it("StudentDashboard uses assignment vs submission filenames for the correct actions", () => {
    const dash = fs.readFileSync(studentDashPath, "utf8");
    assert.match(dash, /submissionOriginalFileName/);
    assert.match(
      dash,
      /previewAssignment\(selectedAsgn\._id\),\s*selectedAsgn\.originalFileName/
    );
    assert.match(
      dash,
      /downloadAssignment\(selectedAsgn\._id\),\s*`\$\{selectedAsgn\.originalFileName/
    );
    assert.match(
      dash,
      /previewSubmission\(selectedAsgn\.submissionId\),\s*selectedAsgn\.submissionOriginalFileName/
    );
    assert.match(
      dash,
      /downloadSubmission\(selectedAsgn\.submissionId\),\s*selectedAsgn\.submissionOriginalFileName/
    );
  });
});
