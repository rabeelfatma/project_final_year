const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const Module = require("module");
const path = require("path");
const express = require("express");
const http = require("http");

const {
  validatePasswordInput,
  hashPassword,
  isBcryptHash,
  isPublicAdminBootstrapAllowed,
  toPublicUser,
} = require("../utils/authPassword");

const controllerPath = path.resolve(__dirname, "../controllers/authController.js");
const userPath = path.resolve(__dirname, "../models/User.js");
const tokenPath = path.resolve(__dirname, "../utils/tokenUtils.js");
const authRoutesPath = path.resolve(__dirname, "../routes/authRoutes.js");
const authMiddlewarePath = path.resolve(__dirname, "../middleware/authMiddleware.js");

function loadController(userMock) {
  delete require.cache[controllerPath];
  delete require.cache[userPath];
  delete require.cache[tokenPath];
  delete require.cache[path.resolve(__dirname, "../utils/authPassword.js")];

  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === "../models/User" || request.endsWith(`${path.sep}models${path.sep}User.js`)) {
      return userMock;
    }
    if (request === "../utils/tokenUtils" || request.endsWith(`${path.sep}utils${path.sep}tokenUtils.js`)) {
      return () => "test-jwt-token";
    }
    return originalLoad(request, parent, isMain);
  };

  try {
    return require(controllerPath);
  } finally {
    Module._load = originalLoad;
  }
}

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

function loadAuthRouter({ userMock, authedUser = null } = {}) {
  [
    authRoutesPath,
    controllerPath,
    userPath,
    tokenPath,
    authMiddlewarePath,
    path.resolve(__dirname, "../utils/authPassword.js"),
  ].forEach((p) => delete require.cache[p]);

  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === "../models/User" || request.endsWith(`${path.sep}models${path.sep}User.js`)) {
      return userMock;
    }
    if (request === "../utils/tokenUtils" || request.endsWith(`${path.sep}utils${path.sep}tokenUtils.js`)) {
      return () => "test-jwt-token";
    }
    if (
      request === "../middleware/authMiddleware" ||
      request.endsWith(`${path.sep}middleware${path.sep}authMiddleware.js`)
    ) {
      return {
        protect: (req, res, next) => {
          if (!authedUser) {
            return res.status(401).json({ message: "No token provided (Access Denied)" });
          }
          req.user = authedUser;
          return next();
        },
        authorize:
          (...roles) =>
          (req, res, next) => {
            if (!req.user || !roles.includes(req.user.role)) {
              return res.status(403).json({ message: `Access denied for role: ${req.user?.role}` });
            }
            return next();
          },
      };
    }
    return originalLoad(request, parent, isMain);
  };

  try {
    return require(authRoutesPath);
  } finally {
    Module._load = originalLoad;
  }
}

function withServer(router, run) {
  return new Promise((resolve, reject) => {
    const app = express();
    app.use(express.json());
    app.use("/auth", router);
    const server = http.createServer(app);
    server.listen(0, "127.0.0.1", async () => {
      const { port } = server.address();
      try {
        const result = await run(port);
        server.close(() => resolve(result));
      } catch (error) {
        server.close(() => reject(error));
      }
    });
  });
}

async function postJson(port, pathname, body, headers = {}) {
  const res = await fetch(`http://127.0.0.1:${port}${pathname}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return { status: res.status, data };
}

describe("QC-08A-S reset-password temporary block", () => {
  it("rejects unauthenticated password changes without mutating users", async () => {
    let saved = false;
    const userMock = {
      findOne: async () => ({
        email: "victim@example.com",
        password: "old-hash",
        async save() {
          saved = true;
        },
      }),
      countDocuments: async () => 1,
    };

    const router = loadAuthRouter({ userMock, authedUser: null });
    const result = await withServer(router, (port) =>
      postJson(port, "/auth/reset-password", {
        email: "victim@example.com",
        newPassword: "HackedPass12!",
      })
    );

    assert.equal(result.status, 503);
    assert.equal(result.data.code, "PASSWORD_RESET_DISABLED");
    assert.match(result.data.message, /temporarily unavailable/i);
    assert.equal(saved, false);
  });
});

describe("QC-08A-S first-admin bootstrap restriction", () => {
  it("disables public first-admin bootstrap policy", () => {
    assert.equal(isPublicAdminBootstrapAllowed(), false);
  });

  it("rejects unauthenticated admin registration even when admin count is zero", async () => {
    const userMock = {
      findOne: async () => null,
      countDocuments: async () => 0,
      create: async () => {
        throw new Error("should not create admin");
      },
    };

    const router = loadAuthRouter({ userMock, authedUser: null });
    const result = await withServer(router, (port) =>
      postJson(port, "/auth/signup", {
        name: "Bootstrap Admin",
        email: "bootstrap@example.com",
        password: "AdminPass12!",
        role: "admin",
      })
    );

    assert.equal(result.status, 401);
  });

  it("allows authenticated admin to create another admin", async () => {
    let created = null;
    const userMock = {
      findOne: async () => null,
      countDocuments: async () => 1,
      create: async (payload) => {
        created = payload;
        return {
          ...payload,
          _id: "adm2",
          toObject() {
            return { ...this };
          },
        };
      },
    };

    const router = loadAuthRouter({
      userMock,
      authedUser: { _id: "adm1", role: "admin" },
    });
    const result = await withServer(router, (port) =>
      postJson(
        port,
        "/auth/signup",
        {
          name: "Second Admin",
          email: "admin2@example.com",
          password: "AdminPass12!",
          role: "admin",
        },
        { Authorization: "Bearer fake" }
      )
    );

    assert.equal(result.status, 201);
    assert.match(created.password, /^\$2[aby]?\$/);
    assert.equal(result.data.user.password, undefined);
  });

  it("controller rejects public admin create when bootstrap disabled", async () => {
    const userMock = {
      findOne: async () => null,
      countDocuments: async () => 0,
      create: async () => {
        throw new Error("should not create");
      },
    };
    const authController = loadController(userMock);
    const res = mockRes();
    await authController.registerUser(
      {
        body: {
          name: "Bootstrap Admin",
          email: "bootstrap@example.com",
          password: "AdminPass12!",
          role: "admin",
        },
      },
      res
    );
    assert.equal(res.statusCode, 403);
    assert.match(res.body.message, /disabled/i);
  });
});

describe("QC-08A-S password integrity", () => {
  it("detects bcrypt hashes and refuses to accept them as plaintext passwords", async () => {
    const hash = await hashPassword("PlainPass12!");
    assert.equal(isBcryptHash(hash), true);
    const rejected = validatePasswordInput(hash);
    assert.equal(rejected.ok, false);
    assert.match(rejected.message, /invalid password format/i);
  });

  it("hashes plaintext exactly once for updates", async () => {
    const plain = "UpdatePass12!";
    const once = await hashPassword(plain);
    assert.equal(isBcryptHash(once), true);
    assert.equal(await require("../utils/authPassword").passwordsMatch(plain, once), true);
    // Re-hashing a hash must not be performed by validatePasswordInput callers.
    assert.equal(validatePasswordInput(once).ok, false);
  });

  it("never exposes password hashes from toPublicUser", () => {
    const publicUser = toPublicUser({
      email: "a@example.com",
      password: "$2a$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012345",
      role: "student",
    });
    assert.equal(publicUser.password, undefined);
  });
});
