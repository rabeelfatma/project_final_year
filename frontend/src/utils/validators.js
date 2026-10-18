/**
 * Client-side auth validators. Always re-enforced on the backend.
 * Format checks do not prove mailbox existence.
 */

const SPECIAL_CHAR_RE = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/;

export const PASSWORD_REQUIREMENTS = [
  "At least 8 characters",
  "At least one uppercase letter (A–Z)",
  "At least one lowercase letter (a–z)",
  "At least one digit (0–9)",
  "At least one special character (e.g. @ # $ !)",
];

export function normalizeEmail(email) {
  if (typeof email !== "string") return "";
  return email.trim().toLowerCase().slice(0, 254);
}

export function validateEmail(email) {
  const raw = typeof email === "string" ? email.trim() : "";
  if (!raw || raw.length > 254) return false;
  if (/\s/.test(raw)) return false;

  const normalized = raw.toLowerCase();
  if (normalized.indexOf("@") !== normalized.lastIndexOf("@")) return false;

  const at = normalized.indexOf("@");
  if (at <= 0) return false;

  const local = normalized.slice(0, at);
  const domain = normalized.slice(at + 1);
  if (!local || !domain || local.length > 64) return false;
  if (!/[a-z0-9]/i.test(local)) return false;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalized)) return false;
  if (normalized.includes("..")) return false;
  if (local.startsWith(".") || local.endsWith(".")) return false;
  if (domain.startsWith(".") || domain.endsWith(".") || domain.startsWith("-")) {
    return false;
  }
  return true;
}

export function validatePassword(password) {
  if (typeof password !== "string" || password.length < 8) return false;
  if (!/[A-Z]/.test(password)) return false;
  if (!/[a-z]/.test(password)) return false;
  if (!/[0-9]/.test(password)) return false;
  if (!SPECIAL_CHAR_RE.test(password)) return false;
  return true;
}

export function passwordValidationMessage(password) {
  if (password == null || typeof password !== "string" || password.length === 0) {
    return "Password is required.";
  }
  if (!validatePassword(password)) {
    return "Password must be at least 8 characters and include uppercase, lowercase, a digit, and a special character (e.g. @ # $ !).";
  }
  return "";
}
