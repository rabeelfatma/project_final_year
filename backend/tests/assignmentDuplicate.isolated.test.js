/**
 * Assignment duplicate title policy + mandatory create file checks.
 * Isolated mocks only. Does not connect to production MongoDB or R2.
 *
 * Concurrency limitation: find-then-create is not race-safe.
 */
const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const Module = require("module");

const duplicatePath = path.resolve(__dirname, "../utils/assignmentDuplicate.js");
const fieldValidationPath = path.resolve(
  __dirname,
  "../utils/assignmentFieldValidation.js"
);
const teacherControllerPath = path.resolve(
  __dirname,
  "../controllers/teacherController.js"
);
const teacherDashboardPath = path.resolve(
  __dirname,
  "../../frontend/src/pages/dashboards/TeacherDashboard.jsx"
);
const resolveDurablePath = path.resolve(
  __dirname,
  "../utils/resolveDurableUpload.js"
);

function loadDuplicate() {
  delete require.cache[duplicatePath];
  delete require.cache[fieldValidationPath];
  return require(duplicatePath);
}

const START_A = new Date("2026-11-10T09:00:00.000Z");
const START_B = new Date("2026-12-01T09:00:00.000Z");
const DEADLINE_A = new Date("2026-11-17T09:00:00.000Z");
const DEADLINE_B = new Date("2026-12-10T09:00:00.000Z");
const TEACHER_A = "507f1f77bcf86cd799439011";
const TEACHER_B = "507f1f77bcf86cd799439022";

function makeStore(rows) {
  const data = rows.map((r) => ({ ...r }));
  return {
    data,
    find(query) {
      const filtered = data.filter((row) => {
        if (query.teacher && String(row.teacher) !== String(query.teacher)) {
          return false;
        }
        if (query.status && row.status !== query.status) return false;
        if (query._id && query._id.$ne) {
          if (String(row._id) === String(query._id.$ne)) return false;
        }
        return true;
      });
      return {
        select() {
          return {
            lean: async () => filtered.map((r) => ({ ...r })),
          };
        },
        lean: async () => filtered.map((r) => ({ ...r })),
      };
    },
  };
}

const baseActive = {
  _id: "a1",
  teacher: TEACHER_A,
  title: "Week 4 Lab",
  subject: "SE",
  startDate: START_A,
  deadline: DEADLINE_A,
  status: "active",
};

