/**
 * Student submission status UI — source inspection only.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const studentDash = fs.readFileSync(
  path.join(__dirname, "../pages/dashboards/StudentDashboard.jsx"),
  "utf8"
);
const studentRoutes = fs.readFileSync(
  path.resolve(__dirname, "../../../backend/routes/studentRoutes.js"),
  "utf8"
);
const css = fs.readFileSync(
  path.join(__dirname, "../index.css"),
  "utf8"
);

describe("Student assignment submission status", () => {
  it("hides Submit Assignment when a backend submission already exists", () => {
    expect(studentDash).toMatch(/canUpload = asgn\.canSubmit === true && !isSubmitted/);
    expect(studentDash).toMatch(/asgn\.isSubmitted === true/);
    expect(studentDash).toMatch(/asgn\.submissionId/);
    expect(studentDash).toMatch(/data-testid="qc-assignment-submitted-badge"/);
    expect(studentDash).toMatch(/>\s*SUBMITTED\s*</);

    const submittedBranch = studentDash.match(
      /isSubmitted \? \([\s\S]*?\) : \(/
    )?.[0];
    expect(submittedBranch).toBeTruthy();
    expect(submittedBranch).not.toMatch(/type=["']file["']/);
    expect(submittedBranch).not.toMatch(
      /<button[\s\S]*?Submit Assignment/
    );
  });

  it("shows Submit Assignment only when canUpload is true", () => {
    expect(studentDash).toMatch(/if \(canUpload\) return ["']Submit Assignment["']/);
    expect(studentDash).toMatch(
      /canUpload \? \([\s\S]*?\{actionLabel\}[\s\S]*?type=["']file["']/
    );
  });

  it("blocks duplicate uploads on the client and server", () => {
    expect(studentDash).toMatch(/alreadySubmitted && current\?\.canSubmit !== true/);
    expect(studentDash).toMatch(/ALREADY_SUBMITTED/);
    expect(studentDash).toMatch(
      /Already Submitted — You don(?:&apos;|')t need to submit again\./
    );
    expect(studentRoutes).toMatch(/isSubmitted:\s*Boolean\(submission\)/);
    expect(studentRoutes).toMatch(/canSubmit/);
    expect(studentRoutes).toMatch(/code:\s*["']ALREADY_SUBMITTED["']/);
    expect(studentRoutes).toMatch(/You have already submitted this assignment\./);
    expect(studentRoutes).toMatch(/Resubmission is not supported/);
    expect(css).toMatch(/\.qc-status-badge\.is-submitted/);
  });
});
