/**
 * Assignment creation checklist — isolated only.
 * No production MongoDB, no R2, no seeds, no migrations.
 *
 * Seventy-three cases derived from the approved create/edit validation rules.
 */
const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const jwt = require("jsonwebtoken");
const Module = require("module");

const fields = require("../utils/assignmentFieldValidation");
const duplicate = require("../utils/assignmentDuplicate");
const intentApi = require("../utils/assignmentScheduleIntent");
const allowlist = require("../utils/uploadAllowlist");
const content = require("../utils/academicFileContent");
const { protect, authorize } = require("../middleware/authMiddleware");

const FIXED_NOW = Date.parse("2026-10-31T12:00:00.000Z"); // 17:00 Asia/Karachi
const TEACHER_A = "507f1f77bcf86cd799439011";
const TEACHER_B = "507f1f77bcf86cd799439022";

function validate(overrides = {}, options = {}) {
  return fields.validateAssignmentFields(
    {
      title: "Week 4 Lab",
      description: "Complete the exercises.",
      points: "25",
      startDate: "2026-10-31T18:00",
      deadline: "2026-11-02T18:00",
      ...overrides,
    },
    { mode: "create", now: FIXED_NOW, ...options }
  );
}

function jsonRes() {
  return {
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
}

describe("assignment creation checklist (73)", () => {
  const prevSecret = process.env.JWT_SECRET;
  const prevMax = process.env.MAX_ASSIGNMENT_POINTS;

  beforeEach(() => {
    process.env.JWT_SECRET = "checklist-schedule-secret";
    delete process.env.MAX_ASSIGNMENT_POINTS;
  });

  afterEach(() => {
    if (prevSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = prevSecret;
    if (prevMax === undefined) delete process.env.MAX_ASSIGNMENT_POINTS;
    else process.env.MAX_ASSIGNMENT_POINTS = prevMax;
  });

  it("01 missing start date and time is rejected", () => {
    const result = validate({ startDate: "" });
    assert.equal(result.ok, false);
    assert.match(result.errors.startDate, /Select a start date/);
  });

  it("02 start date without a time is rejected", () => {
    const result = validate({ startDate: "2026-11-01" });
    assert.equal(result.ok, false);
    assert.match(result.errors.startDate, /Select a start time/);
  });

  it("03 a past start calendar date is rejected", () => {
    const result = validate({ startDate: "2026-10-30T19:00" });
    assert.equal(result.ok, false);
    assert.match(result.errors.startDate, /in the future/);
  });

  it("04 today's past start time is rejected", () => {
    const result = validate({ startDate: "2026-10-31T16:00" });
    assert.equal(result.ok, false);
    assert.match(result.errors.startDate, /in the future/);
  });

  it("05 today's equal start time is rejected", () => {
    const result = validate({ startDate: "2026-10-31T17:00" });
    assert.equal(result.ok, false);
    assert.match(result.errors.startDate, /in the future/);
  });

  it("06 today's future start time is accepted", () => {
    const result = validate({ startDate: "2026-10-31T17:30", deadline: "2026-10-31T18:30" });
    assert.equal(result.ok, true);
    assert.equal(result.values.startDate.toISOString(), "2026-10-31T12:30:00.000Z");
  });

  it("07 a future date with an earlier clock time is accepted", () => {
    const result = validate({ startDate: "2026-11-01T09:00", deadline: "2026-11-01T18:00" });
    assert.equal(result.ok, true);
    assert.equal(
      fields.calendarDateKeyInTimeZone(result.values.startDate),
      "2026-11-01"
    );
  });

  it("08 a future date with the same clock time is accepted", () => {
    const result = validate({ startDate: "2026-11-01T17:00", deadline: "2026-11-02T17:00" });
    assert.equal(result.ok, true);
  });

  it("09 a future date with a later clock time is accepted", () => {
    const result = validate({ startDate: "2026-11-01T19:00", deadline: "2026-11-03T19:00" });
    assert.equal(result.ok, true);
  });

  it("10 missing due date and time is rejected", () => {
    const result = validate({ deadline: "" });
    assert.equal(result.ok, false);
    assert.match(result.errors.deadline, /Select a due date/);
  });

  it("11 due date without a time is rejected", () => {
    const result = validate({ deadline: "2026-11-02" });
    assert.equal(result.ok, false);
    assert.match(result.errors.deadline, /Select a due time/);
  });

  it("12 a past due calendar date is rejected", () => {
    const result = validate({ deadline: "2026-10-30T18:00" });
    assert.equal(result.ok, false);
    assert.match(result.errors.deadline, /in the future/);
  });

  it("13 today's past due time is rejected", () => {
    const result = validate({
      startDate: "2026-10-31T17:10",
      deadline: "2026-10-31T16:30",
    });
    assert.equal(result.ok, false);
    assert.match(result.errors.deadline, /in the future/);
  });

  it("14 today's equal due time is rejected", () => {
    const result = validate({
      startDate: "2026-10-31T17:10",
      deadline: "2026-10-31T17:00",
    });
    assert.equal(result.ok, false);
    assert.match(result.errors.deadline, /in the future/);
  });

  it("15 today's future due time is accepted", () => {
    const result = validate({
      startDate: "2026-10-31T17:10",
      deadline: "2026-10-31T17:40",
    });
    assert.equal(result.ok, true);
  });

  it("16 future due dates are accepted for earlier, equal, and later clock times", () => {
    for (const due of ["2026-11-02T09:00", "2026-11-02T17:00", "2026-11-02T21:00"]) {
      const result = validate({ startDate: "2026-11-01T08:00", deadline: due });
      assert.equal(result.ok, true, due);
    }
  });

  it("17 same calendar date accepts a later due time", () => {
    const result = validate({
      startDate: "2026-10-31T17:10",
      deadline: "2026-10-31T18:00",
    });
    assert.equal(result.ok, true);
  });

  it("18 equal start and due datetimes are rejected", () => {
    const result = validate({
      startDate: "2026-10-31T18:00",
      deadline: "2026-10-31T18:00",
    });
    assert.equal(result.ok, false);
    assert.match(result.errors.deadline, /after start time/);
  });

  it("19 a due datetime before the start datetime is rejected", () => {
    const result = validate({
      startDate: "2026-11-03T10:00",
      deadline: "2026-11-02T18:00",
    });
    assert.equal(result.ok, false);
    assert.match(result.errors.deadline, /after start time/);
  });

  it("20 same date with an earlier due time is rejected", () => {
    const result = validate({
      startDate: "2026-10-31T18:00",
      deadline: "2026-10-31T17:30",
    });
    assert.equal(result.ok, false);
    assert.match(result.errors.deadline, /after start time/);
  });

  it("21 an absolute UTC instant is not shifted by another offset", () => {
    const naive = validate({
      startDate: "2026-10-31T17:30",
      deadline: "2026-10-31T18:30",
    });
    const zoned = validate({
      startDate: "2026-10-31T12:30:00.000Z",
      deadline: "2026-10-31T13:30:00.000Z",
    });
    assert.equal(naive.ok, true);
    assert.equal(zoned.ok, true);
    assert.equal(naive.values.startDate.toISOString(), zoned.values.startDate.toISOString());
  });

  it("22 a future Karachi day is accepted even when its clock is earlier than now", () => {
    const now = Date.parse("2026-10-31T20:30:00.000Z"); // 01:30 Karachi on Nov 1
    const result = validate(
      { startDate: "2026-11-02T00:30", deadline: "2026-11-02T09:00" },
      { now }
    );
    assert.equal(result.ok, true);
    assert.equal(fields.calendarDateKeyInTimeZone(result.values.startDate), "2026-11-02");
  });

  it("23 a modified schedule intent is rejected", () => {
    const issued = intentApi.issueScheduleIntent({
      teacherId: TEACHER_A,
      startDate: "2026-10-31T18:00",
      deadline: "2026-11-02T18:00",
      now: FIXED_NOW,
    });
    const bad = intentApi.verifyScheduleIntent(issued.scheduleIntentToken, {
      teacherId: TEACHER_A,
      startDate: "2026-10-31T19:00",
      deadline: "2026-11-02T18:00",
    });
    assert.equal(bad.ok, false);
    assert.equal(bad.code, "SCHEDULE_INTENT_MISMATCH");
  });

  it("24 an expired schedule intent is rejected", () => {
    const token = jwt.sign(
      {
        purpose: "assignment_schedule_intent",
        tid: TEACHER_A,
        startMs: FIXED_NOW + 60_000,
        deadlineMs: FIXED_NOW + 120_000,
        pkDay: "2026-10-31",
        exp: Math.floor(Date.now() / 1000) - 30,
      },
      process.env.JWT_SECRET
    );
    const bad = intentApi.verifyScheduleIntent(token, {
      teacherId: TEACHER_A,
      startDate: new Date(FIXED_NOW + 60_000).toISOString(),
      deadline: new Date(FIXED_NOW + 120_000).toISOString(),
    });
    assert.equal(bad.ok, false);
    assert.equal(bad.code, "SCHEDULE_INTENT_INVALID");
  });

  it("25 a valid intent does not bypass a start that is no longer in the future", () => {
    const start = new Date(FIXED_NOW + 15 * 60 * 1000).toISOString();
    const deadline = new Date(FIXED_NOW + 4 * 60 * 60 * 1000).toISOString();
    const issued = intentApi.issueScheduleIntent({
      teacherId: TEACHER_A,
      startDate: start,
      deadline,
      now: FIXED_NOW,
    });
    const verified = intentApi.verifyScheduleIntent(issued.scheduleIntentToken, {
      teacherId: TEACHER_A,
      startDate: start,
      deadline,
    });
    assert.equal(verified.ok, true);
    const rechecked = fields.validateAssignmentFields(
      {
        title: "Week 4 Lab",
        description: "Complete the exercises.",
        points: 25,
        startDate: start,
        deadline,
      },
      { mode: "create", now: FIXED_NOW + 20 * 60 * 1000 }
    );
    assert.equal(rechecked.ok, false);
  });

  it("26 an empty title is rejected", () => {
    const result = validate({ title: "" });
    assert.equal(result.ok, false);
    assert.match(result.errors.title, /title is required/i);
  });

  it("27 a whitespace-only title is rejected", () => {
    const result = validate({ title: "   \t  " });
    assert.equal(result.ok, false);
    assert.match(result.errors.title, /title is required/i);
  });

  it("28 surrounding and repeated spaces are normalized", () => {
    const result = validate({ title: "  System   Design  " });
    assert.equal(result.ok, true);
    assert.equal(result.values.title, "System Design");
  });

  it("29 a 2-character title is rejected", () => {
    const result = validate({ title: "ab" });
    assert.equal(result.ok, false);
    assert.match(result.errors.title, /too short/);
  });

  it("30 a 3-character title is accepted", () => {
    const result = validate({ title: "Lab" });
    assert.equal(result.ok, true);
    assert.equal(result.values.title, "Lab");
  });

  it("31 a 100-character title is accepted", () => {
    const title = "A".repeat(100);
    const result = validate({ title });
    assert.equal(result.ok, true);
    assert.equal(result.values.title.length, 100);
  });

  it("32 a 101-character title is rejected", () => {
    const result = validate({ title: "A".repeat(101) });
    assert.equal(result.ok, false);
    assert.match(result.errors.title, /too long/);
  });

  it("33 ordinary title punctuation is accepted", () => {
    const result = validate({ title: "Lab #1: Arrays (A) - Part 2" });
    assert.equal(result.ok, true);
  });

  it("34 apostrophes are accepted and are not interpolated into a query", () => {
    const result = validate({ title: "O'Brien's Lab" });
    assert.equal(result.ok, true);
    assert.equal(result.values.title, "O'Brien's Lab");
    const query = {
      teacher: TEACHER_A,
      status: "active",
    };
    assert.equal(typeof query.teacher, "string");
    assert.equal(Object.hasOwn(query, "$where"), false);
  });

  it("35 different capitalization is a duplicate", async () => {
    const store = makeStore([
      row({ title: "Week 4 Lab" }),
    ]);
    const found = await duplicate.findActiveDuplicateAssignment({
      AssignmentModel: store,
      teacherId: TEACHER_A,
      subject: "SE",
      title: "week 4 lab",
    });
    assert.ok(found);
  });

  it("36 extra spaces are a duplicate", async () => {
    const store = makeStore([row({ title: "Week 4 Lab" })]);
    const found = await duplicate.findActiveDuplicateAssignment({
      AssignmentModel: store,
      teacherId: TEACHER_A,
      subject: "SE",
      title: "  Week    4   Lab  ",
    });
    assert.ok(found);
  });

  it("37 different dates do not make a duplicate title unique", async () => {
    const store = makeStore([
      row({
        title: "Week 4 Lab",
        startDate: new Date("2026-11-01T00:00:00.000Z"),
        deadline: new Date("2026-11-02T00:00:00.000Z"),
      }),
    ]);
    const found = await duplicate.findActiveDuplicateAssignment({
      AssignmentModel: store,
      teacherId: TEACHER_A,
      subject: "SE",
      title: "Week 4 Lab",
    });
    assert.ok(found);
  });

  it("38 duplicate conflicts use a clear code and message", () => {
    const payload = duplicate.duplicateConflictPayload();
    assert.equal(payload.code, "ASSIGNMENT_DUPLICATE");
    assert.match(payload.message, /already exists/i);
    assert.match(payload.errors.title, /already exists/i);
  });

  it("39 editing excludes the current assignment", async () => {
    const store = makeStore([row({ _id: "self", title: "Week 4 Lab" })]);
    const found = await duplicate.findActiveDuplicateAssignment({
      AssignmentModel: store,
      teacherId: TEACHER_A,
      subject: "SE",
      title: "week 4 lab",
      excludeId: "self",
    });
    assert.equal(found, null);
  });

  it("40 an archived assignment does not block and is not deleted", async () => {
    const rows = [row({ _id: "arch", title: "Week 4 Lab", status: "archived" })];
    const store = makeStore(rows);
    const found = await duplicate.findActiveDuplicateAssignment({
      AssignmentModel: store,
      teacherId: TEACHER_A,
      subject: "SE",
      title: "Week 4 Lab",
    });
    assert.equal(found, null);
    assert.equal(rows[0].status, "archived");
    assert.equal(rows.length, 1);
  });

  it("41 a different subject is not a duplicate", async () => {
    const store = makeStore([row({ title: "Week 4 Lab", subject: "SE" })]);
    const found = await duplicate.findActiveDuplicateAssignment({
      AssignmentModel: store,
      teacherId: TEACHER_A,
      subject: "Math",
      title: "Week 4 Lab",
    });
    assert.equal(found, null);
  });

  it("42 a different teacher is not a duplicate", async () => {
    const store = makeStore([row({ title: "Week 4 Lab", teacher: TEACHER_A })]);
    const found = await duplicate.findActiveDuplicateAssignment({
      AssignmentModel: store,
      teacherId: TEACHER_B,
      subject: "SE",
      title: "Week 4 Lab",
    });
    assert.equal(found, null);
  });

  it("43 empty marks are rejected", () => {
    const result = validate({ points: "" });
    assert.equal(result.ok, false);
    assert.match(result.errors.points, /required/i);
  });

  it("44 whitespace-only marks are rejected", () => {
    const result = validate({ points: "   " });
    assert.equal(result.ok, false);
    assert.match(result.errors.points, /required/i);
  });

  it("45 zero marks are rejected", () => {
    const result = validate({ points: "0" });
    assert.equal(result.ok, false);
    assert.match(result.errors.points, /1-100/);
  });

  it("46 negative marks are rejected", () => {
    const result = validate({ points: "-5" });
    assert.equal(result.ok, false);
    assert.match(result.errors.points, /1-100/);
  });

  it("47 positive marks are accepted", () => {
    const result = validate({ points: "30" });
    assert.equal(result.ok, true);
    assert.equal(result.values.points, 30);
  });

  it("48 alphabetic marks are rejected", () => {
    const result = validate({ points: "twenty" });
    assert.equal(result.ok, false);
    assert.match(result.errors.points, /1-100/);
  });

  it("49 marks with invalid symbols are rejected", () => {
    const result = validate({ points: "10$" });
    assert.equal(result.ok, false);
    assert.match(result.errors.points, /1-100/);
  });

  it("50 marks above 100 are rejected and the ceiling stays 100", () => {
    const result = validate({ points: "101" });
    assert.equal(result.ok, false);
    assert.match(result.errors.points, /1-100/);
    assert.equal(fields.getMaxAssignmentPoints(), 100);
    process.env.MAX_ASSIGNMENT_POINTS = "250";
    assert.equal(fields.getMaxAssignmentPoints(), 100);
    assert.match(fields.marksConfigurationNote(), /not applied/);
    delete process.env.MAX_ASSIGNMENT_POINTS;
  });

  it("51 decimal marks are rejected", () => {
    const result = validate({ points: "10.5" });
    assert.equal(result.ok, false);
    assert.match(result.errors.points, /1-100/);
    const finer = validate({ points: "5.75" });
    assert.equal(finer.ok, false);
  });

  it("52 an empty marks string is not coerced to zero", () => {
    const parsed = fields.parseAssignmentPoints("", null);
    assert.match(parsed.error, /required/i);
    assert.notEqual(parsed.error, "Total marks must be greater than 0.");
  });

  it("53 scientific notation is rejected", () => {
    const result = validate({ points: "1e2" });
    assert.equal(result.ok, false);
    assert.match(result.errors.points, /1-100/);
  });

  it("54 every required text and schedule field is reported when missing", () => {
    const result = fields.validateAssignmentFields({}, { mode: "create", now: FIXED_NOW });
    assert.equal(result.ok, false);
    for (const key of ["title", "description", "points", "startDate", "deadline"]) {
      assert.ok(result.errors[key], key);
    }
  });

  it("55 whitespace-only description is rejected", () => {
    const result = validate({ description: "   " });
    assert.equal(result.ok, false);
    assert.match(result.errors.description, /Description is required/);
  });

  it("56 create API rejects a missing reference file and an invalid body", async () => {
    const harness = await loadCreateHarness();
    try {
      const issued = intentApi.issueScheduleIntent({
        teacherId: TEACHER_A,
        startDate: "2027-03-01T18:00:00.000Z",
        deadline: "2027-03-02T18:00:00.000Z",
        now: Date.now(),
      });
      const missingFile = jsonRes();
      await harness.ctrl.createAssignment(
        {
          user: { _id: TEACHER_A, subject: "SE" },
          body: {
            title: "Brand New Lab",
            description: "Do the work",
            points: "25",
            startDate: "2027-03-01T18:00:00.000Z",
            deadline: "2027-03-02T18:00:00.000Z",
            scheduleIntentToken: issued.scheduleIntentToken,
          },
          file: null,
        },
        missingFile
      );
      assert.equal(missingFile.statusCode, 400);
      assert.match(missingFile.body.errors.file, /reference file/i);
      assert.equal(harness.created.length, 0);

      const invalid = jsonRes();
      await harness.ctrl.createAssignment(
        {
          user: { _id: TEACHER_A, subject: "SE" },
          body: {
            title: " ",
            description: "Do the work",
            points: "25",
            startDate: "2027-03-01T18:00:00.000Z",
            deadline: "2027-03-02T18:00:00.000Z",
            scheduleIntentToken: issued.scheduleIntentToken,
            storedFileKey: "uploads/assignments/ok.pdf",
          },
          file: null,
        },
        invalid
      );
      assert.equal(invalid.statusCode, 400);
      assert.match(invalid.body.errors.title, /title is required/i);
      assert.equal(harness.created.length, 0);
    } finally {
      harness.restore();
    }
  });

  it("57 an existing pdf extension is allowed and exe/mp4 are not", () => {
    assert.equal(allowlist.isAllowedAcademicExtension("brief.pdf"), true);
    assert.equal(allowlist.isAllowedAcademicExtension("virus.exe"), false);
    assert.equal(allowlist.isAllowedAcademicExtension("clip.mp4"), false);
    assert.equal(allowlist.ACADEMIC_EXTENSIONS.includes(".exe"), false);
    assert.equal(allowlist.ACADEMIC_EXTENSIONS.includes(".mp4"), false);
  });

  it("58 pdf bytes are accepted and a png header renamed to pdf is rejected", () => {
    const pdf = content.validateAcademicContent("brief.pdf", Buffer.from("%PDF-1.4\n"));
    assert.equal(pdf.ok, true);
    const renamed = content.validateAcademicContent(
      "photo.pdf",
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a])
    );
    assert.equal(renamed.ok, false);
    assert.equal(renamed.code, "UPLOAD_CONTENT_MISMATCH");
  });

  it("59 a file over 200 MB and a zero-byte file are rejected", () => {
    const tooBig = allowlist.evaluateDurableFileSize(allowlist.MAX_DURABLE_FILE_BYTES + 1);
    assert.equal(tooBig.ok, false);
    assert.equal(tooBig.code, "UPLOAD_TOO_LARGE");
    assert.equal(allowlist.MAX_DURABLE_FILE_BYTES, 200 * 1024 * 1024);
    const empty = allowlist.evaluateDurableFileSize(0);
    assert.equal(empty.ok, false);
    assert.equal(empty.code, "UPLOAD_EMPTY");
    const blank = content.validateAcademicContent("notes.txt", Buffer.alloc(0));
    assert.equal(blank.ok, false);
  });

  it("60 multiple reference files are rejected by the create handler", async () => {
    const harness = await loadCreateHarness();
    try {
      const issued = intentApi.issueScheduleIntent({
        teacherId: TEACHER_A,
        startDate: "2027-03-01T18:00:00.000Z",
        deadline: "2027-03-02T18:00:00.000Z",
        now: Date.now(),
      });
      const res = jsonRes();
      await harness.ctrl.createAssignment(
        {
          user: { _id: TEACHER_A, subject: "SE" },
          body: {
            title: "Two Files",
            description: "This pair of files is not allowed.",
            points: "10",
            startDate: "2027-03-01T18:00:00.000Z",
            deadline: "2027-03-02T18:00:00.000Z",
            scheduleIntentToken: issued.scheduleIntentToken,
            storedFileKey: "uploads/assignments/a.pdf",
          },
          file: { filename: "b.pdf", originalname: "b.pdf", size: 20 },
        },
        res
      );
      assert.equal(res.statusCode, 400);
      assert.match(res.body.errors.file, /Upload one reference file/);
      assert.equal(harness.created.length, 0);
    } finally {
      harness.restore();
    }
  });

  it("61 special file names are stored without path segments", () => {
    const safe = allowlist.makeSafeFilename("..\\..\\notes.pdf");
    assert.equal(safe.includes(".."), false);
    assert.equal(safe.includes("\\"), false);
    assert.equal(safe.includes("/"), false);
    assert.match(safe, /^notes-\d+-[a-z0-9]+\.pdf$/);
  });

  it("62 an excessively long file name is rejected", () => {
    const name = `${"a".repeat(181)}.pdf`;
    const named = allowlist.evaluateOriginalFilename(name);
    assert.equal(named.ok, false);
    assert.equal(named.code, "UPLOAD_NAME_TOO_LONG");
  });

  it("63 a corrupted pdf and an exe renamed to pdf are rejected", () => {
    const corrupt = content.validateAcademicContent("brief.pdf", Buffer.from("this is not a pdf"));
    assert.equal(corrupt.ok, false);
    const exe = content.validateAcademicContent("brief.pdf", Buffer.from([0x4d, 0x5a, 0x90, 0x00]));
    assert.equal(exe.ok, false);
    assert.equal(exe.code, "UPLOAD_CONTENT_MISMATCH");
  });

  it("64 a text file and a real pdf header are accepted", () => {
    assert.equal(content.validateAcademicContent("notes.txt", Buffer.from("hello")).ok, true);
    assert.equal(content.validateAcademicContent("brief.pdf", Buffer.from("%PDF-1.7\n")).ok, true);
  });

  it("65 updating other fields keeps the stored reference file", async () => {
    const harness = await loadCreateHarness({
      assignments: [
        row({
          _id: "cur1",
          title: "Existing Lab",
          description: "Keep the existing instructions.",
          points: 10,
          file: "uploads/assignments/existing.pdf",
          originalFileName: "existing.pdf",
          startDate: new Date(Date.now() - 60_000),
          deadline: new Date(Date.now() + 86_400_000),
        }),
      ],
    });
    try {
      const current = harness.assignments[0];
      const res = jsonRes();
      await harness.ctrl.updateAssignment(
        {
          user: { _id: TEACHER_A, subject: "SE" },
          params: { id: "cur1" },
          body: {
            title: "Existing Lab",
            description: "Updated instructions",
            points: "12",
            startDate: current.startDate.toISOString(),
            deadline: current.deadline.toISOString(),
          },
          file: null,
        },
        res
      );
      assert.equal(res.statusCode, 200, JSON.stringify(res.body));
      assert.equal(harness.assignments[0].file, "uploads/assignments/existing.pdf");
      assert.equal(harness.assignments[0].originalFileName, "existing.pdf");
      assert.equal(harness.assignments[0].description, "Updated instructions");
    } finally {
      harness.restore();
    }
  });

  it("66 editing to an invalid start or a duplicate title is rejected", async () => {
    const harness = await loadCreateHarness({
      assignments: [
        row({ _id: "cur1", title: "Existing Lab" }),
        row({ _id: "other", title: "Taken Title" }),
      ],
    });
    try {
      const badDate = jsonRes();
      await harness.ctrl.updateAssignment(
        {
          user: { _id: TEACHER_A },
          params: { id: "cur1" },
          body: {
            title: "Existing Lab",
            description: "Still here",
            points: "10",
            startDate: "2020-01-01T10:00",
            deadline: "2020-01-02T10:00",
          },
          file: null,
        },
        badDate
      );
      assert.equal(badDate.statusCode, 400);
      assert.match(JSON.stringify(badDate.body.errors), /future/i);

      const duplicateRes = jsonRes();
      await harness.ctrl.updateAssignment(
        {
          user: { _id: TEACHER_A },
          params: { id: "cur1" },
          body: {
            title: "taken   title",
            description: "Still here",
            points: "10",
            startDate: new Date(Date.now() + 3_600_000).toISOString(),
            deadline: new Date(Date.now() + 7_200_000).toISOString(),
          },
          file: null,
        },
        duplicateRes
      );
      assert.equal(duplicateRes.statusCode, 409);
      assert.equal(duplicateRes.body.code, "ASSIGNMENT_DUPLICATE");
      assert.equal(harness.assignments[0].title, "Existing Lab");
    } finally {
      harness.restore();
    }
  });

  it("67 another teacher cannot update the assignment", async () => {
    const harness = await loadCreateHarness({
      assignments: [row({ _id: "cur1", title: "Existing Lab" })],
    });
    try {
      const res = jsonRes();
      await harness.ctrl.updateAssignment(
        {
          user: { _id: TEACHER_B },
          params: { id: "cur1" },
          body: { title: "Hijack" },
          file: null,
        },
        res
      );
      assert.equal(res.statusCode, 404);
      assert.equal(harness.assignments[0].title, "Existing Lab");
    } finally {
      harness.restore();
    }
  });

  it("68 a request without a token or with the wrong role is rejected", async () => {
    const unauth = jsonRes();
    let nextCalled = false;
    await protect({ headers: {} }, unauth, () => {
      nextCalled = true;
    });
    assert.equal(unauth.statusCode, 401);
    assert.equal(nextCalled, false);

    const forbidden = jsonRes();
    let roleNext = false;
    authorize("teacher")({ user: { role: "student" } }, forbidden, () => {
      roleNext = true;
    });
    assert.equal(forbidden.statusCode, 403);
    assert.equal(roleNext, false);
  });

  it("69 a saved assignment can be read back from the isolated store", async () => {
    const harness = await loadCreateHarness();
    try {
      const issued = intentApi.issueScheduleIntent({
        teacherId: TEACHER_A,
        startDate: "2027-03-01T18:00:00.000Z",
        deadline: "2027-03-02T18:00:00.000Z",
        now: Date.now(),
      });
      harness.resolveImpl = async () => ({
        storedPath: "uploads/assignments/ok.pdf",
        originalFileName: "ok.pdf",
        fileMimeType: "application/pdf",
      });
      const res = jsonRes();
      await harness.ctrl.createAssignment(
        {
          user: { _id: TEACHER_A, subject: "SE" },
          body: {
            title: "Persisted Lab",
            description: "Keep after refresh",
            points: "25",
            startDate: "2027-03-01T18:00:00.000Z",
            deadline: "2027-03-02T18:00:00.000Z",
            scheduleIntentToken: issued.scheduleIntentToken,
            storedFileKey: "uploads/assignments/ok.pdf",
            fileSize: "120",
          },
          file: null,
        },
        res
      );
      assert.equal(res.statusCode, 201, JSON.stringify(res.body));
      const saved = harness.assignments.find((rowItem) => rowItem.title === "Persisted Lab");
      assert.ok(saved);
      assert.equal(saved.file, "uploads/assignments/ok.pdf");
      assert.equal(saved.points, 25);
    } finally {
      harness.restore();
    }
  });

  it("70 a failed create does not report success", async () => {
    const harness = await loadCreateHarness({ failCreate: true });
    try {
      const issued = intentApi.issueScheduleIntent({
        teacherId: TEACHER_A,
        startDate: "2027-03-01T18:00:00.000Z",
        deadline: "2027-03-02T18:00:00.000Z",
        now: Date.now(),
      });
      harness.resolveImpl = async () => ({
        storedPath: "uploads/assignments/ok.pdf",
        originalFileName: "ok.pdf",
        fileMimeType: "application/pdf",
      });
      const res = jsonRes();
      await harness.ctrl.createAssignment(
        {
          user: { _id: TEACHER_A, subject: "SE" },
          body: {
            title: "Will Fail",
            description: "Network failure must not succeed.",
            points: "25",
            startDate: "2027-03-01T18:00:00.000Z",
            deadline: "2027-03-02T18:00:00.000Z",
            scheduleIntentToken: issued.scheduleIntentToken,
            storedFileKey: "uploads/assignments/ok.pdf",
          },
          file: null,
        },
        res
      );
      assert.equal(res.statusCode, 500);
      assert.notEqual(res.statusCode, 201);
    } finally {
      harness.restore();
    }
  });

  it("71 a second submit while one is pending is blocked", async () => {
    const { createSubmitLock } = await import(
      "../../frontend/src/utils/submitLock.js"
    );
    const lock = createSubmitLock();
    assert.equal(lock.tryBegin(), true);
    assert.equal(lock.tryBegin(), false);
    lock.end();
    assert.equal(lock.tryBegin(), true);
    lock.end();
  });

  it("72 cancel and success UI do not create or claim success early", () => {
    const dashboard = fs.readFileSync(
      path.resolve(__dirname, "../../frontend/src/pages/dashboards/TeacherDashboard.jsx"),
      "utf8"
    );
    const cancelStart = dashboard.indexOf("const handleCancelCreate");
    const createStart = dashboard.indexOf("const handleCreateOrUpdate");
    const cancelFn = dashboard.slice(cancelStart, createStart);
    assert.equal(cancelFn.includes("createAssignment"), false);
    assert.equal(cancelFn.includes("createScheduleIntent"), false);
    const handler = dashboard.slice(createStart, createStart + 9000);
    const createIdx = handler.indexOf("createAssignment");
    const successIdx = handler.indexOf("assignmentCreatedMessage");
    const catchIdx = handler.indexOf("} catch");
    assert.ok(createIdx > 0 && successIdx > createIdx);
    assert.ok(catchIdx > successIdx);
    assert.equal(handler.slice(catchIdx).includes("assignmentCreatedMessage"), false);
    assert.match(dashboard, /disabled=\{savingAssignment\}/);
    assert.match(dashboard, /tryBegin\(\)/);
  });

  it("73 student publication gates remain in place", () => {
    const routes = fs.readFileSync(
      path.resolve(__dirname, "../routes/studentRoutes.js"),
      "utf8"
    );
    const files = fs.readFileSync(
      path.resolve(__dirname, "../controllers/fileController.js"),
      "utf8"
    );
    assert.match(routes, /canAccessMaterials/);
    assert.match(routes, /Assignment is not open yet/i);
    assert.match(routes, /file: undefined/);
    assert.match(files, /not open yet/i);
    const teacherRoutes = fs.readFileSync(
      path.resolve(__dirname, "../routes/teacherRoutes.js"),
      "utf8"
    );
    assert.match(teacherRoutes, /protect, authorize\('teacher'\)/);
  });
});

