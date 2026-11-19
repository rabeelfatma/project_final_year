const crypto = require("crypto");
const {
  validatePasswordInput,
  validatePasswordConfirmation,
  hashPassword,
  isBcryptHash,
} = require("../utils/authPassword");
const { validateEmailInput } = require("../utils/emailValidation");
const { assertWithinRateLimit, DEFAULT_WINDOW_MS } = require("./authRateLimit");
const {
  getResetEmailConfig,
  sendPasswordResetEmail,
} = require("./passwordResetEmail");

const TOKEN_BYTES = 32;
const TOKEN_TTL_MS = 15 * 60 * 1000;
const EMAIL_RATE_LIMIT = 5;
const IP_RATE_LIMIT = 20;
/** Separate bucket from request so reset emails cannot starve confirm attempts. */
const CONFIRM_IP_RATE_LIMIT = 20;

const GENERIC_REQUEST_MESSAGE =
  "If the account exists, a reset link has been sent.";
const SERVICE_UNAVAILABLE_MESSAGE =
  "Password recovery is temporarily unavailable. Please try again later.";

function hashResetToken(rawToken) {
  return crypto.createHash("sha256").update(String(rawToken), "utf8").digest("hex");
}

function generateRawResetToken() {
  return crypto.randomBytes(TOKEN_BYTES).toString("hex");
}

function createDefaultDeps() {
  return {
    User: require("../models/User"),
    PasswordResetToken: require("../models/PasswordResetToken"),
    AuthRateLimit: require("../models/AuthRateLimit"),
    sendPasswordResetEmail,
    getResetEmailConfig,
    env: process.env,
    now: () => new Date(),
  };
}

/**
 * Request a password reset email. Always returns a generic user-facing message
 * when the request is accepted; fails closed if email is not configured.
 */
async function requestPasswordReset({ email, ip }, deps = createDefaultDeps()) {
  const emailCheck = validateEmailInput(email);
  if (!emailCheck.ok) {
    return {
      ok: false,
      status: 400,
      message: emailCheck.message,
    };
  }
  const normalized = emailCheck.email;

  const emailConfig = deps.getResetEmailConfig(deps.env);
  if (!emailConfig.configured) {
    return {
      ok: false,
      status: 503,
      message: SERVICE_UNAVAILABLE_MESSAGE,
      code: "PASSWORD_RESET_EMAIL_UNAVAILABLE",
    };
  }

  const ipKey = `pwdreset:ip:${ip || "unknown"}`;
  const emailKey = `pwdreset:email:${normalized}`;

  const ipLimit = await assertWithinRateLimit(
    deps.AuthRateLimit,
    ipKey,
    IP_RATE_LIMIT,
    DEFAULT_WINDOW_MS,
    deps.now()
  );
  if (!ipLimit.ok) {
    return { ok: false, status: 429, message: ipLimit.message };
  }

  const emailLimit = await assertWithinRateLimit(
    deps.AuthRateLimit,
    emailKey,
    EMAIL_RATE_LIMIT,
    DEFAULT_WINDOW_MS,
    deps.now()
  );
  if (!emailLimit.ok) {
    return { ok: false, status: 429, message: emailLimit.message };
  }

  const user = await deps.User.findOne({ email: normalized });
  if (!user) {
    // Generic success — do not reveal account existence.
    return { ok: true, status: 200, message: GENERIC_REQUEST_MESSAGE };
  }

  const rawToken = generateRawResetToken();
  const tokenHash = hashResetToken(rawToken);
  const expiresAt = new Date(deps.now().getTime() + TOKEN_TTL_MS);

  // Invalidate outstanding tokens for this account.
  await deps.PasswordResetToken.updateMany(
    { user: user._id, usedAt: null },
    { $set: { usedAt: deps.now() } }
  );

  await deps.PasswordResetToken.create({
    user: user._id,
    email: normalized,
    tokenHash,
    expiresAt,
    usedAt: null,
  });

  const sent = await deps.sendPasswordResetEmail(
    {
      to: normalized,
      rawToken,
      expiresMinutes: Math.round(TOKEN_TTL_MS / 60000),
    },
    { env: deps.env }
  );

  if (!sent.ok) {
    // Burn the token so a failed send cannot leave a usable secret.
    // Still return the generic success body so provider failures cannot
    // enumerate which emails exist (unknown emails already returned 200).
    await deps.PasswordResetToken.updateOne(
      { tokenHash, usedAt: null },
      { $set: { usedAt: deps.now() } }
    );
    return { ok: true, status: 200, message: GENERIC_REQUEST_MESSAGE };
  }

  return { ok: true, status: 200, message: GENERIC_REQUEST_MESSAGE };
}

