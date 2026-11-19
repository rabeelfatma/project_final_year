import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  filterSubmissionsForAssignment,
  toggleSubmissionSelection,
  selectAllSubmissionIds,
  clearSelectionOnAssignmentChange,
  fileTypeFromSubmission,
  describeNetworkOrApiError,
} from "./plagiarismSelection.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const teacherDash = fs.readFileSync(
  path.resolve(__dirname, "../pages/dashboards/TeacherDashboard.jsx"),
  "utf8"
);
const teacherService = fs.readFileSync(
  path.resolve(__dirname, "../services/teacherService.js"),
  "utf8"
);

const subs = [
  {
    _id: "s1",
    assignment: { _id: "a1" },
    originalFileName: "one.pdf",
    fileMimeType: "application/pdf",
  },
  {
    _id: "s2",
    assignment: { _id: "a1" },
    originalFileName: "two.docx",
  },
  {
    _id: "s3",
    assignment: { _id: "a2" },
    originalFileName: "other.txt",
  },
];

describe("plagiarismSelection helpers", () => {
  it("filters submissions to one assignment and supports empty assignment", () => {
    expect(filterSubmissionsForAssignment(subs, "a1").map((s) => s._id)).toEqual([
      "s1",
      "s2",
    ]);
    expect(filterSubmissionsForAssignment(subs, "a2")).toHaveLength(1);
    expect(filterSubmissionsForAssignment(subs, "")).toEqual([]);
    expect(filterSubmissionsForAssignment(subs, "missing")).toEqual([]);
  });

  it("supports Select All, individual toggle, and clear on assignment change", () => {
    expect(selectAllSubmissionIds(filterSubmissionsForAssignment(subs, "a1"))).toEqual([
      "s1",
      "s2",
    ]);
    expect(toggleSubmissionSelection(["s1"], "s2")).toEqual(["s1", "s2"]);
    expect(toggleSubmissionSelection(["s1", "s2"], "s1")).toEqual(["s2"]);
    expect(clearSelectionOnAssignmentChange("a2")).toEqual({
      assignmentId: "a2",
      selectedIds: [],
    });
  });

  it("derives file type and describes network errors honestly", () => {
    expect(fileTypeFromSubmission(subs[0])).toBe("PDF");
    expect(fileTypeFromSubmission(subs[1])).toBe("DOCX");
    expect(
      describeNetworkOrApiError({ message: "Network Error", code: "ERR_NETWORK" })
    ).toMatch(/Network Error/i);
    expect(
      describeNetworkOrApiError({ message: "Network Error", code: "ERR_NETWORK" })
    ).toMatch(/API server is unreachable/i);
  });
});

describe("Teacher Plagiarism workspace wiring", () => {
  it("loads real teacher assignment and submission APIs with error states", () => {
    expect(teacherDash).toMatch(/loadPlagiarismWorkspace/);
    expect(teacherDash).toMatch(/getMyAssignments/);
    expect(teacherDash).toMatch(/getRecentSubmissions/);
    expect(teacherDash).toMatch(/plagiarismDataError/);
    expect(teacherDash).toMatch(/plagiarismDataLoading/);
    expect(teacherDash).toMatch(/Assignments could not be loaded/);
    expect(teacherDash).toMatch(/No assignments created yet/);
    expect(teacherDash).toMatch(/This assignment has no student submissions yet/);
    expect(teacherDash).toMatch(/Check Plagiarism \(\$\{plagiarismSelectedIds\.length\}\)/);
    expect(teacherDash).toMatch(/assignmentId:\s*plagiarismAssignmentId/);
    expect(teacherService).toMatch(/assignmentId/);
  });

  it("does not treat network failure as an empty assignment list alone", () => {
    expect(teacherDash).toMatch(/describeNetworkOrApiError|Network Error: the API server is unreachable/);
    expect(teacherDash).toMatch(/setPlagiarismDataError/);
  });
});
