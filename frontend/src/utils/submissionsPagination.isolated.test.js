import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  submissionsTotalPages,
  clampSubmissionPage,
  goToPreviousSubmissionPage,
  goToNextSubmissionPage,
  submissionPageMeta,
} from "./submissionsPagination.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const teacherDash = fs.readFileSync(
  path.resolve(__dirname, "../pages/dashboards/TeacherDashboard.jsx"),
  "utf8"
);
const css = fs.readFileSync(path.resolve(__dirname, "../index.css"), "utf8");

describe("submissionsPagination helpers", () => {
  it("computes pages, clamps, and steps at boundaries", () => {
    expect(submissionsTotalPages(0, 8)).toBe(1);
    expect(submissionsTotalPages(8, 8)).toBe(1);
    expect(submissionsTotalPages(9, 8)).toBe(2);
    expect(submissionsTotalPages(24, 8)).toBe(3);

    expect(clampSubmissionPage(0, 3)).toBe(1);
    expect(clampSubmissionPage(99, 3)).toBe(3);
    expect(clampSubmissionPage(2, 3)).toBe(2);

    expect(goToPreviousSubmissionPage(1, 3)).toBe(1);
    expect(goToPreviousSubmissionPage(2, 3)).toBe(1);
    expect(goToPreviousSubmissionPage(99, 3)).toBe(2);

    expect(goToNextSubmissionPage(1, 3)).toBe(2);
    expect(goToNextSubmissionPage(3, 3)).toBe(3);
    expect(goToNextSubmissionPage(99, 3)).toBe(3);
  });

  it("builds Showing X–Y of Z meta for filters and page size 8", () => {
    expect(submissionPageMeta(1, 8, 20)).toEqual({
      page: 1,
      totalPages: 3,
      from: 1,
      to: 8,
      total: 20,
    });
    expect(submissionPageMeta(3, 8, 20)).toEqual({
      page: 3,
      totalPages: 3,
      from: 17,
      to: 20,
      total: 20,
    });
    expect(submissionPageMeta(5, 8, 5)).toEqual({
      page: 1,
      totalPages: 1,
      from: 1,
      to: 5,
      total: 5,
    });
  });
});

describe("Teacher Submissions pagination wiring", () => {
  it("uses functional page updates and resets to page 1 on filter/search", () => {
    expect(teacherDash).toMatch(/SUBMISSIONS_PAGE_SIZE\s*=\s*8/);
    expect(teacherDash).toMatch(/goToPreviousSubmissionPage/);
    expect(teacherDash).toMatch(/goToNextSubmissionPage/);
    expect(teacherDash).toMatch(
      /setSubmissionPage\(\(p\)\s*=>\s*goToPreviousSubmissionPage\(p,\s*submissionTotalPages\)\s*\)/s
    );
    expect(teacherDash).toMatch(
      /setSubmissionPage\(\(p\)\s*=>\s*goToNextSubmissionPage\(p,\s*submissionTotalPages\)\s*\)/s
    );
    expect(teacherDash).toMatch(/disabled=\{safeSubmissionPage <= 1\}/);
    expect(teacherDash).toMatch(
      /disabled=\{safeSubmissionPage >= submissionTotalPages\}/
    );
    expect(teacherDash).toMatch(/setSubmissionSearch\(e\.target\.value\);\s*setSubmissionPage\(1\);/s);
    expect(teacherDash).toMatch(
      /setSubmissionAssignmentFilter\(e\.target\.value\);\s*setSubmissionPage\(1\);/s
    );
    expect(teacherDash).toMatch(
      /setSubmissionStatusFilter\(e\.target\.value\);\s*setSubmissionPage\(1\);/s
    );
    expect(teacherDash).toMatch(/aria-label="Previous page"/);
    expect(teacherDash).toMatch(/aria-label="Next page"/);
    expect(css).toMatch(/\.qc-submissions-pagination__controls\s+\.qc-btn/);
    expect(css).toMatch(
      /\.qc-submissions-pagination__controls\s+\.qc-btn:hover:not\(:disabled\)/
    );
  });
});
