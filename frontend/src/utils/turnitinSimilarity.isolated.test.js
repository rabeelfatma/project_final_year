/**
 * Turnitin-ready Plagiarism hub UI contracts (source inspection — no live provider).
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
const teacherService = fs.readFileSync(
  path.join(root, "services/teacherService.js"),
  "utf8"
);
const appFull = fs.readFileSync(
  path.resolve(root, "../../backend/appFull.js"),
  "utf8"
);
const plagiarismRoutes = fs.readFileSync(
  path.resolve(root, "../../backend/routes/plagiarismRoutes.js"),
  "utf8"
);

describe("Turnitin-ready Plagiarism hub", () => {
  it("labels the hub Plagiarism / Plagiarism Checker", () => {
    expect(teacherDash).toMatch(/label=["']Plagiarism["']/);
    expect(teacherDash).toMatch(/activeTab === ['"]plagiarism['"] \? ['"]Plagiarism['"]/);
    expect(teacherDash).toMatch(/Plagiarism Checker/);
    expect(teacherDash).not.toMatch(/label=["']Similarity["']/);
  });

  it("exposes modes, statuses, assignment selection, and never shows Jaccard as Turnitin", () => {
    expect(teacherDash).toMatch(/Provider Not Connected/);
    expect(teacherDash).toMatch(/External Sources/);
    expect(teacherDash).toMatch(/Student Paper Repository/);
    expect(teacherDash).toMatch(/external_sources/);
    expect(teacherDash).toMatch(/student_paper_repository/);
    expect(teacherDash).toMatch(/Check Plagiarism/);
    expect(teacherDash).toMatch(/plagiarismAssignmentId/);
    expect(teacherDash).toMatch(/plagiarismSelectedIds/);
    expect(teacherDash).toMatch(/Select All|Clear Selection|Clear All/);
    expect(teacherDash).toMatch(/No assignments created yet|Assignments could not be loaded/);
    expect(teacherDash).toMatch(/This assignment has no student submissions yet/);
    expect(teacherDash).toMatch(/preserveError/);
    expect(teacherDash).toMatch(/apiUnavailable|loadPlagiarismWorkspace/);
    expect(teacherDash).not.toMatch(/Local text-shingle similarity/);
    expect(teacherDash).not.toMatch(/Highest Similarity/);
    expect(teacherDash).not.toMatch(/plagiarismResults/);
    expect(teacherDash).not.toMatch(/Local similarity checking compares extracted text/);
  });

  it("wires provider APIs to mounted backend routes without VITE_ secrets", () => {
    expect(teacherService).toMatch(/getPlagiarismProviderStatus/);
    expect(teacherService).toMatch(/\/plagiarism\/provider-status/);
    expect(teacherService).toMatch(/\/plagiarism\/checks/);
    expect(teacherService).not.toMatch(/VITE_TURNITIN/);
    expect(plagiarismRoutes).toMatch(/router\.get\("\/provider-status"/);
    expect(plagiarismRoutes).toMatch(/router\.get\("\/checks"/);
    expect(appFull).toMatch(/app\.use\("\/api\/plagiarism", plagiarismRoutes\)/);
  });

  it("completed report UI only shows percent when provider supplies completed + similarityPercent", () => {
    expect(teacherDash).toMatch(
      /row\.status === ['"]completed['"][\s\S]{0,120}similarityPercent/
    );
    expect(teacherDash).toMatch(
      /row\.status === ['"]completed['"] && row\.reportAvailable/
    );
  });

  it("does not spam raw axios 404 as the only provider status", () => {
    expect(teacherDash).toMatch(/Plagiarism API Unavailable|apiUnavailable/);
    expect(teacherDash).toMatch(/status === 404/);
    expect(teacherDash).not.toMatch(/setSimilarityError\(err\.message\)/);
  });
});
