/**
 * QC-10F — Isolated academic workflow authorization / contract tests.
 * No real MongoDB or Gemini calls.
 */
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const Module = require("module");
const path = require("path");
const http = require("http");
const express = require("express");

const teacherRoutesPath = path.resolve(__dirname, "../routes/teacherRoutes.js");
const studentRoutesPath = path.resolve(__dirname, "../routes/studentRoutes.js");
const evaluationRoutesPath = path.resolve(__dirname, "../routes/evaluationRoutes.js");
const authMiddlewarePath = path.resolve(__dirname, "../middleware/authMiddleware.js");
const teacherControllerPath = path.resolve(__dirname, "../controllers/teacherController.js");
const evaluationControllerPath = path.resolve(__dirname, "../controllers/evaluationController.js");
const multerPath = path.resolve(__dirname, "../middleware/multerMiddleware.js");
const assignmentModelPath = path.resolve(__dirname, "../models/Assignment.js");
const submissionModelPath = path.resolve(__dirname, "../models/Submission.js");

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

function request(port, method, urlPath, { headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const data = body != null ? Buffer.from(JSON.stringify(body)) : null;
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: urlPath,
        method,
        headers: {
          ...(data
            ? { "Content-Length": data.length, "Content-Type": "application/json" }
            : {}),
          ...headers,
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const buf = Buffer.concat(chunks);
          resolve({ status: res.statusCode, text: buf.toString("utf8"), body: buf });
        });
      }
    );
    req.on("error", reject);
    if (data) req.write(data);
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
          return res.status(403).json({ message: `Access denied for role: ${req.user?.role}` });
        }
        return next();
      },
  };
}

function loadTeacherRouter(authedUser) {
  [
    teacherRoutesPath,
    teacherControllerPath,
    authMiddlewarePath,
    multerPath,
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
      return {
        single: () => passthrough,
        array: () => passthrough,
      };
    }
    if (
      request === "../controllers/teacherController" ||
      request.endsWith(`${path.sep}controllers${path.sep}teacherController.js`)
    ) {
      const ok = (_req, res) => res.json({ ok: true });
      const empty = (_req, res) => res.json([]);
      return {
        getOverviewStats: ok,
        getMyAssignments: empty,
        getRecentSubmissions: empty,
        getStudents: empty,
        getTeachers: empty,
        createAssignment: (_req, res) => res.status(201).json({ ok: true }),
        updateAssignment: ok,
        deleteAssignment: ok,
        deleteAssignmentsBulk: ok,
        archiveAssignmentsBulk: ok,
        updateAssignmentStatus: ok,
        evaluateWithGemini: ok,
        evaluateAssignment: ok,
        publishResults: ok,
        getSubmissionContent: ok,
        resetSubmissionGrade: ok,
        resetSubmissionGradesBulk: ok,
        deleteSubmission: ok,
        deleteSubmissionsBulk: ok,
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
        find: () => ({
          select: () => Promise.resolve(assignments),
          sort: () => ({ lean: async () => assignments }),
        }),
        findById: async (id) => assignments.find((a) => String(a._id) === String(id)) || null,
      };
    }
    if (
      request === "../models/Submission" ||
      request.endsWith(`${path.sep}models${path.sep}Submission.js`)
    ) {
      const findOneResult = (q) =>
        submissions.find(
          (s) =>
            String(s.assignment) === String(q.assignment) &&
            String(s.student) === String(q.student)
        ) || null;
      return {
        findOne: (q) => {
          // Support both await findOne(...) and findOne(...).lean()
          if (q && q._id && q.student) {
            const row =
              submissions.find(
                (s) =>
                  String(s._id) === String(q._id) &&
                  String(s.student) === String(q.student)
              ) || null;
            const promise = Promise.resolve(row);
            promise.lean = async () => row;
            return promise;
          }
          return {
            lean: async () => findOneResult(q),
          };
        },
        find: (q) => {
          if (q && q._id && q.student) {
            return Promise.resolve(
              submissions.filter(
                (s) =>
                  (Array.isArray(q._id.$in)
                    ? q._id.$in.map(String).includes(String(s._id))
                    : String(s._id) === String(q._id)) &&
                  String(s.student) === String(q.student)
              )
            );
          }
          return {
            populate: () => ({
              sort: () => ({
                lean: async () =>
                  submissions.filter((s) => String(s.student) === String(authedUser?._id)),
              }),
            }),
          };
        },
        create: async (doc) => ({ ...doc, _id: "new-sub" }),
        findOneAndDelete: async () => null,
        deleteMany: async () => ({ deletedCount: 0 }),
      };
    }
    if (
      request === "../controllers/notificationController" ||
      request.endsWith(`${path.sep}controllers${path.sep}notificationController.js`)
    ) {
      return { create: async () => null };
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
    return require(studentRoutesPath);
  } finally {
    Module._load = originalLoad;
  }
}

