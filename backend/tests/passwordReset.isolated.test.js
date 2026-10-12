const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const path = require("path");
const Module = require("module");
const express = require("express");
const http = require("http");
const {
  hashResetToken,
  generateRawResetToken,
  requestPasswordReset,
  confirmPasswordReset,
  GENERIC_REQUEST_MESSAGE,
  SERVICE_UNAVAILABLE_MESSAGE,
  EMAIL_RATE_LIMIT,
  TOKEN_TTL_MS,
} = require("../services/passwordResetService");
const {
  getResetEmailConfig,
  buildResetLink,
  sendPasswordResetEmail,
} = require("../services/passwordResetEmail");
const { assertWithinRateLimit } = require("../services/authRateLimit");
const {
  hashPassword,
  passwordsMatch,
  isPublicAdminBootstrapAllowed,
} = require("../utils/authPassword");

const authRoutesPath = path.resolve(__dirname, "../routes/authRoutes.js");
const authControllerPath = path.resolve(__dirname, "../controllers/authController.js");
const authMiddlewarePath = path.resolve(__dirname, "../middleware/authMiddleware.js");
const userPath = path.resolve(__dirname, "../models/User.js");
const tokenPath = path.resolve(__dirname, "../utils/tokenUtils.js");

function createMemoryRateLimitStore() {
  const docs = new Map();
  return {
    async findOne({ key }) {
      return docs.get(key) || null;
    },
    async findOneAndUpdate(filter, update) {
      const key = filter.key;
      let doc = docs.get(key);

      // Atomic pipeline shape from authRateLimit.js
      if (Array.isArray(update)) {
        const set = update[0].$set;
        const nowDate = set.count.$cond[0].$or[1].$lte[1];
        const windowEnd = set.windowExpiresAt.$cond[1];
        if (!doc || doc.windowExpiresAt <= nowDate) {
          doc = { key, count: 1, windowExpiresAt: windowEnd };
        } else {
          doc = { ...doc, count: doc.count + 1 };
        }
        docs.set(key, doc);
        return { ...doc };
      }

      const set = update.$set || {};
      doc = {
        key,
        count: set.count ?? doc?.count ?? 0,
        windowExpiresAt: set.windowExpiresAt ?? doc?.windowExpiresAt,
      };
      docs.set(key, doc);
      return doc;
    },
  };
}

function createTokenStore() {
  const tokens = [];
  return {
    tokens,
    async updateMany(filter, update) {
      for (const t of tokens) {
        if (filter.user && String(t.user) !== String(filter.user)) continue;
        if (filter.usedAt === null && t.usedAt != null) continue;
        if (update.$set?.usedAt) t.usedAt = update.$set.usedAt;
      }
    },
    async updateOne(filter, update) {
      const t = tokens.find((x) => {
        if (filter._id != null) return String(x._id) === String(filter._id);
        if (filter.tokenHash) {
          return (
            x.tokenHash === filter.tokenHash &&
            (filter.usedAt === null ? x.usedAt == null : true)
          );
        }
        return false;
      });
      if (t && update.$set && Object.prototype.hasOwnProperty.call(update.$set, "usedAt")) {
        t.usedAt = update.$set.usedAt;
      }
    },
    async create(doc) {
      const row = { ...doc, _id: `tok-${tokens.length + 1}` };
      tokens.push(row);
      return row;
    },
    async findOneAndUpdate(filter, update, options = {}) {
      const now = filter.expiresAt?.$gt;
      const idx = tokens.findIndex(
        (t) =>
          t.tokenHash === filter.tokenHash &&
          t.usedAt == null &&
          (!now || t.expiresAt > now)
      );
      if (idx < 0) return null;
      if (update.$set?.usedAt) tokens[idx].usedAt = update.$set.usedAt;
      return options.new === false ? null : { ...tokens[idx] };
    },
  };
}

function configuredEnv() {
  return {
    RESEND_API_KEY: "re_test_not_real",
    PASSWORD_RESET_FROM_EMAIL: "QuickCheck Hub <noreply@example.com>",
    PUBLIC_APP_URL: "https://app.example.com",
  };
}