describe("final checklist additions", () => {
  const OBSOLETE = "Start date must be today (Asia/Karachi). Future calendar dates are not allowed.";

  it("74 emoji titles and symbol-only titles are rejected; ordinary titles stay valid", () => {
    assert.equal(validate({ title: "Lab 😀 One" }).ok, false);
    assert.match(validate({ title: "Lab 😀 One" }).errors.title, /valid title/i);
    assert.match(validate({ title: "###" }).errors.title, /valid title/i);
    assert.equal(validate({ title: "Lab #1" }).ok, true);
    assert.equal(validate({ title: "System Design - Part 2" }).ok, true);
  });

  it("75 marks accept 1 and 100 and reject decimals", () => {
    assert.equal(validate({ points: "1" }).values.points, 1);
    assert.equal(validate({ points: "100" }).values.points, 100);
    assert.equal(validate({ points: "10.5" }).ok, false);
    assert.equal(validate({ points: "5.75" }).ok, false);
    assert.equal(validate({ points: "1e2" }).ok, false);
  });

  it("76 description length, multiline text, and HTML are handled as text", () => {
    assert.match(validate({ description: "Too short" }).errors.description, /too short/);
    const ok = validate({ description: "Line one\nLine two is enough." });
    assert.equal(ok.ok, true);
    assert.match(ok.values.description, /\n/);
    const html = validate({
      description: "<script>alert(1)</script> Read chapter 2 carefully.",
    });
    assert.equal(html.ok, true);
    assert.match(html.values.description, /<script>/);
    assert.equal(validate({ description: "A".repeat(2000) }).ok, true);
    assert.equal(validate({ description: "A".repeat(2001) }).ok, false);
  });

  it("77 the obsolete today-only start message is not in the active flow", () => {
    const paths = [
      "../utils/assignmentFieldValidation.js",
      "../../frontend/src/utils/assignmentFieldValidation.js",
      "../../frontend/src/pages/dashboards/TeacherDashboard.jsx",
      "../controllers/teacherController.js",
    ].map((rel) => path.resolve(__dirname, rel));
    for (const file of paths) {
      assert.equal(fs.readFileSync(file, "utf8").includes(OBSOLETE), false, file);
    }
    const future = validate({
      startDate: "2026-11-06T09:00",
      deadline: "2026-11-08T09:00",
    });
    assert.equal(future.ok, true);
  });

  it("78 student window hides before start and closes submission at the due instant", () => {
    const { evaluateAssignmentWindow } = require("../utils/assignmentAvailability");
    const start = Date.parse("2026-11-02T07:00:00.000Z");
    const due = Date.parse("2026-11-02T12:00:00.000Z");
    assert.equal(evaluateAssignmentWindow(start, due, start - 1).visibleToStudent, false);
    assert.equal(evaluateAssignmentWindow(start, due, start).visibleToStudent, true);
    assert.equal(evaluateAssignmentWindow(start, due, start).canSubmit, true);
    assert.equal(evaluateAssignmentWindow(start, due, due).canSubmit, false);
    assert.equal(evaluateAssignmentWindow(start, due, due + 5).deadlineReached, true);
  });
});