function loadEvaluationRouter(authedUser, submissionStore) {
  [evaluationRoutesPath, evaluationControllerPath, authMiddlewarePath].forEach((p) =>
    delete require.cache[p]
  );
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (
      request === "../middleware/authMiddleware" ||
      request.endsWith(`${path.sep}middleware${path.sep}authMiddleware.js`)
    ) {
      return mockAuth(authedUser);
    }
    if (
      request === "../models/Submission" ||
      request.endsWith(`${path.sep}models${path.sep}Submission.js`)
    ) {
      return {
        findOne: async (q) => {
          const row = submissionStore.find((s) => String(s._id) === String(q._id));
          if (!row) return null;
          if (q.teacherId && String(row.teacherId) !== String(q.teacherId)) return null;
          return row;
        },
        findOneAndUpdate: async (q, update) => {
          const row = submissionStore.find((s) => String(s._id) === String(q._id));
          if (!row) return null;
          if (q.teacherId && String(row.teacherId) !== String(q.teacherId)) return null;
          Object.assign(row, update);
          return row;
        },
        find: async (q) =>
          submissionStore.filter((s) => {
            if (q.teacherId && String(s.teacherId) !== String(q.teacherId)) return false;
            if (q._id?.$in) return q._id.$in.map(String).includes(String(s._id));
            return true;
          }),
      };
    }
    if (
      request === "../services/geminiService" ||
      request.endsWith(`${path.sep}services${path.sep}geminiService.js`)
    ) {
      return {
        checkAssignment: async () => {
          throw new Error("Gemini must not be called in this test");
        },
      };
    }
    if (
      request === "../utils/uploadsPath" ||
      request.endsWith(`${path.sep}utils${path.sep}uploadsPath.js`)
    ) {
      return {
        resolveStoredUploadPath: () => {
          throw new Error("missing");
        },
      };
    }
    return originalLoad(request, parent, isMain);
  };
  try {
    return require(evaluationRoutesPath);
  } finally {
    Module._load = originalLoad;
  }
}

describe("teacher route role enforcement", () => {
  it("rejects students from teacher endpoints", async () => {
    const router = loadTeacherRouter({ _id: "s1", role: "student" });
    await withServer(
      (app) => app.use("/api/teacher", router),
      async (port) => {
        const r = await request(port, "GET", "/api/teacher/my-assignments");
        assert.equal(r.status, 403);
      }
    );
  });

  it("allows authenticated teachers", async () => {
    const router = loadTeacherRouter({ _id: "t1", role: "teacher" });
    await withServer(
      (app) => app.use("/api/teacher", router),
      async (port) => {
        const r = await request(port, "GET", "/api/teacher/my-assignments");
        assert.equal(r.status, 200);
      }
    );
  });
});

