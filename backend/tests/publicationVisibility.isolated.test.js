const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const util = require("../utils/publicationVisibility");
const teacherControllerPath = path.join(root, "controllers/teacherController.js");
const submissionModelPath = path.join(root, "models/Submission.js");
const studentRoutesPath = path.join(root, "routes/studentRoutes.js");

describe("independent AI / Teacher publication visibility", () => {
  it("schema declares independent publication flags", () => {
    const src = fs.readFileSync(submissionModelPath, "utf8");
    assert.match(src, /aiPublished/);
    assert.match(src, /teacherMarksPublished/);
    assert.match(src, /teacherFeedbackPublished/);
  });

  it("publishResults supports AI-only and full scopes without copying AI into Teacher", () => {
    const src = fs.readFileSync(teacherControllerPath, "utf8");
    assert.match(src, /scope === ["']ai["']/);
    assert.match(src, /applyAiPublication/);
    assert.match(src, /applyTeacherMarksPublication/);
    assert.match(src, /applyTeacherFeedbackPublication/);
    assert.match(src, /Already published/);
    assert.doesNotMatch(src, /submission\.marks\s*=\s*submission\.aiScore/);
  });

  it("student routes redact using granular publication helpers", () => {
    const src = fs.readFileSync(studentRoutesPath, "utf8");
    assert.match(src, /redactSubmissionForStudent/);
    assert.match(src, /canShowAiResult/);
    assert.match(src, /canShowTeacherMarks/);
    assert.match(src, /canShowTeacherFeedback/);
    assert.doesNotMatch(src, /marks:\s*canShowResult\s*\?\s*submission\.marks\s*\?\?\s*submission\.aiScore/);
  });

  it("AI-only publish visibility hides unpublished Teacher fields", () => {
    const row = {
      status: "PUBLISHED",
      aiScore: 18,
      aiFeedback: "Solid work",
      aiStrengths: ["clarity"],
      aiImprovements: ["examples"],
      marks: 20,
      feedback: "Secret teacher note",
      aiPublished: true,
      teacherMarksPublished: false,
      teacherFeedbackPublished: false,
      totalMarks: 20,
    };
    const safe = util.redactSubmissionForStudent(row);
    assert.equal(safe.aiScore, 18);
    assert.equal(safe.aiFeedback, "Solid work");
    assert.equal(safe.marks, null);
    assert.equal(safe.feedback, "");
    assert.equal(safe.aiPublished, true);
    assert.equal(safe.teacherMarksPublished, false);
  });

  it("Teacher-only publish hides unpublished AI fields", () => {
    const row = {
      status: "PUBLISHED",
      aiScore: 11,
      aiFeedback: "Hidden AI",
      marks: 15,
      feedback: "Teacher note",
      aiPublished: false,
      teacherMarksPublished: true,
      teacherFeedbackPublished: true,
      totalMarks: 20,
    };
    const safe = util.redactSubmissionForStudent(row);
    assert.equal(safe.aiScore, null);
    assert.equal(safe.aiFeedback, "");
    assert.equal(safe.marks, 15);
    assert.equal(safe.feedback, "Teacher note");
  });

  it("legacy PUBLISHED with distinct Teacher marks remains visible", () => {
    const row = {
      status: "PUBLISHED",
      aiScore: 12,
      aiFeedback: "Legacy AI",
      marks: 14,
      feedback: "Legacy teacher",
      aiPublished: false,
      teacherMarksPublished: false,
      teacherFeedbackPublished: false,
      totalMarks: 20,
    };
    const safe = util.redactSubmissionForStudent(row);
    assert.equal(safe.aiScore, 12);
    assert.equal(safe.marks, 14);
    assert.equal(safe.feedback, "Legacy teacher");
  });

  it("legacy PUBLISHED AI-only mirror does not surface Teacher Marks", () => {
    const row = {
      status: "PUBLISHED",
      aiScore: 17,
      aiFeedback: "AI only",
      marks: 17,
      feedback: "",
      aiPublished: false,
      teacherMarksPublished: false,
      teacherFeedbackPublished: false,
      totalMarks: 20,
    };
    const safe = util.redactSubmissionForStudent(row);
    assert.equal(safe.aiScore, 17);
    assert.equal(safe.marks, null);
    assert.equal(safe.teacherMarksPublished, false);
    assert.equal(safe.feedback, "");
  });

  it("AI published flag never implies Teacher Marks publication", () => {
    const row = {
      status: "PUBLISHED",
      aiScore: 17,
      aiFeedback: "Published AI",
      marks: 17,
      feedback: "Draft teacher note",
      aiPublished: true,
      teacherMarksPublished: false,
      teacherFeedbackPublished: false,
      totalMarks: 20,
    };
    const safe = util.redactSubmissionForStudent(row);
    assert.equal(safe.aiScore, 17);
    assert.equal(safe.marks, null);
    assert.equal(safe.feedback, "");
    assert.equal(safe.teacherMarksPublished, false);
  });

  it("unpublished results stay fully redacted", () => {
    const row = {
      status: "AI_GRADED",
      aiScore: 19,
      aiFeedback: "Not yet",
      marks: 17,
      feedback: "Draft",
      aiPublished: false,
      teacherMarksPublished: false,
      teacherFeedbackPublished: false,
    };
    const safe = util.redactSubmissionForStudent(row);
    assert.equal(safe.aiScore, null);
    assert.equal(safe.marks, null);
    assert.equal(safe.feedback, "");
    assert.equal(safe.aiFeedback, "");
    assert.equal(util.hasAnyPublishedResult(row), false);
  });

  it("does not invent zero marks for missing values", () => {
    const row = {
      status: "PUBLISHED",
      aiScore: null,
      marks: null,
      feedback: "Only feedback",
      aiPublished: false,
      teacherMarksPublished: false,
      teacherFeedbackPublished: true,
    };
    const safe = util.redactSubmissionForStudent(row);
    assert.equal(safe.marks, null);
    assert.equal(safe.aiScore, null);
    assert.equal(safe.feedback, "Only feedback");
  });
});
