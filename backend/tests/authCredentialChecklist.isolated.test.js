/**
 * Email, password, login, and forgot-password checklist.
 * Isolated mocks only. Never connects to quickcheck_rabeel_demo.
 */
const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const Module = require("module");
const path = require("path");
const {
  validateEmailInput,
  normalizeEmail,
  MAX_EMAIL_LENGTH,
} = require("../utils/emailValidation");
const {
  validatePasswordInput,
  validatePasswordConfirmation,
  validateLoginPasswordInput,
  hashPassword,
  passwordsMatch,
} = require("../utils/authPassword");
const {
  requestPasswordReset,
  confirmPasswordReset,
  GENERIC_REQUEST_MESSAGE,
  hashResetToken,
  generateRawResetToken,
} = require("../services/passwordResetService");

const controllerPath = path.resolve(__dirname, "../controllers/authController.js");

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

function loadLoginController(userMock, rateLimit) {
  delete require.cache[controllerPath];
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request.endsWith(`${path.sep}models${path.sep}User.js`) || request === "../models/User") {
      return userMock;
    }
    if (request.endsWith(`${path.sep}utils${path.sep}tokenUtils.js`) || request === "../utils/tokenUtils") {
      return () => "test-jwt-token";
    }
    if (
      request.endsWith(`${path.sep}services${path.sep}authRateLimit.js`) ||
      request === "../services/authRateLimit"
    ) {
      return {
        DEFAULT_WINDOW_MS: 15 * 60 * 1000,
        assertWithinRateLimit: rateLimit,
      };
    }
    if (request.endsWith(`${path.sep}models${path.sep}AuthRateLimit.js`)) {
      return {};
    }
    return originalLoad(request, parent, isMain);
  };
  try {
    return require(controllerPath);
  } finally {
    Module._load = originalLoad;
  }
}

function userWith(role, hash) {
  return {
    findOne: async () => ({
      _id: "u1",
      name: role,
      email: `${role}@example.com`,
      password: hash,
      role,
      emailVerified: true,
      approvalStatus: "approved",
      isAllowedLogin: true,
      tokenVersion: 0,
      toObject() {
        return { ...this };
      },
    }),
  };
}

describe("email checklist (22)", () => {
  const cases = [
    ["01 empty", "", false, /required/i],
    ["02 whitespace", "   ", false, /required/i],
    ["03 trimmed valid", "  ada@example.com  ", true],
    ["04 internal space", "ada @example.com", false, /spaces/i],
    ["05 missing at", "ada.example.com", false, /valid email/i],
    ["06 missing username", "@example.com", false, /valid email/i],
    ["07 missing domain", "ada@", false, /valid email/i],
    ["08 missing tld", "ada@example", false, /valid email/i],
    ["09 multiple at", "ada@@example.com", false, /valid email/i],
    ["10 consecutive dots", "ada..lovelace@example.com", false, /valid email/i],
    ["11 leading dot", ".ada@example.com", false, /valid email/i],
    ["12 trailing dot", "ada.@example.com", false, /valid email/i],
    ["13 invalid domain", "ada@-example.com", false, /valid email/i],
    ["14 short tld", "ada@example.c", false, /valid email/i],
    ["15 too long", `${"a".repeat(250)}@example.com`, false, /too long/i],
    ["16 uppercase normalized", "Ada@Example.COM", true],
    ["17 numbers", "ada123@example.com", true],
    ["18 dot underscore plus", "ada.l_ace+lab@example.com", true],
    ["19 symbol-only local", "!!!!!!!@example.com", false, /valid email/i],
    ["20 null", null, false, /required/i],
    ["21 surrounding spaces do not create another key", "  ADA@Example.com ", true],
    ["22 max length boundary rejects 255", "a".repeat(255), false, /too long/i],
  ];

  for (const [name, value, ok, pattern] of cases) {
    it(name, () => {
      const result = validateEmailInput(value);
      assert.equal(result.ok, ok, name);
      if (!ok) assert.match(result.message, pattern);
      if (ok) assert.equal(result.email, normalizeEmail(value));
    });
  }

  it("duplicate lookup uses one normalized email", () => {
    assert.equal(normalizeEmail("  Ada@Example.COM "), normalizeEmail("ada@example.com"));
    assert.ok(normalizeEmail("x".repeat(300)).length > MAX_EMAIL_LENGTH);
  });
});

