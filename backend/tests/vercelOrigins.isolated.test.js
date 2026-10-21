/**
 * Isolated CORS preflight checks for the Vercel frontend origin.
 * Uses an in-memory Express app — no MongoDB, no network beyond 127.0.0.1.
 */
const { describe, it, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");
const {
  PRODUCTION_FRONTEND_ORIGIN,
  buildCorsOptions,
} = require("../utils/corsOrigins");

const FRONTEND = "https://quick-check-hub-frontend.vercel.app";

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => {
      resolve({ server, port: server.address().port });
    });
  });
}

function request(port, method, headers) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        path: "/api/auth/login",
        method,
        headers,
      },
      (res) => {
        res.resume();
        res.on("end", () => resolve(res));
      }
    );
    req.on("error", reject);
    req.end();
  });
}

function createApp(env) {
  const app = express();
  app.use(cors(buildCorsOptions(env)));
  app.post("/api/auth/login", (_req, res) => {
    res.json({ ok: true });
  });
  return app;
}

describe("Vercel CORS preflight", () => {
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

  it("appFull uses the shared allowlist and does not reflect every origin", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "..", "appFull.js"),
      "utf8"
    );
    assert.match(src, /cors\(buildCorsOptions\(\)\)/);
    assert.doesNotMatch(src, /origin:\s*true/);
    assert.equal(PRODUCTION_FRONTEND_ORIGIN, FRONTEND);
  });

  it("answers OPTIONS preflight for the production frontend with Authorization", async () => {
    const { server, port } = await listen(
      createApp({ NODE_ENV: "production" })
    );
    servers.push(server);
    const res = await request(port, "OPTIONS", {
      Origin: FRONTEND,
      Host: "quickcheck-hub-backend.vercel.app",
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "authorization,content-type",
    });
    assert.equal(res.statusCode, 204);
    assert.equal(res.headers["access-control-allow-origin"], FRONTEND);
    assert.match(res.headers["access-control-allow-headers"], /authorization/i);
    assert.match(res.headers["access-control-allow-headers"], /content-type/i);
    assert.match(res.headers["access-control-allow-methods"], /POST/);
    assert.notEqual(res.headers["access-control-allow-origin"], "*");
  });

  it("does not grant preflight to a disallowed origin even if Host is the frontend", async () => {
    const { server, port } = await listen(
      createApp({ NODE_ENV: "production" })
    );
    servers.push(server);
    const res = await request(port, "OPTIONS", {
      Origin: "https://evil.example.com",
      Host: FRONTEND.replace("https://", ""),
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "authorization",
    });
    assert.notEqual(res.headers["access-control-allow-origin"], "https://evil.example.com");
    assert.notEqual(res.headers["access-control-allow-origin"], "*");
  });

  it("allows a local development origin preflight and still rejects other sites", async () => {
    const { server, port } = await listen(
      createApp({ NODE_ENV: "development" })
    );
    servers.push(server);
    const local = await request(port, "OPTIONS", {
      Origin: "http://localhost:5173",
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "authorization,content-type",
    });
    assert.equal(local.statusCode, 204);
    assert.equal(local.headers["access-control-allow-origin"], "http://localhost:5173");

    const lan = await request(port, "POST", {
      Origin: "http://192.168.8.101:5173",
      "Content-Type": "application/json",
    });
    assert.equal(lan.headers["access-control-allow-origin"], "http://192.168.8.101:5173");

    const evil = await request(port, "OPTIONS", {
      Origin: "https://evil.example.com",
      "Access-Control-Request-Method": "POST",
    });
    assert.notEqual(
      evil.headers["access-control-allow-origin"],
      "https://evil.example.com"
    );
  });
});
