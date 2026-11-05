/**
 * Student scheduled-assignment access — isolated mocks only.
 */
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const { evaluateAssignmentWindow } = require("../utils/assignmentAvailability");
const studentRoutesPath = path.resolve(__dirname, "../routes/studentRoutes.js");
const fileControllerPath = path.resolve(
  __dirname,
  "../controllers/fileController.js"
);
const studentDashboardPath = path.resolve(
  __dirname,
  "../../frontend/src/pages/dashboards/StudentDashboard.jsx"
);

describe("student scheduled assignment access contracts", () => {
  it("11-12. list hides assignments before start; download blocks early; UI gates materials", () => {
    const start = Date.parse("2026-11-02T12:00:00.000Z");
    const due = Date.parse("2026-11-09T12:00:00.000Z");
    const before = evaluateAssignmentWindow(start, due, start - 1);
    assert.equal(before.visibleToStudent, false);
    assert.equal(before.canAccessMaterials, false);
    assert.equal(before.canSubmit, false);

    const atStart = evaluateAssignmentWindow(start, due, start);
    assert.equal(atStart.visibleToStudent, true);
    assert.equal(atStart.canSubmit, true);

    const between = evaluateAssignmentWindow(start, due, start + 60_000);
    assert.equal(between.visibleToStudent, true);
    assert.equal(between.canSubmit, true);

    const atDue = evaluateAssignmentWindow(start, due, due);
    assert.equal(atDue.visibleToStudent, true);
    assert.equal(atDue.canSubmit, false);
    assert.equal(atDue.deadlineReached, true);

    const afterDue = evaluateAssignmentWindow(start, due, due + 1);
    assert.equal(afterDue.canSubmit, false);
    assert.equal(afterDue.visibleToStudent, true);

    const routes = fs.readFileSync(studentRoutesPath, "utf8");
    assert.match(routes, /evaluateAssignmentWindow/);
    assert.match(routes, /visibleToStudent/);
    assert.match(routes, /Assignment is not open yet/i);
    assert.match(routes, /file: undefined/);
    assert.match(routes, /hasFile/);

    const files = fs.readFileSync(fileControllerPath, "utf8");
    assert.match(files, /role === "student"/);
    assert.match(files, /evaluateAssignmentWindow/);
    assert.match(files, /not open yet/i);

    const ui = fs.readFileSync(studentDashboardPath, "utf8");
    assert.match(ui, /notOpenYet|canAccessMaterials/);
    assert.match(ui, /Not open yet/);
  });

  it("13. submission still blocked before start in student submit route", () => {
    const routes = fs.readFileSync(studentRoutesPath, "utf8");
    const submitIdx = routes.indexOf('router.post("/assignments/:id/submit"');
    assert.ok(submitIdx > 0);
    const slice = routes.slice(submitIdx, submitIdx + 2500);
    assert.match(slice, /Assignment is not open yet/i);
    assert.match(slice, /deadline has passed/i);
  });
});
