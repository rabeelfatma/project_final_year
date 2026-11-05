/**
 * Isolated LMS dashboard UI contracts (source inspection only — no live DB).
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const teacherDash = fs.readFileSync(
  path.join(root, "pages/dashboards/TeacherDashboard.jsx"),
  "utf8"
);
const studentDash = fs.readFileSync(
  path.join(root, "pages/dashboards/StudentDashboard.jsx"),
  "utf8"
);
const fileLink = fs.readFileSync(
  path.join(root, "components/files/FileLink.jsx"),
  "utf8"
);
const authMw = fs.readFileSync(
  path.resolve(root, "../../backend/middleware/authMiddleware.js"),
  "utf8"
);

describe("LMS dashboard redesign contracts", () => {
  it("FileLink named variant shows displayName without extension while keeping full name for open", () => {
    expect(fileLink).toMatch(/variant === ["']named["']/);
    expect(fileLink).toMatch(/displayName/);
    expect(fileLink).toMatch(/qc-file-named/);
  });

  it("Teacher submissions: double-click selection mode, Select All, AI question-file prompt", () => {
    expect(teacherDash).toMatch(/selectSubmissionsMode/);
    expect(teacherDash).toMatch(/handleSelectAllSubmissions/);
    expect(teacherDash).toMatch(/Select All/);
    expect(teacherDash).toMatch(/aiQuestionFilePrompt/);
    expect(teacherDash).toMatch(/Do you want to include the Question File in AI Evaluation\?/);
    expect(teacherDash).toMatch(/Reset All Grades/);
    expect(teacherDash).toMatch(/Delete Selected/);
    expect(teacherDash).not.toMatch(/label:\s*['"]Open Student Submission['"]/);
    expect(teacherDash).toMatch(/\{\s*savingEval[\s\S]{0,120}Publish\s*<\/button>/);
    expect(teacherDash).not.toMatch(/Save & Publish/);
  });

  it("Review modal footer uses three primary actions", () => {
    expect(teacherDash).toMatch(/Save Teacher Grade/);
    expect(teacherDash).toMatch(/Publish AI Result/);
    expect(teacherDash).toMatch(/qc-review-modal/);
    expect(teacherDash).toMatch(/Strengths/);
    expect(teacherDash).toMatch(/Improvements/);
  });

  it("Student My Assignments: clickable title, download icon, no default General subject badge", () => {
    expect(studentDash).toMatch(/My Assignments/);
    expect(studentDash).toMatch(/studentAssignmentShelf/);
    expect(studentDash).toMatch(/meaningfulSubject/);
    expect(studentDash).toMatch(/Submit Assignment/);
    expect(studentDash).toMatch(/downloadAssignmentFile/);
    expect(studentDash).toMatch(/View Details/);
    expect(studentDash).not.toMatch(/Subject: \{asgn\.subject \|\| ["']General["']\}/);
  });

  it("Auth middleware rejects empty/malformed Bearer before jwt.verify", () => {
    expect(authMw).toMatch(/extractBearerToken/);
    expect(authMw).toMatch(/parts\.length !== 3/);
    expect(authMw).not.toMatch(/AUTH FAIL: Token verification failed:/);
  });
});
