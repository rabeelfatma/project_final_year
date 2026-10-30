/**
 * Isolated signup/email/password validation + email-config contracts.
 * No MongoDB, no real Resend calls, no production DB.
 */
const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const path = require("path");

const {
  validateEmailInput,
  normalizeEmail,
  isValidEmailFormat,
} = require("../utils/emailValidation");
const {
  validatePasswordInput,
  validateLoginPasswordInput,
  hashPassword,
  passwordsMatch,
  toPublicUser,
  getLoginDenialReason,
  MIN_PASSWORD_LENGTH,
} = require("../utils/authPassword");
const { getEmailConfig } = require("../services/transactionalEmail");
const {
  resendVerificationEmail,
  issueEmailVerificationToken,
  verifyEmailWithToken,
} = require("../services/emailVerificationService");

const controllerPath = path.resolve(__dirname, "../controllers/authController.js");
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

function installSignupMocks({ emailConfigured = true, sendOk = true } = {}) {
  require.cache[transactionalEmailPath] = {
    id: transactionalEmailPath,
    filename: transactionalEmailPath,
    loaded: true,
    exports: {
      getEmailConfig: () => ({
        configured: emailConfigured,
        apiKey: emailConfigured ? "re_test" : "",
        fromEmail: emailConfigured ? "QuickCheck Hub <noreply@example.com>" : "",
        publicAppUrl: emailConfigured ? "https://app.example.com" : "",
      }),
      sendTransactionalEmail: async () =>
        sendOk
          ? { ok: true }
          : { ok: false, code: "EMAIL_PROVIDER_ERROR", message: "fail" },
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
      sendSignupVerificationEmail: async () =>
        sendOk
          ? { ok: true }
          : { ok: false, code: "EMAIL_PROVIDER_ERROR", message: "fail" },
      verifyEmailWithToken: async () => ({
        ok: true,
        status: 200,
        message: "ok",
      }),
      resendVerificationEmail: async () => ({
        ok: true,
        status: 200,
        message: "If an unverified registration exists...",
      }),
      createDefaultDeps: () => ({}),
    },
  };
  require.cache[rateLimitServicePath] = {
    id: rateLimitServicePath,
    filename: rateLimitServicePath,
    loaded: true,
    exports: {
      assertWithinRateLimit: async () => ({ ok: true }),
      DEFAULT_WINDOW_MS: 60_000,
    },
  };
  require.cache[rateLimitModelPath] = {
    id: rateLimitModelPath,
    filename: rateLimitModelPath,
    loaded: true,
    exports: {},
  };
  require.cache[tokenPath] = {
    id: tokenPath,
    filename: tokenPath,
    loaded: true,
    exports: () => "jwt-test",
  };
}

function loadAuthController(userMock) {
  delete require.cache[controllerPath];
  installSignupMocks({ emailConfigured: true, sendOk: true });
  require.cache[userPath] = {
    id: userPath,
    filename: userPath,
    loaded: true,
    exports: userMock,
  };
  // Force re-require of deps used inside the controller.
  delete require.cache[require.resolve("../utils/authPassword")];
  delete require.cache[require.resolve("../utils/emailValidation")];
  return require(controllerPath);
}

function loadAuthControllerWithEmail({ emailConfigured, sendOk, userMock }) {
  delete require.cache[controllerPath];
  installSignupMocks({ emailConfigured, sendOk });
  require.cache[userPath] = {
    id: userPath,
    filename: userPath,
    loaded: true,
    exports: userMock,
  };
  delete require.cache[require.resolve("../utils/authPassword")];
  delete require.cache[require.resolve("../utils/emailValidation")];
  return require(controllerPath);
}

