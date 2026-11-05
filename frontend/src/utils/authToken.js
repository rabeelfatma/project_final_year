/**
 * Central JWT access helpers — prevent Bearer null / empty / double-Bearer
 * and clear junk left in localStorage from older builds.
 */

const TOKEN_KEY = "token";
const AUTH_KEYS = [
  "token",
  "role",
  "userName",
  "userRegNo",
  "userEmail",
  "userProfilePicture",
];

/** Loose JWT shape: header.payload.signature (base64url-ish). */
function looksLikeJwt(value) {
  const parts = String(value || "").split(".");
  if (parts.length !== 3) return false;
  return parts.every((p) => p.length > 0 && /^[A-Za-z0-9_-]+$/.test(p));
}

/**
 * Normalize a raw storage value into a bare JWT string, or null if unusable.
 */
export function normalizeAuthToken(raw) {
  if (raw == null) return null;
  let value = String(raw).trim();
  if (!value) return null;
  if (/^(null|undefined|false)$/i.test(value)) return null;

  // Strip accidental "Bearer " prefixes (including duplicates).
  while (/^bearer\s+/i.test(value)) {
    value = value.replace(/^bearer\s+/i, "").trim();
  }
  if (!value) return null;
  if (!looksLikeJwt(value)) return null;
  return value;
}

/** Read a valid JWT from localStorage, or null. Clears junk values. */
export function getAuthToken() {
  if (typeof localStorage === "undefined") return null;
  const raw = localStorage.getItem(TOKEN_KEY);
  const token = normalizeAuthToken(raw);
  if (raw && !token) {
    // Stale malformed value — remove so we stop hammering the API.
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* ignore */
    }
  }
  return token;
}

export function setAuthToken(token) {
  const normalized = normalizeAuthToken(token);
  if (!normalized) {
    throw new Error("Login did not return a valid authentication token.");
  }
  localStorage.setItem(TOKEN_KEY, normalized);
  return normalized;
}

export function clearAuthSession() {
  if (typeof localStorage === "undefined") return;
  AUTH_KEYS.forEach((key) => {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  });
}

/** Authorization header object, or empty object when no valid token. */
export function getAuthHeader() {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function isAuthenticated() {
  return Boolean(getAuthToken());
}