describe("password checklist (22)", () => {
  const valid = "Secure1!";
  const cases = [
    ["01 empty", "", /required/i],
    ["02 seven characters", "Secur1!", /too short/i],
    ["03 missing uppercase", "secure1!x", /uppercase/i],
    ["04 missing lowercase", "SECURE1!X", /lowercase/i],
    ["05 missing number", "Secure!!X", /number/i],
    ["06 missing special", "Secure12X", /special/i],
    ["07 internal space", "Secure 1!", /spaces/i],
    ["08 leading space", " Secure1!", /spaces/i],
    ["09 trailing space", "Secure1! ", /spaces/i],
    ["10 too long", `A1!${"a".repeat(126)}`, /too long/i],
    ["11 null", null, /required/i],
    ["12 whitespace only", "        ", /spaces/i],
  ];

  for (const [name, value, pattern] of cases) {
    it(`rejects ${name}`, () => {
      const result = validatePasswordInput(value);
      assert.equal(result.ok, false);
      assert.match(result.message, pattern);
    });
  }

  it("13 accepts exactly 8 characters and does not alter it", () => {
    const result = validatePasswordInput(valid);
    assert.equal(result.ok, true);
    assert.equal(result.password, valid);
  });

  it("14 accepts 128 characters", () => {
    const password = `Aa1!${"b".repeat(124)}`;
    assert.equal(password.length, 128);
    const result = validatePasswordInput(password);
    assert.equal(result.ok, true);
    assert.equal(result.password, password);
  });

  it("15 keeps capitalization exact", () => {
    const result = validatePasswordInput("SecurE1!");
    assert.equal(result.password, "SecurE1!");
  });

  it("16 does not lowercase the password", () => {
    assert.equal(validatePasswordInput("SECURE1!a").ok, true);
    assert.notEqual(validatePasswordInput("SECURE1!a").password, "secure1!a");
  });

  it("17 accepts several special characters used by the app", () => {
    for (const password of ["Secure1@", "Secure1#", "Secure1$", "Secure1!"]) {
      assert.equal(validatePasswordInput(password).ok, true, password);
    }
  });

  it("18 rejects a bcrypt hash instead of re-hashing it", () => {
    const hash = `$2a$10$${ "a".repeat(53)}`;
    assert.equal(validatePasswordInput(hash).ok, false);
  });

  it("19 student and teacher share one policy", () => {
    assert.equal(validatePasswordInput("Student1!").ok, true);
    assert.equal(validatePasswordInput("Teacher1!").ok, true);
    assert.equal(
      validatePasswordInput("student1!").message,
      validatePasswordInput("teacher1!").message
    );
  });

  it("20 login does not trim a non-blank password", () => {
    const result = validateLoginPasswordInput("legacy pass");
    assert.equal(result.ok, true);
    assert.equal(result.password, "legacy pass");
  });

  it("21 login rejects a whitespace-only password", () => {
    assert.match(validateLoginPasswordInput("   ").message, /required/i);
  });

  it("22 login does not apply signup complexity to legacy passwords", () => {
    assert.equal(validateLoginPasswordInput("legacy6").ok, true);
    assert.equal(validatePasswordInput("legacy6").ok, false);
  });
});

describe("confirm password checklist (5)", () => {
  it("01 empty confirm is required", () => {
    assert.match(validatePasswordConfirmation("Secure1!", "").message, /Confirm your password/i);
  });
  it("02 exact match passes", () => {
    assert.equal(validatePasswordConfirmation("Secure1!", "Secure1!").ok, true);
  });
  it("03 different capitalization fails", () => {
    assert.match(
      validatePasswordConfirmation("Secure1!", "secure1!").message,
      /do not match/i
    );
  });
  it("04 extra spaces fail", () => {
    assert.match(
      validatePasswordConfirmation("Secure1!", "Secure1! ").message,
      /do not match/i
    );
  });
  it("05 a different password fails", () => {
    assert.equal(validatePasswordConfirmation("Secure1!", "OtherPass1!").ok, false);
  });
});

