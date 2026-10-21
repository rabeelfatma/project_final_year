/**
 * Isolated GET / status route — no MongoDB.
 */
const { describe, it, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const fs = require("fs");
const path = require("path");
const express = require("express");

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => {
      resolve({ server, port: server.address().port });
    });
  });
}

function request(port, reqPath) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        path: reqPath,
        method: "GET",
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8");
          resolve({ status: res.statusCode, headers: res.headers, body });
        });
      }
    );
    req.on("error", reject);
    req.end();
  });
}

describe("API root GET /", () => {
  const servers = [];

  after(async () => {
    await Promise.all(
      servers.map(
        (server) =>
          new Promise((resolve) => {
            server.close(() => resolve());
          })
      )
    );
  });

  it("registers a safe JSON GET / in appFull before SPA fallback", () => {
    const src = fs.readFileSync(path.join(__dirname, "..", "appFull.js"), "utf8");
    assert.match(src, /app\.get\(\s*["']\/["']/);
    assert.match(src, /health:\s*["']\/api\/health["']/);
    const rootIdx = src.indexOf('app.get("/",');
    const spaIdx = src.indexOf("express.static(frontendDist)");
    assert.ok(rootIdx > 0 && spaIdx > rootIdx);
    const rootBlock = src.slice(rootIdx, spaIdx);
    assert.doesNotMatch(rootBlock, /process\.env|MONGO_URI|JWT_SECRET/);
  });

  it("returns 200 JSON at / without changing /api/health", async () => {
    const app = express();
    app.get("/api/health", (_req, res) => {
      res.status(200).json({ status: "ok", service: "QuickCheck Hub", mode: "full" });
    });
    app.get("/", (_req, res) => {
      res.status(200).json({
        status: "ok",
        service: "QuickCheck Hub",
        message: "QuickCheck Hub API is running. Use /api/health for health checks.",
        health: "/api/health",
      });
    });
    app.use("/api", (_req, res) => {
      res.status(404).json({ message: "Not found" });
    });

    const { server, port } = await listen(app);
    servers.push(server);

    const root = await request(port, "/");
    assert.equal(root.status, 200);
    const rootJson = JSON.parse(root.body);
    assert.equal(rootJson.status, "ok");
    assert.equal(rootJson.service, "QuickCheck Hub");
    assert.equal(rootJson.health, "/api/health");
    assert.equal(typeof rootJson.message, "string");
    assert.ok(!("mongo" in rootJson));
    assert.ok(!("token" in rootJson));

    const health = await request(port, "/api/health");
    assert.equal(health.status, 200);
    assert.equal(JSON.parse(health.body).mode, "full");

    const unknown = await request(port, "/api/does-not-exist");
    assert.equal(unknown.status, 404);
  });
});
