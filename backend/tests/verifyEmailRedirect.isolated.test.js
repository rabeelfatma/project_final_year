/**
 * Server-owned email verification redirects — no client DP bypass, no open redirects.
 */
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const {
  buildVerifyEmailResultRedirect,
  listAllowedFrontendOrigins,
  mapVerifyResultToStatus,
} = require("../utils/verifyEmailRedirect");
const {
  resolvePublicApiUrl,
  resolvePublicApiRoot,
  PRODUCTION_API_ORIGIN,
} = require("../utils/publicApiUrl");
const { buildVerificationLink, getEmailConfig } = require("../services/transactionalEmail");
const {
  verifyEmailWithToken,
  hashToken,
} = require("../services/emailVerificationService");

const FRONTEND = "https://quick-check-hub-frontend.vercel.app";

describe("public API URL for verification emails", () => {
  it("prefers PUBLIC_API_URL origin", () => {
    assert.equal(
      resolvePublicApiUrl({
        PUBLIC_API_URL: "https://api.example.com/api",
      }),
      "https://api.example.com"
    );
    assert.equal(
      resolvePublicApiRoot({ PUBLIC_API_URL: "https://api.example.com" }),
      "https://api.example.com/api"
    );
  });

  it("uses VERCEL_URL on Preview when PUBLIC_API_URL is unset", () => {
    assert.equal(
      resolvePublicApiUrl({
        VERCEL_ENV: "preview",
        VERCEL_URL: "my-dep-abc.vercel.app",
      }),
      "https://my-dep-abc.vercel.app"
    );
  });

  it("defaults to stable Production API host when VERCEL_ENV=production", () => {
    assert.equal(
      resolvePublicApiUrl({
        VERCEL_ENV: "production",
        VERCEL_URL: "quickcheck-hub-backend-a4l8v2xwr-portfolio-dba5.vercel.app",
        NODE_ENV: "production",
      }),
      PRODUCTION_API_ORIGIN
    );
    assert.equal(PRODUCTION_API_ORIGIN, "https://quickcheck-hub-backend.vercel.app");
  });

  it("defaults to production API host for NODE_ENV=production without Vercel", () => {
    assert.equal(
      resolvePublicApiUrl({ NODE_ENV: "production" }),
      PRODUCTION_API_ORIGIN
    );
  });

  it("builds verification links to the API verify endpoint", () => {
    const link = buildVerificationLink("https://api.example.com", "tok-value");
    assert.equal(
      link,
      "https://api.example.com/api/auth/verify-email?token=tok-value"
    );
    assert.match(link, /\/api\/auth\/verify-email\?token=/);
  });

  it("requires publicApiUrl for email config", () => {
    const cfg = getEmailConfig({
      NODE_ENV: "production",
      RESEND_API_KEY: "re_x",
      PASSWORD_RESET_FROM_EMAIL: "QuickCheck Hub <noreply@example.com>",
      PUBLIC_APP_URL: FRONTEND,
      PUBLIC_API_URL: PRODUCTION_API_ORIGIN,
    });
    assert.equal(cfg.configured, true);
    assert.equal(cfg.publicAppUrl, FRONTEND);
    assert.equal(cfg.publicApiUrl, PRODUCTION_API_ORIGIN);
  });
});

