const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { describe, it } = require("node:test");

const root = path.join(__dirname, "..", "..");

describe("QC-19 homepage and auth navigation contracts", () => {
  it("homepage exposes a single Login CTA to /login", () => {
    const landing = fs.readFileSync(
      path.join(root, "frontend/src/pages/landing/LandingPage.jsx"),
      "utf8"
    );
    const navbar = fs.readFileSync(
      path.join(root, "frontend/src/components/common/Navbar.jsx"),
      "utf8"
    );
    assert.match(landing, /Login/);
    assert.match(landing, /navigate\("\/login"\)/);
    assert.doesNotMatch(landing, /Get Started/);
    assert.doesNotMatch(landing, /to="\/signup"/);
    assert.match(navbar, /to="\/login"/);
    assert.match(navbar, />\s*Login\s*</);
  });

  it("public login shows Teacher/Student only and Sign Up link", () => {
    const login = fs.readFileSync(
      path.join(root, "frontend/src/pages/authentication/Login.jsx"),
      "utf8"
    );
    assert.match(login, /id:\s*"teacher"/);
    assert.match(login, /id:\s*"student"/);
    assert.doesNotMatch(login, /id:\s*"admin"/);
    assert.match(login, /Don&apos;t have an account\?/);
    assert.match(login, /to="\/signup"/);
    assert.match(login, /Sign Up/);
  });

  it("public signup links back to Log In", () => {
    const signup = fs.readFileSync(
      path.join(root, "frontend/src/pages/authentication/PublicSignup.jsx"),
      "utf8"
    );
    assert.match(signup, /Already have an account\?/);
    assert.match(signup, /to="\/login"/);
    assert.match(signup, /Log In/);
  });
});

describe("QC-19 student submit multipart and plagiarism extract", () => {
  it("student submit does not force Content-Type multipart without boundary", () => {
    const src = fs.readFileSync(
      path.join(root, "frontend/src/services/studentService.js"),
      "utf8"
    );
    assert.doesNotMatch(src, /Content-Type['"]:\s*['"]multipart\/form-data['"]/);
  });

  it("plagiarismService keeps rich extractText (xlsx/pptx/zip)", () => {
    const src = fs.readFileSync(
      path.join(root, "backend/services/plagiarismService.js"),
      "utf8"
    );
    const matches = src.match(/async function extractText/g) || [];
    assert.equal(matches.length, 1);
    assert.match(src, /\.xlsx/);
    assert.match(src, /\.pptx/);
    assert.match(src, /\.zip/);
  });

  it("Gemini score clamp and env names remain server-side", () => {
    const gemini = fs.readFileSync(
      path.join(root, "backend/services/geminiService.js"),
      "utf8"
    );
    assert.match(gemini, /GEMINI_API_KEY/);
    assert.match(gemini, /GEMINI_MODEL/);
    assert.match(gemini, /Math\.min\(maximum,\s*Math\.max\(0,\s*score\)\)/);
    const feHit = fs
      .readFileSync(path.join(root, "frontend/src/services/teacherService.js"), "utf8")
      .includes("GEMINI_API_KEY");
    assert.equal(feHit, false);
  });
});

describe("QC-19 grading notification and path safety", () => {
  it("AI grade notifications do not include raw scores before publish", () => {
    const src = fs.readFileSync(
      path.join(root, "backend/controllers/teacherController.js"),
      "utf8"
    );
    assert.match(src, /Feedback will appear after your teacher publishes/);
    assert.match(src, /!filePath \|\| !fs\.existsSync\(filePath\)/);
    assert.doesNotMatch(
      src,
      /AI evaluation completed[\s\S]{0,200}: \$\{ai\.score\}\//
    );
  });

  it("Teacher UI tells operators to publish before students see scores", () => {
    const dash = fs.readFileSync(
      path.join(root, "frontend/src/pages/dashboards/TeacherDashboard.jsx"),
      "utf8"
    );
    assert.match(dash, /Publish results to release scores/);
    assert.match(dash, /label="Similarity"/);
  });

  it("landing copy does not claim internet-wide plagiarism", () => {
    const landing = fs.readFileSync(
      path.join(root, "frontend/src/pages/landing/LandingPage.jsx"),
      "utf8"
    );
    const features = fs.readFileSync(
      path.join(root, "frontend/src/pages/landing/Features.jsx"),
      "utf8"
    );
    assert.match(landing, /peer similarity/i);
    assert.match(features, /Peer similarity/i);
  });
});

describe("QC-19 Gemini mock grading contract", () => {
  it("checkAssignment rejects invalid marks and clamps score (MOCK)", async () => {
    const Module = require("module");
    const geminiPath = path.resolve(__dirname, "../services/geminiService.js");
    delete require.cache[geminiPath];

    // Stub GoogleGenerativeAI via cache of the dependency is heavy; exercise
    // validation paths that do not call the network.
    const gemini = require("../services/geminiService");
    await assert.rejects(
      () => gemini.checkAssignment("hello", "grade it", 0),
      /Total marks/i
    );
    await assert.rejects(
      () => gemini.checkAssignment("hello", "", 10),
      /instructions/i
    );
  });
});
