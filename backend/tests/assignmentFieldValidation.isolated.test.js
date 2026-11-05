/**
 * Assignment field validation + Asia/Karachi strictly-future schedule policy.
 * Isolated — no production MongoDB / R2.
 */
const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const helperPath = path.resolve(
  __dirname,
  "../utils/assignmentFieldValidation.js"
);
const intentPath = path.resolve(
  __dirname,
  "../utils/assignmentScheduleIntent.js"
);
const feHelperPath = path.resolve(
  __dirname,
  "../../frontend/src/utils/assignmentFieldValidation.js"
);
const teacherControllerPath = path.resolve(
  __dirname,
  "../controllers/teacherController.js"
);
const teacherDashboardPath = path.resolve(
  __dirname,
  "../../frontend/src/pages/dashboards/TeacherDashboard.jsx"
);
const studentRoutesPath = path.resolve(
  __dirname,
  "../routes/studentRoutes.js"
);
const fileControllerPath = path.resolve(
  __dirname,
  "../controllers/fileController.js"
);

function loadHelper() {
  delete require.cache[helperPath];
  return require(helperPath);
}

function loadIntent() {
  delete require.cache[intentPath];
  delete require.cache[helperPath];
  return require(intentPath);
}

/** 2026-10-31 12:00 UTC = 17:00 Asia/Karachi (same calendar day). */
const FIXED_NOW = Date.parse("2026-10-31T12:00:00.000Z");

function atOffset(ms) {
  return new Date(FIXED_NOW + ms).toISOString();
}

function validCreateBody(overrides = {}) {
  return {
    title: "Week 4 Lab",
    description: "Complete the exercises.",
    points: 25,
    startDate: atOffset(30 * 60 * 1000),
    deadline: atOffset(3 * 60 * 60 * 1000),
    ...overrides,
  };
}

describe("assignment title normalization", () => {
  it("collapses whitespace and preserves casing", () => {
    const {
      normalizeAssignmentTitle,
      normalizeTitleForComparison,
    } = loadHelper();
    assert.equal(
      normalizeAssignmentTitle("  System   Design  Analysis  "),
      "System Design Analysis"
    );
    assert.equal(
      normalizeTitleForComparison("  System   Design  Analysis  "),
      "system design analysis"
    );
  });
});

describe("Asia/Karachi calendar start policy (create)", () => {
  it("1. today's valid start date/time → allowed", () => {
    const { validateAssignmentFields, calendarDateKeyInTimeZone, PROJECT_TIMEZONE } =
      loadHelper();
    const start = atOffset(20 * 60 * 1000);
    assert.equal(
      calendarDateKeyInTimeZone(start, PROJECT_TIMEZONE),
      calendarDateKeyInTimeZone(FIXED_NOW, PROJECT_TIMEZONE)
    );
    const r = validateAssignmentFields(validCreateBody({ startDate: start }), {
      mode: "create",
      now: FIXED_NOW,
    });
    assert.equal(r.ok, true);
  });

  it("2. tomorrow's start date → allowed", () => {
    const { validateAssignmentFields } = loadHelper();
    const r = validateAssignmentFields(
      validCreateBody({
        startDate: atOffset(24 * 60 * 60 * 1000),
        deadline: atOffset(48 * 60 * 60 * 1000),
      }),
      { mode: "create", now: FIXED_NOW }
    );
    assert.equal(r.ok, true);
  });

  it("3. later calendar date → allowed", () => {
    const { validateAssignmentFields } = loadHelper();
    const r = validateAssignmentFields(
      validCreateBody({
        startDate: atOffset(72 * 60 * 60 * 1000),
        deadline: atOffset(96 * 60 * 60 * 1000),
      }),
      { mode: "create", now: FIXED_NOW }
    );
    assert.equal(r.ok, true);
  });

  it("4. past date → rejected", () => {
    const { validateAssignmentFields } = loadHelper();
    const r = validateAssignmentFields(
      validCreateBody({
        startDate: atOffset(-24 * 60 * 60 * 1000),
        deadline: atOffset(3 * 60 * 60 * 1000),
      }),
      { mode: "create", now: FIXED_NOW }
    );
    assert.equal(r.ok, false);
    assert.match(r.errors.startDate, /future/i);
  });

  it("6. expired deadline → rejected", () => {
    const { validateAssignmentFields } = loadHelper();
    const r = validateAssignmentFields(
      validCreateBody({
        startDate: atOffset(-10 * 60 * 1000),
        deadline: atOffset(-5 * 60 * 1000),
      }),
      { mode: "create", now: FIXED_NOW }
    );
    assert.equal(r.ok, false);
    assert.ok(r.errors.deadline || r.errors.startDate);
  });

  it("deadline must stay strictly later than start", () => {
    const { validateAssignmentFields } = loadHelper();
    const start = atOffset(30 * 60 * 1000);
    const r = validateAssignmentFields(
      validCreateBody({ startDate: start, deadline: start }),
      { mode: "create", now: FIXED_NOW }
    );
    assert.equal(r.ok, false);
    assert.match(r.errors.deadline, /after start time/i);
  });
});

