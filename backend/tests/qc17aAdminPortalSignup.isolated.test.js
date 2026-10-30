const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("module");
const { describe, it, beforeEach } = require("node:test");

const root = path.join(__dirname, "..", "..");
const adminLoginPath = path.join(
  root,
  "frontend",
  "src",
  "pages",
  "authentication",
  "AdminLogin.jsx"
);
const publicSignupPath = path.join(
  root,
  "frontend",
  "src",
  "pages",
  "authentication",
  "PublicSignup.jsx"
);
const loginPath = path.join(root, "frontend", "src", "pages", "authentication", "Login.jsx");
const appPath = path.join(root, "frontend", "src", "App.jsx");
const appRoutesPath = path.join(root, "frontend", "src", "routes", "AppRoutes.jsx");
const mainPath = path.join(root, "frontend", "src", "main.jsx");
const adminDashPath = path.join(root, "frontend", "src", "pages", "dashboards", "AdminDashboard.jsx");
const adminServicePath = path.join(root, "frontend", "src", "services", "adminService.js");
const authRoutesPath = path.join(root, "backend", "routes", "authRoutes.js");
const adminRoutesPath = path.join(root, "backend", "routes", "adminRoutes.js");
const userModelPath = path.join(root, "backend", "models", "User.js");
const authPasswordPath = path.join(root, "backend", "utils", "authPassword.js");

const controllerPath = path.resolve(__dirname, "../controllers/authController.js");
const adminControllerPath = path.resolve(__dirname, "../controllers/adminController.js");
const userPath = path.resolve(__dirname, "../models/User.js");
const tokenPath = path.resolve(__dirname, "../utils/tokenUtils.js");
const rateLimitModelPath = path.resolve(__dirname, "../models/AuthRateLimit.js");
const rateLimitServicePath = path.resolve(__dirname, "../services/authRateLimit.js");
const transactionalEmailPath = path.resolve(
  __dirname,
  "../services/transactionalEmail.js"
);
const emailVerificationPath = path.resolve(
  __dirname,
  "../services/emailVerificationService.js"
);
const registrationNotifyPath = path.resolve(
  __dirname,
  "../services/registrationNotificationService.js"
);

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

function installEmailMocks() {
  require.cache[transactionalEmailPath] = {
    id: transactionalEmailPath,
    filename: transactionalEmailPath,
    loaded: true,
    exports: {
      getEmailConfig: () => ({
        configured: true,
        apiKey: "re_test",
        fromEmail: "QuickCheck Hub <noreply@example.com>",
        publicAppUrl: "https://app.example.com",
      }),
      sendTransactionalEmail: async () => ({ ok: true }),
    },
  };
  require.cache[emailVerificationPath] = {
    id: emailVerificationPath,
    filename: emailVerificationPath,
    loaded: true,
    exports: {
      issueEmailVerificationToken: async () => ({
        rawToken: "a".repeat(64),
        expiresHours: 24,
      }),
      sendSignupVerificationEmail: async () => ({ ok: true }),
      verifyEmailWithToken: async () => ({
        ok: true,
        status: 200,
        message: "Email verified successfully. Your account is awaiting Admin approval.",
      }),
      resendVerificationEmail: async () => ({
        ok: true,
        status: 200,
        message: "If an unverified registration exists for that email, a new verification link will be sent shortly.",
      }),
      createDefaultDeps: () => ({}),
    },
  };
  require.cache[registrationNotifyPath] = {
    id: registrationNotifyPath,
    filename: registrationNotifyPath,
    loaded: true,
    exports: {
      notifyAdminsOfVerifiedRegistration: async () => ({ notified: true }),
      sendApplicantDecisionEmail: async () => ({ ok: true }),
    },
  };
}

