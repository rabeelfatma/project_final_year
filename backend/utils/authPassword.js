const bcrypt = require("bcryptjs");

const MIN_PASSWORD_LENGTH = 6;
const ALLOWED_ROLES = ["student", "admin", "teacher"];
const BCRYPT_HASH_RE = /^\$2[aby]?\$\d{2}\$[./A-Za-z0-9]{53}$/;

function normalizeRole(role) {
  return role ? String(role).toLowerCase().trim() : "student";
}

function isBcryptHash(value) {
  return typeof value === "string" && BCRYPT_HASH_RE.test(value);
}

function validatePasswordInput(password) {
  if (password == null || typeof password !== "string" || password.length === 0) {
    return { ok: false, message: "Password is required" };
  }
  if (isBcryptHash(password)) {
    // Prevent treating an existing hash as plaintext (which would re-hash and corrupt it).
    return { ok: false, message: "Invalid password format" };
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, message: "Password must be at least 6 characters" };
  }
  return { ok: true, password };
}

/**
 * Public first-admin registration is disabled.
 * Existing administrators may still create admins with a valid admin JWT.
 * First-admin provisioning requires an explicit approved setup decision.
 */
function isPublicAdminBootstrapAllowed() {
  return false;
}

async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

async function passwordsMatch(plain, hash) {
  if (!plain || !hash || typeof hash !== "string") return false;
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}

function toPublicUser(user) {
  if (!user) return null;
  const obj = typeof user.toObject === "function" ? user.toObject() : { ...user };
  delete obj.password;
  return obj;
}

const APPROVAL_STATUSES = ["pending", "approved", "rejected"];

/**
 * Login eligibility (dual-gate for public signup accounts):
 * - emailVerified === false blocks (missing/undefined treated as verified for legacy).
 * - approvalStatus pending/rejected blocks (missing treated as approved for legacy).
 * - Explicit isAllowedLogin=false always blocks.
 */
function getLoginDenialReason(user) {
  if (!user) return "Invalid email or password";
  if (user.emailVerified === false) {
    return "Please verify your email address before logging in. Check your inbox for the verification link.";
  }
  const status = user.approvalStatus;
  if (status === "pending") {
    return "Your registration is pending Admin approval. Please wait before logging in.";
  }
  if (status === "rejected") {
    return "Your registration request was rejected. Contact an administrator.";
  }
  if (user.isAllowedLogin === false) {
    return "This account is not allowed to log in. Contact an administrator.";
  }
  return null;
}

function canUserLogin(user) {
  return getLoginDenialReason(user) == null;
}

module.exports = {
  MIN_PASSWORD_LENGTH,
  ALLOWED_ROLES,
  APPROVAL_STATUSES,
  normalizeRole,
  isBcryptHash,
  isPublicAdminBootstrapAllowed,
  validatePasswordInput,
  hashPassword,
  passwordsMatch,
  toPublicUser,
  getLoginDenialReason,
  canUserLogin,
};
