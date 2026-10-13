const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const Module = require("module");
const path = require("path");

const geminiPath = path.resolve(__dirname, "../services/geminiService.js");

function loadWithMockModel(responseText) {
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
                  text: async () => responseText,
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
    return require(geminiPath);
  } finally {
    Module._load = originalLoad;
  }
}

describe("geminiService grading bounds (mocked provider)", () => {
  it("clamps oversized scores to the maximum", async () => {
    process.env.GEMINI_API_KEY = "test-key-not-real";
    const svc = loadWithMockModel('{"score": 999, "feedback": "too high"}');
    const result = await svc.checkAssignment("hello", "Grade out of 10 marks", 10);
    assert.equal(result.score, 10);
  });

  it("rejects invalid provider JSON without inventing marks", async () => {
    process.env.GEMINI_API_KEY = "test-key-not-real";
    const svc = loadWithMockModel("not-json-at-all");
    let failed = false;
    try {
      await svc.checkAssignment("hello", "Grade carefully", 10);
    } catch (error) {
      failed = true;
      assert.match(String(error.message || error), /not valid JSON|AI request failed|invalid/i);
    }
    assert.equal(failed, true);
  });

  it("requires total marks and instructions", async () => {
    process.env.GEMINI_API_KEY = "test-key-not-real";
    const svc = loadWithMockModel('{"score": 1, "feedback": "x"}');
    await assert.rejects(() => svc.checkAssignment("x", "ok", 0));
    await assert.rejects(() => svc.checkAssignment("x", "", 10));
  });

  it("clamps negative scores to zero", async () => {
    process.env.GEMINI_API_KEY = "test-key-not-real";
    const svc = loadWithMockModel('{"score": -5, "feedback": "too low"}');
    const result = await svc.checkAssignment("hello", "Grade out of 10 marks", 10);
    assert.equal(result.score, 0);
  });

  it("rejects missing score without inventing marks", async () => {
    process.env.GEMINI_API_KEY = "test-key-not-real";
    const svc = loadWithMockModel('{"feedback": "no score field"}');
    await assert.rejects(
      () => svc.checkAssignment("hello", "Grade carefully", 10),
      /invalid score/i
    );
  });
});
