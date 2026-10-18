/**
 * Regression: AIChatbot must never send Authorization to external/absolute artifact URLs.
 * Also covers backend chat-history sanitization of crafted downloadUrl values.
 */
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const Module = require("module");

const root = path.resolve(__dirname, "../..");
const frontendUtilPath = path.join(root, "frontend/src/utils/artifactDownloadUrl.js");
const chatbotPath = path.join(root, "frontend/src/components/common/AIChatbot.jsx");
const backendUtilPath = path.resolve(__dirname, "../utils/artifactDownloadUrl.js");
const aiChatControllerPath = path.resolve(__dirname, "../controllers/aiChatController.js");

function loadFrontendArtifactUtil() {
  const source = fs.readFileSync(frontendUtilPath, "utf8");
  const transformed = source
    .replace(/export function/g, "function")
    .concat(
      "\nmodule.exports = { isSafeGeneratedArtifactPath, buildArtifactDownloadRequest };\n"
    );
  const module = { exports: {} };
  vm.runInNewContext(transformed, { module, exports: module.exports });
  return module.exports;
}

function clearControllerCache() {
  delete require.cache[aiChatControllerPath];
  delete require.cache[backendUtilPath];
}

describe("AIChatbot artifact download security", () => {
  it("frontend util rejects absolute, protocol-relative, and malformed URLs without building a request", () => {
    const {
      isSafeGeneratedArtifactPath,
      buildArtifactDownloadRequest,
    } = loadFrontendArtifactUtil();

    const rejected = [
      "https://evil.example/steal",
      "http://evil.example/api/ai/generated/x.txt",
      "//evil.example/api/ai/generated/x.txt",
      "https://localhost:5000/api/ai/generated/legit.txt",
      "/api/ai/chat",
      "/api/ai/generated/",
      "/api/ai/generated/../secret",
      "/api/ai/generated/%2e%2e%2fsecret",
      "/api/ai/generated/foo/bar",
      "/api/ai/generated/x.txt?next=https://evil",
      "/api/ai/generated/x.txt#frag",
      "api/ai/generated/x.txt",
      "",
      null,
      undefined,
      42,
    ];

    for (const url of rejected) {
      assert.equal(isSafeGeneratedArtifactPath(url), false, `expected reject: ${url}`);
      assert.equal(
        buildArtifactDownloadRequest(url, "http://localhost:5000", "jwt-secret-token"),
        null,
        `expected null request for: ${url}`
      );
    }
  });

  it("frontend util never attaches Authorization for rejected URLs and allows valid generated paths", () => {
    const { buildArtifactDownloadRequest } = loadFrontendArtifactUtil();
    const token = "jwt-must-not-leak";

    const external = buildArtifactDownloadRequest(
      "https://attacker.example/collect",
      "http://localhost:5000",
      token
    );
    assert.equal(external, null);

    const protocolRelative = buildArtifactDownloadRequest(
      "//attacker.example/api/ai/generated/x.txt",
      "http://localhost:5000",
      token
    );
    assert.equal(protocolRelative, null);

    const validPath = "/api/ai/generated/1792226071232-b3232c-note.txt";
    const ok = buildArtifactDownloadRequest(validPath, "http://localhost:5000", token);
    assert.ok(ok);
    assert.equal(ok.url, `http://localhost:5000${validPath}`);
    assert.equal(ok.headers.Authorization, `Bearer ${token}`);

    const noToken = buildArtifactDownloadRequest(validPath, "http://localhost:5000", null);
    assert.ok(noToken);
    assert.equal(noToken.url, `http://localhost:5000${validPath}`);
    assert.equal(Object.keys(noToken.headers).length, 0);
    assert.equal(noToken.headers.Authorization, undefined);
  });

  it("simulated downloadArtifact fetch never runs for external URLs (no Authorization leak)", async () => {
    const { buildArtifactDownloadRequest } = loadFrontendArtifactUtil();
    const fetches = [];
    const fakeFetch = async (url, options = {}) => {
      fetches.push({ url, headers: options.headers || {} });
      return {
        ok: true,
        blob: async () => new Blob(["x"]),
      };
    };

    async function downloadArtifact(artifact, token, apiOrigin, fetchImpl) {
      const request = buildArtifactDownloadRequest(artifact?.downloadUrl, apiOrigin, token);
      if (!request) return { rejected: true };
      const response = await fetchImpl(request.url, { headers: request.headers });
      if (!response.ok) return { failed: true };
      return { ok: true, blob: await response.blob() };
    }

    const token = "super-secret-jwt";
    const origin = "http://localhost:5000";

    const externalResult = await downloadArtifact(
      { downloadUrl: "https://evil.example/hook", name: "trap.bin" },
      token,
      origin,
      fakeFetch
    );
    assert.deepEqual(externalResult, { rejected: true });
    assert.equal(fetches.length, 0);

    const protocolResult = await downloadArtifact(
      { downloadUrl: "//evil.example/api/ai/generated/x.txt", name: "trap.bin" },
      token,
      origin,
      fakeFetch
    );
    assert.deepEqual(protocolResult, { rejected: true });
    assert.equal(fetches.length, 0);

    const validResult = await downloadArtifact(
      { downloadUrl: "/api/ai/generated/ok-file.txt", name: "ok-file.txt" },
      token,
      origin,
      fakeFetch
    );
    assert.equal(validResult.ok, true);
    assert.equal(fetches.length, 1);
    assert.equal(fetches[0].url, "http://localhost:5000/api/ai/generated/ok-file.txt");
    assert.equal(fetches[0].headers.Authorization, `Bearer ${token}`);
  });

  it("AIChatbot.jsx uses buildArtifactDownloadRequest and no longer fetches absolute downloadUrl directly", () => {
    const source = fs.readFileSync(chatbotPath, "utf8");
    assert.match(source, /buildArtifactDownloadRequest/);
    assert.match(source, /from ["'].*artifactDownloadUrl["']/);
    assert.doesNotMatch(
      source,
      /\/\^https\?:\\\/\\\//
    );
    assert.doesNotMatch(
      source,
      /targetUrl\s*=\s*\/\^https\?/
    );
    // Must gate fetch behind the safe request builder.
    assert.match(
      source,
      /const request = buildArtifactDownloadRequest\([\s\S]*?if \(!request\)[\s\S]*?fetch\(request\.url,\s*\{\s*headers:\s*request\.headers\s*\}\)/
    );
  });
});

describe("AI chat history artifact downloadUrl sanitization", () => {
  it("backend util strips external and malformed downloadUrl values", () => {
    const {
      isSafeGeneratedArtifactPath,
      sanitizeDownloadUrl,
      sanitizeArtifacts,
    } = require(backendUtilPath);

    assert.equal(sanitizeDownloadUrl("https://evil.example/x"), null);
    assert.equal(sanitizeDownloadUrl("//evil.example/api/ai/generated/x"), null);
    assert.equal(sanitizeDownloadUrl("/api/other/x"), null);
    assert.equal(isSafeGeneratedArtifactPath("/api/ai/generated/good.txt"), true);

    const cleaned = sanitizeArtifacts([
      { name: "good.txt", downloadUrl: "/api/ai/generated/good.txt", type: "text" },
      { name: "evil.bin", downloadUrl: "https://evil.example/steal" },
      { name: "proto.bin", downloadUrl: "//evil.example/api/ai/generated/x" },
      { name: "only-name" },
      null,
      "bad",
    ]);

    assert.equal(cleaned.length, 4);
    assert.deepEqual(cleaned[0], {
      name: "good.txt",
      type: "text",
      downloadUrl: "/api/ai/generated/good.txt",
    });
    assert.deepEqual(cleaned[1], { name: "evil.bin" });
    assert.equal(cleaned[1].downloadUrl, undefined);
    assert.deepEqual(cleaned[2], { name: "proto.bin" });
    assert.deepEqual(cleaned[3], { name: "only-name" });
  });

  it("normalizeMessages persists only safe generated-artifact paths", () => {
    clearControllerCache();
    const originalLoad = Module._load;
    Module._load = function (request, parent, isMain) {
      if (request === "../models/AIChat" || request.includes(`${path.sep}models${path.sep}AIChat`)) {
        return {};
      }
      return originalLoad(request, parent, isMain);
    };
    let normalizeMessages;
    try {
      ({ normalizeMessages } = require(aiChatControllerPath));
    } finally {
      Module._load = originalLoad;
    }

    const [message] = normalizeMessages([
      {
        id: "m1",
        from: "ai",
        text: "here",
        artifacts: [
          { name: "ok.txt", downloadUrl: "/api/ai/generated/ok.txt" },
          { name: "leak.bin", downloadUrl: "https://attacker.example/c" },
          { name: "proto.bin", downloadUrl: "//attacker.example/c" },
        ],
      },
    ]);

    assert.equal(message.artifacts.length, 3);
    assert.equal(message.artifacts[0].downloadUrl, "/api/ai/generated/ok.txt");
    assert.equal(message.artifacts[1].downloadUrl, undefined);
    assert.equal(message.artifacts[2].downloadUrl, undefined);
    clearControllerCache();
  });

  it("list response sanitizes previously persisted external downloadUrl values", async () => {
    clearControllerCache();
    const poisoned = [
      {
        clientId: "c1",
        title: "Poisoned",
        updatedAt: new Date(),
        messages: [
          {
            id: "m1",
            from: "ai",
            text: "file",
            artifacts: [
              { name: "ok.txt", downloadUrl: "/api/ai/generated/ok.txt" },
              { name: "bad.bin", downloadUrl: "https://evil.example/t" },
            ],
          },
        ],
      },
    ];

    const originalLoad = Module._load;
    Module._load = function (request, parent, isMain) {
      if (request === "../models/AIChat" || request.includes(`${path.sep}models${path.sep}AIChat`)) {
        return {
          find: () => ({
            sort: () => ({
              limit: () => ({
                lean: async () => poisoned,
              }),
            }),
          }),
        };
      }
      return originalLoad(request, parent, isMain);
    };

    let list;
    try {
      ({ list } = require(aiChatControllerPath));
    } finally {
      Module._load = originalLoad;
    }

    let payload = null;
    const res = {
      status() {
        return this;
      },
      json(body) {
        payload = body;
        return this;
      },
    };

    await list(
      { user: { _id: "u1", role: "teacher" }, query: { role: "teacher" } },
      res
    );

    assert.ok(Array.isArray(payload));
    const arts = payload[0].messages[0].artifacts;
    assert.equal(arts[0].downloadUrl, "/api/ai/generated/ok.txt");
    assert.equal(arts[1].downloadUrl, undefined);
    assert.equal(arts[1].name, "bad.bin");
    clearControllerCache();
  });
});
