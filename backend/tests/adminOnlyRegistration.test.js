const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const Module = require("module");
const path = require("path");
const express = require("express");
const http = require("http");
const {
  isPublicAdminBootstrapAllowed,
} = require("../utils/authPassword");

const authRoutesPath = path.resolve(__dirname, "../routes/authRoutes.js");
const authControllerPath = path.resolve(__dirname, "../controllers/authController.js");
const authMiddlewarePath = path.resolve(__dirname, "../middleware/authMiddleware.js");
const userPath = path.resolve(__dirname, "../models/User.js");
const tokenPath = path.resolve(__dirname, "../utils/tokenUtils.js");
const adminRoutesPath = path.resolve(__dirname, "../routes/adminRoutes.js");
const adminControllerPath = path.resolve(__dirname, "../controllers/adminController.js");

function loadAuthRouter({ userMock, authedUser = null } = {}) {
  [
    authRoutesPath,
    authControllerPath,
    userPath,
    tokenPath,
    authMiddlewarePath,
    path.resolve(__dirname, "../controllers/passwordResetController.js"),
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

function loadAdminRouter({ userMock, authedUser = null } = {}) {
  [adminRoutesPath, adminControllerPath, userPath, authMiddlewarePath].forEach((p) =>
    delete require.cache[p]
  );

  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === "../models/User" || request.endsWith(`${path.sep}models${path.sep}User.js`)) {
      return userMock;
    }
    if (
      request === "../middleware/authMiddleware" ||
      request.endsWith(`${path.sep}middleware${path.sep}authMiddleware.js`)
    ) {
      return {
        protect: (req, res, next) => {
          if (!authedUser) {
            return res.status(401).json({ message: "No token" });
          }
          req.user = authedUser;
          return next();
        },
        authorize:
          (...roles) =>
          (req, res, next) => {
            if (!req.user || !roles.includes(req.user.role)) {
              return res.status(403).json({ message: "denied" });
            }
            return next();
          },
      };
    }
    return originalLoad(request, parent, isMain);
  };

  try {
    return require(adminRoutesPath);
  } finally {
    Module._load = originalLoad;
  }
}

