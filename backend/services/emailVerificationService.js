const crypto = require("crypto");
const { assertWithinRateLimit, DEFAULT_WINDOW_MS } = require("./authRateLimit");
const {
  getEmailConfig,
  buildVerificationLink,
  templateSignupVerification,
  sendTransactionalEmail,
} = require("./transactionalEmail");

const TOKEN_BYTES = 32;
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const EXPIRES_HOURS = 24;
const RESEND_EMAIL_LIMIT = 3;
const RESEND_IP_LIMIT = 10;

function hashToken(rawToken) {
  return crypto.createHash("sha256").update(String(rawToken), "utf8").digest("hex");
}

function generateRawToken() {
  return crypto.randomBytes(TOKEN_BYTES).toString("hex");
}

function createDefaultDeps() {
  return {
    User: require("../models/User"),
    EmailVerificationToken: require("../models/EmailVerificationToken"),
    AuthRateLimit: require("../models/AuthRateLimit"),
    sendTransactionalEmail,
    getEmailConfig,
    fetchImpl: globalThis.fetch,
    env: process.env,
    now: () => new Date(),
    notifyAdminsOfVerifiedRegistration: null,
  };
}

/**
 * Issue a new verification token for a user (invalidates prior unused tokens).
 * Returns raw token for emailing; only the hash is stored.
 */
async function issueEmailVerificationToken(user, deps = createDefaultDeps()) {
  const rawToken = generateRawToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(deps.now().getTime() + TOKEN_TTL_MS);

  await deps.EmailVerificationToken.updateMany(
    { user: user._id, usedAt: null },
    { $set: { usedAt: deps.now() } }
  );

  await deps.EmailVerificationToken.create({
    user: user._id,
    email: user.email,
    tokenHash,
    expiresAt,
    usedAt: null,
  });

  return { rawToken, expiresAt, expiresHours: EXPIRES_HOURS };
}

async function sendSignupVerificationEmail(user, rawToken, deps = createDefaultDeps()) {
  const config = deps.getEmailConfig(deps.env);
  if (!config.configured) {
    return {
      ok: false,
      code: "EMAIL_NOT_CONFIGURED",
      message: "Email verification is not configured.",
    };
  }
  const verifyLink = buildVerificationLink(config.publicAppUrl, rawToken);
  const content = templateSignupVerification({
    name: user.name || "Applicant",
    verifyLink,
    expiresHours: EXPIRES_HOURS,
  });
  return deps.sendTransactionalEmail(
    {
      to: user.email,
      subject: content.subject,
      text: content.text,
      html: content.html,
    },
    { env: deps.env, fetchImpl: deps.fetchImpl || globalThis.fetch }
  );
}

/**
 * Atomically consume a verification token and mark the user email-verified.
 * Does NOT approve the account or issue a JWT.
 */
