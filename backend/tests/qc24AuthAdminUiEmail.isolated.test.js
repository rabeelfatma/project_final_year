/**
 * QC-24 — Auth/Admin registration UI contracts + Resend fail-closed diagnostics.
 * Isolated only: no Mongo, no live Resend, no secrets.
 */
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "../..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

const {
  sendTransactionalEmail,
  recipientDomain,
  categorizeEmailProviderFailure,
  getEmailConfig,
} = require("../services/transactionalEmail");
const {
  resendVerificationEmail,
  sendSignupVerificationEmail,
  issueEmailVerificationToken,
} = require("../services/emailVerificationService");

describe("QC-24 auth form layout + validation UI contracts", () => {
  it("keeps compact auth shell/card and password helper text", () => {
    const css = read("frontend/src/index.css");
    const signup = read("frontend/src/pages/authentication/PublicSignup.jsx");
    const login = read("frontend/src/pages/authentication/Login.jsx");
    const verify = read("frontend/src/pages/authentication/VerifyEmail.jsx");

    assert.match(css, /\.qc-auth-shell\s*\{/);
    assert.match(css, /\.qc-auth-card\s*\{/);
    assert.match(css, /\.qc-btn-block\s*\{[\s\S]*max-width:\s*100%/);
    assert.match(css, /\.qc-field-error/);
    assert.match(css, /\.qc-field-error-text/);
    assert.match(css, /\.qc-alert\s*\{/);

    assert.match(
      signup,
      /Password must be 8\+ characters with uppercase, lowercase, number & special character\./
    );
    assert.match(signup, /qc-field-error/);
    assert.match(signup, /qc-field-error-text/);
    assert.match(signup, /Resubmit Registration Request|Submit Registration Request/);
    assert.match(signup, /Already have an account\?/);
    assert.match(signup, /showPass/);
    assert.match(signup, /confirmPassword/);
    assert.doesNotMatch(signup, /ring-1 ring-rose-400/);

    assert.match(login, /qc-auth-shell/);
    assert.match(login, /Forgot Password\?/);
    assert.match(verify, /Resend Verification Email/);
    assert.match(verify, /EMAIL_PROVIDER_ERROR|EMAIL_NOT_CONFIGURED/);
  });

  it("Alert stays compact with role=alert and no oversized padding classes", () => {
    const alert = read("frontend/src/components/ui/Alert.jsx");
    assert.match(alert, /role="alert"/);
    assert.match(alert, /qc-alert/);
    assert.match(alert, /py-1\.5/);
    assert.match(alert, /text-xs/);
    assert.doesNotMatch(alert, /py-4|text-lg|min-h-\[/);
  });

  it("Admin Registration Requests table fits review tabs without desktop min-width scroll", () => {
    const css = read("frontend/src/index.css");
    const admin = read("frontend/src/pages/dashboards/AdminDashboard.jsx");

    assert.match(css, /\.qc-table--registration/);
    assert.match(css, /\.qc-table-wrap--registration/);
    assert.match(css, /\.qc-table--registration-review/);
    assert.match(css, /\.qc-table--registration-pending/);
    assert.match(css, /\.qc-email-cell/);
    assert.match(css, /align-items:\s*safe center/);
    assert.match(css, /word-break:\s*normal/);
    assert.doesNotMatch(css, /\.qc-table--registration\s*\{[^}]*min-width:\s*68rem/);
    assert.doesNotMatch(css, /\.qc-email-cell[\s\S]{0,120}break-all/);
    assert.doesNotMatch(css, /word-break:\s*break-all/);

    assert.match(admin, /qc-table-wrap--registration/);
    assert.match(admin, /qc-table--registration-review/);
    assert.match(admin, /qc-table--registration-pending/);
    assert.match(admin, /qc-email-cell/);
    assert.match(admin, /Pending Requests/);
    assert.match(admin, /Approved/);
    assert.match(admin, /Rejected/);
    assert.match(admin, /Reapplied/);
    assert.match(admin, /applicationAttempt/);
    assert.doesNotMatch(admin, /className="theme-muted break-all"/);
  });
});

describe("QC-24 transactional email diagnostics (mocked provider)", () => {
  it("categorizes provider HTTP and network failures without secrets", () => {
    assert.equal(
      categorizeEmailProviderFailure({ status: 401 }),
      "auth_rejected"
    );
    assert.equal(
      categorizeEmailProviderFailure({ status: 422 }),
      "validation_rejected"
    );
    assert.equal(
      categorizeEmailProviderFailure({ status: 429 }),
      "rate_limited"
    );
    assert.equal(
      categorizeEmailProviderFailure({ status: 503 }),
      "provider_unavailable"
    );
    assert.equal(
      categorizeEmailProviderFailure({ networkError: true }),
      "network_failure"
    );
    assert.equal(recipientDomain("Ada <ada@example.com>"), "example.com");
    assert.equal(recipientDomain("ada@campus.edu"), "campus.edu");
  });

  it("fails closed when unconfigured and does not call fetch", async () => {
    let called = 0;
    const result = await sendTransactionalEmail(
      { to: "ada@example.com", subject: "s", text: "t", html: "<p>t</p>" },
      {
        env: {},
        fetchImpl: async () => {
          called += 1;
          return { ok: true, status: 200 };
        },
      }
    );
    assert.equal(result.ok, false);
    assert.equal(result.code, "EMAIL_NOT_CONFIGURED");
    assert.equal(called, 0);
    assert.equal(getEmailConfig({}).configured, false);
  });

  it("maps provider HTTP rejection to EMAIL_PROVIDER_ERROR with sanitized category", async () => {
    const result = await sendTransactionalEmail(
      { to: "ada@example.com", subject: "s", text: "t", html: "<p>t</p>" },
      {
        env: {
          RESEND_API_KEY: "re_test_key",
          PASSWORD_RESET_FROM_EMAIL: "QuickCheck Hub <noreply@example.com>",
          PUBLIC_APP_URL: "http://localhost:5173",
          PUBLIC_API_URL: "http://127.0.0.1:5000/api",
        },
        fetchImpl: async () => ({
          ok: false,
          status: 422,
          json: async () => ({ message: "should-not-surface" }),
        }),
      }
    );
    assert.equal(result.ok, false);
    assert.equal(result.code, "EMAIL_PROVIDER_ERROR");
    assert.equal(result.category, "validation_rejected");
    assert.equal(result.providerStatus, 422);
    assert.equal(result.message, "Email provider rejected the message.");
    assert.doesNotMatch(JSON.stringify(result), /should-not-surface|re_test_key/);
  });

  it("maps network failure to EMAIL_PROVIDER_ERROR network_failure", async () => {
    const result = await sendTransactionalEmail(
      { to: "ada@example.com", subject: "s", text: "t", html: "<p>t</p>" },
      {
        env: {
          RESEND_API_KEY: "re_test_key",
          PASSWORD_RESET_FROM_EMAIL: "noreply@example.com",
          PUBLIC_APP_URL: "http://localhost:5173",
          PUBLIC_API_URL: "http://127.0.0.1:5000/api",
        },
        fetchImpl: async () => {
          throw new Error("ECONNREFUSED");
        },
      }
    );
    assert.equal(result.ok, false);
    assert.equal(result.code, "EMAIL_PROVIDER_ERROR");
    assert.equal(result.category, "network_failure");
    assert.equal(result.providerStatus, null);
  });

  it("succeeds with mocked provider 200 without live send", async () => {
    let bodies = 0;
    const result = await sendTransactionalEmail(
      { to: "ada@example.com", subject: "s", text: "t", html: "<p>t</p>" },
      {
        env: {
          RESEND_API_KEY: "re_test_key",
          PASSWORD_RESET_FROM_EMAIL: "noreply@example.com",
          PUBLIC_APP_URL: "http://localhost:5173",
          PUBLIC_API_URL: "http://127.0.0.1:5000/api",
        },
        fetchImpl: async (_url, init) => {
          bodies += 1;
          const parsed = JSON.parse(init.body);
          assert.equal(parsed.to[0], "ada@example.com");
          assert.ok(!JSON.stringify(parsed).includes("re_test_key"));
          return { ok: true, status: 200 };
        },
      }
    );
    assert.equal(result.ok, true);
    assert.equal(bodies, 1);
  });
});

describe("QC-24 resend verification fail-closed (mocked)", () => {
  it("resend fails closed on provider error and never marks email verified", async () => {
    const user = {
      _id: "u1",
      name: "Ada",
      email: "ada@example.com",
      role: "student",
      approvalStatus: "pending",
      emailVerified: false,
      pendingEmail: null,
    };
    let verifiedWrites = 0;
    const tokens = [];

    const result = await resendVerificationEmail(
      { email: "ada@example.com", ip: "127.0.0.1" },
      {
        User: {
          findOne: async (filter) => {
            if (filter.email === "ada@example.com") return user;
            if (filter.pendingEmail === "ada@example.com") return null;
            return null;
          },
          findById: async () => user,
          findOneAndUpdate: async (_f, update) => {
            if (update?.$set?.emailVerified === true) verifiedWrites += 1;
            return user;
          },
        },
        EmailVerificationToken: {
          updateMany: async () => ({ acknowledged: true }),
          create: async (doc) => {
            tokens.push(doc);
            return doc;
          },
        },
        AuthRateLimit: {
          findOneAndUpdate: async () => ({ count: 1 }),
        },
        getEmailConfig: () => ({
          configured: true,
          publicAppUrl: "http://localhost:5173",
          publicApiUrl: "http://127.0.0.1:5000/api",
          apiKey: "re_x",
          fromEmail: "noreply@example.com",
        }),
        sendTransactionalEmail: async () => ({
          ok: false,
          code: "EMAIL_PROVIDER_ERROR",
          category: "http_rejected",
          providerStatus: 403,
          message: "Email provider rejected the message.",
        }),
        env: {},
        now: () => new Date(),
        fetchImpl: async () => ({ ok: false, status: 403 }),
      }
    );

    assert.equal(result.ok, false);
    assert.equal(result.status, 503);
    assert.equal(result.code, "EMAIL_PROVIDER_ERROR");
    assert.match(result.message, /temporarily unavailable/i);
    assert.equal(user.emailVerified, false);
    assert.equal(verifiedWrites, 0);
    assert.ok(tokens.length >= 1);
  });

  it("resend succeeds with mocked provider and leaves email unverified until token consume", async () => {
    const user = {
      _id: "u2",
      name: "Bea",
      email: "bea@example.com",
      role: "teacher",
      approvalStatus: "pending",
      emailVerified: false,
    };
    let sends = 0;

    const result = await resendVerificationEmail(
      { email: "bea@example.com", ip: "127.0.0.1" },
      {
        User: {
          findOne: async (filter) =>
            filter.email === "bea@example.com" ? user : null,
        },
        EmailVerificationToken: {
          updateMany: async () => ({ acknowledged: true }),
          create: async (doc) => doc,
        },
        AuthRateLimit: {
          findOneAndUpdate: async () => ({ count: 1 }),
        },
        getEmailConfig: () => ({
          configured: true,
          publicAppUrl: "http://localhost:5173",
          publicApiUrl: "http://127.0.0.1:5000/api",
          apiKey: "re_x",
          fromEmail: "noreply@example.com",
        }),
        sendTransactionalEmail: async () => {
          sends += 1;
          return { ok: true };
        },
        env: {},
        now: () => new Date(),
      }
    );

    assert.equal(result.ok, true);
    assert.equal(result.status, 200);
    assert.equal(sends, 1);
    assert.equal(user.emailVerified, false);
  });

  it("sendSignupVerificationEmail stays fail-closed when provider returns network failure", async () => {
    const sent = await sendSignupVerificationEmail(
      { _id: "u3", name: "Cara", email: "cara@example.com" },
      "raw-token-value-at-least-32-chars-long!!",
      {
        getEmailConfig: () => ({
          configured: true,
          publicAppUrl: "http://localhost:5173",
          publicApiUrl: "http://127.0.0.1:5000/api",
          apiKey: "re_x",
          fromEmail: "noreply@example.com",
        }),
        sendTransactionalEmail: async () => ({
          ok: false,
          code: "EMAIL_PROVIDER_ERROR",
          category: "network_failure",
          providerStatus: null,
        }),
        env: {},
        fetchImpl: async () => {
          throw new Error("network");
        },
      }
    );
    assert.equal(sent.ok, false);
    assert.equal(sent.code, "EMAIL_PROVIDER_ERROR");
  });

  it("issueEmailVerificationToken does not flip emailVerified", async () => {
    const user = {
      _id: "u4",
      email: "dana@example.com",
      emailVerified: false,
    };
    const issued = await issueEmailVerificationToken(user, {
      EmailVerificationToken: {
        updateMany: async () => ({ acknowledged: true }),
        create: async (doc) => doc,
      },
      now: () => new Date(),
    });
    assert.ok(issued.rawToken);
    assert.equal(user.emailVerified, false);
  });
});

describe("QC-24 QC-23 regression surface still present", () => {
  it("reapply identity uses accountEmail/accountId and same-details tests remain", () => {
    const auth = read("backend/controllers/authController.js");
    const signup = read("frontend/src/pages/authentication/PublicSignup.jsx");
    const qc23 = read("backend/tests/qc23Reapplication.isolated.test.js");

    assert.match(auth, /accountEmail|lockedAccountEmail|ACCOUNT_EMAIL_REQUIRED/);
    assert.match(auth, /reapplyPublicSignup/);
    assert.match(signup, /accountEmail|lockedAccountEmail/);
    assert.match(qc23, /reapply succeeds with exactly the same details/);
    assert.match(qc23, /VERIFICATION_EMAIL_FAILED/);
    assert.match(qc23, /emailVerified, false/);
  });
});
