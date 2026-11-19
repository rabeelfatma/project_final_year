const bcrypt = require("bcryptjs");

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;
const ALLOWED_ROLES = ["student", "admin", "teacher"];
const BCRYPT_HASH_RE = /^\$2[aby]?\$\d{2}\$[./A-Za-z0-9]{53}$/;
const SPECIAL_CHAR_RE = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/;

const PASSWORD_HINT =
  "Min. 8 characters · 1 uppercase · 1 lowercase · 1 number · 1 special character";
const PASSWORD_POLICY_MESSAGE = PASSWORD_HINT;

function normalizeRole(role) {
  return role ? String(role).toLowerCase().trim() : "student";
}

function isBcryptHash(value) {
  return typeof value === "string" && BCRYPT_HASH_RE.test(value);
}

/**
 * Complexity rules for setting a new password (signup, reset, admin create).
 * Does not trim or alter the password value.
 */
function passwordPolicyError(password) {
  if (password == null || typeof password !== "string" || password.length === 0) {
    return "Password is required.";
  }
  if (isBcryptHash(password)) {
    return "Invalid password format.";
  }
  if (/\s/.test(password)) {
    return "Password cannot contain spaces.";
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return "Password is too short.";
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return "Password is too long.";
  }
  if (!/[A-Z]/.test(password)) return "Add an uppercase letter.";
  if (!/[a-z]/.test(password)) return "Add a lowercase letter.";
  if (!/[0-9]/.test(password)) return "Add a number.";
  if (!SPECIAL_CHAR_RE.test(password)) return "Add a special character.";
  return "";
}

function validatePasswordInput(password) {
  const message = passwordPolicyError(password);
  if (message) {
    return { ok: false, message, code: "PASSWORD_POLICY" };
  }
  return { ok: true, password };
}

function validatePasswordConfirmation(password, confirmPassword) {
  if (
    confirmPassword == null ||
    typeof confirmPassword !== "string" ||
    confirmPassword.length === 0
  ) {
    return {
      ok: false,
      message: "Confirm your password.",
      code: "PASSWORD_CONFIRM_REQUIRED",
    };
  }
  if (confirmPassword !== password) {
    return {
      ok: false,
      message: "Passwords do not match.",
      code: "PASSWORD_MISMATCH",
    };
  }
  return { ok: true };
}

/**
 * Login only checks presence / non-hash shape.
 * Existing accounts may predate the stronger signup policy.
 */
function validateLoginPasswordInput(password) {
  if (
    password == null ||
    typeof password !== "string" ||
    password.length === 0 ||
    password.trim().length === 0
  ) {
    return { ok: false, message: "Password is required." };
  }
  if (isBcryptHash(password)) {
    return { ok: false, message: "Invalid email or password." };
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
    if (user.reapplicationDisabled === true) {
      return "Your registration request was permanently declined. Contact an administrator if you need help.";
    }
    return "Your registration request was rejected. You may correct your information and resubmit from the registration page.";
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
  MAX_PASSWORD_LENGTH,
  PASSWORD_HINT,
  PASSWORD_POLICY_MESSAGE,
  ALLOWED_ROLES,
  APPROVAL_STATUSES,
  normalizeRole,
  isBcryptHash,
  isPublicAdminBootstrapAllowed,
  validatePasswordInput,
  validatePasswordConfirmation,
  validateLoginPasswordInput,
  hashPassword,
  passwordsMatch,
  toPublicUser,
  getLoginDenialReason,
  canUserLogin,
};
