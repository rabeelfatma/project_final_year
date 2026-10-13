/**
 * QC-21 — Isolated full academic workflow (HTTP + in-memory persistence).
 * Never connects to Atlas / quickcheck_rabeel_demo.
 * Gemini is mocked; no real provider calls.
 */
const { describe, it, before } = require("node:test");
const assert = require("node:assert/strict");
const Module = require("module");
const path = require("path");
const http = require("http");
const express = require("express");
const fs = require("fs");
const os = require("os");

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

const teacherId = "t1";
const studentId = "s1";
const otherTeacherId = "t2";

function request(port, method, urlPath, { headers = {}, body, raw } = {}) {
  return new Promise((resolve, reject) => {
    const payload =
      raw != null
        ? Buffer.from(raw)
        : body != null
          ? Buffer.from(JSON.stringify(body))
          : null;
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
                "Content-Type":
                  headers["Content-Type"] || "application/json",
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
    app.use(express.json({ limit: "2mb" }));
    app.use(express.urlencoded({ extended: true }));
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

function makeId(prefix) {
  return `${prefix}_${Math.random().toString(16).slice(2, 10)}`;
}

describe("QC-21 full academic workflow (isolated HTTP)", () => {
  let assignments = [];
  let submissions = [];
  let notifications = [];
  let uploadsRoot = "";
  let authedUser = null;

  function clearCaches() {
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
    ].forEach((p) => delete require.cache[p]);
  }

  function buildModels() {
    const Assignment = {
      create: async (doc) => {
        const row = {
          ...doc,
          _id: makeId("a"),
          createdAt: new Date(),
          toObject() {
            return this;
          },
        };
        assignments.push(row);
        return row;
      },
      find: (q = {}) => {
        let rows = assignments.slice();
        if (q.teacher) rows = rows.filter((a) => String(a.teacher) === String(q.teacher));
        if (q.status) rows = rows.filter((a) => a.status === q.status);
        if (q._id?.$in) {
          const set = new Set(q._id.$in.map(String));
          rows = rows.filter((a) => set.has(String(a._id)));
        }
        const api = {
          select() {
            return api;
          },
          sort() {
            return api;
          },
          lean: async () => rows,
          then(resolve, reject) {
            return Promise.resolve(rows).then(resolve, reject);
          },
        };
        return api;
      },
      findById: async (id) =>
        assignments.find((a) => String(a._id) === String(id)) || null,
      findOne: async (q) => {
        if (q._id && q.teacher) {
          return (
            assignments.find(
              (a) =>
                String(a._id) === String(q._id) &&
                String(a.teacher) === String(q.teacher)
            ) || null
          );
        }
        return null;
      },
    };

    const wrapSubmission = (row) => {
      if (!row) return null;
      row.save = async function save() {
        const idx = submissions.findIndex((s) => String(s._id) === String(this._id));
        if (idx >= 0) submissions[idx] = this;
        else submissions.push(this);
        return this;
      };
      row.populate = function populate(field, select) {
        if (field === "assignment") {
          const a = assignments.find(
            (x) => String(x._id) === String(this.assignment)
          );
          if (a) {
            if (select) {
              const picked = { _id: a._id };
              String(select)
                .split(/\s+/)
                .filter(Boolean)
                .forEach((k) => {
                  picked[k] = a[k];
                });
              this.assignment = picked;
            } else this.assignment = a;
          }
        }
        if (field === "student") {
          this.student = {
            _id: this.student,
            name: "Student One",
            email: "student@example.com",
            registrationNumber: "SP21-BCS-001",
          };
        }
        return this;
      };
      return row;
    };

    const Submission = {
      create: async (doc) => {
        const row = wrapSubmission({
          ...doc,
          _id: makeId("sub"),
          aiScore: null,
          aiFeedback: "",
          aiStrengths: [],
          aiImprovements: [],
          marks: null,
          feedback: "",
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        submissions.push(row);
        return row;
      },
      findOne: (q) => {
        const assignmentKey = (value) => String(value?._id || value || "");
        let row =
          submissions.find((s) => {
            if (q._id && String(s._id) !== String(q._id)) return false;
            if (q.teacherId && String(s.teacherId) !== String(q.teacherId))
              return false;
            if (
              q.assignment &&
              assignmentKey(s.assignment) !== assignmentKey(q.assignment)
            )
              return false;
            if (q.student && String(s.student?._id || s.student) !== String(q.student))
              return false;
            return true;
          }) || null;
        row = wrapSubmission(row);
        const promise = Promise.resolve(row);
        promise.populate = async (field, select) => {
          if (!row) return null;
          return row.populate(field, select);
        };
        promise.lean = async () => {
          if (!row) return null;
          const plain = { ...row };
          delete plain.save;
          delete plain.populate;
          return plain;
        };
        return promise;
      },
      find: (q = {}) => {
        const assignmentKey = (value) => String(value?._id || value || "");
        let rows = submissions.filter((s) => {
          if (q.teacherId && String(s.teacherId) !== String(q.teacherId))
            return false;
          if (q.student && String(s.student?._id || s.student) !== String(q.student))
            return false;
          if (q.assignment?.$in) {
            const set = new Set(q.assignment.$in.map(String));
            if (!set.has(assignmentKey(s.assignment))) return false;
          }
          if (q._id?.$in) {
            const set = new Set(q._id.$in.map(String));
            if (!set.has(String(s._id))) return false;
          }
          return true;
        });
        rows = rows.map((r) => wrapSubmission({ ...r }));
        const api = {
          populate() {
            return api;
          },
          sort() {
            return api;
          },
          lean: async () =>
            rows.map((r) => {
              const plain = { ...r };
              delete plain.save;
              delete plain.populate;
              const a = assignments.find(
                (x) => String(x._id) === String(plain.assignment)
              );
              if (a) {
                plain.assignment = {
                  _id: a._id,
                  title: a.title,
                  points: a.points,
                  subject: a.subject,
                };
              }
              return plain;
            }),
          then(resolve, reject) {
            // emulate await Submission.find(...).populate().sort()
            rows.forEach((r) => {
              r.populate("assignment", "title points file originalFileName fileMimeType");
              r.populate("student", "name email registrationNumber");
            });
            return Promise.resolve(rows).then(resolve, reject);
          },
        };
        return api;
      },
      findOneAndUpdate: async () => null,
      deleteMany: async () => ({ deletedCount: 0 }),
    };

    const User = {
      find: () => ({
        select: async () => [{ _id: studentId }],
      }),
    };

    return { Assignment, Submission, User };
  }

  function loadAppRouters() {
    clearCaches();
    const models = buildModels();
    const originalLoad = Module._load;
    Module._load = function (request, parent, isMain) {
      const req = String(request || "").replace(/\\/g, "/");
      const is = (suffix) => req === suffix || req.endsWith(suffix);

      if (is("middleware/authMiddleware") || is("middleware/authMiddleware.js")) {
        return {
          protect: (reqObj, res, next) => {
            if (!authedUser) return res.status(401).json({ message: "No token" });
            reqObj.user = authedUser;
            return next();
          },
          authorize:
            (...roles) =>
            (reqObj, res, next) => {
              if (!reqObj.user || !roles.includes(reqObj.user.role)) {
                return res
                  .status(403)
                  .json({ message: `Access denied for role: ${reqObj.user?.role}` });
              }
              return next();
            },
        };
      }
      if (is("middleware/multerMiddleware") || is("middleware/multerMiddleware.js")) {
        const passthrough = (_req, _res, next) => next();
        return { single: () => passthrough, array: () => passthrough };
      }
      if (is("models/Assignment") || is("models/Assignment.js")) {
        return models.Assignment;
      }
      if (is("models/Submission") || is("models/Submission.js")) {
        return models.Submission;
      }
      if (is("models/User") || is("models/User.js")) {
        return models.User;
      }
      if (is("services/geminiService") || is("services/geminiService.js")) {
        return {
          checkAssignment: async (text, _instructions, totalMarks) => {
            assert.ok(String(text || "").length > 0, "grading must receive text");
            assert.ok(Number(totalMarks) > 0);
            return {
              score: Math.min(Number(totalMarks), 16),
              feedback: "Solid answer with clear points.",
              strengths: ["Explained the concept"],
              improvements: ["Add an example"],
            };
          },
        };
      }
      if (is("services/plagiarismService") || is("services/plagiarismService.js")) {
        return {
          extractText: async (filePath) =>
            fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "",
        };
      }
      if (
        is("controllers/notificationController") ||
        is("controllers/notificationController.js") ||
        req === "./notificationController" ||
        req.endsWith("/notificationController") ||
        req.endsWith("/notificationController.js")
      ) {
        return {
          create: async (payload) => {
            notifications.push(payload);
            return payload;
          },
        };
      }
      if (is("utils/uploadsPath") || is("utils/uploadsPath.js")) {
        return {
          getUploadsRoot: () => uploadsRoot,
          ensureUploadSubdirs: () => {
            for (const name of ["assignments", "submissions"]) {
              fs.mkdirSync(path.join(uploadsRoot, name), { recursive: true });
            }
            return uploadsRoot;
          },
          resolveStoredUploadPath: (stored) => {
            const raw = String(stored || "").replace(/^uploads[\\/]/, "");
            return path.join(uploadsRoot, raw);
          },
          configureUploadStatic: () => {},
        };
      }
      return originalLoad(request, parent, isMain);
    };

    try {
      const teacherRoutes = require(teacherRoutesPath);
      const studentRoutes = require(studentRoutesPath);
      return { teacherRoutes, studentRoutes };
    } finally {
      Module._load = originalLoad;
    }
  }

  before(() => {
    uploadsRoot = fs.mkdtempSync(path.join(os.tmpdir(), "qc21-uploads-"));
    fs.mkdirSync(path.join(uploadsRoot, "submissions"), { recursive: true });
  });

  it("runs Teacher→Assignment→Student→Submit→Mock Gemini→Publish→Student result", async () => {
    assignments = [];
    submissions = [];
    notifications = [];
    const { teacherRoutes, studentRoutes } = loadAppRouters();

    await withServer(
      (app) => {
        app.use("/api/teacher", teacherRoutes);
        app.use("/api/student", studentRoutes);
      },
      async (port) => {
        // 1-2 identities via auth mock
        authedUser = {
          _id: teacherId,
          role: "teacher",
          name: "Teacher One",
          subject: "SE",
        };

        // 3. Teacher creates assignment
        const created = await request(port, "POST", "/api/teacher/assignments", {
          body: {
            title: "QC21 Sample",
            description: "Explain unit testing in one short paragraph.",
            startDate: new Date(Date.now() - 3600_000).toISOString(),
            deadline: new Date(Date.now() + 7 * 86400_000).toISOString(),
            points: 20,
            subject: "SE",
          },
        });
        assert.equal(created.status, 201, created.text);
        assert.equal(created.json.title, "QC21 Sample");
        assert.equal(created.json.points, 20);
        assert.equal(created.json.status, "active");
        const assignmentId = created.json._id;

        // 4. Assignment is available (active)
        assert.equal(assignments[0].status, "active");

        // 5. Student fetches assignment
        authedUser = {
          _id: studentId,
          role: "student",
          name: "Student One",
        };
        const listed = await request(port, "GET", "/api/student/assignments");
        assert.equal(listed.status, 200);
        assert.equal(listed.json.length, 1);
        assert.equal(listed.json[0]._id, assignmentId);
        assert.equal(listed.json[0].canSubmit, true);
        assert.equal(listed.json[0].marks, null);

        // 6-7. Student submits text answer (persisted)
        const submitted = await request(
          port,
          "POST",
          `/api/student/assignments/${assignmentId}/submit`,
          {
            body: {
              answerText:
                "Unit testing verifies individual functions behave as expected using automated assertions.",
            },
          }
        );
        assert.equal(submitted.status, 201, submitted.text);
        assert.equal(submitted.json.success, true);
        assert.equal(submissions.length, 1);
        assert.equal(submissions[0].status, "submitted");
        assert.match(submissions[0].answerText, /Unit testing/i);
        const submissionId = submissions[0]._id;

        // Duplicate blocked
        const dup = await request(
          port,
          "POST",
          `/api/student/assignments/${assignmentId}/submit`,
          { body: { answerText: "duplicate attempt should fail" } }
        );
        assert.equal(dup.status, 400);

        // 8. Teacher retrieves submission
        authedUser = {
          _id: teacherId,
          role: "teacher",
          name: "Teacher One",
        };
        const recent = await request(port, "GET", "/api/teacher/recent-submissions");
        assert.equal(recent.status, 200);
        assert.equal(recent.json.length, 1);
        assert.equal(String(recent.json[0]._id), String(submissionId));

        // Other teacher cannot grade
        authedUser = { _id: otherTeacherId, role: "teacher", name: "Other" };
        const stolen = await request(port, "POST", "/api/teacher/evaluate-ai", {
          body: {
            submissionIds: [submissionId],
            teacherInstructions: "Grade accuracy out of maximum marks.",
          },
        });
        assert.equal(stolen.status, 200);
        assert.equal(stolen.json.results?.[0]?.status, "Failed");

        // 9. Owning teacher runs mocked Gemini grading
        authedUser = {
          _id: teacherId,
          role: "teacher",
          name: "Teacher One",
        };
        const graded = await request(port, "POST", "/api/teacher/evaluate-ai", {
          body: {
            submissionIds: [submissionId],
            teacherInstructions: "Grade accuracy and clarity out of maximum marks.",
          },
        });
        assert.equal(graded.status, 200, graded.text);
        assert.equal(graded.json.results?.[0]?.status, "Success");
        assert.equal(submissions[0].status, "AI_GRADED");
        assert.equal(submissions[0].aiScore, 16);
        assert.equal(submissions[0].totalMarks, 20);
        assert.ok(Array.isArray(submissions[0].aiStrengths));
        assert.ok(submissions[0].aiStrengths.length >= 1);

        // 10-11. Student cannot see unpublished evaluation
        authedUser = {
          _id: studentId,
          role: "student",
          name: "Student One",
        };
        const hidden = await request(port, "GET", "/api/student/assignments");
        assert.equal(hidden.json[0].marks, null);
        assert.equal(hidden.json[0].aiFeedback, "");
        assert.equal(hidden.json[0].resultStatus, "PENDING");
        assert.equal(hidden.json[0].status, "submitted");

        const hiddenSubs = await request(port, "GET", "/api/student/my-submissions");
        assert.equal(hiddenSubs.json[0].marks, null);
        assert.equal(hiddenSubs.json[0].aiScore, null);

        // 12-13. Teacher publishes
        authedUser = {
          _id: teacherId,
          role: "teacher",
          name: "Teacher One",
        };
        const published = await request(port, "POST", "/api/teacher/publish-results", {
          body: { submissionIds: [submissionId] },
        });
        assert.equal(published.status, 200);
        assert.equal(published.json.published, 1);
        assert.equal(submissions[0].status, "PUBLISHED");

        // Idempotent publish (no extra spam count)
        const republish = await request(port, "POST", "/api/teacher/publish-results", {
          body: { submissionIds: [submissionId] },
        });
        assert.equal(republish.json.published, 0);

        // 14-15. Student retrieves published marks/feedback; dashboards align
        authedUser = {
          _id: studentId,
          role: "student",
          name: "Student One",
        };
        const visible = await request(port, "GET", "/api/student/assignments");
        assert.equal(visible.json[0].marks, 16);
        assert.equal(visible.json[0].totalMarks, 20);
        assert.match(String(visible.json[0].aiFeedback || visible.json[0].feedback), /Solid/i);
        assert.equal(visible.json[0].resultStatus, "PUBLISHED");
        assert.deepEqual(visible.json[0].aiStrengths, ["Explained the concept"]);

        const stats = await request(port, "GET", "/api/student/dashboard-stats");
        assert.equal(stats.status, 200);
        assert.equal(stats.json.tasksCompleted, 1);
        assert.ok(stats.json.averageScore > 0);

        // Teacher content endpoint
        authedUser = {
          _id: teacherId,
          role: "teacher",
          name: "Teacher One",
        };
        const content = await request(
          port,
          "GET",
          `/api/teacher/submissions/${submissionId}/content`
        );
        assert.equal(content.status, 200);
        assert.match(content.json.extractedText || content.json.answerText, /Unit testing/i);
      }
    );
  });
});