describe("password reset token crypto", () => {
  it("generates high-entropy raw tokens and stores only SHA-256 hashes", () => {
    const a = generateRawResetToken();
    const b = generateRawResetToken();
    assert.equal(a.length, 64);
    assert.notEqual(a, b);
    const hash = hashResetToken(a);
    assert.equal(hash, crypto.createHash("sha256").update(a, "utf8").digest("hex"));
    assert.notEqual(hash, a);
    assert.equal(hash.length, 64);
  });
});

describe("password reset email adapter", () => {
  it("builds fragment-based reset links from PUBLIC_APP_URL only", () => {
    const link = buildResetLink("https://app.example.com/", "abc123");
    assert.equal(link, "https://app.example.com/reset-password#abc123");
  });

  it("reports unconfigured when provider env is missing", () => {
    const cfg = getResetEmailConfig({});
    assert.equal(cfg.configured, false);
  });

  it("fails closed without calling network when not configured", async () => {
    let called = false;
    const result = await sendPasswordResetEmail(
      { to: "a@example.com", rawToken: "x".repeat(64) },
      {
        env: {},
        fetchImpl: async () => {
          called = true;
          return { ok: true };
        },
      }
    );
    assert.equal(result.ok, false);
    assert.equal(result.code, "EMAIL_NOT_CONFIGURED");
    assert.equal(called, false);
  });

  it("sanitizes provider failures without exposing secrets", async () => {
    const result = await sendPasswordResetEmail(
      { to: "a@example.com", rawToken: "y".repeat(64) },
      {
        env: configuredEnv(),
        fetchImpl: async () => ({ ok: false, status: 401, statusText: "Unauthorized" }),
      }
    );
    assert.equal(result.ok, false);
    assert.equal(result.code, "EMAIL_PROVIDER_ERROR");
    assert.equal(JSON.stringify(result).includes("re_test"), false);
  });
});

describe("Mongo-backed rate limit", () => {
  it("blocks after limit within window", async () => {
    const store = createMemoryRateLimitStore();
    const now = new Date("2026-10-12T10:00:00Z");
    for (let i = 0; i < 3; i++) {
      const r = await assertWithinRateLimit(store, "k", 3, 60000, now);
      assert.equal(r.ok, true);
    }
    const blocked = await assertWithinRateLimit(store, "k", 3, 60000, now);
    assert.equal(blocked.ok, false);
  });
});

