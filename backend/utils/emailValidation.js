/**
 * Shared email normalize + syntax validation for auth flows.
 * Format checks do not prove mailbox existence — verification email does.
 */

const MAX_EMAIL_LENGTH = 254;
const MAX_LOCAL_LENGTH = 64;

/**
 * Trim, lowercase, and bound length for duplicate checks / lookups.
 */
function normalizeEmail(email) {
  if (typeof email !== "string") return "";
  return email.trim().toLowerCase().slice(0, MAX_EMAIL_LENGTH);
}

/**
 * Reasonable syntax validation (no mailbox probe).
 * Rejects empty, whitespace, missing domain/TLD, and special-only local parts.
 */
function isValidEmailFormat(email) {
  const raw = typeof email === "string" ? email.trim() : "";
  if (!raw || raw.length > MAX_EMAIL_LENGTH) return false;
  if (/\s/.test(raw)) return false;

  const normalized = raw.toLowerCase();
  if (normalized.indexOf("@") !== normalized.lastIndexOf("@")) return false;

  const at = normalized.indexOf("@");
  if (at <= 0) return false;

  const local = normalized.slice(0, at);
  const domain = normalized.slice(at + 1);
  if (!local || !domain) return false;
  if (local.length > MAX_LOCAL_LENGTH) return false;

  // Local part must include at least one letter or digit (rejects !!!!!!!@gmail.com).
  if (!/[a-z0-9]/i.test(local)) return false;

  // Domain must include a dot and a TLD of at least 2 chars.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalized)) return false;

  if (normalized.includes("..")) return false;
  if (local.startsWith(".") || local.endsWith(".")) return false;
  if (domain.startsWith(".") || domain.endsWith(".") || domain.startsWith("-")) {
    return false;
  }

  return true;
}

/**
 * @returns {{ ok: true, email: string } | { ok: false, message: string }}
 */
function validateEmailInput(email) {
  if (email == null || typeof email !== "string" || !String(email).trim()) {
    return { ok: false, message: "Email is required" };
  }
  const normalized = normalizeEmail(email);
  if (!isValidEmailFormat(normalized)) {
    return { ok: false, message: "Invalid email format" };
  }
  return { ok: true, email: normalized };
}

module.exports = {
  MAX_EMAIL_LENGTH,
  normalizeEmail,
  isValidEmailFormat,
  validateEmailInput,
};