describe("email validation", () => {
  it("accepts ordinary legitimate addresses", () => {
    for (const email of [
      "rabeel@gmail.com",
      "rabeel.fatima@gmail.com",
      "rabeel123@gmail.com",
      "  Ada.Lovelace@Example.COM  ",
    ]) {
      const result = validateEmailInput(email);
      assert.equal(result.ok, true, email);
    }
  });

  it("normalizes case and whitespace", () => {
    assert.equal(normalizeEmail("  Ada@Example.COM "), "ada@example.com");
    assert.equal(validateEmailInput("  Ada@Example.COM ").email, "ada@example.com");
  });

  it("rejects empty email", () => {
    assert.equal(validateEmailInput("").ok, false);
    assert.equal(validateEmailInput("   ").ok, false);
    assert.equal(validateEmailInput(null).ok, false);
  });

  it("rejects malformed syntax", () => {
    for (const email of [
      "rabeel@",
      "@gmail.com",
      "rabeel gmail@gmail.com",
      "!!!!!!!@gmail.com",
      "no-at-sign",
      "a@b",
      "a@b.c",
    ]) {
      assert.equal(isValidEmailFormat(email), false, email);
      assert.equal(validateEmailInput(email).ok, false, email);
    }
  });

  it("rejects special-character-only local part", () => {
    assert.equal(validateEmailInput("!!!!!!!@gmail.com").ok, false);
    assert.equal(validateEmailInput("@@@.@gmail.com").ok, false);
  });
});

describe("password validation (new passwords)", () => {
  it("rejects fewer than 8 characters", () => {
    const result = validatePasswordInput("Ab1!xyz");
    assert.equal(result.ok, false);
    assert.match(result.message, /8 characters/i);
  });

  it("rejects missing uppercase", () => {
    assert.equal(validatePasswordInput("secure1!xx").ok, false);
  });

  it("rejects missing lowercase", () => {
    assert.equal(validatePasswordInput("SECURE1!XX").ok, false);
  });

  it("rejects missing digit", () => {
    assert.equal(validatePasswordInput("Secure!!XX").ok, false);
  });

  it("rejects missing special character", () => {
    assert.equal(validatePasswordInput("Secure12XX").ok, false);
  });

  it("accepts a valid password and does not alter it", () => {
    const plain = "Secure1!pass";
    const result = validatePasswordInput(plain);
    assert.equal(result.ok, true);
    assert.equal(result.password, plain);
    assert.ok(MIN_PASSWORD_LENGTH >= 8);
  });

  it("allows more than one character in each complexity category", () => {
    const plain = "PASSWORDabc99@@";
    const result = validatePasswordInput(plain);
    assert.equal(result.ok, true);
    assert.equal(result.password, plain);
  });

  it("login password check does not enforce complexity (legacy accounts)", () => {
    const legacy = "legacy6";
    assert.equal(validatePasswordInput(legacy).ok, false);
    assert.equal(validateLoginPasswordInput(legacy).ok, true);
    assert.equal(validateLoginPasswordInput("").ok, false);
  });
});

describe("email config and public URL fallback", () => {
  it("is unconfigured without Resend trio", () => {
    assert.equal(getEmailConfig({}).configured, false);
  });

  it("accepts FRONTEND_URL as PUBLIC_APP_URL fallback", () => {
    const cfg = getEmailConfig({
      RESEND_API_KEY: "re_x",
      PASSWORD_RESET_FROM_EMAIL: "QuickCheck Hub <noreply@example.com>",
      FRONTEND_URL: "https://app.example.com/",
    });
    assert.equal(cfg.configured, true);
    assert.equal(cfg.publicAppUrl, "https://app.example.com");
  });
});

