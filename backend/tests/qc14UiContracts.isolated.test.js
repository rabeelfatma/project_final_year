const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "../..");
const cssPath = path.join(root, "frontend/src/index.css");
const sidebarControlsPath = path.join(
  root,
  "frontend/src/components/common/SidebarControls.jsx"
);
const navShellPath = path.join(
  root,
  "frontend/src/components/common/DashboardNavShell.jsx"
);
const selectionPath = path.join(
  root,
  "frontend/src/utils/assignmentSelection.js"
);
const teacherDashPath = path.join(
  root,
  "frontend/src/pages/dashboards/TeacherDashboard.jsx"
);
const passwordResetServicePath = path.join(
  root,
  "backend/services/passwordResetService.js"
);
const passwordResetEmailPath = path.join(
  root,
  "backend/services/passwordResetEmail.js"
);

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function loadAssignmentSelection() {
  const source = read(selectionPath);
  const transformed = source
    .replace(/export function/g, "function")
    .concat(
      "\nmodule.exports = { normalizeAssignmentId, toggleAssignmentSelection, isAssignmentSelected };\n"
    );
  const module = { exports: {} };
  vm.runInNewContext(transformed, { module, exports: module.exports });
  return module.exports;
}

describe("QC-14 UI contracts", () => {
  it("uses navy dashboard background tokens instead of pure black canvas", () => {
    const css = read(cssPath);
    assert.match(css, /--bg:\s*#0f172a/);
    assert.match(css, /--surface:\s*#152746/);
    assert.doesNotMatch(
      css,
      /:root\[data-theme="dark"\]\s*\{[^}]*--bg:\s*#0d1117/
    );
    assert.doesNotMatch(
      css,
      /:root\[data-theme="dark"\]\s*\{[^}]*--bg:\s*#000(?:000)?\b/
    );
  });

  it("keeps solid CTA hover readable and amber buttons white/black on hover", () => {
    const css = read(cssPath);
    assert.match(
      css,
      /\.theme-page \[class\*="hover:bg-"\]\[class\*="\/"\]:hover/
    );
    assert.match(css, /bg-amber-500.{0,8}:hover/);
    assert.match(css, /background-color:\s*#ffffff\s*!important/);
    assert.match(css, /color:\s*#000000\s*!important/);
    assert.match(css, /bg-sky-500.{0,8}:hover/);
    assert.match(css, /qc-utility-overlay/);
    assert.match(css, /qc-utility-panel/);
  });

  it("opens Settings/Notifications via body portal and closes mobile drawer", () => {
    const controls = read(sidebarControlsPath);
    const shell = read(navShellPath);
    assert.match(controls, /createPortal/);
    assert.match(controls, /qc-settings-panel/);
    assert.match(controls, /qc-notifications-panel/);
    assert.match(controls, /quickcheck:close-drawer/);
    assert.match(controls, /Notifications are unavailable until the server/);
    assert.match(shell, /quickcheck:close-drawer/);
  });

  it("normalizes assignment ids for selection toggles", () => {
    const {
      normalizeAssignmentId,
      toggleAssignmentSelection,
      isAssignmentSelected,
    } = loadAssignmentSelection();

    assert.equal(normalizeAssignmentId("abc"), "abc");
    assert.equal(normalizeAssignmentId({ $oid: "oid1" }), "oid1");
    assert.equal(normalizeAssignmentId({ toString: () => "oid2" }), "oid2");

    let selected = [];
    selected = toggleAssignmentSelection(selected, "a1");
    assert.equal(JSON.stringify(selected), JSON.stringify(["a1"]));
    assert.equal(isAssignmentSelected(selected, "a1"), true);
    selected = toggleAssignmentSelection(selected, { toString: () => "a1" });
    assert.equal(JSON.stringify(selected), JSON.stringify([]));
    assert.equal(isAssignmentSelected(["a1"], { $oid: "a1" }), true);
  });

  it("wires teacher assignment selection helpers into the dashboard", () => {
    const dash = read(teacherDashPath);
    assert.match(dash, /assignmentSelection/);
    assert.match(dash, /toggleAssignmentSelection/);
    assert.match(dash, /normalizeAssignmentId/);
    assert.match(dash, /DescribeDeleteError|describeDeleteError|Server unavailable/);
  });

  it("documents fail-closed forgot-password env requirements without inventing delivery", () => {
    const service = read(passwordResetServicePath);
    const email = read(passwordResetEmailPath);
    assert.match(service, /PASSWORD_RESET_EMAIL_UNAVAILABLE/);
    assert.match(service, /temporarily unavailable/i);
    assert.match(email, /RESEND_API_KEY/);
    assert.match(email, /PASSWORD_RESET_FROM_EMAIL/);
    assert.match(email, /PUBLIC_APP_URL|getResetEmailConfig/);
  });
});
