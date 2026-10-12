const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const path = require("path");

function request(port, method, urlPath) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: "127.0.0.1", port, path: urlPath, method },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          resolve({
            status: res.statusCode,
            text: Buffer.concat(chunks).toString("utf8"),
          });
        });
      }
    );
    req.on("error", reject);
    req.end();
  });
}

describe("APP_RUNTIME_MODE=preview", () => {
  it("serves preview HTML and blocks APIs/uploads without Mongo", async () => {
    const prevMode = process.env.APP_RUNTIME_MODE;
    const prevVercel = process.env.VERCEL;
    process.env.APP_RUNTIME_MODE = "preview";
    process.env.VERCEL = "1";
    delete require.cache[path.resolve(__dirname, "../server.js")];
    delete require.cache[path.resolve(__dirname, "../appFull.js")];
    const app = require("../server.js");

    await new Promise((resolve, reject) => {
      const server = http.createServer(app);
      server.listen(0, "127.0.0.1", async () => {
        const { port } = server.address();
        try {
          const health = await request(port, "GET", "/health");
          assert.equal(health.status, 200);
          assert.match(health.text, /"mode":"preview"/);

          const page = await request(port, "GET", "/");
          assert.equal(page.status, 200);
          assert.match(page.text, /Frontend preview mode|preview/i);
          assert.doesNotMatch(page.text, /student score|invented grade/i);

          const api = await request(port, "GET", "/api/auth/login");
          assert.equal(api.status, 503);
          const uploads = await request(port, "GET", "/uploads/assignments/x.pdf");
          assert.equal(uploads.status, 503);

          server.close(() => {
            if (prevMode === undefined) delete process.env.APP_RUNTIME_MODE;
            else process.env.APP_RUNTIME_MODE = prevMode;
            if (prevVercel === undefined) delete process.env.VERCEL;
            else process.env.VERCEL = prevVercel;
            delete require.cache[path.resolve(__dirname, "../server.js")];
            resolve();
          });
        } catch (err) {
          server.close(() => {
            if (prevMode === undefined) delete process.env.APP_RUNTIME_MODE;
            else process.env.APP_RUNTIME_MODE = prevMode;
            if (prevVercel === undefined) delete process.env.VERCEL;
            else process.env.VERCEL = prevVercel;
            delete require.cache[path.resolve(__dirname, "../server.js")];
            reject(err);
          });
        }
      });
    });
  });
});
