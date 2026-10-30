const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("module");
const http = require("node:http");
const { describe, it, beforeEach } = require("node:test");

const root = path.join(__dirname, "..", "..");
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

const {
  verifyEmailWithToken,
  resendVerificationEmail,
  issueEmailVerificationToken,
  hashToken,
  createDefaultDeps,
} = require("../services/emailVerificationService");
const { notifyAdminsOfVerifiedRegistration } = require("../services/registrationNotificationService");
const { getLoginDenialReason, canUserLogin } = require("../utils/authPassword");

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

function installEmailMocks(sendSpy) {
  require.cache[transactionalEmailPath] = {
    id: transactionalEmailPath,
    filename: transactionalEmailPath,
    loaded: true,
    exports: {
      getEmailConfig: () => ({
        configured: true,
        apiKey: "re_test",
        fromEmail: "QuickCheck Hub <noreply@example.com>",
        publicAppUrl: "https://duke.com.pk",
      }),
      sendTransactionalEmail: async (...args) => {
        if (sendSpy) sendSpy(...args);
        return { ok: true };
      },
      buildVerificationLink: (base, token) => `${base}/verify-email?token=${token}`,
      templateSignupVerification: () => ({
        subject: "Verify",
        text: "t",
        html: "h",
      }),
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
      sendSignupVerificationEmail: async () => {
        if (sendSpy) sendSpy();
        return { ok: true };
      },
      verifyEmailWithToken: async () => ({
        ok: true,
        status: 200,
        message: "Email verified successfully. Your account is awaiting Admin approval.",
      }),
      resendVerificationEmail: async () => ({
        ok: true,
        status: 200,
        message:
          "If an unverified registration exists for that email, a new verification link will be sent shortly.",
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
  installEmailMocks();
  require.cache[userPath] = {
    id: userPath,
    filename: userPath,
    loaded: true,
    exports: userMock,
  };
  require.cache[tokenPath] = {
    id: tokenPath,
    filename: tokenPath,
    loaded: true,
    exports: { generateToken: () => "tok" },
  };
  require.cache[rateLimitModelPath] = {
    id: rateLimitModelPath,
    filename: rateLimitModelPath,
    loaded: true,
    exports: {},
  };
  require.cache[rateLimitServicePath] = {
    id: rateLimitServicePath,
    filename: rateLimitServicePath,
    loaded: true,
    exports: {
      assertWithinRateLimit: async () => ({ ok: true }),
      DEFAULT_WINDOW_MS: 900000,
    },
  };
  return require(controllerPath);
}

function loadAdminController(userMock) {
  delete require.cache[adminControllerPath];
  require.cache[userPath] = {
    id: userPath,
    filename: userPath,
    loaded: true,
    exports: userMock,
  };
  require.cache[registrationNotifyPath] = {
    id: registrationNotifyPath,
    filename: registrationNotifyPath,
    loaded: true,
    exports: {
      sendApplicantDecisionEmail: async () => ({ ok: true }),
    },
  };
  return require(adminControllerPath);
}

function memoryTokenStore() {
  const rows = [];
  return {
    rows,
    async updateMany(filter, update) {
      for (const row of rows) {
        if (filter.user && String(row.user) !== String(filter.user)) continue;
        if (filter.usedAt === null && row.usedAt != null) continue;
        Object.assign(row, update.$set || {});
      }
    },
    async create(doc) {
      const row = { ...doc, _id: `t${rows.length + 1}` };
      rows.push(row);
      return row;
    },
    async findOne(filter) {
      return (
        rows.find((row) => {
          if (filter.tokenHash && row.tokenHash !== filter.tokenHash) return false;
          return true;
        }) || null
      );
    },
    async findOneAndUpdate(filter, update, opts) {
      const idx = rows.findIndex((row) => {
        if (filter.tokenHash && row.tokenHash !== filter.tokenHash) return false;
        if (filter.usedAt === null && row.usedAt != null) return false;
        if (filter.expiresAt?.$gt && !(row.expiresAt > filter.expiresAt.$gt)) {
          return false;
        }
        return true;
      });
      if (idx < 0) return null;
      Object.assign(rows[idx], update.$set || {});
      return opts?.new === false ? null : rows[idx];
    },
  };
}

describe("QC-18G duplicate signup guidance", () => {
  it("does not overwrite pending unverified account and guides to resend", async () => {
    let created = false;
    const existing = {
      _id: "u1",
      role: "student",
      approvalStatus: "pending",
      emailVerified: false,
      password: "$2a$10$existinghash",
    };
    const authController = loadAuthController({
      findOne: async () => existing,
      create: async () => {
        created = true;
        throw new Error("must not create");
      },
    });
    const res = mockRes();
    await authController.requestPublicSignup(
      {
        ip: "1.1.1.1",
        body: {
          name: "Other Name",
          email: "dup@example.com",
          password: "NewPass12!",
          role: "teacher",
        },
      },
      res
    );
    assert.equal(created, false);
    assert.equal(existing.password, "$2a$10$existinghash");
    assert.equal(existing.role, "student");
    assert.equal(res.statusCode, 409);
    assert.equal(res.body.code, "PENDING_VERIFICATION");
    assert.match(res.body.message, /verification/i);
  });

  it("guides verified-pending signup retries toward approval wait", async () => {
    const authController = loadAuthController({
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
    await authController.requestPublicSignup(
      {
        ip: "1.1.1.1",
        body: {
          name: "Verified Pending",
          email: "v@example.com",
          password: "StudentPass12!",
          role: "student",
        },
      },
      res
    );
    assert.equal(res.statusCode, 409);
    assert.equal(res.body.code, "PENDING_APPROVAL");
  });

  it("guides approved accounts to login / forgot password", async () => {
    const authController = loadAuthController({
      findOne: async () => ({
        role: "student",
        approvalStatus: "approved",
        emailVerified: true,
        isAllowedLogin: true,
      }),
      create: async () => {
        throw new Error("must not create");
      },
    });
    const res = mockRes();
    await authController.requestPublicSignup(
      {
        ip: "1.1.1.1",
        body: {
          name: "Active User",
          email: "active@example.com",
          password: "StudentPass12!",
          role: "student",
        },
      },
      res
    );
    assert.equal(res.statusCode, 409);
    assert.equal(res.body.code, "ALREADY_REGISTERED");
    assert.match(res.body.message, /Sign in|Forgot Password/i);
  });

  it("preserves rejected state without reactivation via register-request", async () => {
    const existing = {
      _id: "rej1",
      name: "Rejected User",
      email: "rej@example.com",
      role: "teacher",
      approvalStatus: "rejected",
      emailVerified: true,
      rejectionReason: "Incomplete profile",
      reapplicationDisabled: false,
      applicationAttempt: 1,
    };
    let created = false;
    const authController = loadAuthController({
      findOne: async () => existing,
      create: async () => {
        created = true;
        throw new Error("must not create");
      },
    });
    const res = mockRes();
    await authController.requestPublicSignup(
      {
        ip: "1.1.1.1",
        body: {
          name: "Rejected User",
          email: "rej@example.com",
          password: "TeacherPass12!",
          role: "teacher",
        },
      },
      res
    );
    assert.equal(created, false);
    assert.equal(existing.approvalStatus, "rejected");
    assert.equal(res.statusCode, 409);
    assert.equal(res.body.code, "REAPPLICATION_AVAILABLE");
    assert.equal(res.body.reapplication.rejectionReason, "Incomplete profile");
  });

  it("normal signup dispatches verification email once", async () => {
    let sends = 0;
    delete require.cache[controllerPath];
    installEmailMocks(() => {
      sends += 1;
    });
    require.cache[userPath] = {
      id: userPath,
      filename: userPath,
      loaded: true,
      exports: {
        findOne: async () => null,
        countDocuments: async () => 0,
        create: async (payload) => ({ ...payload, _id: "n1" }),
      },
    };
    require.cache[tokenPath] = {
      id: tokenPath,
      filename: tokenPath,
      loaded: true,
      exports: { generateToken: () => "tok" },
    };
    require.cache[rateLimitServicePath] = {
      id: rateLimitServicePath,
      filename: rateLimitServicePath,
      loaded: true,
      exports: {
        assertWithinRateLimit: async () => ({ ok: true }),
        DEFAULT_WINDOW_MS: 900000,
      },
    };
    const authController = require(controllerPath);
    const res = mockRes();
    await authController.requestPublicSignup(
      {
        ip: "2.2.2.2",
        body: {
          name: "Once",
          email: "once@example.com",
          password: "StudentPass12!",
          role: "student",
        },
      },
      res
    );
    assert.equal(res.statusCode, 201);
    assert.equal(sends, 1);
  });
});

describe("QC-18G verification tokens and dual-gate", () => {
  it("blocks login for pending unverified and verified-unapproved users", () => {
    assert.equal(
      canUserLogin({
        emailVerified: false,
        approvalStatus: "pending",
        isAllowedLogin: false,
      }),
      false
    );
    assert.match(
      getLoginDenialReason({
        emailVerified: true,
        approvalStatus: "pending",
        isAllowedLogin: false,
      }),
      /pending Admin approval/i
    );
  });

  it("allows login only when verified + approved", () => {
    assert.equal(
      canUserLogin({
        emailVerified: true,
        approvalStatus: "approved",
        isAllowedLogin: true,
      }),
      true
    );
  });

  it("replay of used token after verify succeeds idempotently without Admin re-notify", async () => {
    const tokens = memoryTokenStore();
    let notifyCount = 0;
    const userDoc = {
      _id: "u9",
      email: "replay@example.com",
      role: "student",
      approvalStatus: "pending",
      emailVerified: false,
      emailVerifiedAt: null,
      adminNotifiedAt: null,
    };
    const chainSelect = (doc) => ({
      select() {
        return Promise.resolve({ ...doc });
      },
    });
    const deps = {
      EmailVerificationToken: tokens,
      User: {
        // Mongoose-style: findOneAndUpdate(...).select(...) then await
        findOneAndUpdate: (_filter, update) => {
          Object.assign(userDoc, update.$set || {});
          return chainSelect(userDoc);
        },
        findById: (id) => {
          if (String(id) !== userDoc._id) return null;
          return chainSelect(userDoc);
        },
        findOne: async () => null,
      },
      notifyAdminsOfVerifiedRegistration: async () => {
        notifyCount += 1;
        return { notified: true };
      },
      now: () => new Date("2026-10-13T00:00:00Z"),
      getEmailConfig: () => ({ configured: false }),
      sendTransactionalEmail: async () => ({ ok: false }),
      env: process.env,
      fetchImpl: globalThis.fetch,
    };

    const issued = await issueEmailVerificationToken(userDoc, deps);
    const first = await verifyEmailWithToken(issued.rawToken, deps);
    assert.equal(first.ok, true);
    assert.equal(notifyCount, 1);

    const second = await verifyEmailWithToken(issued.rawToken, deps);
    assert.equal(second.ok, true);
    assert.equal(second.alreadyVerified, true);
    assert.equal(notifyCount, 1);
  });

  it("resend targets legacy pending users with missing emailVerified", async () => {
    let issued = 0;
    const deps = {
      ...createDefaultDeps(),
      getEmailConfig: () => ({
        configured: true,
        apiKey: "re_test",
        fromEmail: "QuickCheck Hub <noreply@duke.com.pk>",
        publicAppUrl: "https://duke.com.pk",
      }),
      AuthRateLimit: {},
      User: {
        async findOne(filter) {
          assert.deepEqual(filter.emailVerified, { $ne: true });
          return {
            _id: "legacy1",
            email: "student1@quickcheck.test",
            name: "Legacy",
            role: "student",
            approvalStatus: "pending",
          };
        },
      },
      EmailVerificationToken: memoryTokenStore(),
      sendTransactionalEmail: async () => {
        issued += 1;
        return { ok: true };
      },
      now: () => new Date(),
    };
    // Bypass rate limit helper by stubbing via module path is heavy; call with
    // injected assert by temporarily replacing — use real assertWithinRateLimit
    // through a thin AuthRateLimit mock that always allows.
    const AuthRateLimit = {
      findOneAndUpdate: async () => ({ count: 1 }),
    };
    deps.AuthRateLimit = AuthRateLimit;

    const result = await resendVerificationEmail(
      { email: "student1@quickcheck.test", ip: "9.9.9.9" },
      deps
    );
    assert.equal(result.status, 200);
    assert.equal(issued, 1);
  });
});

describe("QC-18G admin registration counts and legacy verification display", () => {
  it("returns distinct pending counters and never fabricates verified", async () => {
    const counts = [];
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
            _id: "a",
            name: "Verified Pending",
            email: "v@example.com",
            role: "student",
            approvalStatus: "pending",
            emailVerified: true,
            createdAt: new Date(),
          },
          {
            _id: "b",
            name: "Legacy Pending",
            email: "student1@quickcheck.test",
            role: "student",
            approvalStatus: "pending",
            // missing emailVerified
            createdAt: new Date(),
          },
          {
            _id: "c",
            name: "Unverified",
            email: "u@example.com",
            role: "student",
            approvalStatus: "pending",
            emailVerified: false,
            createdAt: new Date(),
          },
        ],
      }),
      countDocuments: async (filter) => {
        counts.push(filter);
        if (filter.emailVerified === true) return 1;
        if (filter.emailVerified && filter.emailVerified.$ne === true) return 2;
        return 3;
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
    assert.equal(res.body.awaitingVerificationCount, 2);
    assert.equal(res.body.totalPendingCount, 3);
    const legacy = res.body.requests.find((r) => r.email === "student1@quickcheck.test");
    assert.equal(legacy.emailVerified, false);
    assert.equal(counts.length, 3);
  });
});

describe("QC-18G Admin notification idempotency", () => {
  it("notifies Admin once per qualifying registration", async () => {
    let notifications = 0;
    let emails = 0;
    let notifiedAt = null;
    const user = {
      _id: "app1",
      name: "Applicant",
      email: "app@example.com",
      role: "student",
      approvalStatus: "pending",
      emailVerified: true,
      createdAt: new Date(),
      adminNotifiedAt: null,
    };
    const deps = {
      User: {
        findOneAndUpdate: (filter, update) => {
          if (notifiedAt) {
            return {
              select() {
                return Promise.resolve(null);
              },
            };
          }
          if (filter.emailVerified !== true) {
            return {
              select() {
                return Promise.resolve(null);
              },
            };
          }
          notifiedAt = update.$set.adminNotifiedAt;
          const doc = { ...user, adminNotifiedAt: notifiedAt };
          return {
            select() {
              return Promise.resolve(doc);
            },
          };
        },
        find: () => ({
          select() {
            return this;
          },
          lean: async () => [{ _id: "admin1", email: "rabeelramzan50@gmail.com", name: "Rabeel" }],
        }),
      },
      Notification: { create: async () => ({}) },
      createNotification: async () => {
        notifications += 1;
      },
      getEmailConfig: () => ({
        configured: true,
        publicAppUrl: "https://duke.com.pk",
        apiKey: "x",
        fromEmail: "QuickCheck Hub <noreply@duke.com.pk>",
      }),
      sendTransactionalEmail: async () => {
        emails += 1;
        return { ok: true };
      },
      env: process.env,
      now: () => new Date(),
      fetchImpl: async () => ({ ok: true, json: async () => ({}) }),
    };
    const first = await notifyAdminsOfVerifiedRegistration(user, deps);
    const second = await notifyAdminsOfVerifiedRegistration(user, deps);
    assert.equal(first.notified, true);
    assert.equal(second.notified, false);
    assert.equal(notifications, 1);
    assert.equal(emails, 1);
  });
});

describe("QC-18G health + branding contracts", () => {
  it("exposes /api/health and /health JSON in appFull before SPA", () => {
    const src = fs.readFileSync(path.join(root, "backend", "appFull.js"), "utf8");
    assert.match(src, /app\.get\("\/api\/health"/);
    assert.match(src, /app\.get\("\/health"/);
    const healthIdx = src.indexOf('app.get("/health"');
    const staticIdx = src.indexOf("express.static(frontendDist)");
    assert.ok(healthIdx > 0 && staticIdx > healthIdx);
  });

  it("Admin and Teacher dashboards use QuickCheck Hub branding", () => {
    const admin = fs.readFileSync(
      path.join(root, "frontend", "src", "pages", "dashboards", "AdminDashboard.jsx"),
      "utf8"
    );
    const teacher = fs.readFileSync(
      path.join(root, "frontend", "src", "pages", "dashboards", "TeacherDashboard.jsx"),
      "utf8"
    );
    assert.match(admin, /QuickCheck Hub/);
    assert.doesNotMatch(admin, /EDUCORRE HQ/);
    assert.match(teacher, /QuickCheck Hub/);
    assert.doesNotMatch(teacher, /EDUCORRE/);
  });

  it("signup and verify UI include resend guidance without duplicate success alert text", () => {
    const signup = fs.readFileSync(
      path.join(root, "frontend", "src", "pages", "authentication", "PublicSignup.jsx"),
      "utf8"
    );
    const verify = fs.readFileSync(
      path.join(root, "frontend", "src", "pages", "authentication", "VerifyEmail.jsx"),
      "utf8"
    );
    assert.match(signup, /PENDING_VERIFICATION|Resend Verification/);
    assert.match(signup, /submitLock/);
    assert.match(verify, /status !== "success"/);
    assert.match(verify, /verifyStarted/);
  });

  it("notification mark-one-read route exists", () => {
    const routes = fs.readFileSync(
      path.join(root, "backend", "routes", "notificationRoutes.js"),
      "utf8"
    );
    assert.match(routes, /:id\/read/);
  });
});
