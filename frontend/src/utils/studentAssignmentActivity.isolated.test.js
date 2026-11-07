import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  studentActivityState,
  isStudentAssignmentActive,
  countActiveStudentAssignments,
} from "./studentAssignmentActivity.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const studentDash = fs.readFileSync(
  path.join(__dirname, "../pages/dashboards/StudentDashboard.jsx"),
  "utf8"
);
const settingsPage = fs.readFileSync(
  path.join(__dirname, "../pages/account/SettingsPage.jsx"),
  "utf8"
);

const NOW = Date.parse("2026-11-07T15:00:00.000Z");

function asgn(overrides = {}) {
  return {
    _id: "a1",
    title: "Quiz",
    startDate: "2026-11-07T10:00:00.000Z",
    deadline: "2026-11-08T15:00:00.000Z",
    status: "pending",
    ...overrides,
  };
}

describe("studentAssignmentActivity — Active count matches ACTIVE badge", () => {
  it("published, start reached, due future → Active = 1", () => {
    const list = [asgn()];
    expect(studentActivityState(list[0], NOW).label).toBe("ACTIVE");
    expect(countActiveStudentAssignments(list, NOW)).toBe(1);
  });

  it("start date in future → Active = 0", () => {
    const list = [asgn({ startDate: "2026-11-07T16:00:00.000Z", notOpenYet: true })];
    expect(studentActivityState(list[0], NOW).label).toBe("INACTIVE");
    expect(countActiveStudentAssignments(list, NOW)).toBe(0);
  });

  it("due date passed → Active = 0", () => {
    const list = [asgn({ deadline: "2026-11-07T14:00:00.000Z", availabilityLabel: "Closed" })];
    expect(studentActivityState(list[0], NOW).label).toBe("INACTIVE");
    expect(countActiveStudentAssignments(list, NOW)).toBe(0);
  });

  it("closed / unavailable label → Active = 0", () => {
    const list = [asgn({ availabilityLabel: "Closed" })];
    // still within window by dates, but closed label forces inactive
    expect(isStudentAssignmentActive(list[0], NOW)).toBe(false);
  });

  it("submitted but still within availability → Active = 1", () => {
    const list = [
      asgn({
        status: "submitted",
        isSubmitted: true,
        submissionId: "s1",
        availabilityLabel: "Awaiting evaluation",
      }),
    ];
    expect(studentActivityState(list[0], NOW).label).toBe("ACTIVE");
    expect(countActiveStudentAssignments(list, NOW)).toBe(1);
  });

  it("awaiting evaluation still within window → Active = 1", () => {
    const list = [
      asgn({
        status: "submitted",
        isSubmitted: true,
        availabilityLabel: "Awaiting Evaluation",
      }),
    ];
    expect(countActiveStudentAssignments(list, NOW)).toBe(1);
  });

  it("two active + one past-due → Active = 2", () => {
    const list = [
      asgn({ _id: "a1" }),
      asgn({ _id: "a2", title: "Lab 2" }),
      asgn({
        _id: "a3",
        deadline: "2026-11-07T12:00:00.000Z",
        availabilityLabel: "Closed",
      }),
    ];
    expect(countActiveStudentAssignments(list, NOW)).toBe(2);
    expect(list.filter((item) => studentActivityState(item, NOW).active).length).toBe(2);
  });

  it("StudentDashboard uses shared count helper (not submission-status filter)", () => {
    expect(studentDash).toMatch(/countActiveStudentAssignments/);
    expect(studentDash).toMatch(/studentActivityState/);
    expect(studentDash).not.toMatch(
      /activeAssignmentCount = assignments\.filter\(\(a\) => \{\s*const status = String\(a\.status/
    );
    expect(studentDash).toMatch(/AI Feedback/);
    expect(studentDash).toMatch(/AI Feedback Not Available/);
    expect(studentDash).toMatch(/No Teacher Feedback Available/);
    expect(studentDash).toMatch(/Areas for Improvement/);
    expect(studentDash).toMatch(/Question File/);
    expect(studentDash).toMatch(/Student Submission/);
  });

  it("Settings uses vertical sidenav for all roles", () => {
    expect(settingsPage).toMatch(/qc-settings-sidenav/);
    expect(settingsPage).toMatch(/qc-settings-layout/);
    expect(settingsPage).toMatch(/Appearance/);
    expect(settingsPage).toMatch(/Notifications/);
    expect(settingsPage).toMatch(/Account & Security/);
    expect(settingsPage).not.toMatch(/qc-segmented qc-settings-nav/);
  });
});