describe("assignment duplicate title policy (ignore dates)", () => {
  it("1. same teacher/subject/title with different start dates → conflict", async () => {
    const { findActiveDuplicateAssignment } = loadDuplicate();
    const store = makeStore([baseActive]);
    const hit = await findActiveDuplicateAssignment({
      AssignmentModel: store,
      teacherId: TEACHER_A,
      subject: "SE",
      title: "Week 4 Lab",
    });
    assert.ok(hit);
    // Different schedule must still collide on title+subject.
    assert.notEqual(START_A.getTime(), START_B.getTime());
  });

  it("2. same title with different deadlines still conflicts", async () => {
    const { findActiveDuplicateAssignment } = loadDuplicate();
    const store = makeStore([
      { ...baseActive, deadline: DEADLINE_A },
    ]);
    const hit = await findActiveDuplicateAssignment({
      AssignmentModel: store,
      teacherId: TEACHER_A,
      subject: "SE",
      title: "Week 4 Lab",
    });
    assert.ok(hit);
    assert.notEqual(DEADLINE_A.getTime(), DEADLINE_B.getTime());
  });

  it("3. different casing / extra whitespace → conflict", async () => {
    const { findActiveDuplicateAssignment } = loadDuplicate();
    const store = makeStore([baseActive]);
    const hit = await findActiveDuplicateAssignment({
      AssignmentModel: store,
      teacherId: TEACHER_A,
      subject: "  se  ",
      title: "  WEEK   4   lab  ",
    });
    assert.ok(hit);
  });

  it("4. different teacher → allowed", async () => {
    const { findActiveDuplicateAssignment } = loadDuplicate();
    const store = makeStore([baseActive]);
    const hit = await findActiveDuplicateAssignment({
      AssignmentModel: store,
      teacherId: TEACHER_B,
      subject: "SE",
      title: "Week 4 Lab",
    });
    assert.equal(hit, null);
  });

  it("5. different subject → allowed", async () => {
    const { findActiveDuplicateAssignment } = loadDuplicate();
    const store = makeStore([baseActive]);
    const hit = await findActiveDuplicateAssignment({
      AssignmentModel: store,
      teacherId: TEACHER_A,
      subject: "Math",
      title: "Week 4 Lab",
    });
    assert.equal(hit, null);
  });

  it("6. update excluding self → no self-conflict", async () => {
    const { findActiveDuplicateAssignment } = loadDuplicate();
    const store = makeStore([baseActive]);
    const hit = await findActiveDuplicateAssignment({
      AssignmentModel: store,
      teacherId: TEACHER_A,
      subject: "SE",
      title: "Week 4 Lab",
      excludeId: "a1",
    });
    assert.equal(hit, null);
  });

  it("7. update into another assignment title → conflict", async () => {
    const { findActiveDuplicateAssignment } = loadDuplicate();
    const other = {
      _id: "a2",
      teacher: TEACHER_A,
      title: "Other Title",
      subject: "SE",
      status: "active",
    };
    const store = makeStore([baseActive, other]);
    const hit = await findActiveDuplicateAssignment({
      AssignmentModel: store,
      teacherId: TEACHER_A,
      subject: "SE",
      title: "Week 4 Lab",
      excludeId: "a2",
    });
    assert.ok(hit);
    assert.equal(String(hit._id), "a1");
  });

  it("8. archived duplicate does not block", async () => {
    const { findActiveDuplicateAssignment } = loadDuplicate();
    const store = makeStore([{ ...baseActive, status: "archived" }]);
    const hit = await findActiveDuplicateAssignment({
      AssignmentModel: store,
      teacherId: TEACHER_A,
      subject: "SE",
      title: "Week 4 Lab",
    });
    assert.equal(hit, null);
  });

  it("9. deactivated duplicate does not block", async () => {
    const { findActiveDuplicateAssignment } = loadDuplicate();
    const store = makeStore([{ ...baseActive, status: "deactive" }]);
    const hit = await findActiveDuplicateAssignment({
      AssignmentModel: store,
      teacherId: TEACHER_A,
      subject: "SE",
      title: "Week 4 Lab",
    });
    assert.equal(hit, null);
  });

  it("conflict payload uses ASSIGNMENT_DUPLICATE without date wording", () => {
    const {
      duplicateConflictPayload,
      ASSIGNMENT_DUPLICATE_CODE,
    } = loadDuplicate();
    const body = duplicateConflictPayload();
    assert.equal(body.code, ASSIGNMENT_DUPLICATE_CODE);
    assert.match(body.message, /already exists/i);
    assert.doesNotMatch(body.message, /deadline|start time/i);
  });
});

