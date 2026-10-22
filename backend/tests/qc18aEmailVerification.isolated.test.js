const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { describe, it, beforeEach } = require("node:test");

const root = path.join(__dirname, "..", "..");
const {
  getLoginDenialReason,
  canUserLogin,
} = require("../utils/authPassword");
const {
  hashToken,
  generateRawToken,
  issueEmailVerificationToken,
  verifyEmailWithToken,
  sendSignupVerificationEmail,
  createDefaultDeps,
} = require("../services/emailVerificationService");
const {
  getEmailConfig,
  buildVerificationLink,
  templateSignupVerification,
  templateAdminNewRegistration,
  templateApplicantApproved,
  templateApplicantRejected,
  sendTransactionalEmail,
} = require("../services/transactionalEmail");
const {
  notifyAdminsOfVerifiedRegistration,
  sendApplicantDecisionEmail,
} = require("../services/registrationNotificationService");

const verifyPagePath = path.join(
  root,
  "frontend",
  "src",
  "pages",
  "authentication",
  "VerifyEmail.jsx"
);
const appRoutesPath = path.join(root, "frontend", "src", "routes", "AppRoutes.jsx");
const authRoutesPath = path.join(root, "backend", "routes", "authRoutes.js");

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
      const now = new Date();
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

describe("QC-18A dual-gate login logic", () => {
  it("blocks unverified email even if otherwise approved", () => {
    const reason = getLoginDenialReason({
      emailVerified: false,
      approvalStatus: "approved",
      isAllowedLogin: true,
    });
    assert.match(reason, /verify your email/i);
    assert.equal(canUserLogin({ emailVerified: false, approvalStatus: "approved" }), false);
  });

  it("blocks pending approval after email verification", () => {
    const reason = getLoginDenialReason({
      emailVerified: true,
      approvalStatus: "pending",
      isAllowedLogin: false,
    });
    assert.match(reason, /pending Admin approval/i);
  });

  it("allows login only when verified + approved + allowed", () => {
    assert.equal(
      canUserLogin({
        emailVerified: true,
        approvalStatus: "approved",
        isAllowedLogin: true,
      }),
      true
    );
  });

  it("treats missing emailVerified as legacy-verified", () => {
    assert.equal(
      canUserLogin({ approvalStatus: "approved", isAllowedLogin: true }),
      true
    );
  });
});

describe("QC-18A email templates and config", () => {
  it("requires Resend env trio for configuration", () => {
    assert.equal(getEmailConfig({}).configured, false);
    assert.equal(
      getEmailConfig({
        RESEND_API_KEY: "re_x",
        PASSWORD_RESET_FROM_EMAIL: "QuickCheck Hub <noreply@example.com>",
        PUBLIC_APP_URL: "https://quick-check-hub-frontend.vercel.app",
      }).configured,
      true
    );
    assert.equal(
      getEmailConfig({
        RESEND_API_KEY: "re_x",
        PASSWORD_RESET_FROM_EMAIL: "QuickCheck Hub <noreply@example.com>",
        FRONTEND_URL: "https://quick-check-hub-frontend.vercel.app",
      }).configured,
      true
    );
    assert.equal(
      getEmailConfig({
        NODE_ENV: "production",
        RESEND_API_KEY: "re_x",
        PASSWORD_RESET_FROM_EMAIL: "QuickCheck Hub <noreply@example.com>",
        PUBLIC_APP_URL: "https://duke.com.pk",
      }).configured,
      false
    );
  });

  it("builds production verification links from the Vercel API origin", () => {
    const link = buildVerificationLink(
      "https://quickcheck-hub-backend.vercel.app/",
      "abc123"
    );
    assert.equal(
      link,
      "https://quickcheck-hub-backend.vercel.app/api/auth/verify-email?token=abc123"
    );
    assert.match(link, /\/api\/auth\/verify-email\?token=abc123/);
    assert.doesNotMatch(link, /localhost|duke\.com\.pk/i);
  });

  it("templates omit secrets and include required content", () => {
    const v = templateSignupVerification({
      name: "Ada",
      verifyLink: "https://duke.com.pk/verify-email?token=x",
      expiresHours: 24,
    });
    assert.match(v.subject, /Verify/i);
    assert.match(v.text, /administrator/i);
    assert.doesNotMatch(v.text, /password|jwt|tokenHash/i);

    const a = templateAdminNewRegistration({
      applicantName: "Ada",
      applicantEmail: "ada@example.com",
      role: "student",
      registeredAt: new Date("2026-10-13T00:00:00Z"),
      adminLink: "https://duke.com.pk/dashboard/admin",
    });
    assert.match(a.text, /ada@example.com/);
    assert.match(a.text, /student/);
    assert.doesNotMatch(a.text, /password|jwt/i);

    assert.match(
      templateApplicantApproved({ name: "Ada", loginLink: "https://duke.com.pk/login" })
        .text,
      /approved/i
    );
    assert.match(templateApplicantRejected({ name: "Ada" }).text, /not approved/i);
  });

  it("sendTransactionalEmail fails closed when unconfigured", async () => {
    const result = await sendTransactionalEmail(
      { to: "a@b.com", subject: "s", text: "t", html: "<p>t</p>" },
      { env: {}, fetchImpl: async () => ({ ok: true }) }
    );
    assert.equal(result.ok, false);
    assert.equal(result.code, "EMAIL_NOT_CONFIGURED");
  });
});

