/**
 * Client-side auth validators. Always re-enforced on the backend.
 * Format checks do not prove mailbox existence.
 */

const MAX_EMAIL_LENGTH = 254;
const MAX_LOCAL_LENGTH = 64;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;
const SPECIAL_CHAR_RE = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/;

export const PASSWORD_HINT =
  "Min. 8 characters · 1 uppercase · 1 lowercase · 1 number · 1 special character";

export const PASSWORD_REQUIREMENTS = [PASSWORD_HINT];

export function normalizeEmail(email) {
  if (typeof email !== "string") return "";
  return email.trim().toLowerCase();
}

export function validateEmail(email) {
  return emailValidationMessage(email) === "";
}

export function emailValidationMessage(email) {
  if (email == null || typeof email !== "string" || !email.trim()) {
    return "Email is required.";
  }
  const trimmed = email.trim();
  if (trimmed.length > MAX_EMAIL_LENGTH) return "Email is too long.";
  if (/\s/.test(trimmed)) return "Email cannot contain spaces.";

  const normalized = trimmed.toLowerCase();
  if (normalized.length > MAX_EMAIL_LENGTH) return "Email is too long.";
  if (normalized.indexOf("@") !== normalized.lastIndexOf("@")) {
    return "Enter a valid email.";
  }
  const at = normalized.indexOf("@");
  if (at <= 0) return "Enter a valid email.";
  const local = normalized.slice(0, at);
  const domain = normalized.slice(at + 1);
  if (!local || !domain || local.length > MAX_LOCAL_LENGTH) {
    return "Enter a valid email.";
  }
  if (!/[a-z0-9]/i.test(local)) return "Enter a valid email.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalized)) {
    return "Enter a valid email.";
  }
  if (normalized.includes("..")) return "Enter a valid email.";
  if (local.startsWith(".") || local.endsWith(".")) return "Enter a valid email.";
  if (domain.startsWith(".") || domain.endsWith(".") || domain.startsWith("-")) {
    return "Enter a valid email.";
  }
  return "";
}

export function validatePassword(password) {
  return passwordValidationMessage(password) === "";
}

export function passwordValidationMessage(password) {
  if (password == null || typeof password !== "string" || password.length === 0) {
    return "Password is required.";
  }
  if (/\s/.test(password)) return "Password cannot contain spaces.";
  if (password.length < MIN_PASSWORD_LENGTH) return "Password is too short.";
  if (password.length > MAX_PASSWORD_LENGTH) return "Password is too long.";
  if (!/[A-Z]/.test(password)) return "Add an uppercase letter.";
  if (!/[a-z]/.test(password)) return "Add a lowercase letter.";
  if (!/[0-9]/.test(password)) return "Add a number.";
  if (!SPECIAL_CHAR_RE.test(password)) return "Add a special character.";
  return "";
}

export function confirmPasswordMessage(password, confirmPassword) {
  if (
    confirmPassword == null ||
    typeof confirmPassword !== "string" ||
    confirmPassword.length === 0
  ) {
    return "Confirm your password.";
  }
  if (confirmPassword !== password) return "Passwords do not match.";
  return "";
}