/**
 * Confirm reset with raw token + new password. Atomically consumes the token.
 * IP rate limit runs first so probing invalid tokens still counts against the window.
 */
async function confirmPasswordReset(
  { token, newPassword, confirmPassword, ip },
  deps = createDefaultDeps()
) {
  const confirmIpKey = `pwdreset:confirm:ip:${ip || "unknown"}`;
  const confirmIpLimit = await assertWithinRateLimit(
    deps.AuthRateLimit,
    confirmIpKey,
    CONFIRM_IP_RATE_LIMIT,
    DEFAULT_WINDOW_MS,
    deps.now()
  );
  if (!confirmIpLimit.ok) {
    return { ok: false, status: 429, message: confirmIpLimit.message };
  }

  const rawToken = typeof token === "string" ? token.trim() : "";
  if (!rawToken || rawToken.length < 32) {
    return {
      ok: false,
      status: 400,
      message: "Reset link is invalid or expired.",
      code: "RESET_TOKEN_INVALID",
    };
  }

  const passwordCheck = validatePasswordInput(newPassword);
  if (!passwordCheck.ok) {
    return {
      ok: false,
      status: 400,
      message: passwordCheck.message,
      code: passwordCheck.code || "PASSWORD_POLICY",
    };
  }

  const confirmCheck = validatePasswordConfirmation(
    passwordCheck.password,
    confirmPassword
  );
  if (!confirmCheck.ok) {
    return {
      ok: false,
      status: 400,
      message: confirmCheck.message,
      code: confirmCheck.code,
    };
  }

  const tokenHash = hashResetToken(rawToken);
  const now = deps.now();

  const consumed = await deps.PasswordResetToken.findOneAndUpdate(
    {
      tokenHash,
      usedAt: null,
      expiresAt: { $gt: now },
    },
    { $set: { usedAt: now } },
    { new: true }
  );

  if (!consumed) {
    return {
      ok: false,
      status: 400,
      message: "Reset link is invalid or expired.",
      code: "RESET_TOKEN_INVALID",
    };
  }

  const hashedPassword = await hashPassword(passwordCheck.password);
  if (!isBcryptHash(hashedPassword)) {
    // Fail closed: token stays consumed (no multi-doc transaction). Require a new link.
    return {
      ok: false,
      status: 500,
      message: "Unable to update password. Please request a new reset link.",
    };
  }

  const updatedUser = await deps.User.findOneAndUpdate(
    { _id: consumed.user },
    {
      $set: {
        password: hashedPassword,
        passwordChangedAt: now,
      },
      $inc: { tokenVersion: 1 },
    },
    { new: true }
  );

  if (!updatedUser) {
    // Fail closed without restoring: avoids reviving a token after a newer
    // replacement request invalidated it. User must request a fresh link.
    return {
      ok: false,
      status: 400,
      message: "Reset link is invalid or expired.",
      code: "RESET_TOKEN_INVALID",
    };
  }

  // Invalidate any other outstanding tokens for this user.
  await deps.PasswordResetToken.updateMany(
    { user: consumed.user, usedAt: null },
    { $set: { usedAt: now } }
  );

  return {
    ok: true,
    status: 200,
    message: "Password reset successfully.",
  };
}

module.exports = {
  TOKEN_TTL_MS,
  EMAIL_RATE_LIMIT,
  IP_RATE_LIMIT,
  CONFIRM_IP_RATE_LIMIT,
  GENERIC_REQUEST_MESSAGE,
  SERVICE_UNAVAILABLE_MESSAGE,
  hashResetToken,
  generateRawResetToken,
  requestPasswordReset,
  confirmPasswordReset,
  createDefaultDeps,
};