describe("verify-email result redirects", () => {
  it("maps token outcomes to non-sensitive status slugs", () => {
    assert.equal(mapVerifyResultToStatus({ ok: true }), "success");
    assert.equal(
      mapVerifyResultToStatus({ ok: false, code: "TOKEN_EXPIRED" }),
      "expired"
    );
    assert.equal(
      mapVerifyResultToStatus({ ok: false, code: "TOKEN_USED" }),
      "used"
    );
    assert.equal(
      mapVerifyResultToStatus({ ok: false, code: "TOKEN_INVALID" }),
      "invalid"
    );
  });

  it("redirects only to the configured allowlisted frontend origin", () => {
    const env = {
      NODE_ENV: "production",
      PUBLIC_APP_URL: FRONTEND,
      CLIENT_ORIGIN: FRONTEND,
    };
    const location = buildVerifyEmailResultRedirect({ ok: true }, env);
    assert.equal(location, `${FRONTEND}/verify-email?status=success`);
    assert.doesNotMatch(location, /token=/i);
  });

  it("never accepts a caller-controlled redirect target", () => {
    const env = {
      NODE_ENV: "production",
      PUBLIC_APP_URL: FRONTEND,
    };
    const allowed = listAllowedFrontendOrigins(env);
    assert.equal(allowed.has("https://evil.example.com"), false);
    assert.equal(allowed.has(FRONTEND), true);

    const location = buildVerifyEmailResultRedirect(
      { ok: true, redirect: "https://evil.example.com/phish" },
      env
    );
    assert.equal(location, `${FRONTEND}/verify-email?status=success`);
    assert.doesNotMatch(location, /evil\.example\.com|phish|token=/i);
  });

  it("fails closed when PUBLIC_APP_URL is the backend host", () => {
    const location = buildVerifyEmailResultRedirect(
      { ok: true },
      {
        NODE_ENV: "production",
        PUBLIC_APP_URL: "https://quickcheck-hub-backend.vercel.app",
      }
    );
    assert.equal(location, "");
  });

  it("never puts the raw token in the Location URL", () => {
    const location = buildVerifyEmailResultRedirect(
      {
        ok: false,
        code: "TOKEN_EXPIRED",
        message: "expired",
        rawToken: "should-never-appear",
      },
      { NODE_ENV: "production", PUBLIC_APP_URL: FRONTEND }
    );
    assert.equal(location, `${FRONTEND}/verify-email?status=expired`);
    assert.doesNotMatch(location, /should-never-appear|token=/i);
  });
});

describe("token verify + redirect preserves approval pending", () => {
  it("valid token verifies once, stays pending, and maps to success redirect", async () => {
    const now = new Date("2026-10-22T12:00:00Z");
    const rawToken = "b".repeat(64);
    const tokenHash = hashToken(rawToken);
    let tokenRow = {
      tokenHash,
      user: "u1",
      email: "ada@example.com",
      usedAt: null,
      expiresAt: new Date(now.getTime() + 60_000),
    };
    let userDoc = {
      _id: "u1",
      email: "ada@example.com",
      role: "student",
      approvalStatus: "pending",
      emailVerified: false,
    };

    const deps = {
      now: () => now,
      EmailVerificationToken: {
        findOneAndUpdate: async (filter, update) => {
          if (filter.tokenHash !== tokenRow.tokenHash) return null;
          if (tokenRow.usedAt || tokenRow.expiresAt <= now) return null;
          tokenRow = { ...tokenRow, usedAt: update.$set.usedAt };
          return { ...tokenRow };
        },
        findOne: async ({ tokenHash: h }) =>
          h === tokenRow.tokenHash ? { ...tokenRow } : null,
      },
      User: {
        findById(id) {
          if (String(id) !== "u1") {
            return { select() { return Promise.resolve(null); } };
          }
          return {
            select() {
              return Promise.resolve({ ...userDoc });
            },
          };
        },
        findOneAndUpdate(filter, update) {
          if (String(filter._id) !== "u1") {
            return { select() { return Promise.resolve(null); } };
          }
          Object.assign(userDoc, update.$set || {});
          return {
            select() {
              return Promise.resolve({ ...userDoc });
            },
          };
        },
      },
      notifyAdminsOfVerifiedRegistration: async () => {},
    };

    const first = await verifyEmailWithToken(rawToken, deps);
    assert.equal(first.ok, true);
    assert.equal(userDoc.emailVerified, true);
    assert.equal(userDoc.approvalStatus, "pending");
    assert.equal(
      buildVerifyEmailResultRedirect(first, {
        NODE_ENV: "production",
        PUBLIC_APP_URL: FRONTEND,
      }),
      `${FRONTEND}/verify-email?status=success`
    );

    const second = await verifyEmailWithToken(rawToken, deps);
    assert.equal(second.ok, true);
    assert.equal(second.alreadyVerified, true);
    assert.equal(userDoc.approvalStatus, "pending");
  });

  it("expired token maps to expired redirect status", async () => {
    const now = new Date("2026-10-22T12:00:00Z");
    const rawToken = "c".repeat(64);
    const tokenHash = hashToken(rawToken);
    const tokenRow = {
      tokenHash,
      user: "u2",
      email: "bob@example.com",
      usedAt: null,
      expiresAt: new Date(now.getTime() - 1000),
    };
    const deps = {
      now: () => now,
      EmailVerificationToken: {
        findOneAndUpdate: async () => null,
        findOne: async () => ({ ...tokenRow }),
      },
      User: {
        findById() {
          return {
            select() {
              return Promise.resolve({
                emailVerified: false,
                approvalStatus: "pending",
                email: "bob@example.com",
                role: "student",
              });
            },
          };
        },
      },
    };
    const expired = await verifyEmailWithToken(rawToken, deps);
    assert.equal(expired.ok, false);
    assert.equal(expired.code, "TOKEN_EXPIRED");
    assert.equal(
      buildVerifyEmailResultRedirect(expired, {
        NODE_ENV: "production",
        PUBLIC_APP_URL: FRONTEND,
      }),
      `${FRONTEND}/verify-email?status=expired`
    );
  });

  it("invalid token maps to invalid redirect status", async () => {
    const deps = {
      now: () => new Date(),
      EmailVerificationToken: {
        findOneAndUpdate: async () => null,
        findOne: async () => null,
      },
      User: {},
    };
    const invalid = await verifyEmailWithToken("z".repeat(64), deps);
    assert.equal(invalid.ok, false);
    assert.equal(invalid.code, "TOKEN_INVALID");
    assert.equal(
      buildVerifyEmailResultRedirect(invalid, {
        NODE_ENV: "production",
        PUBLIC_APP_URL: FRONTEND,
      }),
      `${FRONTEND}/verify-email?status=invalid`
    );
  });

  it("already-used token (unverified user) maps to used redirect status", async () => {
    const now = new Date("2026-10-22T12:00:00Z");
    const rawToken = "d".repeat(64);
    const tokenHash = hashToken(rawToken);
    const deps = {
      now: () => now,
      EmailVerificationToken: {
        findOneAndUpdate: async () => null,
        findOne: async () => ({
          tokenHash,
          user: "u3",
          email: "cara@example.com",
          usedAt: new Date(now.getTime() - 1000),
          expiresAt: new Date(now.getTime() + 60_000),
        }),
      },
      User: {
        findById() {
          return {
            select() {
              return Promise.resolve({
                emailVerified: false,
                approvalStatus: "pending",
                email: "cara@example.com",
                role: "student",
              });
            },
          };
        },
      },
    };
    const used = await verifyEmailWithToken(rawToken, deps);
    assert.equal(used.ok, false);
    assert.equal(used.code, "TOKEN_USED");
    assert.equal(
      buildVerifyEmailResultRedirect(used, {
        NODE_ENV: "production",
        PUBLIC_APP_URL: FRONTEND,
      }),
      `${FRONTEND}/verify-email?status=used`
    );
  });
});

