const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const http = require("http");
const express = require("express");

const root = path.join(__dirname, "..");
const providerPath = path.join(root, "services/turnitinProvider.js");
const modelPath = path.join(root, "models/SimilarityCheck.js");
const controllerPath = path.join(root, "controllers/plagiarismController.js");
const routesPath = path.join(root, "routes/plagiarismRoutes.js");
const teacherDashPath = path.join(
  root,
  "../frontend/src/pages/dashboards/TeacherDashboard.jsx"
);

describe("Turnitin-ready plagiarism architecture (isolated)", () => {
  it("provider refuses when not configured and never invents scores", async () => {
    const provider = require("../services/turnitinProvider");
    const prevEnabled = process.env.TURNITIN_ENABLED;
    const prevKey = process.env.TURNITIN_API_KEY;
    const prevBase = process.env.TURNITIN_API_BASE_URL;
    delete process.env.TURNITIN_ENABLED;
    delete process.env.TURNITIN_API_KEY;
    delete process.env.TURNITIN_API_BASE_URL;
    try {
      assert.equal(provider.isConfigured(), false);
      const state = provider.getConnectionState();
      assert.equal(state.status, "provider_not_connected");
      assert.equal(state.connected, false);
      await assert.rejects(async () => provider.createSubmission({}), (err) => {
        assert.equal(err.code, "PROVIDER_NOT_CONNECTED");
        return true;
      });
      const publicCheck = provider.toPublicCheck({
        status: "queued",
        similarityPercent: 88,
        matchedSources: [{ title: "x" }],
      });
      // Non-completed statuses must not surface a percentage.
      assert.equal(publicCheck.similarityPercent, null);
      const completed = provider.toPublicCheck({
        status: "completed",
        similarityPercent: 42.5,
        providerReportId: "r1",
        reportAvailable: true,
      });
      assert.equal(completed.similarityPercent, 42.5);
      assert.equal(completed.reportAvailable, true);
    } finally {
      if (prevEnabled === undefined) delete process.env.TURNITIN_ENABLED;
      else process.env.TURNITIN_ENABLED = prevEnabled;
      if (prevKey === undefined) delete process.env.TURNITIN_API_KEY;
      else process.env.TURNITIN_API_KEY = prevKey;
      if (prevBase === undefined) delete process.env.TURNITIN_API_BASE_URL;
      else process.env.TURNITIN_API_BASE_URL = prevBase;
    }
  });

  it("rejects invalid modes", () => {
    const provider = require("../services/turnitinProvider");
    assert.throws(() => provider.assertValidMode("jaccard"), (err) => {
      assert.equal(err.code, "INVALID_MODE");
      return true;
    });
    assert.equal(
      provider.assertValidMode("external_sources"),
      "external_sources"
    );
    assert.equal(
      provider.assertValidMode("student_paper_repository"),
      "student_paper_repository"
    );
  });

  it("model and routes declare provider statuses and ownership APIs", () => {
    const model = fs.readFileSync(modelPath, "utf8");
    const routes = fs.readFileSync(routesPath, "utf8");
    const controller = fs.readFileSync(controllerPath, "utf8");
    assert.match(model, /provider_not_connected/);
    assert.match(model, /external_sources/);
    assert.match(model, /student_paper_repository/);
    assert.match(model, /similarityPercent/);
    assert.doesNotMatch(model, /jaccard/i);
    assert.match(routes, /router\.post\("\/checks"/);
    assert.match(routes, /router\.get\("\/checks"/);
    assert.match(routes, /router\.get\("\/checks\/:id\/report"/);
    assert.match(routes, /authorize\("teacher", "admin"\)/);
    assert.match(controller, /PROVIDER_NOT_CONNECTED/);
    assert.match(controller, /ownershipFilter/);
    assert.match(controller, /assignmentOwnershipFilter/);
    assert.match(controller, /MIXED_ASSIGNMENT_SUBMISSIONS/);
    assert.match(controller, /INVALID_ASSIGNMENT_ID/);
    assert.match(controller, /teacherId: user\._id/);
    assert.doesNotMatch(controller, /compareTexts/);
    assert.doesNotMatch(controller, /Local text-shingle/);
  });

  it("Teacher Plagiarism UI does not render local Jaccard as Turnitin", () => {
    const dash = fs.readFileSync(teacherDashPath, "utf8");
    assert.match(dash, /Provider Not Connected|provider_not_connected|PROVIDER_NOT_CONNECTED/);
    assert.match(dash, /Plagiarism Checker/);
    assert.match(dash, /label=["']Plagiarism["']/);
    assert.match(dash, /external_sources|External Sources|PLAGIARISM_MODES\.EXTERNAL_SOURCES/);
    assert.match(
      dash,
      /student_paper_repository|Student Paper Repository|PLAGIARISM_MODES\.STUDENT_PAPER_REPOSITORY/
    );
    assert.match(dash, /plagiarismSelectedAssignmentIds|plagiarismAssignmentFilter/);
    assert.match(dash, /preserveError/);
    assert.doesNotMatch(dash, /Local text-shingle similarity/);
    assert.doesNotMatch(dash, /Highest Similarity/);
  });

  it("provider-status route is mounted under /api/plagiarism", () => {
    const appFull = fs.readFileSync(path.join(root, "appFull.js"), "utf8");
    const routes = fs.readFileSync(routesPath, "utf8");
    assert.match(appFull, /app\.use\("\/api\/plagiarism", plagiarismRoutes\)/);
    assert.match(routes, /router\.get\("\/provider-status"/);
    assert.match(routes, /router\.get\("\/checks"/);
    assert.match(routes, /router\.post\("\/checks"/);
  });
});

describe("Turnitin plagiarism HTTP contracts (mock app)", () => {
  let server;
  let port;
  let SimilarityCheck;
  let store;

  before(async () => {
    // Lightweight in-memory stand-in so tests do not touch Atlas / production.
    store = [];
    const mockModel = function SimilarityCheckMock(doc) {
      Object.assign(this, doc);
      this._id = doc._id || `chk_${store.length + 1}`;
      this.toObject = () => ({ ...this });
      this.save = async () => {
        const idx = store.findIndex((row) => String(row._id) === String(this._id));
        if (idx >= 0) store[idx] = { ...this };
        else store.push({ ...this });
        return this;
      };
    };
    mockModel.create = async (doc) => {
      const row = new mockModel(doc);
      await row.save();
      return row;
    };
    mockModel.find = (filter = {}) => {
      let rows = store.filter((row) => {
        if (filter.teacherId && String(row.teacherId) !== String(filter.teacherId)) {
          return false;
        }
        if (filter._id && String(row._id) !== String(filter._id)) return false;
        if (filter.submission && String(row.submission) !== String(filter.submission)) {
          return false;
        }
        return true;
      });
      const query = {
        sort() {
          return query;
        },
        limit() {
          return query;
        },
        populate() {
          return query;
        },
        lean: async () => rows.map((row) => ({ ...row })),
        then: (resolve, reject) =>
          Promise.resolve(rows.map((row) => ({ ...row }))).then(resolve, reject),
      };
      return query;
    };
    mockModel.findOne = async (filter = {}) => {
      const row = store.find((item) => {
        if (filter._id && String(item._id) !== String(filter._id)) return false;
        if (filter.teacherId && String(item.teacherId) !== String(filter.teacherId)) {
          return false;
        }
        return true;
      });
      if (!row) return null;
      return new mockModel({ ...row });
    };

    // Stub Submission.find used by createChecks.
    const Submission = {
      find: (filter) => {
        const ids = (filter._id && filter._id.$in) || [];
        const teacherId = filter.teacherId;
        const rows = [
          {
            _id: "507f1f77bcf86cd799439011",
            teacherId: "507f1f77bcf86cd7994390aa",
            student: { _id: "507f1f77bcf86cd7994390bb", name: "Ada" },
            assignment: { _id: "507f1f77bcf86cd7994390cc", title: "Lab 1", points: 20 },
            originalFileName: "essay.pdf",
            file: "uploads/submissions/essay.pdf",
          },
          {
            _id: "507f1f77bcf86cd799439013",
            teacherId: "507f1f77bcf86cd7994390aa",
            student: { _id: "507f1f77bcf86cd7994390bf", name: "Grace" },
            assignment: { _id: "507f1f77bcf86cd7994390cc", title: "Lab 1", points: 20 },
            originalFileName: "grace.docx",
            file: "uploads/submissions/grace.docx",
          },
          {
            _id: "507f1f77bcf86cd799439012",
            teacherId: "507f1f77bcf86cd7994390zz",
            student: { _id: "507f1f77bcf86cd7994390dd", name: "Other" },
            assignment: { _id: "507f1f77bcf86cd7994390ee", title: "Lab 2", points: 20 },
            originalFileName: "other.pdf",
            file: "uploads/submissions/other.pdf",
          },
        ].filter((row) => {
          if (ids.length && !ids.map(String).includes(String(row._id))) return false;
          if (teacherId && String(row.teacherId) !== String(teacherId)) return false;
          return true;
        });
        return {
          populate() {
            return this;
          },
          then: (resolve, reject) => Promise.resolve(rows).then(resolve, reject),
        };
      },
    };

    // Inject stubs via require cache before loading controller routes carefully.
    // For HTTP tests we mount a minimal express app with inline handlers mirroring contracts.
    const turnitinProvider = require("../services/turnitinProvider");
    delete process.env.TURNITIN_ENABLED;
    delete process.env.TURNITIN_API_KEY;
    delete process.env.TURNITIN_API_BASE_URL;

    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.user = req.headers["x-test-user"]
        ? JSON.parse(req.headers["x-test-user"])
        : { _id: "507f1f77bcf86cd7994390aa", role: "teacher" };
      next();
    });

    app.get("/api/plagiarism/provider-status", (_req, res) => {
      res.json({ success: true, ...turnitinProvider.getConnectionState() });
    });

    const assignmentsByTeacher = {
      "507f1f77bcf86cd7994390aa": [
        { _id: "507f1f77bcf86cd7994390cc", title: "Lab 1", teacher: "507f1f77bcf86cd7994390aa" },
      ],
    };

    app.post("/api/plagiarism/checks", async (req, res) => {
      try {
        const mode = turnitinProvider.assertValidMode(req.body?.mode);
        const assignmentId = String(req.body?.assignmentId || "").trim();
        const ids = Array.isArray(req.body?.submissionIds)
          ? [...new Set(req.body.submissionIds.map(String))]
          : [];
        if (!assignmentId) {
          return res.status(400).json({
            success: false,
            code: "INVALID_ASSIGNMENT_ID",
            message: "Select a valid assignment before checking plagiarism.",
          });
        }
        if (!ids.length) {
          return res.status(400).json({
            success: false,
            code: "INVALID_SUBMISSION_IDS",
            message: "Select at least one valid submission.",
          });
        }
        const ownedAssignments =
          req.user.role === "admin"
            ? Object.values(assignmentsByTeacher).flat()
            : assignmentsByTeacher[req.user._id] || [];
        const assignment = ownedAssignments.find(
          (row) => String(row._id) === String(assignmentId)
        );
        if (!assignment) {
          return res.status(404).json({
            success: false,
            code: "ASSIGNMENT_NOT_FOUND",
            message: "Assignment not found for this account.",
          });
        }
        const submissions = await Submission.find({
          _id: { $in: ids },
          ...(req.user.role === "admin" ? {} : { teacherId: req.user._id }),
        });
        const scoped = submissions.filter(
          (row) => String(row.assignment._id) === String(assignmentId)
        );
        if (!scoped.length) {
          return res.status(404).json({
            success: false,
            code: "SUBMISSIONS_NOT_FOUND",
            message: "No matching submissions found for this assignment and account.",
          });
        }
        if (scoped.length !== ids.length) {
          return res.status(400).json({
            success: false,
            code: "MIXED_ASSIGNMENT_SUBMISSIONS",
            message:
              "Every selected submission must belong to the chosen assignment owned by this teacher.",
          });
        }
        if (!turnitinProvider.isConfigured()) {
          const checks = [];
          for (const submission of scoped) {
            const row = await mockModel.create({
              submission: submission._id,
              assignment: submission.assignment._id,
              teacherId: submission.teacherId,
              studentId: submission.student._id,
              mode,
              status: "provider_not_connected",
              similarityPercent: null,
              matchedSources: [],
              highlightedPassages: [],
              reportAvailable: false,
              errorCode: "PROVIDER_NOT_CONNECTED",
              errorMessage: "Turnitin is not configured.",
            });
            checks.push(
              turnitinProvider.toPublicCheck({
                ...row.toObject(),
                student: { _id: submission.student._id, name: submission.student.name },
                assignmentTitle: submission.assignment.title,
              })
            );
          }
          return res.status(503).json({
            success: false,
            code: "PROVIDER_NOT_CONNECTED",
            message: "Turnitin provider is not connected.",
            checks,
          });
        }
        return res.status(201).json({ success: true, checks: [] });
      } catch (error) {
        if (error.code === "INVALID_MODE") {
          return res.status(400).json({
            success: false,
            code: "INVALID_MODE",
            message: error.message,
          });
        }
        return res.status(500).json({ success: false, message: error.message });
      }
    });

    app.get("/api/plagiarism/checks/:id", async (req, res) => {
      const row = await mockModel.findOne({
        _id: req.params.id,
        ...(req.user.role === "admin" ? {} : { teacherId: req.user._id }),
      });
      if (!row) {
        return res.status(404).json({
          success: false,
          code: "CHECK_NOT_FOUND",
          message: "Similarity check not found.",
        });
      }
      return res.json({ success: true, check: turnitinProvider.toPublicCheck(row) });
    });

    app.get("/api/plagiarism/checks/:id/report", async (req, res) => {
      const row = await mockModel.findOne({
        _id: req.params.id,
        ...(req.user.role === "admin" ? {} : { teacherId: req.user._id }),
      });
      if (!row) {
        return res.status(404).json({
          success: false,
          code: "CHECK_NOT_FOUND",
          message: "Similarity check not found.",
        });
      }
      if (!turnitinProvider.isConfigured()) {
        return res.status(503).json({
          success: false,
          code: "PROVIDER_NOT_CONNECTED",
          message: "Turnitin provider is not connected.",
        });
      }
      if (row.status !== "completed" || !row.reportAvailable) {
        return res.status(404).json({
          success: false,
          code: "REPORT_NOT_AVAILABLE",
          message: "No provider report is available for this check yet.",
        });
      }
      return res.json({
        success: true,
        report: {
          similarityPercent: row.similarityPercent,
          matchedSources: row.matchedSources,
          highlightedPassages: row.highlightedPassages,
        },
      });
    });

    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = server.address().port;
    SimilarityCheck = mockModel;
  });

  after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
  });

  function request(method, urlPath, { body, user } = {}) {
    return new Promise((resolve, reject) => {
      const payload = body ? JSON.stringify(body) : null;
      const req = http.request(
        {
          hostname: "127.0.0.1",
          port,
          path: urlPath,
          method,
          headers: {
            "Content-Type": "application/json",
            ...(user
              ? { "x-test-user": JSON.stringify(user) }
              : {}),
            ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
          },
        },
        (res) => {
          let raw = "";
          res.on("data", (chunk) => {
            raw += chunk;
          });
          res.on("end", () => {
            let json = null;
            try {
              json = raw ? JSON.parse(raw) : null;
            } catch (_) {
              json = raw;
            }
            resolve({ status: res.statusCode, json });
          });
        }
      );
      req.on("error", reject);
      if (payload) req.write(payload);
      req.end();
    });
  }

  it("provider status reports not connected without credentials", async () => {
    const res = await request("GET", "/api/plagiarism/provider-status");
    assert.equal(res.status, 200);
    assert.equal(res.json.connected, false);
    assert.equal(res.json.status, "provider_not_connected");
  });

  it("create checks returns PROVIDER_NOT_CONNECTED and null similarity", async () => {
    const res = await request("POST", "/api/plagiarism/checks", {
      body: {
        mode: "external_sources",
        assignmentId: "507f1f77bcf86cd7994390cc",
        submissionIds: ["507f1f77bcf86cd799439011"],
      },
    });
    assert.equal(res.status, 503);
    assert.equal(res.json.code, "PROVIDER_NOT_CONNECTED");
    assert.ok(Array.isArray(res.json.checks));
    assert.equal(res.json.checks[0].status, "provider_not_connected");
    assert.equal(res.json.checks[0].similarityPercent, null);
    assert.deepEqual(res.json.checks[0].matchedSources, []);
  });

  it("multiple selected submissions create separate check records", async () => {
    const res = await request("POST", "/api/plagiarism/checks", {
      body: {
        mode: "external_sources",
        assignmentId: "507f1f77bcf86cd7994390cc",
        submissionIds: [
          "507f1f77bcf86cd799439011",
          "507f1f77bcf86cd799439013",
        ],
      },
    });
    assert.equal(res.status, 503);
    assert.equal(res.json.checks.length, 2);
    assert.equal(res.json.checks[0].similarityPercent, null);
    assert.equal(res.json.checks[1].similarityPercent, null);
    assert.notEqual(
      String(res.json.checks[0].submission),
      String(res.json.checks[1].submission)
    );
  });

  it("rejects missing assignment id", async () => {
    const res = await request("POST", "/api/plagiarism/checks", {
      body: {
        mode: "external_sources",
        submissionIds: ["507f1f77bcf86cd799439011"],
      },
    });
    assert.equal(res.status, 400);
    assert.equal(res.json.code, "INVALID_ASSIGNMENT_ID");
  });

  it("rejects mixed-assignment submission ids", async () => {
    const res = await request("POST", "/api/plagiarism/checks", {
      body: {
        mode: "external_sources",
        assignmentId: "507f1f77bcf86cd7994390cc",
        submissionIds: [
          "507f1f77bcf86cd799439011",
          "507f1f77bcf86cd799439012",
        ],
      },
      user: { _id: "507f1f77bcf86cd7994390aa", role: "teacher" },
    });
    assert.equal(res.status, 400);
    assert.equal(res.json.code, "MIXED_ASSIGNMENT_SUBMISSIONS");
  });

  it("rejects invalid mode", async () => {
    const res = await request("POST", "/api/plagiarism/checks", {
      body: {
        mode: "jaccard",
        assignmentId: "507f1f77bcf86cd7994390cc",
        submissionIds: ["507f1f77bcf86cd799439011"],
      },
    });
    assert.equal(res.status, 400);
    assert.equal(res.json.code, "INVALID_MODE");
  });

  it("rejects empty submission ids", async () => {
    const res = await request("POST", "/api/plagiarism/checks", {
      body: {
        mode: "external_sources",
        assignmentId: "507f1f77bcf86cd7994390cc",
        submissionIds: [],
      },
    });
    assert.equal(res.status, 400);
    assert.equal(res.json.code, "INVALID_SUBMISSION_IDS");
  });

  it("teacher cannot access another teacher's check", async () => {
    const created = await request("POST", "/api/plagiarism/checks", {
      body: {
        mode: "external_sources",
        assignmentId: "507f1f77bcf86cd7994390cc",
        submissionIds: ["507f1f77bcf86cd799439011"],
      },
      user: { _id: "507f1f77bcf86cd7994390aa", role: "teacher" },
    });
    const checkId = created.json.checks[0]._id;
    const denied = await request("GET", `/api/plagiarism/checks/${checkId}`, {
      user: { _id: "507f1f77bcf86cd799439099", role: "teacher" },
    });
    assert.equal(denied.status, 404);
    assert.equal(denied.json.code, "CHECK_NOT_FOUND");
  });

  it("teacher cannot see another teacher's submission on create", async () => {
    const res = await request("POST", "/api/plagiarism/checks", {
      body: {
        mode: "external_sources",
        assignmentId: "507f1f77bcf86cd7994390cc",
        submissionIds: ["507f1f77bcf86cd799439012"],
      },
      user: { _id: "507f1f77bcf86cd7994390aa", role: "teacher" },
    });
    assert.equal(res.status, 404);
    assert.equal(res.json.code, "SUBMISSIONS_NOT_FOUND");
  });

  it("report endpoint stays unavailable without completed provider report", async () => {
    const created = await request("POST", "/api/plagiarism/checks", {
      body: {
        mode: "external_sources",
        assignmentId: "507f1f77bcf86cd7994390cc",
        submissionIds: ["507f1f77bcf86cd799439011"],
      },
    });
    const checkId = created.json.checks[0]._id;
    const report = await request("GET", `/api/plagiarism/checks/${checkId}/report`);
    assert.equal(report.status, 503);
    assert.equal(report.json.code, "PROVIDER_NOT_CONNECTED");
  });

  it("queued/processing/completed/failed statuses are modeled without invented scores", () => {
    const provider = require("../services/turnitinProvider");
    for (const status of ["queued", "processing", "failed", "provider_not_connected"]) {
      const view = provider.toPublicCheck({ status, similarityPercent: 99 });
      assert.equal(view.similarityPercent, null);
    }
    const done = provider.toPublicCheck({
      status: "completed",
      similarityPercent: 17,
      reportAvailable: true,
      providerReportId: "rep_1",
      matchedSources: [{ title: "Source A", percent: 10 }],
      highlightedPassages: [{ text: "overlap", sourceTitle: "Source A" }],
    });
    assert.equal(done.similarityPercent, 17);
    assert.equal(done.matchedSources.length, 1);
    assert.equal(done.highlightedPassages.length, 1);
  });
});