describe("description + reference file create requirements", () => {
  it("10-11. missing and whitespace-only description → validation 400 shape", () => {
    const { validateAssignmentFields } = require(fieldValidationPath);
    const now = Date.parse("2026-10-31T12:00:00.000Z");
    const base = {
      title: "Week 4 Lab",
      points: 20,
      startDate: new Date(now + 3600000).toISOString(),
      deadline: new Date(now + 86400000).toISOString(),
    };
    const missing = validateAssignmentFields(
      { ...base, description: "" },
      { mode: "create", now }
    );
    assert.equal(missing.ok, false);
    assert.match(missing.errors.description, /required/i);

    const whitespace = validateAssignmentFields(
      { ...base, description: "   \n\t  " },
      { mode: "create", now }
    );
    assert.equal(whitespace.ok, false);
    assert.match(whitespace.errors.description, /required/i);
  });

  it("12-15. createAssignment enforces verified file; update keeps existing", async () => {
    const originalLoad = Module._load;
    const prevSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = "test-assignment-create-secret";
    const created = [];
    let resolveImpl = async () => null;
    let assignments = [
      {
        _id: "cur1",
        teacher: TEACHER_A,
        title: "Existing Lab",
        subject: "SE",
        description: "Keep me",
        points: 10,
        startDate: START_A,
        deadline: DEADLINE_A,
        status: "active",
        file: "uploads/assignments/existing.pdf",
        originalFileName: "existing.pdf",
      },
    ];

    Module._load = function (request, parent, isMain) {
      if (request === "../utils/resolveDurableUpload") {
        return {
          resolveDurableUpload: (...args) => resolveImpl(...args),
        };
      }
      if (request === "../models/Assignment") {
        return {
          find: (q) =>
            makeStore(assignments).find(q),
          findOne: async (q) => {
            const row = assignments.find(
              (a) =>
                String(a._id) === String(q._id) &&
                String(a.teacher) === String(q.teacher)
            );
            return row || null;
          },
          create: async (doc) => {
            created.push(doc);
            return { ...doc, _id: `new-${created.length}` };
          },
          findOneAndUpdate: async (q, update) => {
            const row = assignments.find(
              (a) =>
                String(a._id) === String(q._id) &&
                String(a.teacher) === String(q.teacher)
            );
            if (!row) return null;
            Object.assign(row, update.$set || {});
            return { ...row };
          },
        };
      }
      if (request === "../models/User") {
        return { find: () => ({ select: async () => [] }) };
      }
      if (request === "./notificationController") {
        return { create: async () => null };
      }
      return originalLoad(request, parent, isMain);
    };

    delete require.cache[teacherControllerPath];
    delete require.cache[duplicatePath];
    delete require.cache[fieldValidationPath];
    delete require.cache[resolveDurablePath];

    try {
      const { issueScheduleIntent } = require("../utils/assignmentScheduleIntent");
      const ctrl = require(teacherControllerPath);
      const teacher = { _id: TEACHER_A, subject: "SE" };
      // Same Asia/Karachi calendar day as "now" (not tomorrow).
      const futureStart = new Date(Date.now() + 30 * 60_000).toISOString();
      const futureEnd = new Date(Date.now() + 3 * 60 * 60_000).toISOString();
      const intent = issueScheduleIntent({
        teacherId: TEACHER_A,
        startDate: futureStart,
        deadline: futureEnd,
      });
      assert.equal(intent.ok, true, JSON.stringify(intent));

      const jsonRes = () => {
        const res = {
          statusCode: 200,
          body: null,
          status(code) {
            this.statusCode = code;
            return this;
          },
          json(payload) {
            this.body = payload;
            return this;
          },
        };
        return res;
      };

      // 12. Missing reference file on create → 400
      {
        const res = jsonRes();
        await ctrl.createAssignment(
          {
            user: teacher,
            body: {
              title: "Brand New Lab",
              description: "Do the work",
              points: 25,
              startDate: futureStart,
              deadline: futureEnd,
              scheduleIntentToken: intent.scheduleIntentToken,
            },
            file: null,
          },
          res
        );
        assert.equal(res.statusCode, 400);
        assert.match(String(res.body?.errors?.file || ""), /reference file/i);
        assert.equal(created.length, 0);
      }

      // 13. Invalid/unverified file metadata (key present but resolve returns null) → 400
      {
        resolveImpl = async () => null;
        const res = jsonRes();
        await ctrl.createAssignment(
          {
            user: teacher,
            body: {
              title: "Brand New Lab",
              description: "Do the work",
              points: 25,
              startDate: futureStart,
              deadline: futureEnd,
              scheduleIntentToken: intent.scheduleIntentToken,
              storedFileKey: "uploads/assignments/fake.pdf",
              originalFileName: "fake.pdf",
              fileMimeType: "application/pdf",
              fileSize: "12",
            },
            file: null,
          },
          res
        );
        assert.equal(res.statusCode, 400);
        assert.match(String(res.body?.errors?.file || res.body?.message || ""), /valid verified|reference file/i);
        assert.equal(created.length, 0);
      }

      // Verified create succeeds (sanity)
      {
        resolveImpl = async () => ({
          storedPath: "uploads/assignments/ok.pdf",
          originalFileName: "ok.pdf",
          fileMimeType: "application/pdf",
        });
        const res = jsonRes();
        await ctrl.createAssignment(
          {
            user: teacher,
            body: {
              title: "Brand New Lab",
              description: "Do the work",
              points: 25,
              startDate: futureStart,
              deadline: futureEnd,
              scheduleIntentToken: intent.scheduleIntentToken,
              storedFileKey: "uploads/assignments/ok.pdf",
              fileSize: "100",
            },
            file: null,
          },
          res
        );
        assert.equal(res.statusCode, 201, JSON.stringify(res.body));
        assert.equal(created.length, 1);
        assert.equal(created[0].file, "uploads/assignments/ok.pdf");
      }

      // 14. Update with existing file and no replacement → allowed
      {
        resolveImpl = async () => null;
        const before = { ...assignments[0] };
        const res = jsonRes();
        await ctrl.updateAssignment(
          {
            user: teacher,
            params: { id: "cur1" },
            body: {
              title: "Existing Lab",
              description: "Updated instructions",
              points: 12,
              startDate: existingIsoOrKeep(assignments[0].startDate),
              deadline: existingIsoOrKeep(assignments[0].deadline),
            },
            file: null,
          },
          res
        );
        assert.equal(res.statusCode, 200, JSON.stringify(res.body));
        assert.equal(assignments[0].file, before.file);
        assert.equal(assignments[0].originalFileName, before.originalFileName);
        assert.equal(assignments[0].description, "Updated instructions");
      }

      // 15. Update with a valid replacement file → allowed
      {
        resolveImpl = async () => ({
          storedPath: "uploads/assignments/replaced.pdf",
          originalFileName: "replaced.pdf",
          fileMimeType: "application/pdf",
        });
        const res = jsonRes();
        await ctrl.updateAssignment(
          {
            user: teacher,
            params: { id: "cur1" },
            body: {
              title: "Existing Lab",
              description: "Updated again",
              points: 12,
              startDate: existingIsoOrKeep(assignments[0].startDate),
              deadline: existingIsoOrKeep(assignments[0].deadline),
              storedFileKey: "uploads/assignments/replaced.pdf",
              fileSize: "50",
            },
            file: null,
          },
          res
        );
        assert.equal(res.statusCode, 200, JSON.stringify(res.body));
        assert.equal(assignments[0].file, "uploads/assignments/replaced.pdf");
        assert.equal(assignments[0].originalFileName, "replaced.pdf");
      }
    } finally {
      Module._load = originalLoad;
      if (prevSecret === undefined) delete process.env.JWT_SECRET;
      else process.env.JWT_SECRET = prevSecret;
      delete require.cache[teacherControllerPath];
      delete require.cache[duplicatePath];
      delete require.cache[fieldValidationPath];
      delete require.cache[resolveDurablePath];
      delete require.cache[path.resolve(__dirname, "../utils/assignmentScheduleIntent.js")];
    }
  });
});