function withServer(mountPath, router, run) {
  return new Promise((resolve, reject) => {
    const app = express();
    app.use(express.json());
    app.use(mountPath, router);
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
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

function denyCreateUserMock() {
  return {
    findOne: async () => null,
    countDocuments: async () => 0,
    create: async () => {
      throw new Error("should not create");
    },
  };
}

describe("QC-10D admin-only registration", () => {
  it("keeps public first-admin bootstrap disabled", () => {
    assert.equal(isPublicAdminBootstrapAllowed(), false);
  });

  it("denies public student signup", async () => {
    const router = loadAuthRouter({ userMock: denyCreateUserMock(), authedUser: null });
    const result = await withServer("/auth", router, (port) =>
      postJson(port, "/auth/signup", {
        name: "S",
        email: "s@example.com",
        password: "StudentPass12!",
        role: "student",
      })
    );
    assert.equal(result.status, 401);
  });

  it("denies public teacher signup", async () => {
    const router = loadAuthRouter({ userMock: denyCreateUserMock(), authedUser: null });
    const result = await withServer("/auth", router, (port) =>
      postJson(port, "/auth/signup", {
        name: "T",
        email: "t@example.com",
        password: "TeacherPass12!",
        role: "teacher",
      })
    );
    assert.equal(result.status, 401);
  });

  it("denies public admin signup", async () => {
    const router = loadAuthRouter({ userMock: denyCreateUserMock(), authedUser: null });
    const result = await withServer("/auth", router, (port) =>
      postJson(port, "/auth/signup", {
        name: "A",
        email: "a@example.com",
        password: "AdminPass12!",
        role: "admin",
      })
    );
    assert.equal(result.status, 401);
  });

  it("student JWT cannot create student/teacher/admin", async () => {
    const router = loadAuthRouter({
      userMock: denyCreateUserMock(),
      authedUser: { _id: "stu1", role: "student" },
    });
    for (const role of ["student", "teacher", "admin"]) {
      const result = await withServer("/auth", router, (port) =>
        postJson(
          port,
          "/auth/signup",
          {
            name: "X",
            email: `${role}@example.com`,
            password: "Pass12!!aa",
            role,
          },
          { Authorization: "Bearer fake" }
        )
      );
      assert.equal(result.status, 403);
    }
  });

  it("teacher JWT cannot create student/teacher/admin", async () => {
    const router = loadAuthRouter({
      userMock: denyCreateUserMock(),
      authedUser: { _id: "tea1", role: "teacher" },
    });
    for (const role of ["student", "teacher", "admin"]) {
      const result = await withServer("/auth", router, (port) =>
        postJson(
          port,
          "/auth/signup",
          {
            name: "X",
            email: `t-${role}@example.com`,
            password: "Pass12!!aa",
            role,
          },
          { Authorization: "Bearer fake" }
        )
      );
      assert.equal(result.status, 403);
    }
  });

  it("admin JWT can create student and teacher", async () => {
    const created = [];
    const userMock = {
      findOne: async () => null,
      countDocuments: async () => 0,
      create: async (payload) => {
        created.push(payload);
        return {
          ...payload,
          _id: `id-${created.length}`,
          registrationNumber: payload.registrationNumber,
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

    const student = await withServer("/auth", router, (port) =>
      postJson(
        port,
        "/auth/signup",
        {
          name: "Student One",
          email: "student1@example.com",
          password: "StudentPass12!",
          role: "student",
          department: "CS",
          program: "Computer Science",
        },
        { Authorization: "Bearer fake" }
      )
    );
    assert.equal(student.status, 201);
    assert.equal(student.data.user.password, undefined);

    const teacher = await withServer("/auth", router, (port) =>
      postJson(
        port,
        "/auth/signup",
        {
          name: "Teacher One",
          email: "teacher1@example.com",
          password: "TeacherPass12!",
          role: "teacher",
          subject: "SE",
        },
        { Authorization: "Bearer fake" }
      )
    );
    assert.equal(teacher.status, 201);
    assert.equal(created.length, 2);
    assert.equal(created[0].role, "student");
    assert.equal(created[1].role, "teacher");
  });

  it("rejects forged role escalation on admin users API", async () => {
    let saved = false;
    const userMock = {
      findOne: async () => null,
      // mongoose-style constructor not used; adminController uses `new User`
    };
    // Provide a constructible mock
    function User(doc) {
      Object.assign(this, doc);
      this.save = async () => {
        saved = true;
        return this;
      };
    }
    User.findOne = async () => null;

    const router = loadAdminRouter({
      userMock: User,
      authedUser: { _id: "adm1", role: "admin" },
    });
    const result = await withServer("/api/admin", router, (port) =>
      postJson(
        port,
        "/api/admin/users",
        {
          name: "Evil",
          email: "evil@example.com",
          password: "AdminPass12!",
          role: "admin",
        },
        { Authorization: "Bearer fake" }
      )
    );
    assert.equal(result.status, 400);
    assert.match(result.data.message, /student or teacher/i);
    assert.equal(saved, false);
  });

  it("login and password-reset request routes remain mounted", async () => {
    const router = loadAuthRouter({
      userMock: {
        findOne: async () => null,
      },
      authedUser: null,
    });
    const result = await withServer("/auth", router, async (port) => {
      const login = await postJson(port, "/auth/login", {
        email: "nobody@example.com",
        password: "whatever",
      });
      const reset = await postJson(port, "/auth/password-reset/request", {
        email: "nobody@example.com",
      });
      return { login, reset };
    });
    // Login returns 400 for unknown user (route reachable); reset 503 when email unset.
    assert.ok([400, 401, 503].includes(result.login.status));
    assert.ok([200, 400, 503].includes(result.reset.status));
  });
});
