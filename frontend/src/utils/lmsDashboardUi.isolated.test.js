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
const topBar = fs.readFileSync(
  path.join(root, "components/common/DashboardTopBar.jsx"),
  "utf8"
);
const sidebar = fs.readFileSync(
  path.join(root, "components/common/Sidebar.jsx"),
  "utf8"
);
const portalControls = fs.readFileSync(
  path.join(root, "components/common/PortalControls.jsx"),
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
    expect(teacherDash).toMatch(/AI GRADED/);
    expect(teacherDash).not.toMatch(/AI GRADED \/ REVIEW/);
    expect(teacherDash).toMatch(/Teacher grade saved/);
    expect(teacherDash).toMatch(/Keep Review Evaluation open after Save Teacher Grade/);
    expect(teacherDash).toMatch(/Submission \(Solution\)/);
    expect(teacherDash).toMatch(/View Question/);
    expect(teacherDash).toMatch(/View Solution/);
    expect(teacherDash).toMatch(/qc-submissions-page/);
    expect(teacherDash).toMatch(/qc-submissions-ai-panel/);
    expect(teacherDash).toMatch(/qc-submissions-filters/);
    expect(teacherDash).toMatch(/Search by student or assignment/);
    expect(teacherDash).toMatch(/All Assignments/);
    expect(teacherDash).toMatch(/All Statuses/);
    expect(teacherDash).toMatch(/Review, evaluate, and publish student submissions/);
    expect(teacherDash).toMatch(/Reference Files \(Optional\)/);
    expect(teacherDash).toMatch(/qc-submissions-pagination/);
    expect(teacherDash).toMatch(/Not Available/);
    expect(teacherDash).toMatch(/AWAITING EVALUATION|Awaiting Evaluation/);
    expect(teacherDash).toMatch(/disabled=\{aiLoading\}/);
    expect(teacherDash).toMatch(/disabled=\{checkingPlagiarism\}/);
    expect(teacherDash).toMatch(/disabled=\{isPublishing\}/);
    expect(teacherDash).not.toMatch(/disabled=\{!selectedSubmissions\.length \|\| aiLoading\}/);
    expect(teacherDash).toMatch(/eligiblePublishSubmissionIds/);
    expect(teacherDash).toMatch(/downloadLabel:\s*['"]Download File['"]/);
    expect(teacherDash).toMatch(/downloadLabel:\s*['"]Download Submission['"]/);
    expect(teacherDash).toMatch(/>\s*Actions\s*</);
    expect(teacherDash).not.toMatch(/qc-fill-scroll qc-lms-table-wrap/);
  });

  it("Review modal footer uses three primary actions", () => {
    expect(teacherDash).toMatch(/Save Teacher Grade/);
    expect(teacherDash).toMatch(/Publish AI Result/);
    expect(teacherDash).toMatch(/handlePublishAvailableResults/);
    expect(teacherDash).toMatch(/scope:\s*['"]ai['"]/);
    expect(teacherDash).toMatch(/scope:\s*['"]full['"]/);
    expect(teacherDash).toMatch(/Teacher grade saved/);
    expect(teacherDash).toMatch(/Keep Review Evaluation open after Save Teacher Grade/);
    expect(teacherDash).toMatch(/Keep modal open for further Teacher publication/);
    expect(teacherDash).toMatch(/AI GRADED/);
    expect(teacherDash).not.toMatch(/AI GRADED \/ REVIEW/);
    expect(teacherDash).toMatch(/qc-review-modal/);
    expect(teacherDash).toMatch(/Strengths/);
    expect(teacherDash).toMatch(/Improvements/);
  });

  it("Student My Assignments: workspace cards, View File, no archived shelf", () => {
    expect(studentDash).toMatch(/My Assignments/);
    expect(studentDash).toMatch(/Search by title\.\.\./);
    expect(studentDash).toMatch(/meaningfulSubject/);
    expect(studentDash).toMatch(/Submit Assignment/);
    expect(studentDash).toMatch(/View File/);
    expect(studentDash).toMatch(/View Result/);
    expect(studentDash).not.toMatch(/label:\s*['"]View Details['"]/);
    expect(studentDash).not.toMatch(/view-details-/);
    expect(studentDash).toMatch(/Download File/);
    expect(studentDash).toMatch(/Download Submission/);
    expect(studentDash).not.toMatch(/Download Original/);
    expect(studentDash).not.toMatch(/>\s*View Submission\s*</);
    expect(studentDash).not.toMatch(/label:\s*['"]View Submission['"]/);
    expect(studentDash).toMatch(/openLabel="View Submission"/);
    expect(studentDash).toMatch(/qc-checked-result-card/);
    expect(studentDash).not.toMatch(/No instructions provided\./);
    expect(studentDash).not.toMatch(/qc-checked-result-card__instructions/);
    expect(studentDash).not.toMatch(/is-published">\{resultLabel\}/);
    expect(studentDash).toMatch(/Not specified/);
    expect(studentDash).toMatch(/canAccessMaterials:\s*true/);
    expect(studentDash).toMatch(/assignmentOriginalFileName/);
    expect(teacherDash).not.toMatch(/placeholder="Instructions\.\.\."/);
    expect(teacherDash).not.toMatch(/>Description\s*</);
    expect(studentDash).toMatch(/qc-student-detail-modal/);
    expect(studentDash).toMatch(/Results Overview/);
    expect(studentDash).toMatch(/No Teacher Feedback Available/);
    expect(studentDash).toMatch(/AI Feedback Not Available/);
    expect(studentDash).not.toMatch(/Awaiting Teacher Assessment/);
    expect(studentDash).toMatch(/Teacher has not graded yet\./);
    expect(studentDash).toMatch(/teacherMarksPublished === true/);
    expect(studentDash).toMatch(/Number\(aiScoreRaw\)/);
    expect(studentDash).toMatch(/Number\(teacherMarksRaw\)/);
    expect(studentDash).not.toMatch(/marks\s*\?\?\s*s\.aiScore|marks\s*\?\?\s*asgn\.aiScore|marks\s*\?\?\s*item\.aiScore/);
    expect(studentDash).toMatch(/label:\s*["']Submitted["']/);
    expect(studentDash).toMatch(/studentActivityState/);
    expect(studentDash).toMatch(/countActiveStudentAssignments/);
    expect(studentDash).toMatch(/Not Submitted|Awaiting Evaluation|Published/);
    expect(studentDash).toMatch(/INACTIVE|ACTIVE/);
    expect(studentDash).toMatch(/qc-assignment-summary--student/);
    expect(studentDash).toMatch(/showDuplicateNotice/);
    expect(studentDash).toMatch(/Recent Assignments/);
    expect(studentDash).toMatch(/AI Feedback/);
    expect(studentDash).not.toMatch(/studentAssignmentShelf/);
    expect(studentDash).not.toMatch(/Archived Assignments/);
    expect(studentDash).not.toMatch(/Archived \(/);
    expect(studentDash).not.toMatch(/Subject: \{asgn\.subject \|\| ["']General["']\}/);
  });

  it("Teacher Assignment Workspace: summary icons, selection toolbar on double-click only", () => {
    expect(teacherDash).toMatch(/Assignment Workspace/);
    expect(teacherDash).toMatch(/Manage your assignments/);
    expect(teacherDash).toMatch(/qc-assignment-workspace__title-icon/);
    expect(teacherDash).toMatch(/Total Assignments/);
    expect(teacherDash).toMatch(/Active Assignments/);
    expect(teacherDash).toMatch(/Archived Assignments/);
    expect(teacherDash).toMatch(/<Layers/);
    expect(teacherDash).toMatch(/<Folder/);
    expect(teacherDash).toMatch(/>\s*Active\s*</);
    expect(teacherDash).toMatch(/>\s*Archived\s*</);
    expect(teacherDash).toMatch(/View File/);
    expect(teacherDash).toMatch(/qc-assignment-card__doc-icon/);
    expect(teacherDash).toMatch(/qc-status-badge__dot/);
    expect(teacherDash).toMatch(/INACTIVE/);
    expect(teacherDash).toMatch(/Archive All Active/);
    expect(teacherDash).toMatch(/Restore All Archived/);
    expect(teacherDash).toMatch(/manageAssignments &&/);
    expect(teacherDash).toMatch(/Select All/);
    expect(teacherDash).toMatch(/Archive Selected/);
    expect(teacherDash).toMatch(/Delete Selected/);
    expect(teacherDash).toMatch(/qc-selection-exit/);
    expect(teacherDash).not.toMatch(/>\s*Done\s*</);
    expect(teacherDash).not.toMatch(/Active \(\{assignments/);
    expect(teacherDash).not.toMatch(/Archived \(\{assignments/);
  });

  it("Auth middleware rejects empty/malformed Bearer before jwt.verify", () => {
    expect(authMw).toMatch(/extractBearerToken/);
    expect(authMw).toMatch(/parts\.length !== 3/);
    expect(authMw).not.toMatch(/AUTH FAIL: Token verification failed:/);
  });

  it("Notification badges show exact unread counts (no 9+ / 99+)", () => {
    expect(topBar).toMatch(/notification-badge/);
    expect(topBar).not.toMatch(/unread > 9 \? ["']9\+["']/);
    expect(topBar).not.toMatch(/["']99\+["']/);
    expect(topBar).toMatch(/\{unread\}/);
    expect(sidebar).not.toMatch(/unread > 9 \? ["']9\+["']/);
    expect(sidebar).toMatch(/\{unread\}/);
    expect(portalControls).not.toMatch(/unread > 9 \? ["']9\+["']/);
    expect(portalControls).toMatch(/\{unread\}/);
  });
});
