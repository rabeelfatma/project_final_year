/**
 * QC-20 — Focused academic acceptance contracts (isolated; no Atlas / no live Gemini).
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { describe, it } = require("node:test");
const Module = require("module");

const root = path.join(__dirname, "..", "..");
const geminiPath = path.resolve(__dirname, "../services/geminiService.js");
const teacherControllerPath = path.resolve(
  __dirname,
  "../controllers/teacherController.js"
);
const studentRoutesPath = path.resolve(__dirname, "../routes/studentRoutes.js");

describe("QC-20 Gemini config and mock grading contract", () => {
  it("prefers GEMINI_API_KEY over GOOGLE_API_KEY and defaults model", () => {
    const src = fs.readFileSync(
      path.join(root, "backend/services/geminiService.js"),
      "utf8"
    );
    assert.match(src, /GEMINI_API_KEY\s*\|\|\s*process\.env\.GOOGLE_API_KEY/);
    assert.match(src, /gemini-3\.8-flash/);
    assert.match(src, /responseMimeType:\s*"application\/json"/);
    assert.match(src, /401|authentication failed/i);
    assert.match(src, /404|model not available/i);
    assert.doesNotMatch(src, /fake.?grade|fabricat/i);
  });

  it("mock provider grades and clamps within maximum", async () => {
    delete require.cache[geminiPath];
    const originalLoad = Module._load;
    Module._load = function (request, parent, isMain) {
      if (request === "@google/generative-ai") {
        return {
          GoogleGenerativeAI: class {
            getGenerativeModel() {
              return {
                generateContent: async () => ({
                  response: {
                    text: async () => '{"score": 12, "feedback": "solid"}',
                  },
                }),
              };
            }
          },
        };
      }
      return originalLoad(request, parent, isMain);
    };
    try {
      process.env.GEMINI_API_KEY = "test-key-not-real";
      const svc = require(geminiPath);
      const result = await svc.checkAssignment(
        "print('hello')",
        "Grade correctness out of 10",
        10
      );
      assert.equal(result.score, 10);
      assert.match(result.feedback, /solid/i);
    } finally {
      Module._load = originalLoad;
      delete require.cache[geminiPath];
    }
  });
});

describe("QC-20 publish and unpublished-grade gates", () => {
  it("teacher publishResults skips already-published rows", () => {
    const src = fs.readFileSync(teacherControllerPath, "utf8");
    assert.match(src, /Already published/);
    assert.match(src, /submission\.status === ["']PUBLISHED["']/);
    assert.match(src, /Feedback will appear after your teacher publishes/);
  });

  it("student routes accept text answers and hide pre-publish status", () => {
    const src = fs.readFileSync(studentRoutesPath, "utf8");
    assert.match(src, /answerText/);
    assert.match(src, /const PUBLISHED = \["PUBLISHED"\]/);
    assert.match(src, /studentStatus/);
    assert.match(src, /canSubmit/);
    assert.match(src, /Upload a supported file or provide a short text answer/);
  });

  it("student dashboard only surfaces PUBLISHED checked results", () => {
    const dash = fs.readFileSync(
      path.join(root, "frontend/src/pages/dashboards/StudentDashboard.jsx"),
      "utf8"
    );
    assert.match(dash, /s\.status === ['"]PUBLISHED['"]/);
    assert.match(dash, /answerTextDraft|Submit text answer/);
    assert.doesNotMatch(
      dash,
      /\.filter\(\(s\) => \['graded', 'GRADED', 'PUBLISHED', 'AI_GRADED'/
    );
  });
});

describe("QC-20 similarity and upload contracts", () => {
  it("keeps peer Jaccard labeling truthful", () => {
    const plagiarism = fs.readFileSync(
      path.join(root, "backend/services/plagiarismService.js"),
      "utf8"
    );
    assert.match(plagiarism, /async function extractText/);
    assert.equal((plagiarism.match(/async function extractText/g) || []).length, 1);
    const landing = fs.readFileSync(
      path.join(root, "frontend/src/pages/landing/LandingPage.jsx"),
      "utf8"
    );
    assert.match(landing, /peer similarity/i);
  });

  it("homepage still exposes one Login CTA", () => {
    const landing = fs.readFileSync(
      path.join(root, "frontend/src/pages/landing/LandingPage.jsx"),
      "utf8"
    );
    assert.match(landing, /navigate\("\/login"\)/);
    assert.doesNotMatch(landing, /Get Started/);
  });
});