describe("requestPasswordReset", () => {
  let tokenStore;
  let sentEmails;
  let users;

  beforeEach(() => {
    tokenStore = createTokenStore();
    sentEmails = [];
    users = {
      "known@example.com": { _id: "user-known", email: "known@example.com", role: "student" },
      "teacher@example.com": { _id: "user-teacher", email: "teacher@example.com", role: "teacher" },
      "admin@example.com": { _id: "user-admin", email: "admin@example.com", role: "admin" },
    };
  });

  function deps(overrides = {}) {
    return {
      User: {
        findOne: async ({ email }) => users[email] || null,
        findOneAndUpdate: async () => null,
      },
      PasswordResetToken: tokenStore,
      AuthRateLimit: createMemoryRateLimitStore(),
      sendPasswordResetEmail: async (payload) => {
        sentEmails.push(payload);
        return { ok: true };
      },
      getResetEmailConfig: () => ({ configured: true, ...configuredEnv() }),
      env: configuredEnv(),
      now: () => new Date("2026-10-12T12:00:00Z"),
      ...overrides,
    };
  }

  it("returns generic success for known email and stores hashed token only", async () => {
    const result = await requestPasswordReset(
      { email: "known@example.com", ip: "1.2.3.4" },
      deps()
    );
    assert.equal(result.ok, true);
    assert.equal(result.message, GENERIC_REQUEST_MESSAGE);
    assert.equal(tokenStore.tokens.length, 1);
    assert.equal(tokenStore.tokens[0].tokenHash.length, 64);
    assert.equal(sentEmails.length, 1);
    assert.equal(sentEmails[0].to, "known@example.com");
    assert.equal(sentEmails[0].rawToken.length, 64);
    assert.notEqual(sentEmails[0].rawToken, tokenStore.tokens[0].tokenHash);
    const expiresDelta =
      tokenStore.tokens[0].expiresAt.getTime() - new Date("2026-10-12T12:00:00Z").getTime();
    assert.equal(expiresDelta, TOKEN_TTL_MS);
  });

  it("returns the same generic response for unknown email without creating tokens", async () => {
    const result = await requestPasswordReset(
      { email: "missing@example.com", ip: "1.2.3.4" },
      deps()
    );
    assert.equal(result.ok, true);
    assert.equal(result.message, GENERIC_REQUEST_MESSAGE);
    assert.equal(tokenStore.tokens.length, 0);
    assert.equal(sentEmails.length, 0);
  });

  it("works for admin and teacher the same as student", async () => {
    for (const email of ["admin@example.com", "teacher@example.com"]) {
      sentEmails.length = 0;
      const result = await requestPasswordReset({ email, ip: "9.9.9.9" }, deps());
      assert.equal(result.ok, true);
      assert.equal(sentEmails[0].to, email);
    }
  });

  it("invalidates previous outstanding tokens on new request", async () => {
    await requestPasswordReset({ email: "known@example.com", ip: "1.1.1.1" }, deps());
    const firstHash = tokenStore.tokens[0].tokenHash;
    await requestPasswordReset({ email: "known@example.com", ip: "1.1.1.1" }, deps());
    assert.ok(tokenStore.tokens[0].usedAt);
    assert.equal(tokenStore.tokens[0].tokenHash, firstHash);
    assert.equal(tokenStore.tokens[1].usedAt, null);
  });

  it("rate-limits by email", async () => {
    const d = deps();
    for (let i = 0; i < EMAIL_RATE_LIMIT; i++) {
      const r = await requestPasswordReset(
        { email: "unknown@example.com", ip: `10.0.0.${i}` },
        d
      );
      assert.equal(r.ok, true);
    }
    const blocked = await requestPasswordReset(
      { email: "unknown@example.com", ip: "10.0.0.99" },
      d
    );
    assert.equal(blocked.ok, false);
    assert.equal(blocked.status, 429);
  });

  it("fails closed when email is not configured", async () => {
    const result = await requestPasswordReset(
      { email: "known@example.com", ip: "1.2.3.4" },
      deps({
        getResetEmailConfig: () => ({ configured: false }),
      })
    );
    assert.equal(result.ok, false);
    assert.equal(result.status, 503);
    assert.equal(result.message, SERVICE_UNAVAILABLE_MESSAGE);
    assert.equal(tokenStore.tokens.length, 0);
  });

  it("provider failure returns generic success (no email enumeration) and burns token", async () => {
    const known = await requestPasswordReset(
      { email: "known@example.com", ip: "1.2.3.4" },
      deps({
        sendPasswordResetEmail: async () => ({
          ok: false,
          code: "EMAIL_PROVIDER_ERROR",
        }),
      })
    );
    const unknown = await requestPasswordReset(
      { email: "missing@example.com", ip: "1.2.3.5" },
      deps()
    );
    assert.equal(known.ok, true);
    assert.equal(known.status, 200);
    assert.equal(known.message, GENERIC_REQUEST_MESSAGE);
    assert.equal(unknown.status, 200);
    assert.equal(unknown.message, known.message);
    assert.ok(tokenStore.tokens[0].usedAt);
  });

  it("missing config returns identical 503 for known and unknown emails", async () => {
    const d = deps({ getResetEmailConfig: () => ({ configured: false }) });
    const known = await requestPasswordReset(
      { email: "known@example.com", ip: "2.2.2.2" },
      d
    );
    const unknown = await requestPasswordReset(
      { email: "nope@example.com", ip: "2.2.2.3" },
      d
    );
    assert.equal(known.status, 503);
    assert.equal(unknown.status, 503);
    assert.equal(known.message, unknown.message);
    assert.equal(known.message, SERVICE_UNAVAILABLE_MESSAGE);
  });

  it("never auto-creates users", async () => {
    let created = false;
    await requestPasswordReset(
      { email: "brandnew@example.com", ip: "8.8.8.8" },
      deps({
        User: {
          findOne: async () => null,
          create: async () => {
            created = true;
          },
          findOneAndUpdate: async () => null,
        },
      })
    );
    assert.equal(created, false);
  });
});

