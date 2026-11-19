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
  filterPlagiarismAssignments,
  deriveAssignmentPlagiarismStatus,
  toggleComparisonMode,
  selectedComparisonModes,
  canRunPlagiarismCheck,
  describePlagiarismCheckRequirements,
  selectAllAssignmentIds,
  isIdSelected,
  PLAGIARISM_MODES,
  ASSIGNMENT_CHECK_STATUS,
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

const assignments = [
  { _id: "a1", title: "Midterm Essay" },
  { _id: "a2", title: "Lab Report" },
  { _id: "a3", title: "Quiz Draft" },
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
    expect(selectAllAssignmentIds(assignments)).toEqual(["a1", "a2", "a3"]);
    expect(isIdSelected(["a1", "a3"], "a1")).toBe(true);
    expect(isIdSelected(["a1"], "a2")).toBe(false);
  });

  it("derives assignment status from real checks and filters search + status together", () => {
    const checks = [
      {
        assignment: "a1",
        status: "provider_not_connected",
        requestedAt: "2026-11-01T10:00:00.000Z",
      },
      {
        assignment: "a2",
        status: "queued",
        requestedAt: "2026-11-02T10:00:00.000Z",
      },
      {
        assignment: "a2",
        status: "completed",
        similarityPercent: 12,
        requestedAt: "2026-11-01T09:00:00.000Z",
      },
    ];
    expect(deriveAssignmentPlagiarismStatus("a3", checks)).toBe(
      ASSIGNMENT_CHECK_STATUS.NOT_CHECKED
    );
    expect(deriveAssignmentPlagiarismStatus("a1", checks)).toBe(
      ASSIGNMENT_CHECK_STATUS.PROVIDER_NOT_CONNECTED
    );
    expect(deriveAssignmentPlagiarismStatus("a2", checks)).toBe(
      ASSIGNMENT_CHECK_STATUS.IN_PROGRESS
    );

    expect(
      filterPlagiarismAssignments({
        assignments,
        search: "lab",
        assignmentFilter: "all",
        statusFilter: "all",
        checks,
      }).map((row) => row._id)
    ).toEqual(["a2"]);

    expect(
      filterPlagiarismAssignments({
        assignments,
        search: "",
        assignmentFilter: "all",
        statusFilter: ASSIGNMENT_CHECK_STATUS.NOT_CHECKED,
        checks,
      }).map((row) => row._id)
    ).toEqual(["a3"]);
  });

  it("supports independent comparison modes and run gating", () => {
    let modes = {
      [PLAGIARISM_MODES.EXTERNAL_SOURCES]: true,
      [PLAGIARISM_MODES.STUDENT_PAPER_REPOSITORY]: false,
    };
    modes = toggleComparisonMode(modes, PLAGIARISM_MODES.STUDENT_PAPER_REPOSITORY);
    expect(selectedComparisonModes(modes)).toEqual([
      PLAGIARISM_MODES.EXTERNAL_SOURCES,
      PLAGIARISM_MODES.STUDENT_PAPER_REPOSITORY,
    ]);
    expect(
      canRunPlagiarismCheck({ assignmentIds: ["a1"], modes })
    ).toBe(true);
    expect(
      canRunPlagiarismCheck({
        assignmentIds: [],
        modes: { [PLAGIARISM_MODES.EXTERNAL_SOURCES]: true },
      })
    ).toBe(false);
    expect(
      describePlagiarismCheckRequirements({
        assignmentIds: [],
        modes: {
          [PLAGIARISM_MODES.EXTERNAL_SOURCES]: false,
          [PLAGIARISM_MODES.STUDENT_PAPER_REPOSITORY]: false,
        },
      })
    ).toBe(
      "Please select at least one assignment and at least one comparison mode."
    );
    expect(
      describePlagiarismCheckRequirements({
        assignmentIds: [],
        modes: { [PLAGIARISM_MODES.EXTERNAL_SOURCES]: true },
      })
    ).toBe("Please select at least one assignment.");
    expect(
      describePlagiarismCheckRequirements({
        assignmentIds: ["a1"],
        modes: {
          [PLAGIARISM_MODES.EXTERNAL_SOURCES]: false,
          [PLAGIARISM_MODES.STUDENT_PAPER_REPOSITORY]: false,
        },
      })
    ).toBe("Please select at least one comparison mode.");
    expect(
      describePlagiarismCheckRequirements({
        assignmentIds: ["a1"],
        modes: { [PLAGIARISM_MODES.EXTERNAL_SOURCES]: true },
      })
    ).toBeNull();
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
    expect(teacherDash).toMatch(/Check Plagiarism \(\$\{plagiarismSelectedAssignmentIds\.length\}\)/);
    expect(teacherDash).toMatch(/assignmentId:\s*job\.assignmentId/);
    expect(teacherService).toMatch(/assignmentId/);
  });

  it("wires double-click selection, filters, and dual comparison modes", () => {
    expect(teacherDash).toMatch(/handlePlagiarismAssignmentDoubleClick/);
    expect(teacherDash).toMatch(/plagiarismSelectMode/);
    expect(teacherDash).not.toMatch(/Done \/ Continue/);
    expect(teacherDash).toMatch(/Select All/);
    expect(teacherDash).toMatch(/Clear All/);
    expect(teacherDash).toMatch(/Delete All/);
    expect(teacherDash).toMatch(/handlePlagiarismDeleteAssignment/);
    expect(teacherDash).toMatch(/All Assignments/);
    expect(teacherDash).toMatch(/All Statuses/);
    expect(teacherDash).toMatch(/Not Checked/);
    expect(teacherDash).toMatch(/type=\"checkbox\"/);
    expect(teacherDash).toMatch(/External Sources/);
    expect(teacherDash).toMatch(/Student Paper Repository/);
    expect(teacherDash).not.toMatch(/type=\"radio\"[\s\S]{0,80}plagiarismMode/);
    expect(teacherDash).toMatch(/This assignment has no student submissions yet|has no student submissions yet/);
    // Dropdown hides Provider Not Connected; backend status handling remains.
    expect(teacherDash).not.toMatch(
      /<option value=\{ASSIGNMENT_CHECK_STATUS\.PROVIDER_NOT_CONNECTED\}>/
    );
  });

  it("keeps Check Plagiarism clickable and shows requirement messages", () => {
    const selectionUtil = fs.readFileSync(
      path.resolve(__dirname, "./plagiarismSelection.js"),
      "utf8"
    );
    expect(teacherDash).toMatch(/describePlagiarismCheckRequirements/);
    expect(teacherDash).toMatch(/disabled=\{checkingPlagiarism\}/);
    expect(teacherDash).not.toMatch(
      /disabled=\{checkingPlagiarism \|\| !plagiarismCanCheck\}/
    );
    expect(teacherDash).toMatch(/if \(checkingPlagiarism\) return/);
    expect(teacherDash).toMatch(/setSimilarityError\(requirementsMessage\)/);
    expect(selectionUtil).toMatch(/Please select at least one assignment\./);
    expect(selectionUtil).toMatch(/Please select at least one comparison mode\./);
    expect(selectionUtil).toMatch(
      /Please select at least one assignment and at least one comparison mode\./
    );
    expect(teacherDash).toMatch(/plagiarismCheckProgress/);
    expect(teacherDash).toMatch(/setCheckingPlagiarism\(true\)/);
  });

  it("does not treat network failure as an empty assignment list alone", () => {
    expect(teacherDash).toMatch(/describeNetworkOrApiError|Network Error: the API server is unreachable/);
    expect(teacherDash).toMatch(/setPlagiarismDataError/);
  });
});