async function verifyEmailWithToken(rawToken, deps = createDefaultDeps()) {
  const token = typeof rawToken === "string" ? rawToken.trim() : "";
  if (!token || token.length < 32) {
    return {
      ok: false,
      status: 400,
      message: "A valid verification token is required.",
    };
  }

  const tokenHash = hashToken(token);
  const now = deps.now();

  const consumed = await deps.EmailVerificationToken.findOneAndUpdate(
    {
      tokenHash,
      usedAt: null,
      expiresAt: { $gt: now },
    },
    { $set: { usedAt: now } },
    { new: true }
  );

  if (!consumed) {
    // Predictable replay / Strict Mode double-submit: already-used token whose
    // user is verified → succeed idempotently without re-notifying Admin.
    let prior = null;
    if (typeof deps.EmailVerificationToken.findOne === "function") {
      const found = await deps.EmailVerificationToken.findOne({ tokenHash });
      prior =
        found && typeof found.toObject === "function" ? found.toObject() : found;
    }
    if (prior) {
      const priorUser = await deps.User.findById(prior.user).select(
        "email role approvalStatus emailVerified emailVerifiedAt"
      );
      if (priorUser && priorUser.emailVerified === true) {
        return {
          ok: true,
          status: 200,
          alreadyVerified: true,
          message:
            "Email already verified. Your account is awaiting Admin approval.",
          user: {
            email: priorUser.email,
            role: priorUser.role,
            emailVerified: true,
            approvalStatus: priorUser.approvalStatus,
          },
        };
      }
      if (prior.expiresAt && prior.expiresAt <= now) {
        return {
          ok: false,
          status: 400,
          code: "TOKEN_EXPIRED",
          message:
            "This verification link has expired. Request a new verification email below.",
        };
      }
      if (prior.usedAt) {
        return {
          ok: false,
          status: 400,
          code: "TOKEN_USED",
          message:
            "This verification link was already used. Request a new link only if your email is still unverified.",
        };
      }
    }
    return {
      ok: false,
      status: 400,
      code: "TOKEN_INVALID",
      message: "This verification link is invalid or has expired.",
    };
  }

  const user = await deps.User.findOneAndUpdate(
    {
      _id: consumed.user,
      email: consumed.email,
      role: { $in: ["teacher", "student"] },
    },
    {
      $set: {
        emailVerified: true,
        emailVerifiedAt: now,
      },
    },
    { new: true }
  ).select("name email role approvalStatus emailVerified emailVerifiedAt adminNotifiedAt createdAt");

  if (!user) {
    return {
      ok: false,
      status: 400,
      message: "This verification link is invalid or has expired.",
    };
  }

  // Already verified previously: still succeed idempotently for the user UX,
  // but Admin notify helper must remain deduplicated.
  if (typeof deps.notifyAdminsOfVerifiedRegistration === "function") {
    try {
      await deps.notifyAdminsOfVerifiedRegistration(user, deps);
    } catch (_) {
      // Notification/email failures must not undo verification.
    }
  }

  return {
    ok: true,
    status: 200,
    message:
      "Email verified successfully. Your account is awaiting Admin approval.",
    user: {
      email: user.email,
      role: user.role,
      emailVerified: true,
      approvalStatus: user.approvalStatus,
    },
  };
}

async function resendVerificationEmail({ email, ip }, deps = createDefaultDeps()) {
  const normalized =
    typeof email === "string" ? email.toLowerCase().trim().slice(0, 254) : "";
  if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    return {
      ok: false,
      status: 400,
      message: "A valid email address is required.",
    };
  }

  const config = deps.getEmailConfig(deps.env);
  if (!config.configured) {
    return {
      ok: false,
      status: 503,
      message:
        "Email verification is temporarily unavailable. Please try again later.",
      code: "EMAIL_NOT_CONFIGURED",
    };
  }

  const ipLimit = await assertWithinRateLimit(
    deps.AuthRateLimit,
    `verifyresend:ip:${ip || "unknown"}`,
    RESEND_IP_LIMIT,
    DEFAULT_WINDOW_MS,
    deps.now()
  );
  if (!ipLimit.ok) {
    return { ok: false, status: 429, message: ipLimit.message };
  }

  const emailLimit = await assertWithinRateLimit(
    deps.AuthRateLimit,
    `verifyresend:email:${normalized}`,
    RESEND_EMAIL_LIMIT,
    DEFAULT_WINDOW_MS,
    deps.now()
  );
  if (!emailLimit.ok) {
    return { ok: false, status: 429, message: emailLimit.message };
  }

  // Generic response — avoid account enumeration.
  const generic = {
    ok: true,
    status: 200,
    message:
      "If an unverified registration exists for that email, a new verification link will be sent shortly.",
  };

  // Include legacy pending rows where emailVerified is missing/undefined.
  const user = await deps.User.findOne({
    email: normalized,
    role: { $in: ["teacher", "student"] },
    approvalStatus: "pending",
    emailVerified: { $ne: true },
  });

  if (!user) {
    return generic;
  }

  const issued = await issueEmailVerificationToken(user, deps);
  const sent = await sendSignupVerificationEmail(user, issued.rawToken, deps);
  if (!sent.ok) {
    return {
      ok: false,
      status: 503,
      message:
        "Email verification is temporarily unavailable. Please try again later.",
      code: sent.code || "EMAIL_PROVIDER_ERROR",
    };
  }

  return generic;
}

module.exports = {
  TOKEN_TTL_MS,
  EXPIRES_HOURS,
  hashToken,
  generateRawToken,
  issueEmailVerificationToken,
  sendSignupVerificationEmail,
  verifyEmailWithToken,
  resendVerificationEmail,
  createDefaultDeps,
};
