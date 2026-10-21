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
  it("selects the Vercel API in production and the laptop or LAN host in DEV", async () => {
    assert.equal(fs.existsSync(apiBasePath), true);
    const mod = await import(pathToFileURL(apiBasePath).href);
    const production = "https://quickcheck-hub-backend.vercel.app/api";
    assert.equal(mod.PRODUCTION_API_BASE_URL, production);
    assert.equal(mod.resolveApiBaseUrl({ isDev: false }), production);
    assert.equal(
      mod.resolveApiBaseUrl({
        isDev: false,
        configured: "http://localhost:5000/api",
      }),
      production
    );
    assert.equal(
      mod.resolveApiBaseUrl({
        isDev: false,
        configured: "http://192.168.8.101:5000/api",
      }),
      production
    );
    assert.equal(
      mod.resolveApiBaseUrl({ isDev: false, configured: "/api" }),
      production
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
    assert.equal(
      mod.resolveApiBaseUrl({
        configured: "https://api.example.com/api/",
      }),
      "https://api.example.com/api"
    );
  });

  it("normalizes trailing slashes and a duplicated /api suffix once", async () => {
    const mod = await import(pathToFileURL(apiBasePath).href);
    assert.equal(
      mod.normalizeApiBaseUrl("https://quickcheck-hub-backend.vercel.app/api/"),
      "https://quickcheck-hub-backend.vercel.app/api"
    );
    assert.equal(
      mod.normalizeApiBaseUrl("https://quickcheck-hub-backend.vercel.app"),
      "https://quickcheck-hub-backend.vercel.app/api"
    );
    assert.equal(
      mod.normalizeApiBaseUrl("https://quickcheck-hub-backend.vercel.app/api/api"),
      "https://quickcheck-hub-backend.vercel.app/api"
    );
    assert.equal(
      mod.resolveApiBaseUrl({
        isDev: true,
        configured: "http://localhost:5000/api/api/",
      }),
      "http://localhost:5000/api"
    );
    assert.equal(
      mod.resolveApiBaseUrl({
        isDev: false,
        configured: "https://quickcheck-hub-backend.vercel.app/api/api/",
      }),
      "https://quickcheck-hub-backend.vercel.app/api"
    );
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
    assert.match(viteCfg, /resolveApiBaseUrl/);
    const vercelJson = JSON.parse(
      fs.readFileSync(
        path.join(__dirname, "..", "..", "frontend", "vercel.json"),
        "utf8"
      )
    );
    assert.ok(
      vercelJson.rewrites.some((rule) => rule.destination === "/index.html")
    );
    assert.equal(
      vercelJson.rewrites.some((rule) =>
        String(rule.destination || "").includes("quickcheck-hub-backend")
      ),
      false
    );
  });
});
