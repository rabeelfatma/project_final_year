const { describe, it, beforeEach, mock } = require("node:test");
const assert = require("node:assert/strict");
const Module = require("module");
const path = require("path");

const controllerPath = path.resolve(__dirname, "../controllers/authController.js");
const userPath = path.resolve(__dirname, "../models/User.js");
const tokenPath = path.resolve(__dirname, "../utils/tokenUtils.js");

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
  const res = {
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
  return res;
}

describe("authController register/login (isolated mocks)", () => {
  let createdPayload = null;

  beforeEach(() => {
    createdPayload = null;
  });

  it("admin can create student with chosen password hashed", async () => {
    const userMock = {
      findOne: async () => null,
      countDocuments: async () => 0,
      create: async (payload) => {
        createdPayload = payload;
        return {
          ...payload,
          _id: "stu1",
          registrationNumber: payload.registrationNumber,
          toObject() {
            return { ...this };
          },
        };
      },
    };

    const authController = loadController(userMock);
    const req = {
      user: { role: "admin", _id: "admin1" },
      body: {
        name: "Student One",
        email: "student1@example.com",
        password: "StudentPass12!",
        role: "student",
        department: "CS",
        program: "Computer Science",
      },
    };
    const res = mockRes();
    await authController.registerUser(req, res);

    assert.equal(res.statusCode, 201);
    assert.match(createdPayload.password, /^\$2[aby]?\$/);
    assert.notEqual(createdPayload.password, "StudentPass12!");
    assert.equal(res.body.user.password, undefined);
    assert.equal(res.body.role, "student");
  });

  it("rejects unauthenticated student creation", async () => {
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
          name: "X",
          email: "x@example.com",
          password: "StudentPass12!",
          role: "student",
        },
      },
      res
    );
    assert.equal(res.statusCode, 403);
  });

  it("admin can create teacher with chosen password hashed", async () => {
    const userMock = {
      findOne: async () => null,
      countDocuments: async () => 0,
      create: async (payload) => {
        createdPayload = payload;
        return {
          ...payload,
          _id: "tea1",
          toObject() {
            return { ...this };
          },
        };
      },
    };
    const authController = loadController(userMock);
    const res = mockRes();
    await authController.registerUser(
      {
        user: { role: "admin" },
        body: {
          name: "Teacher One",
          email: "teacher1@example.com",
          password: "TeacherPass12!",
          role: "teacher",
          subject: "Data Structures",
          department: "CS",
        },
      },
      res
    );
    assert.equal(res.statusCode, 201);
    assert.match(createdPayload.password, /^\$2[aby]?\$/);
    assert.equal(res.body.user.password, undefined);
  });

  it("student login succeeds with correct password", async () => {
    const { hashPassword } = require("../utils/authPassword");
    const hash = await hashPassword("StudentPass12!");
    const userMock = {
      findOne: async () => ({
        _id: "stu1",
        name: "Student One",
        email: "student1@example.com",
        password: hash,
        role: "student",
        registrationNumber: "FA26-BCS-001",
        toObject() {
          return { ...this };
        },
      }),
    };
    const authController = loadController(userMock);
    const res = mockRes();
    await authController.loginUser(
      {
        body: {
          email: "student1@example.com",
          password: "StudentPass12!",
          name: "Student One",
          role: "student",
        },
      },
      res
    );
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.token, "test-jwt-token");
    assert.equal(res.body.role, "student");
    assert.equal(res.body.user.password, undefined);
  });

  it("teacher login succeeds with correct password", async () => {
    const { hashPassword } = require("../utils/authPassword");
    const hash = await hashPassword("TeacherPass12!");
    const userMock = {
      findOne: async () => ({
        _id: "tea1",
        name: "Teacher One",
        email: "teacher1@example.com",
        password: hash,
        role: "teacher",
        toObject() {
          return { ...this };
        },
      }),
    };
    const authController = loadController(userMock);
    const res = mockRes();
    await authController.loginUser(
      {
        body: {
          email: "teacher1@example.com",
          password: "TeacherPass12!",
          name: "Teacher One",
          role: "teacher",
        },
      },
      res
    );
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.role, "teacher");
  });

  it("rejects wrong password", async () => {
    const { hashPassword } = require("../utils/authPassword");
    const hash = await hashPassword("StudentPass12!");
    const userMock = {
      findOne: async () => ({
        _id: "stu1",
        name: "Student One",
        email: "student1@example.com",
        password: hash,
        role: "student",
        toObject() {
          return { ...this };
        },
      }),
    };
    const authController = loadController(userMock);
    const res = mockRes();
    await authController.loginUser(
      {
        body: {
          email: "student1@example.com",
          password: "WrongPass99!",
          name: "Student One",
          role: "student",
        },
      },
      res
    );
    assert.equal(res.statusCode, 400);
    assert.match(res.body.message, /invalid/i);
  });

  it("rejects missing password", async () => {
    const userMock = { findOne: async () => null };
    const authController = loadController(userMock);
    const res = mockRes();
    await authController.loginUser(
      { body: { email: "student1@example.com", role: "student", name: "Student One" } },
      res
    );
    assert.equal(res.statusCode, 400);
    assert.match(res.body.message, /password/i);
  });

  it("rejects role escalation via client-provided role", async () => {
    const { hashPassword } = require("../utils/authPassword");
    const hash = await hashPassword("StudentPass12!");
    const userMock = {
      findOne: async () => ({
        _id: "stu1",
        name: "Student One",
        email: "student1@example.com",
        password: hash,
        role: "student",
        toObject() {
          return { ...this };
        },
      }),
    };
    const authController = loadController(userMock);
    const res = mockRes();
    await authController.loginUser(
      {
        body: {
          email: "student1@example.com",
          password: "StudentPass12!",
          name: "Student One",
          role: "admin",
        },
      },
      res
    );
    assert.equal(res.statusCode, 400);
  });

  it("admin login remains intact", async () => {
    const { hashPassword } = require("../utils/authPassword");
    const hash = await hashPassword("AdminPass12!");
    const userMock = {
      findOne: async () => ({
        _id: "adm1",
        name: "Admin",
        email: "admin@example.com",
        password: hash,
        role: "admin",
        toObject() {
          return { ...this };
        },
      }),
    };
    const authController = loadController(userMock);
    const res = mockRes();
    await authController.loginUser(
      {
        body: {
          email: "admin@example.com",
          password: "AdminPass12!",
          role: "admin",
        },
      },
      res
    );
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.role, "admin");
    assert.equal(res.body.token, "test-jwt-token");
    assert.equal(res.body.user.password, undefined);
  });

  it("rejects accounts with no stored password hash", async () => {
    const userMock = {
      findOne: async () => ({
        _id: "stu2",
        name: "Legacy",
        email: "legacy@example.com",
        password: null,
        role: "student",
        toObject() {
          return { ...this };
        },
      }),
    };
    const authController = loadController(userMock);
    const res = mockRes();
    await authController.loginUser(
      {
        body: {
          email: "legacy@example.com",
          password: "Anything1!",
          name: "Legacy",
          role: "student",
        },
      },
      res
    );
    assert.equal(res.statusCode, 400);
    assert.match(res.body.message, /no password/i);
  });
});