describe("confirmPasswordReset", () => {
  it("hashes password once, consumes token atomically, sets passwordChangedAt", async () => {
    const raw = generateRawResetToken();
    const tokenHash = hashResetToken(raw);
    const tokenStore = createTokenStore();
    await tokenStore.create({
      user: "user-1",
      email: "known@example.com",
      tokenHash,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      usedAt: null,
    });

    let updated = null;
    const result = await confirmPasswordReset(
      { token: raw, newPassword: "NewPass12!" },
      {
        User: {
          findOne: async () => null,
          findOneAndUpdate: async (filter, update) => {
            updated = { filter, update };
            return { _id: filter._id, email: "known@example.com" };
          },
        },
        PasswordResetToken: tokenStore,
        AuthRateLimit: createMemoryRateLimitStore(),
        sendPasswordResetEmail: async () => ({ ok: true }),
        getResetEmailConfig: () => ({ configured: true }),
        env: configuredEnv(),
        now: () => new Date(),
      }
    );

    assert.equal(result.ok, true);
    assert.ok(tokenStore.tokens[0].usedAt);
    assert.ok(updated.update.$set.passwordChangedAt);
    assert.equal(updated.update.$inc.tokenVersion, 1);
    assert.equal(isBcryptish(updated.update.$set.password), true);
    assert.equal(await passwordsMatch("NewPass12!", updated.update.$set.password), true);
    assert.notEqual(updated.update.$set.password, "NewPass12!");
  });

  it("fail-closes on password update failure: token stays consumed (no revive)", async () => {
    const raw = generateRawResetToken();
    const tokenStore = createTokenStore();
    await tokenStore.create({
      user: "user-1",
      email: "known@example.com",
      tokenHash: hashResetToken(raw),
      expiresAt: new Date(Date.now() + 600000),
      usedAt: null,
    });
    const failed = await confirmPasswordReset(
      { token: raw, newPassword: "NewPass12!" },
      {
        User: { findOneAndUpdate: async () => null },
        PasswordResetToken: tokenStore,
        AuthRateLimit: createMemoryRateLimitStore(),
        sendPasswordResetEmail: async () => ({ ok: true }),
        getResetEmailConfig: () => ({ configured: true }),
        env: {},
        now: () => new Date(),
      }
    );
    assert.equal(failed.ok, false);
    assert.ok(tokenStore.tokens[0].usedAt);
    assert.match(failed.message, /new reset link/i);

    const retrySame = await confirmPasswordReset(
      { token: raw, newPassword: "NewPass12!" },
      {
        User: {
          findOneAndUpdate: async () => {
            throw new Error("must not update after fail-closed consume");
          },
        },
        PasswordResetToken: tokenStore,
        AuthRateLimit: createMemoryRateLimitStore(),
        sendPasswordResetEmail: async () => ({ ok: true }),
        getResetEmailConfig: () => ({ configured: true }),
        env: {},
        now: () => new Date(),
      }
    );
    assert.equal(retrySame.ok, false);
  });

  it("token restoration is not used after a replacement request invalidated older tokens", async () => {
    const olderRaw = generateRawResetToken();
    const newerRaw = generateRawResetToken();
    const tokenStore = createTokenStore();
    const older = await tokenStore.create({
      user: "user-1",
      email: "known@example.com",
      tokenHash: hashResetToken(olderRaw),
      expiresAt: new Date(Date.now() + 600000),
      usedAt: null,
    });
    // Simulate replacement request invalidating the older outstanding token.
    older.usedAt = new Date();
    await tokenStore.create({
      user: "user-1",
      email: "known@example.com",
      tokenHash: hashResetToken(newerRaw),
      expiresAt: new Date(Date.now() + 600000),
      usedAt: null,
    });

    const reviveAttempt = await confirmPasswordReset(
      { token: olderRaw, newPassword: "NewPass12!" },
      {
        User: {
          findOneAndUpdate: async () => {
            throw new Error("older token must not change password");
          },
        },
        PasswordResetToken: tokenStore,
        AuthRateLimit: createMemoryRateLimitStore(),
        sendPasswordResetEmail: async () => ({ ok: true }),
        getResetEmailConfig: () => ({ configured: true }),
        env: {},
        now: () => new Date(),
      }
    );
    assert.equal(reviveAttempt.ok, false);
  });

  it("rejects invalid token", async () => {
    const tokenStore = createTokenStore();
    const result = await confirmPasswordReset(
      { token: "z".repeat(64), newPassword: "NewPass12!" },
      {
        User: { findOneAndUpdate: async () => ({ _id: "x" }) },
        PasswordResetToken: tokenStore,
        AuthRateLimit: createMemoryRateLimitStore(),
        sendPasswordResetEmail: async () => ({ ok: true }),
        getResetEmailConfig: () => ({ configured: true }),
        env: {},
        now: () => new Date(),
      }
    );
    assert.equal(result.ok, false);
    assert.equal(result.status, 400);
  });

  it("rejects expired token", async () => {
    const raw = generateRawResetToken();
    const tokenStore = createTokenStore();
    await tokenStore.create({
      user: "user-1",
      email: "known@example.com",
      tokenHash: hashResetToken(raw),
      expiresAt: new Date(Date.now() - 1000),
      usedAt: null,
    });
    const result = await confirmPasswordReset(
      { token: raw, newPassword: "NewPass12!" },
      {
        User: {
          findOneAndUpdate: async () => {
            throw new Error("must not update");
          },
        },
        PasswordResetToken: tokenStore,
        AuthRateLimit: createMemoryRateLimitStore(),
        sendPasswordResetEmail: async () => ({ ok: true }),
        getResetEmailConfig: () => ({ configured: true }),
        env: {},
        now: () => new Date(),
      }
    );
    assert.equal(result.ok, false);
  });

  it("rejects reused token (single-use)", async () => {
    const raw = generateRawResetToken();
    const tokenStore = createTokenStore();
    await tokenStore.create({
      user: "user-1",
      email: "known@example.com",
      tokenHash: hashResetToken(raw),
      expiresAt: new Date(Date.now() + 600000),
      usedAt: null,
    });
    const deps = {
      User: {
        findOneAndUpdate: async (filter, update) => ({
          _id: filter._id,
          password: update.$set.password,
        }),
      },
      PasswordResetToken: tokenStore,
      AuthRateLimit: createMemoryRateLimitStore(),
      sendPasswordResetEmail: async () => ({ ok: true }),
      getResetEmailConfig: () => ({ configured: true }),
      env: {},
      now: () => new Date(),
    };
    const first = await confirmPasswordReset(
      { token: raw, newPassword: "NewPass12!" },
      deps
    );
    assert.equal(first.ok, true);
    const second = await confirmPasswordReset(
      { token: raw, newPassword: "OtherPass99!" },
      deps
    );
    assert.equal(second.ok, false);
  });

  it("concurrent redemption only succeeds once", async () => {
    const raw = generateRawResetToken();
    const tokenHash = hashResetToken(raw);
    let consumed = false;
    const PasswordResetToken = {
      async findOneAndUpdate(filter) {
        if (consumed) return null;
        if (filter.tokenHash !== tokenHash) return null;
        consumed = true;
        return { user: "user-1", tokenHash, usedAt: new Date() };
      },
      async updateMany() {},
    };
    let updates = 0;
    const deps = {
      User: {
        findOneAndUpdate: async () => {
          updates += 1;
          return { _id: "user-1" };
        },
      },
      PasswordResetToken,
      AuthRateLimit: createMemoryRateLimitStore(),
      sendPasswordResetEmail: async () => ({ ok: true }),
      getResetEmailConfig: () => ({ configured: true }),
      env: {},
      now: () => new Date(),
    };

    const [a, b] = await Promise.all([
      confirmPasswordReset({ token: raw, newPassword: "NewPass12!" }, deps),
      confirmPasswordReset({ token: raw, newPassword: "NewPass12!" }, deps),
    ]);
    const successes = [a, b].filter((r) => r.ok).length;
    assert.equal(successes, 1);
    assert.equal(updates, 1);
  });

  it("does not modify a different account than the token owner", async () => {
    const raw = generateRawResetToken();
    const tokenStore = createTokenStore();
    await tokenStore.create({
      user: "owner-id",
      email: "owner@example.com",
      tokenHash: hashResetToken(raw),
      expiresAt: new Date(Date.now() + 600000),
      usedAt: null,
    });
    let targetId = null;
    await confirmPasswordReset(
      { token: raw, newPassword: "NewPass12!" },
      {
        User: {
          findOneAndUpdate: async (filter) => {
            targetId = filter._id;
            return { _id: filter._id };
          },
        },
        PasswordResetToken: tokenStore,
        AuthRateLimit: createMemoryRateLimitStore(),
        sendPasswordResetEmail: async () => ({ ok: true }),
        getResetEmailConfig: () => ({ configured: true }),
        env: {},
        now: () => new Date(),
      }
    );
    assert.equal(targetId, "owner-id");
  });
});