describe("POST verify JSON contract remains available", () => {
  it("authController still returns JSON for non-GET and redirects only on GET", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../controllers/authController.js"),
      "utf8"
    );
    assert.match(src, /req\.method === ["']GET["']/);
    assert.match(src, /res\.redirect\(302,\s*location\)/);
    assert.match(src, /return res\.status\(result\.status\)\.json\(/);
    assert.doesNotMatch(src, /console\.(log|info|debug)\([^)]*token/i);
  });
});

describe("frontend must not ship Vercel protection bypass", () => {
  it("apiBase, api.js, VerifyEmail, and corsOrigins contain no bypass secret wiring", () => {
    const apiBase = fs.readFileSync(
      path.join(__dirname, "../../frontend/src/utils/apiBase.js"),
      "utf8"
    );
    const apiJs = fs.readFileSync(
      path.join(__dirname, "../../frontend/src/utils/api.js"),
      "utf8"
    );
    const verifyPage = fs.readFileSync(
      path.join(
        __dirname,
        "../../frontend/src/pages/authentication/VerifyEmail.jsx"
      ),
      "utf8"
    );
    const cors = fs.readFileSync(
      path.join(__dirname, "../utils/corsOrigins.js"),
      "utf8"
    );
    for (const src of [apiBase, apiJs, verifyPage, cors]) {
      assert.doesNotMatch(src, /VITE_VERCEL_PROTECTION_BYPASS/);
      assert.doesNotMatch(src, /x-vercel-protection-bypass/);
      assert.doesNotMatch(src, /getProtectionBypass|withProtectionBypass/);
    }
    assert.match(verifyPage, /searchParams\.get\("status"\)/);
  });
});