describe("student route role enforcement and publish visibility", () => {
  it("rejects teachers from student endpoints", async () => {
    const router = loadStudentRouter({ _id: "t1", role: "teacher" });
    await withServer(
      (app) => app.use("/api/student", router),
      async (port) => {
        const r = await request(port, "GET", "/api/student/assignments");
        assert.equal(r.status, 403);
      }
    );
  });

  it("hides unpublished AI grades from students", async () => {
    const assignment = {
      _id: "a1",
      title: "A",
      status: "active",
      points: 100,
      subject: "CS",
    };
    const submissions = [
      {
        _id: "sub1",
        assignment: "a1",
        student: "stu1",
        status: "AI_GRADED",
        marks: 90,
        aiScore: 90,
        aiFeedback: "secret pre-publish",
        feedback: "",
        totalMarks: 100,
        originalFileName: "x.txt",
      },
    ];
    const router = loadStudentRouter(
      { _id: "stu1", role: "student", name: "Student" },
      { assignments: [assignment], submissions }
    );
    await withServer(
      (app) => app.use("/api/student", router),
      async (port) => {
        const r = await request(port, "GET", "/api/student/assignments");
        assert.equal(r.status, 200);
        const rows = JSON.parse(r.text);
        assert.equal(rows[0].marks, null);
        assert.equal(rows[0].aiFeedback, "");
        assert.equal(rows[0].resultStatus, "PENDING");
        assert.equal(rows[0].status, "submitted");
      }
    );
  });

  it("shows published grades to the owning student", async () => {
    const assignment = {
      _id: "a1",
      title: "A",
      status: "active",
      points: 100,
      subject: "CS",
    };
    const submissions = [
      {
        _id: "sub1",
        assignment: "a1",
        student: "stu1",
        status: "PUBLISHED",
        marks: 88,
        aiScore: 88,
        aiFeedback: "Good",
        feedback: "Good",
        totalMarks: 100,
        originalFileName: "x.txt",
      },
    ];
    const router = loadStudentRouter(
      { _id: "stu1", role: "student", name: "Student" },
      { assignments: [assignment], submissions }
    );
    await withServer(
      (app) => app.use("/api/student", router),
      async (port) => {
        const r = await request(port, "GET", "/api/student/assignments");
        assert.equal(r.status, 200);
        const rows = JSON.parse(r.text);
        assert.equal(rows[0].marks, 88);
        assert.equal(rows[0].resultStatus, "PUBLISHED");
      }
    );
  });
});

describe("legacy evaluation ownership", () => {
  it("blocks non-teachers", async () => {
    const router = loadEvaluationRouter({ _id: "s1", role: "student" }, []);
    await withServer(
      (app) => app.use("/api/evaluation", router),
      async (port) => {
        const r = await request(port, "POST", "/api/evaluation/update-grading", {
          body: { submissionId: "x", marks: 10 },
        });
        assert.equal(r.status, 403);
      }
    );
  });

  it("rejects grading another teacher's submission", async () => {
    const store = [{ _id: "sub1", teacherId: "owner", marks: null, status: "submitted" }];
    const router = loadEvaluationRouter({ _id: "other", role: "teacher" }, store);
    await withServer(
      (app) => app.use("/api/evaluation", router),
      async (port) => {
        const r = await request(port, "POST", "/api/evaluation/update-grading", {
          body: { submissionId: "sub1", marks: 10, feedback: "nope" },
        });
        assert.equal(r.status, 404);
      }
    );
  });

  it("allows owning teacher to update grading", async () => {
    const store = [{ _id: "sub1", teacherId: "owner", marks: null, status: "submitted" }];
    const router = loadEvaluationRouter({ _id: "owner", role: "teacher" }, store);
    await withServer(
      (app) => app.use("/api/evaluation", router),
      async (port) => {
        const r = await request(port, "POST", "/api/evaluation/update-grading", {
          body: { submissionId: "sub1", marks: 15, feedback: "ok" },
        });
        assert.equal(r.status, 200);
        assert.equal(store[0].marks, 15);
        assert.equal(store[0].status, "GRADED");
      }
    );
  });
});