function isBcryptish(value) {
  return typeof value === "string" && value.startsWith("$2");
}

function loadProtectWithUser(userDoc) {
  delete require.cache[authMiddlewarePath];
  delete require.cache[userPath];
  const userMock = {
    findById: () => ({
      select: async () => userDoc,
    }),
  };
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === "../models/User" || request.endsWith(`${path.sep}models${path.sep}User.js`)) {
      return userMock;
    }
    return originalLoad(request, parent, isMain);
  };
  try {
    return require(authMiddlewarePath).protect;
  } finally {
    Module._load = originalLoad;
  }
}

function mockAuthRes() {
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

describe("JWT invalidation after password change", () => {
  const jwt = require("jsonwebtoken");
  const generateToken = require("../utils/tokenUtils");

  beforeEach(() => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-for-qc10c";
  });

  it("rejects JWTs whose tokenVersion lags the user record (same-second safe)", async () => {
    const protect = loadProtectWithUser({
      _id: "u1",
      role: "student",
      tokenVersion: 1,
      passwordChangedAt: new Date(),
    });
    const stale = generateToken("u1", "student", 0);
    const res = mockAuthRes();
    let nextCalled = false;
    await protect({ headers: { authorization: `Bearer ${stale}` } }, res, () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 401);
  });

  it("accepts JWTs minted after reset with matching tokenVersion", async () => {
    const protect = loadProtectWithUser({
      _id: "u1",
      role: "admin",
      tokenVersion: 2,
      passwordChangedAt: new Date(Date.now() - 1000),
    });
    const fresh = generateToken("u1", "admin", 2);
    const res = mockAuthRes();
    let nextCalled = false;
    await protect({ headers: { authorization: `Bearer ${fresh}` } }, res, () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, true);
    assert.equal(res.statusCode, 200);
  });

  it("treats legacy JWTs without tv as version 0 (compatible until reset)", async () => {
    const protect = loadProtectWithUser({
      _id: "u1",
      role: "teacher",
      tokenVersion: 0,
      passwordChangedAt: null,
    });
    const legacy = jwt.sign({ id: "u1", role: "teacher" }, process.env.JWT_SECRET, {
      expiresIn: "1h",
    });
    const res = mockAuthRes();
    let nextCalled = false;
    await protect({ headers: { authorization: `Bearer ${legacy}` } }, res, () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, true);
  });

  it("same-second boundary: pre-reset JWT rejected; post-reset JWT with new tv accepted", async () => {
    // Reset at .500; new login JWT iat is whole seconds (same second as reset).
    const resetAt = new Date("2026-10-12T10:30:15.500Z");
    const iatSec = Math.floor(new Date("2026-10-12T10:30:15.800Z").getTime() / 1000);
    assert.equal(iatSec, Math.floor(resetAt.getTime() / 1000));

    const protectAfterReset = loadProtectWithUser({
      _id: "u1",
      role: "student",
      tokenVersion: 1,
      passwordChangedAt: resetAt,
    });

    const oldJwt = generateToken("u1", "student", 0);
    const oldRes = mockAuthRes();
    let oldNext = false;
    await protectAfterReset(
      { headers: { authorization: `Bearer ${oldJwt}` } },
      oldRes,
      () => {
        oldNext = true;
      }
    );
    assert.equal(oldNext, false);
    assert.equal(oldRes.statusCode, 401);

    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
      "base64url"
    );
    const body = Buffer.from(
      JSON.stringify({ id: "u1", role: "student", tv: 1, iat: iatSec, exp: iatSec + 3600 })
    ).toString("base64url");
    const sig = crypto
      .createHmac("sha256", process.env.JWT_SECRET)
      .update(`${header}.${body}`)
      .digest("base64url");
    const newSameSecondJwt = `${header}.${body}.${sig}`;

    const newRes = mockAuthRes();
    let newNext = false;
    await protectAfterReset(
      { headers: { authorization: `Bearer ${newSameSecondJwt}` } },
      newRes,
      () => {
        newNext = true;
      }
    );
    assert.equal(newNext, true);
    assert.equal(newRes.statusCode, 200);
  });

  it("rejects forged/missing tokenVersion that does not match the database", async () => {
    const protect = loadProtectWithUser({
      _id: "u1",
      role: "student",
      tokenVersion: 3,
      passwordChangedAt: new Date(),
    });
    for (const tv of [undefined, 0, 2, 99]) {
      const payload = { id: "u1", role: "student" };
      if (tv !== undefined) payload.tv = tv;
      const forged = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "1h" });
      const res = mockAuthRes();
      let nextCalled = false;
      await protect({ headers: { authorization: `Bearer ${forged}` } }, res, () => {
        nextCalled = true;
      });
      assert.equal(nextCalled, false, `tv=${tv} must be rejected`);
      assert.equal(res.statusCode, 401);
    }
  });

  it("does not expose password hashes on the authenticated user object", async () => {
    const protect = loadProtectWithUser({
      _id: "u1",
      role: "student",
      tokenVersion: 0,
      passwordChangedAt: null,
      email: "s@example.com",
    });
    const token = generateToken("u1", "student", 0);
    const res = mockAuthRes();
    const req = { headers: { authorization: `Bearer ${token}` } };
    await protect(req, res, () => {});
    assert.ok(req.user);
    assert.equal(req.user.password, undefined);
  });
});

