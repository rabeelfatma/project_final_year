/**
 * QC-23 — Registration reapplication / resubmission (isolated mocks; no Atlas / no live email).
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("module");
const { describe, it, beforeEach } = require("node:test");

const root = path.join(__dirname, "..", "..");
const userModelPath = path.join(root, "backend", "models", "User.js");
const authRoutesPath = path.join(root, "backend", "routes", "authRoutes.js");
const adminRoutesPath = path.join(root, "backend", "routes", "adminRoutes.js");
const publicSignupPath = path.join(
  root,
  "frontend",
  "src",
  "pages",
  "authentication",
  "PublicSignup.jsx"
);
const adminDashPath = path.join(
  root,
  "frontend",
  "src",
  "pages",
  "dashboards",
  "AdminDashboard.jsx"
);
const registrationUtilPath = path.resolve(
  __dirname,
  "../utils/registrationApplication.js"
);
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
const authPasswordPath = path.resolve(__dirname, "../utils/authPassword.js");

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

function installEmailMocks({ sendOk = true } = {}) {
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
      sendTransactionalEmail: async () =>
        sendOk ? { ok: true } : { ok: false, code: "EMAIL_PROVIDER_ERROR" },
    },
  };
  require.cache[emailVerificationPath] = {
    id: emailVerificationPath,
    filename: emailVerificationPath,
    loaded: true,
    exports: {
      issueEmailVerificationToken: async () => ({
        rawToken: "b".repeat(64),
        expiresHours: 24,
      }),
      sendSignupVerificationEmail: async () =>
        sendOk
          ? { ok: true }
          : { ok: false, code: "EMAIL_PROVIDER_ERROR", message: "provider failed" },
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

function loadAuthController(userMock, { sendOk = true } = {}) {
  delete require.cache[controllerPath];
  delete require.cache[userPath];
  delete require.cache[tokenPath];
  delete require.cache[authPasswordPath];
  delete require.cache[registrationUtilPath];
  delete require.cache[rateLimitModelPath];
  delete require.cache[rateLimitServicePath];
  installEmailMocks({ sendOk });

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
  delete require.cache[authPasswordPath];
  delete require.cache[registrationUtilPath];
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

function rejectedStudentDoc(overrides = {}) {
  const history = overrides.applicationHistory || [
    {
      attempt: 1,
      submittedAt: new Date("2026-01-01T00:00:00Z"),
      decidedAt: new Date("2026-01-02T00:00:00Z"),
      decision: "rejected",
      rejectionReason: "Incomplete name",
      decidedBy: "admin1",
    },
  ];
  return {
    _id: "user-rej-1",
    name: "Old Name",
    email: "rej@example.com",
    password: "$2a$10$existinghashxxxxxxxxxxxxxx",
    role: "student",
    registrationNumber: "SP26-BCS-001",
    approvalStatus: "rejected",
    isAllowedLogin: false,
    emailVerified: true,
    emailVerifiedAt: new Date("2026-01-01T12:00:00Z"),
    rejectionReason: "Incomplete name",
    reapplicationDisabled: false,
    applicationAttempt: 1,
    lastSubmittedAt: new Date("2026-01-01T00:00:00Z"),
    applicationHistory: history,
    pendingEmail: null,
    previousName: null,
    previousEmail: null,
    previousRole: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    save: async function save() {
      return this;
    },
    toObject() {
      return { ...this };
    },
    ...overrides,
  };
}

describe("QC-23 schema and route contracts", () => {
  it("User model includes reapplication fields", () => {
    const src = fs.readFileSync(userModelPath, "utf8");
    assert.match(src, /rejectionReason/);
    assert.match(src, /reapplicationDisabled/);
    assert.match(src, /applicationAttempt/);
    assert.match(src, /applicationHistory/);
    assert.match(src, /lastSubmittedAt/);
    assert.match(src, /pendingEmail/);
    assert.match(src, /previousName/);
    assert.match(src, /previousEmail/);
    assert.match(src, /previousRole/);
  });

  it("auth and admin routes expose reapply + reject endpoints", () => {
    const authRoutes = fs.readFileSync(authRoutesPath, "utf8");
    const adminRoutes = fs.readFileSync(adminRoutesPath, "utf8");
    assert.match(authRoutes, /\/reapply/);
    assert.match(authRoutes, /reapplyPublicSignup/);
    assert.match(adminRoutes, /rejectRegistrationRequest/);
    assert.match(adminRoutes, /authorize\('admin'\)/);
  });

  it("frontend signup and admin UI expose reapplication UX", () => {
    const signup = fs.readFileSync(publicSignupPath, "utf8");
    const admin = fs.readFileSync(adminDashPath, "utf8");
    assert.match(signup, /REAPPLICATION_AVAILABLE/);
    assert.match(signup, /Resubmit Registration Request/);
    assert.match(signup, /Registration Request Declined/);
    assert.match(signup, /\/auth\/reapply/);
    assert.match(signup, /accountEmail/);
    assert.match(
      signup,
      /Password must be 8\+ characters with uppercase, lowercase, number & special character/
    );
    assert.doesNotMatch(signup, /PASSWORD_REQUIREMENTS\.map/);
    assert.match(admin, /REAPPLIED|Reapplied/);
    assert.match(admin, /rejectPermanent|permanent/);
    assert.match(admin, /applicationHistory/);
    assert.match(admin, /previousName/);
    assert.match(admin, /previousEmail/);
    assert.match(admin, /previousRole/);
  });

  it("frontend hides Submit for pending/approved/permanent status panels", () => {
    const signup = fs.readFileSync(publicSignupPath, "utf8");
    assert.match(signup, /BLOCKING_STATUS_CODES/);
    assert.match(signup, /PENDING_VERIFICATION/);
    assert.match(signup, /PENDING_APPROVAL/);
    assert.match(signup, /ALREADY_REGISTERED/);
    assert.match(signup, /REGISTRATION_PERMANENTLY_REJECTED/);
    assert.match(signup, /Email Verification Required/);
    assert.match(signup, /Awaiting Administrator Approval/);
    assert.match(signup, /showBlockingStatusPanel/);
    assert.match(signup, /data-signup-status=\{conflictCode\}/);
    // Blocking panel must offer Resend, not keep Submit Registration Request visible.
    assert.match(signup, /Resend Verification Email/);
    // Guard: submit handler must refuse blocking codes.
    assert.match(signup, /if \(BLOCKING_STATUS_CODES\.has\(conflictCode\)\) return/);
  });
});

describe("QC-23 registrationApplication helpers", () => {
  it("sanitizes rejection reasons and builds admin projection", () => {
    const {
      sanitizeRejectionReason,
      toPublicReapplicationInfo,
      toAdminRegistrationRequest,
    } = require(registrationUtilPath);

    assert.equal(sanitizeRejectionReason("  Fix your name  "), "Fix your name");
    assert.equal(sanitizeRejectionReason("x".repeat(600)).length, 500);
    assert.equal(sanitizeRejectionReason(null), null);

    const user = {
      _id: "u1",
      name: "Ada",
      email: "ada@example.com",
      role: "student",
      approvalStatus: "rejected",
      rejectionReason: "Bad docs",
      applicationAttempt: 2,
      lastSubmittedAt: new Date("2026-02-01"),
      createdAt: new Date("2026-01-01"),
      emailVerified: true,
      applicationHistory: [
        {
          attempt: 1,
          decision: "rejected",
          rejectionReason: "Bad docs",
          submittedAt: new Date("2026-01-01"),
          decidedAt: new Date("2026-01-02"),
        },
      ],
    };

    const pub = toPublicReapplicationInfo(user);
    assert.equal(pub.email, "ada@example.com");
    assert.equal(pub.rejectionReason, "Bad docs");
    assert.equal(pub.password, undefined);

    const adminView = toAdminRegistrationRequest(user);
    assert.equal(adminView.reapplied, true);
    assert.equal(adminView.applicationAttempt, 2);
    assert.equal(adminView.password, undefined);
    assert.equal(adminView.applicationHistory.length, 1);
  });
});

describe("QC-23 public signup + reapplication (mocked)", () => {
  let createdPayload = null;

  beforeEach(() => {
    createdPayload = null;
  });

  it("1. new user registration creates pending account without duplicate", async () => {
    const auth = loadAuthController({
      findOne: async () => null,
      countDocuments: async () => 0,
      create: async (payload) => {
        createdPayload = payload;
        return { ...payload, _id: "new1" };
      },
    });
    const res = mockRes();
    await auth.requestPublicSignup(
      {
        ip: "10.0.0.1",
        body: {
          name: "New Student",
          email: "new@example.com",
          password: "StudentPass12!",
          role: "student",
        },
      },
      res
    );
    assert.equal(res.statusCode, 201);
    assert.equal(createdPayload.approvalStatus, "pending");
    assert.equal(createdPayload.applicationAttempt, 1);
    assert.ok(createdPayload.lastSubmittedAt);
    assert.deepEqual(createdPayload.applicationHistory, []);
    assert.equal(res.body.token, undefined);
  });

  it("2-7. rejected user reapplication reuses document, preserves history, sets pending", async () => {
    const doc = rejectedStudentDoc();
    const originalId = doc._id;
    const historyBefore = doc.applicationHistory.length;
    let created = 0;

    const auth = loadAuthController({
      findOne: async () => doc,
      countDocuments: async () => 0,
      create: async () => {
        created += 1;
        throw new Error("must not create");
      },
    });

    const probe = mockRes();
    await auth.requestPublicSignup(
      {
        ip: "10.0.0.2",
        body: {
          name: "Hacker",
          email: "rej@example.com",
          password: "StudentPass12!",
          role: "teacher",
        },
      },
      probe
    );
    assert.equal(probe.statusCode, 409);
    assert.equal(probe.body.code, "REAPPLICATION_AVAILABLE");
    assert.equal(probe.body.reapplication.rejectionReason, "Incomplete name");
    assert.equal(created, 0);
    assert.equal(doc.approvalStatus, "rejected");

    const res = mockRes();
    await auth.reapplyPublicSignup(
      {
        ip: "10.0.0.2",
        body: {
          name: "Corrected Name",
          email: "rej@example.com",
          accountEmail: "rej@example.com",
          password: "StudentPass99!",
          confirmPassword: "StudentPass99!",
          role: "student",
          approvalStatus: "approved",
          emailVerified: true,
          reapplicationDisabled: false,
        },
      },
      res
    );

    assert.equal(res.statusCode, 200);
    assert.match(res.body.message, /resubmitted successfully/i);
    assert.equal(created, 0);
    assert.equal(doc._id, originalId);
    assert.equal(doc.name, "Corrected Name");
    assert.equal(doc.previousName, "Old Name");
    assert.equal(doc.previousEmail, "rej@example.com");
    assert.equal(doc.role, "student");
    assert.equal(doc.approvalStatus, "pending");
    assert.equal(doc.isAllowedLogin, false);
    assert.equal(doc.emailVerified, false);
    assert.equal(doc.rejectionReason, null);
    assert.equal(doc.applicationAttempt, 2);
    assert.equal(doc.applicationHistory.length, historyBefore);
    assert.equal(doc.applicationHistory[0].rejectionReason, "Incomplete name");
    assert.match(doc.password, /^\$2[aby]?\$/);
    assert.notEqual(doc.password, "$2a$10$existinghashxxxxxxxxxxxxxx");
    assert.doesNotMatch(JSON.stringify(doc.applicationHistory), /StudentPass/);
  });

  it("4. duplicate email for pending is prevented", async () => {
    const auth = loadAuthController({
      findOne: async () => ({
        role: "student",
        approvalStatus: "pending",
        emailVerified: true,
      }),
      create: async () => {
        throw new Error("must not create");
      },
    });
    const res = mockRes();
    await auth.requestPublicSignup(
      {
        ip: "10.0.0.3",
        body: {
          name: "Dup",
          email: "pending@example.com",
          password: "StudentPass12!",
          role: "student",
        },
      },
      res
    );
    assert.equal(res.statusCode, 409);
    assert.equal(res.body.code, "PENDING_APPROVAL");
  });

  it("11. permanent rejection prevents reapplication", async () => {
    const doc = rejectedStudentDoc({ reapplicationDisabled: true });
    const auth = loadAuthController({
      findOne: async () => doc,
      create: async () => {
        throw new Error("must not create");
      },
    });

    const probe = mockRes();
    await auth.requestPublicSignup(
      {
        ip: "10.0.0.4",
        body: {
          name: "Blocked User",
          email: "rej@example.com",
          password: "StudentPass12!",
          role: "student",
        },
      },
      probe
    );
    assert.equal(probe.statusCode, 409);
    assert.equal(probe.body.code, "REGISTRATION_PERMANENTLY_REJECTED");

    const res = mockRes();
    await auth.reapplyPublicSignup(
      {
        ip: "10.0.0.4",
        body: {
          name: "Blocked User",
          email: "rej@example.com",
          accountEmail: "rej@example.com",
          password: "StudentPass12!",
          confirmPassword: "StudentPass12!",
          role: "student",
        },
      },
      res
    );
    assert.equal(res.statusCode, 409);
    assert.equal(res.body.code, "REGISTRATION_PERMANENTLY_REJECTED");
    assert.equal(doc.approvalStatus, "rejected");
  });

  it("12. approved user cannot reapply", async () => {
    const auth = loadAuthController({
      findOne: async () => ({
        _id: "ok1",
        role: "student",
        approvalStatus: "approved",
        emailVerified: true,
        save: async () => {
          throw new Error("must not save");
        },
      }),
    });
    const res = mockRes();
    await auth.reapplyPublicSignup(
      {
        ip: "10.0.0.5",
        body: {
          name: "Ok",
          email: "ok@example.com",
          accountEmail: "ok@example.com",
          password: "StudentPass12!",
          confirmPassword: "StudentPass12!",
          role: "student",
        },
      },
      res
    );
    assert.equal(res.statusCode, 409);
    assert.equal(res.body.code, "ALREADY_REGISTERED");
  });

  it("13. pending user cannot create duplicate via reapply", async () => {
    const auth = loadAuthController({
      findOne: async () => ({
        role: "teacher",
        approvalStatus: "pending",
        emailVerified: false,
        save: async () => {
          throw new Error("must not save");
        },
      }),
    });
    const res = mockRes();
    await auth.reapplyPublicSignup(
      {
        ip: "10.0.0.6",
        body: {
          name: "Pending",
          email: "p@example.com",
          accountEmail: "p@example.com",
          password: "TeacherPass12!",
          confirmPassword: "TeacherPass12!",
          role: "teacher",
        },
      },
      res
    );
    assert.equal(res.statusCode, 409);
    assert.equal(res.body.code, "PENDING_VERIFICATION");
  });

  it("14. Teacher-to-Student and Student-to-Teacher role changes allowed on reapply", async () => {
    const doc = rejectedStudentDoc({ role: "student" });
    const auth = loadAuthController({
      findOne: async (query) => {
        if (query && query.$or) return null;
        if (query && query._id && query._id.$ne) return null;
        return doc;
      },
      countDocuments: async () => 0,
    });
    const res = mockRes();
    await auth.reapplyPublicSignup(
      {
        ip: "10.0.0.7",
        body: {
          name: "Corrected",
          email: "rej@example.com",
          accountEmail: "rej@example.com",
          password: "StudentPass12!",
          confirmPassword: "StudentPass12!",
          role: "teacher",
        },
      },
      res
    );
    assert.equal(res.statusCode, 200);
    assert.equal(doc.role, "teacher");
    assert.equal(doc.previousRole, "student");
    assert.equal(doc.approvalStatus, "pending");
    assert.equal(doc._id, "user-rej-1");
  });

  it("14b. Admin role cannot be selected during reapplication", async () => {
    const doc = rejectedStudentDoc();
    const auth = loadAuthController({
      findOne: async () => doc,
    });
    const res = mockRes();
    await auth.reapplyPublicSignup(
      {
        ip: "10.0.0.71",
        body: {
          name: "Corrected",
          email: "rej@example.com",
          accountEmail: "rej@example.com",
          password: "StudentPass12!",
          confirmPassword: "StudentPass12!",
          role: "admin",
        },
      },
      res
    );
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.code, "ADMIN_ROLE_FORBIDDEN");
    assert.equal(doc.role, "student");
    assert.equal(doc.approvalStatus, "rejected");
  });

  it("14c. email change stores pendingEmail without changing User id", async () => {
    const doc = rejectedStudentDoc();
    const auth = loadAuthController({
      findOne: async (query) => {
        if (query && (query.$or || (query._id && query._id.$ne))) return null;
        return doc;
      },
      countDocuments: async () => 0,
    });
    const res = mockRes();
    await auth.reapplyPublicSignup(
      {
        ip: "10.0.0.72",
        body: {
          name: "New Name",
          email: "newrej@example.com",
          accountEmail: "rej@example.com",
          password: "StudentPass12!",
          confirmPassword: "StudentPass12!",
          role: "student",
        },
      },
      res
    );
    assert.equal(res.statusCode, 200);
    assert.equal(doc._id, "user-rej-1");
    assert.equal(doc.email, "rej@example.com");
    assert.equal(doc.pendingEmail, "newrej@example.com");
    assert.equal(doc.previousEmail, "rej@example.com");
    assert.equal(doc.emailVerified, false);
    assert.equal(doc.approvalStatus, "pending");
  });

  it("14d. duplicate target email is rejected", async () => {
    const doc = rejectedStudentDoc();
    const auth = loadAuthController({
      findOne: async (query) => {
        if (query && query.$or) {
          return { _id: "other", email: "taken@example.com" };
        }
        return doc;
      },
    });
    const res = mockRes();
    await auth.reapplyPublicSignup(
      {
        ip: "10.0.0.73",
        body: {
          name: "New Name",
          email: "taken@example.com",
          accountEmail: "rej@example.com",
          password: "StudentPass12!",
          confirmPassword: "StudentPass12!",
          role: "student",
        },
      },
      res
    );
    assert.equal(res.statusCode, 409);
    assert.equal(res.body.code, "EMAIL_IN_USE");
    assert.equal(doc.approvalStatus, "rejected");
  });

  it("14e. password confirmation mismatch is rejected", async () => {
    const doc = rejectedStudentDoc();
    const auth = loadAuthController({
      findOne: async () => doc,
    });
    const res = mockRes();
    await auth.reapplyPublicSignup(
      {
        ip: "10.0.0.74",
        body: {
          name: "Corrected",
          email: "rej@example.com",
          accountEmail: "rej@example.com",
          password: "StudentPass12!",
          confirmPassword: "StudentPass99!",
          role: "student",
        },
      },
      res
    );
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.code, "PASSWORD_MISMATCH");
    assert.equal(doc.approvalStatus, "rejected");
  });

  it("15. user cannot modify admin approval fields via reapply body", async () => {
    const doc = rejectedStudentDoc();
    const auth = loadAuthController({
      findOne: async () => doc,
    });
    const res = mockRes();
    await auth.reapplyPublicSignup(
      {
        ip: "10.0.0.8",
        body: {
          name: "Corrected Name",
          email: "rej@example.com",
          accountEmail: "rej@example.com",
          password: "StudentPass12!",
          confirmPassword: "StudentPass12!",
          role: "student",
          approvalStatus: "approved",
          isAllowedLogin: true,
          emailVerified: true,
          reapplicationDisabled: false,
          applicationAttempt: 99,
        },
      },
      res
    );
    assert.equal(res.statusCode, 200);
    assert.equal(doc.approvalStatus, "pending");
    assert.equal(doc.isAllowedLogin, false);
    assert.equal(doc.emailVerified, false);
    assert.equal(doc.applicationAttempt, 2);
    assert.equal(doc.reapplicationDisabled, false);
  });

  it("17-18. email verification required; provider failure does not claim verified success", async () => {
    const doc = rejectedStudentDoc();
    const auth = loadAuthController(
      {
        findOne: async () => doc,
      },
      { sendOk: false }
    );
    const res = mockRes();
    await auth.reapplyPublicSignup(
      {
        ip: "10.0.0.9",
        body: {
          name: "Corrected Name",
          email: "rej@example.com",
          accountEmail: "rej@example.com",
          password: "StudentPass12!",
          confirmPassword: "StudentPass12!",
          role: "student",
        },
      },
      res
    );
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.verificationEmailSent, false);
    assert.equal(res.body.code, "VERIFICATION_EMAIL_FAILED");
    assert.equal(doc.emailVerified, false);
    assert.equal(doc.approvalStatus, "pending");
    assert.doesNotMatch(res.body.message || "", /verified successfully/i);
  });
});

describe("QC-23 admin review of reapplied requests (mocked)", () => {
  it("8. admin list includes reapplied badge fields and history", async () => {
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
            _id: "r1",
            name: "Reapplied User",
            email: "re@example.com",
            role: "student",
            approvalStatus: "pending",
            emailVerified: true,
            createdAt: new Date("2026-01-01"),
            lastSubmittedAt: new Date("2026-02-01"),
            applicationAttempt: 2,
            rejectionReason: null,
            applicationHistory: [
              {
                attempt: 1,
                decision: "rejected",
                rejectionReason: "Fix name",
                submittedAt: new Date("2026-01-01"),
                decidedAt: new Date("2026-01-02"),
              },
            ],
            password: "$2a$10$secret",
          },
        ],
      }),
      countDocuments: async () => 1,
    };
    const admin = loadAdminController(userMock);
    const res = mockRes();
    await admin.listRegistrationRequests({ query: { status: "pending" } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.requests[0].reapplied, true);
    assert.equal(res.body.requests[0].applicationAttempt, 2);
    assert.equal(res.body.requests[0].previousRejectionReason, "Fix name");
    assert.equal(res.body.requests[0].password, undefined);
    assert.doesNotMatch(JSON.stringify(res.body), /\$2a\$10\$secret/);
  });

  it("9. admin can approve a reapplied request and record history", async () => {
    let query = null;
    const userMock = {
      findById() {
        return {
          select() {
            return {
              lean: async () => ({
                role: "student",
                approvalStatus: "pending",
                emailVerified: true,
                applicationAttempt: 2,
                lastSubmittedAt: new Date("2026-02-01"),
                createdAt: new Date("2026-01-01"),
              }),
            };
          },
        };
      },
      findOneAndUpdate(filter, update, opts) {
        query = { filter, update, opts };
        return {
          select() {
            return Promise.resolve({
              _id: "r1",
              name: "Reapplied User",
              email: "re@example.com",
              role: "student",
              approvalStatus: "approved",
              isAllowedLogin: true,
              emailVerified: true,
              applicationAttempt: 2,
              toObject() {
                return { ...this };
              },
            });
          },
        };
      },
    };
    const admin = loadAdminController(userMock);
    const res = mockRes();
    await admin.approveRegistrationRequest(
      { params: { id: "r1" }, user: { _id: "admin1", role: "admin" } },
      res
    );
    assert.equal(res.statusCode, 200);
    assert.equal(query.update.$set.approvalStatus, "approved");
    assert.equal(query.update.$push.applicationHistory.decision, "approved");
    assert.equal(query.update.$push.applicationHistory.attempt, 2);
  });

  it("10. admin can reject a reapplied request again with reason", async () => {
    let query = null;
    const userMock = {
      findById() {
        return {
          select() {
            return {
              lean: async () => ({
                role: "teacher",
                approvalStatus: "pending",
                applicationAttempt: 2,
                lastSubmittedAt: new Date("2026-02-01"),
                createdAt: new Date("2026-01-01"),
              }),
            };
          },
        };
      },
      findOneAndUpdate(filter, update) {
        query = { filter, update };
        return {
          select() {
            return Promise.resolve({
              _id: "r2",
              name: "Teacher",
              email: "t@example.com",
              role: "teacher",
              approvalStatus: "rejected",
              rejectionReason: "Still incomplete",
              reapplicationDisabled: false,
              toObject() {
                return { ...this };
              },
            });
          },
        };
      },
    };
    const admin = loadAdminController(userMock);
    const res = mockRes();
    await admin.rejectRegistrationRequest(
      {
        params: { id: "r2" },
        user: { _id: "admin1", role: "admin" },
        body: { reason: "Still incomplete", permanent: false },
      },
      res
    );
    assert.equal(res.statusCode, 200);
    assert.equal(query.update.$set.approvalStatus, "rejected");
    assert.equal(query.update.$set.rejectionReason, "Still incomplete");
    assert.equal(query.update.$set.reapplicationDisabled, false);
    assert.equal(query.update.$push.applicationHistory.decision, "rejected");
    assert.equal(
      query.update.$push.applicationHistory.rejectionReason,
      "Still incomplete"
    );
  });

  it("permanent reject sets reapplicationDisabled", async () => {
    let query = null;
    const userMock = {
      findById() {
        return {
          select() {
            return {
              lean: async () => ({
                role: "student",
                approvalStatus: "pending",
                applicationAttempt: 1,
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
            return Promise.resolve({
              approvalStatus: "rejected",
              reapplicationDisabled: true,
              toObject() {
                return { ...this };
              },
            });
          },
        };
      },
    };
    const admin = loadAdminController(userMock);
    const res = mockRes();
    await admin.rejectRegistrationRequest(
      {
        params: { id: "r3" },
        user: { _id: "admin1" },
        body: { reason: "Fraud", permanent: true },
      },
      res
    );
    assert.equal(query.update.$set.reapplicationDisabled, true);
    assert.match(res.body.message, /permanently rejected/i);
  });

  it("16. non-admin cannot use admin registration routes (contract)", () => {
    const adminRoutes = fs.readFileSync(adminRoutesPath, "utf8");
    assert.match(adminRoutes, /router\.use\(protect,\s*authorize\('admin'\)\)/);
  });
});