describe("QC-18A verification token lifecycle (mocked stores)", () => {
  it("generates high-entropy tokens and stores only hashes", () => {
    const raw = generateRawToken();
    assert.ok(raw.length >= 64);
    const hash = hashToken(raw);
    assert.notEqual(hash, raw);
    assert.equal(hash.length, 64);
  });

  it("issues, verifies once, and rejects reuse/expiry", async () => {
    const tokens = memoryTokenStore();
    let userDoc = {
      _id: "u1",
      name: "Ada",
      email: "ada@example.com",
      role: "student",
      approvalStatus: "pending",
      emailVerified: false,
      adminNotifiedAt: null,
      createdAt: new Date(),
    };

    const deps = {
      EmailVerificationToken: tokens,
      User: {
        findOneAndUpdate(filter, update) {
          if (String(filter._id) !== String(userDoc._id)) {
            return { select() { return Promise.resolve(null); } };
          }
          Object.assign(userDoc, update.$set || {});
          const result = { ...userDoc };
          return {
            select() {
              return Promise.resolve(result);
            },
          };
        },
      },
      now: () => new Date(),
      notifyAdminsOfVerifiedRegistration: async () => ({ notified: true }),
    };

    const issued = await issueEmailVerificationToken(userDoc, deps);
    assert.equal(tokens.rows.length, 1);
    assert.equal(tokens.rows[0].tokenHash, hashToken(issued.rawToken));

    const first = await verifyEmailWithToken(issued.rawToken, deps);
    assert.equal(first.ok, true);
    assert.equal(userDoc.emailVerified, true);
    assert.equal(first.user.approvalStatus, "pending");

    const reuse = await verifyEmailWithToken(issued.rawToken, deps);
    assert.equal(reuse.ok, false);
    assert.equal(reuse.status, 400);

    // Expired token
    const issued2 = await issueEmailVerificationToken(userDoc, deps);
    tokens.rows[tokens.rows.length - 1].expiresAt = new Date(Date.now() - 1000);
    tokens.rows[tokens.rows.length - 1].usedAt = null;
    const expired = await verifyEmailWithToken(issued2.rawToken, deps);
    assert.equal(expired.ok, false);
  });

  it("verification email send uses mocked transport and never throws secrets", async () => {
    let captured = null;
    const result = await sendSignupVerificationEmail(
      { name: "Ada", email: "ada@example.com" },
      "raw-token-value",
      {
        getEmailConfig: () => ({
          configured: true,
          apiKey: "re_secret",
          fromEmail: "QuickCheck Hub <noreply@example.com>",
          publicAppUrl: "https://quick-check-hub-frontend.vercel.app",
          publicApiUrl: "https://quickcheck-hub-backend.vercel.app",
        }),
        env: {},
        fetchImpl: async () => ({ ok: true }),
        sendTransactionalEmail: async (payload) => {
          captured = payload;
          return { ok: true };
        },
      }
    );
    assert.equal(result.ok, true);
    assert.match(
      captured.text,
      /\/api\/auth\/verify-email\?token=raw-token-value/
    );
    assert.doesNotMatch(captured.text, /re_secret/);
  });
});

describe("QC-18A admin notify idempotency (mocked)", () => {
  it("notifies once and skips duplicates", async () => {
    let notifiedFlag = null;
    let notificationCreates = 0;
    let emails = 0;
    const user = {
      _id: "u1",
      name: "Ada",
      email: "ada@example.com",
      role: "student",
      createdAt: new Date(),
    };

    const deps = {
      User: {
        findOneAndUpdate(filter, update) {
          if (notifiedFlag) {
            return { select() { return Promise.resolve(null); } };
          }
          notifiedFlag = update.$set.adminNotifiedAt;
          return {
            select() {
              return Promise.resolve({ ...user, adminNotifiedAt: notifiedFlag });
            },
          };
        },
        find() {
          return {
            select() {
              return this;
            },
            lean: async () => [{ _id: "admin1", email: "rabeelramzan50@gmail.com" }],
          };
        },
      },
      createNotification: async () => {
        notificationCreates += 1;
        return { _id: "n1" };
      },
      Notification: { create: async () => ({}) },
      getEmailConfig: () => ({
        configured: true,
        publicAppUrl: "https://duke.com.pk",
        apiKey: "re_x",
        fromEmail: "QuickCheck Hub <noreply@example.com>",
      }),
      sendTransactionalEmail: async () => {
        emails += 1;
        return { ok: true };
      },
      env: {},
      now: () => new Date(),
      fetchImpl: async () => ({ ok: true }),
    };

    const first = await notifyAdminsOfVerifiedRegistration(user, deps);
    const second = await notifyAdminsOfVerifiedRegistration(user, deps);
    assert.equal(first.notified, true);
    assert.equal(second.notified, false);
    assert.equal(notificationCreates, 1);
    assert.equal(emails, 1);
  });

  it("decision emails do not throw when unconfigured", async () => {
    const result = await sendApplicantDecisionEmail(
      { name: "Ada", email: "ada@example.com", role: "student" },
      "approved",
      {
        getEmailConfig: () => ({ configured: false }),
        sendTransactionalEmail: async () => ({ ok: true }),
        env: {},
      }
    );
    assert.equal(result.ok, false);
  });
});

describe("QC-18A frontend/route contracts", () => {
  it("wires /verify-email page and auth routes", () => {
    const page = fs.readFileSync(verifyPagePath, "utf8");
    const routes = fs.readFileSync(appRoutesPath, "utf8");
    const authRoutes = fs.readFileSync(authRoutesPath, "utf8");
    assert.match(page, /verify-email/);
    assert.match(page, /awaiting Admin approval/);
    assert.match(page, /resend-verification/);
    assert.match(routes, /path="\/verify-email"/);
    assert.match(authRoutes, /verify-email/);
    assert.match(authRoutes, /resend-verification/);
  });
});