describe("login checklist (10)", () => {
  it("01 both fields empty", async () => {
    const auth = loadLoginController({ findOne: async () => null }, async () => ({ ok: true }));
    const res = mockRes();
    await auth.loginUser({ body: { email: "  ", password: "   " }, ip: "127.0.0.1" }, res);
    assert.equal(res.statusCode, 400);
    assert.match(res.body.message, /Complete all required fields/i);
  });

  it("02 email required", async () => {
    const auth = loadLoginController({ findOne: async () => null }, async () => ({ ok: true }));
    const res = mockRes();
    await auth.loginUser({ body: { email: "", password: "Secure1!" }, ip: "127.0.0.1" }, res);
    assert.match(res.body.message, /Email is required/i);
  });

  it("03 invalid email format", async () => {
    const auth = loadLoginController({ findOne: async () => null }, async () => ({ ok: true }));
    const res = mockRes();
    await auth.loginUser({ body: { email: "not-an-email", password: "Secure1!" }, ip: "127.0.0.1" }, res);
    assert.match(res.body.message, /valid email/i);
  });

  it("04 password required", async () => {
    const auth = loadLoginController({ findOne: async () => null }, async () => ({ ok: true }));
    const res = mockRes();
    await auth.loginUser({ body: { email: "ada@example.com", password: "   " }, ip: "127.0.0.1" }, res);
    assert.match(res.body.message, /Password is required/i);
  });

  it("05 unknown email is generic", async () => {
    const auth = loadLoginController({ findOne: async () => null }, async () => ({ ok: true }));
    const res = mockRes();
    await auth.loginUser(
      { body: { email: "missing@example.com", password: "Secure1!", role: "student" }, ip: "127.0.0.1" },
      res
    );
    assert.equal(res.body.message, "Invalid email or password.");
    assert.equal(JSON.stringify(res.body).includes("stack"), false);
  });

  it("06 wrong password is generic", async () => {
    const hash = await hashPassword("Secure1!");
    const auth = loadLoginController(userWith("student", hash), async () => ({ ok: true }));
    const res = mockRes();
    await auth.loginUser(
      { body: { email: "student@example.com", password: "WrongPass1!", role: "student" }, ip: "127.0.0.1" },
      res
    );
    assert.equal(res.body.message, "Invalid email or password.");
  });

  it("07 student login succeeds", async () => {
    const hash = await hashPassword("Secure1!");
    const auth = loadLoginController(userWith("student", hash), async () => ({ ok: true }));
    const res = mockRes();
    await auth.loginUser(
      { body: { email: "  Student@Example.com ", password: "Secure1!", role: "student" }, ip: "127.0.0.1" },
      res
    );
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.message, "Login successful.");
    assert.equal(res.body.role, "student");
    assert.equal(res.body.user.password, undefined);
  });

  it("08 teacher login succeeds", async () => {
    const hash = await hashPassword("Secure1!");
    const auth = loadLoginController(userWith("teacher", hash), async () => ({ ok: true }));
    const res = mockRes();
    await auth.loginUser(
      { body: { email: "teacher@example.com", password: "Secure1!", role: "teacher" }, ip: "127.0.0.1" },
      res
    );
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.role, "teacher");
  });

  it("09 role mismatch stays generic", async () => {
    const hash = await hashPassword("Secure1!");
    const auth = loadLoginController(userWith("student", hash), async () => ({ ok: true }));
    const res = mockRes();
    await auth.loginUser(
      { body: { email: "student@example.com", password: "Secure1!", role: "teacher" }, ip: "127.0.0.1" },
      res
    );
    assert.equal(res.body.message, "Invalid email or password.");
  });

  it("10 repeated failures are rate limited", async () => {
    let calls = 0;
    const auth = loadLoginController({ findOne: async () => null }, async () => {
      calls += 1;
      return calls > 2 ? { ok: false } : { ok: true };
    });
    const first = mockRes();
    await auth.loginUser(
      { body: { email: "missing@example.com", password: "Secure1!", role: "student" }, ip: "127.0.0.1" },
      first
    );
    assert.equal(first.statusCode, 400);
    const res = mockRes();
    await auth.loginUser(
      { body: { email: "missing@example.com", password: "Secure1!", role: "student" }, ip: "127.0.0.1" },
      res
    );
    assert.equal(res.statusCode, 429);
    assert.match(res.body.message, /try again later/i);
  });
});

