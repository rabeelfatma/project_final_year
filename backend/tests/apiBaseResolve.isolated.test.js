/**
 * Isolated tests for frontend API base URL resolution (DEV LAN vs production).
 * Loads the pure resolver via dynamic import — no Vite, no network, no secrets.
 */
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const fs = require("fs");
const { pathToFileURL } = require("url");

const apiBasePath = path.join(
  __dirname,
  "..",
  "..",
  "frontend",
  "src",
  "utils",
  "apiBase.js"
);
const viteConfigPath = path.join(
  __dirname,
  "..",
  "..",
  "frontend",
  "vite.config.js"
);

describe("frontend resolveApiBaseUrl", () => {
  it("uses explicit VITE_API_BASE_URL, DEV hostname:5000, and production /api", async () => {
    assert.equal(fs.existsSync(apiBasePath), true);
    const mod = await import(pathToFileURL(apiBasePath).href);
    assert.equal(
      mod.resolveApiBaseUrl({
        configured: "https://api.example.com/api/",
      }),
      "https://api.example.com/api"
    );
    assert.equal(
      mod.resolveApiBaseUrl({
        isDev: true,
        hostname: "localhost",
        protocol: "http:",
      }),
      "http://localhost:5000/api"
    );
    assert.equal(
      mod.resolveApiBaseUrl({
        isDev: true,
        hostname: "192.168.8.101",
        protocol: "http:",
      }),
      "http://192.168.8.101:5000/api"
    );
    assert.equal(mod.resolveApiBaseUrl({ isDev: false }), "/api");
  });

  it("documents opt-in Vite LAN host (dev:lan / VITE_LAN)", () => {
    const viteCfg = fs.readFileSync(viteConfigPath, "utf8");
    const pkg = fs.readFileSync(
      path.join(__dirname, "..", "..", "frontend", "package.json"),
      "utf8"
    );
    assert.match(pkg, /"dev:lan"\s*:\s*"vite --host"/);
    assert.match(viteCfg, /VITE_LAN/);
    assert.match(viteCfg, /host:\s*lanEnabled\s*\?\s*true\s*:\s*['"]localhost['"]/);
  });
});
