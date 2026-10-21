/**
 * Isolated tests: email verification UX contracts, public URL construction,
 * and approved-only Students/Teachers management lists.
 * No live email, no production DB, no network.
 */
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const {
  resolvePublicAppUrl,
  isUsablePublicAppUrl,
  isLoopbackPublicUrl,
  isPrivateLanPublicUrl,
} = require("../utils/publicAppUrl");
const {
  resolveCorsOriginOption,
  isDevLanBrowserOrigin,
} = require("../utils/corsOrigins");
const { approvedRoleFilter } = require("../utils/approvedUserQuery");
const {
  getEmailConfig,
  buildVerificationLink,
} = require("../services/transactionalEmail");
const {
  buildResetLink,
  getResetEmailConfig,
} = require("../services/passwordResetEmail");
const {
  verifyEmailWithToken,
  issueEmailVerificationToken,
} = require("../services/emailVerificationService");

const root = path.join(__dirname, "..", "..");
const verifyPagePath = path.join(
  root,
  "frontend",
  "src",
  "pages",
  "authentication",
  "VerifyEmail.jsx"
);

function chainSelect(doc) {
  return {
    select() {
      return Promise.resolve(doc ? { ...doc } : null);
    },
  };
}

function mockTokenStore() {
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
      const row = { ...doc, _id: `tok-${rows.length + 1}` };
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

function mockUserStore(seed) {
  const users = Array.isArray(seed) ? seed.map((u) => ({ ...u })) : [];
  return {
    users,
    findById(id) {
      const u = users.find((x) => String(x._id) === String(id));
      return chainSelect(u || null);
    },
    findOneAndUpdate(filter, update) {
      const u = users.find(
        (x) =>
          String(x._id) === String(filter._id) &&
          (!filter.email || x.email === filter.email) &&
          (!filter.role?.$in || filter.role.$in.includes(x.role))
      );
      if (!u) return chainSelect(null);
      Object.assign(u, update.$set || {});
      return chainSelect(u);
    },
    find(filter) {
      const role = filter.role;
      const nin = filter.approvalStatus?.$nin || [];
      const matched = users.filter((u) => {
        if (u.role !== role) return false;
        if (nin.length && nin.includes(u.approvalStatus)) return false;
        return true;
      });
      return {
        select: () => ({
          lean: async () => matched,
          sort: () => ({ lean: async () => matched }),
        }),
        lean: async () => matched,
      };
    },
  };
}

describe("public app URL construction (local vs configured)", () => {
  it("builds local verification links from PUBLIC_APP_URL", () => {
    const base = resolvePublicAppUrl({
      PUBLIC_APP_URL: "http://localhost:5173/",
    });
    assert.equal(base, "http://localhost:5173");
    assert.equal(
      buildVerificationLink(base, "tok123"),
      "http://localhost:5173/verify-email?token=tok123"
    );
    assert.equal(isUsablePublicAppUrl(base, { NODE_ENV: "development" }), true);
  });

  it("uses the Vercel frontend when production has no configured origin", () => {
    const { PRODUCTION_FRONTEND_ORIGIN } = require("../utils/publicAppUrl");
    const base = resolvePublicAppUrl({ NODE_ENV: "production" });
    assert.equal(base, PRODUCTION_FRONTEND_ORIGIN);
    assert.equal(
      buildVerificationLink(base, "vercel-default"),
      `${PRODUCTION_FRONTEND_ORIGIN}/verify-email?token=vercel-default`
    );
    assert.equal(isUsablePublicAppUrl(base, { NODE_ENV: "production" }), true);
    assert.doesNotMatch(base, /quickcheck-hub-backend|localhost|192\.168|duke\.com\.pk/i);
  });

  it("ignores Host headers and rejects the backend API host and retired Hostinger host", () => {
    const { PRODUCTION_FRONTEND_ORIGIN } = require("../utils/publicAppUrl");
    assert.equal(
      resolvePublicAppUrl({
        NODE_ENV: "production",
        HOST: "quickcheck-hub-backend.vercel.app",
        "X-Forwarded-Host": "evil.example.com",
      }),
      PRODUCTION_FRONTEND_ORIGIN
    );
    for (const bad of [
      "https://quickcheck-hub-backend.vercel.app",
      "https://quickcheck-hub-backend.vercel.app/api",
      "https://duke.com.pk",
      "https://www.duke.com.pk/",
    ]) {
      const cfg = getEmailConfig({
        NODE_ENV: "production",
        RESEND_API_KEY: "re_x",
        PASSWORD_RESET_FROM_EMAIL: "QuickCheck Hub <noreply@example.com>",
        PUBLIC_APP_URL: bad,
      });
      assert.equal(cfg.configured, false, bad);
      assert.equal(cfg.publicAppUrl, "", bad);
    }
  });

  it("builds Vercel frontend verification links from PUBLIC_APP_URL", () => {
    const vercelFrontend = "https://quickcheck-hub-frontend.vercel.app";
    const base = resolvePublicAppUrl({
      NODE_ENV: "production",
      PUBLIC_APP_URL: vercelFrontend,
      CLIENT_ORIGIN: vercelFrontend,
    });
    assert.equal(base, vercelFrontend);
    assert.equal(
      buildVerificationLink(base, "vercel-tok"),
      `${vercelFrontend}/verify-email?token=vercel-tok`
    );
    assert.doesNotMatch(base, /api\.|localhost|127\.0\.0\.1/i);
    assert.equal(isUsablePublicAppUrl(base, { NODE_ENV: "production" }), true);
  });

  it("builds local LAN verification links for same-Wi-Fi mobile testing", () => {
    const lan = "http://192.168.8.101:5173";
    const base = resolvePublicAppUrl({ PUBLIC_APP_URL: `${lan}/` });
    assert.equal(base, lan);
    assert.equal(isPrivateLanPublicUrl(base), true);
    assert.equal(isUsablePublicAppUrl(base, { NODE_ENV: "development" }), true);
    assert.equal(
      buildVerificationLink(base, "lan-tok"),
      `${lan}/verify-email?token=lan-tok`
    );
  });

  it("prefers LAN CLIENT_ORIGIN over localhost when PUBLIC_APP_URL is unset", () => {
    const base = resolvePublicAppUrl({
      CLIENT_ORIGIN: "http://localhost:5173,http://192.168.1.50:5173",
    });
    assert.equal(base, "http://192.168.1.50:5173");
    assert.equal(isLoopbackPublicUrl(base), false);
  });

  it("builds password-reset links from the Vercel frontend origin", () => {
    const frontend = "https://quick-check-hub-frontend.vercel.app";
    assert.equal(
      buildResetLink(`${frontend}/`, "reset-tok"),
      `${frontend}/reset-password#reset-tok`
    );
    const resetCfg = getResetEmailConfig({
      NODE_ENV: "production",
      RESEND_API_KEY: "re_x",
      PASSWORD_RESET_FROM_EMAIL: "QuickCheck Hub <noreply@example.com>",
    });
    assert.equal(resetCfg.configured, true);
    assert.equal(resetCfg.publicAppUrl, frontend);
    assert.doesNotMatch(resetCfg.publicAppUrl, /quickcheck-hub-backend|duke\.com\.pk/i);
  });

  it("builds configured production links and preserves token query", () => {
    const base = resolvePublicAppUrl({
      PUBLIC_APP_URL: "https://app.example.com/",
    });
    const link = buildVerificationLink(base, "abc def");
    assert.equal(
      link,
      "https://app.example.com/verify-email?token=abc%20def"
    );
    assert.doesNotMatch(link, /localhost/i);
    assert.match(link, /[?&]token=/);
  });

  it("prefers non-localhost CLIENT_ORIGIN when PUBLIC_APP_URL is unset", () => {
    const base = resolvePublicAppUrl({
      CLIENT_ORIGIN: "http://localhost:5173,https://app.example.com",
    });
    assert.equal(base, "https://app.example.com");
    assert.equal(isLoopbackPublicUrl(base), false);
  });

  it("explicit PUBLIC_APP_URL wins even when CLIENT_ORIGIN has a public host", () => {
    const base = resolvePublicAppUrl({
      PUBLIC_APP_URL: "http://localhost:5173",
      CLIENT_ORIGIN: "https://app.example.com",
    });
    assert.equal(base, "http://localhost:5173");
  });

  it("fails closed in production when only loopback URL is configured", () => {
    const cfg = getEmailConfig({
      NODE_ENV: "production",
      RESEND_API_KEY: "re_x",
      PASSWORD_RESET_FROM_EMAIL: "QuickCheck Hub <noreply@example.com>",
      PUBLIC_APP_URL: "http://localhost:5173",
    });
    assert.equal(cfg.configured, false);
    assert.equal(cfg.publicAppUrl, "");
  });

  it("fails closed in production when only private LAN URL is configured", () => {
    const cfg = getEmailConfig({
      NODE_ENV: "production",
      RESEND_API_KEY: "re_x",
      PASSWORD_RESET_FROM_EMAIL: "QuickCheck Hub <noreply@example.com>",
      PUBLIC_APP_URL: "http://192.168.8.101:5173",
    });
    assert.equal(cfg.configured, false);
    assert.equal(cfg.publicAppUrl, "");
    assert.equal(
      isUsablePublicAppUrl("http://10.0.0.5:5173", { NODE_ENV: "production" }),
      false
    );
  });

  it("accepts production PUBLIC_APP_URL for email config", () => {
    const cfg = getEmailConfig({
      NODE_ENV: "production",
      RESEND_API_KEY: "re_x",
      PASSWORD_RESET_FROM_EMAIL: "QuickCheck Hub <noreply@example.com>",
      PUBLIC_APP_URL: "https://app.example.com",
    });
    assert.equal(cfg.configured, true);
    assert.equal(cfg.publicAppUrl, "https://app.example.com");
  });
});

describe("CORS origins (production vs local LAN)", () => {
  it("allows the production frontend origin even when CLIENT_ORIGIN is unset", () => {
    const env = { NODE_ENV: "production" };
    assert.equal(
      resolveCorsOriginOption("https://quick-check-hub-frontend.vercel.app", env),
      true
    );
    assert.equal(
      resolveCorsOriginOption("https://quick-check-hub-frontend.vercel.app/", env),
      true
    );
    assert.equal(resolveCorsOriginOption("https://evil.example.com", env), false);
    assert.equal(
      resolveCorsOriginOption("http://192.168.8.101:5173", env),
      false
    );
    assert.equal(resolveCorsOriginOption("http://localhost:5173", env), false);
    assert.equal(resolveCorsOriginOption(undefined, env), true);
  });

  it("allows listed Vercel frontend origin in production", () => {
    const env = {
      NODE_ENV: "production",
      CLIENT_ORIGIN: "https://quick-check-hub-frontend.vercel.app",
    };
    assert.equal(
      resolveCorsOriginOption("https://quick-check-hub-frontend.vercel.app", env),
      true
    );
    assert.equal(
      resolveCorsOriginOption("https://evil.example.com", env),
      false
    );
    assert.equal(
      resolveCorsOriginOption("http://192.168.8.101:5173", env),
      false
    );
  });

  it("allows private LAN browser origins only outside production", () => {
    assert.equal(isDevLanBrowserOrigin("http://192.168.8.101:5173"), true);
    assert.equal(isDevLanBrowserOrigin("http://localhost:5173"), true);
    assert.equal(isDevLanBrowserOrigin("https://duke.com.pk"), false);
    const env = {
      NODE_ENV: "development",
      CLIENT_ORIGIN: "http://localhost:5173",
    };
    assert.equal(
      resolveCorsOriginOption("http://192.168.8.101:5173", env),
      true
    );
    assert.equal(
      resolveCorsOriginOption("http://localhost:5173", { NODE_ENV: "development" }),
      true
    );
    assert.equal(
      resolveCorsOriginOption("https://evil.example.com", { NODE_ENV: "development" }),
      false
    );
  });
});

describe("VerifyEmail loading-state contracts", () => {
  it("ends verifying on success, error, expired, and Strict Mode cleanup", () => {
    const src = fs.readFileSync(verifyPagePath, "utf8");
    assert.match(src, /setStatus\("success"\)/);
    assert.match(src, /setStatus\("error"\)/);
    assert.match(src, /setStatus\("expired"\)/);
    assert.match(src, /TOKEN_EXPIRED/);
    assert.match(src, /AbortController|controller\.abort/);
    assert.match(src, /verifyStarted\.current = null/);
    assert.match(src, /cancelled/);
    assert.match(src, /status === "verifying"/);
    assert.match(src, /awaiting Admin approval/);
    assert.doesNotMatch(src, /approvalStatus:\s*["']approved["']/);
  });
});

describe("verification token outcomes (mocked)", () => {
  it("succeeds, rejects expired, and stays pending approval", async () => {
    const user = {
      _id: "u1",
      email: "ada@example.com",
      role: "student",
      approvalStatus: "pending",
      emailVerified: false,
    };
    const tokens = mockTokenStore();
    const users = mockUserStore([user]);
    const deps = {
      User: users,
      EmailVerificationToken: tokens,
      now: () => new Date("2026-10-18T12:00:00Z"),
      notifyAdminsOfVerifiedRegistration: async () => {},
    };

    const issued = await issueEmailVerificationToken(user, deps);
    const ok = await verifyEmailWithToken(issued.rawToken, deps);
    assert.equal(ok.ok, true);
    assert.equal(ok.status, 200);
    assert.equal(ok.user.approvalStatus, "pending");
    assert.equal(ok.user.emailVerified, true);

    const expiredUser = {
      _id: "u2",
      email: "bob@example.com",
      role: "teacher",
      approvalStatus: "pending",
      emailVerified: false,
    };
    users.users.push(expiredUser);
    const issued2 = await issueEmailVerificationToken(expiredUser, {
      ...deps,
      now: () => new Date("2026-10-10T12:00:00Z"),
    });
    const expired = await verifyEmailWithToken(issued2.rawToken, {
      ...deps,
      now: () => new Date("2026-10-18T12:00:00Z"),
    });
    assert.equal(expired.ok, false);
    assert.equal(expired.code, "TOKEN_EXPIRED");
    assert.match(expired.message, /expired/i);

    const invalid = await verifyEmailWithToken("not-a-real-token-value-xxxxxx", deps);
    assert.equal(invalid.ok, false);
    assert.equal(invalid.status, 400);
  });
});

describe("approved-only Students and Teachers lists", () => {
  it("approvedRoleFilter excludes pending and rejected", () => {
    const studentFilter = approvedRoleFilter("student");
    assert.equal(studentFilter.role, "student");
    assert.deepEqual(studentFilter.approvalStatus.$nin, ["pending", "rejected"]);

    const teacherFilter = approvedRoleFilter("teacher");
    assert.equal(teacherFilter.role, "teacher");
    assert.deepEqual(teacherFilter.approvalStatus.$nin, ["pending", "rejected"]);
  });

  it("management queries omit pending while registration requests keep them", () => {
    const adminSrc = fs.readFileSync(
      path.join(root, "backend", "controllers", "adminController.js"),
      "utf8"
    );
    const teacherSrc = fs.readFileSync(
      path.join(root, "backend", "controllers", "teacherController.js"),
      "utf8"
    );
    assert.match(adminSrc, /approvedRoleFilter\(['"]student['"]\)/);
    assert.match(adminSrc, /approvedRoleFilter\(['"]teacher['"]\)/);
    assert.match(adminSrc, /listRegistrationRequests/);
    assert.match(adminSrc, /filter\.approvalStatus\s*=\s*status/);
    assert.match(adminSrc, /approvalStatus:\s*"pending"/);
    assert.match(teacherSrc, /approvedRoleFilter\(["']student["']\)/);
    assert.match(teacherSrc, /approvedRoleFilter\(["']teacher["']\)/);
  });

  it("filters a mixed user set to approved-only for management lists", async () => {
    const users = mockUserStore([
      { _id: "1", role: "student", name: "A", approvalStatus: "approved" },
      { _id: "2", role: "student", name: "B", approvalStatus: "pending" },
      { _id: "3", role: "student", name: "C", approvalStatus: "rejected" },
      { _id: "4", role: "student", name: "D" }, // legacy missing status
      { _id: "5", role: "teacher", name: "T1", approvalStatus: "approved" },
      { _id: "6", role: "teacher", name: "T2", approvalStatus: "pending" },
      {
        _id: "7",
        role: "teacher",
        name: "T3",
        approvalStatus: "pending",
        emailVerified: true,
      },
    ]);

    const students = await users.find(approvedRoleFilter("student")).lean();
    assert.deepEqual(
      students.map((s) => s.name).sort(),
      ["A", "D"]
    );

    const teachers = await users.find(approvedRoleFilter("teacher")).lean();
    assert.deepEqual(
      teachers.map((t) => t.name).sort(),
      ["T1"]
    );

    const pendingRegs = users.users.filter(
      (u) =>
        ["teacher", "student"].includes(u.role) &&
        u.approvalStatus === "pending"
    );
    assert.equal(pendingRegs.length, 3);
    assert.ok(pendingRegs.some((u) => u.emailVerified === true));
  });
});
