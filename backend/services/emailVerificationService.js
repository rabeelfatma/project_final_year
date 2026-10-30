const crypto = require("crypto");
const { assertWithinRateLimit, DEFAULT_WINDOW_MS } = require("./authRateLimit");
const { validateEmailInput } = require("../utils/emailValidation");
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
 * Optional targetEmail supports pending-email reapplication without changing User.email yet.
 */
async function issueEmailVerificationToken(
  user,
  deps = createDefaultDeps(),
  targetEmail = null
) {
  const rawToken = generateRawToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(deps.now().getTime() + TOKEN_TTL_MS);
  const email = String(targetEmail || user.pendingEmail || user.email || "")
    .trim()
    .toLowerCase();

  await deps.EmailVerificationToken.updateMany(
    { user: user._id, usedAt: null },
    { $set: { usedAt: deps.now() } }
  );

  await deps.EmailVerificationToken.create({
    user: user._id,
    email,
    tokenHash,
    expiresAt,
    usedAt: null,
  });

  return { rawToken, expiresAt, expiresHours: EXPIRES_HOURS, email };
}

async function sendSignupVerificationEmail(
  user,
  rawToken,
  deps = createDefaultDeps(),
  targetEmail = null
) {
  const config = deps.getEmailConfig(deps.env);
  if (!config.configured) {
    return {
      ok: false,
      code: "EMAIL_NOT_CONFIGURED",
      message: "Email verification is not configured.",
    };
  }
  const to = String(targetEmail || user.pendingEmail || user.email || "")
    .trim()
    .toLowerCase();
  const verifyLink = buildVerificationLink(config.publicApiUrl, rawToken);
  const content = templateSignupVerification({
    name: user.name || "Applicant",
    verifyLink,
    expiresHours: EXPIRES_HOURS,
  });
  return deps.sendTransactionalEmail(
    {
      to,
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

  const existing = await deps.User.findById(consumed.user).select(
    "name email pendingEmail role approvalStatus emailVerified emailVerifiedAt adminNotifiedAt createdAt"
  );

  if (
    !existing ||
    !["teacher", "student"].includes(existing.role)
  ) {
    return {
      ok: false,
      status: 400,
      message: "This verification link is invalid or has expired.",
    };
  }

  const tokenEmail = String(consumed.email || "").trim().toLowerCase();
  const currentEmail = String(existing.email || "").trim().toLowerCase();
  const pendingEmail = existing.pendingEmail
    ? String(existing.pendingEmail).trim().toLowerCase()
    : null;

  let user = null;

  if (pendingEmail && tokenEmail === pendingEmail) {
    // Apply pending email only after ownership of the new address is proven.
    const conflict = await deps.User.findOne({
      email: pendingEmail,
      _id: { $ne: existing._id },
    });
    if (conflict) {
      return {
        ok: false,
        status: 409,
        code: "EMAIL_IN_USE",
        message:
          "This email is no longer available. Contact an administrator for help.",
      };
    }

    try {
      user = await deps.User.findOneAndUpdate(
        {
          _id: existing._id,
          role: { $in: ["teacher", "student"] },
          pendingEmail: tokenEmail,
        },
        {
          $set: {
            email: tokenEmail,
            pendingEmail: null,
            emailVerified: true,
            emailVerifiedAt: now,
          },
        },
        { new: true }
      ).select(
        "name email role approvalStatus emailVerified emailVerifiedAt adminNotifiedAt createdAt pendingEmail"
      );
    } catch (err) {
      if (err && err.code === 11000) {
        return {
          ok: false,
          status: 409,
          code: "EMAIL_IN_USE",
          message:
            "This email is no longer available. Contact an administrator for help.",
        };
      }
      throw err;
    }
  } else if (tokenEmail === currentEmail) {
    user = await deps.User.findOneAndUpdate(
      {
        _id: existing._id,
        email: tokenEmail,
        role: { $in: ["teacher", "student"] },
      },
      {
        $set: {
          emailVerified: true,
          emailVerifiedAt: now,
          pendingEmail: null,
        },
      },
      { new: true }
    ).select(
      "name email role approvalStatus emailVerified emailVerifiedAt adminNotifiedAt createdAt pendingEmail"
    );
  }

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
  const emailCheck = validateEmailInput(email);
  if (!emailCheck.ok) {
    return {
      ok: false,
      status: 400,
      message: "A valid email address is required.",
    };
  }
  const normalized = emailCheck.email;

  const config = deps.getEmailConfig(deps.env);
  if (!config.configured) {
    console.error("RESEND VERIFICATION BLOCKED: EMAIL_NOT_CONFIGURED");
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
  // Also match pendingEmail so reapplicants who changed address can resend.
  let user = await deps.User.findOne({
    email: normalized,
    role: { $in: ["teacher", "student"] },
    approvalStatus: "pending",
    emailVerified: { $ne: true },
  });
  if (!user) {
    user = await deps.User.findOne({
      pendingEmail: normalized,
      role: { $in: ["teacher", "student"] },
      approvalStatus: "pending",
      emailVerified: { $ne: true },
    });
  }

  if (!user) {
    return generic;
  }

  const targetEmail = user.pendingEmail || user.email;
  const issued = await issueEmailVerificationToken(user, deps, targetEmail);
  const sent = await sendSignupVerificationEmail(
    user,
    issued.rawToken,
    deps,
    targetEmail
  );
  if (!sent.ok) {
    console.error(
      "RESEND VERIFICATION DELIVERY FAILED:",
      sent.code || "EMAIL_PROVIDER_ERROR"
    );
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