function loadAuthController(userMock) {
  delete require.cache[controllerPath];
  delete require.cache[userPath];
  delete require.cache[tokenPath];
  delete require.cache[path.resolve(__dirname, "../utils/authPassword.js")];
  delete require.cache[rateLimitModelPath];
  delete require.cache[rateLimitServicePath];
  installEmailMocks();

  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === "../models/User" || request.endsWith(`${path.sep}models${path.sep}User.js`)) {
      return userMock;
    }
    if (request === "../utils/tokenUtils" || request.endsWith(`${path.sep}utils${path.sep}tokenUtils.js`)) {
      return () => "test-jwt-token";
    }
    if (
      request === "../models/AuthRateLimit" ||
      request.endsWith(`${path.sep}models${path.sep}AuthRateLimit.js`)
    ) {
      return {};
    }
    if (
      request === "../services/authRateLimit" ||
      request.endsWith(`${path.sep}services${path.sep}authRateLimit.js`)
    ) {
      return {
        DEFAULT_WINDOW_MS: 15 * 60 * 1000,
        assertWithinRateLimit: async () => ({ ok: true }),
      };
    }
    return originalLoad(request, parent, isMain);
  };

  try {
    return require(controllerPath);
  } finally {
    Module._load = originalLoad;
  }
}

function loadAdminController(userMock) {
  delete require.cache[adminControllerPath];
  delete require.cache[userPath];
  delete require.cache[path.resolve(__dirname, "../utils/authPassword.js")];
  installEmailMocks();

  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === "../models/User" || request.endsWith(`${path.sep}models${path.sep}User.js`)) {
      return userMock;
    }
    return originalLoad(request, parent, isMain);
  };

  try {
    return require(adminControllerPath);
  } finally {
    Module._load = originalLoad;
  }
}

