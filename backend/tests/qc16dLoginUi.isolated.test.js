const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { describe, it } = require("node:test");

const root = path.join(__dirname, "..", "..");
const loginPath = path.join(root, "frontend", "src", "pages", "authentication", "Login.jsx");
const roleSelectionPath = path.join(
  root,
  "frontend",
  "src",
  "pages",
  "authentication",
  "RoleSelection.jsx"
);
const landingPath = path.join(root, "frontend", "src", "pages", "landing", "LandingPage.jsx");
const authControllerPath = path.join(root, "backend", "controllers", "authController.js");
const adminOnlyTestPath = path.join(root, "backend", "tests", "adminOnlyRegistration.test.js");

describe("QC-16D / QC-17A public login contracts", () => {
  it("login page presents Teacher and Student only (no Admin card)", () => {
    const src = fs.readFileSync(loginPath, "utf8");
    assert.match(src, /Welcome Back/);
    assert.match(src, /Select your role to continue/);
    assert.match(src, /id:\s*"teacher"/);
    assert.match(src, /id:\s*"student"/);
    assert.doesNotMatch(src, /id:\s*"admin"/);
    assert.doesNotMatch(src, /Manage users and system/);
    assert.match(src, /BookOpen|Clipboard/);
    assert.match(src, /GraduationCap/);
    assert.match(src, /Manage assignments and grading/);
    assert.match(src, /Submit and track assignments/);
    assert.match(src, /navigate\("\/admin"/);
  });

  it("login form requires email and password only", () => {
    const src = fs.readFileSync(loginPath, "utf8");
    assert.match(src, /email:\s*""/);
    assert.match(src, /password:\s*""/);
    assert.doesNotMatch(src, /name:\s*""/);
    assert.doesNotMatch(src, /FULL NAME|Full Name|form\.name/);
    assert.match(src, /EMAIL ADDRESS/);
    assert.match(src, /PASSWORD/);
    assert.match(src, /Sign in as \$\{roleLabel\(selectedRole\)\}/);
    assert.match(src, /Change Role/);
    assert.match(src, /Forgot Password\?/);
    assert.match(src, /forgot-password/);
    assert.match(src, /to="\/signup"/);
  });

  it("show/hide password and submit guard are present", () => {
    const src = fs.readFileSync(loginPath, "utf8");
    assert.match(src, /showPass/);
    assert.match(src, /Hide password|Show password/);
    assert.match(src, /submitting/);
    assert.match(src, /if \(submitting\) return/);
    assert.match(src, /Signing in/);
    assert.match(src, /Server unavailable/);
  });

  it("authenticated role comes from backend response, not selected portal role alone", () => {
    const src = fs.readFileSync(loginPath, "utf8");
    assert.match(src, /authenticatedRole/);
    assert.match(src, /localStorage\.setItem\("role", authenticatedRole\)/);
    assert.match(src, /navigate\(`\/dashboard\/\$\{authenticatedRole\}`\)/);
    assert.match(src, /role:\s*selectedRole/);
  });

  it("compatible role-selection route redirects into /login", () => {
    const src = fs.readFileSync(roleSelectionPath, "utf8");
    assert.match(src, /Navigate/);
    assert.match(src, /to="\/login"/);
  });

  it("landing Get Started navigates to /login", () => {
    const src = fs.readFileSync(landingPath, "utf8");
    assert.match(src, /navigate\("\/login"\)/);
    assert.doesNotMatch(src, /navigate\("\/admin"\)/);
    assert.doesNotMatch(src, /to="\/admin"/);
  });

  it("backend login no longer requires name and keeps role mismatch denial", () => {
    const src = fs.readFileSync(authControllerPath, "utf8");
    assert.doesNotMatch(src, /Name is required for login/);
    assert.doesNotMatch(src, /Invalid Name or Email/);
    assert.match(src, /email \+ password only/i);
    assert.match(src, /requestedRole !== user\.role/);
    assert.match(src, /getLoginDenialReason/);
  });

  it("admin-only registration policy tests remain present", () => {
    const src = fs.readFileSync(adminOnlyTestPath, "utf8");
    assert.match(src, /admin/i);
    assert.match(src, /signup|register/i);
  });
});