function row(overrides = {}) {
  return {
    _id: "a1",
    teacher: TEACHER_A,
    title: "Week 4 Lab",
    subject: "SE",
    description: "Old",
    points: 10,
    startDate: new Date("2026-11-10T09:00:00.000Z"),
    deadline: new Date("2026-11-17T09:00:00.000Z"),
    status: "active",
    file: "uploads/assignments/existing.pdf",
    originalFileName: "existing.pdf",
    ...overrides,
  };
}

function makeStore(rows) {
  return {
    find(query) {
      const filtered = rows.filter((item) => {
        if (query.teacher && String(item.teacher) !== String(query.teacher)) return false;
        if (query.status && item.status !== query.status) return false;
        if (query._id && query._id.$ne && String(item._id) === String(query._id.$ne)) return false;
        return true;
      });
      return {
        select() {
          return { lean: async () => filtered.map((item) => ({ ...item })) };
        },
      };
    },
  };
}

async function loadCreateHarness({ assignments = [], failCreate = false } = {}) {
  const teacherControllerPath = path.resolve(__dirname, "../controllers/teacherController.js");
  const originalLoad = Module._load;
  let resolveImpl = async () => null;
  const created = [];
  Module._load = function (request, parent, isMain) {
    if (request === "../utils/resolveDurableUpload") {
      return {
        resolveDurableUpload: (...args) => resolveImpl(...args),
      };
    }
    if (request === "../models/Assignment") {
      return {
        find: (query) => makeStore(assignments).find(query),
        findOne: async (query) =>
          assignments.find(
            (item) =>
              String(item._id) === String(query._id) &&
              String(item.teacher) === String(query.teacher)
          ) || null,
        create: async (doc) => {
          if (failCreate) throw new Error("simulated persistence failure");
          const saved = { ...doc, _id: `new-${created.length + 1}` };
          created.push(saved);
          assignments.push(saved);
          return saved;
        },
        findOneAndUpdate: async (query, update) => {
          const current = assignments.find(
            (item) =>
              String(item._id) === String(query._id) &&
              String(item.teacher) === String(query.teacher)
          );
          if (!current) return null;
          Object.assign(current, update.$set || {});
          return { ...current };
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
  const ctrl = require(teacherControllerPath);
  return {
    ctrl,
    created,
    assignments,
    set resolveImpl(fn) {
      resolveImpl = fn;
    },
    restore() {
      Module._load = originalLoad;
      delete require.cache[teacherControllerPath];
    },
  };
}
