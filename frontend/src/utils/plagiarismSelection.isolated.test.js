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
  filterPlagiarismHistoryChecks,
  pageAfterHistoryCountChange,
  selectAllAssignmentIds,
  isIdSelected,
  PLAGIARISM_MODES,
  ASSIGNMENT_CHECK_STATUS,
} from "./plagiarismSelection.js";
import {
  submissionsTotalPages,
  clampSubmissionPage,
  goToNextSubmissionPage,
  goToPreviousSubmissionPage,
  submissionPageMeta,
} from "./submissionsPagination.js";

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

  it("wires Clear Check History confirmation without touching assignment delete flows", () => {
    expect(teacherDash).toMatch(/Clear Check History/);
    expect(teacherDash).toMatch(/Clear Plagiarism Check History\?/);
    expect(teacherDash).toMatch(
      /permanently delete all your plagiarism check history\?/
    );
    expect(teacherDash).toMatch(/Assignments and student submissions will not be deleted/);
    expect(teacherDash).toMatch(/confirmLabel:\s*['"]Clear History['"]/);
    expect(teacherDash).toMatch(/cancelLabel:\s*['"]Cancel['"]/);
    expect(teacherDash).toMatch(/handleClearPlagiarismHistory/);
    expect(teacherDash).toMatch(/clearSimilarityHistory/);
    expect(teacherDash).toMatch(/setClearingPlagiarismHistory\(false\)/);
    expect(teacherService).toMatch(/clearSimilarityHistory/);
    expect(teacherService).toMatch(/api\.post\(['"]\/plagiarism\/checks\/clear['"]\)/);
    expect(teacherDash).toMatch(/setPlagiarismHistoryPage\(1\)/);
    // Existing assignment deletion paths remain.
    expect(teacherDash).toMatch(/handlePlagiarismDeleteAssignment/);
    expect(teacherDash).toMatch(/handlePlagiarismDeleteSelectedAssignments/);
  });

  it("paginates assignment cards and history independently with page size 8", () => {
    expect(teacherDash).toMatch(/PLAGIARISM_ASSIGNMENT_PAGE_SIZE\s*=\s*8/);
    expect(teacherDash).toMatch(/PLAGIARISM_HISTORY_PAGE_SIZE\s*=\s*8/);
    expect(teacherDash).toMatch(/pagedPlagiarismAssignments/);
    expect(teacherDash).toMatch(/pagedPlagiarismHistory/);
    expect(teacherDash).toMatch(/plagiarismAssignmentPage/);
    expect(teacherDash).toMatch(/plagiarismHistoryPage/);
    expect(teacherDash).toMatch(/qc-plagiarism-assignment-pagination/);
    expect(teacherDash).toMatch(/qc-plagiarism-history-pagination/);
    expect(teacherDash).toMatch(/filterPlagiarismHistoryChecks/);
    expect(teacherDash).toMatch(/Showing \{plagiarismAssignmentRange\.from\}/);
    expect(teacherDash).toMatch(/Showing \{plagiarismHistoryRange\.from\}/);
    expect(teacherDash).toMatch(
      /setPlagiarismAssignmentPage\(\(p\)\s*=>\s*goToPreviousSubmissionPage\(p,\s*plagiarismAssignmentTotalPages\)\s*\)/s
    );
    expect(teacherDash).toMatch(
      /setPlagiarismHistoryPage\(\(p\)\s*=>\s*goToNextSubmissionPage\(p,\s*plagiarismHistoryTotalPages\)\s*\)/s
    );
    expect(teacherDash).toMatch(
      /setPlagiarismSearch\(e\.target\.value\);\s*setPlagiarismAssignmentPage\(1\);\s*setPlagiarismHistoryPage\(1\);/s
    );
    expect(teacherDash).toMatch(
      /setPlagiarismAssignmentFilter\(e\.target\.value\);\s*setPlagiarismAssignmentPage\(1\);\s*setPlagiarismHistoryPage\(1\);/s
    );
    expect(teacherDash).toMatch(
      /setPlagiarismStatusFilter\(e\.target\.value\);\s*setPlagiarismAssignmentPage\(1\);\s*setPlagiarismHistoryPage\(1\);/s
    );
  });
});

describe("plagiarism history filter and pagination helpers", () => {
  const history = [
    {
      _id: "c1",
      assignment: "a1",
      assignmentTitle: "Midterm Essay",
      student: { name: "Ada" },
      status: "completed",
    },
    {
      _id: "c2",
      assignment: "a1",
      assignmentTitle: "Midterm Essay",
      student: { name: "Grace" },
      status: "failed",
    },
    {
      _id: "c3",
      assignment: "a2",
      assignmentTitle: "Lab Report",
      student: { name: "Lin" },
      status: "queued",
    },
  ];

  it("filters history by search and assignment and paginates 0/5/8/9 records", () => {
    expect(
      filterPlagiarismHistoryChecks({
        checks: history,
        search: "lab",
        assignmentFilter: "all",
      }).map((row) => row._id)
    ).toEqual(["c3"]);
    expect(
      filterPlagiarismHistoryChecks({
        checks: history,
        search: "",
        assignmentFilter: "a1",
      }).map((row) => row._id)
    ).toEqual(["c1", "c2"]);

    // Assignment list and history both use page size 8 helpers independently.
    expect(submissionsTotalPages(0, 8)).toBe(1);
    expect(submissionsTotalPages(5, 8)).toBe(1);
    expect(submissionsTotalPages(8, 8)).toBe(1);
    expect(submissionsTotalPages(9, 8)).toBe(2);
    expect(submissionPageMeta(1, 8, 5)).toEqual({
      page: 1,
      totalPages: 1,
      from: 1,
      to: 5,
      total: 5,
    });
    expect(submissionPageMeta(1, 8, 0)).toEqual({
      page: 1,
      totalPages: 1,
      from: 0,
      to: 0,
      total: 0,
    });
    expect(submissionPageMeta(2, 8, 9)).toEqual({
      page: 2,
      totalPages: 2,
      from: 9,
      to: 9,
      total: 9,
    });
    expect(goToPreviousSubmissionPage(1, 2)).toBe(1);
    expect(goToNextSubmissionPage(2, 2)).toBe(2);
    expect(clampSubmissionPage(99, 2)).toBe(2);
  });

  it("resets or clamps page after history deletion on the last page", () => {
    expect(pageAfterHistoryCountChange(2, 8, 9)).toBe(2);
    expect(pageAfterHistoryCountChange(2, 8, 8)).toBe(1);
    expect(pageAfterHistoryCountChange(3, 8, 0)).toBe(1);
    expect(pageAfterHistoryCountChange(5, 8, 16)).toBe(2);
  });
});
