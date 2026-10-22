const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "../..");

const logoutButtonPath = path.join(
  root,
  "frontend/src/components/common/DashboardLogoutButton.jsx"
);
const topBarPath = path.join(
  root,
  "frontend/src/components/common/DashboardTopBar.jsx"
);
const navShellPath = path.join(
  root,
  "frontend/src/components/common/DashboardNavShell.jsx"
);
const adminDashPath = path.join(
  root,
  "frontend/src/pages/dashboards/AdminDashboard.jsx"
);
const teacherDashPath = path.join(
  root,
  "frontend/src/pages/dashboards/TeacherDashboard.jsx"
);
const studentDashPath = path.join(
  root,
  "frontend/src/pages/dashboards/StudentDashboard.jsx"
);

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

describe("QC-22 logout UI contracts", () => {
  it("provides a shared accessible Logout button with LogOut icon", () => {
    const source = read(logoutButtonPath);
    assert.match(source, /DashboardLogoutButton/);
    assert.match(source, /from ["']lucide-react["']/);
    assert.match(source, /LogOut/);
    assert.match(source, /aria-label=\{label\}/);
    assert.match(source, /label\s*=\s*["']Logout["']/);
  });

  it("renders headerActions in the sticky top-right dashboard chrome", () => {
    const shell = read(navShellPath);
    assert.match(shell, /headerActions\s*=\s*null/);
    assert.match(shell, /ml-auto flex items-center gap-2 shrink-0/);
    assert.match(shell, /\{headerActions\}/);
  });

  it("places Logout in the shared top-right header for all roles", () => {
    const topBar = read(topBarPath);
    assert.match(topBar, /DashboardLogoutButton/);
    assert.match(topBar, /compact/);
    assert.match(topBar, /My Profile/);
    assert.match(topBar, /Settings/);
    assert.match(topBar, /Account menu/);
    // Logout is a direct header control (not buried only in the account menu).
    assert.match(
      topBar,
      /<\/div>\s*\)\}\s*<\/div>\s*<DashboardLogoutButton[\s\S]*compact/
    );
    assert.doesNotMatch(topBar, /Sign Out/);

    const sidebarControls = read(
      path.join(root, "frontend/src/components/common/SidebarControls.jsx")
    );
    assert.doesNotMatch(sidebarControls, /DashboardLogoutButton/);
    assert.doesNotMatch(sidebarControls, /from ["']lucide-react["'][\s\S]*LogOut/);
    assert.doesNotMatch(sidebarControls, /onClick=\{[^}]*[Ll]og[Oo]ut/);

    for (const filePath of [adminDashPath, teacherDashPath, studentDashPath]) {
      const source = read(filePath);
      assert.match(source, /DashboardTopBar/);
      assert.match(source, /headerActions=\{/);
      assert.match(source, /handleLogout/);
      assert.match(source, /localStorage\.clear\(\)/);
      assert.doesNotMatch(source, />\s*LOGOUT\s*</);
      assert.doesNotMatch(source, /Disconnect/);
      assert.doesNotMatch(source, /Sign Out/);
    }
  });

  it("preserves role-specific post-logout navigation targets", () => {
    const admin = read(adminDashPath);
    const teacher = read(teacherDashPath);
    const student = read(studentDashPath);

    assert.match(admin, /navigate\(['"]\/admin['"]\)/);
    assert.match(teacher, /navigate\(['"]\/login['"]\)/);
    assert.match(student, /navigate\(['"]\/login['"]\)/);
  });
});