describe("public signup controller contracts (mocked)", () => {
  it("rejects invalid email before create", async () => {
    let created = 0;
    const auth = loadAuthController({
      findOne: async () => null,
      create: async () => {
        created += 1;
        throw new Error("should not create");
      },
      countDocuments: async () => 0,
    });
    const res = mockRes();
    await auth.requestPublicSignup(
      {
        ip: "127.0.0.1",
        body: {
          name: "Ada",
          email: "!!!!!!!@gmail.com",
          password: "Secure1!pass",
          role: "student",
        },
      },
      res
    );
    assert.equal(res.statusCode, 400);
    assert.match(res.body.message, /email/i);
    assert.equal(created, 0);
  });

  it("rejects weak password even if client bypasses UI", async () => {
    let created = 0;
    const auth = loadAuthController({
      findOne: async () => null,
      create: async () => {
        created += 1;
        throw new Error("should not create");
      },
      countDocuments: async () => 0,
    });
    const res = mockRes();
    await auth.requestPublicSignup(
      {
        ip: "127.0.0.1",
        body: {
          name: "Ada",
          email: "ada@example.com",
          password: "weak",
          role: "student",
        },
      },
      res
    );
    assert.equal(res.statusCode, 400);
    assert.match(res.body.message, /password/i);
    assert.equal(created, 0);
  });

  it("rejects admin role on public signup", async () => {
    const auth = loadAuthController({
      findOne: async () => null,
      create: async () => {
        throw new Error("should not create");
      },
    });
    const res = mockRes();
    await auth.requestPublicSignup(
      {
        ip: "127.0.0.1",
        body: {
          name: "Evil",
          email: "evil@example.com",
          password: "Secure1!pass",
          role: "admin",
        },
      },
      res
    );
    assert.equal(res.statusCode, 400);
    assert.match(res.body.message, /Teacher or Student/i);
  });

  it("duplicate pending verification does not create another account", async () => {
    let created = 0;
    const auth = loadAuthController({
      findOne: async () => ({
        role: "student",
        approvalStatus: "pending",
        emailVerified: false,
      }),
      create: async () => {
        created += 1;
        throw new Error("should not create");
      },
    });
    const res = mockRes();
    await auth.requestPublicSignup(
      {
        ip: "127.0.0.1",
        body: {
          name: "Ada",
          email: "ada@example.com",
          password: "Secure1!pass",
          role: "student",
        },
      },
      res
    );
    assert.equal(res.statusCode, 409);
    assert.equal(res.body.code, "PENDING_VERIFICATION");
    assert.equal(created, 0);
  });

  it("EMAIL_NOT_CONFIGURED fails closed without creating a user", async () => {
    let created = 0;
    const auth = loadAuthControllerWithEmail({
      emailConfigured: false,
      sendOk: false,
      userMock: {
        findOne: async () => null,
        create: async () => {
          created += 1;
          throw new Error("should not create");
        },
      },
    });
    const res = mockRes();
    await auth.requestPublicSignup(
      {
        ip: "127.0.0.1",
        body: {
          name: "Ada",
          email: "ada@example.com",
          password: "Secure1!pass",
          role: "student",
        },
      },
      res
    );
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.code, "EMAIL_NOT_CONFIGURED");
    assert.equal(created, 0);
  });

  it("provider failure after create returns pending without JWT", async () => {
    let created = 0;
    const auth = loadAuthControllerWithEmail({
      emailConfigured: true,
      sendOk: false,
      userMock: {
        findOne: async () => null,
        countDocuments: async () => 0,
        create: async (payload) => {
          created += 1;
          return { ...payload, _id: "u1" };
        },
      },
    });
    const res = mockRes();
    await auth.requestPublicSignup(
      {
        ip: "127.0.0.1",
        body: {
          name: "Ada",
          email: "ada@example.com",
          password: "Secure1!pass",
          role: "student",
        },
      },
      res
    );
    assert.equal(res.statusCode, 201);
    assert.equal(created, 1);
    assert.equal(res.body.verificationEmailSent, false);
    assert.equal(res.body.token, undefined);
    assert.equal(res.body.code, "VERIFICATION_EMAIL_FAILED");
  });
});