describe("schedule intent (upload delay)", () => {
  const prevSecret = process.env.JWT_SECRET;

  beforeEach(() => {
    process.env.JWT_SECRET = "test-schedule-intent-secret";
  });

  afterEach(() => {
    if (prevSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = prevSecret;
  });

  it("5. upload delay does not waive a start that is no longer in the future", () => {
    const { issueScheduleIntent, verifyScheduleIntent } = loadIntent();
    const { validateAssignmentFields } = loadHelper();
    const start = atOffset(15 * 60 * 1000);
    const deadline = atOffset(4 * 60 * 60 * 1000);

    const issued = issueScheduleIntent({
      teacherId: "teacher-1",
      startDate: start,
      deadline,
      now: FIXED_NOW,
    });
    assert.equal(issued.ok, true);
    assert.ok(issued.scheduleIntentToken);

    const afterUpload = FIXED_NOW + 20 * 60 * 1000;
    const verified = verifyScheduleIntent(issued.scheduleIntentToken, {
      teacherId: "teacher-1",
      startDate: start,
      deadline,
    });
    assert.equal(verified.ok, true);

    const rechecked = validateAssignmentFields(
      validCreateBody({ startDate: start, deadline }),
      { mode: "create", now: afterUpload }
    );
    assert.equal(rechecked.ok, false);
    assert.match(rechecked.errors.startDate, /future/i);
  });

  it("rejects tampered schedule after intent", () => {
    const { issueScheduleIntent, verifyScheduleIntent } = loadIntent();
    const start = atOffset(15 * 60 * 1000);
    const deadline = atOffset(4 * 60 * 60 * 1000);
    const issued = issueScheduleIntent({
      teacherId: "teacher-1",
      startDate: start,
      deadline,
      now: FIXED_NOW,
    });
    const bad = verifyScheduleIntent(issued.scheduleIntentToken, {
      teacherId: "teacher-1",
      startDate: atOffset(25 * 60 * 1000),
      deadline,
    });
    assert.equal(bad.ok, false);
    assert.match(bad.code, /MISMATCH/i);
  });
});

describe("assignment update validation", () => {
  const existing = {
    title: "Existing Lab",
    description: "Old instructions",
    points: 20,
    startDate: new Date(FIXED_NOW - 2 * 60 * 60 * 1000),
    deadline: new Date(FIXED_NOW + 24 * 60 * 60 * 1000),
  };

  it("9. update unchanged assignment → allowed", () => {
    const { validateAssignmentFields } = loadHelper();
    const r = validateAssignmentFields(
      {
        title: "Existing Lab",
        description: "Updated copy",
        points: 22,
        startDate: existing.startDate.toISOString(),
        deadline: existing.deadline.toISOString(),
      },
      { mode: "update", existing, now: FIXED_NOW }
    );
    assert.equal(r.ok, true);
  });

  it("allows moving start to a future calendar day on update", () => {
    const { validateAssignmentFields } = loadHelper();
    const r = validateAssignmentFields(
      {
        startDate: atOffset(48 * 60 * 60 * 1000),
        deadline: atOffset(72 * 60 * 60 * 1000),
      },
      { mode: "update", existing, now: FIXED_NOW }
    );
    assert.equal(r.ok, true);
  });
});

describe("frontend/backend rule consistency", () => {
  it("keeps Asia/Karachi policy aligned in frontend helper", () => {
    const be = loadHelper();
    const feSrc = fs.readFileSync(feHelperPath, "utf8");
    assert.match(feSrc, /Asia\/Karachi/);
    assert.match(feSrc, /calendarDateKeyInTimeZone/);
    assert.match(feSrc, new RegExp(`TITLE_MIN_LENGTH\\s*=\\s*${be.TITLE_MIN_LENGTH}`));
  });

  it("create flow uses schedule-intent before upload", () => {
    const dashboard = fs.readFileSync(teacherDashboardPath, "utf8");
    assert.match(dashboard, /createScheduleIntent/);
    assert.match(dashboard, /scheduleIntentToken/);
    const handlerStart = dashboard.indexOf("const handleCreateOrUpdate");
    const handler = dashboard.slice(handlerStart, handlerStart + 7000);
    const intentIdx = handler.indexOf("createScheduleIntent");
    const uploadIdx = handler.indexOf("uploadDurableFile");
    assert.ok(intentIdx > 0 && uploadIdx > intentIdx);
  });

  it("student materials gated; file keys stripped in student routes", () => {
    const studentSrc = fs.readFileSync(studentRoutesPath, "utf8");
    assert.match(studentSrc, /canAccessMaterials/);
    assert.match(studentSrc, /notOpenYet/);
    assert.match(studentSrc, /_omitFile|file: undefined/);

    const fileSrc = fs.readFileSync(fileControllerPath, "utf8");
    assert.match(fileSrc, /not open yet/i);

    const ctrl = fs.readFileSync(teacherControllerPath, "utf8");
    assert.match(ctrl, /createScheduleIntent|issueScheduleIntent/);
    assert.match(ctrl, /verifyScheduleIntent/);
  });
});