function existingIsoOrKeep(value) {
  return value instanceof Date ? value.toISOString() : String(value);
}

describe("wiring contracts", () => {
  it("frontend requires file on create and preserves form on 409/400", () => {
    const src = fs.readFileSync(teacherDashboardPath, "utf8");
    assert.match(src, /Upload a reference file/);
    assert.match(src, /Reference File/);
    assert.match(src, /ASSIGNMENT_DUPLICATE/);
    assert.match(src, /status === 409/);
    assert.match(src, /Keep form values|selected\/uploaded file/i);
    assert.match(src, /savingAssignment/);
  });

  it("controller orders missing-file and duplicate checks before resolveDurableUpload", () => {
    const src = fs.readFileSync(teacherControllerPath, "utf8");
    const createIdx = src.indexOf("exports.createAssignment");
    const updateIdx = src.indexOf("exports.updateAssignment");
    const createSlice = src.slice(createIdx, updateIdx);
    const missingFile = createSlice.indexOf("Upload a reference file");
    const dup = createSlice.indexOf("findActiveDuplicateAssignment");
    const upload = createSlice.indexOf("resolveDurableUpload");
    assert.ok(missingFile > 0 && dup > missingFile && upload > dup);
    assert.match(createSlice, /Upload a valid reference file/);

    const updateSlice = src.slice(updateIdx, updateIdx + 5000);
    assert.match(updateSlice, /excludeId:\s*current\._id/);
    assert.match(updateSlice, /Optional replacement only|keep existing file/i);
  });
});