describe("QC-17A Admin portal UI contracts", () => {
  it("/admin renders Admin-only login with email/password", () => {
    const src = fs.readFileSync(adminLoginPath, "utf8");
    assert.match(src, /QuickCheck Hub/);
    assert.match(src, /Administration Portal/);
    assert.match(src, /EMAIL ADDRESS/);
    assert.match(src, /PASSWORD/);
    assert.match(src, /Sign In as Admin/);
    assert.match(src, /Forgot Password/);
    assert.match(src, /showPass/);
    assert.doesNotMatch(src, /FULL NAME|Full Name|form\.name/);
    assert.doesNotMatch(src, /to="\/signup"/);
    assert.doesNotMatch(src, /Create Account/);
    assert.match(src, /role:\s*"admin"/);
    assert.match(src, /navigate\("\/dashboard\/admin"/);
  });

  it("AppRoutes (live entry) wires /admin, /login, /signup and protects admin dashboard", () => {
    const mainSrc = fs.readFileSync(mainPath, "utf8");
    assert.match(mainSrc, /AppRoutes/);
    const src = fs.readFileSync(appRoutesPath, "utf8");
    assert.match(src, /path="\/admin"/);
    assert.match(src, /AdminLogin/);
    assert.match(src, /path="\/login"/);
    assert.match(src, /path="\/signup"/);
    assert.match(src, /PublicSignup/);
    assert.match(src, /path="\/dashboard\/admin"/);
    assert.match(src, /allowedRoles=\{\["admin"\]\}/);
    assert.match(src, /ProtectedRoute/);
    // Keep App.jsx aligned for parity.
    const appSrc = fs.readFileSync(appPath, "utf8");
    assert.match(appSrc, /path="\/admin"/);
    assert.match(appSrc, /PublicSignup/);
  });

  it("public /login has no Admin role card", () => {
    const src = fs.readFileSync(loginPath, "utf8");
    assert.doesNotMatch(src, /id:\s*"admin"/);
    assert.match(src, /id:\s*"teacher"/);
    assert.match(src, /id:\s*"student"/);
  });

  it("/signup renders Teacher/Student registration form", () => {
    const src = fs.readFileSync(publicSignupPath, "utf8");
    assert.match(src, /register-request/);
    assert.match(src, /Full Name|FULL NAME|name/);
    assert.match(src, /EMAIL ADDRESS/);
    assert.match(src, /PASSWORD/);
    assert.match(src, /Confirm Password|CONFIRM PASSWORD/);
    assert.match(src, /teacher/);
    assert.match(src, /student/);
    assert.doesNotMatch(src, /role:\s*"admin"|value="admin"/);
    assert.match(src, /Admin approval/);
    assert.match(src, /Back to Login|to="\/login"/);
  });

  it("Admin dashboard exposes Registration Requests panel", () => {
    const dash = fs.readFileSync(adminDashPath, "utf8");
    const service = fs.readFileSync(adminServicePath, "utf8");
    assert.match(dash, /Registration Requests/);
    assert.match(dash, /Pending Requests|pending/);
    assert.match(dash, /Approve/);
    assert.match(dash, /Reject/);
    assert.match(dash, /pendingRegistrationCount|pendingCount/);
    assert.match(service, /getRegistrationRequests/);
    assert.match(service, /approveRegistrationRequest/);
    assert.match(service, /rejectRegistrationRequest/);
  });
});

describe("QC-17A backend approval contracts", () => {
  it("User model and routes expose approval + public register-request", () => {
    const userSrc = fs.readFileSync(userModelPath, "utf8");
    const authRoutes = fs.readFileSync(authRoutesPath, "utf8");
    const adminRoutes = fs.readFileSync(adminRoutesPath, "utf8");
    assert.match(userSrc, /approvalStatus/);
    assert.match(userSrc, /pending/);
    assert.match(userSrc, /approved/);
    assert.match(userSrc, /rejected/);
    assert.match(authRoutes, /register-request/);
    assert.match(authRoutes, /requestPublicSignup/);
    assert.match(adminRoutes, /registration-requests/);
    assert.match(adminRoutes, /authorize\('admin'\)/);
    assert.match(adminRoutes, /approveRegistrationRequest/);
    assert.match(adminRoutes, /rejectRegistrationRequest/);
  });

  it("getLoginDenialReason blocks pending/rejected and allows legacy approved", () => {
    const {
      getLoginDenialReason,
      canUserLogin,
    } = require(authPasswordPath);

    assert.ok(
      getLoginDenialReason({ isAllowedLogin: true, approvalStatus: "pending" })
    );
    assert.ok(
      getLoginDenialReason({ isAllowedLogin: true, approvalStatus: "rejected" })
    );
    assert.equal(
      getLoginDenialReason({ isAllowedLogin: false, approvalStatus: "approved" }),
      "This account is not allowed to log in. Contact an administrator."
    );
    assert.equal(
      getLoginDenialReason({ isAllowedLogin: true }),
      null
    );
    assert.equal(canUserLogin({ isAllowedLogin: true, approvalStatus: "approved" }), true);
    assert.equal(canUserLogin({ approvalStatus: "pending" }), false);
  });
});

describe("QC-17A public signup + approval (isolated mocks)", () => {
  let createdPayload = null;

  beforeEach(() => {
    createdPayload = null;
  });

  it("teacher signup request creates pending account without JWT", async () => {
    const userMock = {
      findOne: async () => null,
      countDocuments: async () => 0,
      create: async (payload) => {
        createdPayload = payload;
        return { ...payload, _id: "req1", toObject() { return { ...this }; } };
      },
    };
    const authController = loadAuthController(userMock);
    const res = mockRes();
    await authController.requestPublicSignup(
      {
        ip: "127.0.0.1",
        body: {
          name: "Teacher Pending",
          email: "teacher.pending@example.com",
          password: "TeacherPass12!",
          role: "teacher",
        },
      },
      res
    );
    assert.equal(res.statusCode, 201);
    assert.equal(createdPayload.approvalStatus, "pending");
    assert.equal(createdPayload.isAllowedLogin, false);
    assert.equal(createdPayload.emailVerified, false);
    assert.equal(createdPayload.role, "teacher");
    assert.match(createdPayload.password, /^\$2[aby]?\$/);
    assert.equal(res.body.token, undefined);
    assert.equal(res.body.verificationEmailSent, true);
    assert.match(res.body.message, /verify your email|Admin approval/i);
  });

  it("student signup request creates pending account without JWT", async () => {
    const userMock = {
      findOne: async () => null,
      countDocuments: async () => 0,
      create: async (payload) => {
        createdPayload = payload;
        return { ...payload, _id: "req2", toObject() { return { ...this }; } };
      },
    };
    const authController = loadAuthController(userMock);
    const res = mockRes();
    await authController.requestPublicSignup(
      {
        ip: "127.0.0.1",
        body: {
          name: "Student Pending",
          email: "student.pending@example.com",
          password: "StudentPass12!",
          role: "student",
        },
      },
      res
    );
    assert.equal(res.statusCode, 201);
    assert.equal(createdPayload.approvalStatus, "pending");
    assert.equal(createdPayload.isAllowedLogin, false);
    assert.equal(createdPayload.emailVerified, false);
    assert.equal(createdPayload.role, "student");
    assert.equal(res.body.token, undefined);
    assert.equal(res.body.verificationEmailSent, true);
  });

  it("rejects admin role on public signup", async () => {
    const userMock = {
      findOne: async () => null,
      create: async () => {
        throw new Error("should not create");
      },
    };
    const authController = loadAuthController(userMock);
    const res = mockRes();
    await authController.requestPublicSignup(
      {
        ip: "127.0.0.1",
        body: {
          name: "Evil",
          email: "evil@example.com",
          password: "EvilPass12!",
          role: "admin",
        },
      },
      res
    );
    assert.equal(res.statusCode, 400);
    assert.match(res.body.message, /Teacher or Student|Invalid/i);
  });

  it("rejects duplicate email signup without creating a second account", async () => {
    const userMock = {
      findOne: async () => ({
        _id: "existing",
        role: "student",
        approvalStatus: "pending",
        emailVerified: false,
      }),
      create: async () => {
        throw new Error("should not create");
      },
    };
    const authController = loadAuthController(userMock);
    const res = mockRes();
    await authController.requestPublicSignup(
      {
        ip: "127.0.0.1",
        body: {
          name: "Dup",
          email: "dup@example.com",
          password: "DupPass12!",
          role: "student",
        },
      },
      res
    );
    assert.equal(res.statusCode, 409);
    assert.equal(res.body.code, "PENDING_VERIFICATION");
    assert.doesNotMatch(JSON.stringify(res.body), /password|token/i);
  });

  it("pending accounts cannot log in", async () => {
    const { hashPassword } = require("../utils/authPassword");
    const hash = await hashPassword("StudentPass12!");
    const userMock = {
      findOne: async () => ({
        _id: "p1",
        email: "pending@example.com",
        password: hash,
        role: "student",
        approvalStatus: "pending",
        isAllowedLogin: false,
        toObject() { return { ...this }; },
      }),
    };
    const authController = loadAuthController(userMock);
    const res = mockRes();
    await authController.loginUser(
      { body: { email: "pending@example.com", password: "StudentPass12!", role: "student" } },
      res
    );
    assert.equal(res.statusCode, 403);
    assert.match(res.body.message, /pending/i);
    assert.equal(res.body.token, undefined);
  });

  it("rejected accounts cannot log in", async () => {
    const { hashPassword } = require("../utils/authPassword");
    const hash = await hashPassword("StudentPass12!");
    const userMock = {
      findOne: async () => ({
        _id: "r1",
        email: "rejected@example.com",
        password: hash,
        role: "teacher",
        approvalStatus: "rejected",
        isAllowedLogin: false,
        toObject() { return { ...this }; },
      }),
    };
    const authController = loadAuthController(userMock);
    const res = mockRes();
    await authController.loginUser(
      { body: { email: "rejected@example.com", password: "StudentPass12!", role: "teacher" } },
      res
    );
    assert.equal(res.statusCode, 403);
    assert.match(res.body.message, /rejected/i);
  });

  it("approved users can log in", async () => {
    const { hashPassword } = require("../utils/authPassword");
    const hash = await hashPassword("StudentPass12!");
    const userMock = {
      findOne: async () => ({
        _id: "a1",
        name: "Approved Student",
        email: "approved@example.com",
        password: hash,
        role: "student",
        approvalStatus: "approved",
        isAllowedLogin: true,
        toObject() { return { ...this }; },
      }),
    };
    const authController = loadAuthController(userMock);
    const res = mockRes();
    await authController.loginUser(
      { body: { email: "approved@example.com", password: "StudentPass12!", role: "student" } },
      res
    );
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.token, "test-jwt-token");
  });

  it("admin can approve pending registration atomically", async () => {
    let query = null;
    const doc = {
      _id: "req1",
      name: "Teacher Pending",
      email: "teacher.pending@example.com",
      role: "teacher",
      approvalStatus: "approved",
      isAllowedLogin: true,
      emailVerified: true,
      approvedAt: new Date(),
      toObject() { return { ...this }; },
    };
    const userMock = {
      findById() {
        return {
          select() {
            return {
              lean: async () => ({
                role: "teacher",
                approvalStatus: "pending",
                emailVerified: true,
              }),
            };
          },
        };
      },
      findOneAndUpdate(filter, update, opts) {
        query = { filter, update, opts };
        return {
          select() {
            return Promise.resolve(doc);
          },
        };
      },
    };
    const adminController = loadAdminController(userMock);
    const res = mockRes();
    await adminController.approveRegistrationRequest(
      { params: { id: "req1" }, user: { _id: "admin1", role: "admin" } },
      res
    );
    assert.equal(res.statusCode, 200);
    assert.equal(query.filter.approvalStatus, "pending");
    assert.equal(query.filter.emailVerified, true);
    assert.equal(query.update.$set.approvalStatus, "approved");
    assert.equal(query.update.$set.isAllowedLogin, true);
    assert.equal(res.body.user.password, undefined);
  });

  it("admin can reject pending registration atomically", async () => {
    let query = null;
    const doc = {
      _id: "req1",
      name: "Teacher Pending",
      email: "teacher.pending@example.com",
      role: "teacher",
      approvalStatus: "rejected",
      isAllowedLogin: false,
      rejectedAt: new Date(),
      rejectionReason: null,
      toObject() { return { ...this }; },
    };
    const userMock = {
      findById() {
        return {
          select() {
            return {
              lean: async () => ({
                role: "teacher",
                approvalStatus: "pending",
                applicationAttempt: 1,
                lastSubmittedAt: new Date(),
                createdAt: new Date(),
              }),
            };
          },
        };
      },
      findOneAndUpdate(filter, update) {
        query = { filter, update };
        return {
          select() {
            return Promise.resolve(doc);
          },
        };
      },
    };
    const adminController = loadAdminController(userMock);
    const res = mockRes();
    await adminController.rejectRegistrationRequest(
      { params: { id: "req1" }, user: { _id: "admin1", role: "admin" }, body: {} },
      res
    );
    assert.equal(res.statusCode, 200);
    assert.equal(query.filter.approvalStatus, "pending");
    assert.equal(query.update.$set.approvalStatus, "rejected");
    assert.equal(query.update.$set.isAllowedLogin, false);
    assert.equal(query.update.$push.applicationHistory.decision, "rejected");
  });

  it("repeated approve on non-pending returns conflict", async () => {
    const userMock = {
      findById() {
        return {
          select() {
            return {
              lean: async () => ({
                role: "teacher",
                approvalStatus: "approved",
                emailVerified: true,
              }),
            };
          },
        };
      },
      findOneAndUpdate() {
        return {
          select() {
            return Promise.resolve(null);
          },
        };
      },
    };
    const adminController = loadAdminController(userMock);
    const res = mockRes();
    await adminController.approveRegistrationRequest(
      { params: { id: "req1" }, user: { _id: "admin1", role: "admin" } },
      res
    );
    assert.equal(res.statusCode, 409);
  });

  it("admin can list pending registration requests without password hashes", async () => {
    const userMock = {
      find: () => ({
        select() {
          return this;
        },
        sort() {
          return this;
        },
        lean: async () => [
          {
            _id: "req1",
            name: "Pending User",
            email: "pending@example.com",
            role: "student",
            approvalStatus: "pending",
            createdAt: new Date(),
            password: "$2a$10$should-not-leak",
          },
        ],
      }),
      countDocuments: async (filter) => {
        if (filter.emailVerified === true) return 1;
        if (filter.emailVerified && filter.emailVerified.$ne === true) return 0;
        return 1;
      },
    };
    const adminController = loadAdminController(userMock);
    const res = mockRes();
    await adminController.listRegistrationRequests(
      { query: { status: "pending" }, user: { role: "admin" } },
      res
    );
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.pendingCount, 1);
    assert.equal(res.body.readyForApprovalCount, 1);
    assert.equal(res.body.totalPendingCount, 1);
    assert.equal(res.body.requests[0].email, "pending@example.com");
    assert.equal(res.body.requests[0].password, undefined);
    assert.equal(res.body.requests[0].emailVerified, false);
  });
});