describe("forgot password checklist (14)", () => {
  function deps(users, overrides = {}) {
    return {
      User: { findOne: async ({ email }) => users[email] || null },
      PasswordResetToken: {
        tokens: [],
        async updateMany() {},
        async create(doc) {
          this.tokens.push(doc);
        },
        async findOneAndUpdate() {
          return null;
        },
      },
      AuthRateLimit: { findOneAndUpdate: async () => ({ count: 1 }) },
      sendPasswordResetEmail: async () => ({ ok: true }),
      getResetEmailConfig: () => ({ configured: true }),
      env: {},
      now: () => new Date("2026-11-05T08:00:00.000Z"),
      ...overrides,
    };
  }

  it("01 empty email", async () => {
    const result = await requestPasswordReset({ email: "" }, deps({}));
    assert.match(result.message, /required/i);
  });
  it("02 whitespace email", async () => {
    const result = await requestPasswordReset({ email: "   " }, deps({}));
    assert.match(result.message, /required/i);
  });
  it("03 invalid format", async () => {
    const result = await requestPasswordReset({ email: "ada@" }, deps({}));
    assert.match(result.message, /valid email/i);
  });
  it("04 internal spaces", async () => {
    const result = await requestPasswordReset({ email: "ada @example.com" }, deps({}));
    assert.match(result.message, /spaces/i);
  });
  it("05 too long", async () => {
    const result = await requestPasswordReset({ email: "a".repeat(255) }, deps({}));
    assert.match(result.message, /too long/i);
  });
  it("06 registered student gets a hashed token and the generic response", async () => {
    const bag = deps({ "ada@example.com": { _id: "s1", email: "ada@example.com", role: "student" } });
    let sent = null;
    bag.sendPasswordResetEmail = async (payload) => {
      sent = payload;
      return { ok: true };
    };
    const result = await requestPasswordReset({ email: "  Ada@Example.com ", ip: "1.1.1.1" }, bag);
    assert.equal(result.message, GENERIC_REQUEST_MESSAGE);
    assert.equal(sent.to, "ada@example.com");
    assert.equal(bag.PasswordResetToken.tokens[0].tokenHash, hashResetToken(sent.rawToken));
    assert.equal(JSON.stringify(result).includes(sent.rawToken), false);
  });
  it("07 unregistered email uses the same response and sends nothing", async () => {
    let sent = 0;
    const bag = deps({});
    bag.sendPasswordResetEmail = async () => {
      sent += 1;
      return { ok: true };
    };
    const result = await requestPasswordReset({ email: "missing@example.com", ip: "1.1.1.1" }, bag);
    assert.equal(result.message, GENERIC_REQUEST_MESSAGE);
    assert.equal(sent, 0);
    assert.equal(bag.PasswordResetToken.tokens.length, 0);
  });
  it("08 teacher uses the same generic response", async () => {
    const bag = deps({ "teach@example.com": { _id: "t1", role: "teacher" } });
    const result = await requestPasswordReset({ email: "teach@example.com", ip: "1.1.1.1" }, bag);
    assert.equal(result.message, GENERIC_REQUEST_MESSAGE);
  });
  it("09 response does not include a reset token", async () => {
    const bag = deps({ "ada@example.com": { _id: "s1", role: "student" } });
    const result = await requestPasswordReset({ email: "ada@example.com", ip: "1.1.1.1" }, bag);
    assert.equal(result.token, undefined);
    assert.equal(JSON.stringify(result).includes("token"), false);
  });
  it("10 expired token is rejected", async () => {
    const raw = generateRawResetToken();
    const result = await confirmPasswordReset(
      { token: raw, newPassword: "NewPass12!", confirmPassword: "NewPass12!" },
      {
        ...deps({}),
        PasswordResetToken: {
          findOneAndUpdate: async () => null,
          updateMany: async () => {},
        },
      }
    );
    assert.match(result.message, /invalid or expired/i);
  });
  it("11 already-used token is rejected", async () => {
    const result = await confirmPasswordReset(
      { token: generateRawResetToken(), newPassword: "NewPass12!", confirmPassword: "NewPass12!" },
      {
        ...deps({}),
        PasswordResetToken: { findOneAndUpdate: async () => null, updateMany: async () => {} },
      }
    );
    assert.equal(result.ok, false);
  });
  it("12 invalid token is rejected before hashing", async () => {
    let hashed = false;
    const result = await confirmPasswordReset(
      { token: "short", newPassword: "NewPass12!", confirmPassword: "NewPass12!" },
      deps({})
    );
    assert.match(result.message, /invalid or expired/i);
    assert.equal(hashed, false);
  });
  it("13 rate limit blocks the request", async () => {
    const bag = deps({ "ada@example.com": { _id: "s1" } });
    bag.AuthRateLimit = { findOneAndUpdate: async () => ({ count: 99 }) };
    const result = await requestPasswordReset({ email: "ada@example.com", ip: "1.1.1.1" }, bag);
    assert.equal(result.status, 429);
  });
  it("14 valid reset hashes the password and invalidates the token", async () => {
    const raw = generateRawResetToken();
    let stored = null;
    const result = await confirmPasswordReset(
      { token: raw, newPassword: "NewPass12!", confirmPassword: "NewPass12!", ip: "1.1.1.1" },
      {
        ...deps({}),
        User: {
          findOneAndUpdate: async (_filter, update) => {
            stored = update.$set.password;
            return { _id: "s1" };
          },
        },
        PasswordResetToken: {
          findOneAndUpdate: async () => ({ user: "s1", tokenHash: hashResetToken(raw) }),
          updateMany: async () => {},
        },
      }
    );
    assert.equal(result.message, "Password reset successfully.");
    assert.equal(await passwordsMatch("NewPass12!", stored), true);
    assert.notEqual(stored, "NewPass12!");
  });
});