describe("login security contracts", () => {
  it("wrong password is rejected and hash is not exposed", async () => {
    const hash = await hashPassword("Correct1!");
    const auth = loadAuthController({
      findOne: async () => ({
        _id: "u1",
        email: "ada@example.com",
        role: "student",
        name: "Ada",
        password: hash,
        emailVerified: true,
        approvalStatus: "approved",
        isAllowedLogin: true,
        tokenVersion: 0,
        toObject() {
          return { ...this };
        },
      }),
    });
    const res = mockRes();
    await auth.loginUser(
      { body: { email: "ada@example.com", password: "WrongPass1!", role: "student" } },
      res
    );
    assert.equal(res.statusCode, 400);
    assert.match(res.body.message, /Invalid email or password/i);
    assert.equal(res.body.password, undefined);
    assert.equal(res.body.user, undefined);
    assert.doesNotMatch(JSON.stringify(res.body), /\$2[aby]?\$/);
  });

  it("unverified and unapproved accounts follow dual-gate policy", () => {
    assert.match(
      getLoginDenialReason({
        emailVerified: false,
        approvalStatus: "pending",
        isAllowedLogin: false,
      }),
      /verify your email/i
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

  it("toPublicUser strips password hash", () => {
    const publicUser = toPublicUser({
      email: "ada@example.com",
      password: "$2a$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012345",
    });
    assert.equal(publicUser.password, undefined);
  });

  it("passwordsMatch verifies bcrypt without exposing plaintext", async () => {
    const plain = "Secure1!pass";
    const hash = await hashPassword(plain);
    assert.equal(await passwordsMatch(plain, hash), true);
    assert.equal(await passwordsMatch("other", hash), false);
    assert.notEqual(hash, plain);
  });
});

describe("verification token + resend (mocked stores)", () => {
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
      async findOne(filter) {
        return rows.find((row) => row.tokenHash === filter.tokenHash) || null;
      },
    };
  }

  function chainSelect(doc) {
    return {
      select() {
        return Promise.resolve(doc ? { ...doc } : null);
      },
    };
  }

  it("verifies once, rejects expired, and resend stays enumeration-safe", async () => {
    const tokens = memoryTokenStore();
    let userDoc = {
      _id: "u1",
      name: "Ada",
      email: "ada@example.com",
      role: "student",
      approvalStatus: "pending",
      emailVerified: false,
      emailVerifiedAt: null,
      adminNotifiedAt: null,
      createdAt: new Date("2026-10-13T00:00:00Z"),
    };

    const deps = {
      EmailVerificationToken: tokens,
      User: {
        findOneAndUpdate(filter, update) {
          if (String(filter._id) !== String(userDoc._id)) {
            return chainSelect(null);
          }
          Object.assign(userDoc, update.$set || {});
          return chainSelect(userDoc);
        },
        findById(id) {
          if (String(id) !== String(userDoc._id)) return chainSelect(null);
          return chainSelect(userDoc);
        },
        findOne: async (filter) =>
          filter.email === userDoc.email &&
          filter.approvalStatus === "pending" &&
          userDoc.emailVerified !== true
            ? userDoc
            : null,
      },
      AuthRateLimit: {
        findOneAndUpdate: async () => ({ count: 1 }),
      },
      getEmailConfig: () => ({
        configured: true,
        apiKey: "re_test",
        fromEmail: "QuickCheck Hub <noreply@example.com>",
        publicAppUrl: "https://app.example.com",
      }),
      sendTransactionalEmail: async () => ({ ok: true }),
      now: () => new Date("2026-10-13T12:00:00Z"),
      notifyAdminsOfVerifiedRegistration: async () => {},
      env: {},
      fetchImpl: async () => ({ ok: true }),
    };

    const issued = await issueEmailVerificationToken(userDoc, deps);
    const ok = await verifyEmailWithToken(issued.rawToken, deps);
    assert.equal(ok.ok, true);
    assert.equal(userDoc.emailVerified, true);

    const reuse = await verifyEmailWithToken(issued.rawToken, deps);
    assert.equal(reuse.ok, true);
    assert.equal(reuse.alreadyVerified, true);

    const expiredTokens = memoryTokenStore();
    const expiredUser = {
      ...userDoc,
      _id: "u2",
      email: "ada2@example.com",
      emailVerified: false,
    };
    const expiredDeps = {
      ...deps,
      EmailVerificationToken: expiredTokens,
      User: {
        findOneAndUpdate: () => chainSelect(null),
        findById: () =>
          chainSelect({
            ...expiredUser,
            emailVerified: false,
          }),
      },
      now: () => new Date("2026-10-20T12:00:00Z"),
    };
    const issued2 = await issueEmailVerificationToken(expiredUser, {
      ...expiredDeps,
      now: () => new Date("2026-10-13T12:00:00Z"),
    });
    expiredTokens.rows[0].expiresAt = new Date("2026-10-12T00:00:00Z");
    expiredTokens.rows[0].usedAt = null;
    const expired = await verifyEmailWithToken(issued2.rawToken, expiredDeps);
    assert.equal(expired.ok, false);
    assert.equal(expired.code, "TOKEN_EXPIRED");

    const resend = await resendVerificationEmail(
      { email: "unknown@example.com", ip: "1.1.1.1" },
      deps
    );
    assert.equal(resend.status, 200);
    assert.match(resend.message, /If an unverified registration exists/i);
  });
});