describe("proxy/IP rate-limit identity", () => {
  it("ignores spoofed X-Forwarded-For and uses req.ip/socket only", () => {
    const { clientIp } = require("../controllers/passwordResetController");
    const spoofed = clientIp({
      headers: { "x-forwarded-for": "203.0.113.9, 10.0.0.1" },
      ip: "198.51.100.20",
      socket: { remoteAddress: "10.0.0.2" },
    });
    assert.equal(spoofed, "198.51.100.20");
    const noExpressIp = clientIp({
      headers: { "x-forwarded-for": "203.0.113.9" },
      socket: { remoteAddress: "::ffff:192.0.2.10" },
    });
    assert.equal(noExpressIp, "192.0.2.10");
  });

  it("documents Hostinger trust-proxy dependency (topology acceptance pending)", () => {
    // appFull sets trust proxy = 1 so Express derives req.ip from one hop.
    // If Hostinger overwrites X-Forwarded-For with $remote_addr, spoofing fails.
    // If it only appends client-supplied XFF, Express may trust a spoofed leftmost
    // value — production acceptance must verify the proxy header mode.
    const appFull = require("fs").readFileSync(
      path.resolve(__dirname, "../appFull.js"),
      "utf8"
    );
    assert.match(appFull, /trust proxy["']?\s*,\s*1/);
  });
});

describe("admin password change invalidates sessions", () => {
  it("updateUser increments tokenVersion and sets passwordChangedAt when password changes", async () => {
    const adminPath = path.resolve(__dirname, "../controllers/adminController.js");
    const userPathLocal = path.resolve(__dirname, "../models/User.js");
    delete require.cache[adminPath];
    delete require.cache[userPathLocal];

    let appliedUpdate = null;
    const userMock = {
      findByIdAndUpdate: (_id, update) => {
        appliedUpdate = update;
        const doc = {
          _id,
          email: "victim@example.com",
          role: "student",
          tokenVersion: 1,
        };
        return {
          select() {
            return Promise.resolve(doc);
          },
        };
      },
    };

    const originalLoad = Module._load;
    Module._load = function (request, parent, isMain) {
      if (request === "../models/User" || request.endsWith(`${path.sep}models${path.sep}User.js`)) {
        return userMock;
      }
      return originalLoad(request, parent, isMain);
    };

    let adminController;
    try {
      adminController = require(adminPath);
    } finally {
      Module._load = originalLoad;
    }

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

    await adminController.updateUser(
      {
        params: { id: "user-1" },
        body: {
          password: "AdminSetPass9!",
          tokenVersion: 0,
          passwordChangedAt: "1999-01-01T00:00:00.000Z",
        },
      },
      res
    );

    assert.ok(appliedUpdate.$set.password);
    assert.match(appliedUpdate.$set.password, /^\$2/);
    assert.ok(appliedUpdate.$set.passwordChangedAt instanceof Date);
    assert.equal(appliedUpdate.$inc.tokenVersion, 1);
    assert.equal(Object.prototype.hasOwnProperty.call(appliedUpdate.$set, "tokenVersion"), false);
  });
});

describe("legacy insecure reset remains disabled + no public signup", () => {
  function loadAuthRouter(userMock) {
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
          protect: (req, res) => res.status(401).json({ message: "No token" }),
          authorize: () => (req, res) => res.status(403).json({ message: "denied" }),
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

  it("keeps POST /auth/reset-password disabled", async () => {
    const router = loadAuthRouter({
      findOne: async () => ({ email: "x@example.com", password: "h", save: async () => {} }),
    });
    const result = await withServer(router, async (port) => {
      const res = await fetch(`http://127.0.0.1:${port}/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "x@example.com", newPassword: "Hacked12!" }),
      });
      return { status: res.status, data: await res.json() };
    });
    assert.equal(result.status, 503);
    assert.equal(result.data.code, "PASSWORD_RESET_DISABLED");
  });

  it("rejects public student/teacher/admin signup", async () => {
    assert.equal(isPublicAdminBootstrapAllowed(), false);
    const router = loadAuthRouter({
      findOne: async () => null,
      create: async () => {
        throw new Error("should not create");
      },
      countDocuments: async () => 0,
    });
    for (const role of ["student", "teacher", "admin"]) {
      const result = await withServer(router, async (port) => {
        const res = await fetch(`http://127.0.0.1:${port}/auth/signup`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "X",
            email: `${role}@example.com`,
            password: "Pass12!!",
            role,
          }),
        });
        return { status: res.status };
      });
      assert.equal(result.status, 401);
    }
  });
});

describe("login regression helper", () => {
  it("existing password hash helper still verifies credentials", async () => {
    const hash = await hashPassword("LoginPass12!");
    assert.equal(await passwordsMatch("LoginPass12!", hash), true);
    assert.equal(await passwordsMatch("wrong", hash), false);
  });
});
